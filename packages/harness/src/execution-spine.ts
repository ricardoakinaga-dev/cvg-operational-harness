import { createHash, randomUUID } from 'node:crypto'
import type {
  OperationalHarness,
  OperationalHarnessOptions
} from './createOperationalHarness.ts'
import { createOperationalHarness } from './createOperationalHarness.ts'
import type {
  EffectJournal,
  JournaledToolRegistryOptions
} from './effect-journal.ts'
import type {
  AuditEvent,
  RuntimeInput,
  RuntimeResult,
  TelemetryEvent
} from '@cvg/harness-contracts'

export const EXECUTION_STATES = [
  'RECEIVED',
  'QUEUED',
  'CLAIMED',
  'RUNNING',
  'WAITING_APPROVAL',
  'WAITING_USER',
  'SUCCEEDED',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
  'CANCELLED'
] as const

export type ExecutionState = (typeof EXECUTION_STATES)[number]

export const OPERATIONAL_EXECUTION_FAULT_POINT_AFTER_CLAIM =
  'AFTER_CLAIM' as const

export type OperationalExecutionFaultPoint =
  typeof OPERATIONAL_EXECUTION_FAULT_POINT_AFTER_CLAIM

export type ExecutionFailureKind =
  | 'TECHNICAL_RETRYABLE'
  | 'SEMANTIC_TERMINAL'
  | 'POLICY_DENIED'
  | 'UNKNOWN_EFFECT'
  | 'CANCELLED'

export interface ExecutionFailure {
  readonly kind: ExecutionFailureKind
  readonly code: string
  readonly message: string
  readonly retryAt?: string
}

/**
 * The only payload accepted by the neutral execution spine. RuntimeInput is
 * deliberately JSON-safe at this boundary; adapters never receive a tool
 * function or a provider credential through this envelope.
 */
export interface ExecutionSubmission {
  readonly tenantId: string
  readonly idempotencyKey: string
  /** Optional immutable binding for a capability-backed execution. */
  readonly capabilityFingerprint?: string
  readonly runtime: RuntimeInput
}

export type ExecutionResumeBinding =
  | {
      readonly kind: 'approval'
      readonly approvalId: string
      readonly boundAt: string
    }
  | {
      readonly kind: 'user_input'
      readonly input: string
      readonly boundAt: string
    }

export interface ExecutionView {
  readonly id: string
  readonly tenantId: string
  readonly idempotencyKey: string
  readonly requestHash: string
  readonly capabilityFingerprint?: string
  readonly state: ExecutionState
  readonly attempt: number
  readonly leaseOwner: string | null
  readonly leaseUntil: string | null
  readonly result: RuntimeResult | null
  readonly failure: ExecutionFailure | null
  readonly approvalId: string | null
  readonly resume: ExecutionResumeBinding | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly completedAt: string | null
}

export interface ExecutionRecord {
  readonly id: string
  readonly tenantId: string
  readonly idempotencyKey: string
  readonly requestHash: string
  readonly capabilityFingerprint?: string
  readonly request: ExecutionSubmission
  readonly state: ExecutionState
  readonly attempt: number
  readonly leaseOwner: string | null
  readonly leaseUntil: string | null
  readonly result: RuntimeResult | null
  readonly failure: ExecutionFailure | null
  readonly approvalId: string | null
  /** Durable resume binding injected by resolveApproval/provideUserInput. */
  readonly resume: ExecutionResumeBinding | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly completedAt: string | null
}

export interface ExecutionEvent {
  readonly sequence: number
  readonly executionId: string
  readonly tenantId: string
  readonly type:
    | 'RECEIVED'
    | 'QUEUED'
    | 'CLAIMED'
    | 'RUNNING'
    | 'RECOVERED'
    | 'WAITING_APPROVAL'
    | 'WAITING_USER'
    | 'USER_INPUT'
    | 'SUCCEEDED'
    | 'FAILED_RETRYABLE'
    | 'FAILED_TERMINAL'
    | 'CANCELLED'
  readonly workerId: string | null
  readonly attempt: number
  readonly reason: string | null
  readonly approvalId?: string
  readonly auditEvents?: readonly AuditEvent[]
  readonly createdAt: string
}

export interface SubmitResult {
  readonly record: ExecutionRecord
  readonly created: boolean
}

export interface ClaimResult {
  readonly record: ExecutionRecord
  readonly recovered: boolean
}

export interface ExecutionTransitionInput {
  readonly tenantId: string
  readonly executionId: string
  readonly to: ExecutionState
  readonly workerId?: string
  readonly fenceToken?: number
  readonly approvalId?: string
  readonly result?: RuntimeResult
  readonly failure?: ExecutionFailure
  readonly auditEvents?: readonly AuditEvent[]
  readonly reason?: string
}

export interface ExecutionCancellationInput {
  readonly tenantId: string
  readonly executionId: string
  readonly actorId: string
  readonly reason?: string
}

export interface OperationalExecutionStore {
  submit(input: ExecutionSubmission, now?: Date): Promise<SubmitResult>
  get(tenantId: string, executionId: string): Promise<ExecutionRecord | null>
  claimNext(
    tenantId: string,
    workerId: string,
    now?: Date,
    leaseMs?: number
  ): Promise<ClaimResult | null>
  heartbeat(
    tenantId: string,
    executionId: string,
    workerId: string,
    fenceToken: number,
    now?: Date,
    leaseMs?: number
  ): Promise<ExecutionRecord>
  transition(
    input: ExecutionTransitionInput,
    now?: Date
  ): Promise<ExecutionRecord>
  cancel(
    input: ExecutionCancellationInput,
    now?: Date
  ): Promise<ExecutionRecord>
  resolveApproval(
    input: {
      readonly tenantId: string
      readonly executionId: string
      readonly approvalId: string
      readonly actorId: string
      readonly decision: 'APPROVED' | 'REJECTED'
      readonly reason?: string
    },
    now?: Date
  ): Promise<ExecutionRecord>
  /**
   * Durable WAITING_USER resume: binds the authenticated user input to the
   * paused execution and re-queues it. Only WAITING_USER executions accept
   * this transition.
   */
  provideUserInput(
    input: {
      readonly tenantId: string
      readonly executionId: string
      readonly actorId: string
      readonly message: string
    },
    now?: Date
  ): Promise<ExecutionRecord>
  recoverExpired(
    tenantId: string,
    now?: Date
  ): Promise<readonly ExecutionRecord[]>
  listEvents(
    tenantId: string,
    executionId: string
  ): Promise<readonly ExecutionEvent[]>
}

