import { createHash } from 'node:crypto'
import {
  CorrelationIdSchema,
  createCorrelationId,
  createDomainId,
  DomainError,
  IdempotencyKeySchema,
  sanitizeAuditEvidencePayload,
  sanitizeOutboxError,
  sanitizeOutboxPayload
} from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import {
  OUTBOX_TAKEOVER_SUPPRESSED_ERROR,
  type OutboxClaimInput,
  type OutboxFailInput,
  type OutboxTakeoverCheck
} from './outbox.ts'
import { assertSameOutboxContent } from './outbox-content-hash.ts'
import {
  OUTBOX_BASE_BACKOFF_MS,
  OUTBOX_DEFAULT_LEASE_MS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_MAX_BACKOFF_MS,
  OUTBOX_MAX_PAYLOAD_BYTES,
  SAFE_LEGACY_OUTBOX_ERRORS,
  outboxSelectColumns,
  type DurableOutboxEventRecord,
  type DurableOutboxRow,
  type DurableOutboxStatus,
  type PostgresOutboxAckInput,
  type PostgresOutboxEnqueueInput,
  type PostgresOutboxRequeueInput,
  type PostgresQueryable
} from './postgres.ts'

/**
 * Explicit dependency surface for the extracted durable outbox domain. The
 * repository builds it from its own private members, so the exported class
 * keeps its exact public contract.
 */
export interface PostgresOutboxContext {
  readonly client: PostgresQueryable
  repositoryNow(): Date
  isOutboxTakeoverActive(
    tenantId: TenantId,
    event: DurableOutboxRow,
    configuredCheck: OutboxTakeoverCheck | undefined
  ): Promise<boolean>
  markOutboxSessionHandoff(
    tenantId: TenantId,
    sessionId: string,
    now: Date
  ): Promise<void>
  suppressOutboxForTakeover(
    event: DurableOutboxRow,
    tenantId: TenantId,
    workerId: string,
    now: Date
  ): Promise<DurableOutboxEventRecord>
}

export async function enqueue(
  ctx: PostgresOutboxContext,
  rawInput: PostgresOutboxEnqueueInput,
  transactionClient?: PostgresQueryable
): Promise<DurableOutboxEventRecord> {
  const tenantId = TenantIdSchema.parse(rawInput.tenantId)
  const type = assertOutboxText(rawInput.type, 'Outbox type', 120)
  const correlationId = rawInput.correlationId
    ? CorrelationIdSchema.parse(rawInput.correlationId)
    : createCorrelationId()
  const idempotencyKey = IdempotencyKeySchema.parse(rawInput.idempotencyKey)
  const envelopeVersion = validateOutboxEnvelopeVersion(
    rawInput.envelopeVersion ?? 1
  )
  const eventId =
    (rawInput.eventId ?? rawInput.id)
      ? assertOutboxText(rawInput.eventId ?? rawInput.id!, 'eventId', 160)
      : createDomainId('outbox')
  const payload = assertOutboxPayload(rawInput.payload)
  const createdAt = assertOutboxDate(
    rawInput.createdAt ?? ctx.repositoryNow(),
    'createdAt'
  )
  const availableAt = assertOutboxDate(
    rawInput.availableAt ?? createdAt,
    'availableAt'
  )
  const client = transactionClient ?? ctx.client
  // AUD19-004: content binding for the idempotency key. Every winner
  // returned below is compared; a divergent repeat fails closed.
  const incomingBinding = {
    tenantId,
    type,
    envelopeVersion,
    payload
  }
  const convergeOnWinner = (row: DurableOutboxRow) => {
    const winner = mapDurableOutboxRow(row)
    // Compare against the stored raw payload (pre-read-sanitization): the
    // row holds exactly the asserted incoming form, so the same
    // canonicalization converges while the read-path placeholders used for
    // display never leak into the binding.
    assertSameOutboxContent(
      {
        tenantId: row.tenant_id,
        type: row.type,
        envelopeVersion: row.envelope_version,
        payload: row.payload
      },
      incomingBinding,
      (message) => {
        throw new DomainError('conflict', message)
      }
    )
    return winner
  }
  const operation = async (): Promise<DurableOutboxEventRecord> => {
    const existing = await client.query<DurableOutboxRow>(
      `SELECT ${outboxSelectColumns}
       FROM outbox_events
       WHERE tenant_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [tenantId, idempotencyKey]
    )
    if (existing.rows[0]) return convergeOnWinner(existing.rows[0])

    const insert = await client.query<DurableOutboxRow>(
      `INSERT INTO outbox_events
         (id, tenant_id, type, envelope_version, correlation_id, idempotency_key,
          conversation_id, session_id, agent_id, agent_version_id,
          inbound_message_id, payload, payload_protection_version, status, created_at, available_at,
          attempts, lease_owner, lease_until, last_error, processed_at,
          dead_lettered_at, parent_event_id, tenant_isolation_quarantined)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb,
               $13, 'pending', $14, $15, 0, NULL, NULL, NULL, NULL, NULL, $16, false)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
       RETURNING ${outboxSelectColumns}`,
      [
        eventId,
        tenantId,
        type,
        envelopeVersion,
        correlationId,
        idempotencyKey,
        rawInput.conversationId ?? null,
        rawInput.sessionId ?? null,
        rawInput.agentId ?? null,
        rawInput.agentVersionId ?? null,
        rawInput.inboundMessageId ?? null,
        serializeOutboxJson(payload, 'Outbox payload'),
        'outbox-r6',
        createdAt,
        availableAt,
        rawInput.parentEventId ?? null
      ]
    )
    if (insert.rows[0]) return mapDurableOutboxRow(insert.rows[0])

    // A concurrent insert won the idempotency key. Read the winner in the
    // same READ COMMITTED command boundary instead of inventing a second id.
    const winner = await client.query<DurableOutboxRow>(
      `SELECT ${outboxSelectColumns}
       FROM outbox_events
       WHERE tenant_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [tenantId, idempotencyKey]
    )
    if (!winner.rows[0]) {
      throw new DomainError(
        'conflict',
        'Outbox idempotency winner could not be read'
      )
    }
    return convergeOnWinner(winner.rows[0])
  }
  return transactionClient
    ? operation()
    : withOutboxTransaction(ctx.client, operation)
}

