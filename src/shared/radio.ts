/**
 * Songs to carry on with: autoplay's top-up when the queue runs out, the run that follows a song
 * radio, and an artist's radio. The server's similar-song picks come first, but Navidrome only has those with an
 * agent such as Last.fm set up and otherwise answers with nothing, so the list fills up from the
 * seeds' genres and then from random songs, the way an artist mix fills up from its artist's genres.
 */
import type { SubsonicClient } from './subsonic/client'
import { isBlocked, unblocked, type Blocked, type Track } from './types'
import { interleave, sameArtist, shuffle, spread, tally } from './shuffle'

/** The calls a radio makes; the Subsonic client, or a stand-in for one. */
export type RadioSource = Pick<SubsonicClient, 'getSimilarSongs2' | 'getTopSongs' | 'getSongsByGenre' | 'getRandomSongs'>

export interface RadioRequest {
  /** Songs to find more like, most recent first. */
  seeds: Track[]
  count: number
  /** Ids never to hand back: everything already in the queue. */
  exclude: ReadonlySet<string>
  blocked: Blocked
  /** The same seed deals the same radio. */
  shuffleSeed: string
  /** Which of `ids` can play: offline, the ones with a copy on this device. Absent, all of them. */
  playable?: (ids: string[]) => Promise<string[]>
}

/** Most songs one artist may take, so a radio never turns into a single artist's catalogue. */
const PER_ARTIST = 2
/** Songs pulled per genre: plenty of artists to spread over, short of walking the whole tag. */
const GENRE_POOL = 300
/** Top songs asked for per seed artist; the spread keeps a couple of them at most. */
const TOP_SONGS = 10

/** How long an artist radio runs. */
const ARTIST_RADIO_LENGTH = 50
/** Most of the artist's own songs an artist radio plays: one in every three. */
const ARTIST_RADIO_OWN = 17
/** Similar songs asked for; with fewer than ARTIST_SIMILAR_ENOUGH, the artist's genres top them up. */
const ARTIST_SIMILAR = 60
const ARTIST_SIMILAR_ENOUGH = 30
/** Songs taken from each of the artist's genres when they top up the similar songs. */
const ARTIST_GENRE_FILL = 30
/** Of the artist's top songs, how many open their share before the rest of their songs. */
const ARTIST_TOP = 5

const none = (): Track[] => []

/**
 * Up to `count` songs like the seeds, none of them already queued, no artist more than twice.
 * Each rung only runs while the ones before it left the list short.
 */
export async function radio(source: RadioSource, req: RadioRequest): Promise<Track[]> {
  const { seeds, count, exclude, blocked, shuffleSeed } = req
  if (!seeds.length) return []
  const rungs = [
    () => similar(source, seeds, count, shuffleSeed),
    () => sameGenre(source, seeds, shuffleSeed),
    () => source.getRandomSongs(Math.max(50, 2 * count))
  ]
  const pool: Track[] = []
  let out: Track[] = []
  for (const rung of rungs) {
    // An endpoint the server lacks, or a server out of reach, just means the next rung.
    const fresh = (await rung().catch(none)).filter((t) => !exclude.has(t.id) && !isBlocked(blocked, t))
    const here = req.playable && new Set(await req.playable(fresh.map((t) => t.id)))
    pool.push(...(here ? fresh.filter((t) => here.has(t.id)) : fresh))
    out = spread(pool, count, PER_ARTIST)
    if (out.length >= count) break
  }
  return out
}

/**
 * "X Radio": one of the artist's songs, then two by others like them, and so on, the same all
 * `day`. The others are the server's similar songs for the artist, topped up from the artist's two
 * most common genres when the server has fewer than 30; the artist's share opens with their top songs.
 */
export async function artistRadio(
  source: RadioSource,
  artist: { id: string; name: string; songs: Track[] },
  blocked: Blocked,
  day = new Date().toDateString()
): Promise<Track[]> {
  const seed = `artistRadio:${artist.id}:${day}`
  const theirs = (t: Track): boolean => t.artistId === artist.id || sameArtist(t.artist, artist.name)
  const others = (t: Track): boolean => !theirs(t) && !isBlocked(blocked, t)
  const [similar, top] = await Promise.all([
    source.getSimilarSongs2(artist.id, ARTIST_SIMILAR).catch(none),
    source.getTopSongs(artist.name, TOP_SONGS).catch(none)
  ])
  const alike = similar.filter(others)
  if (alike.length < ARTIST_SIMILAR_ENOUGH) {
    const genres = tally(artist.songs.map((t) => t.genre)).slice(0, 2)
    const pulls = await Promise.all(genres.map((g) => source.getSongsByGenre(g, GENRE_POOL).catch(none)))
    for (const pull of pulls) alike.push(...shuffle(pull.filter(others), seed).slice(0, ARTIST_GENRE_FILL))
  }
  const own = unblocked([...top.filter(theirs).slice(0, ARTIST_TOP), ...shuffle(artist.songs, seed)], blocked)
  const lead = spread(own, ARTIST_RADIO_OWN, ARTIST_RADIO_OWN)
  const rest = ARTIST_RADIO_LENGTH - lead.length
  return interleave(lead, spread(shuffle(alike, seed), rest, rest), ARTIST_RADIO_LENGTH, 3)
}

/** The server's picks for every seed, shuffled together so no one seed leads. */
async function similar(source: RadioSource, seeds: Track[], count: number, seed: string): Promise<Track[]> {
  const each = Math.max(10, Math.ceil((2 * count) / seeds.length))
  const lists = await Promise.all(seeds.map((s) => source.getSimilarSongs2(s.id, each).catch(none)))
  return shuffle(lists.flat(), seed)
}

/**
 * Songs in the seeds' genres by other artists, with the seeds' own artists dealt through them:
 * their top songs where the server knows them, else their songs in the genre.
 */
async function sameGenre(source: RadioSource, seeds: Track[], seed: string): Promise<Track[]> {
  const genres = tally(seeds.map((t) => t.genre)).slice(0, 2)
  const artists = tally(seeds.map((t) => t.artist)).slice(0, 2)
  const [pulls, tops] = await Promise.all([
    Promise.all(genres.map((g) => source.getSongsByGenre(g, GENRE_POOL).catch(none))),
    Promise.all(artists.map((a) => source.getTopSongs(a, TOP_SONGS).catch(none)))
  ])
  const theirs = (t: Track): boolean => artists.some((a) => sameArtist(a, t.artist))
  const pool = shuffle(pulls.flat(), seed)
  const lead = [...tops.flat(), ...pool.filter(theirs)]
  const rest = pool.filter((t) => !theirs(t))
  return interleave(lead, rest, lead.length + rest.length)
}