export interface InMemoryOperationalExecutionStoreOptions {
  readonly leaseMs?: number
  readonly retryDelayMs?: number
  readonly maxAttempts?: number
  readonly maxFailureMessageLength?: number
  readonly clock?: () => Date
}

export class OperationalExecutionError extends Error {
  public constructor(
    public readonly code:
      | 'validation_failed'
      | 'conflict'
      | 'not_found'
      | 'invalid_action'
      | 'lease_lost',
    message: string
  ) {
    super(message)
    this.name = 'OperationalExecutionError'
  }
}

const terminalStates = new Set<ExecutionState>([
  'SUCCEEDED',
  'FAILED_TERMINAL',
  'CANCELLED'
])

export const DEFAULT_MAX_EXECUTION_ATTEMPTS = 3

const allowedTransitions: Record<ExecutionState, readonly ExecutionState[]> = {
  RECEIVED: ['QUEUED', 'CANCELLED'],
  QUEUED: ['CLAIMED', 'CANCELLED'],
  CLAIMED: ['RUNNING', 'QUEUED', 'CANCELLED'],
  RUNNING: [
    'SUCCEEDED',
    'WAITING_APPROVAL',
    'WAITING_USER',
    'FAILED_RETRYABLE',
    'FAILED_TERMINAL',
    'QUEUED',
    'CANCELLED'
  ],
  WAITING_APPROVAL: ['QUEUED', 'CANCELLED'],
  WAITING_USER: ['QUEUED', 'CANCELLED'],
  SUCCEEDED: [],
  FAILED_RETRYABLE: ['CLAIMED', 'QUEUED', 'FAILED_TERMINAL', 'CANCELLED'],
  FAILED_TERMINAL: [],
  CANCELLED: []
}

export function isExecutionTransitionAllowed(
  from: ExecutionState,
  to: ExecutionState
): boolean {
  return allowedTransitions[from].includes(to)
}

function assertText(value: unknown, label: string, max = 240): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new OperationalExecutionError(
      'validation_failed',
      `${label} is required`
    )
  }
  if (value.length > max) {
    throw new OperationalExecutionError(
      'validation_failed',
      `${label} is too long`
    )
  }
  return value.trim()
}

function assertDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new OperationalExecutionError(
      'validation_failed',
      `${label} is invalid`
    )
  }
  return value
}

function copy<T>(value: T): T {
  return structuredClone(value)
}

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForHash)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, normalizeForHash(record[key])])
    )
  }
  return value
}

export function computeExecutionRequestHash(
  input: ExecutionSubmission
): string {
  return createHash('sha256')
    .update(JSON.stringify(normalizeForHash(input)))
    .digest('hex')
}

function toIso(value: Date): string {
  return assertDate(value, 'clock').toISOString()
}

function isLeaseExpired(record: ExecutionRecord, now: Date): boolean {
  return Boolean(
    record.leaseUntil && Date.parse(record.leaseUntil) <= now.getTime()
  )
}

function cloneFailure(
  failure: ExecutionFailure | undefined,
  maxMessageLength: number
): ExecutionFailure | null {
  if (!failure) return null
  const message = assertText(
    failure.message,
    'failure.message',
    maxMessageLength
  )
  const code = assertText(failure.code, 'failure.code', 80)
  const kind = failure.kind
  if (
    kind !== 'TECHNICAL_RETRYABLE' &&
    kind !== 'SEMANTIC_TERMINAL' &&
    kind !== 'POLICY_DENIED' &&
    kind !== 'UNKNOWN_EFFECT' &&
    kind !== 'CANCELLED'
  ) {
    throw new OperationalExecutionError(
      'validation_failed',
      'failure.kind is invalid'
    )
  }
  const normalized: ExecutionFailure = {
    kind,
    code,
    message,
    ...(failure.retryAt
      ? { retryAt: assertText(failure.retryAt, 'failure.retryAt', 80) }
      : {})
  }
  if (normalized.retryAt && Number.isNaN(Date.parse(normalized.retryAt))) {
    throw new OperationalExecutionError(
      'validation_failed',
      'failure.retryAt is invalid'
    )
  }
  return normalized
}

function retryExhaustedFailure(maxAttempts: number): ExecutionFailure {
  return {
    kind: 'SEMANTIC_TERMINAL',
    code: 'retry_exhausted',
    message: `Execution exhausted the maximum of ${maxAttempts} attempts.`
  }
}

/**
 * Shared state-payload invariants. The in-memory and durable adapters call
 * this before committing a transition so controlled tests cannot drift from
 * the durable contract.
 */
export function validateExecutionTransitionPayload(input: {
  readonly to: ExecutionState
  readonly result?: RuntimeResult | null
  readonly failure?: ExecutionFailure | null
  readonly approvalId?: string | null
}): void {
  if (input.to === 'SUCCEEDED') {
    if (input.result == null) {
      throw new OperationalExecutionError(
        'validation_failed',
        'SUCCEEDED requires a runtime result'
      )
    }
    if (input.failure != null) {
      throw new OperationalExecutionError(
        'validation_failed',
        'SUCCEEDED cannot carry a failure'
      )
    }
  }
  if (
    input.to === 'FAILED_RETRYABLE' ||
    input.to === 'FAILED_TERMINAL' ||
    input.to === 'CANCELLED'
  ) {
    if (input.failure == null) {
      throw new OperationalExecutionError(
        'validation_failed',
        `${input.to} requires a failure`
      )
    }
  }
  if (
    input.to === 'FAILED_RETRYABLE' &&
    input.failure?.kind !== 'TECHNICAL_RETRYABLE'
  ) {
    throw new OperationalExecutionError(
      'validation_failed',
      'FAILED_RETRYABLE requires a technical retryable failure'
    )
  }
  if (input.to === 'CANCELLED' && input.failure?.kind !== 'CANCELLED') {
    throw new OperationalExecutionError(
      'validation_failed',
      'CANCELLED requires a cancellation failure'
    )
  }
  if (input.to === 'WAITING_APPROVAL') {
    if (!input.approvalId) {
      throw new OperationalExecutionError(
        'validation_failed',
        'WAITING_APPROVAL requires a durable approval identifier'
      )
    }
    if (
      input.result?.approvalId &&
      input.result.approvalId !== input.approvalId
    ) {
      throw new OperationalExecutionError(
        'conflict',
        'Runtime approval id does not match the execution approval binding'
      )
    }
  }
}

