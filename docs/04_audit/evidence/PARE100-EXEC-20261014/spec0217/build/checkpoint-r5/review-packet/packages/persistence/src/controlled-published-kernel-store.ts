import { randomUUID } from 'node:crypto'
import {
  TenantIdSchema,
  controlledCanonicalJson,
  controlledDigest,
  createCapabilityInputHash,
  CONTROLLED_SETTLEMENT_PHASES,
  validateControlledSnapshot,
  type ControlledPublishedAdmission,
  type ControlledPublishedAdmissionInput,
  type ControlledPublishedPrepared,
  type ControlledPublishedState,
  type ControlledPublishedSnapshot,
  type ControlledKernelFence,
  type ControlledKernelIdentity,
  type ControlledKernelHostContext,
  type ControlledKernelContinuation,
  type ControlledPhaseRef,
  type ControlledEvidenceAck,
  type ControlledResumeSeal,
  type ControlledBoundApprovalVerification,
  type ControlledBoundApprovalConsumption,
  type ControlledApprovalReceipt,
  type ControlledDispatchPermit,
  type PluginAuditEvent,
  type TestRunTrace
} from '@cvg/platform'
import { sanitizeAuditEvidencePayload, redactSensitiveText } from '@cvg/shared'
import {
  computeExecutionRequestHash,
  parseExecutionSubmission,
  type ExecutionSubmission
} from '@cvg/harness'
import type {
  ExecutionCheckpoint,
  RuntimeInput,
  RuntimeResult
} from '@cvg/harness-contracts'
import type { PostgresQueryable } from './postgres.ts'
import {
  withTenantTransaction,
  withTenantContext,
  runFencedRenewalTransaction,
  assertFencedRenewalActive,
  queryRenewal,
  type PostgresPoolLike
} from './tenant-scoped-postgres.ts'
import {
  assertFencedOutboxClaimOnClient,
  renewOutboxClaimOnClient
} from './postgres-outbox.ts'
import type {
  FencedOuterClaimRef,
  FencedRenewalControl,
  FencedClaimRenewal
} from './outbox.ts'
import {
  submitOperationalExecutionOnClient,
  lockedOperationalRecordOnClient,
  appendOperationalEventOnClient,
  transitionOperationalExecutionOnClient,
  PostgresOperationalEffectJournal
} from './operational-execution-postgres.ts'
import {
  PostgresExecutionStepStore,
  saveOperationalCheckpointOnClient
} from './operational-step-postgres.ts'
import { verifyAndConsumeOnClient } from './platform-approval-repository.ts'
import { sanitizeControlledPublishedEvidence } from './controlled-published-evidence.ts'
import {
  guardControlledPublishedFence,
  setPublishedWriteContext,
  publishedDbNow,
  publishedIso,
  publishedFenceError,
  type ControlledPublishedBindingRow,
  type ControlledPublishedDatabaseFence
} from './controlled-published-fencing.ts'

const ZERO_HASH = `sha256-${'0'.repeat(64)}`
const ADAPTER = 'controlled-published-v1'
const EVENT_BYTES = 262144
const NORMAL_EVIDENCE_BYTES = 4194304 - 8 * EVENT_BYTES
const TERMINAL_PHASE = {
  test: (type: string) =>
    (CONTROLLED_SETTLEMENT_PHASES as readonly string[]).includes(type)
}

export interface ControlledPublishedAdmissionRecord {
  executionId: string
  input: ControlledPublishedAdmissionInput
  runtime: RuntimeInput
  requestDigest: string
  fingerprint: string
}
export interface ControlledPublishedClaim extends ControlledPublishedAdmissionRecord {
  fence: ControlledPublishedDatabaseFence
  identity: ControlledKernelIdentity
  state: ControlledPublishedState
  prepared: ControlledPublishedPrepared | null
  expiresAt: string | null
  disposition: 'ACTIVE' | 'SETTLEMENT' | 'CANCELLED' | 'CLOSED'
}

function json<T>(value: unknown): T {
  // Reject executable/lossy/oversized values before crossing the durable boundary.
  return JSON.parse(controlledCanonicalJson(value)) as T
}
/** Kernel-owned typed envelopes contain optional own properties set to undefined.
 * Omit only those properties; executable/accessor/class values remain rejected. */
function typedEnvelope<T>(value: T): T {
  const visit = (v: unknown, depth: number): unknown => {
    if (depth > 48) throw new Error('controlled_state_bounds')
    if (v === null || typeof v !== 'object') return v
    if (v instanceof Date) {
      if (!Number.isFinite(v.getTime()))
        throw new Error('controlled_state_json')
      return v.toISOString()
    }
    if (Object.getPrototypeOf(v) !== Object.prototype && !Array.isArray(v))
      throw new Error('controlled_state_json')
    if (Object.getOwnPropertySymbols(v).length)
      throw new Error('controlled_state_json')
    const descriptors = Object.getOwnPropertyDescriptors(v)
    for (const d of Object.values(descriptors))
      if (d.get || d.set) throw new Error('controlled_state_accessor')
    if (Array.isArray(v)) return v.map((x) => visit(x, depth + 1))
    return Object.fromEntries(
      Object.entries(descriptors)
        .filter(([, d]) => d.value !== undefined)
        .map(([k, d]) => [k, visit(d.value, depth + 1)])
    )
  }
  return json<T>(visit(value, 0))
}
function count(value: string | number): number {
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < 0) publishedFenceError('conflict')
  return n
}
function admissionRecord(
  b: ControlledPublishedBindingRow
): ControlledPublishedAdmissionRecord {
  return {
    executionId: b.execution_id,
    input: json<ControlledPublishedAdmissionInput>(b.admission_input),
    runtime: json<RuntimeInput>(b.admission_runtime),
    requestDigest: b.request_digest,
    fingerprint: b.capability_fingerprint
  }
}
function phaseOf(b: ControlledPublishedBindingRow): ControlledPhaseRef | null {
  if (!b.open_phase_id) return null
  if (!b.open_phase_type || !b.open_phase_input_digest || !b.open_phase_attempt)
    publishedFenceError('conflict')
  return {
    phaseId: b.open_phase_id,
    phaseType: b.open_phase_type,
    phaseRevision: count(b.phase_revision),
    attempt: b.open_phase_attempt,
    inputDigest: b.open_phase_input_digest
  }
}
function hydrateTrace(value: unknown): TestRunTrace {
  const trace = json<TestRunTrace>(value)
  for (const key of ['createdAt', 'startedAt', 'completedAt'] as const) {
    const date = trace[key]
    if (date !== undefined) trace[key] = new Date(publishedIso(date))
  }
  return trace
}
function samePhase(
  b: ControlledPublishedBindingRow,
  p: ControlledPhaseRef
): void {
  if (controlledCanonicalJson(phaseOf(b)) !== controlledCanonicalJson(p))
    publishedFenceError()
}
function validateFence(
  expected: ControlledPublishedDatabaseFence,
  actual: ControlledKernelFence
): void {
  if (
    expected.tenantId !== actual.tenantId ||
    expected.executionId !== actual.executionId ||
    expected.workerId !== actual.workerId ||
    expected.attempt !== actual.attempt
  )
    publishedFenceError()
}

/** Trusted PostgreSQL composition only. No HTTP/client-provided host is accepted. */
export class PostgresControlledPublishedKernelStore {
  constructor(private readonly pool: PostgresPoolLike) {}

  readAdmission(
    tenantId: string,
    inboundMessageId: string
  ): Promise<ControlledPublishedAdmissionRecord | null> {
    return withTenantContext(
      this.pool,
      TenantIdSchema.parse(tenantId),
      async (client) => {
        const q = await client.query<ControlledPublishedBindingRow>(
          'SELECT * FROM controlled_published_bindings WHERE tenant_id=$1 AND inbound_message_id=$2',
          [tenantId, inboundMessageId]
        )
        const b = q.rows[0]
        if (!b) return null
        await this.verifyEvidence(client, b)
        return admissionRecord(b)
      }
    )
  }

