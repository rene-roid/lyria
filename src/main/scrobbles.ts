import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SubsonicClient, SubsonicError } from '@shared/subsonic/client'
import { loadSession } from './credentials'

/**
 * Plays reported to the server, so its play counts and listening history stay right whichever
 * copy was playing -- streamed, cached or downloaded. A play the server could not be told about
 * (offline, server down) is kept on disk with the time it happened and sent once it answers again.
 */

type Play = { id: string; time: number; user: string }

/** Enough for weeks of offline listening; past it the oldest plays are dropped. */
const MAX_PENDING = 5000
const RETRY_MS = 2 * 60_000

const file = (): string => join(app.getPath('userData'), 'pending-scrobbles.json')

let pending: Play[] | undefined
let sending: Promise<void> | undefined
let retry: NodeJS.Timeout | undefined

function plays(): Play[] {
  if (!pending) {
    try {
      pending = (JSON.parse(readFileSync(file(), 'utf8')) as Play[]).filter((p) => p?.id && p.time)
    } catch {
      pending = []
    }
  }
  return pending
}

function save(): void {
  try {
    mkdirSync(dirname(file()), { recursive: true })
    writeFileSync(`${file()}.part`, JSON.stringify(plays()))
    renameSync(`${file()}.part`, file())
  } catch {
    // kept in memory; the next save tries again
  }
}

/** A play just finished counting (half the song, or four minutes). */
export function submit(id: string, time: number): void {
  const user = loadSession()?.username
  if (!user || !id) return
  pending = [...plays(), { id, time, user }].slice(-MAX_PENDING)
  save()
  void flush()
}

/**
 * Send what is waiting, oldest first, stopping at the first one the server cannot take yet. Asked
 * again while a round is still going, it runs once more after it, for plays that came in meanwhile.
 */
export function flush(): Promise<void> {
  if (sending) return sending.then(flush)
  sending = send().finally(() => (sending = undefined))
  return sending
}

async function send(): Promise<void> {
  const session = loadSession()
  if (!session) return
  clearTimeout(retry)
  const client = new SubsonicClient(session)
  for (const play of plays().filter((p) => p.user === session.username)) {
    try {
      await client.scrobble(play.id, true, play.time)
    } catch (e) {
      // Code 70 is a song the server no longer has: no point keeping it. Anything else (no
      // network, a server error, a rejected login) may well pass later, so wait and retry.
      if (!(e instanceof SubsonicError) || e.code !== 70) {
        retry = setTimeout(() => void flush(), RETRY_MS)
        return
      }
    }
    pending = plays().filter((p) => p !== play)
    save()
  }
}
