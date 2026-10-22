import { expect, mock, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'sonora-scrobbles-'))
const session = { server: 'http://server', username: 'u', token: 't', salt: 's' }

// Same export names as the other tests' electron mocks; see audioCache.test.
mock.module('electron', () => ({ app: { getPath: () => userData }, net: {}, protocol: {} }))
mock.module('../src/main/credentials', () => ({ loadSession: () => session }))
const { flush, submit } = await import('../src/main/scrobbles')

let online = false
const sent: URL[] = []
globalThis.fetch = (async (url: string) => {
  if (!online) throw new TypeError('fetch failed')
  const u = new URL(url)
  sent.push(u)
  const missing = u.searchParams.get('id') === 'gone'
  return new Response(
    JSON.stringify({
      'subsonic-response': missing ? { status: 'failed', error: { code: 70, message: 'not found' } } : { status: 'ok' }
    })
  )
}) as unknown as typeof fetch

const pending = (): { id: string; time: number }[] => JSON.parse(readFileSync(join(userData, 'pending-scrobbles.json'), 'utf8'))

test('plays made offline are kept, then sent with the time they happened', async () => {
  submit('a', 1000)
  submit('b', 2000)
  await flush()
  expect(pending().map((p) => p.id)).toEqual(['a', 'b'])

  online = true
  await flush()
  expect(sent.map((u) => [u.searchParams.get('id'), u.searchParams.get('time'), u.searchParams.get('submission')])).toEqual([
    ['a', '1000', 'true'],
    ['b', '2000', 'true']
  ])
  expect(pending()).toEqual([])
})

test('a song the server no longer has is dropped instead of retried forever', async () => {
  online = true
  sent.length = 0
  submit('gone', 3000)
  await flush()
  expect(pending()).toEqual([])
  expect(existsSync(join(userData, 'pending-scrobbles.json'))).toBe(true)
})
