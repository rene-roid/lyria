import type {
  NormalizeMode,
  PlayerCommandName,
  PlayerCommands,
  PlayerEvents,
  RepeatMode,
  ResumeState,
  Track
} from '@shared/types'
import { nextPlayable, replayGainFactor, sanitizeResume } from '@shared/types'
import type { SubsonicClient } from '@shared/subsonic/client'
import { clamp } from '@shared/format'
import { radio } from '@shared/radio'

type Emit = <K extends keyof PlayerEvents>(event: K, payload: PlayerEvents[K]) => void

const POSITION_INTERVAL_MS = 250
const FRAME_INTERVAL_MS = 1000 / 30
const FRAME_BINS = 48
/** Songs autoplay adds each time the queue reaches its last song. */
const AUTOPLAY_COUNT = 20
/** How many of the songs heard last autoplay finds more like. */
const AUTOPLAY_SEEDS = 5
/** Songs a song radio follows its song with. */
const RADIO_COUNT = 50

/**
 * The single owner of the <audio> element. Runs inside the hidden audio-host window.
 * Everything else in the app talks to it through PlayerCommands and listens to PlayerEvents.
 */
export class AudioEngine {
  private readonly audio = new Audio()
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private normalize: NormalizeMode = 'off'
  private analyser: AnalyserNode | null = null
  private analyserData = new Uint8Array(0)
  private readonly bins = new Uint8Array(FRAME_BINS)

  private client: SubsonicClient | null = null
  private queue: Track[] = []
  /** Pre-shuffle order so shuffle can be turned off losslessly. */
  private unshuffled: Track[] | null = null
  private index = -1
  private repeat: RepeatMode = 'off'
  private shuffle = false

  private positionTimer: number | undefined
  private frameTimer: number | undefined
  private framesWanted = false
  private consecutiveErrors = 0
  private scrobbleSubmitted = false
  /** Seconds to jump to once the next source reports its metadata (restored position). */
  private pendingSeek = 0
  /** Object URL of the cached copy currently playing, so it can be revoked when it is replaced. */
  private localUrl: string | null = null
  /** Bumped on every load, so a cache download that lands late cannot hijack a newer track. */
  private localToken = 0
  /** Whether the server can be reached. Without it, songs with no copy on disk are skipped, not streamed. */
  private online = true
  /** Top the queue up with songs like the last few heard once its last song is playing. */
  private autoplay = true
  /**
   * Queue entries autoplay put there. Marked by entry rather than position so the mark survives
   * removals and reorders; the run of them that ends the queue is what the queue panel heads.
   */
  private readonly autoplayed = new WeakSet<Track>()
  /**
   * The last request for more songs, made after `after` started. Replacing the queue drops it,
   * which is how an answer that comes back for the old queue knows to go unheard.
   */
  private ask: { after: Track; answered: boolean } | null = null

  constructor(private readonly emit: Emit) {
    const a = this.audio
    a.crossOrigin = 'anonymous'
    a.preload = 'auto'
    a.volume = 0.8

    a.addEventListener('play', () => {
      void this.ctx?.resume()
      this.emit('playStateChanged', { playing: true })
      this.startTimers()
      this.maybeAutoplay()
    })
    a.addEventListener('pause', () => {
      this.emit('playStateChanged', { playing: false })
      this.stopPositionTimer()
      this.emitPosition()
    })
    a.addEventListener('loadedmetadata', () => {
      if (this.pendingSeek > 0) {
        a.currentTime = Math.min(this.pendingSeek, Math.max(0, a.duration - 0.25))
        this.pendingSeek = 0
      }
      this.emitPosition()
    })
    a.addEventListener('ended', () => this.onEnded())
    a.addEventListener('durationchange', () => this.emitPosition())
    a.addEventListener('seeked', () => this.emitPosition())
    a.addEventListener('playing', () => {
      this.consecutiveErrors = 0
    })
    a.addEventListener('timeupdate', () => this.maybeScrobble())
    a.addEventListener('error', () => void this.onAudioError())
  }

