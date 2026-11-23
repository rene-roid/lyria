/**
 * Playlists the server's mix plugins write: NaviBeat's (tagged with an `nb1:` comment) and Explo's.
 * Parsed the way the server's Spotify-style web UI and navidroid parse them, so Lyria shows the
 * same titles, colours and sections. A port of navidroid's Mixes.kt; keep the two in step.
 */
import type { Playlist } from './subsonic/types'

export type MixSection = 'madeForYou' | 'topMixes' | 'timeOfDay' | 'favorites'

export interface ServerMix {
  kind: string
  slot: string
  n: number
  title: string
  /** The artist (daily mix, artist radio) or genre (genre radio) a mix is built around. */
  subject?: string
  description: string
  /** Who made it: NaviBeat, or the service Explo got its recommendations from. */
  by: string
  color: string
  /** Drawn as a photo under a band of `color`; otherwise as a gradient over a grey copy of the cover. */
  photo: boolean
  section: MixSection
}

/** Home's mix shelves, in the web UI's wording and order. */
export const MIX_SECTIONS: { key: MixSection; title: string }[] = [
  { key: 'madeForYou', title: 'Made For You' },
  { key: 'topMixes', title: 'Your top mixes' },
  { key: 'timeOfDay', title: 'Mixes for your day' },
  { key: 'favorites', title: 'Your favorites, through the years' }
]

export const PALETTE = ['#e8115b', '#148a08', '#509bf5', '#ba5d07', '#8d67ab', '#1e3264', '#e1118c', '#27856a']

const mod = (a: number, n: number): number => ((a % n) + n) % n

/** The web UI's string hash, kept identical so every mix gets the colour it has on the web. */
export function paletteColor(s = ''): string {
  let h = 7
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 4294967296
  return PALETTE[h % PALETTE.length]
}

const NB = /(^|\n)nb1:([^:\n]+):([^:\n]+)/
const EXPLO = /^(Created for .+ by Explo|Built .+ by explo-maintainer)/
const EXPLO_ORDER = ['weekly-exploration', 'daily-jams', 'weekly-jams', 'on-repeat']
const EXPLO_COLORS: Record<string, string> = {
  'weekly-exploration': '#1e8a6e',
  'daily-jams': '#f59b23',
  'weekly-jams': '#af2896',
  'on-repeat': '#e91429'
}
const KIND_ORDER = [
  'dailymix', 'discovery', 'explo', 'newmusic', 'onrepeat', 'rediscover', 'artistradio', 'genreradio',
  'timeofday', 'essentials', 'loved', 'wrapped', 'decade'
]
const KIND_COLORS: Record<string, string> = {
  discovery: '#7358ff',
  newmusic: '#0d73ec',
  onrepeat: '#ff4632',
  rediscover: '#ba5d07',
  essentials: '#1e3264',
  loved: '#450af5',
  wrapped: '#f037a5'
}
const DAYPART_COLORS: Record<string, string> = {
  morning: '#f59b23',
  afternoon: '#e8115b',
  evening: '#7358ff',
  night: '#1e3264'
}
const DAYPARTS = ['morning', 'afternoon', 'evening', 'night']

