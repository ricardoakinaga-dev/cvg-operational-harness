/**
 * SPEC 0317 G5: `approval:create` is its own permission. The current roles all
 * combine several permissions and none is view-only, so these tests also inject
 * a matrix into the check the API runs. Synthetic data only.
 */
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { roleHasPermission } from '@cvg/shared'
import { buildServer } from '../server.ts'
import {
  CONTROLLED_TEST_TENANT,
  findCaseId,
  grantCase,
  putAssignment
} from './case-authorization-fixtures.ts'

const injected = vi.hoisted(() => ({
  matrix: null as Record<string, readonly string[]> | null
}))

vi.mock('@cvg/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cvg/shared')>()
  return {
    ...actual,
    roleHasPermission: (role: string, permission: string) => {
      const permissions = injected.matrix?.[role]
      return permissions
        ? permissions.includes(permission)
        : actual.roleHasPermission(role as never, permission)
    }
  }
})

type App = ReturnType<typeof buildServer>
const apps: App[] = []

afterEach(async () => {
  injected.matrix = null
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

const as = (
  operatorId: string,
  role = 'Operator',
  tenant: string = CONTROLLED_TEST_TENANT
) => ({
  'x-operator-id': operatorId,
  'x-operator-role': role,
  'x-tenant-id': tenant
})

async function world() {
  const app = buildServer({ requireAuthenticatedMutations: true })
  apps.push(app)
  const inbound = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    headers: { 'x-tenant-id': CONTROLLED_TEST_TENANT },
    payload: {
      externalMessageId: `g5-${randomUUID()}`,
      senderRef: `+55119${Math.floor(Math.random() * 10_000_000)}`,
      body: 'Mensagem sintetica',
      receivedAt: '2026-11-06T12:00:00-03:00'
    }
  })
  expect(inbound.statusCode).toBe(200)
  const data = inbound.json().data as {
    conversationId: string
    sessionId: string
  }
  await grantCase(app, {
    kind: 'core_conversation',
    resourceId: data.conversationId,
    operatorId: 'operator.g5'
  })
  return { app, ...data }
}

function create(
  app: App,
  headers: Record<string, string>,
  sessionId: string,
  options: { key?: string; proposedAction?: string } = {}
) {
  return app.inject({
    method: 'POST',
    url: '/v1/approvals',
    headers: {
      ...headers,
      'idempotency-key': options.key ?? `g5-${randomUUID()}`
    },
    payload: {
      sessionId,
      proposedAction: options.proposedAction ?? 'handoff_to_operator',
      summary: 'Resumo sintetico',
      riskLevel: 'high'
    }
  })
}

function state(app: App): string {
  const db = app.persistence.memoryDb
  if (!db) throw new Error('memory persistence expected')
  return JSON.stringify(db.state)
}

const approvalCount = (app: App) =>
  app.persistence.memoryDb?.state.approvals.length

