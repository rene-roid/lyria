import { expect, test } from 'bun:test'
import { dropPlacement, placeWidget, snapAnchor } from '../src/shared/placement'

const primary = { x: 0, y: 0, width: 1920, height: 1032 }
const right = { x: 1920, y: 0, width: 2560, height: 1400 }
const size = { width: 340, height: 76 }
const at = (x: number, y: number) => ({ x, y, ...size })

test('an anchored widget sits in its slot of the primary work area, clear of the edges', () => {
  expect(placeWidget({ kind: 'anchor', anchor: 'bottom-right' }, size, primary, [primary])).toEqual(at(1568, 950))
  expect(placeWidget({ kind: 'anchor', anchor: 'top-center' }, size, primary, [primary])).toEqual(at(790, 6))
  expect(placeWidget({ kind: 'anchor', anchor: 'bottom-left' }, size, primary, [primary])).toEqual(at(12, 950))
})

test('a drop near a slot snaps into it', () => {
  expect(snapAnchor(at(1540, 930), primary)).toBe('bottom-right')
  expect(dropPlacement(at(1540, 930), primary, [primary])).toEqual({ kind: 'anchor', anchor: 'bottom-right' })
  expect(dropPlacement(at(30, 20), primary, [primary])).toEqual({ kind: 'anchor', anchor: 'top-left' })
  expect(dropPlacement(at(800, 900), primary, [primary])).toEqual({ kind: 'anchor', anchor: 'bottom-center' })
})

test('a drop away from every slot stays where it landed', () => {
  expect(snapAnchor(at(700, 400), primary)).toBeUndefined()
  expect(dropPlacement(at(700, 400), primary, [primary])).toEqual({ kind: 'free', x: 700, y: 400 })
})

test('a drop hanging off the edge is pulled back onto the display it landed on', () => {
  expect(dropPlacement(at(1800, 400), primary, [primary])).toEqual({ kind: 'free', x: 1580, y: 400 })
  expect(dropPlacement(at(4300, 1380), primary, [primary, right])).toEqual({ kind: 'free', x: 4140, y: 1324 })
  expect(dropPlacement(at(1900, 600), primary, [primary, right])).toEqual({ kind: 'free', x: 1920, y: 600 })
})

test('slots only exist on the primary display', () => {
  expect(dropPlacement(at(4128, 1318), primary, [primary, right])).toEqual({ kind: 'free', x: 4128, y: 1318 })
})

test('a free spot is kept, and kept on screen when the widget grows', () => {
  expect(placeWidget({ kind: 'free', x: 700, y: 400 }, size, primary, [primary])).toEqual(at(700, 400))
  expect(placeWidget({ kind: 'free', x: 700, y: 980 }, size, primary, [primary])).toEqual(at(700, 956))
})

test('a free spot on a display that went away falls back to the home slot', () => {
  const placement = { kind: 'free', x: 3000, y: 500 } as const
  expect(placeWidget(placement, size, primary, [primary, right])).toEqual(at(3000, 500))
  expect(placeWidget(placement, size, primary, [primary])).toEqual(at(1568, 950))
})
