import { createCorrelationId } from '@cvg/shared'
import {
  createTraceId,
  type AgentId,
  type AgentVersionId,
  type PluginAuditEvent,
  type TenantId,
  type TestRunTrace
} from '@cvg/platform'
import { describe, expect, it, vi } from 'vitest'
import { PostgresRuntimeRepository } from '../postgres.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000451' as TenantId
const agentId = 'agent_00000000-0000-4000-8000-000000000451' as AgentId
const versionId =
  'agent_version_00000000-0000-4000-8000-000000000451' as AgentVersionId

function trace(): TestRunTrace {
  const startedAt = new Date('2026-08-26T12:00:00.000Z')
  const completedAt = new Date('2026-08-26T12:00:01.000Z')
  return {
    traceId: createTraceId(),
    tenantId,
    agentId,
    versionId,
    input: { message: 'Mensagem controlada', historySize: 0 },
    intent: { name: 'unknown', confidence: 0.32 },
    policy: [],
    knowledge: { status: 'not_requested' },
    tools: [],
    handoff: { requested: false, reason: null, state: 'BOT_ACTIVE' },
    response: { text: 'Resposta segura.', mode: 'answer' },
    provider: {
      provider: 'fake',
      model: 'deterministic-v1',
      externalCall: false
    },
    configVersion: 'config-v1',
    executionMode: 'CONTROLLED_RUNTIME',
    status: 'completed',
    startedAt,
    completedAt,
    latencyMs: 1000,
    tokenUsage: {
      prompt: 3,
      completion: 2,
      total: 5,
      estimated: true
    },
    createdAt: completedAt
  }
}

function auditEvent(traceId: unknown): PluginAuditEvent {
  return {
    type: 'tool_call',
    correlationId: createCorrelationId(),
    traceId: traceId as PluginAuditEvent['traceId'],
    tenantId,
    agentId,
    versionId,
    plugin: 'fixture.runtime',
    toolName: 'read',
    status: 'blocked',
    payload: {}
  }
}

describe('runtime trace correlation boundary', () => {
  it('rejects an invalid completion correlation ID before database access', async () => {
    const query = vi.fn(async () => {
      throw new Error('database access must not occur')
    })
    const runtime = new PostgresRuntimeRepository({ query })
    const recordExecutionTrace = vi.fn()

    await expect(
      runtime.completeInboundRuntime(
        {
          tenantId,
          conversationId: 'conversation-controlled',
          sessionId: null,
          inboundMessageId: 'message-controlled',
          trace: trace(),
          toolAuditEvents: [],
          correlationId:
            'invalid-correlation' as PluginAuditEvent['correlationId']
        },
        { recordExecutionTrace }
      )
    ).rejects.toMatchObject({ code: 'validation_failed' })
    expect(query).not.toHaveBeenCalled()
    expect(recordExecutionTrace).not.toHaveBeenCalled()
  })

  it.each([
    ['missing or malformed', 'trace-invalid'],
    ['different from the persisted trace', createTraceId()]
  ])(
    'rejects a tool audit parent that is %s before opening a transaction',
    async (_label, eventTraceId) => {
      const parent = trace()
      const query = vi.fn(async () => {
        throw new Error('database access must not occur')
      })
      const runtime = new PostgresRuntimeRepository({ query })
      const recordExecutionTrace = vi.fn()

      await expect(
        runtime.completeInboundRuntime(
          {
            tenantId,
            conversationId: 'conversation-controlled',
            sessionId: null,
            inboundMessageId: 'message-controlled',
            trace: parent,
            toolAuditEvents: [auditEvent(eventTraceId)],
            correlationId: createCorrelationId()
          },
          { recordExecutionTrace }
        )
      ).rejects.toMatchObject({ code: 'validation_failed' })
      expect(query).not.toHaveBeenCalled()
      expect(recordExecutionTrace).not.toHaveBeenCalled()
    }
  )
})