  /**
   * Asked to find a healthier server on the first playback error of a streak. Returns true when it
   * switched, in which case the current track is reloaded from the new one instead of being skipped.
   */
  recover?: () => Promise<boolean>

  /** Pulls a track into the on-disk cache and resolves with its bytes. Undefined disables caching. */
  fetchCached?: (id: string, url: string) => Promise<Uint8Array | null>

  /** A downloaded or already-cached copy, played instead of the stream. Null when there is none. */
  findLocal?: (id: string) => Promise<Uint8Array | null>

  /**
   * Tells the server a play counted. Main queues it while the server is unreachable, so plays of
   * downloaded songs offline still reach the play counts. Without it the client is called directly.
   */
  reportPlay?: (track: Track, time: number) => void

  /** Which of `ids` have a downloaded or cached copy. Undefined: every song is taken to stream. */
  available?: (ids: string[]) => Promise<string[]>

  /** Asks whether the server can be reached right now, once a song has failed to stream. */
  checkOnline?: () => Promise<boolean>

  private async onAudioError(): Promise<void> {
    const a = this.audio
    const code = a.error?.code
    const track = this.current
    const at = Number.isFinite(a.currentTime) ? a.currentTime : 0
    const wasPlaying = !a.paused
    // A bad cached copy is not a server problem: drop back to the stream and stay on this track.
    if (track && this.client && this.localUrl && a.src === this.localUrl) {
      this.localToken += 1 // no second swap, the same bytes would fail again
      this.releaseLocal()
      this.swapSrc(this.client.streamUrl(track.id), at, wasPlaying)
      return
    }
    this.consecutiveErrors += 1
    // A server that dropped off the network errors on every track, so retry the same one elsewhere
    // before burning through the queue.
    if (this.consecutiveErrors === 1 && this.recover && (await this.recover())) {
      this.load(this.index, wasPlaying, at)
      return
    }
    // No server anywhere: carry on with what is on this device instead of failing down the queue.
    if (this.online && this.checkOnline && !(await this.checkOnline().catch(() => true))) this.online = false
    if (!this.online && this.available) {
      this.consecutiveErrors = 0
      this.load(this.index + 1, wasPlaying)
      return
    }
    this.emit('error', { message: `Playback error${code ? ` (code ${code})` : ''}: ${track?.title ?? 'unknown track'}` })
    if (this.consecutiveErrors < Math.min(this.queue.length, 5)) {
      window.setTimeout(() => this.next(true), 400)
    } else {
      this.emit('playStateChanged', { playing: false })
    }
  }

  // ---- wiring ---------------------------------------------------------------

  setClient(client: SubsonicClient | null): void {
    this.client = client
    if (!client) this.handle('stop', undefined)
  }

  setOnline(online: boolean): void {
    this.online = online
  }

  setFramesWanted(wanted: boolean): void {
    this.framesWanted = wanted
    if (wanted && !this.audio.paused) this.startFrameTimer()
    if (!wanted) this.stopFrameTimer()
  }

  /** Volume normalisation mode; takes effect on the current track immediately. */
  setNormalize(mode: NormalizeMode): void {
    this.normalize = mode
    this.applyGain()
  }

  setAutoplay(on: boolean): void {
    this.autoplay = on
    this.maybeAutoplay()
  }

