import { describe, expect, test } from 'bun:test'
import { nextPlayable } from '../src/shared/types'

/** A queue of five where only the given places can play, as offline with part of it on disk. */
const only = (...at: number[]) => (i: number) => at.includes(i)

describe('nextPlayable', () => {
  test('takes the asked-for song when it can play', () => {
    expect(nextPlayable(5, 2, 1, false, only(2, 4))).toBe(2)
  })

  test('moves on to the next one that can, forwards or back', () => {
    expect(nextPlayable(5, 0, 1, false, only(3))).toBe(3)
    expect(nextPlayable(5, 4, -1, false, only(1, 3))).toBe(3)
  })

  test('stops at the end of the queue unless it repeats', () => {
    expect(nextPlayable(5, 3, 1, false, only(1))).toBeUndefined()
    expect(nextPlayable(5, 3, 1, true, only(1))).toBe(1)
    expect(nextPlayable(5, 1, -1, true, only(4))).toBe(4)
  })

  test('starting past the end only finds something when it wraps', () => {
    expect(nextPlayable(5, 5, 1, false, only(0))).toBeUndefined()
    expect(nextPlayable(5, 5, 1, true, only(0))).toBe(0)
  })

  test('nothing playable, or nothing queued, is nothing', () => {
    expect(nextPlayable(5, 0, 1, true, only())).toBeUndefined()
    expect(nextPlayable(0, 0, 1, true, only(0))).toBeUndefined()
  })
})
