/**
 * Auto-generated "mixes": daily playlists seeded from what the server says you actually play.
 * Navidrome already tracks play counts, genre and mood tags, so there is no recommendation engine
 * here -- just seed, shuffle and spread.
 *
 * A tag mix is seeded from a genre tag, a mood tag or an artist; a discovery mix from the play
 * history alone, to turn up what you have not been playing. Each kind draws from a different pool
 * but ends up in the same shape: one day-stable, artist-spread list of songs. `MIXES` is the table
 * of kinds.
 */
import type { SubsonicClient } from '@shared/subsonic/client'
import type { AlbumID3 } from '@shared/subsonic/types'
import { DISCOVERY_KINDS, type MixKind, type Track, type View } from '@shared/types'
import { mapLimit } from '@shared/async'
import { capitalize, hasMood } from '@shared/format'
import { paletteColor } from '@shared/navimix'
import { cacheRead, cacheWrite } from '@renderer/shared/cache'

/**
 * Where the whole album list comes from. Injected rather than imported, so this module stays a
 * plain function of a client -- the renderer hands in its cached copy, and the unit tests hand in
 * nothing and get the straight server walk.
 */
export type AlbumSource = (client: SubsonicClient) => Promise<AlbumID3[]>
const serverAlbums: AlbumSource = (client) => client.getAllAlbums()

/** What one mix is built around. `value` is the tag text or the artist's name, and empty for a discovery mix. */
export interface MixSeed {
  kind: MixKind
  value: string
}

/** Where a mix's page caches today's lineup. */
export const mixKey = (seed: MixSeed): string => `mix:${seed.kind}:${seed.value}`

/** Views persisted before mixes grew past genres carry no kind. */
export const seedOfView = (v: Extract<View, { name: 'mix' }>): MixSeed => ({
  kind: v.kind ?? 'genre',
  value: v.value
})

const MIX_LENGTH = 50
/** Most a single artist may take up in one mix, so a mix never turns into an album. */
const PER_ARTIST = 2
/** An artist mix is *about* its artist, so they get more room; everyone else stays at PER_ARTIST. */
const PER_SEED_ARTIST = 8
/**
 * A mix drawn album by album rather than from a genre pull has far fewer artists in its pool, so
 * each may take a few more songs before the mix runs short.
 */
const PER_ALBUM_ARTIST = 4
/** Albums opened for a mood mix. Each is a request, and 30 albums already overfill a 50-song mix. */
const MOOD_ALBUMS = 30
/** Albums opened for the seed artist of an artist mix, for the same reason. */
const ARTIST_ALBUMS = 5
/** Album requests in flight at once wherever a list of albums has to be opened one by one. */
export const ALBUM_FETCH_LIMIT = 6

/** Your most played albums, read as your taste. The tag mixes are seeded from the same list. */
const TASTE_ALBUMS = 50
/** Fewer songs than this and a discovery mix is left out rather than shown nearly empty. */
const MIN_DISCOVERY = 10
/** Genres a Discover mix draws from. */
const DISCOVER_GENRES = 3
/** Most played artists a Deep Cuts mix digs into, and how many of each one's albums a day opens. */
const DEEP_ARTISTS = 6
const DEEP_ALBUMS = 2
/** Played this often or less, a song still counts as one you passed over. */
const RARELY = 1
/** Played this often or more, a song counts as a favourite. */
const LOVED = 3
/** Not played for this long, a favourite counts as forgotten. */
const FORGOTTEN_MS = 60 * 24 * 60 * 60 * 1000
/** Forgotten albums in the running, most played first, and how many of them a day's mix opens. */
const REDISCOVER_POOL = 25
const REDISCOVER_ALBUMS = 12
/** Newest albums looked at, and how many of the best matches for your taste are opened. */
const FRESH_LIST = 60
const FRESH_ALBUMS = 12

/** Compilation and placeholder credits make a nonsense artist mix, so they never become seeds. */
const NOT_AN_ARTIST = /^(various(\s+artists)?|va|unknown artist|soundtrack|\[?unknown\]?)$/i
const isArtist = (name: string | undefined): name is string => !!name && !NOT_AN_ARTIST.test(name.trim())

export function seedOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * Deterministic shuffle: a mix stays put all day and comes back different tomorrow, with nothing
 * stored. Also what picks the covers a tag wears, so those hold still for their own period too.
 */
