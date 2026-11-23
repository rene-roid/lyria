import { bootstrap } from '@renderer/shared/bootstrap'
import { useOverlayChrome } from '@renderer/shared/overlay'
import { useSettings } from '@renderer/shared/sessionStore'
import { useWidgetDrag } from './drag'
import { WidgetCard } from './WidgetCard'

/**
 * Taskbar-area widget: a small card pinned to one edge of the work area, usually just above
 * the Windows taskbar, or wherever it was dragged. Main owns the window's size and position;
 * the card lays out to fill whatever box it was given, from the same `settings.widget`.
 */
function TaskbarWidget() {
  const o = useSettings().widget
  const { card, style } = useOverlayChrome(o)
  const drag = useWidgetDrag()

  return (
    <div className="h-full w-full" style={style}>
      <WidgetCard o={o} card={card} snapping={drag.snapping} onPointerDown={drag.onPointerDown} />
    </div>
  )
}

bootstrap(<TaskbarWidget />)
