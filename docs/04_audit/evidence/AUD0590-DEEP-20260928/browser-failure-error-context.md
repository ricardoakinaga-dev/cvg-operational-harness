# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rem21-014-qualification.spec.ts >> REM21-014 trusted browser qualification >> keyboard, focus, contrast, reduced motion and responsive shell remain operable
- Location: tests/e2e/rem21-014-qualification.spec.ts:163:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'CVG Agent Secretary' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: 'CVG Agent Secretary' })

```

# Test source

```ts
  1   | import AxeBuilder from '@axe-core/playwright'
  2   | import { expect, test, type Page } from '@playwright/test'
  3   | import {
  4   |   createTrustedOperatorIdentityToken,
  5   |   type TrustedOperatorSigningKey
  6   | } from '../../apps/api/src/operator-identity.ts'
  7   | import type { OperatorIdentity } from '@cvg/shared'
  8   | 
  9   | const syntheticSigningKey: TrustedOperatorSigningKey = {
  10  |   keyId: 'rem21-014-e2e',
  11  |   secret: 'rem21-014-e2e-synthetic-key-2026-09-22-abcdefghijklmnop'
  12  | }
  13  | 
  14  | const tenantA = 'tenant_00000000-0000-4000-8000-000000000a21'
  15  | const tenantB = 'tenant_00000000-0000-4000-8000-000000000b21'
  16  | 
  17  | type BootstrapWindow = Window & {
  18  |   __CVG_OPERATOR_BOOTSTRAP_TOKEN__?: string
  19  | }
  20  | 
  21  | type TrackedRequest = {
  22  |   path: string
  23  |   headers: Record<string, string>
  24  | }
  25  | 
  26  | function identity(
  27  |   operatorId: string,
  28  |   role: OperatorIdentity['role'],
  29  |   tenantId: string
  30  | ): OperatorIdentity {
  31  |   return { operatorId, role, tenantId }
  32  | }
  33  | 
  34  | function bootstrapToken(
  35  |   operator: OperatorIdentity,
  36  |   lifetimeSeconds = 120
  37  | ): string {
  38  |   return createTrustedOperatorIdentityToken(
  39  |     operator,
  40  |     syntheticSigningKey,
  41  |     Date.now,
  42  |     lifetimeSeconds
  43  |   )
  44  | }
  45  | 
  46  | async function primeBootstrap(
  47  |   page: Page,
  48  |   operator: OperatorIdentity,
  49  |   lifetimeSeconds = 120
  50  | ): Promise<void> {
  51  |   const token = bootstrapToken(operator, lifetimeSeconds)
  52  |   await page.addInitScript((nextToken) => {
  53  |     ;(window as BootstrapWindow).__CVG_OPERATOR_BOOTSTRAP_TOKEN__ = nextToken
  54  |   }, token)
  55  | }
  56  | 
  57  | async function putBootstrapToken(
  58  |   page: Page,
  59  |   operator: OperatorIdentity,
  60  |   lifetimeSeconds = 120
  61  | ): Promise<void> {
  62  |   const token = bootstrapToken(operator, lifetimeSeconds)
  63  |   await page.evaluate((nextToken) => {
  64  |     ;(window as BootstrapWindow).__CVG_OPERATOR_BOOTSTRAP_TOKEN__ = nextToken
  65  |   }, token)
  66  | }
  67  | 
  68  | async function openTrustedConsole(
  69  |   page: Page,
  70  |   operator: OperatorIdentity,
  71  |   lifetimeSeconds = 120
  72  | ): Promise<void> {
  73  |   await primeBootstrap(page, operator, lifetimeSeconds)
  74  |   await page.goto('/', { waitUntil: 'networkidle' })
  75  |   await expect(
  76  |     page.getByRole('heading', { name: 'CVG Agent Secretary' })
> 77  |   ).toBeVisible()
      |     ^ Error: expect(locator).toBeVisible() failed
  78  |   await expect(
  79  |     page.getByText('Sessão confiável', { exact: true })
  80  |   ).toBeVisible()
  81  |   await expect(
  82  |     page.getByText(operator.operatorId, { exact: true })
  83  |   ).toBeVisible()
  84  |   expect(await page.getByLabel('ID do operador').count()).toBe(0)
  85  |   expect(await page.getByLabel('Papel operacional').count()).toBe(0)
  86  |   expect(await page.getByLabel('Tenant ID').count()).toBe(0)
  87  | }
  88  | 
  89  | function trackRequests(page: Page): TrackedRequest[] {
  90  |   const requests: TrackedRequest[] = []
  91  |   page.on('request', (request) => {
  92  |     const url = new URL(request.url())
  93  |     if (!url.pathname.startsWith('/v1/')) return
  94  |     requests.push({ path: url.pathname, headers: request.headers() })
  95  |   })
  96  |   return requests
  97  | }
  98  | 
  99  | function assertTrustedRequestBoundary(requests: TrackedRequest[]): void {
  100 |   const authorityHeaders = [
  101 |     'x-operator-id',
  102 |     'x-operator-role',
  103 |     'x-tenant-id',
  104 |     'x-cvg-operator-token'
  105 |   ]
  106 |   const violations = requests.flatMap((request) =>
  107 |     request.path === '/v1/session'
  108 |       ? authorityHeaders
  109 |           .filter((header) => header !== 'x-cvg-operator-token')
  110 |           .filter((header) => request.headers[header])
  111 |           .map((header) => `${request.path}:${header}`)
  112 |       : authorityHeaders
  113 |           .filter((header) => request.headers[header])
  114 |           .map((header) => `${request.path}:${header}`)
  115 |   )
  116 |   expect(violations).toEqual([])
  117 |   expect(
  118 |     requests.filter((request) => request.path === '/v1/session').length
  119 |   ).toBeGreaterThan(0)
  120 | }
  121 | 
  122 | async function assertA11y(page: Page): Promise<void> {
  123 |   const results = await new AxeBuilder({ page })
  124 |     .withTags(['wcag2a', 'wcag2aa'])
  125 |     .analyze()
  126 |   const blocking = results.violations.filter((violation) =>
  127 |     ['moderate', 'serious', 'critical'].includes(violation.impact ?? '')
  128 |   )
  129 |   test.info().annotations.push({
  130 |     type: 'axe',
  131 |     description: JSON.stringify({
  132 |       violations: results.violations.map((violation) => ({
  133 |         id: violation.id,
  134 |         impact: violation.impact ?? null
  135 |       }))
  136 |     })
  137 |   })
  138 |   expect(blocking, JSON.stringify(results.violations)).toEqual([])
  139 | }
  140 | 
  141 | function envelope<T>(data: T) {
  142 |   return {
  143 |     success: true,
  144 |     data,
  145 |     error: null,
  146 |     meta: { correlationId: 'corr_rem21_014_synthetic' }
  147 |   }
  148 | }
  149 | 
  150 | test.describe('REM21-014 trusted browser qualification', () => {
  151 |   test('trusted login has no editable authority and passes axe WCAG A/AA', async ({
  152 |     page
  153 |   }) => {
  154 |     const requests = trackRequests(page)
  155 |     await openTrustedConsole(
  156 |       page,
  157 |       identity('operator.rem21.014', 'Operator', tenantA)
  158 |     )
  159 |     await assertTrustedRequestBoundary(requests)
  160 |     await assertA11y(page)
  161 |   })
  162 | 
  163 |   test('keyboard, focus, contrast, reduced motion and responsive shell remain operable', async ({
  164 |     page
  165 |   }) => {
  166 |     await page.emulateMedia({ reducedMotion: 'reduce' })
  167 |     await openTrustedConsole(
  168 |       page,
  169 |       identity('operator.rem21.014.keyboard', 'Supervisor', tenantA)
  170 |     )
  171 | 
  172 |     for (const viewport of [
  173 |       { width: 375, height: 812 },
  174 |       { width: 768, height: 900 },
  175 |       { width: 1440, height: 900 }
  176 |     ]) {
  177 |       await page.setViewportSize(viewport)
```