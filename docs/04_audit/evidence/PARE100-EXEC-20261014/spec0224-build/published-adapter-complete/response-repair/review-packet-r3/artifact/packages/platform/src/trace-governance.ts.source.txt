import { z } from 'zod'
import { DomainError, redactSensitiveText } from '@cvg/shared'
import {
  AgentExecutionModeSchema,
  AgentVersionStatusSchema,
  HandoffPrioritySchema,
  PlatformDecisionSchema,
  type TestRunTrace,
  type TestSuiteRunRecord
} from './contracts.ts'
import {
  AgentIdSchema,
  AgentVersionIdSchema,
  TenantIdSchema,
  TraceIdSchema
} from './ids.ts'
import {
  CONTROLLED_SAFE_OUTPUTS,
  enforceControlledOutput,
  type ControlledOutputDecision,
  type ControlledOutputMode,
  type ControlledOutputReason,
  type ControlledOutputResult
} from './output-policy.ts'

const TRACE_TEXT_MAX_CHARS = 4000
const TRACE_REASON_MAX_CHARS = 240
const TRACE_NAME_MAX_CHARS = 120
const TRACE_CONTEXT_ID_MAX_CHARS = 160
const TRACE_SPAN_ORDER = [
  'normalize',
  'context',
  'intent',
  'policy',
  'knowledge',
  'prompt',
  'model',
  'tool',
  'response',
  'handoff',
  'delivery'
] as const

const TraceStringSchema = z.string().trim().min(1).max(TRACE_TEXT_MAX_CHARS)
const ShortTraceStringSchema = z
  .string()
  .trim()
  .min(1)
  .max(TRACE_REASON_MAX_CHARS)
const TraceNumberSchema = z
  .number()
  .refine((value) => Number.isFinite(value), 'Must be finite')
const TraceIntegerSchema = TraceNumberSchema.int().min(0)
const TraceDateSchema = z.preprocess(
  (value) => {
    if (value instanceof Date) return value
    if (typeof value === 'string' && value.length <= 100) {
      return new Date(value)
    }
    return value
  },
  z.date().refine((value) => Number.isFinite(value.getTime()), 'Invalid date')
)

const TraceSpanSchema = z
  .object({
    name: z.enum([
      'normalize',
      'context',
      'intent',
      'policy',
      'knowledge',
      'prompt',
      'model',
      'tool',
      'response',
      'handoff',
      'delivery'
    ]),
    status: z.enum(['completed', 'blocked', 'skipped']),
    durationMs: TraceNumberSchema.min(0).max(86_400_000)
  })
  .strip()

const TracePolicyResultSchema = z
  .object({
    decision: PlatformDecisionSchema,
    layer: z.enum(['hard_safety', 'organization', 'agent_behavior']),
    reason: ShortTraceStringSchema,
    policyVersion: ShortTraceStringSchema
  })
  .strip()

const TraceOutputPolicySchema = z
  .object({
    decision: z.enum(['allowed', 'rewritten']),
    reason: z.enum([
      'output_allowed',
      'output_redacted',
      'unsafe_output_rejected',
      'invalid_output',
      'output_too_large'
    ]),
    mode: z.enum(['answer', 'clarify', 'handoff', 'blocked']),
    redacted: z.boolean()
  })
  .strip()

