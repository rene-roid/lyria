import { useEffect, useRef, useState } from 'react'
import { Heart, Loader2, Pause, Play } from 'lucide-react'
import { player } from '@renderer/shared/playerStore'
import type { AlbumID3, ArtistID3, Playlist } from '@shared/subsonic/types'
import { parseMix } from '@shared/navimix'
import type { SubsonicClient } from '@shared/subsonic/client'
import { viewKey, type RecentItem, type Track } from '@shared/types'
import { parseDiscName } from '@shared/format'
import { Cover } from '@renderer/shared/Cover'
import { useClient } from '@renderer/shared/sessionStore'
import { nav, type View } from '../nav'
import { albumRecent, albumSongs, playFrom, usePlayingState } from '../recents'
import { playlistRecent } from '../playlists'
import { loadPlaylist } from '../downloads'
import { ServerMixCover } from './MixCover'
import { SectionHeader } from './ui'

/**
 * A shelf card, as on the web UI's Home: square artwork with a green play button that rises in on
 * hover, the title and a two-line subtitle under it. `onPlay` may take a while (a mix is built on
 * the spot), so the button spins until it settles.
 */
export function Card({
  art,
  title,
  subtitle,
  onOpen,
  onPlay,
  from,
  round = false
}: {
  art: React.ReactNode
  title: string
  subtitle: string
  onOpen: () => void
  onPlay?: () => Promise<void> | void
  /** The `viewKey` the card opens; while the queue came from there, its button pauses and resumes. */
  from?: string
  round?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const { current, playing } = usePlayingState(from)
  const play = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (current) return player.toggle()
    if (busy || !onPlay) return
    setBusy(true)
    void Promise.resolve(onPlay()).finally(() => setBusy(false))
  }
  return (
    <div className="group min-w-0 cursor-pointer rounded-md p-3 transition hover:bg-white/[0.07]" onClick={onOpen}>
      <div className="relative">
        <div
          className={`aspect-square w-full overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.5)] ${round ? 'rounded-full' : 'rounded-md'}`}
        >
          {art}
        </div>
        {onPlay && (
          <button
            onClick={play}
            title={playing ? 'Pause' : `Play ${title}`}
            className={`absolute right-2 bottom-2 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-black shadow-[0_8px_8px_rgba(0,0,0,0.3)] transition hover:scale-105 hover:bg-accent-2 focus-visible:translate-y-0 focus-visible:opacity-100 ${
              busy || playing ? '' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100'
            }`}
          >
            {busy ? (
              <Loader2 size={22} className="animate-spin" />
            ) : playing ? (
              <Pause size={22} fill="currentColor" />
            ) : (
              <Play size={22} fill="currentColor" className="ml-0.5" />
            )}
          </button>
        )}
      </div>
      <div className="mt-2 truncate text-[15px] font-bold" title={title}>
        {title}
      </div>
      <div className="mt-1 line-clamp-2 text-sm text-ink-2" title={subtitle}>
        {subtitle}
      </div>
    </div>
  )
}

/** `discIds` are sibling albums holding the rest of a split multi-disc release, in disc order. */
export function AlbumCard({ album, discIds }: { album: AlbumID3; discIds?: string[] }) {
  const client = useClient()
  const ids = [album.id, ...(discIds ?? [])]
  const playAlbum = async (): Promise<void> => {
    if (!client) return
    playFrom(await albumSongs(client, ids), 0, albumRecent(album, discIds))
  }
  return (
    <Card
      art={<Cover id={album.coverArt ?? album.id} size={300} className="h-full w-full" rounded="" />}
      title={ids.length > 1 ? parseDiscName(album.name).base : album.name}
      subtitle={`${album.year ? `${album.year} • ` : ''}${album.artist ?? 'Unknown artist'}`}
      onOpen={() => nav.go({ name: 'album', id: album.id, discIds })}
      onPlay={playAlbum}
      from={albumRecent(album, discIds).key}
    />
  )
}

export function ArtistCard({ artist }: { artist: ArtistID3 }) {
  return (
    <Card
      round
      art={<Cover id={artist.coverArt ?? artist.id} size={300} className="h-full w-full" rounded="" />}
      title={artist.name}
      subtitle={artist.albumCount ? `${artist.albumCount} album${artist.albumCount === 1 ? '' : 's'}` : 'Artist'}
      onOpen={() => nav.go({ name: 'artist', id: artist.id })}
    />
  )
}

