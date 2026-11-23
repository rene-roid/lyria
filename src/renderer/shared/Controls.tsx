import { Heart, Pause, Play, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Track } from '@shared/types'
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
