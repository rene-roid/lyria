import { Disc3, Film, Home, Library as LibraryIcon, Mic2, Plus, Search, Smile, Sparkles, Tags } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { viewKey } from '@shared/types'
import { Cover } from '@renderer/shared/Cover'
import { useClient } from '@renderer/shared/sessionStore'
import { nav, useNav, type View } from './nav'
import { playlists, usePlaylistsRevision } from './playlists'
import { useAsync } from './useAsync'
import { Chip } from './components/ui'
import { LikedCover } from './components/AlbumCard'

function NavItem({ view, icon, label }: { view: View; icon: ReactNode; label: string }) {
  const active = useNav((s) => s.view.name === view.name)
  return (
    <button
      onClick={() => nav.go(view)}
      className={`flex h-10 w-full items-center gap-4 rounded-md px-3 text-left text-[15px] font-bold transition ${
        active ? 'text-ink' : 'text-ink-2 hover:text-ink'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function LibraryRow({ view, art, title, subtitle }: { view: View; art: ReactNode; title: string; subtitle: string }) {
  const active = useNav((s) => viewKey(s.view) === viewKey(view))
  return (
    <button
      onClick={() => nav.go(view)}
      className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition ${
        active ? 'bg-white/10 hover:bg-white/[0.14]' : 'hover:bg-white/[0.07]'
      }`}
    >
      {art}
      <div className="min-w-0">
        <div className="truncate text-[15px]">{title}</div>
        <div className="truncate text-[13px] text-ink-2">{subtitle}</div>
      </div>
    </button>
  )
}

type Shelf = 'playlists' | 'albums' | 'artists'

const SHELVES: { key: Shelf; label: string }[] = [
  { key: 'playlists', label: 'Playlists' },
  { key: 'albums', label: 'Albums' },
  { key: 'artists', label: 'Artists' }
]

/** The web UI's "Your Library": playlists, or the albums and artists starred on the server. */
function Library() {
  const client = useClient()
  const revision = usePlaylistsRevision()
  const [shelf, setShelf] = useState<Shelf>('playlists')
  // null while the filter box is folded away behind its icon.
  const [query, setQuery] = useState<string | null>(null)
  const lists = useAsync('playlists', () => client?.getPlaylists(), [client, revision])
  const starred = useAsync('starred', () => client?.getStarred2(), [client, shelf])

  const q = query?.trim().toLowerCase() ?? ''
  const match = (s: string): boolean => !q || s.toLowerCase().includes(q)
  const albums = starred.data?.albums.filter((a) => match(a.name)) ?? []
  const artists = starred.data?.artists.filter((a) => match(a.name)) ?? []
  const liked = starred.data?.songs.length

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg bg-surface-2">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-3 text-[15px] font-bold text-ink-2">
          <LibraryIcon size={22} /> Your Library
        </div>
        <button
          className="icon-btn h-8 w-8 rounded-full"
          title="New playlist"
          disabled={!client}
          onClick={() => playlists.newPlaylist()}
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="flex gap-2 overflow-hidden px-4 pb-2">
        {SHELVES.map((s) => (
          <Chip key={s.key} active={shelf === s.key} onClick={() => setShelf(s.key)}>
            {s.label}
          </Chip>
        ))}
      </div>
      <div className="px-3 pb-1">
        {query === null ? (
          <button className="icon-btn h-8 w-8 rounded-full" title="Search in Your Library" onClick={() => setQuery('')}>
            <Search size={16} />
          </button>
        ) : (
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => !query && setQuery(null)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery(null)}
            placeholder="Search in Your Library"
            className="h-8 w-full rounded bg-white/10 px-3 text-[13px] text-ink outline-none placeholder:text-ink-2"
          />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {shelf === 'playlists' && (
          <>
            {match('Liked Songs') && (
              <LibraryRow
                view={{ name: 'favorites' }}
                art={<LikedCover className="h-12 w-12 rounded-md" />}
                title="Liked Songs"
                subtitle={liked === undefined ? 'Playlist' : `Playlist • ${liked} song${liked === 1 ? '' : 's'}`}
              />
            )}
            {lists.loading && <div className="px-2 py-2 text-xs text-ink-3">Loading…</div>}
            {lists.error && (
              <div className="px-2 py-2 text-xs text-red-300">
                <div>{lists.error}</div>
                <button className="mt-1.5 rounded-md bg-white/10 px-2 py-1 text-ink hover:bg-white/15" onClick={lists.reload}>
                  Retry
                </button>
              </div>
            )}
            {lists.data
              ?.filter((p) => match(p.name))
              .map((p) => (
                <LibraryRow
                  key={p.id}
                  view={{ name: 'playlist', id: p.id }}
                  art={<Cover id={p.coverArt} size={96} className="h-12 w-12" />}
                  title={p.name}
                  subtitle={`Playlist • ${p.owner ?? `${p.songCount ?? 0} songs`}`}
                />
              ))}
          </>
        )}
        {shelf === 'albums' &&
          albums.map((a) => (
            <LibraryRow
              key={a.id}
              view={{ name: 'album', id: a.id }}
              art={<Cover id={a.coverArt ?? a.id} size={96} className="h-12 w-12" />}
              title={a.name}
              subtitle={`Album • ${a.artist ?? 'Unknown artist'}`}
            />
          ))}
        {shelf === 'artists' &&
          artists.map((a) => (
            <LibraryRow
              key={a.id}
              view={{ name: 'artist', id: a.id }}
              art={<Cover id={a.coverArt ?? a.id} size={96} className="h-12 w-12" rounded="rounded-full" />}
              title={a.name}
              subtitle="Artist"
            />
          ))}
        {shelf !== 'playlists' && starred.data && (shelf === 'albums' ? albums : artists).length === 0 && (
          <div className="px-2 py-2 text-xs text-ink-3">
            {q ? 'Nothing matches' : `${shelf === 'albums' ? 'Albums' : 'Artists'} starred on the server show up here`}
          </div>
        )}
      </div>
    </section>
  )
}

export function Sidebar() {
  return (
    <aside className="flex w-[280px] shrink-0 flex-col gap-2">
      <nav className="rounded-lg bg-surface-2 px-2 py-2">
        <NavItem view={{ name: 'home' }} icon={<Home size={22} />} label="Home" />
        <NavItem view={{ name: 'albums' }} icon={<Disc3 size={22} />} label="Albums" />
        <NavItem view={{ name: 'soundtracks' }} icon={<Film size={22} />} label="Soundtracks" />
        <NavItem view={{ name: 'artists' }} icon={<Mic2 size={22} />} label="Artists" />
        <NavItem view={{ name: 'mixes' }} icon={<Sparkles size={22} />} label="Mixes" />
        <NavItem view={{ name: 'genres' }} icon={<Tags size={22} />} label="Genres" />
        <NavItem view={{ name: 'moods' }} icon={<Smile size={22} />} label="Moods" />
      </nav>
      <Library />
    </aside>
  )
}
