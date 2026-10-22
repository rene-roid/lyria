import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Lyria used to be called Sonora. On the first launch after the rename, its user data (settings,
 * saved login, caches, downloads) moves over to the new folder. Has to run before anything opens
 * a file under userData, so index.ts imports this first.
 */
const from = join(app.getPath('appData'), 'Sonora')
const to = app.getPath('userData')

/** True on the launch that carried Sonora's data over. */
export const migrated = existsSync(from) && !existsSync(join(to, 'lyria.json'))

if (migrated) {
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) {
    const dest = join(to, name === 'sonora.json' ? 'lyria.json' : name)
    if (!existsSync(dest)) renameSync(join(from, name), dest)
  }
  try {
    rmdirSync(from)
  } catch {
    // Something was already in the new folder under the same name; leave the old copy be.
  }
  if (process.platform === 'linux') {
    const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
    rmSync(join(configHome, 'autostart', 'sonora.desktop'), { force: true })
  }
}
