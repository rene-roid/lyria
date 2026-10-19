import { ChevronLeft, ChevronRight, Home, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SubsonicClient } from '@shared/subsonic/client'
import { useClient, useSessionStore } from '@renderer/shared/sessionStore'
import { nav, useNav } from './nav'

/** How often the server is pinged to refresh the connectivity dot. */
const PING_MS = 30_000

/** true = server answered, false = unreachable, undefined = not checked yet. */
function useServerStatus(client: SubsonicClient | null): boolean | undefined {
  const [ok, setOk] = useState<boolean>()

  useEffect(() => {
    setOk(undefined)
    if (!client) return
    let cancelled = false
    const check = (): void => {
      void client.ping().then(
        () => !cancelled && setOk(true),
        () => !cancelled && setOk(false)
      )
    }
    const offline = (): void => setOk(false)
    check()
    const id = setInterval(check, PING_MS)
    window.addEventListener('online', check)
    window.addEventListener('offline', offline)
    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('online', check)
      window.removeEventListener('offline', offline)
    }
  }, [client])

  return ok
}

/** navidroid's profile button: the user's initial, opening Settings, with the server's status on it. */
function Avatar() {
  const client = useClient()
  const username = useSessionStore((s) => s.session?.username) ?? ''
  const ok = useServerStatus(client)
  const active = useNav((s) => s.view.name === 'settings')
  const status = ok === undefined ? 'Checking server…' : ok ? 'Connected' : 'Server unreachable'
  return (
    <button
      onClick={() => nav.go({ name: 'settings' })}
      title={`${username || 'Settings'} · ${status}`}
      className={`relative flex h-8 w-8 items-center justify-center rounded-full bg-[#e1118c] text-sm font-extrabold transition hover:scale-105 ${
        active ? 'ring-2 ring-white' : ''
      }`}
    >
      {username.charAt(0).toUpperCase() || '?'}
      <span
        role="status"
        aria-label={status}
        className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-surface ${
          ok === undefined ? 'bg-white/40' : ok ? 'bg-accent' : 'bg-red-400'
        }`}
      />
    </button>
  )
}

export function TitleBar() {
  const cursor = useNav((s) => s.cursor)
  const historyLength = useNav((s) => s.history.length)
  const view = useNav((s) => s.view)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (view.name !== 'search') setQuery('')
  }, [view])

  useEffect(() => {
    if (!query.trim()) return
    const t = window.setTimeout(() => {
      const current = useNav.getState().view
      if (current.name === 'search') {
        useNav.setState((s) => {
          const history = [...s.history]
          history[s.cursor] = { name: 'search', query: query.trim() }
          return { history, view: history[s.cursor] }
        })
      } else {
        nav.go({ name: 'search', query: query.trim() })
      }
    }, 250)
    return () => window.clearTimeout(t)
  }, [query])

  return (
    <header className="drag grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 bg-surface pl-4 pr-[140px]">
      <div className="flex items-center gap-2">
        <div className="mr-3 text-[15px] font-extrabold tracking-tight">Sonora</div>
        <div className="no-drag flex items-center gap-1">
          <button className="icon-btn h-8 w-8 rounded-full" onClick={nav.back} disabled={cursor === 0} title="Back">
            <ChevronLeft size={22} />
          </button>
          <button
            className="icon-btn h-8 w-8 rounded-full"
            onClick={nav.forward}
            disabled={cursor >= historyLength - 1}
            title="Forward"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </div>
      <div className="no-drag flex items-center gap-2">
        <button
          onClick={() => nav.go({ name: 'home' })}
          title="Home"
          className={`flex h-10 w-10 items-center justify-center rounded-full bg-[#1f1f1f] transition hover:scale-105 ${
            view.name === 'home' ? 'text-ink' : 'text-ink-2 hover:text-ink'
          }`}
        >
          <Home size={22} />
        </button>
        <div className="group relative w-[min(480px,36vw)]">
          <Search
            size={20}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-2 group-focus-within:text-ink"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('')
            }}
            id="search"
            placeholder="What do you want to play?"
            spellCheck={false}
            className="h-10 w-full rounded-full border border-transparent bg-[#1f1f1f] pr-9 pl-11 text-[15px] text-ink outline-none transition placeholder:text-ink-2 hover:border-white/10 hover:bg-[#2a2a2a] focus:border-white"
          />
          {query && (
            <button
              className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-2 hover:text-ink"
              onClick={() => setQuery('')}
              title="Clear"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      <div className="no-drag flex items-center justify-end">
        <Avatar />
      </div>
    </header>
  )
}
