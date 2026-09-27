import { describe, expect, it } from 'vitest'
import { InMemoryDatabase } from '../db.ts'
import { createDatabaseSnapshot, restoreDatabaseSnapshot } from '../restore.ts'

const tenantId = 'tenant_00000000-0000-0000-0000-000000000701' as const

describe('controlled snapshot restore', () => {
  it('restores an exact synthetic state by digest and rejects tampering/cross-tenant content', () => {
    // SPEC-LEGACY-004: a neutral tenant-scoped record exercises the restore
    // mechanism; the legacy journey tables are covered in their own package.
    const conversation = (
      tenant: string,
      id: string
    ): InMemoryDatabase['state']['conversations'][number] => ({
      tenantId: tenant,
      id,
      channel: 'web',
      senderRef: 'sender-restore-fixture',
      senderRefHash: 'fixture-hash',
      status: 'active',
      correlationId: `corr_${id}`,
      createdAt: new Date('2026-09-05T12:00:00.000Z'),
      updatedAt: new Date('2026-09-05T12:00:00.000Z')
    })
    const source = new InMemoryDatabase()
    source.state.conversations.push(
      conversation(tenantId, 'conversation_restore_701')
    )
    const snapshot = createDatabaseSnapshot(source, { tenantId })
    const restored = new InMemoryDatabase()
    expect(
      restoreDatabaseSnapshot(restored, snapshot, { tenantId }).digest
    ).toBe(snapshot.digest)
    expect(restored.state.conversations).toHaveLength(1)
    const tampered = {
      ...snapshot,
      state: { ...snapshot.state, conversations: [] }
    }
    expect(() =>
      restoreDatabaseSnapshot(new InMemoryDatabase(), tampered)
    ).toThrow(/digest/i)
    const otherTenant = new InMemoryDatabase()
    otherTenant.state.conversations.push(
      conversation(
        'tenant_00000000-0000-0000-0000-000000000702',
        'conversation_restore_702'
      )
    )
    expect(() =>
      restoreDatabaseSnapshot(
        otherTenant,
        createDatabaseSnapshot(otherTenant),
        { tenantId }
      )
    ).toThrow(/another tenant/i)
  })

  it('redacts operational text and idempotency references before export', () => {
    const db = new InMemoryDatabase()
    const conversationId = 'conversation_restore_redaction_701'
    const messageId = 'message_restore_redaction_701'
    db.state.conversations.push({
      tenantId,
      id: conversationId,
      channel: 'web',
      senderRef: 'owner@example.com',
      senderRefHash: 'fixture-hash',
      status: 'active',
      correlationId: 'corr_restore_redaction_701',
      createdAt: new Date('2026-09-05T12:00:00.000Z'),
      updatedAt: new Date('2026-09-05T12:00:00.000Z')
    })
    db.state.messages.push({
      id: messageId,
      conversationId,
      externalMessageId: 'external-message-701',
      direction: 'inbound',
      body: 'Contato owner@example.com, telefone +55 11 99999-0001',
      runtimeStatus: 'completed',
      createdAt: new Date('2026-09-05T12:00:00.000Z')
    })
    db.state.idempotency.push({
      key: 'inbound:owner@example.com',
      resourceId: messageId,
      createdAt: new Date('2026-09-05T12:00:00.000Z')
    })

    const snapshot = createDatabaseSnapshot(db, { tenantId })
    const serialized = JSON.stringify(snapshot.state)
    expect(serialized).not.toContain('owner@example.com')
    expect(serialized).not.toContain('+55 11 99999-0001')
    expect(snapshot.state.messages[0]?.body).toContain('[redacted-email]')
    expect(snapshot.state.messages[0]?.body).toContain('[redacted-phone]')
    expect(snapshot.state.idempotency[0]?.key).toContain('[redacted-email]')
  })

  it('preserves existing audit history while restoring operational state', () => {
    const source = new InMemoryDatabase()
    source.state.auditEvents.push({
      id: 'audit_restore_incoming_701',
      tenantId,
      type: 'integration_event',
      actorType: 'System',
      actorId: 'restore-fixture',
      correlationId: 'corr_restore_incoming_701',
      policyVersion: 'restore-test-v1',
      payload: { body: 'fixture@example.com' },
      createdAt: new Date('2026-09-05T12:00:00.000Z')
    })
    const target = new InMemoryDatabase()
    target.state.auditEvents.push({
      id: 'audit_restore_existing_701',
      tenantId,
      type: 'handoff',
      actorType: 'System',
      actorId: 'existing-fixture',
      correlationId: 'corr_restore_existing_701',
      policyVersion: 'restore-test-v1',
      payload: { reason: 'prior audit' },
      createdAt: new Date('2026-09-05T11:00:00.000Z')
    })
    const snapshot = createDatabaseSnapshot(source, { tenantId })

    const result = restoreDatabaseSnapshot(target, snapshot, { tenantId })
    expect(target.state.auditEvents.map((event) => event.id)).toEqual([
      'audit_restore_existing_701',
      'audit_restore_incoming_701'
    ])
    expect(target.state.auditEvents[1]?.payload).toEqual({})
    expect(result.digest).toBeTruthy()
  })

  it('rejects an idempotency record whose resource belongs to another tenant', () => {
    const db = new InMemoryDatabase()
    const otherTenant = 'tenant_00000000-0000-0000-0000-000000000702' as const
    const conversationId = 'conversation_restore_scope_701'
    const messageId = 'message_restore_scope_701'
    db.state.conversations.push({
      tenantId: otherTenant,
      id: conversationId,
      channel: 'web',
      senderRef: 'fixture-sender',
      senderRefHash: 'fixture-hash',
      status: 'active',
      correlationId: 'corr_restore_scope_701',
      createdAt: new Date('2026-09-05T12:00:00.000Z'),
      updatedAt: new Date('2026-09-05T12:00:00.000Z')
    })
    db.state.messages.push({
      id: messageId,
      conversationId,
      externalMessageId: 'external-restore-scope-701',
      direction: 'inbound',
      body: 'fixture',
      createdAt: new Date('2026-09-05T12:00:00.000Z')
    })
    db.state.idempotency.push({
      key: 'scope-key-701',
      resourceId: messageId,
      createdAt: new Date('2026-09-05T12:00:00.000Z')
    })

    expect(() => createDatabaseSnapshot(db, { tenantId })).toThrow(
      /another tenant/i
    )
  })

  it('does not preserve an existing audit trail from another tenant', () => {
    const source = new InMemoryDatabase()
    const snapshot = createDatabaseSnapshot(source, { tenantId })
    const target = new InMemoryDatabase()
    target.state.auditEvents.push({
      id: 'audit_restore_other_701',
      tenantId: 'tenant_00000000-0000-0000-0000-000000000702',
      type: 'handoff',
      actorType: 'System',
      actorId: 'other-fixture',
      correlationId: 'corr_restore_other_701',
      policyVersion: 'restore-test-v1',
      payload: { reason: 'other tenant' },
      createdAt: new Date('2026-09-05T11:00:00.000Z')
    })

    expect(() =>
      restoreDatabaseSnapshot(target, snapshot, { tenantId })
    ).toThrow(/another tenant/i)
  })
})