export async function claimNext(
  ctx: PostgresOutboxContext,
  rawInput: OutboxClaimInput
): Promise<DurableOutboxEventRecord | null> {
  const tenantId = TenantIdSchema.parse(rawInput.tenantId)
  const workerId = validateOutboxWorker(rawInput.workerId)
  const now = ctx.repositoryNow()
  const leaseMs = validateOutboxLeaseMs(
    rawInput.leaseMs ?? OUTBOX_DEFAULT_LEASE_MS
  )
  const leaseUntil = new Date(now.getTime() + leaseMs)

  return withOutboxTransaction(ctx.client, async () => {
    const candidate = await ctx.client.query<DurableOutboxRow>(
      `SELECT ${outboxSelectColumns}
       FROM outbox_events
       WHERE tenant_id = $1
         AND (
           (status = 'pending' AND available_at <= $2)
           OR (status = 'failed' AND available_at <= $2)
           OR (status = 'processing' AND lease_until <= $2)
         )
         AND ($3::text IS NULL OR id = $3)
       ORDER BY available_at ASC, created_at ASC, id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [tenantId, now, rawInput.eventId ?? null]
    )
    const row = candidate.rows[0]
    if (!row) return null

    if (row.status === 'processing') {
      await ctx.client.query(
        `UPDATE outbox_attempts
         SET outcome = COALESCE(outcome, 'lease_expired'),
             error = COALESCE(error, 'outbox_error:lease_expired')
         WHERE tenant_id = $1 AND event_id = $2 AND outcome IS NULL`,
        [tenantId, row.id]
      )
    }

    const claimed = await ctx.client.query<DurableOutboxRow>(
      `UPDATE outbox_events
       SET status = 'processing',
           attempts = attempts + 1,
           lease_owner = $3,
           lease_until = $4,
           available_at = $2,
           last_error = NULL
       WHERE tenant_id = $1 AND id = $5
         AND (
           status = 'pending'
           OR (status = 'failed' AND available_at <= $2)
           OR (status = 'processing' AND lease_until <= $2)
         )
       RETURNING ${outboxSelectColumns}`,
      [tenantId, now, workerId, leaseUntil, row.id]
    )
    const claimedRow = claimed.rows[0]
    if (!claimedRow) return null
    await ctx.client.query(
      `INSERT INTO outbox_attempts
         (tenant_id, event_id, attempt, worker_id, claimed_at, outcome, error)
       VALUES ($1, $2, $3, $4, $5, NULL, NULL)`,
      [tenantId, claimedRow.id, claimedRow.attempts, workerId, now]
    )
    return mapDurableOutboxRow(claimedRow)
  })
}

export async function ack(
  ctx: PostgresOutboxContext,
  rawInput: PostgresOutboxAckInput
): Promise<DurableOutboxEventRecord> {
  const tenantId = TenantIdSchema.parse(rawInput.tenantId)
  const eventId = assertOutboxText(rawInput.eventId, 'eventId', 160)
  const workerId = validateOutboxWorker(rawInput.workerId)
  const now = ctx.repositoryNow()

  /**
   * Claim/ack is intentionally at-least-once. The first transaction only
   * validates ownership and observes the journal; it must commit before a
   * handler can touch the runtime repository through another pool
   * connection. The final transaction performs the compare-and-swap and
   * journals the sanitized result. Controlled handlers are idempotent, so a
   * crash between the handler and this final transaction is safe to retry.
   */
  const prepared = await withOutboxTransaction(ctx.client, async () => {
    const selected = await ctx.client.query<DurableOutboxRow>(
      `SELECT ${outboxSelectColumns}
       FROM outbox_events
       WHERE tenant_id = $1 AND id = $2
       FOR UPDATE`,
      [tenantId, eventId]
    )
    const event = selected.rows[0]
    if (!event)
      throw new DomainError('invalid_action', 'Outbox event not found')
    if (event.status !== 'processing' && event.status !== 'processed') {
      throw new DomainError('conflict', 'Outbox lease is not owned by worker')
    }
    if (
      event.status === 'processing' &&
      (event.lease_owner !== workerId ||
        !event.lease_until ||
        new Date(event.lease_until).getTime() <= now.getTime())
    ) {
      throw new DomainError('conflict', 'Outbox lease is not owned by worker')
    }

    const journal = await ctx.client.query<{
      result: unknown
      event_id: string
    }>(
      `SELECT result, event_id
       FROM outbox_effects
       WHERE tenant_id = $1 AND idempotency_key = $2
       FOR UPDATE`,
      [tenantId, event.idempotency_key]
    )
    if (journal.rows[0] && journal.rows[0].event_id !== event.id) {
      throw new DomainError(
        'invalid_action',
        'Outbox effect journal points to another event'
      )
    }
    if (event.status === 'processed') {
      if (!journal.rows[0] || journal.rows[0].event_id !== event.id) {
        throw new DomainError(
          'invalid_action',
          'Processed outbox event has no matching effect journal'
        )
      }
      return {
        kind: 'processed' as const,
        event: mapDurableOutboxRow(event)
      }
    }
    if (
      await ctx.isOutboxTakeoverActive(tenantId, event, rawInput.takeoverActive)
    ) {
      return { kind: 'takeover' as const, event }
    }
    return {
      kind: 'execute' as const,
      event,
      hasJournal: Boolean(journal.rows[0]),
      journalResult: journal.rows[0]
        ? assertOutboxResult(journal.rows[0].result)
        : undefined
    }
  })

  if (prepared.kind === 'processed') return prepared.event
  if (prepared.kind === 'takeover') {
    return withOutboxTransaction(ctx.client, () =>
      ctx.suppressOutboxForTakeover(
        prepared.event,
        tenantId,
        workerId,
        ctx.repositoryNow()
      )
    )
  }

  let result = prepared.journalResult
  if (!prepared.hasJournal) {
    if (rawInput.effect) {
      // The handler receives only the durable event envelope. It runs after
      // the validation transaction has committed, so it may use the same
      // PostgreSQL pool for tenant-scoped finalization without deadlocking
      // on the outbox row held above.
      result = await rawInput.effect(mapDurableOutboxRow(prepared.event))
    } else if (rawInput.result !== undefined) {
      result = rawInput.result
    } else {
      throw new DomainError(
        'validation_failed',
        'A local effect or result is required before ack'
      )
    }
  }

  return withOutboxTransaction(ctx.client, async () => {
    const ackNow = ctx.repositoryNow()
    const selected = await ctx.client.query<DurableOutboxRow>(
      `SELECT ${outboxSelectColumns}
       FROM outbox_events
       WHERE tenant_id = $1 AND id = $2
       FOR UPDATE`,
      [tenantId, eventId]
    )
    const event = selected.rows[0]
    if (!event)
      throw new DomainError('invalid_action', 'Outbox event not found')
    if (event.status !== 'processing' && event.status !== 'processed') {
      throw new DomainError('conflict', 'Outbox lease is not owned by worker')
    }
    if (
      event.status === 'processing' &&
      (event.lease_owner !== workerId ||
        !event.lease_until ||
        new Date(event.lease_until).getTime() <= ackNow.getTime())
    ) {
      throw new DomainError('conflict', 'Outbox lease is not owned by worker')
    }

    const journal = await ctx.client.query<{
      result: unknown
      event_id: string
    }>(
      `SELECT result, event_id
       FROM outbox_effects
       WHERE tenant_id = $1 AND idempotency_key = $2
       FOR UPDATE`,
      [tenantId, event.idempotency_key]
    )
    if (journal.rows[0] && journal.rows[0].event_id !== event.id) {
      throw new DomainError(
        'invalid_action',
        'Outbox effect journal points to another event'
      )
    }
    if (event.status === 'processed') {
      if (!journal.rows[0] || journal.rows[0].event_id !== event.id) {
        throw new DomainError(
          'invalid_action',
          'Processed outbox event has no matching effect journal'
        )
      }
      return mapDurableOutboxRow(event)
    }
    if (
      await ctx.isOutboxTakeoverActive(tenantId, event, rawInput.takeoverActive)
    ) {
      return ctx.suppressOutboxForTakeover(event, tenantId, workerId, ackNow)
    }

    if (!journal.rows[0]) {
      const safeResult = assertOutboxResult(result)
      await ctx.client.query(
        `INSERT INTO outbox_effects
           (tenant_id, idempotency_key, event_id, result,
            result_protection_version, applied_at)
         VALUES ($1, $2, $3, $4::jsonb, 'outbox-r6', $5)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
        [
          tenantId,
          event.idempotency_key,
          event.id,
          serializeOutboxJson(safeResult, 'Outbox result'),
          ackNow
        ]
      )
    }

    const persisted = await ctx.client.query<{ result: unknown }>(
      `SELECT result
       FROM outbox_effects
       WHERE tenant_id = $1 AND idempotency_key = $2
       FOR UPDATE`,
      [tenantId, event.idempotency_key]
    )
    if (!persisted.rows[0]) {
      throw new DomainError(
        'invalid_action',
        'Outbox effect journal could not be persisted'
      )
    }
    const safePersistedResult = assertOutboxResult(persisted.rows[0].result)
    await ctx.client.query(
      `UPDATE outbox_effects
       SET result = $3::jsonb,
           result_protection_version = 'outbox-r6'
       WHERE tenant_id = $1 AND idempotency_key = $2`,
      [
        tenantId,
        event.idempotency_key,
        serializeOutboxJson(safePersistedResult, 'Outbox result')
      ]
    )

    const updated = await ctx.client.query<DurableOutboxRow>(
      `UPDATE outbox_events
       SET status = 'processed',
           processed_at = $3,
           lease_owner = NULL,
           lease_until = NULL,
           last_error = NULL,
           available_at = $3
       WHERE tenant_id = $1 AND id = $2 AND status = 'processing'
         AND lease_owner = $4
       RETURNING ${outboxSelectColumns}`,
      [tenantId, event.id, ackNow, workerId]
    )
    const updatedRow = updated.rows[0]
    if (!updatedRow)
      throw new DomainError('conflict', 'Outbox ack lost its lease')
    await ctx.client.query(
      `UPDATE outbox_attempts
       SET outcome = 'processed', error = NULL
       WHERE tenant_id = $1 AND event_id = $2 AND worker_id = $3
         AND outcome IS NULL`,
      [tenantId, event.id, workerId]
    )
    await appendDurableOutboxAudit(ctx.client, {
      tenantId,
      eventId: event.id,
      correlationId: event.correlation_id,
      actorId: workerId,
      action: 'ack',
      attempts: updatedRow.attempts,
      status: updatedRow.status
    })
    // Keep the result in the durable journal; the event record deliberately
    // does not duplicate arbitrary handler output.
    return mapDurableOutboxRow(updatedRow)
  })
}

