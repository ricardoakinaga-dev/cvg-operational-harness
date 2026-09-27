import { defineConfig, devices } from '@playwright/test'

const apiPort = process.env.CVG_API_PORT ?? '3199'
const webPort = process.env.CVG_WEB_PORT ?? '4173'
const consoleOrigin = `http://127.0.0.1:${webPort}`
const e2eJsonOutput = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME
const e2eBinding =
  process.env.CI_RUN_ID &&
  process.env.CI_CANDIDATE_ID &&
  process.env.CVG_E2E_EXECUTION_ID
    ? {
        runId: process.env.CI_RUN_ID,
        candidateId: process.env.CI_CANDIDATE_ID,
        executionId: process.env.CVG_E2E_EXECUTION_ID
      }
    : undefined

export default defineConfig({
  ...(e2eBinding ? { metadata: { cvgE2e: e2eBinding } } : {}),
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  testIgnore: '**/rem21-014-qualification.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter:
    e2eJsonOutput && e2eBinding
      ? [
          ['json', { outputFile: e2eJsonOutput }],
          ['junit', { outputFile: 'playwright-results.xml' }],
          ['line']
        ]
      : e2eJsonOutput
        ? [['json', { outputFile: e2eJsonOutput }], ['line']]
        : process.env.CI
          ? [['line'], ['junit', { outputFile: 'playwright-results.xml' }]]
          : [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? consoleOrigin,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `NODE_ENV=test API_ALLOWED_ORIGINS=${consoleOrigin} PORT=${apiPort} npm run dev:api`,
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    },
    {
      command: `CVG_API_PORT=${apiPort} VITE_CVG_WEB_IDENTITY_MODE=simulation VITE_CVG_CONTROLLED_TEST=true npm run dev:web -- --port ${webPort}`,
      url: consoleOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    }
  ]
})
