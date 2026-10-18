import { OperationalExecutionError } from '@cvg/harness'
import { TenantIdSchema } from '@cvg/platform'
import type { FencedOuterClaimRef } from './outbox.ts'
import type { PostgresQueryable } from './postgres.ts'

/** Private persistence fence, reconstructed by the trusted worker, never HTTP. */
export interface ControlledPublishedDatabaseFence {
  readonly tenantId: string
  readonly executionId: string
  readonly workerId: string
  readonly attempt: number
  readonly outer: FencedOuterClaimRef
  readonly signal?: AbortSignal
  readonly cancellation?: {
    readonly eventSequence: string
    readonly attempt: number
  }
}

export interface ControlledPublishedBindingRow extends Record<string, unknown> {
  tenant_id: string
  execution_id: string
  inbound_message_id: string
  conversation_id: string
  session_id: string
  outbox_id: string
  agent_id: string
  version_id: string
  trace_id: string
  correlation_id: string
  request_digest: string
  capability_fingerprint: string
  prepared: unknown
  prepared_digest: string | null
  state: unknown
  state_digest: string | null
  state_revision: string | number
  evidence_sequence: number
  evidence_bytes: number
  evidence_hash: string
  started_at: Date | string | null
  expires_at: Date | string | null
  dispatch_closed: boolean
  fault: unknown
  closed_trace: unknown
  closed_trace_digest: string | null
  phase_state: 'IDLE_SEALED' | 'OPEN' | 'FAULTED' | 'CLOSED'
  phase_revision: string | number
  seal_id: string
  seal_checkpoint_digest: string | null
  sealed_checkpoint: unknown
  seal_state_digest: string | null
  sealed_through_sequence: number
  consumed_seal_id: string | null
  open_phase_id: string | null
  open_phase_type: string | null
  open_phase_input_digest: string | null
  open_phase_attempt: number | null
  open_phase_acked: boolean
  active_outer_attempt: number | null
  active_outer_worker_id: string | null
  active_outer_attempt_row_id: string | null
  approval_receipt: unknown
}

interface ParentRow extends Record<string, unknown> {
  tenant_id: string
  id: string
  state: string
  attempt: number
  lease_owner: string | null
  lease_until: Date | string | null
}

export function publishedFenceError(code = 'lease_lost'): never {
  throw new OperationalExecutionError(
    code === 'conflict' ? 'conflict' : 'lease_lost',
    'Controlled published execution guard rejected the operation'
  )
}

export function publishedIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) publishedFenceError('conflict')
  return date.toISOString()
}

export async function publishedDbNow(client: PostgresQueryable): Promise<Date> {
  const result = await client.query<{ now: Date | string }>(
    'SELECT clock_timestamp() AS now'
  )
  const now = result.rows[0]?.now
  if (now === undefined) publishedFenceError()
  return new Date(publishedIso(now))
}

export async function setPublishedWriteContext(
  client: PostgresQueryable,
  fence: Pick<
    ControlledPublishedDatabaseFence,
    'executionId' | 'workerId' | 'attempt'
  >,
  mode: 'active' | 'settlement' | 'claim' | 'close' | 'cancel' | 'cancel_close'
): Promise<void> {
  await client.query(
    `SELECT set_config('cvg.published_execution',$1,true),
    set_config('cvg.published_worker',$2,true),set_config('cvg.published_attempt',$3,true),
    set_config('cvg.published_mode',$4,true)`,
    [fence.executionId, fence.workerId, String(fence.attempt), mode]
  )
}

export async function boundExecutionIdForOperation(
  client: PostgresQueryable,
  tenantId: string,
  operationKey: string
): Promise<string | null> {
  const result = await client.query<{ execution_id: string }>(
    `SELECT id AS execution_id FROM operational_executions
     WHERE tenant_id=$1 AND request#>>'{runtime,context,values,adapterVersion}'='controlled-published-v1'
       AND left($2,length(id)+2)=id||':s' LIMIT 1`,
    [tenantId, operationKey]
  )
  return result.rows[0]?.execution_id ?? null
}

export async function guardOptionalPublishedWrite(
  client: PostgresQueryable,
  tenantId: string,
  executionId: string,
  fence: ControlledPublishedDatabaseFence | undefined,
  settlement = false
): Promise<Awaited<ReturnType<typeof guardControlledPublishedFence>> | null> {
  const bound = await client.query(
    `SELECT id FROM operational_executions WHERE tenant_id=$1 AND id=$2
     AND request#>>'{runtime,context,values,adapterVersion}'='controlled-published-v1'`,
    [tenantId, executionId]
  )
  if (!bound.rows.length) {
    if (fence) publishedFenceError()
    return null
  }
  if (
    !fence ||
    fence.tenantId !== tenantId ||
    fence.executionId !== executionId
  )
    publishedFenceError()
  return guardControlledPublishedFence(client, fence, {
    settlement,
    requirePhase: true
  })
}

