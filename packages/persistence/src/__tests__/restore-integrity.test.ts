import { describe, expect, it } from 'vitest'
import type { TenantId } from '@cvg/platform'
import { InMemoryDatabase } from '../db.ts'
import {
  createDatabaseSnapshot,
  digestDatabaseState,
  restoreDatabaseSnapshot
} from '../restore.ts'
import type {
  AuditEventRecord,
  DatabaseState,
  IdempotencyRecord
} from '../schema.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000801' as TenantId
const tenantB = 'tenant_00000000-0000-4000-8000-000000000802' as TenantId
const createdAt = new Date('2026-09-13T10:00:00.000Z')
const updatedAt = new Date('2026-09-13T10:05:00.000Z')

const conversationId = 'conv_00000000-0000-4000-8000-000000000801'
const messageId = 'msg_00000000-0000-4000-8000-000000000801'
const sessionId = 'sess_00000000-0000-4000-8000-000000000801'
const runId = 'run_00000000-0000-4000-8000-000000000801'
const toolCallId = 'call_00000000-0000-4000-8000-000000000801'
const approvalId = 'appr_00000000-0000-4000-8000-000000000801'
const taskId = 'task_00000000-0000-4000-8000-000000000801'
const ownerDraftId = 'owner_00000000-0000-4000-8000-000000000801'
const patientDraftId = 'patient_00000000-0000-4000-8000-000000000801'
const appointmentDraftId = 'appoint_00000000-0000-4000-8000-000000000801'
const auditEventId = 'audit_00000000-0000-4000-8000-000000000801'
const checkpointId = 'audit_checkpoint_00000000-0000-4000-8000-000000000801'
const outboxParentId = 'outbox_00000000-0000-4000-8000-000000000801'
const outboxChildId = 'outbox_00000000-0000-4000-8000-000000000802'

