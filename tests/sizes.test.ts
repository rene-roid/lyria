import { expect, test } from 'bun:test'
import { defaultMiniOptions, defaultWidgetOptions, miniSize, widgetSize, type CardSize } from '../src/shared/types'

const widget = (size: CardSize, more: Partial<typeof defaultWidgetOptions> = {}) =>
  widgetSize({ ...defaultWidgetOptions, size, ...more })

test('each widget size has its own box', () => {
  expect(widget('small')).toEqual({ width: 288, height: 52 })
  expect(widget('medium')).toEqual({ width: 340, height: 76 })
  expect(widget('large')).toEqual({ width: 420, height: 108 })
})

test('hiding the cover gives back its width and the gap beside it', () => {
  expect(widget('small', { cover: false }).width).toBe(244)
  expect(widget('medium', { cover: false }).width).toBe(276)
  expect(widget('large', { cover: false }).width).toBe(324)
})

test('the elapsed time widens small and medium, while large shows it beside the seek bar', () => {
  expect(widget('small', { elapsed: true }).width).toBe(360)
  expect(widget('medium', { elapsed: true }).width).toBe(414)
  expect(widget('large', { elapsed: true }).width).toBe(420)
})

test('each shuffle or like button widens the widget by one compact button', () => {
  expect(widget('medium', { like: true }).width).toBe(372)
  expect(widget('medium', { like: true, shuffle: true }).width).toBe(404)
  expect(widget('small', { shuffle: true, cover: false }).width).toBe(276)
})

test('each mini player size has its own box', () => {
  expect(miniSize({ ...defaultMiniOptions, size: 'small' })).toEqual({ width: 300, height: 84 })
  expect(miniSize({ ...defaultMiniOptions, size: 'medium' })).toEqual({ width: 340, height: 112 })
  expect(miniSize({ ...defaultMiniOptions, size: 'large' })).toEqual({ width: 384, height: 148 })
})

test('the mini player widens for its extra buttons, more on large where they are full size', () => {
  expect(miniSize({ ...defaultMiniOptions, size: 'medium', like: true, shuffle: true })).toEqual({ width: 404, height: 112 })
  expect(miniSize({ ...defaultMiniOptions, size: 'large', like: true })).toEqual({ width: 420, height: 148 })
})
