/**
 * SPEC0176 test fixtures. A synthetic principal is provisioned through the
 * internal provisioning port (the same port a verified identity adapter
 * uses); grants always go through the public registry API, so tests exercise
 * GET /v1/cases → PUT /v1/cases/:caseId/assignments/:operatorId.
 */
import { expect } from 'vitest'
import type { CaseAuthorityPort, CaseKind } from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import type { buildServer } from '../server.ts'

export const SYNTHETIC_AUTHORITY_VERSION = 'synthetic-authority-v1'
export const CONTROLLED_TEST_TENANT =
  'tenant_00000000-0000-4000-8000-000000000001' as TenantId

type App = ReturnType<typeof buildServer>

interface InjectableApp {
  caseAuthority: CaseAuthorityPort
  inject: App['inject']
}

export async function provisionPrincipal(
  app: Pick<InjectableApp, 'caseAuthority'>,
  input: {
    tenantId?: TenantId
    operatorId: string
    role: 'Operator' | 'Approver' | 'Supervisor' | 'Admin'
    active?: boolean
    expectedRevision?: number
    authorityVersion?: string
  }
) {
  return app.caseAuthority.applyVerifiedPrincipalState({
    tenantId: input.tenantId ?? CONTROLLED_TEST_TENANT,
    operatorId: input.operatorId,
    role: input.role,
    active: input.active ?? true,
    expectedRevision: input.expectedRevision ?? 0,
    authorityVersion: input.authorityVersion ?? SYNTHETIC_AUTHORITY_VERSION,
    proofRef: `synthetic-proof:${input.operatorId}`,
    identitySource: 'synthetic_fixture'
  })
}

export function managerHeaders(
  operatorId = 'supervisor.case-manager',
  tenantId: string = CONTROLLED_TEST_TENANT
): Record<string, string> {
  return {
    'x-operator-id': operatorId,
    'x-operator-role': 'Supervisor',
    'x-tenant-id': tenantId
  }
}

export async function findCaseId(
  app: InjectableApp,
  kind: CaseKind,
  resourceId: string,
  headers: Record<string, string> = managerHeaders()
): Promise<string> {
  const response = await app.inject({
    method: 'GET',
    url: `/v1/cases?kind=${kind}&resourceId=${encodeURIComponent(resourceId)}`,
    headers
  })
  expect(response.statusCode).toBe(200)
  const items = response.json().data.items as { caseId: string }[]
  expect(items).toHaveLength(1)
  return items[0]!.caseId
}

export async function putAssignment(
  app: InjectableApp,
  caseId: string,
  operatorId: string,
  body: { status: 'ACTIVE' | 'REVOKED'; expectedRevision: number },
  headers: Record<string, string> = managerHeaders()
) {
  return app.inject({
    method: 'PUT',
    url: `/v1/cases/${caseId}/assignments/${operatorId}`,
    headers,
    payload: body
  })
}

/** Provisions the operator (if needed) and grants read_case on the root. */
export async function grantCase(
  app: InjectableApp,
  input: {
    kind: CaseKind
    resourceId: string
    operatorId: string
    role?: 'Operator' | 'Approver'
    provision?: boolean
    tenantId?: TenantId
    headers?: Record<string, string>
  }
): Promise<string> {
  const tenantId = input.tenantId ?? CONTROLLED_TEST_TENANT
  const headers =
    input.headers ?? managerHeaders('supervisor.case-manager', tenantId)
  if (input.provision !== false) {
    await provisionPrincipal(app, {
      tenantId,
      operatorId: input.operatorId,
      role: input.role ?? 'Operator'
    })
  }
  const caseId = await findCaseId(app, input.kind, input.resourceId, headers)
  const granted = await putAssignment(
    app,
    caseId,
    input.operatorId,
    { status: 'ACTIVE', expectedRevision: 0 },
    headers
  )
  expect(granted.statusCode).toBe(200)
  return caseId
}

/**
 * SPEC 0262 §5: a trusted server serves an operator route only for a current
 * principal, so a server built with an ad-hoc resolver composes the principal
 * authority and provisions the principals its resolver can return.
 */
export async function buildTrustedServer(
  build: (options: Record<string, unknown>) => App,
  options: Record<string, unknown>,
  principals: ReadonlyArray<{
    tenantId: string
    operatorId: string
    role: 'Operator' | 'Approver' | 'Supervisor' | 'Admin'
  }>
): Promise<App> {
  const app = build({
    ...options,
    casePrincipalAuthority: { authorityVersion: SYNTHETIC_AUTHORITY_VERSION }
  })
  for (const principal of principals) {
    await provisionPrincipal(app, {
      tenantId: principal.tenantId as TenantId,
      operatorId: principal.operatorId,
      role: principal.role
    })
  }
  return app
}
