/**
 * Cache of server responses, so a view paints instantly and the network call only has to
 * refresh it.
 *
 * Main keeps the entries on disk (main/metaCache). The main window pulls the whole set in once,
 * before its first render, so reads stay synchronous; writes are mirrored back to main. A window
 * that never hydrates reads nothing and writes nothing, so it cannot wipe or clobber the cache.
 */

/** Where entries lived before they moved to disk; carried over once, then removed. */
const LEGACY_PREFIX = 'sonora.cache.'
const LEGACY_SCOPE_KEY = 'sonora.cacheScope'

const entries = new Map<string, string>()
let hydrated = false
let scope = ''

const clearListeners = new Set<() => void>()

/** Told when the cache is wiped, so in-memory mirrors of cached data drop what they are holding. */
export function onCacheClear(fn: () => void): void {
  clearListeners.add(fn)
}

function dropAll(): void {
  entries.clear()
  for (const fn of clearListeners) fn()
}

/** Load what main has on disk. Must finish before the first cacheRead the window cares about. */
export async function hydrateCache(): Promise<void> {
  try {
    const saved = await window.sonora.meta.load()
    scope = saved.scope
    for (const [k, v] of saved.entries) entries.set(k, v)
  } catch {
    // start cold; views fill it as they load
  }
  hydrated = true
  adoptLegacy()
}

/** Bring over what an older build left in localStorage, so the first launch after it stays warm. */
function adoptLegacy(): void {
  const legacy: [string, string][] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(LEGACY_PREFIX)) legacy.push([k.slice(LEGACY_PREFIX.length), localStorage.getItem(k) ?? ''])
  }
  const legacyScope = localStorage.getItem(LEGACY_SCOPE_KEY)
  if (entries.size === 0 && legacyScope !== null) {
    scope = legacyScope
    window.sonora.meta.setScope(scope)
    for (const [k, v] of legacy) {
      entries.set(k, v)
      window.sonora.meta.put(k, v)
    }
  }
  for (const [k] of legacy) localStorage.removeItem(LEGACY_PREFIX + k)
  localStorage.removeItem(LEGACY_SCOPE_KEY)
}

/** Wipe everything when the logged-in server/user changes, so one account never sees another's library. */
export function setCacheScope(next: string): void {
  if (!hydrated || next === scope) return
  scope = next
  dropAll()
  window.sonora.meta.setScope(next)
}

/** Empty it on disk too, from the settings panel. */
export async function clearCache(): Promise<void> {
  dropAll()
  await window.sonora.meta.clear()
}

export function cacheRead<T>(key: string | undefined): T | undefined {
  if (!key) return undefined
  try {
    const raw = entries.get(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

export function cacheWrite(key: string | undefined, value: unknown): void {
  if (!key || !hydrated) return
  let raw: string | undefined
  try {
    raw = JSON.stringify(value)
  } catch {
    return
  }
  // Most refreshes bring back exactly what was cached; no point shipping a big list to main again.
  if (raw === undefined || entries.get(key) === raw) return
  entries.set(key, raw)
  window.sonora.meta.put(key, raw)
}