export async function fail(
  ctx: PostgresOutboxContext,
  rawInput: OutboxFailInput
): Promise<DurableOutboxEventRecord> {
  const tenantId = TenantIdSchema.parse(rawInput.tenantId)
  const eventId = assertOutboxText(rawInput.eventId, 'eventId', 160)
  const workerId = validateOutboxWorker(rawInput.workerId)
  const now = ctx.repositoryNow()
  const error = redactOutboxError(rawInput.error)

  return withOutboxTransaction(ctx.client, async () => {
    const selected = await ctx.client.query<DurableOutboxRow>(
      `SELECT ${outboxSelectColumns}
       FROM outbox_events
       WHERE tenant_id = $1 AND id = $2
       FOR UPDATE`,
      [tenantId, eventId]
    )
    const event = selected.rows[0]
    if (!event)
      throw new DomainError('invalid_action', 'Outbox event not found')
    if (
      event.status !== 'processing' ||
      event.lease_owner !== workerId ||
      !event.lease_until ||
      new Date(event.lease_until).getTime() <= now.getTime()
    ) {
      throw new DomainError('conflict', 'Outbox lease is not owned by worker')
    }
    const terminal =
      rawInput.handoff === true ||
      rawInput.terminal === true ||
      event.attempts >= OUTBOX_MAX_ATTEMPTS
    const status: DurableOutboxStatus = terminal ? 'dead_letter' : 'failed'
    const availableAt = terminal
      ? now
      : new Date(now.getTime() + outboxBackoffMs(event.attempts))
    const updated = await ctx.client.query<DurableOutboxRow>(
      `UPDATE outbox_events
       SET status = $3,
           available_at = $4,
           last_error = $5,
           lease_owner = NULL,
           lease_until = NULL,
           dead_lettered_at = CASE WHEN $3 = 'dead_letter' THEN $6::timestamptz ELSE NULL END
       WHERE tenant_id = $1 AND id = $2 AND status = 'processing'
         AND lease_owner = $7
       RETURNING ${outboxSelectColumns}`,
      [tenantId, event.id, status, availableAt, error, now, workerId]
    )
    const updatedRow = updated.rows[0]
    if (!updatedRow)
      throw new DomainError('conflict', 'Outbox failure lost its lease')
    if (rawInput.handoff && event.session_id) {
      await ctx.markOutboxSessionHandoff(tenantId, event.session_id, now)
    }
    await ctx.client.query(
      `UPDATE outbox_attempts
       SET outcome = $4, error = $5
       WHERE tenant_id = $1 AND event_id = $2 AND worker_id = $3
         AND outcome IS NULL`,
      [
        tenantId,
        event.id,
        workerId,
        rawInput.handoff ? 'handoff' : status,
        error
      ]
    )
    await appendDurableOutboxAudit(ctx.client, {
      tenantId,
      eventId: event.id,
      correlationId: event.correlation_id,
      actorId: workerId,
      action: rawInput.handoff ? 'handoff' : terminal ? 'dead_letter' : 'fail',
      attempts: updatedRow.attempts,
      status: updatedRow.status,
      ...(rawInput.handoff && event.session_id
        ? { sessionId: event.session_id }
        : {}),
      ...(rawInput.handoff && event.conversation_id
        ? { conversationId: event.conversation_id }
        : {}),
      error
    })
    return mapDurableOutboxRow(updatedRow)
  })
}

