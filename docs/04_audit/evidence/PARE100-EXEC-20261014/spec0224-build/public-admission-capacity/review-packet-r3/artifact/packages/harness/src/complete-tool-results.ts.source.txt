import { createHash } from 'node:crypto'
import type {
  CompleteToolObservationPayload,
  CompleteJsonValue,
  ContextItem,
  Observation,
  SideEffect,
  StepContext,
  ToolResult,
  ToolRegistry
} from '@cvg/harness-contracts'
import {
  canonicalizeCompleteJson,
  COMPLETE_CHECKPOINT_MAX_BYTES,
  CompleteJsonError,
  MAX_CHECKPOINT_OBSERVATIONS,
  ToolResultContextError
} from '@cvg/harness-contracts'

const LARGE_LIMITS = {
  maxBytes: COMPLETE_CHECKPOINT_MAX_BYTES,
  maxDepth: 64,
  maxNodes: 1_000_000
}

/** Before legacy serialization/validators can coerce or invoke output data. */
export function prepareCompleteToolResult(raw: unknown): ToolResult {
  let safe: Record<string, unknown>
  try {
    const text = canonicalizeCompleteJson(raw, LARGE_LIMITS)
    safe = JSON.parse(text) as Record<string, unknown>
    if (
      !safe ||
      Array.isArray(safe) ||
      !['SUCCEEDED', 'FAILED', 'REJECTED'].includes(safe.status as string)
    )
      throw new Error('shape')
    if (
      safe.error !== undefined &&
      (typeof safe.error !== 'string' || safe.error.length > 512)
    )
      throw new Error('error')
  } catch {
    // The body may already have acted; do not turn capture failure into safe replay.
    throw new Error('unknown_effect: complete_result_not_representable')
  }
  return {
    status: safe.status as ToolResult['status'],
    ...(Object.hasOwn(safe, 'output') ? { output: safe.output } : {}),
    ...(typeof safe.error === 'string' ? { error: safe.error } : {})
  }
}

export function prepareCompleteToolRegistry(
  registry: ToolRegistry
): ToolRegistry {
  const prepare = (tool: ReturnType<ToolRegistry['resolve']>) =>
    tool
      ? {
          ...tool,
          execute: async (...args: Parameters<typeof tool.execute>) =>
            prepareCompleteToolResult(await tool.execute(...args))
        }
      : undefined
  return {
    list: () => registry.list().map((tool) => prepare(tool)!),
    resolve: (id, version) => prepare(registry.resolve(id, version))
  }
}

export function completeSnapshot(value: unknown): string {
  return canonicalizeCompleteJson(value, LARGE_LIMITS)
}

export function completeToolPayload(
  output: unknown,
  sideEffect: SideEffect
): CompleteToolObservationPayload {
  try {
    const serialized = canonicalizeCompleteJson(output)
    return {
      schemaVersion: 1,
      status: 'SUCCEEDED',
      sideEffect,
      completion: 'COMPLETE',
      resultAvailability: 'AVAILABLE',
      output: JSON.parse(serialized) as CompleteJsonValue,
      outputBytes: Buffer.byteLength(serialized, 'utf8'),
      outputSha256: createHash('sha256').update(serialized).digest('hex')
    }
  } catch (error) {
    if (!(error instanceof CompleteJsonError)) throw error
    return {
      schemaVersion: 1,
      status: 'SUCCEEDED',
      sideEffect,
      completion: 'UNAVAILABLE',
      resultAvailability: 'UNAVAILABLE',
      reason: error.code
    }
  }
}

