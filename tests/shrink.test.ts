import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Shrinker } from '../src/main/shrink'

const dir = mkdtempSync(join(tmpdir(), 'lyria-shrink-'))
const put = (name: string, body: string): string => {
  const file = join(dir, name)
  writeFileSync(file, body)
  const old = new Date(Date.now() - 3600_000)
  utimesSync(file, old, old)
  return file
}

let calls = 0
let on = true
const shrinker = new Shrinker({
  wants: (head) => head.toString().startsWith('BIG'),
  encoder: () => (on ? async (body) => (calls++, Buffer.from(body.toString().slice(0, 4))) : undefined),
  ratio: 0.8
})

test('swaps a file for its smaller re-encoding and keeps its age', async () => {
  const file = put('a', 'BIG-0123456789')
  const before = statSync(file).mtimeMs
  await shrinker.shrink(file)
  expect(readFileSync(file, 'utf8')).toBe('BIG-')
  expect(statSync(file).mtimeMs).toBe(before)
  expect(readdirSync(dir).some((n) => n.endsWith('.part'))).toBe(false)
})

test('leaves alone what it does not want, and does not ask twice', async () => {
  calls = 0
  const file = put('b', 'small')
  await shrinker.shrink(file)
  await shrinker.shrink(file, Buffer.from('small'))
  expect(calls).toBe(0)
  expect(readFileSync(file, 'utf8')).toBe('small')
})

test('keeps the original when the re-encoding is not small enough', async () => {
  calls = 0
  const file = put('c', 'BIG!')
  await shrinker.shrink(file)
  await shrinker.shrink(file)
  expect(calls).toBe(1)
  expect(readFileSync(file, 'utf8')).toBe('BIG!')
})

test('does not bring back a file deleted while it was encoding', async () => {
  const file = join(dir, 'gone')
  await shrinker.shrink(file, Buffer.from('BIG-0123456789'))
  expect(readdirSync(dir)).not.toContain('gone')
})

test('a sweep shrinks what qualifies and stops when switched off', async () => {
  const d = put('d', 'BIG-abcdefghijkl')
  const e = put('e', 'BIG-mnopqrstuvwx')
  calls = 0
  await shrinker.sweep([d])
  expect(readFileSync(d, 'utf8')).toBe('BIG-')
  on = false
  await shrinker.sweep([e])
  expect(readFileSync(e, 'utf8')).toBe('BIG-mnopqrstuvwx')
  expect(calls).toBe(1)
})
