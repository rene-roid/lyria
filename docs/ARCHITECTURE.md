# Architecture

**Only one place ever touches the `<audio>` element.** A hidden "audio host" window
(`src/renderer/host`) owns playback, the queue, volume and a Web Audio `AnalyserNode`. Every visible
window is a pure display layer:

```
                       commands (play/pause/seek/setQueue/...)
  main UI ─────┐                                            ┌──▶ audio host (hidden)
  mini-player ─┼──▶ preload bridge ──▶ ipcMain relay ───────┤      <audio> + AnalyserNode
  taskbar widget┘        ▲                 │                └──◀ emits events
  toast                  └─────────────────┘
                 events (trackChanged, positionUpdate, playStateChanged,
                         queueChanged, volumeChanged, modeChanged, audioFrame)
```

- `src/shared/types.ts` holds the full event/command contract (`PlayerEvents`, `PlayerCommands`, `PlayerState`)
- `src/main/ipc.ts` relays host events to every window, caches the latest state so new windows hydrate instantly, forwards commands to the host, and streams `audioFrame` only to windows that asked for it
- `src/preload/index.ts` exposes `window.lyria` (`player.on/command/getState/wantFrames`, `auth`, `settings`, `window`, `toast`)
- `src/renderer/shared/playerStore.ts` exports `usePlayerState()` (Zustand) and the `player.*` command helpers used by every window

## Windows

| Window | Purpose |
|---|---|
| `main` | Library UI: sidebar, home, albums, artists, playlists, favorites, search, queue panel, lyrics, settings |
| `host` | Hidden audio host (`show: false`, background throttling off) |
| `toast` | Frameless, transparent, click-through, always-on-top card that animates in on `trackChanged` (single reused window) |
| `mini` | Draggable always-on-top mini-player, position remembered in settings |
| `widget` | "Taskbar" widget: acrylic flyout pinned to the bottom-right of the work area, right above the taskbar, with a canvas visualiser fed by `audioFrame` at ~30fps |

On Linux the tray icon has no left-click handler (most desktops only open the context menu), so use
the menu's **Show Lyria** entry.

Windows does not allow third-party apps to inject controls into the taskbar itself; the widget is a
small always-on-top window positioned next to the system tray, which is the same approach
FluentFlyout uses.

## Credentials

The password is used once to derive the Subsonic `token = md5(password + salt)`. Only
`{server, username, token, salt}` is stored, encrypted with Electron's `safeStorage` (DPAPI on
Windows, libsecret on Linux; without a keyring the derived token is stored unencrypted and a warning
is logged). The plain password is never persisted. `keytar` was not used because it is archived and
has no prebuilt binaries for current Electron versions.

## Caches

Three on-disk caches live under the user data folder, each with a size and a clear button in Settings:

- **Songs** (`src/main/audioCache.ts`): played tracks, evicted least recently played first. With
  compression on, FLAC and WAV files are re-encoded to Ogg Opus after they land and the original is
  swapped for the smaller file. Main has no codecs, so it hands the bytes to the audio host
  (`src/main/hostJobs.ts` → `src/renderer/host/compress.ts`), which decodes them with Web Audio,
  encodes with WebCodecs `AudioEncoder` and wraps the packets with `src/shared/oggOpus.ts`. Jobs run
  one at a time; songs cached before compression was on are swept in the background after launch.
- **Cover art** (`src/main/artCache.ts`): served over `lyria-art://`, re-encoded to WebP the same way.
- **Library responses** (`src/main/metaCache.ts`): album lists, artists, playlists and pages, held in
  memory and written as one gzipped JSON file. The main window loads it all before its first render,
  so `cacheRead` stays synchronous, and wipes it when the account changes.

## Offline

- **Downloads** (`src/main/downloads.ts`): playlists and saved mixes kept for offline listening, in
  a folder of their own outside the song cache's budget. A song already cached is moved over rather
  than fetched again, and a removed download hands its songs back to the cache. Playlists are
  re-synced with the server on launch and every 30 minutes. Downloading a generated mix saves its
  lineup first, since those roll over daily. A downloaded playlist keeps a copy of itself, songs
  included, refreshed on every sync, so it opens with no server even once the library cache has
  lost it.
- **Connection** (`src/main/connection.ts`): main checks whether any of the library's addresses
  answers (every 30 seconds, every 10 while it is away, on waking from sleep, and as soon as a
  window's request fails to reach it) and tells every window. When it answers again, held plays and
  downloads catch up straight away.
- **Local-first playback**: the audio host asks main for a downloaded or cached copy (`cache:local`)
  before streaming, so a song on disk plays with the server unreachable; a copy that fails to play
  falls back to the stream. Offline, songs with no copy on disk are skipped instead of streamed.
- **Offline UI** (`src/renderer/main/offline.ts`): with the server away, Home lists what plays from
  this device, songs with no copy on disk are greyed out, card and tile play buttons fall back to
  the pages' cached copies, and a page never cached says so instead of showing an error.
- **Play counts** (`src/main/scrobbles.ts`): plays are reported through main whichever copy played.
  One the server cannot take yet is kept in `pending-scrobbles.json` with the time it happened and
  sent, oldest first, when the server answers again.

## CORS and the visualiser

`AnalyserNode` needs the stream response to be CORS-readable. Navidrome already sends
`Access-Control-Allow-Origin: *` on `/rest`; for servers that do not, `src/main/index.ts` rewrites
the header on responses from the configured server only.

## Lyrics

`getLyricsBySongId` (OpenSubsonic structured lyrics, synced preferred) with a fallback to the legacy
`getLyrics` text endpoint, parsed as LRC/SRT/plain. The lyrics view extrapolates the playback
position between 250ms `positionUpdate` events on every animation frame, so the highlighted line
tracks the audio closely.

