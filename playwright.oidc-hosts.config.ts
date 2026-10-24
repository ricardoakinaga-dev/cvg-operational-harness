import { defineConfig } from '@playwright/test'

/**
 * SPEC0259 §4.11 — browser proof of the OIDC console on distinct HTTPS hosts
 * (Q8 and Q9). Chromium only (PB4), one worker, no retry and `forbidOnly`;
 * the global setup starts PostgreSQL schemas, the synthetic IdP, the API
 * entrypoint, the real NGINX container and the TLS edge. Run only through
 * `npm run test:e2e:oidc-hosts` (outside test:core, coverage and certify).
 */
const jsonOutput = process.env.PLAYWRIGHT_JSON_OUTPUT_NAME

export default defineConfig({
  captureGitInfo: { commit: true, diff: false },
  testDir: './tests/e2e-oidc-hosts',
  testMatch: 'oidc-hosts.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  // The login pacer may wait up to the 70 s window before a flow (DB10).
  timeout: 300_000,
  globalSetup: './tests/support/oidc-hosts/global-setup.ts',
  reporter: jsonOutput
    ? [['json', { outputFile: jsonOutput }], ['line']]
    : [['line']],
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 30_000
  },
  projects: [{ name: 'chromium' }]
})
