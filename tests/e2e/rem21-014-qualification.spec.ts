import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import {
  createTrustedOperatorIdentityToken,
  type TrustedOperatorSigningKey
} from '../../apps/api/src/operator-identity.ts'
import type { OperatorIdentity } from '@cvg/shared'

const syntheticSigningKey: TrustedOperatorSigningKey = {
  keyId: 'rem21-014-e2e',
  secret: 'rem21-014-e2e-synthetic-key-2026-09-22-abcdefghijklmnop'
}

const tenantA = 'tenant_00000000-0000-4000-8000-000000000a21'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000b21'

type BootstrapWindow = Window & {
  __CVG_OPERATOR_BOOTSTRAP_TOKEN__?: string
}

type TrackedRequest = {
  path: string
  headers: Record<string, string>
}

function identity(
  operatorId: string,
  role: OperatorIdentity['role'],
  tenantId: string
): OperatorIdentity {
  return { operatorId, role, tenantId }
}

function bootstrapToken(
  operator: OperatorIdentity,
  lifetimeSeconds = 120
): string {
  return createTrustedOperatorIdentityToken(
    operator,
    syntheticSigningKey,
    Date.now,
    lifetimeSeconds
  )
}

async function primeBootstrap(
  page: Page,
  operator: OperatorIdentity,
  lifetimeSeconds = 120
): Promise<void> {
  const token = bootstrapToken(operator, lifetimeSeconds)
  await page.addInitScript((nextToken) => {
    ;(window as BootstrapWindow).__CVG_OPERATOR_BOOTSTRAP_TOKEN__ = nextToken
  }, token)
}

async function putBootstrapToken(
  page: Page,
  operator: OperatorIdentity,
  lifetimeSeconds = 120
): Promise<void> {
  const token = bootstrapToken(operator, lifetimeSeconds)
  await page.evaluate((nextToken) => {
    ;(window as BootstrapWindow).__CVG_OPERATOR_BOOTSTRAP_TOKEN__ = nextToken
  }, token)
}

async function openTrustedConsole(
  page: Page,
  operator: OperatorIdentity,
  lifetimeSeconds = 120
): Promise<void> {
  await primeBootstrap(page, operator, lifetimeSeconds)
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(
    page.getByRole('heading', { name: 'CVG Agent Secretary' })
  ).toBeVisible()
  await expect(
    page.getByText('Sessão confiável', { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText(operator.operatorId, { exact: true })
  ).toBeVisible()
  expect(await page.getByLabel('ID do operador').count()).toBe(0)
  expect(await page.getByLabel('Papel operacional').count()).toBe(0)
  expect(await page.getByLabel('Tenant ID').count()).toBe(0)
}

function trackRequests(page: Page): TrackedRequest[] {
  const requests: TrackedRequest[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/v1/')) return
    requests.push({ path: url.pathname, headers: request.headers() })
  })
  return requests
}

function assertTrustedRequestBoundary(requests: TrackedRequest[]): void {
  const authorityHeaders = [
    'x-operator-id',
    'x-operator-role',
    'x-tenant-id',
    'x-cvg-operator-token'
  ]
  const violations = requests.flatMap((request) =>
    request.path === '/v1/session'
      ? authorityHeaders
          .filter((header) => header !== 'x-cvg-operator-token')
          .filter((header) => request.headers[header])
          .map((header) => `${request.path}:${header}`)
      : authorityHeaders
          .filter((header) => request.headers[header])
          .map((header) => `${request.path}:${header}`)
  )
  expect(violations).toEqual([])
  expect(
    requests.filter((request) => request.path === '/v1/session').length
  ).toBeGreaterThan(0)
}

async function assertA11y(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
  const blocking = results.violations.filter((violation) =>
    ['moderate', 'serious', 'critical'].includes(violation.impact ?? '')
  )
  test.info().annotations.push({
    type: 'axe',
    description: JSON.stringify({
      violations: results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact ?? null
      }))
    })
  })
  expect(blocking, JSON.stringify(results.violations)).toEqual([])
}

function envelope<T>(data: T) {
  return {
    success: true,
    data,
    error: null,
    meta: { correlationId: 'corr_rem21_014_synthetic' }
  }
}

