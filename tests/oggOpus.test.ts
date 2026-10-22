import { expect, test } from 'bun:test'
import { oggCrc, oggOpus, opusHeadPreSkip, opusPacketSamples } from '../src/shared/oggOpus'

type Page = { flags: number; granule: number; sequence: number; packets: Uint8Array[]; crcOk: boolean }

/** Splits a stream back into pages and packets, checking each page's CRC on the way. */
function parse(bytes: Uint8Array): Page[] {
  const pages: Page[] = []
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let at = 0; at < bytes.length; ) {
    expect(new TextDecoder().decode(bytes.subarray(at, at + 4))).toBe('OggS')
    const count = bytes[at + 26]
    const lacing = [...bytes.subarray(at + 27, at + 27 + count)]
    const length = 27 + count + lacing.reduce((n, l) => n + l, 0)
    const raw = bytes.slice(at, at + length)
    const crc = v.getUint32(at + 22, true)
    raw.fill(0, 22, 26)
    const packets: Uint8Array[] = []
    let body = at + 27 + count
    let run = 0
    for (const l of lacing) {
      run += l
      if (l < 255) {
        packets.push(bytes.subarray(body, body + run))
        body += run
        run = 0
      }
    }
    pages.push({
      flags: bytes[at + 5],
      granule: Number(v.getBigUint64(at + 6, true)),
      sequence: v.getUint32(at + 18, true),
      packets,
      crcOk: oggCrc(raw) === crc
    })
    at += length
  }
  return pages
}

// TOC byte 0xfc: CELT fullband, 20 ms, one frame -> 960 samples.
const packet = (size: number): Uint8Array => {
  const p = new Uint8Array(size).fill(7)
  p[0] = 0xfc
  return p
}

test('reads a packet length off its TOC byte', () => {
  expect(opusPacketSamples(packet(10))).toBe(960)
  expect(opusPacketSamples(new Uint8Array([0x08]))).toBe(960) // SILK 20 ms
  expect(opusPacketSamples(new Uint8Array([0xfd]))).toBe(1920) // two 20 ms frames
  expect(opusPacketSamples(new Uint8Array([0xe3, 0x03]))).toBe(3 * 120) // three 2.5 ms frames
})

test('writes headers, laced packets and granules a decoder can trust', () => {
  const packets = Array.from({ length: 120 }, (_, i) => packet(i === 3 ? 600 : 300))
  const total = 120 * 960 - 500 // the encoder padded the last frame
  const pages = parse(oggOpus({ packets, channels: 2, preSkip: 312, inputRate: 48000, totalSamples: total }))

  expect(pages.every((p) => p.crcOk)).toBe(true)
  expect(pages.map((p) => p.sequence)).toEqual(pages.map((_, i) => i))
  expect(pages[0].flags).toBe(0x02)
  expect(opusHeadPreSkip(pages[0].packets[0])).toBe(312)
  expect(pages[0].packets[0][9]).toBe(2)
  expect(new TextDecoder().decode(pages[1].packets[0].subarray(0, 8))).toBe('OpusTags')

  const audio = pages.slice(2)
  expect(audio.flatMap((p) => p.packets)).toEqual(packets) // nothing lost or split, a 600-byte one included
  expect(audio.length).toBeGreaterThan(1)
  let samples = 0
  for (const p of audio.slice(0, -1)) {
    samples += p.packets.length * 960
    expect(p.granule).toBe(samples)
  }
  const last = audio[audio.length - 1]
  expect(last.flags).toBe(0x04)
  expect(last.granule).toBe(312 + total) // trims the tail padding
})

test('rejects a header that is not OpusHead', () => {
  expect(opusHeadPreSkip(new Uint8Array(19))).toBeUndefined()
})