const TraceSchema = z
  .object({
    traceId: TraceIdSchema,
    tenantId: TenantIdSchema,
    agentId: AgentIdSchema,
    versionId: AgentVersionIdSchema,
    input: z
      .object({
        message: TraceStringSchema,
        historySize: TraceIntegerSchema.max(50)
      })
      .strip(),
    intent: z
      .object({
        name: z.string().trim().min(1).max(TRACE_NAME_MAX_CHARS),
        confidence: TraceNumberSchema.min(0).max(1)
      })
      .strip(),
    risk: z
      .object({
        level: z.enum(['low', 'medium', 'high', 'critical']),
        reason: ShortTraceStringSchema
      })
      .strip()
      .optional(),
    policy: z.array(TracePolicyResultSchema).max(64),
    knowledge: z
      .object({
        status: z.enum([
          'not_requested',
          'approved_source_missing',
          'answered',
          'handoff'
        ]),
        source: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .regex(/^controlled:\/\//)
          .optional(),
        version: ShortTraceStringSchema.optional()
      })
      .strip(),
    tools: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(TRACE_NAME_MAX_CHARS),
            status: z.enum(['not_run', 'blocked', 'succeeded', 'failed'])
          })
          .strip()
      )
      .max(128),
    toolResults: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(TRACE_NAME_MAX_CHARS),
            status: z.enum(['not_run', 'blocked', 'succeeded', 'failed']),
            output: z
              .object({ redacted: z.literal(true) })
              .strip()
              .nullable()
          })
          .strip()
      )
      .max(128)
      .optional(),
    handoff: z
      .object({
        requested: z.boolean(),
        reason: ShortTraceStringSchema.nullable(),
        state: z.enum(['BOT_ACTIVE', 'HANDOFF_REQUESTED']),
        destination: z
          .string()
          .trim()
          .min(1)
          .max(TRACE_NAME_MAX_CHARS)
          .regex(/^[A-Za-z0-9._:-]+$/)
          .optional(),
        priority: HandoffPrioritySchema.optional()
      })
      .strip(),
    response: z
      .object({
        text: z.string().max(TRACE_TEXT_MAX_CHARS),
        mode: z.enum(['answer', 'clarify', 'handoff', 'blocked'])
      })
      .strip(),
    outputPolicy: TraceOutputPolicySchema.optional(),
    provider: z
      .object({
        provider: z.literal('fake'),
        model: z.literal('deterministic-v1'),
        externalCall: z.literal(false)
      })
      .strip(),
    prompt: z
      .object({
        version: ShortTraceStringSchema,
        blockIds: z.array(z.string().trim().min(1).max(80)).max(64),
        status: AgentVersionStatusSchema.optional(),
        checksum: z.string().trim().min(1).max(256).optional()
      })
      .strip()
      .optional(),
    configVersion: ShortTraceStringSchema,
    executionMode: AgentExecutionModeSchema,
    status: z.enum(['completed', 'blocked', 'failed']).optional(),
    startedAt: TraceDateSchema.optional(),
    completedAt: TraceDateSchema.optional(),
    latencyMs: TraceNumberSchema.min(0).max(86_400_000).optional(),
    tokenUsage: z
      .object({
        prompt: TraceIntegerSchema.max(2_000_000),
        completion: TraceIntegerSchema.max(2_000_000),
        total: TraceIntegerSchema.max(4_000_000),
        estimated: z.literal(true)
      })
      .strip()
      .optional(),
    spans: z.array(TraceSpanSchema).max(32).optional(),
    conversationId: z
      .string()
      .trim()
      .min(1)
      .max(TRACE_CONTEXT_ID_MAX_CHARS)
      .optional(),
    sessionId: z
      .string()
      .trim()
      .min(1)
      .max(TRACE_CONTEXT_ID_MAX_CHARS)
      .optional(),
    createdAt: TraceDateSchema
  })
  .strip()

