import { Shuffle } from 'lucide-react'
import { useClient, useSettings } from '@renderer/shared/sessionStore'
import { Cover } from '@renderer/shared/Cover'
import { AlbumCard, LikedCover, Shelf, Tile, TileGrid, gradient } from '../components/AlbumCard'
import { TagArt } from '../components/TagArt'
import { ErrorBox, GhostButton } from '../components/ui'
import { MixRow } from './Mixes'
import { loadRecent, playFrom } from '../recents'
import { artRefOf } from '../tagArt'
import { useAsync } from '../useAsync'
import { nav } from '../nav'
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

/**
 * A shelf tile's picture: real artwork where the thing has some, and otherwise the same mood,
 * genre or mix background its own page wears, so the shelf matches what the user came from.
 */
function RecentArt({ item }: { item: RecentItem }) {
  const art = artRefOf(item.view)
  if (art) return <TagArt art={art} name={item.title} />
  if (item.coverArt) return <Cover id={item.coverArt} size={160} className="h-full w-full" rounded="rounded-none" />
  return <div className="h-full w-full" style={{ background: gradient(item.title) }} />
}

function RecentGrid() {
  const items = useSettings().recents
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
        {items.map((it) => (
          <Tile
            key={it.key}
            title={it.title}
            view={it.view}
            load={(c) => loadRecent(c, it)}
            recent={it}
            art={<RecentArt item={it} />}
          />
        ))}
      </TileGrid>
    </div>
  )
}

export function Home() {
  const client = useClient()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
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
      <RecentGrid />
      <MixRow shelf />
      <AlbumRow title="Recently added" type="newest" />
      <AlbumRow title="Recently played" type="recent" />
      <AlbumRow title="Most played" type="frequent" />
      <AlbumRow title="Random picks" type="random" />
    </div>
  )
}
