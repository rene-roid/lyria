/**
 * Shared contract between the main process, the audio host and every display window.
 * Every visible window is a pure subscriber of PlayerEvents and only ever sends PlayerCommands.
 */

import type { AlbumListType, Playlist } from './subsonic/types'
import { defaultAuroraOptions, type AuroraOptions, type BackgroundKind } from './aurora'

export interface Track {
  id: string
  title: string
  artist: string
  artistId?: string
  /** Every artist credited on the song, featured ones included, when the server says (OpenSubsonic). */
  artists?: { id: string; name: string }[]
  album: string
  albumId?: string
  duration: number
  track?: number
  disc?: number
  year?: number
  genre?: string
  coverArt?: string
  starred?: boolean
  bitRate?: number
  suffix?: string
  /** How often and when last the server saw it played; the discovery mixes are built off these. */
  playCount?: number
  played?: string
  /** ReplayGain tags from the server, used by the volume-normalisation setting. */
  gain?: { track?: number; album?: number; trackPeak?: number; albumPeak?: number; fallback?: number }
}

export type NormalizeMode = 'off' | 'track' | 'album'

export type ThemeName = 'blue' | 'green'

export const THEMES: { value: ThemeName; label: string; accent: string }[] = [
  { value: 'blue', label: 'Blue', accent: '#3b82f6' },
  { value: 'green', label: 'Green', accent: '#1db954' }
]

/**
 * Linear gain factor for a track under `mode`, clamped so peak * gain never clips.
 * Album mode keeps a record's internal loudness shape and only levels between albums.
 */
export function replayGainFactor(gain: Track['gain'], mode: NormalizeMode): number {
  if (mode === 'off') return 1
  const album = mode === 'album'
  // Album mode falls back to the track value: a single loose track has no album gain.
  const dB = (album ? gain?.album ?? gain?.track : gain?.track) ?? gain?.fallback
  if (dB === undefined || !Number.isFinite(dB)) return 1
  const peak = (album ? gain?.albumPeak ?? gain?.trackPeak : gain?.trackPeak) ?? 0
  const factor = 10 ** (dB / 20)
  // No peak means no headroom budget, so a boost could clip: only attenuation is safe.
  return peak > 0 ? Math.min(factor, 1 / peak) : Math.min(factor, 1)
}

export type RepeatMode = 'off' | 'all' | 'one'

export interface PlayerState {
  hostReady: boolean
  track: Track | null
  index: number
  queue: Track[]
  /** Index of the first of the songs autoplay added to the end of the queue; the queue's length when there are none. */
  autoplayFrom: number
  playing: boolean
  position: number
  duration: number
  volume: number
  muted: boolean
  repeat: RepeatMode
  shuffle: boolean
}

export const initialPlayerState: PlayerState = {
  hostReady: false,
  track: null,
  index: -1,
  queue: [],
  autoplayFrom: 0,
  playing: false,
  position: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  repeat: 'off',
  shuffle: false
}

/**
 * The song that plays once the current one ends: the next in the queue, or the first again on
 * repeat-all. Repeat-one plays the same song again, so nothing is coming up.
 */
export function upNext(s: Pick<PlayerState, 'queue' | 'index' | 'repeat'>): Track | undefined {
  if (s.repeat === 'one' || s.index < 0) return undefined
  return s.queue[s.index + 1] ?? (s.repeat === 'all' && s.queue.length > 1 ? s.queue[0] : undefined)
}

/** `track` with the like a `starChanged` event reports, when it is the song that changed. */
export function starredCopy<T extends Track | null>(track: T, id: string, starred: boolean): T {
  return track?.id === id ? { ...track, starred } : track
}

/** Events emitted by the audio host and relayed by main to every window. */
export interface PlayerEvents {
  hostReady: { ready: boolean }
  trackChanged: { track: Track | null; index: number }
  playStateChanged: { playing: boolean }
  positionUpdate: { position: number; duration: number }
  queueChanged: { queue: Track[]; index: number; autoplayFrom: number }
  volumeChanged: { volume: number; muted: boolean }
  modeChanged: { repeat: RepeatMode; shuffle: boolean }
  /** A song in the queue was liked or unliked, from any window. */
  starChanged: { id: string; starred: boolean }
  /** ~30fps frequency bins (0..255) and an overall level (0..1). */
  audioFrame: { bins: Uint8Array; level: number }
  error: { message: string }
}
export type PlayerEventName = keyof PlayerEvents

