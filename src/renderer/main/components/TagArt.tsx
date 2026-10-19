/**
 * The three background looks, one per kind of thing that has no artwork of its own.
 *
 * Moods get a single cover duotoned to the mood's colour, genres a tinted four-cover mosaic and
 * mixes navidroid's photo under a colour band, so a glance at Home's shelf says which is which
 * before the label is read. Which covers each one wears is `tagArt`'s business, not this file's.
 */
import { useState } from 'react'
import { Loader2, Play } from 'lucide-react'
import { paletteColor } from '@shared/navimix'
import { Cover, useCoverColor, useCoverUrl } from '@renderer/shared/Cover'
import { ART_COUNT, artKey, shownCover, useTagArt, type ArtRef } from '../tagArt'
import type { MixSeed } from '../mixes'
import { gradient, hue } from './AlbumCard'
import { MixCover } from './MixCover'

/** A cover behind a tag. Renders nothing at all if it is not there and cannot be got. */
function ArtImage({ id, className = '' }: { id: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  const url = useCoverUrl(id)
  if (failed) return null
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  )
}

/** Repeat what there is until every slot has a cover, so a tag with one album still fills its grid. */
function fill(ids: string[], count: number): string[] {
  return Array.from({ length: count }, (_, i) => ids[i % ids.length])
}

/** One cover, full bleed, pulled towards the mood's own colour and scrimmed for the label. */
function MoodArt({ name, ids }: { name: string; ids: string[] }) {
  return (
    <>
      <ArtImage id={ids[0]} className="scale-105 saturate-125" />
      {/* `color` keeps the photograph's light and shade and swaps only its hue, which is a duotone. */}
      <div
        className="absolute inset-0 opacity-55 mix-blend-color"
        style={{ background: `hsl(${hue(name)} 70% 45%)` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/40" />
    </>
  )
}

/**
 * Four covers as a mosaic under a two-tone diagonal wash. Where a mood is one flat colour over one
 * picture, a genre is a colour that travels across four, which is what keeps the two styles apart
 * at tile size. The wash goes on twice: soft-light for the light and shade, colour for the hue.
 */
function GenreArt({ name, ids }: { name: string; ids: string[] }) {
  const h = hue(name)
  const wash = `linear-gradient(135deg, hsl(${h} 90% 62%), hsl(${(h + 50) % 360} 85% 38%))`
  return (
    <>
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px brightness-90">
        {fill(ids, ART_COUNT.genre).map((id, i) => (
          <div key={`${id}:${i}`} className="overflow-hidden">
            <ArtImage id={id} />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 opacity-90 mix-blend-soft-light" style={{ background: wash }} />
      <div className="absolute inset-0 opacity-45 mix-blend-color" style={{ background: wash }} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
      <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent_36%,rgba(255,255,255,0.16)_50%,transparent_64%)]" />
    </>
  )
}

/**
 * Fills whatever box it is put in. `name` is the label shown over it, and seeds the colour the
 * style tints with, so the card keeps its identity while the covers underneath turn over.
 */
export function TagArt({ art, name, fallback }: { art: ArtRef; name: string; fallback?: string }) {
  const ids = useTagArt(art)
  // Sonora's own mixes are drawn like the server's NaviBeat ones: a real cover under a colour band.
  // `fallback` is for a kept mix whose tag no longer has covers to pick: its own first song's.
  if (art.style === 'mix') return <MixCover title={name} color={paletteColor(art.seed.value)} art={ids[0] ?? fallback} photo />
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: gradient(name) }}>
      {ids.length > 0 &&
        (art.style === 'mood' ? (
          <MoodArt name={name} ids={ids} />
        ) : (
          <GenreArt name={name} ids={ids} />
        ))}
    </div>
  )
}

/**
 * The same background at the size an album cover gets, for the top of the page a tile leads to.
 * Opening a mood, genre or mix should land on the picture that was clicked, not a bare heading.
 */
