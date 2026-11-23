import { describe, expect, test } from 'bun:test'
import { radio, type RadioRequest, type RadioSource } from '../src/shared/radio'
import type { Track } from '../src/shared/types'

const song = (id: string, artist: string, genre?: string): Track => ({ id, title: id, artist, album: '', duration: 100, genre })

/** `n` songs, two per artist, so the per-artist cap never bites. */
const songs = (prefix: string, n: number, genre?: string): Track[] =>
  Array.from({ length: n }, (_, i) => song(`${prefix}${i}`, `${prefix} artist ${Math.floor(i / 2)}`, genre))

/** A server that answers from the given lists and writes down every call it gets. */
function server(answers: {
  similar?: Record<string, Track[]>
  genre?: Record<string, Track[]>
  top?: Record<string, Track[]>
  random?: Track[]
  /** Endpoints that fail, as on a server that does not have them. */
  broken?: (keyof RadioSource)[]
}): RadioSource & { calls: string[] } {
  const calls: string[] = []
  const answer = async (name: keyof RadioSource, call: string, tracks: Track[] | undefined): Promise<Track[]> => {
    calls.push(call)
    if (answers.broken?.includes(name)) throw new Error(`${name} is not supported`)
    return tracks ?? []
  }
  return {
    calls,
    getSimilarSongs2: (id, count) => answer('getSimilarSongs2', `similar ${id} ${count}`, answers.similar?.[id]),
    getSongsByGenre: (genre, count) => answer('getSongsByGenre', `genre ${genre} ${count}`, answers.genre?.[genre]),
    getTopSongs: (artist, count) => answer('getTopSongs', `top ${artist} ${count}`, answers.top?.[artist]),
    getRandomSongs: (size) => answer('getRandomSongs', `random ${size}`, answers.random)
  }
}

const seed = song('seed', 'Nova', 'indie')

const ask = (over: Partial<RadioRequest>): RadioRequest => ({
  seeds: [seed],
  count: 10,
  exclude: new Set(['seed']),
  shuffleSeed: 'test',
  ...over
})

const ids = (tracks: Track[]): string[] => tracks.map((t) => t.id)
const sorted = (tracks: Track[]): string[] => ids(tracks).sort()

function perArtist(tracks: Track[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const t of tracks) counts[t.artist] = (counts[t.artist] ?? 0) + 1
  return counts
}

describe('radio', () => {
  test("takes the server's similar songs and asks nothing more when they are enough", async () => {
    const s = server({ similar: { seed: songs('x', 10) } })
    const out = await radio(s, ask({}))
    expect(sorted(out)).toEqual(['x0', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8', 'x9'])
    expect(s.calls).toEqual(['similar seed 20'])
  })

  test('asks after every seed and never hands back a queued song, or one twice', async () => {
    const a = song('a', 'Kite')
    const both = [song('x1', 'One'), song('x2', 'Two'), song('queued', 'Three')]
    const s = server({ similar: { seed: both, a: [...both, song('x3', 'Four')] } })
    const out = await radio(s, ask({ seeds: [seed, a], count: 3, exclude: new Set(['seed', 'a', 'queued']) }))
    expect(sorted(out)).toEqual(['x1', 'x2', 'x3'])
    expect(s.calls).toEqual(['similar seed 10', 'similar a 10'])
  })

  test('with no similar songs, fills up from the genre, then from random songs, in that order', async () => {
    const s = server({
      genre: { indie: songs('g', 4, 'indie') },
      random: songs('r', 10)
    })
    const out = await radio(s, ask({}))
    expect(ids(out)).toEqual(['g1', 'g2', 'g3', 'g0', 'r0', 'r1', 'r2', 'r3', 'r4', 'r5'])
    expect(s.calls).toEqual(['similar seed 20', 'genre indie 300', 'top Nova 10', 'random 50'])
  })

  test('an endpoint the server lacks drops through to the next rung', async () => {
    const s = server({ broken: ['getSimilarSongs2', 'getTopSongs'], genre: { indie: songs('g', 10, 'indie') } })
    const out = await radio(s, ask({}))
    expect(sorted(out)).toEqual(['g0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9'])
    expect(s.calls).toEqual(['similar seed 20', 'genre indie 300', 'top Nova 10'])
  })

  test('deals a couple of songs by the seed artist through the genre, top songs first', async () => {
    const own = [song('n1', 'Nova', 'indie'), song('n2', 'Nova', 'indie'), song('n3', 'Nova', 'indie')]
    const s = server({
      genre: { indie: [...songs('g', 16, 'indie'), ...own] },
      top: { Nova: [song('top1', 'Nova'), song('top2', 'Nova'), song('seed', 'Nova')] }
    })
    const out = await radio(s, ask({}))
    expect(out.filter((t) => t.artist === 'Nova').map((t) => t.id)).toEqual(['top1', 'top2'])
    expect(out.findIndex((t) => t.id === 'top2')).toBeGreaterThan(1)
    expect(out).toHaveLength(10)
  })

  test('gives no artist more than two songs, even when that leaves it short', async () => {
    const s = server({
      similar: { seed: [1, 2, 3, 4, 5, 6].map((n) => song(`a${n}`, 'Ash')).concat(song('b1', 'Birch')) },
      random: [song('a7', 'Ash'), song('b2', 'Birch'), song('b3', 'Birch')]
    })
    const out = await radio(s, ask({ seeds: [song('seed', 'Nova')] }))
    expect(perArtist(out)).toEqual({ Ash: 2, Birch: 2 })
    expect(s.calls).toEqual(['similar seed 20', 'top Nova 10', 'random 50'])
  })

  test('offline, keeps only songs on this device and keeps looking for more of them', async () => {
    const here = new Set(['x0', 'g2', 'r1'])
    const asked: string[][] = []
    const s = server({
      similar: { seed: songs('x', 4) },
      genre: { indie: songs('g', 4, 'indie') },
      random: songs('r', 4)
    })
    const playable = async (list: string[]): Promise<string[]> => {
      asked.push(list)
      return list.filter((id) => here.has(id))
    }
    const out = await radio(s, ask({ count: 3, playable }))
    expect(sorted(out)).toEqual(['g2', 'r1', 'x0'])
    expect(asked).toHaveLength(3)
  })

  test('nothing to go on, nothing asked', async () => {
    const s = server({})
    expect(await radio(s, ask({ seeds: [] }))).toEqual([])
    expect(s.calls).toEqual([])
  })
})
