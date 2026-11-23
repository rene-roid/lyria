/**
 * Playlists and saved mixes kept for listening offline. Main owns the files and the list; this
 * mirrors the list, with each one's progress, for the buttons and the settings panel.
 */
import { create } from 'zustand'
import { downloadKey, type DownloadStatus, type PlaylistWithTracks, type SavedMix } from '@shared/types'
import type { SubsonicClient } from '@shared/subsonic/client'
import { cachedOr, isOffline } from './offline'

const useStore = create<{ list: DownloadStatus[] }>(() => ({ list: [] }))

let listening = false

function listen(): void {
  if (listening) return
  listening = true
  window.lyria.downloads.onChange((list) => useStore.setState({ list }))
  void window.lyria.downloads.list().then((list) => useStore.setState({ list }))
}

export function useDownloads(): DownloadStatus[] {
  listen()
  return useStore((s) => s.list)
}

export function useDownload(key: string): DownloadStatus | undefined {
  listen()
  return useStore((s) => s.list.find((d) => d.key === key))
}

/**
 * A playlist with its songs. A downloaded one comes from the copy its download keeps whenever the
 * server cannot be asked, so it opens with no connection at all and lists what is on disk; any
 * other falls back to the copy its page cached.
 */
export async function loadPlaylist(client: SubsonicClient, id: string): Promise<PlaylistWithTracks> {
  const own = (): Promise<PlaylistWithTracks | null> => window.lyria.downloads.playlist(id)
  if (isOffline()) {
    const kept = await own()
    if (kept) return kept
  }
  return cachedOr(`playlist:${id}`, async () => {
    try {
      return await client.getPlaylist(id)
    } catch (err) {
      // Not known to be offline yet, or the server is up but failing: the kept copy beats an error.
      const kept = await own()
      if (kept) return kept
      throw err
    }
  })
}

export const downloads = {
  /** Kept along with its songs, so it opens offline even once the library cache has let it go. */
  playlist(pl: PlaylistWithTracks): Promise<void> {
    return window.lyria.downloads.add({
      key: downloadKey('playlist', pl.id),
      kind: 'playlist',
      id: pl.id,
      title: pl.name,
      trackIds: pl.entry.map((t) => t.id),
      coverArt: pl.coverArt ?? pl.entry[0]?.coverArt,
      playlist: pl
    })
  },
  mix(mix: SavedMix): Promise<void> {
    return window.lyria.downloads.add({
      key: downloadKey('mix', mix.id),
      kind: 'mix',
      id: mix.id,
      title: mix.title,
      trackIds: mix.tracks.map((t) => t.id),
      coverArt: mix.tracks[0]?.coverArt
    })
  },
  remove(key: string): Promise<void> {
    return window.lyria.downloads.remove(key)
  }
}
