import type { LyriaApi } from './index'

declare global {
  interface Window {
    lyria: LyriaApi
  }
}

export {}
