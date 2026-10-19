import { useMemo, useState } from 'react'
import type { Genre } from '@shared/subsonic/types'
import { capitalize } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { BrowseCard, BrowseCover, BrowseGrid, useBrowseArt } from '../components/TagArt'
import { TrackPage } from '../components/TrackPage'
import { Empty, ErrorBox, Loading, PageTitle, SearchInput } from '../components/ui'
import { nav } from '../nav'
import { recentOf, playFrom } from '../recents'
import { useAsync } from '../useAsync'

const genreRecent = (value: string) => recentOf({ name: 'genre', value }, capitalize(value), 'Genre')

function GenreCard({ genre }: { genre: Genre }) {
  const client = useClient()
  const name = capitalize(genre.value)
  return (
    <BrowseCard
      seed={{ kind: 'genre', value: genre.value }}
      name={name}
      subtitle={`${genre.songCount ?? 0} song${genre.songCount === 1 ? '' : 's'}`}
      onOpen={() => nav.go({ name: 'genre', value: genre.value })}
      onPlay={async () => {
        const songs = await client?.getSongsByGenre(genre.value)
        if (songs?.length) playFrom(songs, 0, genreRecent(genre.value))
      }}
    />
  )
}

export function Genres() {
  const client = useClient()
  const state = useAsync('genres', () => client?.getGenres(), [client])
  const [filter, setFilter] = useState('')
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (state.data ?? [])
      .filter((g) => g.value && (!q || g.value.toLowerCase().includes(q)))
      .sort((a, b) => (b.songCount ?? 0) - (a.songCount ?? 0))
  }, [state.data, filter])

  return (
    <div>
      <PageTitle title="Genres" subtitle={state.data ? `${state.data.length} genres` : undefined} />
      <SearchInput value={filter} onChange={setFilter} placeholder="Filter genres" />
      {state.loading && <Loading />}
      {state.error && <ErrorBox message={state.error} onRetry={state.reload} />}
      {state.data && filtered.length === 0 && <Empty>No genres match</Empty>}
      <BrowseGrid>{filtered.map((g) => <GenreCard key={g.value} genre={g} />)}</BrowseGrid>
    </div>
  )
}

export function GenreView({ value }: { value: string }) {
  const client = useClient()
  const state = useAsync(`genre:${value}`, () => client?.getSongsByGenre(value), [client, value])
  const { cover, color } = useBrowseArt({ kind: 'genre', value }, capitalize(value))
  return (
    <TrackPage
      eyebrow="Genre"
      title={capitalize(value)}
      state={state}
      origin={genreRecent(value)}
      color={color}
      cover={<BrowseCover cover={cover} />}
    />
  )
}
