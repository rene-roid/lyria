import {
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Film,
  Heart,
  Home,
  Library as LibraryIcon,
  Mic2,
  Plus,
  Search,
  Smile,
  Sparkles,
  Tags,
  Volume2
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { downloadKey, viewKey } from '@shared/types'
import { MIX_SECTIONS } from '@shared/navimix'
import { Cover } from '@renderer/shared/Cover'
import { useClient } from '@renderer/shared/sessionStore'
import { nav, useNav, type View } from './nav'
import { playlists, savedFirst, useSavedPlaylists, useServerPlaylists } from './playlists'
import { useSavedMixes } from './savedMixes'
import { useDownload } from './downloads'
import { allAlbums } from './albumList'
import { useAsync } from './useAsync'
import { usePlayingState } from './recents'
import { Chip } from './components/ui'
import { LikedCover } from './components/AlbumCard'
import { ServerMixCover } from './components/MixCover'
import { TagArt } from './components/TagArt'

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

function LibraryRow({
  view,
  art,
  title,
  subtitle,
  saved
}: {
  view: View
  art: ReactNode
  title: string
  subtitle: string
  /** Marked with navidroid's little green heart: hearted here, or starred on the server. */
  saved?: boolean
}) {
  const active = useNav((s) => viewKey(s.view) === viewKey(view))
  const { current, playing } = usePlayingState(viewKey(view))
  const download = useDownload(
    view.name === 'playlist' ? downloadKey('playlist', view.id) : view.name === 'savedMix' ? downloadKey('mix', view.id) : ''
  )
  const downloaded = download && download.done >= download.trackIds.length
  return (
    <button
      onClick={() => nav.go(view)}
      // The Albums and Artists shelves are the whole library, so rows off screen are skipped.
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 64px' }}
      className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition ${
        active ? 'bg-white/10 hover:bg-white/[0.14]' : 'hover:bg-white/[0.07]'
      }`}
    >
      {art}
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[15px] ${current ? 'text-accent' : ''}`} title={title}>
          {title}
        </div>
        <div className="flex items-center gap-1 text-[13px] text-ink-2">
          {saved && <Heart size={12} fill="currentColor" className="shrink-0 text-accent" aria-label="Saved" />}
          {download && (
            <span
              className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-full ${
                downloaded ? 'bg-accent text-black' : 'border border-ink-3 text-ink-3'
              }`}
              aria-label={downloaded ? 'Downloaded' : 'Downloading'}
            >
              <ArrowDown size={9} strokeWidth={3} />
            </span>
          )}
          <span className="truncate">{subtitle}</span>
        </div>
      </div>
      {playing && <Volume2 size={16} className="mr-1 shrink-0 text-accent" aria-label="Playing" />}
    </button>
  )
}

const Thumb = ({ children }: { children: ReactNode }) => (
  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md">{children}</div>
)

const Group = ({ title }: { title: string }) => <div className="px-2 pt-3 pb-1 text-[13px] font-bold">{title}</div>

const Hint = ({ children }: { children: ReactNode }) => <div className="px-2 py-2 text-xs text-ink-3">{children}</div>

/**
 * One line of chips that scrolls sideways when it does not fit, as in Spotify's library: the wheel
 * scrolls it, an arrow over a fade pages it from whichever edge is cut off, and a chip that is
 * picked slides fully into view.
 */
function ChipRow({ children }: { children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const measure = (): void => {
    const el = row.current
    if (el) setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 })
  }
  useEffect(() => {
    const el = row.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const page = (dir: number): void => row.current?.scrollBy({ left: dir * 140, behavior: 'smooth' })
  return (
    <div className="relative mx-4 mb-2">
      <div
        ref={row}
        onScroll={measure}
        // A mouse wheel only turns vertically; a touchpad's sideways swipe already scrolls natively.
        onWheel={(e) => {
          if (row.current && !e.deltaX) row.current.scrollLeft += e.deltaY
        }}
        onClickCapture={(e) =>
          (e.target as HTMLElement).closest('button')?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
        }
        className="flex gap-2 overflow-x-auto [scrollbar-width:none]"
      >
        {children}
      </div>
      {edges.left && <ChipEdge side="left" onClick={() => page(-1)} />}
      {edges.right && <ChipEdge side="right" onClick={() => page(1)} />}
    </div>
  )
}

function ChipEdge({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 flex w-14 items-center ${
        side === 'left' ? 'left-0 justify-start bg-gradient-to-r' : 'right-0 justify-end bg-gradient-to-l'
      } from-surface-2 from-40% to-transparent`}
    >
      <button
        onClick={onClick}
        aria-label={side === 'left' ? 'Scroll the chips left' : 'Scroll the chips right'}
        className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-surface-3 text-ink shadow-md transition hover:scale-105 hover:bg-[#3e3e3e]"
      >
        <Icon size={16} />
      </button>
    </div>
  )
}

type Shelf = 'playlists' | 'mixes' | 'albums' | 'artists'

const SHELVES: { key: Shelf; label: string }[] = [
  { key: 'playlists', label: 'Playlists' },
  { key: 'mixes', label: 'Mixes' },
  { key: 'albums', label: 'Albums' },
  { key: 'artists', label: 'Artists' }
]

/**
 * The web UI's "Your Library", with navidroid's heart filter in front of the chips: off, a shelf
 * is everything with the saved things first; on, it is only the saved ones. Saved means hearted
 * here for playlists and mixes, and starred on the server for albums and artists.
 */
function Library() {
  const client = useClient()
  const [shelf, setShelf] = useState<Shelf>('playlists')
  const [onlySaved, setOnlySaved] = useState(false)
  // null while the filter box is folded away behind its icon.
  const [query, setQuery] = useState<string | null>(null)
  const lists = useServerPlaylists()
  const saved = useSavedPlaylists()
  const keptMixes = useSavedMixes()
  const starred = useAsync('starred', () => client?.getStarred2(), [client, shelf])
  const wantAll = !onlySaved && (shelf === 'albums' || shelf === 'artists')
  // Not cached under a key: the album list is megabytes, and allAlbums already holds it in memory.
  const albums = useAsync(
    undefined,
    () => (wantAll && shelf === 'albums' && client ? allAlbums(client) : undefined),
    [client, wantAll, shelf]
  )
  const artists = useAsync(
    'artists',
    () => (wantAll && shelf === 'artists' ? client?.getArtists() : undefined),
    [client, wantAll, shelf]
  )

  const q = query?.trim().toLowerCase() ?? ''
  const match = (s: string): boolean => !q || s.toLowerCase().includes(q)
  const keep = <T extends { id: string; name: string }>(items: T[], isSaved: (t: T) => boolean): T[] =>
    items.filter((t) => match(t.name) && (!onlySaved || isSaved(t)))
  /** Starred first, then the rest of the library without them. */
  const withStarred = <T extends { id: string; name: string }>(star: T[] = [], all: T[] = []): T[] => {
    const ids = new Set(star.map((t) => t.id))
    return keep([...star, ...(onlySaved ? [] : all.filter((t) => !ids.has(t.id)))], (t) => ids.has(t.id))
  }
  const starredIds = new Set([...(starred.data?.albums ?? []), ...(starred.data?.artists ?? [])].map((t) => t.id))
  const liked = starred.data?.songs.length

  const own = keep(savedFirst(lists.own, saved), (p) => saved.includes(p.id))
  const mixes = keep(savedFirst(lists.mixes, saved), (p) => saved.includes(p.id))
  const kept = keptMixes.filter((m) => match(m.title))
  const albumRows = withStarred(starred.data?.albums, albums.data)
  const artistRows = withStarred(starred.data?.artists, artists.data)
  const browse = shelf === 'albums' ? { rows: albumRows, state: albums } : { rows: artistRows, state: artists }

  return (
    <section className="flex min-h-[140px] flex-1 flex-col rounded-lg bg-surface-2">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-3 text-[15px] font-bold text-ink-2">
          <LibraryIcon size={22} /> Your Library
        </div>
        <div className="flex items-center">
          <button
            className={`icon-btn h-8 w-8 rounded-full ${query !== null ? 'text-ink' : ''}`}
            title="Search in Your Library"
            aria-pressed={query !== null}
            onClick={() => setQuery(query === null ? '' : null)}
          >
            <Search size={18} />
          </button>
          <button
            className="icon-btn h-8 w-8 rounded-full"
            title="New playlist"
            disabled={!client}
            onClick={() => playlists.newPlaylist()}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
      <ChipRow>
        <Chip active={onlySaved} onClick={() => setOnlySaved(!onlySaved)} title="Only saved">
          <Heart size={14} fill={onlySaved ? 'currentColor' : 'none'} className="my-0.5" />
        </Chip>
        {SHELVES.map((s) => (
          <Chip key={s.key} active={shelf === s.key} onClick={() => setShelf(s.key)}>
            {s.label}
          </Chip>
        ))}
      </ChipRow>
      {query !== null && (
        <div className="px-4 pb-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => !query && setQuery(null)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery(null)}
            placeholder="Search in Your Library"
            spellCheck={false}
            className="h-8 w-full rounded bg-white/10 px-3 text-[13px] text-ink outline-none placeholder:text-ink-2"
          />
        </div>
      )}
      {/* Keyed, so switching shelves starts the new one at the top. */}
      <div key={`${shelf}:${onlySaved}`} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {lists.error && (
          <div className="px-2 py-2 text-xs text-red-300">
            <div>{lists.error}</div>
            <button className="mt-1.5 rounded-md bg-white/10 px-2 py-1 text-ink hover:bg-white/15" onClick={lists.reload}>
              Retry
            </button>
          </div>
        )}
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
            {lists.loading && <Hint>Loading…</Hint>}
            {own.map((p) => (
              <LibraryRow
                key={p.id}
                view={{ name: 'playlist', id: p.id }}
                art={<Cover id={p.coverArt} size={96} className="h-12 w-12" />}
                title={p.name}
                subtitle={`Playlist • ${p.owner ?? `${p.songCount ?? 0} songs`}`}
                saved={saved.includes(p.id)}
              />
            ))}
            {onlySaved && !lists.loading && own.length === 0 && <Hint>Hit the heart on a playlist to keep it here.</Hint>}
          </>
        )}
        {shelf === 'mixes' && (
          <>
            {MIX_SECTIONS.map(({ key, title }) => {
              const group = mixes.filter((m) => m.mix.section === key)
              if (!group.length) return null
              return (
                <div key={key}>
                  <Group title={title} />
                  {group.map((p) => (
                    <LibraryRow
                      key={p.id}
                      view={{ name: 'playlist', id: p.id }}
                      art={
                        <Thumb>
                          <ServerMixCover mix={p.mix} coverArt={p.coverArt} />
                        </Thumb>
                      }
                      title={p.mix.title}
                      subtitle={`Mix • ${p.mix.by}`}
                      saved={saved.includes(p.id)}
                    />
                  ))}
                </div>
              )
            })}
            {kept.length > 0 && <Group title="Kept from Lyria" />}
            {kept.map((m) => (
              <LibraryRow
                key={m.id}
                view={{ name: 'savedMix', id: m.id }}
                art={
                  <Thumb>
                    <TagArt art={{ style: 'mix', seed: m.seed }} name={m.title} fallback={m.tracks[0]?.coverArt} />
                  </Thumb>
                }
                title={m.title}
                subtitle="Mix • Lyria"
                saved
              />
            ))}
            {!lists.loading && mixes.length + kept.length === 0 && (
              <Hint>
                {onlySaved
                  ? 'Hit the heart on a mix to keep it here.'
                  : q
                    ? 'Nothing matches'
                    : 'No NaviBeat or Explo mixes on this server yet.'}
              </Hint>
            )}
          </>
        )}
        {shelf === 'albums' &&
          albumRows.map((a) => (
            <LibraryRow
              key={a.id}
              view={{ name: 'album', id: a.id }}
              art={<Cover id={a.coverArt ?? a.id} size={96} className="h-12 w-12" />}
              title={a.name}
              subtitle={`Album • ${a.artist ?? 'Unknown artist'}`}
              saved={starredIds.has(a.id)}
            />
          ))}
        {shelf === 'artists' &&
          artistRows.map((a) => (
            <LibraryRow
              key={a.id}
              view={{ name: 'artist', id: a.id }}
              art={<Cover id={a.coverArt ?? a.id} size={96} className="h-12 w-12" rounded="rounded-full" />}
              title={a.name}
              subtitle="Artist"
              saved={starredIds.has(a.id)}
            />
          ))}
        {(shelf === 'albums' || shelf === 'artists') && (
          <>
            {wantAll && browse.state.loading && <Hint>Loading…</Hint>}
            {starred.data && !browse.state.loading && browse.rows.length === 0 && (
              <Hint>{q ? 'Nothing matches' : `${shelf === 'albums' ? 'Albums' : 'Artists'} starred on the server show up here.`}</Hint>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/** The menu's height as last dragged; absent means it fits its links. */
const NAV_HEIGHT = 'lyria.navHeight'
/** Shortest the menu may be dragged to: one link and its padding. */
const NAV_MIN = 56
/** A step of the arrow keys on the handle. */
const NAV_STEP = 16

function savedNavHeight(): number | undefined {
  return Number(localStorage.getItem(NAV_HEIGHT)) || undefined
}

/**
 * The web UI's split between the menu and Your Library: drag the gap between them, or focus it
 * and use the arrow keys, and double-click to put it back. The menu scrolls once it is shorter
 * than its links, and gives way to the library when the window is too short for both.
 */
export function Sidebar() {
  const nav = useRef<HTMLElement>(null)
  const [height, setHeight] = useState(savedNavHeight)
  const drag = useRef<{ y: number; from: number } | null>(null)

  const resize = (h: number): void => {
    const el = nav.current
    if (!el) return
    // No taller than its links: past that the menu is just empty panel.
    const next = Math.round(Math.min(Math.max(h, NAV_MIN), el.scrollHeight))
    setHeight(next)
    localStorage.setItem(NAV_HEIGHT, String(next))
  }
  const reset = (): void => {
    setHeight(undefined)
    localStorage.removeItem(NAV_HEIGHT)
  }

  return (
    <aside className="flex w-[280px] shrink-0 flex-col">
      <nav
        ref={nav}
        style={height ? { height } : undefined}
        className="min-h-14 overflow-y-auto rounded-lg bg-surface-2 px-2 py-2"
      >
        <NavItem view={{ name: 'home' }} icon={<Home size={22} />} label="Home" />
        <NavItem view={{ name: 'albums' }} icon={<Disc3 size={22} />} label="Albums" />
        <NavItem view={{ name: 'soundtracks' }} icon={<Film size={22} />} label="Soundtracks" />
        <NavItem view={{ name: 'artists' }} icon={<Mic2 size={22} />} label="Artists" />
        <NavItem view={{ name: 'mixes' }} icon={<Sparkles size={22} />} label="Mixes" />
        <NavItem view={{ name: 'genres' }} icon={<Tags size={22} />} label="Genres" />
        <NavItem view={{ name: 'moods' }} icon={<Smile size={22} />} label="Moods" />
      </nav>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Drag to resize, double-click to reset"
        title="Drag to resize, double-click to reset"
        tabIndex={0}
        className="group flex h-2 shrink-0 cursor-row-resize items-center px-3 outline-none"
        onPointerDown={(e) => {
          if (e.button !== 0 || !nav.current) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { y: e.clientY, from: nav.current.getBoundingClientRect().height }
        }}
        onPointerMove={(e) => drag.current && resize(drag.current.from + e.clientY - drag.current.y)}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={reset}
        onKeyDown={(e) => {
          const from = nav.current?.getBoundingClientRect().height ?? 0
          if (e.key === 'ArrowUp') resize(from - NAV_STEP)
          else if (e.key === 'ArrowDown') resize(from + NAV_STEP)
          else if (e.key === 'Home') resize(NAV_MIN)
          else if (e.key === 'End' || e.key === 'Enter') reset()
          else return
          e.preventDefault()
        }}
      >
        {/* A hairline that shows where to grab, on hover and while focused. */}
        <div className="h-0.5 w-full rounded-full bg-white/0 transition group-hover:bg-white/25 group-focus-visible:bg-white/40" />
      </div>
      <Library />
    </aside>
  )
}
