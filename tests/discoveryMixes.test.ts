import { afterAll, beforeEach, describe, expect, setSystemTime, test } from 'bun:test'
import { SubsonicClient } from '../src/shared/subsonic/client'
import { buildMix, discoverySeeds, type MixSeed } from '../src/renderer/main/mixes'
import type { PlayHistory } from '../src/shared/playHistory'
import { NO_BLOCKS, type DiscoveryKind, type Session, type Track } from '../src/shared/types'

const session: Session = { server: 'http://s', username: 'u', token: 't', salt: 's' }

const NOW = new Date('2026-06-15T12:00:00Z')
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString()

/** The most played albums. Kite's was played yesterday; the other three have not been for months. */
const TASTE = [
  { id: 'f1', name: 'F1', artist: 'Nova', artistId: 'nova', genre: 'indie', playCount: 40, played: daysAgo(200) },
  { id: 'f2', name: 'F2', artist: 'Kite', artistId: 'kite', genre: 'indie', playCount: 30, played: daysAgo(1) },
  { id: 'f3', name: 'F3', artist: 'Moss', artistId: 'moss', genre: 'jazz', playCount: 10, played: daysAgo(100) },
  { id: 'f4', name: 'F4', artist: 'Reed', artistId: 'reed', genre: 'jazz', playCount: 8, played: daysAgo(90) }
]
const UNDATED = TASTE.map(({ played: _, ...a }) => a)

const CATALOGUE: Record<string, string[]> = { nova: ['n1', 'n2', 'n3'], kite: ['k1', 'k2'], moss: ['m1'], reed: ['r1'] }
const OWNER: Record<string, string> = { f1: 'Nova', f2: 'Kite', f3: 'Moss', f4: 'Reed', n: 'Nova', k: 'Kite', m: 'Moss', r: 'Reed' }

/** The newest albums: a polka record that matches nothing you play, one you already played, and twelve unheard. */
const NEWEST = [
  { id: 'new-polka', name: 'P', genre: 'polka' },
  { id: 'new-heard', name: 'H', genre: 'indie', playCount: 3 },
  ...Array.from({ length: 12 }, (_, i) => ({ id: `new${i}`, name: `N${i}`, genre: i % 2 ? 'jazz' : 'indie' }))
]

const song = (id: string, artist: string, genre: string, playCount?: number, played?: string): Record<string, unknown> => ({
  id,
  title: id,
  artist,
  genre,
  duration: 100,
  playCount,
  played
})

/**
 * Ten songs an album. On a most played album the first six are the ones played to death; on the
 * rest of an artist's records the first six are barely touched and the last four are the hits; a
 * new album's last two have had one play.
 */
function albumSongs(id: string, dated: boolean): Record<string, unknown>[] {
  return Array.from({ length: 10 }, (_, i) => {
    const sid = `${id}-${i}`
    if (id.startsWith('new')) return song(sid, `Band ${id}`, 'indie', i < 8 ? undefined : 1)
    const artist = OWNER[id] ?? OWNER[id[0]]
    if (id.startsWith('f')) {
      const played = dated ? TASTE.find((a) => a.id === id)!.played : undefined
      return song(sid, artist, 'indie', i < 6 ? 5 : 0, i < 6 ? played : undefined)
    }
    return song(sid, artist, 'indie', i < 6 ? i % 2 : 7)
  })
}

/** Indie: 18 artists you never play, three unheard songs each, and Nova, half heard. Jazz: five more strangers. */
const GENRES: Record<string, Record<string, unknown>[]> = {
  indie: [
    ...Array.from({ length: 54 }, (_, i) => song(`i${i}`, `Stranger ${i % 18}`, 'indie')),
    ...Array.from({ length: 10 }, (_, i) => song(`nova${i}`, 'Nova', 'indie', i < 5 ? undefined : 4))
  ],
  jazz: [
    ...Array.from({ length: 10 }, (_, i) => song(`j${i}`, `Jazz ${i % 5}`, 'jazz')),
    ...Array.from({ length: 3 }, (_, i) => song(`mellow${i}`, 'Mellow', 'jazz', 2))
  ]
}

interface Library {
  taste: Record<string, unknown>[]
  recent?: string[]
  /** False for a server that keeps no play history at all: no counts and no dates on anything. */
  counts?: boolean
}

function fakeClient({ taste, recent = [], counts = true }: Library, calls: string[] = []): SubsonicClient {
  const dated = taste.some((a) => a.played)
  return new SubsonicClient(session, async (url) => {
    const method = new URL(url).pathname.split('/').pop()!
    const p = new URL(url).searchParams
    calls.push(method)
    let body: Record<string, unknown>
    if (method === 'getSongsByGenre') body = { songsByGenre: { song: GENRES[p.get('genre') ?? ''] ?? [] } }
    else if (method === 'getArtist') {
      const id = p.get('id')!
      body = { artist: { id, name: id, album: CATALOGUE[id].map((a) => ({ id: a, name: a })) } }
    } else if (method === 'getAlbum') {
      const id = p.get('id')!
      body = { album: { id, name: id, song: albumSongs(id, dated) } }
    } else {
      const type = p.get('type')
      const list = type === 'frequent' ? taste : type === 'newest' ? NEWEST : type === 'recent' ? taste.filter((a) => recent.includes(a.id as string)) : []
      body = { albumList2: { album: list } }
    }
    const blind = (key: string, value: unknown): unknown => (counts || (key !== 'playCount' && key !== 'played') ? value : undefined)
    return new Response(JSON.stringify({ 'subsonic-response': { status: 'ok', ...body } }, blind))
  })
}

