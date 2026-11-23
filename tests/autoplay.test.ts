import { afterEach, describe, expect, test } from 'bun:test'
import type { SubsonicClient } from '../src/shared/subsonic/client'
import type { PlayerCommandName, PlayerCommands, PlayerEvents, Track } from '../src/shared/types'

/** Just enough of an <audio> element for the engine: it plays at once and ends when told to. */
class FakeAudio extends EventTarget {
  crossOrigin = ''
  preload = ''
  volume = 1
  muted = false
  paused = true
  ended = false
  currentTime = 0
  duration = 100
  error = null
  src = ''
  load(): void {
    this.paused = true
    this.ended = false
  }
  async play(): Promise<void> {
    if (!this.paused) return
    this.paused = false
    this.dispatchEvent(new Event('play'))
  }
  pause(): void {
    if (this.paused) return
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }
  removeAttribute(): void {
    this.src = ''
  }
  /** The song plays out to its last second. */
  finish(): void {
    this.paused = true
    this.ended = true
    this.dispatchEvent(new Event('pause'))
    this.dispatchEvent(new Event('ended'))
  }
}

const node = () => ({ connect: () => undefined })
class FakeContext {
  currentTime = 0
  destination = {}
  resume = async () => undefined
  createMediaElementSource = node
  createGain = () => ({ ...node(), gain: { setTargetAtTime: () => undefined } })
  createAnalyser = () => ({ ...node(), frequencyBinCount: 128, getByteFrequencyData: () => undefined })
}

let audio: FakeAudio
const g = globalThis as Record<string, unknown>
g.window = globalThis
g.AudioContext = FakeContext
g.Audio = class extends FakeAudio {
  constructor() {
    super()
    audio = this
  }
}

const { AudioEngine } = await import('../src/renderer/host/engine')

const song = (id: string): Track => ({ id, title: id, artist: `artist of ${id}`, album: '', duration: 100 })

/** An answer that comes back only when the test says so. */
function later(): { promise: Promise<Track[]>; resolve: (tracks: Track[]) => void } {
  let resolve!: (tracks: Track[]) => void
  return { promise: new Promise((r) => (resolve = r)), resolve }
}

/** Lets every answer already on its way land. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

let engine: InstanceType<typeof AudioEngine>

/**
 * An engine on a server whose similar songs come from `similar`, recording what it was asked
 * after, and every queue it announced.
 */
function start(similar: (id: string) => Promise<Track[]> = async () => []) {
  const asked: string[] = []
  const queues: PlayerEvents['queueChanged'][] = []
  engine = new AudioEngine((event, payload) => {
    if (event === 'queueChanged') queues.push(payload as PlayerEvents['queueChanged'])
  })
  const none = async (): Promise<Track[]> => []
  const client = {
    streamUrl: (id: string) => `stream:${id}`,
    scrobble: async () => ({}),
    getSimilarSongs2: (id: string) => {
      asked.push(id)
      return similar(id)
    },
    getSongsByGenre: none,
    getTopSongs: none,
    getRandomSongs: none
  }
  engine.setClient(client as unknown as SubsonicClient)
  const send = <K extends PlayerCommandName>(cmd: K, payload: PlayerCommands[K]): void => engine.handle(cmd, payload)
  /**
   * The queue as it stands, by id, with a `|` where autoplay's songs begin. Those are sorted: the
   * radio deals them in a fresh order every time.
   */
  const queue = (): string => {
    const { queue: q, autoplayFrom } = queues[queues.length - 1]
    const ids = (part: Track[]): string[] => part.map((t) => t.id)
    const theirs = ids(q.slice(autoplayFrom)).sort()
    return [...ids(q.slice(0, autoplayFrom)), ...(theirs.length ? ['|', ...theirs] : [])].join(' ')
  }
  return { asked, send, queue }
}

afterEach(() => engine.handle('stop', undefined))

