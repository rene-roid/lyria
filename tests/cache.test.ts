import { beforeEach, describe, expect, test } from 'bun:test'

const legacy = new Map<string, string>()
// Minimal stand-in for the browser API, holding what an older build left behind.
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => legacy.get(k) ?? null,
  setItem: (k: string, v: string) => void legacy.set(k, v),
  removeItem: (k: string) => void legacy.delete(k),
  key: (i: number) => [...legacy.keys()][i] ?? null,
  get length() {
    return legacy.size
  }
}

// Main's side of the bridge: what it has on disk, and what the window sent it.
let disk: { scope: string; entries: [string, string][] } = { scope: '', entries: [] }
const sent: unknown[][] = []
;(globalThis as { window?: unknown }).window = {
  lyria: {
    meta: {
      load: async () => disk,
      setScope: (scope: string) => void sent.push(['scope', scope]),
      put: (key: string, value: string | null) => void sent.push(['put', key, value]),
      clear: async () => void sent.push(['clear'])
    }
  }
}

const fresh = async () => {
  // A new copy of the module per test, as each window gets its own.
  const mod = await import(`../src/renderer/shared/cache?${Math.random()}`)
  return mod as typeof import('../src/renderer/shared/cache')
}

describe('cache', () => {
  beforeEach(() => {
    legacy.clear()
    sent.length = 0
    disk = { scope: 'http://a|bob', entries: [] }
  })

  test('reads nothing and writes nothing before it is hydrated', async () => {
    disk.entries = [['artists', '[{"id":"x"}]']]
    const { cacheRead, cacheWrite, setCacheScope } = await fresh()
    expect(cacheRead('artists')).toBeUndefined()
    cacheWrite('artists', [])
    setCacheScope('http://a|alice')
    expect(sent).toEqual([])
  })

  test('serves what main had on disk, and sends new values back', async () => {
    disk.entries = [['albums:newest', '[{"id":"a1"}]']]
    const { cacheRead, cacheWrite, hydrateCache } = await fresh()
    await hydrateCache()
    expect(cacheRead<unknown>('albums:newest')).toEqual([{ id: 'a1' }])
    cacheWrite('albums:newest', [{ id: 'a1' }]) // unchanged: nothing to send
    cacheWrite('artists', [{ id: 'x' }])
    expect(sent).toEqual([['put', 'artists', '[{"id":"x"}]']])
  })

  test('misses on unknown and undefined keys, and survives corrupt entries', async () => {
    disk.entries = [['bad', '{not json']]
    const { cacheRead, cacheWrite, hydrateCache } = await fresh()
    await hydrateCache()
    expect(cacheRead('nope')).toBeUndefined()
    expect(cacheRead(undefined)).toBeUndefined()
    expect(cacheRead('bad')).toBeUndefined()
    cacheWrite(undefined, [1])
    expect(sent).toEqual([])
  })

  test('drops cached entries when the scope changes, and keeps them when it does not', async () => {
    disk.entries = [['artists', '[{"id":"x"}]']]
    const { cacheRead, hydrateCache, onCacheClear, setCacheScope } = await fresh()
    let cleared = 0
    onCacheClear(() => (cleared += 1))
    await hydrateCache()
    setCacheScope('http://a|bob')
    expect(cacheRead<unknown>('artists')).toEqual([{ id: 'x' }])
    setCacheScope('http://a|alice')
    expect(cacheRead<unknown>('artists')).toBeUndefined()
    expect(cleared).toBe(1)
    expect(sent).toEqual([['scope', 'http://a|alice']])
  })

  test('carries over what an older build kept in localStorage, then removes it', async () => {
    disk = { scope: '', entries: [] }
    legacy.set('sonora.cacheScope', 'http://a|bob')
    legacy.set('sonora.cache.artists', '[{"id":"x"}]')
    legacy.set('unrelated', 'kept')
    const { cacheRead, hydrateCache } = await fresh()
    await hydrateCache()
    expect(cacheRead<unknown>('artists')).toEqual([{ id: 'x' }])
    expect(sent).toEqual([
      ['scope', 'http://a|bob'],
      ['put', 'artists', '[{"id":"x"}]']
    ])
    expect([...legacy.keys()]).toEqual(['unrelated'])
  })
})
