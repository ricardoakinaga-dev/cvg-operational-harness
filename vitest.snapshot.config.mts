import { defineConfig } from 'vitest/config'
import rootConfig from './vitest.config.mts'

// Reuse every root alias and threshold; select only the bounded replay lane.
export default defineConfig({
  ...rootConfig,
  test: {
    ...rootConfig.test,
    environment: 'node',
    include: ['tests/replay/snapshot-replay.test.ts'],
    fileParallelism: false,
    maxWorkers: 1
  }
})