describe('autoplay', () => {
  test('a song on its own is followed by songs like it as soon as it plays', async () => {
    const { asked, send, queue } = start(async () => [song('a'), song('b')])
    send('setQueue', { tracks: [song('s1')] })
    await settle()
    expect(asked).toEqual(['s1'])
    expect(queue()).toBe('s1 | a b')
  })

  test('an album asks once its last song starts, after the last five heard, newest first', async () => {
    const { asked, send, queue } = start(async () => [song('a')])
    send('setQueue', { tracks: ['s1', 's2', 's3', 's4', 's5', 's6'].map(song) })
    await settle()
    expect(asked).toEqual([])
    send('playAt', { index: 5 })
    await settle()
    expect(asked).toEqual(['s6', 's5', 's4', 's3', 's2'])
    expect(queue()).toBe('s1 s2 s3 s4 s5 s6 | a')
  })

  test('asks once per song, however often it starts, and not again while an answer is out', async () => {
    const answer = later()
    const { asked, send } = start(() => answer.promise)
    send('setQueue', { tracks: [song('s1')] })
    await settle()
    send('pause', undefined)
    send('play', undefined)
    await settle()
    expect(asked).toEqual(['s1'])
    answer.resolve([])
    await settle()
    send('pause', undefined)
    send('play', undefined)
    await settle()
    expect(asked).toEqual(['s1'])
  })

  test('an answer for a queue that has since been replaced is dropped', async () => {
    const answers = { s1: later(), s2: later() }
    const { asked, send, queue } = start((id) => answers[id as keyof typeof answers].promise)
    send('setQueue', { tracks: [song('s1')] })
    await settle()
    send('setQueue', { tracks: [song('s2')] })
    await settle()
    expect(asked).toEqual(['s1', 's2'])
    answers.s1.resolve([song('late')])
    await settle()
    expect(queue()).toBe('s2')
    answers.s2.resolve([song('a')])
    await settle()
    expect(queue()).toBe('s2 | a')
  })

  test('never asks with repeat on or autoplay off', async () => {
    const { asked, send } = start()
    send('setRepeat', { repeat: 'all' })
    send('setQueue', { tracks: [song('s1')] })
    await settle()
    send('setRepeat', { repeat: 'one' })
    engine.setAutoplay(false)
    send('setRepeat', { repeat: 'off' })
    expect(asked).toEqual([])
    engine.setAutoplay(true)
    expect(asked).toEqual(['s1'])
  })

  test("songs you add go ahead of autoplay's, and the heading moves down past them", async () => {
    const { send, queue } = start(async () => [song('a'), song('b')])
    send('setQueue', { tracks: [song('s1')] })
    await settle()
    send('addToQueue', { tracks: [song('c')] })
    expect(queue()).toBe('s1 c | a b')
    send('addToQueue', { tracks: [song('d')], next: true })
    expect(queue()).toBe('s1 d c | a b')
    send('removeFromQueue', { index: 1 })
    expect(queue()).toBe('s1 c | a b')
    send('removeFromQueue', { index: 2 })
    expect(queue()).toMatch(/^s1 c \| [ab]$/)
    send('removeFromQueue', { index: 2 })
    expect(queue()).toBe('s1 c')
    send('clearQueue', undefined)
    expect(queue()).toBe('')
  })

  test("shuffle keeps autoplay's songs after yours, and turning it off puts both back", async () => {
    const { send, queue } = start(async () => [song('a'), song('b'), song('c')])
    send('setQueue', { tracks: [song('s1'), song('s2')] })
    send('playAt', { index: 1 })
    await settle()
    send('setShuffle', { shuffle: true })
    expect(queue()).toBe('s2 s1 | a b c')
    send('setShuffle', { shuffle: false })
    expect(queue()).toBe('s1 s2 | a b c')
  })

  test('with shuffle on, what autoplay finds goes after the shuffled order', async () => {
    const { send, queue } = start(async () => [song('a')])
    send('setShuffle', { shuffle: true })
    send('setQueue', { tracks: [song('s1'), song('s2'), song('s3')] })
    const order = queue()
    send('playAt', { index: 2 })
    await settle()
    expect(queue()).toBe(`${order} | a`)
    send('setShuffle', { shuffle: false })
    expect(queue()).toBe('s1 s2 s3 | a')
  })

  test('when the last song ends before the answer is in, playback carries on into it', async () => {
    const answer = later()
    const { send, queue } = start(() => answer.promise)
    send('setQueue', { tracks: [song('s1')] })
    await settle()
    audio.finish()
    expect(audio.ended).toBe(true)
    answer.resolve([song('a')])
    await settle()
    expect(queue()).toBe('s1 | a')
    expect(audio.src).toBe('stream:a')
    expect(audio.paused).toBe(false)
  })

  test('when nothing comes back, the last song rests at its start', async () => {
    const { send } = start(async () => [])
    send('setQueue', { tracks: [song('s1')] })
    await settle()
    audio.currentTime = 99
    audio.finish()
    expect(audio.paused).toBe(true)
    expect(audio.currentTime).toBe(0)
  })

  test('offline, only songs with a copy on this device are added', async () => {
    const { send, queue } = start(async () => [song('a'), song('b')])
    engine.setOnline(false)
    engine.available = async (ids) => ids.filter((id) => id === 's1' || id === 'b')
    send('setQueue', { tracks: [song('s1')] })
    await settle()
    expect(queue()).toBe('s1 | b')
  })
})

describe('song radio', () => {
  test('plays the song, then songs like it as part of the queue rather than autoplay', async () => {
    const { asked, send, queue } = start(async () => [song('a'), song('b')])
    send('playRadio', { track: song('s1') })
    await settle()
    expect(asked).toEqual(['s1'])
    const [first, ...rest] = queue().split(' ')
    expect(first).toBe('s1')
    expect(rest.sort()).toEqual(['a', 'b'])
  })
})
