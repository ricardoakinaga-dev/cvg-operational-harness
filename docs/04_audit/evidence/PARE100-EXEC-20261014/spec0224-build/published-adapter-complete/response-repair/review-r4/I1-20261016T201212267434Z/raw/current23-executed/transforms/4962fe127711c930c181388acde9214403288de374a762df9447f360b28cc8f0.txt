import { createHash } from 'node:crypto'
import { TextDecoder } from 'node:util'
import {
  canonicalizeCompleteJson,
  COMPLETE_CHECKPOINT_MAX_BYTES,
  MAX_CHECKPOINT_OBSERVATIONS,
  OBSERVATION_TYPES,
  OBSERVATION_SOURCES,
  DECISION_TYPES,
  DECISION_REASON_CODES,
  COMPLETION_OUTCOMES,
  STOP_REASONS,
  validateLoopDecision,
  type AgentLoopState,
  type CompleteCheckpointStorageState,
  type ExecutionCheckpoint
} from '@cvg/harness-contracts'
import { CheckpointError, type UnsignedCheckpoint } from './step-store.ts'

const LIMITS = {
  maxBytes: COMPLETE_CHECKPOINT_MAX_BYTES,
  maxDepth: 64,
  maxNodes: 1000000
}
export const COMPLETE_CHECKPOINT_DATA_MAX_CHARS =
  4 * Math.ceil(COMPLETE_CHECKPOINT_MAX_BYTES / 3)
export const COMPLETE_CHECKPOINT_STORAGE_MAX_BYTES =
  COMPLETE_CHECKPOINT_DATA_MAX_CHARS + 512
const sha = (text: string | Uint8Array): string =>
  createHash('sha256').update(text).digest('hex')
function fail(message = 'Invalid complete checkpoint'): never {
  throw new CheckpointError('checkpoint_integrity', message)
}
type Rule = (value: unknown) => unknown
const str: Rule = (value) => (typeof value === 'string' ? value : fail())
const id: Rule = (value) =>
  typeof value === 'string' && value.length > 0 && !value.includes('\u0000')
    ? value
    : fail('Invalid checkpoint identifier')
const number: Rule = (value) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  !Object.is(value, -0)
    ? value
    : fail()
const integer: Rule = (value) =>
  Number.isSafeInteger(number(value)) ? value : fail()
const positive: Rule = (value) =>
  (integer(value) as number) > 0 ? value : fail()
const bool: Rule = (value) => (typeof value === 'boolean' ? value : fail())
const digest: Rule = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
    ? value
    : fail('Invalid checkpoint hash')
const one =
  (...values: readonly unknown[]): Rule =>
  (value) =>
    values.includes(value) ? value : fail()
const json: Rule = (value) => {
  canonicalizeCompleteJson(value, LIMITS)
  return value
}
const nullable =
  (rule: Rule): Rule =>
  (value) =>
    value === null ? null : rule(value)

