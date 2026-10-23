import { app } from 'electron'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { gunzip, gzip, gzipSync } from 'node:zlib'

/**
 * Library responses -- album lists, artists, playlists -- kept on disk for the main window, so a
 * view paints from the last copy before the server has answered.
 *
 * They used to live in localStorage, whose few megabytes the full album list of a large library
 * could fill on its own, and a full localStorage threw everything away. Here they sit in memory
 * and reach the disk as one gzipped file on a debounce; JSON this repetitive packs down about
 * tenfold. Values stay the JSON strings the window sent, so nothing is parsed twice.
 */

/** Uncompressed. Past it the entries refreshed longest ago go first. */
const MAX_CHARS = 128 * 1024 * 1024
const WRITE_DEBOUNCE_MS = 3000

const file = (): string => join(app.getPath('userData'), 'metadata-cache.json.gz')

type Saved = { scope: string; entries: [string, string][] }

/** Account the entries belong to; see setScope. */
let scope = ''
let entries: Map<string, string> | undefined
let loading: Promise<Map<string, string>> | undefined
let chars = 0
let dirty = false
let timer: NodeJS.Timeout | undefined
let writing: Promise<void> = Promise.resolve()

const size = (k: string, v: string): number => k.length + v.length

function load(): Promise<Map<string, string>> {
  return (loading ??= (async () => {
    try {
      const saved = JSON.parse((await promisify(gunzip)(await readFile(file()))).toString('utf8')) as Saved
      scope = typeof saved.scope === 'string' ? saved.scope : ''
      entries = new Map(saved.entries.filter(([k, v]) => typeof k === 'string' && typeof v === 'string'))
    } catch {
      entries = new Map() // none yet, or unreadable: it refills as views load
    }
    chars = 0
    for (const [k, v] of entries) chars += size(k, v)
    return entries
  })())
}

export async function all(): Promise<{ scope: string; entries: [string, string][] }> {
  // Loaded before `scope` is read: on the first call it is still blank until the file is in, and a
  // blank scope makes the window take its own cache for another account's and throw it all away.
  const m = await load()
  return { scope, entries: [...m] }
}

/** Wipe the entries when they belong to another account than `next`, so libraries never mix. */
export async function setScope(next: string): Promise<void> {
  const m = await load()
  if (next === scope) return
  scope = next
  m.clear()
  chars = 0
  schedule()
}

export async function put(key: string, value: string | null): Promise<void> {
  const m = await load()
  const old = m.get(key)
  if (old !== undefined) {
    m.delete(key) // re-inserted below at the back, which is the end eviction reaches last
    chars -= size(key, old)
  }
  if (value !== null) {
    m.set(key, value)
    chars += size(key, value)
  }
  if (old === value) return // only its place in line moved; not worth a write
  for (const [k, v] of m) {
    if (chars <= MAX_CHARS) break
    m.delete(k)
    chars -= size(k, v)
  }
  schedule()
}

function schedule(): void {
  dirty = true
  if (timer) return
  timer = setTimeout(() => {
    timer = undefined
    void flush()
  }, WRITE_DEBOUNCE_MS)
}

function snapshot(): string {
  dirty = false
  return JSON.stringify({ scope, entries: [...(entries ?? [])] } satisfies Saved)
}

function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = undefined
  }
  if (!dirty) return writing
  const json = snapshot()
  writing = writing
    .then(async () => {
      const body = await promisify(gzip)(json)
      await mkdir(dirname(file()), { recursive: true })
      // Beside the real file, then renamed over it, so a crash mid-write cannot leave half a file.
      await writeFile(`${file()}.part`, body)
      await rename(`${file()}.part`, file())
    })
    .catch(() => undefined)
  return writing
}

/** On the way out, where there is no waiting for an async write. */
export function flushSync(): void {
  if (timer) clearTimeout(timer)
  timer = undefined
  if (!dirty) return
  try {
    const body = gzipSync(snapshot())
    mkdirSync(dirname(file()), { recursive: true })
    writeFileSync(`${file()}.part`, body)
    renameSync(`${file()}.part`, file())
  } catch {
    // nothing to be done on the way out; the next launch refills it
  }
}

export async function stats(): Promise<{ bytes: number; count: number }> {
  const m = await load()
  await flush()
  try {
    return { bytes: (await stat(file())).size, count: m.size }
  } catch {
    return { bytes: 0, count: m.size }
  }
}

export async function clear(): Promise<void> {
  const m = await load()
  m.clear()
  chars = 0
  dirty = false
  if (timer) clearTimeout(timer)
  timer = undefined
  await writing
  await rm(file(), { force: true })
}
