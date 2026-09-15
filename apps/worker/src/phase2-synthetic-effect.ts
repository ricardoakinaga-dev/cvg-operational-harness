import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolRegistry,
  ToolResult
} from '@cvg/harness-contracts'

export const PHASE2_SYNTHETIC_EFFECT_TOOL_ID = 'synthetic.phase2-effect'
export const PHASE2_SYNTHETIC_EFFECT_TOOL_VERSION = 'v1'

export type SyntheticEffectObserver = (context: ToolExecutionContext) => void

/**
 * Controlled Phase 2 fixture. The executor has no network or product
 * dependency; durability is supplied by the journal wrapper at the worker
 * boundary. Keeping the executor deterministic makes replay assertions
 * inspectable without introducing a fake external system.
 */
export function createPhase2SyntheticEffectTool(
  observe?: SyntheticEffectObserver
): ToolDefinition {
  return {
    id: PHASE2_SYNTHETIC_EFFECT_TOOL_ID,
    version: PHASE2_SYNTHETIC_EFFECT_TOOL_VERSION,
    description: 'Controlled synthetic Phase 2 durable-effect fixture',
    inputSchema: { type: 'object' },
    outputSchema: {
      type: 'object',
      properties: {
        fixture: { const: 'phase2' },
        applied: { const: true }
      },
      required: ['fixture', 'applied'],
      additionalProperties: false
    },
    risk: 'LOW',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval: false,
    execute: async (_input, context): Promise<ToolResult> => {
      observe?.(context)
      return {
        status: 'SUCCEEDED',
        output: { fixture: 'phase2', applied: true }
      }
    }
  }
}

export function createPhase2SyntheticEffectRegistry(
  observe?: SyntheticEffectObserver
): ToolRegistry {
  const tool = createPhase2SyntheticEffectTool(observe)
  return {
    list: () => [tool],
    resolve: (toolId, version) =>
      toolId === tool.id && (version === undefined || version === tool.version)
        ? tool
        : undefined
  }
}
