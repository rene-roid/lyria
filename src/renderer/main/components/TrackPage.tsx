import { useMemo, useState, type ReactNode } from 'react'
import { Shuffle } from 'lucide-react'
import type { RecentItem, Track } from '@shared/types'
import { filterTracks, formatDuration } from '@shared/format'
import { player } from '@renderer/shared/playerStore'
import { playFrom } from '../recents'
import type { AsyncState } from '../useAsync'
import { TrackList } from './TrackList'
import { ActionIcon, Empty, ErrorBox, Loading, PageTitle, PlayCircle, SearchInput } from './ui'
import { tagColor } from './AlbumCard'

/** A flat, searchable, playable list of songs: the shape shared by genre and mix pages. */
export function TrackPage({
  eyebrow,
  title,
  state,
  origin,
  cover,
  actions
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
}) {
  const [query, setQuery] = useState('')
  const songs = state.data
  const shown = useMemo(() => filterTracks(songs ?? [], query), [songs, query])

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (!songs) return null
  const total = songs.reduce((s, t) => s + t.duration, 0)

  return (
    <div>
      <PageTitle
        eyebrow={eyebrow}
        title={title}
        color={tagColor(title)}
        cover={cover}
        subtitle={`${songs.length} song${songs.length === 1 ? '' : 's'}, ${formatDuration(total)}`}
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
            {actions}
          </>
        }
      />
      <SearchInput value={query} onChange={setQuery} placeholder={`Search in this ${eyebrow.toLowerCase()}`} />
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
