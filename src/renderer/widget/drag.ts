import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** How far the pointer has to travel before a press turns into a drag, so clicks stay clicks. */
const THRESHOLD = 4

/**
 * Drag the widget window by its card. The page tracks the pointer, captured so it keeps coming
 * once the cursor outruns the window, and main moves the window and snaps it on release. Presses
 * on buttons and anything `no-drag` are left to the control under them.
 */
export function useWidgetDrag(): { onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void; snapping: boolean } {
  const [snapping, setSnapping] = useState(false)
  useEffect(() => window.lyria.widget.onSnap((anchor) => setSnapping(anchor !== null)), [])

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>): void => {
    if (e.button !== 0 || (e.target as Element).closest('button, .no-drag')) return
    const el = e.currentTarget
    const grab = { x: e.clientX, y: e.clientY, screenX: e.screenX, screenY: e.screenY }
    let dragging = false
    const move = (ev: PointerEvent): void => {
      if (!dragging && Math.hypot(ev.screenX - grab.screenX, ev.screenY - grab.screenY) < THRESHOLD) return
      dragging = true
      window.lyria.widget.drag(ev.screenX - grab.x, ev.screenY - grab.y)
    }
    const end = (): void => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('lostpointercapture', end)
      if (dragging) window.lyria.widget.drop()
    }
    el.setPointerCapture(e.pointerId)
    el.addEventListener('pointermove', move)
    el.addEventListener('lostpointercapture', end)
  }

  return { onPointerDown, snapping }
}
