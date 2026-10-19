import { defineConfig } from 'vitest/config'
import baseConfig from './vitest.config.mts'

// Physical Git/tar/strace identities are required by these native proofs.
// The explicit profile retains their fail-closed guards and the base controls.
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [
      'tests/b6-0234-reference-recipe.integration.js',
      'tests/b6-0236-compiled-provenance.integration.js'
    ],
    passWithNoTests: false
  }
})
