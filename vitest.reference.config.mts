import { defineConfig } from 'vitest/config'
import baseConfig from './vitest.config.mts'

// External pinned-engine proofs have an explicit resource-owning command.
// Reuse workspace aliases and all controls; never silently skip a missing pin.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/differential/*.integration.ts']
  }
})
