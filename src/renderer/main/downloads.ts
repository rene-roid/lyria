/**
 * Playlists and saved mixes kept for listening offline. Main owns the files and the list; this
 * mirrors the list, with each one's progress, for the buttons and the settings panel.
 */
import { create } from 'zustand'
import { downloadKey, type DownloadStatus, type SavedMix, type Track } from '@shared/types'
import type { Playlist } from '@shared/subsonic/types'

const useStore = create<{ list: DownloadStatus[] }>(() => ({ list: [] }))

let listening = false

function listen(): void {
  if (listening) return
  listening = true
  window.sonora.downloads.onChange((list) => useStore.setState({ list }))
  void window.sonora.downloads.list().then((list) => useStore.setState({ list }))
}

export function useDownloads(): DownloadStatus[] {
  listen()
  return useStore((s) => s.list)
}

export function useDownload(key: string): DownloadStatus | undefined {
  listen()
  return useStore((s) => s.list.find((d) => d.key === key))
}

export const downloads = {
  playlist(pl: Playlist & { entry: Track[] }): Promise<void> {
    return window.sonora.downloads.add({
      key: downloadKey('playlist', pl.id),
      kind: 'playlist',
      id: pl.id,
      title: pl.name,
      trackIds: pl.entry.map((t) => t.id),
      coverArt: pl.coverArt ?? pl.entry[0]?.coverArt
    })
  },
  mix(mix: SavedMix): Promise<void> {
    return window.sonora.downloads.add({
      key: downloadKey('mix', mix.id),
      kind: 'mix',
      id: mix.id,
      title: mix.title,
      trackIds: mix.tracks.map((t) => t.id),
      coverArt: mix.tracks[0]?.coverArt
    })
  },
  remove(key: string): Promise<void> {
    return window.sonora.downloads.remove(key)
  }
}