describe('SPEC 0317 G5 — approval:create', () => {
  it('holds the decided matrix: Operator, Approver and Supervisor; not Admin', () => {
    expect(roleHasPermission('Operator', 'approval:create')).toBe(true)
    expect(roleHasPermission('Approver', 'approval:create')).toBe(true)
    expect(roleHasPermission('Supervisor', 'approval:create')).toBe(true)
    expect(roleHasPermission('Admin', 'approval:create')).toBe(false)
    expect(roleHasPermission('System', 'approval:create')).toBe(false)
    // Separate from view, decide and execute: none of them is implied.
    expect(roleHasPermission('Admin', 'approval:view')).toBe(true)
    expect(roleHasPermission('Operator', 'approval:decide')).toBe(false)
    expect(roleHasPermission('Approver', 'approval:execute')).toBe(false)
  })

  it('denies Admin before any write, and Admin still reads', async () => {
    const { app, sessionId } = await world()
    const before = state(app)
    const denied = await create(app, as('admin.g5', 'Admin'), sessionId)
    expect(denied.statusCode).toBe(403)
    expect(state(app)).toBe(before)
    const listed = await app.inject({
      method: 'GET',
      url: '/v1/approvals',
      headers: as('admin.g5', 'Admin')
    })
    expect(listed.statusCode).toBe(200)
  })

  it('a view-only identity reads but never creates, even with the grant', async () => {
    const { app, sessionId } = await world()
    injected.matrix = {
      Operator: ['approval:view', 'conversation:view_assigned']
    }
    const before = state(app)
    const denied = await create(app, as('operator.g5'), sessionId)
    expect(denied.statusCode).toBe(403)
    expect(state(app)).toBe(before)
    const listed = await app.inject({
      method: 'GET',
      url: '/v1/approvals',
      headers: as('operator.g5')
    })
    expect(listed.statusCode).toBe(200)
  })

  it('create without view still creates: the permissions are independent', async () => {
    const { app, sessionId } = await world()
    injected.matrix = { Operator: ['approval:create'] }
    expect((await create(app, as('operator.g5'), sessionId)).statusCode).toBe(
      200
    )
    expect(approvalCount(app)).toBe(1)
  })

  it('create still needs the grant, the tenant and an identity', async () => {
    const { app, sessionId } = await world()
    const before = state(app)
    expect(
      (await create(app, as('operator.nogrant'), sessionId)).statusCode
    ).toBe(404)
    expect(
      (
        await create(
          app,
          as(
            'operator.g5',
            'Operator',
            'tenant_00000000-0000-4000-8000-000000000e20'
          ),
          sessionId
        )
      ).statusCode
    ).toBe(404)
    expect(
      (await create(app, { 'x-tenant-id': CONTROLLED_TEST_TENANT }, sessionId))
        .statusCode
    ).toBe(401)
    expect(state(app)).toBe(before)
  })

  it('create without decide cannot decide what it created', async () => {
    const { app, sessionId } = await world()
    injected.matrix = { Operator: ['approval:create', 'approval:view'] }
    const created = await create(app, as('operator.g5'), sessionId)
    expect(created.statusCode).toBe(200)
    const before = state(app)
    const decided = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${created.json().data.id}/decision`,
      headers: as('operator.g5'),
      payload: { decision: 'approved' }
    })
    expect(decided.statusCode).toBe(403)
    expect(state(app)).toBe(before)
  })

  it('an export review also requires audit:view_full', async () => {
    const { app, sessionId } = await world()
    const before = state(app)
    const denied = await create(app, as('operator.g5'), sessionId, {
      proposedAction: 'audit_evidence_export_review'
    })
    expect(denied.statusCode).toBe(403)
    expect(state(app)).toBe(before)
    // audit:view_full alone is not enough: Admin has it and has no create.
    const admin = await create(app, as('admin.g5', 'Admin'), sessionId, {
      proposedAction: 'audit_evidence_export_review'
    })
    expect(admin.statusCode).toBe(403)
    expect(state(app)).toBe(before)
    const supervisor = await create(
      app,
      as('supervisor.g5', 'Supervisor'),
      sessionId,
      { proposedAction: 'audit_evidence_export_review' }
    )
    expect(supervisor.statusCode).toBe(200)
  })

  it('a replay returns the same approval; after revocation it is denied', async () => {
    const { app, sessionId, conversationId } = await world()
    const key = `g5-replay-${randomUUID()}`
    const first = await create(app, as('operator.g5'), sessionId, { key })
    const replay = await create(app, as('operator.g5'), sessionId, { key })
    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(200)
    expect(replay.json().data.id).toBe(first.json().data.id)
    expect(approvalCount(app)).toBe(1)

    const caseId = await findCaseId(app, 'core_conversation', conversationId)
    const revoked = await putAssignment(app, caseId, 'operator.g5', {
      status: 'REVOKED',
      expectedRevision: 1
    })
    expect(revoked.statusCode).toBe(200)
    const before = state(app)
    const late = await create(app, as('operator.g5'), sessionId, { key })
    expect(late.statusCode).toBe(404)
    expect(state(app)).toBe(before)
  })
})
