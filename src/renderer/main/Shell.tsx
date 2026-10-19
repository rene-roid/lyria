import { useEffect, useLayoutEffect, useRef } from 'react'
import { nav, useNav, type View } from './nav'
import { TitleBar } from './TitleBar'
import { Sidebar } from './Sidebar'
import { NowPlayingBar } from './NowPlayingBar'
import { QueuePanel } from './views/QueuePanel'
import { LyricsView } from './views/LyricsView'
import { Home } from './views/Home'
import { Albums } from './views/Albums'
import { Soundtracks } from './views/Soundtracks'
import { Artists } from './views/Artists'
import { Genres, GenreView } from './views/Genres'
import { Moods, MoodView } from './views/Moods'
import { MixView, MixesView, SavedMixView } from './views/Mixes'
import { ArtistView } from './views/ArtistView'
import { AlbumView } from './views/AlbumView'
import { PlaylistView } from './views/PlaylistView'
import { NewPlaylistDialog } from './components/NewPlaylistDialog'
import { SearchView } from './views/SearchView'
import { Favorites } from './views/Favorites'
import { SettingsView } from './views/SettingsView'
import { player, usePlayerStore } from '@renderer/shared/playerStore'

function Content() {
  const view = useNav((s) => s.view)
  switch (view.name) {
    case 'home':
      return <Home />
    case 'albums':
      return <Albums initialSort={view.sort} />
    case 'soundtracks':
      return <Soundtracks />
    case 'artists':
      return <Artists />
    case 'genres':
      return <Genres />
    case 'genre':
      return <GenreView value={view.value} />
    case 'moods':
      return <Moods />
    case 'mood':
      return <MoodView value={view.value} />
    case 'mix':
      return <MixView value={view.value} kind={view.kind} />
    case 'mixes':
      return <MixesView />
    case 'savedMix':
      return <SavedMixView id={view.id} />
    case 'artist':
      return <ArtistView id={view.id} />
    case 'album':
      return <AlbumView id={view.id} discIds={view.discIds} />
    case 'playlist':
      return <PlaylistView id={view.id} />
    case 'search':
      return <SearchView query={view.query} />
    case 'favorites':
      return <Favorites />
    case 'settings':
      return <SettingsView />
  }
}

/**
 * Where each page was scrolled to. Keyed by the history entry itself, which back and forward hand
 * back as the same object, so returning to a page lands where it was left while opening the same
 * page afresh starts at the top.
 */
const scrolls = new WeakMap<View, number>()

/** The scrolling content panel, put back where it was on back and forward. */
function Page() {
  const view = useNav((s) => s.view)
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const target = scrolls.get(view)
    if (!el || !target) return
    // A page usually paints before all its rows have, so keep at it for a moment as it grows,
    // and give up the instant the user scrolls themselves.
    let raf = 0
    let frames = 0
    const restore = (): void => {
      el.scrollTop = target
      if (Math.abs(el.scrollTop - target) > 1 && frames++ < 90) raf = requestAnimationFrame(restore)
    }
    const stop = (): void => cancelAnimationFrame(raf)
    restore()
    el.addEventListener('wheel', stop, { passive: true })
    el.addEventListener('pointerdown', stop)
    return () => {
      stop()
      el.removeEventListener('wheel', stop)
      el.removeEventListener('pointerdown', stop)
    }
  }, [view])
  return (
    // isolate: page headers paint their colour band behind the content with a negative z-index.
    <div
      ref={ref}
      key={JSON.stringify(view)}
      data-scroll
      onScroll={(e) => scrolls.set(view, e.currentTarget.scrollTop)}
      className="relative isolate h-full overflow-y-auto p-6 pb-10"
    >
      <Content />
    </div>
  )
}

/** Ctrl+K, Ctrl+L or / jumps to the search box, as in Spotify and most browsers. */
const focusSearch = (): void => {
  const box = document.getElementById('search') as HTMLInputElement | null
  box?.focus()
  box?.select()
}

export function Shell() {
  const showQueue = useNav((s) => s.showQueue)
  const showLyrics = useNav((s) => s.showLyrics)

  // Space toggles playback unless typing in an input; see the handlers for the rest.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (e.ctrlKey && (e.code === 'KeyK' || e.code === 'KeyL')) {
        e.preventDefault()
        return focusSearch()
      }
      if (e.altKey && e.code === 'ArrowLeft') return nav.back()
      if (e.altKey && e.code === 'ArrowRight') return nav.forward()
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.key === '/') {
        e.preventDefault()
        focusSearch()
      } else if (e.key === 'Escape') {
        const { showLyrics, showQueue } = useNav.getState()
        if (showLyrics) nav.toggleLyrics()
        else if (showQueue) nav.toggleQueue()
      } else if (e.code === 'Space') {
        e.preventDefault()
        player.toggle()
      } else if (e.ctrlKey && e.code === 'ArrowRight') player.next()
      else if (e.ctrlKey && e.code === 'ArrowLeft') player.prev()
      else if (e.ctrlKey && e.code === 'ArrowUp') player.setVolume(Math.min(1, usePlayerStore.getState().volume + 0.05))
      else if (e.ctrlKey && e.code === 'ArrowDown') player.setVolume(Math.max(0, usePlayerStore.getState().volume - 0.05))
    }
    // The side buttons on a mouse go back and forward, as they do in a browser.
    const onMouse = (e: MouseEvent): void => {
      if (e.button === 3) nav.back()
      else if (e.button === 4) nav.forward()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [])

  return (
    <div className="flex h-full flex-col bg-surface">
      <TitleBar />
      <div className="flex min-h-0 flex-1 gap-2 px-2">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-hidden rounded-lg bg-surface-2">
          <Page />
          {showLyrics && <LyricsView />}
        </main>
        {showQueue && <QueuePanel />}
      </div>
      <NowPlayingBar />
      <NewPlaylistDialog />
    </div>
  )
}
