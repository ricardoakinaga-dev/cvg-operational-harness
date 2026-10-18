import { createHash } from 'node:crypto'
import {
  DomainError,
  redactSensitiveText,
  sanitizeAuditEvidencePayload
} from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import type { InMemoryDatabase } from './db.ts'
import type {
  AuditEventRecord,
  DatabaseState,
  OutboxEventRecord
} from './schema.ts'

export interface DatabaseSnapshot {
  formatVersion: 1
  capturedAt: string
  digest: string
  state: DatabaseState
}

export function createDatabaseSnapshot(
  db: InMemoryDatabase,
  options: { tenantId?: TenantId } = {}
): DatabaseSnapshot {
  const tenantId = options.tenantId
    ? TenantIdSchema.parse(options.tenantId)
    : undefined
  const state = redactSnapshotState(cloneState(db.state))
  if (tenantId) assertStateTenant(state, tenantId)
  return {
    formatVersion: 1,
    capturedAt: new Date().toISOString(),
    digest: digestState(state),
    state
  }
}

export function restoreDatabaseSnapshot(
  db: InMemoryDatabase,
  snapshot: DatabaseSnapshot,
  options: { tenantId?: TenantId } = {}
): { digest: string; restoredAt: string } {
  if (snapshot.formatVersion !== 1)
    throw new DomainError('validation_failed', 'Snapshot format is unsupported')
  const snapshotState = cloneState(snapshot.state)
  const snapshotDigest = digestState(snapshotState)
  if (snapshotDigest !== snapshot.digest)
    throw new DomainError('conflict', 'Snapshot digest mismatch')
  const tenantId = options.tenantId
    ? TenantIdSchema.parse(options.tenantId)
    : undefined
  if (tenantId) assertStateTenant(snapshotState, tenantId)
  if (tenantId) assertAuditTrailTenant(db.state, tenantId)

  // Restore replaces mutable operational state, but audit history is append-only.
  // Build the complete result before replacing the target so a merge collision
  // cannot leave a partially restored database.
  const state = redactSnapshotState(snapshotState)
  state.auditEvents = mergeAuditEvents(db.state.auditEvents, state.auditEvents)
  state.auditEvidenceCheckpoints = mergeAppendOnlyRecords(
    db.state.auditEvidenceCheckpoints,
    state.auditEvidenceCheckpoints,
    'Audit evidence checkpoint'
  )
  const digest = digestState(state)
  replaceState(db.state, state)
  return { digest, restoredAt: new Date().toISOString() }
}

export function digestDatabaseState(state: DatabaseState): string {
  return digestState(cloneState(state))
}

