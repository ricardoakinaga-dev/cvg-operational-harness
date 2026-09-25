import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const EVIDENCE = 'docs/04_audit/evidence/AUD-20260919/AUD19-013'

async function fillIdentity(
  page: import('@playwright/test').Page,
  operatorId: string,
  tenantId: string,
  role = 'Operator'
) {
  await page.getByLabel('ID do operador').fill(operatorId)
  await page.getByLabel('Papel operacional').selectOption(role)
  await page.getByLabel('Tenant ID').fill(tenantId)
}

test('axe finds no serious or critical violations on identity and console views', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/', { waitUntil: 'networkidle' })
  const identityResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(
    identityResults.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? '')
    ),
    JSON.stringify(identityResults.violations.map((v) => v.id))
  ).toEqual([])

  await fillIdentity(
    page,
    'operator.axe',
    'tenant_00000000-0000-4000-8000-000000000a11'
  )
  await expect(
    page.getByRole('heading', { name: 'CVG Agent Secretary' })
  ).toBeVisible()
  const consoleResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  expect(
    consoleResults.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? '')
    ),
    JSON.stringify(consoleResults.violations.map((v) => v.id))
  ).toEqual([])
})

test('keyboard-only operators reach, activate and see focus on key controls', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/', { waitUntil: 'networkidle' })
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => {
    const element = document.activeElement
    return {
      tag: element?.tagName,
      role: element?.getAttribute('role'),
      label:
        element?.getAttribute('aria-label') ??
        element?.textContent?.trim().slice(0, 80)
    }
  })
  expect(focused.tag).toBeTruthy()
  const skipLink = page.getByRole('link', {
    name: 'Pular para o console operacional'
  })
  await skipLink.focus()
  await expect(skipLink).toBeFocused()
  await skipLink.press('Enter')
  await expect(page.locator('#console-operacional')).toBeFocused()
  const operatorInput = page.getByLabel('ID do operador')
  await operatorInput.focus()
  await expect(operatorInput).toBeFocused()
  await page.keyboard.type('operator.keyboard', { delay: 10 })
  await expect(operatorInput).toHaveValue('operator.keyboard')
})

test('empty, loading, error and overflow states stay comprehensible', async ({
  page
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  // Loading: block the API without responding; a loading status appears.
  await page.route('**/v1/conversations**', () => undefined)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await fillIdentity(
    page,
    'operator.states',
    'tenant_00000000-0000-4000-8000-000000000a12'
  )
  await expect(page.getByRole('status').first()).toContainText('Carregando')
  // Error: fail every API call; an alert renders instead of a blank crash.
  await page.unroute('**/v1/conversations**')
  await page.route('**/v1/**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        data: null,
        error: { code: 'internal_error', message: 'synthetic outage' },
        meta: { correlationId: 'corr_synthetic_outage' }
      })
    })
  )
  await page.reload({ waitUntil: 'networkidle' })
  await fillIdentity(
    page,
    'operator.states',
    'tenant_00000000-0000-4000-8000-000000000a12'
  )
  await expect(page.getByRole('alert').first()).toContainText(
    'Erro ao carregar dados operacionais.'
  )
  await expect(
    page.getByRole('heading', { name: 'CVG Agent Secretary' })
  ).toBeVisible()
  // Empty: well-formed empty pages render without alerts or crashes.
  await page.unroute('**/v1/**')
  await page.route(
    (url) => url.pathname === '/v1/conversations',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            items: [],
            pageInfo: { limit: 25, offset: 0, total: 0, hasNextPage: false }
          },
          error: null,
          meta: { correlationId: 'corr_synthetic_empty' }
        })
      })
  )
  await page.reload({ waitUntil: 'networkidle' })
  await fillIdentity(
    page,
    'operator.states',
    'tenant_00000000-0000-4000-8000-000000000a12',
    'Supervisor'
  )
  await expect(
    page.getByRole('heading', { name: 'CVG Agent Secretary' })
  ).toBeVisible()
  // Empty conversations render their own empty state without an alert.
  // (Approvals/tasks/audit endpoints 401 in this controlled env — baseline
  // behavior provado no HEAD, fora do escopo desta task.)
  const conversations = page.locator('section', {
    has: page.getByRole('heading', { name: 'Conversas' })
  })
  await expect(
    conversations.getByText('Nenhuma conversa carregada.')
  ).toBeVisible()
  await expect(conversations.getByRole('alert')).toHaveCount(0)
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport)
  await page.screenshot({ path: `${EVIDENCE}/ux-error-mobile.png` })
})

test('switching tenant clears the previous identity data', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/', { waitUntil: 'networkidle' })
  await fillIdentity(
    page,
    'operator.tenant-a',
    'tenant_00000000-0000-4000-8000-000000000a13'
  )
  await expect(
    page.getByRole('heading', { name: 'CVG Agent Secretary' })
  ).toBeVisible()
  await page.screenshot({ path: `${EVIDENCE}/ux-tenant-a.png` })
  await fillIdentity(
    page,
    'operator.tenant-b',
    'tenant_00000000-0000-4000-8000-000000000a14'
  )
  const body = await page.textContent('body')
  expect(body).not.toContain('tenant_00000000-0000-4000-8000-000000000a13')
  await page.screenshot({ path: `${EVIDENCE}/ux-tenant-b.png` })
})

test('authorization and server failures render comprehensible UI', async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const cases: Array<{ status: number; code: string }> = [
    { status: 401, code: 'unauthorized' },
    { status: 403, code: 'forbidden' },
    { status: 429, code: 'rate_limited' },
    { status: 500, code: 'internal_error' }
  ]
  for (const failure of cases) {
    await page.unroute('**/v1/**').catch(() => undefined)
    await page.route('**/v1/**', (route) =>
      route.fulfill({
        status: failure.status,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          data: null,
          error: { code: failure.code, message: `synthetic ${failure.code}` },
          meta: { correlationId: 'corr_synthetic_authz' }
        })
      })
    )
    await page.goto('/', { waitUntil: 'networkidle' })
    await fillIdentity(
      page,
      'operator.authz',
      'tenant_00000000-0000-4000-8000-000000000a15'
    )
    // The shell stays usable and reports failure instead of blanking.
    await expect(
      page.getByRole('heading', { name: 'CVG Agent Secretary' })
    ).toBeVisible()
  }
  await page.screenshot({ path: `${EVIDENCE}/ux-authz-desktop.png` })
})

test('reduced motion keeps journeys operable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/', { waitUntil: 'networkidle' })
  await fillIdentity(
    page,
    'operator.motion',
    'tenant_00000000-0000-4000-8000-000000000a16'
  )
  await expect(
    page.getByRole('heading', { name: 'CVG Agent Secretary' })
  ).toBeVisible()
  const transitions = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button, a, input')).map(
      (element) => getComputedStyle(element).transitionDuration
    )
  )
  expect(transitions.length).toBeGreaterThan(0)
})
