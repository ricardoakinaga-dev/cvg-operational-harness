import { describe, expect, it, vi } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import { InMemoryDatabase } from '../db.ts'
import {
  ApiCreationIntegrityError,
  InMemoryApiCreation,
  approvalRequestDigest,
  creationKeyDigest,
  taskRequestDigest,
  type CreateApprovalWithAuditCommand,
  type CreateTaskWithAuditCommand
} from '../api-creation.ts'
import { AuditRepository } from '../repositories/audit-repository.ts'
import type { ApprovalRequestRecord } from '../schema.ts'

// SPEC 0257 R2 — memory adapter: AC01/AC02/AC03/AC09/AC10 (synthetic data only).

const tenantA = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-0000000025a1'
)
const tenantB = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-0000000025b2'
)
const NOW = new Date('2026-10-28T12:00:00.000Z')

function database() {
  const db = new InMemoryDatabase()
  for (const [tenantId, suffix] of [
    [tenantA, 'a'],
    [tenantB, 'b']
  ] as const) {
    db.state.conversations = [
      ...db.state.conversations,
      {
        tenantId,
        id: `conv_${suffix}`,
        channel: 'web',
        senderRef: `sender-${suffix}`,
        senderRefHash: `hash-${suffix}`,
        status: 'active',
        correlationId: `corr_${suffix}`,
        createdAt: NOW,
        updatedAt: NOW
      }
    ]
    db.state.sessions = [
      ...db.state.sessions,
      {
        id: `sess_${suffix}`,
        conversationId: `conv_${suffix}`,
        status: 'open',
        takeoverState: 'BOT_ACTIVE',
        createdAt: NOW,
        updatedAt: NOW
      }
    ]
  }
  return db
}

const actor = { actorType: 'Operator', actorId: 'operator.synthetic' } as const

const taskCommand = (
  overrides: Partial<CreateTaskWithAuditCommand['task']> = {},
  who: CreateTaskWithAuditCommand['actor'] = actor
): CreateTaskWithAuditCommand => ({
  actor: who,
  correlationId: 'corr_task_1',
  task: {
    sessionId: 'sess_a',
    title: 'Revisar caso',
    description: 'Descrição sintética',
    priority: 'medium',
    source: 'console',
    idempotencyKey: 'task-key-00000001',
    ...overrides
  }
})

let sequence = 0
const approvalCommand = (
  overrides: Partial<ApprovalRequestRecord> = {},
  key = 'approval-key-0001',
  who: CreateApprovalWithAuditCommand['actor'] = actor
): CreateApprovalWithAuditCommand => ({
  actor: who,
  correlationId: 'corr_approval_1',
  idempotencyKey: key,
  request: {
    id: `approval_${(sequence += 1)}`,
    sessionId: 'sess_a',
    proposedAction: 'audit_evidence_export_review',
    summary: 'Resumo sintético',
    riskLevel: 'medium',
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    createdAt: NOW,
    ...overrides
  }
})

const counts = (db: InMemoryDatabase) => ({
  tasks: db.state.tasks.length,
  approvals: db.state.approvals.length,
  audit: db.state.auditEvents.length,
  receipts: db.state.apiCreationReceipts.length
})

describe('SPEC 0257 §3 digests', () => {
  it('key digest is the exact versioned SHA-256 and the request digest ignores ids and dates', () => {
    expect(creationKeyDigest('task-key-00000001')).toMatch(/^[0-9a-f]{64}$/)
    expect(creationKeyDigest('a'.repeat(8))).not.toBe(
      creationKeyDigest('b'.repeat(8))
    )
    const first = approvalCommand()
    const second = approvalCommand({}, 'approval-key-0001')
    expect(approvalRequestDigest('t', actor, first.request)).toBe(
      approvalRequestDigest('t', actor, second.request)
    )
    expect(taskRequestDigest('t', actor, taskCommand().task)).not.toBe(
      taskRequestDigest('t', actor, taskCommand({ title: 'outro' }).task)
    )
  })
})