  restore(opts: {
    volume: number
    muted: boolean
    repeat: RepeatMode
    shuffle: boolean
    normalize: NormalizeMode
    autoplay: boolean
    resume?: ResumeState | null
  }): void {
    this.audio.volume = clamp(opts.volume, 0, 1)
    this.audio.muted = opts.muted
    this.normalize = opts.normalize
    this.autoplay = opts.autoplay
    this.repeat = opts.repeat
    this.shuffle = opts.shuffle
    this.emit('volumeChanged', { volume: this.audio.volume, muted: this.audio.muted })
    this.emit('modeChanged', { repeat: this.repeat, shuffle: this.shuffle })

    // The saved queue is already in play order, so load it as-is instead of re-shuffling it.
    // ponytail: the pre-shuffle order is not persisted, so turning shuffle off after a resume keeps the shuffled order.
    const resume = sanitizeResume(opts.resume)
    if (!resume) return
    this.queue = [...resume.queue]
    this.index = resume.index
    for (const t of this.queue.slice(resume.autoplayFrom)) this.autoplayed.add(t)
    this.emitQueue()
    this.load(this.index, false, resume.position)
  }

  get current(): Track | null {
    return this.queue[this.index] ?? null
  }

  // ---- commands ---------------------------------------------------------------

  handle<K extends PlayerCommandName>(cmd: K, payload: PlayerCommands[K]): void {
    switch (cmd) {
      case 'play':
        if (!this.audio.src && this.queue.length) this.load(Math.max(this.index, 0), true)
        else void this.safePlay()
        break
      case 'pause':
        this.audio.pause()
        break
      case 'toggle':
        if (this.audio.paused) this.handle('play', undefined)
        else this.audio.pause()
        break
      case 'next':
        this.next(true)
        break
      case 'prev':
        this.prev()
        break
      case 'stop':
        this.stop()
        break
      case 'seek': {
        const { position } = payload as PlayerCommands['seek']
        const dur = Number.isFinite(this.audio.duration) ? this.audio.duration : this.current?.duration ?? 0
        this.audio.currentTime = clamp(position, 0, Math.max(0, dur - 0.25))
        this.emitPosition()
        break
      }
      case 'setVolume': {
        const { volume } = payload as PlayerCommands['setVolume']
        this.audio.volume = clamp(volume, 0, 1)
        if (this.audio.volume > 0 && this.audio.muted) this.audio.muted = false
        this.emit('volumeChanged', { volume: this.audio.volume, muted: this.audio.muted })
        break
      }
      case 'setMuted': {
        this.audio.muted = (payload as PlayerCommands['setMuted']).muted
        this.emit('volumeChanged', { volume: this.audio.volume, muted: this.audio.muted })
        break
      }
      case 'setQueue': {
        const { tracks, index = 0, autoplay = true } = payload as PlayerCommands['setQueue']
        this.replaceQueue(tracks, index)
        this.emitQueue()
        if (this.queue.length) this.load(this.index, autoplay)
        else this.stop()
        break
      }
      case 'playRadio': {
        const { track } = payload as PlayerCommands['playRadio']
        this.replaceQueue([track], 0)
        // Asked before the song starts, so autoplay sees a request already out and stays quiet.
        this.askFor([track], RADIO_COUNT, false)
        this.emitQueue()
        this.load(0, true)
        break
      }
      case 'addToQueue': {
        const { tracks, next = false } = payload as PlayerCommands['addToQueue']
        if (!tracks.length) break
        const wasEmpty = this.queue.length === 0
        // What you add goes ahead of the songs autoplay lined up.
        const at = next ? this.index + 1 : Math.max(this.autoplayFrom(this.queue), this.index + 1)
        this.queue.splice(at, 0, ...tracks)
        this.unshuffled?.splice(this.autoplayFrom(this.unshuffled), 0, ...tracks)
        this.emitQueue()
        if (wasEmpty) this.load(0, true)
        break
      }
      case 'playAt': {
        const { index } = payload as PlayerCommands['playAt']
        if (index >= 0 && index < this.queue.length) this.load(index, true)
        break
      }
      case 'removeFromQueue': {
        const { index } = payload as PlayerCommands['removeFromQueue']
        if (index < 0 || index >= this.queue.length) break
        const [removed] = this.queue.splice(index, 1)
        if (this.unshuffled) this.unshuffled = this.unshuffled.filter((t) => t !== removed)
        if (index === this.index) {
          if (this.queue.length === 0) this.stop()
          else this.load(Math.min(index, this.queue.length - 1), !this.audio.paused)
        } else if (index < this.index) {
          this.index -= 1
        }
        this.emitQueue()
        this.maybeAutoplay()
        break
      }
      case 'clearQueue':
        this.stop()
        break
      case 'setStarred': {
        const { id, starred } = payload as PlayerCommands['setStarred']
        for (const t of this.queue) if (t.id === id) t.starred = starred
        this.emit('starChanged', { id, starred })
        break
      }
      case 'setRepeat':
        this.repeat = (payload as PlayerCommands['setRepeat']).repeat
        this.emit('modeChanged', { repeat: this.repeat, shuffle: this.shuffle })
        this.maybeAutoplay()
        break
      case 'setShuffle': {
        const { shuffle } = payload as PlayerCommands['setShuffle']
        if (shuffle === this.shuffle) break
        this.shuffle = shuffle
        const cur = this.current
        if (shuffle) {
          this.unshuffled = [...this.queue]
          // The playing song up front, then yours, then autoplay's, each lot shuffled on its own.
          const from = this.autoplayFrom(this.queue)
          const others = (part: Track[]): Track[] => shuffled(part.filter((t) => t !== cur))
          this.queue = [...(cur ? [cur] : []), ...others(this.queue.slice(0, from)), ...others(this.queue.slice(from))]
          this.index = cur ? 0 : -1
        } else if (this.unshuffled) {
          this.queue = this.unshuffled
          this.unshuffled = null
          this.index = cur ? this.queue.indexOf(cur) : -1
        }
        this.emit('modeChanged', { repeat: this.repeat, shuffle: this.shuffle })
        this.emitQueue()
        this.maybeAutoplay()
        break
      }
    }
  }

