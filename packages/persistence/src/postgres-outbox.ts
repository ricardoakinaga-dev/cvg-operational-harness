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
  type FencedClaimedEvent,
  type FencedClaimRenewal,
  type FencedOuterClaimRef,
  type FencedOutboxAckInput,
  type FencedOutboxFailInput,
  type FencedRenewalControl,
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
import {
  assertFencedRenewalActive,
  isFencedRenewalGuardStop,
  queryRenewal
} from './tenant-scoped-postgres.ts'

const FENCED_OUTBOX_LEASE_MS = 10_000

export function validateFencedOuterClaimRef(ref: FencedOuterClaimRef): void {
  TenantIdSchema.parse(ref.tenantId)
  assertOutboxText(ref.eventId, 'eventId', 160)
  validateOutboxWorker(ref.processWorkerId)
  if (
    !Number.isSafeInteger(ref.expectedOuterAttempt) ||
    ref.expectedOuterAttempt < 1 ||
    typeof ref.expectedAttemptRowId !== 'string' ||
    !/^[1-9][0-9]*$/.test(ref.expectedAttemptRowId) ||
    BigInt(ref.expectedAttemptRowId) > 9223372036854775807n
  ) {
    throw new DomainError('validation_failed', 'Invalid outbox attempt fence')
  }
}

function assertFlatClaimIdentity(
  input: { tenantId: TenantId; eventId: string; workerId: string },
  ref: FencedOuterClaimRef
): void {
  validateFencedOuterClaimRef(ref)
  if (
    input.tenantId !== ref.tenantId ||
    input.eventId !== ref.eventId ||
    input.workerId !== ref.processWorkerId
  ) {
    throw new DomainError('conflict', 'Outbox input does not match claim ref')
  }
}

async function outboxDbNow(
  client: PostgresQueryable,
  control?: FencedRenewalControl
): Promise<Date> {
  const clock = await queryRenewal<{ db_now: Date | string }>(
    client,
    'SELECT clock_timestamp() AS db_now',
    undefined,
    control
  )
  const now = new Date(clock.rows[0]?.db_now ?? NaN)
  if (!Number.isFinite(now.getTime()))
    throw new DomainError('conflict', 'Invalid outbox database clock')
  return now
}

