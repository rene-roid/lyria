import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Disc3, X } from 'lucide-react'
import {
  AURORA_INTENSITY,
  AURORA_PRESETS,
  BACKGROUNDS,
  type AuroraColors,
  type AuroraOptions
} from '@shared/aurora'
import type {
  DownloadStatus,
  MiniOptions,
  NormalizeMode,
  OverlayAnchor,
  OverlayBackground,
  OverlayChrome,
  PlayerLook,
  Session,
  Settings,
  SettingsPatch,
  ThemeName,
  ToastOptions,
  WidgetOptions
} from '@shared/types'
import {
  CARD_SIZES,
  CORNER_STYLES,
  HOME_ANCHOR,
  OVERLAY_ANCHORS,
  OVERLAY_BACKGROUNDS,
  THEMES,
  VISUALIZER_COLORS,
  VISUALIZER_STYLES,
  widgetSize
} from '@shared/types'
import type { ServerProbe } from '@shared/subsonic/client'
import { clearCache } from '@renderer/shared/cache'
import { Cover } from '@renderer/shared/Cover'
import { nativeAcrylic, overlayCard } from '@renderer/shared/overlay'
import { WidgetCard } from '@renderer/widget/WidgetCard'
import { usePlayerState } from '@renderer/shared/playerStore'
import { Aurora, useCoverAurora } from '../Aurora'
import { downloads, useDownloads } from '../downloads'
import type { RadioPlaylist } from '@shared/navimix'
import { toggleHiddenPlaylist, useHiddenPlaylists, useServerPlaylists } from '../playlists'
import { nav } from '../nav'
import { useSessionStore, useSettings } from '@renderer/shared/sessionStore'
import { GhostButton, PageTitle, Range, SectionHeader, Spinner } from '../components/ui'

const field =
  'w-full rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:bg-white/[0.08]'

/** Rounded to `step` without the float noise (0.1 + 0.2) that would otherwise show in the box. */
const snap = (n: number, step: number): number => Number((Math.round(n / step) * step).toFixed(4))

/**
 * A value typed in by hand. It commits on Enter or when focus leaves, clamped and snapped to
 * `step`; Escape or anything that is not a number puts the old value back.
 */
function NumberInput({
  label,
  value,
  min,
  max,
  step,
  unit,
  onCommit
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onCommit: (v: number) => void
}) {
  const [text, setText] = useState<string>()
  const cancelled = useRef(false)
  const commit = (): void => {
    const typed = text
    setText(undefined)
    if (cancelled.current || typed === undefined) {
      cancelled.current = false
      return
    }
    const n = Number(typed.trim().replace(',', '.'))
    if (typed.trim() === '' || !Number.isFinite(n)) return
    const v = snap(Math.min(max, Math.max(min, n)), step)
    if (v !== value) onCommit(v)
  }
  return (
    <div className="flex h-7 shrink-0 items-center rounded-md border border-white/10 bg-white/[0.06] transition focus-within:border-accent focus-within:bg-white/[0.08]">
      <input
        aria-label={label}
        inputMode="decimal"
        className="w-14 bg-transparent px-2 text-right text-xs tabular-nums text-ink outline-none"
        value={text ?? String(snap(value, step))}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            cancelled.current = true
            e.currentTarget.blur()
          }
        }}
      />
      {unit && <span className="pr-2 text-xs text-ink-3">{unit}</span>}
    </div>
  )
}

/**
 * A setting picked on a slider or typed into the box beside it. The box may go past the slider's
 * own range (`inputMin`/`inputMax`); the slider then just sits at its end.
 */
function SliderRow({
  label,
  description,
  value,
  min,
  max,
  step,
  inputMin = min,
  inputMax = max,
  inputStep = step,
  unit,
  onChange,
  onRelease
}: {
  label: string
  description: ReactNode
  value: number
  min: number
  max: number
  step: number
  inputMin?: number
  inputMax?: number
  inputStep?: number
  unit?: string
  onChange: (v: number) => void
  onRelease?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-3 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-ink-2">{description}</div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Range
          aria-label={label}
          className="w-40"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerUp={onRelease}
        />
        <NumberInput
          label={label}
          value={value}
          min={inputMin}
          max={inputMax}
          step={inputStep}
          unit={unit}
          onCommit={onChange}
        />
      </div>
    </div>
  )
}

type CacheStats = { bytes: number; count: number }

/**
 * What a cache holds right now. Polled while the panel is open, since eviction and the background
 * re-encoding both change it without anything here asking.
 */
