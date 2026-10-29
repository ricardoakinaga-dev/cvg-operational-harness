import { afterEach, describe, expect, it } from 'vitest'
import {
  createInMemoryExecutionStepStore,
  createInMemoryOperationalExecutionStore,
  type ExecutionRecord
} from '@cvg/harness'
import type { ExecutionStep, RuntimeInput } from '@cvg/harness-contracts'
import { buildServer } from '../server.ts'
import {
  createTrustedOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '../operator-identity.ts'
import { createInMemoryOperatorSessionStore } from '../operator-session.ts'
import {
  CONTROLLED_TEST_TENANT,
  SYNTHETIC_AUTHORITY_VERSION,
  findCaseId,
  grantCase,
  managerHeaders,
  provisionPrincipal,
  putAssignment
} from './case-authorization-fixtures.ts'

/**
 * SPEC0176 AUTH01–AUTH10 on the synthetic in-memory authority. PostgreSQL
 * parity, snapshot isolation, catalog preflight and migration properties are
 * proven in `case-assignment-authorization-postgres.test.ts`.
 */
const TENANT = CONTROLLED_TEST_TENANT
const OTHER_TENANT = 'tenant_00000000-0000-4000-8000-000000000177'
const NOT_FOUND = { code: 'not_found', message: 'Resource not found' }
const now = new Date('2026-10-20T12:00:00.000Z')

type App = ReturnType<typeof buildServer>

const apps: App[] = []
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

function track(app: App): App {
  apps.push(app)
  return app
}

function as(
  operatorId: string,
  role: 'Operator' | 'Approver' | 'Supervisor' | 'Admin',
  tenantId: string = TENANT
): Record<string, string> {
  return {
    'x-operator-id': operatorId,
    'x-operator-role': role,
    'x-tenant-id': tenantId
  }
}

async function seedConversation(app: App, marker: string, tenantId = TENANT) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    headers: { 'x-tenant-id': tenantId },
    payload: {
      externalMessageId: `case-${marker}-${Math.random()}`,
      senderRef: `+55119000${Math.floor(Math.random() * 100000)}`,
      body: `Synthetic ${marker}`,
      receivedAt: now.toISOString()
    }
  })
  expect(response.statusCode).toBe(200)
  return response.json().data as { conversationId: string; sessionId: string }
}

