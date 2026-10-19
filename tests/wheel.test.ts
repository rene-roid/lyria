import { expect, test } from 'bun:test'
import { wheelVolumeStep } from '../src/shared/format'

const sum = (events: number[]): number => events.reduce((v, d) => v + wheelVolumeStep(d), 0)

test('one notch moves the volume about 5%, however the platform splits it', () => {
  expect(sum([120])).toBeCloseTo(-0.05) // Wayland: one event per notch
  expect(sum(Array(8).fill(15))).toBeCloseTo(-0.05) // a high-resolution wheel: eight small events
  expect(wheelVolumeStep(-100)).toBeCloseTo(0.0417, 3) // Windows: scrolling up raises it
})

test('a fast spin is capped per event, and a sideways swipe does nothing', () => {
  expect(wheelVolumeStep(2000)).toBe(-0.05)
  expect(wheelVolumeStep(-3, 1)).toBe(0.05) // three lines up
  expect(Math.abs(wheelVolumeStep(0))).toBe(0)
})
