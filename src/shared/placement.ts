import { HOME_ANCHOR, OVERLAY_ANCHORS, type OverlayAnchor, type Rect, type WidgetPlacement } from './types'

export interface Size {
  width: number
  height: number
}

/** The widget hugs the taskbar: closer to the screen's top or bottom edge than to its sides. */
export const WIDGET_INSET = { side: 12, edge: 6 }

/** How close to an anchor slot, in DIP, a dropped widget has to land to snap into it. */
export const SNAP_DISTANCE = 64

/** How much of a window has to stay on a display, each way, for it to still be grabbed there. */
const REACHABLE = 40

/** A box of `size` glued to `anchor` of `area`, `side` in from its side and `edge` from its top or bottom. */
export function anchoredRect(anchor: OverlayAnchor, size: Size, area: Rect, side: number, edge: number): Rect {
  const { width, height } = size
  const [vertical, horizontal] = anchor.split('-')
  const x =
    horizontal === 'left'
      ? area.x + side
      : horizontal === 'center'
        ? area.x + Math.round((area.width - width) / 2)
        : area.x + area.width - width - side
  const y = vertical === 'top' ? area.y + edge : area.y + area.height - height - edge
  return { x, y, width, height }
}

function overlap(r: Rect, a: Rect): number {
  const w = Math.min(r.x + r.width, a.x + a.width) - Math.max(r.x, a.x)
  const h = Math.min(r.y + r.height, a.y + a.height) - Math.max(r.y, a.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Whether enough of `r` shows on `area` to be grabbed and dragged back. */
function reachable(r: Rect, a: Rect): boolean {
  return (
    r.x < a.x + a.width - REACHABLE &&
    r.x + r.width > a.x + REACHABLE &&
    r.y < a.y + a.height - REACHABLE &&
    r.y + r.height > a.y + REACHABLE
  )
}

/** Whether a window saved at `r` can still be reached on one of the connected displays. */
export function onScreen(r: Rect, areas: Rect[]): boolean {
  return areas.some((a) => reachable(r, a))
}

/** The work area most of `r` sits on, if it touches any. */
function areaOf(r: Rect, areas: Rect[]): Rect | undefined {
  let best: Rect | undefined
  for (const a of areas) if (overlap(r, a) > (best ? overlap(r, best) : 0)) best = a
  return best
}

/** `r` moved as little as it takes to sit wholly inside `area`. */
export function clampInto(r: Rect, a: Rect): Rect {
  const x = Math.min(Math.max(r.x, a.x), a.x + a.width - r.width)
  const y = Math.min(Math.max(r.y, a.y), a.y + a.height - r.height)
  return { ...r, x, y }
}

const widgetSlot = (anchor: OverlayAnchor, size: Size, primary: Rect): Rect =>
  anchoredRect(anchor, size, primary, WIDGET_INSET.side, WIDGET_INSET.edge)

/**
 * The widget's window for a placement. A free spot is kept inside the display it was left on,
 * so growing to a bigger size cannot push it under the taskbar; one on a display that has since
 * gone away falls back to the default slot rather than opening out of reach.
 */
export function placeWidget(p: WidgetPlacement, size: Size, primary: Rect, areas: Rect[]): Rect {
  if (p.kind === 'anchor') return widgetSlot(p.anchor, size, primary)
  const r = { x: p.x, y: p.y, ...size }
  const area = areaOf(r, areas)
  return area && reachable(r, area) ? clampInto(r, area) : widgetSlot(HOME_ANCHOR, size, primary)
}

/** The anchor slot of the primary work area `r` is close enough to snap into, if any. */
export function snapAnchor(r: Rect, primary: Rect): OverlayAnchor | undefined {
  let best: { anchor: OverlayAnchor; d: number } | undefined
  for (const { value: anchor } of OVERLAY_ANCHORS) {
    const slot = widgetSlot(anchor, r, primary)
    const d = Math.hypot(slot.x - r.x, slot.y - r.y)
    if (d <= SNAP_DISTANCE && (!best || d < best.d)) best = { anchor, d }
  }
  return best?.anchor
}

/**
 * Where a widget let go of at `r` settles: the slot it was dropped near, or right where it is,
 * pulled fully onto the display it mostly landed on.
 */
export function dropPlacement(r: Rect, primary: Rect, areas: Rect[]): WidgetPlacement {
  const anchor = snapAnchor(r, primary)
  if (anchor) return { kind: 'anchor', anchor }
  const { x, y } = clampInto(r, areaOf(r, areas) ?? primary)
  return { kind: 'free', x, y }
}