function validateSubmission(input: ExecutionSubmission): ExecutionSubmission {
  const tenantId = assertText(input?.tenantId, 'tenantId', 120)
  const idempotencyKey = assertText(
    input?.idempotencyKey,
    'idempotencyKey',
    200
  )
  if (!input.runtime || typeof input.runtime !== 'object') {
    throw new OperationalExecutionError(
      'validation_failed',
      'runtime is required'
    )
  }
  const runtime = input.runtime
  const capabilityFingerprint =
    input.capabilityFingerprint !== undefined
      ? assertText(input.capabilityFingerprint, 'capabilityFingerprint', 160)
      : runtime.capabilityFingerprint !== undefined
        ? assertText(
            runtime.capabilityFingerprint,
            'runtime.capabilityFingerprint',
            160
          )
        : undefined
  if (runtime.tenantId !== tenantId) {
    throw new OperationalExecutionError(
      'validation_failed',
      'tenantId must match runtime.tenantId'
    )
  }
  if (
    capabilityFingerprint &&
    runtime.capabilityFingerprint !== undefined &&
    runtime.capabilityFingerprint !== capabilityFingerprint
  ) {
    throw new OperationalExecutionError(
      'conflict',
      'Capability fingerprint must match the execution binding'
    )
  }
  assertText(runtime.correlationId, 'runtime.correlationId', 160)
  assertText(runtime.traceId, 'runtime.traceId', 160)
  assertText(runtime.sessionId, 'runtime.sessionId', 160)
  assertText(runtime.conversationId, 'runtime.conversationId', 160)
  assertText(runtime.agent?.id, 'runtime.agent.id', 160)
  assertText(runtime.agent?.version, 'runtime.agent.version', 160)
  assertText(runtime.userMessage, 'runtime.userMessage', 32_000)
  return copy({
    tenantId,
    idempotencyKey,
    ...(capabilityFingerprint ? { capabilityFingerprint } : {}),
    runtime: capabilityFingerprint
      ? { ...runtime, capabilityFingerprint }
      : runtime
  })
}

/** Parses the public JSON boundary while keeping tenant authority outside the body. */
export function parseExecutionSubmission(
  raw: unknown,
  tenantScope?: string
): ExecutionSubmission {
  if (!raw || typeof raw !== 'object') {
    throw new OperationalExecutionError(
      'validation_failed',
      'Execution request must be an object'
    )
  }
  const body = raw as Record<string, unknown>
  const bodyTenant = body.tenantId
  if (bodyTenant !== undefined && typeof bodyTenant !== 'string') {
    throw new OperationalExecutionError(
      'validation_failed',
      'tenantId must be a string when supplied'
    )
  }
  if (
    tenantScope !== undefined &&
    bodyTenant !== undefined &&
    bodyTenant !== tenantScope
  ) {
    throw new OperationalExecutionError(
      'conflict',
      'Request tenant does not match the authenticated tenant scope'
    )
  }
  const tenantId = tenantScope ?? bodyTenant
  const idempotencyKey = body.idempotencyKey
  const runtime = body.runtime
  // executionId and resume are worker/authority-injected fields: a public
  // request body can never select them.
  const {
    executionId: _externalExecutionId,
    resume: _externalResume,
    ...publicRuntime
  } = (runtime ?? {}) as Record<string, unknown>
  void _externalExecutionId
  void _externalResume
  return validateSubmission({
    tenantId: tenantId as string,
    idempotencyKey: idempotencyKey as string,
    ...(body.capabilityFingerprint !== undefined
      ? { capabilityFingerprint: body.capabilityFingerprint as string }
      : {}),
    runtime: publicRuntime as unknown as RuntimeInput
  })
}

/**
 * Maps the durable resume binding to the runtime input field. Caller-supplied
 * resume values never reach the runtime: only this durable binding does.
 */
export function deriveExecutionResume(
  record: ExecutionRecord
): RuntimeInput['resume'] | undefined {
  if (!record.resume) return undefined
  if (record.resume.kind === 'approval') {
    return { kind: 'approval', approvalId: record.resume.approvalId }
  }
  if (!record.resume.input.trim()) return undefined
  return { kind: 'user_input', message: record.resume.input }
}

export function toExecutionView(record: ExecutionRecord): ExecutionView {
  return {
    id: record.id,
    tenantId: record.tenantId,
    idempotencyKey: record.idempotencyKey,
    requestHash: record.requestHash,
    ...(record.capabilityFingerprint
      ? { capabilityFingerprint: record.capabilityFingerprint }
      : {}),
    state: record.state,
    attempt: record.attempt,
    leaseOwner: record.leaseOwner,
    leaseUntil: record.leaseUntil,
    result: record.result,
    failure: record.failure,
    approvalId: record.approvalId,
    resume: record.resume,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt
  }
}

function eventType(state: ExecutionState): ExecutionEvent['type'] {
  if (state === 'QUEUED') return 'QUEUED'
  if (state === 'CLAIMED') return 'CLAIMED'
  if (state === 'RUNNING') return 'RUNNING'
  if (state === 'WAITING_APPROVAL') return 'WAITING_APPROVAL'
  if (state === 'WAITING_USER') return 'WAITING_USER'
  if (state === 'SUCCEEDED') return 'SUCCEEDED'
  if (state === 'FAILED_RETRYABLE') return 'FAILED_RETRYABLE'
  if (state === 'FAILED_TERMINAL') return 'FAILED_TERMINAL'
  if (state === 'CANCELLED') return 'CANCELLED'
  return 'RECEIVED'
}

