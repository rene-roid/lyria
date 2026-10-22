import { open, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'

/**
 * Swaps files in an on-disk cache for smaller re-encodings of themselves, one at a time and in
 * the background. A file the encoder turns down, or cannot make meaningfully smaller, is noted
 * and not offered again this run.
 */
export class Shrinker {
  private readonly passed = new Set<string>()
  private readonly running = new Map<string, Promise<void>>()
  private sweeping = false

  constructor(
    private readonly opts: {
      /** Whether a file is worth re-encoding, judged off its first bytes. */
      wants: (head: Buffer) => boolean
      /** The re-encoding, or undefined while it is switched off. Resolves null when it fails. */
      encoder: () => ((body: Buffer) => Promise<Buffer | null>) | undefined
      /** Kept only when it comes out at or below this share of the original's size. */
      ratio: number
    }
  ) {}

  /** Re-encode `file`, whose bytes the caller may already have in hand. */
  shrink(file: string, body?: Buffer): Promise<void> {
    const encode = this.opts.encoder()
    if (!encode || this.passed.has(file)) return Promise.resolve()
    if (body && !this.opts.wants(body)) {
      this.passed.add(file)
      return Promise.resolve()
    }
    const running = this.running.get(file)
    if (running) return running
    const job = this.replace(file, body, encode)
      .catch(() => void this.passed.add(file))
      .finally(() => this.running.delete(file))
    this.running.set(file, job)
    return job
  }

  private async replace(file: string, body: Buffer | undefined, encode: (b: Buffer) => Promise<Buffer | null>): Promise<void> {
    const before = body ?? (await readFile(file))
    if (!this.opts.wants(before)) {
      this.passed.add(file)
      return
    }
    const after = await encode(before)
    if (!after || after.byteLength > before.byteLength * this.opts.ratio) {
      this.passed.add(file)
      return
    }
    // Evicted or cleared while it was encoding: writing it now would bring it back.
    const was = await stat(file)
    const part = `${file}.shrink.part`
    try {
      await writeFile(part, after)
      await rename(part, file)
    } catch (e) {
      await rm(part, { force: true })
      throw e
    }
    await utimes(file, was.atime, was.mtime) // keep its place in the eviction order
  }

  /** Work through `files` (most wanted first), checking only their headers until one qualifies. */
  async sweep(files: string[]): Promise<void> {
    if (this.sweeping) return
    this.sweeping = true
    try {
      for (const file of files) {
        if (!this.opts.encoder()) return // switched off part way through
        if (this.passed.has(file)) continue
        const head = await readHead(file)
        if (head && this.opts.wants(head)) await this.shrink(file)
        else this.passed.add(file)
      }
    } finally {
      this.sweeping = false
    }
  }

  /** Forget what was passed over, for when the encoder's settings change or the cache is wiped. */
  reset(): void {
    this.passed.clear()
  }
}

const HEAD = 64 * 1024

async function readHead(file: string): Promise<Buffer | null> {
  try {
    const f = await open(file, 'r')
    try {
      const buf = Buffer.alloc(HEAD)
      const { bytesRead } = await f.read(buf, 0, HEAD, 0)
      return buf.subarray(0, bytesRead)
    } finally {
      await f.close()
    }
  } catch {
    return null
  }
}
