import { Shuffle } from 'lucide-react'
import { formatDuration } from '@shared/format'
import { viewKey } from '@shared/types'
import { useClient, useSessionStore } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { AlbumCard, ArtistCard, CardGrid, LikedCover } from '../components/AlbumCard'
import { TrackList } from '../components/TrackList'
import { ActionIcon, Empty, ErrorBox, Loading, PageTitle, SectionHeader } from '../components/ui'
import { playFrom } from '../recents'
import { useAsync } from '../useAsync'

/** Liked Songs is pinned on Home's shelf, so playing it records nothing there, but its buttons still know. */
const LIKED = viewKey({ name: 'favorites' })

/** Liked Songs, with the albums and artists starred on the server under it. */
export function Favorites() {
  const client = useClient()
  const username = useSessionStore((s) => s.session?.username)
  const state = useAsync('starred', () => client?.getStarred2(), [client])
  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  const r = state.data
  if (!r) return null
  const songs = r.songs
  const total = songs.reduce((s, t) => s + t.duration, 0)
  return (
    <div>
      <PageTitle
        eyebrow="Playlist"
        title="Liked Songs"
        color="#5038a0"
        cover={<LikedCover className="h-52 w-52 rounded-md" />}
        subtitle={
          <span>
            {username && <span className="font-bold text-ink">{username} • </span>}
            {songs.length} song{songs.length === 1 ? '' : 's'}
            {songs.length > 0 && `, ${formatDuration(total)}`}
          </span>
        }
        play={{ onClick: () => playFrom(songs, 0, null, LIKED), disabled: !songs.length, from: LIKED }}
        actions={
          <>
            <ActionIcon
              title="Shuffle"
              disabled={!songs.length}
              onClick={() => {
                player.setShuffle(true)
                playFrom(songs, Math.floor(Math.random() * songs.length), null, LIKED)
              }}
            >
              <Shuffle size={28} />
            </ActionIcon>
          </>
        }
      />
      {songs.length > 0 ? (
        <section className="mb-8">
          <TrackList tracks={songs} origin={null} from={LIKED} />
        </section>
      ) : (
        <Empty>Songs you like will appear here. Hit the heart on any song to save it.</Empty>
      )}
      {r.albums.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Liked albums" />
          <CardGrid>{r.albums.map((a) => <AlbumCard key={a.id} album={a} />)}</CardGrid>
        </section>
      )}
      {r.artists.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Liked artists" />
          <CardGrid>{r.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}</CardGrid>
        </section>
      )}
    </div>
  )
}