test.describe('REM21-014 trusted browser qualification', () => {
  test('trusted login has no editable authority and passes axe WCAG A/AA', async ({
    page
  }) => {
    const requests = trackRequests(page)
    await openTrustedConsole(
      page,
      identity('operator.rem21.014', 'Operator', tenantA)
    )
    await assertTrustedRequestBoundary(requests)
    await assertA11y(page)
  })

  test('keyboard, focus, contrast, reduced motion and responsive shell remain operable', async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openTrustedConsole(
      page,
      identity('operator.rem21.014.keyboard', 'Supervisor', tenantA)
    )

    for (const viewport of [
      { width: 375, height: 812 },
      { width: 768, height: 900 },
      { width: 1440, height: 900 }
    ]) {
      await page.setViewportSize(viewport)
      const metrics = await page.evaluate(() => ({
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
          .matches,
        buttonTransitions: Array.from(document.querySelectorAll('button')).map(
          (button) => getComputedStyle(button).transitionDuration
        )
      }))
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport)
      expect(metrics.reducedMotion).toBe(true)
      expect(
        metrics.buttonTransitions.every((duration) => duration === '0s')
      ).toBe(true)
    }

    const skipLink = page.getByRole('link', {
      name: 'Pular para o console operacional'
    })
    await skipLink.focus()
    await expect(skipLink).toBeFocused()
    await skipLink.press('Enter')
    await expect(page.locator('#console-operacional')).toBeFocused()

    const sessionButton = page.getByRole('button', { name: 'Encerrar sessão' })
    await sessionButton.focus()
    await expect(sessionButton).toBeFocused()
    await expect
      .poll(() =>
        sessionButton.evaluate((element) => ({
          outlineStyle: getComputedStyle(element).outlineStyle,
          outlineWidth: getComputedStyle(element).outlineWidth
        }))
      )
      .toEqual({ outlineStyle: 'solid', outlineWidth: '3px' })

    await assertA11y(page)
  })

  test('expiry restores focus and recovers with a new trusted bootstrap', async ({
    page
  }) => {
    test.setTimeout(45000)
    const operator = identity('operator.rem21.014.expiry', 'Operator', tenantA)
    await openTrustedConsole(page, operator, 8)
    await expect(
      page.getByText('Sessão expirada', { exact: true })
    ).toBeVisible({ timeout: 15000 })
    const reauthenticate = page.getByRole('button', { name: 'Reautenticar' })
    await expect(reauthenticate).toBeFocused()

    await putBootstrapToken(page, operator)
    await reauthenticate.click()
    await expect(
      page.getByText('Sessão confiável', { exact: true })
    ).toBeVisible()
    await expect(
      page.getByText(operator.operatorId, { exact: true })
    ).toBeVisible()

    await page.getByRole('button', { name: 'Encerrar sessão' }).click()
    await expect(
      page
        .getByLabel('Identidade operacional')
        .getByText('Autenticação necessária', { exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Reautenticar' })
    ).toBeFocused()
    expect(await page.getByLabel('ID do operador').count()).toBe(0)
  })

  test('trusted role authorization keeps forbidden controls disabled', async ({
    browser
  }) => {
    const cases: Array<{
      role: OperatorIdentity['role']
      approve: boolean
      handoff: boolean
      updateTasks: boolean
    }> = [
      { role: 'Operator', approve: false, handoff: false, updateTasks: true },
      { role: 'Approver', approve: true, handoff: false, updateTasks: false },
      { role: 'Supervisor', approve: true, handoff: true, updateTasks: false },
      { role: 'Admin', approve: false, handoff: false, updateTasks: false }
    ]

    for (const expected of cases) {
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.route('**/v1/approvals', (route) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(
            envelope([
              {
                id: 'approval_rem21_014_synthetic',
                proposedAction: 'acao-sintetica',
                riskLevel: 'medium',
                status: 'pending'
              }
            ])
          )
        })
      )
      await page.route('**/v1/tasks', (route) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(
            envelope([
              {
                id: 'task_rem21_014_synthetic',
                title: 'tarefa-sintetica',
                priority: 'normal',
                status: 'open'
              }
            ])
          )
        })
      )
      const operator = identity(
        `operator.rem21.014.${expected.role.toLowerCase()}`,
        expected.role,
        tenantA
      )
      await openTrustedConsole(page, operator)
      const approve = page.getByRole('button', {
        name: 'Aprovar acao-sintetica'
      })
      const reject = page.getByRole('button', {
        name: 'Rejeitar acao-sintetica'
      })
      const handoff = page.getByRole('button', {
        name: 'Assumir handoff acao-sintetica'
      })
      const start = page.getByRole('button', {
        name: 'Iniciar tarefa-sintetica'
      })
      if (expected.approve) {
        await expect(approve).toBeEnabled()
        await expect(reject).toBeEnabled()
      } else {
        await expect(approve).toBeDisabled()
        await expect(reject).toBeDisabled()
      }
      if (expected.handoff) await expect(handoff).toBeEnabled()
      else await expect(handoff).toBeDisabled()
      if (expected.updateTasks) await expect(start).toBeEnabled()
      else await expect(start).toBeDisabled()
      await context.close()
    }
  })

  test('tenant rotation clears the previous tenant fixture and keeps requests trusted', async ({
    page
  }) => {
    let activeTenant = tenantA
    const requests = trackRequests(page)
    await page.route(
      (url) => url.pathname === '/v1/conversations',
      (route) => {
        const marker = `synthetic-${activeTenant}`
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(
            envelope({
              items: [
                {
                  id: `conversation-${activeTenant}`,
                  channel: 'synthetic',
                  senderRef: 'fixture-sender',
                  status: 'open',
                  correlationId: `corr-${activeTenant}`,
                  openSessionId: null,
                  lastMessageBody: marker,
                  lastMessageAt: '2026-09-22T12:00:00.000Z',
                  updatedAt: '2026-09-22T12:00:00.000Z'
                }
              ],
              pageInfo: { limit: 25, offset: 0, total: 1, hasNextPage: false }
            })
          )
        })
      }
    )
    await page.route('**/v1/conversations/*/timeline', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(envelope({ messages: [] }))
      })
    )

    const first = identity('operator.rem21.014.tenant-a', 'Operator', tenantA)
    await openTrustedConsole(page, first)
    await expect(
      page.getByText(`synthetic-${tenantA}`, { exact: true })
    ).toBeVisible()

    activeTenant = tenantB
    const second = identity('operator.rem21.014.tenant-b', 'Operator', tenantB)
    await page.getByRole('button', { name: 'Encerrar sessão' }).click()
    await expect(
      page.getByRole('button', { name: 'Reautenticar' })
    ).toBeFocused()
    await putBootstrapToken(page, second)
    await page.getByRole('button', { name: 'Reautenticar' }).click()
    await expect(
      page.getByText(second.operatorId, { exact: true })
    ).toBeVisible()
    await expect(
      page.getByText(`synthetic-${tenantB}`, { exact: true })
    ).toBeVisible()
    expect(
      await page.getByText(`synthetic-${tenantA}`, { exact: true }).count()
    ).toBe(0)
    assertTrustedRequestBoundary(requests)
  })
})
