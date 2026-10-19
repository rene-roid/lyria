/**
 * The three background looks, one per kind of thing that has no artwork of its own.
 *
 * Moods get a single cover duotoned to the mood's colour, genres a tinted four-cover mosaic and
 * mixes navidroid's photo under a colour band, so a glance at Home's shelf says which is which
 * before the label is read. Which covers each one wears is `tagArt`'s business, not this file's.
 */
import { useState } from 'react'
import { paletteColor } from '@shared/navimix'
import { useCoverUrl } from '@renderer/shared/Cover'
import { ART_COUNT, useTagArt, type ArtRef } from '../tagArt'
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
