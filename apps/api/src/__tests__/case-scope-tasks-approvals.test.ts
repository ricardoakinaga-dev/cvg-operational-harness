/**
 * SPEC0251 — case scope of tasks and approvals on the synthetic in-memory
 * authority: S1 (lists), S3 (the six mutations), S4 (runtime approval), S6
 * (revocation, principal currency, trusted fail-closed, outage) and S7 (error
 * mapping and `cache-control: no-store`). PostgreSQL parity, the legacy
 * schemas and the snapshot lookup without RLS are proven in
 * `case-scope-tasks-approvals-postgres.test.ts`.
 *
 * Fixtures are synthetic: tenant A with OperatorA (grant on case X),
 * OperatorB (grant on case Y), ApproverA (grant on X), ApproverB (no grant),
 * Supervisor and Admin; an adversarial tenant B; one conversation session of
 * tenant A without a case root.
 */
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ApprovalEngine as DurableApprovalEngine,
  type ApprovalAuthority
} from '@cvg/approval-engine'
import {
  createInMemoryOperationalExecutionStore,
  type OperationalExecutionStore
} from '@cvg/harness'
import type { RuntimeInput } from '@cvg/harness-contracts'
import {
  ApprovalRepository,
  PostgresCaseAuthority,
  TaskRepository,
  type InMemoryDatabase
} from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import { DomainError } from '@cvg/shared'
import { buildServer, type RuntimeLogEntry } from '../server.ts'
import {
  createTrustedOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '../operator-identity.ts'
import { createInMemoryOperatorSessionStore } from '../operator-session.ts'
import {
  CONTROLLED_TEST_TENANT,
  grantCase,
  provisionPrincipal,
  putAssignment
} from './case-authorization-fixtures.ts'

const TENANT = CONTROLLED_TEST_TENANT
const OTHER_TENANT = 'tenant_00000000-0000-4000-8000-000000000251' as TenantId
const NOT_FOUND = { code: 'not_found', message: 'Resource not found' }
const now = new Date('2026-10-21T12:00:00.000Z')

type App = ReturnType<typeof buildServer>
type Role = 'Operator' | 'Approver' | 'Supervisor' | 'Admin'
type Response = Awaited<ReturnType<App['inject']>>

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
  role: Role,
  tenantId: string = TENANT
): Record<string, string> {
  return {
    'x-operator-id': operatorId,
    'x-operator-role': role,
    'x-tenant-id': tenantId
  }
}

const OPERATOR_A = as('operator.a', 'Operator')
const OPERATOR_B = as('operator.b', 'Operator')
const APPROVER_A = as('approver.a', 'Approver')
const APPROVER_B = as('approver.b', 'Approver')
const SUPERVISOR = as('supervisor.scope', 'Supervisor')
const ADMIN = as('admin.scope', 'Admin')

async function seedConversation(
  app: App,
  marker: string,
  tenantId: string = TENANT
) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    headers: { 'x-tenant-id': tenantId },
    payload: {
      externalMessageId: `spec0251-${marker}-${randomUUID()}`,
      senderRef: `+55119${Math.floor(Math.random() * 10_000_000)}`,
      body: `Synthetic ${marker}`,
      receivedAt: now.toISOString()
    }
  })
  expect(response.statusCode).toBe(200)
  return response.json().data as { conversationId: string; sessionId: string }
}

function memory(app: App): InMemoryDatabase {
  const db = app.persistence.memoryDb
  if (!db) throw new Error('memory persistence expected')
  return db
}

/** A conversation and session persisted without a case root (legacy). */
function seedRootlessSession(app: App, tenantId: TenantId = TENANT) {
  const db = memory(app)
  const suffix = randomUUID()
  const conversationId = `conv_rootless_${suffix}`
  const sessionId = `sess_rootless_${suffix}`
  db.state.conversations = [
    ...db.state.conversations,
    {
      tenantId,
      id: conversationId,
      channel: 'web',
      senderRef: 'synthetic-rootless',
      senderRefHash: 'f'.repeat(64),
      status: 'active',
      correlationId: `corr_${suffix}`,
      createdAt: now,
      updatedAt: now
    }
  ]
  db.state.sessions = [
    ...db.state.sessions,
    {
      id: sessionId,
      conversationId,
      status: 'open',
      takeoverState: 'BOT_ACTIVE',
      createdAt: now,
      updatedAt: now
    }
  ]
  return { conversationId, sessionId }
}

function seedTask(app: App, sessionId: string, tenantId: TenantId = TENANT) {
  const label = randomUUID()
  return new TaskRepository(memory(app)).create(
    {
      sessionId,
      title: `Synthetic task ${label}`,
      description: 'Synthetic SPEC0251 task',
      priority: 'medium',
      source: 'spec0251-seed',
      idempotencyKey: `spec0251-${label}`
    },
    tenantId
  )
}

function seedApproval(
  app: App,
  sessionId: string,
  tenantId: TenantId = TENANT
) {
  return new ApprovalRepository(memory(app)).save(
    {
      id: `approval_${randomUUID()}`,
      sessionId,
      proposedAction: 'synthetic_review',
      summary: 'Synthetic SPEC0251 approval',
      riskLevel: 'low',
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
      createdAt: new Date()
    },
    tenantId
  )
}

/** Everything a mutation could change: tasks, approvals and audit events. */
function persisted(app: App) {
  const db = memory(app)
  return JSON.stringify({
    tasks: db.state.tasks,
    approvals: db.state.approvals,
    audit: db.state.auditEvents.length
  })
}

function withoutCorrelation(response: Response) {
  const body = response.json() as { meta?: Record<string, unknown> }
  const meta = Object.fromEntries(
    Object.entries(body.meta ?? {}).filter(([key]) => key !== 'correlationId')
  )
  return { ...body, meta }
}

interface World {
  app: App
  x: { conversationId: string; sessionId: string }
  y: { conversationId: string; sessionId: string }
  b: { conversationId: string; sessionId: string }
  rootless: { conversationId: string; sessionId: string }
  caseX: string
  caseY: string
}

