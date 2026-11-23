import { expect, test } from 'bun:test'
import { MIX_SECTIONS, classifyPlaylist, parseMix, partitionHidden, shelfMixes, splitPlaylists, withoutHidden } from '../src/shared/navimix'

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

const genre = pl('g1', '🟠 Rock Mix', nb('Rock, one of the genres you play most.', 'genreradio:genreradio-1'))

test('classifies a playlist as exactly one of radio, mix or playlist', () => {
  expect(classifyPlaylist(radio2.name, radio2.comment)).toMatchObject({ kind: 'radio', mix: { title: 'MakenCat Radio' } })
  expect(classifyPlaylist(genre.name, genre.comment)).toMatchObject({ kind: 'radio', mix: { title: 'Rock Mix' } })
  expect(classifyPlaylist(daily1.name, daily1.comment)).toMatchObject({ kind: 'mix', mix: { title: 'Daily Mix 1' } })
  expect(classifyPlaylist(explo.name, explo.comment)).toMatchObject({ kind: 'mix', mix: { title: 'Weekly Exploration' } })
  expect(classifyPlaylist(mine.name, mine.comment)).toEqual({ kind: 'playlist' })
})

test('reads a radio from its name or comment, not from a word that merely starts with it', () => {
  expect(classifyPlaylist('Radio: Daft Punk')).toEqual({ kind: 'radio' })
  expect(classifyPlaylist('Daft Punk Radio')).toEqual({ kind: 'radio' })
  expect(classifyPlaylist('Late night radio')).toEqual({ kind: 'radio' })
  expect(classifyPlaylist('Road trip', 'Artist radio for Queen')).toEqual({ kind: 'radio' })
  expect(classifyPlaylist('Road trip', 'Radio station based on Queen')).toEqual({ kind: 'radio' })
  expect(classifyPlaylist('Radiohead')).toEqual({ kind: 'playlist' })
  expect(classifyPlaylist('Best of Radiohead', 'Songs I heard on the radio')).toEqual({ kind: 'playlist' })
})

test('splits radios out of the playlists and the mixes', () => {
  const byName = pl('rn', 'Jazz Radio', '')
  const { own, radios, mixes } = splitPlaylists([mine, byName, radio2, genre, daily1, explo], 20)
  expect(own.map((p) => p.name)).toEqual(['Ado'])
  expect(radios.map((p) => p.name)).toEqual(['Jazz Radio', '🟠 Artist Radio 2', '🟠 Rock Mix'])
  expect(radios.map((p) => p.mix?.title)).toEqual([undefined, 'MakenCat Radio', 'Rock Mix'])
  expect(mixes.map((p) => p.mix.title)).toEqual(['Daily Mix 1', 'Weekly Exploration'])
})

test('puts NaviBeat radios back among the mixes for the shelves that show them', () => {
  const { radios, mixes } = splitPlaylists([pl('rn', 'Jazz Radio', ''), radio2, daily1, genre], 20)
  expect(shelfMixes(radios, mixes, 20).map((p) => p.mix.title)).toEqual(['Daily Mix 1', 'MakenCat Radio', 'Rock Mix'])
})

test('drops the hidden playlists and keeps the order of the rest', () => {
  const lists = [mine, jams, explo]
  expect(withoutHidden(lists, ['dj', 'gone']).map((p) => p.id)).toEqual(['mine', 'we'])
  expect(withoutHidden(lists, []).map((p) => p.id)).toEqual(['mine', 'dj', 'we'])
})

test('sets the hidden playlists apart from the shown ones', () => {
  const { shown, hidden } = partitionHidden([mine, jams, explo], ['we', 'gone'])
  expect(shown.map((p) => p.id)).toEqual(['mine', 'dj'])
  expect(hidden.map((p) => p.id)).toEqual(['we'])
  expect(partitionHidden([mine], []).hidden).toEqual([])
})
