import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Pause, Play, Search } from 'lucide-react'
import { player } from '@renderer/shared/playerStore'
import { usePlayingState } from '../recents'

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-6 w-6 rounded-full border-2 border-white/15 border-t-accent ${className}`}
      style={{ animation: 'spin 0.8s linear infinite' }}
    />
  )
}

export function Loading() {
  return (
    <div className="flex h-48 items-center justify-center">
      <Spinner />
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-6 rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
      <div className="font-semibold">Something went wrong</div>
      <div className="mt-1 text-red-200/80">{message}</div>
      {onRetry && (
        <button className="mt-3 rounded-md bg-white/10 px-3 py-1 text-ink hover:bg-white/15" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function SectionHeader({ title, action, onMore }: { title: string; action?: ReactNode; onMore?: () => void }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 className="truncate text-2xl font-bold tracking-tight">{title}</h2>
      {action}
      {onMore && (
        <button className="shrink-0 text-sm font-bold text-ink-2 hover:underline" onClick={onMore}>
          Show all
        </button>
      )}
    </div>
  )
}

/** Long names step the heading down, so a soundtrack's full title still fits beside its cover. */
const titleSize = (t: string): string =>
  t.length > 48 ? 'text-3xl' : t.length > 28 ? 'text-5xl' : t.length > 14 ? 'text-6xl' : 'text-7xl'

/** What a header's play button does. `from` is the page's `viewKey`, so it can pause what it started. */
export interface PlayAction {
  onClick: () => void
  disabled?: boolean
  from?: string
}

/**
 * A page's heading. Given a `cover`, it is the web UI's collection header: the cover beside a huge
 * title on a band of `color` (the cover's own, see useCoverColor), which carries on darkened behind
 * the action row and fades into the panel. Without one it is a plain title for the browse pages.
 */
export function PageTitle(props: {
  eyebrow?: string
  title: string
  subtitle?: ReactNode
  cover?: ReactNode
  actions?: ReactNode
  play?: PlayAction
  /** A filter box for the page, at the far end of the action row. */
  search?: SearchProps
  color?: string
}) {
  const { eyebrow, title, subtitle, cover, actions } = props
  if (cover) return <Hero {...props} cover={cover} />
  return (
    <div className="mb-6">
      {eyebrow && <div className="text-sm font-medium text-ink-2">{eyebrow}</div>}
      <h1 className="truncate text-4xl font-extrabold tracking-tight">{title}</h1>
      {subtitle && <div className="mt-2 text-sm text-ink-2">{subtitle}</div>}
      {actions && <div className="mt-5 flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Height of the bar that takes over once the header has scrolled away. */
const BAR = 64

function Hero({
  eyebrow,
  title,
  subtitle,
  cover,
  actions,
  play,
  search,
  color = '#535353'
}: Parameters<typeof PageTitle>[0] & { cover: ReactNode }) {
  const strip = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  // Watch the action row against the page's scroll box: once it slides under the bar, show the bar.
  useEffect(() => {
    const el = strip.current
    const root = el?.closest('[data-scroll]')
    if (!el || !root) return
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { root, rootMargin: `-${BAR}px 0px 0px 0px` })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const band = { backgroundColor: color, transition: 'background-color 500ms' }
  return (
    <>
      {/* Zero height and stuck to the top, so it costs no room until it shows. Sticky offsets count
          from inside the page's padding, hence -top-6 to sit flush with the panel's edge. */}
      <div className="sticky -top-6 z-20 -mx-6 -mt-6 h-0">
        <div
          inert={!stuck}
          className={`absolute inset-x-0 top-0 flex items-center gap-3 px-6 transition-opacity duration-200 ${
            stuck ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          style={{ ...band, height: BAR, backgroundImage: 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5))' }}
        >
          {play && <PlayCircle {...play} small />}
          <div className="truncate text-2xl font-bold tracking-tight">{title}</div>
        </div>
      </div>
      <header
        className="-mx-6 flex items-end gap-6 px-6 pt-16 pb-6"
        style={{ ...band, backgroundImage: 'linear-gradient(transparent, rgba(0,0,0,0.5))' }}
      >
        {/* drop-shadow, not box-shadow: it follows the cover's shape, so a round artist photo gets a round one. */}
        <div className="shrink-0 drop-shadow-[0_8px_32px_rgba(0,0,0,0.5)]">{cover}</div>
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="text-sm font-medium">{eyebrow}</div>}
          <h1 className={`mt-1 mb-4 line-clamp-3 leading-[1.05] font-black tracking-tight break-words ${titleSize(title)}`}>
            {title}
          </h1>
          {subtitle && <div className="text-sm text-white/80">{subtitle}</div>}
        </div>
      </header>
      <div ref={strip} className="relative mb-4 flex min-h-8 items-center gap-5 pt-6 pb-4">
        <div
          className="pointer-events-none absolute -inset-x-6 top-0 -z-10 h-60"
          style={{ ...band, backgroundImage: 'linear-gradient(rgba(0,0,0,0.6), var(--color-surface-2))' }}
        />
        {play && <PlayCircle {...play} />}
        {actions}
        {search && <SearchInput {...search} inline />}
      </div>
    </>
  )
}