export async function requeueDeadLetter(
  ctx: PostgresOutboxContext,
  rawInput: PostgresOutboxRequeueInput
): Promise<DurableOutboxEventRecord> {
  const tenantId = TenantIdSchema.parse(rawInput.tenantId)
  const eventId = assertOutboxText(rawInput.eventId, 'eventId', 160)
  const operatorId = assertOutboxText(rawInput.operatorId, 'operatorId', 160)
  const correlationId = CorrelationIdSchema.parse(rawInput.correlationId)
  const now = ctx.repositoryNow()

  return withOutboxTransaction(ctx.client, async () => {
    const selected = await ctx.client.query<DurableOutboxRow>(
      `SELECT ${outboxSelectColumns}
       FROM outbox_events
       WHERE tenant_id = $1 AND id = $2
       FOR UPDATE`,
      [tenantId, eventId]
    )
    const event = selected.rows[0]
    if (!event)
      throw new DomainError('invalid_action', 'Outbox event not found')
    if (event.status !== 'dead_letter') {
      throw new DomainError(
        'conflict',
        'Only dead-letter events can be requeued'
      )
    }
    const updated = await ctx.client.query<DurableOutboxRow>(
      `UPDATE outbox_events
       SET status = 'pending',
           attempts = 0,
           available_at = $3,
           lease_owner = NULL,
           lease_until = NULL,
           last_error = NULL,
           processed_at = NULL,
           dead_lettered_at = NULL
       WHERE tenant_id = $1 AND id = $2 AND status = 'dead_letter'
       RETURNING ${outboxSelectColumns}`,
      [tenantId, event.id, now]
    )
    const updatedRow = updated.rows[0]
    if (!updatedRow)
      throw new DomainError(
        'conflict',
        'Outbox requeue lost its compare-and-swap'
      )
    await ctx.client.query(
      `INSERT INTO outbox_attempts
         (tenant_id, event_id, attempt, worker_id, claimed_at, outcome, error)
       VALUES ($1, $2, $3, $4, $5, 'requeued', $6)`,
      [
        tenantId,
        event.id,
        Math.max(1, event.attempts ?? 0),
        operatorId,
        now,
        event.last_error ? redactOutboxError(event.last_error) : null
      ]
    )
    await appendDurableOutboxAudit(ctx.client, {
      tenantId,
      eventId: event.id,
      correlationId,
      actorId: operatorId,
      action: 'requeue',
      attempts: updatedRow.attempts,
      status: updatedRow.status
    })
    return mapDurableOutboxRow(updatedRow)
  })
}

