import { useMemo, useState } from 'react'
import { Shuffle } from 'lucide-react'
import type { AlbumID3 } from '@shared/subsonic/types'
import { capitalize, hasMood } from '@shared/format'
import type { SubsonicClient } from '@shared/subsonic/client'
import { mapLimit } from '@shared/async'
import { useClient } from '@renderer/shared/sessionStore'
import { player } from '@renderer/shared/playerStore'
import { AlbumCard, CardGrid } from '../components/AlbumCard'
import { BrowseCard, BrowseCover, BrowseGrid, useBrowseArt } from '../components/TagArt'
import { ActionIcon, Empty, ErrorBox, Loading, PageTitle, SearchInput } from '../components/ui'
import { nav } from '../nav'
import { recentOf, playFrom } from '../recents'
import { ALBUM_FETCH_LIMIT } from '../mixes'
import { useAsync, type AsyncState } from '../useAsync'

/**
 * Subsonic has no mood endpoint, so both views work off one cached pass over the album list and
 * read the OpenSubsonic `moods` tag. Servers that do not send it simply show an empty tab.
 */
const useAlbums = (): AsyncState<AlbumID3[]> => {
  const client = useClient()
  return useAsync('albums:all', () => client?.getAllAlbums(), [client])
}

const moodRecent = (value: string) => recentOf({ name: 'mood', value }, capitalize(value), 'Mood')

/** Every song on the albums tagged with a mood, from the top or shuffled. */
async function playMood(client: SubsonicClient, albums: AlbumID3[], value: string, shuffle = false): Promise<void> {
  const tagged = albums.filter((a) => hasMood(a, value))
  const songs = (await mapLimit(tagged, ALBUM_FETCH_LIMIT, (a) => client.getAlbum(a.id))).flatMap((a) => a.song)
  if (!songs.length) return
  player.setShuffle(shuffle)
  playFrom(songs, shuffle ? Math.floor(Math.random() * songs.length) : 0, moodRecent(value))
}

export function Moods() {
  const state = useAlbums()
  const [filter, setFilter] = useState('')

  const client = useClient()
  const moods = useMemo(() => {
    // By lowercase, so "Energetic" and "energetic" are one mood; an album counts once per mood.
    const counts = new Map<string, number>()
    for (const a of state.data ?? []) {
      for (const m of new Set((a.moods ?? []).map((m) => m.toLowerCase()))) if (m) counts.set(m, (counts.get(m) ?? 0) + 1)
    }
    const q = filter.trim().toLowerCase()
    return [...counts]
      .filter(([m]) => !q || m.toLowerCase().includes(q))
      .sort((a, b) => b[1] - a[1])
  }, [state.data, filter])

  return (
    <div>
      <PageTitle title="Moods" subtitle={state.data ? `${moods.length} moods` : undefined} />
      <SearchInput value={filter} onChange={setFilter} placeholder="Filter moods" />
      {state.loading && <Loading />}
      {state.error && <ErrorBox message={state.error} onRetry={state.reload} />}
      {state.data && moods.length === 0 && (
        <Empty>{filter ? 'No moods match' : 'No mood tags in this library'}</Empty>
      )}
      <BrowseGrid>
        {moods.map(([mood, count]) => (
          <BrowseCard
            key={mood}
            seed={{ kind: 'mood', value: mood }}
            name={capitalize(mood)}
            subtitle={`${count} album${count === 1 ? '' : 's'}`}
            onOpen={() => nav.go({ name: 'mood', value: mood })}
            onPlay={() => (client && state.data ? playMood(client, state.data, mood) : undefined)}
          />
        ))}
      </BrowseGrid>
    </div>
  )
}

export function MoodView({ value }: { value: string }) {
  const client = useClient()
  const state = useAlbums()
  const [query, setQuery] = useState('')

  const albums = useMemo(() => (state.data ?? []).filter((a) => hasMood(a, value)), [state.data, value])
  const { cover, color } = useBrowseArt({ kind: 'mood', value }, capitalize(value))
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return albums
    return albums.filter((a) => `${a.name} ${a.artist ?? ''}`.toLowerCase().includes(q))
  }, [albums, query])

  const playAll = async (shuffle: boolean): Promise<void> => {
    if (client) await playMood(client, albums, value, shuffle)
  }

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />

  return (
    <div>
      <PageTitle
        eyebrow="Mood"
        title={capitalize(value)}
        color={color}
        cover={<BrowseCover cover={cover} />}
        subtitle={`${albums.length} album${albums.length === 1 ? '' : 's'}`}
        search={{ value: query, onChange: setQuery, placeholder: 'Search in this mood' }}
        play={{ onClick: () => playAll(false), disabled: !albums.length, from: moodRecent(value).key }}
        actions={
          <ActionIcon title="Shuffle" onClick={() => playAll(true)} disabled={!albums.length}>
            <Shuffle size={28} />
          </ActionIcon>
        }
      />
      {shown.length === 0 ? (
        <Empty>No albums match</Empty>
      ) : (
        <CardGrid>{shown.map((a) => <AlbumCard key={a.id} album={a} />)}</CardGrid>
      )}
    </div>
  )
}