/** A playlist, or a NaviBeat/Explo mix drawn and titled the way the web UI shows it. */
export function PlaylistCard({ playlist: p }: { playlist: Playlist }) {
  const client = useClient()
  const mix = parseMix(p.name, p.comment)
  return (
    <Card
      art={
        mix ? (
          <ServerMixCover mix={mix} coverArt={p.coverArt} />
        ) : (
          <Cover id={p.coverArt} size={300} className="h-full w-full" rounded="" />
        )
      }
      title={mix?.title ?? p.name}
      subtitle={mix?.description ?? `By ${p.owner ?? 'you'}`}
      onOpen={() => nav.go({ name: 'playlist', id: p.id })}
      from={viewKey({ name: 'playlist', id: p.id })}
      onPlay={async () => {
        const songs = client ? (await loadPlaylist(client, p.id)).entry : []
        if (songs.length) playFrom(songs, 0, playlistRecent(p))
      }}
    />
  )
}

export function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="-mx-3 grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">{children}</div>
}

const CARD_MIN = 170

/** One row of cards, as many as fit the width, with "Show all" leading to the rest. */
export function Shelf({ title, onMore, items }: { title: string; onMore?: () => void; items: React.ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(5)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setFit(Math.max(1, Math.floor(e.contentRect.width / CARD_MIN))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <section className="mb-6">
      <SectionHeader title={title} onMore={onMore} />
      <div ref={ref} className="-mx-3 grid" style={{ gridTemplateColumns: `repeat(${fit}, minmax(0, 1fr))` }}>
        {items.slice(0, fit)}
      </div>
    </section>
  )
}

/** Tags (genres, moods) have no artwork on Navidrome, so give each a stable colour from its name. */
export function hue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

export function gradient(name: string): string {
  return `linear-gradient(135deg, hsl(${hue(name)} 60% 32%), hsl(${(hue(name) + 40) % 360} 55% 18%))`
}

/** The header band of a tag's page, in the hue its artwork is washed with. */
export function tagColor(name: string): string {
  return `hsl(${hue(name)} 50% 28%)`
}

/** Liked Songs' artwork, the gradient and heart Spotify gave it. */
export function LikedCover({ className }: { className: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center bg-gradient-to-br from-[#450af5] to-[#c4efd9] ${className}`}>
      <Heart className="h-[38%] w-[38%]" fill="currentColor" />
    </div>
  )
}

export function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">{children}</div>
}

/** Wide short tile with a hover play button: the "jump back in" shelf at the top of Home. */
export function Tile({
  title,
  view,
  art,
  load,
  recent
}: {
  title: string
  /** Absent for a tile that stands for a single song: clicking it plays instead of navigating. */
  view?: View
  art: React.ReactNode
  load: (client: SubsonicClient) => Promise<Track[]>
  /** What playing this tile puts on Home's shelf; `null` for one that is pinned there anyway. */
  recent: RecentItem | null
}) {
  const client = useClient()
  const [busy, setBusy] = useState(false)
  const from = recent?.key ?? (view && viewKey(view))
  const { current, playing } = usePlayingState(from)
  const play = async (e?: React.MouseEvent): Promise<void> => {
    e?.stopPropagation()
    if (current) return player.toggle()
    if (!client || busy) return
    setBusy(true)
    try {
      const tracks = await load(client)
      if (tracks.length) playFrom(tracks, 0, recent, from)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="group relative">
      <button
        onClick={() => (view ? nav.go(view) : void play())}
        className="flex h-16 w-full items-center gap-3 overflow-hidden rounded-md bg-white/[0.07] text-left transition hover:bg-white/[0.14]"
      >
        <div className="h-16 w-16 shrink-0">{art}</div>
        <div
          className={`line-clamp-2 min-w-0 flex-1 pr-14 text-sm font-semibold leading-tight ${current ? 'text-accent' : ''}`}
          title={title}
        >
          {title}
        </div>
      </button>
      <button
        onClick={play}
        title={playing ? 'Pause' : `Play ${title}`}
        className={`absolute top-1/2 right-3 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-black shadow-xl transition hover:scale-105 focus-visible:opacity-100 ${
          busy || playing ? '' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" />
        ) : playing ? (
          <Pause size={18} fill="currentColor" />
        ) : (
          <Play size={18} fill="currentColor" className="ml-0.5" />
        )}
      </button>
    </div>
  )
}
