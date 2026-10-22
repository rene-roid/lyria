import { expect, mock, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'sonora-downloads-'))
const session = { server: 'http://server', username: 'u', token: 't', salt: 's' }

// Same export names as the other tests' electron mocks; see audioCache.test.
mock.module('electron', () => ({ app: { getPath: () => userData }, net: {}, protocol: {} }))
mock.module('../src/main/store', () => ({ getSettings: () => ({ cacheMaxGb: 1, cacheCompress: false }) }))
mock.module('../src/main/credentials', () => ({ loadSession: () => session }))
const downloads = await import('../src/main/downloads')

const name = (id: string): string => createHash('sha1').update(`u|${id}`).digest('hex')
const inCache = (id: string): string => join(userData, 'audio-cache', name(id))
const inDownloads = (id: string): string => join(userData, 'downloads', 'songs', name(id))

const fetched: string[] = []
globalThis.fetch = (async (url: string) => {
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
