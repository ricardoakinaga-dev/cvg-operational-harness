/**
 * PROD-03 — external Chromium probe for the tenant-switch race (adapted from
 * the audit's ui/race.cjs, which reproduced D13-02).
 *
 * Intercepts /v1/** with synthetic data, starts a delayed owners search under
 * tenant A, switches to tenant B, then resolves the delayed response and
 * asserts it never becomes visible.
 */
const { chromium } = require('playwright')

const WEB_URL = process.env.PROD03_WEB_URL ?? 'http://127.0.0.1:4398'
const OUTPUT = process.env.PROD03_OUTPUT ?? '/tmp/opencode/prod03-race.png'

async function main() {
  let pending
  let started
  const begin = new Promise((resolve) => {
    started = resolve
  })
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 }
  })
  await page.route('**/v1/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/owners/search')) {
      pending = route
      started()
      return
    }
    const data = url.includes('/conversations')
      ? {
          items: [],
          pageInfo: { limit: 25, offset: 0, total: 0, hasNextPage: false }
        }
      : []
    await route.fulfill({ json: { success: true, data } })
  })
  await page.goto(WEB_URL)
  await page
    .getByLabel('ID do operador', { exact: true })
    .fill('synthetic.operator')
  await page.getByLabel('Tenant ID', { exact: true }).fill('tenant_A')
  await page
    .getByLabel('Telefone sintético', { exact: true })
    .fill('synthetic-001')
  await page.getByRole('button', { name: 'Buscar tutor', exact: true }).click()
  await begin
  await page.getByLabel('Tenant ID', { exact: true }).fill('tenant_B')
  await page
    .getByLabel('Telefone sintético', { exact: true })
    .fill('synthetic-002')
  await pending.fulfill({
    json: {
      success: true,
      data: {
        matches: [
          {
            id: 'candidate_A',
            displayName: 'SYNTHETIC TENANT A PRIVATE NAME',
            kind: 'owner'
          }
        ]
      }
    }
  })
  await page.waitForTimeout(500)
  const staleVisible = await page
    .getByText('SYNTHETIC TENANT A PRIVATE NAME')
    .isVisible()
    .catch(() => false)
  const tenantValue = await page
    .getByLabel('Tenant ID', { exact: true })
    .inputValue()
  await page.screenshot({ path: OUTPUT, fullPage: true })
  await browser.close()
  console.log(
    JSON.stringify(
      {
        probe: 'ui-tenant-race',
        tenant: tenantValue,
        staleTenantCandidateVisible: staleVisible,
        verdict: staleVisible ? 'FAIL_STALE_VISIBLE' : 'PASS_STALE_DISCARDED'
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
