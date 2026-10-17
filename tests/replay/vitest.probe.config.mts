import { defineConfig } from 'vitest/config'
import replayConfig from '../../vitest.snapshot.config.mts'
export default defineConfig({
  ...replayConfig,
  test: {
    ...replayConfig.test,
    include: ['tests/replay/public-controls.probe.ts']
  }
})
