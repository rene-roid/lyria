import { expect, test } from 'bun:test'
import { upNext, type Track } from '../src/shared/types'

const song = (id: string): Track => ({ id, title: id, artist: 'A', album: 'B', duration: 1 })
const queue = [song('a'), song('b'), song('c')]

test('up next is the following song in the queue', () => {
  expect(upNext({ queue, index: 0, repeat: 'off' })?.id).toBe('b')
})

test('the last song has nothing after it, unless the queue repeats', () => {
  expect(upNext({ queue, index: 2, repeat: 'off' })).toBeUndefined()
  expect(upNext({ queue, index: 2, repeat: 'all' })?.id).toBe('a')
  expect(upNext({ queue: [song('a')], index: 0, repeat: 'all' })).toBeUndefined()
})

test('repeat-one plays the same song again, so nothing is up next', () => {
  expect(upNext({ queue, index: 0, repeat: 'one' })).toBeUndefined()
})

test('an empty queue has nothing up next', () => {
  expect(upNext({ queue: [], index: -1, repeat: 'all' })).toBeUndefined()
})