/** Only declared optional internal fields may omit undefined. Arbitrary JSON is never repaired. */
function record(
  required: Record<string, Rule>,
  optional: Record<string, Rule> = {}
): Rule {
  return (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) fail()
    const keys = Reflect.ownKeys(value)
    if (
      keys.length >
      Object.keys(required).length + Object.keys(optional).length
    )
      fail('Unknown checkpoint field')
    const normalized = Object.create(null) as Record<string, unknown>
    for (const key of keys) {
      if (
        typeof key !== 'string' ||
        (!Object.hasOwn(required, key) && !Object.hasOwn(optional, key))
      )
        fail('Unknown checkpoint field')
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor))
        fail('Checkpoint accessor is forbidden')
      if (descriptor.value === undefined && Object.hasOwn(optional, key))
        continue
      normalized[key as string] = (required[key as string] ??
        optional[key as string])!(descriptor.value)
    }
    for (const key of Object.keys(required))
      if (!Object.hasOwn(normalized, key)) fail('Missing checkpoint field')
    return normalized
  }
}
function array(rule: Rule): Rule {
  return (value) => {
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    )
      fail()
    const length = Object.getOwnPropertyDescriptor(value, 'length')!
      .value as number
    if (
      length > LIMITS.maxNodes ||
      Reflect.ownKeys(value).length !== length + 1
    )
      fail('Invalid checkpoint array')
    const normalized: unknown[] = []
    for (let i = 0; i < length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
      if (!descriptor || !('value' in descriptor))
        fail('Invalid checkpoint array')
      normalized.push(rule(descriptor.value))
    }
    return normalized
  }
}
const usage = record({
  modelCalls: integer,
  inputTokens: integer,
  outputTokens: integer,
  costUsd: number
})
const measurement = record({
  counterId: id,
  counterVersion: id,
  provider: id,
  model: id,
  formattingVersion: id,
  inputUpperBoundTokens: integer,
  contextWindowTokens: positive,
  costUpperBoundUsd: number
})
const receipt = record(
  {
    admissionId: id,
    tenantId: id,
    executionId: id,
    stepNumber: positive,
    attempt: integer,
    purpose: one('ORCHESTRATION', 'REPAIR'),
    requestSha256: digest,
    measurement,
    reserved: usage,
    status: one('RESERVED', 'SETTLED', 'UNKNOWN')
  },
  { actual: usage, unknownReason: id, resultSha256: digest }
)
const context = record(
  {
    version: one(1),
    deliveredThroughStep: integer,
    pendingDecisionAdmission: nullable(id),
    decisionAdmissions: array(receipt)
  },
  { acceptedDecision: (value) => acceptedDecision(value) }
)
const question = record(
  {
    questionType: one(
      'CLARIFICATION',
      'MISSING_FIELD',
      'CONFIRMATION',
      'CHOICE'
    ),
    missingFields: array(str),
    promptIntent: str
  },
  { choices: array(str) }
)
const decision = record(
  {
    decisionType: one(...DECISION_TYPES),
    reasonCode: one(...DECISION_REASON_CODES)
  },
  {
    selectedCapability: id,
    toolId: id,
    toolVersion: id,
    toolInput: json,
    query: str,
    knowledgeCategories: array(str),
    responseIntent: str,
    responseText: str,
    requestedInput: question,
    verificationTarget: str
  }
)
const acceptedDecision = record({
  stepNumber: positive,
  decision,
  decisionAdmissionIds: array(id)
})
const evaluation = record(
  {
    outcome: one(...COMPLETION_OUTCOMES),
    reasonCode: one(
      ...DECISION_REASON_CODES,
      'COMPLETION_CONFIRMED',
      'EVALUATOR_UNAVAILABLE'
    ),
    deterministic: bool
  },
  { detail: str, usage }
)
const provenance = record(
  { sourceId: id },
  { sourceVersion: id, operationKey: id, effectRef: id, category: str }
)
const observation = record({
  observationId: id,
  executionId: id,
  stepId: id,
  stepNumber: integer,
  type: one(...OBSERVATION_TYPES),
  source: one(...OBSERVATION_SOURCES),
  trust: one('TRUSTED', 'UNTRUSTED'),
  payload: (value) => value,
  summary: str,
  provenance,
  timestamp: id
})
const stateSchema = record(
  {
    goal: str,
    stepNumber: integer,
    observations: array(observation),
    openQuestions: array(str),
    resolvedInputs: json,
    loopSignatures: array(str),
    toolResultContext: context
  },
  {
    capabilityFingerprint: id,
    pendingQuestion: question,
    pendingApprovalId: id,
    pendingDecision: decision,
    pendingStepNumber: positive,
    selectedCapability: id,
    stopReason: one(...STOP_REASONS),
    lastEvaluation: evaluation
  }
)
const budgetSchema = record({
  steps: integer,
  modelCalls: integer,
  toolCalls: integer,
  knowledgeCalls: integer,
  verificationCalls: integer,
  replans: integer,
  decisionRepairs: integer,
  inputTokens: integer,
  outputTokens: integer,
  costUsd: number,
  activeDurationMs: number
})
const unsignedSchema = record({
  tenantId: id,
  executionId: id,
  checkpointVersion: one(2),
  runtimeProfile: one('iterative'),
  runtimeVersion: id,
  orchestratorVersion: id,
  stepNumber: integer,
  state: stateSchema,
  budgetUsage: budgetSchema
})
const succeeded = record({
  schemaVersion: one(1),
  status: one('SUCCEEDED'),
  sideEffect: one('NONE', 'READ', 'WRITE', 'EXTERNAL'),
  completion: one('COMPLETE'),
  resultAvailability: one('AVAILABLE'),
  output: (value) => {
    canonicalizeCompleteJson(value)
    return value
  },
  outputBytes: integer,
  outputSha256: digest
})
const unavailable = record({
  schemaVersion: one(1),
  status: one('SUCCEEDED'),
  sideEffect: one('NONE', 'READ', 'WRITE', 'EXTERNAL'),
  completion: one('UNAVAILABLE'),
  resultAvailability: one('UNAVAILABLE'),
  reason: one('INVALID_JSON', 'RESULT_TOO_LARGE', 'RESULT_COMPLEXITY')
})
const failed = record({
  schemaVersion: one(1),
  status: one('FAILED', 'REJECTED'),
  sideEffect: one('NONE', 'READ', 'WRITE', 'EXTERNAL'),
  completion: one('NOT_APPLICABLE'),
  resultAvailability: one('UNAVAILABLE'),
  error: str
})

