import type {
  SpillPolicy,
  SpillStore,
  ToolDefinition,
  ToolResult
} from '@cvg/harness-contracts'
import { SpillCancelled, SpillExpired, SpillNotFound } from './errors.ts'
import { resolveSpillPolicy } from './policy.ts'

/** The name is reserved for the house capability (SPEC 0293 I11). */
export const SPILL_READ_TOOL_ID = 'spill.read'

const HOUSE_TOOLS = new WeakSet<object>()

/**
 * True only for a definition made by `createSpillReadTool`: the one tool whose
 * result is shown whole and is never stored again. A tool that merely uses the
 * same id is an ordinary tool and its output is stored like any other.
 */
export function isSpillReadTool(tool: object): boolean {
  return HOUSE_TOOLS.has(tool)
}

export interface SpillReadToolOptions {
  readonly store: SpillStore
  readonly policy?: Partial<SpillPolicy>
  /**
   * How many bytes of context the host can still give to this read. A read is
   * shortened to it; at zero the call is refused rather than cut silently.
   */
  readonly availableBytes?: () => number | Promise<number>
}

interface ReadInput {
  readonly locator: string
  readonly offset: number
  readonly length: number | undefined
}

const ALLOWED_KEYS = new Set(['locator', 'offset', 'length'])

function parseInput(input: unknown, readMax: number): ReadInput | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return undefined
  }
  const record = input as Record<string, unknown>
  if (Object.keys(record).some((key) => !ALLOWED_KEYS.has(key)))
    return undefined
  const { locator, offset, length } = record
  if (
    typeof locator !== 'string' ||
    locator.length < 1 ||
    locator.length > 200
  ) {
    return undefined
  }
  if (
    offset !== undefined &&
    (!Number.isSafeInteger(offset) || (offset as number) < 0)
  ) {
    return undefined
  }
  if (
    length !== undefined &&
    (!Number.isSafeInteger(length) ||
      (length as number) < 1 ||
      (length as number) > readMax)
  ) {
    return undefined
  }
  return {
    locator,
    offset: (offset as number | undefined) ?? 0,
    length: length as number | undefined
  }
}

/**
 * SPEC 0293 §3.6: reads the rest of a stored tool output, bound to the tenant and
 * session of the turn. Read-only; goes through policy, budget and call counting like any
 * tool; its result is untrusted data and is delivered whole (up to `readMaxBytes`).
 */
export function createSpillReadTool(
  options: SpillReadToolOptions
): ToolDefinition {
  const policy = resolveSpillPolicy(options.policy)
  const tool: ToolDefinition = {
    id: SPILL_READ_TOOL_ID,
    version: 'v1',
    description:
      'Reads a slice of a stored tool output by its locator. Returns text, the effective offset, the bytes read and whether the end was reached.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['locator'],
      properties: {
        locator: { type: 'string' },
        offset: { type: 'integer', minimum: 0 },
        length: { type: 'integer', minimum: 1, maximum: policy.readMaxBytes }
      }
    },
    outputSchema: { type: 'object' },
    risk: 'LOW',
    sideEffect: 'READ',
    idempotent: true,
    requiresApproval: false,
    async execute(input, context): Promise<ToolResult> {
      const parsed = parseInput(input, policy.readMaxBytes)
      if (!parsed) {
        return { status: 'REJECTED', error: 'spill.read input is invalid' }
      }
      if (!context.sessionId) {
        return {
          status: 'REJECTED',
          error: 'spill.read needs the session of the turn'
        }
      }
      let length = parsed.length ?? policy.readMaxBytes
      if (options.availableBytes) {
        const available = await options.availableBytes()
        if (!Number.isSafeInteger(available) || available < 1) {
          return { status: 'REJECTED', error: 'no context left for this read' }
        }
        length = Math.min(length, available)
      }
      try {
        const slice = await options.store.read({
          tenantId: context.tenantId,
          sessionId: context.sessionId,
          locator: parsed.locator,
          offset: parsed.offset,
          length,
          ...(context.signal ? { signal: context.signal } : {})
        })
        return { status: 'SUCCEEDED', output: { status: 'OK', ...slice } }
      } catch (error) {
        // a foreign tenant or session reads as absence; an expired object says so
        if (error instanceof SpillExpired) {
          return { status: 'SUCCEEDED', output: { status: 'EXPIRED' } }
        }
        if (error instanceof SpillNotFound) {
          return { status: 'SUCCEEDED', output: { status: 'NOT_FOUND' } }
        }
        if (error instanceof SpillCancelled) {
          return { status: 'FAILED', error: 'spill.read was cancelled' }
        }
        return { status: 'FAILED', error: 'spill.read is unavailable' }
      }
    }
  }
  HOUSE_TOOLS.add(tool)
  return tool
}