export function assertOutboxText(
  value: string,
  label: string,
  max = 200
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError('validation_failed', `${label} is required`)
  }
  if (value.length > max) {
    throw new DomainError('validation_failed', `${label} is too long`)
  }
  return value
}

function assertOutboxDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError('validation_failed', `${label} is invalid`)
  }
  return value
}

function assertOutboxPayload(payload: unknown): unknown {
  if (payload === undefined) {
    throw new DomainError('validation_failed', 'Outbox payload is required')
  }
  return sanitizeAndValidateOutboxValue(payload, 'Outbox payload')
}

function assertOutboxResult(result: unknown): unknown {
  return sanitizeAndValidateOutboxValue(result ?? null, 'Outbox result')
}

function sanitizeAndValidateOutboxValue(
  value: unknown,
  label: string
): unknown {
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) return null
    if (Buffer.byteLength(serialized, 'utf8') > OUTBOX_MAX_PAYLOAD_BYTES) {
      throw new DomainError('payload_too_large', `${label} is too large`)
    }
    const sanitized = sanitizeOutboxPayload(value).payload
    const sanitizedSerialized = JSON.stringify(sanitized) ?? 'null'
    if (
      Buffer.byteLength(sanitizedSerialized, 'utf8') > OUTBOX_MAX_PAYLOAD_BYTES
    ) {
      throw new DomainError(
        'payload_too_large',
        `Sanitized ${label.toLowerCase()} is too large`
      )
    }
    return sanitized
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError('validation_failed', `${label} is not JSON`)
  }
}

