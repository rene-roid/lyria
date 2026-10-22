import { useMemo } from 'react'
import { create } from 'zustand'
import type { RecentItem, Track } from '@shared/types'
import type { Playlist } from '@shared/subsonic/types'
import type { SubsonicClient } from '@shared/subsonic/client'
import { parseMix, splitPlaylists } from '@shared/navimix'
import { useClient, useSessionStore } from '@renderer/shared/sessionStore'
import { recentOf } from './recents'
import { useAsync, type AsyncState } from './useAsync'

interface PlaylistsState {
  /** Bumped after every change, so the lists watching playlists re-fetch. */
  revision: number
  /** Tracks the open "new playlist" dialog starts with; null while it is closed. */
  draft: Track[] | null
}

export const usePlaylists = create<PlaylistsState>(() => ({ revision: 0, draft: null }))

/** Re-read the revision so a `useAsync` over playlists reloads whenever one is created. */
export function usePlaylistsRevision(): number {
  return usePlaylists((s) => s.revision)
}

export const playlists = {
  /** Open the new-playlist dialog, optionally seeded with the tracks it should start with. */
  newPlaylist(tracks: Track[] = []): void {
    usePlaylists.setState({ draft: tracks })
  },
  closeDialog(): void {
    usePlaylists.setState({ draft: null })
  },
  changed(): void {
    usePlaylists.setState((s) => ({ revision: s.revision + 1 }))
  }
}

/** The server's playlists, split into NaviBeat/Explo mixes (in the web UI's order) and the user's own. */
export function useServerPlaylists(): AsyncState<Playlist[]> & ReturnType<typeof splitPlaylists> {
  const client = useClient()
  const revision = usePlaylistsRevision()
  const state = useAsync('playlists', () => client?.getPlaylists(), [client, revision])
  const split = useMemo(() => splitPlaylists(state.data), [state.data])
  return { ...state, ...split }
}

export function useSavedPlaylists(): string[] {
  return useSessionStore((s) => s.settings.savedPlaylists)
}

/** Heart a playlist into Your Library, or take it back out. Local to this install. */
export function toggleSavedPlaylist(id: string): void {
  const saved = useSessionStore.getState().settings.savedPlaylists
  void window.lyria.settings.update({ savedPlaylists: saved.includes(id) ? saved.filter((s) => s !== id) : [id, ...saved] })
}

/** Saved ones first, each group keeping the order it came in. */
export function savedFirst<T extends { id: string }>(items: T[], saved: string[]): T[] {
  return [...items.filter((p) => saved.includes(p.id)), ...items.filter((p) => !saved.includes(p.id))]
}

/** A playlist on Home's shelf, under its mix title when it is one. */
export function playlistRecent(p: Playlist): RecentItem {
  const mix = parseMix(p.name, p.comment)
  return recentOf({ name: 'playlist', id: p.id }, mix?.title ?? p.name, mix ? 'Mix' : 'Playlist', p.coverArt)
}

const photos = new Map<string, Promise<string | undefined>>()

/**
 * The picture a mix about an artist wears, picked as the web UI picks it: the artist found by
 * name, then the cover of their most played album. Subsonic has no artist photos to speak of.
 */
export function artistPhoto(client: SubsonicClient, name: string): Promise<string | undefined> {
  let job = photos.get(name)
  if (!job) {
    const find = async (n: string) =>
      (await client.search3(n, { artistCount: 10, albumCount: 0, songCount: 0 })).artists.find(
        (a) => a.name.toLowerCase() === n.toLowerCase()
      )
    job = (async () => {
      const artist = (await find(name)) ?? (name.includes(', ') ? await find(name.split(', ')[0]) : undefined)
      if (!artist) return undefined
      const albums = (await client.getArtist(artist.id)).album
      const top = albums.reduce<(typeof albums)[number] | undefined>(
        (best, a) => (!best || (a.playCount ?? 0) > (best.playCount ?? 0) ? a : best),
        undefined
      )
      return top?.coverArt ?? artist.coverArt
    })()
    // A failure is not remembered, so the next cover to ask tries again.
    job.catch(() => photos.delete(name))
    photos.set(name, job)
  }
  return job
}