/**
 * The big round green play button of a collection header. Once the queue came from this page it
 * pauses and resumes it, rather than starting it over from the top.
 */
export function PlayCircle({
  onClick,
  disabled,
  from,
  small = false
}: PlayAction & { small?: boolean }) {
  const { current, playing } = usePlayingState(from)
  return (
    <button
      onClick={current ? player.toggle : onClick}
      disabled={disabled}
      title={playing ? 'Pause' : 'Play'}
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent text-black shadow-lg transition hover:scale-105 hover:bg-accent-2 active:scale-100 disabled:opacity-40 disabled:hover:scale-100 ${
        small ? 'h-12 w-12' : 'h-14 w-14'
      }`}
    >
      {playing ? (
        <Pause size={small ? 20 : 24} fill="currentColor" />
      ) : (
        <Play size={small ? 20 : 24} fill="currentColor" className="ml-0.5" />
      )}
    </button>
  )
}

/** A bare icon in a header's action row, like the shuffle beside the play button. */
export function ActionIcon({
  children,
  onClick,
  disabled,
  active,
  title
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  title: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-10 w-10 items-center justify-center transition hover:scale-105 disabled:opacity-40 ${
        active ? 'text-accent' : 'text-ink-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

export function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-sm font-bold text-black transition hover:scale-[1.03] hover:bg-accent-2 active:scale-100 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function GhostButton({
  children,
  onClick,
  disabled,
  active,
  title,
  type = 'button'
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  title?: string
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
        active ? 'border-accent bg-accent text-black' : 'border-white/25 text-ink hover:scale-[1.03] hover:border-white'
      }`}
    >
      {children}
    </button>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-16 text-center text-sm text-ink-3">{children}</div>
}

export interface SearchProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
}

/** A filter box. `inline` is the one at the end of a header's action row, as Spotify places it. */
export function SearchInput({ value, onChange, placeholder, inline = false }: SearchProps & { inline?: boolean }) {
  return (
    <div className={`relative min-w-0 ${inline ? 'ml-auto w-60 shrink' : 'mb-5 w-[280px]'}`}>
      <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-2" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        spellCheck={false}
        className="h-9 w-full rounded-full border border-transparent bg-white/[0.07] pr-4 pl-9 text-sm text-ink outline-none placeholder:text-ink-2 hover:bg-white/10 focus:border-white/60"
      />
    </div>
  )
}

/** A filter pill, as on Your Library and the album sorts. */
export function Chip({
  children,
  active,
  onClick,
  title
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
        active ? 'bg-accent text-black' : 'bg-white/[0.07] text-ink hover:bg-white/[0.14]'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * A slider in the app's style, filled up to its value. The fill is the `--p` the `.range` class
 * paints from, worked out here once so no slider can be left without it.
 */
export function Range({
  className = '',
  style,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'min' | 'max'> & { value: number; min: number; max: number }) {
  const span = props.max - props.min
  const p = span > 0 ? Math.min(100, Math.max(0, ((props.value - props.min) / span) * 100)) : 0
  return (
    <input type="range" {...props} className={`range ${className}`} style={{ ...style, '--p': `${p}%` } as React.CSSProperties} />
  )
}
