import { defineConfig } from 'vitest/config'
import baseConfig from './vitest.config.mts'

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    coverage: {
      ...baseConfig.test?.coverage,
      include: [
        'packages/persistence/src/*postgres*.ts',
        'packages/persistence/src/platform-control-plane-repository.ts',
        'packages/persistence/src/platform-approval-repository.ts',
        'packages/persistence/src/tenant-scoped-capability-approval-repository.ts'
      ],
      exclude: ['**/*.test.ts', '**/node_modules/**', '**/dist/**'],
      reportsDirectory: 'coverage/postgres',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 76,
        branches: 65,
        functions: 81,
        lines: 77
      }
    }
  }
})