describe('memory task creation (AC01/AC02/AC03)', () => {
  it('creates 1 task + 1 audit + 1 receipt together and replays the same task', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    const first = port.createTaskWithAudit(taskCommand(), tenantA)
    expect(first.outcome).toBe('created')
    expect(counts(db)).toEqual({
      tasks: 1,
      approvals: 0,
      audit: 1,
      receipts: 1
    })
    const event = db.state.auditEvents[0]!
    expect(event).toMatchObject({
      type: 'integration_event',
      actorType: 'Operator',
      actorId: 'operator.synthetic',
      tenantId: tenantA
    })
    const replay = port.createTaskWithAudit(taskCommand(), tenantA)
    expect(replay.outcome).toBe('replayed')
    expect(replay.resource.id).toBe(first.resource.id)
    expect(counts(db)).toEqual({
      tasks: 1,
      approvals: 0,
      audit: 1,
      receipts: 1
    })
  })

  it('an audit failure leaves none of the three and the retry converges', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    const spy = vi
      .spyOn(AuditRepository.prototype, 'append')
      .mockImplementationOnce(() => {
        throw new Error('injected audit failure')
      })
    expect(() => port.createTaskWithAudit(taskCommand(), tenantA)).toThrow(
      'injected audit failure'
    )
    spy.mockRestore()
    expect(counts(db)).toEqual({
      tasks: 0,
      approvals: 0,
      audit: 0,
      receipts: 0
    })
    const retry = port.createTaskWithAudit(taskCommand(), tenantA)
    expect(retry.outcome).toBe('created')
    expect(counts(db)).toEqual({
      tasks: 1,
      approvals: 0,
      audit: 1,
      receipts: 1
    })
  })

  it('the same key with a different actor, session, source or body is a conflict and writes nothing', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    port.createTaskWithAudit(taskCommand(), tenantA)
    const before = counts(db)
    const variants: CreateTaskWithAuditCommand[] = [
      taskCommand({}, { actorType: 'Admin', actorId: 'operator.synthetic' }),
      taskCommand({}, { actorType: 'Operator', actorId: 'someone.else' }),
      taskCommand({ title: 'Outro título' }),
      taskCommand({ description: 'Outra descrição' }),
      taskCommand({ priority: 'high' }),
      taskCommand({ source: 'api' })
    ]
    for (const variant of variants) {
      expect(() => port.createTaskWithAudit(variant, tenantA)).toThrow(
        /already used|conflict/i
      )
    }
    expect(counts(db)).toEqual(before)
  })

  it('tenants have separate namespaces for the same key', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    port.createTaskWithAudit(taskCommand(), tenantA)
    const other = port.createTaskWithAudit(
      taskCommand({ sessionId: 'sess_b' }),
      tenantB
    )
    expect(other.outcome).toBe('created')
    expect(counts(db).receipts).toBe(2)
  })

  it('a legacy task of the same unique key without our receipt is a 409 with zero audit and receipt (AC03/AC09)', () => {
    const db = database()
    db.state.tasks = [
      {
        id: 'task_legacy',
        sessionId: 'sess_a',
        title: 'legado',
        description: '',
        priority: 'medium',
        source: 'console',
        status: 'open',
        idempotencyKey: 'task-key-00000001',
        createdAt: NOW
      }
    ]
    const port = new InMemoryApiCreation(db)
    expect(() => port.createTaskWithAudit(taskCommand(), tenantA)).toThrow(
      /already used/
    )
    expect(counts(db)).toEqual({
      tasks: 1,
      approvals: 0,
      audit: 0,
      receipts: 0
    })
  })

  it('a session of another tenant is refused before any write', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    expect(() =>
      port.createTaskWithAudit(taskCommand({ sessionId: 'sess_b' }), tenantA)
    ).toThrow('Session not found')
    expect(counts(db)).toEqual({
      tasks: 0,
      approvals: 0,
      audit: 0,
      receipts: 0
    })
  })

  it('a task keeps its body key rule (8-200 any text); approvals take the strict header rule', () => {
    const port = new InMemoryApiCreation(database())
    for (const key of ['short', 'x'.repeat(201)]) {
      expect(() =>
        port.createTaskWithAudit(taskCommand({ idempotencyKey: key }), tenantA)
      ).toThrow(/Idempotency key/)
    }
    expect(
      port.createTaskWithAudit(
        taskCommand({ idempotencyKey: 'has space é 12345' }),
        tenantA
      ).outcome
    ).toBe('created')
    for (const key of [
      'short',
      'has space 12345',
      'x'.repeat(201),
      'é-key-0001'
    ]) {
      expect(() =>
        port.createApprovalWithAudit(approvalCommand({}, key), tenantA)
      ).toThrow(/Idempotency key/)
    }
  })

  it('a corrupted receipt reference is an integrity error, not a creation or a 404 (§4.1)', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    port.createTaskWithAudit(taskCommand(), tenantA)
    db.state.auditEvents = []
    expect(() => port.createTaskWithAudit(taskCommand(), tenantA)).toThrow(
      ApiCreationIntegrityError
    )
  })
})