function serializeOutboxJson(value: unknown, label: string): string {
  try {
    const serialized = JSON.stringify(value ?? null)
    if (serialized === undefined) return 'null'
    return serialized
  } catch {
    throw new DomainError('validation_failed', `${label} is not JSON`)
  }
}

function redactOutboxError(error: unknown): string {
  if (error === OUTBOX_TAKEOVER_SUPPRESSED_ERROR) {
    return OUTBOX_TAKEOVER_SUPPRESSED_ERROR
  }
  if (typeof error === 'string' && SAFE_LEGACY_OUTBOX_ERRORS.has(error)) {
    return error
  }
  return sanitizeOutboxError(error)
}

export function createInboundIdempotencyKey(
  channel: string,
  externalMessageId: string
): string {
  const digest = createHash('sha256')
    .update(externalMessageId, 'utf8')
    .digest('hex')
  return `inbound:${channel}:sha256:${digest}`
}

export async function resolveTakeoverCheck(
  value: OutboxTakeoverCheck | undefined
): Promise<boolean> {
  if (typeof value === 'function') return Boolean(await value())
  return value === true
}

function outboxDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function mapDurableOutboxRow(
  row: DurableOutboxRow
): DurableOutboxEventRecord {
  const tenantId = TenantIdSchema.parse(row.tenant_id)
  const availableAt = outboxDate(row.available_at)
  const createdAt = outboxDate(row.created_at)
  if (!availableAt || !createdAt) {
    throw new DomainError(
      'invalid_action',
      'Outbox event timestamps are invalid'
    )
  }
  return {
    id: row.id,
    tenantId,
    type: row.type,
    envelopeVersion: row.envelope_version,
    correlationId: row.correlation_id,
    idempotencyKey: row.idempotency_key,
    conversationId: row.conversation_id,
    sessionId: row.session_id,
    agentId: row.agent_id,
    agentVersionId: row.agent_version_id,
    inboundMessageId: row.inbound_message_id,
    payload: sanitizeOutboxPayload(row.payload).payload,
    status: row.status,
    createdAt,
    availableAt,
    attempts: row.attempts,
    leaseOwner: row.lease_owner,
    leaseUntil: outboxDate(row.lease_until),
    lastError: row.last_error ? redactOutboxError(row.last_error) : null,
    processedAt: outboxDate(row.processed_at),
    deadLetteredAt: outboxDate(row.dead_lettered_at),
    parentEventId: row.parent_event_id
  }
}