export function daypart(hour: number): string {
  if (hour >= 5 && hour <= 11) return 'morning'
  if (hour >= 12 && hour <= 16) return 'afternoon'
  if (hour >= 17 && hour <= 21) return 'evening'
  return 'night'
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** The mix a playlist is, or null for one the user made (or Explo merely imported). */
export function parseMix(name: string, comment = ''): ServerMix | null {
  if (EXPLO.test(comment)) {
    const slot = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const source = /using (.+?) recommendations/.exec(comment)?.[1]
    const n = EXPLO_ORDER.indexOf(slot)
    return {
      kind: 'explo',
      slot,
      n: n >= 0 ? n : EXPLO_ORDER.length,
      title: name.replace(/-/g, ' '),
      description: source
        ? `From your ${source} recommendations`
        : comment.includes('from your play history')
          ? 'Built from your play history'
          : 'Recommended for you',
      by: source ?? 'Explo',
      color: EXPLO_COLORS[slot] ?? paletteColor(slot),
      photo: false,
      section: 'madeForYou'
    }
  }
  const m = NB.exec(comment)
  if (!m) return null
  const kind = m[2]
  const slot = m[3]
  const first = comment.split('\n')[0].replace(/^NaviBeat Mixes:/, '').trim()
  const n = Number(/(\d+)$/.exec(slot)?.[1] ?? 0)
  let title = name.replace(/^[^\p{L}\p{N}]+/u, '').trim()
  let subject: string | undefined
  let description = capitalize(/^(.+?\.)(\s|$)/.exec(first)?.[1] ?? first)
  let color = paletteColor(slot)
  let photo = true
  switch (kind) {
    case 'dailymix':
      subject = /built around (.+?) and what sits near it/.exec(first)?.[1]
      if (subject) description = `${subject} and more`
      color = PALETTE[mod(n - 1, PALETTE.length)]
      break
    case 'artistradio':
      subject = /everything you have by (.+?)\.(\s|$)/.exec(first)?.[1]
      if (subject) {
        title = `${subject} Radio`
        description = `Everything you have by ${subject}`
      }
      color = PALETTE[(n + 2) % PALETTE.length]
      break
    case 'genreradio':
      subject = /^(.+?), one of the genres/.exec(first)?.[1]
      if (subject) {
        title = `${subject} Mix`
        description = `${subject}, one of the genres you play most`
      }
      color = paletteColor(subject)
      break
    case 'timeofday':
      color = DAYPART_COLORS[slot] ?? color
      break
    case 'decade':
      color = slot.endsWith('2010') ? '#dc148c' : '#27856a'
      break
    default:
      photo = false
      color = KIND_COLORS[kind] ?? color
  }
  const section: MixSection =
    kind === 'artistradio' || kind === 'genreradio'
      ? 'topMixes'
      : kind === 'timeofday'
        ? 'timeOfDay'
        : ['essentials', 'loved', 'wrapped', 'decade'].includes(kind)
          ? 'favorites'
          : 'madeForYou'
  return { kind, slot, n, title, subject, description, by: 'NaviBeat', color, photo, section }
}

/** Sort key: by kind, then slot number; the time-of-day mixes start at the current part of the day. */
export function mixOrder(m: ServerMix, hour: number): number {
  const k = KIND_ORDER.indexOf(m.kind)
  const i = m.kind === 'timeofday' ? mod(DAYPARTS.indexOf(m.slot) - DAYPARTS.indexOf(daypart(hour)), 4) : m.n
  return (k >= 0 ? k : KIND_ORDER.length) * 100 + i
}

export type MixPlaylist = Playlist & { mix: ServerMix }
/** NaviBeat's radios keep their mix, for the title and cover they wear; any other radio is a plain playlist. */
export type RadioPlaylist = Playlist & { mix?: ServerMix }

/** What a server playlist is, every one exactly one of these. */
export type PlaylistClass = { kind: 'radio'; mix?: ServerMix } | { kind: 'mix'; mix: ServerMix } | { kind: 'playlist' }

/** "Radio" as a word, so a playlist about Radiohead is not one. */
const RADIO_NAME = /\bradio\b/i
/** How the tools that build radios describe them: "Radio station based on ...", "Artist radio for ...". */
const RADIO_COMMENT = /\b(radio (station|mix|playlist)|(artist|song|track|genre|album) radio)\b/i
const RADIO_KINDS = ['artistradio', 'genreradio']

export function classifyPlaylist(name: string, comment = ''): PlaylistClass {
  const mix = parseMix(name, comment)
  if (mix) return RADIO_KINDS.includes(mix.kind) ? { kind: 'radio', mix } : { kind: 'mix', mix }
  return RADIO_NAME.test(name) || RADIO_COMMENT.test(comment) ? { kind: 'radio' } : { kind: 'playlist' }
}

/**
 * The server's playlists split into the user's own, its radios and its other mixes, the mixes in
 * the web UI's order.
 */
export function splitPlaylists(
  lists: Playlist[] = [],
  hour = new Date().getHours()
): { own: Playlist[]; radios: RadioPlaylist[]; mixes: MixPlaylist[] } {
  const own: Playlist[] = []
  const radios: RadioPlaylist[] = []
  const mixes: MixPlaylist[] = []
  for (const p of lists) {
    const c = classifyPlaylist(p.name, p.comment)
    if (c.kind === 'mix') mixes.push({ ...p, mix: c.mix })
    else if (c.kind === 'radio') radios.push(c.mix ? { ...p, mix: c.mix } : p)
    else own.push(p)
  }
  mixes.sort((a, b) => mixOrder(a.mix, hour) - mixOrder(b.mix, hour))
  return { own, radios, mixes }
}

/** Every mix of the web UI's shelves, NaviBeat's radios back among them, in its order. */
export function shelfMixes(radios: RadioPlaylist[], mixes: MixPlaylist[], hour = new Date().getHours()): MixPlaylist[] {
  const all = [...mixes, ...radios.filter((r): r is MixPlaylist => !!r.mix)]
  return all.sort((a, b) => mixOrder(a.mix, hour) - mixOrder(b.mix, hour))
}

/** The ones the user has not hidden from their library. */
export function withoutHidden<T extends { id: string }>(items: T[], hidden: string[]): T[] {
  return items.filter((p) => !hidden.includes(p.id))
}
