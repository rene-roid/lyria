import { expect, test } from 'bun:test'
import { sanitizeWidget } from '../src/main/overlayOptions'
import { defaultWidgetOptions } from '../src/shared/types'

/** The widget block exactly as v0.6.0 wrote it. */
const v060 = {
  background: 'acrylic',
  opacity: 0.8,
  fadeOnHover: true,
  hoverOpacity: 0.2,
  clickThrough: false,
  anchor: 'top-left',
  compact: true,
  visualizer: false,
  progress: true,
  cover: true,
  elapsed: true
}

test('a v0.6.0 anchor becomes an anchored placement, and the old key is dropped', () => {
  const o = sanitizeWidget(v060 as never)
  expect(o.placement).toEqual({ kind: 'anchor', anchor: 'top-left' })
  expect('anchor' in o).toBe(false)
})

test('the rest of a v0.6.0 widget block carries over', () => {
  const o = sanitizeWidget(v060 as never)
  expect(o.background).toBe('acrylic')
  expect(o.opacity).toBe(0.8)
  expect(o.fadeOnHover).toBe(true)
  expect(o.hoverOpacity).toBe(0.2)
  expect(o.elapsed).toBe(true)
})

test('a free placement is kept, rounded to whole pixels', () => {
  expect(sanitizeWidget({ placement: { kind: 'free', x: 700.4, y: -20.6 } }).placement).toEqual({ kind: 'free', x: 700, y: -21 })
})

test('a broken placement falls back to the old anchor, then to the default', () => {
  const broken = { placement: { kind: 'free', x: 'left', y: 3 }, anchor: 'top-center' }
  expect(sanitizeWidget(broken as never).placement).toEqual({ kind: 'anchor', anchor: 'top-center' })
  expect(sanitizeWidget({ placement: { kind: 'anchor', anchor: 'middle' } } as never).placement).toEqual({
    kind: 'anchor',
    anchor: 'bottom-right'
  })
})

test('nothing stored gives the defaults', () => {
  expect(sanitizeWidget(undefined)).toEqual(defaultWidgetOptions)
})