export function assertCompleteToolObservation(observation: Observation): void {
  if (observation.type !== 'TOOL_RESULT') return
  const raw = observation.payload
  // Validate plain JSON before reading individual fields; never invoke accessors.
  completeSnapshot(raw)
  const payload = raw as CompleteToolObservationPayload
  if (
    !payload ||
    payload.schemaVersion !== 1 ||
    observation.source !== 'TOOL' ||
    observation.trust !== 'UNTRUSTED' ||
    !['NONE', 'READ', 'WRITE', 'EXTERNAL'].includes(payload.sideEffect)
  ) {
    throw new ToolResultContextError(
      'STATE_CONFLICT',
      'Invalid complete tool envelope.',
      'STATE_CONFLICT'
    )
  }
  if (payload.status === 'SUCCEEDED' && payload.completion === 'COMPLETE') {
    const value = canonicalizeCompleteJson(payload.output)
    if (
      payload.resultAvailability !== 'AVAILABLE' ||
      payload.outputBytes !== Buffer.byteLength(value, 'utf8') ||
      payload.outputSha256 !==
        createHash('sha256').update(value).digest('hex') ||
      Object.keys(payload).sort().join(',') !==
        'completion,output,outputBytes,outputSha256,resultAvailability,schemaVersion,sideEffect,status'
    ) {
      throw new ToolResultContextError(
        'STATE_CONFLICT',
        'Tool result integrity mismatch.',
        'STATE_CONFLICT'
      )
    }
  } else if (
    payload.status === 'SUCCEEDED' &&
    payload.completion === 'UNAVAILABLE'
  ) {
    if (
      payload.resultAvailability !== 'UNAVAILABLE' ||
      !['INVALID_JSON', 'RESULT_TOO_LARGE', 'RESULT_COMPLEXITY'].includes(
        payload.reason
      ) ||
      Object.keys(payload).sort().join(',') !==
        'completion,reason,resultAvailability,schemaVersion,sideEffect,status'
    ) {
      throw new ToolResultContextError(
        'STATE_CONFLICT',
        'Invalid unavailable result.',
        'STATE_CONFLICT'
      )
    }
  } else if (
    (payload.status !== 'FAILED' && payload.status !== 'REJECTED') ||
    payload.completion !== 'NOT_APPLICABLE' ||
    payload.resultAvailability !== 'UNAVAILABLE' ||
    typeof payload.error !== 'string' ||
    payload.error.length > 512 ||
    Object.keys(payload).sort().join(',') !==
      'completion,error,resultAvailability,schemaVersion,sideEffect,status'
  ) {
    throw new ToolResultContextError(
      'STATE_CONFLICT',
      'Invalid failed tool result.',
      'STATE_CONFLICT'
    )
  }

  const identifiers = [
    observation.observationId,
    observation.executionId,
    observation.stepId,
    observation.provenance.sourceId,
    observation.provenance.sourceVersion,
    observation.provenance.operationKey,
    observation.provenance.effectRef
  ]
  if (
    identifiers.some(
      (value) =>
        value !== undefined &&
        (typeof value !== 'string' ||
          value.length > 512 ||
          value.includes('\0'))
    )
  ) {
    throw new ToolResultContextError(
      'STATE_CONFLICT',
      'Invalid tool result metadata.',
      'STATE_CONFLICT'
    )
  }
  const encoded = completeSnapshot(observation)
  const outputBytes =
    payload.completion === 'COMPLETE' ? payload.outputBytes : 0
  if (Buffer.byteLength(encoded, 'utf8') - outputBytes > 4_096) {
    throw new ToolResultContextError(
      'CONTEXT_OVERFLOW',
      'Tool result metadata exceeds its envelope limit.'
    )
  }
}

export function completeToolItem(observation: Observation): ContextItem {
  assertCompleteToolObservation(observation)
  return {
    contextId: `tool.${observation.observationId}`,
    priority: 'FRESH_TOOL_RESULTS',
    trust: 'UNTRUSTED',
    source: observation.provenance.sourceId,
    content: completeSnapshot(observation),
    // Informational only. Qualified whole-request admission owns the real bound.
    tokenEstimate: 0,
    evidenceRefs: [observation.observationId]
  }
}

export function retainCompleteObservations(
  observations: readonly Observation[]
): Observation[] {
  const retained = [...observations]
  while (retained.length > MAX_CHECKPOINT_OBSERVATIONS) {
    const optional = retained.findIndex((value) => value.type !== 'TOOL_RESULT')
    if (optional < 0) {
      throw new ToolResultContextError(
        'CONTEXT_OVERFLOW',
        'No checkpoint slot for another complete tool result.'
      )
    }
    retained.splice(optional, 1)
  }
  return retained
}

/** Validate a custom selector against native items and immutable runtime facts. */
export function validateCompleteStepContext(
  actual: StepContext,
  native: StepContext
): void {
  completeSnapshot(actual)
  for (const key of [
    'executionId',
    'tenantId',
    'conversationId',
    'stepNumber',
    'runtimeProfile',
    'agentId',
    'agentVersion',
    'objective',
    'instructions',
    'goal',
    'userMessage',
    'stateSummary',
    'observations',
    'capabilities',
    'knowledgeAvailable',
    'completionStrategy',
    'allowedDecisionTypes',
    'budget',
    'budgetUsage',
    'pendingApprovalId',
    'pendingQuestion',
    'lastEvaluation',
    'correlationId',
    'traceId',
    'decisionRepair',
    'toolResultContext'
  ] as const) {
    if (
      completeSnapshot(actual[key] ?? null) !==
      completeSnapshot(native[key] ?? null)
    ) {
      throw new ToolResultContextError(
        'STATE_CONFLICT',
        `Context changed native field ${key}.`,
        'STATE_CONFLICT'
      )
    }
  }
  if (!Number.isSafeInteger(actual.tokenBudget) || actual.tokenBudget < 1) {
    throw new ToolResultContextError(
      'ADMISSION_UNAVAILABLE',
      'Invalid context token bound.'
    )
  }
  const nativeItems = new Map(
    native.contextItems.map((value) => [value.contextId, value])
  )
  const actualIds = new Set<string>()
  for (const item of actual.contextItems) {
    const expected = nativeItems.get(item.contextId)
    if (
      actualIds.has(item.contextId) ||
      !expected ||
      completeSnapshot(item) !== completeSnapshot(expected)
    ) {
      throw new ToolResultContextError(
        'STATE_CONFLICT',
        'Context item changed or duplicated native data.',
        'STATE_CONFLICT'
      )
    }
    actualIds.add(item.contextId)
  }
  for (const item of native.contextItems) {
    if (
      [
        'SYSTEM',
        'AGENT_PROFILE',
        'CURRENT_GOAL',
        'CURRENT_STATE',
        'FRESH_TOOL_RESULTS'
      ].includes(item.priority) &&
      !actualIds.has(item.contextId)
    ) {
      throw new ToolResultContextError(
        'CONTEXT_OVERFLOW',
        'A mandatory context item was omitted.'
      )
    }
  }
}
