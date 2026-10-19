import { Heart, Shuffle } from 'lucide-react'
import { parseMix } from '@shared/navimix'
import { useMemo, useState } from 'react'
import { filterTracks, formatDuration } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { Cover, useCoverColor } from '@renderer/shared/Cover'
import { TrackList } from '../components/TrackList'
import { ActionIcon, Empty, ErrorBox, Loading, PageTitle } from '../components/ui'
import { playFrom } from '../recents'
import { playlistRecent, toggleSavedPlaylist, useSavedPlaylists } from '../playlists'
import { ServerMixCover } from '../components/MixCover'
import { useAsync } from '../useAsync'

export function PlaylistView({ id }: { id: string }) {
  const client = useClient()
  const state = useAsync(`playlist:${id}`, () => client?.getPlaylist(id), [client, id])
  const coverColor = useCoverColor(state.data?.coverArt ?? state.data?.entry[0]?.coverArt)
  const saved = useSavedPlaylists().includes(id)
  const [query, setQuery] = useState('')
  const shown = useMemo(() => filterTracks(state.data?.entry ?? [], query), [state.data, query])

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (!state.data) return null
  const pl = state.data
  const songs = pl.entry
  const total = songs.reduce((s, t) => s + t.duration, 0)
  const origin = playlistRecent(pl)
  // A NaviBeat or Explo mix keeps the title, colour, artwork and blurb the web UI gives it.
  const mix = parseMix(pl.name, pl.comment)

  return (
    <div>
      <PageTitle
        eyebrow={mix ? 'Made For You' : 'Playlist'}
        title={mix?.title ?? pl.name}
        color={mix?.color ?? coverColor}
        cover={
          mix ? (
            <div className="h-52 w-52 overflow-hidden rounded-md">
              <ServerMixCover mix={mix} coverArt={pl.coverArt} />
            </div>
          ) : (
            <Cover id={pl.coverArt ?? songs[0]?.coverArt} size={500} className="h-52 w-52" />
          )
        }
        subtitle={
          <span>
            {(mix?.description ?? pl.comment) && <span className="mb-2 block">{mix?.description ?? pl.comment}</span>}
            {(mix?.by ?? pl.owner) && <span className="font-bold text-ink">{mix?.by ?? pl.owner} • </span>}
            {songs.length} song{songs.length === 1 ? '' : 's'}, {formatDuration(total)}
          </span>
        }
        search={{ value: query, onChange: setQuery, placeholder: 'Search in this playlist' }}
        play={{ onClick: () => playFrom(songs, 0, origin), disabled: !songs.length, from: origin.key }}
        actions={
          <>
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
            <ActionIcon
              title={saved ? 'Remove from Your Library' : 'Save to Your Library'}
              active={saved}
              onClick={() => toggleSavedPlaylist(id)}
            >
              <Heart size={28} fill={saved ? 'currentColor' : 'none'} />
            </ActionIcon>
          </>
        }
      />
      {query && shown.length === 0 && <Empty>No songs match</Empty>}
      <TrackList
        tracks={shown}
        origin={origin}
        removeLabel="Remove from this playlist"
        // A mix is rewritten by its plugin, so an edit to it would not last.
        onRemove={mix ? undefined : async (i) => {
          if (!client) return
          // `i` counts the filtered rows; the server wants the song's place in the whole playlist.
          await client.updatePlaylist(id, { songIndexToRemove: [songs.indexOf(shown[i])] })
          state.reload()
        }}
      />
    </div>
  )
}