  // ---- internals ----------------------------------------------------------------

  private ensureGraph(): void {
    if (this.ctx) return
    try {
      this.ctx = new AudioContext()
      const source = this.ctx.createMediaElementSource(this.audio)
      this.gain = this.ctx.createGain()
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.75
      this.analyserData = new Uint8Array(this.analyser.frequencyBinCount)
      // Gain sits before the analyser so the visualiser shows what is actually heard.
      source.connect(this.gain)
      this.gain.connect(this.analyser)
      this.analyser.connect(this.ctx.destination)
      this.applyGain()
    } catch (err) {
      console.error('[engine] Web Audio graph failed; playing without visualiser', err)
      this.ctx = null
      this.gain = null
      this.analyser = null
    }
  }

  /** Point the gain node at the current track's ReplayGain. No graph means no normalisation. */
  private applyGain(): void {
    if (!this.gain || !this.ctx) return
    const factor = replayGainFactor(this.current?.gain, this.normalize)
    // Short ramp instead of a step, so switching modes mid-track does not click.
    this.gain.gain.setTargetAtTime(factor, this.ctx.currentTime, 0.05)
  }

  /**
   * Load the song at `index`. Offline, that is the nearest one from there that is on this device,
   * looking the way `step` points, so the queue plays what it can rather than erroring song by song.
   */
  private load(index: number, autoplay: boolean, seek = 0, step: 1 | -1 = 1): void {
    if (this.online || !this.available || !this.client) return this.open(index, autoplay, seek)
    const token = (this.localToken += 1)
    void this.available(this.queue.map((t) => t.id))
      .catch((): string[] => [])
      .then((ids) => {
        if (token !== this.localToken) return
        const local = new Set(ids)
        const at = nextPlayable(this.queue.length, index, step, this.repeat === 'all', (i) => local.has(this.queue[i].id))
        if (at === undefined) this.nothingOnDevice(clamp(index, 0, this.queue.length - 1))
        else this.open(at, autoplay, at === index ? seek : 0)
      })
  }

