/**
 * Which rows of one track list are selected. Rows are named by key rather than by index, so a
 * selection survives the list being filtered or reloaded around it.
 */
export interface Selection {
  keys: ReadonlySet<string>
  /** The row a shift-click selects from: the last one clicked without shift. */
  anchor: string | null
}

export type SelectAction =
  /** Plain click: this row alone. */
  | { type: 'click'; index: number }
  /** Ctrl/Cmd-click: this row in or out, the rest as they were. */
  | { type: 'toggle'; index: number }
  /** Shift-click: anchor to here; `extend` (Ctrl+Shift) adds the range to what is already selected. */
  | { type: 'range'; index: number; extend: boolean }
  | { type: 'all' }
  | { type: 'clear' }
  /** The list changed: forget rows that are no longer in it. */
  | { type: 'sync' }

export const noSelection: Selection = { keys: new Set(), anchor: null }

/**
 * A key per row. A playlist can hold the same song twice, so a repeat is told apart by how many
 * times the song came before it.
 */
export function rowKeys(tracks: readonly { id: string }[]): string[] {
  const seen = new Map<string, number>()
  return tracks.map((t) => {
    const n = seen.get(t.id) ?? 0
    seen.set(t.id, n + 1)
    return n ? `${t.id}#${n}` : t.id
  })
}

/** What a click on row `index` does, from the keys held down. */
export function clickAction(e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, index: number): SelectAction {
  const ctrl = e.ctrlKey || e.metaKey
  if (e.shiftKey) return { type: 'range', index, extend: ctrl }
  return ctrl ? { type: 'toggle', index } : { type: 'click', index }
}

export function select(s: Selection, a: SelectAction, rows: readonly string[]): Selection {
  switch (a.type) {
    case 'click':
      return { keys: new Set([rows[a.index]]), anchor: rows[a.index] }
    case 'toggle': {
      const keys = new Set(s.keys)
      const key = rows[a.index]
      if (keys.has(key)) keys.delete(key)
      else keys.add(key)
      return { keys, anchor: key }
    }
    case 'range': {
      const from = s.anchor === null ? -1 : rows.indexOf(s.anchor)
      if (from < 0) return select(s, { type: 'click', index: a.index }, rows)
      const range = rows.slice(Math.min(from, a.index), Math.max(from, a.index) + 1)
      return { keys: new Set(a.extend ? [...s.keys, ...range] : range), anchor: s.anchor }
    }
    case 'all':
      return { keys: new Set(rows), anchor: s.anchor }
    case 'clear':
      return s.keys.size || s.anchor !== null ? noSelection : s
    case 'sync': {
      const present = new Set(rows)
      const keys = [...s.keys].filter((k) => present.has(k))
      const anchor = s.anchor !== null && present.has(s.anchor) ? s.anchor : null
      // Same selection, same object, so a list that reloads unchanged does not re-render its rows.
      return keys.length === s.keys.size && anchor === s.anchor ? s : { keys: new Set(keys), anchor }
    }
  }
}

/** The selected rows' indexes, in list order. */
export function selectedIndexes(s: Selection, rows: readonly string[]): number[] {
  return rows.flatMap((k, i) => (s.keys.has(k) ? [i] : []))
}