async function withOutboxTransaction<T>(
  client: PostgresQueryable,
  operation: () => Promise<T>
): Promise<T> {
  await client.query('BEGIN')
  try {
    const result = await operation()
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Preserve the original database or handler error.
    }
    throw error
  }
}

function validateOutboxWorker(workerId: string): string {
  return assertOutboxText(workerId, 'workerId', 120)
}

function validateOutboxEnvelopeVersion(version: number): number {
  if (!Number.isSafeInteger(version) || version < 1 || version > 100) {
    throw new DomainError(
      'validation_failed',
      'Outbox envelope version is invalid'
    )
  }
  return version
}

function validateOutboxLeaseMs(leaseMs: number): number {
  if (
    !Number.isSafeInteger(leaseMs) ||
    leaseMs < 1_000 ||
    leaseMs > 3_600_000
  ) {
    throw new DomainError(
      'validation_failed',
      'Outbox lease duration is invalid'
    )
  }
  return leaseMs
}

function outboxBackoffMs(attempt: number): number {
  return Math.min(
    OUTBOX_MAX_BACKOFF_MS,
    OUTBOX_BASE_BACKOFF_MS * 2 ** Math.max(0, Math.min(attempt - 1, 16))
  )
}

export async function appendDurableOutboxAudit(
  client: PostgresQueryable,
  input: {
    tenantId: TenantId
    eventId: string
    correlationId: string
    actorId: string
    action: 'ack' | 'fail' | 'dead_letter' | 'requeue' | 'handoff'
    attempts: number
    status: DurableOutboxStatus
    error?: string | null
    sessionId?: string | null
    conversationId?: string | null
  }
): Promise<void> {
  const payload = sanitizeAuditEvidencePayload({
    tenantId: input.tenantId,
    eventId: input.eventId,
    correlationId: input.correlationId,
    action: input.action,
    attempts: input.attempts,
    status: input.status,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.error ? { error: input.error } : {})
  }).payload
  await client.query(
    `INSERT INTO audit_events
       (tenant_id, id, type, actor_type, actor_id, correlation_id, policy_version, payload, created_at)
     VALUES ($1, $2, 'integration_event', $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      input.tenantId,
      createDomainId('audit'),
      input.action === 'requeue' ? 'Operator' : 'System',
      input.actorId,
      input.correlationId,
      'outbox-r2',
      JSON.stringify(payload),
      new Date()
    ]
  )
}