/** One client/one transaction; global lock order is shared by every bound port. */
export async function guardControlledPublishedFence(
  client: PostgresQueryable,
  fence: ControlledPublishedDatabaseFence,
  options: {
    settlement?: boolean
    requirePhase?: boolean
    skipPause?: boolean
    signal?: AbortSignal
  } = {}
): Promise<{
  binding: ControlledPublishedBindingRow
  now: Date
  recheck: () => Promise<Date>
  leaseUntil: string
}> {
  options = {
    ...options,
    ...(!options.settlement && !options.signal && fence.signal
      ? { signal: fence.signal }
      : {})
  }
  TenantIdSchema.parse(fence.tenantId)
  if (fence.cancellation) {
    if (!options.settlement || options.requirePhase) publishedFenceError()
    return guardCancelledPublishedFence(client, fence)
  }
  const outer = fence.outer
  if (
    !Number.isSafeInteger(fence.attempt) ||
    fence.attempt < 1 ||
    outer.tenantId !== fence.tenantId ||
    outer.processWorkerId !== fence.workerId ||
    !Number.isSafeInteger(outer.expectedOuterAttempt) ||
    outer.expectedOuterAttempt < 1 ||
    !/^[1-9]\d*$/.test(outer.expectedAttemptRowId) ||
    options.signal?.aborted
  )
    publishedFenceError()
  const parentResult = await client.query<ParentRow>(
    'SELECT tenant_id,id,state,attempt,lease_owner,lease_until FROM operational_executions WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
    [fence.tenantId, fence.executionId]
  )
  const parent = parentResult.rows[0]
  const bindingResult = await client.query<ControlledPublishedBindingRow>(
    'SELECT * FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2 FOR UPDATE',
    [fence.tenantId, fence.executionId]
  )
  const binding = bindingResult.rows[0]
  if (
    !parent ||
    !binding ||
    binding.outbox_id !== outer.eventId ||
    binding.active_outer_attempt !== outer.expectedOuterAttempt ||
    binding.active_outer_worker_id !== outer.processWorkerId ||
    String(binding.active_outer_attempt_row_id) !==
      outer.expectedAttemptRowId ||
    parent.attempt !== fence.attempt ||
    parent.lease_owner !== fence.workerId ||
    !['CLAIMED', 'RUNNING'].includes(parent.state) ||
    binding.phase_state === 'CLOSED'
  )
    publishedFenceError()
  if (
    !options.settlement &&
    (binding.dispatch_closed ||
      binding.fault ||
      binding.phase_state === 'FAULTED')
  )
    publishedFenceError()
  if (
    options.requirePhase &&
    (!['OPEN', ...(options.settlement ? ['FAULTED'] : [])].includes(
      binding.phase_state
    ) ||
      !binding.open_phase_id ||
      binding.open_phase_attempt !== fence.attempt ||
      binding.open_phase_acked)
  )
    publishedFenceError()
  const queueResult = await client.query<Record<string, unknown>>(
    'SELECT status,lease_owner,lease_until,attempts FROM operational_execution_outbox WHERE tenant_id=$1 AND execution_id=$2 FOR UPDATE',
    [fence.tenantId, fence.executionId]
  )
  const queue = queueResult.rows[0]
  const outboxResult = await client.query<Record<string, unknown>>(
    'SELECT * FROM outbox_events WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
    [fence.tenantId, outer.eventId]
  )
  const event = outboxResult.rows[0]
  const attemptResult = await client.query<Record<string, unknown>>(
    `SELECT id,event_id,attempt,worker_id,outcome FROM outbox_attempts
      WHERE tenant_id=$1 AND event_id=$2 AND id=$3
        AND NOT EXISTS (SELECT 1 FROM outbox_attempts newer WHERE newer.tenant_id=$1
          AND newer.event_id=$2 AND newer.id>outbox_attempts.id) FOR UPDATE`,
    [fence.tenantId, outer.eventId, outer.expectedAttemptRowId]
  )
  const attempt = attemptResult.rows[0]
  if (
    !queue ||
    queue.status !== 'processing' ||
    queue.lease_owner !== fence.workerId ||
    queue.attempts !== fence.attempt ||
    !event ||
    event.status !== 'processing' ||
    event.lease_owner !== outer.processWorkerId ||
    event.attempts !== outer.expectedOuterAttempt ||
    !attempt ||
    String(attempt.id) !== outer.expectedAttemptRowId ||
    attempt.attempt !== outer.expectedOuterAttempt ||
    attempt.worker_id !== outer.processWorkerId ||
    attempt.outcome !== null
  )
    publishedFenceError()
  if (!options.skipPause) {
    const session = await client.query<Record<string, unknown>>(
      'SELECT conversation_id,takeover_state,status FROM sessions WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
      [fence.tenantId, binding.session_id]
    )
    if (
      !session.rows[0] ||
      session.rows[0].conversation_id !== binding.conversation_id ||
      (!options.settlement && session.rows[0].takeover_state !== 'BOT_ACTIVE')
    )
      publishedFenceError()
    await client.query(
      `INSERT INTO kernel_pause_switches(tenant_id,paused,updated_by)
      VALUES ($1,false,'controlled-published-initialization') ON CONFLICT (tenant_id) DO NOTHING`,
      [fence.tenantId]
    )
    const pause = await client.query<{ paused: boolean }>(
      'SELECT paused FROM kernel_pause_switches WHERE tenant_id=$1 FOR UPDATE',
      [fence.tenantId]
    )
    if (
      !pause.rows[0] ||
      typeof pause.rows[0].paused !== 'boolean' ||
      (!options.settlement && pause.rows[0].paused)
    )
      publishedFenceError()
  }
  const recheck = async (): Promise<Date> => {
    if (options.signal?.aborted) publishedFenceError()
    const now = await publishedDbNow(client)
    for (const value of [
      parent.lease_until,
      queue.lease_until,
      event.lease_until
    ]) {
      if (
        (typeof value !== 'string' && !(value instanceof Date)) ||
        Date.parse(publishedIso(value)) <= now.getTime()
      )
        publishedFenceError()
    }
    if (
      !options.settlement &&
      binding.expires_at !== null &&
      Date.parse(publishedIso(binding.expires_at)) <= now.getTime()
    )
      publishedFenceError()
    if (options.signal?.aborted) publishedFenceError()
    return now
  }
  const now = await recheck()
  await setPublishedWriteContext(
    client,
    fence,
    options.settlement ? 'settlement' : 'active'
  )
  await recheck()
  const leaseUntil = new Date(
    Math.min(
      ...[
        parent.lease_until,
        queue.lease_until,
        event.lease_until,
        ...(binding.expires_at === null ? [] : [binding.expires_at])
      ].map((value) => new Date(value as string | Date).getTime())
    )
  ).toISOString()
  return { binding, now, recheck, leaseUntil }
}

