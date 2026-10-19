import { expect, test } from 'bun:test'
import { splitCredits } from '../src/shared/format'

const sanz = { id: 'z', name: 'Sān-Z' }
const hoyo = { id: 'h', name: 'HOYO-MiX' }

test('each credited name links, the joining words stay as tagged', () => {
  expect(splitCredits('Sān-Z & HOYO-MiX', [sanz, hoyo])).toEqual([
    { text: 'Sān-Z', id: 'z' },
    { text: ' & ' },
    { text: 'HOYO-MiX', id: 'h' }
  ])
  expect(splitCredits('Sihan, Sān-Z, HOYO-MiX', [hoyo, { id: 's', name: 'Sihan' }, sanz]).map((p) => p.id ?? p.text)).toEqual([
    's', ', ', 'z', ', ', 'h'
  ])
  expect(splitCredits('BABYMETAL feat. Poppy', [{ id: 'b', name: 'BABYMETAL' }, { id: 'p', name: 'poppy' }])).toEqual([
    { text: 'BABYMETAL', id: 'b' },
    { text: ' feat. ' },
    { text: 'Poppy', id: 'p' }
  ])
})

test('a name inside a longer one does not steal its link', () => {
  expect(splitCredits('Adore & Ado', [{ id: 'a', name: 'Ado' }, { id: 'r', name: 'Adore' }])).toEqual([
    { text: 'Adore', id: 'r' },
    { text: ' & ' },
    { text: 'Ado', id: 'a' }
  ])
})

test('a line that disagrees with the credits gives way to the credited names', () => {
  const lei = { id: 'l', name: 'Lei Yuxin' }
  expect(splitCredits('Sān-Z, HOYO-MiX, Yuxin Lei', [sanz, hoyo, lei])).toEqual([
    { text: 'Sān-Z', id: 'z' },
    { text: ', ' },
    { text: 'HOYO-MiX', id: 'h' },
    { text: ', ' },
    { text: 'Lei Yuxin', id: 'l' }
  ])
})

test('no credits leave the line as plain text', () => {
  expect(splitCredits('Unknown artist', [])).toEqual([{ text: 'Unknown artist' }])
})