function validateState(
  state: AgentLoopState,
  binding?: { tenantId: string; executionId: string }
): void {
  const ctx = state.toolResultContext!
  if (
    !state.resolvedInputs ||
    Array.isArray(state.resolvedInputs) ||
    typeof state.resolvedInputs !== 'object'
  )
    fail()
  if (
    state.pendingStepNumber !== undefined &&
    state.pendingStepNumber !== state.stepNumber + 1 &&
    state.pendingStepNumber !== state.stepNumber
  )
    fail('Invalid pending step')
  if (state.observations.length > MAX_CHECKPOINT_OBSERVATIONS)
    fail('Complete checkpoint observation capacity exceeded')
  const observations = new Set<string>(),
    toolSteps = new Set<number>()
  const executionId =
    binding?.executionId ??
    state.observations[0]?.executionId ??
    ctx.decisionAdmissions[0]?.executionId
  const tenantId = binding?.tenantId ?? ctx.decisionAdmissions[0]?.tenantId
  for (const item of state.observations) {
    if (
      observations.has(item.observationId) ||
      item.stepNumber >
        Math.max(state.stepNumber, state.pendingStepNumber ?? 0) ||
      item.executionId !== executionId
    )
      fail('Observation binding mismatch')
    observations.add(item.observationId)
    if (item.type !== 'TOOL_RESULT') continue
    if (
      item.source !== 'TOOL' ||
      item.trust !== 'UNTRUSTED' ||
      item.stepNumber < 1
    )
      fail('Invalid tool observation')
    toolSteps.add(item.stepNumber)
    const payload = item.payload as Record<string, unknown>
    if (payload?.completion === 'COMPLETE') {
      succeeded(payload)
      const raw = canonicalizeCompleteJson(payload.output)
      if (
        payload.outputBytes !== Buffer.byteLength(raw) ||
        payload.outputSha256 !== sha(raw)
      )
        fail('Complete output integrity mismatch')
    } else if (payload?.completion === 'UNAVAILABLE') unavailable(payload)
    else failed(payload)
  }
  if (
    ctx.deliveredThroughStep > state.stepNumber ||
    (ctx.deliveredThroughStep !== 0 && !toolSteps.has(ctx.deliveredThroughStep))
  )
    fail('Invalid delivery cursor')
  const admissions = new Map<string, (typeof ctx.decisionAdmissions)[number]>(),
    attempts = new Set<string>()
  let pending: string | null = null
  for (const entry of ctx.decisionAdmissions) {
    if (
      admissions.has(entry.admissionId) ||
      entry.stepNumber > state.stepNumber + 1 ||
      entry.tenantId !== tenantId ||
      entry.executionId !== executionId
    )
      fail('Admission binding mismatch')
    const attempt = `${entry.stepNumber}:${entry.attempt}`
    if (attempts.has(attempt)) fail('Duplicate admission attempt')
    attempts.add(attempt)
    admissions.set(entry.admissionId, entry)
    const m = entry.measurement,
      r = entry.reserved
    if (
      r.modelCalls !== 1 ||
      r.inputTokens !== m.inputUpperBoundTokens ||
      r.outputTokens !== 512 ||
      r.costUsd !== m.costUpperBoundUsd ||
      m.inputUpperBoundTokens + 512 > m.contextWindowTokens
    )
      fail('Invalid admission reservation')
    if (entry.status === 'RESERVED') {
      if (
        pending !== null ||
        entry.actual !== undefined ||
        entry.unknownReason !== undefined ||
        entry.resultSha256 !== undefined
      )
        fail('Invalid pending admission')
      pending = entry.admissionId
    } else if (entry.status === 'SETTLED') {
      if (
        !entry.actual ||
        !entry.resultSha256 ||
        entry.unknownReason !== undefined ||
        entry.actual.modelCalls !== 1 ||
        entry.actual.inputTokens > r.inputTokens ||
        entry.actual.outputTokens > r.outputTokens ||
        entry.actual.costUsd > r.costUsd
      )
        fail('Invalid settled admission')
    } else if (
      !entry.unknownReason ||
      (entry.actual !== undefined &&
        entry.unknownReason !== 'ADMISSION_BREACH') ||
      entry.resultSha256 !== undefined
    )
      fail('Invalid unknown admission')
  }
  if (pending !== ctx.pendingDecisionAdmission)
    fail('Pending admission does not match ledger')
  const accepted = ctx.acceptedDecision
  if (accepted) {
    if (
      accepted.stepNumber !== state.stepNumber + 1 &&
      accepted.stepNumber !== state.stepNumber
    )
      fail('Accepted decision step mismatch')
    if (!validateLoopDecision(accepted.decision).valid || pending !== null)
      fail('Invalid accepted decision')
    const ids = new Set(accepted.decisionAdmissionIds)
    if (ids.size !== accepted.decisionAdmissionIds.length)
      fail('Duplicate accepted receipt')
    for (const admissionId of ids) {
      const entry = admissions.get(admissionId)
      if (
        !entry ||
        entry.status !== 'SETTLED' ||
        entry.stepNumber !== accepted.stepNumber
      )
        fail('Accepted receipt binding mismatch')
    }
    const nativeIds = ctx.decisionAdmissions
      .filter((r) => r.stepNumber === accepted.stepNumber)
      .map((r) => r.admissionId)
    if (
      nativeIds.length !== ids.size ||
      nativeIds.some((admissionId) => !ids.has(admissionId))
    )
      fail('Accepted decision omits native receipt')
    if (
      state.pendingDecision &&
      (state.pendingStepNumber !== accepted.stepNumber ||
        canonicalizeCompleteJson(state.pendingDecision, LIMITS) !==
          canonicalizeCompleteJson(accepted.decision, LIMITS))
    )
      fail('Pending and accepted decisions disagree')
  }
}

