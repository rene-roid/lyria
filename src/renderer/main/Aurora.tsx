import { useEffect, useRef, useState } from 'react'
import { auroraColors, coverAurora, hexToRgb, skyColor, type AuroraColors, type AuroraOptions } from '@shared/aurora'
import { LevelMeter, follow, type Levels } from '@shared/levels'
import { useCoverUrl } from '@renderer/shared/Cover'
import { usePlayerState } from '@renderer/shared/playerStore'

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/**
 * navidroid's curtains, line for line from its AGSL. Three curtains, each a wavy lower edge with
 * light rising from it in thin vertical rays that drift sideways and sway with the folds. `level`
 * (loudness) makes them taller, `kick` (a bass hit) lights up the rim along the edge.
 */
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 scale;
uniform float rows;
uniform float t;
uniform float level;
uniform float kick;
uniform float gain;
uniform vec3 c0;
uniform vec3 c1;
uniform vec3 c2;
uniform vec3 c3;
out vec4 color;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

float rays(float x, float s) {
  return 0.55 + 0.2 * sin(x * 61.0 + s * 0.9) + 0.14 * sin(x * 97.0 - s * 1.3)
    + 0.1 * sin(x * 151.0 + s * 2.1) + 0.07 * sin(x * 233.0 - s * 2.9);
}

