/**
 * Whether the library can be reached, and what plays without it. Main does the checking (see
 * main/connection); this mirrors its answer for the main window, which shows what is on this
 * device while the server is away instead of a wall of errors.
 */
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { Track } from '@shared/types'
import { cacheRead } from '@renderer/shared/cache'

/** Null until main's first check answers, which counts as reachable: nothing goes offline on a guess. */
const useStore = create<{ online: boolean | null }>(() => ({ online: null }))

let listening = false

function listen(): void {
  if (listening) return
  listening = true
  const { connection } = window.lyria
  connection.onChange((online) => useStore.setState({ online }))
  // Only fills the blank: a change that came in while this was out is newer than its answer.
  void connection.get().then((online) => useStore.setState((s) => (s.online === null ? { online } : s)))
  // The system saw the network come or go: ask now rather than at main's next round.
  const check = (): void => void connection.check()
  window.addEventListener('online', check)
  window.addEventListener('offline', check)
}

/** True when the server answered, false when it did not, null before the first check. */
export function useConnection(): boolean | null {
  listen()
  return useStore((s) => s.online)
}

export function useOffline(): boolean {
  listen()
  return useStore((s) => s.online === false)
}

export function isOffline(): boolean {
  listen()
  return useStore.getState().online === false
}

/**
 * A request could not reach the server at all (fetch rejects with a TypeError for that, unlike a
 * server that answered with an error). Believed reachable, have main look now rather than at its
 * next round, so the window goes offline as soon as a page finds out.
 */
export function reportFailure(err: unknown): void {
  if (err instanceof TypeError && !isOffline()) void window.lyria.connection.check()
}

/**
 * `load`'s answer, or the copy a page cached under `key` when the server cannot give one. For the
 * play buttons on cards and tiles, which fetch their songs on the click rather than through a page:
 * offline, one for a page already seen still finds its songs and plays those on this device.
 */
export async function cachedOr<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (isOffline()) {
    const copy = cacheRead<T>(key)
    if (copy !== undefined) return copy
  }
  try {
    return await load()
  } catch (err) {
    const copy = cacheRead<T>(key)
    if (copy === undefined) throw err
    return copy
  }
}

/**
 * Offline, the ids among `tracks` that have a downloaded or cached copy; null while the server
 * answers, when every song plays. Also null for the moment the answer is on its way.
 */
export function useOnDevice(tracks: Track[] | undefined): Set<string> | null {
  const offline = useOffline()
  const [found, setFound] = useState<{ tracks: Track[]; ids: Set<string> }>()
  useEffect(() => {
    if (!offline || !tracks?.length) return
    let live = true
    void window.lyria.cache.available(tracks.map((t) => t.id)).then((ids) => {
      if (live) setFound({ tracks, ids: new Set(ids) })
    })
    return () => {
      live = false
    }
  }, [offline, tracks])
  return offline && found && found.tracks === tracks ? found.ids : null
}

/** Offline with none of `tracks` on this device, so a page's play buttons have nothing to play. */
export function useNoneOnDevice(tracks: Track[] | undefined): boolean {
  const local = useOnDevice(tracks)
  return local !== null && local.size === 0
}