async function world(
  options: Parameters<typeof buildServer>[0] = {}
): Promise<World> {
  const app = track(
    buildServer({ requireAuthenticatedMutations: true, ...options })
  )
  const x = await seedConversation(app, 'CASE_X')
  const y = await seedConversation(app, 'CASE_Y')
  const b = await seedConversation(app, 'CASE_B', OTHER_TENANT)
  const rootless = seedRootlessSession(app)
  const caseX = await grantCase(app, {
    kind: 'core_conversation',
    resourceId: x.conversationId,
    operatorId: 'operator.a'
  })
  const caseY = await grantCase(app, {
    kind: 'core_conversation',
    resourceId: y.conversationId,
    operatorId: 'operator.b'
  })
  await grantCase(app, {
    kind: 'core_conversation',
    resourceId: x.conversationId,
    operatorId: 'approver.a',
    role: 'Approver'
  })
  await provisionPrincipal(app, { operatorId: 'approver.b', role: 'Approver' })
  return { app, x, y, b, rootless, caseX, caseY }
}

function taskPayload(sessionId: string, key = randomUUID()) {
  return {
    sessionId,
    title: 'Synthetic SPEC0251 route task',
    description: 'Synthetic only, no external effect',
    priority: 'medium',
    source: 'spec0251-route',
    idempotencyKey: `spec0251-task-${key}`
  }
}

function journeyPayload(sessionId: string, key = randomUUID()) {
  return {
    sessionId,
    title: 'Synthetic SPEC0251 journey task',
    description: 'Synthetic only, no external effect',
    priority: 'medium',
    idempotencyKey: `spec0251-journey-${key}`
  }
}

function approvalPayload(sessionId: string) {
  return {
    sessionId,
    proposedAction: 'synthetic_review',
    summary: 'Synthetic SPEC0251 approval request',
    riskLevel: 'low'
  }
}

function patchTask(
  app: App,
  taskId: string,
  headers: Record<string, string>,
  status = 'in_progress'
) {
  return app.inject({
    method: 'PATCH',
    url: `/v1/tasks/${taskId}/status`,
    headers,
    payload: { status }
  })
}

function post(
  app: App,
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>
) {
  // SPEC 0257: the approval creation route requires one Idempotency-Key.
  const withKey =
    url === '/v1/approvals'
      ? {
          ...headers,
          'idempotency-key': `approval-key-${Date.now()}-${Math.random().toString(36).slice(2)}`
        }
      : headers
  return app.inject({ method: 'POST', url, headers: withKey, payload })
}