  admit(
    admission: ControlledPublishedAdmission,
    outer: FencedOuterClaimRef
  ): Promise<ControlledPublishedAdmissionRecord> {
    const a = json<ControlledPublishedAdmission>(admission)
    const i = a.input
    if (
      outer.tenantId !== i.tenantId ||
      !/^sha256-[0-9a-f]{64}$/.test(a.requestDigest) ||
      a.runtime.executionId !== i.executionId
    )
      publishedFenceError('conflict')
    return withTenantTransaction(
      this.pool,
      TenantIdSchema.parse(i.tenantId),
      async (client) => {
        // A tenant/message advisory lock closes the first-admission race before either parent exists.
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`${i.tenantId}:${i.inboundMessageId}`]
        )
        const existing = await client.query<ControlledPublishedBindingRow>(
          'SELECT * FROM controlled_published_bindings WHERE tenant_id=$1 AND inbound_message_id=$2 FOR UPDATE',
          [i.tenantId, i.inboundMessageId]
        )
        if (existing.rows[0]) {
          const b = existing.rows[0]
          if (
            b.request_digest !== a.requestDigest ||
            b.capability_fingerprint !== a.fingerprint ||
            b.outbox_id !== outer.eventId
          )
            publishedFenceError('conflict')
          await assertFencedOutboxClaimOnClient(client, outer)
          await this.verifyEvidence(client, b)
          return admissionRecord(b)
        }
        await assertFencedOutboxClaimOnClient(client, outer)
        const normalized = parseExecutionSubmission({
          tenantId: i.tenantId,
          idempotencyKey: `published-inbound-v1:${controlledDigest([i.tenantId, i.inboundMessageId]).slice(7)}`,
          capabilityFingerprint: a.fingerprint,
          runtime: a.runtime
        } satisfies ExecutionSubmission)
        const now = await publishedDbNow(client)
        const result = await submitOperationalExecutionOnClient(client, {
          tenant: TenantIdSchema.parse(i.tenantId),
          normalized,
          requestHash: computeExecutionRequestHash(normalized),
          id: i.executionId,
          now
        })
        if (!result.created || result.record.id !== i.executionId)
          publishedFenceError('conflict')
        await client.query(
          `INSERT INTO controlled_published_bindings
        (tenant_id,execution_id,inbound_message_id,conversation_id,session_id,outbox_id,agent_id,version_id,
         trace_id,correlation_id,request_digest,capability_fingerprint,admission_input,admission_runtime,evidence_hash,seal_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16)`,
          [
            i.tenantId,
            i.executionId,
            i.inboundMessageId,
            i.context.conversationId,
            i.context.sessionId,
            outer.eventId,
            i.agentId,
            i.versionId,
            i.traceId,
            i.correlationId,
            a.requestDigest,
            a.fingerprint,
            controlledCanonicalJson(i),
            controlledCanonicalJson(a.runtime),
            ZERO_HASH,
            `seal_${randomUUID()}`
          ]
        )
        await assertFencedOutboxClaimOnClient(client, outer)
        return {
          executionId: i.executionId,
          input: i,
          runtime: a.runtime,
          requestDigest: a.requestDigest,
          fingerprint: a.fingerprint
        }
      }
    )
  }

  claim(
    executionId: string,
    outer: FencedOuterClaimRef
  ): Promise<ControlledPublishedClaim> {
    return withTenantTransaction(this.pool, outer.tenantId, async (client) => {
      const parent = await lockedOperationalRecordOnClient(
        client,
        outer.tenantId,
        executionId
      )
      const q = await client.query<ControlledPublishedBindingRow>(
        'SELECT * FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2 FOR UPDATE',
        [outer.tenantId, executionId]
      )
      const b = q.rows[0]
      if (!b || b.outbox_id !== outer.eventId) publishedFenceError()
      await this.verifyEvidence(client, b)
      await client.query(
        'SELECT * FROM operational_execution_outbox WHERE tenant_id=$1 AND execution_id=$2 FOR UPDATE',
        [outer.tenantId, executionId]
      )
      await assertFencedOutboxClaimOnClient(client, outer)
      if (b.phase_state === 'CLOSED') {
        const closed = (
          await client.query<{ canonical_payload: Record<string, unknown> }>(
            `SELECT canonical_payload FROM controlled_published_evidence
          WHERE tenant_id=$1 AND execution_id=$2 AND event_key='execution:closed'`,
            [outer.tenantId, executionId]
          )
        ).rows[0]?.canonical_payload
        const result = json<RuntimeResult>(b.runtime_result)
        if (
          !closed ||
          closed.traceDigest !== controlledDigest(b.closed_trace) ||
          closed.resultDigest !== controlledDigest(result) ||
          closed.stateDigest !== controlledDigest(b.state) ||
          parent.state !==
            (result.stopReason === 'COMPLETED'
              ? 'SUCCEEDED'
              : result.stopReason === 'CANCELLED'
                ? 'CANCELLED'
                : 'FAILED_TERMINAL') ||
          (result.stopReason !== 'CANCELLED' &&
            controlledCanonicalJson(typedEnvelope(parent.result)) !==
              controlledCanonicalJson(result))
        )
          publishedFenceError('conflict')
        return this.claimProjection(b, outer, parent.attempt, 'CLOSED', null)
      }
      if (parent.state === 'CANCELLED') {
        const cancellation = (
          await client.query<{ sequence: string }>(
            `SELECT sequence::text AS sequence FROM operational_execution_events
          WHERE tenant_id=$1 AND execution_id=$2 AND event_type='CANCELLED' AND attempt=$3 ORDER BY operational_execution_events.sequence DESC LIMIT 1`,
            [outer.tenantId, executionId, parent.attempt]
          )
        ).rows[0]
        if (
          !cancellation ||
          parent.leaseOwner !== null ||
          parent.leaseUntil !== null
        )
          publishedFenceError()
        const fence = {
          tenantId: outer.tenantId,
          executionId,
          workerId: outer.processWorkerId,
          attempt: parent.attempt,
          outer,
          cancellation: {
            eventSequence: cancellation.sequence,
            attempt: parent.attempt
          }
        }
        await setPublishedWriteContext(client, fence, 'cancel_close')
        await client.query(
          "SELECT set_config('cvg.published_cancel_event',$1,true)",
          [cancellation.sequence]
        )
        await client.query(
          `UPDATE controlled_published_bindings SET phase_state='FAULTED',dispatch_closed=true,
          active_outer_attempt=$3,active_outer_worker_id=$4,active_outer_attempt_row_id=$5 WHERE tenant_id=$1 AND execution_id=$2`,
          [
            outer.tenantId,
            executionId,
            outer.expectedOuterAttempt,
            outer.processWorkerId,
            outer.expectedAttemptRowId
          ]
        )
        await assertFencedOutboxClaimOnClient(client, outer)
        const fresh = (
          await client.query<ControlledPublishedBindingRow>(
            'SELECT * FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
            [outer.tenantId, executionId]
          )
        ).rows[0]!
        return this.claimProjection(
          fresh,
          outer,
          parent.attempt,
          'CANCELLED',
          null,
          fence.cancellation
        )
      }
      const session = await client.query<{ takeover_state: string }>(
        'SELECT takeover_state FROM sessions WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
        [outer.tenantId, b.session_id]
      )
      await client.query(
        "INSERT INTO kernel_pause_switches(tenant_id,paused,updated_by) VALUES($1,false,'controlled-published-initialization') ON CONFLICT(tenant_id) DO NOTHING",
        [outer.tenantId]
      )
      const pause = await client.query<{ paused: boolean }>(
        'SELECT paused FROM kernel_pause_switches WHERE tenant_id=$1 FOR UPDATE',
        [outer.tenantId]
      )
      if (
        session.rows[0]?.takeover_state !== 'BOT_ACTIVE' ||
        pause.rows[0]?.paused !== false
      )
        publishedFenceError()
      const { now } = await assertFencedOutboxClaimOnClient(client, outer)
      if (
        !['QUEUED', 'FAILED_RETRYABLE', 'CLAIMED', 'RUNNING'].includes(
          parent.state
        ) ||
        (parent.leaseUntil &&
          new Date(parent.leaseUntil).getTime() > now.getTime())
      )
        publishedFenceError()
      const attempt = parent.attempt + 1
      const fence = {
        tenantId: outer.tenantId,
        executionId,
        workerId: outer.processWorkerId,
        attempt,
        outer
      }
      await setPublishedWriteContext(client, fence, 'claim')
      const expiry = new Date(now.getTime() + 10000)
      await client.query(
        `UPDATE operational_executions SET state='RUNNING',attempt=$3,lease_owner=$4,lease_until=$5,updated_at=$6
        WHERE tenant_id=$1 AND id=$2`,
        [outer.tenantId, executionId, attempt, fence.workerId, expiry, now]
      )
      await client.query(
        `UPDATE operational_execution_outbox SET status='processing',attempts=$3,lease_owner=$4,lease_until=$5,
        last_error=NULL,processed_at=NULL WHERE tenant_id=$1 AND execution_id=$2`,
        [outer.tenantId, executionId, attempt, fence.workerId, expiry]
      )
      const expired =
        b.expires_at !== null &&
        new Date(b.expires_at).getTime() <= now.getTime()
      const unsafe =
        b.phase_state !== 'IDLE_SEALED' ||
        expired ||
        b.dispatch_closed ||
        !!b.fault
      await client.query(
        `UPDATE controlled_published_bindings SET active_outer_attempt=$3,active_outer_worker_id=$4,active_outer_attempt_row_id=$5,
        phase_state=CASE WHEN $6 THEN 'FAULTED' ELSE phase_state END,dispatch_closed=dispatch_closed OR $6,
        fault=CASE WHEN $6 THEN COALESCE(fault,$7::jsonb) ELSE fault END
        WHERE tenant_id=$1 AND execution_id=$2`,
        [
          outer.tenantId,
          executionId,
          outer.expectedOuterAttempt,
          outer.processWorkerId,
          outer.expectedAttemptRowId,
          unsafe,
          controlledCanonicalJson({
            phase: expired ? 'deadline' : 'recovery',
            code: 'evidence_unavailable',
            bodyStarted: false
          })
        ]
      )
      const record = await lockedOperationalRecordOnClient(
        client,
        outer.tenantId,
        executionId
      )
      await appendOperationalEventOnClient(
        client,
        record,
        parent.attempt ? 'RECOVERED' : 'CLAIMED',
        fence.workerId,
        'controlled_published_claim',
        undefined,
        now
      )
      await appendOperationalEventOnClient(
        client,
        record,
        'RUNNING',
        fence.workerId,
        'controlled_published_running',
        undefined,
        now
      )
      await assertFencedOutboxClaimOnClient(client, outer)
      const fresh = (
        await client.query<ControlledPublishedBindingRow>(
          'SELECT * FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
          [outer.tenantId, executionId]
        )
      ).rows[0]!
      const checkpoint = await new PostgresExecutionStepStore({
        query: client.query.bind(client)
      }).loadCheckpoint(outer.tenantId, executionId)
      return this.claimProjection(
        fresh,
        outer,
        attempt,
        unsafe ? 'SETTLEMENT' : 'ACTIVE',
        checkpoint
      )
    })
  }

  private claimProjection(
    b: ControlledPublishedBindingRow,
    outer: FencedOuterClaimRef,
    attempt: number,
    disposition: ControlledPublishedClaim['disposition'],
    checkpoint: ExecutionCheckpoint | null,
    cancellation?: ControlledPublishedDatabaseFence['cancellation']
  ): ControlledPublishedClaim {
    const fence = {
      tenantId: b.tenant_id,
      executionId: b.execution_id,
      workerId: outer.processWorkerId,
      attempt,
      outer,
      ...(cancellation ? { cancellation } : {})
    }
    const state: ControlledPublishedState = {
      phaseState: b.phase_state,
      snapshot:
        b.state === null ? null : json<ControlledPublishedSnapshot>(b.state),
      checkpoint,
      closedTrace:
        b.closed_trace === null ? null : hydrateTrace(b.closed_trace),
      runtimeResult:
        b.runtime_result === null
          ? null
          : json<RuntimeResult>(b.runtime_result),
      sealId: b.seal_id,
      stateRevision: count(b.state_revision),
      sequence: b.evidence_sequence,
      hash: b.evidence_hash,
      sealCheckpointDigest: b.seal_checkpoint_digest,
      sealStateDigest: b.seal_state_digest,
      sealedThroughSequence: b.sealed_through_sequence,
      phaseRevision: count(b.phase_revision),
      openPhase: phaseOf(b),
      consumedSealId: b.consumed_seal_id
    }
    if (b.state && controlledDigest(b.state) !== b.state_digest)
      publishedFenceError('conflict')
    if (b.prepared && controlledDigest(b.prepared) !== b.prepared_digest)
      publishedFenceError('conflict')
    if (
      b.closed_trace &&
      controlledDigest(b.closed_trace) !== b.closed_trace_digest
    )
      publishedFenceError('conflict')
    return {
      ...admissionRecord(b),
      fence,
      state,
      disposition,
      prepared:
        b.prepared === null
          ? null
          : json<ControlledPublishedPrepared>(b.prepared),
      expiresAt: b.expires_at === null ? null : publishedIso(b.expires_at),
      identity: {
        ...fence,
        correlationId: b.correlation_id,
        traceId: b.trace_id,
        inboundMessageId: b.inbound_message_id,
        conversationId: b.conversation_id,
        sessionId: b.session_id,
        agentId: b.agent_id,
        versionId: b.version_id,
        requestDigest: b.request_digest,
        outboxId: outer.eventId,
        outerAttempt: outer.expectedOuterAttempt,
        outerWorkerId: outer.processWorkerId,
        outerAttemptRowId: outer.expectedAttemptRowId
      }
    }
  }

  renewPaired(
    outer: FencedOuterClaimRef,
    inner: ControlledKernelFence,
    control: FencedRenewalControl
  ): Promise<FencedClaimRenewal> {
    const fence = { ...inner, outer }
    let fixedDeadline = Infinity
    const pairedControl: FencedRenewalControl = {
      signal: control.signal,
      assertActive() {
        control.assertActive()
        // Additional local veto only. DB clock remains the authority for mutations.
        if (Date.now() >= fixedDeadline)
          throw new Error('Controlled paired renewal deadline expired')
      }
    }
    return runFencedRenewalTransaction(
      this.pool,
      outer.tenantId,
      pairedControl,
      async (client) => {
        assertFencedRenewalActive(pairedControl)
        const g = await guardControlledPublishedFence(client, fence)
        fixedDeadline =
          g.binding.expires_at === null
            ? Infinity
            : new Date(g.binding.expires_at).getTime()
        // The common guard locks both leases before either update. Any later error rolls both back.
        const now = await g.recheck()
        assertFencedRenewalActive(pairedControl)
        const until = new Date(Math.min(now.getTime() + 10000, fixedDeadline))
        await queryRenewal(
          client,
          `UPDATE operational_executions SET lease_until=$3,updated_at=$4 WHERE tenant_id=$1 AND id=$2`,
          [inner.tenantId, inner.executionId, until, now],
          pairedControl
        )
        await queryRenewal(
          client,
          `UPDATE operational_execution_outbox SET lease_until=$3 WHERE tenant_id=$1 AND execution_id=$2`,
          [inner.tenantId, inner.executionId, until],
          pairedControl
        )
        const renewed = await renewOutboxClaimOnClient(
          client,
          outer,
          pairedControl
        )
        assertFencedRenewalActive(pairedControl)
        // Read the renewed rows again, rather than checking captured old TTLs.
        const current = await guardControlledPublishedFence(client, fence)
        await current.recheck()
        assertFencedRenewalActive(pairedControl)
        return renewed
      }
    )
  }

  createHost(
    claim: ControlledPublishedClaim,
    lifecycle: ControlledKernelHostContext['lifecycle'],
    signal: AbortSignal
  ): ControlledKernelHostContext {
    if (claim.disposition === 'CLOSED') publishedFenceError()
    const fence = { ...claim.fence, signal }
    const checked = (f: ControlledKernelFence): void => validateFence(fence, f)
    const continuation: ControlledKernelContinuation = {
      startPrepared: (f, p, r) => {
        checked(f)
        return this.startPrepared(fence, p, r)
      },
      beginPhase: (f, s, t, d) => {
        checked(f)
        return this.beginPhase(fence, s, t, d)
      },
      ackPhase: (f, p, v) => {
        checked(f)
        return this.ackPhase(fence, p, v)
      },
      saveResumePoint: (f, s, c, q, r) => {
        checked(f)
        return this.saveResumePoint(fence, s, c, q, r)
      },
      poison: (f, p, r) => {
        checked(f)
        return this.poison(fence, p, r)
      },
      close: (f, s, r, t, v) => {
        checked(f)
        return this.close(fence, s, r, t, v)
      }
    }
    return {
      identity: claim.identity,
      signal,
      ...(fence.cancellation ? { cancelled: true } : {}),
      expiresAt: claim.expiresAt,
      state: claim.state,
      continuation,
      lifecycle,
      approvalConsumption: {
        consumeBoundApproval: (f, p, v) => {
          checked(f)
          return this.consumeBoundApproval(fence, p, v)
        }
      },
      admission: {
        readGuards: (f) => {
          checked(f)
          return this.readGuards(fence)
        },
        prepareDispatch: (f, p, v) => {
          checked(f)
          return this.prepareDispatch(fence, p, v)
        }
      },
      ports: {
        effectJournal: new PostgresOperationalEffectJournal(this.pool, {
          fence
        }),
        stepStore: new PostgresExecutionStepStore(this.pool, { fence }),
        audit: {
          append: (event) =>
            this.portEvent(fence, `audit/${event.action}`, event)
        },
        log: {
          append: (event) => this.portEvent(fence, `log/${event.type}`, event)
        },
        effects: {
          started: (ref) => this.portEvent(fence, 'effects/started', ref),
          finished: (ref, outcome) =>
            this.portEvent(fence, 'effects/finished', { ref, outcome })
        },
        pause: {
          isPaused: () => {
            throw new Error('controlled_published_async_pause_required')
          }
        },
        telemetry: { record: () => undefined }
      }
    }
  }

  private startPrepared(
    fence: ControlledPublishedDatabaseFence,
    prepared: ControlledPublishedPrepared,
    runtime: RuntimeInput
  ): Promise<{ preparedDigest: string; startedAt: string; expiresAt: string }> {
    const p = json<ControlledPublishedPrepared>(prepared),
      r = json<RuntimeInput>(runtime)
    return this.run(fence, async (client, b, g) => {
      if (
        p.requestDigest !== b.request_digest ||
        p.fingerprint !== b.capability_fingerprint ||
        r.executionId !== fence.executionId
      )
        publishedFenceError('conflict')
      const digest = controlledDigest(p)
      if (b.prepared !== null) {
        if (
          b.prepared_digest !== digest ||
          controlledDigest(b.prepared_runtime) !== controlledDigest(r) ||
          !b.started_at ||
          !b.expires_at
        )
          publishedFenceError('conflict')
        return {
          preparedDigest: digest,
          startedAt: publishedIso(b.started_at),
          expiresAt: publishedIso(b.expires_at)
        }
      }
      if (b.phase_state !== 'IDLE_SEALED' || b.state !== null)
        publishedFenceError()
      const now = await g.recheck()
      const duration = r.budget.maxDurationMs
      if (!Number.isSafeInteger(duration) || duration < 1 || duration > 120000)
        publishedFenceError('conflict')
      const expires = new Date(now.getTime() + duration)
      await client.query(
        `UPDATE controlled_published_bindings SET prepared=$3::jsonb,prepared_digest=$4,
        prepared_runtime=$5::jsonb,started_at=$6,expires_at=$7 WHERE tenant_id=$1 AND execution_id=$2`,
        [
          fence.tenantId,
          fence.executionId,
          controlledCanonicalJson(p),
          digest,
          controlledCanonicalJson(r),
          now,
          expires
        ]
      )
      await g.recheck()
      return {
        preparedDigest: digest,
        startedAt: now.toISOString(),
        expiresAt: expires.toISOString()
      }
    })
  }

  private beginPhase(
    fence: ControlledPublishedDatabaseFence,
    sealId: string,
    type: string,
    digest: string
  ): Promise<ControlledPhaseRef> {
    const settlement = TERMINAL_PHASE.test(type)
    return this.run(
      fence,
      async (client, b, g) => {
        if (
          !settlement &&
          (b.evidence_sequence + 4 > 248 ||
            b.evidence_bytes + 4 * EVENT_BYTES > NORMAL_EVIDENCE_BYTES)
        )
          publishedFenceError('conflict')
        if (
          !/^[a-zA-Z0-9._/-]{1,100}$/.test(type) ||
          !/^sha256-[0-9a-f]{64}$/.test(digest) ||
          b.seal_id !== sealId ||
          (b.open_phase_id !== null &&
            !b.open_phase_acked &&
            b.phase_state !== 'FAULTED')
        )
          publishedFenceError()
        if (b.phase_state === 'FAULTED' && !settlement) publishedFenceError()
        const p = {
          phaseId: `phase_${randomUUID()}`,
          phaseType: type,
          phaseRevision: count(b.phase_revision) + 1,
          attempt: fence.attempt,
          inputDigest: digest
        }
        // An OPEN segment stays OPEN after phase ACK; only saveResumePoint makes it resumable.
        await client.query(
          `UPDATE controlled_published_bindings SET phase_state=CASE WHEN phase_state='FAULTED' THEN phase_state ELSE 'OPEN' END,
        phase_revision=$3,consumed_seal_id=COALESCE(consumed_seal_id,seal_id),open_phase_id=$4,open_phase_type=$5,
        open_phase_input_digest=$6,open_phase_attempt=$7,open_phase_acked=false WHERE tenant_id=$1 AND execution_id=$2`,
          [
            fence.tenantId,
            fence.executionId,
            p.phaseRevision,
            p.phaseId,
            type,
            digest,
            fence.attempt
          ]
        )
        await this.appendEvidence(
          client,
          b,
          `${p.phaseId}:intent`,
          'phase.intent',
          { ...p, expectedSealId: sealId },
          fence.attempt,
          settlement
        )
        await g.recheck()
        return p
      },
      settlement
    )
  }

  private ackPhase(
    fence: ControlledPublishedDatabaseFence,
    p: ControlledPhaseRef,
    payload: unknown
  ): Promise<ControlledEvidenceAck> {
    return this.run(
      fence,
      async (client, b, g) => {
        samePhase(b, p)
        const ack = await this.ackOnClient(client, b, p, payload, fence.attempt)
        await g.recheck()
        return ack
      },
      TERMINAL_PHASE.test(p.phaseType)
    )
  }
  private async ackOnClient(
    client: PostgresQueryable,
    b: ControlledPublishedBindingRow,
    p: ControlledPhaseRef,
    payload: unknown,
    attempt: number
  ): Promise<ControlledEvidenceAck> {
    const eventPayload = { phaseType: p.phaseType, completed: true }
    if (b.open_phase_acked) {
      if (
        controlledCanonicalJson(payload) !==
        controlledCanonicalJson(eventPayload)
      )
        publishedFenceError('conflict')
      const previous = await client.query<{
        sequence: number
        event_hash: string
      }>(
        `SELECT sequence,event_hash FROM controlled_published_evidence
        WHERE tenant_id=$1 AND execution_id=$2 AND event_key=$3`,
        [b.tenant_id, b.execution_id, `${p.phaseId}:ack`]
      )
      if (!previous.rows[0]) publishedFenceError('conflict')
      return {
        sequence: previous.rows[0].sequence,
        hash: previous.rows[0].event_hash
      }
    }
    // Payload supplied by the wrapper is bounded and persisted independently from the stable ACK marker.
    if (
      controlledCanonicalJson(payload) !== controlledCanonicalJson(eventPayload)
    )
      await this.appendEvidence(
        client,
        b,
        `${p.phaseId}:result`,
        'phase.result',
        payload,
        attempt,
        TERMINAL_PHASE.test(p.phaseType)
      )
    const ack = await this.appendEvidence(
      client,
      b,
      `${p.phaseId}:ack`,
      'phase.ack',
      eventPayload,
      attempt,
      TERMINAL_PHASE.test(p.phaseType)
    )
    await client.query(
      'UPDATE controlled_published_bindings SET open_phase_acked=true WHERE tenant_id=$1 AND execution_id=$2',
      [b.tenant_id, b.execution_id]
    )
    b.open_phase_acked = true
    return ack
  }

  private saveResumePoint(
    fence: ControlledPublishedDatabaseFence,
    snapshot: ControlledPublishedSnapshot,
    checkpoint: ExecutionCheckpoint,
    sequence: number,
    revision: number
  ): Promise<ControlledResumeSeal> {
    const s = json<ControlledPublishedSnapshot>(snapshot),
      c = typedEnvelope(checkpoint)
    return this.run(fence, async (client, b, g) => {
      if (
        b.phase_state !== 'OPEN' ||
        !b.open_phase_acked ||
        b.evidence_sequence !== sequence ||
        count(b.state_revision) !== revision ||
        s.tenantId !== fence.tenantId ||
        s.executionId !== fence.executionId ||
        s.traceId !== b.trace_id ||
        s.requestDigest !== b.request_digest ||
        s.fingerprint !== b.capability_fingerprint ||
        s.preparedDigest !== b.prepared_digest ||
        s.expiresAt !== publishedIso(b.expires_at!) ||
        s.fault !== null ||
        s.dispatchClosed ||
        s.finalIssued ||
        s.stop !== null ||
        !s.planSealed ||
        !['S1', 'S2'].includes(s.safePoint) ||
        c.tenantId !== fence.tenantId ||
        c.executionId !== fence.executionId ||
        c.stepNumber !== (s.safePoint === 'S1' ? 1 : 2) ||
        b.open_phase_type !==
          (s.safePoint === 'S1' ? 'plan.seal' : 'audit.step.completed') ||
        b.consumed_seal_id !== b.seal_id ||
        (s.safePoint === 'S1' &&
          (b.state !== null ||
            revision !== 0 ||
            b.open_phase_input_digest !==
              controlledDigest({
                outputDigest: s.outputDigest,
                fingerprint: b.capability_fingerprint
              }))) ||
        (s.safePoint === 'S2' &&
          (revision !== 1 ||
            b.state === null ||
            json<ControlledPublishedSnapshot>(b.state).safePoint !== 'S1')) ||
        s.expectedStep !== c.stepNumber + 1 ||
        s.nextPlannerStep !== s.expectedStep ||
        controlledDigest(s.budgetUsage) !== controlledDigest(c.budgetUsage)
      )
        publishedFenceError('conflict')
      const phase = phaseOf(b)
      if (!phase) publishedFenceError('conflict')
      const proof = await client.query<{
        event_key: string
        sequence: number
        event_hash: string
        canonical_payload: Record<string, unknown>
      }>(
        `SELECT event_key,sequence,event_hash,canonical_payload FROM controlled_published_evidence
          WHERE tenant_id=$1 AND execution_id=$2 AND event_key=ANY($3)`,
        [
          fence.tenantId,
          fence.executionId,
          [`${phase.phaseId}:intent`, `${phase.phaseId}:ack`]
        ]
      )
      const intent = proof.rows.find(
          (e) => e.event_key === `${phase.phaseId}:intent`
        ),
        ack = proof.rows.find((e) => e.event_key === `${phase.phaseId}:ack`)
      if (
        !intent ||
        !ack ||
        controlledCanonicalJson(intent.canonical_payload) !==
          controlledCanonicalJson({ ...phase, expectedSealId: b.seal_id }) ||
        controlledCanonicalJson(ack.canonical_payload) !==
          controlledCanonicalJson({
            phaseType: phase.phaseType,
            completed: true
          }) ||
        ack.sequence !== sequence ||
        ack.event_hash !== b.evidence_hash ||
        intent.sequence >= ack.sequence
      )
        publishedFenceError('conflict')
      await this.validateSealPayload(client, b, fence, s, c)
      await saveOperationalCheckpointOnClient(
        client,
        TenantIdSchema.parse(fence.tenantId),
        c
      )
      await g.recheck()
      const sealId = `seal_${randomUUID()}`
      await this.appendEvidence(
        client,
        b,
        `${sealId}:sealed`,
        'resume.sealed',
        {
          sealId,
          stateRevision: revision + 1,
          checkpointDigest: controlledDigest(c),
          stateDigest: controlledDigest(s),
          safePoint: s.safePoint
        },
        fence.attempt
      )
      await client.query(
        `UPDATE controlled_published_bindings SET state=$3::jsonb,state_digest=$4,state_revision=state_revision+1,
        seal_id=$5,seal_checkpoint_digest=$6,sealed_checkpoint=$7::jsonb,seal_state_digest=$4,sealed_through_sequence=evidence_sequence,
        phase_state='IDLE_SEALED',consumed_seal_id=NULL,open_phase_id=NULL,open_phase_type=NULL,
        open_phase_input_digest=NULL,open_phase_attempt=NULL,open_phase_acked=false WHERE tenant_id=$1 AND execution_id=$2`,
        [
          fence.tenantId,
          fence.executionId,
          controlledCanonicalJson(s),
          controlledDigest(s),
          sealId,
          controlledDigest(c),
          controlledCanonicalJson(c)
        ]
      )
      await g.recheck()
      return {
        sealId,
        stateRevision: revision + 1,
        sequence: b.evidence_sequence,
        hash: b.evidence_hash
      }
    })
  }

  private async validateSealPayload(
    client: PostgresQueryable,
    b: ControlledPublishedBindingRow,
    fence: ControlledPublishedDatabaseFence,
    snapshot: ControlledPublishedSnapshot,
    checkpoint: ExecutionCheckpoint
  ): Promise<void> {
    const projection = this.claimProjection(
      b,
      fence.outer,
      fence.attempt,
      'ACTIVE',
      checkpoint
    )
    const candidate = {
      identity: projection.identity,
      expiresAt: projection.expiresAt,
      state: {
        ...projection.state,
        checkpoint,
        snapshot,
        sealCheckpointDigest: controlledDigest(checkpoint),
        sealStateDigest: controlledDigest(snapshot),
        sealedThroughSequence: b.evidence_sequence
      }
    }
    if (!b.prepared_digest) publishedFenceError('conflict')
    validateControlledSnapshot(
      snapshot,
      candidate,
      b.capability_fingerprint,
      b.prepared_digest
    )
    if (
      controlledCanonicalJson(snapshot.names) !==
      controlledCanonicalJson(
        snapshot.attempts.map((a) => a.command.execution.toolName)
      )
    )
      publishedFenceError('conflict')
    const modelFacts = await client.query<{
      event_type: string
      count: string
    }>(
      `SELECT event_type,count(*)::text AS count FROM controlled_published_evidence
      WHERE tenant_id=$1 AND execution_id=$2 AND (event_type=ANY($3) OR
        (event_type='phase.intent' AND canonical_payload->>'phaseType'='plan.seal')) GROUP BY event_type`,
      [
        fence.tenantId,
        fence.executionId,
        ['log/model/request', 'log/model/result']
      ]
    )
    for (const type of [
      'log/model/request',
      'log/model/result',
      'phase.intent'
    ])
      if (modelFacts.rows.find((e) => e.event_type === type)?.count !== '1')
        publishedFenceError('conflict')
    const step = await client.query<{
      step_id: string
      step_type: string
      status: string
    }>(
      `SELECT step_id,step_type,status FROM operational_execution_steps
      WHERE tenant_id=$1 AND execution_id=$2 AND step_number=$3`,
      [fence.tenantId, fence.executionId, checkpoint.stepNumber]
    )
    if (
      step.rows[0]?.status !== 'SUCCEEDED' ||
      step.rows[0].step_type !==
        (snapshot.safePoint === 'S1' ? 'RESPOND' : 'TOOL')
    )
      publishedFenceError('conflict')
    const admitted = admissionRecord(b)
    const prepared = json<ControlledPublishedPrepared>(b.prepared)
    for (const attempt of snapshot.attempts) {
      const command = attempt.command
      if (
        command.execution.tenantId !== b.tenant_id ||
        command.execution.agentId !== b.agent_id ||
        command.execution.versionId !== b.version_id ||
        command.execution.traceId !== b.trace_id ||
        command.correlationId !== b.correlation_id ||
        (command.execution.requireApproval === true) !==
          (admitted.input.requireCapabilityApproval === true) ||
        command.execution.dryRun !==
          (admitted.input.executionMode === 'TEST_LAB') ||
        controlledCanonicalJson(command.execution.policy) !==
          controlledCanonicalJson(prepared.policy) ||
        command.canonical !==
          controlledCanonicalJson({ message: prepared.message })
      )
        publishedFenceError('conflict')
      if (snapshot.safePoint === 'S2') {
        const previous =
          b.state === null ? null : json<ControlledPublishedSnapshot>(b.state)
        const bound = previous?.attempts.find(
          (a) =>
            a.command.execution.toolName === attempt.command.execution.toolName
        )
        if (!bound) publishedFenceError('conflict')
        const { output: currentOutput, ...currentCommand } = attempt.command
        const { output: previousOutput, ...boundCommand } = bound.command
        void currentOutput
        void previousOutput
        if (
          controlledCanonicalJson(currentCommand) !==
          controlledCanonicalJson(boundCommand)
        )
          publishedFenceError('conflict')
      }
      for (const ref of attempt.evidenceRefs ?? []) {
        const evidence = await client.query<{
          canonical_payload: { phaseType?: string }
        }>(
          `SELECT canonical_payload FROM controlled_published_evidence
          WHERE tenant_id=$1 AND execution_id=$2 AND sequence=$3 AND event_hash=$4 AND event_key=$5 AND event_type='phase.ack'`,
          [
            fence.tenantId,
            fence.executionId,
            ref.sequence,
            ref.hash,
            `${ref.phaseId}:ack`
          ]
        )
        if (evidence.rows[0]?.canonical_payload.phaseType !== ref.phaseType)
          publishedFenceError('conflict')
      }
      if (
        attempt.approvalConsumed &&
        controlledCanonicalJson(attempt.approvalReceipt) !==
          controlledCanonicalJson(b.approval_receipt)
      )
        publishedFenceError('conflict')
      if (snapshot.safePoint === 'S2' && attempt.approvalRequired) {
        const receipt = attempt.approvalReceipt
        if (!attempt.approvalConsumed || !receipt || !b.approval_receipt)
          publishedFenceError('conflict')
        const { sequence, hash, ...consumption } = receipt
        if (
          receipt.requestDigest !== b.request_digest ||
          receipt.fingerprint !== b.capability_fingerprint ||
          receipt.agentId !== b.agent_id ||
          receipt.versionId !== b.version_id ||
          receipt.actorId !== attempt.command.execution.actor.id ||
          receipt.executionRef !== fence.executionId ||
          receipt.operationKey !== attempt.operationKey ||
          receipt.stepId !== `step_${fence.executionId}_2_tool` ||
          receipt.stepNumber !== 2 ||
          receipt.outboxId !== b.outbox_id ||
          !Number.isFinite(Date.parse(receipt.consumedAt))
        )
          publishedFenceError('conflict')
        const proof = await client.query<{
          event_key: string
          sequence: number
          event_hash: string
          canonical_payload: Record<string, unknown>
        }>(
          `SELECT event_key,sequence,event_hash,canonical_payload FROM controlled_published_evidence
            WHERE tenant_id=$1 AND execution_id=$2 AND event_key=ANY($3)`,
          [
            fence.tenantId,
            fence.executionId,
            [`${receipt.phaseId}:approval`, `${receipt.phaseId}:ack`]
          ]
        )
        const consumed = proof.rows.find(
          (e) => e.event_key === `${receipt.phaseId}:approval`
        )
        const ack = proof.rows.find(
          (e) => e.event_key === `${receipt.phaseId}:ack`
        )
        if (
          !consumed ||
          !ack ||
          consumed.sequence >= ack.sequence ||
          controlledCanonicalJson(consumed.canonical_payload) !==
            controlledCanonicalJson(consumption) ||
          ack.sequence !== sequence ||
          ack.event_hash !== hash ||
          controlledCanonicalJson(ack.canonical_payload) !==
            controlledCanonicalJson({
              phaseType: 'approval.begin',
              completed: true
            })
        )
          publishedFenceError('conflict')
        const audit = await client.query<{
          payload: Record<string, unknown>
          correlation_id: string
        }>(
          `SELECT payload,correlation_id FROM audit_events WHERE tenant_id=$1 AND id=$2 AND type='approval_decision'`,
          [fence.tenantId, receipt.consumptionAuditId]
        )
        if (
          audit.rows[0]?.payload.event !== 'capability_approval_consumed' ||
          audit.rows[0].payload.approvalId !== receipt.approvalId ||
          audit.rows[0].correlation_id !== b.correlation_id
        )
          publishedFenceError('conflict')
      }
    }
  }

  private poison(
    fence: ControlledPublishedDatabaseFence,
    phase: string,
    reason: 'evidence_unavailable'
  ): Promise<void> {
    return this.run(
      fence,
      async (client, b, g) => {
        await client.query(
          `UPDATE controlled_published_bindings SET dispatch_closed=true,phase_state='FAULTED',
        fault=COALESCE(fault,$3::jsonb) WHERE tenant_id=$1 AND execution_id=$2`,
          [
            fence.tenantId,
            fence.executionId,
            controlledCanonicalJson({
              phase: phase.slice(0, 100),
              code: reason,
              bodyStarted: false
            })
          ]
        )
        if (!b.fault)
          await this.appendEvidence(
            client,
            b,
            `fault:${count(b.phase_revision)}`,
            'execution.fault',
            { phase: phase.slice(0, 100), reason },
            fence.attempt,
            true
          )
        await g.recheck()
      },
      true
    )
  }

  private close(
    fence: ControlledPublishedDatabaseFence,
    snapshot: ControlledPublishedSnapshot | null,
    result: RuntimeResult,
    trace: TestRunTrace,
    revision: number
  ): Promise<void> {
    const r = typedEnvelope(result),
      t = typedEnvelope(trace),
      s = snapshot === null ? null : json<ControlledPublishedSnapshot>(snapshot)
    return this.run(
      fence,
      async (client, b, g) => {
        const success = r.stopReason === 'COMPLETED'
        const admitted = admissionRecord(b)
        if (fence.cancellation && r.stopReason !== 'CANCELLED')
          publishedFenceError('conflict')
        if (
          count(b.state_revision) !== revision ||
          t.tenantId !== fence.tenantId ||
          t.traceId !== b.trace_id ||
          t.agentId !== b.agent_id ||
          t.versionId !== b.version_id ||
          t.conversationId !== b.conversation_id ||
          t.sessionId !== b.session_id ||
          t.executionMode !== 'CONTROLLED_RUNTIME' ||
          t.configVersion !== admitted.runtime.agent.version ||
          t.input.message !== redactSensitiveText(admitted.input.message) ||
          t.input.historySize !== admitted.input.history.length ||
          t.provider.provider !== 'fake' ||
          t.provider.model !== 'deterministic-v1' ||
          t.knowledge.status === 'answered' ||
          controlledCanonicalJson(t.toolResults ?? null) !==
            controlledCanonicalJson(
              t.tools.map((tool) => ({
                name: tool.name,
                status: tool.status,
                output: tool.status === 'succeeded' ? { redacted: true } : null
              }))
            ) ||
          r.response !== t.response.text ||
          t.provider.externalCall !== false ||
          (success &&
            (b.fault ||
              b.phase_state === 'FAULTED' ||
              !b.open_phase_acked ||
              t.status !== 'completed')) ||
          (!success &&
            (t.status === 'completed' ||
              t.tools.some((tool) => tool.status === 'succeeded') ||
              controlledCanonicalJson(r.toolResult ?? null) !==
                controlledCanonicalJson({ status: 'REJECTED' }) ||
              t.response.mode !== 'handoff'))
        )
          publishedFenceError('conflict')
        if (success) {
          if (
            !s ||
            !s.finalIssued ||
            !s.dispatchClosed ||
            s.stop !== 'COMPLETED' ||
            s.fault ||
            !s.planSealed ||
            s.schema !== 'controlled-published-state-v1' ||
            s.adapterVersion !== ADAPTER ||
            s.tenantId !== fence.tenantId ||
            s.executionId !== fence.executionId ||
            s.traceId !== b.trace_id ||
            s.requestDigest !== b.request_digest ||
            s.fingerprint !== b.capability_fingerprint ||
            s.preparedDigest !== b.prepared_digest ||
            !b.expires_at ||
            s.expiresAt !== publishedIso(b.expires_at) ||
            !b.state ||
            !b.sealed_checkpoint
          )
            publishedFenceError('conflict')
          const anchor = json<ControlledPublishedSnapshot>(b.state),
            checkpoint = json<ExecutionCheckpoint>(b.sealed_checkpoint)
          if (
            controlledDigest(checkpoint) !== b.seal_checkpoint_digest ||
            controlledDigest(anchor) !== b.seal_state_digest ||
            s.safePoint !== anchor.safePoint ||
            s.planOutcome !== anchor.planOutcome ||
            s.outputDigest !== anchor.outputDigest ||
            controlledDigest(s.output) !== anchor.outputDigest ||
            controlledCanonicalJson(s.names) !==
              controlledCanonicalJson(anchor.names) ||
            s.attempts.length !== anchor.attempts.length ||
            (s.attempts.length > 0 && s.safePoint !== 'S2') ||
            s.budgetUsage.steps !== r.steps ||
            s.budgetUsage.modelCalls !== r.modelCalls ||
            s.budgetUsage.toolCalls !== r.toolCalls ||
            s.budgetUsage.inputTokens !== r.usage.inputTokens ||
            s.budgetUsage.outputTokens !== r.usage.outputTokens ||
            s.budgetUsage.costUsd !== r.usage.costUsd ||
            s.planDigest !==
              controlledDigest({
                names: s.names,
                attempts: s.attempts.map((a) => a.command),
                outcome: s.planOutcome
              })
          )
            publishedFenceError('conflict')
          await this.validateSealPayload(client, b, fence, anchor, checkpoint)
          if (
            !anchor.output ||
            t.response.text !== anchor.output.text ||
            t.response.mode !== anchor.output.mode ||
            controlledCanonicalJson(t.tools) !==
              controlledCanonicalJson(
                anchor.names.map((name) => ({ name, status: 'succeeded' }))
              ) ||
            controlledCanonicalJson(t.outputPolicy ?? null) !==
              controlledCanonicalJson({
                decision: anchor.output.decision,
                reason: anchor.output.reason,
                mode: anchor.output.mode,
                redacted: anchor.output.redacted
              })
          )
            publishedFenceError('conflict')
          for (let n = 0; n < s.attempts.length; n++) {
            const final = s.attempts[n]!,
              sealed = anchor.attempts[n]!
            if (
              controlledCanonicalJson(final.command) !==
                controlledCanonicalJson(sealed.command) ||
              final.operationKey !== sealed.operationKey ||
              !final.resultAcknowledged ||
              !final.attempted ||
              !final.logAcknowledged ||
              !final.callbackAcknowledged ||
              controlledCanonicalJson(final.approvalReceipt ?? null) !==
                controlledCanonicalJson(sealed.approvalReceipt ?? null)
            )
              publishedFenceError('conflict')
          }
          const audits = await client.query<{ event_type: string }>(
            `SELECT event_type FROM controlled_published_evidence
          WHERE tenant_id=$1 AND execution_id=$2 AND event_type=ANY($3)`,
            [
              fence.tenantId,
              fence.executionId,
              ['audit/evaluation.completed', 'audit/runtime.completed']
            ]
          )
          for (const required of [
            'audit/evaluation.completed',
            'audit/runtime.completed'
          ])
            if (!audits.rows.some((e) => e.event_type === required))
              publishedFenceError('conflict')
        }
        for (const tool of success
          ? s!.attempts.map((a) => ({
              name: a.command.execution.toolName,
              status: 'succeeded'
            }))
          : t.tools.filter((tool) => tool.status !== 'not_run')) {
          if (tool.name !== 'find_available_slots')
            publishedFenceError('conflict')
          const callback = await client.query<{
            canonical_payload: Record<string, unknown>
          }>(
            `SELECT canonical_payload FROM controlled_published_evidence
          WHERE tenant_id=$1 AND execution_id=$2 AND event_key=$3`,
            [
              fence.tenantId,
              fence.executionId,
              `${fence.executionId}:s2:find_available_slots:callback/tool`
            ]
          )
          const receipt = callback.rows[0]?.canonical_payload
          if (!receipt && !success) continue
          if (typeof receipt?.mirrorAuditId !== 'string')
            publishedFenceError('conflict')
          const event = json<PluginAuditEvent>(receipt.event)
          if (
            event.type !== 'tool_call' ||
            event.tenantId !== fence.tenantId ||
            event.traceId !== b.trace_id ||
            event.correlationId !== b.correlation_id ||
            event.agentId !== b.agent_id ||
            event.versionId !== b.version_id ||
            event.toolName !== tool.name ||
            (success && event.status !== 'succeeded')
          )
            publishedFenceError('conflict')
          const mirror = await client.query<{
            type: string
            correlation_id: string
            payload: unknown
          }>(
            'SELECT type,correlation_id,payload FROM audit_events WHERE tenant_id=$1 AND id=$2',
            [fence.tenantId, receipt.mirrorAuditId]
          )
          const expectedMirror = sanitizeAuditEvidencePayload({
            event,
            tenantId: fence.tenantId,
            executionId: fence.executionId,
            operationKey: `${fence.executionId}:s2:find_available_slots`
          }).payload
          if (
            mirror.rowCount !== 1 ||
            mirror.rows[0]?.type !== 'tool_call' ||
            mirror.rows[0].correlation_id !== b.correlation_id ||
            controlledCanonicalJson(mirror.rows[0].payload) !==
              controlledCanonicalJson(expectedMirror)
          )
            publishedFenceError('conflict')
          if (success) {
            const journal = await client.query<{
              state: string
              result: unknown
            }>(
              `SELECT state,result FROM operational_effect_journal WHERE tenant_id=$1 AND operation_key=$2`,
              [fence.tenantId, `${fence.executionId}:s2:find_available_slots`]
            )
            const attempt = s?.attempts.find(
              (a) => a.command.execution.toolName === tool.name
            )
            if (
              tool.status !== 'succeeded' ||
              journal.rows[0]?.state !== 'CONFIRMED' ||
              !attempt?.callbackAcknowledged ||
              !attempt.resultAcknowledged ||
              !attempt.logAcknowledged
            )
              publishedFenceError('conflict')
            if (
              controlledCanonicalJson(journal.rows[0]!.result) !==
                controlledCanonicalJson(attempt.command.output?.data) ||
              controlledCanonicalJson(event.payload) !==
                controlledCanonicalJson(
                  sanitizeAuditEvidencePayload({
                    toolName: tool.name,
                    input: attempt.command.execution.input,
                    result: attempt.command.output?.data
                  }).payload
                )
            )
              publishedFenceError('conflict')
          }
        }
        const now = await g.recheck()
        await this.appendEvidence(
          client,
          b,
          'execution:closed',
          'execution.closed',
          {
            stopReason: r.stopReason,
            traceDigest: controlledDigest(t),
            resultDigest: controlledDigest(r),
            stateDigest: controlledDigest(s),
            ...(fence.cancellation
              ? {
                  cancellationEventSequence: fence.cancellation.eventSequence,
                  cancellationAttempt: fence.cancellation.attempt
                }
              : {})
          },
          fence.attempt,
          true
        )
        await client.query(
          `UPDATE controlled_published_bindings SET state=$3::jsonb,state_digest=$4,
        closed_trace=$5::jsonb,closed_trace_digest=$6,runtime_result=$7::jsonb,phase_state='CLOSED',dispatch_closed=true,
        open_phase_id=NULL,open_phase_type=NULL,open_phase_input_digest=NULL,open_phase_attempt=NULL,open_phase_acked=false
        WHERE tenant_id=$1 AND execution_id=$2`,
          [
            fence.tenantId,
            fence.executionId,
            s === null ? null : controlledCanonicalJson(s),
            s === null ? null : controlledDigest(s),
            controlledCanonicalJson(t),
            controlledDigest(t),
            controlledCanonicalJson(r)
          ]
        )
        await g.recheck()
        if (fence.cancellation) return
        // Parent transition must be last: its lease is cleared, preventing any subsequent active write.
        const effect = (
          await client.query<{ state: string }>(
            'SELECT state FROM operational_effect_journal WHERE tenant_id=$1 AND operation_key=$2',
            [fence.tenantId, `${fence.executionId}:s2:find_available_slots`]
          )
        ).rows[0]
        const failureKind =
          r.stopReason === 'CANCELLED'
            ? ('CANCELLED' as const)
            : effect && ['EFFECT_STARTED', 'UNCERTAIN'].includes(effect.state)
              ? ('UNKNOWN_EFFECT' as const)
              : ['POLICY_DENIED', 'UNSAFE_REQUEST'].includes(r.stopReason)
                ? ('POLICY_DENIED' as const)
                : ('SEMANTIC_TERMINAL' as const)
        await setPublishedWriteContext(client, fence, 'close')
        await transitionOperationalExecutionOnClient(
          client,
          {
            tenantId: fence.tenantId,
            executionId: fence.executionId,
            workerId: fence.workerId,
            fenceToken: fence.attempt,
            to: success
              ? 'SUCCEEDED'
              : r.stopReason === 'CANCELLED'
                ? 'CANCELLED'
                : 'FAILED_TERMINAL',
            result: r,
            ...(!success
              ? {
                  failure: {
                    kind: failureKind,
                    code: r.stopReason.toLowerCase(),
                    message: 'Controlled published execution stopped safely'
                  }
                }
              : {})
          },
          TenantIdSchema.parse(fence.tenantId),
          fence.executionId,
          now
        )
      },
      true
    )
  }

  private readGuards(
    fence: ControlledPublishedDatabaseFence
  ): Promise<{ paused: boolean; cancelled: boolean; expiresAt: string }> {
    // Use the settlement channel to return a real committed pause instead of translating it to false.
    return this.run(
      fence,
      async (client, b, g) => {
        const pause = await client.query<{ paused: boolean }>(
          'SELECT paused FROM kernel_pause_switches WHERE tenant_id=$1',
          [fence.tenantId]
        )
        const session = await client.query<{ takeover_state: string }>(
          'SELECT takeover_state FROM sessions WHERE tenant_id=$1 AND id=$2',
          [fence.tenantId, b.session_id]
        )
        if (
          typeof pause.rows[0]?.paused !== 'boolean' ||
          !session.rows[0] ||
          !b.expires_at
        )
          publishedFenceError()
        await g.recheck()
        return {
          paused:
            pause.rows[0].paused ||
            session.rows[0].takeover_state !== 'BOT_ACTIVE',
          cancelled: false,
          expiresAt: publishedIso(b.expires_at)
        }
      },
      true
    )
  }

  private prepareDispatch(
    fence: ControlledPublishedDatabaseFence,
    p: ControlledPhaseRef,
    input: { operationKey: string; inputHash: string; fingerprint: string }
  ): Promise<ControlledDispatchPermit> {
    return this.run(fence, async (client, b, g) => {
      samePhase(b, p)
      const state =
        b.state === null ? null : json<ControlledPublishedSnapshot>(b.state)
      const attempt = state?.attempts.find(
        (a) => a.command.execution.toolName === 'find_available_slots'
      )
      if (
        b.open_phase_acked ||
        p.phaseType !== 'dispatch.admit' ||
        input.operationKey !== `${fence.executionId}:s2:find_available_slots` ||
        input.fingerprint !== b.capability_fingerprint ||
        !attempt ||
        attempt.command.inputHash !== input.inputHash ||
        p.inputDigest !==
          controlledDigest({
            operationKey: input.operationKey,
            inputHash: input.inputHash
          }) ||
        ((attempt.command.execution.requireApproval === true ||
          attempt.command.execution.policy.decision === 'requires_approval') &&
          (!attempt.approvalConsumed ||
            !attempt.approvalReceipt ||
            controlledCanonicalJson(attempt.approvalReceipt) !==
              controlledCanonicalJson(b.approval_receipt))) ||
        !b.expires_at
      )
        publishedFenceError()
      await g.recheck()
      const permit: ControlledDispatchPermit = {
        permitId: `permit_${randomUUID()}`,
        tenantId: fence.tenantId,
        executionId: fence.executionId,
        workerId: fence.workerId,
        attempt: fence.attempt,
        ...input,
        expiresAt: publishedIso(b.expires_at),
        phaseId: p.phaseId,
        leaseUntil: g.leaseUntil
      }
      await this.appendEvidence(
        client,
        b,
        `${p.phaseId}:permit`,
        'dispatch.permit',
        permit,
        fence.attempt
      )
      await g.recheck()
      return permit
    })
  }

  private consumeBoundApproval(
    fence: ControlledPublishedDatabaseFence,
    p: ControlledPhaseRef,
    v: ControlledBoundApprovalVerification
  ): Promise<ControlledBoundApprovalConsumption | null> {
    return this.run(fence, async (client, b, g) => {
      samePhase(b, p)
      if (
        b.open_phase_acked ||
        p.phaseType !== 'approval.begin' ||
        p.inputDigest !==
          controlledDigest({
            approvalId: v.approvalId,
            inputHash: createCapabilityInputHash(v)
          }) ||
        v.tenantId !== fence.tenantId ||
        v.agentId !== b.agent_id ||
        v.versionId !== b.version_id ||
        v.requestDigest !== b.request_digest ||
        v.fingerprint !== b.capability_fingerprint ||
        v.toolName !== 'find_available_slots' ||
        v.operationKey !== `${fence.executionId}:s2:find_available_slots` ||
        v.stepNumber !== 2 ||
        v.executionRef !== fence.executionId ||
        v.stepId !== `step_${fence.executionId}_2_tool` ||
        !v.consumptionAudit ||
        v.consumptionAudit.traceId !== b.trace_id ||
        v.consumptionAudit.correlationId !== b.correlation_id
      )
        publishedFenceError()
      const state =
        b.state === null ? null : json<ControlledPublishedSnapshot>(b.state)
      const attempt = state?.attempts.find(
        (a) => a.command.execution.toolName === v.toolName
      )
      if (
        !state ||
        state.safePoint !== 'S1' ||
        !attempt ||
        (attempt.command.execution.requireApproval !== true &&
          attempt.command.execution.policy.decision !== 'requires_approval') ||
        attempt.approvalConsumed ||
        attempt.command.inputHash !== createCapabilityInputHash(v) ||
        controlledCanonicalJson(attempt.command.execution.input) !==
          controlledCanonicalJson(v.input) ||
        attempt.command.execution.actor.id !== v.actorId
      )
        publishedFenceError()
      const consumed = await verifyAndConsumeOnClient(client, v, {
        now: () => g.now,
        guard: g.recheck,
        requireAudit: true
      })
      if (!consumed.record) return null
      if (!consumed.consumptionAuditId || !consumed.record.consumedAt)
        publishedFenceError()
      const base = {
        receiptId: `receipt_${randomUUID()}`,
        approvalId: v.approvalId,
        inputHash: createCapabilityInputHash(v),
        executionRef: v.executionRef,
        consumptionAuditId: consumed.consumptionAuditId,
        phaseId: p.phaseId,
        tenantId: fence.tenantId,
        executionId: fence.executionId,
        operationKey: v.operationKey,
        stepId: v.stepId,
        stepNumber: v.stepNumber,
        workerId: fence.workerId,
        attempt: fence.attempt,
        outboxId: fence.outer.eventId,
        outerAttempt: fence.outer.expectedOuterAttempt,
        outerWorkerId: fence.outer.processWorkerId,
        outerAttemptRowId: fence.outer.expectedAttemptRowId,
        requestDigest: b.request_digest,
        fingerprint: b.capability_fingerprint,
        agentId: b.agent_id,
        versionId: b.version_id,
        actorId: v.actorId,
        consumedAt: consumed.record.consumedAt.toISOString()
      }
      await this.appendEvidence(
        client,
        b,
        `${p.phaseId}:approval`,
        'approval.consumed',
        base,
        fence.attempt
      )
      const ack = await this.ackOnClient(
        client,
        b,
        p,
        { phaseType: p.phaseType, completed: true },
        fence.attempt
      )
      const receipt: ControlledApprovalReceipt = { ...base, ...ack }
      // The receipt and single-use0002 transition commit together. OPEN is deliberately not a resume seal.
      attempt.approvalRequired = true
      attempt.policyAllowed = true
      attempt.approvalConsumed = true
      attempt.approvalReceipt = receipt
      await client.query(
        `UPDATE controlled_published_bindings SET approval_receipt=$3::jsonb,state=$4::jsonb,state_digest=$5
        WHERE tenant_id=$1 AND execution_id=$2`,
        [
          fence.tenantId,
          fence.executionId,
          controlledCanonicalJson(receipt),
          state === null ? null : controlledCanonicalJson(state),
          state === null ? null : controlledDigest(state)
        ]
      )
      await g.recheck()
      return { record: consumed.record, receipt }
    })
  }

  appendToolAudit(
    claim: ControlledPublishedClaim,
    event: PluginAuditEvent
  ): Promise<void> {
    const fence = claim.fence
    return this.run(
      fence,
      async (client, b, g) => {
        const p = phaseOf(b)
        if (
          !p ||
          p.phaseType !== 'callback.tool' ||
          b.open_phase_acked ||
          event.tenantId !== fence.tenantId ||
          event.traceId !== b.trace_id ||
          event.correlationId !== b.correlation_id ||
          event.agentId !== b.agent_id ||
          event.versionId !== b.version_id ||
          event.toolName !== 'find_available_slots'
        )
          publishedFenceError()
        const journal = (
          await client.query<{ state: string; result: unknown }>(
            'SELECT state,result FROM operational_effect_journal WHERE tenant_id=$1 AND operation_key=$2',
            [fence.tenantId, `${fence.executionId}:s2:find_available_slots`]
          )
        ).rows[0]
        if (event.status === 'succeeded' || journal?.state === 'CONFIRMED') {
          const attempt =
            b.state === null
              ? undefined
              : json<ControlledPublishedSnapshot>(b.state).attempts.find(
                  (a) => a.command.execution.toolName === event.toolName
                )
          if (
            !attempt ||
            event.status !== 'succeeded' ||
            journal?.state !== 'CONFIRMED' ||
            controlledCanonicalJson(event.payload) !==
              controlledCanonicalJson(
                sanitizeAuditEvidencePayload({
                  toolName: event.toolName,
                  input: attempt.command.execution.input,
                  result: journal.result
                }).payload
              )
          )
            publishedFenceError('conflict')
        }
        const mirrorId = `audit_${randomUUID()}`
        const payload = sanitizeAuditEvidencePayload({
          event,
          tenantId: fence.tenantId,
          executionId: fence.executionId,
          operationKey: `${fence.executionId}:s2:find_available_slots`
        }).payload
        await client.query(
          `INSERT INTO audit_events(tenant_id,id,type,actor_type,actor_id,correlation_id,policy_version,payload,created_at)
        VALUES($1,$2,'tool_call','system','controlled-published-worker',$3,'controlled-published-v1',$4::jsonb,clock_timestamp())`,
          [
            fence.tenantId,
            mirrorId,
            b.correlation_id,
            controlledCanonicalJson(payload)
          ]
        )
        await this.appendEvidence(
          client,
          b,
          `${fence.executionId}:s2:find_available_slots:callback/tool`,
          'callback.tool',
          { event, mirrorAuditId: mirrorId },
          fence.attempt,
          true
        )
        await this.ackOnClient(
          client,
          b,
          p,
          { phaseType: p.phaseType, completed: true },
          fence.attempt
        )
        await g.recheck()
      },
      true
    )
  }

  private portEvent(
    fence: ControlledPublishedDatabaseFence,
    type: string,
    payload: unknown
  ): Promise<void> {
    return this.run(
      fence,
      async (client, b, g) => {
        const p = phaseOf(b)
        if (!p || b.open_phase_acked || p.attempt !== fence.attempt)
          publishedFenceError()
        await this.appendEvidence(
          client,
          b,
          `${p.phaseId}:${type}`,
          type,
          payload,
          fence.attempt,
          TERMINAL_PHASE.test(p.phaseType)
        )
        await g.recheck()
      },
      true
    )
  }

  private run<T>(
    fence: ControlledPublishedDatabaseFence,
    operation: (
      client: PostgresQueryable,
      b: ControlledPublishedBindingRow,
      guard: Awaited<ReturnType<typeof guardControlledPublishedFence>>
    ) => Promise<T>,
    settlement = false
  ): Promise<T> {
    return withTenantTransaction(
      this.pool,
      TenantIdSchema.parse(fence.tenantId),
      async (client) => {
        const g = await guardControlledPublishedFence(client, fence, {
          settlement,
          ...(!settlement && fence.signal ? { signal: fence.signal } : {})
        })
        await this.verifyEvidence(client, g.binding)
        return operation(client, g.binding, g)
      }
    )
  }

  private async appendEvidence(
    client: PostgresQueryable,
    b: ControlledPublishedBindingRow,
    key: string,
    type: string,
    payload: unknown,
    attempt: number,
    terminal = false
  ): Promise<ControlledEvidenceAck> {
    // Sanitize first. Canonical UTF-8 (not PostgreSQL's spaced jsonb::text) is the normative limit.
    const clean = json<Record<string, unknown>>(
      sanitizeControlledPublishedEvidence(payload)
    )
    const canonical = controlledCanonicalJson(clean)
    const existing = await client.query<Record<string, unknown>>(
      `SELECT * FROM controlled_published_evidence WHERE tenant_id=$1 AND execution_id=$2 AND event_key=$3`,
      [b.tenant_id, b.execution_id, key]
    )
    if (existing.rows[0]) {
      const e = existing.rows[0]
      if (
        e.event_type !== type ||
        e.payload_digest !== controlledDigest(clean) ||
        controlledCanonicalJson(e.canonical_payload) !== canonical
      )
        publishedFenceError('conflict')
      return {
        sequence: count(e.sequence as number),
        hash: String(e.event_hash)
      }
    }
    const sequence = b.evidence_sequence + 1
    const protectedTerminal =
      type === 'execution.fault' || type === 'execution.closed'
    const sequenceLimit = terminal ? (protectedTerminal ? 256 : 254) : 248
    const bytesLimit = terminal
      ? protectedTerminal
        ? 4194304
        : 4194304 - 2 * EVENT_BYTES
      : NORMAL_EVIDENCE_BYTES
    if (
      sequence > sequenceLimit ||
      b.evidence_bytes + Buffer.byteLength(canonical, 'utf8') > bytesLimit ||
      !key ||
      key.length > 500 ||
      !type ||
      type.length > 100
    )
      publishedFenceError('conflict')
    const timestamp = (await publishedDbNow(client)).toISOString()
    const hash = controlledDigest({
      tenantId: b.tenant_id,
      executionId: b.execution_id,
      sequence,
      eventKey: key,
      type,
      payload: clean,
      previousHash: b.evidence_hash,
      timestamp
    })
    await client.query(
      `INSERT INTO controlled_published_evidence(tenant_id,execution_id,sequence,event_key,event_type,canonical_payload,
      payload_digest,previous_hash,event_hash,originating_attempt,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)`,
      [
        b.tenant_id,
        b.execution_id,
        sequence,
        key,
        type,
        canonical,
        controlledDigest(clean),
        b.evidence_hash,
        hash,
        attempt,
        timestamp
      ]
    )
    const bytes = b.evidence_bytes + Buffer.byteLength(canonical, 'utf8')
    await client.query(
      `UPDATE controlled_published_bindings SET evidence_sequence=$3,evidence_bytes=$4,evidence_hash=$5
      WHERE tenant_id=$1 AND execution_id=$2`,
      [b.tenant_id, b.execution_id, sequence, bytes, hash]
    )
    b.evidence_sequence = sequence
    b.evidence_bytes = bytes
    b.evidence_hash = hash
    return { sequence, hash }
  }

  private async verifyEvidence(
    client: PostgresQueryable,
    b: ControlledPublishedBindingRow
  ): Promise<void> {
    const q = await client.query<Record<string, unknown>>(
      `SELECT * FROM controlled_published_evidence WHERE tenant_id=$1 AND execution_id=$2 ORDER BY sequence LIMIT 257`,
      [b.tenant_id, b.execution_id]
    )
    let sequence = 0,
      hash = ZERO_HASH,
      bytes = 0
    for (const e of q.rows) {
      const payload = json<Record<string, unknown>>(e.canonical_payload)
      const timestamp = publishedIso(e.created_at as Date | string)
      sequence++
      if (
        sequence > 256 ||
        e.sequence !== sequence ||
        e.previous_hash !== hash ||
        e.payload_digest !== controlledDigest(payload)
      )
        publishedFenceError('conflict')
      const computed = controlledDigest({
        tenantId: b.tenant_id,
        executionId: b.execution_id,
        sequence,
        eventKey: e.event_key,
        type: e.event_type,
        payload,
        previousHash: hash,
        timestamp
      })
      if (computed !== e.event_hash) publishedFenceError('conflict')
      bytes += Buffer.byteLength(controlledCanonicalJson(payload), 'utf8')
      hash = computed
    }
    if (
      sequence !== b.evidence_sequence ||
      hash !== b.evidence_hash ||
      bytes !== b.evidence_bytes ||
      bytes > 4194304
    )
      publishedFenceError('conflict')
  }
}
