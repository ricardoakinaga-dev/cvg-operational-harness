import { defineConfig, devices } from '@playwright/test'

const apiPort = process.env.CVG_API_PORT ?? '3299'
const webPort = process.env.CVG_WEB_PORT ?? '4299'
const consoleOrigin = `http://127.0.0.1:${webPort}`
const e2eJsonOutput = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME
const syntheticKeyRing = JSON.stringify({
  current: {
    keyId: 'rem21-014-e2e',
    secret: 'rem21-014-e2e-synthetic-key-2026-09-22-abcdefghijklmnop'
  }
})

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/rem21-014-qualification.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: e2eJsonOutput
    ? [['json', { outputFile: e2eJsonOutput }], ['line']]
    : [['line']],
  use: {
    baseURL: process.env.BASE_URL ?? consoleOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } }
  ],
  webServer: [
    {
      command: [
        'NODE_ENV=test',
        'CVG_IDENTITY_MODE=trusted',
        `CVG_OPERATOR_IDENTITY_KEYRING=${shellQuote(syntheticKeyRing)}`,
        `API_ALLOWED_ORIGINS=${consoleOrigin}`,
        `PORT=${apiPort}`,
        'npm run dev:api'
      ].join(' '),
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: false,
      timeout: 120000
    },
    {
      command: [
        'NODE_ENV=test',
        `CVG_API_PORT=${apiPort}`,
        'VITE_CVG_WEB_IDENTITY_MODE=trusted',
        'VITE_CVG_CONTROLLED_TEST=false',
        'npm run dev:web',
        `-- --port ${webPort}`
      ].join(' '),
      url: consoleOrigin,
      reuseExistingServer: false,
      timeout: 120000
    }
  ]
})