function fullState(tenantId: TenantId = tenantA): DatabaseState {
  return {
    conversations: [
      {
        tenantId,
        id: conversationId,
        channel: 'web',
        senderRef: 'owner@example.test',
        senderRefHash: 'fixture-hash',
        status: 'active',
        correlationId: 'corr_00000000-0000-4000-8000-000000000801',
        createdAt,
        updatedAt
      }
    ],
    messages: [
      {
        id: messageId,
        conversationId,
        externalMessageId: 'external-restore-full',
        direction: 'inbound',
        body: 'Contato owner@example.test',
        runtimeStatus: 'pending',
        createdAt
      }
    ],
    sessions: [
      {
        id: sessionId,
        conversationId,
        status: 'open',
        takeoverState: 'BOT_ACTIVE',
        createdAt,
        updatedAt
      }
    ],
    agentRuns: [
      { id: runId, sessionId, status: 'completed', createdAt, updatedAt }
    ],
    toolCalls: [
      {
        id: toolCallId,
        agentRunId: runId,
        toolName: 'fixture_tool',
        status: 'succeeded',
        input: { contact: 'owner@example.test' },
        output: { ok: true },
        error: null,
        createdAt
      }
    ],
    approvals: [
      {
        id: approvalId,
        sessionId,
        proposedAction: 'synthetic_action',
        summary: 'fixture summary',
        riskLevel: 'low',
        status: 'pending',
        decidedBy: null,
        decidedAt: null,
        createdAt
      }
    ],
    tasks: [
      {
        id: taskId,
        sessionId,
        title: 'fixture task',
        description: 'fixture description',
        priority: 'medium',
        source: 'fixture',
        status: 'open',
        idempotencyKey: 'restore-task-1',
        createdAt
      }
    ],
    auditEvents: [
      {
        id: auditEventId,
        tenantId,
        type: 'tool_call',
        actorType: 'System',
        actorId: 'fixture',
        correlationId: 'corr_00000000-0000-4000-8000-000000000801',
        policyVersion: 'fixture-v1',
        payload: { sessionId, fixtureTag: 'alpha' },
        createdAt
      }
    ],
    auditEvidenceCheckpoints: [
      {
        tenantId,
        id: checkpointId,
        filters: {},
        eventIds: [auditEventId],
        eventCount: 1,
        evidenceDigest: 'fixture-digest',
        status: 'SEALED',
        createdBy: 'fixture',
        updatedBy: 'fixture',
        createdAt,
        updatedAt
      }
    ],
    idempotency: [
      { key: 'idem-owner@example.test', resourceId: messageId, createdAt }
    ],
    outbox: [
      {
        id: outboxParentId,
        type: 'synthetic.parent',
        payload: { fixture: true, body: 'owner@example.test' },
        tenantId,
        correlationId: 'corr_00000000-0000-4000-8000-000000000801',
        idempotencyKey: 'restore-outbox-parent',
        conversationId,
        sessionId,
        inboundMessageId: messageId,
        status: 'pending',
        createdAt,
        availableAt: createdAt,
        attempts: 0,
        leaseOwner: null,
        leaseUntil: null,
        lastError: null,
        processedAt: null,
        deadLetteredAt: null,
        parentEventId: null
      },
      {
        id: outboxChildId,
        type: 'synthetic.child',
        payload: { fixture: true },
        tenantId,
        correlationId: 'corr_00000000-0000-4000-8000-000000000801',
        idempotencyKey: 'restore-outbox-child',
        conversationId,
        sessionId,
        inboundMessageId: messageId,
        status: 'pending',
        createdAt,
        availableAt: createdAt,
        attempts: 0,
        parentEventId: outboxParentId
      }
    ],
    outboxAttempts: [
      {
        eventId: outboxParentId,
        attempt: 1,
        tenantId,
        workerId: 'worker-fixture',
        claimedAt: createdAt,
        outcome: 'claimed',
        error: null
      }
    ],
    outboxEffects: [
      {
        tenantId,
        idempotencyKey: 'restore-outbox-parent',
        eventId: outboxParentId,
        result: { delivered: true },
        appliedAt: createdAt
      }
    ],
    ownerDrafts: [
      {
        tenantId,
        id: ownerDraftId,
        conversationId,
        sessionId,
        phone: '+5511999990801',
        name: 'owner@example.test',
        candidateIds: [],
        status: 'draft',
        idempotencyKey: 'restore-owner-801',
        createdAt,
        updatedAt,
        expiresAt: updatedAt
      }
    ],
    patientDrafts: [
      {
        tenantId,
        id: patientDraftId,
        ownerDraftId,
        ownerCandidateId: null,
        conversationId,
        sessionId,
        name: 'meu nome e Fixture Synthetic',
        species: 'canine',
        candidateIds: [],
        status: 'draft',
        idempotencyKey: 'restore-patient-801',
        createdAt,
        updatedAt,
        expiresAt: updatedAt
      }
    ],
    appointmentDrafts: [
      {
        tenantId,
        id: appointmentDraftId,
        patientDraftId,
        conversationId,
        sessionId,
        slot: '2026-09-14T10:00:00.000Z',
        sourceVersion: 'fixture-v1',
        status: 'proposed',
        confirmationBlocked: true,
        idempotencyKey: 'restore-appointment-801',
        createdAt,
        updatedAt,
        expiresAt: updatedAt
      }
    ]
  }
}

function mutate(
  tenantId: TenantId,
  change: (state: DatabaseState) => void
): DatabaseState {
  const state = fullState(tenantId)
  change(state)
  return state
}

function snapshotOf(state: DatabaseState) {
  return createDatabaseSnapshot(new InMemoryDatabase(state), {
    tenantId: tenantA
  })
}

function existingAuditEvent(
  overrides: Partial<AuditEventRecord> = {}
): AuditEventRecord {
  return {
    id: auditEventId,
    tenantId: tenantA,
    type: 'tool_call',
    actorType: 'System',
    actorId: 'fixture',
    correlationId: 'corr_00000000-0000-4000-8000-000000000801',
    policyVersion: 'fixture-v1',
    payload: { sessionId, fixtureTag: 'alpha' },
    createdAt,
    ...overrides
  }
}