/** Settlement of an authenticated terminal cancellation never reacquires an inner lease. */
export async function guardCancelledPublishedFence(
  client: PostgresQueryable,
  fence: ControlledPublishedDatabaseFence
): Promise<{
  binding: ControlledPublishedBindingRow
  now: Date
  recheck: () => Promise<Date>
  leaseUntil: string
}> {
  const c = fence.cancellation,
    outer = fence.outer
  if (
    !c ||
    !Number.isSafeInteger(c.attempt) ||
    c.attempt < 0 ||
    fence.attempt !== c.attempt ||
    !/^[1-9]\d*$/.test(c.eventSequence) ||
    outer.tenantId !== fence.tenantId ||
    outer.processWorkerId !== fence.workerId
  )
    publishedFenceError()
  const parent = (
    await client.query<ParentRow>(
      'SELECT * FROM operational_executions WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
      [fence.tenantId, fence.executionId]
    )
  ).rows[0]
  const binding = (
    await client.query<ControlledPublishedBindingRow>(
      'SELECT * FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2 FOR UPDATE',
      [fence.tenantId, fence.executionId]
    )
  ).rows[0]
  if (
    parent?.state !== 'CANCELLED' ||
    parent.attempt !== c.attempt ||
    parent.lease_owner !== null ||
    parent.lease_until !== null ||
    !binding ||
    binding.phase_state === 'CLOSED' ||
    binding.outbox_id !== outer.eventId ||
    binding.active_outer_attempt !== outer.expectedOuterAttempt ||
    binding.active_outer_worker_id !== outer.processWorkerId ||
    String(binding.active_outer_attempt_row_id) !== outer.expectedAttemptRowId
  )
    publishedFenceError()
  await client.query(
    'SELECT * FROM operational_execution_outbox WHERE tenant_id=$1 AND execution_id=$2 FOR UPDATE',
    [fence.tenantId, fence.executionId]
  )
  const event = await client.query(
    `SELECT sequence FROM operational_execution_events WHERE tenant_id=$1 AND execution_id=$2
    AND event_type='CANCELLED' AND attempt=$3 AND sequence=$4`,
    [fence.tenantId, fence.executionId, c.attempt, c.eventSequence]
  )
  if (event.rowCount !== 1) publishedFenceError()
  let leaseUntil = ''
  const recheck = async () => {
    const { assertFencedOutboxClaimOnClient } =
      await import('./postgres-outbox.ts')
    const result = await assertFencedOutboxClaimOnClient(client, outer)
    leaseUntil = publishedIso(result.event.lease_until!)
    return result.now
  }
  const now = await recheck()
  await setPublishedWriteContext(client, fence, 'cancel_close')
  await client.query(
    "SELECT set_config('cvg.published_cancel_event',$1,true)",
    [c.eventSequence]
  )
  await recheck()
  return { binding, now, recheck, leaseUntil }
}
