import { ArrowDown, CircleArrowDown } from 'lucide-react'
import type { DownloadStatus } from '@shared/types'
import { useOffline } from '../offline'
import { ActionIcon } from './ui'

const R = 12
const CIRCUMFERENCE = 2 * Math.PI * R

/**
 * Keep a playlist or mix for offline listening, as on Spotify: an outlined arrow, a ring that
 * fills while its songs download, then a solid accent disc. Clicking a download removes it; its
 * songs go back to the song cache, so the next play of them still starts from disk.
 */
export function DownloadButton({
  status,
  disabled,
  onDownload,
  onRemove
}: {
  status: DownloadStatus | undefined
  disabled?: boolean
  onDownload: () => void
  onRemove: () => void
}) {
  const offline = useOffline()
  if (!status) {
    return (
      <ActionIcon
        title={offline ? 'Downloads start once Lyria can reach your server' : 'Download for offline listening'}
        disabled={disabled || offline}
        onClick={onDownload}
      >
        <CircleArrowDown size={28} strokeWidth={1.75} />
      </ActionIcon>
    )
  }
  const total = status.trackIds.length
  const complete = status.done >= total
  const title = complete
    ? 'Downloaded — click to remove the download'
    : `Downloading ${status.done} of ${total}${status.failed ? ` (${status.failed} failed, retried later)` : ''} — click to cancel`
  return (
    <ActionIcon title={title} active onClick={onRemove}>
      <span className="relative flex h-7 w-7 items-center justify-center">
        {complete ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-black">
            <ArrowDown size={18} strokeWidth={2.5} />
          </span>
        ) : (
          <>
            <svg viewBox="0 0 28 28" className="absolute inset-0 -rotate-90">
              <circle cx="14" cy="14" r={R} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth="2" />
              <circle
                cx="14"
                cy="14"
                r={R}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - (total ? status.done / total : 0))}
                className="transition-[stroke-dashoffset] duration-300"
              />
            </svg>
            <ArrowDown size={16} strokeWidth={2.5} />
          </>
        )}
      </span>
    </ActionIcon>
  )
}