function runtime(
  conversationId: string,
  sessionId: string,
  tenantId: string = TENANT
): RuntimeInput {
  return {
    agent: {
      id: 'agent.case.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'synthetic case authorization',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId: conversationId as RuntimeInput['conversationId'],
    sessionId: sessionId as RuntimeInput['sessionId'],
    correlationId:
      'correlation_case_synthetic' as RuntimeInput['correlationId'],
    traceId: 'trace_case_synthetic' as RuntimeInput['traceId'],
    userMessage: 'synthetic case message',
    context: {
      values: { fixture: true },
      sourceIds: ['synthetic'],
      capturedAt: now.toISOString()
    },
    state: { version: 1, values: {}, updatedAt: now.toISOString() },
    budget: {
      maxSteps: 1,
      maxModelCalls: 1,
      maxToolCalls: 1,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 1_000
    }
  }
}

async function submit(
  app: App,
  headers: Record<string, string>,
  conversationId: string,
  sessionId: string,
  key = `case-exec-${Math.random()}`
) {
  return app.inject({
    method: 'POST',
    url: '/v1/executions',
    headers,
    payload: {
      idempotencyKey: key,
      runtime: runtime(conversationId, sessionId)
    }
  })
}

async function get(app: App, url: string, headers: Record<string, string>) {
  return app.inject({ method: 'GET', url, headers })
}

describe('SPEC0176 AUTH01 — readers by person and object', () => {
  it('serves only the assigned roots to Operator/Approver across the five readers', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const steps = createInMemoryExecutionStepStore()
    const app = track(
      buildServer({
        operationalExecution: store,
        executionSteps: steps,
        requireAuthenticatedMutations: true
      })
    )
    const caseA = await seedConversation(app, 'MARKER_CASE_A')
    const caseB = await seedConversation(app, 'MARKER_CASE_B')
    const execA = await submit(
      app,
      as('supervisor.case', 'Supervisor'),
      caseA.conversationId,
      caseA.sessionId
    )
    expect(execA.statusCode).toBe(202)
    const execAId = execA.json().data.execution.id as string
    const step: ExecutionStep = {
      stepId: 'step_case_a',
      executionId: execAId,
      tenantId: TENANT,
      stepNumber: 1,
      stepType: 'RESPOND',
      status: 'SUCCEEDED',
      attempt: 1,
      sideEffecting: false,
      startedAt: now.toISOString(),
      completedAt: now.toISOString(),
      decisionType: 'RESPOND',
      reasonCode: 'GOAL_SATISFIED',
      observationRefs: []
    }
    await steps.recordStep(step)

    await grantCase(app, {
      kind: 'core_conversation',
      resourceId: caseA.conversationId,
      operatorId: 'operator.a'
    })
    await grantCase(app, {
      kind: 'core_conversation',
      resourceId: caseB.conversationId,
      operatorId: 'operator.b'
    })
    await grantCase(app, {
      kind: 'core_conversation',
      resourceId: caseA.conversationId,
      operatorId: 'approver.a',
      role: 'Approver'
    })
    await provisionPrincipal(app, {
      operatorId: 'approver.none',
      role: 'Approver'
    })

    const readers = (caseRef: typeof caseA, executionId: string | null) => [
      `/v1/conversations/${caseRef.conversationId}/timeline`,
      `/v1/audit/sessions/${caseRef.sessionId}`,
      ...(executionId
        ? [
            `/v1/executions/${executionId}`,
            `/v1/executions/${executionId}/trajectory`
          ]
        : [])
    ]

    for (const [reader, role] of [
      ['operator.a', 'Operator'],
      ['approver.a', 'Approver']
    ] as const) {
      const list = await get(app, '/v1/conversations', as(reader, role))
      expect(list.statusCode).toBe(200)
      expect(list.json().data.pageInfo.total).toBe(1)
      expect(list.json().data.items[0].id).toBe(caseA.conversationId)
      expect(list.body).not.toContain('MARKER_CASE_B')
      for (const url of readers(caseA, execAId)) {
        const response = await get(app, url, as(reader, role))
        expect(response.statusCode, `${reader} ${url}`).toBe(200)
        expect(response.headers['cache-control']).toBe('no-store')
      }
      for (const url of readers(caseB, null)) {
        const response = await get(app, url, as(reader, role))
        expect(response.statusCode, `${reader} ${url}`).toBe(404)
        expect(response.json().error).toEqual(NOT_FOUND)
        expect(response.body).not.toContain('MARKER_CASE_B')
      }
    }

    const listB = await get(
      app,
      '/v1/conversations',
      as('operator.b', 'Operator')
    )
    expect(
      listB.json().data.items.map((item: { id: string }) => item.id)
    ).toEqual([caseB.conversationId])
    for (const url of readers(caseA, execAId)) {
      const denied = await get(app, url, as('operator.b', 'Operator'))
      expect(denied.statusCode, url).toBe(404)
      expect(denied.json().error).toEqual(NOT_FOUND)
      expect(denied.body).not.toContain('MARKER_CASE_A')
      const unassigned = await get(app, url, as('approver.none', 'Approver'))
      expect(unassigned.statusCode, url).toBe(404)
    }
    const emptyList = await get(
      app,
      '/v1/conversations',
      as('approver.none', 'Approver')
    )
    expect(emptyList.json().data).toEqual({
      items: [],
      pageInfo: { limit: 25, offset: 0, total: 0, hasNextPage: false }
    })

    // A missing object and a missing grant are indistinguishable.
    const missing = await get(
      app,
      '/v1/conversations/conv_00000000-0000-4000-8000-000000000999/timeline',
      as('operator.a', 'Operator')
    )
    expect(missing.statusCode).toBe(404)
    expect(missing.json().error).toEqual(NOT_FOUND)
  })

  it('does not grant through takeover, request headers or payload claims', async () => {
    const app = track(buildServer())
    const seeded = await seedConversation(app, 'MARKER_TAKEOVER')
    await provisionPrincipal(app, {
      operatorId: 'operator.takeover',
      role: 'Operator'
    })
    const takeover = await app.inject({
      method: 'POST',
      url: `/v1/sessions/${seeded.sessionId}/takeover`,
      headers: as('operator.takeover', 'Operator'),
      payload: { event: 'request_handoff' }
    })
    expect(takeover.statusCode).toBe(200)
    const timeline = await get(
      app,
      `/v1/conversations/${seeded.conversationId}/timeline?caseId=x&assigned=true`,
      {
        ...as('operator.takeover', 'Operator'),
        'x-case-id': 'forged',
        'x-operator-assignments': seeded.conversationId
      }
    )
    expect(timeline.statusCode).toBe(404)
    expect(timeline.body).not.toContain('MARKER_TAKEOVER')
  })
})

