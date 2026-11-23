/**
 * The aurora backdrop navidroid draws behind its pages, as settings and pure colour picking. The
 * drawing itself is `renderer/main/Aurora.tsx`.
 */

/** What fills the main window's page panel behind its content. */
export type BackgroundKind = 'none' | 'aurora'

export const BACKGROUNDS: { value: BackgroundKind; label: string }[] = [
  { value: 'none', label: 'Plain' },
  { value: 'aurora', label: 'Aurora' }
]

/** One colour per curtain edge: the three curtains run c0 to c1, c1 to c2 and c2 to c3 from rim to tip. */
export type AuroraColors = [string, string, string, string]

export type AuroraPreset = 'classic' | 'ocean' | 'sunset' | 'forest' | 'ember'

/** `cover` follows the playing song's cover art, and shows `classic` while no cover has colour to give. */
export type AuroraPalette = 'cover' | AuroraPreset | 'custom'

/** navidroid's ready-made palettes, colour for colour. */
export const AURORA_PRESETS: { value: AuroraPreset; label: string; colors: AuroraColors }[] = [
  { value: 'classic', label: 'Classic', colors: ['#2ee6c5', '#48b4ff', '#8e6cff', '#ff6fc1'] },
  { value: 'ocean', label: 'Ocean', colors: ['#00e5ff', '#2979ff', '#00b8d4', '#64ffda'] },
  { value: 'sunset', label: 'Sunset', colors: ['#ffb86b', '#ff6f91', '#c86bfa', '#7a5cff'] },
  { value: 'forest', label: 'Forest', colors: ['#4aff9e', '#2ee6c5', '#b8ff5c', '#3ddc97'] },
  { value: 'ember', label: 'Ember', colors: ['#ff5e3a', '#ff9f1c', '#ff3d7f', '#ffd166'] }
]

const CLASSIC = AURORA_PRESETS[0].colors

export interface AuroraOptions {
  palette: AuroraPalette
  /** The `custom` palette. Kept while another one is picked, so going back to it finds it as it was. */
  custom: AuroraColors
  /** How bright the curtains glow, 1 as designed. */
  intensity: number
  /** Taller curtains when it is loud, a flash along the rim on the beat. */
  reactive: boolean
}

export const AURORA_INTENSITY = { min: 0.4, max: 1.8 }

export const defaultAuroraOptions: AuroraOptions = {
  palette: 'cover',
  custom: [...CLASSIC],
  intensity: 1,
  reactive: true
}

const KINDS = new Set<string>(BACKGROUNDS.map((b) => b.value))
const PALETTES = new Set<string>(['cover', 'custom', ...AURORA_PRESETS.map((p) => p.value)])
const HEX = /^#[0-9a-f]{6}$/i

export function sanitizeBackground(saved: unknown): BackgroundKind {
  return typeof saved === 'string' && KINDS.has(saved) ? (saved as BackgroundKind) : 'none'
}

/** Fill in what an older config lacks and drop what a hand edit broke, one field at a time. */
export function sanitizeAurora(saved: Partial<AuroraOptions> | undefined): AuroraOptions {
  const o = { ...defaultAuroraOptions, ...(saved ?? {}) }
  const custom = Array.isArray(o.custom) ? o.custom : []
  return {
    palette: PALETTES.has(o.palette) ? o.palette : defaultAuroraOptions.palette,
    custom: CLASSIC.map((fallback, i) =>
      typeof custom[i] === 'string' && HEX.test(custom[i]) ? custom[i].toLowerCase() : fallback
    ) as AuroraColors,
    intensity: Number.isFinite(o.intensity)
      ? Math.min(AURORA_INTENSITY.max, Math.max(AURORA_INTENSITY.min, o.intensity))
      : defaultAuroraOptions.intensity,
    reactive: typeof o.reactive === 'boolean' ? o.reactive : defaultAuroraOptions.reactive
  }
}

/** The colours to draw with, given the colours picked off the playing cover (null when there are none). */
export function auroraColors(o: Pick<AuroraOptions, 'palette' | 'custom'>, cover: AuroraColors | null): AuroraColors {
  if (o.palette === 'custom') return o.custom
  if (o.palette === 'cover') return cover ?? CLASSIC
  return AURORA_PRESETS.find((p) => p.value === o.palette)?.colors ?? CLASSIC
}

type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = (c: Rgb): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/** Hue in degrees, saturation and value 0..1. */
function hsv([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  const h = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, max ? d / max : 0, max / 255]
}

function fromHsv(h: number, s: number, v: number): Rgb {
  const f = (n: number): number => {
    const k = (n + h / 60) % 6
    return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))
  }
  return [f(5), f(3), f(1)]
}

/** The colour as light: full brightness, saturated, hue turned by `turn` degrees. */
function glow(c: Rgb, turn = 0): string {
  const [h, s] = hsv(c)
  return toHex(fromHsv((h + turn + 360) % 360, Math.max(s, 0.55), 1))
}

const hueGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

const BINS = 12

/**
 * Up to four clearly different colours from a cover's RGBA pixels, topped up with neighbours of the
 * first, as navidroid does with Android's Palette swatches. Colourful pixels are binned by hue and the
 * heaviest bins are taken in turn, skipping any within 25 degrees of one already picked. A cover with
 * no colour to speak of gives null, and the palette's fallback shows instead.
 */
export function coverAurora(px: ArrayLike<number>): AuroraColors | null {
  const bins = Array.from({ length: BINS }, () => ({ r: 0, g: 0, b: 0, w: 0 }))
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 128) continue
    const c: Rgb = [px[i], px[i + 1], px[i + 2]]
    const [h, s, v] = hsv(c)
    if (s < 0.2 || v < 0.2) continue
    const bin = bins[Math.floor((h / 360) * BINS) % BINS]
    const w = s * v
    bin.r += c[0] * w
    bin.g += c[1] * w
    bin.b += c[2] * w
    bin.w += w
  }
  const heaviest = Math.max(...bins.map((b) => b.w))
  if (!heaviest) return null
  const picks: Rgb[] = []
  // A bin needs a fair share of the top one's weight, so a few stray pixels do not become a curtain.
  for (const b of bins.filter((b) => b.w >= heaviest / 8).sort((a, b) => b.w - a.w)) {
    const c: Rgb = [b.r / b.w, b.g / b.w, b.b / b.w]
    if (picks.every((p) => hueGap(hsv(p)[0], hsv(c)[0]) >= 25)) picks.push(c)
  }
  const spread = [30, 70, 110].map((turn) => glow(picks[0], turn))
  return [...picks.slice(0, 4).map((c) => glow(c)), ...spread].slice(0, 4) as AuroraColors
}

/**
 * The night behind the curtains: a dark shade of their first colour, so the two never clash, or
 * navidroid's deep blue for the classic palette.
 */
export function skyColor(colors: AuroraColors): string {
  if (colors.every((c, i) => c === CLASSIC[i])) return '#0c1030'
  return toHex(fromHsv(hsv(hexToRgb(colors[0]))[0], 0.6, 0.2))
}
