import { bootstrap } from '@renderer/shared/bootstrap'
import { hydrateCache } from '@renderer/shared/cache'
import { App } from './App'

// The cached library has to be in memory before the first render, or every view starts cold.
void hydrateCache().then(() => bootstrap(<App />))
