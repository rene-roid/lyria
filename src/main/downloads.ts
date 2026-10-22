import { app } from 'electron'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SubsonicClient } from '@shared/subsonic/client'
import type { Download, DownloadStatus } from '@shared/types'
import * as audioCache from './audioCache'
import { loadSession } from './credentials'
import { Shrinker } from './shrink'

/**
 * Playlists and saved mixes kept on disk for listening offline.
 *
 * Their songs live in a folder of their own, outside the song cache's budget and eviction, under
 * the same file names. A song already in the cache is moved over rather than fetched again, and a
 * removed download hands its songs back to the cache, so nothing is thrown away that might play
 * again soon. Lossless songs are compressed to Opus with the cache's own setting.
 */

const root = (): string => join(app.getPath('userData'), 'downloads')
const songsDir = (): string => join(root(), 'songs')
const indexFile = (): string => join(root(), 'index.json')

/** A download and the account it belongs to; several accounts can keep their own. */
type Entry = Download & { owner: string }

const ownerOf = (s = loadSession()): string => (s ? `${s.servers?.[0] ?? s.server}|${s.username}` : '')
const userOf = (owner: string): string => owner.slice(owner.lastIndexOf('|') + 1)

/** Same scheme as audioCache.songName, for any account rather than just the signed-in one. */
const nameFor = (user: string, id: string): string => createHash('sha1').update(`${user}|${id}`).digest('hex')
const fileOf = (id: string): string => join(songsDir(), audioCache.songName(id))

let entries: Entry[] | undefined

function all(): Entry[] {
  if (!entries) {
    try {
      entries = (JSON.parse(readFileSync(indexFile(), 'utf8')) as Entry[]).filter((e) => e?.key && Array.isArray(e.trackIds))
    } catch {
      entries = []
    }
  }
  return entries
}

function save(): void {
  mkdirSync(root(), { recursive: true })
  writeFileSync(`${indexFile()}.part`, JSON.stringify(all()))
  renameSync(`${indexFile()}.part`, indexFile())
}

const mine = (): Entry[] => all().filter((e) => e.owner === ownerOf())

/** File names of every song some download still wants, whoever's account it is. */
function wanted(): Set<string> {
  return new Set(all().flatMap((e) => e.trackIds.map((id) => nameFor(userOf(e.owner), id))))
}

// ---- what is on disk ------------------------------------------------------------

/** File names in the songs folder. Read once, then kept up to date as songs land and leave. */
let present: Promise<Set<string>> | undefined

function onDisk(): Promise<Set<string>> {
  return (present ??= readdir(songsDir())
    .then((names) => new Set(names.filter((n) => !n.endsWith('.part'))))
    .catch(() => new Set<string>()))
}

/** The downloaded copy of a song, if there is one. */
export async function bytes(id: string): Promise<Buffer | null> {
  if (!(await onDisk()).has(audioCache.songName(id))) return null
  try {
    return await readFile(fileOf(id))
  } catch {
    return null
  }
}

// ---- fetching -----------------------------------------------------------------

/** Two at a time: quicker than one on a fast server, gentle enough on a slow one. */
const CONCURRENCY = 2

const queue: string[] = []
const queued = new Set<string>()
/** Songs that would not download this session, so a playlist's progress can say so. */
const failed = new Set<string>()
let active = 0

function enqueue(ids: string[]): void {
  void onDisk().then((have) => {
    for (const id of ids) {
      if (have.has(audioCache.songName(id)) || queued.has(id)) continue
      queue.push(id)
      queued.add(id)
    }
    pump()
  })
}

function pump(): void {
  while (active < CONCURRENCY && queue.length) {
    const id = queue.shift()!
    active += 1
    void fetchSong(id)
      .then((ok) => (ok ? failed.delete(id) : failed.add(id)))
      .catch(() => failed.add(id))
      .finally(() => {
        active -= 1
        queued.delete(id)
        changed()
        pump()
      })
  }
  if (active === 0 && queue.length === 0) compressLater()
}

async function fetchSong(id: string): Promise<boolean> {
  const name = audioCache.songName(id)
  if (!wanted().has(name)) return true // removed while it waited its turn
  const file = fileOf(id)
  await mkdir(songsDir(), { recursive: true })
  if (!(await audioCache.release(id, file))) {
    const session = loadSession()
    if (!session) return false
    const res = await fetch(new SubsonicClient(session).streamUrl(id))
    // A Subsonic error comes back as HTTP 200 with a JSON or XML body; that is not a song.
    if (!res.ok || /json|xml/i.test(res.headers.get('content-type') ?? '')) return false
    const body = Buffer.from(await res.arrayBuffer())
    await writeFile(`${file}.part`, body)
    await rename(`${file}.part`, file)
  }
  ;(await onDisk()).add(name)
  // Removed while it was downloading: it is still a song just fetched, so let the cache have it.
  if (!wanted().has(name)) await giveBack([id])
  return true
}

