import { useMemo, useState } from 'react'
import type { Genre } from '@shared/subsonic/types'
import { capitalize } from '@shared/format'
import { useClient } from '@renderer/shared/sessionStore'
import { BrowseCard, BrowseGrid, TagArtCover, TagPill, TailSection, splitTail, useBrowseArt } from '../components/TagArt'
import { TrackPage } from '../components/TrackPage'
import { Empty, ErrorBox, Loading, PageTitle, SearchInput } from '../components/ui'
import { nav } from '../nav'
import { recentOf, playFrom } from '../recents'
import { useAsync } from '../useAsync'

/** Songs a genre needs for a tile of its own, past the first few; the rest are pills below. */
const TILE_SONGS = 10

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
  const [tiles, tail] = splitTail(filtered, (g) => g.songCount ?? 0, TILE_SONGS)

  return (
    <div>
      <PageTitle title="Genres" subtitle={state.data ? `${state.data.length} genres` : undefined} />
      <SearchInput value={filter} onChange={setFilter} placeholder="Filter genres" />
      {state.loading && <Loading />}
      {state.error && <ErrorBox message={state.error} onRetry={state.reload} />}
      {state.data && filtered.length === 0 && <Empty>No genres match</Empty>}
      <BrowseGrid>{tiles.map((g) => <GenreCard key={g.value} genre={g} />)}</BrowseGrid>
      {tail.length > 0 && (
        <TailSection title="More genres">
          {tail.map((g) => (
            <TagPill
              key={g.value}
              seed={{ kind: 'genre', value: g.value }}
              name={capitalize(g.value)}
              count={g.songCount ?? 0}
              onOpen={() => nav.go({ name: 'genre', value: g.value })}
            />
          ))}
        </TailSection>
      )}
    </div>
  )
}

export function GenreView({ value }: { value: string }) {
  const client = useClient()
  const state = useAsync(`genre:${value}`, () => client?.getSongsByGenre(value), [client, value])
  const seed = { kind: 'genre', value } as const
  const { color } = useBrowseArt(seed)
  return (
    <TrackPage
      eyebrow="Genre"
      title={capitalize(value)}
      state={state}
      origin={genreRecent(value)}
      color={color}
      cover={<TagArtCover art={{ style: 'genre', seed }} name={capitalize(value)} />}
    />
  )
}
