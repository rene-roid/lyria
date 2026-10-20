/**
 * What makes each genre and mood look like itself: a three-colour palette its artwork is printed
 * in and, for a mood, an emblem. Moods come from a small vocabulary, so each common one has
 * colours picked for what it means; genres are open-ended, so they go by family (every kind of
 * metal wears metal's colours) and one that fits no family gets a palette chosen from its name.
 *
 * The artwork is one of the tag's own covers, edited rather than shown as it is: for a genre,
 * tone-mapped into the palette as a full-bleed poster; for a mood, screened into halftone dots and
 * cut into a round orb that floats on the mood's colour. That is what lets fifty tiles share a grid
 * without any of them reading as an album, and keeps the two pages apart at a glance.
 */
import { useEffect, useReducer } from 'react'
import {
  Activity, AudioWaveform, Cloud, CloudMoon, CloudRain, Flame, Guitar, Heart, Hourglass, Moon, Mountain,
  PartyPopper, Smile, Sparkles, Sun, Sunrise, Trophy, Waves, Zap, type LucideIcon
} from 'lucide-react'
import { seedOf, type MixSeed } from './mixes'

/** The colours a cover's shadows, middle tones and highlights are mapped to. */
export type Palette = readonly [ink: string, mid: string, light: string]

export interface TagLook {
  palette: Palette
  icon?: LucideIcon
  /** How the cover is edited: a tone-mapped photograph, or a halftone orb on a transparent square. */
  print: 'tone' | 'dots'
}

type Rule = readonly [RegExp, Palette, LucideIcon?]

const MOODS: Rule[] = [
  [/energ|power|intens/, ['#1a0533', '#ff2e63', '#ffe66d'], Zap],
  [/playful|fun|quirk/, ['#14123a', '#ff6ec7', '#9dfcff'], Sparkles],
  [/uplift|hope|inspir/, ['#062a4a', '#3fa7ff', '#fff1a8'], Sunrise],
  [/happy|joy|cheer/, ['#3d1500', '#ffb703', '#fffbe0'], Sun],
  [/melanchol|bittersweet|wistful/, ['#0d1426', '#5b6c9e', '#d9e2f2'], CloudMoon],
  [/aggress|angry|rage|fierce/, ['#0a0000', '#d7141f', '#ff8a3d'], Flame],
  [/sad|grief|lonel|sorrow/, ['#050d24', '#2756b8', '#a9c9ff'], CloudRain],
  [/dark|sinister|gloom|ominous/, ['#000000', '#4a2470', '#c4a1ff'], Moon],
  [/romant|love|sensual|tender/, ['#2a0614', '#e0245e', '#ffc2d6'], Heart],
  [/epic|heroic|triumph|majestic/, ['#0b0b1a', '#a37b1f', '#ffe7a3'], Mountain],
  [/nostalg|retro|memor/, ['#2b1a12', '#c2703d', '#f6dcb8'], Hourglass],
  [/relax|calm|chill|peace|mellow|soothing/, ['#03262b', '#1fa59a', '#d4fff0'], Waves],
  [/tens|anx|suspens|thrill|nervous/, ['#0a0f0a', '#6b8f1a', '#e6ff4d'], Activity],
  [/dream|ethereal|floaty/, ['#1a1240', '#8e7dff', '#ffd1f5'], Cloud],
  [/party|club|celebrat/, ['#1a0040', '#ff00a8', '#00f0ff'], PartyPopper],
  [/sport|workout|gym|run/, ['#001a33', '#00b4ff', '#d9ff3d'], Trophy],
  [/electr|synth|digital/, ['#00121f', '#00c2ff', '#e0fbff'], AudioWaveform],
  [/acoustic|organic|unplugged/, ['#2a1a0a', '#b5803b', '#f5e6c8'], Guitar]
]