/** Commands any window may send; main forwards them to the audio host. */
export interface PlayerCommands {
  play: undefined
  pause: undefined
  toggle: undefined
  next: undefined
  prev: undefined
  stop: undefined
  seek: { position: number }
  setVolume: { volume: number }
  setMuted: { muted: boolean }
  setQueue: { tracks: Track[]; index?: number; autoplay?: boolean }
  /** Play the song on its own, then songs like it once the host has found them. */
  playRadio: { track: Track }
  addToQueue: { tracks: Track[]; next?: boolean }
  playAt: { index: number }
  removeFromQueue: { index: number }
  clearQueue: undefined
  setRepeat: { repeat: RepeatMode }
  setShuffle: { shuffle: boolean }
  /** The server has taken a like; the host keeps its queue's copy in step and tells every window. */
  setStarred: { id: string; starred: boolean }
}
export type PlayerCommandName = keyof PlayerCommands

export interface Session {
  /** The candidate currently in use; always a member of `servers`. */
  server: string
  /** Every URL that points at this same library (LAN, VPN, public). Fastest reachable one wins. */
  servers?: string[]
  username: string
  /** md5(password + salt). The raw password is never persisted. */
  token: string
  salt: string
}

export interface ResumeState {
  queue: Track[]
  index: number
  position: number
  /** Where autoplay's songs at the end of the queue begin, as in `PlayerState`. */
  autoplayFrom: number
}

/**
 * Clamp a persisted resume snapshot back into a usable range; null when there is nothing to resume.
 * Snapshots saved before autoplay have no `autoplayFrom` and come back with no autoplayed songs.
 */
export function sanitizeResume(r: Partial<ResumeState> | null | undefined): ResumeState | null {
  if (!r?.queue?.length) return null
  const length = r.queue.length
  const index = Math.min(Math.max(Math.trunc(r.index ?? 0) || 0, 0), length - 1)
  const position = Number.isFinite(r.position) ? Math.max(0, r.position ?? 0) : 0
  const from = r.autoplayFrom ?? length
  const autoplayFrom = Number.isInteger(from) ? Math.min(Math.max(from, 0), length) : length
  return { queue: r.queue, index, position, autoplayFrom }
}

/**
 * The first queue index from `from` on, going the way `step` points, that `playable` allows, for
 * when only part of a queue can play (offline, with some of it on disk). `wrap` carries on round
 * the end of the queue, as repeat-all does. Undefined when nothing that way can play.
 */
export function nextPlayable(
  length: number,
  from: number,
  step: 1 | -1,
  wrap: boolean,
  playable: (index: number) => boolean
): number | undefined {
  for (let n = 0; n < length; n++) {
    let i = from + n * step
    if (wrap) i = ((i % length) + length) % length
    else if (i < 0 || i >= length) return undefined
    if (playable(i)) return i
  }
  return undefined
}

/** Mixes built off your play history alone, to surface music you have not been playing. */
export const DISCOVERY_KINDS = ['discover', 'deepCuts', 'rediscover', 'fresh'] as const
export type DiscoveryKind = (typeof DISCOVERY_KINDS)[number]
export const isDiscovery = (kind: string): kind is DiscoveryKind => (DISCOVERY_KINDS as readonly string[]).includes(kind)

/**
 * What a mix is seeded from: a genre tag, a mood tag, one artist the mix is built around, or for
 * a discovery mix, nothing but the history itself. Optional on a View because mixes were
 * genre-only at first, so a missing kind means `genre`.
 */
export type MixKind = 'genre' | 'mood' | 'artist' | DiscoveryKind

