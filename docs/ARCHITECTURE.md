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
- `src/preload/index.ts` exposes `window.sonora` (`player.on/command/getState/wantFrames`, `auth`, `settings`, `window`, `toast`)
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
the menu's **Show Sonora** entry.

Windows does not allow third-party apps to inject controls into the taskbar itself; the widget is a
small always-on-top window positioned next to the system tray, which is the same approach
FluentFlyout uses.

## Credentials

The password is used once to derive the Subsonic `token = md5(password + salt)`. Only
`{server, username, token, salt}` is stored, encrypted with Electron's `safeStorage` (DPAPI on
Windows, libsecret on Linux; without a keyring the derived token is stored unencrypted and a warning
is logged). The plain password is never persisted. `keytar` was not used because it is archived and
has no prebuilt binaries for current Electron versions.

## CORS and the visualiser

`AnalyserNode` needs the stream response to be CORS-readable. Navidrome already sends
`Access-Control-Allow-Origin: *` on `/rest`; for servers that do not, `src/main/index.ts` rewrites
the header on responses from the configured server only.

## Lyrics

`getLyricsBySongId` (OpenSubsonic structured lyrics, synced preferred) with a fallback to the legacy
`getLyrics` text endpoint, parsed as LRC/SRT/plain. The lyrics view extrapolates the playback
position between 250ms `positionUpdate` events on every animation frame, so the highlighted line
tracks the audio closely.

