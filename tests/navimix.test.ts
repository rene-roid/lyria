import { expect, test } from 'bun:test'
import { MIX_SECTIONS, parseMix, splitPlaylists } from '../src/shared/navimix'

/** The expected values are what the server's web UI shows for the same playlists (navidroid's MixesTest). */
const nb = (text: string, tag: string): string =>
  `NaviBeat Mixes: ${text}\nMade by NaviBeat  ·  navibeat.app\nnb1:${tag}:2026-10-15:fallback:30`
const pl = (id: string, name: string, comment: string) => ({ id, name, comment, owner: 'yuuki' })

const daily1 = pl('d1', '🟠 Daily Mix 1', nb('built around LEVEL NINE and what sits near it. Rotates weekly.', 'dailymix:dailymix-1'))
const radio2 = pl('r2', '🟠 Artist Radio 2', nb('everything you have by MakenCat. A different artist each week.', 'artistradio:artistradio-2'))
const evening = pl('ev', '🟠 Evening', nb('your evening, built from what you actually play at this time of day.', 'timeofday:evening'))
const night = pl('ni', '🟠 Night', nb('your night. Still learning when you listen.', 'timeofday:night'))
const discovery = pl('wd', '🟠 Weekly Discovery', nb('music you own, played once or twice, and then forgot.', 'discovery:discovery'))
const explo = pl('we', 'Weekly-Exploration', 'Created for fertileforg by Explo, using ListenBrainz recommendations.')
const jams = pl('dj', 'Daily-Jams', 'Built 2026-10-15 by explo-maintainer from your play history (ListenBrainz had no Daily Jams).')
const mine = pl('mine', 'Ado', 'Imported by Explo for fertileforg')

test('parses mixes like the web UI', () => {
  expect(parseMix(daily1.name, daily1.comment)).toMatchObject({
    title: 'Daily Mix 1',
    subject: 'LEVEL NINE',
    description: 'LEVEL NINE and more',
    color: '#e8115b',
    photo: true,
    section: 'madeForYou'
  })
  expect(parseMix(radio2.name, radio2.comment)).toMatchObject({
    title: 'MakenCat Radio',
    description: 'Everything you have by MakenCat',
    section: 'topMixes'
  })
  expect(parseMix(evening.name, evening.comment)?.description).toBe(
    'Your evening, built from what you actually play at this time of day.'
  )
  expect(parseMix(night.name, night.comment)?.description).toBe('Your night.')
  expect(parseMix(explo.name, explo.comment)).toMatchObject({
    title: 'Weekly Exploration',
    description: 'From your ListenBrainz recommendations',
    by: 'ListenBrainz',
    color: '#1e8a6e',
    photo: false
  })
  expect(parseMix(jams.name, jams.comment)?.description).toBe('Built from your play history')
  expect(parseMix(mine.name, mine.comment)).toBeNull()
})

test('splits and orders like the web UI', () => {
  const { mixes, own } = splitPlaylists([mine, jams, explo, discovery, night, evening, radio2, daily1], 20)
  expect(own.map((p) => p.name)).toEqual(['Ado'])
  const titles = (key: string): string[] => mixes.filter((m) => m.mix.section === key).map((m) => m.mix.title)
  expect(titles('madeForYou')).toEqual(['Daily Mix 1', 'Weekly Discovery', 'Weekly Exploration', 'Daily Jams'])
  // At 8pm the day's mixes start with the evening.
  expect(titles('timeOfDay')).toEqual(['Evening', 'Night'])
  expect(MIX_SECTIONS.map((s) => s.key)).toContain('favorites')
})
