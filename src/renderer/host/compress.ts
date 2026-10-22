import { oggOpus, opusHeadPreSkip } from '@shared/oggOpus'

/**
 * Re-encoding for the on-disk caches. Main has no codecs of its own, so it hands cached files to
 * this hidden window, which already has Chromium's decoders and WebCodecs' encoders to hand.
 */

const RATE = 48_000
/** One second per AudioData: big enough to keep the call count down, small enough to stay cheap. */
const CHUNK = RATE
/** Past this the decoded PCM alone runs to gigabytes (a two-hour mix), so it is left alone. */
const MAX_SOURCE = 400 * 1024 * 1024
/** libopus' usual lookahead at 48 kHz, for when the encoder does not report its own. */
const DEFAULT_PRE_SKIP = 312

/** Decode a song and encode it to Ogg Opus at `kbps`. Null when it cannot be, or should not be. */
export async function toOpus(bytes: Uint8Array, kbps: number): Promise<Uint8Array | null> {
  if (bytes.byteLength > MAX_SOURCE || typeof AudioEncoder === 'undefined') return null
  // Decoding through a 48 kHz context resamples on the way, which is the only rate Opus takes.
  const pcm = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(bytes.slice().buffer)
  const channels = pcm.numberOfChannels
  if (channels > 2 || pcm.length === 0) return null // surround needs a channel mapping table; rare enough to skip

  const config: AudioEncoderConfig = { codec: 'opus', sampleRate: RATE, numberOfChannels: channels, bitrate: kbps * 1000 }
  if (!(await AudioEncoder.isConfigSupported(config)).supported) return null

  const packets: Uint8Array[] = []
  let preSkip = DEFAULT_PRE_SKIP
  let failure: unknown
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const head = meta?.decoderConfig?.description
      if (head) {
        const view = ArrayBuffer.isView(head)
          ? new Uint8Array(head.buffer, head.byteOffset, head.byteLength)
          : new Uint8Array(head)
        preSkip = opusHeadPreSkip(view) ?? preSkip
      }
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      packets.push(data)
    },
    error: (e) => {
      failure = e
    }
  })
  encoder.configure(config)

  const planes = Array.from({ length: channels }, (_, c) => pcm.getChannelData(c))
  for (let at = 0; at < pcm.length && !failure; at += CHUNK) {
    const frames = Math.min(CHUNK, pcm.length - at)
    const data = new Float32Array(frames * channels)
    planes.forEach((plane, c) => data.set(plane.subarray(at, at + frames), c * frames))
    const audio = new AudioData({
      format: 'f32-planar',
      sampleRate: RATE,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((at * 1e6) / RATE),
      data
    })
    encoder.encode(audio)
    audio.close()
    // Let the encoder drain rather than queueing the whole song's worth of PCM copies at once.
    while (encoder.encodeQueueSize > 4 && !failure) {
      await new Promise((resolve) => encoder.addEventListener('dequeue', resolve, { once: true }))
    }
  }
  await encoder.flush().catch((e) => (failure ??= e))
  if (encoder.state !== 'closed') encoder.close()
  if (failure || packets.length === 0) return null
  return oggOpus({ packets, channels, preSkip, inputRate: RATE, totalSamples: pcm.length })
}

const COVER_QUALITY = 0.82

/** A cover re-encoded as WebP. Null for anything it cannot decode, and for animated GIFs. */
export async function toWebp(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return null // GIF: drawing it would keep one frame
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]))
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: COVER_QUALITY })
    return blob.type === 'image/webp' ? new Uint8Array(await blob.arrayBuffer()) : null
  } finally {
    bitmap.close()
  }
}
