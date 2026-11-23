import Store from 'electron-store'
import { defaultSettings, type Settings, type SettingsPatch } from '@shared/types'
import { sanitizeAurora, sanitizeBackground } from '@shared/aurora'
import { clamp, sanitizeMini, sanitizeToast, sanitizeWidget } from './overlayOptions'

interface Schema {
  settings: Settings
  /** base64 of safeStorage-encrypted JSON session, or plain JSON when encryption is unavailable */
  credentials?: { encrypted: boolean; data: string }
}

export const store = new Store<Schema>({
  name: 'lyria',
  defaults: { settings: defaultSettings }
})

/**
 * The live settings, held in memory.
 *
 * Every read off `store` is a synchronous read of the whole config file and every write is a
 * synchronous rewrite of it, and the file carries the resume queue, so it is not small. The
 * callers are hot -- the cursor watch behind the overlays asks ten times a second per window,
 * and a volume drag writes on every mouse move -- so the file is read once and the disk is
 * written on a debounce behind it. Nothing outside this process touches the file: the
 * single-instance lock sees to that.
 */
let cached: Settings | undefined

function readSettings(): Settings {
  const saved = store.get('settings') ?? {}
  return sanitizeCaches({
    ...defaultSettings,
    ...saved,
    widgets: { ...defaultSettings.widgets, ...(saved.widgets ?? {}) },
    widget: sanitizeWidget(saved.widget),
    mini: sanitizeMini(saved.mini),
    toast: sanitizeToast(saved.toast),
    background: sanitizeBackground(saved.background),
    aurora: sanitizeAurora(saved.aurora),
    windowBounds: { ...(saved.windowBounds ?? {}) },
    // Entries written before the shelf stored an origin have no key and cannot be played.
    recents: (saved.recents ?? []).filter((r) => r?.key),
    savedMixes: (saved.savedMixes ?? []).filter((m) => m?.id && m.tracks?.length),
    hiddenPlaylists: (Array.isArray(saved.hiddenPlaylists) ? saved.hiddenPlaylists : []).filter((id) => typeof id === 'string')
  })
}

export function getSettings(): Settings {
  return (cached ??= readSettings())
}

/**
 * How long a change may sit in memory before it reaches the disk. Well under the ten-second
 * resume checkpoint, so a crash loses no more than it already would.
 */
const WRITE_DEBOUNCE_MS = 400

let writeTimer: NodeJS.Timeout | undefined

/** Write the settings out now. Called on the debounce, and on the way out so nothing is lost. */
export function flushSettings(): void {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = undefined
  }
  if (cached) store.set('settings', cached)
}

function scheduleWrite(): void {
  if (writeTimer) return
  writeTimer = setTimeout(() => {
    writeTimer = undefined
    if (cached) store.set('settings', cached)
  }, WRITE_DEBOUNCE_MS)
}

/** The cache sizes and bitrate can be typed in by hand, so keep them to numbers that make sense. */
function sanitizeCaches(s: Settings): Settings {
  return {
    ...s,
    cacheMaxGb: clamp(s.cacheMaxGb, 0, 4096, defaultSettings.cacheMaxGb),
    artCacheMaxMb: clamp(s.artCacheMaxMb, 0, 65536, defaultSettings.artCacheMaxMb),
    cacheCompressKbps: Math.round(clamp(s.cacheCompressKbps, 32, 512, defaultSettings.cacheCompressKbps))
  }
}

type Listener = (settings: Settings) => void
const listeners = new Set<Listener>()

export function onSettingsChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function updateSettings(patch: SettingsPatch): Settings {
  const before = getSettings()
  const next: Settings = sanitizeCaches({
    ...before,
    ...patch,
    widgets: { ...before.widgets, ...(patch.widgets ?? {}) },
    widget: sanitizeWidget({ ...before.widget, ...(patch.widget ?? {}) }),
    mini: sanitizeMini({ ...before.mini, ...(patch.mini ?? {}) }),
    toast: sanitizeToast({ ...before.toast, ...(patch.toast ?? {}) }),
    background: sanitizeBackground(patch.background ?? before.background),
    aurora: sanitizeAurora({ ...before.aurora, ...(patch.aurora ?? {}) }),
    windowBounds: { ...before.windowBounds, ...(patch.windowBounds ?? {}) }
  })
  cached = next
  scheduleWrite()
  for (const fn of listeners) fn(next)
  return next
}