export function shuffle<T>(items: T[], seed: string): T[] {
  let s = seedOf(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const today = (): string => new Date().toDateString()

/** The seed string behind a mix: same mix all day, a different one tomorrow. */
const daySeed = (seed: MixSeed): string => `${seed.kind}:${seed.value}:${today()}`

/** Drop repeats and cap how much of the list any one artist may take, up to `limit` songs. */
function spread(tracks: Track[], limit = MIX_LENGTH, perArtist = PER_ARTIST): Track[] {
  const seen = new Map<string, number>()
  const ids = new Set<string>()
  const out: Track[] = []
  for (const t of tracks) {
    if (ids.has(t.id)) continue
    const n = seen.get(t.artist) ?? 0
    if (n >= perArtist) continue
    seen.set(t.artist, n + 1)
    ids.add(t.id)
    out.push(t)
    if (out.length === limit) break
  }
  return out
}

/**
 * Deal `lead` evenly through `rest` rather than stacking it up front, so an artist mix opens with
 * its artist and keeps coming back to them instead of drifting away after the first few songs.
 */
function interleave(lead: Track[], rest: Track[], limit = MIX_LENGTH): Track[] {
  if (!lead.length || !rest.length) return [...lead, ...rest].slice(0, limit)
  const step = Math.max(2, Math.floor(limit / lead.length))
  const out: Track[] = []
  let l = 0
  let r = 0
  while (out.length < limit && (l < lead.length || r < rest.length)) {
    if (l < lead.length && out.length % step === 0) out.push(lead[l++])
    else if (r < rest.length) out.push(rest[r++])
    else out.push(lead[l++])
  }
  return out
}

/** Values by how often they show up, most common first. */
function tally(values: (string | undefined)[]): string[] {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([value]) => value)
}

/** How much of your listening each value takes, by the play counts of the albums carrying it, most first. */
function plays(albums: AlbumID3[], pick: (a: AlbumID3) => string | undefined): Map<string, number> {
  const counts = new Map<string, number>()
  for (const a of albums) {
    const v = pick(a)
    if (v) counts.set(v, (counts.get(v) ?? 0) + (a.playCount || 1))
  }
  return new Map([...counts].sort((a, b) => b[1] - a[1]))
}

const sameArtist = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/**
 * Work done once per client and day: a build, or the taste every discovery mix reads. The Discover
 * shelf builds each of its mixes to learn which have songs, and then the cards' covers, their play
 * buttons and the pages they open all ask again.
 */
const memo = new WeakMap<SubsonicClient, Map<string, Promise<unknown>>>()

function once<T>(client: SubsonicClient, key: string, load: () => Promise<T>): Promise<T> {
  const done = memo.get(client) ?? new Map<string, Promise<unknown>>()
  memo.set(client, done)
  const hit = done.get(key)
  if (hit) return hit as Promise<T>
  const job = load()
  done.set(key, job)
  job.catch(() => done.delete(key))
  return job
}

/** Your most played albums, most played first. Empty without play history, which empties every discovery mix. */
const taste = (client: SubsonicClient): Promise<AlbumID3[]> =>
  once(client, `taste:${today()}`, () => client.getAlbumList2('frequent', TASTE_ALBUMS))

/**
 * What to build mixes from, drawn from your most played albums: their genres, their mood tags and
 * the artists themselves. The kinds are dealt round-robin so the row is a spread rather than six
 * genres, and a kind the library has no tags for simply drops out.
 */
export async function mixSeeds(client: SubsonicClient, count = 6): Promise<MixSeed[]> {
  const albums = await taste(client)
  const byKind: [MixKind, string[]][] = [
    ['genre', tally(albums.map((a) => a.genre))],
    // Lowercased so one mood tagged two ways counts as one seed.
    ['mood', tally(albums.flatMap((a) => (a.moods ?? []).map((m) => m.toLowerCase())))],
    ['artist', tally(albums.map((a) => a.artist)).filter(isArtist)]
  ]
  const out: MixSeed[] = []
  for (let i = 0; out.length < count; i++) {
    const before = out.length
    for (const [kind, values] of byKind) {
      if (values[i] !== undefined && out.length < count) out.push({ kind, value: values[i] })
    }
    if (out.length === before) break // every kind is exhausted
  }
  return out
}

const songsOf = async (client: SubsonicClient, albums: AlbumID3[]): Promise<Track[]> =>
  (await mapLimit(albums, ALBUM_FETCH_LIMIT, (a) => client.getAlbum(a.id))).flatMap((a) => a.song)

/** Songs off `albums`, capped at `max` albums so one mix never walks the whole library. */
const songsFrom = (client: SubsonicClient, albums: AlbumID3[], max: number, seed: string): Promise<Track[]> =>
  songsOf(client, shuffle(albums, seed).slice(0, max))

/** Albums carrying the mood tag. Subsonic has no mood endpoint, so this is a pass over the list. */
async function moodPool(
  client: SubsonicClient,
  mood: string,
  seed: string,
  albums: AlbumSource
): Promise<Track[]> {
  const tagged = (await albums(client)).filter((a) => hasMood(a, mood))
  return songsFrom(client, tagged, MOOD_ALBUMS, seed)
}

/**
 * An artist mix: the artist's own songs dealt through songs by others in the genres they work in,
 * which is as close to "similar artists" as a server without Last.fm can get. Falls back to the
 * artist's own catalogue alone when nothing shares their genres.
 */
async function artistMix(client: SubsonicClient, name: string, seed: string): Promise<Track[]> {
  const { artists } = await client.search3(name, { artistCount: 5, albumCount: 0, songCount: 0 })
  const artist = artists.find((a) => sameArtist(a.name, name)) ?? artists[0]
  if (!artist) return []

  const own = await songsFrom(client, (await client.getArtist(artist.id)).album, ARTIST_ALBUMS, seed)
  const genres = tally(own.map((t) => t.genre)).slice(0, 2)
  const pulls = await Promise.all(genres.map((g) => client.getSongsByGenre(g, 300)))
  const neighbours = pulls.flat().filter((t) => !sameArtist(t.artist, artist.name))

  const lead = spread(shuffle(own, seed), PER_SEED_ARTIST, PER_SEED_ARTIST)
  if (!neighbours.length) return spread(shuffle(own, seed), MIX_LENGTH, MIX_LENGTH)
  const rest = spread(shuffle(neighbours, seed), MIX_LENGTH - lead.length)
  return interleave(lead, rest)
}

const unplayed = (t: Track): boolean => !t.playCount
const enough = (tracks: Track[]): Track[] => (tracks.length >= MIN_DISCOVERY ? tracks : [])

/** Songs you have never played from the genres you play most, artists missing from your most played first. */
async function discover(client: SubsonicClient, day: string): Promise<Track[]> {
  const top = await taste(client)
  const genres = [...plays(top, (a) => a.genre).keys()].slice(0, DISCOVER_GENRES)
  const pool = (await Promise.all(genres.map((g) => client.getSongsByGenre(g, 500)))).flat().filter(unplayed)
  const known = new Set(top.map((a) => a.artist?.toLowerCase()))
  const isKnown = (t: Track): boolean => known.has(t.artist.toLowerCase())
  const strangers = shuffle(pool.filter((t) => !isKnown(t)), day)
  const familiar = shuffle(pool.filter(isKnown), day)
  return enough(shuffle(spread([...strangers, ...familiar]), day))
}

/** Songs you passed over by the artists you play most: the album tracks their hits crowd out. */
async function deepCuts(client: SubsonicClient, day: string): Promise<Track[]> {
  const top = await taste(client)
  const artists = [...plays(top, (a) => (isArtist(a.artist) ? a.artistId : undefined)).keys()].slice(0, DEEP_ARTISTS)
  const catalogues = await mapLimit(artists, ALBUM_FETCH_LIMIT, (id) => client.getArtist(id))
  const songs = await songsOf(client, catalogues.flatMap((c) => shuffle(c.album, day).slice(0, DEEP_ALBUMS)))
  const passed = songs.filter((t) => (t.playCount ?? 0) <= RARELY)
  return enough(shuffle(spread(shuffle(passed, day), MIX_LENGTH, PER_SEED_ARTIST), day))
}

/**
 * Songs you played a lot and then left alone. Goes by when each was last played where the server
 * says (OpenSubsonic); otherwise a most played album missing from the recently played list counts
 * as left alone.
 */
async function rediscover(client: SubsonicClient, day: string): Promise<Track[]> {
  const top = await taste(client)
  if (!top.length) return []
  const cutoff = Date.now() - FORGOTTEN_MS
  const longAgo = (played: string | undefined): boolean => !!played && Date.parse(played) < cutoff
  const recent = top.some((a) => a.played)
    ? undefined
    : new Set((await client.getAlbumList2('recent', TASTE_ALBUMS)).map((a) => a.id))
  const stale = top.filter((a) => (recent ? !recent.has(a.id) : longAgo(a.played)))
  const songs = await songsFrom(client, stale.slice(0, REDISCOVER_POOL), REDISCOVER_ALBUMS, day)
  const loved = songs.filter((t) => (t.playCount ?? 0) >= LOVED && (!t.played || longAgo(t.played)))
  return enough(shuffle(spread(shuffle(loved, day), MIX_LENGTH, PER_ALBUM_ARTIST), day))
}

/** New arrivals you have not played yet, the albums in the genres you play most first. */
async function fresh(client: SubsonicClient, day: string): Promise<Track[]> {
  const top = await taste(client)
  if (!top.length) return []
  const liking = plays(top, (a) => a.genre)
  const score = (a: AlbumID3): number => (a.genre && liking.get(a.genre)) || 0
  // Sorting is stable, so albums that match equally well stay newest first.
  const ranked = (await client.getAlbumList2('newest', FRESH_LIST)).filter((a) => !a.playCount).sort((a, b) => score(b) - score(a))
  const albums = await mapLimit(ranked.slice(0, FRESH_ALBUMS), ALBUM_FETCH_LIMIT, (a) => client.getAlbum(a.id))
  // Which of each album's songs make the cut changes by the day; the best matched albums still go first.
  const songs = albums.flatMap((a) => shuffle(a.song.filter(unplayed), day))
  return enough(shuffle(spread(songs, MIX_LENGTH, PER_ALBUM_ARTIST), day))
}

/** One kind of mix: what it is called, the line that says what it is, and how its songs are picked. */
interface MixDef {
  title: (value: string) => string
  label: string
  /** A discovery mix says what it is for on its card, since its name alone does not. */
  about?: string
  /**
   * A discovery mix's own colour, worn as a tint over a grey cover so the Discover shelf reads apart
   * from the tag mixes, which take a colour from their tag and wear a photo.
   */
  color?: string
  build: (client: SubsonicClient, value: string, day: string, albums: AlbumSource) => Promise<Track[]>
}

/** Tag text arrives lowercased from most taggers; an artist's name is already cased how they want it. */
const tagTitle = (value: string): string => `${capitalize(value)} Mix`

export const MIXES: Record<MixKind, MixDef> = {
  genre: {
    title: tagTitle,
    label: 'Genre mix',
    build: async (client, genre, day) => spread(shuffle(await client.getSongsByGenre(genre, 500), day))
  },
  mood: {
    title: tagTitle,
    label: 'Mood mix',
    build: async (client, mood, day, albums) => spread(shuffle(await moodPool(client, mood, day, albums), day))
  },
  artist: {
    title: (name) => `${name} Mix`,
    label: 'Artist mix',
    build: (client, name, day) => artistMix(client, name, day)
  },
  discover: {
    title: () => 'Discover',
    label: 'Discovery mix',
    about: "Songs you've never played, in the genres you play most",
    color: '#7c4dff',
    build: (client, _, day) => discover(client, day)
  },
  deepCuts: {
    title: () => 'Deep Cuts',
    label: 'Discovery mix',
    about: 'The album tracks you skipped, by the artists you play most',
    color: '#d9480f',
    build: (client, _, day) => deepCuts(client, day)
  },
  rediscover: {
    title: () => 'Forgotten Favorites',
    label: 'Discovery mix',
    about: "Songs you used to play a lot and haven't in a while",
    color: '#c79100',
    build: (client, _, day) => rediscover(client, day)
  },
  fresh: {
    title: () => 'Fresh in Your Library',
    label: 'Discovery mix',
    about: "New arrivals you haven't played, closest to your taste first",
    color: '#0b9a8d',
    build: (client, _, day) => fresh(client, day)
  }
}

export const mixTitle = (seed: MixSeed): string => MIXES[seed.kind].title(seed.value)
export const mixColor = (seed: MixSeed): string => MIXES[seed.kind].color ?? paletteColor(seed.value)

/** A day's lineup as kept on disk, so a relaunch the same day costs no requests. */
interface Lineup {
  day: string
  tracks: Track[]
}

export function buildMix(client: SubsonicClient, seed: MixSeed, albums: AlbumSource = serverAlbums): Promise<Track[]> {
  const day = daySeed(seed)
  // Apart from `mixKey`'s copy, which the pages keep whatever day it is from to paint at once and to play offline.
  const key = `today:${mixKey(seed)}`
  return once(client, `mix:${day}`, async () => {
    const kept = cacheRead<Lineup>(key)
    if (kept?.day === day) return kept.tracks
    const tracks = await MIXES[seed.kind].build(client, seed.value, day, albums)
    cacheWrite(key, { day, tracks } satisfies Lineup)
    return tracks
  })
}

/** The discovery mixes that have songs today. One the history or the library cannot fill yet is left out. */
export async function discoverySeeds(client: SubsonicClient): Promise<MixSeed[]> {
  const seeds = DISCOVERY_KINDS.map((kind): MixSeed => ({ kind, value: '' }))
  const built = await Promise.all(seeds.map((seed) => buildMix(client, seed)))
  return seeds.filter((_, i) => built[i].length > 0)
}
