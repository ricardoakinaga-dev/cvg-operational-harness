import { createHash } from 'node:crypto'
import { redactSensitiveText, CorrelationIdSchema } from '@cvg/shared'
import {
  TenantIdSchema,
  AgentIdSchema,
  AgentVersionIdSchema,
  TraceIdSchema
} from './ids.ts'
import {
  type BudgetUsage,
  type ExecutionCheckpoint,
  type RuntimeInput,
  type RuntimeResult,
  type StopReason
} from '@cvg/harness-contracts'
import { composeCapabilities, validateCheckpointIntegrity } from '@cvg/harness'
import type { ControlledKernelCompositionPorts } from './controlled-kernel-adapters.ts'
import type {
  AgentConfig,
  AgentVersionRecord,
  TestRunTrace,
  TraceSpanName
} from './contracts.ts'
import type {
  AgentExecutionActor,
  ControlledAgentExecutionInput
} from './test-lab.ts'
import type { CapabilityGateway } from './plugin-gateway.ts'
import type {
  CapabilityApprovalRecord,
  CapabilityApprovalVerificationInput
} from './approval-authority.ts'
import { canonicalizeCapabilityInput } from './approval-authority.ts'
import {
  gatewayCore,
  reviewedDescriptor,
  type PreparedCapabilityCommand
} from './plugin-execution-core.ts'
import {
  controlledRegistration,
  InvocationEvidenceState
} from './controlled-kernel-adapters.ts'
import { composePrompt } from './prompt-composer.ts'
import { resolveControlledModelProvider } from './model-provider.ts'
import type { ControlledAttempt } from './controlled-execution-plan.ts'
import type { enforceControlledOutput } from './output-policy.ts'

export const CONTROLLED_PUBLISHED_ADAPTER = 'controlled-published-v1' as const
/** Only non-effect reconciliation; a pending earlier phase/fault is never cleared. */
export const CONTROLLED_SETTLEMENT_PHASES = Object.freeze([
  'step.recordStep',
  'step.saveCheckpoint',
  'step.listSteps',
  'audit.step.completed',
  'audit.observation.recorded',
  'audit.runtime.completed',
  'audit.runtime.stopped',
  'audit.runtime.paused',
  'log.turn/end',
  'log.tool/result',
  'callback.tool',
  'effects.finished',
  'journal.confirm',
  'journal.fail',
  'journal.markUncertain',
  'journal.get',
  'approval.settlement',
  'callback.platform.tool.after',
  'callback.platform.model.error',
  'callback.platform.tool.error'
] as const)
export interface ControlledKernelFence {
  tenantId: string
  executionId: string
  workerId: string
  attempt: number
}
export interface ControlledKernelIdentity extends ControlledKernelFence {
  correlationId: string
  traceId: string
  inboundMessageId: string
  conversationId: string
  sessionId: string
  agentId: string
  versionId: string
  requestDigest: string
  outboxId: string
  outerAttempt: number
  outerWorkerId: string
  outerAttemptRowId: string
}
export interface ControlledPhaseRef {
  phaseId: string
  phaseType: string
  phaseRevision: number
  attempt: number
  inputDigest: string
}
export interface ControlledEvidenceAck {
  sequence: number
  hash: string
}
export interface ControlledApprovalReceipt extends ControlledEvidenceAck {
  receiptId: string
  approvalId: string
  inputHash: string
  executionRef: string
  consumptionAuditId: string
  phaseId: string
  tenantId: string
  executionId: string
  operationKey: string
  stepId: string
  stepNumber: number
  workerId: string
  attempt: number
  outboxId: string
  outerAttempt: number
  outerWorkerId: string
  outerAttemptRowId: string
  requestDigest: string
  fingerprint: string
  agentId: string
  versionId: string
  actorId: string
  consumedAt: string
}
export interface ControlledBoundApprovalConsumption {
  record: CapabilityApprovalRecord
  receipt: ControlledApprovalReceipt
}
export interface ControlledBoundApprovalVerification extends CapabilityApprovalVerificationInput {
  executionRef: string
  operationKey: string
  stepId: string
  stepNumber: number
  requestDigest: string
  fingerprint: string
}
export interface ControlledResumeSeal extends ControlledEvidenceAck {
  sealId: string
  stateRevision: number
}
export interface ControlledDispatchPermit {
  permitId: string
  tenantId: string
  executionId: string
  workerId: string
  attempt: number
  operationKey: string
  inputHash: string
  fingerprint: string
  expiresAt: string
  /** Commit-time minimum of inner/queue/outer leases and the kernel deadline. */
  leaseUntil: string
  phaseId: string
}
export interface ControlledCanonicalCommand {
  execution: Omit<PreparedCapabilityCommand['execution'], 'config'>
  canonical: string
  inputHash: string
  correlationId: PreparedCapabilityCommand['correlationId']
  descriptorFingerprint: string
  output?: PreparedCapabilityCommand['output']
}
export interface ControlledSerializedAttempt extends Omit<
  ControlledAttempt,
  'command' | 'permit'
