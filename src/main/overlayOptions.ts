import {
  OVERLAY_ANCHORS,
  OVERLAY_BACKGROUNDS,
  defaultMiniOptions,
  defaultToastOptions,
  defaultWidgetOptions,
  type MiniOptions,
  type OverlayAnchor,
  type OverlayChrome,
  type ToastOptions,
  type WidgetOptions,
  type WidgetPlacement
} from '@shared/types'

const ANCHOR_SET = new Set<unknown>(OVERLAY_ANCHORS.map((a) => a.value))
const BACKGROUND_SET = new Set<unknown>(OVERLAY_BACKGROUNDS.map((b) => b.value))

const isAnchor = (v: unknown): v is OverlayAnchor => ANCHOR_SET.has(v)

export const clamp = (n: number, lo: number, hi: number, fallback: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback

/**
 * The look shared by every overlay: fill in options added after the stored settings were
 * written, drop unknown enum values and clamp the opacities. Hover dimming may go far lower
 * than the resting floor; that is the whole point of it.
 */
function sanitizeChrome(saved: Partial<OverlayChrome>, defaults: OverlayChrome): OverlayChrome {
  const o = { ...defaults, ...saved }
  return {
    background: BACKGROUND_SET.has(o.background) ? o.background : defaults.background,
    opacity: clamp(o.opacity, 0.35, 1, defaults.opacity),
    fadeOnHover: typeof o.fadeOnHover === 'boolean' ? o.fadeOnHover : defaults.fadeOnHover,
    hoverOpacity: clamp(o.hoverOpacity, 0.05, 1, defaults.hoverOpacity),
    clickThrough: typeof o.clickThrough === 'boolean' ? o.clickThrough : defaults.clickThrough
  }
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

/** A widget block as any version stored it. v0.6.0 kept a bare `anchor` where `placement` is now. */
export type StoredWidget = Partial<WidgetOptions> & { anchor?: unknown }

function sanitizePlacement(p: unknown, legacyAnchor: unknown): WidgetPlacement {
  const v = (p ?? {}) as Record<string, unknown>
  if (v.kind === 'anchor' && isAnchor(v.anchor)) return { kind: 'anchor', anchor: v.anchor }
  if (v.kind === 'free' && Number.isFinite(v.x) && Number.isFinite(v.y)) {
    return { kind: 'free', x: Math.round(v.x as number), y: Math.round(v.y as number) }
  }
  return isAnchor(legacyAnchor) ? { kind: 'anchor', anchor: legacyAnchor } : defaultWidgetOptions.placement
}

export function sanitizeWidget(saved: StoredWidget | undefined): WidgetOptions {
  const s = saved ?? {}
  const d = defaultWidgetOptions
  return {
    ...sanitizeChrome(s, d),
    placement: sanitizePlacement(s.placement, s.anchor),
    compact: bool(s.compact, d.compact),
    visualizer: bool(s.visualizer, d.visualizer),
    progress: bool(s.progress, d.progress),
    cover: bool(s.cover, d.cover),
    elapsed: bool(s.elapsed, d.elapsed)
  }
}

export function sanitizeMini(saved: Partial<MiniOptions> | undefined): MiniOptions {
  return sanitizeChrome(saved ?? {}, defaultMiniOptions)
}

export function sanitizeToast(saved: Partial<ToastOptions> | undefined): ToastOptions {
  const o = { ...defaultToastOptions, ...(saved ?? {}) }
  return {
    anchor: isAnchor(o.anchor) ? o.anchor : defaultToastOptions.anchor,
    background: BACKGROUND_SET.has(o.background) ? o.background : defaultToastOptions.background,
    opacity: clamp(o.opacity, 0.35, 1, defaultToastOptions.opacity)
  }
}