describe('SPEC0176 AUTH02 — tenant-wide roles, tenants and identity', () => {
  it('lets Supervisor/Admin read the whole active tenant but never another tenant', async () => {
    const app = track(buildServer())
    const seeded = await seedConversation(app, 'MARKER_TENANT_WIDE')
    for (const role of ['Supervisor', 'Admin'] as const) {
      const list = await get(app, '/v1/conversations', as(`${role}.wide`, role))
      expect(list.json().data.pageInfo.total).toBe(1)
      const timeline = await get(
        app,
        `/v1/conversations/${seeded.conversationId}/timeline`,
        as(`${role}.wide`, role)
      )
      expect(timeline.statusCode).toBe(200)
      const otherTenant = await get(
        app,
        `/v1/conversations/${seeded.conversationId}/timeline`,
        as(`${role}.other`, role, OTHER_TENANT)
      )
      expect(otherTenant.statusCode).toBe(404)
      expect(otherTenant.json().error).toEqual(NOT_FOUND)
      const otherList = await get(
        app,
        '/v1/conversations',
        as(`${role}.other`, role, OTHER_TENANT)
      )
      expect(otherList.json().data.pageInfo.total).toBe(0)
    }
    const anonymous = await get(app, '/v1/conversations', {})
    expect(anonymous.statusCode).toBe(401)
    const system = await get(app, '/v1/conversations', {
      'x-operator-id': 'system.worker',
      'x-operator-role': 'System'
    })
    expect(system.statusCode).toBe(401)
  })

  it('fails closed in trusted mode: 503 without principal authority, 401 for a stale principal', async () => {
    const key = 'case-trusted-signing-key-abcdefghijklmnopqrstuvwxyz'
    const sessionStore = createInMemoryOperatorSessionStore()
    const build = (authority?: string) =>
      track(
        buildServer({
          identityMode: 'trusted',
          operatorIdentityResolver: createTrustedOperatorIdentityResolver({
            secret: key
          }),
          operatorSessionStore: sessionStore,
          requireAuthenticatedMutations: false,
          ...(authority
            ? { casePrincipalAuthority: { authorityVersion: authority } }
            : {})
        })
      )
    const login = async (
      app: App,
      operatorId: string,
      role: 'Operator' | 'Supervisor'
    ) => {
      const token = createTrustedOperatorIdentityToken(
        { operatorId, role, tenantId: TENANT },
        key,
        Date.now,
        120
      )
      const response = await app.inject({
        method: 'GET',
        url: '/v1/session',
        headers: { 'x-cvg-operator-token': token }
      })
      expect(response.statusCode).toBe(200)
      return { cookie: String(response.headers['set-cookie']).split(';')[0]! }
    }

    // SPEC 0262 §3: a session is created only for a current principal, so
    // without the producer authority the login itself is a 503 and without a
    // provisioned principal it is a 401.
    const unconfigured = build()
    const token = createTrustedOperatorIdentityToken(
      {
        operatorId: 'supervisor.trusted',
        role: 'Supervisor',
        tenantId: TENANT
      },
      key,
      Date.now,
      120
    )
    const refused = await unconfigured.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { 'x-cvg-operator-token': token }
    })
    expect(refused.statusCode).toBe(503)
    expect(refused.json().error.code).toBe('configuration_error')
    expect(refused.headers['set-cookie']).not.toContain('opsess_')

    const app = build(SYNTHETIC_AUTHORITY_VERSION)
    const seeded = await seedConversation(app, 'MARKER_TRUSTED')
    const missingToken = createTrustedOperatorIdentityToken(
      {
        operatorId: 'supervisor.trusted',
        role: 'Supervisor',
        tenantId: TENANT
      },
      key,
      Date.now,
      120
    )
    const missing = await app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { 'x-cvg-operator-token': missingToken }
    })
    expect(missing.statusCode).toBe(401)
    expect(String(missing.headers['set-cookie'])).not.toContain('opsess_')

    await provisionPrincipal(app, {
      operatorId: 'supervisor.trusted',
      role: 'Supervisor'
    })
    const supervisor = await login(app, 'supervisor.trusted', 'Supervisor')
    const allowed = await get(
      app,
      `/v1/conversations/${seeded.conversationId}/timeline`,
      supervisor
    )
    expect(allowed.statusCode).toBe(200)

    // Downgrade committed before the read: the old Supervisor cookie is 401,
    // never merged or promoted, for reads and for registry writes.
    await provisionPrincipal(app, {
      operatorId: 'supervisor.trusted',
      role: 'Operator',
      expectedRevision: 1
    })
    const downgraded = await get(
      app,
      `/v1/conversations/${seeded.conversationId}/timeline`,
      supervisor
    )
    expect(downgraded.statusCode).toBe(401)
    const write = await app.inject({
      method: 'PUT',
      url: `/v1/cases/00000000-0000-4000-8000-000000000001/assignments/operator.x`,
      headers: supervisor,
      payload: { status: 'ACTIVE', expectedRevision: 0 }
    })
    expect(write.statusCode).toBe(401)

    // Deactivated principal and stale authority version are refused too.
    await provisionPrincipal(app, {
      operatorId: 'supervisor.trusted',
      role: 'Supervisor',
      active: false,
      expectedRevision: 2
    })
    expect((await get(app, '/v1/conversations', supervisor)).statusCode).toBe(
      401
    )
    await provisionPrincipal(app, {
      operatorId: 'supervisor.trusted',
      role: 'Supervisor',
      expectedRevision: 3,
      authorityVersion: 'synthetic-authority-v0'
    })
    expect((await get(app, '/v1/conversations', supervisor)).statusCode).toBe(
      401
    )
  })
})

