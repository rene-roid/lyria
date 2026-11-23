import { describe, expect, test } from 'bun:test'
import { clickAction, noSelection, rowKeys, select, selectedIndexes, type SelectAction, type Selection } from '../src/renderer/main/selection'

const rows = ['a', 'b', 'c', 'd', 'e']
const run = (actions: SelectAction[], list = rows, from: Selection = noSelection): Selection =>
  actions.reduce((s, a) => select(s, a, list), from)
const picked = (s: Selection, list = rows): string[] => selectedIndexes(s, list).map((i) => list[i])

describe('clickAction', () => {
  const keys = { shiftKey: false, ctrlKey: false, metaKey: false }

  test('maps modifier keys to actions', () => {
    expect(clickAction(keys, 2)).toEqual({ type: 'click', index: 2 })
    expect(clickAction({ ...keys, ctrlKey: true }, 2)).toEqual({ type: 'toggle', index: 2 })
    expect(clickAction({ ...keys, metaKey: true }, 2)).toEqual({ type: 'toggle', index: 2 })
    expect(clickAction({ ...keys, shiftKey: true }, 2)).toEqual({ type: 'range', index: 2, extend: false })
    expect(clickAction({ ...keys, shiftKey: true, ctrlKey: true }, 2)).toEqual({ type: 'range', index: 2, extend: true })
  })
})

describe('select', () => {
  test('a click selects that row alone', () => {
    const s = run([{ type: 'click', index: 1 }, { type: 'click', index: 3 }])
    expect(picked(s)).toEqual(['d'])
    expect(s.anchor).toBe('d')
  })

  test('ctrl-click toggles one row and moves the anchor', () => {
    const s = run([
      { type: 'click', index: 0 },
      { type: 'toggle', index: 2 },
      { type: 'toggle', index: 4 },
      { type: 'toggle', index: 0 }
    ])
    expect(picked(s)).toEqual(['c', 'e'])
    expect(s.anchor).toBe('a')
  })

  test('shift-click selects from the anchor, either direction, replacing the rest', () => {
    const down = run([{ type: 'click', index: 1 }, { type: 'range', index: 3, extend: false }])
    expect(picked(down)).toEqual(['b', 'c', 'd'])
    const up = run([{ type: 'range', index: 0, extend: false }], rows, down)
    expect(picked(up)).toEqual(['a', 'b'])
    expect(up.anchor).toBe('b')
  })

  test('ctrl+shift-click adds the range to the selection', () => {
    const s = run([
      { type: 'click', index: 0 },
      { type: 'toggle', index: 3 },
      { type: 'range', index: 4, extend: true }
    ])
    expect(picked(s)).toEqual(['a', 'd', 'e'])
  })

  test('shift-click with no anchor selects just that row', () => {
    const s = run([{ type: 'range', index: 2, extend: false }])
    expect(picked(s)).toEqual(['c'])
    expect(s.anchor).toBe('c')
  })

  test('select all and clear', () => {
    const all = run([{ type: 'click', index: 2 }, { type: 'all' }])
    expect(picked(all)).toEqual(rows)
    expect(all.anchor).toBe('c')
    expect(run([{ type: 'clear' }], rows, all)).toBe(noSelection)
    expect(run([{ type: 'clear' }])).toBe(noSelection)
  })

  test('the list changing drops rows that left it, anchor included', () => {
    const s = run([{ type: 'click', index: 1 }, { type: 'range', index: 3, extend: false }])
    const synced = run([{ type: 'sync' }], ['a', 'c', 'd'], s)
    expect(picked(synced, ['a', 'c', 'd'])).toEqual(['c', 'd'])
    expect(synced.anchor).toBeNull()
    expect(run([{ type: 'sync' }], ['d', 'c', 'b'], s)).toBe(s)
  })

  test('picked rows come back in list order, not click order', () => {
    const s = run([{ type: 'click', index: 4 }, { type: 'toggle', index: 0 }, { type: 'toggle', index: 2 }])
    expect(selectedIndexes(s, rows)).toEqual([0, 2, 4])
  })
})

describe('rowKeys', () => {
  test('a song listed twice gets a key per listing', () => {
    expect(rowKeys([{ id: 'x' }, { id: 'y' }, { id: 'x' }, { id: 'x' }])).toEqual(['x', 'y', 'x#1', 'x#2'])
  })

  test('selecting one copy leaves the other unselected', () => {
    const list = rowKeys([{ id: 'x' }, { id: 'y' }, { id: 'x' }])
    expect(selectedIndexes(run([{ type: 'click', index: 2 }], list), list)).toEqual([2])
  })
})