describe('snapshot restore integrity', () => {
  it('round-trips every collection and exports a stable digest', () => {
    const source = new InMemoryDatabase(fullState())
    const snapshot = createDatabaseSnapshot(source, { tenantId: tenantA })
    const target = new InMemoryDatabase()

    const result = restoreDatabaseSnapshot(target, snapshot, {
      tenantId: tenantA
    })

    expect(result.digest).toBe(snapshot.digest)
    expect(digestDatabaseState(target.state)).toBe(snapshot.digest)
    expect(target.state.conversations).toHaveLength(1)
    expect(target.state.messages).toHaveLength(1)
    expect(target.state.sessions).toHaveLength(1)
    expect(target.state.agentRuns).toHaveLength(1)
    expect(target.state.toolCalls).toHaveLength(1)
    expect(target.state.approvals).toHaveLength(1)
    expect(target.state.tasks).toHaveLength(1)
    expect(target.state.auditEvents).toHaveLength(1)
    expect(target.state.auditEvidenceCheckpoints).toHaveLength(1)
    expect(target.state.idempotency).toHaveLength(1)
    expect(target.state.outbox).toHaveLength(2)
    expect(target.state.outboxAttempts).toHaveLength(1)
    expect(target.state.outboxEffects).toHaveLength(1)
    expect(target.state.ownerDrafts).toHaveLength(1)
    expect(target.state.patientDrafts).toHaveLength(1)
    expect(target.state.appointmentDrafts).toHaveLength(1)
  })

  it('redacts sensitive text across operational collections', () => {
    const snapshot = createDatabaseSnapshot(new InMemoryDatabase(fullState()), {
      tenantId: tenantA
    })

    const serialized = JSON.stringify(snapshot.state)
    expect(serialized).not.toContain('owner@example.test')
    expect(snapshot.state.messages[0]?.body).toContain('[redacted-email]')
    expect(snapshot.state.idempotency[0]?.key).toContain('[redacted-email]')
    expect(snapshot.state.outbox[0]?.payload).toMatchObject({
      body: '[redacted-email]'
    })
    expect(snapshot.state.toolCalls[0]?.input).toMatchObject({
      contact: '[redacted-email]'
    })
    expect(snapshot.state.ownerDrafts[0]?.phone).toBe('[redacted-phone]')
    expect(snapshot.state.patientDrafts[0]?.name).toContain('[redacted-name]')
  })

  it('accepts snapshots without a tenant scope and rejects unsupported formats', () => {
    const source = new InMemoryDatabase(fullState())
    const unscoped = createDatabaseSnapshot(source)
    expect(unscoped.state.conversations).toHaveLength(1)

    const target = new InMemoryDatabase()
    expect(() =>
      restoreDatabaseSnapshot(target, {
        ...unscoped,
        formatVersion: 2 as unknown as 1
      })
    ).toThrowError(/format is unsupported/i)
    expect(() =>
      restoreDatabaseSnapshot(target, { ...unscoped, digest: 'tampered' })
    ).toThrowError(/digest mismatch/i)
  })

  it('rejects unknown, unavailable and cross-tenant ownership', () => {
    const cases: Array<[DatabaseState, RegExp]> = [
      [
        mutate(tenantA, (state) => {
          state.messages[0]!.conversationId = 'conv_missing'
        }),
        /Message conversation/
      ],
      [
        mutate(tenantA, (state) => {
          state.sessions[0]!.conversationId = 'conv_missing'
        }),
        /Session conversation/
      ],
      [
        mutate(tenantA, (state) => {
          state.agentRuns[0]!.sessionId = 'sess_missing'
        }),
        /Agent run session/
      ],
      [
        mutate(tenantA, (state) => {
          state.toolCalls[0]!.agentRunId = 'run_missing'
        }),
        /Tool call run/
      ],
      [
        mutate(tenantA, (state) => {
          state.approvals[0]!.sessionId = 'sess_missing'
        }),
        /Approval session/
      ],
      [
        mutate(tenantA, (state) => {
          state.tasks[0]!.sessionId = 'sess_missing'
        }),
        /Task session/
      ],
      [
        mutate(tenantA, (state) => {
          state.ownerDrafts[0]!.conversationId = 'conv_missing'
        }),
        /Owner draft conversation/
      ],
      [
        mutate(tenantA, (state) => {
          state.ownerDrafts[0]!.sessionId = 'sess_missing'
        }),
        /Owner draft session/
      ],
      [
        mutate(tenantA, (state) => {
          state.patientDrafts[0]!.ownerDraftId = 'owner_missing'
        }),
        /Patient owner draft/
      ],
      [
        mutate(tenantA, (state) => {
          state.patientDrafts[0]!.conversationId = 'conv_missing'
        }),
        /Patient draft conversation/
      ],
      [
        mutate(tenantA, (state) => {
          state.patientDrafts[0]!.sessionId = 'sess_missing'
        }),
        /Patient draft session/
      ],
      [
        mutate(tenantA, (state) => {
          state.appointmentDrafts[0]!.patientDraftId = 'patient_missing'
        }),
        /Appointment patient draft/
      ],
      [
        mutate(tenantA, (state) => {
          state.appointmentDrafts[0]!.conversationId = 'conv_missing'
        }),
        /Appointment draft conversation/
      ],
      [
        mutate(tenantA, (state) => {
          state.appointmentDrafts[0]!.sessionId = 'sess_missing'
        }),
        /Appointment draft session/
      ],
      [
        mutate(tenantA, (state) => {
          delete state.auditEvents[0]!.tenantId
        }),
        /Audit event tenant ownership is unavailable/
      ],
      [
        mutate(tenantA, (state) => {
          state.auditEvidenceCheckpoints[0]!.eventIds = ['audit_missing']
        }),
        /Audit checkpoint event/
      ],
      [
        mutate(tenantA, (state) => {
          state.outbox[1]!.parentEventId = 'outbox_missing'
        }),
        /Outbox parent event/
      ],
      [
        mutate(tenantA, (state) => {
          state.outboxAttempts[0]!.eventId = 'outbox_missing'
        }),
        /Outbox attempt event/
      ],
      [
        mutate(tenantA, (state) => {
          state.outboxEffects[0]!.eventId = 'outbox_missing'
        }),
        /Outbox effect event/
      ],
      [
        mutate(tenantA, (state) => {
          state.idempotency[0] = {
            key: 'idem-explicit-801',
            resourceId: messageId,
            createdAt,
            tenantId: tenantB
          } as IdempotencyRecord
        }),
        /Idempotency record is outside the snapshot tenant/
      ],
      [
        mutate(tenantA, (state) => {
          state.idempotency[0] = {
            key: 'idem-unknown-resource',
            resourceId: 'msg_missing',
            createdAt
          }
        }),
        /Idempotency resource/
      ]
    ]

    for (const [state, pattern] of cases) {
      expect(() => snapshotOf(state)).toThrowError(pattern)
    }
  })

  it('resolves outbox ownership from related records when the event tenant is absent', () => {
    const state = mutate(tenantA, (change) => {
      delete change.outbox[0]!.tenantId
    })
    const snapshot = snapshotOf(state)
    expect(snapshot.state.outbox).toHaveLength(2)
  })

  it('falls back to resource ownership for non-string idempotency tenants', () => {
    const state = mutate(tenantA, (change) => {
      change.idempotency[0] = {
        key: 'idem-numeric-tenant',
        resourceId: messageId,
        createdAt,
        tenantId: 42
      } as unknown as IdempotencyRecord
    })
    const snapshot = snapshotOf(state)
    expect(snapshot.state.idempotency).toHaveLength(1)
  })

  it('allows optional draft references to be absent', () => {
    const state = mutate(tenantA, (change) => {
      change.ownerDrafts[0]!.conversationId = null
      change.ownerDrafts[0]!.sessionId = null
      change.patientDrafts[0]!.ownerDraftId = null
      change.patientDrafts[0]!.conversationId = null
      change.patientDrafts[0]!.sessionId = null
      change.appointmentDrafts[0]!.conversationId = null
      change.appointmentDrafts[0]!.sessionId = null
    })
    const snapshot = snapshotOf(state)
    expect(snapshot.state.appointmentDrafts).toHaveLength(1)
  })

  it('rejects a snapshot whose tenant differs from the restoration scope', () => {
    const snapshot = createDatabaseSnapshot(
      new InMemoryDatabase(fullState(tenantB))
    )
    expect(() =>
      restoreDatabaseSnapshot(new InMemoryDatabase(), snapshot, {
        tenantId: tenantA
      })
    ).toThrowError(/another tenant/)
  })

  it('rejects a pre-existing audit checkpoint that references a missing event', () => {
    const target = new InMemoryDatabase()
    target.state.auditEvidenceCheckpoints.push({
      tenantId: tenantA,
      id: checkpointId,
      filters: {},
      eventIds: ['audit_missing'],
      eventCount: 1,
      evidenceDigest: 'target-digest',
      status: 'SEALED',
      createdBy: 'fixture',
      updatedBy: 'fixture',
      createdAt,
      updatedAt
    })
    expect(() =>
      restoreDatabaseSnapshot(target, snapshotOf(fullState()), {
        tenantId: tenantA
      })
    ).toThrowError(/references a missing event/)
  })

  it('rejects a pre-existing audit checkpoint owned by another tenant', () => {
    const target = new InMemoryDatabase()
    target.state.auditEvidenceCheckpoints.push({
      tenantId: tenantB,
      id: checkpointId,
      filters: {},
      eventIds: [],
      eventCount: 0,
      evidenceDigest: 'target-digest',
      status: 'SEALED',
      createdBy: 'fixture',
      updatedBy: 'fixture',
      createdAt,
      updatedAt
    })
    expect(() =>
      restoreDatabaseSnapshot(target, snapshotOf(fullState()), {
        tenantId: tenantA
      })
    ).toThrowError(/Existing audit evidence checkpoint/)
  })

  it('merges identical append-only history and rejects collisions', () => {
    const target = new InMemoryDatabase()
    target.state.auditEvents.push(existingAuditEvent())
    const restored = restoreDatabaseSnapshot(target, snapshotOf(fullState()), {
      tenantId: tenantA
    })
    expect(restored.digest).toBeTruthy()
    expect(target.state.auditEvents).toHaveLength(1)

    const colliding = new InMemoryDatabase()
    colliding.state.auditEvents.push(
      existingAuditEvent({ payload: { sessionId, fixtureTag: 'beta' } })
    )
    expect(() =>
      restoreDatabaseSnapshot(colliding, snapshotOf(fullState()), {
        tenantId: tenantA
      })
    ).toThrowError(/Audit event collision during restore/)
  })

  it('rejects a checkpoint collision during restore merge', () => {
    const target = new InMemoryDatabase()
    target.state.auditEvents.push(existingAuditEvent())
    target.state.auditEvidenceCheckpoints.push({
      tenantId: tenantA,
      id: checkpointId,
      filters: {},
      eventIds: [auditEventId],
      eventCount: 1,
      evidenceDigest: 'different-digest',
      status: 'SEALED',
      createdBy: 'fixture',
      updatedBy: 'fixture',
      createdAt,
      updatedAt
    })
    expect(() =>
      restoreDatabaseSnapshot(target, snapshotOf(fullState()), {
        tenantId: tenantA
      })
    ).toThrowError(/Audit evidence checkpoint collision during restore/)
  })
})