function useCacheStats(get: () => Promise<CacheStats>): CacheStats | undefined {
  const [stats, setStats] = useState<CacheStats>()
  useEffect(() => {
    const refresh = (): void => void get().then(setStats, () => undefined)
    refresh()
    const timer = window.setInterval(refresh, 3000)
    return () => window.clearInterval(timer)
  }, [get])
  return stats
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(n >= 100 * 1024 ** 2 ? 0 : 1)} MB`
  return `${Math.round(n / 1024)} KB`
}

/**
 * Alternate URLs for the same library (LAN, VPN, public). Lyria pings them all and uses
 * whichever answers first, switching automatically when the one in use stops responding.
 */
function Connections({ session }: { session: Session }) {
  const servers = session.servers ?? [session.server]
  const [probes, setProbes] = useState<ServerProbe[]>()
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState('')

  const test = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      setProbes(await window.lyria.auth.probe())
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void test()
  }, [test, session.servers?.join(',')])

  const save = async (next: string[]): Promise<void> => {
    await window.lyria.auth.setServers(next)
    void test()
  }

  return (
    <section className="mb-8">
      <SectionHeader
        title="Connections"
        action={
          <div className="flex items-center gap-2">
            {busy && <Spinner className="h-4 w-4" />}
            <GhostButton onClick={() => void window.lyria.auth.reselect().then(test)} disabled={busy}>
              Use fastest
            </GhostButton>
          </div>
        }
      />
      <p className="mb-3 px-3 text-xs text-ink-3">
        Several addresses for the same server. The fastest one that answers is used, and Lyria switches over on its
        own when it stops responding.
      </p>
      <ul className="mb-3">
        {servers.map((s) => {
          const probe = probes?.find((p) => p.server === s)
          const active = s === session.server
          return (
            <li key={s} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/[0.04]">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  probe === undefined ? 'bg-white/25' : probe.ok ? 'bg-emerald-400' : 'bg-red-400'
                }`}
                title={probe?.error ?? (probe?.ok ? 'Reachable' : undefined)}
              />
              <span className={`min-w-0 flex-1 truncate text-sm ${active ? 'font-semibold' : 'text-ink-2'}`}>{s}</span>
              {probe?.ok && <span className="shrink-0 text-xs text-ink-3">{probe.ms} ms</span>}
              {active ? (
                <span className="shrink-0 text-xs font-semibold text-accent">In use</span>
              ) : (
                <button
                  className="shrink-0 text-xs text-ink-2 hover:text-ink"
                  onClick={() => void window.lyria.auth.selectServer(s)}
                >
                  Use
                </button>
              )}
              <button
                className="shrink-0 rounded p-1 text-ink-3 hover:bg-white/10 hover:text-ink disabled:opacity-30"
                title="Remove"
                disabled={servers.length < 2}
                onClick={() => void save(servers.filter((x) => x !== s))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          )
        })}
      </ul>
      <form
        className="flex items-center gap-2 px-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!url.trim()) return
          void save([...servers, url])
          setUrl('')
        }}
      >
        <input
          className={field}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://music.example.com"
        />
        <GhostButton type="submit" disabled={!url.trim()}>
          Add
        </GhostButton>
      </form>
    </section>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6 rounded-md px-3 py-3 hover:bg-white/[0.04]">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-ink-2">{description}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-10 shrink-0 rounded-full border transition ${
          checked ? 'border-accent bg-accent' : 'border-white/30 bg-transparent'
        }`}
      >
        <span
          className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-all ${
            checked ? 'left-[22px] bg-black' : 'left-[3px] bg-ink-2'
          }`}
        />
      </button>
    </label>
  )
}

/**
 * The work area as a 3x2 grid of slots, each drawn as the little bar the window will become.
 * Reads faster than a dropdown, since the choice is about a place on screen. No slot is lit for
 * a widget dragged somewhere of its own.
 */