function normalizedState(value: unknown): AgentLoopState {
  preflight(value)
  const state = stateSchema(value) as AgentLoopState
  validateState(state)
  canonicalizeCompleteJson(state, LIMITS)
  return state
}

function normalizedUnsigned(value: unknown): UnsignedCheckpoint {
  preflight(value)
  const unsigned = unsignedSchema(value) as UnsignedCheckpoint
  validateState(unsigned.state, unsigned)
  canonicalizeCompleteJson(unsigned, LIMITS)
  if (
    unsigned.state.stepNumber !== unsigned.stepNumber ||
    unsigned.budgetUsage.steps < unsigned.stepNumber
  )
    fail('Checkpoint step mismatch')
  const sum = { modelCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
  let repairs = 0
  for (const r of unsigned.state.toolResultContext!.decisionAdmissions) {
    for (const key of Object.keys(sum) as (keyof typeof sum)[]) {
      sum[key] +=
        r.status === 'SETTLED'
          ? r.actual![key]
          : Math.max(r.reserved[key], r.actual?.[key] ?? 0)
    }
    if (r.purpose === 'REPAIR') repairs++
  }
  for (const key of Object.keys(sum) as (keyof typeof sum)[]) {
    if (unsigned.budgetUsage[key] + (key === 'costUsd' ? 1e-12 : 0) < sum[key])
      fail('Budget does not cover admission ledger')
  }
  if (unsigned.budgetUsage.decisionRepairs < repairs)
    fail('Repair budget does not cover ledger')
  return unsigned
}

export function completeCheckpointDigest(unsigned: UnsignedCheckpoint): string {
  return sha(
    'cvg.checkpoint.v2\n' +
      canonicalizeCompleteJson(normalizedUnsigned(unsigned), LIMITS)
  )
}

export function encodeCompleteCheckpointState(
  state: AgentLoopState
): CompleteCheckpointStorageState {
  const raw = canonicalizeCompleteJson(normalizedState(state), LIMITS)
  const bytes = Buffer.from(raw, 'utf8')
  return {
    storageCodec: 'cvg.checkpoint-state/2',
    encoding: 'base64',
    decodedBytes: bytes.length,
    decodedSha256: sha(bytes),
    data: bytes.toString('base64')
  }
}

/** Reject excessive nesting/node counts before JSON.parse allocates a tree. */
function boundedJsonText(raw: string): void {
  let inString = false,
    escaped = false,
    nodes = 0,
    inAtom = false,
    stringStart = 0
  const stack: (Set<string> | null)[] = []
  const value = (): void => {
    if (stack.length > LIMITS.maxDepth || ++nodes > LIMITS.maxNodes)
      fail('JSON complexity limit')
  }
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') {
        inString = false
        let next = i + 1
        while (next < raw.length && /\s/.test(raw[next]!)) next++
        if (raw[next] === ':') {
          const keys = stack[stack.length - 1]
          if (!keys) fail('Invalid JSON object key')
          const key = JSON.parse(raw.slice(stringStart, i + 1)) as string
          if (keys!.has(key)) fail('Duplicate JSON key')
          keys!.add(key)
          if (keys!.size > LIMITS.maxNodes) fail('JSON node limit')
        } else value()
      }
      continue
    }
    if (char === '"') {
      inString = true
      stringStart = i
      inAtom = false
    } else if (char === '{' || char === '[') {
      value()
      stack.push(char === '{' ? new Set() : null)
      inAtom = false
    } else if (char === '}' || char === ']') {
      stack.pop()
      inAtom = false
    } else if (char === ',' || char === ':' || /\s/.test(char)) inAtom = false
    else if (!inAtom) {
      value()
      inAtom = true
    }
  }
}

