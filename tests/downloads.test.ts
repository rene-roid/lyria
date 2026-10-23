import { expect, mock, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'lyria-downloads-'))
const session = { server: 'http://server', username: 'u', token: 't', salt: 's' }

// Same export names as the other tests' electron mocks; see audioCache.test.
mock.module('electron', () => ({ app: { getPath: () => userData }, net: {}, protocol: {} }))
mock.module('../src/main/store', () => ({ getSettings: () => ({ cacheMaxGb: 1, cacheCompress: false }) }))
mock.module('../src/main/credentials', () => ({ loadSession: () => session, saveSession: () => {} }))
const downloads = await import('../src/main/downloads')

const name = (id: string): string => createHash('sha1').update(`u|${id}`).digest('hex')
const inCache = (id: string): string => join(userData, 'audio-cache', name(id))
const inDownloads = (id: string): string => join(userData, 'downloads', 'songs', name(id))

const fetched: string[] = []
/** What the server answers getPlaylist with, for sync. */
let serverPlaylist: unknown
globalThis.fetch = (async (url: string) => {
  if (url.includes('/rest/getPlaylist?')) return Response.json({ 'subsonic-response': { status: 'ok', playlist: serverPlaylist } })
  const id = new URL(url).searchParams.get('id')!
  fetched.push(id)
  if (id === 'broken') return new Response('{"subsonic-response":{"status":"failed"}}', { headers: { 'content-type': 'application/json' } })
  return new Response(`audio of ${id}`, { headers: { 'content-type': 'audio/flac' } })
}) as unknown as typeof fetch

async function settled(key: string) {
  for (let i = 0; i < 100; i++) {
    const d = (await downloads.list()).find((x) => x.key === key)
    if (d && d.done + d.failed >= d.trackIds.length) return d
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('download never settled')
}

test('a download takes cached songs over and fetches the rest', async () => {
  mkdirSync(join(userData, 'audio-cache'), { recursive: true })
  writeFileSync(inCache('cached'), 'audio of cached')

  downloads.add({ key: 'playlist:p1', kind: 'playlist', id: 'p1', title: 'Road trip', trackIds: ['cached', 'fresh', 'fresh'] })
  const d = await settled('playlist:p1')

  expect(d).toMatchObject({ title: 'Road trip', trackIds: ['cached', 'fresh'], done: 2, failed: 0 })
  expect(fetched).toEqual(['fresh'])
  expect(existsSync(inCache('cached'))).toBe(false)
  expect((await downloads.bytes('cached'))?.toString()).toBe('audio of cached')
  expect((await downloads.bytes('fresh'))?.toString()).toBe('audio of fresh')
  expect(await downloads.stats()).toEqual({ bytes: 'audio of cached'.length + 'audio of fresh'.length, count: 2 })
})

test('an error reply is not kept as a song', async () => {
  downloads.add({ key: 'mix:m1', kind: 'mix', id: 'm1', title: 'Mix', trackIds: ['fresh', 'broken'] })
  const d = await settled('mix:m1')
  expect(d).toMatchObject({ done: 1, failed: 1 })
  expect(await downloads.bytes('broken')).toBeNull()
})

test('removing a download hands its songs back to the cache, keeping ones another still wants', async () => {
  downloads.remove('playlist:p1')
  for (let i = 0; i < 50 && existsSync(inDownloads('cached')); i++) await new Promise((r) => setTimeout(r, 10))

  expect((await downloads.list()).map((x) => x.key)).toEqual(['mix:m1'])
  expect(existsSync(inCache('cached'))).toBe(true) // back in the cache, still playable
  expect(existsSync(inDownloads('cached'))).toBe(false)
  expect(existsSync(inDownloads('fresh'))).toBe(true) // the mix still has it
})

test('a downloaded playlist keeps itself, to open with no server, and sync brings it up to date', async () => {
  const song = (id: string) => ({ id, title: id, artist: 'A', album: 'B', duration: 60 })
  const pl = { id: 'p2', name: 'Commute', comment: 'for the train', entry: [song('fresh'), song('extra')] }
  downloads.add({ key: 'playlist:p2', kind: 'playlist', id: 'p2', title: 'Commute', trackIds: ['fresh', 'extra'], playlist: pl })
  await settled('playlist:p2')

  expect(downloads.playlist('p2')).toEqual(pl)
  expect(downloads.playlist('m1')).toBeNull() // a mix's songs live with the saved mix
  // The list goes to every window on each change, so it stays without the songs.
  expect((await downloads.list()).find((d) => d.key === 'playlist:p2')).not.toHaveProperty('playlist')
  expect(await downloads.available(['fresh', 'extra', 'broken', 'never'])).toEqual(new Set(['fresh', 'extra']))

  serverPlaylist = { id: 'p2', name: 'Commute (weekdays)', entry: [{ id: 'extra', title: 'extra', artist: 'A' }] }
  await downloads.sync()
  expect(downloads.playlist('p2')).toMatchObject({ name: 'Commute (weekdays)', entry: [{ id: 'extra', title: 'extra' }] })
  expect((await downloads.list()).find((d) => d.key === 'playlist:p2')?.trackIds).toEqual(['extra'])
})

test('an unreachable server leaves a downloaded playlist as it was', async () => {
  const before = downloads.playlist('p2')
  const online = globalThis.fetch
  globalThis.fetch = (async () => {
    throw new TypeError('fetch failed')
  }) as unknown as typeof fetch
  try {
    await downloads.sync()
  } finally {
    globalThis.fetch = online
  }
  expect(downloads.playlist('p2')).toEqual(before)
})