// First match wins, so the narrower families sit above the broad ones they would otherwise fall
// into: kawaii metal is kawaii before it is metal, lo-fi hip hop is lo-fi, pop rap is rap.
const GENRES: Rule[] = [
  [/kawaii/, ['#2a0a22', '#ff6ab8', '#fff0fa']],
  [/nightcore|hypercore|speed ?up/, ['#140a33', '#ff4fd8', '#a8f0ff']],
  [/vocaloid|synthv|utaite|utau/, ['#00201f', '#2fb5ab', '#e8fffd']],
  [/lo-?fi|chillhop/, ['#1f1726', '#c38d9e', '#ffe8d6']],
  [/k-?pop|girl group|boy band|mandopop|c-?pop/, ['#0a0a2a', '#9b5cff', '#ffc4f0']],
  [/j-?pop|j-?rock|anime|japan|vtuber|doujin|hogaku|touhou|yakousei|city pop/, ['#0b1440', '#4f7dff', '#ffd6f0']],
  [/chiptune|8-?bit|fakebit|bitpop/, ['#000c1a', '#00a3ff', '#ffe600']],
  [/game|vgm|gacha|mihoyo|pizza tower/, ['#0b0d2e', '#7b3cff', '#4dffb8']],
  [/soundtrack|score|film|cinema|stage|screen|bandes|original work|trailer/, ['#06080f', '#2f4f7a', '#f2d08a']],
  [/eurobeat|italo/, ['#1a0033', '#ff0055', '#ffd000']],
  [/synthwave|retrowave|outrun|future funk|vaporwave/, ['#14002e', '#ff2e97', '#ffb347']],
  [/phonk/, ['#0d0014', '#7a00cc', '#ff4dff']],
  [/metal|djent|doom|grind|thrash/, ['#050505', '#8a0f0f', '#ececec']],
  [/rock|punk|grunge|emo/, ['#120d08', '#e85d04', '#ffeedd']],
  [/hip.?hop|rap|trap|drill|grime/, ['#120a00', '#d4a017', '#fff4cc']],
  [/house|disco|funk|garage/, ['#2a0033', '#ff7f00', '#ffef5c']],
  [/techno|trance|ebm|industrial|hardstyle|hands up|hardcore|gabber/, ['#000a0a', '#00a37a', '#b6ffe4']],
  [/step|drum|dnb|jungle|break|bass|glitch|complextro|idm/, ['#0a001a', '#5d2bff', '#c3ff00']],
  [/hyperpop|experimental|digicore/, ['#000000', '#00e08f', '#ff6af0']],
  [/electr|edm|dance|synth/, ['#000d1f', '#0077ff', '#3dfcff']],
  [/pop/, ['#2a0a3d', '#ff3d9a', '#ffd9ec']],
  [/r&b|rhythm and blues|soul|rnb/, ['#1a0a1f', '#b0306a', '#ffd0e0']],
  [/jazz|swing|big band|blues|ballad/, ['#0d0a05', '#b8860b', '#f2e3c6']],
  [/classical|baroque|orchestr|symphon|piano|opera|chamber/, ['#141008', '#8c6b3a', '#f7efe0']],
  [/ambient|drone|new age|meditat/, ['#061a1f', '#3e8e9e', '#e3f6f5']],
  [/folk|country|acoustic|singer/, ['#1f1408', '#8b5a2b', '#f0dcb4']],
  [/child|kids|comedy/, ['#0f2a4a', '#ffcf3d', '#fff7e0']]
]

/** For a tag no rule knows, picked by name so it is the same tag in the same colours every time. */
const SPARE: Palette[] = [
  ['#1b0b2e', '#7d3cff', '#ffd3a8'],
  ['#00202a', '#00a6a6', '#fff4b8'],
  ['#2b0010', '#ff4d6d', '#ffe5ec'],
  ['#0c1a00', '#5fa800', '#efffc2'],
  ['#1a0f00', '#ff8c00', '#fff1d6'],
  ['#000f2e', '#1f6fff', '#ffe0f0'],
  ['#22002e', '#c41dff', '#d6fff6'],
  ['#2e1600', '#c98a2b', '#e9f2ff'],
  ['#001f17', '#00c27a', '#ffe8f4'],
  ['#2a0a00', '#e63e00', '#ffd9b3']
]

const hex = (c: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number]

