import type { Track } from '@shared/types'
import { splitCredits, type Credit } from '@shared/format'
import { nav } from '../nav'

/** The artists credited on a song: the server's full list where it sends one, else the lead. */
export function creditsOf(t: Track): Credit[] {
  return t.artists?.length ? t.artists : t.artistId ? [{ id: t.artistId, name: t.artist }] : []
}

/** A song's artist line, worded as tagged, with every credited artist a link to their own page. */
export function ArtistLinks({ track, className = '' }: { track: Track; className?: string }) {
  return (
    <>
      {splitCredits(track.artist, creditsOf(track)).map((p, i) =>
        p.id ? (
          <button
            key={i}
            className={`hover:underline ${className}`}
            onClick={(e) => {
              e.stopPropagation()
              nav.go({ name: 'artist', id: p.id! })
            }}
          >
            {p.text}
          </button>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  )
}
