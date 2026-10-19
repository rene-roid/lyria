import { Shuffle } from 'lucide-react'
import { daypart, MIX_SECTIONS, type MixPlaylist, type MixSection } from '@shared/navimix'
import { capitalize } from '@shared/format'
import { useClient, useSessionStore, useSettings } from '@renderer/shared/sessionStore'
import { Cover } from '@renderer/shared/Cover'
import { AlbumCard, LikedCover, PlaylistCard, Shelf, Tile, TileGrid, gradient } from '../components/AlbumCard'
import { ServerMixCover } from '../components/MixCover'
import { TagArt } from '../components/TagArt'
import { ErrorBox, GhostButton } from '../components/ui'
import { MixRow } from './Mixes'
import { loadRecent, playFrom } from '../recents'
import { artRefOf } from '../tagArt'
import { useAsync } from '../useAsync'
import { nav } from '../nav'
import { playlistRecent, savedFirst, useSavedPlaylists, useServerPlaylists } from '../playlists'
import type { AlbumListType } from '@shared/subsonic/types'
import type { RecentItem } from '@shared/types'

function AlbumRow({ title, type }: { title: string; type: AlbumListType }) {
  const client = useClient()
  const state = useAsync(`list:${type}`, () => client?.getAlbumList2(type, 12), [client, type])
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (!state.data?.length) return null
  return (
    <Shelf
      title={title}
      onMore={() => nav.go({ name: 'albums', sort: type })}
      items={state.data.map((a) => <AlbumCard key={a.id} album={a} />)}
    />
  )
}

/** One of the web UI's mix shelves; nothing when the server has no mixes of that kind. */
function MixShelf({ mixes, section, title }: { mixes: MixPlaylist[]; section: MixSection; title?: string }) {
  const items = mixes.filter((m) => m.mix.section === section)
  if (!items.length) return null
  return (
    <Shelf
      title={title ?? MIX_SECTIONS.find((s) => s.key === section)!.title}
      onMore={() => nav.go({ name: 'mixes' })}
      items={items.map((p) => <PlaylistCard key={p.id} playlist={p} />)}
    />
  )
}

/**
 * A shelf tile's picture: real artwork where the thing has some, and otherwise the same mood,
 * genre or mix background its own page wears, so the shelf matches what the user came from.
 */
function RecentArt({ item, mix }: { item: RecentItem; mix?: MixPlaylist }) {
  if (mix) return <ServerMixCover mix={mix.mix} coverArt={mix.coverArt} />
  const art = artRefOf(item.view)
  if (art) return <TagArt art={art} name={item.title} fallback={item.coverArt} />
  if (item.coverArt) return <Cover id={item.coverArt} size={160} className="h-full w-full" rounded="rounded-none" />
  return <div className="h-full w-full" style={{ background: gradient(item.title) }} />
}

/** The web UI's pick of mixes for the top of Home, used to fill whatever the recents leave free. */
const QUICK = (hour: number): [string, string?][] => [
  ['timeofday', daypart(hour)],
  ['onrepeat'],
  ['dailymix', 'dailymix-1'],
  ['dailymix', 'dailymix-2'],
  ['dailymix', 'dailymix-3'],
  ['discovery'],
  ['explo', 'weekly-exploration']
]

const QUICK_TILES = 8

function RecentGrid({ mixes }: { mixes: MixPlaylist[] }) {
  const recents = useSettings().recents
  const mixOf = (it: RecentItem) => (it.view?.name === 'playlist' ? mixes.find((m) => m.id === (it.view as { id: string }).id) : undefined)
  const keys = new Set(recents.map((r) => r.key))
  const fill = QUICK(new Date().getHours())
    .map(([kind, slot]) => mixes.find((m) => m.mix.kind === kind && (!slot || m.mix.slot === slot)))
    .filter((m): m is MixPlaylist => !!m && !keys.has(`playlist:${m.id}`))
    .map(playlistRecent)
  const items = [...recents, ...fill].slice(0, QUICK_TILES - 1)
  return (
    <div className="mb-8">
      <TileGrid>
        <Tile
          title="Liked Songs"
          view={{ name: 'favorites' }}
          load={async (c) => (await c.getStarred2()).songs}
          recent={null}
          art={<LikedCover className="h-full w-full" />}
        />
        {items.map((it) => {
          const mix = mixOf(it)
          return (
            <Tile
              key={it.key}
              title={mix?.mix.title ?? it.title}
              view={it.view}
              load={(c) => loadRecent(c, it)}
              recent={it}
              art={<RecentArt item={it} mix={mix} />}
            />
          )
        })}
      </TileGrid>
    </div>
  )
}

export function Home() {
  const client = useClient()
  const username = useSessionStore((s) => s.session?.username)
  const { mixes, own } = useServerPlaylists()
  const saved = useSavedPlaylists()
  const part = daypart(new Date().getHours())
  const greeting = part === 'morning' ? 'Good morning' : part === 'afternoon' ? 'Good afternoon' : 'Good evening'
  return (
    <div>
      {/* The web UI's tint behind the greeting, fading into the panel. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-[#2e2745]" />
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[32px] font-bold tracking-tight">{greeting}</h1>
        <GhostButton
          onClick={async () => {
            if (!client) return
            playFrom(await client.getRandomSongs(50))
          }}
        >
          <Shuffle size={16} /> Shuffle library
        </GhostButton>
      </div>
      <RecentGrid mixes={mixes} />
      <MixShelf mixes={mixes} section="madeForYou" title={username ? `Made For ${capitalize(username)}` : undefined} />
      <AlbumRow title="Recently played" type="recent" />
      <MixShelf mixes={mixes} section="topMixes" />
      <MixShelf mixes={mixes} section="timeOfDay" />
      {own.length > 0 && (
        <Shelf
          title="Your playlists"
          items={savedFirst(own, saved).map((p) => <PlaylistCard key={p.id} playlist={p} />)}
        />
      )}
      <MixShelf mixes={mixes} section="favorites" />
      <MixRow shelf />
      <AlbumRow title="Recently added" type="newest" />
      <AlbumRow title="Most played" type="frequent" />
      <AlbumRow title="Random picks" type="random" />
    </div>
  )
}