/** Every navigable page of the main window. Lives here because `recents` persists it. */
export type View =
  | { name: 'home' }
  /** `sort` is where "Show all" on a Home shelf lands; the page itself starts at A-Z. */
  | { name: 'albums'; sort?: AlbumListType }
  | { name: 'soundtracks' }
  | { name: 'artists' }
  | { name: 'genres' }
  | { name: 'genre'; value: string }
  | { name: 'moods' }
  | { name: 'mood'; value: string }
  | { name: 'mix'; value: string; kind?: MixKind }
  | { name: 'mixes' }
  | { name: 'savedMix'; id: string }
  | { name: 'artist'; id: string }
  /** `discIds` are sibling albums holding the other discs of the same release, in disc order. */
  | { name: 'album'; id: string; discIds?: string[] }
  | { name: 'playlist'; id: string }
  | { name: 'search'; query: string }
  | { name: 'favorites' }
  | { name: 'settings' }

/** Identity of a view, for deduping the shelf. */
export function viewKey(v: View): string {
  // Mixes carry their kind, so a "Rock" genre mix and a "Rock" mood mix stay separate entries.
  if (v.name === 'mix') return `mix:${v.kind ?? 'genre'}:${v.value}`
  return 'id' in v ? `${v.name}:${v.id}` : 'value' in v ? `${v.name}:${v.value}` : v.name
}

/**
 * A tile on Home's "jump back in" shelf: the album, artist, playlist, genre or mix the user
 * started a play from, or the song itself when it was played on its own.
 */
export interface RecentItem {
  /** `viewKey(view)`, `track:<id>` for a lone song, or `radio:<id>` for a song radio. */
  key: string
  title: string
  subtitle?: string
  coverArt?: string
  /** The place played from. Absent for a lone song or a song radio, which `track` holds instead. */
  view?: View
  track?: Track
  /** `track` started a song radio, so playing the tile starts the radio again, not the song alone. */
  radio?: true
}

const RECENTS_LIMIT = 7

/** Shelf entries, newest first, deduped and capped. Returns `items` untouched when nothing changed. */
export function pushRecent(items: RecentItem[], item: RecentItem | null | undefined): RecentItem[] {
  if (!item || items[0]?.key === item.key) return items
  return [item, ...items.filter((i) => i.key !== item.key)].slice(0, RECENTS_LIMIT)
}

/**
 * A mix frozen at the moment it was saved. Mixes are rebuilt from the server every day, so the
 * songs are kept with it rather than the seed alone -- reopening a saved mix gives back the exact
 * lineup, which is the whole point of saving one.
 *
 * ponytail: the songs ride along in the settings file, like the resume queue already does. Fine for
 * the two dozen mixes `saveMix` allows; move them to their own file if that starts to hurt.
 */
export interface SavedMix {
  /** Seed and the day it was saved, so saving the same mix twice in a day replaces it. */
  id: string
  title: string
  /** What the mix was built around, so the saved copy keeps the artwork it was wearing. */
  seed: { kind: MixKind; value: string }
  savedAt: number
  tracks: Track[]
}

const SAVED_MIXES_LIMIT = 24

/** Saved mixes, newest first, one entry per id and capped. */
export function saveMix(mixes: SavedMix[], mix: SavedMix): SavedMix[] {
  return [mix, ...mixes.filter((m) => m.id !== mix.id)].slice(0, SAVED_MIXES_LIMIT)
}

export type WindowName = 'main' | 'host' | 'toast' | 'mini' | 'widget'

/**
 * A playlist or saved mix kept on disk for listening offline. A playlist follows the server: its
 * lineup is refreshed on launch and new songs download. A saved mix is frozen, so it never changes.
 */
export interface Download {
  /** `playlist:<id>` or `mix:<id>`. */
  key: string
  kind: 'playlist' | 'mix'
  id: string
  title: string
  trackIds: string[]
  /** Cover shown in the downloads list. */
  coverArt?: string
  addedAt: number
}

/** A download plus how far its songs have got. */
export interface DownloadStatus extends Download {
  done: number
  /** Songs that would not download this session; they are tried again on the next sync. */
  failed: number
}

/** A playlist with its songs, as `getPlaylist` gives it. */
export type PlaylistWithTracks = Playlist & { entry: Track[] }

/**
 * What a download is made from. A playlist brings itself along, kept with the download and
 * refreshed on every sync, so it opens with the server out of reach even when the library cache
 * has lost it; a mix's songs already live with the saved mix.
 */
export type NewDownload = Omit<Download, 'addedAt'> & { playlist?: PlaylistWithTracks }