  /** Offline with nothing left to play from disk: rest on the song asked for, unloaded, and say why. */
  private nothingOnDevice(index: number): void {
    this.audio.pause()
    this.releaseLocal()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.index = index
    this.emit('trackChanged', { track: this.current, index })
    this.emit('positionUpdate', { position: 0, duration: this.current?.duration ?? 0 })
    this.emit('error', { message: 'Offline, and nothing further in the queue is on this device' })
  }

  private open(index: number, autoplay: boolean, seek = 0): void {
    const track = this.queue[index]
    if (!track || !this.client) return
    this.ensureGraph()
    this.index = index
    this.scrobbleSubmitted = false
    this.pendingSeek = seek
    this.applyGain()
    const url = this.client.streamUrl(track.id)
    const token = (this.localToken += 1)
    this.emit('trackChanged', { track, index })
    this.emit('positionUpdate', { position: seek, duration: track.duration })
    if (autoplay) void this.client.scrobble(track.id, false).catch(() => undefined)

    const start = (src: string, local: string | null): void => {
      // The previous copy is let go only once the element has moved off it.
      const previous = this.localUrl
      this.localUrl = local
      this.audio.src = src
      this.audio.load()
      if (previous && previous !== local) URL.revokeObjectURL(previous)
      if (autoplay) void this.safePlay()
    }
    const stream = (): void => {
      start(url, null)
      this.cacheAhead(track, url)
    }
    if (!this.findLocal) return stream()
    // A copy on disk plays straight away, server or no server; only a miss goes to the network.
    void this.findLocal(track.id)
      .catch(() => null)
      .then((bytes) => {
        if (token !== this.localToken) return
        if (!bytes?.length) return stream()
        const local = URL.createObjectURL(new Blob([bytes as BlobPart]))
        start(local, local)
      })
  }

  private async safePlay(): Promise<void> {
    try {
      await this.ctx?.resume()
      await this.audio.play()
    } catch (err) {
      if ((err as DOMException).name !== 'AbortError') {
        this.emit('error', { message: `Could not start playback: ${(err as Error).message}` })
      }
    }
  }

  /**
   * Play `src` from `at` seconds. Swapping the element's source costs one media load, which is
   * why this is only used for the cached copy, never mid-stream.
   */
  private swapSrc(src: string, at: number, play: boolean): void {
    this.pendingSeek = at
    this.audio.src = src
    this.audio.load()
    if (play) void this.safePlay()
  }

  private releaseLocal(): void {
    if (this.localUrl) URL.revokeObjectURL(this.localUrl)
    this.localUrl = null
  }

  /**
   * Download the track we just started streaming, then hand playback over to the local copy so
   * the rest of it cannot stutter. Late or stale downloads are dropped.
   */
  private cacheAhead(track: Track, url: string): void {
    const token = (this.localToken += 1)
    this.releaseLocal()
    if (!this.fetchCached) return
    void this.fetchCached(track.id, url)
      .then((bytes) => {
        const a = this.audio
        if (!bytes?.length || token !== this.localToken) return
        // Nothing left to protect from a stutter, and the swap itself would be audible.
        if (Number.isFinite(a.duration) && a.duration - a.currentTime < 10) return
        // An already-cached track can land before loadedmetadata has applied a restored
        // position, so a seek that is still pending outranks the element's own clock.
        const at = this.pendingSeek > 0 ? this.pendingSeek : a.currentTime
        this.localUrl = URL.createObjectURL(new Blob([bytes as BlobPart]))
        this.swapSrc(this.localUrl, at, !a.paused)
      })
      .catch(() => undefined)
  }

  private stop(): void {
    this.audio.pause()
    this.localToken += 1
    this.releaseLocal()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.queue = []
    this.unshuffled = null
    this.index = -1
    this.ask = null
    this.stopTimers()
    this.emitQueue()
    this.emit('trackChanged', { track: null, index: -1 })
    this.emit('positionUpdate', { position: 0, duration: 0 })
    this.emit('playStateChanged', { playing: false })
  }

