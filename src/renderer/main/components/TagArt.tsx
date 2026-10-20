/**
 * Artwork for the things the server has none of its own for. Sonora's mixes are drawn like the
 * server's NaviBeat ones, a cover under a colour band (see MixCover); a genre or mood gets a
 * poster, one of its covers edited into the tag's own look (see tagLook). Which covers each one
 * wears is `tagArt`'s business, not this file's.
 */
import { useState, type ReactNode } from 'react'
import { Loader2, Play } from 'lucide-react'
import { paletteColor } from '@shared/navimix'
import { useCoverUrl } from '@renderer/shared/Cover'
import { artKey, shownCover, useTagArt, type ArtRef } from '../tagArt'
import { lookColor, tagLook, usePoster, type TagLook } from '../tagLook'
import { seedOf, type MixSeed } from '../mixes'
import { SectionHeader } from './ui'
import { MixCover } from './MixCover'

/**
 * A genre's or mood's look, its poster, and the colour of its page. The tile, the page and Home's
 * shelf all ask here, so all three wear the same picture.
 */
export function useBrowseArt(seed: MixSeed): { look: TagLook; poster?: string; color: string } {
  const ref: ArtRef = { style: 'genre', seed }
  const key = artKey(ref)
  const cover = shownCover(key, useTagArt(ref))
  const look = tagLook(seed)
  return { look, poster: usePoster(useCoverUrl(cover, 600), look, key), color: lookColor(look) }
}

/** A genre's poster filling its box, over its own palette while it is drawn or if it never can be. */
function Poster({ look, poster, className = '' }: { look: TagLook; poster?: string; className?: string }) {
  const [ink, mid] = look.palette
  return (
    <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${mid}, ${ink})` }}>
      {poster && <img src={poster} alt="" draggable={false} className={`h-full w-full object-cover ${className}`} />}
    </div>
  )
}

/**
 * A mood's art, which is no photograph: its colours as a glow, and the cover screened into a dotted
 * orb rising out of the corner, lit by that glow. Where a genre is a poster, a mood is a feeling.
 */
function Aura({ look, orb, seed, className = '' }: { look: TagLook; orb?: string; seed: string; className?: string }) {
  const [ink, mid, light] = look.palette
  // Where the light falls from, so no two moods' glows sit in quite the same place.
  const h = seedOf(seed)
  const x = 55 + (h % 30)
  const y = 60 + ((h >>> 6) % 25)
  return (
    <div
      className="absolute inset-0"
      style={{
        background: [
          `radial-gradient(70% 70% at ${x}% ${y}%, color-mix(in srgb, ${light} 50%, transparent), transparent 70%)`,
          `linear-gradient(155deg, color-mix(in srgb, ${mid} 55%, ${ink}), ${ink} 90%)`
        ].join(', ')
      }}
    >
      {orb && (
        <img
          src={orb}
          alt=""
          draggable={false}
          className={`absolute -right-[14%] -bottom-[14%] aspect-square w-[76%] rounded-full drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)] ${className}`}
        />
      )}
    </div>
  )
}

/** A mood's sign: its emblem in its ink, on a disc of its light colour. */
function Sign({ look, className = '' }: { look: TagLook; className?: string }) {
  const Icon = look.icon
  const [ink, , light] = look.palette
  return (
    <div
      className={`flex items-center justify-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.35)] ${className}`}
      style={{ background: light, color: ink }}
    >
      {Icon && <Icon className="h-1/2 w-1/2" strokeWidth={2.5} />}
    </div>
  )
}

function MixArt({ art, name, fallback }: { art: ArtRef; name: string; fallback?: string }) {
  const ids = useTagArt(art)
  // `fallback` is for a kept mix whose tag no longer has covers to pick: its own first song's.
  return <MixCover title={name} color={paletteColor(art.seed.value)} art={ids[0] ?? fallback} photo />
}

function SquareArt({ seed }: { seed: MixSeed }) {
  const { look, poster } = useBrowseArt(seed)
  return (
    <div className="relative h-full w-full overflow-hidden">
      {seed.kind === 'mood' ? (
        <>
          <Aura look={look} orb={poster} seed={seed.value} />
          <Sign look={look} className="absolute bottom-[8%] left-[8%] h-[20%] w-[20%]" />
        </>
      ) : (
        <Poster look={look} poster={poster} />
      )}
    </div>
  )
}

/** Fills whatever box it is put in. `name` is the label shown over a mix's artwork. */
export function TagArt({ art, name, fallback }: { art: ArtRef; name: string; fallback?: string }) {
  return art.style === 'mix' ? <MixArt art={art} name={name} fallback={fallback} /> : <SquareArt seed={art.seed} />
}

/**
 * The same artwork at the size an album cover gets, for the top of the page a tile leads to.
 * Opening a mood, genre or mix should land on the picture that was clicked, not a bare heading.
 */
export function TagArtCover({ art, name, fallback }: { art: ArtRef; name: string; fallback?: string }) {
  return (
    <div className={`relative h-52 w-52 shrink-0 overflow-hidden ${art.seed.kind === 'mood' ? 'rounded-3xl' : 'rounded-md'}`}>
      <TagArt art={art} name={name} fallback={fallback} />
    </div>
  )
}

/** A tile's play button. `idle` is how it sits until hovered; while it loads it stays in view. */
function PlayButton({ name, onPlay, className, idle }: { name: string; onPlay: () => Promise<void> | void; className: string; idle: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        if (busy) return
        setBusy(true)
        void Promise.resolve(onPlay()).finally(() => setBusy(false))
      }}
      title={`Play ${name}`}
      className={`flex h-11 w-11 items-center justify-center rounded-full bg-accent text-black shadow-[0_6px_16px_rgba(0,0,0,0.45)] transition hover:scale-105 hover:bg-accent-2 focus-visible:opacity-100 ${className} ${busy ? '' : idle}`}
    >
      {busy ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
    </button>
  )
}

interface TileProps {
  seed: MixSeed
  name: string
  subtitle: string
  onOpen: () => void
  onPlay?: () => Promise<void> | void
}

/** A genre: its poster, full bleed and landscape, with the name set large over its ink. */
function PosterTile({ seed, name, subtitle, onOpen, onPlay }: TileProps) {
  const { look, poster } = useBrowseArt(seed)
  const [ink, , light] = look.palette
  return (
    <div
      onClick={onOpen}
      className="group relative aspect-[5/3] cursor-pointer overflow-hidden rounded-lg shadow-[0_4px_14px_rgba(0,0,0,0.3)] transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
    >
      <Poster look={look} poster={poster} className="transition-transform duration-700 ease-out group-hover:scale-105" />
      {/* The ink rising from the bottom edge is what the name sits on, whatever the picture does there. */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(to top, ${ink}, color-mix(in srgb, ${ink} 50%, transparent) 40%, transparent 72%)` }}
      />
      <div className="absolute inset-x-4 bottom-3.5 pr-12">
        <div className="line-clamp-2 text-2xl leading-[1.05] font-extrabold tracking-tight break-words" title={name}>
          {name}
        </div>
        <div className="mt-1 text-xs font-semibold" style={{ color: light }}>
          {subtitle}
        </div>
      </div>
      {onPlay && (
        <PlayButton
          name={name}
          onPlay={onPlay}
          className="absolute right-3 bottom-3"
          idle="translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
        />
      )}
    </div>
  )
}