/** `c` with its hue turned by `deg`; saturation and lightness stay, so the palette keeps its shape. */
function turned(c: string, deg: number): string {
  const [r, g, b] = hex(c).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (!d || !deg) return c
  const l = max - d / 2
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = ((max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + deg + 360) % 360
  const f = (n: number): number => {
    const k = (n + h / 30) % 12
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`
}

/** "Électronique" is electronic: rules are written in plain lowercase ASCII. */
const plain = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function tagLook(seed: MixSeed): TagLook {
  const name = plain(seed.value)
  const h = seedOf(name)
  if (seed.kind === 'mood') {
    const hit = MOODS.find(([re]) => re.test(name))
    return { palette: hit?.[1] ?? SPARE[h % SPARE.length], icon: hit?.[2] ?? Smile, print: 'dots' }
  }
  const hit = GENRES.find(([re]) => re.test(name))
  // A family's genres turn its colours a little each, so Electronic, Dance and EDM side by side
  // read as relatives rather than as one tile three times. Moods keep theirs: those mean something.
  if (!hit) return { palette: SPARE[h % SPARE.length], print: 'tone' }
  const turn = (((h >>> 4) % 9) - 4) * 10
  const [ink, mid, light] = hit[1]
  return { palette: [turned(ink, turn), turned(mid, turn), turned(light, turn)], print: 'tone' }
}

/** The tag's colour on its own: the band behind its page's header, and its swatch in a list. */
export const lookColor = ({ palette: [ink, mid] }: TagLook): string => `color-mix(in srgb, ${mid} 70%, ${ink})`

// ---- the poster ------------------------------------------------------------

/** Square, and big enough for the page header at 2x; tiles crop it to their own shape. */
const SIZE = 480
/** Halftone cell, in poster pixels: about 3.5 on screen, fine enough to read as print, not pixels. */
const DOT = 8


/** 256 colours running ink → mid → light, to look a tone up in. */
function ramp([ink, mid, light]: Palette): Uint8ClampedArray {
  const stops = [hex(ink), hex(mid), hex(light)]
  const lut = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * 2
    const [a, b] = t < 1 ? [stops[0], stops[1]] : [stops[1], stops[2]]
    const f = t < 1 ? t : t - 1
    for (let k = 0; k < 3; k++) lut[i * 3 + k] = a[k] + (b[k] - a[k]) * f
  }
  return lut
}

/**
 * Each pixel's brightness, stretched so the cover's own darkest and lightest few percent become
 * black and white, then pushed apart on an S-curve: the print reads as contrasty, never as murk,
 * whatever the cover started out as. A third of the original brightness stays in, so a pale cover
 * still prints pale and a dark one dark rather than every cover coming out at the same key.
 */
export function tones(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const n = rgba.length / 4
  const lum = new Uint8ClampedArray(n)
  const hist = new Uint32Array(256)
  for (let i = 0; i < n; i++) {
    const l = 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]
    lum[i] = l
    hist[lum[i]]++
  }
  const at = (q: number): number => {
    let seen = 0
    for (let v = 0; v < 256; v++) if ((seen += hist[v]) >= n * q) return v
    return 255
  }
  let lo = at(0.02)
  let hi = at(0.98)
  // A near-flat cover (one colour, a logo on white) would blow up into noise if stretched to full range.
  if (hi - lo < 48) [lo, hi] = [Math.max(0, (lo + hi) / 2 - 24), Math.min(255, (lo + hi) / 2 + 24)]
  for (let i = 0; i < n; i++) {
    const t = 0.65 * Math.min(1, Math.max(0, (lum[i] - lo) / (hi - lo))) + 0.35 * (lum[i] / 255)
    lum[i] = 255 * t * t * (3 - 2 * t)
  }
  return lum
}

async function render(url: string, look: TagLook, seed: string): Promise<string | undefined> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return undefined
  // A crop of its own per tag, so two tags that land on one cover still make two pictures.
  const h = seedOf(seed)
  // Less for a halftone, whose screen already enlarges what is in it.
  const zoom = (look.print === 'tone' ? 1.15 : 1.02) + (h % 25) / (look.print === 'tone' ? 100 : 250)
  const w = img.naturalWidth / zoom
  const ht = img.naturalHeight / zoom
  const fx = ((h >>> 8) % 100) / 100
  const fy = ((h >>> 16) % 100) / 100
  ctx.drawImage(img, (img.naturalWidth - w) * fx, (img.naturalHeight - ht) * fy, w, ht, 0, 0, SIZE, SIZE)
  const frame = ctx.getImageData(0, 0, SIZE, SIZE)
  const tone = tones(frame.data)
  const lut = ramp(look.palette)
  let noise = h
  for (let i = 0; i < tone.length; i++) {
    // Film grain: enough to make the flat palette read as a print, not a gradient.
    noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0
    const g = ((noise >>> 24) - 128) / 10
    for (let k = 0; k < 3; k++) frame.data[i * 4 + k] = lut[tone[i] * 3 + k] + g
  }
  ctx.putImageData(frame, 0, 0)
  if (look.print === 'dots') {
    // Halftone on a 45° screen: light parts of the cover become big bright dots, dark parts small
    // dim ones, over a ghost of the toned picture sunk into the palette's ink, all inside a disc.
    const disc = (): void => {
      ctx.beginPath()
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2)
    }
    ctx.save()
    disc()
    ctx.clip()
    ctx.globalAlpha = 0.72
    ctx.fillStyle = look.palette[0]
    ctx.fillRect(0, 0, SIZE, SIZE)
    ctx.globalAlpha = 1
    const c = Math.SQRT1_2
    for (let u = -SIZE; u < SIZE * 2; u += DOT) {
      for (let v = -SIZE; v < SIZE * 2; v += DOT) {
        const x = (u - v) * c + SIZE / 2
        const y = (u + v) * c - SIZE / 2
        if (x < -DOT || y < -DOT || x > SIZE + DOT || y > SIZE + DOT) continue
        const px = Math.min(SIZE - 1, Math.max(0, Math.round(x)))
        const py = Math.min(SIZE - 1, Math.max(0, Math.round(y)))
        const t = tone[py * SIZE + px]
        const r = DOT * 0.72 * Math.sqrt(t / 255)
        if (r < 0.6) continue
        ctx.fillStyle = `rgb(${lut[t * 3]} ${lut[t * 3 + 1]} ${lut[t * 3 + 2]})`
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // Lit from the top left and falling off into shadow, so the disc reads as a sphere.
    const shade = ctx.createRadialGradient(SIZE * 0.3, SIZE * 0.26, SIZE * 0.04, SIZE * 0.5, SIZE * 0.5, SIZE * 0.6)
    shade.addColorStop(0, 'rgba(255,255,255,0.2)')
    shade.addColorStop(0.55, 'rgba(0,0,0,0)')
    shade.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = shade
    ctx.fillRect(0, 0, SIZE, SIZE)
    ctx.restore()
    // And nothing of the square outside it.
    ctx.globalCompositeOperation = 'destination-in'
    disc()
    ctx.fill()
  }
  // The orb needs its transparent corners; a poster is a photograph and compresses like one.
  const type = look.print === 'dots' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.9))
  return blob ? URL.createObjectURL(blob) : undefined
}

/** Posters by source and look, as object URLs kept for the session; and the renders in flight. */
const done = new Map<string, string>()
const pending = new Map<string, Promise<string | undefined>>()

/**
 * The cover at `url` edited into the tag's look. Undefined until it is drawn, and for good if the
 * cover cannot be read: the tile underneath is already in the palette's colours, so that still
 * looks deliberate.
 */
export function usePoster(url: string | undefined, look: TagLook, seed: string): string | undefined {
  const key = url && `${url}|${look.print}|${look.palette.join()}|${seed}`
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!key || !url || done.has(key)) return
    let live = true
    let job = pending.get(key)
    if (!job) {
      job = render(url, look, seed).catch(() => undefined)
      pending.set(key, job)
    }
    void job.then((src) => {
      pending.delete(key)
      if (src) done.set(key, src)
      if (live) redraw()
    })
    return () => {
      live = false
    }
    // `look` is a function of `seed`'s tag, which `key` already spells out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return key ? done.get(key) : undefined
}
