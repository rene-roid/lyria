import { SubsonicClient, pickFastestServer } from '@shared/subsonic/client'
import type { Session } from '@shared/types'
import { loadSession, saveSession } from './credentials'
import { broadcast } from './windows'

/**
 * Whether the library can be reached right now, for every window and for main's own background
 * work. One place asks, so the windows agree: the main window shows what is on this device, and
 * the audio host skips songs it could only stream.
 *
 * "Reachable" means any of the library's addresses answers, not just the one in use. When that one
 * stops answering and another does, the session moves over to it, as the windows' own failover
 * would on their next request.
 */

const PING_TIMEOUT_MS = 5000
/** How often a reachable server is checked on, to notice it going away. */
const ONLINE_EVERY_MS = 30_000
/** Sooner while it is away, so its return is noticed within moments of plugging back in. */
const OFFLINE_EVERY_MS = 10_000

/** Null until the first check has answered. */
let online: boolean | null = null
let checking: Promise<boolean> | undefined
let timer: NodeJS.Timeout | undefined

type Listener = (online: boolean, before: boolean | null) => void
const listeners = new Set<Listener>()

export function status(): boolean | null {
  return online
}

/** Told when reachability flips, with what it was before (null for the first answer). */
export function onChange(fn: Listener): void {
  listeners.add(fn)
}

/** Persist a new active server and tell every window, but only when it actually changed. */
export function activate(session: Session, server: string): Session {
  if (server === session.server) return session
  const next: Session = { ...session, server }
  saveSession(next)
  broadcast('auth:changed', [next])
  return next
}

/** Ping all candidates and switch to whichever answers first. Keeps the current pick if none do. */
export async function reselect(): Promise<Session | null> {
  const session = loadSession()
  if (!session || (session.servers?.length ?? 0) < 2) return session
  try {
    return activate(session, await pickFastestServer(session, session.servers!))
  } catch {
    return session // nothing answered; leave the pick alone so a flaky network is not destructive
  }
}

async function reachable(): Promise<boolean> {
  const session = loadSession()
  if (!session) return false
  try {
    await new SubsonicClient(session).ping(PING_TIMEOUT_MS)
    return true
  } catch {
    // The address in use is down; another address of the same library may still answer.
    const others = (session.servers ?? []).filter((s) => s !== session.server)
    if (!others.length) return false
    try {
      activate(session, await pickFastestServer(session, others, undefined, PING_TIMEOUT_MS))
      return true
    } catch {
      return false
    }
  }
}

/** Ask the server now. Calls that come in while a check is out share its answer. */
export function check(): Promise<boolean> {
  return (checking ??= reachable()
    .then((ok) => {
      set(ok)
      return ok
    })
    .finally(() => {
      checking = undefined
      schedule()
    }))
}

function set(next: boolean): void {
  const before = online
  online = next
  if (before === next) return
  broadcast('connection:changed', [next])
  for (const fn of listeners) fn(next, before)
}

function schedule(): void {
  clearTimeout(timer)
  timer = setTimeout(() => void check(), online === false ? OFFLINE_EVERY_MS : ONLINE_EVERY_MS)
}

/** First check now, then on a timer for as long as the app runs. */
export function start(): void {
  void check()
}
