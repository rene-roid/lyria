import { ListMusic, MicVocal, PictureInPicture2, Repeat, Repeat1, Shuffle, Volume1, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatTime, wheelVolumeStep } from '@shared/format'
import { Cover } from '@renderer/shared/Cover'
import { LikeButton, TransportControls, useStar } from '@renderer/shared/Controls'
import { player, usePlayerState } from '@renderer/shared/playerStore'
import { useSettings } from '@renderer/shared/sessionStore'
import { nav, useNav } from './nav'
import { useContextMenu } from './components/ContextMenu'
import { TrackMenu } from './components/TrackList'
import { Range } from './components/ui'
import { ArtistLinks } from './components/ArtistLinks'

export function NowPlayingBar() {
  const track = usePlayerState((s) => s.track)
  const position = usePlayerState((s) => s.position)
  const duration = usePlayerState((s) => s.duration)
  const volume = usePlayerState((s) => s.volume)
  const muted = usePlayerState((s) => s.muted)
  const repeat = usePlayerState((s) => s.repeat)
  const shuffle = usePlayerState((s) => s.shuffle)
  const index = usePlayerState((s) => s.index)
  const showQueue = useNav((s) => s.showQueue)
  const showLyrics = useNav((s) => s.showLyrics)
  const settings = useSettings()
  const [scrub, setScrub] = useState<number | null>(null)
  const menu = useContextMenu()
  const star = useStar(track)

  // Drop a pending scrub once the real position catches up to it, or once the track changes
  // out from under it (next/prev while dragging) — otherwise the bar freezes on the old value.
  useEffect(() => setScrub(null), [track?.id])
  useEffect(() => {
    if (scrub !== null && Math.abs(position - scrub) < 0.35) setScrub(null)
  }, [position, scrub])

  const shown = scrub ?? position
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  const handleVolumeWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const step = wheelVolumeStep(e.deltaY, e.deltaMode)
    if (!step) return
    const next = Math.min(1, Math.max(0, (muted ? 0 : volume) + step))
    if (muted) player.setMuted(false)
    player.setVolume(next)
  }

  return (
    <footer
      className="grid h-[80px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 bg-surface px-4"
      onWheel={handleVolumeWheel}
    >
      <div className="flex min-w-0 items-center gap-3" onContextMenu={(e) => track && menu.open(e)}>
        {track && (
          <>
            <Cover id={track.coverArt} size={120} className="h-14 w-14" />
            <div className="min-w-0">
              <button
                className="block max-w-full truncate text-sm font-semibold hover:underline"
                title={track.title}
                onClick={() => track.albumId && nav.go({ name: 'album', id: track.albumId })}
              >
                {track.title}
              </button>
              <div className="truncate text-xs text-ink-2" title={track.artist}>
                <ArtistLinks track={track} className="hover:text-ink" />
              </div>
            </div>
            <LikeButton star={star} />
          </>
        )}
      </div>
      {menu.pos && track && (
        <TrackMenu
          pos={menu.pos}
          track={track}
          starred={star.starred}
          onClose={menu.close}
          onPlay={() => player.playAt(index)}
          onToggleStar={() => void star.toggle()}
        />
      )}

      <div className="flex w-[min(600px,42vw)] flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <Toggle on={shuffle} onClick={() => player.setShuffle(!shuffle)} title="Shuffle">
            <Shuffle size={16} />
          </Toggle>
          <TransportControls size={18} />
          <Toggle on={repeat !== 'off'} onClick={() => player.cycleRepeat(repeat)} title={`Repeat: ${repeat}`}>
            {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </Toggle>
        </div>
        <div className="flex w-full items-center gap-2 text-[11px] tabular-nums text-ink-2">
          <span className="w-10 text-right">{formatTime(shown)}</span>
          <Range
            min={0}
            max={Math.max(duration, 0.01)}
            step={0.1}
            value={shown}
            disabled={!track}
            onChange={(e) => setScrub(Number(e.target.value))}
            onPointerUp={(e) => player.seek(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => player.seek(Number((e.target as HTMLInputElement).value))}
          />
          <span className="w-10">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-1">
        <Toggle on={showLyrics} onClick={nav.toggleLyrics} title="Lyrics" disabled={!track}>
          <MicVocal size={16} />
        </Toggle>
        <Toggle on={showQueue} onClick={nav.toggleQueue} title="Queue">
          <ListMusic size={16} />
        </Toggle>
        <Toggle
          on={settings.widgets.mini}
          onClick={() => void window.lyria.settings.update({ widgets: { ...settings.widgets, mini: !settings.widgets.mini } })}
          title="Mini player"
        >
          <PictureInPicture2 size={16} />
        </Toggle>
        <div className="ml-1 flex w-[140px] items-center gap-1">
          <button className="icon-btn h-8 w-8 rounded-full" onClick={() => player.setMuted(!muted)} title={muted ? 'Unmute' : 'Mute'}>
            <VolumeIcon size={16} />
          </button>
          <Range
            min={0}
            max={1}
            step={0.01}
            value={muted ? 0 : volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
          />
        </div>
      </div>
    </footer>
  )
}

/** An on/off control of the bar: green with a dot under it while on, as Spotify marks shuffle. */
function Toggle({
  on,
  onClick,
  title,
  disabled,
  children
}: {
  on: boolean
  onClick: () => void
  title: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      className={`icon-btn relative h-8 w-8 rounded-full ${
        on
          ? 'text-accent after:absolute after:bottom-0.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-accent hover:text-accent-2'
          : ''
      }`}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
