import type { ServerMix } from '@shared/navimix'
import { Cover } from '@renderer/shared/Cover'
import { useClient } from '@renderer/shared/sessionStore'
import { artistPhoto } from '../playlists'
import { useAsync } from '../useAsync'

/** Where the colour band over a photo mix eases in, and how opaque it is there. */
const BAND: [number, number][] = [
  [34, 0], [42, 4], [49, 12], [56, 25], [62, 42], [67, 60], [72, 76], [77, 89], [82, 97], [86, 100]
]

const band = (color: string): string =>
  `linear-gradient(rgba(0,0,0,0.25) 0%, transparent 22%, ${BAND.map(
    ([at, a]) => `color-mix(in srgb, ${color} ${a}%, transparent) ${at}%`
  ).join(', ')}, ${color} 100%)`

const shadow = '0 2px 12px rgba(0,0,0,0.25)'

/**
 * A mix's artwork as the web UI and navidroid draw it: a photo under a band of the mix's colour,
 * or that colour as a gradient over a grey copy of the cover, with the title on it and a coloured
 * dot in the corner. Fills its box; the type is sized off the box's width, so it reads the same
 * on a 48px library row as on a header.
 */
export function MixCover({ title, color, art, photo }: { title: string; color: string; art?: string; photo: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-surface-3 [container-type:inline-size]">
      {photo ? (
        <>
          <div className="absolute inset-0">
            <Cover id={art} size={300} className="h-full w-full" rounded="" />
          </div>
          <div className="absolute inset-0" style={{ background: band(color) }} />
          <div className="absolute inset-x-0 bottom-0 flex h-[28%] items-center px-[7%]">
            <div className="line-clamp-2 leading-[1.05] font-extrabold" style={{ fontSize: '10cqw', textShadow: shadow }}>
              {title}
            </div>
          </div>
        </>
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 45%, black))` }}
          />
          <div className="absolute inset-0 opacity-35 grayscale">
            <Cover id={art} size={300} className="h-full w-full" rounded="" />
          </div>
          <div
            className="absolute inset-x-[7%] bottom-[7%] line-clamp-2 leading-[1.04] font-extrabold"
            style={{ fontSize: '13cqw', textShadow: shadow }}
          >
            {title}
          </div>
        </>
      )}
      <div className="absolute top-[6%] left-[6%] aspect-square w-[9%] rounded-full bg-white p-[2.5%]">
        <div className="h-full w-full rounded-full" style={{ background: color }} />
      </div>
    </div>
  )
}

/** A NaviBeat/Explo mix's artwork. A mix about an artist shows that artist, as on the web. */
export function ServerMixCover({ mix, coverArt }: { mix: ServerMix; coverArt?: string }) {
  const client = useClient()
  const subject = mix.photo && (mix.kind === 'dailymix' || mix.kind === 'artistradio') ? mix.subject : undefined
  const photo = useAsync(
    subject ? `mixphoto:${subject}` : undefined,
    () => (subject && client ? artistPhoto(client, subject) : undefined),
    [client, subject]
  )
  // Blank while the artist is looked up, rather than flashing the playlist's own cover first.
  const art = subject ? (photo.data ?? (photo.loading ? undefined : coverArt)) : coverArt
  return <MixCover title={mix.title} color={mix.color} art={art} photo={mix.photo} />
}
