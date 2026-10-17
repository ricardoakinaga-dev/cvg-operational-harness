import { sanitizeAuditEvidencePayload } from '@cvg/shared'
import type {
  CapabilityApproval,
  CapabilityExecutionInput,
  CapabilityExecutionResult,
  PluginAuditEvent,
  PluginToolInputValidator,
  PluginToolOutputValidator
} from './plugin-gateway.ts'
import type { AgentConfig, PlatformPolicyResult } from './contracts.ts'
import type { AgentId, AgentVersionId, TenantId, TraceId } from './ids.ts'

const MAX_BOUND_VALUE_DEPTH = 8
const MAX_BOUND_VALUE_KEYS = 64
const MAX_BOUND_VALUE_ARRAY_ITEMS = 64
const MAX_BOUND_VALUE_STRING_LENGTH = 4000
const MAX_BOUND_VALUE_TOTAL_CHARS = 16000
const MAX_BOUND_VALUE_NODES = 256

export function blockedResult(
  reason: string,
  correlationId: CapabilityExecutionResult['correlationId']
): CapabilityExecutionResult {
  return { status: 'blocked', reason, correlationId }
}

export function createSafeExecutionInput(input: {
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  traceId?: TraceId
  config: AgentConfig
  toolName: string
  actor: { id: string; role: string; permissions: string[] }
  policy: Pick<PlatformPolicyResult, 'decision' | 'reason'>
  dryRun: boolean
  requireApproval?: boolean
  approval?: CapabilityApproval
  onAudit?: (event: PluginAuditEvent) => void | Promise<void>
}): CapabilityExecutionInput {
  return {
    tenantId: input.tenantId,
    agentId: input.agentId,
    versionId: input.versionId,
    ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
    config: input.config,
    toolName: input.toolName,
    input: {},
    actor: input.actor,
    policy: input.policy,
    dryRun: input.dryRun,
    ...(input.requireApproval !== undefined
      ? { requireApproval: input.requireApproval }
      : {}),
    ...(input.approval !== undefined ? { approval: input.approval } : {}),
    ...(input.onAudit ? { onAudit: input.onAudit } : {})
  }
}

export function parseToolInput(
  validator: PluginToolInputValidator,
  input: unknown
): { success: true; data: Record<string, unknown> } | { success: false } {
  try {
    const parsed = validator.safeParse(input)
    if (!isPlainRecord(parsed) || parsed.success !== true) {
      return { success: false }
    }
    const cloned = cloneBoundedValue(parsed.data)
    if (!isPlainRecord(cloned)) return { success: false }
    return { success: true, data: cloned }
  } catch {
    return { success: false }
  }
}

export function normalizePluginHandlerResult(
  result: unknown,
  outputValidator: PluginToolOutputValidator
): Omit<CapabilityExecutionResult, 'correlationId'> | null {
  try {
    if (!isPlainRecord(result)) return null
    const status = result.status
    if (status !== 'succeeded' && status !== 'failed' && status !== 'blocked') {
      return null
    }

    const normalized: Omit<CapabilityExecutionResult, 'correlationId'> = {
      status
    }
    if (result.data !== undefined) {
      const parsedData = outputValidator.safeParse(result.data)
      if (!isPlainRecord(parsedData) || parsedData.success !== true) {
        return null
      }
      const boundedData = cloneBoundedValue(parsedData.data)
      const sanitized = sanitizeAuditEvidencePayload(boundedData)
      normalized.data = sanitized.payload
    }

    if (result.error !== undefined && typeof result.error !== 'string') {
      return null
    }
    if (typeof result.error === 'string' && result.error.length > 240) {
      return null
    }
    if (status !== 'succeeded' && typeof result.error === 'string') {
      const error = normalizeHandlerError(result.error, status)
      if (error) normalized.reason = error
    }
    return normalized
  } catch {
    return null
  }
}

function normalizeHandlerError(
  error: string,
  status: 'failed' | 'blocked'
): string | null {
  if (error.length > 240)
    return status === 'failed' ? 'tool_handler_failed' : 'tool_handler_blocked'
  const normalized = error.trim()
  if (/^[A-Za-z0-9._:-]{1,160}$/.test(normalized)) return normalized
  return status === 'failed' ? 'tool_handler_failed' : 'tool_handler_blocked'
}

function cloneBoundedValue(value: unknown): unknown {
  const seen = new WeakSet<object>()
  let totalChars = 0
  let totalNodes = 0

  const clone = (current: unknown, depth: number): unknown => {
    if (depth > MAX_BOUND_VALUE_DEPTH) {
      throw new Error('Bounded value depth exceeded')
    }
    totalNodes += 1
    if (totalNodes > MAX_BOUND_VALUE_NODES) {
      throw new Error('Bounded value node count exceeded')
    }
    if (current === null || typeof current === 'boolean') return current
    if (typeof current === 'string') {
      if (current.length > MAX_BOUND_VALUE_STRING_LENGTH) {
        throw new Error('Bounded value string length exceeded')
      }
      totalChars += current.length
      if (totalChars > MAX_BOUND_VALUE_TOTAL_CHARS) {
        throw new Error('Bounded value size exceeded')
      }
      return current
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new Error('Non-finite number')
      return current
    }
    if (typeof current !== 'object') {
      throw new Error('Unsupported bounded value type')
    }
    if (seen.has(current)) throw new Error('Cyclic bounded value')
    seen.add(current)

    if (Array.isArray(current)) {
      if (current.length > MAX_BOUND_VALUE_ARRAY_ITEMS) {
        throw new Error('Bounded value array length exceeded')
      }
      return current.map((item) => clone(item, depth + 1))
    }
    if (!isPlainRecord(current)) throw new Error('Non-plain bounded value')
    const keys = Object.keys(current)
    if (keys.length > MAX_BOUND_VALUE_KEYS) {
      throw new Error('Bounded value key count exceeded')
    }
    return Object.fromEntries(
      keys.map((key) => {
        if (
          key === '__proto__' ||
          key === 'prototype' ||
          key === 'constructor'
        ) {
          throw new Error('Unsafe bounded value key')
        }
        totalChars += key.length
        if (totalChars > MAX_BOUND_VALUE_TOTAL_CHARS) {
          throw new Error('Bounded value size exceeded')
        }
        return [key, clone(current[key], depth + 1)]
      })
    )
  }

  return clone(value, 0)
}

export function isPlainRecord(
  value: unknown
): value is Record<string, unknown> {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false
    }
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}
