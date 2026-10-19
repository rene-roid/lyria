/** WCAG relative luminance of an sRGB colour, 0..1. */
export function luminance([r, g, b]: number[]): number {
  const lin = (v: number): number => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

const BINS = 12

/**
 * A dark, saturated colour from an image's RGBA pixels, for page headers and the lyrics backdrop:
 * the browser stand-in for the Palette vibrant swatch navidroid uses. Colourful pixels are binned by
 * hue and the heaviest bin wins, so a red-and-blue cover comes out red or blue instead of their
 * muddy average. A grey cover falls back to its plain average. Darkened until white text reads on it.
 */
export function headerColor(px: ArrayLike<number>): [number, number, number] {
  const bins = Array.from({ length: BINS }, () => ({ r: 0, g: 0, b: 0, w: 0 }))
  const all = { r: 0, g: 0, b: 0, n: 0 }
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 128) continue
    const r = px[i], g = px[i + 1], b = px[i + 2]
    all.r += r
    all.g += g
    all.b += b
    all.n++
    const max = Math.max(r, g, b)
    const d = max - Math.min(r, g, b)
    const sat = max ? d / max : 0
    if (sat < 0.25 || max < 50) continue
    const hue = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    const bin = bins[Math.floor((hue / 6) * BINS) % BINS]
    const w = sat * (max / 255)
    bin.r += r * w
    bin.g += g * w
    bin.b += b * w
    bin.w += w
  }
  const top = bins.reduce((a, b) => (b.w > a.w ? b : a))
  let c =
    top.w > 0 ? [top.r / top.w, top.g / top.w, top.b / top.w] : all.n ? [all.r / all.n, all.g / all.n, all.b / all.n] : [64, 64, 64]
  while (luminance(c) > 0.22) c = c.map((v) => v * 0.85)
  return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]
}
