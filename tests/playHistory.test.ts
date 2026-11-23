import { describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localAlbums, mergeTaste, withLocalPlays, type LocalPlays, type PlayHistory } from '../src/shared/playHistory'

const userData = mkdtempSync(join(tmpdir(), 'lyria-history-'))

// Same export names as the other tests' electron mocks; see audioCache.test.
mock.module('electron', () => ({ app: { getPath: () => userData }, net: {}, protocol: {} }))
const { MAX_SONGS, all, flush, recordPlay } = await import('../src/main/playHistory')

const saved = (): PlayHistory => JSON.parse(readFileSync(join(userData, 'play-history.json'), 'utf8'))
const track = (id: string) => ({ id, artist: 'Nova', artistId: 'nova', album: 'F1', albumId: 'f1', genre: 'indie' })

describe('recordPlay', () => {
  test('counts a submission once however often it is sent, and keeps what it played with', () => {
    recordPlay(track('a'), 1000)
    recordPlay(track('a'), 1000)
    recordPlay(track('a'), 2000)
    recordPlay(track('a'), 1500)
    flush()
    expect(saved().a).toEqual({ count: 2, lastPlayed: 2000, artist: 'Nova', artistId: 'nova', album: 'F1', albumId: 'f1', genre: 'indie' })
  })

  test('past the bound, the songs played longest ago go first', () => {
    for (let i = 0; i < MAX_SONGS; i++) recordPlay(track(`s${i}`), 10_000 + i)
    flush()
    const kept = saved()
    expect(Object.keys(kept).length).toBe(MAX_SONGS)
    expect(kept.a).toBeUndefined()
    expect(kept.s0.lastPlayed).toBe(10_000)
    recordPlay(track('s0'), 99_999)
    recordPlay(track('late'), 100_000)
    expect(Object.keys(all()).length).toBe(MAX_SONGS)
    expect(all().s1).toBeUndefined()
    expect(all().s0.count).toBe(2)
  })
})

const local = (count: number, lastPlayed: string, { artist = 'Nova', album = '', albumId, genre }: Partial<LocalPlays> = {}): LocalPlays => ({
  count,
  lastPlayed: Date.parse(lastPlayed),
  artist,
  album,
  albumId,
  genre
})

type Song = { id: string; playCount?: number; played?: string }

describe('withLocalPlays', () => {
  test('without local plays the server copy stands', () => {
    const song: Song = { id: 'x', playCount: 4, played: '2026-03-01T00:00:00.000Z' }
    expect(withLocalPlays(song, undefined)).toEqual(song)
  })

  test('a song only this device played takes its count and date', () => {
    expect(withLocalPlays<Song>({ id: 'x' }, local(3, '2026-05-01T00:00:00.000Z'))).toEqual({
      id: 'x',
      playCount: 3,
      played: '2026-05-01T00:00:00.000Z'
    })
  })

  test('with both, the higher count and the later date', () => {
    const song: Song = { id: 'x', playCount: 9, played: '2026-05-01T00:00:00.000Z' }
    expect(withLocalPlays(song, local(2, '2026-01-01T00:00:00.000Z'))).toEqual(song)
  })

  test('local plays newer than the server knows of win the date, and the count when higher', () => {
    const song: Song = { id: 'x', playCount: 1, played: '2026-01-01T00:00:00.000Z' }
    expect(withLocalPlays(song, local(5, '2026-06-01T00:00:00.000Z'))).toEqual({
      id: 'x',
      playCount: 5,
      played: '2026-06-01T00:00:00.000Z'
    })
  })
})

describe('taste', () => {
  const history: PlayHistory = {
    a1: local(4, '2026-06-01T00:00:00.000Z', { albumId: 'f1', album: 'F1', genre: 'indie' }),
    a2: local(3, '2026-06-03T00:00:00.000Z', { albumId: 'f1', album: 'F1', genre: 'indie' }),
    b1: local(2, '2026-06-02T00:00:00.000Z', { artist: 'Moss', albumId: 'f3', album: 'F3', genre: 'jazz' }),
    loose: local(9, '2026-06-02T00:00:00.000Z')
  }

  test("adds this device's plays up per album", () => {
    expect(localAlbums(history).get('f1')).toMatchObject({ count: 7, lastPlayed: Date.parse('2026-06-03T00:00:00.000Z') })
  })

  test("merges the server's most played with the albums only this device played, most played first", () => {
    const server = [
      { id: 'f9', name: 'F9', artist: 'Reed', playCount: 5 },
      { id: 'f3', name: 'F3', artist: 'Moss', playCount: 1 }
    ]
    expect(mergeTaste(server, history, 50).map((a) => [a.id, a.playCount, a.played])).toEqual([
      ['f1', 7, '2026-06-03T00:00:00.000Z'],
      ['f9', 5, undefined],
      ['f3', 2, '2026-06-02T00:00:00.000Z']
    ])
    expect(mergeTaste(server, history, 1).map((a) => a.id)).toEqual(['f1'])
  })
})