export const downloadKey = (kind: Download['kind'], id: string): string => `${kind}:${id}`

/** Re-encoding main hands to the audio host for the on-disk caches. */
export type HostJob = { kind: 'opus'; kbps: number } | { kind: 'webp' }

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Corner or edge of the work area an overlay window (taskbar widget, toast) is glued to. */
export type OverlayAnchor =
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'top-left'
  | 'top-center'
  | 'top-right'

export const OVERLAY_ANCHORS: { value: OverlayAnchor; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top centre' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom centre' },
  { value: 'bottom-right', label: 'Bottom right' }
]

/**
 * How an overlay's card is filled. `solid` is an opaque panel dimmed by `opacity`; `acrylic` is
 * the blurred system backdrop, so whatever sits behind the window shows through it.
 */
export type OverlayBackground = 'solid' | 'acrylic'

export const OVERLAY_BACKGROUNDS: { value: OverlayBackground; label: string; hint: string }[] = [
  { value: 'solid', label: 'Solid', hint: 'An opaque card, dimmed to the opacity you pick' },
  { value: 'acrylic', label: 'Acrylic', hint: 'Frosted glass that blurs whatever sits behind it' }
]

/**
 * Windows 11 22H2 is the first build that can draw the acrylic system backdrop behind a window.
 * Everywhere else acrylic mode falls back to a translucent glass card with no blur, since a
 * transparent window gives `backdrop-filter` nothing to sample.
 */
export function supportsNativeAcrylic(platform: string, release: string): boolean {
  return platform === 'win32' && Number(release.split('.')[2] ?? 0) >= 22621
}

/** How long an overlay takes to settle on a new opacity, in CSS and in main alike. */
export const OVERLAY_FADE_MS = 250

/**
 * The look every floating window shares: taskbar widget, mini player and toast. The hover and
 * click-through options only apply to the two the pointer can actually interact with.
 */
export interface OverlayChrome {
  background: OverlayBackground
  /** Resting opacity, 0.35 to 1. */
  opacity: number
  /** Fade the window down to `hoverOpacity` while the pointer is over it, to see past it. */
  fadeOnHover: boolean
  /** Opacity while hovered, 0.05 to 1. Only ever dims further than `opacity`, never brighter. */
  hoverOpacity: number
  /** Let clicks fall through to whatever is behind the window, except on its own controls. */
  clickThrough: boolean
}

export const defaultOverlayChrome: OverlayChrome = {
  background: 'solid',
  opacity: 1,
  fadeOnHover: false,
  hoverOpacity: 0.35,
  clickThrough: false
}

/**
 * Opacity an overlay should be showing right now. Hovering only ever dims further, so a hover
 * level left above the resting one cannot make the window brighter than the user asked for.
 */
export function overlayOpacity(o: OverlayChrome, hovering: boolean): number {
  return o.fadeOnHover && hovering ? Math.min(o.opacity, o.hoverOpacity) : o.opacity
}

/**
 * Where the taskbar widget sits: glued to one of the anchor slots of the primary work area, or
 * wherever it was dragged to, as the top-left corner of the window in screen DIP.
 */
export type WidgetPlacement = { kind: 'anchor'; anchor: OverlayAnchor } | { kind: 'free'; x: number; y: number }

/** Where the widget starts, and where it goes back to when its position is reset. */
export const HOME_ANCHOR: OverlayAnchor = 'bottom-right'

/**
 * How big a floating player is drawn. Small drops to the title alone (the widget) or the bare
 * controls (the mini player); large adds the album line, a bigger cover and a seek bar.
 */
export type CardSize = 'small' | 'medium' | 'large'

export const CARD_SIZES: { value: CardSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' }
]

export type VisualizerStyle = 'off' | 'bars' | 'mirror' | 'wave'

export const VISUALIZER_STYLES: { value: VisualizerStyle; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'bars', label: 'Bars' },
  { value: 'mirror', label: 'Mirror' },
  { value: 'wave', label: 'Wave' }
]

/** `cover` is a bright take on the playing cover's own colour. */
export type VisualizerColor = 'accent' | 'cover' | 'white'

