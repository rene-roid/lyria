import { Shuffle } from 'lucide-react'
import { formatDuration } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { Cover, useCoverColor } from '@renderer/shared/Cover'
import { TrackList } from '../components/TrackList'
import { ActionIcon, ErrorBox, Loading, PageTitle, PlayCircle } from '../components/ui'
import { recentOf, playFrom } from '../recents'
import { useAsync } from '../useAsync'

export function PlaylistView({ id }: { id: string }) {
  const client = useClient()
  const state = useAsync(`playlist:${id}`, () => client?.getPlaylist(id), [client, id])
  const color = useCoverColor(state.data?.coverArt ?? state.data?.entry[0]?.coverArt)

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (!state.data) return null
  const pl = state.data
  const songs = pl.entry
  const total = songs.reduce((s, t) => s + t.duration, 0)
  const origin = recentOf({ name: 'playlist', id }, pl.name, 'Playlist', pl.coverArt ?? songs[0]?.coverArt)

  return (
    <div>
      <PageTitle
        eyebrow="Playlist"
        title={pl.name}
        color={color}
        cover={<Cover id={pl.coverArt ?? songs[0]?.coverArt} size={500} className="h-52 w-52" />}
        subtitle={
          <span>
            {pl.comment && <span className="mb-2 block">{pl.comment}</span>}
            {pl.owner && <span className="font-bold text-ink">{pl.owner} • </span>}
            {songs.length} song{songs.length === 1 ? '' : 's'}, {formatDuration(total)}
          </span>
        }
        actions={
          <>
            <PlayCircle onClick={() => playFrom(songs, 0, origin)} disabled={!songs.length} />
            <ActionIcon
              title="Shuffle"
              disabled={!songs.length}
              onClick={() => {
                player.setShuffle(true)
                playFrom(songs, Math.floor(Math.random() * songs.length), origin)
              }}
            >
              <Shuffle size={28} />
            </ActionIcon>
          </>
        }
      />
      <TrackList
        tracks={songs}
        origin={origin}
        removeLabel="Remove from this playlist"
        onRemove={async (i) => {
          if (!client) return
          await client.updatePlaylist(id, { songIndexToRemove: [i] })
          state.reload()
        }}
      />
    </div>
  )
}
