import { expect, test } from 'bun:test'
import {
  auroraColors,
  coverAurora,
  defaultAuroraOptions,
  sanitizeAurora,
  sanitizeBackground,
  skyColor,
  type AuroraColors,
  type AuroraOptions
} from '../src/shared/aurora'

const CLASSIC: AuroraColors = ['#2ee6c5', '#48b4ff', '#8e6cff', '#ff6fc1']

const image = (...runs: [number, [number, number, number]][]): number[] =>
  runs.flatMap(([n, [r, g, b]]) => Array.from({ length: n }, () => [r, g, b, 255]).flat())

test('a config from before the aurora gets a plain background and the default aurora', () => {
  expect(sanitizeBackground(undefined)).toBe('none')
  expect(sanitizeAurora(undefined)).toEqual({ palette: 'cover', custom: CLASSIC, intensity: 1, reactive: true })
})

test('a known background is kept and anything else falls back to plain', () => {
  expect(sanitizeBackground('aurora')).toBe('aurora')
  expect(sanitizeBackground('sparkles')).toBe('none')
  expect(sanitizeBackground(42)).toBe('none')
})

test('a hand-edited aurora is repaired field by field', () => {
  const broken = { palette: 'rainbow', custom: ['#FF0000', 'red', null, '#00ff00'], intensity: 9, reactive: 'yes' }
  expect(sanitizeAurora(broken as unknown as Partial<AuroraOptions>)).toEqual({
    palette: 'cover',
    custom: ['#ff0000', '#48b4ff', '#8e6cff', '#00ff00'],
    intensity: 1.8,
    reactive: true
  })
  expect(sanitizeAurora({ intensity: 0.1 }).intensity).toBe(0.4)
  expect(sanitizeAurora({ intensity: Number.NaN }).intensity).toBe(1)
  expect(sanitizeAurora({ custom: '#ff0000' as unknown as AuroraOptions['custom'] }).custom).toEqual(CLASSIC)
})

test('a partial update keeps the rest of what was saved', () => {
  const saved = sanitizeAurora({ palette: 'custom', custom: ['#111111', '#222222', '#333333', '#444444'], intensity: 1.5 })
  expect(sanitizeAurora({ ...saved, reactive: false })).toEqual({
    palette: 'custom',
    custom: ['#111111', '#222222', '#333333', '#444444'],
    intensity: 1.5,
    reactive: false
  })
})

test('the colours drawn follow the palette, and a cover with none falls back to classic', () => {
  const cover: AuroraColors = ['#3399ff', '#3333ff', '#bb33ff', '#ff33bb']
  const custom: AuroraColors = ['#111111', '#222222', '#333333', '#444444']
  expect(auroraColors({ palette: 'cover', custom }, cover)).toEqual(cover)
  expect(auroraColors({ palette: 'cover', custom }, null)).toEqual(CLASSIC)
  expect(auroraColors({ palette: 'ember', custom }, cover)).toEqual(['#ff5e3a', '#ff9f1c', '#ff3d7f', '#ffd166'])
  expect(auroraColors({ palette: 'custom', custom }, cover)).toEqual(custom)
  expect(defaultAuroraOptions.palette).toBe('cover')
})

test('a one-colour cover is spread into neighbouring hues, all at full brightness', () => {
  expect(coverAurora(image([100, [40, 120, 200]]))).toEqual(['#3399ff', '#3333ff', '#bb33ff', '#ff33bb'])
})

test('a two-colour cover gives both, heaviest first, then neighbours of the first', () => {
  expect(coverAurora(image([60, [230, 30, 30]], [40, [30, 30, 230]]))).toEqual(['#ff2121', '#2121ff', '#ff9021', '#daff21'])
})

test('a few stray pixels of another colour do not become a curtain', () => {
  const picked = coverAurora(image([99, [230, 30, 30]], [1, [30, 200, 30]]))
  expect(picked?.[0]).toBe('#ff2121')
  expect(picked).not.toContain('#21ff21')
})

test('a grey or transparent cover has no colours to give', () => {
  expect(coverAurora(image([100, [128, 128, 128]]))).toBeNull()
  expect(coverAurora(Array(400).fill(0))).toBeNull()
})

test('the sky is navidroid deep blue for classic and a dark shade of the first colour otherwise', () => {
  expect(skyColor([...CLASSIC])).toBe('#0c1030')
  expect(skyColor(['#3399ff', '#3333ff', '#bb33ff', '#ff33bb'])).toBe('#142433')
})