/** Hand songs no download wants any more to the song cache. */
async function giveBack(ids: string[]): Promise<void> {
  const have = await onDisk()
  const keep = wanted()
  for (const id of ids) {
    const name = audioCache.songName(id)
    if (keep.has(name) || !have.has(name)) continue
    have.delete(name)
    await audioCache.adopt(id, fileOf(id)).catch(() => rm(fileOf(id), { force: true }))
  }
  void audioCache.evict()
}

// ---- compression ------------------------------------------------------------------

const shrinker = new Shrinker({ wants: audioCache.isLossless, encoder: audioCache.songEncoder, ratio: audioCache.SONG_RATIO })
let compressing = false
let again = false

/**
 * Compress downloaded songs one at a time, once fetching has finished. One at a time matters:
 * a playlist's worth of FLAC queued for the encoder at once would hold all of it in memory.
 */
export function compressLater(): void {
  if (compressing) {
    again = true
    return
  }
  compressing = true
  void (async () => {
    do {
      again = false
      const names = [...(await onDisk())]
      await shrinker.sweep(names.map((n) => join(songsDir(), n)))
    } while (again)
  })().finally(() => (compressing = false))
}

/** Compression was turned on or its bitrate changed: look at every song again. */
export function compressAll(): void {
  shrinker.reset()
  compressLater()
}

// ---- the list ---------------------------------------------------------------------

type Listener = (list: DownloadStatus[]) => void
let listener: Listener | undefined
let notify: NodeJS.Timeout | undefined

export function onChange(fn: Listener): void {
  listener = fn
}

/** Progress moves a song at a time; a quarter second between updates is plenty for the UI. */
function changed(): void {
  if (notify) return
  notify = setTimeout(() => {
    notify = undefined
    void list().then((l) => listener?.(l))
  }, 250)
}

export async function list(): Promise<DownloadStatus[]> {
  const have = await onDisk()
  return mine().map(({ owner: _, ...d }) => ({
    ...d,
    done: d.trackIds.filter((id) => have.has(audioCache.songName(id))).length,
    failed: d.trackIds.filter((id) => failed.has(id)).length
  }))
}

export function add(d: Omit<Download, 'addedAt'>): void {
  const owner = ownerOf()
  if (!owner || !d.key || !Array.isArray(d.trackIds)) return
  const before = all().find((e) => e.key === d.key && e.owner === owner)
  const next: Entry = { ...d, trackIds: [...new Set(d.trackIds)], owner, addedAt: before?.addedAt ?? Date.now() }
  entries = [next, ...all().filter((e) => e !== before)]
  save()
  if (before) void giveBack(before.trackIds)
  for (const id of next.trackIds) failed.delete(id)
  enqueue(next.trackIds)
  changed()
}

export function remove(key: string): void {
  const owner = ownerOf()
  const gone = all().find((e) => e.key === key && e.owner === owner)
  if (!gone) return
  entries = all().filter((e) => e !== gone)
  save()
  void giveBack(gone.trackIds).then(changed)
  changed()
}

/**
 * Bring playlists up to date with the server and fetch whatever is missing. Runs on launch and
 * every so often after; with the server unreachable it changes nothing and tries again later.
 */
export async function sync(): Promise<void> {
  const session = loadSession()
  if (!session) return
  const client = new SubsonicClient(session)
  const dropped: string[] = []
  for (const e of mine()) {
    if (e.kind !== 'playlist') continue
    try {
      const pl = await client.getPlaylist(e.id)
      const ids = [...new Set(pl.entry.map((t) => t.id))]
      dropped.push(...e.trackIds.filter((id) => !ids.includes(id)))
      e.trackIds = ids
      e.title = pl.name
      e.coverArt = pl.coverArt ?? pl.entry[0]?.coverArt
    } catch {
      // offline, or the playlist is gone: keep what is on disk
    }
  }
  save()
  await giveBack(dropped)
  failed.clear()
  enqueue(mine().flatMap((e) => e.trackIds))
  changed()
}

export async function stats(): Promise<{ bytes: number; count: number }> {
  const names = [...(await onDisk())]
  const sizes = await Promise.all(names.map((n) => stat(join(songsDir(), n)).then((s) => s.size, () => 0)))
  return { bytes: sizes.reduce((a, b) => a + b, 0), count: names.length }
}