export const VISUALIZER_COLORS: { value: VisualizerColor; label: string }[] = [
  { value: 'accent', label: 'Accent' },
  { value: 'cover', label: 'Cover' },
  { value: 'white', label: 'White' }
]

/**
 * What the taskbar widget and the mini player share beyond the chrome: how the card picks up
 * the playing song, and which controls it carries besides the transport buttons.
 */
export interface PlayerLook {
  /** Wash the card in a colour picked from the cover, easing from one track to the next. */
  tint: boolean
  visualizer: VisualizerStyle
  visualizerColor: VisualizerColor
  /** Heart the playing song, after the next button. */
  like: boolean
  /** Shuffle toggle, before the previous button. */
  shuffle: boolean
}

export const defaultPlayerLook: PlayerLook = {
  tint: false,
  visualizer: 'off',
  visualizerColor: 'accent',
  like: false,
  shuffle: false
}

/** The widget card's corners. A pill rounds the cover too, so it sits concentric with the ends. */
export type CornerStyle = 'square' | 'rounded' | 'pill'

export const CORNER_STYLES: { value: CornerStyle; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'pill', label: 'Pill' }
]

/** Layout and chrome of the taskbar widget. Main sizes and places the window from these. */
export interface WidgetOptions extends OverlayChrome, PlayerLook {
  placement: WidgetPlacement
  size: CardSize
  corners: CornerStyle
  /** Thin accent progress line along the bottom edge. */
  progress: boolean
  cover: boolean
  /** `1:23 / 4:56` next to the transport buttons. */
  elapsed: boolean
}

export const defaultWidgetOptions: WidgetOptions = {
  ...defaultOverlayChrome,
  ...defaultPlayerLook,
  placement: { kind: 'anchor', anchor: HOME_ANCHOR },
  size: 'medium',
  corners: 'rounded',
  visualizer: 'bars',
  progress: true,
  cover: true,
  elapsed: false
}

/** The mini player's options. Its position lives in `windowBounds`, wherever it was dragged. */
export interface MiniOptions extends OverlayChrome, PlayerLook {
  size: CardSize
}

export const defaultMiniOptions: MiniOptions = { ...defaultOverlayChrome, ...defaultPlayerLook, size: 'medium' }

/** Track-change toast. It never takes the mouse, so only the card's look and its corner apply. */
export interface ToastOptions extends Pick<OverlayChrome, 'background' | 'opacity'>, Pick<PlayerLook, 'tint'> {
  anchor: OverlayAnchor
}

export const defaultToastOptions: ToastOptions = {
  anchor: 'bottom-right',
  background: 'solid',
  opacity: 1,
  tint: false
}

/** Width an optional shuffle or like button adds: one compact button and the gap before it. */
const EXTRA_BUTTON = 32

const extraButtons = (o: PlayerLook): number => (o.like ? 1 : 0) + (o.shuffle ? 1 : 0)

/**
 * The taskbar widget per size: the window's box with every part shown, the cover and the flex
 * gap that goes with it, and the elapsed time next to the controls. Large shows the time beside
 * its seek bar instead, inside the box it already has.
 */
export const WIDGET_LAYOUTS: Record<CardSize, { width: number; height: number; cover: number; gap: number; elapsed: number }> = {
  small: { width: 288, height: 52, cover: 36, gap: 8, elapsed: 72 },
  medium: { width: 340, height: 76, cover: 54, gap: 10, elapsed: 74 },
  large: { width: 420, height: 108, cover: 84, gap: 12, elapsed: 0 }
}

/**
 * Footprint of the taskbar widget for a given set of options. Lives here so the main process
 * can size the window and the renderer can lay out to exactly the same box.
 */
export function widgetSize(o: WidgetOptions): { width: number; height: number } {
  const l = WIDGET_LAYOUTS[o.size]
  const width = l.width - (o.cover ? 0 : l.cover + l.gap) + (o.elapsed ? l.elapsed : 0) + extraButtons(o) * EXTRA_BUTTON
  return { width, height: l.height }
}

/**
 * The mini player per size: its window's box, the side of its cover, and the width one more
 * control button takes, which is bigger on large where the buttons are full size.
 */