vec3 curtain(vec2 uv, float base, float h, float speed, float drift, float seed, vec3 a, vec3 b) {
  float s = t * speed;
  // Waves at unrelated frequencies, so the edge folds instead of sliding sideways.
  float edge = base + 0.045 * sin(uv.x * 2.3 + s + seed) + 0.025 * sin(uv.x * 5.1 - s * 1.4 + seed * 1.7)
    + 0.012 * sin(uv.x * 11.7 + s * 2.3 + seed * 0.6);
  float d = edge - uv.y;
  float x = uv.x + seed * 3.0 + s * drift + 0.5 * (edge - base);
  float ray = rays(x, s);
  // Two sines at different speeds make patches of rays that grow and brighten, then fade away.
  float pulse = 0.5 + 0.5 * sin(x * 13.0 + s * 5.0) * sin(x * 31.0 - s * 7.0 + 1.3);
  float rise = d > 0.0 ? exp(-d / (h * ray * (0.55 + 0.9 * pulse))) : exp(d / 0.012);
  // Faint ripples running up the rays.
  rise *= 0.88 + 0.12 * sin(d * 90.0 - s * 25.0 + x * 40.0);
  float rim = exp(-abs(d) / 0.009) * (0.45 + 0.8 * kick);
  return mix(a, b, clamp(d / (h * 1.6), 0.0, 1.0)) * (rise * ray * (0.65 + 0.85 * pulse) * 0.55 + rim * 0.5);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, rows - gl_FragCoord.y);
  vec2 uv = p * scale;
  float lift = 0.75 + 0.6 * level + 0.1 * kick;
  vec3 acc = curtain(uv, 0.30, 0.10 * lift, 0.23, 0.12, 0.0, c0, c1)
    + curtain(uv, 0.22, 0.08 * lift, 0.31, -0.09, 2.1, c1, c2)
    + curtain(uv, 0.37, 0.12 * lift, 0.17, 0.07, 4.7, c2, c3);
  acc *= (0.85 + 0.15 * sin(t * 0.3)) * (0.8 + 0.25 * level + 0.15 * kick) * gain;
  // Dither against banding in the dark gradients.
  acc = clamp(acc + (hash(p + fract(t)) - 0.5) / 255.0, 0.0, 1.0);
  // Premultiplied with alpha = brightness, so dark parts let the sky through.
  color = vec4(acc, max(acc.r, max(acc.g, acc.b)));
}`

/** The panel colour the sky fades into, as navidroid's fades into its Bg. */
const PANEL = '#121212'
const FPS = 30
/** Audio frames come at ~30fps; one this old means the music stopped. */
const STALE_MS = 100

/** A tiny seeded generator, so the stars and each shooting star land in the same place every time. */
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

interface Star {
  x: number
  y: number
  depth: number
  twinkle: number
  phase: number
}

const stars: Star[] = (() => {
  const r = random(42)
  return Array.from({ length: 400 }, () => ({
    x: r(),
    y: r(),
    depth: Math.floor(r() * 3),
    twinkle: 0.5 + r() * 2,
    phase: r() * Math.PI * 2
  }))
})()

/** navidroid scatters 150 stars over a phone; the same density over the panel. */
const starCount = (w: number, h: number): number => Math.min(stars.length, Math.round((150 * w * h) / (412 * 915)))

/** Three layers of stars; nearer ones are bigger, brighter and drift faster, which reads as depth. */
function drawStars(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, kick: number): void {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  const n = starCount(w, h)
  for (let i = 0; i < n; i++) {
    const s = stars[i]
    const x = (s.x + t * 0.0015 * (s.depth + 1)) % 1
    const a = (0.25 + 0.25 * s.depth) * (0.65 + 0.35 * Math.sin(t * s.twinkle + s.phase)) * (1 + 0.25 * kick)
    ctx.globalAlpha = Math.min(1, Math.max(0, a))
    ctx.beginPath()
    ctx.arc(x * w, s.y * h, 0.5 + 0.45 * s.depth, 0, Math.PI * 2)
    ctx.fill()
  }
  shootingStar(ctx, w, h, t)
  ctx.globalAlpha = 1
}

/** One shooting star every 11s, seeded by its period so each starts somewhere else without any stored state. */
function shootingStar(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const n = Math.floor(t / 11)
  const p = (t - n * 11) / 0.9
  if (p >= 1) return
  const r = random(n)
  const sx = w * (0.35 + 0.6 * r())
  const sy = h * (0.04 + 0.25 * r())
  const tx = -w * 0.45
  const ty = h * 0.18
  const hx = sx + tx * p
  const hy = sy + ty * p
  const fade = Math.sin(p * Math.PI)
  const line = ctx.createLinearGradient(hx - tx * 0.3, hy - ty * 0.3, hx, hy)
  line.addColorStop(0, 'rgba(255,255,255,0)')
  line.addColorStop(1, `rgba(255,255,255,${fade})`)
  ctx.globalAlpha = 1
  ctx.strokeStyle = line
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(hx - tx * 0.3, hy - ty * 0.3)
  ctx.lineTo(hx, hy)
  ctx.stroke()
  ctx.globalAlpha = 0.35 * fade
  ctx.fillStyle = '#7fffe6'
  ctx.beginPath()
  ctx.arc(hx, hy, 3, 0, Math.PI * 2)
  ctx.fill()
}

const coverColors = new Map<string, AuroraColors | null>()

/** The aurora colours off a cover's pixels; null while loading, for no cover, or for a grey one. */
export function useCoverAurora(id: string | undefined): AuroraColors | null {
  const url = useCoverUrl(id, 64)
  const [colors, setColors] = useState(() => (id && coverColors.get(id)) || null)
  useEffect(() => {
    if (!id || !url || coverColors.has(id)) return setColors((id && coverColors.get(id)) || null)
    let live = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(img, 0, 0, 32, 32)
      coverColors.set(id, coverAurora(ctx.getImageData(0, 0, 32, 32).data))
      if (live) setColors(coverColors.get(id)!)
    }
    img.src = url
    return () => {
      live = false
    }
  }, [id, url])
  return colors
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

function useReducedMotion(): boolean {
  const [still, setStill] = useState(reducedMotion.matches)
  useEffect(() => {
    const on = (): void => setStill(reducedMotion.matches)
    reducedMotion.addEventListener('change', on)
    return () => reducedMotion.removeEventListener('change', on)
  }, [])
  return still
}

/** Whether the main window is on screen; it only hears so from main, see `window.onShown`. */
function useWindowShown(): boolean {
  const [shown, setShown] = useState(true)
  useEffect(() => window.lyria.window.onShown(setShown), [])
  return shown
}

const toLinear = (hex: string): number[] => hexToRgb(hex).map((v) => v / 255)

/** What the draw loop reads; a ref, so a re-render never restarts it. */
interface Scene {
  playing: boolean
  reactive: boolean
  gain: number
  visible: boolean
  still: boolean
  /** Four curtain colours then the sky, 0..1: where they are headed, and where they are now. */
  target: number[]
  current: number[]
  heard: Levels & { at: number }
}

function compile(gl: WebGL2RenderingContext): WebGLProgram | null {
  const program = gl.createProgram()
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT]
  ] as const) {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('[aurora]', gl.getShaderInfoLog(shader))
      return null
    }
    gl.attachShader(program, shader)
  }
  gl.linkProgram(program)
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null
}

/**
 * navidroid's night sky behind a panel: drifting stars, a shooting star now and then, and an aurora
 * that swells with the music, coloured per `options` and easing to a new cover's colours when the
 * song changes. It only draws while something moves: paused and settled, or out of sight (`hidden`,
 * or the window minimised), it holds its last frame and stops; with reduced motion it is a still
 * picture. Without WebGL2 it leaves the panel plain.
 */
export function Aurora({ options, hidden = false, className = '' }: { options: AuroraOptions; hidden?: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const skyCanvas = useRef<HTMLCanvasElement>(null)
  const curtainCanvas = useRef<HTMLCanvasElement>(null)
  const playing = usePlayerState((s) => s.playing)
  const cover = useCoverAurora(usePlayerState((s) => s.track?.coverArt))
  const still = useReducedMotion()
  const visible = useWindowShown() && !hidden
  const [supported, setSupported] = useState(true)
  // Bumped when the GPU hands a lost context back, to set the drawing up again from scratch.
  const [generation, setGeneration] = useState(0)
  const wake = useRef<() => void>(() => {})

  const colors = auroraColors(options, cover)
  const target = [...colors.flatMap(toLinear), ...toLinear(skyColor(colors))]
  const scene = useRef<Scene>({
    playing,
    reactive: options.reactive,
    gain: options.intensity,
    visible,
    still,
    target,
    current: target,
    heard: { level: 0, kick: 0, at: 0 }
  })
  Object.assign(scene.current, { playing, reactive: options.reactive, gain: options.intensity, visible, still, target })

  useEffect(() => {
    wake.current()
  }, [playing, target.join(), options.reactive, options.intensity, visible, still])

  const listening = options.reactive && visible && !still && supported
  useEffect(() => {
    if (!listening) return
    const meter = new LevelMeter()
    window.lyria.player.wantFrames(true)
    const off = window.lyria.player.on('audioFrame', ({ bins }) => {
      scene.current.heard = { ...meter.read(bins), at: performance.now() }
      wake.current()
    })
    return () => {
      off()
      window.lyria.player.wantFrames(false)
    }
  }, [listening])

  useEffect(() => {
    const el = box.current
    const skyEl = skyCanvas.current
    const curtainEl = curtainCanvas.current
    const ctx = skyEl?.getContext('2d')
    const gl = curtainEl?.getContext('webgl2', {
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power'
    })
    const program = gl && compile(gl)
    if (!el || !skyEl || !curtainEl || !ctx || !gl || !program) {
      setSupported(false)
      return
    }
    gl.useProgram(program)
    const names = ['scale', 'rows', 't', 'level', 'kick', 'gain', 'c0', 'c1', 'c2', 'c3']
    const u = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(program, n)]))

    let w = 0
    let h = 0
    let raf = 0
    let timer = 0
    let last = 0
    let phase = 0
    let clock = 0
    let speed = scene.current.playing ? 1 : 0
    let levels: Levels = { level: 0, kick: 0 }
    let sky = ''
    let starsAt = -Infinity
    let lost = false

    const draw = (): void => {
      if (!w || !h || lost) return
      const { current, gain } = scene.current
      const top = `rgb(${current.slice(12, 15).map((v) => Math.round(v * 255)).join(' ')})`
      // The sky only changes while the colours ease, so it is left to CSS rather than painted every frame.
      if (top !== sky) el.style.background = `linear-gradient(${(sky = top)}, ${PANEL} 45%)`
      // Stars hardly move from one frame to the next, so they repaint at a third of the rate unless one is shooting.
      if (Math.abs(clock - starsAt) >= 0.1 || clock % 11 < 0.9) {
        starsAt = clock
        drawStars(ctx, w, h, clock, levels.kick)
      }
      gl.viewport(0, 0, curtainEl.width, curtainEl.height)
      gl.uniform2f(u.scale, (2 * w) / h / curtainEl.width, 0.5 / curtainEl.height)
      gl.uniform1f(u.rows, curtainEl.height)
      gl.uniform1f(u.t, phase)
      gl.uniform1f(u.level, levels.level)
      gl.uniform1f(u.kick, levels.kick)
      gl.uniform1f(u.gain, gain)
      for (let i = 0; i < 4; i++) gl.uniform3f(u[`c${i}`], current[i * 3], current[i * 3 + 1], current[i * 3 + 2])
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    /** Advance everything `dt` seconds; true while anything is still on its way somewhere. */
    const step = (dt: number, now: number): boolean => {
      const sc = scene.current
      levels = follow(levels, sc.reactive && now - sc.heard.at < STALE_MS ? sc.heard : { level: 0, kick: 0 }, dt)
      // Pausing lets the curtains drift to a stop rather than freeze mid-fold.
      speed += ((sc.playing ? 1 : 0) - speed) * (1 - Math.exp(-dt / 0.5))
      // Louder music also moves the curtains faster.
      phase += dt * speed * (1 + 1.2 * levels.level)
      clock += dt * speed
      let easing = false
      const k = 1 - Math.exp(-dt / 0.35)
      sc.current = sc.current.map((v, i) => {
        const d = sc.target[i] - v
        if (Math.abs(d) < 0.002) return sc.target[i]
        easing = true
        return v + d * k
      })
      const settled = !sc.playing && speed < 0.01 && levels.level < 0.002 && levels.kick < 0.002
      if (settled) speed = 0
      return easing || !settled
    }

    const stop = (): void => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      raf = timer = 0
    }

    const frame = (now: number): void => {
      raf = 0
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const moving = step(dt, now)
      draw()
      // Wait out most of the frame on a timer, so the vsyncs in between never wake the page at all.
      if (moving) timer = window.setTimeout(() => {
        timer = 0
        raf = requestAnimationFrame(frame)
      }, 1000 / FPS - 8)
    }

    wake.current = () => {
      const { visible, still } = scene.current
      if (!visible || still) stop()
      if (!visible) return
      if (still) {
        // A still picture: the colours land where they are going in one go.
        scene.current.current = scene.current.target
        return draw()
      }
      if (raf || timer) return
      // Coming back after a rest, the first step should not count the time spent stopped.
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }

    const ro = new ResizeObserver(() => {
      w = el.clientWidth
      h = el.clientHeight
      // Both at the screen's own pixels: stretching a smaller drawing up smears the rims and rays.
      const dpr = window.devicePixelRatio || 1
      skyEl.width = Math.round(w * dpr)
      skyEl.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      curtainEl.width = Math.max(1, Math.round(w * dpr))
      curtainEl.height = Math.max(1, Math.round((h / 2) * dpr))
      // Resizing a canvas clears it, so it needs drawing again even when nothing moves.
      starsAt = -Infinity
      draw()
      wake.current()
    })
    ro.observe(el)

    const onLost = (e: Event): void => {
      e.preventDefault()
      lost = true
    }
    const onRestored = (): void => setGeneration((g) => g + 1)
    curtainEl.addEventListener('webglcontextlost', onLost)
    curtainEl.addEventListener('webglcontextrestored', onRestored)
    return () => {
      stop()
      ro.disconnect()
      curtainEl.removeEventListener('webglcontextlost', onLost)
      curtainEl.removeEventListener('webglcontextrestored', onRestored)
      wake.current = () => {}
    }
  }, [generation])

  if (!supported) return null
  return (
    <div ref={box} data-aurora className={`pointer-events-none overflow-hidden ${className}`}>
      <canvas ref={skyCanvas} className="absolute inset-0 h-full w-full" />
      <canvas ref={curtainCanvas} className="absolute inset-x-0 top-0 h-1/2 w-full" />
    </div>
  )
}