/** Transaction-free: caller owns tenant context, transaction and lock prefix. */
export async function assertFencedOutboxClaimOnClient(
  client: PostgresQueryable,
  ref: FencedOuterClaimRef,
  control?: FencedRenewalControl,
  allowProcessed = false
): Promise<{ event: DurableOutboxRow; now: Date }> {
  ref = { ...ref }
  validateFencedOuterClaimRef(ref)
  const selected = await queryRenewal<DurableOutboxRow>(
    client,
    `SELECT ${outboxSelectColumns} FROM outbox_events
     WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
    [ref.tenantId, ref.eventId],
    control
  )
  const event = selected.rows[0]
  const attempt = await queryRenewal<{ id: string; outcome: string | null }>(
    client,
    `SELECT id::text AS id, outcome FROM outbox_attempts
     WHERE tenant_id = $1 AND event_id = $2 AND id = $3::bigint
       AND worker_id = $4 AND attempt = $5
       AND NOT EXISTS (SELECT 1 FROM outbox_attempts newer
         WHERE newer.tenant_id = $1 AND newer.event_id = $2 AND newer.id > outbox_attempts.id)
     FOR UPDATE`,
    [
      ref.tenantId,
      ref.eventId,
      ref.expectedAttemptRowId,
      ref.processWorkerId,
      ref.expectedOuterAttempt
    ],
    control
  )
  const now = await outboxDbNow(client, control)
  const row = attempt.rows[0]
  if (
    !event ||
    event.tenant_id !== ref.tenantId ||
    event.id !== ref.eventId ||
    event.attempts !== ref.expectedOuterAttempt ||
    !row ||
    row.id !== ref.expectedAttemptRowId
  ) {
    throw new DomainError('conflict', 'Outbox claim fence lost its lease')
  }
  if (
    allowProcessed &&
    event.status === 'processed' &&
    row.outcome === 'processed'
  )
    return { event, now }
  const expiry = event.lease_until ? new Date(event.lease_until).getTime() : NaN
  if (
    event.status !== 'processing' ||
    event.lease_owner !== ref.processWorkerId ||
    row.outcome !== null ||
    !Number.isFinite(expiry) ||
    expiry <= now.getTime()
  ) {
    throw new DomainError('conflict', 'Outbox claim fence lost its lease')
  }
  return { event, now }
}

/** Uses the existing transaction; never opens a transaction or checks out. */
export async function renewOutboxClaimOnClient(
  client: PostgresQueryable,
  ref: FencedOuterClaimRef,
  control?: FencedRenewalControl
): Promise<FencedClaimRenewal> {
  ref = { ...ref }
  const { now } = await assertFencedOutboxClaimOnClient(client, ref, control)
  const leaseUntil = new Date(now.getTime() + FENCED_OUTBOX_LEASE_MS)
  const updated = await queryRenewal<DurableOutboxRow>(
    client,
    `UPDATE outbox_events SET lease_until = $6
     WHERE tenant_id = $1 AND id = $2 AND lease_owner = $3
       AND attempts = $4 AND status = 'processing' AND lease_until > $5
       AND lease_until > clock_timestamp()
       AND EXISTS (SELECT 1 FROM outbox_attempts WHERE tenant_id = $1 AND event_id = $2
         AND id = $7::bigint AND worker_id = $3 AND attempt = $4 AND outcome IS NULL)
     RETURNING ${outboxSelectColumns}`,
    [
      ref.tenantId,
      ref.eventId,
      ref.processWorkerId,
      ref.expectedOuterAttempt,
      now,
      leaseUntil,
      ref.expectedAttemptRowId
    ],
    control
  )
  const event = updated.rows[0]
  if (
    !event ||
    event.tenant_id !== ref.tenantId ||
    event.id !== ref.eventId ||
    event.status !== 'processing' ||
    event.lease_owner !== ref.processWorkerId ||
    event.attempts !== ref.expectedOuterAttempt ||
    !event.lease_until ||
    new Date(event.lease_until).getTime() !== leaseUntil.getTime()
  ) {
    throw new DomainError('conflict', 'Outbox renewal lost its lease')
  }
  return {
    claimRef: { ...ref },
    dbNow: now.toISOString(),
    leaseUntil: leaseUntil.toISOString()
  }
}

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
    now: Date,
    ref?: FencedOuterClaimRef
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

export async function claimNextFenced(
  ctx: PostgresOutboxContext,
  input: OutboxClaimInput
): Promise<FencedClaimedEvent | null> {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const workerId = validateOutboxWorker(input.workerId)
  // leaseMs/now are compatibility input only; the fenced profile is fixed.
  return withOutboxTransaction(ctx.client, async () => {
    const selected = await ctx.client.query<DurableOutboxRow>(
      `SELECT ${outboxSelectColumns} FROM outbox_events
       WHERE tenant_id = $1 AND (
         (status IN ('pending', 'failed') AND available_at <= clock_timestamp())
         OR (status = 'processing' AND lease_until <= clock_timestamp()))
         AND ($2::text IS NULL OR id = $2)
       ORDER BY available_at ASC, created_at ASC, id ASC
       FOR UPDATE SKIP LOCKED LIMIT 1`,
      [tenantId, input.eventId ?? null]
    )
    const row = selected.rows[0]
    if (!row) return null
    // Retire only the exact predecessor attempt; requeue may reset counters.
    const predecessor =
      row.status === 'processing'
        ? await ctx.client.query<{ id: string }>(
            `SELECT id::text AS id FROM outbox_attempts WHERE tenant_id = $1 AND event_id = $2
         AND attempt = $3 AND worker_id = $4 AND outcome IS NULL FOR UPDATE`,
            [tenantId, row.id, row.attempts, row.lease_owner]
          )
        : undefined
    let now = await outboxDbNow(ctx.client)
    const due = row.status === 'processing' ? row.lease_until : row.available_at
    if (
      !due ||
      !Number.isFinite(new Date(due).getTime()) ||
      new Date(due).getTime() > now.getTime()
    )
      return null
    if (predecessor && predecessor.rows.length !== 1)
      throw new DomainError(
        'conflict',
        'Outbox predecessor attempt is missing or ambiguous'
      )
    if (predecessor) {
      const retired = await ctx.client.query<{ id: string }>(
        `UPDATE outbox_attempts SET outcome = 'lease_expired', error = 'outbox_error:lease_expired'
         WHERE tenant_id = $1 AND event_id = $2 AND id = $3::bigint AND attempt = $4
           AND worker_id = $5 AND outcome IS NULL RETURNING id::text AS id`,
        [
          tenantId,
          row.id,
          predecessor.rows[0]!.id,
          row.attempts,
          row.lease_owner
        ]
      )
      if (
        retired.rows.length !== 1 ||
        retired.rows[0]?.id !== predecessor.rows[0]!.id
      ) {
        throw new DomainError(
          'conflict',
          'Outbox predecessor attempt lost its fence'
        )
      }
      now = await outboxDbNow(ctx.client)
    }
    const claimed = await ctx.client.query<DurableOutboxRow>(
      `UPDATE outbox_events SET status = 'processing', attempts = attempts + 1,
         lease_owner = $3, lease_until = $4, available_at = $2, last_error = NULL
       WHERE tenant_id = $1 AND id = $5 AND status = $6 AND attempts = $7
         AND ((status IN ('pending', 'failed') AND available_at <= $2)
           OR (status = 'processing' AND lease_until <= $2))
       RETURNING ${outboxSelectColumns}`,
      [
        tenantId,
        now,
        workerId,
        new Date(now.getTime() + FENCED_OUTBOX_LEASE_MS),
        row.id,
        row.status,
        row.attempts
      ]
    )
    const event = claimed.rows[0]
    if (!event)
      throw new DomainError(
        'conflict',
        'Outbox fenced claim lost its predecessor'
      )
    const inserted = await ctx.client.query<{ id: string }>(
      `INSERT INTO outbox_attempts (tenant_id, event_id, attempt, worker_id, claimed_at, outcome, error)
       VALUES ($1, $2, $3, $4, $5, NULL, NULL) RETURNING id::text AS id`,
      [tenantId, event.id, event.attempts, workerId, now]
    )
    const claimRef: FencedOuterClaimRef = {
      tenantId,
      eventId: event.id,
      processWorkerId: workerId,
      expectedOuterAttempt: event.attempts,
      expectedAttemptRowId: inserted.rows[0]?.id ?? ''
    }
    validateFencedOuterClaimRef(claimRef)
    if (inserted.rows.length !== 1)
      throw new DomainError(
        'conflict',
        'Outbox attempt identity was not returned'
      )
    return {
      event: mapDurableOutboxRow(event),
      claimRef,
      dbClaimedAt: now.toISOString()
    }
  })
}

export function renewOutboxClaim(
  ctx: PostgresOutboxContext,
  ref: FencedOuterClaimRef,
  control: FencedRenewalControl
): Promise<FencedClaimRenewal> {
  ref = { ...ref }
  return withOutboxTransaction(
    ctx.client,
    () => renewOutboxClaimOnClient(ctx.client, ref, control),
    control
  )
}

export async function ack(
  ctx: PostgresOutboxContext,
  rawInput: PostgresOutboxAckInput,
  fenced?: FencedOutboxAckInput
): Promise<DurableOutboxEventRecord> {
  if (fenced) fenced = { ...fenced, claimRef: { ...fenced.claimRef } }
  if (fenced) assertFlatClaimIdentity(rawInput, fenced.claimRef)
  const checkSignal = (): void => {
    if (fenced?.signal?.aborted)
      throw new DomainError('conflict', 'Outbox attempt aborted')
  }
  checkSignal()
  const tenantId = TenantIdSchema.parse(rawInput.tenantId)
  const eventId = assertOutboxText(rawInput.eventId, 'eventId', 160)
  const workerId = validateOutboxWorker(rawInput.workerId)
  const now = fenced ? undefined : ctx.repositoryNow()

  /**
   * Claim/ack is intentionally at-least-once. The first transaction only
   * validates ownership and observes the journal; it must commit before a
   * handler can touch the runtime repository through another pool
   * connection. The final transaction performs the compare-and-swap and
   * journals the sanitized result. Controlled handlers are idempotent, so a
   * crash between the handler and this final transaction is safe to retry.
   */
  const prepared = await withOutboxTransaction(
    ctx.client,
    async () => {
      checkSignal()
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
      const preparedNow = fenced
        ? (
            await assertFencedOutboxClaimOnClient(
              ctx.client,
              fenced.claimRef,
              undefined,
              true
            )
          ).now
        : now!
      if (
        event.status === 'processing' &&
        (event.lease_owner !== workerId ||
          !event.lease_until ||
          new Date(event.lease_until).getTime() <= preparedNow.getTime())
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
      if (fenced)
        await assertFencedOutboxClaimOnClient(
          ctx.client,
          fenced.claimRef,
          undefined,
          true
        )
      checkSignal()
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
      const takeover = await ctx.isOutboxTakeoverActive(
        tenantId,
        event,
        rawInput.takeoverActive
      )
      if (fenced)
        await assertFencedOutboxClaimOnClient(ctx.client, fenced.claimRef)
      checkSignal()
      if (takeover) {
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
    },
    undefined,
    checkSignal
  )

  if (prepared.kind === 'processed' && !fenced) return prepared.event
  if (prepared.kind === 'takeover' && !fenced) {
    return withOutboxTransaction(ctx.client, () =>
      ctx.suppressOutboxForTakeover(
        prepared.event,
        tenantId,
        workerId,
        ctx.repositoryNow()
      )
    )
  }

  let result = prepared.kind === 'execute' ? prepared.journalResult : undefined
  if (prepared.kind === 'execute' && !prepared.hasJournal) {
    checkSignal()
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

  if (fenced) {
    await fenced.beforeFinalAck()
    checkSignal()
  }

  return withOutboxTransaction(
    ctx.client,
    async () => {
      checkSignal()
      let ackNow = fenced ? undefined : ctx.repositoryNow()
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
      if (fenced)
        ackNow = (
          await assertFencedOutboxClaimOnClient(
            ctx.client,
            fenced.claimRef,
            undefined,
            true
          )
        ).now
      if (event.status !== 'processing' && event.status !== 'processed') {
        throw new DomainError('conflict', 'Outbox lease is not owned by worker')
      }
      if (
        event.status === 'processing' &&
        (event.lease_owner !== workerId ||
          !event.lease_until ||
          new Date(event.lease_until).getTime() <= ackNow!.getTime())
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
      if (fenced)
        ackNow = (
          await assertFencedOutboxClaimOnClient(
            ctx.client,
            fenced.claimRef,
            undefined,
            true
          )
        ).now
      checkSignal()
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
      const takeover = await ctx.isOutboxTakeoverActive(
        tenantId,
        event,
        rawInput.takeoverActive
      )
      if (fenced)
        ackNow = (
          await assertFencedOutboxClaimOnClient(ctx.client, fenced.claimRef)
        ).now
      checkSignal()
      if (takeover || (fenced && prepared.kind === 'takeover')) {
        return ctx.suppressOutboxForTakeover(
          event,
          tenantId,
          workerId,
          ackNow!,
          fenced?.claimRef
        )
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

      if (fenced)
        ackNow = (
          await assertFencedOutboxClaimOnClient(ctx.client, fenced.claimRef)
        ).now
      checkSignal()
      const updated = await ctx.client.query<DurableOutboxRow>(
        `UPDATE outbox_events
       SET status = 'processed',
           processed_at = $3,
           lease_owner = NULL,
           lease_until = NULL,
           last_error = NULL,
           available_at = $3
       WHERE tenant_id = $1 AND id = $2 AND status = 'processing'
         AND lease_owner = $4${
           fenced
             ? ` AND attempts = $5 AND lease_until > clock_timestamp()
         AND EXISTS (SELECT 1 FROM outbox_attempts WHERE tenant_id = $1 AND event_id = $2
           AND id = $6::bigint AND worker_id = $4 AND attempt = $5 AND outcome IS NULL)`
             : ''
         }
       RETURNING ${outboxSelectColumns}`,
        [
          tenantId,
          event.id,
          ackNow,
          workerId,
          ...(fenced
            ? [
                fenced.claimRef.expectedOuterAttempt,
                fenced.claimRef.expectedAttemptRowId
              ]
            : [])
        ]
      )
      const updatedRow = updated.rows[0]
      if (!updatedRow)
        throw new DomainError('conflict', 'Outbox ack lost its lease')
      const attemptUpdate = await ctx.client.query<{ id: string }>(
        `UPDATE outbox_attempts
       SET outcome = 'processed', error = NULL
       WHERE tenant_id = $1 AND event_id = $2 AND worker_id = $3
         AND outcome IS NULL${fenced ? ' AND attempt = $4 AND id = $5::bigint' : ''}
       ${fenced ? 'RETURNING id::text AS id' : ''}`,
        [
          tenantId,
          event.id,
          workerId,
          ...(fenced
            ? [
                fenced.claimRef.expectedOuterAttempt,
                fenced.claimRef.expectedAttemptRowId
              ]
            : [])
        ]
      )
      if (
        fenced &&
        (attemptUpdate.rows.length !== 1 ||
          attemptUpdate.rows[0]?.id !== fenced.claimRef.expectedAttemptRowId)
      ) {
        throw new DomainError('conflict', 'Outbox ack lost its attempt row')
      }
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
    },
    undefined,
    checkSignal
  )
}

export async function fail(
  ctx: PostgresOutboxContext,
  rawInput: OutboxFailInput,
  fenced?: FencedOutboxFailInput
): Promise<DurableOutboxEventRecord> {
  if (fenced) fenced = { ...fenced, claimRef: { ...fenced.claimRef } }
  if (fenced) assertFlatClaimIdentity(rawInput, fenced.claimRef)
  const tenantId = TenantIdSchema.parse(rawInput.tenantId)
  const eventId = assertOutboxText(rawInput.eventId, 'eventId', 160)
  const workerId = validateOutboxWorker(rawInput.workerId)
  let now = fenced ? undefined : ctx.repositoryNow()
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
    if (fenced) {
      if (rawInput.handoff && event.session_id) {
        await assertFencedOutboxClaimOnClient(ctx.client, fenced.claimRef)
        await ctx.markOutboxSessionHandoff(
          tenantId,
          event.session_id,
          await outboxDbNow(ctx.client)
        )
      }
      now = (await assertFencedOutboxClaimOnClient(ctx.client, fenced.claimRef))
        .now
    }
    if (
      event.status !== 'processing' ||
      event.lease_owner !== workerId ||
      !event.lease_until ||
      new Date(event.lease_until).getTime() <= now!.getTime()
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
      : new Date(now!.getTime() + outboxBackoffMs(event.attempts))
    const updated = await ctx.client.query<DurableOutboxRow>(
      `UPDATE outbox_events
       SET status = $3,
           available_at = $4,
           last_error = $5,
           lease_owner = NULL,
           lease_until = NULL,
           dead_lettered_at = CASE WHEN $3 = 'dead_letter' THEN $6::timestamptz ELSE NULL END
       WHERE tenant_id = $1 AND id = $2 AND status = 'processing'
         AND lease_owner = $7${
           fenced
             ? ` AND attempts = $8 AND lease_until > clock_timestamp()
         AND EXISTS (SELECT 1 FROM outbox_attempts WHERE tenant_id = $1 AND event_id = $2
           AND id = $9::bigint AND worker_id = $7 AND attempt = $8 AND outcome IS NULL)`
             : ''
         }
       RETURNING ${outboxSelectColumns}`,
      [
        tenantId,
        event.id,
        status,
        availableAt,
        error,
        now,
        workerId,
        ...(fenced
          ? [
              fenced.claimRef.expectedOuterAttempt,
              fenced.claimRef.expectedAttemptRowId
            ]
          : [])
      ]
    )
    const updatedRow = updated.rows[0]
    if (!updatedRow)
      throw new DomainError('conflict', 'Outbox failure lost its lease')
    if (rawInput.handoff && event.session_id && !fenced) {
      await ctx.markOutboxSessionHandoff(tenantId, event.session_id, now!)
    }
    const attemptUpdate = await ctx.client.query<{ id: string }>(
      `UPDATE outbox_attempts
       SET outcome = $4, error = $5
       WHERE tenant_id = $1 AND event_id = $2 AND worker_id = $3
         AND outcome IS NULL${fenced ? ' AND attempt = $6 AND id = $7::bigint' : ''}
       ${fenced ? 'RETURNING id::text AS id' : ''}`,
      [
        tenantId,
        event.id,
        workerId,
        rawInput.handoff ? 'handoff' : status,
        error,
        ...(fenced
          ? [
              fenced.claimRef.expectedOuterAttempt,
              fenced.claimRef.expectedAttemptRowId
            ]
          : [])
      ]
    )
    if (
      fenced &&
      (attemptUpdate.rows.length !== 1 ||
        attemptUpdate.rows[0]?.id !== fenced.claimRef.expectedAttemptRowId)
    ) {
      throw new DomainError('conflict', 'Outbox failure lost its attempt row')
    }
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
  operation: () => Promise<T>,
  control?: FencedRenewalControl,
  beforeCommit?: () => void
): Promise<T> {
  try {
    assertFencedRenewalActive(control)
  } catch (error) {
    if (isFencedRenewalGuardStop(error, control)) error.cleanupConfirmed = true
    throw error
  }
  if (!control) await client.query('BEGIN')
  try {
    if (control) {
      await queryRenewal(client, 'BEGIN', undefined, control)
      await queryRenewal(
        client,
        "SET LOCAL lock_timeout = '500ms'",
        undefined,
        control
      )
      await queryRenewal(
        client,
        "SET LOCAL statement_timeout = '1000ms'",
        undefined,
        control
      )
    }
    const result = await operation()
    assertFencedRenewalActive(control)
    beforeCommit?.()
    await client.query('COMMIT')
    try {
      assertFencedRenewalActive(control)
    } catch {
      throw new Error('Fenced renewal stopped during COMMIT')
    }
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      if (isFencedRenewalGuardStop(error, control)) throw rollbackError
      // Preserve the original database or handler error.
    }
    if (isFencedRenewalGuardStop(error, control)) error.cleanupConfirmed = true
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
