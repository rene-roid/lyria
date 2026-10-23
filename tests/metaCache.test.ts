import { expect, mock, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const userData = mkdtempSync(join(tmpdir(), 'lyria-meta-'))

// Same export names as the other tests' electron mocks; see audioCache.test.
mock.module('electron', () => ({ app: { getPath: () => userData }, net: {}, protocol: {} }))

test('the first read after a launch carries the account the entries belong to', async () => {
  const saved = { scope: 'http://a|bob', entries: [['playlist:p1', '{"id":"p1"}']] as [string, string][] }
  writeFileSync(join(userData, 'metadata-cache.json.gz'), gzipSync(JSON.stringify(saved)))
  const metaCache = await import('../src/main/metaCache')

  // A blank scope here made the window take its cache for another account's and wipe it, so every
  // launch started cold -- and offline, with nothing at all.
  expect(await metaCache.all()).toEqual(saved)
})