export function TagArtCover({ art, name, fallback }: { art: ArtRef; name: string; fallback?: string }) {
  return (
    <div className="h-52 w-52 shrink-0 overflow-hidden rounded-md">
      <TagArt art={art} name={name} fallback={fallback} />
    </div>
  )
}

/**
 * The picture and colour a genre or mood wears in the browse grid and on its own page: one of its
 * covers (see shownCover) and the colour picked from that cover, so the two always match.
 */
export function useBrowseArt(seed: MixSeed, name: string): { cover?: string; color: string } {
  // The genre style's pick, whatever the tag: it holds four candidates, which leaves room to dodge
  // a cover another tile already has.
  const ref: ArtRef = { style: 'genre', seed }
  const cover = shownCover(artKey(ref), useTagArt(ref))
  const own = `hsl(${hue(name)} 45% 32%)`
  const picked = useCoverColor(cover, own)
  // A black-and-white cover gives a grey: the tag's own colour keeps the grid colourful instead.
  return { cover, color: grey(picked) ? own : picked }
}

/** Whether a picked `rgb(r g b)` colour has next to no hue. */
function grey(color: string): boolean {
  const [r, g, b] = (color.match(/\d+/g) ?? []).map(Number)
  if (r === undefined || !color.startsWith('rgb')) return false
  const max = Math.max(r, g, b)
  return !max || (max - Math.min(r, g, b)) / max < 0.25
}

/**
 * A genre or mood in the browse grid, as Spotify and navidroid draw it: a block of the cover's
 * colour, the name large in the corner, and the cover itself tilted off the bottom-right edge.
 */
export function BrowseCard({
  seed,
  name,
  subtitle,
  onOpen,
  onPlay
}: {
  seed: MixSeed
  name: string
  subtitle: string
  onOpen: () => void
  onPlay?: () => Promise<void> | void
}) {
  const { cover, color } = useBrowseArt(seed, name)
  const [busy, setBusy] = useState(false)
  const play = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (busy || !onPlay) return
    setBusy(true)
    void Promise.resolve(onPlay()).finally(() => setBusy(false))
  }
  return (
    <div
      onClick={onOpen}
      className="group relative aspect-[5/3] cursor-pointer overflow-hidden rounded-lg shadow-md hover:-translate-y-0.5 hover:shadow-xl"
      style={{ backgroundColor: color, transition: 'background-color 500ms, transform 150ms, box-shadow 150ms' }}
    >
      {/* Light from the top-left, so the block reads as a surface rather than a flat swatch. */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/35" />
      {cover && (
        <div className="absolute right-[-7%] bottom-[-6%] aspect-square w-[44%] rotate-[25deg] overflow-hidden rounded-md shadow-[0_6px_20px_rgba(0,0,0,0.5)] transition duration-300 group-hover:rotate-[18deg] group-hover:scale-105">
          <Cover id={cover} size={300} className="h-full w-full" rounded="" />
        </div>
      )}
      <div className="relative p-4 pr-[42%]">
        <div className="line-clamp-2 text-xl leading-tight font-extrabold tracking-tight break-words drop-shadow-sm" title={name}>
          {name}
        </div>
        <div className="mt-1 text-xs font-semibold text-white/75">{subtitle}</div>
      </div>
      {onPlay && (
        <button
          onClick={play}
          title={`Play ${name}`}
          className={`absolute bottom-3 left-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-black shadow-xl transition hover:scale-105 hover:bg-accent-2 focus-visible:opacity-100 ${
            busy ? '' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100'
          }`}
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </button>
      )}
    </div>
  )
}

/** The browse grid: roomier than the album grid, since these tiles carry no padding of their own. */
export function BrowseGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">{children}</div>
}

/** A genre's or mood's page header: the same cover its tile shows, square. */
export function BrowseCover({ cover }: { cover?: string }) {
  return <Cover id={cover} size={500} className="h-52 w-52" />
}
