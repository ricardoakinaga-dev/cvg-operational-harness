// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { executePublishedAgent } from '@cvg/agent-core'
import { InMemoryEffectJournal, InMemoryExecutionStepStore } from '@cvg/harness'
import {
  InMemoryControlPlaneStore,
  createControlledReferencePreset,
  createControlledCapabilityGateway,
  createTraceId,
  prepareControlledPublishedAdmission,
  DeterministicModelProvider,
  type ControlledKernelHostContext
} from '@cvg/platform'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SPEC217 actual published facade host forwarding', () => {
  it('forwards the optional host through the real platform facade, replays a CLOSED trace and performs no model/planner/body', async () => {
    const tenantId = 'tenant_00000000-0000-4000-8000-000000000217'
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId },
      { slug: 'forward217', name: 'Synthetic', description: 'Synthetic only' }
    )
    const draft = await store.createVersion(
      { tenantId },
      agent.id,
      createControlledReferencePreset().config,
      'synthetic'
    )
    const version = { ...draft, status: 'PUBLISHED' as const }
    vi.spyOn(store, 'getVersion').mockResolvedValue(version)
    const gateway = createControlledCapabilityGateway()
    const actor = {
      id: 'system.controlled-runtime',
      role: 'System' as const,
      permissions: ['scheduling:read']
    }
    const input = {
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      traceId: createTraceId(),
      message: 'Olá',
      history: [],
      context: { conversationId: 'conversation217', sessionId: 'session217' },
      actor,
      capabilityGateway: gateway
    }
    const first = await executePublishedAgent(input)
    expect(first.status).toBe('completed')
    if (first.status !== 'completed')
      throw new Error('synthetic baseline did not complete')
    const admission = prepareControlledPublishedAdmission({
      version,
      actor,
      gateway,
      input: {
        ...input,
        executionId: `exec_${randomUUID()}`,
        correlationId: 'corr_00000000-0000-4000-8000-000000000217',
        inboundMessageId: 'message217',
        executionMode: 'CONTROLLED_RUNTIME'
      }
    })
    const lifecycle = {
      assertActive: vi.fn(),
      requestStop: vi.fn(),
      stopAndJoin: vi.fn(async () => {})
    }
    const host: ControlledKernelHostContext = {
      identity: {
        tenantId,
        executionId: admission.input.executionId,
        workerId: 'synthetic-worker217',
        attempt: 1,
        correlationId: admission.input.correlationId,
        traceId: input.traceId,
        inboundMessageId: 'message217',
        conversationId: 'conversation217',
        sessionId: 'session217',
        agentId: agent.id,
        versionId: version.id,
        requestDigest: admission.requestDigest,
        outboxId: 'outbox217',
        outerAttempt: 1,
        outerWorkerId: 'synthetic-worker217',
        outerAttemptRowId: '9007199254740993'
      },
      signal: new AbortController().signal,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      lifecycle,
      state: {
        phaseState: 'CLOSED',
        snapshot: null,
        checkpoint: null,
        closedTrace: first.trace,
        runtimeResult: {
          response: first.trace.response.text,
          stopReason: 'COMPLETED',
          steps: 1,
          modelCalls: 1,
          toolCalls: 0,
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
        },
        sealId: 'seal_closed217',
        stateRevision: 1,
        sequence: 0,
        hash: `sha256-${'0'.repeat(64)}`,
        sealCheckpointDigest: null,
        sealStateDigest: null,
        sealedThroughSequence: 0,
        phaseRevision: 0,
        openPhase: null,
        consumedSealId: null
      },
      continuation: {
        startPrepared: vi.fn(),
        beginPhase: vi.fn(),
        ackPhase: vi.fn(),
        saveResumePoint: vi.fn(),
        poison: vi.fn(),
        close: vi.fn()
      },
      admission: { readGuards: vi.fn(), prepareDispatch: vi.fn() },
      approvalConsumption: { consumeBoundApproval: vi.fn() },
      ports: {
        effectJournal: new InMemoryEffectJournal(),
        stepStore: new InMemoryExecutionStepStore(),
        audit: { append: vi.fn() },
        log: { append: vi.fn() },
        effects: { started: vi.fn(), finished: vi.fn() },
        telemetry: { record: vi.fn() },
        pause: { isPaused: () => false }
      }
    }
    const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
    const planner = vi.spyOn(gateway, 'planTools')
    await expect(executePublishedAgent(input, host)).resolves.toEqual({
      status: 'completed',
      trace: first.trace
    })
    expect(model).not.toHaveBeenCalled()
    expect(planner).not.toHaveBeenCalled()
    expect(lifecycle.requestStop).toHaveBeenCalledWith('finalizing')
    expect(lifecycle.stopAndJoin).toHaveBeenCalledTimes(1)
    expect(host.continuation.startPrepared).not.toHaveBeenCalled()
    expect(host.continuation.close).not.toHaveBeenCalled()
    const corrupt = {
      ...host,
      identity: { ...host.identity, traceId: createTraceId() }
    }
    await expect(executePublishedAgent(input, corrupt)).rejects.toThrow(
      'controlled_host_identity'
    )
  })
})