/**
 * Process-local adapter used by tests and controlled development. Its API is
 * the same as the durable database adapter, but it never claims to be process
 * durable; production composition rejects this adapter.
 */
export class InMemoryOperationalExecutionStore implements OperationalExecutionStore {
  private readonly records = new Map<string, ExecutionRecord>()
  private readonly byIdempotency = new Map<string, string>()
  private readonly events = new Map<string, ExecutionEvent[]>()
  private sequence = 0
  private readonly leaseMs: number
  private readonly retryDelayMs: number
  private readonly maxAttempts: number
  private readonly maxFailureMessageLength: number
  private readonly clock: () => Date

  public constructor(options: InMemoryOperationalExecutionStoreOptions = {}) {
    this.leaseMs = positiveInt(options.leaseMs ?? 30_000, 'leaseMs')
    this.retryDelayMs = positiveInt(
      options.retryDelayMs ?? 1_000,
      'retryDelayMs'
    )
    this.maxAttempts = positiveInt(
      options.maxAttempts ?? DEFAULT_MAX_EXECUTION_ATTEMPTS,
      'maxAttempts'
    )
    this.maxFailureMessageLength = positiveInt(
      options.maxFailureMessageLength ?? 500,
      'maxFailureMessageLength'
    )
    this.clock = options.clock ?? (() => new Date())
  }

  public async submit(
    rawInput: ExecutionSubmission,
    rawNow?: Date
  ): Promise<SubmitResult> {
    const input = validateSubmission(rawInput)
    const now = assertDate(rawNow ?? this.clock(), 'now')
    const requestHash = computeExecutionRequestHash(input)
    const idempotencyIndex = this.idempotencyKey(
      input.tenantId,
      input.idempotencyKey
    )
    const existingId = this.byIdempotency.get(idempotencyIndex)
    if (existingId) {
      const existing = this.records.get(existingId)
      if (!existing) {
        throw new OperationalExecutionError(
          'conflict',
          'Execution idempotency index is inconsistent'
        )
      }
      if (existing.requestHash !== requestHash) {
        throw new OperationalExecutionError(
          'conflict',
          'Idempotency key is already bound to a different request'
        )
      }
      return { record: copy(existing), created: false }
    }

    const id = `exec_${randomUUID()}`
    const received = this.makeRecord({
      id,
      tenantId: input.tenantId,
      idempotencyKey: input.idempotencyKey,
      request: input,
      requestHash,
      ...(input.capabilityFingerprint
        ? { capabilityFingerprint: input.capabilityFingerprint }
        : {}),
      state: 'RECEIVED',
      attempt: 0,
      leaseOwner: null,
      leaseUntil: null,
      result: null,
      failure: null,
      approvalId: null,
      resume: null,
      createdAt: toIso(now),
      updatedAt: toIso(now),
      completedAt: null
    })
    this.records.set(id, received)
    this.byIdempotency.set(idempotencyIndex, id)
    this.appendEvent(received, 'RECEIVED', null, null, undefined, now)
    const queued = this.applyTransition(
      received,
      'QUEUED',
      undefined,
      'submission_enqueued',
      undefined,
      now
    )
    return { record: copy(queued), created: true }
  }

  public async get(
    tenantId: string,
    executionId: string
  ): Promise<ExecutionRecord | null> {
    const tenant = assertText(tenantId, 'tenantId', 120)
    const id = assertText(executionId, 'executionId', 200)
    const record = this.records.get(id)
    if (!record || record.tenantId !== tenant) return null
    return copy(record)
  }

  public async claimNext(
    tenantId: string,
    workerId: string,
    rawNow?: Date,
    leaseMs = this.leaseMs
  ): Promise<ClaimResult | null> {
    const tenant = assertText(tenantId, 'tenantId', 120)
    const worker = assertText(workerId, 'workerId', 120)
    const now = assertDate(rawNow ?? this.clock(), 'now')
    const duration = positiveInt(leaseMs, 'leaseMs')
    const candidates = [...this.records.values()]
      .filter((record) => {
        if (record.tenantId !== tenant) return false
        if (record.state === 'QUEUED') return true
        if (record.state === 'FAILED_RETRYABLE') {
          return (
            !record.failure?.retryAt ||
            Date.parse(record.failure.retryAt) <= now.getTime()
          )
        }
        return false
      })
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    let candidate: ExecutionRecord | undefined
    for (const possible of candidates) {
      if (
        possible.state === 'FAILED_RETRYABLE' &&
        possible.attempt >= this.maxAttempts
      ) {
        this.applyTransition(
          possible,
          'FAILED_TERMINAL',
          undefined,
          'retry_exhausted',
          undefined,
          now,
          { failure: retryExhaustedFailure(this.maxAttempts) }
        )
        continue
      }
      candidate = possible
      break
    }
    if (!candidate) return null
    const recovered = candidate.state === 'FAILED_RETRYABLE'
    const claimed = this.applyTransition(
      candidate,
      'CLAIMED',
      worker,
      recovered ? 'retry_claimed' : 'worker_claimed',
      undefined,
      now,
      {
        attempt: candidate.attempt + 1,
        leaseOwner: worker,
        leaseUntil: new Date(now.getTime() + duration).toISOString(),
        failure: null
      }
    )
    return { record: copy(claimed), recovered }
  }

  public async heartbeat(
    tenantId: string,
    executionId: string,
    workerId: string,
    fenceToken: number,
    rawNow?: Date,
    leaseMs = this.leaseMs
  ): Promise<ExecutionRecord> {
    const record = this.requireRecord(tenantId, executionId)
    const now = assertDate(rawNow ?? this.clock(), 'now')
    this.assertLease(record, workerId, now, fenceToken)
    const updated = this.makeRecord({
      ...record,
      leaseUntil: new Date(
        now.getTime() + positiveInt(leaseMs, 'leaseMs')
      ).toISOString(),
      updatedAt: toIso(now)
    })
    this.records.set(record.id, updated)
    return copy(updated)
  }