function AnchorPicker({
  value,
  onChange,
  hint,
  action
}: {
  value: OverlayAnchor | undefined
  onChange: (v: OverlayAnchor) => void
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-md px-3 py-3">
      <div>
        <div className="text-sm font-medium">Position</div>
        <div className="text-xs text-ink-2">
          {value ? `${OVERLAY_ANCHORS.find((a) => a.value === value)?.label} of the screen, clear of the taskbar.` : ''}
          {hint ? ` ${hint}` : ''}
        </div>
        {action}
      </div>
      <div className="grid h-[76px] w-[132px] shrink-0 grid-cols-3 grid-rows-2 gap-1 rounded-md border border-white/10 bg-black/40 p-1">
        {OVERLAY_ANCHORS.map((a) => {
          const active = a.value === value
          return (
            <button
              key={a.value}
              title={a.label}
              aria-label={a.label}
              aria-pressed={active}
              onClick={() => onChange(a.value)}
              className={`flex items-center justify-center rounded-sm transition ${
                active ? 'bg-accent/20' : 'hover:bg-white/10'
              }`}
            >
              <span className={`h-1.5 w-7 rounded-full ${active ? 'bg-accent' : 'bg-white/25'}`} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** One of a few named options, as a segmented control. */
function Choice<T extends string>({
  label,
  description,
  options,
  value,
  onChange
}: {
  label: string
  description?: string
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-md px-3 py-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-ink-2">{description}</div>}
      </div>
      <div className="flex shrink-0 rounded-md border border-white/10 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`rounded px-2.5 py-1 text-xs transition ${
              o.value === value ? 'bg-accent font-semibold text-black' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Card fill: an opaque panel, or the system's frosted glass. */
function BackgroundPicker({ value, onChange }: { value: OverlayBackground; onChange: (v: OverlayBackground) => void }) {
  const degraded = value === 'acrylic' && !window.lyria.nativeAcrylic
  return (
    <Choice
      label="Background"
      description={
        degraded
          ? 'Windows 11 blurs what is behind the window; here it falls back to a plain translucent card'
          : OVERLAY_BACKGROUNDS.find((b) => b.value === value)?.hint
      }
      options={OVERLAY_BACKGROUNDS}
      value={value}
      onChange={onChange}
    />
  )
}

function OpacitySlider({
  label,
  description,
  min,
  value,
  onChange
}: {
  label: string
  description: string
  min: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <SliderRow
      label={label}
      description={description}
      value={Math.round(value * 100)}
      min={min}
      max={100}
      step={5}
      inputStep={1}
      unit="%"
      onChange={(pct) => onChange(pct / 100)}
    />
  )
}

/** A run of related rows within a section, under a small heading of its own. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <h3 className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{title}</h3>
      {children}
    </div>
  )
}

/**
 * The taskbar widget as the options stand, playing whatever is playing: the very card the widget
 * window draws, at its real size, on a stand-in for the desktop and in the slot it is anchored to.
 * It sticks to the top while its section scrolls past, so every change below shows up in it; the
 * page's own padding is taken back so it sticks flush, with nothing peeking out above it.
 */
function WidgetPreview({ o }: { o: WidgetOptions }) {
  const { width, height } = widgetSize(o)
  const [vertical, horizontal] = o.placement.kind === 'anchor' ? o.placement.anchor.split('-') : ['middle', 'center']
  return (
    <div className="sticky -top-6 z-10 mb-2 bg-surface-2 pt-3 pb-2">
      <div
        className={`flex h-[156px] overflow-hidden rounded-lg border border-white/10 p-3 ${
          vertical === 'top' ? 'items-start' : vertical === 'bottom' ? 'items-end' : 'items-center'
        } ${horizontal === 'left' ? 'justify-start' : horizontal === 'right' ? 'justify-end' : 'justify-center'}`}
        style={{
          background:
            'radial-gradient(circle at 18% 28%, rgb(88 64 150 / 0.55), transparent 55%), radial-gradient(circle at 82% 78%, rgb(30 120 140 / 0.5), transparent 55%), #161616'
        }}
      >
        <div className="shrink-0 transition-[width] duration-200" style={{ width, height, opacity: o.opacity }}>
          <WidgetCard o={o} card={overlayCard(o.background)} />
        </div>
      </div>
    </div>
  )
}

/** Everything about the taskbar widget except whether it is shown at all. */
function TaskbarWidgetSettings({ value, onChange }: { value: WidgetOptions; onChange: (p: Partial<WidgetOptions>) => void }) {
  const p = value.placement
  return (
    <section className="mb-8">
      <SectionHeader title="Taskbar widget" />
      <WidgetPreview o={value} />
      <Group title="Layout">
        <AnchorPicker
          value={p.kind === 'anchor' ? p.anchor : undefined}
          hint={
            p.kind === 'free'
              ? 'Where you dropped it. Let go near a corner or edge to snap back into place.'
              : 'Drag the widget to move it anywhere.'
          }
          onChange={(anchor) => onChange({ placement: { kind: 'anchor', anchor } })}
          action={
            !(p.kind === 'anchor' && p.anchor === HOME_ANCHOR) && (
              <button
                className="mt-1.5 text-xs font-semibold text-accent hover:underline"
                onClick={() => onChange({ placement: { kind: 'anchor', anchor: HOME_ANCHOR } })}
              >
                Reset position
              </button>
            )
          }
        />
        <Choice
          label="Size"
          description={
            value.size === 'small'
              ? 'A slim bar with just the title, for when it should stay out of the way'
              : value.size === 'medium'
                ? 'Title and artist next to the controls'
                : 'A bigger cover, the album too, and a seek bar you can click'
          }
          options={CARD_SIZES}
          value={value.size}
          onChange={(size) => onChange({ size })}
        />
      </Group>
      <Group title="Shows">
        <Toggle
          label="Album art"
          description="Cover thumbnail on the left; click it to open Lyria"
          checked={value.cover}
          onChange={(cover) => onChange({ cover })}
        />
        <Toggle
          label={value.size === 'large' ? 'Seek bar' : 'Progress bar'}
          description={
            value.size === 'large'
              ? 'How far into the track you are; click it to jump'
              : 'Thin line along the bottom edge showing how far into the track you are'
          }
          checked={value.progress}
          onChange={(progress) => onChange({ progress })}
        />
        <Toggle
          label="Elapsed time"
          description={
            value.size === 'large' ? 'The position and length beside the seek bar' : 'The position and length next to the controls'
          }
          checked={value.elapsed}
          onChange={(elapsed) => onChange({ elapsed })}
        />
        <ExtraButtonSettings value={value} onChange={onChange} />
      </Group>
      <Group title="Look">
        <CoverLookSettings value={value} onChange={onChange} />
        <Choice
          label="Corners"
          description={
            nativeAcrylic(value.background)
              ? 'Windows draws the corners of the acrylic backdrop itself'
              : value.corners === 'pill'
                ? 'Fully round ends, with a round cover to match'
                : 'How rounded the card is'
          }
          options={CORNER_STYLES}
          value={value.corners}
          onChange={(corners) => onChange({ corners })}
        />
        <CardFillSettings value={value} onChange={onChange} />
      </Group>
      <Group title="Behaviour">
        <PointerSettings
          value={value}
          onChange={onChange}
          clickThroughHint="Clicks pass to whatever is behind the widget; its own buttons still work, but it cannot be dragged until this is off"
        />
      </Group>
    </section>
  )
}

/** The playing cover's colours on a floating player: the tint, and the visualiser drawn over it. */
function CoverLookSettings({ value, onChange }: { value: PlayerLook; onChange: (p: Partial<PlayerLook>) => void }) {
  return (
    <>
      <Toggle
        label="Tint from cover art"
        description="A wash of the playing cover's colour across the card, easing into the next one as tracks change"
        checked={value.tint}
        onChange={(tint) => onChange({ tint })}
      />
      <Choice
        label="Visualiser"
        description="Live levels of the music behind the track details"
        options={VISUALIZER_STYLES}
        value={value.visualizer}
        onChange={(visualizer) => onChange({ visualizer })}
      />
      {value.visualizer !== 'off' && (
        <Choice
          label="Visualiser colour"
          description={value.visualizerColor === 'cover' ? 'A bright take on the playing cover' : 'The colour it draws in'}
          options={VISUALIZER_COLORS}
          value={value.visualizerColor}
          onChange={(visualizerColor) => onChange({ visualizerColor })}
        />
      )}
    </>
  )
}

/** The buttons a floating player can carry besides previous, play and next. */
function ExtraButtonSettings({ value, onChange }: { value: PlayerLook; onChange: (p: Partial<PlayerLook>) => void }) {
  return (
    <>
      <Toggle
        label="Like button"
        description="Save the playing song to Liked Songs, after the next button"
        checked={value.like}
        onChange={(like) => onChange({ like })}
      />
      <Toggle
        label="Shuffle button"
        description="Turn shuffle on and off, before the previous button"
        checked={value.shuffle}
        onChange={(shuffle) => onChange({ shuffle })}
      />
    </>
  )
}

/** The card's fill, shared by every floating window. */
function CardFillSettings({
  value,
  onChange
}: {
  value: Pick<OverlayChrome, 'background' | 'opacity'> & { fadeOnHover?: boolean }
  onChange: (p: Partial<OverlayChrome>) => void
}) {
  return (
    <>
      <BackgroundPicker value={value.background} onChange={(background) => onChange({ background })} />
      <OpacitySlider
        label="Opacity"
        description={value.fadeOnHover ? 'How solid it is when the pointer is away' : 'How solid it is'}
        min={35}
        value={value.opacity}
        onChange={(opacity) => onChange({ opacity })}
      />
    </>
  )
}

/** How a floating window the pointer can reach gets out of its way. The toast never takes the mouse. */
function PointerSettings({
  value,
  onChange,
  clickThroughHint
}: {
  value: OverlayChrome
  onChange: (p: Partial<OverlayChrome>) => void
  clickThroughHint: string
}) {
  return (
    <>
      <Toggle
        label="Fade when hovered"
        description="Drop it further out of the way while the pointer is over it"
        checked={value.fadeOnHover}
        onChange={(fadeOnHover) => onChange({ fadeOnHover })}
      />
      {value.fadeOnHover && (
        <OpacitySlider
          label="Faded opacity"
          description="Where it settles while hovered. Never brighter than the opacity above."
          min={5}
          value={value.hoverOpacity}
          onChange={(hoverOpacity) => onChange({ hoverOpacity })}
        />
      )}
      <Toggle
        label="Click through"
        description={clickThroughHint}
        checked={value.clickThrough}
        onChange={(clickThrough) => onChange({ clickThrough })}
      />
    </>
  )
}

function MiniPlayerSettings({ value, onChange }: { value: MiniOptions; onChange: (p: Partial<MiniOptions>) => void }) {
  return (
    <section className="mb-8">
      <SectionHeader title="Mini player" />
      <Group title="Layout">
        <Choice
          label="Size"
          description={
            value.size === 'small'
              ? 'Title, artist and controls, with progress along the bottom edge'
              : value.size === 'medium'
                ? 'Title, artist, controls and a seek bar'
                : 'A bigger cover, the album line and full-size buttons'
          }
          options={CARD_SIZES}
          value={value.size}
          onChange={(size) => onChange({ size })}
        />
      </Group>
      <Group title="Shows">
        <ExtraButtonSettings value={value} onChange={onChange} />
      </Group>
      <Group title="Look">
        <CoverLookSettings value={value} onChange={onChange} />
        <CardFillSettings value={value} onChange={onChange} />
      </Group>
      <Group title="Behaviour">
        <PointerSettings
          value={value}
          onChange={onChange}
          clickThroughHint="Clicks pass to whatever is behind it; the controls still work, but it cannot be dragged until this is off"
        />
      </Group>
    </section>
  )
}

function ToastSettings({
  value,
  durationMs,
  onChange,
  onDuration
}: {
  value: ToastOptions
  durationMs: number
  onChange: (p: Partial<ToastOptions>) => void
  onDuration: (ms: number) => void
}) {
  return (
    <section className="mb-8">
      <SectionHeader title="Track change toasts" />
      <Group title="Layout">
        <AnchorPicker value={value.anchor} onChange={(anchor) => onChange({ anchor })} />
        <SliderRow
          label="Duration"
          description="How long each card stays on screen"
          value={durationMs / 1000}
          min={1.5}
          max={8}
          step={0.25}
          inputMin={1}
          inputMax={30}
          inputStep={0.1}
          unit="s"
          onChange={(s) => onDuration(Math.round(s * 1000))}
        />
      </Group>
      <Group title="Look">
        <Toggle
          label="Tint from cover art"
          description="A wash of the new song's cover colour across the card"
          checked={value.tint}
          onChange={(tint) => onChange({ tint })}
        />
        <CardFillSettings value={value} onChange={onChange} />
      </Group>
    </section>
  )
}

function ThemePicker({ value, onChange }: { value: ThemeName; onChange: (v: ThemeName) => void }) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-md px-3 py-3">
      <div>
        <div className="text-sm font-medium">Accent colour</div>
        <div className="text-xs text-ink-2">Buttons, sliders and highlights in every Lyria window</div>
      </div>
      <div className="flex shrink-0 rounded-md border border-white/10 p-0.5">
        {THEMES.map((t) => (
          <button
            key={t.value}
            aria-pressed={value === t.value}
            onClick={() => onChange(t.value)}
            className={`flex items-center gap-2 rounded px-2.5 py-1 text-xs transition ${
              value === t.value ? 'bg-white/10 font-semibold text-ink' : 'text-ink-2 hover:text-ink'
            }`}
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: t.accent }}
            />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const conic = (c: readonly string[]): string => `conic-gradient(${[...c, c[0]].join(', ')})`

/** A round palette choice with its name under it, as navidroid's appearance screen has them. */
function PaletteSwatch({
  label,
  fill,
  selected,
  onClick,
  children
}: {
  label: string
  fill?: string
  selected: boolean
  onClick: () => void
  children?: ReactNode
}) {
  return (
    <button
      aria-pressed={selected}
      onClick={onClick}
      className="flex w-16 flex-col items-center gap-1.5 rounded-md py-1.5 transition hover:bg-white/[0.06]"
    >
      <span className={`rounded-full border-2 p-[3px] transition ${selected ? 'border-white' : 'border-transparent'}`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 text-ink-2" style={{ background: fill }}>
          {children}
        </span>
      </span>
      <span className={`text-xs ${selected ? 'text-ink' : 'text-ink-2'}`}>{label}</span>
    </button>
  )
}

function BackgroundSettings({ settings, onChange }: { settings: Settings; onChange: (p: SettingsPatch) => void }) {
  const { background, aurora } = settings
  const cover = useCoverAurora(usePlayerState((s) => s.track?.coverArt))
  const set = (patch: Partial<AuroraOptions>): void => onChange({ aurora: patch })
  const on = background === 'aurora'
  return (
    <>
      <div className="flex items-center justify-between gap-6 rounded-md px-3 py-3">
        <div>
          <div className="text-sm font-medium">Background</div>
          <div className="text-xs text-ink-2">
            {on ? 'A night sky with northern lights behind the pages' : 'The plain dark panel. The swatch shows the aurora as it would look.'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {/* A phone-shaped sky cropped to the band the curtains fill. The rays scale with the height they
              are drawn in, so it is drawn at twice the size and shrunk, or the finest would fall between pixels. */}
          <div className="relative h-[100px] w-[160px] overflow-hidden rounded-md border border-white/10 bg-surface-2">
            <Aurora options={aurora} className="absolute -top-3 left-0 h-[500px] w-[320px] origin-top-left scale-50" />
          </div>
          <div className="flex rounded-md border border-white/10 p-0.5">
            {BACKGROUNDS.map((b) => (
              <button
                key={b.value}
                aria-pressed={b.value === background}
                onClick={() => onChange({ background: b.value })}
                className={`rounded px-2.5 py-1 text-xs transition ${
                  b.value === background ? 'bg-accent font-semibold text-black' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {on && (
        <>
          <div className="px-3 py-3">
            <div className="text-sm font-medium">Colours</div>
            <div className="text-xs text-ink-2">
              {aurora.palette === 'cover'
                ? 'Taken from the playing song’s cover, easing over when the song changes; Classic until there is one'
                : aurora.palette === 'custom'
                  ? 'Your own four, one for each curtain edge'
                  : 'A fixed palette, whatever is playing'}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <PaletteSwatch
                label="Cover"
                fill={cover ? conic(cover) : undefined}
                selected={aurora.palette === 'cover'}
                onClick={() => set({ palette: 'cover' })}
              >
                {!cover && <Disc3 size={18} />}
              </PaletteSwatch>
              {AURORA_PRESETS.map((p) => (
                <PaletteSwatch
                  key={p.value}
                  label={p.label}
                  fill={conic(p.colors)}
                  selected={aurora.palette === p.value}
                  onClick={() => set({ palette: p.value })}
                />
              ))}
              <PaletteSwatch
                label="Custom"
                fill={conic(aurora.custom)}
                selected={aurora.palette === 'custom'}
                onClick={() => set({ palette: 'custom' })}
              />
            </div>
            {aurora.palette === 'custom' && (
              <div className="mt-3 flex items-center gap-3">
                {aurora.custom.map((c, i) => (
                  <label
                    key={i}
                    title={`Colour ${i + 1}`}
                    className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-white/20"
                    style={{ background: c }}
                  >
                    <input
                      type="color"
                      aria-label={`Colour ${i + 1}`}
                      value={c}
                      onChange={(e) => {
                        const custom = [...aurora.custom] as AuroraColors
                        custom[i] = e.target.value
                        set({ custom })
                      }}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                  </label>
                ))}
                <span className="text-xs text-ink-3">Click a colour to change it</span>
              </div>
            )}
          </div>
          <SliderRow
            label="Intensity"
            description="How brightly the curtains glow"
            value={Math.round(aurora.intensity * 100)}
            min={AURORA_INTENSITY.min * 100}
            max={AURORA_INTENSITY.max * 100}
            step={5}
            inputStep={1}
            unit="%"
            onChange={(pct) => set({ intensity: pct / 100 })}
          />
          <Toggle
            label="React to music"
            description="Taller curtains when it is loud, a flash along the rim on the beat"
            checked={aurora.reactive}
            onChange={(reactive) => set({ reactive })}
          />
        </>
      )}
    </>
  )
}

const NORMALIZE_MODES: { value: NormalizeMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'album', label: 'Per album' },
  { value: 'track', label: 'Per track' }
]

function NormalizeSetting({ value, onChange }: { value: NormalizeMode; onChange: (v: NormalizeMode) => void }) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-md px-3 py-3">
      <div>
        <div className="text-sm font-medium">Volume normalisation</div>
        <div className="text-xs text-ink-2">
          {value === 'off'
            ? 'Tracks play at their original loudness.'
            : value === 'album'
              ? 'Levels loudness between albums while keeping each album\u2019s own quiet and loud moments.'
              : 'Levels every track to the same loudness, even within an album.'}{' '}
          Uses the ReplayGain tags from your server; untagged tracks are left alone.
        </div>
      </div>
      <div className="flex shrink-0 rounded-md border border-white/10 p-0.5">
        {NORMALIZE_MODES.map((m) => (
          <button
            key={m.value}
            aria-pressed={value === m.value}
            onClick={() => onChange(m.value)}
            className={`rounded px-2.5 py-1 text-xs transition ${
              value === m.value ? 'bg-accent font-semibold text-black' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const downloadStats = (): Promise<CacheStats> => window.lyria.downloads.stats()

/** Everything kept for offline listening, how far each has got, and a way to let it go. */
/** What was hidden from Your Library and Home, with a way back for each. */
function HiddenPlaylists() {
  const hidden = useHiddenPlaylists()
  const { own, radios, mixes } = useServerPlaylists()
  const known = new Map<string, RadioPlaylist>([...own, ...radios, ...mixes].map((p) => [p.id, p]))
  if (!hidden.length) return null
  return (
    <>
      <div className="px-3 pt-4 pb-1 text-sm font-medium">Hidden playlists</div>
      <ul>
        {hidden.map((id) => {
          const p = known.get(id)
          return (
            <li key={id} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/[0.04]">
              <Cover id={p?.coverArt} size={100} className="h-10 w-10 shrink-0" rounded="rounded" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{p?.mix?.title ?? p?.name ?? 'Unavailable playlist'}</span>
              <GhostButton onClick={() => toggleHiddenPlaylist(id)}>Unhide</GhostButton>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function DownloadsSection() {
  const list = useDownloads()
  const used = useCacheStats(downloadStats)
  const open = (d: DownloadStatus): void =>
    nav.go(d.kind === 'playlist' ? { name: 'playlist', id: d.id } : { name: 'savedMix', id: d.id })

  return (
    <section className="mb-8">
      <SectionHeader
        title="Downloads"
        action={
          list.length > 0 && (
            <GhostButton onClick={() => list.forEach((d) => void downloads.remove(d.key))}>Remove all</GhostButton>
          )
        }
      />
      <p className="mb-3 px-3 text-xs text-ink-3">
        Playlists and mixes you download play with no connection at all, and are not counted against the song cache.
        Downloaded playlists pick up songs added on the server the next time Lyria can reach it. Plays made offline
        are sent to the server once it answers again, so its play counts stay right.
      </p>
      <div className="px-3 pb-2 text-xs text-ink-2">
        {used ? `${formatBytes(used.bytes)} for ${plural(used.count, 'song')}` : '…'}
      </div>
      {list.length === 0 ? (
        <div className="px-3 py-2 text-xs text-ink-3">
          Nothing yet. Use the download button on a playlist or mix to keep it here.
        </div>
      ) : (
        <ul>
          {list.map((d) => {
            const total = d.trackIds.length
            return (
              <li key={d.key} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/[0.04]">
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => open(d)}>
                  <Cover id={d.coverArt} size={100} className="h-10 w-10 shrink-0" rounded="rounded" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{d.title}</span>
                    <span className="block text-xs text-ink-2">
                      {d.kind === 'playlist' ? 'Playlist' : 'Mix'} {'·'}{' '}
                      {d.done >= total ? plural(total, 'song') : `${d.done} of ${plural(total, 'song')}`}
                      {d.failed > 0 && <span className="text-red-400"> {'·'} {d.failed} failed, retried later</span>}
                    </span>
                  </span>
                </button>
                <button
                  className="shrink-0 rounded p-1 text-ink-3 hover:bg-white/10 hover:text-ink"
                  title="Remove download"
                  onClick={() => void downloads.remove(d.key)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const songStats = (): Promise<CacheStats> => window.lyria.cache.stats()
const artStats = (): Promise<CacheStats> => window.lyria.art.stats()
const metaStats = (): Promise<CacheStats> => window.lyria.meta.stats()

/** How a bitrate sounds next to the lossless original, for the line under the slider. */
function opusQuality(kbps: number): string {
  if (kbps < 96) return 'Small, but the loss is audible on good headphones'
  if (kbps < 128) return 'Fine for casual listening'
  if (kbps < 160) return 'Close to the original for most listening'
  return 'Indistinguishable from the original for most listeners'
}

/** Disk budget and compression for downloaded songs, plus what is on disk right now. */
function SongCache({
  settings,
  onChange
}: {
  settings: Pick<Settings, 'cacheMaxGb' | 'cacheCompress' | 'cacheCompressKbps'>
  onChange: (patch: SettingsPatch) => void
}) {
  const used = useCacheStats(songStats)
  const { cacheMaxGb: maxGb, cacheCompress: compress, cacheCompressKbps: kbps } = settings

  return (
    <section className="mb-8">
      <SectionHeader
        title="Song cache"
        action={<GhostButton onClick={() => void window.lyria.cache.clear()}>Clear cache</GhostButton>}
      />
      <p className="mb-3 px-3 text-xs text-ink-3">
        Songs you play are kept on disk and reused next time. Playback starts streaming straight away and moves over
        to the local copy as soon as it has downloaded. Once the limit is reached, the songs played longest ago are
        deleted first.
      </p>
      <SliderRow
        label="Disk limit"
        description={
          <>
            {maxGb === 0 ? 'Off — nothing is kept on disk' : `${maxGb} GB`}
            {used && ` · ${formatBytes(used.bytes)} used by ${plural(used.count, 'song')}`}
          </>
        }
        value={maxGb}
        min={0}
        max={50}
        step={1}
        inputMax={4096}
        inputStep={0.1}
        unit="GB"
        onChange={(cacheMaxGb) => onChange({ cacheMaxGb })}
      />
      <Toggle
        label="Compress lossless songs"
        description="FLAC and WAV files are re-encoded to Opus in the background once they have downloaded, at a fraction of the size. Songs that are already MP3, AAC or Opus are kept as they are."
        checked={compress}
        onChange={(cacheCompress) => onChange({ cacheCompress })}
      />
      {compress && (
        <SliderRow
          label="Compression quality"
          description={`${opusQuality(kbps)} · about ${((kbps * 60) / 8 / 1000).toFixed(1)} MB a minute`}
          value={kbps}
          min={64}
          max={320}
          step={32}
          inputMin={32}
          inputMax={512}
          inputStep={1}
          unit="kbps"
          onChange={(cacheCompressKbps) => onChange({ cacheCompressKbps })}
        />
      )}
    </section>
  )
}

/** Disk budget for cover art, plus what is on disk right now. */
function ImageCache({ maxMb, onChange }: { maxMb: number; onChange: (v: number) => void }) {
  const used = useCacheStats(artStats)

  return (
    <section className="mb-8">
      <SectionHeader
        title="Image cache"
        action={<GhostButton onClick={() => void window.lyria.art.clear()}>Clear cache</GhostButton>}
      />
      <p className="mb-3 px-3 text-xs text-ink-3">
        Cover art is downloaded once and kept on disk, compressed to WebP, so pages you have already seen paint
        instantly on the next visit and still show their artwork with the server unreachable. Once the limit is reached,
        the covers shown longest ago are deleted first. Turning this off loads every cover from the server each time.
      </p>
      <SliderRow
        label="Disk limit"
        description={
          <>
            {maxMb === 0 ? 'Off — covers load from the server every time' : `${maxMb} MB`}
            {used && ` · ${formatBytes(used.bytes)} used by ${plural(used.count, 'cover')}`}
          </>
        }
        value={maxMb}
        min={0}
        max={2048}
        step={64}
        inputMax={65536}
        inputStep={1}
        unit="MB"
        onChange={onChange}
      />
    </section>
  )
}

/** The library responses views paint from before the server answers. */
function LibraryCache() {
  const used = useCacheStats(metaStats)
  return (
    <section className="mb-8">
      <SectionHeader
        title="Library cache"
        action={<GhostButton onClick={() => void clearCache()}>Clear cache</GhostButton>}
      />
      <p className="mb-3 px-3 text-xs text-ink-3">
        Album lists, artists, playlists and the pages you open are kept on disk, compressed, so they show up instantly
        with what was there last time while Lyria checks the server for anything new.
      </p>
      <div className="px-3 py-3">
        <div className="text-sm font-medium">On disk</div>
        <div className="text-xs text-ink-2">
          {used ? `${formatBytes(used.bytes)} for ${plural(used.count, 'page')} and lists` : '…'}
        </div>
      </div>
    </section>
  )
}

export function SettingsView() {
  const settings = useSettings()
  const session = useSessionStore((s) => s.session)
  const [info, setInfo] = useState<{ version: string; platform: string }>()
  useEffect(() => {
    void window.lyria.app.info().then(setInfo)
  }, [])

  const update = (patch: SettingsPatch): void => {
    void window.lyria.settings.update(patch)
  }
  const widget = (key: keyof Settings['widgets'], value: boolean): void =>
    update({ widgets: { ...settings.widgets, [key]: value } })

  return (
    // Centred and capped, so the rows' controls stay within reach of their labels on a wide window.
    <div className="mx-auto w-full max-w-3xl">
      <PageTitle title="Settings" subtitle={`Signed in as ${session?.username} · ${session?.server}`} />

      <section className="mb-8">
        <SectionHeader title="Appearance" />
        <ThemePicker value={settings.theme} onChange={(theme) => update({ theme })} />
        <BackgroundSettings settings={settings} onChange={update} />
      </section>

      <section className="mb-8">
        <SectionHeader title="Widgets" />
        <Toggle
          label="Taskbar widget"
          description="Controls and an audio visualiser pinned to an edge of the screen, clear of the taskbar"
          checked={settings.widgets.taskbar}
          onChange={(v) => widget('taskbar', v)}
        />
        <Toggle
          label="Mini player"
          description="Draggable always-on-top player; its position is remembered"
          checked={settings.widgets.mini}
          onChange={(v) => widget('mini', v)}
        />
        <Toggle
          label="Track change toasts"
          description="Show a Fluent-style card in the corner whenever a new track starts"
          checked={settings.widgets.toast}
          onChange={(v) => widget('toast', v)}
        />
      </section>

      {settings.widgets.taskbar && (
        <TaskbarWidgetSettings value={settings.widget} onChange={(patch) => update({ widget: patch })} />
      )}
      {settings.widgets.mini && <MiniPlayerSettings value={settings.mini} onChange={(patch) => update({ mini: patch })} />}
      {settings.widgets.toast && (
        <ToastSettings
          value={settings.toast}
          durationMs={settings.toastDurationMs}
          onChange={(patch) => update({ toast: patch })}
          onDuration={(toastDurationMs) => update({ toastDurationMs })}
        />
      )}

      <section className="mb-8">
        <SectionHeader title="Playback" />
        <NormalizeSetting value={settings.normalize} onChange={(normalize) => update({ normalize })} />
      </section>

      <section className="mb-8">
        <SectionHeader title="Library" />
        <Toggle
          label="Detect soundtracks by title"
          description="Also treat an album as a soundtrack when its title says so (e.g. “Original Soundtrack”, “OST”), for libraries tagged by musical style rather than genre"
          checked={settings.soundtrackTitleMatch}
          onChange={(v) => update({ soundtrackTitleMatch: v })}
        />
        <HiddenPlaylists />
      </section>

      <DownloadsSection />

      <SongCache settings={settings} onChange={update} />

      <ImageCache maxMb={settings.artCacheMaxMb} onChange={(artCacheMaxMb) => update({ artCacheMaxMb })} />

      <LibraryCache />

      <section className="mb-8">
        <SectionHeader title="Behaviour" />
        <Toggle
          label="Close to tray"
          description="Closing the main window keeps Lyria playing in the system tray"
          checked={settings.closeToTray}
          onChange={(v) => update({ closeToTray: v })}
        />
        <Toggle
          label="Media keys"
          description="Control playback with the keyboard's play/pause, next and previous keys"
          checked={settings.mediaKeys}
          onChange={(v) => update({ mediaKeys: v })}
        />
        <Toggle
          label="Start on system startup"
          description="Launch Lyria minimised to the tray when you sign in"
          checked={settings.autoLaunch}
          onChange={(v) => update({ autoLaunch: v })}
        />
      </section>

      {session && <Connections session={session} />}

      <section className="mb-8">
        <SectionHeader title="Account" />
        <div className="flex items-center gap-3 px-3">
          <GhostButton onClick={() => void window.lyria.auth.logout()}>Sign out</GhostButton>
          <span className="text-xs text-ink-3">Removes the stored token from the Windows credential store.</span>
        </div>
      </section>

      <div className="px-3 text-xs text-ink-3">
        Lyria {info?.version ?? ''} · {info?.platform ?? ''}
      </div>
    </div>
  )
}