function assertStateTenant(state: DatabaseState, tenantId: TenantId): void {
  const conversations = new Map<string, TenantId>()
  const messages = new Map<string, TenantId>()
  const sessions = new Map<string, TenantId>()
  const agentRuns = new Map<string, TenantId>()
  const toolCalls = new Map<string, TenantId>()
  const approvals = new Map<string, TenantId>()
  const tasks = new Map<string, TenantId>()
  const ownerDrafts = new Map<string, TenantId>()
  const patientDrafts = new Map<string, TenantId>()
  const appointmentDrafts = new Map<string, TenantId>()
  const auditEvents = new Map<string, TenantId>()
  const outbox = new Map<string, TenantId>()
  const resourceTenants = new Map<string, TenantId>()

  for (const conversation of state.conversations) {
    const owner = assertDirectTenant(
      conversation.tenantId,
      tenantId,
      'Conversation'
    )
    setOwnership(conversations, conversation.id, owner, 'Conversation')
    setOwnership(resourceTenants, conversation.id, owner, 'Conversation')
  }

  for (const message of state.messages) {
    const owner = assertRelatedTenant(
      conversations.get(message.conversationId),
      tenantId,
      'Message conversation'
    )
    setOwnership(messages, message.id, owner, 'Message')
    setOwnership(resourceTenants, message.id, owner, 'Message')
  }

  for (const session of state.sessions) {
    const owner = assertRelatedTenant(
      conversations.get(session.conversationId),
      tenantId,
      'Session conversation'
    )
    setOwnership(sessions, session.id, owner, 'Session')
    setOwnership(resourceTenants, session.id, owner, 'Session')
  }

  for (const run of state.agentRuns) {
    const owner = assertRelatedTenant(
      sessions.get(run.sessionId),
      tenantId,
      'Agent run session'
    )
    setOwnership(agentRuns, run.id, owner, 'Agent run')
    setOwnership(resourceTenants, run.id, owner, 'Agent run')
  }

  for (const call of state.toolCalls) {
    const owner = assertRelatedTenant(
      agentRuns.get(call.agentRunId),
      tenantId,
      'Tool call run'
    )
    setOwnership(toolCalls, call.id, owner, 'Tool call')
    setOwnership(resourceTenants, call.id, owner, 'Tool call')
  }

  for (const approval of state.approvals) {
    const owner = assertRelatedTenant(
      sessions.get(approval.sessionId),
      tenantId,
      'Approval session'
    )
    setOwnership(approvals, approval.id, owner, 'Approval')
    setOwnership(resourceTenants, approval.id, owner, 'Approval')
  }

  for (const task of state.tasks) {
    const owner = assertRelatedTenant(
      sessions.get(task.sessionId),
      tenantId,
      'Task session'
    )
    setOwnership(tasks, task.id, owner, 'Task')
    setOwnership(resourceTenants, task.id, owner, 'Task')
  }

  for (const draft of state.ownerDrafts) {
    const owner = assertDirectTenant(draft.tenantId, tenantId, 'Owner draft')
    assertOptionalRelatedTenant(
      draft.conversationId,
      conversations,
      tenantId,
      'Owner draft conversation'
    )
    assertOptionalRelatedTenant(
      draft.sessionId,
      sessions,
      tenantId,
      'Owner draft session'
    )
    setOwnership(ownerDrafts, draft.id, owner, 'Owner draft')
    setOwnership(resourceTenants, draft.id, owner, 'Owner draft')
  }

  for (const draft of state.patientDrafts) {
    const owner = assertDirectTenant(draft.tenantId, tenantId, 'Patient draft')
    if (draft.ownerDraftId) {
      assertRelatedTenant(
        ownerDrafts.get(draft.ownerDraftId),
        tenantId,
        'Patient owner draft'
      )
    }
    assertOptionalRelatedTenant(
      draft.conversationId,
      conversations,
      tenantId,
      'Patient draft conversation'
    )
    assertOptionalRelatedTenant(
      draft.sessionId,
      sessions,
      tenantId,
      'Patient draft session'
    )
    setOwnership(patientDrafts, draft.id, owner, 'Patient draft')
    setOwnership(resourceTenants, draft.id, owner, 'Patient draft')
  }

  for (const draft of state.appointmentDrafts) {
    const owner = assertDirectTenant(
      draft.tenantId,
      tenantId,
      'Appointment draft'
    )
    assertRelatedTenant(
      patientDrafts.get(draft.patientDraftId),
      tenantId,
      'Appointment patient draft'
    )
    assertOptionalRelatedTenant(
      draft.conversationId,
      conversations,
      tenantId,
      'Appointment draft conversation'
    )
    assertOptionalRelatedTenant(
      draft.sessionId,
      sessions,
      tenantId,
      'Appointment draft session'
    )
    setOwnership(appointmentDrafts, draft.id, owner, 'Appointment draft')
    setOwnership(resourceTenants, draft.id, owner, 'Appointment draft')
  }

  for (const event of state.auditEvents) {
    const owner = assertDirectTenant(event.tenantId, tenantId, 'Audit event')
    setOwnership(auditEvents, event.id, owner, 'Audit event')
    setOwnership(resourceTenants, event.id, owner, 'Audit event')
  }

  for (const checkpoint of state.auditEvidenceCheckpoints) {
    const owner = assertDirectTenant(
      checkpoint.tenantId,
      tenantId,
      'Audit evidence checkpoint'
    )
    for (const eventId of checkpoint.eventIds) {
      assertRelatedTenant(
        auditEvents.get(eventId),
        tenantId,
        'Audit checkpoint event'
      )
    }
    setOwnership(
      resourceTenants,
      checkpoint.id,
      owner,
      'Audit evidence checkpoint'
    )
  }

  for (const event of state.outbox) {
    const owner = assertOutboxTenant(
      event,
      tenantId,
      conversations,
      sessions,
      messages
    )
    setOwnership(outbox, event.id, owner, 'Outbox event')
    setOwnership(resourceTenants, event.id, owner, 'Outbox event')
  }

  for (const event of state.outbox) {
    if (event.parentEventId) {
      assertRelatedTenant(
        outbox.get(event.parentEventId),
        tenantId,
        'Outbox parent event'
      )
    }
  }

  for (const attempt of state.outboxAttempts) {
    const owner = assertDirectTenant(
      attempt.tenantId,
      tenantId,
      'Outbox attempt'
    )
    assertRelatedTenant(
      outbox.get(attempt.eventId),
      tenantId,
      'Outbox attempt event'
    )
    setOwnership(resourceTenants, attempt.eventId, owner, 'Outbox attempt')
  }

  for (const effect of state.outboxEffects) {
    const owner = assertDirectTenant(effect.tenantId, tenantId, 'Outbox effect')
    assertRelatedTenant(
      outbox.get(effect.eventId),
      tenantId,
      'Outbox effect event'
    )
    setOwnership(resourceTenants, effect.eventId, owner, 'Outbox effect')
  }

  for (const record of state.idempotency) {
    const explicitOwner = getOptionalTenant(record)
    const owner = explicitOwner
      ? assertDirectTenant(explicitOwner, tenantId, 'Idempotency record')
      : resourceTenants.get(record.resourceId)
    assertRelatedTenant(owner, tenantId, 'Idempotency resource')
  }
}

