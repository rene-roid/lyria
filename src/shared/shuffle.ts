/**
 * Seeded dealing of song lists: the same seed deals the same order, so a mix or a radio holds still
 * for its day with nothing stored. Kept apart from the mixes, which read the renderer's cache, so the
 * audio host's radios can deal the same way.
 */
import type { Track } from './types'

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

/** Drop repeats and cap how much of the list any one artist may take, up to `limit` songs. */
export function spread(tracks: Track[], limit: number, perArtist: number): Track[] {
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
 * One of `lead` every `step` songs, while it lasts; by default spaced to last the whole list.
 */
export function interleave(
  lead: Track[],
  rest: Track[],
  limit: number,
  step = Math.max(2, Math.floor(limit / lead.length))
): Track[] {
  if (!lead.length || !rest.length) return [...lead, ...rest].slice(0, limit)
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
export function tally(values: (string | undefined)[]): string[] {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([value]) => value)
}

export const sameArtist = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()