> {
  command: ControlledCanonicalCommand
}
export interface ControlledPublishedSnapshot {
  schema: 'controlled-published-state-v1'
  adapterVersion: typeof CONTROLLED_PUBLISHED_ADAPTER
  requestDigest: string
  fingerprint: string
  executionId: string
  tenantId: string
  traceId: string
  preparedDigest: string
  expiresAt: string
  output: ReturnType<typeof enforceControlledOutput> | null
  outputDigest: string
  providerInvoked: boolean
  outputAllowsTools: boolean
  names: string[]
  planSealed: boolean
  planOutcome: 'ready' | 'suppressed' | 'rejected'
  planDigest: string
  expectedStep: number
  nextPlannerStep: number
  finalIssued: boolean
  scopeRejected: boolean
  attempts: ControlledSerializedAttempt[]
  fault: {
    phase: string
    code: 'evidence_unavailable'
    bodyStarted: boolean
  } | null
  dispatchClosed: boolean
  stop: StopReason | null
  budgetUsage: BudgetUsage
  safePoint: 'S1' | 'S2'
  durationTotals: Partial<Record<TraceSpanName, number>>
}
export interface ControlledPublishedState extends ControlledResumeSeal {
  phaseState: 'IDLE_SEALED' | 'OPEN' | 'FAULTED' | 'CLOSED'
  snapshot: ControlledPublishedSnapshot | null
  checkpoint: ExecutionCheckpoint | null
  closedTrace: TestRunTrace | null
  runtimeResult: RuntimeResult | null
  sealCheckpointDigest: string | null
  sealStateDigest: string | null
  sealedThroughSequence: number
  phaseRevision: number
  openPhase: ControlledPhaseRef | null
  consumedSealId: string | null
}
export interface ControlledPublishedPrepared {
  schema: 'controlled-published-prepared-v1'
  requestDigest: string
  fingerprint: string
  message: string
  history: string[]
  promptWithHistory: string
  intent: string
  policy: TestRunTrace['policy'][number]
  risk: NonNullable<TestRunTrace['risk']>
  response: TestRunTrace['response']
  sourceIds: readonly string[]
  configDigest: string
}
export interface ControlledKernelContinuation {
  startPrepared(
    fence: ControlledKernelFence,
    prepared: ControlledPublishedPrepared,
    runtimeInput: RuntimeInput
  ): Promise<{ preparedDigest: string; startedAt: string; expiresAt: string }>
  beginPhase(
    fence: ControlledKernelFence,
    expectedSealId: string,
    phaseType: string,
    inputDigest: string
  ): Promise<ControlledPhaseRef>
  ackPhase(
    fence: ControlledKernelFence,
    phase: ControlledPhaseRef,
    payload: unknown
  ): Promise<ControlledEvidenceAck>
  saveResumePoint(
    fence: ControlledKernelFence,
    snapshot: ControlledPublishedSnapshot,
    checkpoint: ExecutionCheckpoint,
    evidenceSequence: number,
    expectedStateRevision: number
  ): Promise<ControlledResumeSeal>
  poison(
    fence: ControlledKernelFence,
    phase: string,
    reason: 'evidence_unavailable'
  ): Promise<void>
  close(
    fence: ControlledKernelFence,
    snapshot: ControlledPublishedSnapshot | null,
    runtimeResult: RuntimeResult,
    trace: TestRunTrace,
    expectedStateRevision: number
  ): Promise<void>
}
export interface ControlledKernelHostContext {
  /** Trusted cancellation-only host; never selected from request/config data. */
  cancelled?: boolean
  identity: ControlledKernelIdentity
  signal: AbortSignal
  expiresAt: string | null
  ports: ControlledKernelCompositionPorts
  state: ControlledPublishedState
  continuation: ControlledKernelContinuation
  approvalConsumption: {
    consumeBoundApproval(
      fence: ControlledKernelFence,
      phase: ControlledPhaseRef,
      verification: ControlledBoundApprovalVerification
    ): Promise<ControlledBoundApprovalConsumption | null>
  }
  admission: {
    readGuards(
      fence: ControlledKernelFence
    ): Promise<{ paused: boolean; cancelled: boolean; expiresAt: string }>
    prepareDispatch(
      fence: ControlledKernelFence,
      phase: ControlledPhaseRef,
      input: { operationKey: string; inputHash: string; fingerprint: string }
    ): Promise<ControlledDispatchPermit>
  }
  lifecycle: {
    assertActive(): void
    requestStop(reason: 'finalizing'): void
    stopAndJoin(): Promise<void>
  }
}
export interface ControlledPublishedAdmissionInput extends Pick<
  ControlledAgentExecutionInput,
  | 'tenantId'
  | 'agentId'
  | 'versionId'
  | 'message'
  | 'history'
  | 'executionMode'
  | 'requireCapabilityApproval'
