/**
 * How loud the music is and when the bass hits, for the aurora: navidroid's Levels, worked off the
 * audio host's ~30fps frequency frames instead of raw samples. Both come out 0..1.
 */
export interface Levels {
  level: number
  kick: number
}

/** The frame bins are AnalyserNode bytes on its default scale: 255 is -30 dB, and 0 is -100 dB or less, taken as silence. */
const amplitude = (byte: number): number => (byte > 0 ? 10 ** ((-100 + (70 * byte) / 255) / 20) : 0)

/** -80 dB: quieter than this is near silence, however quiet the master. */
const FLOOR = 1e-4
/** navidroid lets the peak sag 0.3% every 20ms; this is the same rate per 1/30s frame. */
const PEAK_DECAY = 0.995
/** navidroid's bass average follows over ~200ms; the same at 30 frames a second. */
const BASS_RATE = 0.16

export class LevelMeter {
  private peak = FLOOR
  private bassAvg = 0

  /** `bins` low to high; the first one, up to ~340 Hz, carries the kick and the bass line. */
  read(bins: ArrayLike<number>): Levels {
    let sum = 0
    for (let i = 0; i < bins.length; i++) sum += amplitude(bins[i]) ** 2
    const rms = Math.sqrt(sum / bins.length)
    const bass = amplitude(bins[0]) ** 2
    // Loudness against the recent peak, so quiet masters move the sky as much as loud ones.
    this.peak = Math.max(rms, this.peak * PEAK_DECAY, FLOOR)
    const level = Math.min(1, rms / this.peak)
    // A hit is bass energy well above its recent average.
    const kick =
      this.bassAvg > 0 && Math.sqrt(bass) > this.peak * 0.15
        ? Math.min(1, Math.max(0, (bass / this.bassAvg - 1.4) / 1.6))
        : 0
    // The first reading seeds the average, or the second would count as a hit against an average still near zero.
    this.bassAvg = this.bassAvg ? this.bassAvg * (1 - BASS_RATE) + bass * BASS_RATE : bass
    return { level, kick }
  }
}

/**
 * One drawn frame `dt` seconds on, easing toward the latest reading: loudness is quick to rise and
 * slow to settle, and a hit flashes and fades over ~150ms.
 */
export function follow(shown: Levels, heard: Levels, dt: number): Levels {
  const tau = heard.level > shown.level ? 0.06 : 0.4
  return {
    level: shown.level + (heard.level - shown.level) * (1 - Math.exp(-dt / tau)),
    kick: Math.max(heard.kick, shown.kick * Math.exp(-dt / 0.15))
  }
}
