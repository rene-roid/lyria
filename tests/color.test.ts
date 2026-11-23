import { expect, test } from 'bun:test'
import { glowColor, headerColor, luminance } from '../src/shared/color'

const image = (...runs: [number, [number, number, number]][]): number[] =>
  runs.flatMap(([n, [r, g, b]]) => Array.from({ length: n }, () => [r, g, b, 255]).flat())

test('the dominant hue wins instead of averaging into mud', () => {
  const [r, g, b] = headerColor(image([60, [230, 30, 30]], [40, [30, 30, 230]], [100, [250, 250, 250]]))
  expect(r).toBeGreaterThan(g * 3)
  expect(r).toBeGreaterThan(b * 3)
})

test('a grey cover gives a grey, dark enough for white text', () => {
  const c = headerColor(image([100, [200, 200, 200]]))
  expect(c[0]).toBe(c[1])
  expect(c[1]).toBe(c[2])
  expect(luminance(c)).toBeLessThanOrEqual(0.22)
})

test('bright colours are darkened, transparent pixels ignored', () => {
  const c = headerColor([...image([10, [120, 255, 120]]), ...Array(400).fill(0)])
  expect(luminance(c)).toBeLessThanOrEqual(0.22)
  expect(c[1]).toBeGreaterThan(c[0])
})

test('the glow keeps the dominant hue but lights it up to read on a dark card', () => {
  const [r, g, b] = glowColor(image([60, [90, 10, 10]], [40, [10, 10, 90]]))
  expect(r).toBe(255)
  expect(r).toBeGreaterThan(g * 1.5)
  expect(luminance([r, g, b])).toBeGreaterThanOrEqual(0.3)
})

test('a grey cover, however dark, glows white', () => {
  expect(glowColor(image([100, [40, 40, 40]]))).toEqual([255, 255, 255])
})