/** Bound work before schema normalization. This is a lower-bound measurement,
 * not validation: only the schema may omit an undefined optional field. */
function preflight(value: unknown): void {
  let nodes = 0,
    bytes = 0
  const ancestors = new Set<object>()
  const visit = (input: unknown, depth: number): void => {
    if (input === undefined) return
    if (++nodes > LIMITS.maxNodes || depth > LIMITS.maxDepth)
      fail('Checkpoint complexity limit')
    bytes += typeof input === 'string' ? input.length + 2 : 1
    if (bytes > LIMITS.maxBytes) fail('Checkpoint byte limit')
    if (!input || typeof input !== 'object') return
    if (ancestors.has(input)) fail('Checkpoint cycle')
    ancestors.add(input)
    const array = Array.isArray(input)
    if (array && input.length > LIMITS.maxNodes - nodes)
      fail('Checkpoint node limit')
    const keys = Reflect.ownKeys(input)
    if (keys.length > LIMITS.maxNodes + 1) fail('Checkpoint node limit')
    for (const key of keys) {
      if (array && key === 'length') continue
      if (typeof key !== 'string') fail('Checkpoint symbol')
      const descriptor = Object.getOwnPropertyDescriptor(input, key)
      if (!descriptor || !('value' in descriptor)) fail('Checkpoint accessor')
      if (descriptor.value === undefined) continue
      if (!array) bytes += (key as string).length + 3
      if (bytes > LIMITS.maxBytes) fail('Checkpoint byte limit')
      visit(descriptor.value, depth + 1)
    }
    ancestors.delete(input)
  }
  visit(value, 0)
}

