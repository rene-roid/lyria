import { describe, expect, test } from 'bun:test'
import { sanitizeResume } from '../src/shared/types'
import type { Track } from '../src/shared/types'

const q = (n: number): Track[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i}`, title: `T${i}`, artist: 'A', album: 'B', duration: 100 }))

describe('sanitizeResume', () => {
  test('keeps a valid snapshot', () => {
    expect(sanitizeResume({ queue: q(3), index: 1, position: 42.5 })).toMatchObject({ index: 1, position: 42.5 })
  })

  test('drops empty or missing snapshots', () => {
    expect(sanitizeResume(null)).toBeNull()
    expect(sanitizeResume(undefined)).toBeNull()
    expect(sanitizeResume({ queue: [], index: 0, position: 0 })).toBeNull()
  })

  test('clamps out-of-range index and position', () => {
    expect(sanitizeResume({ queue: q(3), index: 9, position: -5 })).toMatchObject({ index: 2, position: 0 })
    expect(sanitizeResume({ queue: q(3), index: -1, position: NaN })).toMatchObject({ index: 0, position: 0 })
  })

  test('keeps where autoplay begins, and a snapshot from before autoplay has none of its songs', () => {
    expect(sanitizeResume({ queue: q(3), index: 0, position: 0, autoplayFrom: 1 })).toMatchObject({ autoplayFrom: 1 })
    expect(sanitizeResume({ queue: q(3), index: 0, position: 0 })).toMatchObject({ autoplayFrom: 3 })
    expect(sanitizeResume({ queue: q(3), index: 0, position: 0, autoplayFrom: 7 })).toMatchObject({ autoplayFrom: 3 })
    expect(sanitizeResume({ queue: q(3), index: 0, position: 0, autoplayFrom: -2 })).toMatchObject({ autoplayFrom: 0 })
    expect(sanitizeResume({ queue: q(3), index: 0, position: 0, autoplayFrom: 1.5 })).toMatchObject({ autoplayFrom: 3 })
  })
})
