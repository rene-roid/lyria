import type { ReactNode } from 'react'
import { Play } from 'lucide-react'

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

/**
 * A page's heading. Given a `cover`, it is the web UI's collection header: the cover beside a huge
 * title on a band of `color` (the cover's own, see useCoverColor), which carries on darkened behind
 * the action row and fades into the panel. Without one it is a plain title for the browse pages.
 */
export function PageTitle({
  eyebrow,
  title,
  subtitle,
  cover,
  actions,
  color = '#535353'
}: {
  eyebrow?: string
  title: string
  subtitle?: ReactNode
  cover?: ReactNode
  actions?: ReactNode
  color?: string
}) {
  if (!cover)
    return (
      <div className="mb-6">
        {eyebrow && <div className="text-sm font-medium text-ink-2">{eyebrow}</div>}
        <h1 className="truncate text-4xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-2 text-sm text-ink-2">{subtitle}</div>}
        {actions && <div className="mt-5 flex items-center gap-2">{actions}</div>}
      </div>
    )
  const band = { backgroundColor: color, transition: 'background-color 500ms' }
  return (
    <>
      <header
        className="-mx-6 -mt-6 flex items-end gap-6 px-6 pt-16 pb-6"
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
      <div className="relative mb-4 flex min-h-8 items-center gap-5 pt-6 pb-2">
        <div
          className="pointer-events-none absolute -inset-x-6 top-0 -z-10 h-60"
          style={{ ...band, backgroundImage: 'linear-gradient(rgba(0,0,0,0.6), var(--color-surface-2))' }}
        />
        {actions}
      </div>
    </>
  )
}

/** The big round green play button of a collection header. */
export function PlayCircle({ onClick, disabled, title = 'Play' }: { onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-black shadow-lg transition hover:scale-105 hover:bg-accent-2 active:scale-100 disabled:opacity-40 disabled:hover:scale-100"
    >
      <Play size={24} fill="currentColor" className="ml-0.5" />
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

export function SearchInput({
  value,
  onChange,
  placeholder
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="mb-5 h-9 w-[280px] rounded-full border border-transparent bg-white/[0.07] px-4 text-sm text-ink outline-none placeholder:text-ink-2 hover:bg-white/10 focus:border-white/60"
    />
  )
}

/** A filter pill, as on Your Library and the album sorts. */
export function Chip({ children, active, onClick }: { children: ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
        active ? 'bg-accent text-black' : 'bg-white/[0.07] text-ink hover:bg-white/[0.14]'
      }`}
    >
      {children}
    </button>
  )
}