export function decodeCompleteCheckpointState(raw: unknown): AgentLoopState {
  try {
    if (typeof raw === 'string') {
      if (Buffer.byteLength(raw) > COMPLETE_CHECKPOINT_STORAGE_MAX_BYTES)
        fail('Physical checkpoint limit')
      boundedJsonText(raw)
      raw = JSON.parse(raw) as unknown
    }
    const wrapper = record({
      storageCodec: one('cvg.checkpoint-state/2'),
      encoding: one('base64'),
      decodedBytes: integer,
      decodedSha256: digest,
      data: str
    })(raw) as CompleteCheckpointStorageState
    if (
      wrapper.decodedBytes > COMPLETE_CHECKPOINT_MAX_BYTES ||
      wrapper.data.length > COMPLETE_CHECKPOINT_DATA_MAX_CHARS
    )
      fail('Physical checkpoint limit')
    if (
      Buffer.byteLength(
        canonicalizeCompleteJson(wrapper, {
          ...LIMITS,
          maxBytes: COMPLETE_CHECKPOINT_STORAGE_MAX_BYTES
        })
      ) > COMPLETE_CHECKPOINT_STORAGE_MAX_BYTES
    )
      fail()
    if (
      wrapper.data.length !== 4 * Math.ceil(wrapper.decodedBytes / 3) ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(wrapper.data)
    )
      fail('Invalid base64')
    const bytes = Buffer.from(wrapper.data, 'base64')
    if (
      bytes.length !== wrapper.decodedBytes ||
      bytes.toString('base64') !== wrapper.data ||
      sha(bytes) !== wrapper.decodedSha256
    )
      fail('Physical checkpoint integrity mismatch')
    const text = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: true
    }).decode(bytes)
    boundedJsonText(text)
    const state = normalizedState(JSON.parse(text) as unknown)
    if (canonicalizeCompleteJson(state, LIMITS) !== text)
      fail('Noncanonical checkpoint state')
    return state
  } catch (error) {
    if (error instanceof CheckpointError) throw error
    fail('Malformed complete checkpoint encoding')
  }
}

/** CAS transition validation; cannot erase retained observations or settled receipts. */
export function validateCompleteCheckpointTransition(
  current: ExecutionCheckpoint | null,
  next: ExecutionCheckpoint
): void {
  if (!current) return
  if (current.checkpointId === next.checkpointId)
    fail('Checkpoint ID must change on every CAS')
  const fromLegacy =
    current.checkpointVersion === 1 &&
    next.checkpointVersion === 2 &&
    !current.state.observations.some((o) => o.type === 'TOOL_RESULT')
  if (current.checkpointVersion !== next.checkpointVersion && !fromLegacy)
    fail('Checkpoint mode cannot change through CAS')
  if (next.checkpointVersion !== 2) return
  if (
    current.runtimeProfile !== next.runtimeProfile ||
    current.runtimeVersion !== next.runtimeVersion ||
    current.orchestratorVersion !== next.orchestratorVersion ||
    current.state.capabilityFingerprint !== next.state.capabilityFingerprint ||
    current.state.goal !== next.state.goal ||
    next.stepNumber < current.stepNumber ||
    next.state.toolResultContext!.deliveredThroughStep <
      (current.state.toolResultContext?.deliveredThroughStep ?? 0)
  )
    fail('Checkpoint binding or cursor changed')
  if (fromLegacy) return
  const accepted = current.state.toolResultContext!.acceptedDecision
  if (
    accepted &&
    next.stepNumber < accepted.stepNumber &&
    canonicalizeCompleteJson(accepted, LIMITS) !==
      canonicalizeCompleteJson(
        next.state.toolResultContext!.acceptedDecision,
        LIMITS
      )
  )
    fail('Accepted decision cannot change before its step completes')
  const nextObservations = new Map(
    next.state.observations.map((o) => [o.observationId, o])
  )
  for (const old of current.state.observations) {
    if (
      old.type === 'TOOL_RESULT' &&
      canonicalizeCompleteJson(
        nextObservations.get(old.observationId),
        LIMITS
      ) !== canonicalizeCompleteJson(old, LIMITS)
    )
      fail('Tool observation retention violated')
  }
  const receipts = new Map(
    next.state.toolResultContext!.decisionAdmissions.map((r) => [
      r.admissionId,
      r
    ])
  )
  for (const old of current.state.toolResultContext!.decisionAdmissions) {
    const updated = receipts.get(old.admissionId)
    if (!updated) fail('Admission retention violated')
    if (old.status === 'RESERVED') {
      const {
        status: _s,
        actual: _a,
        unknownReason: _u,
        resultSha256: _h,
        ...immutable
      } = updated!
      const { status: _old, ...previous } = old
      void _s
      void _a
      void _u
      void _h
      void _old
      if (
        canonicalizeCompleteJson(immutable, LIMITS) !==
        canonicalizeCompleteJson(previous, LIMITS)
      )
        fail('Admission binding changed')
    } else if (
      canonicalizeCompleteJson(old, LIMITS) !==
      canonicalizeCompleteJson(updated, LIMITS)
    )
      fail('Settled admission changed')
  }
}
