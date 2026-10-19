import { Shuffle } from 'lucide-react'
import { useMemo } from 'react'
import { useClient } from '@renderer/shared/sessionStore'
import { Cover, useCoverColor } from '@renderer/shared/Cover'
import { AlbumCard, CardGrid } from '../components/AlbumCard'
import { TrackList } from '../components/TrackList'
import { ActionIcon, Empty, ErrorBox, Loading, PageTitle, SectionHeader } from '../components/ui'
import { artistTracks, recentOf, playFrom } from '../recents'
import { useAsync } from '../useAsync'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export function ArtistView({ id }: { id: string }) {
  const client = useClient()
  const state = useAsync(`artist:${id}`, () => client?.getArtist(id), [client, id])
  const name = state.data?.name
  // Songs credited to the artist anywhere, for the ones off their own albums: guest spots on
  // compilations and singles, which is all some artists have.
  const credited = useAsync(
    `artistSongs:${id}`,
    () => (client && name ? client.getArtistSongs(id, name) : undefined),
    [client, id, name]
  )
  const color = useCoverColor(state.data?.coverArt ?? state.data?.id)
  const elsewhere = useMemo(() => {
    const own = new Set(state.data?.album.map((a) => a.id))
    return (credited.data ?? []).filter((t) => !t.albumId || !own.has(t.albumId))
  }, [state.data, credited.data])

  if (state.loading) return <Loading />
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />
  if (!state.data) return null
  const artist = state.data
  const albums = [...artist.album].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  const origin = recentOf({ name: 'artist', id }, artist.name, 'Artist', artist.coverArt ?? id)

  const playAll = async (shuffle: boolean): Promise<void> => {
    if (!client) return
    const songs = await artistTracks(client, artist)
    if (shuffle)
      for (let i = songs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[songs[i], songs[j]] = [songs[j], songs[i]]
      }
    if (songs.length) playFrom(songs, 0, origin)
  }

  const songs = elsewhere.length > 0 && (
    <section className="mb-8">
      <SectionHeader title={albums.length ? 'Appears on' : 'Songs'} />
      <TrackList tracks={elsewhere} origin={origin} />
    </section>
  )

  return (
    <div>
      <PageTitle
        eyebrow="Artist"
        title={artist.name}
        color={color}
        subtitle={[albums.length && plural(albums.length, 'album'), elsewhere.length && `${plural(elsewhere.length, 'song')}${albums.length ? ' elsewhere' : ''}`]
          .filter(Boolean)
          .join(' • ')}
        cover={<Cover id={artist.coverArt ?? artist.id} size={400} className="h-52 w-52" rounded="rounded-full" />}
        play={{ onClick: () => playAll(false), from: origin.key }}
        actions={
          <ActionIcon title="Shuffle" onClick={() => playAll(true)}>
            <Shuffle size={28} />
          </ActionIcon>
        }
      />
      {/* An artist who only guests elsewhere leads with those songs; one with albums leads with the albums. */}
      {albums.length === 0 && songs}
      {albums.length > 0 && (
        <section className="mb-8">
          <SectionHeader title="Discography" />
          <CardGrid>{albums.map((a) => <AlbumCard key={a.id} album={{ ...a, artist: a.artist ?? artist.name }} />)}</CardGrid>
        </section>
      )}
      {albums.length > 0 && songs}
      {albums.length === 0 && !elsewhere.length && (credited.loading ? <Loading /> : <Empty>Nothing by {artist.name} in your library</Empty>)}
    </div>
  )
}