const seed = (kind: DiscoveryKind): MixSeed => ({ kind, value: '' })
const build = (kind: DiscoveryKind, library: Library = { taste: TASTE }): Promise<Track[]> =>
  buildMix(fakeClient(library), seed(kind))

const ids = (tracks: Track[]): string[] => tracks.map((t) => t.id)
const byArtist = (tracks: Track[]): Record<string, number> => {
  const out: Record<string, number> = {}
  for (const t of tracks) out[t.artist] = (out[t.artist] ?? 0) + 1
  return out
}

beforeEach(() => setSystemTime(NOW))
afterAll(() => setSystemTime())

describe('Discover', () => {
  test('only never played songs from your top genres, strangers ahead of artists you already play', async () => {
    const mix = await build('discover')
    // 18 indie and 5 jazz strangers at two songs each, then Nova's unheard songs fill in, capped too.
    expect(mix.length).toBe(48)
    expect(mix.every((t) => !t.playCount)).toBe(true)
    expect(byArtist(mix).Nova).toBe(2)
    expect(byArtist(mix).Mellow).toBeUndefined()
    expect(Math.max(...Object.values(byArtist(mix)))).toBe(2)
  })

  test('holds all day and picks other songs tomorrow', async () => {
    const mix = ids(await build('discover'))
    expect(ids(await build('discover'))).toEqual(mix)
    setSystemTime(new Date('2026-06-16T12:00:00Z'))
    expect([...ids(await build('discover'))].sort()).not.toEqual([...mix].sort())
  })
})

describe('Deep Cuts', () => {
  test('the barely played songs off the records of your most played artists', async () => {
    const mix = await build('deepCuts')
    expect(mix.every((t) => (t.playCount ?? 0) <= 1)).toBe(true)
    // Nova and Kite have two albums opened, six passed-over songs each, capped at eight a head.
    expect(byArtist(mix)).toEqual({ Nova: 8, Kite: 8, Moss: 6, Reed: 6 })
  })
})

describe('Forgotten Favorites', () => {
  test('much played songs not played in months, by the dates the server keeps', async () => {
    const mix = await build('rediscover')
    expect(mix.every((t) => (t.playCount ?? 0) >= 3)).toBe(true)
    // Kite's album was played yesterday, so it is no forgotten favourite.
    expect(byArtist(mix)).toEqual({ Nova: 4, Moss: 4, Reed: 4 })
  })

  test('without dates, an album still in the recently played list counts as remembered', async () => {
    const mix = await build('rediscover', { taste: UNDATED, recent: ['f2'] })
    expect(byArtist(mix)).toEqual({ Nova: 4, Moss: 4, Reed: 4 })
  })

  test('holds all day and picks other favourites tomorrow', async () => {
    const today = ids(await build('rediscover'))
    expect(ids(await build('rediscover'))).toEqual(today)
    setSystemTime(new Date('2026-06-16T12:00:00Z'))
    const tomorrow = await build('rediscover')
    expect([...ids(tomorrow)].sort()).not.toEqual([...today].sort())
    expect(byArtist(tomorrow)).toEqual({ Nova: 4, Moss: 4, Reed: 4 })
  })
})

describe('Fresh in Your Library', () => {
  test('unheard songs off unplayed new albums, the one furthest from your taste left out', async () => {
    const mix = await build('fresh')
    expect(mix.length).toBe(48) // twelve albums, four songs each
    expect(mix.every((t) => !t.playCount)).toBe(true)
    expect(Object.keys(byArtist(mix)).sort()).toEqual(NEWEST.slice(2).map((a) => `Band ${a.id}`).sort())
  })
})

describe('without play history', () => {
  test('every discovery mix is empty and none is offered', async () => {
    for (const kind of ['discover', 'deepCuts', 'rediscover', 'fresh'] as const) {
      expect(await build(kind, { taste: [] })).toEqual([])
    }
    expect(await discoverySeeds(fakeClient({ taste: [] }))).toEqual([])
  })
})

describe("from this device's play history alone", () => {
  const at = (days: number): number => NOW.getTime() - days * 86_400_000
  const played = (artist: string, albumId: string, genre: string, count: number) => ({ count, lastPlayed: at(3), artist, albumId, album: albumId, genre })
  const history: PlayHistory = {
    'f1-0': played('Nova', 'f1', 'indie', 6),
    'f1-1': played('Nova', 'f1', 'indie', 4),
    'f3-0': played('Moss', 'f3', 'jazz', 2),
    i0: played('Stranger 0', 'si', 'indie', 3)
  }
  const sources = { albums: async () => [], history: async () => history, blocked: () => NO_BLOCKS }

  test('a server that reports no plays still gets a Discover mix, without the songs played here', async () => {
    const client = fakeClient({ taste: [], counts: false })
    expect(await discoverySeeds(fakeClient({ taste: [], counts: false }))).toEqual([])
    const mix = await buildMix(client, seed('discover'), sources)
    // Every artist of the two genres played here at two songs each, the cap of fifty reached.
    expect(mix.length).toBe(50)
    expect(ids(mix)).not.toContain('i0')
    expect(byArtist(mix)['Stranger 0']).toBe(2)
    expect(byArtist(mix).Nova).toBe(2)
  })
})

describe('discoverySeeds', () => {
  test('offers every mix that has songs, and builds each only once a day', async () => {
    const calls: string[] = []
    const client = fakeClient({ taste: TASTE }, calls)
    expect((await discoverySeeds(client)).map((s) => s.kind)).toEqual(['discover', 'deepCuts', 'rediscover', 'fresh'])
    // One taste list, two genre pulls, four artists and six of their albums, three stale albums, the newest list and twelve of it.
    expect(calls.length).toBe(29)
    await discoverySeeds(client)
    await buildMix(client, seed('deepCuts'))
    expect(calls.length).toBe(29)
  })
})