function assertAuditTrailTenant(
  state: DatabaseState,
  tenantId: TenantId
): void {
  const eventIds = new Set<string>()
  for (const event of state.auditEvents) {
    assertDirectTenant(event.tenantId, tenantId, 'Existing audit event')
    eventIds.add(event.id)
  }
  for (const checkpoint of state.auditEvidenceCheckpoints) {
    assertDirectTenant(
      checkpoint.tenantId,
      tenantId,
      'Existing audit evidence checkpoint'
    )
    for (const eventId of checkpoint.eventIds) {
      if (!eventIds.has(eventId)) {
        throw new DomainError(
          'conflict',
          'Existing audit evidence checkpoint references a missing event'
        )
      }
    }
  }
}

function assertRelatedTenant(
  relatedTenant: TenantId | undefined,
  expectedTenant: TenantId,
  resource: string
): TenantId {
  if (relatedTenant !== expectedTenant) {
    throw new DomainError(
      'forbidden',
      `${resource} is outside the snapshot tenant; another tenant or unknown ownership`
    )
  }
  return relatedTenant
}

function assertDirectTenant(
  relatedTenant: TenantId | undefined,
  expectedTenant: TenantId,
  resource: string
): TenantId {
  if (relatedTenant === undefined) {
    throw new DomainError(
      'forbidden',
      `${resource} tenant ownership is unavailable`
    )
  }
  return assertRelatedTenant(relatedTenant, expectedTenant, resource)
}

function assertOptionalRelatedTenant(
  relatedId: string | null | undefined,
  owners: Map<string, TenantId>,
  expectedTenant: TenantId,
  resource: string
): void {
  if (relatedId === null || relatedId === undefined) return
  assertRelatedTenant(owners.get(relatedId), expectedTenant, resource)
}

function setOwnership(
  owners: Map<string, TenantId>,
  id: string,
  tenantId: TenantId,
  resource: string
): void {
  const existing = owners.get(id)
  if (existing !== undefined && existing !== tenantId) {
    throw new DomainError('forbidden', `${resource} ownership is inconsistent`)
  }
  owners.set(id, tenantId)
}

function getOptionalTenant(record: object): TenantId | undefined {
  if (!('tenantId' in record)) return undefined
  const tenantId = (record as { tenantId?: unknown }).tenantId
  return typeof tenantId === 'string' ? (tenantId as TenantId) : undefined
}

function assertOutboxTenant(
  event: OutboxEventRecord,
  expectedTenant: TenantId,
  conversations: Map<string, TenantId>,
  sessions: Map<string, TenantId>,
  messages: Map<string, TenantId>
): TenantId {
  const relatedOwners = [
    event.conversationId === null || event.conversationId === undefined
      ? undefined
      : conversations.get(event.conversationId),
    event.sessionId === null || event.sessionId === undefined
      ? undefined
      : sessions.get(event.sessionId),
    event.inboundMessageId === null || event.inboundMessageId === undefined
      ? undefined
      : messages.get(event.inboundMessageId)
  ].filter((owner): owner is TenantId => owner !== undefined)
  const owner = event.tenantId ?? relatedOwners[0]
  const result = assertDirectTenant(owner, expectedTenant, 'Outbox event')
  for (const relatedOwner of relatedOwners) {
    assertRelatedTenant(relatedOwner, result, 'Outbox related record')
  }
  if (event.conversationId !== null && event.conversationId !== undefined) {
    assertRelatedTenant(
      conversations.get(event.conversationId),
      expectedTenant,
      'Outbox conversation'
    )
  }
  if (event.sessionId !== null && event.sessionId !== undefined) {
    assertRelatedTenant(
      sessions.get(event.sessionId),
      expectedTenant,
      'Outbox session'
    )
  }
  if (event.inboundMessageId !== null && event.inboundMessageId !== undefined) {
    assertRelatedTenant(
      messages.get(event.inboundMessageId),
      expectedTenant,
      'Outbox inbound message'
    )
  }
  return result
}