> {
  executionId: string
  traceId: string
  correlationId: string
  inboundMessageId: string
  context: { conversationId: string; sessionId: string }
}
export interface ControlledPublishedAdmission {
  input: ControlledPublishedAdmissionInput
  requestDigest: string
  fingerprint: string
  budget: RuntimeInput['budget']
  runtime: RuntimeInput
}

export function controlledCanonicalJson(
  value: unknown,
  maxBytes = 262144
): string {
  // Only JSON data crosses this boundary; reject lossy conversion and executable objects.
  let nodes = 0
  const visit = (v: unknown, depth: number): void => {
    if (++nodes > 16384) throw new Error('controlled_state_bounds')
    if (depth > 48) throw new Error('controlled_state_bounds')
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return
    if (typeof v === 'number' && Number.isFinite(v)) return
    if (
      !v ||
      typeof v !== 'object' ||
      (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype)
    )
      throw new Error('controlled_state_json')
    if (Object.getOwnPropertySymbols(v).length)
      throw new Error('controlled_state_json')
    for (const descriptor of Object.values(
      Object.getOwnPropertyDescriptors(v)
    )) {
      if (descriptor.get || descriptor.set)
        throw new Error('controlled_state_accessor')
      visit(descriptor.value, depth + 1)
    }
  }
  visit(value, 0)
  const canonical = canonicalizeCapabilityInput(value)
  if (Buffer.byteLength(canonical, 'utf8') > maxBytes)
    throw new Error('controlled_state_bounds')
  return canonical
}
export function controlledDigest(value: unknown): string {
  return `sha256-${createHash('sha256').update(controlledCanonicalJson(value)).digest('hex')}`
}
export function controlledInventory(
  config: AgentConfig,
  gateway: CapabilityGateway | undefined
) {
  const core = gatewayCore(gateway)
  return config.plugins
    .flatMap((binding) =>
      !binding.enabled || !binding.version
        ? []
        : binding.allowedTools.flatMap((name) => {
            const resolved = core?.resolve(config, name)
            const descriptor = resolved && reviewedDescriptor(resolved)
            return descriptor ? [{ resolved, descriptor }] : []
          })
    )
    .filter(
      (item, index, all) =>
        all.findIndex(
          (other) =>
            other.descriptor.id === item.descriptor.id &&
            other.descriptor.version === item.descriptor.version
        ) === index
    )
}
export function prepareControlledPublishedAdmission(args: {
  version: AgentVersionRecord
  input: ControlledPublishedAdmissionInput
  actor: AgentExecutionActor
  gateway: CapabilityGateway
}): ControlledPublishedAdmission {
  const { version, actor, gateway } = args
  const original = args.input
  if (
    version.agentId !== original.agentId ||
    version.tenantId !== original.tenantId ||
    version.id !== original.versionId ||
    !original.message?.trim() ||
    original.message.trim().length > 4000 ||
    !Array.isArray(original.history) ||
    original.history.length > 50 ||
    original.history.some((x) => typeof x !== 'string' || x.length > 4000)
  )
    throw new Error('controlled_admission_binding')
  TenantIdSchema.parse(original.tenantId)
  AgentIdSchema.parse(original.agentId)
  AgentVersionIdSchema.parse(original.versionId)
  TraceIdSchema.parse(original.traceId)
  CorrelationIdSchema.parse(original.correlationId)
  if (
    !/^exec_[0-9a-f-]{36}$/.test(original.executionId) ||
    !['TEST_LAB', 'CONTROLLED_RUNTIME'].includes(original.executionMode) ||
    !Array.isArray(actor.permissions) ||
    actor.permissions.some((p) => typeof p !== 'string' || p.length > 200)
  )
    throw new Error('controlled_admission_identity')
  for (const id of [
    original.tenantId,
    original.agentId,
    original.versionId,
    original.executionId,
    original.traceId,
    original.correlationId,
    original.inboundMessageId,
    original.context?.conversationId,
    original.context?.sessionId,
    actor.id,
    actor.role
  ])
    if (typeof id !== 'string' || !id.trim() || id.length > 500)
      throw new Error('controlled_admission_identity')
  resolveControlledModelProvider(version.config.model)
  const input: ControlledPublishedAdmissionInput = {
    tenantId: original.tenantId,
    agentId: original.agentId,
    versionId: original.versionId,
    executionId: original.executionId,
    traceId: original.traceId,
    correlationId: original.correlationId,
    inboundMessageId: original.inboundMessageId,
    executionMode: original.executionMode,
    ...(original.requireCapabilityApproval === undefined
      ? {}
      : { requireCapabilityApproval: original.requireCapabilityApproval }),
    message: redactSensitiveText(original.message.trim()),
    history: original.history.map((x) => redactSensitiveText(x)),
    context: {
      conversationId: original.context.conversationId,
      sessionId: original.context.sessionId
    }
  }
  controlledCanonicalJson(input)
  const inventory = controlledInventory(version.config, gateway)
  if (inventory.length > 1 || !gatewayCore(gateway))
    throw new Error('controlled_admission_inventory')
  // Descriptor projection uses exactly the same composition helper as the live kernel.
  const dummy = new InvocationEvidenceState(
    [],
    { isPaused: () => false },
    input.tenantId
  )
  const fingerprint = composeCapabilities(
    inventory.map(({ descriptor }) =>
      controlledRegistration(
        () => undefined,
        descriptor,
        dummy,
        () => '',
        (operation) => operation()
      )
    )
  ).fingerprint
  const prompt = composePrompt(version.config).text
  const promptWithHistory = input.history.length
    ? `${prompt}\n\nConversation history:\n${input.history.join('\n')}`
    : prompt
  const budget = {
    maxSteps: inventory.length + 2,
    maxModelCalls: 1,
    maxToolCalls: inventory.length,
    maxDurationMs: version.config.model.timeoutMs,
    maxCostUsd: 0,
    maxTokens:
      Math.ceil(redactSensitiveText(promptWithHistory).length / 4) + 1000,
    maxKnowledgeCalls: 0,
    maxReplans: 0,
    maxDecisionRepairs: 0,
    maxVerificationCalls: 2
  }
  const requestDigest = controlledDigest({
    adapter: CONTROLLED_PUBLISHED_ADAPTER,
    tenantId: input.tenantId,
    inboundMessageId: input.inboundMessageId,
    context: input.context,
    agentId: input.agentId,
    versionId: input.versionId,
    configDigest: controlledDigest(version.config),
    fingerprint,
    message: input.message,
    history: input.history,
    actor: {
      id: actor.id,
      role: actor.role,
      permissions: [...actor.permissions]
    },
    executionMode: input.executionMode,
    requireCapabilityApproval: input.requireCapabilityApproval ?? false,
    budget
  })
  const runtime: RuntimeInput = {
    agent: {
      id: input.agentId as RuntimeInput['agent']['id'],
      version:
        `${version.id}:v${version.version}` as RuntimeInput['agent']['version'],
      objective: 'Controlled configured response',
      instructions: [],
      skills: [],
      tools: inventory.map((x) => x.descriptor.id),
      policies: [version.config.policies.version]
    },
    tenantId: input.tenantId as RuntimeInput['tenantId'],
    executionId: input.executionId,
    capabilityFingerprint: fingerprint,
    traceId: input.traceId as RuntimeInput['traceId'],
    correlationId: input.correlationId as RuntimeInput['correlationId'],
    conversationId: input.context
      .conversationId as RuntimeInput['conversationId'],
    sessionId: input.context.sessionId as RuntimeInput['sessionId'],
    userMessage: input.message,
    runtimeProfile: 'iterative',
    context: {
      values: { adapterVersion: CONTROLLED_PUBLISHED_ADAPTER, requestDigest },
      sourceIds: [],
      capturedAt: '1970-01-01T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '1970-01-01T00:00:00.000Z' },
    budget
  }
  controlledCanonicalJson(runtime)
  return { input, requestDigest, fingerprint, budget, runtime }
}

export function validateControlledHost(
  host: ControlledKernelHostContext,
  input: ControlledAgentExecutionInput
): void {
  const i = host.identity
  if (
    !i ||
    i.tenantId !== input.tenantId ||
    i.agentId !== input.agentId ||
    i.versionId !== input.versionId ||
    i.traceId !== input.traceId ||
    i.conversationId !== input.context?.conversationId ||
    i.sessionId !== input.context?.sessionId ||
    !Number.isSafeInteger(i.attempt) ||
    i.attempt < (host.cancelled === true ? 0 : 1) ||
    !Number.isSafeInteger(i.outerAttempt) ||
    i.outerAttempt < 1 ||
    !/^[1-9][0-9]*$/.test(i.outerAttemptRowId) ||
    !/^sha256-[a-f0-9]{64}$/.test(i.requestDigest)
  )
    throw new Error('controlled_host_identity')
  if (host.cancelled !== undefined && typeof host.cancelled !== 'boolean')
    throw new Error('controlled_host_identity')
  for (const key of [
    'executionId',
    'workerId',
    'correlationId',
    'traceId',
    'inboundMessageId',
    'outboxId',
    'outerWorkerId'
  ] as const)
    if (typeof i[key] !== 'string' || !i[key].trim() || i[key].length > 500)
      throw new Error('controlled_host_identity')
  if (
    !host.signal ||
    typeof host.signal.addEventListener !== 'function' ||
    typeof host.signal.aborted !== 'boolean' ||
    !host.state ||
    !host.ports ||
    !host.continuation ||
    !host.admission ||
    !host.lifecycle ||
    !host.approvalConsumption
  )
    throw new Error('controlled_host_ports')
  const methods: [unknown, string[]][] = [
    [
      host.continuation,
      [
        'startPrepared',
        'beginPhase',
        'ackPhase',
        'saveResumePoint',
        'poison',
        'close'
      ]
    ],
    [host.admission, ['readGuards', 'prepareDispatch']],
    [host.lifecycle, ['assertActive', 'requestStop', 'stopAndJoin']],
    [host.approvalConsumption, ['consumeBoundApproval']],
    [host.ports.audit, ['append']],
    [host.ports.log, ['append']],
    [host.ports.effects, ['started', 'finished']],
    [
      host.ports.stepStore,
      ['recordStep', 'listSteps', 'loadCheckpoint', 'saveCheckpoint']
    ],
    [
      host.ports.effectJournal,
      ['reserve', 'markStarted', 'confirm', 'fail', 'markUncertain', 'get']
    ],
    [host.ports.telemetry, ['record']],
    [host.ports.pause, ['isPaused']]
  ]
  for (const [port, names] of methods)
    for (const name of names)
      if (!port || typeof Reflect.get(port as object, name) !== 'function')
        throw new Error('controlled_host_ports')
  if (host.expiresAt !== null && !Number.isFinite(Date.parse(host.expiresAt)))
    throw new Error('controlled_host_deadline')
  const state = host.state
  if (
    !['IDLE_SEALED', 'OPEN', 'FAULTED', 'CLOSED'].includes(state.phaseState) ||
    !state.sealId ||
    !/^sha256-[a-f0-9]{64}$/.test(state.hash) ||
    !Number.isSafeInteger(state.sequence) ||
    state.sequence < 0 ||
    state.sequence > 256 ||
    !Number.isSafeInteger(state.stateRevision) ||
    state.stateRevision < 0
  )
    throw new Error('controlled_host_state')
  if (
    !Number.isSafeInteger(state.phaseRevision) ||
    state.phaseRevision < 0 ||
    !Number.isSafeInteger(state.sealedThroughSequence) ||
    state.sealedThroughSequence < 0 ||
    state.sealedThroughSequence > state.sequence
  )
    throw new Error('controlled_host_cursor')
  if (
    state.phaseState === 'IDLE_SEALED' &&
    (state.openPhase !== null ||
      state.consumedSealId !== null ||
      state.sequence > state.sealedThroughSequence + 1 ||
      (state.snapshot === null && state.checkpoint !== null))
  )
    throw new Error('controlled_host_unsealed_tail')
}

export function validateControlledSnapshot(
  value: ControlledPublishedSnapshot,
  host: Pick<ControlledKernelHostContext, 'identity' | 'state' | 'expiresAt'>,
  fingerprint: string,
  preparedDigest: string
): ControlledPublishedSnapshot {
  controlledCanonicalJson(value)
  const s: ControlledPublishedSnapshot = JSON.parse(
    controlledCanonicalJson(value)
  )
  const i = host.identity
  const booleans = [
    s.providerInvoked,
    s.outputAllowsTools,
    s.planSealed,
    s.finalIssued,
    s.scopeRejected,
    s.dispatchClosed
  ]
  if (
    booleans.some((v) => typeof v !== 'boolean') ||
    !Array.isArray(s.names) ||
    !Array.isArray(s.attempts) ||
    s.names.some((n) => typeof n !== 'string' || n.length > 200) ||
    !s.durationTotals ||
    Object.values(s.durationTotals).some((n) => !Number.isFinite(n) || n! < 0)
  )
    throw new Error('controlled_snapshot_schema')
  if (
    s.schema !== 'controlled-published-state-v1' ||
    s.adapterVersion !== CONTROLLED_PUBLISHED_ADAPTER ||
    s.requestDigest !== i.requestDigest ||
    s.fingerprint !== fingerprint ||
    s.preparedDigest !== preparedDigest ||
    s.executionId !== i.executionId ||
    s.tenantId !== i.tenantId ||
    s.traceId !== i.traceId ||
    s.expiresAt !== host.expiresAt ||
    !s.planSealed ||
    !['ready', 'suppressed', 'rejected'].includes(s.planOutcome) ||
    s.fault ||
    s.dispatchClosed ||
    s.finalIssued ||
    s.stop !== null ||
    !s.providerInvoked ||
    !s.output ||
    s.outputDigest !== controlledDigest(s.output) ||
    s.planDigest !==
      controlledDigest({
        names: s.names,
        attempts: s.attempts.map((a) => a.command),
        outcome: s.planOutcome
      }) ||
    s.attempts.length > 1 ||
    new Set(s.names).size !== s.names.length ||
    !['S1', 'S2'].includes(s.safePoint)
  )
    throw new Error('controlled_snapshot_binding')
  const c = host.state.checkpoint
  if (c)
    validateCheckpointIntegrity(c, {
      tenantId: i.tenantId,
      executionId: i.executionId
    })
  if (
    host.state.sealStateDigest !== controlledDigest(s) ||
    !c ||
    host.state.sealCheckpointDigest !==
      controlledDigest(JSON.parse(JSON.stringify(c)))
  )
    throw new Error('controlled_snapshot_seal')
  if (
    !c ||
    c.tenantId !== i.tenantId ||
    c.executionId !== i.executionId ||
    c.digest === '' ||
    c.state.pendingDecision ||
    c.state.stopReason ||
    c.stepNumber !== c.state.stepNumber ||
    s.expectedStep !== c.stepNumber + 1 ||
    s.nextPlannerStep !== s.expectedStep ||
    controlledCanonicalJson(c.budgetUsage) !==
      controlledCanonicalJson(s.budgetUsage) ||
    c.budgetUsage.modelCalls !== 1 ||
    c.budgetUsage.toolCalls > 1 ||
    c.budgetUsage.costUsd !== 0 ||
    c.state.capabilityFingerprint !== fingerprint
  )
    throw new Error('controlled_snapshot_checkpoint')
  if (
    s.safePoint === 'S1' &&
    (c.stepNumber !== 1 ||
      s.expectedStep !== 2 ||
      s.attempts.some(
        (a) =>
          a.phase !== 'PENDING' ||
          a.attempted ||
          a.policyAllowed ||
          a.approvalConsumed ||
          a.resultAcknowledged
      ))
  )
    throw new Error('controlled_snapshot_s1')
  if (
    s.safePoint === 'S2' &&
    (c.stepNumber !== 2 ||
      s.attempts.length !== 1 ||
      s.attempts.some(
        (a) =>
          !a.resultAcknowledged ||
          !a.logAcknowledged ||
          !a.callbackAcknowledged ||
          !a.operationKey ||
          !a.evidenceRefs?.length ||
          a.command.output?.status !== 'succeeded'
      ))
  )
    throw new Error('controlled_snapshot_s2')
  for (const a of s.attempts) {
    if (
      [
        a.closed,
        a.policyAllowed,
        a.approvalRequired,
        a.approvalConsumed,
        a.resultAcknowledged,
        a.logAcknowledged,
        a.callbackAcknowledged,
        a.attempted,
        a.denied
      ].some((v) => typeof v !== 'boolean') ||
      !['PENDING', 'ENTERED', 'CLOSED_WITHOUT_ENTRY'].includes(a.phase) ||
      a.closed ||
      a.denied ||
      a.cause !== null
    )
      throw new Error('controlled_snapshot_attempt')
    if (
      'config' in a.command.execution ||
      'approval' in a.command.execution ||
      'onAudit' in a.command.execution ||
      'permit' in a
    )
      throw new Error('controlled_snapshot_authority')
    if (
      a.operationKey !== undefined &&
      a.operationKey !== `${i.executionId}:s2:${a.command.execution.toolName}`
    )
      throw new Error('controlled_snapshot_operation')
    for (const r of a.evidenceRefs ?? [])
      if (
        !r.phaseId ||
        !r.phaseType ||
        !Number.isSafeInteger(r.sequence) ||
        r.sequence < 1 ||
        r.sequence > host.state.sealedThroughSequence ||
        !/^sha256-[a-f0-9]{64}$/.test(r.hash)
      )
        throw new Error('controlled_snapshot_receipt')
    if (
      a.approvalConsumed &&
      (!a.approvalReceipt ||
        a.approvalReceipt.approvalId === '' ||
        a.approvalReceipt.executionId !== i.executionId ||
        a.approvalReceipt.tenantId !== i.tenantId ||
        a.approvalReceipt.inputHash !== a.command.inputHash ||
        !a.approvalReceipt.receiptId)
    )
      throw new Error('controlled_snapshot_approval')
    if (s.safePoint === 'S2') {
      const commandRequiresApproval =
        a.command.execution.requireApproval === true ||
        a.command.execution.policy.decision === 'requires_approval'
      if (commandRequiresApproval && !a.approvalRequired)
        throw new Error('controlled_snapshot_s2_approval_requirement')
      const required = [
        'dispatch.admit',
        'log.tool/result',
        'callback.tool',
        'effects.finished',
        'journal.confirm',
        'step.recordStep',
        'audit.step.completed'
      ]
      if (a.approvalRequired) required.push('approval.settlement')
      if (
        required.some(
          (type) => !a.evidenceRefs?.some((ref) => ref.phaseType === type)
        ) ||
        (a.approvalRequired && !a.approvalConsumed)
      )
        throw new Error('controlled_snapshot_s2_receipts')
    }
  }
  return s
}

/** One attempt-local owner. A timed-out metadata write cannot reopen this owner. */
export class ControlledContinuationRuntime {
  seal: ControlledResumeSeal
  preparedDigest = ''
  expiresAt = 0
  closed = false
  fault: string | null = null
  activePhase: ControlledPhaseRef | null = null
  lastAck: { phase: ControlledPhaseRef; ack: ControlledEvidenceAck } | null =
    null
  private joined: Promise<void> | null = null
  private finalizationDeadline = 0
  private phaseRevision: number
  constructor(readonly host: ControlledKernelHostContext) {
    this.phaseRevision = host.state.phaseRevision
    this.seal = {
      sealId: host.state.sealId,
      stateRevision: host.state.stateRevision,
      sequence: host.state.sequence,
      hash: host.state.hash
    }
  }
  assertDispatch(): void {
    if (
      this.fault ||
      this.closed ||
      this.host.signal.aborted ||
      !this.expiresAt ||
      Date.now() >= this.expiresAt
    )
      throw new Error('controlled_dispatch_closed')
    this.host.lifecycle.assertActive()
  }
  closeLocal(): void {
    if (this.closed) return
    this.closed = true
    this.finalizationDeadline = Math.max(this.expiresAt, Date.now() + 200)
    this.host.lifecycle.requestStop('finalizing')
  }
  async bounded<T>(
    operation: () => T | PromiseLike<T>,
    settlement = false,
    preparationMs?: number
  ): Promise<T> {
    const deadline =
      preparationMs === undefined
        ? settlement
          ? this.finalizationDeadline
          : this.expiresAt
        : Date.now() + preparationMs
    const ms = deadline - Date.now()
    if (!Number.isFinite(ms) || ms <= 0)
      throw new Error('controlled_phase_deadline')
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('controlled_phase_deadline')),
            ms
          )
        })
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  async join(): Promise<void> {
    this.closeLocal()
    this.joined ??= this.host.lifecycle.stopAndJoin()
    // Renewal SQL/cleanup is always joined, never detached by a timeout race.
    await this.joined
  }
  async poison(phase: string): Promise<void> {
    this.fault ??= phase
    this.closeLocal()
    try {
      await this.join()
      await this.bounded(
        () =>
          this.host.continuation.poison(
            this.host.identity,
            phase,
            'evidence_unavailable'
          ),
        true
      )
    } catch {
      /* OPEN is the durable veto if poison is unavailable. */
    }
  }
  async evaluate<T>(operation: () => T | PromiseLike<T>): Promise<T> {
    return this.run('completion.evaluate', {}, operation, false, false, true)
  }
  async finishEvaluation(
    operation: () => void | PromiseLike<void>,
    payload: unknown
  ): Promise<void> {
    const phase = this.activePhase
    if (!phase || phase.phaseType !== 'completion.evaluate')
      throw new Error('controlled_evaluation_phase')
    try {
      this.assertDispatch()
      await this.bounded(operation)
      this.assertDispatch()
      const ack = await this.bounded(() =>
        this.host.continuation.ackPhase(this.host.identity, phase, payload)
      )
      if (
        !Number.isSafeInteger(ack.sequence) ||
        ack.sequence <= this.seal.sequence ||
        !/^sha256-[a-f0-9]{64}$/.test(ack.hash)
      )
        throw new Error('controlled_phase_ack')
      this.seal = { ...this.seal, ...ack }
      this.lastAck = { phase, ack }
      this.activePhase = null
    } catch {
      await this.poison('completion.evaluate')
      throw new Error('controlled_evaluation_unavailable')
    }
  }
  async run<T>(
    type: string,
    input: unknown,
    operation: (phase: ControlledPhaseRef) => T | PromiseLike<T>,
    settlement = false,
    guard = false,
    deferAck = false
  ): Promise<T> {
    let phase: ControlledPhaseRef | null = null
    try {
      if (settlement) {
        this.closeLocal()
        if (!(CONTROLLED_SETTLEMENT_PHASES as readonly string[]).includes(type))
          throw new Error('controlled_settlement_only')
        await this.join()
      } else {
        this.assertDispatch()
        if (this.seal.sequence >= 248)
          throw new Error('controlled_evidence_quota')
      }
      if (this.activePhase && !settlement)
        throw new Error('controlled_phase_nested')
      phase = await this.bounded(
        () =>
          this.host.continuation.beginPhase(
            this.host.identity,
            this.seal.sealId,
            type,
            controlledDigest(input)
          ),
        settlement
      )
      if (
        !phase.phaseId ||
        phase.phaseType !== type ||
        phase.attempt !== this.host.identity.attempt ||
        phase.inputDigest !== controlledDigest(input) ||
        !Number.isSafeInteger(phase.phaseRevision) ||
        phase.phaseRevision <= this.phaseRevision
      )
        throw new Error('controlled_phase_binding')
      this.activePhase = phase
      this.phaseRevision = phase.phaseRevision
      if (!settlement) this.assertDispatch()
      if (guard) {
        const guards = await this.bounded(() =>
          this.host.admission.readGuards(this.host.identity)
        )
        this.assertDispatch()
        if (
          typeof guards.paused !== 'boolean' ||
          typeof guards.cancelled !== 'boolean' ||
          guards.expiresAt !== new Date(this.expiresAt).toISOString() ||
          guards.paused ||
          guards.cancelled
        )
          throw new Error('controlled_guard_veto')
      }
      const result = await this.bounded(() => {
        if (!settlement) this.assertDispatch()
        return operation(phase!)
      }, settlement)
      if (!settlement) this.assertDispatch()
      if (deferAck) return result
      const ack = await this.bounded(
        () =>
          this.host.continuation.ackPhase(this.host.identity, phase!, {
            phaseType: type,
            completed: true
          }),
        settlement
      )
      if (
        !Number.isSafeInteger(ack.sequence) ||
        ack.sequence > 256 ||
        ack.sequence <= this.seal.sequence ||
        !/^sha256-[a-f0-9]{64}$/.test(ack.hash)
      )
        throw new Error('controlled_phase_ack')
      this.seal = { ...this.seal, ...ack }
      this.lastAck = { phase, ack }
      this.activePhase = null
      return result
    } catch {
      await this.poison(type)
      throw new Error('controlled_evidence_unavailable')
    }
  }
}
