import { expect, test } from 'bun:test'
import { Heart, Zap } from 'lucide-react'
import { tagLook, tones } from '../src/renderer/main/tagLook'

const genre = (value: string) => tagLook({ kind: 'genre', value })
const hueOf = (c: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
  return Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b)
}

test('moods get the colours and emblem picked for them, whatever the case', () => {
  expect(tagLook({ kind: 'mood', value: 'Energetic' }).icon).toBe(Zap)
  expect(tagLook({ kind: 'mood', value: 'romantic' }).icon).toBe(Heart)
  expect(tagLook({ kind: 'mood', value: 'Sad' }).palette).toEqual(tagLook({ kind: 'mood', value: 'sad' }).palette)
  expect(tagLook({ kind: 'mood', value: 'sad' }).print).toBe('dots')
})

test('a genre goes by its narrowest family, accents and all', () => {
  // Kawaii metal is pink like kawaii, not black like metal; Électronique is electronic.
  expect(genre('Kawaii metal').palette[1]).not.toBe(genre('Metal').palette[1])
  expect(Math.abs(hueOf(genre('Électronique').palette[1]) - hueOf(genre('Electronic').palette[1]))).toBeLessThan(1.2)
  expect(genre('Electronic').print).toBe('tone')
  expect(genre('Electronic').icon).toBeUndefined()
})

test('siblings in a family are told apart, and every tag keeps its look', () => {
  const family = ['Electronic', 'Dance', 'Electropop', 'Edm', 'Synth-Pop'].map((g) => genre(g).palette[1])
  expect(new Set(family).size).toBeGreaterThan(2)
  expect(genre('Insulting title')).toEqual(genre('Insulting title'))
})

test('tones stretch a dull cover to full range', () => {
  // A grey ramp from 100 to 150: its darkest pixels print as ink, its lightest as the highlight.
  const px = new Uint8ClampedArray(51 * 4)
  for (let i = 0; i <= 50; i++) px.set([100 + i, 100 + i, 100 + i, 255], i * 4)
  const t = tones(px)
  expect(t[0]).toBeLessThan(50)
  expect(t[50]).toBeGreaterThan(200)
})
