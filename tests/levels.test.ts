import { expect, test } from 'bun:test'
import { LevelMeter, follow } from '../src/shared/levels'

const frame = (all: number, low = all): number[] => [low, ...Array(47).fill(all)]

test('silence reads as nothing', () => {
  const m = new LevelMeter()
  expect(m.read(frame(0))).toEqual({ level: 0, kick: 0 })
  expect(m.read(frame(0))).toEqual({ level: 0, kick: 0 })
})

test('a steady sound is at its own peak, however quiet the master', () => {
  const loud = new LevelMeter()
  loud.read(frame(200))
  expect(loud.read(frame(200))).toEqual({ level: 1, kick: 0 })
  const quiet = new LevelMeter()
  quiet.read(frame(100))
  expect(quiet.read(frame(100))).toEqual({ level: 1, kick: 0 })
})

test('a quieter passage reads against the recent peak', () => {
  const m = new LevelMeter()
  m.read(frame(200))
  expect(m.read(frame(180)).level).toBeCloseTo(0.534, 3)
})

test('a jump in the bass is a hit, sized by how far it rises over its average', () => {
  const m = new LevelMeter()
  for (let i = 0; i < 60; i++) m.read(frame(150))
  expect(m.read(frame(150, 160)).kick).toBeCloseTo(0.301, 3)
  const n = new LevelMeter()
  for (let i = 0; i < 60; i++) n.read(frame(150))
  expect(n.read(frame(150, 200)).kick).toBe(1)
})

test('loudness rises quickly and settles slowly', () => {
  expect(follow({ level: 0, kick: 0 }, { level: 1, kick: 0 }, 0.06).level).toBeCloseTo(0.632, 3)
  expect(follow({ level: 1, kick: 0 }, { level: 0, kick: 0 }, 0.06).level).toBeCloseTo(0.861, 3)
  expect(follow({ level: 1, kick: 0 }, { level: 0, kick: 0 }, 0.4).level).toBeCloseTo(0.368, 3)
})

test('a hit flashes at once and fades over about 150ms', () => {
  expect(follow({ level: 0, kick: 0.2 }, { level: 0, kick: 0.9 }, 1 / 30).kick).toBe(0.9)
  expect(follow({ level: 0, kick: 1 }, { level: 0, kick: 0 }, 0.15).kick).toBeCloseTo(0.368, 3)
})
