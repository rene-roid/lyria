import type { AlbumID3 } from './subsonic/types'
import type { Track } from './types'

/**
 * This device's own record of what it played, kept beside the server's. Navidrome counts plays
 * too, but a server can lose its history, be a fresh install, or not report counts at all, and a
 * play made offline only reaches it later; the discovery mixes read whichever of the two knows more.
 */

/** What a play is recorded with: the song, and what the mixes rank artists, albums and genres by. */
export type PlayedTrack = Pick<Track, 'id' | 'artist' | 'artistId' | 'album' | 'albumId' | 'genre'>

export interface LocalPlays extends Omit<PlayedTrack, 'id'> {
  count: number
  /** Epoch milliseconds. */
  lastPlayed: number
}

/** By song id. */
export type PlayHistory = Record<string, LocalPlays>

/**
 * The server's plays of a song or album with this device's folded in. Each copy may have missed
 * plays the other saw, but neither counts one twice, so the higher count is the closer one; and
 * the later date wins.
 */
export function withLocalPlays<T extends { playCount?: number; played?: string }>(item: T, local: LocalPlays | undefined): T {
  if (!local) return item
  const played = item.played && Date.parse(item.played) >= local.lastPlayed ? item.played : new Date(local.lastPlayed).toISOString()
  return { ...item, playCount: Math.max(item.playCount ?? 0, local.count), played }
}

/** This device's plays added up per album, the way the server reports an album's. */
export function localAlbums(history: PlayHistory): Map<string, LocalPlays> {
  const out = new Map<string, LocalPlays>()
  for (const p of Object.values(history)) {
    if (!p.albumId) continue
    const a = out.get(p.albumId)
    if (a) out.set(p.albumId, { ...a, count: a.count + p.count, lastPlayed: Math.max(a.lastPlayed, p.lastPlayed) })
    else out.set(p.albumId, p)
  }
  return out
}

/**
 * Your most played albums by both counts: the server's list with this device's plays folded in,
 * and the albums only this device has seen played, most played first.
 */
export function mergeTaste(server: AlbumID3[], history: PlayHistory, size: number): AlbumID3[] {
  const local = localAlbums(history)
  const merged = server.map((a) => withLocalPlays(a, local.get(a.id)))
  const known = new Set(server.map((a) => a.id))
  for (const [id, p] of local) {
    if (!known.has(id)) merged.push(withLocalPlays<AlbumID3>({ id, name: p.album ?? '', artist: p.artist, artistId: p.artistId, genre: p.genre }, p))
  }
  return merged.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0)).slice(0, size)
}
