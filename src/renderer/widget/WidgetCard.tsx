import type { PointerEvent as ReactPointerEvent } from 'react'
import { WIDGET_LAYOUTS, type WidgetOptions } from '@shared/types'
import { Cover } from '@renderer/shared/Cover'
import { Elapsed, ProgressLine, SeekBar, TransportControls } from '@renderer/shared/Controls'
import { usePlayerState } from '@renderer/shared/playerStore'
import { Visualizer } from './Visualizer'

const openMain = (): void => window.lyria.window.showMain()

/**
 * The taskbar widget's card, filling whatever box it is put in: the widget window, which main
 * sizes with `widgetSize`, or the preview in Settings, which uses the same numbers. Small is a
 * single line, medium adds the artist, large stacks the album and a seek bar under them.
 */
export function WidgetCard({
  o,
  card,
  snapping = false,
  onPointerDown
}: {
  o: WidgetOptions
  card: string
  /** Outlined while a drag would snap into a slot if let go of now. */
  snapping?: boolean
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void
}) {
  const track = usePlayerState((s) => s.track)
  const l = WIDGET_LAYOUTS[o.size]
  const large = o.size === 'large'

  return (
    <div
      className={`${card} relative flex h-full w-full items-center overflow-hidden`}
      style={{ gap: l.gap, paddingInline: l.gap }}
      onPointerDown={onPointerDown}
    >
      {o.visualizer && (
        <Visualizer bars={40} className="pointer-events-none absolute inset-0 h-full w-full opacity-40" />
      )}
      {o.cover && (
        <button
          className="relative shrink-0 overflow-hidden rounded-md"
          style={{ height: l.cover, width: l.cover }}
          onClick={openMain}
          title="Open Lyria"
        >
          <Cover id={track?.coverArt} size={large ? 200 : 120} className="h-full w-full" />
        </button>
      )}
      {large ? (
        <div className="relative flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 cursor-default" onDoubleClick={openMain}>
              <div className="text-shadow truncate text-[14.5px] font-semibold leading-tight">{track?.title ?? 'Lyria'}</div>
              <div className="text-shadow truncate text-[12.5px] text-ink-2">{track?.artist ?? 'Nothing playing'}</div>
              {track?.album && <div className="text-shadow truncate text-[11.5px] text-ink-3">{track.album}</div>}
            </div>
            <div className="shrink-0">
              <TransportControls compact size={15} />
            </div>
          </div>
          {(o.progress || o.elapsed) && (
            <div className="flex items-center gap-2">
              {o.progress ? <SeekBar className="flex-1" /> : <div className="flex-1" />}
              {o.elapsed && <Elapsed className="text-shadow text-[10.5px]" />}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="relative min-w-0 flex-1 cursor-default" onDoubleClick={openMain}>
            <div className={`text-shadow truncate font-semibold leading-tight ${o.size === 'small' ? 'text-[12px]' : 'text-[13px]'}`}>
              {track?.title ?? 'Lyria'}
            </div>
            {o.size === 'medium' && (
              <div className="text-shadow truncate text-[11.5px] text-ink-2">{track?.artist ?? 'Nothing playing'}</div>
            )}
          </div>
          {o.elapsed && <Elapsed className="text-shadow relative text-[10.5px]" />}
          {/* shrink-0: the title next to it has flex-basis 0, so it never gives width back on its own. */}
          <div className="relative shrink-0">
            <TransportControls compact size={o.size === 'small' ? 13 : 15} />
          </div>
          {o.progress && <ProgressLine />}
        </>
      )}
      {snapping && <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-accent ring-inset" />}
    </div>
  )
}
