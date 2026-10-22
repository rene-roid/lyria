import { expect, mock, test } from 'bun:test'
import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'lyria-cache-'))
let maxGb = 1 / 1024 // a 1 MB budget

// Bun shares one 'electron' mock across test files and can only re-point the names it was first
// given, so every test's mock lists the same ones (artCache.test needs net and protocol).
mock.module('electron', () => ({ app: { getPath: () => userData }, net: {}, protocol: {} }))
mock.module('../src/main/store', () => ({ getSettings: () => ({ cacheMaxGb: maxGb }) }))
mock.module('../src/main/credentials', () => ({ loadSession: () => ({ username: 'u' }) }))
const { bytes, evict, isLossless, stats } = await import('../src/main/audioCache')

const KB = 1024
const put = (name: string, size: number, ageMinutes: number): void => {
  const file = join(userData, 'audio-cache', name)
  writeFileSync(file, Buffer.alloc(size))
  const t = new Date(Date.now() - ageMinutes * 60_000)
  utimesSync(file, t, t)
}
const names = (): string[] => readdirSync(join(userData, 'audio-cache')).sort()

test('downloads a song, then serves it without hitting the network again', async () => {
  let calls = 0
  globalThis.fetch = (async () => {
    calls += 1
    return new Response(Buffer.alloc(300 * KB))
  }) as unknown as typeof fetch

  expect((await bytes('song-1', 'http://server/rest/stream'))?.byteLength).toBe(300 * KB)
  expect((await bytes('song-1', 'http://server/rest/stream'))?.byteLength).toBe(300 * KB)
  expect(calls).toBe(1)
  expect(await stats()).toEqual({ bytes: 300 * KB, count: 1 })
})

test('a server error caches nothing', async () => {
  globalThis.fetch = (async () => new Response('nope', { status: 404 })) as unknown as typeof fetch
  expect(await bytes('missing', 'http://server/rest/stream')).toBeNull()
  expect((await stats()).count).toBe(1)
})

test('over budget, the least recently played songs go first', async () => {
  put('old', 500 * KB, 60)
  put('older', 500 * KB, 600)
  put('newest', 500 * KB, 0)
  expect(names()).toHaveLength(4)

  await evict()
  // 1 MB budget: 'newest' and the freshly played song from the first test survive.
  expect((await stats()).bytes).toBeLessThanOrEqual(1024 * KB)
  expect(names()).toContain('newest')
  expect(names()).not.toContain('older')
  expect(names()).not.toContain('old')
})

test('a budget of zero disables caching entirely', async () => {
  maxGb = 0
  globalThis.fetch = (async () => new Response(Buffer.alloc(KB))) as unknown as typeof fetch
  expect(await bytes('song-2', 'http://server/rest/stream')).toBeNull()
})

test('only FLAC and WAV count as lossless, an ID3 tag in front of FLAC included', () => {
  const id3 = Buffer.concat([Buffer.from('ID3'), Buffer.from([4, 0, 0, 0, 0, 0, 5]), Buffer.alloc(5), Buffer.from('fLaC')])
  expect(isLossless(Buffer.from('fLaC\0\0\0\x22'))).toBe(true)
  expect(isLossless(id3)).toBe(true)
  expect(isLossless(Buffer.from('RIFF\0\0\0\0WAVEfmt '))).toBe(true)
  expect(isLossless(Buffer.from('ID3\x04\0\0\0\0\0\0\xff\xfb'))).toBe(false) // MP3
  expect(isLossless(Buffer.from('OggS\0\x02'))).toBe(false)
  expect(isLossless(Buffer.from('RIFF\0\0\0\0AVI '))).toBe(false)
})