describe('SPEC0176 AUTH01/AUTH05 — trusted Operator sessions', () => {
  it('scopes a provisioned trusted Operator by grant, revoke and deactivation', async () => {
    const key = 'case-trusted-operator-key-abcdefghijklmnopqrstuvwxyz'
    const app = track(
      buildServer({
        identityMode: 'trusted',
        operatorIdentityResolver: createTrustedOperatorIdentityResolver({
          secret: key
        }),
        operatorSessionStore: createInMemoryOperatorSessionStore(),
        casePrincipalAuthority: {
          authorityVersion: SYNTHETIC_AUTHORITY_VERSION
        }
      })
    )
    const login = async (
      operatorId: string,
      role: 'Operator' | 'Supervisor'
    ) => {
      const token = createTrustedOperatorIdentityToken(
        { operatorId, role, tenantId: TENANT },
        key,
        Date.now,
        120
      )
      const response = await app.inject({
        method: 'GET',
        url: '/v1/session',
        headers: { 'x-cvg-operator-token': token }
      })
      expect(response.statusCode).toBe(200)
      return { cookie: String(response.headers['set-cookie']).split(';')[0]! }
    }
    const seeded = await seedConversation(app, 'MARKER_TRUSTED_OPERATOR')
    await provisionPrincipal(app, {
      operatorId: 'operator.trusted',
      role: 'Operator'
    })
    await provisionPrincipal(app, {
      operatorId: 'supervisor.trusted.manager',
      role: 'Supervisor'
    })
    const operator = await login('operator.trusted', 'Operator')
    const manager = await login('supervisor.trusted.manager', 'Supervisor')
    const timeline = `/v1/conversations/${seeded.conversationId}/timeline`
    const audit = `/v1/audit/sessions/${seeded.sessionId}`

    const list = await get(app, '/v1/conversations', operator)
    expect(list.statusCode).toBe(200)
    expect(list.json().data.items).toEqual([])
    expect((await get(app, timeline, operator)).statusCode).toBe(404)
    expect((await get(app, audit, operator)).statusCode).toBe(404)

    const caseId = await findCaseId(
      app,
      'core_conversation',
      seeded.conversationId,
      manager
    )
    const granted = await putAssignment(
      app,
      caseId,
      'operator.trusted',
      { status: 'ACTIVE', expectedRevision: 0 },
      manager
    )
    expect(granted.statusCode).toBe(200)
    expect(
      (await get(app, '/v1/conversations', operator)).json().data.items
    ).toHaveLength(1)
    const allowed = await get(app, timeline, operator)
    expect(allowed.statusCode).toBe(200)
    expect(allowed.body).toContain('MARKER_TRUSTED_OPERATOR')
    expect((await get(app, audit, operator)).statusCode).toBe(200)

    const revoked = await putAssignment(
      app,
      caseId,
      'operator.trusted',
      { status: 'REVOKED', expectedRevision: 1 },
      manager
    )
    expect(revoked.statusCode).toBe(200)
    expect((await get(app, timeline, operator)).statusCode).toBe(404)
    expect(
      (await get(app, '/v1/conversations', operator)).json().data.items
    ).toEqual([])

    await putAssignment(
      app,
      caseId,
      'operator.trusted',
      { status: 'ACTIVE', expectedRevision: 2 },
      manager
    )
    expect((await get(app, timeline, operator)).statusCode).toBe(200)
    await provisionPrincipal(app, {
      operatorId: 'operator.trusted',
      role: 'Operator',
      active: false,
      expectedRevision: 1
    })
    const inactive = await get(app, timeline, operator)
    expect(inactive.statusCode).toBe(401)
    expect(inactive.body).not.toContain('MARKER_TRUSTED_OPERATOR')
  })
})

