import { useMemo, useState } from 'react'
import { ListPlus, Shuffle } from 'lucide-react'
import { filterTracks, formatDuration } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { Cover, useCoverColor } from '@renderer/shared/Cover'
import { TrackList } from '../components/TrackList'
import { ActionIcon, Empty, ErrorBox, Loading, PageTitle } from '../components/ui'
import { useAsync } from '../useAsync'
import { nav } from '../nav'
import { useNoneOnDevice } from '../offline'
import { albumKey, albumRecent, loadAlbum, playFrom } from '../recents'

export function AlbumView({ id, discIds }: { id: string; discIds?: string[] }) {
  const client = useClient()
  const ids = [id, ...(discIds ?? [])]
  const key = albumKey(ids)
  const state = useAsync(key, () => (client ? loadAlbum(client, ids) : undefined), [client, key])
  const [query, setQuery] = useState('')
  const shown = useMemo(() => filterTracks(state.data?.song ?? [], query), [state.data, query])
  const color = useCoverColor(state.data?.coverArt ?? state.data?.id)
  const unplayable = useNoneOnDevice(state.data?.song)

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (!state.data) return null
  const album = state.data
  const songs = album.song
  const origin = albumRecent(album, discIds)
  const total = songs.reduce((s, t) => s + t.duration, 0)

  return (
    <div>
      <PageTitle
        eyebrow="Album"
        title={album.name}
        color={color}
        cover={<Cover id={album.coverArt ?? album.id} size={500} className="h-52 w-52" />}
        subtitle={
          <span>
            {album.artistId ? (
              <button className="font-semibold text-ink hover:underline" onClick={() => nav.go({ name: 'artist', id: album.artistId! })}>
                {album.artist}
              </button>
            ) : (
              <span className="font-semibold text-ink">{album.artist}</span>
            )}
            {album.year ? ` • ${album.year}` : ''} • {songs.length} song{songs.length === 1 ? '' : 's'}, {formatDuration(total)}
            {album.genre ? ` • ${album.genre}` : ''}
          </span>
        }
        search={{ value: query, onChange: setQuery, placeholder: 'Search in this album' }}
        play={{ onClick: () => playFrom(songs, 0, origin), disabled: unplayable, from: origin.key }}
        actions={
          <>
            <ActionIcon
              title="Shuffle"
              disabled={unplayable}
              onClick={() => {
                player.setShuffle(true)
                playFrom(songs, Math.floor(Math.random() * songs.length), origin)
              }}
            >
              <Shuffle size={28} />
            </ActionIcon>
            <ActionIcon onClick={() => player.addToQueue(songs)} disabled={unplayable} title="Add to queue">
              <ListPlus size={28} />
            </ActionIcon>
          </>
        }
      />
      {shown.length === 0 ? (
        <Empty>No songs match</Empty>
      ) : (
        <TrackList tracks={shown} showAlbum={false} showCover={false} numbered discs origin={origin} />
      )}
    </div>
  )
}