  private next(userInitiated: boolean): void {
    if (!this.queue.length) return
    let nextIndex = this.index + 1
    if (nextIndex >= this.queue.length) {
      if (this.repeat === 'all' || userInitiated) nextIndex = 0
      else {
        // Autoplay is still looking: wait at the end, and its answer carries on from there.
        if (this.ask?.answered !== false) this.rewind()
        return
      }
    }
    const shouldPlay = userInitiated ? !this.audio.paused || this.audio.ended || this.audio.currentTime === 0 : true
    this.load(nextIndex, shouldPlay)
  }

  private prev(): void {
    if (!this.queue.length) return
    if (this.audio.currentTime > 3 || this.index <= 0) {
      this.audio.currentTime = 0
      this.emitPosition()
      if (this.index <= 0 && this.audio.currentTime <= 3 && this.repeat === 'all' && this.queue.length > 1) {
        this.load(this.queue.length - 1, !this.audio.paused, 0, -1)
      }
      return
    }
    this.load(this.index - 1, !this.audio.paused, 0, -1)
  }

  private onEnded(): void {
    this.submitScrobble()
    if (this.repeat === 'one') {
      this.audio.currentTime = 0
      void this.safePlay()
      return
    }
    this.next(false)
  }

  private maybeScrobble(): void {
    if (this.scrobbleSubmitted) return
    const dur = this.audio.duration
    if (!Number.isFinite(dur) || dur <= 0) return
    const t = this.audio.currentTime
    // Last.fm rule: half the track or 4 minutes, whichever comes first (tracks > 30s only).
    if (dur > 30 && (t >= dur / 2 || t >= 240)) this.submitScrobble()
  }

  private submitScrobble(): void {
    if (this.scrobbleSubmitted) return
    const track = this.current
    if (!track || !this.client) return
    this.scrobbleSubmitted = true
    if (this.reportPlay) this.reportPlay(track, Date.now())
    else void this.client.scrobble(track.id, true).catch(() => undefined)
  }

  /** Rest on the last song, paused back at its start, once the queue has run out. */
  private rewind(): void {
    this.audio.pause()
    this.audio.currentTime = 0
    this.emitPosition()
  }

  /** Swap the whole queue out. An answer still out for the old queue is dropped when it lands. */
  private replaceQueue(tracks: Track[], index: number): void {
    this.ask = null
    this.unshuffled = null
    this.queue = [...tracks]
    if (this.shuffle && this.queue.length > 1) {
      this.unshuffled = [...this.queue]
      this.queue = shuffleKeepingFirst(this.queue, index)
      this.index = 0
    } else {
      this.index = clamp(index, 0, Math.max(0, this.queue.length - 1))
    }
  }

  /** Where the run of autoplayed songs that ends `list` begins; its length when there is none. */
  private autoplayFrom(list: Track[]): number {
    let i = list.length
    while (i > 0 && this.autoplayed.has(list[i - 1])) i--
    return i
  }

  /** With autoplay on, ask for more once the last song in the queue is playing, once per song. */
  private maybeAutoplay(): void {
    const last = this.queue[this.queue.length - 1]
    if (!this.autoplay || this.repeat !== 'off' || this.audio.paused || !last || this.current !== last) return
    if (this.ask && (!this.ask.answered || this.ask.after === last)) return
    // The songs heard last, the playing one first.
    const seeds = this.queue.slice(Math.max(0, this.index + 1 - AUTOPLAY_SEEDS), this.index + 1).reverse()
    this.askFor(seeds, AUTOPLAY_COUNT, true)
  }

