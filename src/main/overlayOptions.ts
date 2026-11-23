import {
  CARD_SIZES,
  CORNER_STYLES,
  OVERLAY_ANCHORS,
  OVERLAY_BACKGROUNDS,
  VISUALIZER_COLORS,
  VISUALIZER_STYLES,
  defaultMiniOptions,
  defaultToastOptions,
  defaultWidgetOptions,
  type MiniOptions,
  type OverlayAnchor,
  type OverlayChrome,
  type PlayerLook,
  type ToastOptions,
  type WidgetOptions,
  type WidgetPlacement
} from '@shared/types'

const ANCHOR_SET = new Set<unknown>(OVERLAY_ANCHORS.map((a) => a.value))
const BACKGROUND_SET = new Set<unknown>(OVERLAY_BACKGROUNDS.map((b) => b.value))

const isAnchor = (v: unknown): v is OverlayAnchor => ANCHOR_SET.has(v)

/** `v` when it is one of `options`, `fallback` otherwise. */
function oneOf<T>(options: { value: T }[], v: unknown, fallback: T): T {
  return options.some((o) => o.value === v) ? (v as T) : fallback
}

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

/** v0.6.0's widget had a visualiser switch where it now has a style; it drew bars. */
function sanitizeLook(s: { [K in keyof PlayerLook]?: unknown }, d: PlayerLook): PlayerLook {
  const legacy = typeof s.visualizer === 'boolean' ? (s.visualizer ? 'bars' : 'off') : undefined
  return {
    tint: bool(s.tint, d.tint),
    visualizer: oneOf(VISUALIZER_STYLES, legacy ?? s.visualizer, d.visualizer),
    visualizerColor: oneOf(VISUALIZER_COLORS, s.visualizerColor, d.visualizerColor),
    like: bool(s.like, d.like),
    shuffle: bool(s.shuffle, d.shuffle)
  }
}

/**
 * A widget block as any version stored it. v0.6.0 kept a bare `anchor` where `placement` is
 * now, a `compact` switch where `size` is, and `visualizer` was a boolean.
 */
export type StoredWidget = Omit<Partial<WidgetOptions>, 'visualizer'> & {
  anchor?: unknown
  compact?: unknown
  visualizer?: unknown
}

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
    ...sanitizeLook(s, d),
    placement: sanitizePlacement(s.placement, s.anchor),
    size: oneOf(CARD_SIZES, s.size, s.compact === true ? 'small' : d.size),
    corners: oneOf(CORNER_STYLES, s.corners, d.corners),
    progress: bool(s.progress, d.progress),
    cover: bool(s.cover, d.cover),
    elapsed: bool(s.elapsed, d.elapsed)
  }
}

export function sanitizeMini(saved: Partial<MiniOptions> | undefined): MiniOptions {
  const s = saved ?? {}
  return {
    ...sanitizeChrome(s, defaultMiniOptions),
    ...sanitizeLook(s, defaultMiniOptions),
    size: oneOf(CARD_SIZES, s.size, defaultMiniOptions.size)
  }
}

export function sanitizeToast(saved: Partial<ToastOptions> | undefined): ToastOptions {
  const o = { ...defaultToastOptions, ...(saved ?? {}) }
  return {
    anchor: isAnchor(o.anchor) ? o.anchor : defaultToastOptions.anchor,
    background: BACKGROUND_SET.has(o.background) ? o.background : defaultToastOptions.background,
    opacity: clamp(o.opacity, 0.35, 1, defaultToastOptions.opacity),
    tint: bool(o.tint, defaultToastOptions.tint)
  }
}