  public async transition(
    input: ExecutionTransitionInput,
    rawNow?: Date
  ): Promise<ExecutionRecord> {
    const record = this.requireRecord(input.tenantId, input.executionId)
    const now = assertDate(rawNow ?? this.clock(), 'now')
    if (record.state === 'WAITING_APPROVAL' && input.to === 'QUEUED') {
      throw new OperationalExecutionError(
        'invalid_action',
        'WAITING_APPROVAL must be resolved through resolveApproval'
      )
    }
    if (input.to === 'CLAIMED') {
      throw new OperationalExecutionError(
        'invalid_action',
        'CLAIMED must be assigned through claimNext'
      )
    }
    if (['CLAIMED', 'RUNNING'].includes(record.state)) {
      if (!input.workerId) {
        throw new OperationalExecutionError(
          'validation_failed',
          'Active execution transitions require workerId'
        )
      }
      this.assertLease(record, input.workerId, now, input.fenceToken)
    }
    const exhausted =
      input.to === 'FAILED_RETRYABLE' && record.attempt >= this.maxAttempts
    const targetState: ExecutionState = exhausted ? 'FAILED_TERMINAL' : input.to
    const approvalId =
      input.approvalId ?? input.result?.approvalId ?? record.approvalId
    const failure = exhausted
      ? retryExhaustedFailure(this.maxAttempts)
      : input.failure !== undefined
        ? cloneFailure(input.failure, this.maxFailureMessageLength)
        : null
    validateExecutionTransitionPayload({
      to: targetState,
      result: input.result ?? record.result,
      failure,
      approvalId
    })
    const updated = this.applyTransition(
      record,
      targetState,
      input.workerId,
      exhausted
        ? 'retry_exhausted'
        : (input.reason ??
            `transition_${record.state.toLowerCase()}_${targetState.toLowerCase()}`),
      input.auditEvents,
      now,
      {
        ...(input.result !== undefined ? { result: copy(input.result) } : {}),
        ...(input.failure !== undefined || exhausted ? { failure } : {}),
        ...(targetState === 'WAITING_APPROVAL' ? { approvalId } : {}),
        ...(targetState === 'RUNNING' ? { failure: null } : {}),
        ...(terminalStates.has(targetState) ||
        targetState === 'WAITING_APPROVAL' ||
        targetState === 'WAITING_USER'
          ? { leaseOwner: null, leaseUntil: null }
          : {}),
        ...(targetState === 'SUCCEEDED' ||
        targetState === 'FAILED_TERMINAL' ||
        targetState === 'CANCELLED'
          ? { completedAt: toIso(now) }
          : {})
      }
    )
    return copy(updated)
  }

  public async cancel(
    input: ExecutionCancellationInput,
    rawNow?: Date
  ): Promise<ExecutionRecord> {
    const record = this.requireRecord(input.tenantId, input.executionId)
    const now = assertDate(rawNow ?? this.clock(), 'now')
    const actorId = assertText(input.actorId, 'actorId', 120)
    if (record.state === 'CANCELLED') return copy(record)
    if (terminalStates.has(record.state)) {
      throw new OperationalExecutionError(
        'invalid_action',
        'Terminal execution cannot be cancelled'
      )
    }
    if (record.state === 'CLAIMED' || record.state === 'RUNNING') {
      throw new OperationalExecutionError(
        'conflict',
        'Active execution cannot be cancelled safely'
      )
    }
    const failure: ExecutionFailure = {
      kind: 'CANCELLED',
      code: 'cancelled_by_operator',
      message: input.reason?.trim() || 'Execution cancelled by operator.'
    }
    validateExecutionTransitionPayload({ to: 'CANCELLED', failure })
    return copy(
      this.applyTransition(
        record,
        'CANCELLED',
        undefined,
        `cancelled:${actorId}`,
        undefined,
        now,
        { failure, leaseOwner: null, leaseUntil: null, completedAt: toIso(now) }
      )
    )
  }

  public async resolveApproval(
    input: {
      readonly tenantId: string
      readonly executionId: string
      readonly approvalId: string
      readonly actorId: string
      readonly decision: 'APPROVED' | 'REJECTED'
      readonly reason?: string
    },
    rawNow?: Date
  ): Promise<ExecutionRecord> {
    const record = this.requireRecord(input.tenantId, input.executionId)
    const now = assertDate(rawNow ?? this.clock(), 'now')
    const actorId = assertText(input.actorId, 'actorId', 120)
    const approvalId = assertText(input.approvalId, 'approvalId', 160)
    if (
      record.state !== 'WAITING_APPROVAL' &&
      record.approvalId === approvalId &&
      ((input.decision === 'APPROVED' && record.state !== 'FAILED_TERMINAL') ||
        (input.decision === 'REJECTED' &&
          record.state === 'FAILED_TERMINAL' &&
          record.failure?.code === 'approval_rejected'))
    ) {
      return copy(record)
    }
    if (record.state !== 'WAITING_APPROVAL') {
      throw new OperationalExecutionError(
        'invalid_action',
        'Execution is not waiting for approval'
      )
    }
    if (record.approvalId !== approvalId) {
      throw new OperationalExecutionError(
        'conflict',
        'Approval is not bound to this execution'
      )
    }
    if (input.decision === 'APPROVED') {
      validateExecutionTransitionPayload({
        to: 'QUEUED',
        result: record.result,
        failure: null
      })
      return copy(
        this.applyTransition(
          record,
          'QUEUED',
          undefined,
          `approval_resumed:${actorId}`,
          undefined,
          now,
          {
            resume: {
              kind: 'approval',
              approvalId,
              boundAt: toIso(now)
            }
          }
        )
      )
    }
    const failure: ExecutionFailure = {
      kind: 'POLICY_DENIED',
      code: 'approval_rejected',
      message: input.reason?.trim() || 'Approval was rejected.'
    }
    validateExecutionTransitionPayload({
      to: 'FAILED_TERMINAL',
      result: record.result,
      failure
    })
    return copy(
      this.applyTransition(
        record,
        'FAILED_TERMINAL',
        undefined,
        `approval_rejected:${actorId}`,
        undefined,
        now,
        {
          failure
        }
      )
    )
  }

