import { app } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadSession } from './credentials'
import { Shrinker } from './shrink'
import { getSettings } from './store'

/**
 * On-disk cache of played songs, kept under the configured budget by deleting the
 * least recently played file first. The audio host streams from the server immediately
 * and swaps over to the cached copy once it lands.
 *
 * With compression on, lossless files are then re-encoded to Opus in the background and the
 * original on disk is swapped for the smaller copy. Lossy files are kept as they came: encoding
 * them again would cost quality for little space.
 */

const GB = 1024 ** 3

function dir(): string {
  return join(app.getPath('userData'), 'audio-cache')
}

/** Keyed per account, so two libraries that reuse the same track ids never share a file. */
function fileFor(id: string): string {
  const key = `${loadSession()?.username ?? ''}|${id}`
  return join(dir(), createHash('sha1').update(key).digest('hex'))
}

function budget(): number {
  return getSettings().cacheMaxGb * GB
}

/**
 * Bytes written since the last eviction pass. Eviction stats every file in the cache, which for a
 * multi-gigabyte budget is thousands of them, so it waits until enough has landed to be worth it
 * rather than running after every single track. The wait is a slice of the budget, capped, so the
 * overshoot it allows stays proportional however small the budget is set.
 */
const EVICT_EVERY_MAX = 256 * 1024 * 1024
let sinceEvict = 0

function evictEvery(): number {
  return Math.min(EVICT_EVERY_MAX, Math.max(16 * 1024 * 1024, budget() / 16))
}

/** One download per track, however many windows ask for it. */
const inflight = new Map<string, Promise<string | null>>()

function ensure(id: string, url: string): Promise<string | null> {
  if (budget() <= 0) return Promise.resolve(null)
  const running = inflight.get(id)
  if (running) return running
  const job = download(id, url).finally(() => inflight.delete(id))
  inflight.set(id, job)
  return job
}

async function download(id: string, url: string): Promise<string | null> {
  const file = fileFor(id)
  try {
    const now = new Date()
    await utimes(file, now, now) // already here: mark it freshly used so eviction passes it over
    return file
  } catch {
    // not cached yet; fall through and fetch it
  }
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const body = Buffer.from(await res.arrayBuffer())
    if (body.byteLength > budget()) return null // one song bigger than the whole budget
    await mkdir(dir(), { recursive: true })
    // Write beside the final name and rename, so a crash mid-download leaves no half file behind.
    const part = `${file}.part`
    await writeFile(part, body)
    await rename(part, file)
    sinceEvict += body.byteLength
    if (sinceEvict >= evictEvery()) await evict()
    return file
  } catch {
    return null
  }
}

/** Bytes of the cached copy, downloading it first if needed. Null when caching is off or it failed. */
export async function bytes(id: string, url: string): Promise<Buffer | null> {
  const file = await ensure(id, url)
  if (!file) return null
  try {
    const body = await readFile(file)
    void shrinker.shrink(file, body)
    return body
  } catch {
    return null
  }
}

const ascii = (b: Uint8Array, at: number, n: number): string => Buffer.from(b.subarray(at, at + n)).toString('latin1')

/** FLAC or WAV, off the first bytes. FLAC may carry an ID3v2 tag in front of its own marker. */
export function isLossless(b: Uint8Array): boolean {
  let at = 0
  if (ascii(b, 0, 3) === 'ID3' && b.length >= 10) {
    at = 10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f))
  }
  return ascii(b, at, 4) === 'fLaC' || (ascii(b, at, 4) === 'RIFF' && ascii(b, at + 8, 4) === 'WAVE')
}

/** Re-encodes a song to Opus at the given bitrate. Main sets it up once the audio host exists. */
type Compressor = (body: Buffer, kbps: number) => Promise<Buffer | null>
let compressor: Compressor | undefined

export function setCompressor(fn: Compressor): void {
  compressor = fn
}

const shrinker = new Shrinker({
  wants: isLossless,
  encoder: () => {
    const { cacheCompress, cacheCompressKbps } = getSettings()
    const fn = compressor
    return fn && cacheCompress && cacheCompressKbps > 0 ? (body) => fn(body, cacheCompressKbps) : undefined
  },
  // Lossless audio as Opus comes out at a fifth of its size or less; one that barely shrinks
  // was most likely near-silence or not what its header claimed, and is left as it is.
  ratio: 0.8
})

/** Compress what was cached before compression was on, or at another setting, most recent first. */
export async function compressAll(): Promise<void> {
  shrinker.reset()
  const all = await entries()
  await shrinker.sweep(all.sort((a, b) => b.used - a.used).map((e) => e.file))
}

type Entry = { file: string; size: number; used: number }

async function entries(): Promise<Entry[]> {
  let names: string[]
  try {
    names = await readdir(dir())
  } catch {
    return [] // no cache directory yet
  }
  const found = await Promise.all(
    names
      .filter((n) => !n.endsWith('.part'))
      .map(async (n) => {
        const file = join(dir(), n)
        try {
          const s = await stat(file)
          return { file, size: s.size, used: s.mtimeMs }
        } catch {
          return null
        }
      })
  )
  return found.filter((e): e is Entry => e !== null)
}

/** Delete the oldest files until the cache fits the budget. Also runs when the budget is lowered. */
export async function evict(): Promise<void> {
  sinceEvict = 0
  const max = budget()
  const all = await entries()
  let total = all.reduce((n, e) => n + e.size, 0)
  for (const e of all.sort((a, b) => a.used - b.used)) {
    if (total <= max) break
    await rm(e.file, { force: true })
    total -= e.size
  }
}

export async function stats(): Promise<{ bytes: number; count: number }> {
  const all = await entries()
  return { bytes: all.reduce((n, e) => n + e.size, 0), count: all.length }
}

export function clear(): Promise<void> {
  sinceEvict = 0
  shrinker.reset()
  return rm(dir(), { recursive: true, force: true })
}