describe('SPEC0176 AUTH03/AUTH04 — internal registry and CAS', () => {
  it('lets only Supervisor/Admin discover roots and manage grants, with strict validation', async () => {
    const app = track(buildServer())
    const seeded = await seedConversation(app, 'MARKER_REGISTRY')
    for (const role of ['Operator', 'Approver'] as const) {
      expect((await get(app, '/v1/cases', as('reader', role))).statusCode).toBe(
        403
      )
      expect(
        (await get(app, '/v1/cases/assignments', as('reader', role))).statusCode
      ).toBe(403)
    }
    expect((await get(app, '/v1/cases', {})).statusCode).toBe(401)
    const roots = await get(
      app,
      '/v1/cases?kind=core_conversation',
      managerHeaders()
    )
    expect(roots.statusCode).toBe(200)
    expect(roots.json().data.items).toEqual([
      {
        caseId: expect.any(String),
        kind: 'core_conversation',
        resourceId: seeded.conversationId,
        createdAt: expect.any(String)
      }
    ])
    expect(roots.body).not.toContain('MARKER_REGISTRY')
    for (const query of [
      '?resourceId=conv_x',
      '?kind=unknown',
      '?kind=core_conversation&extra=1',
      '?limit=0'
    ]) {
      expect(
        (await get(app, `/v1/cases${query}`, managerHeaders())).statusCode
      ).toBe(400)
    }
    const caseId = roots.json().data.items[0].caseId as string
    await provisionPrincipal(app, {
      operatorId: 'operator.reg',
      role: 'Operator'
    })
    await provisionPrincipal(app, {
      operatorId: 'supervisor.reg',
      role: 'Supervisor'
    })
    await provisionPrincipal(app, {
      operatorId: 'operator.off',
      role: 'Operator',
      active: false
    })

    const cases: Array<
      [string, unknown, Record<string, string>, number, string]
    > = [
      [
        `/v1/cases/${caseId}/assignments/operator.reg`,
        { status: 'ACTIVE', expectedRevision: 0, tenantId: OTHER_TENANT },
        managerHeaders(),
        400,
        'validation_failed'
      ],
      [
        `/v1/cases/${caseId}/assignments/operator.reg`,
        { status: 'ACTIVE' },
        managerHeaders(),
        400,
        'validation_failed'
      ],
      [
        `/v1/cases/not-a-uuid/assignments/operator.reg`,
        { status: 'ACTIVE', expectedRevision: 0 },
        managerHeaders(),
        400,
        'validation_failed'
      ],
      [
        `/v1/cases/00000000-0000-4000-8000-000000000000/assignments/operator.reg`,
        { status: 'ACTIVE', expectedRevision: 0 },
        managerHeaders(),
        404,
        'not_found'
      ],
      [
        `/v1/cases/${caseId}/assignments/operator.ghost`,
        { status: 'ACTIVE', expectedRevision: 0 },
        managerHeaders(),
        409,
        'assignment_target_unavailable'
      ],
      [
        `/v1/cases/${caseId}/assignments/supervisor.reg`,
        { status: 'ACTIVE', expectedRevision: 0 },
        managerHeaders(),
        409,
        'assignment_target_unavailable'
      ],
      [
        `/v1/cases/${caseId}/assignments/operator.off`,
        { status: 'ACTIVE', expectedRevision: 0 },
        managerHeaders(),
        409,
        'assignment_target_unavailable'
      ],
      [
        `/v1/cases/${caseId}/assignments/operator.reg`,
        { status: 'REVOKED', expectedRevision: 0 },
        managerHeaders(),
        409,
        'assignment_conflict'
      ],
      [
        `/v1/cases/${caseId}/assignments/operator.reg`,
        { status: 'ACTIVE', expectedRevision: 0 },
        as('operator.reg', 'Operator'),
        403,
        'forbidden'
      ],
      [
        `/v1/cases/${caseId}/assignments/operator.reg`,
        { status: 'ACTIVE', expectedRevision: 0 },
        as('approver.reg', 'Approver'),
        403,
        'forbidden'
      ],
      [
        `/v1/cases/${caseId}/assignments/operator.reg`,
        { status: 'ACTIVE', expectedRevision: 0 },
        {},
        401,
        'unauthorized'
      ],
      [
        `/v1/cases/${caseId}/assignments/operator.reg`,
        { status: 'ACTIVE', expectedRevision: 0 },
        managerHeaders('supervisor.other', OTHER_TENANT),
        404,
        'not_found'
      ]
    ]
    for (const [url, payload, headers, status, code] of cases) {
      const response = await app.inject({
        method: 'PUT',
        url,
        headers,
        payload: payload as Record<string, unknown>
      })
      expect(response.statusCode, `${url} ${JSON.stringify(payload)}`).toBe(
        status
      )
      expect(response.json().error.code).toBe(code)
    }
    const listed = await get(app, '/v1/cases/assignments', managerHeaders())
    expect(listed.json().data.items).toEqual([])

    // Origin enforcement stays in force for the registry write.
    const crossOrigin = await app.inject({
      method: 'PUT',
      url: `/v1/cases/${caseId}/assignments/operator.reg`,
      headers: { ...managerHeaders(), origin: 'https://attacker.example' },
      payload: { status: 'ACTIVE', expectedRevision: 0 }
    })
    expect(crossOrigin.statusCode).toBe(403)
  })

  it('applies CAS grant/revoke with one audited revision per effective write', async () => {
    const app = track(buildServer())
    const seeded = await seedConversation(app, 'MARKER_CAS')
    await provisionPrincipal(app, {
      operatorId: 'operator.cas',
      role: 'Operator'
    })
    const caseId = await findCaseId(
      app,
      'core_conversation',
      seeded.conversationId
    )
    const concurrent = await Promise.all([
      putAssignment(app, caseId, 'operator.cas', {
        status: 'ACTIVE',
        expectedRevision: 0
      }),
      putAssignment(app, caseId, 'operator.cas', {
        status: 'ACTIVE',
        expectedRevision: 0
      })
    ])
    expect(concurrent.map((response) => response.statusCode).sort()).toEqual([
      200, 409
    ])
    const noop = await putAssignment(app, caseId, 'operator.cas', {
      status: 'ACTIVE',
      expectedRevision: 1
    })
    expect(noop.json().data).toMatchObject({
      changed: false,
      assignment: { revision: 1, status: 'ACTIVE', scope: 'read_case' }
    })
    const stale = await putAssignment(app, caseId, 'operator.cas', {
      status: 'REVOKED',
      expectedRevision: 0
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('assignment_conflict')
    const timeline = `/v1/conversations/${seeded.conversationId}/timeline`
    expect(
      (await get(app, timeline, as('operator.cas', 'Operator'))).statusCode
    ).toBe(200)

    // Target deactivated: revoke is still allowed; reactivation does not
    // restore the REVOKED grant.
    await provisionPrincipal(app, {
      operatorId: 'operator.cas',
      role: 'Operator',
      active: false,
      expectedRevision: 1
    })
    const revoked = await putAssignment(app, caseId, 'operator.cas', {
      status: 'REVOKED',
      expectedRevision: 1
    })
    expect(revoked.json().data).toMatchObject({
      changed: true,
      assignment: {
        revision: 2,
        status: 'REVOKED',
        changedBy: 'supervisor.case-manager'
      }
    })
    await provisionPrincipal(app, {
      operatorId: 'operator.cas',
      role: 'Operator',
      expectedRevision: 2
    })
    expect(
      (await get(app, timeline, as('operator.cas', 'Operator'))).statusCode
    ).toBe(404)
    const regrant = await putAssignment(app, caseId, 'operator.cas', {
      status: 'ACTIVE',
      expectedRevision: 2
    })
    expect(regrant.json().data.assignment.revision).toBe(3)
    expect(
      (await get(app, timeline, as('operator.cas', 'Operator'))).statusCode
    ).toBe(200)

    const evidence = await get(
      app,
      '/v1/observability/audit-evidence?type=policy_decision&limit=100',
      managerHeaders()
    )
    const changes = (
      evidence.json().data.page.items as Array<{
        payload: Record<string, unknown>
      }>
    ).filter((item) => item.payload.event === 'case_assignment_changed')
    expect(
      changes.map((item) => [item.payload.revision, item.payload.status])
    ).toEqual(
      expect.arrayContaining([
        [1, 'ACTIVE'],
        [2, 'REVOKED'],
        [3, 'ACTIVE']
      ])
    )
    expect(changes).toHaveLength(3)
    expect(JSON.stringify(changes)).not.toContain('MARKER_CAS')

    const assignments = await get(
      app,
      `/v1/cases/assignments?kind=core_conversation&resourceId=${seeded.conversationId}`,
      managerHeaders()
    )
    expect(assignments.json().data.items).toEqual([
      {
        caseId,
        kind: 'core_conversation',
        resourceId: seeded.conversationId,
        operatorId: 'operator.cas',
        scope: 'read_case',
        status: 'ACTIVE',
        revision: 3,
        changedBy: 'supervisor.case-manager',
        changedAt: expect.any(String)
      }
    ])
  })
})

describe('SPEC0176 AUTH05 — revocation ordering in the read unit', () => {
  it('serves a read that started before the revoke and refuses every later read', async () => {
    const store = createInMemoryOperationalExecutionStore()
    let release: () => void = () => undefined
    let entered: () => void = () => undefined
    const insideRead = new Promise<void>((resolve) => {
      entered = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let blockNextGet = false
    const blockingGet = async (tenantId: string, executionId: string) => {
      if (blockNextGet) {
        blockNextGet = false
        entered()
        await gate
      }
      return store.get(tenantId, executionId)
    }
    const blockingStore = new Proxy(store, {
      get(target, property) {
        if (property === 'get') return blockingGet
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      }
    })
    const app = track(
      buildServer({
        operationalExecution: blockingStore,
        requireAuthenticatedMutations: true
      })
    )
    const accepted = await submit(
      app,
      as('supervisor.rev', 'Supervisor'),
      'conversation_absent',
      'session_absent'
    )
    const executionId = accepted.json().data.execution.id as string
    const caseId = await grantCase(app, {
      kind: 'independent_execution',
      resourceId: executionId,
      operatorId: 'operator.rev'
    })
    blockNextGet = true
    const inflight = get(
      app,
      `/v1/executions/${executionId}`,
      as('operator.rev', 'Operator')
    )
    await insideRead
    const revoke = putAssignment(app, caseId, 'operator.rev', {
      status: 'REVOKED',
      expectedRevision: 1
    })
    release()
    const [served, revoked] = await Promise.all([inflight, revoke])
    expect(served.statusCode).toBe(200)
    expect(served.json().data).toMatchObject({
      viewVersion: 2,
      id: executionId
    })
    expect(revoked.statusCode).toBe(200)
    const after = await get(
      app,
      `/v1/executions/${executionId}`,
      as('operator.rev', 'Operator')
    )
    expect(after.statusCode).toBe(404)
  })
})

describe('SPEC0176 AUTH06/AUTH09 — execution lineage and projections', () => {
  it('links validated core pairs, refuses forged pairs and never inherits from declared ids', async () => {
    const app = track(buildServer({ requireAuthenticatedMutations: true }))
    const caseA = await seedConversation(app, 'MARKER_EXEC_A')
    const caseB = await seedConversation(app, 'MARKER_EXEC_B')
    await grantCase(app, {
      kind: 'core_conversation',
      resourceId: caseA.conversationId,
      operatorId: 'operator.exec'
    })
    const supervisor = as('supervisor.exec', 'Supervisor')
    const forged = await submit(
      app,
      supervisor,
      caseA.conversationId,
      caseB.sessionId
    )
    expect(forged.statusCode).toBe(400)
    const half = await submit(
      app,
      supervisor,
      caseA.conversationId,
      'session_absent'
    )
    expect(half.statusCode).toBe(400)
    const halfSession = await submit(
      app,
      supervisor,
      'conversation_absent',
      caseA.sessionId
    )
    expect(halfSession.statusCode).toBe(400)

    // The Operator can submit only into a case they can read.
    const intoB = await submit(
      app,
      as('operator.exec', 'Operator'),
      caseB.conversationId,
      caseB.sessionId
    )
    expect(intoB.statusCode).toBe(404)
    const intoA = await submit(
      app,
      as('operator.exec', 'Operator'),
      caseA.conversationId,
      caseA.sessionId,
      'exec-into-a'
    )
    expect(intoA.statusCode).toBe(202)
    expect(intoA.json().data.execution).toEqual({
      viewVersion: 2,
      id: expect.any(String),
      state: 'QUEUED',
      attempt: 0,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      completedAt: null,
      response: null,
      errorSummary: null
    })
    const duplicate = await submit(
      app,
      as('operator.exec', 'Operator'),
      caseA.conversationId,
      caseA.sessionId,
      'exec-into-a'
    )
    expect(duplicate.json().data).toMatchObject({
      created: false,
      execution: { id: intoA.json().data.execution.id }
    })

    // Independent: no self-grant for the creator, own root for the manager.
    const independent = await submit(
      app,
      as('operator.exec', 'Operator'),
      'conversation_declared_only',
      'session_declared_only'
    )
    expect(independent.statusCode).toBe(202)
    const independentId = independent.json().data.execution.id as string
    expect(independent.json().data.execution).toEqual({
      id: independentId,
      state: 'QUEUED'
    })
    expect(
      (
        await get(
          app,
          `/v1/executions/${independentId}`,
          as('operator.exec', 'Operator')
        )
      ).statusCode
    ).toBe(404)
    await grantCase(app, {
      kind: 'independent_execution',
      resourceId: independentId,
      operatorId: 'operator.exec',
      provision: false
    })
    expect(
      (
        await get(
          app,
          `/v1/executions/${independentId}`,
          as('operator.exec', 'Operator')
        )
      ).statusCode
    ).toBe(200)
    // The independent root never exposes the conversation it merely declared.
    const roots = await get(
      app,
      '/v1/cases?kind=independent_execution',
      managerHeaders()
    )
    expect(roots.json().data.items).toEqual([
      expect.objectContaining({ resourceId: independentId })
    ])
  })

  it('returns the DTO v2 or the ack on input, cancel and approval decision by read authority', async () => {
    const store = createInMemoryOperationalExecutionStore({ clock: () => now })
    const app = track(buildServer({ operationalExecution: store }))
    const waiting = async (key: string, stopReason: 'NEEDS_USER_INPUT') => {
      const submitted = await store.submit({
        tenantId: TENANT,
        idempotencyKey: key,
        runtime: runtime('conversation_absent', 'session_absent')
      })
      const claim = await store.claimNext(TENANT, 'worker.case', now)
      await store.transition(
        {
          tenantId: TENANT,
          executionId: submitted.record.id,
          to: 'RUNNING',
          workerId: 'worker.case',
          fenceToken: claim!.record.attempt
        },
        now
      )
      return store.transition(
        {
          tenantId: TENANT,
          executionId: submitted.record.id,
          to: 'WAITING_USER',
          workerId: 'worker.case',
          fenceToken: claim!.record.attempt,
          result: {
            response: 'CANARY_PROMPT_INTENT',
            stopReason,
            steps: 1,
            modelCalls: 0,
            toolCalls: 0,
            usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
          }
        },
        now
      )
    }
    const first = await waiting('case-input-1', 'NEEDS_USER_INPUT')
    const second = await waiting('case-input-2', 'NEEDS_USER_INPUT')
    const operatorInput = await app.inject({
      method: 'POST',
      url: `/v1/executions/${first.id}/input`,
      headers: as('operator.mut', 'Operator'),
      payload: { message: 'CANARY_RESUME_INPUT' }
    })
    expect(operatorInput.statusCode).toBe(202)
    expect(operatorInput.json().data.execution).toEqual({
      id: first.id,
      state: 'QUEUED'
    })
    expect(operatorInput.body).not.toContain('CANARY')

    const supervisorCancel = await app.inject({
      method: 'POST',
      url: `/v1/executions/${second.id}/cancel`,
      headers: {
        ...as('supervisor.mut', 'Supervisor'),
        'idempotency-key': 'case-cancel-second'
      },
      payload: { reason: 'CANARY_CANCEL_REASON' }
    })
    expect(supervisorCancel.statusCode).toBe(200)
    expect(supervisorCancel.json().data.execution).toMatchObject({
      viewVersion: 2,
      state: 'CANCELLED',
      response: null,
      errorSummary: {
        code: 'execution_cancelled',
        message: 'Execução cancelada.'
      }
    })
    expect(supervisorCancel.body).not.toContain('CANARY')

    const operatorCancel = await app.inject({
      method: 'POST',
      url: `/v1/executions/${first.id}/cancel`,
      headers: {
        ...as('operator.mut', 'Operator'),
        'idempotency-key': 'case-cancel-first'
      },
      payload: {}
    })
    expect(operatorCancel.json().data.execution).toEqual({
      id: first.id,
      state: 'CANCELLED'
    })

    // A read grant never grants a mutation permission.
    const decision = await app.inject({
      method: 'POST',
      url: `/v1/executions/${first.id}/approvals/approval_x/decision`,
      headers: as('operator.mut', 'Operator'),
      payload: { decision: 'APPROVED' }
    })
    expect(decision.statusCode).toBe(403)
  })
})

describe('SPEC0176 AUTH07/AUTH08 — audit lineage and projections', () => {
  it('shows only producer-linked events, limited or full by permission', async () => {
    const app = track(buildServer())
    const seeded = await seedConversation(app, 'MARKER_AUDIT')
    // An event that merely claims the session in its payload (task producer
    // is not session-linked) never appears in the session reader.
    const task = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: {
        sessionId: seeded.sessionId,
        title: 'Synthetic',
        description: 'Synthetic',
        priority: 'medium',
        source: 'case-test',
        idempotencyKey: `case-task-${Math.random()}`
      }
    })
    expect(task.statusCode).toBe(200)
    await grantCase(app, {
      kind: 'core_conversation',
      resourceId: seeded.conversationId,
      operatorId: 'operator.audit'
    })
    const limited = await get(
      app,
      `/v1/audit/sessions/${seeded.sessionId}`,
      as('operator.audit', 'Operator')
    )
    expect(limited.statusCode).toBe(200)
    const limitedEvents = limited.json().data.events as Array<
      Record<string, unknown>
    >
    expect(limitedEvents.length).toBeGreaterThan(0)
    for (const event of limitedEvents) {
      expect(Object.keys(event).sort()).toEqual(
        ['actorType', 'createdAt', 'id', 'policyVersion', 'type'].sort()
      )
    }
    const full = await get(
      app,
      `/v1/audit/sessions/${seeded.sessionId}`,
      as('supervisor.audit', 'Supervisor')
    )
    const fullEvents = full.json().data.events as Array<Record<string, unknown>>
    expect(fullEvents).toHaveLength(limitedEvents.length)
    expect(fullEvents[0]).toMatchObject({
      actorId: 'api',
      correlationId: expect.any(String),
      payload: expect.objectContaining({ sessionId: seeded.sessionId })
    })
    const hasTask = (event: Record<string, unknown>) =>
      typeof event.payload === 'object' &&
      event.payload !== null &&
      'taskId' in event.payload
    expect(fullEvents.some(hasTask)).toBe(false)
    const evidence = await get(
      app,
      `/v1/observability/audit-evidence?sessionId=${seeded.sessionId}`,
      as('supervisor.audit', 'Supervisor')
    )
    expect(
      (evidence.json().data.page.items as Array<Record<string, unknown>>).some(
        hasTask
      )
    ).toBe(true)

    // An existing, authorized session without linked events is an empty
    // collection, not a 404.
    const bare = (
      app as unknown as {
        persistence: {
          conversations: {
            createWithSession: (input: Record<string, unknown>) => {
              session: { id: string }
            }
          }
        }
      }
    ).persistence.conversations.createWithSession({
      tenantId: TENANT,
      channel: 'web',
      senderRef: 'synthetic-bare',
      externalMessageId: `bare-${Math.random()}`,
      body: 'Synthetic bare'
    })
    const empty = await get(
      app,
      `/v1/audit/sessions/${bare.session.id}`,
      as('supervisor.audit', 'Supervisor')
    )
    expect(empty.statusCode).toBe(200)
    expect(empty.json().data.events).toEqual([])

    // The harness namespace is fixed by the route; memory has no harness rows.
    const harness = await get(
      app,
      `/v1/cases/harness/conversations/${seeded.conversationId}/sessions/${seeded.sessionId}/audit`,
      as('supervisor.audit', 'Supervisor')
    )
    expect(harness.statusCode).toBe(404)
  })

  it('projects list and timeline through the allowlist only', async () => {
    const app = track(buildServer())
    const seeded = await seedConversation(app, 'MARKER_DTO')
    const list = await get(
      app,
      '/v1/conversations',
      as('supervisor.dto', 'Supervisor')
    )
    expect(Object.keys(list.json().data.items[0]).sort()).toEqual(
      [
        'channel',
        'createdAt',
        'id',
        'lastMessageAt',
        'lastMessageBody',
        'openSessionId',
        'senderRef',
        'status',
        'updatedAt'
      ].sort()
    )
    const timeline = await get(
      app,
      `/v1/conversations/${seeded.conversationId}/timeline`,
      as('supervisor.dto', 'Supervisor')
    )
    expect(Object.keys(timeline.json().data.messages[0]).sort()).toEqual(
      [
        'body',
        'conversationId',
        'createdAt',
        'direction',
        'id',
        'runtimeStatus'
      ].sort()
    )
    expect(Object.keys(timeline.json().data.sessions[0]).sort()).toEqual(
      [
        'conversationId',
        'createdAt',
        'id',
        'status',
        'takeoverState',
        'updatedAt'
      ].sort()
    )
  })
})

describe('SPEC0176 AUTH10 — pagination filters before page and total', () => {
  it('pages only visible roots with a stable order and exact total', async () => {
    const app = track(buildServer())
    const seeded: Array<{ conversationId: string; sessionId: string }> = []
    for (let index = 0; index < 5; index += 1) {
      seeded.push(await seedConversation(app, `MARKER_PAGE_${index}`))
    }
    await grantCase(app, {
      kind: 'core_conversation',
      resourceId: seeded[1]!.conversationId,
      operatorId: 'operator.page'
    })
    await grantCase(app, {
      kind: 'core_conversation',
      resourceId: seeded[3]!.conversationId,
      operatorId: 'operator.page',
      provision: false
    })
    const pages = []
    for (const offset of [0, 1, 2]) {
      const response = await get(
        app,
        `/v1/conversations?limit=1&offset=${offset}`,
        as('operator.page', 'Operator')
      )
      pages.push(response.json().data)
    }
    expect(pages.map((page) => page.pageInfo)).toEqual([
      { limit: 1, offset: 0, total: 2, hasNextPage: true },
      { limit: 1, offset: 1, total: 2, hasNextPage: false },
      { limit: 1, offset: 2, total: 2, hasNextPage: false }
    ])
    expect(
      pages.flatMap((page) => page.items.map((item: { id: string }) => item.id))
    ).toEqual([seeded[3]!.conversationId, seeded[1]!.conversationId])
    const timeline = await get(
      app,
      `/v1/conversations/${seeded[1]!.conversationId}/timeline`,
      as('operator.page', 'Operator')
    )
    expect(
      timeline
        .json()
        .data.messages.every(
          (message: { conversationId: string }) =>
            message.conversationId === seeded[1]!.conversationId
        )
    ).toBe(true)
    expect(timeline.body).not.toContain('MARKER_PAGE_0')
  })

  it('keeps execution records read through the store unchanged in shape', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const app = track(buildServer({ operationalExecution: store }))
    const accepted = await submit(
      app,
      as('supervisor.shape', 'Supervisor'),
      'conversation_absent',
      'session_absent'
    )
    const record = (await store.get(
      TENANT,
      accepted.json().data.execution.id
    )) as ExecutionRecord
    expect(record.request.runtime.conversationId).toBe('conversation_absent')
  })
})
