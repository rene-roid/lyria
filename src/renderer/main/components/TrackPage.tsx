import { useMemo, useState, type ReactNode } from 'react'
import { Shuffle } from 'lucide-react'
import type { RecentItem, Track } from '@shared/types'
import { filterTracks, formatDuration } from '@shared/format'
import { player } from '@renderer/shared/playerStore'
import { useNoneOnDevice } from '../offline'
import { playFrom } from '../recents'
import type { AsyncState } from '../useAsync'
import { TrackList } from './TrackList'
import { ActionIcon, Empty, ErrorBox, Loading, PageTitle } from './ui'
import { tagColor } from './AlbumCard'

/** A flat, searchable, playable list of songs: the shape shared by genre and mix pages. */
export function TrackPage({
  eyebrow,
  title,
  state,
  origin,
  cover,
  actions,
  download,
  color
}: {
  eyebrow: string
  title: string
  state: AsyncState<Track[]>
  /** This page, for Home's shelf: playing anything here counts as playing the genre or mix. */
  origin: RecentItem
  /** Artwork beside the heading, the same picture the tile that led here was wearing. */
  cover?: ReactNode
  /** Extra buttons after Play and Shuffle, for whatever else this kind of page can do. */
  actions?: ReactNode
  /** A download button, kept beside Shuffle like on a playlist page rather than with the actions. */
  download?: ReactNode
  /** The header band; defaults to the hue the page's tag artwork is washed with. */
  color?: string
}) {
  const [query, setQuery] = useState('')
  const songs = state.data
  const shown = useMemo(() => filterTracks(songs ?? [], query), [songs, query])
  const unplayable = useNoneOnDevice(songs)

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (!songs) return null
  const total = songs.reduce((s, t) => s + t.duration, 0)

  return (
    <div>
      <PageTitle
        eyebrow={eyebrow}
        title={title}
        color={color ?? tagColor(title)}
        cover={cover}
        subtitle={`${songs.length} song${songs.length === 1 ? '' : 's'}, ${formatDuration(total)}`}
        search={{ value: query, onChange: setQuery, placeholder: `Search in this ${eyebrow.toLowerCase()}` }}
        play={{ onClick: () => playFrom(songs, 0, origin), disabled: !songs.length || unplayable, from: origin.key }}
        actions={
          <>
            <ActionIcon
              title="Shuffle"
              disabled={!songs.length || unplayable}
              onClick={() => {
                player.setShuffle(true)
                playFrom(songs, Math.floor(Math.random() * songs.length), origin)
              }}
            >
              <Shuffle size={28} />
            </ActionIcon>
            {download}
            {actions}
          </>
        }
      />
      {songs.length === 0 ? (
        <Empty>Nothing here</Empty>
      ) : shown.length === 0 ? (
        <Empty>No songs match</Empty>
      ) : (
        <TrackList tracks={shown} origin={origin} />
      )}
    </div>
  )
}
