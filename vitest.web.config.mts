import { defineConfig } from 'vitest/config'
import baseConfig from './vitest.config.mts'

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['apps/web/src/**/*.test.{ts,tsx}'],
    coverage: {
      ...baseConfig.test?.coverage,
      include: ['apps/web/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/node_modules/**',
        '**/dist/**',
        'apps/web/src/main.tsx'
      ],
      reportsDirectory: 'coverage/web',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 75,
        branches: 72,
        functions: 72,
        lines: 78
      }
    }
  }
})
