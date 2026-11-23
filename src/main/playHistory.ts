import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { PlayedTrack, PlayHistory } from '@shared/playHistory'

/**
 * Every play that counts, kept on this device whether or not the server has heard of it yet; see
 * shared/playHistory for why. The main window reads it whole, so it is kept small.
 */

/**
 * Songs kept. Past it the ones played longest ago go first. At about 150 bytes a song the whole
 * map stays under a megabyte, and 5000 different songs is years of listening for most libraries,
 * longer than any mix looks back.
 */
export const MAX_SONGS = 5000
const WRITE_DEBOUNCE_MS = 2000

const file = (): string => join(app.getPath('userData'), 'play-history.json')

let history: PlayHistory | undefined
let writeTimer: NodeJS.Timeout | undefined

export function all(): PlayHistory {
  if (!history) {
    try {
      const saved: unknown = JSON.parse(readFileSync(file(), 'utf8'))
      history = saved && typeof saved === 'object' && !Array.isArray(saved) ? (saved as PlayHistory) : {}
    } catch {
      history = {}
    }
  }
  return history
}

/**
 * A play just counted. Plays arrive in the order they happened, so one no later than the song's
 * last recorded play is the same submission sent again, and is not counted twice.
 */
export function recordPlay(track: PlayedTrack, time: number): void {
  const plays = all()
  const { id } = track
  const was = plays[id]
  if (!id || (was && time <= was.lastPlayed)) return
  // Straight off IPC, so only the fields asked for, and only as text.
  const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  plays[id] = {
    count: (was?.count ?? 0) + 1,
    lastPlayed: time,
    artist: text(track.artist) ?? '',
    artistId: text(track.artistId),
    album: text(track.album) ?? '',
    albumId: text(track.albumId),
    genre: text(track.genre)
  }
  const ids = Object.keys(plays)
  if (ids.length > MAX_SONGS) {
    ids.sort((a, b) => plays[a].lastPlayed - plays[b].lastPlayed)
    for (const old of ids.slice(0, ids.length - MAX_SONGS)) delete plays[old]
  }
  scheduleWrite()
}

function scheduleWrite(): void {
  if (writeTimer) return
  writeTimer = setTimeout(flush, WRITE_DEBOUNCE_MS)
}

/** Write what is waiting now; on quit, so the last plays are not lost to the debounce. */
export function flush(): void {
  clearTimeout(writeTimer)
  writeTimer = undefined
  if (!history) return
  try {
    mkdirSync(dirname(file()), { recursive: true })
    writeFileSync(`${file()}.part`, JSON.stringify(history))
    renameSync(`${file()}.part`, file())
  } catch {
    // kept in memory; the next play tries again
  }
}
