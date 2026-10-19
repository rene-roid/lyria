import type { AlbumID3, ArtistID3 } from '@shared/subsonic/types'
import type { SubsonicClient } from '@shared/subsonic/client'
import { parseDiscName } from '@shared/format'
import { pushRecent, viewKey, type RecentItem, type Track, type View } from '@shared/types'
import { create } from 'zustand'
import { player, usePlayerState } from '@renderer/shared/playerStore'
import { useSessionStore } from '@renderer/shared/sessionStore'
import { mapLimit } from '@shared/async'
import { allAlbums } from './albumList'
import { ALBUM_FETCH_LIMIT, buildMix, seedOfView } from './mixes'
import { findSavedMix } from './savedMixes'

/** Describe a page for the shelf. Call sites pass this as the origin of a play. */
export function recentOf(view: View, title: string, subtitle?: string, coverArt?: string): RecentItem {
  return { key: viewKey(view), view, title, subtitle, coverArt }
}

/** `discIds` are the sibling albums of a split multi-disc release, as on AlbumCard. */
export function albumRecent(album: AlbumID3, discIds?: string[]): RecentItem {
  const view: View = { name: 'album', id: album.id, discIds: discIds?.length ? discIds : undefined }
  return recentOf(view, parseDiscName(album.name).base, album.artist, album.coverArt ?? album.id)
}

function songItem(t: Track | undefined): RecentItem | null {
  return t ? { key: `track:${t.id}`, title: t.title, subtitle: t.artist, coverArt: t.coverArt, track: t } : null
}

function remember(item: RecentItem | null): void {
  const { recents } = useSessionStore.getState().settings
  const next = pushRecent(recents, item)
  if (next !== recents) void window.sonora.settings.update({ recents: next })
}

/**
 * The page the queue was started from, as a `viewKey`, so that page's play buttons can show pause
 * and resume it instead of starting it over. Lives in this window only: a queue restored at launch,
 * or started from the mini player, is not from anywhere.
 */
export const usePlayingFrom = create<{ key: string | null }>(() => ({ key: null }))

/**
 * Play `tracks` and record what the user played *from* on Home's shelf.
 * `origin` omitted means the song stands on its own (search hit, library shuffle); `null` records nothing.
 * `from` names the page for its play buttons when that differs from the shelf's record (Liked Songs
 * is pinned on the shelf, so it records nothing, but is still somewhere to play from).
 */
export function playFrom(tracks: Track[], index = 0, origin?: RecentItem | null, from = origin?.key ?? null): void {
  player.setQueue(tracks, index, true)
  usePlayingFrom.setState({ key: from })
  remember(origin === undefined ? songItem(tracks[index]) : origin)
}

/** Whether the queue came from `key`, and whether it is playing right now. */
export function usePlayingState(key: string | undefined): { current: boolean; playing: boolean } {
  const current = usePlayingFrom((s) => key !== undefined && s.key === key)
  const playing = usePlayerState((s) => s.playing)
  return { current, playing: current && playing }
}

/**
 * Everything an artist is on: their own albums oldest first, then the songs they are credited on
 * elsewhere -- compilations, singles, features -- so an artist with no album of their own still plays.
 */
export async function artistTracks(c: SubsonicClient, artist: ArtistID3 & { album: AlbumID3[] }): Promise<Track[]> {
  const albums = [...artist.album].sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
  const [own, credited] = await Promise.all([
    mapLimit(albums, ALBUM_FETCH_LIMIT, (a) => c.getAlbum(a.id)),
    c.getArtistSongs(artist.id, artist.name)
  ])
  const songs = own.flatMap((a) => a.song)
  const ids = new Set(songs.map((t) => t.id))
  return [...songs, ...credited.filter((t) => !ids.has(t.id))]
}

/** Re-fetch what a shelf tile stands for, so its play button works long after the play that made it. */
export async function loadRecent(c: SubsonicClient, r: RecentItem): Promise<Track[]> {
  const v = r.view
  if (!v) return r.track ? [r.track] : []
  switch (v.name) {
    case 'album': {
      const albums = await Promise.all([v.id, ...(v.discIds ?? [])].map((i) => c.getAlbum(i)))
      return albums.flatMap((a) => a.song)
    }
    case 'artist':
      return artistTracks(c, await c.getArtist(v.id))
    case 'playlist':
      return (await c.getPlaylist(v.id)).entry
    case 'genre':
      return c.getSongsByGenre(v.value)
    case 'mood': {
      const albums = (await allAlbums(c)).filter((a) => a.moods?.includes(v.value))
      return (await mapLimit(albums, ALBUM_FETCH_LIMIT, (a) => c.getAlbum(a.id))).flatMap((a) => a.song)
    }
    case 'mix':
      return buildMix(c, seedOfView(v), allAlbums)
    // Saved with its songs, so the shelf plays the lineup as it was kept rather than today's roll.
    case 'savedMix':
      return findSavedMix(v.id)?.tracks ?? []
    case 'favorites':
      return (await c.getStarred2()).songs
    default:
      return []
  }
}
