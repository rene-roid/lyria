/**
 * Just enough of an Ogg Opus writer (RFC 7845) to wrap the raw packets WebCodecs' AudioEncoder
 * hands back into a file Chromium's <audio> plays and seeks. Packets are never split across
 * pages, so every page's granule position is simply where its last packet ends.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    t[i] = r >>> 0
  }
  return t
})()

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]) >>> 0
  return crc
}

/** 48 kHz samples in one Opus packet, read off its TOC byte (RFC 6716 section 3.1). */
export function opusPacketSamples(packet: Uint8Array): number {
  if (packet.length === 0) return 0
  const toc = packet[0]
  const config = toc >> 3
  const tenths = config < 12 ? [100, 200, 400, 600][config % 4] : config < 16 ? [100, 200][config % 2] : [25, 50, 100, 200][config % 4]
  const code = toc & 3
  const frames = code === 0 ? 1 : code < 3 ? 2 : (packet[1] ?? 0) & 0x3f
  return (frames * tenths * 48) / 10
}

/** Pre-skip out of an OpusHead identification header, or undefined when it is not one. */
export function opusHeadPreSkip(head: Uint8Array): number | undefined {
  if (head.length < 19 || new TextDecoder().decode(head.subarray(0, 8)) !== 'OpusHead') return undefined
  return head[10] | (head[11] << 8)
}

const ascii = (s: string): Uint8Array => new TextEncoder().encode(s)

function opusHead(channels: number, preSkip: number, inputRate: number): Uint8Array {
  const b = new Uint8Array(19)
  const v = new DataView(b.buffer)
  b.set(ascii('OpusHead'))
  b[8] = 1 // version
  b[9] = channels
  v.setUint16(10, preSkip, true)
  v.setUint32(12, inputRate, true)
  v.setInt16(16, 0, true) // output gain
  b[18] = 0 // mapping family: mono or stereo
  return b
}

function opusTags(vendor: string): Uint8Array {
  const name = ascii(vendor)
  const b = new Uint8Array(8 + 4 + name.length + 4)
  const v = new DataView(b.buffer)
  b.set(ascii('OpusTags'))
  v.setUint32(8, name.length, true)
  b.set(name, 12)
  v.setUint32(12 + name.length, 0, true) // no user comments
  return b
}

const BOS = 0x02
const EOS = 0x04

function page(packets: Uint8Array[], flags: number, granule: number, serial: number, sequence: number): Uint8Array {
  const lacing: number[] = []
  for (const p of packets) {
    for (let n = p.length; ; n -= 255) {
      lacing.push(Math.min(n, 255))
      if (n < 255) break
    }
  }
  const body = packets.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(27 + lacing.length + body)
  const v = new DataView(out.buffer)
  out.set(ascii('OggS'))
  out[4] = 0 // version
  out[5] = flags
  v.setBigUint64(6, BigInt(granule), true)
  v.setUint32(14, serial, true)
  v.setUint32(18, sequence, true)
  out[26] = lacing.length
  out.set(lacing, 27)
  let at = 27 + lacing.length
  for (const p of packets) {
    out.set(p, at)
    at += p.length
  }
  v.setUint32(22, oggCrc(out), true) // computed with the CRC field still zero, as the spec asks
  return out
}

/** Lacing values a packet takes up: one per full 255 bytes, plus the terminating short one. */
const segments = (p: Uint8Array): number => Math.floor(p.length / 255) + 1

/** About a second of audio per page keeps both the page overhead and seek granularity small. */
const PAGE_SAMPLES = 48_000

export interface OggOpusInput {
  packets: Uint8Array[]
  channels: number
  preSkip: number
  /** The source's own rate, recorded for information only; Opus always decodes at 48 kHz. */
  inputRate: number
  /** Real 48 kHz samples encoded, so the last page can trim the encoder's tail padding. */
  totalSamples: number
}

export function oggOpus({ packets, channels, preSkip, inputRate, totalSamples }: OggOpusInput): Uint8Array {
  const serial = (Math.random() * 0xffffffff) >>> 0
  const pages: Uint8Array[] = [
    page([opusHead(channels, preSkip, inputRate)], BOS, 0, serial, 0),
    page([opusTags('Sonora')], 0, 0, serial, 1)
  ]
  const end = preSkip + totalSamples
  let granule = 0
  let pending: Uint8Array[] = []
  let laced = 0
  let pendingSamples = 0
  const emit = (last: boolean): void => {
    pages.push(page(pending, last ? EOS : 0, last ? Math.min(granule, end) : granule, serial, pages.length))
    pending = []
    laced = 0
    pendingSamples = 0
  }
  packets.forEach((p, i) => {
    if (pending.length && (laced + segments(p) > 255 || pendingSamples >= PAGE_SAMPLES)) emit(false)
    pending.push(p)
    laced += segments(p)
    const samples = opusPacketSamples(p)
    pendingSamples += samples
    granule += samples
    if (i === packets.length - 1) emit(true)
  })
  const out = new Uint8Array(pages.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of pages) {
    out.set(p, at)
    at += p.length
  }
  return out
}