describe('memory approval creation', () => {
  it('creates 1 approval + 1 creation audit + 1 receipt and replays the same id', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    const first = port.createApprovalWithAudit(approvalCommand(), tenantA)
    expect(first.outcome).toBe('created')
    expect(counts(db)).toEqual({
      tasks: 0,
      approvals: 1,
      audit: 1,
      receipts: 1
    })
    expect(db.state.auditEvents[0]).toMatchObject({
      type: 'approval_decision',
      payload: {
        sessionId: 'sess_a',
        approvalRequestId: first.resource.id,
        status: 'pending'
      }
    })
    // Not the decision event used by the dedupe (no payload.approvalId/decision).
    expect(db.state.auditEvents[0]!.payload).not.toHaveProperty('approvalId')
    const replay = port.createApprovalWithAudit(approvalCommand(), tenantA)
    expect(replay.outcome).toBe('replayed')
    expect(replay.resource.id).toBe(first.resource.id)
    expect(counts(db)).toEqual({
      tasks: 0,
      approvals: 1,
      audit: 1,
      receipts: 1
    })
  })

  it('audit failure leaves none of the three and the retry converges', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    const spy = vi
      .spyOn(AuditRepository.prototype, 'append')
      .mockImplementationOnce(() => {
        throw new Error('injected audit failure')
      })
    expect(() =>
      port.createApprovalWithAudit(approvalCommand(), tenantA)
    ).toThrow('injected audit failure')
    spy.mockRestore()
    expect(counts(db)).toEqual({
      tasks: 0,
      approvals: 0,
      audit: 0,
      receipts: 0
    })
    expect(
      port.createApprovalWithAudit(approvalCommand(), tenantA).outcome
    ).toBe('created')
    expect(counts(db)).toEqual({
      tasks: 0,
      approvals: 1,
      audit: 1,
      receipts: 1
    })
  })

  it('a different body, actor or session under the same key is a conflict; another route is another namespace', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    port.createApprovalWithAudit(approvalCommand(), tenantA)
    const before = counts(db)
    for (const variant of [
      approvalCommand({ summary: 'outro' }),
      approvalCommand({ riskLevel: 'high' }),
      approvalCommand({ proposedAction: 'other_action' }),
      approvalCommand({}, 'approval-key-0001', {
        actorType: 'Admin',
        actorId: 'operator.synthetic'
      })
    ]) {
      expect(() => port.createApprovalWithAudit(variant, tenantA)).toThrow(
        /already used/
      )
    }
    expect(counts(db)).toEqual(before)
    // Same key text on /v1/tasks is another namespace.
    const task = port.createTaskWithAudit(
      taskCommand({ idempotencyKey: 'approval-key-0001' }),
      tenantA
    )
    expect(task.outcome).toBe('created')
  })
})

describe('memory publication (AC10) — whole state', () => {
  it('another writer that REPLACES the whole state pointer aborts the creation (MEM1)', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    const publish = db.publish.bind(db)
    db.publish = (expected, collections, next) => {
      // A second writer publishes a different state first.
      publish(expected, collections, { ...expected })
      return publish(expected, collections, next)
    }
    expect(() => port.createTaskWithAudit(taskCommand(), tenantA)).toThrow(
      /changed concurrently/
    )
    expect(counts(db)).toEqual({
      tasks: 0,
      approvals: 0,
      audit: 0,
      receipts: 0
    })
  })

  it('a mutation of a collection the creation did not even write (messages) also aborts it', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    const publish = db.publish.bind(db)
    db.publish = (expected, collections, next) => {
      db.state.messages = [...db.state.messages]
      return publish(expected, collections, next)
    }
    expect(() => port.createTaskWithAudit(taskCommand(), tenantA)).toThrow(
      /changed concurrently/
    )
    expect(counts(db).tasks).toBe(0)
  })

  it('an approval for a session of another tenant is refused before any write (MEM8)', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    expect(() =>
      port.createApprovalWithAudit(
        approvalCommand({ sessionId: 'sess_b' }),
        tenantA
      )
    ).toThrow('Session not found')
    expect(counts(db)).toEqual({
      tasks: 0,
      approvals: 0,
      audit: 0,
      receipts: 0
    })
  })
})

describe('memory publication (AC10)', () => {
  it('another writer that mutates the state between snapshot and publication aborts the creation without being lost', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    // Mutate the live state between the snapshot and the publication.
    const publish = db.publish.bind(db)
    db.publish = (expected, collections, next) => {
      db.state.auditEvents = [
        ...db.state.auditEvents,
        {
          id: 'audit_concurrent',
          type: 'integration_event',
          actorType: 'System',
          actorId: 'concurrent',
          correlationId: 'corr_concurrent',
          policyVersion: 'p',
          payload: {},
          createdAt: NOW
        }
      ]
      return publish(expected, collections, next)
    }
    expect(() => port.createTaskWithAudit(taskCommand(), tenantA)).toThrow(
      /changed concurrently/
    )
    expect(db.state.auditEvents.map((event) => event.id)).toEqual([
      'audit_concurrent'
    ])
    expect(counts(db).tasks).toBe(0)
    expect(counts(db).receipts).toBe(0)
  })

  it('returns copies: mutating a result does not change the stored resource', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    const created = port.createTaskWithAudit(taskCommand(), tenantA)
    created.resource.title = 'tampered'
    expect(db.state.tasks[0]!.title).toBe('Revisar caso')
    const replay = port.createTaskWithAudit(taskCommand(), tenantA)
    replay.resource.title = 'tampered again'
    expect(db.state.tasks[0]!.title).toBe('Revisar caso')
  })

  it('the tenantless memory profile uses its own namespace', () => {
    const db = database()
    const port = new InMemoryApiCreation(db)
    const first = port.createTaskWithAudit(taskCommand())
    expect(first.outcome).toBe('created')
    expect(db.state.apiCreationReceipts[0]!.tenantId).toBeNull()
    expect(port.createTaskWithAudit(taskCommand()).outcome).toBe('replayed')
  })
})