export function sanitizeTraceForPersistence(trace: unknown): TestRunTrace {
  const parsed = TraceSchema.safeParse(trace)
  if (!parsed.success) throw invalidTrace()

  const canonical = parsed.data
  if (
    canonical.handoff.requested !==
      (canonical.handoff.state === 'HANDOFF_REQUESTED') ||
    (canonical.handoff.requested && canonical.handoff.reason === null) ||
    (!canonical.handoff.requested && canonical.handoff.reason !== null)
  ) {
    throw invalidTrace()
  }
  if (
    canonical.tokenUsage &&
    canonical.tokenUsage.total !==
      canonical.tokenUsage.prompt + canonical.tokenUsage.completion
  ) {
    throw invalidTrace()
  }
  if (canonical.spans) {
    validateTraceSpans(canonical as TestRunTrace)
  }
  validateTraceTiming(canonical as TestRunTrace)
  if (canonical.toolResults) {
    if (canonical.toolResults.length !== canonical.tools.length) {
      throw invalidTrace()
    }
    canonical.toolResults.forEach((result, index) => {
      const tool = canonical.tools[index]
      if (!tool || tool.name !== result.name || tool.status !== result.status) {
        throw invalidTrace()
      }
      if (
        (result.status === 'succeeded' && !result.output) ||
        (result.status !== 'succeeded' && result.output !== null)
      ) {
        throw invalidTrace()
      }
    })
  }

  const output = enforceControlledOutput({
    text: canonical.response.text,
    mode: canonical.response.mode,
    riskLevel: canonical.risk?.level ?? 'low'
  })
  if (output.decision === 'rewritten') throw invalidTrace()

  const inputMessage = redactSensitiveText(canonical.input.message)
  if (inputMessage.length > TRACE_TEXT_MAX_CHARS) throw invalidTrace()

  const outputPolicy = canonical.outputPolicy
    ? normalizeOutputPolicy(canonical.outputPolicy, output, canonical.response)
    : undefined
  if (
    outputPolicy?.decision === 'rewritten' &&
    outputPolicy.mode === 'handoff' &&
    !canonical.handoff.requested
  ) {
    throw invalidTrace()
  }

  return {
    ...canonical,
    input: {
      message: inputMessage,
      historySize: canonical.input.historySize
    },
    response: { text: output.text, mode: output.mode },
    ...(outputPolicy ? { outputPolicy } : {})
  } as TestRunTrace
}

export function sanitizeTestSuiteRunTraces(
  rawRun: unknown
): TestSuiteRunRecord {
  if (
    !isRecord(rawRun) ||
    !Array.isArray(rawRun.variants) ||
    typeof rawRun.passed !== 'boolean' ||
    typeof rawRun.createdBy !== 'string' ||
    rawRun.createdBy.trim().length === 0 ||
    rawRun.createdBy.length > 160 ||
    !(rawRun.createdAt instanceof Date) ||
    !Number.isFinite(rawRun.createdAt.getTime())
  ) {
    throw invalidTrace()
  }

  const variants = rawRun.variants.map((rawVariant) => {
    if (
      !isRecord(rawVariant) ||
      !Array.isArray(rawVariant.results) ||
      rawVariant.results.length > 100 ||
      typeof rawVariant.passed !== 'boolean'
    ) {
      throw invalidTrace()
    }
    const results = rawVariant.results.map((rawResult) => {
      if (
        !isRecord(rawResult) ||
        !('trace' in rawResult) ||
        typeof rawResult.caseId !== 'string' ||
        rawResult.caseId.trim().length === 0 ||
        rawResult.caseId.length > 120 ||
        typeof rawResult.passed !== 'boolean' ||
        !Array.isArray(rawResult.failures) ||
        rawResult.failures.length > 32 ||
        rawResult.failures.some(
          (failure) =>
            typeof failure !== 'string' ||
            failure.trim().length === 0 ||
            failure.length > 240
        )
      ) {
        throw invalidTrace()
      }
      return {
        caseId: rawResult.caseId.trim(),
        passed: rawResult.passed,
        failures: rawResult.failures.map((failure) => failure.trim()),
        trace: sanitizeTraceForPersistence(rawResult.trace)
      }
    })
    return {
      label: rawVariant.label,
      versionId: rawVariant.versionId,
      passed: rawVariant.passed,
      results
    }
  })

  return {
    tenantId: rawRun.tenantId,
    id: rawRun.id,
    suiteId: rawRun.suiteId,
    agentId: rawRun.agentId,
    variants,
    passed: rawRun.passed,
    createdBy: rawRun.createdBy.trim(),
    createdAt: rawRun.createdAt
  } as TestSuiteRunRecord
}