function runtime(conversationId: string, sessionId: string): RuntimeInput {
  return {
    agent: {
      id: 'agent.case.scope' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'synthetic SPEC0251 runtime approval',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: TENANT as RuntimeInput['tenantId'],
    conversationId: conversationId as RuntimeInput['conversationId'],
    sessionId: sessionId as RuntimeInput['sessionId'],
    correlationId: 'correlation_case_scope' as RuntimeInput['correlationId'],
    traceId: 'trace_case_scope' as RuntimeInput['traceId'],
    userMessage: 'synthetic case scope message',
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

interface WaitingExecution {
  executionId: string
  approvalId: string
}

/**
 * Execution in WAITING_APPROVAL created directly in the store (no case
 * link). Callers link it explicitly when the scenario needs a case.
 */
async function waitingExecution(
  store: OperationalExecutionStore,
  authority: ApprovalAuthority,
  conversationId: string,
  sessionId: string,
  requesterId = 'agent.case.scope'
): Promise<WaitingExecution> {
  const input = runtime(conversationId, sessionId)
  const accepted = await store.submit({
    tenantId: TENANT,
    idempotencyKey: `spec0251-exec-${randomUUID()}`,
    runtime: input
  })
  const claimed = await store.claimNext(TENANT, 'worker-spec0251')
  expect(claimed?.record.id).toBe(accepted.record.id)
  const running = await store.transition({
    tenantId: TENANT,
    executionId: accepted.record.id,
    to: 'RUNNING',
    workerId: 'worker-spec0251',
    fenceToken: claimed!.record.attempt
  })
  const requested = await authority.request({
    tenantId: TENANT,
    operatorId: requesterId,
    agentId: input.agent.id,
    agentVersion: input.agent.version,
    action: 'tool.execute',
    resource: { type: 'tool', id: 'synthetic.case.scope.tool' },
    payload: { synthetic: true },
    policyVersion: 'policy-approval-v1',
    correlationId: input.correlationId,
    operationKey: `operation.spec0251.${randomUUID()}`,
    executionRef: accepted.record.id,
    singleUse: true,
    reason: 'synthetic SPEC0251 approval',
    proposalPayload: { synthetic: true }
  })
  await store.transition({
    tenantId: TENANT,
    executionId: accepted.record.id,
    to: 'WAITING_APPROVAL',
    workerId: 'worker-spec0251',
    fenceToken: running.attempt,
    approvalId: requested.approvalId,
    reason: 'synthetic approval required'
  })
  return { executionId: accepted.record.id, approvalId: requested.approvalId }
}

function decideRuntime(
  app: App,
  execution: WaitingExecution,
  headers: Record<string, string>,
  decision: 'approved' | 'rejected' = 'approved'
) {
  return app.inject({
    method: 'POST',
    url: `/v1/executions/${execution.executionId}/approvals/${execution.approvalId}/decision`,
    headers: {
      ...headers,
      'idempotency-key': `spec0251-cmd-${randomUUID()}`
    },
    payload: { decision }
  })
}

async function readList(
  app: App,
  url: string,
  headers: Record<string, string>
) {
  const response = await app.inject({ method: 'GET', url, headers })
  expect(response.statusCode, url).toBe(200)
  const body = response.json() as {
    data: Array<{ id: string }>
    meta: { pageInfo: Record<string, unknown> }
  }
  return {
    ids: body.data.map((item) => item.id),
    pageInfo: body.meta.pageInfo,
    raw: response.body,
    cacheControl: response.headers['cache-control']
  }
}

describe('SPEC0251 S1 — case-scoped task and approval lists (memory)', () => {
  it('filters before COUNT/offset/limit for Operator/Approver and keeps the tenant for Supervisor/Admin', async () => {
    const w = await world()
    type Bucket = 'x' | 'y' | 'rootless' | 'b'
    const seeded = {
      tasks: { x: [], y: [], rootless: [], b: [] } as Record<Bucket, string[]>,
      approvals: { x: [], y: [], rootless: [], b: [] } as Record<
        Bucket,
        string[]
      >
    }
    const plan: Array<[Bucket, string, TenantId, number]> = [
      ['x', w.x.sessionId, TENANT, 30],
      ['y', w.y.sessionId, TENANT, 30],
      ['rootless', w.rootless.sessionId, TENANT, 5],
      ['b', w.b.sessionId, OTHER_TENANT, 3]
    ]
    // Interleaved creation order: X, Y, rootless and tenant B alternate.
    for (let index = 0; index < 30; index += 1) {
      for (const [bucket, sessionId, tenantId, size] of plan) {
        if (index >= size) continue
        seeded.tasks[bucket].push(seedTask(w.app, sessionId, tenantId).id)
        seeded.approvals[bucket].push(
          seedApproval(w.app, sessionId, tenantId).id
        )
      }
    }
    // A third of the X items change status, for the status filter.
    const movedTasks = new Set(seeded.tasks.x.filter((_, i) => i % 3 === 0))
    const movedApprovals = new Set(
      seeded.approvals.x.filter((_, i) => i % 3 === 0)
    )
    const db = memory(w.app)
    db.state.tasks = db.state.tasks.map((task) =>
      movedTasks.has(task.id) ? { ...task, status: 'in_progress' } : task
    )
    db.state.approvals = db.state.approvals.map((approval) =>
      movedApprovals.has(approval.id)
        ? {
            ...approval,
            status: 'approved',
            decidedBy: 'supervisor.seed',
            decidedAt: now
          }
        : approval
    )

    const resources = [
      {
        path: '/v1/tasks',
        ids: seeded.tasks,
        filter: 'in_progress',
        moved: movedTasks
      },
      {
        path: '/v1/approvals',
        ids: seeded.approvals,
        filter: 'approved',
        moved: movedApprovals
      }
    ]
    for (const resource of resources) {
      const tenantWide = new Set([
        ...resource.ids.x,
        ...resource.ids.y,
        ...resource.ids.rootless
      ])
      for (const headers of [OPERATOR_A, APPROVER_A]) {
        for (let offset = 0; offset < 35; offset += 7) {
          const page = await readList(
            w.app,
            `${resource.path}?limit=7&offset=${offset}`,
            headers
          )
          expect(page.pageInfo).toEqual({
            limit: 7,
            offset,
            total: 30,
            hasNextPage: offset + 7 < 30
          })
          expect(page.ids).toEqual(resource.ids.x.slice(offset, offset + 7))
          expect(page.cacheControl).toBe('no-store')
        }
        const byStatus = await readList(
          w.app,
          `${resource.path}?status=${resource.filter}&limit=100`,
          headers
        )
        expect(byStatus.pageInfo.total).toBe(10)
        expect(byStatus.ids).toEqual(
          resource.ids.x.filter((id) => resource.moved.has(id))
        )
      }
      const operatorB = await readList(
        w.app,
        `${resource.path}?limit=100`,
        OPERATOR_B
      )
      expect(operatorB.pageInfo.total).toBe(30)
      expect(operatorB.ids).toEqual(resource.ids.y)
      const approverB = await readList(
        w.app,
        `${resource.path}?limit=7`,
        APPROVER_B
      )
      expect(approverB.pageInfo).toEqual({
        limit: 7,
        offset: 0,
        total: 0,
        hasNextPage: false
      })
      expect(approverB.ids).toEqual([])
      expect(approverB.cacheControl).toBe('no-store')
      for (const headers of [SUPERVISOR, ADMIN]) {
        const page = await readList(
          w.app,
          `${resource.path}?limit=100`,
          headers
        )
        expect(page.pageInfo.total).toBe(65)
        expect(new Set(page.ids)).toEqual(tenantWide)
        expect(page.cacheControl).toBe('no-store')
        for (const id of resource.ids.b) expect(page.raw).not.toContain(id)
      }
    }

    const revoked = await putAssignment(w.app, w.caseX, 'operator.a', {
      status: 'REVOKED',
      expectedRevision: 1
    })
    expect(revoked.statusCode).toBe(200)
    for (const resource of resources) {
      const page = await readList(w.app, `${resource.path}?limit=7`, OPERATOR_A)
      expect(page.pageInfo.total).toBe(0)
      expect(page.ids).toEqual([])
    }
  })
})

describe('SPEC0251 S3 — case-scoped mutations (memory)', () => {
  it('PATCH /v1/tasks/:taskId/status: indistinguishable 404 without effect; assigned Operator 200', async () => {
    const logs: RuntimeLogEntry[] = []
    const w = await world({ runtimeLogger: (entry) => logs.push(entry) })
    const taskX = seedTask(w.app, w.x.sessionId)
    const taskRootless = seedTask(w.app, w.rootless.sessionId)
    const taskB = seedTask(w.app, w.b.sessionId, OTHER_TENANT)
    const before = persisted(w.app)

    const missing = await patchTask(w.app, 'task_absent_spec0251', OPERATOR_A)
    const denied = [
      await patchTask(w.app, taskX.id, OPERATOR_B),
      await patchTask(w.app, taskRootless.id, OPERATOR_A),
      await patchTask(w.app, taskB.id, OPERATOR_A)
    ]
    for (const response of [...denied, missing]) {
      expect(response.statusCode).toBe(404)
      expect(response.json().error).toEqual(NOT_FOUND)
      expect(withoutCorrelation(response)).toEqual(withoutCorrelation(missing))
      expect(response.headers['cache-control']).toBe('no-store')
    }
    expect(persisted(w.app)).toBe(before)
    const failures = logs
      .filter((entry) => entry.route === '/v1/tasks/:taskId/status')
      .map((entry) =>
        Object.fromEntries(
          Object.entries(entry).filter(([key]) => key !== 'correlationId')
        )
      )
    expect(failures).toEqual(
      Array.from({ length: 4 }, () => ({
        event: 'task.status_failed',
        route: '/v1/tasks/:taskId/status',
        status: 'error',
        errorCode: 'not_found'
      }))
    )

    const allowed = await patchTask(w.app, taskX.id, OPERATOR_A)
    expect(allowed.statusCode).toBe(200)
    expect(allowed.json().data.status).toBe('in_progress')
    expect(allowed.headers['cache-control']).toBe('no-store')
  })

  for (const route of [
    { url: '/v1/tasks', payload: taskPayload },
    { url: '/v1/journeys/tasks', payload: journeyPayload }
  ]) {
    it(`POST ${route.url}: 404 without task for an unassigned or rootless session, replay included`, async () => {
      const w = await world()
      const before = persisted(w.app)
      const missing = await post(
        w.app,
        route.url,
        OPERATOR_A,
        route.payload('sess_absent_spec0251')
      )
      const denied = [
        await post(w.app, route.url, OPERATOR_B, route.payload(w.x.sessionId)),
        await post(
          w.app,
          route.url,
          OPERATOR_A,
          route.payload(w.rootless.sessionId)
        ),
        await post(w.app, route.url, OPERATOR_A, route.payload(w.b.sessionId))
      ]
      for (const response of [...denied, missing]) {
        expect(response.statusCode).toBe(404)
        expect(response.json().error).toEqual(NOT_FOUND)
        expect(withoutCorrelation(response)).toEqual(
          withoutCorrelation(missing)
        )
        expect(response.headers['cache-control']).toBe('no-store')
      }
      expect(persisted(w.app)).toBe(before)

      const key = randomUUID()
      const created = await post(
        w.app,
        route.url,
        OPERATOR_A,
        route.payload(w.x.sessionId, key)
      )
      expect(created.statusCode).toBe(200)
      expect(created.headers['cache-control']).toBe('no-store')
      const taskId = created.json().data.id as string
      const afterCreate = persisted(w.app)

      // Idempotent replay by an unassigned Operator never returns the task.
      const replay = await post(
        w.app,
        route.url,
        OPERATOR_B,
        route.payload(w.x.sessionId, key)
      )
      expect(replay.statusCode).toBe(404)
      expect(replay.json().error).toEqual(NOT_FOUND)
      expect(replay.body).not.toContain(taskId)
      expect(persisted(w.app)).toBe(afterCreate)
    })
  }

  it('POST /v1/approvals: 404 without approval outside the assigned case; Supervisor stays in its tenant', async () => {
    const w = await world()
    const before = persisted(w.app)
    const missing = await post(
      w.app,
      '/v1/approvals',
      APPROVER_A,
      approvalPayload('sess_absent_spec0251')
    )
    const denied = [
      await post(
        w.app,
        '/v1/approvals',
        APPROVER_B,
        approvalPayload(w.x.sessionId)
      ),
      await post(
        w.app,
        '/v1/approvals',
        OPERATOR_B,
        approvalPayload(w.x.sessionId)
      ),
      await post(
        w.app,
        '/v1/approvals',
        APPROVER_A,
        approvalPayload(w.rootless.sessionId)
      ),
      await post(
        w.app,
        '/v1/approvals',
        SUPERVISOR,
        approvalPayload(w.b.sessionId)
      )
    ]
    for (const response of [...denied, missing]) {
      expect(response.statusCode).toBe(404)
      expect(response.json().error).toEqual(NOT_FOUND)
      expect(withoutCorrelation(response)).toEqual(withoutCorrelation(missing))
      expect(response.headers['cache-control']).toBe('no-store')
    }
    expect(persisted(w.app)).toBe(before)

    for (const [headers, sessionId] of [
      [APPROVER_A, w.x.sessionId],
      [SUPERVISOR, w.y.sessionId],
      [SUPERVISOR, w.rootless.sessionId],
      [ADMIN, w.y.sessionId]
    ] as const) {
      const created = await post(
        w.app,
        '/v1/approvals',
        headers,
        approvalPayload(sessionId)
      )
      expect(created.statusCode).toBe(200)
      expect(created.json().data.status).toBe('pending')
      expect(created.headers['cache-control']).toBe('no-store')
    }
  })

  it('POST /v1/approvals/:id/decision: approved, rejected and assumed require the case; Supervisor tenant-wide', async () => {
    const w = await world()
    const decisions = ['approved', 'rejected', 'assumed'] as const
    const inX = decisions.map(() => seedApproval(w.app, w.x.sessionId))
    const inY = seedApproval(w.app, w.y.sessionId)
    const inB = seedApproval(w.app, w.b.sessionId, OTHER_TENANT)
    const before = persisted(w.app)
    const decide = (
      id: string,
      headers: Record<string, string>,
      decision: (typeof decisions)[number]
    ) =>
      post(w.app, `/v1/approvals/${id}/decision`, headers, {
        decision,
        note: 'synthetic'
      })

    const missing = await decide(
      'approval_absent_spec0251',
      APPROVER_A,
      'approved'
    )
    const denied: Response[] = []
    for (const [index, decision] of decisions.entries()) {
      denied.push(await decide(inX[index]!.id, APPROVER_B, decision))
    }
    denied.push(
      await decide('approval_absent_spec0251', SUPERVISOR, 'approved'),
      await decide(inB.id, SUPERVISOR, 'rejected')
    )
    for (const response of [...denied, missing]) {
      expect(response.statusCode).toBe(404)
      expect(response.json().error).toEqual(NOT_FOUND)
      expect(withoutCorrelation(response)).toEqual(withoutCorrelation(missing))
      expect(response.headers['cache-control']).toBe('no-store')
    }
    expect(persisted(w.app)).toBe(before)

    for (const [index, decision] of decisions.entries()) {
      const allowed = await decide(inX[index]!.id, APPROVER_A, decision)
      expect(allowed.statusCode).toBe(200)
      expect(allowed.json().data.status).toBe(decision)
      expect(allowed.headers['cache-control']).toBe('no-store')
    }
    const supervised = await decide(inY.id, SUPERVISOR, 'approved')
    expect(supervised.statusCode).toBe(200)
    expect(supervised.json().data.status).toBe('approved')
  })

  it('resolves task and approval cases only inside the snapshot tenant', async () => {
    const w = await world()
    const taskX = seedTask(w.app, w.x.sessionId)
    const approvalX = seedApproval(w.app, w.x.sessionId)
    const taskRootless = seedTask(w.app, w.rootless.sessionId)
    const taskB = seedTask(w.app, w.b.sessionId, OTHER_TENANT)
    const approvalB = seedApproval(w.app, w.b.sessionId, OTHER_TENANT)
    const inTenantA = await w.app.caseAuthority.readSnapshot(
      TENANT,
      async (snapshot) => [
        await snapshot.taskCase(taskB.id),
        await snapshot.approvalRequestCase(approvalB.id),
        await snapshot.taskCase('task_absent_spec0251'),
        await snapshot.approvalRequestCase('approval_absent_spec0251'),
        await snapshot.taskCase(taskX.id),
        await snapshot.approvalRequestCase(approvalX.id),
        await snapshot.taskCase(taskRootless.id)
      ]
    )
    expect(inTenantA).toEqual([
      null,
      null,
      null,
      null,
      { caseId: w.caseX, sessionId: w.x.sessionId },
      { caseId: w.caseX, sessionId: w.x.sessionId },
      { caseId: null, sessionId: w.rootless.sessionId }
    ])
    const inTenantB = await w.app.caseAuthority.readSnapshot(
      OTHER_TENANT,
      async (snapshot) => [
        await snapshot.taskCase(taskB.id),
        await snapshot.approvalRequestCase(approvalB.id),
        await snapshot.taskCase(taskX.id)
      ]
    )
    expect(inTenantB[0]).toEqual({
      caseId: expect.any(String),
      sessionId: w.b.sessionId
    })
    expect(inTenantB[1]).toEqual(inTenantB[0])
    expect(inTenantB[2]).toBeNull()
  })
})

describe('SPEC0251 S4 — runtime approval decision (memory)', () => {
  it('requires the execution case for Approver; Supervisor decides tenant-wide; missing is 404 for both', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const authority = new DurableApprovalEngine()
    const w = await world({
      operationalExecution: store,
      operationalApprovalAuthority: authority
    })
    const linkToX = (execution: WaitingExecution) =>
      w.app.caseAuthority.registerExecutionLink(
        TENANT,
        execution.executionId,
        {
          kind: 'core',
          conversationId: w.x.conversationId,
          sessionId: w.x.sessionId
        },
        true
      )
    // All executions wait before any decision: an approved one is requeued
    // and would be claimed again by the next fixture.
    const linked = await waitingExecution(
      store,
      authority,
      w.x.conversationId,
      w.x.sessionId
    )
    const rejectedCase = await waitingExecution(
      store,
      authority,
      w.x.conversationId,
      w.x.sessionId
    )
    const unlinked = await waitingExecution(
      store,
      authority,
      w.x.conversationId,
      w.x.sessionId
    )
    await linkToX(linked)
    await linkToX(rejectedCase)

    const denied = await decideRuntime(w.app, linked, APPROVER_B)
    expect(denied.statusCode).toBe(404)
    expect(denied.json().error).toEqual(NOT_FOUND)
    expect(denied.headers['cache-control']).toBe('no-store')
    expect((await authority.get(TENANT, linked.approvalId)).status).toBe(
      'REQUESTED'
    )
    expect((await store.get(TENANT, linked.executionId))?.state).toBe(
      'WAITING_APPROVAL'
    )

    const approved = await decideRuntime(w.app, linked, APPROVER_A)
    expect(approved.statusCode).toBe(202)
    expect(approved.headers['cache-control']).toBe('no-store')
    expect((await store.get(TENANT, linked.executionId))?.state).toBe('QUEUED')

    const rejected = await decideRuntime(
      w.app,
      rejectedCase,
      APPROVER_A,
      'rejected'
    )
    expect(rejected.statusCode).toBe(200)
    expect(rejected.headers['cache-control']).toBe('no-store')

    const unlinkedDenied = await decideRuntime(w.app, unlinked, APPROVER_A)
    expect(unlinkedDenied.statusCode).toBe(404)
    expect(unlinkedDenied.json().error).toEqual(NOT_FOUND)
    expect((await authority.get(TENANT, unlinked.approvalId)).status).toBe(
      'REQUESTED'
    )
    const supervised = await decideRuntime(w.app, unlinked, SUPERVISOR)
    expect(supervised.statusCode).toBe(202)

    const absent = { executionId: 'exec_absent_spec0251', approvalId: 'a' }
    for (const headers of [APPROVER_A, SUPERVISOR]) {
      const response = await decideRuntime(w.app, absent, headers)
      expect(response.statusCode).toBe(404)
      expect(response.json().error).toEqual(NOT_FOUND)
      expect(withoutCorrelation(response)).toEqual(withoutCorrelation(denied))
    }
  })
})

describe('SPEC0251 S6 — principal policy and fail-closed composition (memory)', () => {
  it('a revocation committed before the request is 404 and a deactivated principal is 401, with no effect', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const authority = new DurableApprovalEngine()
    const w = await world({
      operationalExecution: store,
      operationalApprovalAuthority: authority
    })
    const taskX = seedTask(w.app, w.x.sessionId)
    const approvalX = seedApproval(w.app, w.x.sessionId)
    const execution = await waitingExecution(
      store,
      authority,
      w.x.conversationId,
      w.x.sessionId
    )
    await w.app.caseAuthority.registerExecutionLink(
      TENANT,
      execution.executionId,
      {
        kind: 'core',
        conversationId: w.x.conversationId,
        sessionId: w.x.sessionId
      },
      true
    )
    const mutations = () => [
      () => patchTask(w.app, taskX.id, OPERATOR_A),
      () => post(w.app, '/v1/tasks', OPERATOR_A, taskPayload(w.x.sessionId)),
      () =>
        post(
          w.app,
          '/v1/journeys/tasks',
          OPERATOR_A,
          journeyPayload(w.x.sessionId)
        ),
      () =>
        post(
          w.app,
          '/v1/approvals',
          APPROVER_A,
          approvalPayload(w.x.sessionId)
        ),
      () =>
        post(w.app, `/v1/approvals/${approvalX.id}/decision`, APPROVER_A, {
          decision: 'approved'
        }),
      () => decideRuntime(w.app, execution, APPROVER_A)
    ]
    for (const operatorId of ['operator.a', 'approver.a']) {
      const revoked = await putAssignment(w.app, w.caseX, operatorId, {
        status: 'REVOKED',
        expectedRevision: 1
      })
      expect(revoked.statusCode).toBe(200)
    }
    const before = persisted(w.app)
    for (const run of mutations()) {
      const response = await run()
      expect(response.statusCode).toBe(404)
      expect(response.json().error).toEqual(NOT_FOUND)
      expect(response.headers['cache-control']).toBe('no-store')
    }
    expect(persisted(w.app)).toBe(before)
    expect((await authority.get(TENANT, execution.approvalId)).status).toBe(
      'REQUESTED'
    )

    for (const [operatorId, role] of [
      ['operator.a', 'Operator'],
      ['approver.a', 'Approver']
    ] as const) {
      const regranted = await putAssignment(w.app, w.caseX, operatorId, {
        status: 'ACTIVE',
        expectedRevision: 2
      })
      expect(regranted.statusCode).toBe(200)
      await provisionPrincipal(w.app, {
        operatorId,
        role,
        active: false,
        expectedRevision: 1
      })
    }
    const beforeInactive = persisted(w.app)
    for (const run of mutations()) {
      const response = await run()
      expect(response.statusCode).toBe(401)
      expect(response.json().error.code).toBe('unauthorized')
      expect(response.headers['cache-control']).toBe('no-store')
    }
    expect(persisted(w.app)).toBe(beforeInactive)
    expect((await authority.get(TENANT, execution.approvalId)).status).toBe(
      'REQUESTED'
    )
  })

  it('trusted identity without a principal authority is 503 on the eight routes for every permitted role', async () => {
    const key = 'spec0251-trusted-signing-key-abcdefghijklmnopqrstuvwxyz'
    const store = createInMemoryOperationalExecutionStore()
    const authority = new DurableApprovalEngine()
    const app = track(
      buildServer({
        identityMode: 'trusted',
        operatorIdentityResolver: createTrustedOperatorIdentityResolver({
          secret: key
        }),
        operatorSessionStore: createInMemoryOperatorSessionStore(),
        operationalExecution: store,
        operationalApprovalAuthority: authority
      })
    )
    const x = await seedConversation(app, 'TRUSTED_X')
    const taskX = seedTask(app, x.sessionId)
    const approvalX = seedApproval(app, x.sessionId)
    const execution = await waitingExecution(
      store,
      authority,
      x.conversationId,
      x.sessionId
    )
    await app.caseAuthority.registerExecutionLink(
      TENANT,
      execution.executionId,
      {
        kind: 'core',
        conversationId: x.conversationId,
        sessionId: x.sessionId
      },
      true
    )
    const login = async (operatorId: string, role: Role) => {
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
    const everyone: Role[] = ['Operator', 'Approver', 'Supervisor', 'Admin']
    const routes: Array<{
      name: string
      permitted: Role[]
      run: (headers: Record<string, string>) => Promise<Response>
    }> = [
      {
        name: 'GET /v1/tasks',
        permitted: everyone,
        run: (headers) =>
          app.inject({ method: 'GET', url: '/v1/tasks', headers })
      },
      {
        name: 'GET /v1/approvals',
        permitted: everyone,
        run: (headers) =>
          app.inject({ method: 'GET', url: '/v1/approvals', headers })
      },
      {
        name: 'PATCH /v1/tasks/:taskId/status',
        permitted: ['Operator'],
        run: (headers) => patchTask(app, taskX.id, headers)
      },
      {
        name: 'POST /v1/tasks',
        permitted: ['Operator'],
        run: (headers) =>
          post(app, '/v1/tasks', headers, taskPayload(x.sessionId))
      },
      {
        name: 'POST /v1/journeys/tasks',
        permitted: ['Operator'],
        run: (headers) =>
          post(app, '/v1/journeys/tasks', headers, journeyPayload(x.sessionId))
      },
      {
        name: 'POST /v1/approvals',
        permitted: everyone,
        run: (headers) =>
          post(app, '/v1/approvals', headers, approvalPayload(x.sessionId))
      },
      {
        name: 'POST /v1/approvals/:id/decision',
        permitted: ['Approver', 'Supervisor'],
        run: (headers) =>
          post(app, `/v1/approvals/${approvalX.id}/decision`, headers, {
            decision: 'approved'
          })
      },
      {
        name: 'POST /v1/executions/:id/approvals/:id/decision',
        permitted: ['Approver', 'Supervisor'],
        run: (headers) => decideRuntime(app, execution, headers)
      }
    ]
    const before = persisted(app)
    for (const role of everyone) {
      const session = await login(`${role.toLowerCase()}.trusted`, role)
      for (const route of routes) {
        const response = await route.run(session)
        const expected = route.permitted.includes(role) ? 503 : 403
        expect(response.statusCode, `${route.name} as ${role}`).toBe(expected)
        if (expected === 503) {
          expect(response.json().error.code).toBe('configuration_error')
          expect(response.headers['cache-control']).toBe('no-store')
        }
      }
    }
    expect(persisted(app)).toBe(before)
    expect((await authority.get(TENANT, execution.approvalId)).status).toBe(
      'REQUESTED'
    )
  })
})

describe('SPEC0251 S6/S7 — authority outage and error mapping (memory)', () => {
  it('a snapshot outage is a redacted 503 on the eight routes, never 500 and never an effect', async () => {
    const logs: RuntimeLogEntry[] = []
    const store = createInMemoryOperationalExecutionStore()
    const authority = new DurableApprovalEngine()
    const outage = 'synthetic SPEC0251 snapshot outage'
    const app = track(
      buildServer({
        requireAuthenticatedMutations: true,
        caseAuthority: new PostgresCaseAuthority({
          connect: async () => {
            throw new Error(outage)
          }
        } as never),
        operationalExecution: store,
        operationalApprovalAuthority: authority,
        runtimeLogger: (entry) => logs.push(entry)
      })
    )
    const session = seedRootlessSession(app)
    const task = seedTask(app, session.sessionId)
    const approval = seedApproval(app, session.sessionId)
    const execution = await waitingExecution(
      store,
      authority,
      session.conversationId,
      session.sessionId
    )
    const before = persisted(app)
    const calls: Array<[string, () => Promise<Response>]> = []
    for (const headers of [OPERATOR_A, SUPERVISOR]) {
      calls.push(
        [
          'GET /v1/tasks',
          () => app.inject({ method: 'GET', url: '/v1/tasks', headers })
        ],
        [
          'GET /v1/approvals',
          () => app.inject({ method: 'GET', url: '/v1/approvals', headers })
        ],
        [
          'POST /v1/approvals',
          () =>
            post(
              app,
              '/v1/approvals',
              headers,
              approvalPayload(session.sessionId)
            )
        ]
      )
    }
    calls.push(
      ['PATCH', () => patchTask(app, task.id, OPERATOR_A)],
      [
        'POST /v1/tasks',
        () => post(app, '/v1/tasks', OPERATOR_A, taskPayload(session.sessionId))
      ],
      [
        'POST /v1/journeys/tasks',
        () =>
          post(
            app,
            '/v1/journeys/tasks',
            OPERATOR_A,
            journeyPayload(session.sessionId)
          )
      ],
      [
        'POST decision (Approver)',
        () =>
          post(app, `/v1/approvals/${approval.id}/decision`, APPROVER_A, {
            decision: 'approved'
          })
      ],
      [
        'POST decision (Supervisor)',
        () =>
          post(app, `/v1/approvals/${approval.id}/decision`, SUPERVISOR, {
            decision: 'rejected'
          })
      ],
      [
        'runtime decision (Approver)',
        () => decideRuntime(app, execution, APPROVER_A)
      ],
      [
        'runtime decision (Supervisor)',
        () => decideRuntime(app, execution, SUPERVISOR)
      ]
    )
    for (const [name, run] of calls) {
      const response = await run()
      expect(response.statusCode, name).toBe(503)
      expect(response.json().error, name).toEqual({
        code: 'configuration_error',
        message: 'Case authority is unavailable'
      })
      expect(response.headers['cache-control'], name).toBe('no-store')
      expect(response.body).not.toContain(outage)
    }
    expect(persisted(app)).toBe(before)
    expect((await authority.get(TENANT, execution.approvalId)).status).toBe(
      'REQUESTED'
    )
    expect(JSON.stringify(logs)).not.toContain(outage)

    // Validation runs before the case unit opens: with the authority down,
    // an invalid request is still a 400, never the outage 503.
    for (const [name, run] of [
      [
        'GET /v1/tasks?limit=0',
        () =>
          app.inject({
            method: 'GET',
            url: '/v1/tasks?limit=0',
            headers: SUPERVISOR
          })
      ],
      [
        'GET /v1/approvals?status=bogus',
        () =>
          app.inject({
            method: 'GET',
            url: '/v1/approvals?status=bogus',
            headers: SUPERVISOR
          })
      ],
      ['PATCH bogus', () => patchTask(app, task.id, OPERATOR_A, 'bogus')],
      ['POST /v1/tasks {}', () => post(app, '/v1/tasks', OPERATOR_A, {})],
      [
        'POST /v1/journeys/tasks without session',
        () => post(app, '/v1/journeys/tasks', OPERATOR_A, journeyPayload(''))
      ],
      [
        'POST /v1/approvals {}',
        () => post(app, '/v1/approvals', SUPERVISOR, {})
      ]
    ] as Array<[string, () => Promise<Response>]>) {
      const response = await run()
      expect(response.statusCode, name).toBe(400)
      expect(response.headers['cache-control'], name).toBe('no-store')
    }
    expect(persisted(app)).toBe(before)
  })

  it('every handler response carries no-store and the previous mapping of each route is kept', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const authority = new DurableApprovalEngine()
    const w = await world({
      operationalExecution: store,
      operationalApprovalAuthority: authority
    })
    await grantCase(w.app, {
      kind: 'core_conversation',
      resourceId: w.x.conversationId,
      operatorId: 'approver.self',
      role: 'Approver'
    })
    const taskX = seedTask(w.app, w.x.sessionId)
    const approvalX = seedApproval(w.app, w.x.sessionId)
    const link = async (execution: WaitingExecution) => {
      await w.app.caseAuthority.registerExecutionLink(
        TENANT,
        execution.executionId,
        {
          kind: 'core',
          conversationId: w.x.conversationId,
          sessionId: w.x.sessionId
        },
        true
      )
      return execution
    }
    const execution = await link(
      await waitingExecution(
        store,
        authority,
        w.x.conversationId,
        w.x.sessionId
      )
    )
    const selfRequested = await link(
      await waitingExecution(
        store,
        authority,
        w.x.conversationId,
        w.x.sessionId,
        'approver.self'
      )
    )
    const expectNoStore = (response: Response, status: number) => {
      expect(response.statusCode).toBe(status)
      expect(response.headers['cache-control']).toBe('no-store')
      return response
    }

    // Successes of the eight routes.
    expectNoStore(
      await w.app.inject({
        method: 'GET',
        url: '/v1/tasks',
        headers: OPERATOR_A
      }),
      200
    )
    expectNoStore(
      await w.app.inject({
        method: 'GET',
        url: '/v1/approvals',
        headers: APPROVER_A
      }),
      200
    )
    expectNoStore(await patchTask(w.app, taskX.id, OPERATOR_A, 'done'), 200)
    expectNoStore(
      await post(w.app, '/v1/tasks', OPERATOR_A, taskPayload(w.x.sessionId)),
      200
    )
    expectNoStore(
      await post(
        w.app,
        '/v1/journeys/tasks',
        OPERATOR_A,
        journeyPayload(w.x.sessionId)
      ),
      200
    )
    expectNoStore(
      await post(
        w.app,
        '/v1/approvals',
        APPROVER_A,
        approvalPayload(w.x.sessionId)
      ),
      200
    )
    expectNoStore(
      await post(w.app, `/v1/approvals/${approvalX.id}/decision`, APPROVER_A, {
        decision: 'approved'
      }),
      200
    )
    expectNoStore(await decideRuntime(w.app, execution, APPROVER_A), 202)

    // Validation stays 400 before any case lookup: the callers below have no
    // grant on X, so a lookup before validation would answer 404 instead.
    for (const response of [
      await w.app.inject({
        method: 'GET',
        url: '/v1/tasks?limit=0',
        headers: OPERATOR_B
      }),
      await w.app.inject({
        method: 'GET',
        url: '/v1/approvals?status=bogus',
        headers: APPROVER_B
      }),
      await patchTask(w.app, taskX.id, OPERATOR_B, 'bogus'),
      await post(w.app, '/v1/tasks', OPERATOR_B, {}),
      await post(w.app, '/v1/approvals', APPROVER_B, {}),
      await post(w.app, `/v1/approvals/${approvalX.id}/decision`, APPROVER_B, {
        decision: 'bogus'
      }),
      await w.app.inject({
        method: 'POST',
        url: `/v1/executions/${execution.executionId}/approvals/${execution.approvalId}/decision`,
        headers: APPROVER_B,
        payload: { decision: 'approved' }
      })
    ]) {
      expectNoStore(response, 400)
    }
    for (const sessionId of ['', 'x'.repeat(161)]) {
      const invalid = expectNoStore(
        await post(
          w.app,
          '/v1/journeys/tasks',
          OPERATOR_B,
          journeyPayload(sessionId)
        ),
        400
      )
      expect(invalid.json().error.code).toBe('validation_failed')
    }
    const notObject = expectNoStore(
      await w.app.inject({
        method: 'POST',
        url: '/v1/journeys/tasks',
        headers: { ...OPERATOR_B, 'content-type': 'application/json' },
        payload: '"synthetic"'
      }),
      400
    )
    expect(notObject.json().error.code).toBe('validation_failed')

    // Answers produced by the framework before the handler keep no-store.
    expectNoStore(
      await w.app.inject({
        method: 'POST',
        url: '/v1/tasks',
        headers: { ...OPERATOR_A, 'content-type': 'application/json' },
        payload: '{'
      }),
      400
    )
    expectNoStore(
      await w.app.inject({
        method: 'POST',
        url: '/v1/approvals',
        headers: {
          ...APPROVER_A,
          'content-type': 'application/xml',
          'idempotency-key': `approval-key-${Date.now()}-${Math.random().toString(36).slice(2)}`
        },
        payload: '<synthetic/>'
      }),
      415
    )

    // An origin refusal by the HTTP security hook, before every handler,
    // also carries no-store on each of the eight routes.
    const untrusted = { origin: 'https://untrusted.example' }
    for (const [method, url] of [
      ['GET', '/v1/tasks'],
      ['GET', '/v1/approvals'],
      ['PATCH', `/v1/tasks/${taskX.id}/status`],
      ['POST', '/v1/tasks'],
      ['POST', '/v1/journeys/tasks'],
      ['POST', '/v1/approvals'],
      ['POST', `/v1/approvals/${approvalX.id}/decision`],
      [
        'POST',
        `/v1/executions/${execution.executionId}/approvals/${execution.approvalId}/decision`
      ]
    ] as const) {
      const refused = await w.app.inject({
        method,
        url,
        headers: { ...OPERATOR_A, ...untrusted },
        ...(method === 'GET' ? {} : { payload: {} })
      })
      expect(refused.statusCode, `${method} ${url}`).toBe(403)
      expect(refused.headers['cache-control'], `${method} ${url}`).toBe(
        'no-store'
      )
    }

    // PATCH keeps 400 invalid_action for a forbidden transition and 409 CAS.
    const transition = expectNoStore(
      await patchTask(w.app, taskX.id, OPERATOR_A, 'open'),
      400
    )
    expect(transition.json().error.code).toBe('invalid_action')
    const tasks = w.app.persistence.tasks as {
      transitionStatusWithAudit: (...args: unknown[]) => unknown
    }
    const original = tasks.transitionStatusWithAudit
    tasks.transitionStatusWithAudit = () => {
      throw new DomainError('conflict', 'Task status changed concurrently')
    }
    try {
      const cas = expectNoStore(
        await patchTask(w.app, taskX.id, OPERATOR_A, 'canceled'),
        409
      )
      expect(cas.json().error.code).toBe('conflict')
    } finally {
      tasks.transitionStatusWithAudit = original
    }

    // Runtime approval keeps 403 self-approval and 409 conflict.
    const self = expectNoStore(
      await decideRuntime(
        w.app,
        selfRequested,
        as('approver.self', 'Approver')
      ),
      403
    )
    expect(self.json().error.code).toBe('forbidden')
    const conflict = expectNoStore(
      await decideRuntime(w.app, execution, APPROVER_A, 'rejected'),
      409
    )
    expect(conflict.json().error.code).toBe('conflict')
  })
})
