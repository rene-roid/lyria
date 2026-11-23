import { useEffect, useMemo, useRef } from 'react'
import type { PlayerLook, VisualizerColor, VisualizerStyle } from '@shared/types'
import { CoverTint, useCoverColors } from './Cover'
import { usePlayerState } from './playerStore'
import { useSettings } from './sessionStore'

/** The colour a visualiser draws in. The accent follows the theme; a cover not read yet borrows it. */
function useVisualizerColor(choice: VisualizerColor, coverId: string | undefined): string {
  const theme = useSettings().theme
  const glow = useCoverColors(choice === 'cover' ? coverId : undefined)?.glow
  const accent = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#ffffff',
    [theme]
  )
  return choice === 'white' ? '#ffffff' : choice === 'cover' ? glow ?? accent : accent
}

/**
 * What sits behind a floating player's content, as its look asks: the cover's tint, then the
 * visualiser over it. Both are absolutely placed, so the content has to be positioned to stay on top.
 */
export function CardBackdrop({ look, coverId, bars }: { look: PlayerLook; coverId: string | undefined; bars: number }) {
  const color = useVisualizerColor(look.visualizerColor, coverId)
  return (
    <>
      {look.tint && <CoverTint id={coverId} />}
      {look.visualizer !== 'off' && (
        <Visualizer
          bars={bars}
          variant={look.visualizer}
          color={color}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
        />
      )}
    </>
  )
}

/**
 * Canvas visualiser fed by the audio host's `audioFrame` events (~30fps): bars standing on the
 * bottom edge, bars mirrored about the middle, or one smooth wave through the same levels.
 * Levels are smoothed toward the latest frame on every animation frame so motion stays fluid
 * even though IPC frames arrive at a lower rate than the display refresh.
 */
export function Visualizer({
  bars = 32,
  className = '',
  color,
  variant
}: {
  bars?: number
  className?: string
  color: string
  variant: Exclude<VisualizerStyle, 'off'>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const target = useRef<Float32Array>(new Float32Array(bars))
  const current = useRef<Float32Array>(new Float32Array(bars))
  const playing = usePlayerState((s) => s.playing)
  const playingRef = useRef(playing)
  playingRef.current = playing
  /** Starts the draw loop if it has idled. Installed by the effect that owns the loop. */
  const wake = useRef<() => void>(() => {})

  useEffect(() => {
    target.current = new Float32Array(bars)
    current.current = new Float32Array(bars)
    wake.current()
  }, [bars])

  // Pausing stops the frames, so the decay to the floor needs waking on its own.
  useEffect(() => {
    wake.current()
  }, [playing])

  useEffect(() => {
    window.lyria.player.wantFrames(true)
    const off = window.lyria.player.on('audioFrame', ({ bins }) => {
      const t = target.current
      const n = t.length
      const per = bins.length / n
      for (let i = 0; i < n; i++) {
        const start = Math.floor(i * per)
        const end = Math.max(start + 1, Math.floor((i + 1) * per))
        let acc = 0
        for (let j = start; j < end; j++) acc += bins[j]
        t[i] = acc / (end - start) / 255
      }
      wake.current()
    })
    return () => {
      off()
      window.lyria.player.wantFrames(false)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
      wake.current()
    })
    ro.observe(canvas)

    /**
     * The loop runs only while there is motion left to draw. Paused audio decays the bars to
     * their floor and then stops; the next frame off the host starts it again. Without this the
     * widget would hold a display-rate redraw open for as long as it is on screen, which for a
     * window that sits above the taskbar all day is most of the day.
     */
    const draw = (): void => {
      const w = canvas.width
      const h = canvas.height
      if (!w || !h) {
        raf = 0
        return
      }
      const t = target.current
      const c = current.current
      const n = c.length
      const decaying = !playingRef.current
      let moving = false
      for (let i = 0; i < n; i++) {
        const goal = decaying ? 0 : t[i]
        const rate = goal > c[i] ? 0.45 : 0.12
        c[i] += (goal - c[i]) * rate
        if (Math.abs(goal - c[i]) > 0.002) moving = true
      }
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = color
      ctx.strokeStyle = color
      if (variant === 'wave') drawWave(ctx, c, w, h)
      else drawBars(ctx, c, w, h, variant === 'mirror')
      ctx.globalAlpha = 1
      raf = moving ? requestAnimationFrame(draw) : 0
    }

    wake.current = () => {
      if (!raf) raf = requestAnimationFrame(draw)
    }
    wake.current()
    return () => {
      cancelAnimationFrame(raf)
      raf = 0
      wake.current = () => {}
      ro.disconnect()
    }
  }, [color, variant])

  return <canvas ref={canvasRef} className={className} />
}

/**
 * Bars on the bottom edge keep a stub when quiet, which reads as a baseline. Mirrored bars sit
 * across the middle of the card, where stubs would be a dotted line through the title, so a quiet
 * band there draws nothing.
 */
function drawBars(ctx: CanvasRenderingContext2D, c: Float32Array, w: number, h: number, mirror: boolean): void {
  const n = c.length
  const gap = Math.max(1, w / n / 4)
  const bw = (w - gap * (n - 1)) / n
  for (let i = 0; i < n; i++) {
    const v = mirror ? c[i] : Math.max(0.04, c[i])
    const bh = mirror ? v * h : Math.max(2, v * h)
    if (bh < 1) continue
    const x = i * (bw + gap)
    const y = mirror ? (h - bh) / 2 : h - bh
    ctx.globalAlpha = 0.35 + v * 0.65
    roundRect(ctx, x, y, bw, bh, Math.min(bw / 2, 3))
  }
}

/**
 * The levels as a ribbon about the middle, swelling where the music is loud and pinching to
 * nothing where it is quiet, brightest along its spine. Each stretch between two levels is a
 * curve through their midpoint, so the outline stays smooth however few levels there are.
 */
function drawWave(ctx: CanvasRenderingContext2D, c: Float32Array, w: number, h: number): void {
  const n = c.length
  const mid = h / 2
  const step = w / (n - 1)
  const amp = (i: number): number => c[i] * mid * 0.92
  const top = (i: number): number => mid - amp(i)
  const bottom = (i: number): number => mid + amp(n - 1 - i)
  const along = (i: number): number => i * step
  const back = (i: number): number => (n - 1 - i) * step
  ctx.beginPath()
  smooth(ctx, n, along, top, true)
  smooth(ctx, n, back, bottom, false)
  ctx.closePath()
  const spine = ctx.createLinearGradient(0, 0, 0, h)
  spine.addColorStop(0, 'rgba(255, 255, 255, 0.25)')
  spine.addColorStop(0.5, 'rgba(255, 255, 255, 1)')
  spine.addColorStop(1, 'rgba(255, 255, 255, 0.25)')
  ctx.fill()
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = spine
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
}

/** A curve through the midpoints of the points `(x(i), y(i))`, starting a new outline or carrying one on. */
function smooth(
  ctx: CanvasRenderingContext2D,
  n: number,
  x: (i: number) => number,
  y: (i: number) => number,
  start: boolean
): void {
  if (start) ctx.moveTo(x(0), y(0))
  else ctx.lineTo(x(0), y(0))
  for (let i = 0; i < n - 1; i++) ctx.quadraticCurveTo(x(i), y(i), (x(i) + x(i + 1)) / 2, (y(i) + y(i + 1)) / 2)
  ctx.lineTo(x(n - 1), y(n - 1))
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}
