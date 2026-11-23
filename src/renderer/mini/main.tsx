import { Maximize2, X } from 'lucide-react'
import { MINI_LAYOUTS, type CardSize } from '@shared/types'
import { bootstrap } from '@renderer/shared/bootstrap'
import { Cover } from '@renderer/shared/Cover'
import { Elapsed, ProgressLine, SeekBar, TransportControls } from '@renderer/shared/Controls'
import { useOverlayChrome } from '@renderer/shared/overlay'
import { usePlayerState } from '@renderer/shared/playerStore'
import { useSettings } from '@renderer/shared/sessionStore'
import { CardBackdrop } from '@renderer/shared/Visualizer'

/**
 * Type and controls per size. Small has no height to spare for a seek bar, so its progress runs
 * along the bottom edge instead; large has room for the album line and full-size buttons.
 */
const TEXT: Record<CardSize, { pad: string; title: string; artist: string; time: string; controls: number; album: boolean; seek: boolean }> = {
  small: { pad: 'p-2.5', title: 'text-[13px]', artist: 'text-[11.5px]', time: 'text-[10.5px]', controls: 14, album: false, seek: false },
  medium: { pad: 'p-2.5', title: 'text-[14px]', artist: 'text-[12px]', time: 'text-[11px]', controls: 16, album: false, seek: true },
  large: { pad: 'p-3', title: 'text-[15px]', artist: 'text-[13px]', time: 'text-[11.5px]', controls: 18, album: true, seek: true }
}

/**
 * Floating always-on-top player. The card is the drag handle, so with click-through on it can
 * only be moved by turning that option off again; its controls are all `no-drag`, which is also
 * what marks them as the parts that keep taking the mouse.
 */
function MiniPlayer() {
  const o = useSettings().mini
  const { card, style } = useOverlayChrome(o)
  const track = usePlayerState((s) => s.track)
  const l = MINI_LAYOUTS[o.size]
  const t = TEXT[o.size]

  return (
    <div className="h-full w-full" style={style}>
      <div className={`${card} drag relative flex h-full w-full items-center gap-3 overflow-hidden ${t.pad} pr-3`}>
        <CardBackdrop look={o} coverId={track?.coverArt} bars={32} />
        <div className="relative shrink-0 rounded-md shadow-[0_2px_8px_rgb(0_0_0/0.35)]" style={{ width: l.cover, height: l.cover }}>
          <Cover id={track?.coverArt} size={o.size === 'large' ? 300 : 200} className="h-full w-full" />
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col justify-between self-stretch">
          <div className="text-shadow min-w-0 pr-12">
            <div className={`truncate font-semibold leading-tight ${t.title}`}>{track?.title ?? 'Nothing playing'}</div>
            <div className={`truncate text-ink-2 ${t.artist}`}>{track?.artist ?? 'Pick something in Lyria'}</div>
            {t.album && track?.album && <div className="truncate text-[12px] text-ink-3">{track.album}</div>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <TransportControls compact={o.size !== 'large'} size={t.controls} shuffle={o.shuffle} like={o.like} />
            <Elapsed className={`text-shadow ${t.time}`} />
          </div>
          {t.seek && <SeekBar className="w-full" />}
        </div>
        {!t.seek && <ProgressLine />}
        <div className="no-drag absolute top-1.5 right-1.5 flex items-center gap-0.5">
          <button className="icon-btn h-6 w-6" title="Open Lyria" onClick={() => window.lyria.window.showMain()}>
            <Maximize2 size={12} />
          </button>
          <button
            className="icon-btn h-6 w-6"
            title="Close mini player"
            onClick={() => void window.lyria.settings.update({ widgets: { mini: false } })}
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

bootstrap(<MiniPlayer />)