  public async provideUserInput(
    input: {
      readonly tenantId: string
      readonly executionId: string
      readonly actorId: string
      readonly message: string
    },
    rawNow?: Date
  ): Promise<ExecutionRecord> {
    const record = this.requireRecord(input.tenantId, input.executionId)
    const now = assertDate(rawNow ?? this.clock(), 'now')
    const actorId = assertText(input.actorId, 'actorId', 120)
    const message = assertText(input.message, 'message', 32_000)
    if (record.state !== 'WAITING_USER') {
      if (
        record.state === 'QUEUED' &&
        record.resume?.kind === 'user_input' &&
        record.resume.input === message
      ) {
        return copy(record)
      }
      throw new OperationalExecutionError(
        'invalid_action',
        'Execution is not waiting for user input'
      )
    }
    return copy(
      this.applyTransition(
        record,
        'QUEUED',
        undefined,
        `user_input_provided:${actorId}`,
        undefined,
        now,
        {
          resume: {
            kind: 'user_input',
            input: message,
            boundAt: toIso(now)
          }
        }
      )
    )
  }

  public async recoverExpired(
    tenantId: string,
    rawNow?: Date
  ): Promise<readonly ExecutionRecord[]> {
    const tenant = assertText(tenantId, 'tenantId', 120)
    const now = assertDate(rawNow ?? this.clock(), 'now')
    const recovered: ExecutionRecord[] = []
    for (const record of this.records.values()) {
      if (
        record.tenantId !== tenant ||
        !['CLAIMED', 'RUNNING'].includes(record.state) ||
        !isLeaseExpired(record, now)
      ) {
        continue
      }
      const next = this.applyTransition(
        record,
        'QUEUED',
        null,
        'stale_lease_recovered',
        undefined,
        now,
        { leaseOwner: null, leaseUntil: null }
      )
      recovered.push(copy(next))
    }
    return recovered
  }

  public async listEvents(
    tenantId: string,
    executionId: string
  ): Promise<readonly ExecutionEvent[]> {
    const record = this.requireRecord(tenantId, executionId)
    void record
    return copy(this.events.get(executionId) ?? [])
  }

  private idempotencyKey(tenantId: string, idempotencyKey: string): string {
    return `${tenantId}\u0000${idempotencyKey}`
  }

  private requireRecord(
    tenantId: string,
    executionId: string
  ): ExecutionRecord {
    const tenant = assertText(tenantId, 'tenantId', 120)
    const id = assertText(executionId, 'executionId', 200)
    const record = this.records.get(id)
    if (!record || record.tenantId !== tenant) {
      throw new OperationalExecutionError('not_found', 'Execution not found')
    }
    return record
  }

  private assertLease(
    record: ExecutionRecord,
    workerId: string,
    now: Date,
    fenceToken: number | undefined
  ): void {
    const worker = assertText(workerId, 'workerId', 120)
    if (
      record.leaseOwner !== worker ||
      fenceToken !== record.attempt ||
      !record.leaseUntil ||
      Date.parse(record.leaseUntil) <= now.getTime()
    ) {
      throw new OperationalExecutionError(
        'lease_lost',
        'Execution lease is not owned by this worker'
      )
    }
  }

  private makeRecord(record: ExecutionRecord): ExecutionRecord {
    return copy(record)
  }

  private applyTransition(
    record: ExecutionRecord,
    to: ExecutionState,
    workerId: string | null | undefined,
    reason: string,
    auditEvents: readonly AuditEvent[] | undefined,
    now: Date,
    changes: Partial<ExecutionRecord> = {}
  ): ExecutionRecord {
    if (!isExecutionTransitionAllowed(record.state, to)) {
      throw new OperationalExecutionError(
        'invalid_action',
        `Transition ${record.state} -> ${to} is not allowed`
      )
    }
    const next = this.makeRecord({
      ...record,
      ...changes,
      state: to,
      leaseOwner:
        changes.leaseOwner !== undefined
          ? changes.leaseOwner
          : to === 'CLAIMED'
            ? (workerId ?? null)
            : record.leaseOwner,
      updatedAt: toIso(now)
    })
    this.records.set(record.id, next)
    this.appendEvent(
      next,
      eventType(to),
      workerId ?? next.leaseOwner,
      reason,
      auditEvents,
      now
    )
    return next
  }

  private appendEvent(
    record: ExecutionRecord,
    type: ExecutionEvent['type'],
    workerId: string | null,
    reason: string | null,
    auditEvents: readonly AuditEvent[] | undefined,
    now: Date
  ): void {
    const event: ExecutionEvent = {
      sequence: ++this.sequence,
      executionId: record.id,
      tenantId: record.tenantId,
      type,
      workerId,
      attempt: record.attempt,
      reason,
      ...(record.approvalId ? { approvalId: record.approvalId } : {}),
      ...(auditEvents?.length ? { auditEvents: copy(auditEvents) } : {}),
      createdAt: toIso(now)
    }
    const existing = this.events.get(record.id) ?? []
    existing.push(event)
    this.events.set(record.id, existing)
  }
}

export function createInMemoryOperationalExecutionStore(
  options: InMemoryOperationalExecutionStoreOptions = {}
): InMemoryOperationalExecutionStore {
  return new InMemoryOperationalExecutionStore(options)
}

export type WorkerProcessResult =
  | { readonly kind: 'idle' }
  | { readonly kind: 'processed'; readonly record: ExecutionRecord }

