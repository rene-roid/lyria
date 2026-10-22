import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { release } from 'node:os'
import { supportsNativeAcrylic } from '@shared/types'
import type {
  Download,
  DownloadStatus,
  HostJob,
  PlayerCommandName,
  PlayerCommands,
  PlayerEventName,
  PlayerEvents,
  PlayerState,
  Session,
  Settings,
  SettingsPatch,
  Track,
  WindowName
} from '@shared/types'
import type { ServerProbe } from '@shared/subsonic/client'

const windowName = ((): WindowName => {
  const arg = process.argv.find((a) => a.startsWith('--lyria-window='))
  return (arg?.split('=')[1] as WindowName) ?? 'main'
})()

type Unsubscribe = () => void

function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api = {
  windowName,
  /** Windows 11 22H2+; decides whether the widget's acrylic mode gets a real system backdrop. */
  nativeAcrylic: supportsNativeAcrylic(process.platform, release()),

  player: {
    on<K extends PlayerEventName>(event: K, cb: (payload: PlayerEvents[K]) => void): Unsubscribe {
      return subscribe(`player:event:${event}`, cb)
    },
    command<K extends PlayerCommandName>(cmd: K, payload?: PlayerCommands[K]): void {
      ipcRenderer.send('player:command', cmd, payload)
    },
    getState(): Promise<PlayerState> {
      return ipcRenderer.invoke('player:getState')
    },
    wantFrames(wanted: boolean): void {
      ipcRenderer.send('player:wantFrames', wanted)
    }
  },

  /** Used exclusively by the hidden audio host renderer. */
  host: {
    emit<K extends PlayerEventName>(event: K, payload: PlayerEvents[K]): void {
      ipcRenderer.send('player:emit', event, payload)
    },
    onCommand(cb: <K extends PlayerCommandName>(cmd: K, payload: PlayerCommands[K]) => void): Unsubscribe {
      const handler = (_e: IpcRendererEvent, cmd: PlayerCommandName, payload: unknown): void =>
        cb(cmd, payload as never)
      ipcRenderer.on('player:command', handler)
      return () => ipcRenderer.removeListener('player:command', handler)
    },
    onFramesWanted(cb: (wanted: boolean) => void): Unsubscribe {
      return subscribe('host:framesWanted', cb)
    },
    /** Re-encoding for the disk caches; whatever `run` resolves with goes back to main. */
    onJob(run: (job: HostJob, body: Uint8Array) => Promise<Uint8Array | null>): Unsubscribe {
      const handler = (_e: IpcRendererEvent, id: number, job: HostJob, body: Uint8Array): void => {
        void run(job, body)
          .catch(() => null)
          .then((result) => ipcRenderer.send('host:jobDone', id, result))
      }
      ipcRenderer.on('host:job', handler)
      return () => ipcRenderer.removeListener('host:job', handler)
    }
  },

  auth: {
    getSession(): Promise<Session | null> {
      return ipcRenderer.invoke('auth:getSession')
    },
    login(input: { server: string; username: string; password: string }): Promise<Session> {
      return ipcRenderer.invoke('auth:login', input)
    },
    logout(): Promise<void> {
      return ipcRenderer.invoke('auth:logout')
    },
    /** Replace the alternate-URL list for the current library; re-picks the best one. */
    setServers(servers: string[]): Promise<Session | null> {
      return ipcRenderer.invoke('auth:setServers', servers)
    },
    selectServer(server: string): Promise<Session | null> {
      return ipcRenderer.invoke('auth:selectServer', server)
    },
    reselect(): Promise<Session | null> {
      return ipcRenderer.invoke('auth:reselect')
    },
    probe(): Promise<ServerProbe[]> {
      return ipcRenderer.invoke('auth:probe')
    },
    onChange(cb: (session: Session | null) => void): Unsubscribe {
      return subscribe('auth:changed', cb)
    }
  },

  settings: {
    get(): Promise<Settings> {
      return ipcRenderer.invoke('settings:get')
    },
    update(patch: SettingsPatch): Promise<Settings> {
      return ipcRenderer.invoke('settings:update', patch)
    },
    onChange(cb: (settings: Settings) => void): Unsubscribe {
      return subscribe('settings:changed', cb)
    }
  },

  /** On-disk song cache. `want` is the audio host's; the rest drive the settings panel. */
  cache: {
    want(id: string, url: string): Promise<Uint8Array | null> {
      return ipcRenderer.invoke('cache:want', id, url)
    },
    /** The downloaded or cached copy, without going to the server. Null when there is none. */
    local(id: string): Promise<Uint8Array | null> {
      return ipcRenderer.invoke('cache:local', id)
    },
    /** A play that counts, for the server's play counts; main holds it while the server is away. */
    played(id: string, time: number): void {
      ipcRenderer.send('cache:played', id, time)
    },
    stats(): Promise<{ bytes: number; count: number }> {
      return ipcRenderer.invoke('cache:stats')
    },
    clear(): Promise<void> {
      return ipcRenderer.invoke('cache:clear')
    }
  },

  /** Playlists and saved mixes kept on disk for listening offline. */
  downloads: {
    list(): Promise<DownloadStatus[]> {
      return ipcRenderer.invoke('downloads:list')
    },
    add(download: Omit<Download, 'addedAt'>): Promise<void> {
      return ipcRenderer.invoke('downloads:add', download)
    },
    remove(key: string): Promise<void> {
      return ipcRenderer.invoke('downloads:remove', key)
    },
    stats(): Promise<{ bytes: number; count: number }> {
      return ipcRenderer.invoke('downloads:stats')
    },
    onChange(cb: (list: DownloadStatus[]) => void): Unsubscribe {
      return subscribe('downloads:changed', cb)
    }
  },

  /** Library responses kept on disk so views paint before the server answers. See renderer/shared/cache. */
  meta: {
    load(): Promise<{ scope: string; entries: [string, string][] }> {
      return ipcRenderer.invoke('meta:load')
    },
    /** Who the entries belong to; a different account wipes them. */
    setScope(scope: string): void {
      ipcRenderer.send('meta:setScope', scope)
    },
    /** A null value drops the entry. */
    put(key: string, value: string | null): void {
      ipcRenderer.send('meta:put', key, value)
    },
    stats(): Promise<{ bytes: number; count: number }> {
      return ipcRenderer.invoke('meta:stats')
    },
    clear(): Promise<void> {
      return ipcRenderer.invoke('meta:clear')
    }
  },

  /** On-disk cover art cache, for the settings panel. The images themselves go over `lyria-art://`. */
  art: {
    stats(): Promise<{ bytes: number; count: number }> {
      return ipcRenderer.invoke('art:stats')
    },
    clear(): Promise<void> {
      return ipcRenderer.invoke('art:clear')
    }
  },

  window: {
    minimize: (): void => ipcRenderer.send('window:control', 'minimize'),
    maximize: (): void => ipcRenderer.send('window:control', 'maximize'),
    close: (): void => ipcRenderer.send('window:control', 'close'),
    hide: (): void => ipcRenderer.send('window:control', 'hide'),
    showMain: (): void => ipcRenderer.send('window:control', 'showMain'),
    setIgnoreMouse: (ignore: boolean): void => ipcRenderer.send('window:setIgnoreMouse', ignore)
  },

  /** Floating windows only. Main watches the cursor and reports it to the window's page. */
  overlay: {
    onHover(cb: (hovering: boolean) => void): Unsubscribe {
      return subscribe('overlay:hover', cb)
    },
    /** Cursor in window coordinates while click-through is on, or null once it leaves. */
    onHitTest(cb: (point: { x: number; y: number } | null) => void): Unsubscribe {
      return subscribe('overlay:hitTest', cb)
    }
  },

  toast: {
    onShow(cb: (payload: { track: Track; durationMs: number }) => void): Unsubscribe {
      return subscribe('toast:show', cb)
    },
    shown: (): void => ipcRenderer.send('window:control', 'toastShown'),
    /** The card has started its exit; an acrylic toast fades its window out alongside it. */
    leaving: (): void => ipcRenderer.send('window:control', 'toastLeaving'),
    done: (): void => ipcRenderer.send('window:control', 'toastDone')
  },

  app: {
    info(): Promise<{ version: string; platform: string }> {
      return ipcRenderer.invoke('app:info')
    },
    openExternal(url: string): void {
      ipcRenderer.send('app:openExternal', url)
    }
  }
}

export type LyriaApi = typeof api

contextBridge.exposeInMainWorld('lyria', api)
