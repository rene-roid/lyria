import { ipcMain } from 'electron'
import type { HostJob } from '@shared/types'
import { getWindow, windowNameOf } from './windows'

/**
 * Work main hands to the hidden audio host, which has the codecs main lacks. Jobs run one at a
 * time, so a backlog of cache files to re-encode never has the host decoding several songs at once
 * next to the one it is playing.
 */

/** Long enough for an hour-long FLAC; a job that outlives it is taken as lost to a host reload. */
const TIMEOUT_MS = 5 * 60_000

let seq = 0
const waiting = new Map<number, (result: Uint8Array | null) => void>()
let chain: Promise<unknown> = Promise.resolve()

export function setupHostJobs(): void {
  ipcMain.on('host:jobDone', (e, id: number, result: Uint8Array | null) => {
    if (windowNameOf(e.sender.id) !== 'host') return
    waiting.get(id)?.(result)
  })
}

export function runInHost(job: HostJob, body: Buffer): Promise<Buffer | null> {
  const run = chain.then(() => send(job, body))
  chain = run.catch(() => undefined)
  return run
}

function send(job: HostJob, body: Buffer): Promise<Buffer | null> {
  const host = getWindow('host')
  if (!host) return Promise.resolve(null)
  const id = (seq += 1)
  return new Promise((resolve) => {
    const finish = (result: Uint8Array | null): void => {
      clearTimeout(timer)
      waiting.delete(id)
      resolve(result?.byteLength ? Buffer.from(result.buffer, result.byteOffset, result.byteLength) : null)
    }
    const timer = setTimeout(() => finish(null), TIMEOUT_MS)
    waiting.set(id, finish)
    host.webContents.send('host:job', id, job, body)
  })
}
