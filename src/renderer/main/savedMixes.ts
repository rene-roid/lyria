/**
 * Mixes the user kept. A mix is rebuilt from the server every day, so saving one freezes the
 * lineup it had at that moment; they live in the settings file, which is what makes them show up
 * on the next launch even with the server unreachable.
 */
import { downloadKey, saveMix, viewKey, type RecentItem, type SavedMix, type Track } from '@shared/types'
import { useSessionStore } from '@renderer/shared/sessionStore'
import type { MixSeed } from './mixes'

/** Seed plus the day, so saving the same mix twice in a day replaces it instead of piling up. */
export const savedMixId = (seed: MixSeed): string =>
  `${seed.kind}:${seed.value.toLowerCase()}:${new Date().toISOString().slice(0, 10)}`

const list = (): SavedMix[] => useSessionStore.getState().settings.savedMixes

export function useSavedMixes(): SavedMix[] {
  return useSessionStore((s) => s.settings.savedMixes)
}

export const findSavedMix = (id: string): SavedMix | undefined => list().find((m) => m.id === id)

export const savedMixes = {
  save(seed: MixSeed, title: string, tracks: Track[]): SavedMix {
    const mix: SavedMix = { id: savedMixId(seed), title, seed, savedAt: Date.now(), tracks }
    void window.lyria.settings.update({ savedMixes: saveMix(list(), mix) })
    return mix
  },
  /** Also drops its download: a mix no longer kept has nothing to play its songs from. */
  remove(id: string): void {
    void window.lyria.settings.update({ savedMixes: list().filter((m) => m.id !== id) })
    void window.lyria.downloads.remove(downloadKey('mix', id))
  }
}

/** A saved mix on Home's shelf. Its cover comes off the first song, since the seed is not in the view. */
export function savedMixRecent(mix: SavedMix): RecentItem {
  const view = { name: 'savedMix', id: mix.id } as const
  return {
    key: viewKey(view),
    view,
    title: mix.title,
    subtitle: 'Saved mix',
    coverArt: mix.tracks[0]?.coverArt
  }
}