function redactSnapshotState(state: DatabaseState): DatabaseState {
  return {
    ...state,
    conversations: redactCollection(state.conversations),
    messages: redactCollection(state.messages),
    sessions: redactCollection(state.sessions),
    agentRuns: redactCollection(state.agentRuns),
    toolCalls: redactCollection(state.toolCalls),
    approvals: redactCollection(state.approvals),
    tasks: redactCollection(state.tasks),
    auditEvents: state.auditEvents.map(redactAuditEvent),
    auditEvidenceCheckpoints: redactCollection(state.auditEvidenceCheckpoints),
    idempotency: redactCollection(state.idempotency),
    outbox: redactCollection(state.outbox),
    outboxAttempts: redactCollection(state.outboxAttempts),
    outboxEffects: redactCollection(state.outboxEffects),
    ownerDrafts: redactCollection(state.ownerDrafts),
    patientDrafts: redactCollection(state.patientDrafts),
    appointmentDrafts: redactCollection(state.appointmentDrafts)
  }
}

function redactAuditEvent(event: AuditEventRecord): AuditEventRecord {
  const redacted = redactSnapshotValue(event) as AuditEventRecord
  return {
    ...redacted,
    payload: redactSnapshotValue(
      sanitizeAuditEvidencePayload(event.payload).payload
    ),
    createdAt: new Date(event.createdAt)
  }
}

function redactCollection<T>(records: T[]): T[] {
  return records.map((record) => redactSnapshotValue(record) as T)
}

function redactSnapshotValue(value: unknown): unknown {
  if (value instanceof Date) return new Date(value)
  if (typeof value === 'string') return redactSensitiveText(value)
  if (Array.isArray(value)) return value.map(redactSnapshotValue)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      redactSnapshotValue(child)
    ])
  )
}

function mergeAuditEvents(
  existing: AuditEventRecord[],
  incoming: AuditEventRecord[]
): AuditEventRecord[] {
  return mergeAppendOnlyRecords(
    existing.map(redactAuditEvent),
    incoming.map(redactAuditEvent),
    'Audit event'
  )
}

function mergeAppendOnlyRecords<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  resource: string
): T[] {
  const merged = existing.map((record) => cloneValue(record) as T)
  const byId = new Map(merged.map((record) => [record.id, record]))
  for (const record of incoming) {
    const current = byId.get(record.id)
    if (current) {
      if (stableJson(current) !== stableJson(record)) {
        throw new DomainError(
          'conflict',
          `${resource} collision during restore`
        )
      }
      continue
    }
    const copy = cloneValue(record) as T
    merged.push(copy)
    byId.set(copy.id, copy)
  }
  return merged
}

function replaceState(target: DatabaseState, source: DatabaseState): void {
  target.conversations = source.conversations
  target.messages = source.messages
  target.sessions = source.sessions
  target.agentRuns = source.agentRuns
  target.toolCalls = source.toolCalls
  target.approvals = source.approvals
  target.tasks = source.tasks
  target.auditEvents = source.auditEvents
  target.auditEvidenceCheckpoints = source.auditEvidenceCheckpoints
  target.idempotency = source.idempotency
  target.outbox = source.outbox
  target.outboxAttempts = source.outboxAttempts
  target.outboxEffects = source.outboxEffects
  target.ownerDrafts = source.ownerDrafts
  target.patientDrafts = source.patientDrafts
  target.appointmentDrafts = source.appointmentDrafts
}

function cloneState(state: DatabaseState): DatabaseState {
  return cloneValue(state) as DatabaseState
}

function cloneValue(value: unknown): unknown {
  if (value instanceof Date) return new Date(value)
  if (Array.isArray(value)) return value.map(cloneValue)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneValue(item)])
    )
  }
  return value
}

function digestState(state: DatabaseState): string {
  return createHash('sha256').update(stableJson(state)).digest('hex')
}

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`
      )
      .join(',')}}`
  }
  return JSON.stringify(value)
}
