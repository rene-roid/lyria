import { expect, mock, test } from 'bun:test'
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'lyria-art-'))
const session = { server: 'http://server', username: 'u', token: 't', salt: 's' }
let reply: () => Response = () => new Response(null, { status: 500 })
let handler: (req: Request) => Promise<Response> = async () => new Response(null)

// Same export names as the other tests' electron mocks; see audioCache.test.
mock.module('electron', () => ({
  app: { getPath: () => userData },
  net: { fetch: async () => reply() },
  protocol: { handle: (_: string, fn: typeof handler) => void (handler = fn) }
}))
mock.module('../src/main/store', () => ({ getSettings: () => ({ artCacheMaxMb: 10 }) }))
mock.module('../src/main/credentials', () => ({ loadSession: () => session, saveSession: () => {} }))
const { registerArtProtocol } = await import('../src/main/artCache')
registerArtProtocol()

const ask = (id: string) => handler(new Request(`lyria-art://art/?id=${id}`))
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])
const notFound = () =>
  new Response('{"subsonic-response":{"status":"failed","error":{"code":70,"message":"Artwork not found"}}}')
const cached = (): string[] => readdirSync(join(userData, 'art-cache'))

test('an error reply sent as HTTP 200 is not kept as the cover', async () => {
  reply = notFound
  expect((await ask('al-1')).status).toBe(404)
  // Once the server has the artwork, the next ask fetches it instead of serving the old error.
  reply = () => new Response(PNG)
  const res = await ask('al-1')
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toBe('image/png')
})

test('an error reply an older build cached is dropped and fetched again', async () => {
  const file = createHash('sha1').update(`http://server|u|al-2`).digest('hex')
  writeFileSync(join(userData, 'art-cache', file), '{"subsonic-response":{"status":"failed"}}')
  expect((await ask('al-2')).status).toBe(404)
  expect(cached()).not.toContain(file)
  reply = () => new Response(PNG)
  expect((await ask('al-2')).status).toBe(200)
})