export interface OperationalExecutionWorkerOptions {
  readonly store: OperationalExecutionStore
  readonly workerId: string
  readonly harnessOptions:
    | OperationalHarnessOptions
    | ((record: ExecutionRecord) => OperationalHarnessOptions)
  readonly leaseMs?: number
  /** Heartbeat cadence while a claimed runtime is executing. */
  readonly heartbeatMs?: number
  readonly tenantId: string
  readonly now?: () => Date
  readonly onSignal?: (name: string, record: ExecutionRecord) => void
  readonly effectJournal?: EffectJournal
  readonly effectJournalOptions?: JournaledToolRegistryOptions
  readonly faultInjector?: (
    point: OperationalExecutionFaultPoint
  ) => Promise<void>
}

/**
 * Canonical V1 worker boundary. The only runtime composition call in this
 * worker is the public `createOperationalHarness` factory.
 */
export class OperationalExecutionWorker {
  private readonly now: () => Date
  private stopping = false
  private activeExecutions = 0
  private readonly stopWaiters: Array<() => void> = []

  public constructor(
    private readonly options: OperationalExecutionWorkerOptions
  ) {
    this.now = options.now ?? (() => new Date())
  }

  /** Prevents future claims; an already-running execution is allowed to settle. */
  public requestStop(): void {
    this.stopping = true
    this.resolveStopWaitersIfIdle()
  }

  /** Waits for active executions after the claim boundary has been stopped. */
  public async stop(): Promise<void> {
    this.requestStop()
    if (this.activeExecutions === 0) return
    await new Promise<void>((resolve) => this.stopWaiters.push(resolve))
  }

  public async processNext(): Promise<WorkerProcessResult> {
    if (this.stopping) return { kind: 'idle' }
    this.activeExecutions += 1
    try {
      return await this.processNextInternal()
    } finally {
      this.activeExecutions -= 1
      this.resolveStopWaitersIfIdle()
    }
  }