export const MINI_LAYOUTS: Record<CardSize, { width: number; height: number; cover: number; button: number }> = {
  small: { width: 300, height: 84, cover: 64, button: EXTRA_BUTTON },
  medium: { width: 340, height: 112, cover: 84, button: EXTRA_BUTTON },
  large: { width: 384, height: 148, cover: 124, button: EXTRA_BUTTON + 4 }
}

export function miniSize(o: MiniOptions): { width: number; height: number } {
  const l = MINI_LAYOUTS[o.size]
  return { width: l.width + extraButtons(o) * l.button, height: l.height }
}

export interface Settings {
  widgets: { mini: boolean; taskbar: boolean; toast: boolean }
  /** Position and chrome of the taskbar widget; `widgets.taskbar` decides whether it is shown. */
  widget: WidgetOptions
  mini: MiniOptions
  toast: ToastOptions
  volume: number
  muted: boolean
  repeat: RepeatMode
  shuffle: boolean
  closeToTray: boolean
  autoLaunch: boolean
  mediaKeys: boolean
  /** Level playback across tracks using the server's ReplayGain tags. */
  normalize: NormalizeMode
  /** Keep playing songs like the last few heard once the queue runs out. */
  autoplay: boolean
  toastDurationMs: number
  windowBounds: Partial<Record<WindowName, Rect>>
  /** Queue and playback position saved on quit so the next launch picks up where it left off. */
  resume: ResumeState | null
  /** Where the user played from recently, newest first; Home's shelf. Cleared when the account changes. */
  recents: RecentItem[]
  /** Disk budget for cached songs, in GB. 0 turns caching off. */
  cacheMaxGb: number
  /** Re-encode cached lossless songs to Opus so they take less room on disk. */
  cacheCompress: boolean
  /** Opus bitrate for compressed songs, in kbps. */
  cacheCompressKbps: number
  /** Disk budget for cached cover art, in MB. 0 turns it off and covers load off the server. */
  artCacheMaxMb: number
  /** Mixes the user kept, newest first. */
  savedMixes: SavedMix[]
  /** Playlists hearted into Your Library, newest first. Kept here, not on the server, as navidroid does. */
  savedPlaylists: string[]
  /** Playlists, radios and mixes hidden from Your Library and Home. Kept here, per install, as the hearts are. */
  hiddenPlaylists: string[]
  /** Also match soundtrack wording in the album title, not just the genre tag. */
  soundtrackTitleMatch: boolean
  theme: ThemeName
  background: BackgroundKind
  /** The aurora's look, kept while the background is plain so turning it back on finds it as it was. */
  aurora: AuroraOptions
}

export const defaultSettings: Settings = {
  widgets: { mini: false, taskbar: true, toast: true },
  widget: defaultWidgetOptions,
  mini: defaultMiniOptions,
  toast: defaultToastOptions,
  volume: 0.8,
  muted: false,
  repeat: 'off',
  shuffle: false,
  closeToTray: true,
  autoLaunch: false,
  mediaKeys: true,
  normalize: 'album',
  autoplay: true,
  toastDurationMs: 3500,
  windowBounds: {},
  resume: null,
  recents: [],
  cacheMaxGb: 5,
  cacheCompress: true,
  cacheCompressKbps: 160,
  artCacheMaxMb: 256,
  savedMixes: [],
  savedPlaylists: [],
  hiddenPlaylists: [],
  soundtrackTitleMatch: true,
  theme: 'blue',
  background: 'none',
  aurora: defaultAuroraOptions
}

/**
 * What a caller may hand to `settings.update`. The nested groups merge field by field, so a
 * window can flip one option without having to echo back the rest.
 */
export type SettingsPatch = Partial<Omit<Settings, 'widget' | 'widgets' | 'mini' | 'toast' | 'aurora'>> & {
  widget?: Partial<WidgetOptions>
  mini?: Partial<MiniOptions>
  toast?: Partial<ToastOptions>
  widgets?: Partial<Settings['widgets']>
  aurora?: Partial<AuroraOptions>
}

export interface LyricLine {
  /** seconds */
  time: number
  text: string
}

export interface Lyrics {
  synced: boolean
  lines: LyricLine[]
  lang?: string
  displayArtist?: string
  displayTitle?: string
  /** milliseconds, added to playback position before matching lines */
  offset?: number
}