  /**
   * Fetch `count` songs like `seeds`, the one asking first, and append them once they arrive:
   * as autoplay's, or as part of the queue proper for a song radio. Offline, only songs on this
   * device. A failure is logged and leaves the queue as it was.
   */
  private askFor(seeds: Track[], count: number, autoplayed: boolean): void {
    const client = this.client
    if (!client || !seeds.length) return
    const ask = { after: seeds[0], answered: false }
    this.ask = ask
    void radio(client, {
      seeds,
      count,
      exclude: new Set(this.queue.map((t) => t.id)),
      shuffleSeed: `${seeds[0].id}:${Date.now()}`,
      playable: this.online ? undefined : this.available
    })
      .catch((err: unknown) => {
        console.warn('[engine] could not find songs to carry on with', err)
        return []
      })
      .then((tracks) => {
        if (this.ask !== ask) return
        ask.answered = true
        this.land(tracks, autoplayed)
      })
  }

  /** Append what an ask brought back, and carry on into it when the queue ran out while it was out. */
  private land(tracks: Track[], autoplayed: boolean): void {
    const queued = new Set(this.queue.map((t) => t.id))
    const fresh = tracks.filter((t) => !queued.has(t.id))
    const ranOut = this.audio.ended
    if (!fresh.length) {
      if (ranOut) this.rewind()
      return
    }
    const at = this.queue.length
    this.queue.push(...fresh)
    // Shuffle or not, they go after everything already lined up.
    this.unshuffled?.push(...fresh)
    if (autoplayed) for (const t of fresh) this.autoplayed.add(t)
    this.emitQueue()
    if (ranOut) this.load(at, true)
  }

  private emitQueue(): void {
    this.emit('queueChanged', { queue: this.queue, index: this.index, autoplayFrom: this.autoplayFrom(this.queue) })
  }

  private emitPosition(): void {
    const duration = Number.isFinite(this.audio.duration) && this.audio.duration > 0
      ? this.audio.duration
      : this.current?.duration ?? 0
    this.emit('positionUpdate', { position: this.audio.currentTime, duration })
  }

  private emitFrame(): void {
    if (!this.analyser) return
    this.analyser.getByteFrequencyData(this.analyserData)
    // Keep the musically interesting lower ~75% of the spectrum and bucket it into FRAME_BINS.
    const usable = Math.floor(this.analyserData.length * 0.75)
    const per = usable / FRAME_BINS
    let sum = 0
    for (let i = 0; i < FRAME_BINS; i++) {
      const start = Math.floor(i * per)
      const end = Math.max(start + 1, Math.floor((i + 1) * per))
      let acc = 0
      for (let j = start; j < end; j++) acc += this.analyserData[j]
      const v = acc / (end - start)
      this.bins[i] = v
      sum += v
    }
    this.emit('audioFrame', { bins: this.bins, level: sum / (FRAME_BINS * 255) })
  }

  private startTimers(): void {
    this.stopPositionTimer()
    this.positionTimer = window.setInterval(() => this.emitPosition(), POSITION_INTERVAL_MS)
    if (this.framesWanted) this.startFrameTimer()
  }

  private startFrameTimer(): void {
    if (this.frameTimer !== undefined) return
    this.frameTimer = window.setInterval(() => this.emitFrame(), FRAME_INTERVAL_MS)
  }

  private stopPositionTimer(): void {
    if (this.positionTimer !== undefined) window.clearInterval(this.positionTimer)
    this.positionTimer = undefined
    // Let the visualiser decay for a moment after pausing, then stop streaming frames.
    window.setTimeout(() => {
      if (this.audio.paused) this.stopFrameTimer()
    }, 600)
  }

  private stopFrameTimer(): void {
    if (this.frameTimer !== undefined) window.clearInterval(this.frameTimer)
    this.frameTimer = undefined
  }

  private stopTimers(): void {
    this.stopPositionTimer()
    this.stopFrameTimer()
  }
}

function shuffleKeepingFirst(tracks: Track[], firstIndex: number): Track[] {
  const rest = shuffled(tracks.filter((_, i) => i !== firstIndex))
  const first = tracks[firstIndex]
  return first ? [first, ...rest] : rest
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