/**
 * A mood: square and soft-cornered, the name at the top, its sign in the bottom corner (which turns
 * into the play button on hover) and its orb drifting up out of the other.
 */
function MoodTile({ seed, name, subtitle, onOpen, onPlay }: TileProps) {
  const { look, poster } = useBrowseArt(seed)
  const light = look.palette[2]
  return (
    <div
      onClick={onOpen}
      className="group relative aspect-square cursor-pointer overflow-hidden rounded-3xl shadow-[0_4px_14px_rgba(0,0,0,0.3)] transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
    >
      <Aura
        look={look}
        orb={poster}
        seed={seed.value}
        className="transition-transform duration-700 ease-out group-hover:-translate-x-[5%] group-hover:-translate-y-[5%] group-hover:rotate-12"
      />
      <div className="absolute inset-x-5 top-5">
        <div className="line-clamp-2 text-[26px] leading-none font-extrabold tracking-tight break-words" title={name}>
          {name}
        </div>
        <div className="mt-1.5 text-xs font-semibold" style={{ color: light }}>
          {subtitle}
        </div>
      </div>
      <div className="absolute bottom-5 left-5 h-11 w-11">
        <Sign look={look} className={`h-full w-full transition-opacity ${onPlay ? 'group-hover:opacity-0' : ''}`} />
        {onPlay && <PlayButton name={name} onPlay={onPlay} className="absolute inset-0" idle="opacity-0 group-hover:opacity-100" />}
      </div>
    </div>
  )
}

/** A genre or mood in the browse grid. The two are drawn apart on purpose: see PosterTile and MoodTile. */
export function BrowseCard(props: TileProps) {
  return props.seed.kind === 'mood' ? <MoodTile {...props} /> : <PosterTile {...props} />
}

/** The browse grid: roomier than the album grid, since these tiles carry no padding of their own. */
export function BrowseGrid({ children, square = false }: { children: ReactNode; square?: boolean }) {
  return (
    <div className={`grid gap-4 ${square ? 'grid-cols-[repeat(auto-fill,minmax(180px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(210px,1fr))]'}`}>
      {children}
    </div>
  )
}

/**
 * The long tail, as pills in each tag's colour: a library's hundred one-song genres would make a
 * wall of tiles nobody scrolls through. `tiles` is how many lead the page as tiles regardless.
 */
export function splitTail<T>(items: T[], weight: (t: T) => number, min: number, tiles = 8): [T[], T[]] {
  const cut = items.findIndex((t, i) => i >= tiles && weight(t) < min)
  return cut < 0 ? [items, []] : [items.slice(0, cut), items.slice(cut)]
}

export function TailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <SectionHeader title={title} />
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

export function TagPill({ seed, name, count, onOpen }: { seed: MixSeed; name: string; count: number; onOpen: () => void }) {
  const look = tagLook(seed)
  const [ink, mid, light] = look.palette
  const Icon = look.icon
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2 rounded-full bg-white/[0.07] py-1 pr-3.5 pl-1 text-sm font-semibold transition-colors hover:bg-white/[0.14]"
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ background: `linear-gradient(135deg, ${mid}, ${ink})`, color: light }}
      >
        {Icon && <Icon size={13} strokeWidth={2.5} />}
      </span>
      {name}
      <span className="text-xs font-medium text-ink-3 tabular-nums">{count}</span>
    </button>
  )
}
