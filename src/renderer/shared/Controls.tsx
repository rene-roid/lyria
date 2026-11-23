import { Heart, Pause, Play, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Track } from '@shared/types'
import { formatTime } from '@shared/format'
import { player, usePlayerState } from './playerStore'
import { useClient } from './sessionStore'

/**
 * Like or unlike a track on the server, optimistically, reverting if the call fails. Once the
 * server has it the audio host is told, so every window showing the song follows along.
 */
export function useStar(track: Track | null): Star {
  const client = useClient()
  const [starred, setStarred] = useState(false)

  useEffect(() => setStarred(Boolean(track?.starred)), [track?.id, track?.starred])

  return {
    starred,
    disabled: !track || !client,
    toggle: async () => {
      if (!track || !client) return
      const next = !starred
      setStarred(next)
      try {
        await (next ? client.star(track.id) : client.unstar(track.id))
        player.setStarred(track.id, next)
      } catch {
        setStarred(!next)
      }
    }
  }
}

interface Star {
  starred: boolean
  toggle: () => Promise<void>
  disabled: boolean
}

export function LikeButton({ star, size = 16, className = 'h-8 w-8' }: { star: Star; size?: number; className?: string }) {
  const { starred, toggle, disabled } = star
  return (
    <button
      className={`icon-btn shrink-0 rounded-full ${className} ${starred ? 'text-accent hover:text-accent' : ''}`}
      disabled={disabled}
      title={starred ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
      onClick={() => void toggle()}
    >
      <Heart size={size} fill={starred ? 'currentColor' : 'none'} />
    </button>
  )
}

/**
 * Previous, play/pause and next, with the floating windows' optional shuffle and like buttons
 * either side. Each extra is one more button of the same size, which `widgetSize` counts on.
 */
export function TransportControls({
  size = 18,
  compact = false,
  shuffle = false,
  like = false
}: {
  size?: number
  compact?: boolean
  shuffle?: boolean
  like?: boolean
}) {
  const playing = usePlayerState((s) => s.playing)
  const track = usePlayerState((s) => s.track)
  const shuffled = usePlayerState((s) => s.shuffle)
  const hasTrack = Boolean(track)
  const btn = compact ? 'h-7 w-7' : 'h-8 w-8'
  return (
    <div className="no-drag flex items-center gap-1">
      {shuffle && (
        <button
          className={`icon-btn rounded-full ${btn} ${shuffled ? 'text-accent hover:text-accent' : ''}`}
          onClick={() => player.setShuffle(!shuffled)}
          aria-pressed={shuffled}
          title={shuffled ? 'Shuffle on' : 'Shuffle off'}
        >
          <Shuffle size={size - 3} />
        </button>
      )}
      <button className={`icon-btn rounded-full ${btn}`} onClick={player.prev} disabled={!hasTrack} title="Previous">
        <SkipBack size={size - 2} fill="currentColor" />
      </button>
      <button
        className={`icon-btn ${compact ? 'h-7 w-7' : 'mx-2 h-8 w-8'} rounded-full bg-white text-black hover:scale-105 hover:bg-white hover:text-black`}
        onClick={player.toggle}
        disabled={!hasTrack}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause size={size} fill="currentColor" /> : <Play size={size} fill="currentColor" className="ml-0.5" />}
      </button>
      <button className={`icon-btn rounded-full ${btn}`} onClick={player.next} disabled={!hasTrack} title="Next">
        <SkipForward size={size - 2} fill="currentColor" />
      </button>
      {like && <TrackLike track={track} size={size - 3} className={btn} />}
    </div>
  )
}

function TrackLike({ track, size, className }: { track: Track | null; size: number; className: string }) {
  return <LikeButton star={useStar(track)} size={size} className={className} />
}

/**
 * How far into the track playback is, as a thin bar that jumps there when clicked. The hit area
 * is taller than the bar so it can stay thin without being fiddly to click.
 */
export function SeekBar({ className = '' }: { className?: string }) {
  const position = usePlayerState((s) => s.position)
  const duration = usePlayerState((s) => s.duration)
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0
  return (
    <div
      className={`no-drag group flex h-3 cursor-pointer items-center ${className}`}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        player.seek(((e.clientX - r.left) / r.width) * duration)
      }}
    >
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/15 transition-[height] duration-150 group-hover:h-1.5">
        <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** The same progress as a hairline along the bottom edge of a card, for layouts with no room for a bar. */
export function ProgressLine() {
  const position = usePlayerState((s) => s.position)
  const duration = usePlayerState((s) => s.duration)
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-white/10">
      <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** `1:23 / 4:56` */
export function Elapsed({ className = '' }: { className?: string }) {
  const position = usePlayerState((s) => s.position)
  const duration = usePlayerState((s) => s.duration)
  return (
    <span className={`shrink-0 tabular-nums text-ink-3 ${className}`}>
      {formatTime(position)} / {formatTime(duration)}
    </span>
  )
}
