import { describe, expect, it } from 'vitest'
import type { TenantId } from '@cvg/platform'
import { InMemoryDatabase } from '../db.ts'
import {
  CaseAuthorityError,
  InMemoryCaseAuthority,
  assertRegistryQuery,
  caseProofDigest,
  isCaseId,
  type CaseAssignmentWriteInput
} from '../case-authority.ts'
import { ConversationRepository } from '../repositories/conversation-repository.ts'

/**
 * SPEC0176 — synthetic in-memory authority invariants that the HTTP matrix
 * cannot reach directly (lineage conflicts, CAS edges, input validation).
 */
const TENANT = 'tenant_00000000-0000-4000-8000-000000000179' as TenantId
const OTHER = 'tenant_00000000-0000-4000-8000-000000000180' as TenantId

function setup() {
  const db = new InMemoryDatabase()
  const authority = new InMemoryCaseAuthority(db, {
    clock: () => new Date('2026-10-20T12:00:00.000Z')
  })
  const conversations = new ConversationRepository(db)
  const created = conversations.createWithSession({
    tenantId: TENANT,
    channel: 'web',
    senderRef: 'synthetic',
    externalMessageId: `memory-${Math.random()}`,
    body: 'Synthetic'
  })
  return { db, authority, conversations, created }
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
    return 'resolved'
  } catch (error) {
    return error instanceof CaseAuthorityError ? error.code : String(error)
  }
}

function write(
  overrides: Partial<CaseAssignmentWriteInput>
): CaseAssignmentWriteInput {
  return {
    tenantId: TENANT,
    caseId: '00000000-0000-4000-8000-000000000001',
    operatorId: 'operator.memory',
    status: 'ACTIVE',
    expectedRevision: 0,
    actor: { operatorId: 'supervisor.memory', role: 'Supervisor' },
    correlationId: 'corr_00000000-0000-4000-8000-000000000001',
    actorPrincipal: { required: false, authorityVersion: null },
    ...overrides
  }
}

