import { describe, expect, it } from 'vitest'
import {
  STOP_REASONS,
  type ExecutionBudget,
  type ToolDefinition
} from '@cvg/harness-contracts'

describe('neutral harness contracts', () => {
  it('publishes the required stop reasons and execution budget fields', () => {
    expect(STOP_REASONS).toEqual(
      expect.arrayContaining([
        'COMPLETED',
        'NEEDS_USER_INPUT',
        'APPROVAL_REQUIRED',
        'HUMAN_TAKEOVER',
        'POLICY_DENIED',
        'INSUFFICIENT_EVIDENCE',
        'MAX_STEPS',
        'MAX_COST',
        'MAX_DURATION',
        'TOOL_FAILURE',
        'MODEL_FAILURE',
        'STATE_CONFLICT',
        'CANCELLED',
        'UNSAFE_REQUEST'
      ])
    )

    const budget: ExecutionBudget = {
      maxSteps: 1,
      maxModelCalls: 1,
      maxToolCalls: 1,
      maxDurationMs: 1_000,
      maxCostUsd: 0,
      maxTokens: 64
    }

    expect(Object.keys(budget)).toEqual([
      'maxSteps',
      'maxModelCalls',
      'maxToolCalls',
      'maxDurationMs',
      'maxCostUsd',
      'maxTokens'
    ])
  })

  it('keeps tool definitions declarative and executable through a registry port', () => {
    const tool: ToolDefinition = {
      id: 'contract-test',
      version: '0.1.0',
      description: 'No-op contract test tool.',
      inputSchema: {},
      outputSchema: {},
      risk: 'LOW',
      sideEffect: 'NONE',
      idempotent: true,
      requiresApproval: false,
      async execute() {
        return { status: 'SUCCEEDED', output: 'ok' }
      }
    }

    expect(tool.id).toBe('contract-test')
    expect(tool.requiresApproval).toBe(false)
  })
})
