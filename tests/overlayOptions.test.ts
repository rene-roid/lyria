import { expect, test } from 'bun:test'
import { sanitizeMini, sanitizeWidget } from '../src/main/overlayOptions'
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

test('a v0.6.0 compact widget becomes the small size, and the old key is dropped', () => {
  const o = sanitizeWidget(v060 as never)
  expect(o.size).toBe('small')
  expect('compact' in o).toBe(false)
  expect(sanitizeWidget({ ...v060, compact: false } as never).size).toBe('medium')
})

test('a stored size wins over a leftover compact switch, and an unknown one falls back', () => {
  expect(sanitizeWidget({ ...v060, size: 'large' } as never).size).toBe('large')
  expect(sanitizeWidget({ size: 'huge' } as never).size).toBe('medium')
})

test('a v0.6.0 mini player block gets the medium size it always had', () => {
  const o = sanitizeMini({ background: 'solid', opacity: 0.9, fadeOnHover: false, hoverOpacity: 0.35, clickThrough: true })
  expect(o.size).toBe('medium')
  expect(o.opacity).toBe(0.9)
  expect(o.clickThrough).toBe(true)
})

test('a v0.6.0 visualiser switch becomes a style: on drew bars', () => {
  expect(sanitizeWidget(v060 as never).visualizer).toBe('off')
  expect(sanitizeWidget({ ...v060, visualizer: true } as never).visualizer).toBe('bars')
  expect(sanitizeWidget({ visualizer: 'wave' }).visualizer).toBe('wave')
  expect(sanitizeWidget({ visualizer: 'spiral' } as never).visualizer).toBe('bars')
})

test('the look options a v0.6.0 block never had start at their defaults', () => {
  const o = sanitizeWidget(v060 as never)
  expect(o.tint).toBe(false)
  expect(o.visualizerColor).toBe('accent')
  expect(o.like).toBe(false)
  expect(o.shuffle).toBe(false)
  expect(o.corners).toBe('rounded')
  expect(sanitizeWidget({ corners: 'oval', visualizerColor: 'rainbow', tint: 'yes' } as never)).toMatchObject({
    corners: 'rounded',
    visualizerColor: 'accent',
    tint: false
  })
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