describe('SPEC0176 in-memory case authority', () => {
  it('validates principal state and applies CAS revisions', async () => {
    const { authority } = setup()
    const base = {
      tenantId: TENANT,
      operatorId: 'operator.memory',
      role: 'Operator' as const,
      active: true,
      expectedRevision: 0,
      authorityVersion: 'v1',
      proofRef: 'synthetic-proof',
      identitySource: 'synthetic_fixture' as const
    }
    expect(
      await code(
        authority.applyVerifiedPrincipalState({ ...base, proofRef: 'x' })
      )
    ).toBe('validation_failed')
    expect(
      await code(
        authority.applyVerifiedPrincipalState({
          ...base,
          identitySource: 'login_cookie' as never
        })
      )
    ).toBe('validation_failed')
    const first = await authority.applyVerifiedPrincipalState(base)
    expect(first.revision).toBe(1)
    expect(await code(authority.applyVerifiedPrincipalState(base))).toBe(
      'principal_conflict'
    )
    expect(caseProofDigest('synthetic-proof')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('enforces root, actor currency and registry validation on writes', async () => {
    const { authority, created } = setup()
    expect(await code(authority.putAssignment(write({})))).toBe(
      'case_not_found'
    )
    expect(
      await code(authority.putAssignment(write({ caseId: 'not-a-uuid' })))
    ).toBe('validation_failed')
    expect(
      await code(
        authority.putAssignment(
          write({ actorPrincipal: { required: true, authorityVersion: 'v1' } })
        )
      )
    ).toBe('principal_not_current')
    await authority.applyVerifiedPrincipalState({
      tenantId: TENANT,
      operatorId: 'supervisor.memory',
      role: 'Supervisor',
      active: false,
      expectedRevision: 0,
      authorityVersion: 'v1',
      proofRef: 'synthetic-proof',
      identitySource: 'synthetic_fixture'
    })
    expect(await code(authority.putAssignment(write({})))).toBe(
      'principal_not_current'
    )
    expect(() =>
      assertRegistryQuery({ resourceId: 'conv_x', limit: 1, offset: 0 })
    ).toThrow(CaseAuthorityError)
    const roots = await authority.readSnapshot(TENANT, (snapshot) =>
      snapshot.listRoots({ kind: 'core_conversation', limit: 10, offset: 0 })
    )
    expect(roots.items).toEqual([
      expect.objectContaining({ resourceId: created.conversation.id })
    ])
    expect(isCaseId(roots.items[0]?.caseId)).toBe(true)
    const otherTenant = await authority.readSnapshot(OTHER, (snapshot) =>
      snapshot.listRoots({ limit: 10, offset: 0 })
    )
    expect(otherTenant.items).toEqual([])
  })

  it('keeps execution lineage immutable and never invents a link', async () => {
    const { authority, created } = setup()
    const core = {
      kind: 'core' as const,
      conversationId: created.conversation.id,
      sessionId: created.session.id
    }
    await authority.registerExecutionLink(TENANT, 'exec_memory_1', core, true)
    await authority.registerExecutionLink(TENANT, 'exec_memory_1', core, false)
    expect(
      await code(
        authority.registerExecutionLink(
          TENANT,
          'exec_memory_1',
          { kind: 'independent', conversationId: 'c', sessionId: 's' },
          false
        )
      )
    ).toBe('case_link_conflict')
    await authority.registerExecutionLink(
      TENANT,
      'exec_legacy',
      { kind: 'independent', conversationId: 'c', sessionId: 's' },
      false
    )
    expect(
      await authority.readSnapshot(TENANT, (snapshot) =>
        snapshot.executionCase('exec_legacy')
      )
    ).toBeNull()
    expect(
      await code(
        authority.registerExecutionLink(
          TENANT,
          'exec_memory_2',
          {
            kind: 'independent',
            conversationId: created.conversation.id,
            sessionId: 'session_absent'
          },
          true
        )
      )
    ).toBe('case_parent_invalid')
    expect(
      await code(
        authority.registerExecutionLink(
          TENANT,
          'exec_memory_3',
          { ...core, sessionId: 'session_absent' },
          true
        )
      )
    ).toBe('case_parent_invalid')
    expect(
      await authority.classifyCoreParents(
        OTHER,
        core.conversationId,
        core.sessionId
      )
    ).toEqual({ kind: 'independent' })
  })

  it('links audit only to an existing session and backfills roots in batches', async () => {
    const { authority, db, conversations } = setup()
    expect(
      await code(
        authority.appendLinkedAudit(
          TENANT,
          {
            type: 'integration_event',
            actorType: 'System',
            actorId: 'api',
            correlationId: 'corr_x',
            policyVersion: 'v1',
            payload: { tenantId: TENANT }
          },
          { kind: 'core', sessionId: 'session_absent' }
        )
      )
    ).toBe('case_parent_invalid')
    expect(
      await authority.readSnapshot(TENANT, async (snapshot) => ({
        harness: await snapshot.harnessSessionCase('c', 's'),
        events: await snapshot.linkedAuditEvents({
          kind: 'harness',
          conversationId: 'c',
          sessionId: 's'
        }),
        session: await snapshot.coreSessionCase('session_absent')
      }))
    ).toEqual({ harness: null, events: [], session: null })
    // A conversation persisted without a root (historical data) is rooted
    // only by the lineage backfill.
    db.state.conversations = [
      ...db.state.conversations,
      {
        ...db.state.conversations[0]!,
        id: 'conv_historical'
      }
    ]
    expect(
      await code(
        authority.backfillCoreRoots(TENANT, {
          afterConversationId: null,
          limit: 0
        })
      )
    ).toBe('validation_failed')
    const first = await authority.backfillCoreRoots(TENANT, {
      afterConversationId: null,
      limit: 100
    })
    expect(first.created).toBe(1)
    const again = await authority.backfillCoreRoots(TENANT, {
      afterConversationId: first.lastConversationId,
      limit: 100
    })
    expect(again).toEqual({ created: 0, lastConversationId: null })
    expect(
      conversations.listPage(TENANT, { limit: 10, offset: 0 }).items
    ).toHaveLength(2)
  })
})
