import { expect, mock, test } from 'bun:test'
import type { Session } from '../src/shared/types'

let session: Session = { server: 'http://lan', servers: ['http://lan', 'http://vpn'], username: 'u', token: 't', salt: 's' }
const sent: unknown[][] = []

// Same export names as the other tests' electron mocks; see audioCache.test.
mock.module('electron', () => ({ app: { getPath: () => '' }, net: {}, protocol: {} }))
mock.module('../src/main/credentials', () => ({
  loadSession: () => session,
  saveSession: (s: Session) => void (session = s)
}))
mock.module('../src/main/windows', () => ({ broadcast: (channel: string, args: unknown[]) => void sent.push([channel, ...args]) }))
const connection = await import('../src/main/connection')

/** Addresses that answer a ping right now. */
let up = new Set<string>()
let pings = 0
globalThis.fetch = (async (url: string) => {
  pings += 1
  const { origin } = new URL(url)
  if (!up.has(origin)) throw new TypeError('fetch failed')
  return Response.json({ 'subsonic-response': { status: 'ok', version: '1.16.1' } })
}) as unknown as typeof fetch

const changes: [boolean, boolean | null][] = []
connection.onChange((online, before) => changes.push([online, before]))

test('reports the server as it comes and goes, telling every window', async () => {
  expect(connection.status()).toBeNull()

  up = new Set(['http://lan'])
  expect(await connection.check()).toBe(true)
  up = new Set()
  expect(await connection.check()).toBe(false)
  expect(await connection.check()).toBe(false) // no change, nobody told

  expect(connection.status()).toBe(false)
  expect(changes).toEqual([
    [true, null],
    [false, true]
  ])
  expect(sent).toEqual([
    ['connection:changed', true],
    ['connection:changed', false]
  ])
})

test('checks asked for together share one round of pings', async () => {
  up = new Set(['http://lan'])
  pings = 0
  const answers = await Promise.all([connection.check(), connection.check(), connection.check()])
  expect(answers).toEqual([true, true, true])
  expect(pings).toBe(1)
})

test('another address of the library answering counts, and the session moves over to it', async () => {
  sent.length = 0
  up = new Set(['http://vpn'])
  expect(await connection.check()).toBe(true)
  expect(session.server).toBe('http://vpn')
  expect(sent).toEqual([['auth:changed', session]])
})