function normalizeOutputPolicy(
  value: z.infer<typeof TraceOutputPolicySchema>,
  fallback: ControlledOutputResult,
  response: TestRunTrace['response'] | { text: string; mode: string }
): NonNullable<TestRunTrace['outputPolicy']> {
  const normalized = {
    decision: value.decision as ControlledOutputDecision,
    reason: value.reason as ControlledOutputReason,
    mode: value.mode as ControlledOutputMode,
    redacted: value.redacted
  }
  if (normalized.decision === 'allowed') {
    if (normalized.mode !== fallback.mode) throw invalidTrace()
    if (normalized.reason === 'output_redacted') {
      if (!normalized.redacted || fallback.decision !== 'allowed') {
        throw invalidTrace()
      }
      return normalized
    }
    if (
      normalized.reason !== 'output_allowed' ||
      normalized.redacted ||
      fallback.decision !== 'allowed' ||
      fallback.reason !== 'output_allowed' ||
      fallback.redacted
    ) {
      throw invalidTrace()
    }
    return normalized
  }

  if (
    fallback.decision !== 'allowed' ||
    normalized.mode !== response.mode ||
    normalized.mode !== fallback.mode ||
    normalized.reason === 'output_allowed' ||
    normalized.reason === 'output_redacted' ||
    response.text !== safeFallbackText(normalized.mode)
  ) {
    throw invalidTrace()
  }
  return normalized
}

function safeFallbackText(mode: ControlledOutputMode): string {
  switch (mode) {
    case 'blocked':
      return CONTROLLED_SAFE_OUTPUTS.blocked
    case 'clarify':
      return CONTROLLED_SAFE_OUTPUTS.clarify
    case 'handoff':
      return CONTROLLED_SAFE_OUTPUTS.handoff
    case 'answer':
      return CONTROLLED_SAFE_OUTPUTS.handoff
  }
}

function validateTraceTiming(trace: TestRunTrace): void {
  const startedAt = trace.startedAt
  const completedAt = trace.completedAt
  const latencyMs = trace.latencyMs
  const hasStartedAt = startedAt !== undefined
  const hasCompletedAt = completedAt !== undefined
  const hasLatency = latencyMs !== undefined
  const hasAnyTiming = hasStartedAt || hasCompletedAt || hasLatency
  if (!hasAnyTiming) return
  if (!hasStartedAt || !hasCompletedAt || !hasLatency) throw invalidTrace()

  const elapsedMs = completedAt.getTime() - startedAt.getTime()
  if (elapsedMs < 0 || elapsedMs !== latencyMs) throw invalidTrace()
}

function validateTraceSpans(trace: TestRunTrace): void {
  if (!trace.spans) return
  let previousIndex = -1
  let totalDurationMs = 0
  for (const span of trace.spans) {
    const spanIndex = TRACE_SPAN_ORDER.indexOf(span.name)
    if (spanIndex <= previousIndex) throw invalidTrace()
    previousIndex = spanIndex
    totalDurationMs += span.durationMs
    if (trace.latencyMs !== undefined && totalDurationMs > trace.latencyMs) {
      throw invalidTrace()
    }

    const expectedStatus = expectedTraceSpanStatus(trace, span.name)
    if (span.status !== expectedStatus) throw invalidTrace()
  }
}

function expectedTraceSpanStatus(
  trace: TestRunTrace,
  name: (typeof TRACE_SPAN_ORDER)[number]
): 'completed' | 'blocked' | 'skipped' {
  switch (name) {
    case 'policy':
      return trace.policy.some((result) => result.decision === 'blocked')
        ? 'blocked'
        : 'completed'
    case 'knowledge':
      return trace.knowledge.status === 'not_requested'
        ? 'skipped'
        : 'completed'
    case 'tool':
      return trace.tools.length === 0
        ? 'skipped'
        : trace.tools.some((tool) => tool.status === 'blocked')
          ? 'blocked'
          : 'completed'
    case 'handoff':
      return trace.handoff.requested ? 'completed' : 'skipped'
    case 'delivery':
      return 'skipped'
    default:
      return 'completed'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidTrace(): DomainError {
  return new DomainError(
    'validation_failed',
    'Trace failed controlled provenance validation'
  )
}