  private async processNextInternal(): Promise<WorkerProcessResult> {
    const recovered = await this.options.store.recoverExpired(
      this.options.tenantId,
      this.now()
    )
    for (const record of recovered) {
      this.options.onSignal?.('execution.recovered', record)
    }
    if (this.stopping) return { kind: 'idle' }
    const claimed = await this.options.store.claimNext(
      this.options.tenantId,
      this.options.workerId,
      this.now(),
      this.options.leaseMs
    )
    if (!claimed) return { kind: 'idle' }
    await this.options.faultInjector?.(
      OPERATIONAL_EXECUTION_FAULT_POINT_AFTER_CLAIM
    )
    this.options.onSignal?.(
      claimed.recovered ? 'execution.retry_claimed' : 'execution.claimed',
      claimed.record
    )

    const running = await this.options.store.transition(
      {
        tenantId: this.options.tenantId,
        executionId: claimed.record.id,
        to: 'RUNNING',
        workerId: this.options.workerId,
        fenceToken: claimed.record.attempt,
        reason: 'worker_started'
      },
      this.now()
    )
    this.options.onSignal?.('execution.running', running)

    let result: RuntimeResult
    const bufferedAudit: AuditEvent[] = []
    const bufferedTelemetry: TelemetryEvent[] = []
    let originalSinks: OperationalHarnessOptions | undefined
    let heartbeatInFlight: Promise<void> | undefined
    let heartbeatError: unknown
    const heartbeatMs = Math.max(
      1,
      this.options.heartbeatMs ??
        Math.floor((this.options.leaseMs ?? 30_000) / 3)
    )
    const heartbeatTimer = setInterval(() => {
      if (heartbeatInFlight) return
      heartbeatInFlight = this.options.store
        .heartbeat(
          this.options.tenantId,
          running.id,
          this.options.workerId,
          running.attempt,
          this.now(),
          this.options.leaseMs
        )
        .then(() => undefined)
        .catch((error: unknown) => {
          heartbeatError = error
        })
        .finally(() => {
          heartbeatInFlight = undefined
        })
    }, heartbeatMs)
    try {
      const harnessOptions =
        typeof this.options.harnessOptions === 'function'
          ? this.options.harnessOptions(running)
          : this.options.harnessOptions
      originalSinks = harnessOptions
      const optionsWithBufferedSinks = {
        ...harnessOptions,
        audit: {
          append: async (event: AuditEvent) => {
            bufferedAudit.push(copy(event))
          }
        },
        telemetry: {
          record: (event: TelemetryEvent) => {
            bufferedTelemetry.push(copy(event))
          }
        }
      }
      const composedOptions = this.options.effectJournal
        ? {
            ...optionsWithBufferedSinks,
            effectJournal: this.options.effectJournal,
            ...(this.options.effectJournalOptions
              ? { effectJournalOptions: this.options.effectJournalOptions }
              : {})
          }
        : optionsWithBufferedSinks
      const harness: OperationalHarness =
        createOperationalHarness(composedOptions)
      const resume = deriveExecutionResume(running)
      result = await harness.execute({
        ...running.request.runtime,
        executionId: running.id,
        ...(running.capabilityFingerprint
          ? { capabilityFingerprint: running.capabilityFingerprint }
          : {}),
        ...(resume ? { resume } : {})
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'worker execution failed'
      const failed = await this.options.store.transition(
        {
          tenantId: this.options.tenantId,
          executionId: running.id,
          to: 'FAILED_RETRYABLE',
          workerId: this.options.workerId,
          fenceToken: running.attempt,
          failure: {
            kind: 'TECHNICAL_RETRYABLE',
            code: 'worker_exception',
            message,
            retryAt: new Date(this.now().getTime() + 1_000).toISOString()
          },
          reason: 'worker_exception'
        },
        this.now()
      )
      this.options.onSignal?.(`execution.${failed.state.toLowerCase()}`, failed)
      return { kind: 'processed', record: failed }
    } finally {
      clearInterval(heartbeatTimer)
      if (heartbeatInFlight) await heartbeatInFlight
      if (heartbeatError) {
        this.options.onSignal?.('execution.heartbeat_failed', running)
      }
    }

    const outcome = classifyRuntimeResult(result)
    let completed: ExecutionRecord
    try {
      completed = await this.options.store.transition(
        {
          tenantId: this.options.tenantId,
          executionId: running.id,
          to: outcome.state,
          workerId: this.options.workerId,
          fenceToken: running.attempt,
          ...(outcome.result ? { result: outcome.result } : {}),
          ...(outcome.failure ? { failure: outcome.failure } : {}),
          ...(bufferedAudit.length ? { auditEvents: bufferedAudit } : {}),
          reason: outcome.reason
        },
        this.now()
      )
    } catch (error) {
      if (
        error instanceof OperationalExecutionError &&
        error.code === 'lease_lost'
      ) {
        this.options.onSignal?.('execution.lease_lost', running)
        const current = await this.options.store.get(
          this.options.tenantId,
          running.id
        )
        return current
          ? { kind: 'processed', record: current }
          : { kind: 'idle' }
      }
      throw error
    }
    this.options.onSignal?.(
      `execution.${outcome.state.toLowerCase()}`,
      completed
    )
    if (originalSinks) {
      await this.flushObservability(
        completed,
        originalSinks,
        bufferedAudit,
        bufferedTelemetry
      )
    }
    return { kind: 'processed', record: completed }
  }

  private resolveStopWaitersIfIdle(): void {
    if (!this.stopping || this.activeExecutions !== 0) return
    while (this.stopWaiters.length > 0) {
      this.stopWaiters.shift()?.()
    }
  }

  private async flushObservability(
    record: ExecutionRecord,
    harnessOptions: OperationalHarnessOptions,
    bufferedAudit: readonly AuditEvent[],
    bufferedTelemetry: readonly TelemetryEvent[]
  ): Promise<void> {
    for (const event of bufferedAudit) {
      try {
        await harnessOptions.audit.append(event)
      } catch {
        this.options.onSignal?.('execution.audit_failed', record)
      }
    }
    for (const event of bufferedTelemetry) {
      try {
        harnessOptions.telemetry.record(event)
      } catch {
        this.options.onSignal?.('execution.telemetry_failed', record)
      }
    }
  }
}

interface ClassifiedRuntimeResult {
  readonly state: ExecutionState
  readonly result?: RuntimeResult
  readonly approvalId?: RuntimeResult['approvalId']
  readonly failure?: ExecutionFailure
  readonly reason: string
}

export function classifyRuntimeResult(
  result: RuntimeResult
): ClassifiedRuntimeResult {
  switch (result.stopReason) {
    case 'COMPLETED':
      return {
        state: 'SUCCEEDED',
        result: copy(result),
        reason: 'runtime_completed'
      }
    case 'APPROVAL_REQUIRED':
      if (!result.approvalId) {
        return {
          state: 'FAILED_TERMINAL',
          result: copy(result),
          failure: {
            kind: 'SEMANTIC_TERMINAL',
            code: 'approval_missing',
            message: 'Approval-required execution has no durable approval id.'
          },
          reason: 'approval_identity_missing'
        }
      }
      return {
        state: 'WAITING_APPROVAL',
        result: copy(result),
        ...(result.approvalId ? { approvalId: result.approvalId } : {}),
        reason: 'approval_required'
      }
    case 'NEEDS_USER_INPUT':
      return {
        state: 'WAITING_USER',
        result: copy(result),
        reason: 'user_input_required'
      }
    case 'MODEL_FAILURE':
    case 'INTERNAL_FAILURE':
      return {
        state: 'FAILED_RETRYABLE',
        result: copy(result),
        failure: {
          kind: 'TECHNICAL_RETRYABLE',
          code: result.stopReason.toLowerCase(),
          message: result.response,
          retryAt: new Date(Date.now() + 1_000).toISOString()
        },
        reason: 'technical_retryable'
      }
    case 'TOOL_FAILURE':
      if (result.response.startsWith('unknown_effect:')) {
        return {
          state: 'FAILED_TERMINAL',
          result: copy(result),
          failure: {
            kind: 'UNKNOWN_EFFECT',
            code: 'unknown_effect',
            message: result.response
          },
          reason: 'unknown_effect_requires_reconciliation'
        }
      }
      return {
        state: 'FAILED_RETRYABLE',
        result: copy(result),
        failure: {
          kind: 'TECHNICAL_RETRYABLE',
          code: result.stopReason.toLowerCase(),
          message: result.response,
          retryAt: new Date(Date.now() + 1_000).toISOString()
        },
        reason: 'technical_retryable'
      }
    case 'POLICY_DENIED':
    case 'UNSAFE_REQUEST':
    case 'INSUFFICIENT_EVIDENCE':
    case 'HUMAN_TAKEOVER':
    case 'VERIFICATION_FAILED':
    case 'LOOP_DETECTED':
      return {
        state: 'FAILED_TERMINAL',
        result: copy(result),
        failure: {
          kind:
            result.stopReason === 'POLICY_DENIED'
              ? 'POLICY_DENIED'
              : 'SEMANTIC_TERMINAL',
          code: result.stopReason.toLowerCase(),
          message: result.response
        },
        reason: 'semantic_terminal'
      }
    case 'CANCELLED':
      return {
        state: 'CANCELLED',
        result: copy(result),
        failure: {
          kind: 'CANCELLED',
          code: 'cancelled',
          message: result.response
        },
        reason: 'runtime_cancelled'
      }
    case 'MAX_STEPS':
    case 'MAX_COST':
    case 'MAX_DURATION':
    case 'MAX_TOKENS':
    case 'MAX_MODEL_CALLS':
    case 'MAX_TOOL_CALLS':
    case 'MAX_REPLANS':
    case 'MAX_KNOWLEDGE_CALLS':
    case 'MAX_VERIFICATION_CALLS':
    case 'STATE_CONFLICT':
      return {
        state: 'FAILED_TERMINAL',
        result: copy(result),
        failure: {
          kind: 'SEMANTIC_TERMINAL',
          code: result.stopReason.toLowerCase(),
          message: result.response
        },
        reason: 'bounded_terminal'
      }
  }
}

function positiveInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new OperationalExecutionError(
      'validation_failed',
      `${label} must be a positive integer`
    )
  }
  return value
}
