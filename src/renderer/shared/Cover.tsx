import { Music2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { localArtUrl } from '@shared/art'
import { headerColor } from '@shared/color'
import { useClient, useSettings } from './sessionStore'

/**
 * Where a cover is loaded from, best first: Sonora's own copy over `sonora-art://` while the image
 * cache has a budget, then the server. The cached path is why a second visit to a page paints
 * instantly -- main keeps the file, so nothing goes over the network again -- and the server stays
 * behind it so a cover main could not download still shows.
 */
export function useCoverUrls(id: string | undefined, size = 300): string[] {
  const client = useClient()
  const cached = useSettings().artCacheMaxMb > 0
  const urls = [cached ? localArtUrl(id) : undefined, client?.coverArtUrl(id, size)]
  return urls.filter((u): u is string => !!u)
}

export function useCoverUrl(id: string | undefined, size = 300): string | undefined {
  return useCoverUrls(id, size)[0]
}

const colors = new Map<string, string>()

/**
 * The colour a page paints behind a cover: picked from the cover's own pixels, as navidroid and
 * the server's web UI tint their headers. `fallback` shows until it is known, and stays for a
 * cover that never loads.
 */
export function useCoverColor(id: string | undefined, fallback = '#535353'): string {
  const url = useCoverUrl(id, 64)
  const [color, setColor] = useState(() => (id && colors.get(id)) || fallback)
  useEffect(() => {
    const known = id && colors.get(id)
    if (known || !id || !url) return setColor(known || fallback)
    let live = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(img, 0, 0, 24, 24)
      const [r, g, b] = headerColor(ctx.getImageData(0, 0, 24, 24).data)
      colors.set(id, `rgb(${r} ${g} ${b})`)
      if (live) setColor(colors.get(id)!)
    }
    img.src = url
    return () => {
      live = false
    }
  }, [id, url, fallback])
  return color
}

export function Cover({
  id,
  size = 300,
  className = '',
  rounded = 'rounded-md'
}: {
  id?: string
  size?: number
  className?: string
  rounded?: string
}) {
  const urls = useCoverUrls(id, size)
  const [tried, setTried] = useState(0)
  // A widget keeps one Cover for every track it ever shows, so the sources have to be given back
  // when the id changes -- otherwise one cover that failed leaves the slot empty for the session.
  const shown = useRef(id)
  if (shown.current !== id) {
    shown.current = id
    setTried(0)
  }
  const url = urls[tried]
  return (
    <div className={`relative shrink-0 overflow-hidden bg-surface-3 ${rounded} ${className}`}>
      {url ? (
        // A track list or an artist grid is thousands of these, and the server is asked for every
        // one it decodes: lazy keeps that to what has been scrolled to, async keeps the decode off
        // the main thread so a long list still scrolls while its covers arrive.
        <img
          key={url}
          src={url}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setTried((n) => n + 1)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-ink-3">
          <Music2 className="h-1/3 w-1/3" />
        </div>
      )}
    </div>
  )
}
