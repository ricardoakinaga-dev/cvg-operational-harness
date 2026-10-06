import { describe, expect, it } from 'vitest'
import { ApprovalEngine as ApprovalAuthorityEngine } from '@cvg/approval-engine'
import type {
  ApprovalEngine,
  ExecutionCheckpoint,
  RuntimeInput,
  ToolDefinition
} from '@cvg/harness-contracts'
import {
  ScriptedModelGateway,
  ScriptedOrchestrator
} from '@cvg/harness-orchestrator'
import { IterativeGovernedRuntime } from '../../packages/harness/src/iterative-runtime.ts'
import { InMemoryExecutionStepStore } from '../../packages/harness/src/step-store.ts'
import {
  InMemoryEffectLedger,
  InMemoryPauseSwitch,
  KernelRuntime,
  standardKernelPlugins,
  type KernelLogEvent
} from '../../packages/harness/src/kernel/index.ts'
import {
  PHASE3_TOOL_RESERVE,
  phase3RuntimeInput
} from '../../packages/harness/src/__tests__/fixtures/phase3-fixtures.ts'
import { DurableApprovalEngineAdapter } from '../../packages/persistence/src/operational-approval-adapter.ts'

/**
 * AUD-0599 F01/F02 — uma chamada bloqueada cujo registro de encerramento
 * (`tool/result`) falha continua dizendo por que foi bloqueada, e a etapa que
 * ela deixou aberta é encerrada como FAILED com o código da negação (SPEC 0181
 * §11.3/§11.4). Aprovação e adaptador reais, em memória; dados sintéticos.
 */

const input = phase3RuntimeInput()
const executionId = input.executionId!
const DENIAL = 'synthetic-denial-marker'
const callTool = {
  decisionType: 'CALL_TOOL',
  reasonCode: 'TOOL_REQUIRED',
  toolId: PHASE3_TOOL_RESERVE,
  toolInput: {}
} as const
const respond = {
  decisionType: 'RESPOND',
  reasonCode: 'GOAL_SATISFIED',
  responseText: 'ok'
} as const

function syntheticTool(
  requiresApproval: boolean,
  bodies: string[]
): ToolDefinition {
  return {
    id: PHASE3_TOOL_RESERVE,
    version: 'v1',
    description: 'synthetic only',
    inputSchema: {},
    outputSchema: {},
    risk: 'LOW',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval,
    execute: async () => {
      bodies.push('body')
      return { status: 'SUCCEEDED', output: { ok: true } }
    }
  }
}

/** A kernel log whose closing records can be made to fail. */
function closingLog() {
  const events: KernelLogEvent[] = []
  let failClosing = false
  return {
    events,
    closing: () => events.filter((event) => event.type === 'tool/result'),
    failClosing: (value: boolean) => {
      failClosing = value
    },
    log: {
      append: async (event: KernelLogEvent) => {
        events.push(event)
        if (failClosing && event.type === 'tool/result') {
          throw new Error('synthetic closing outage')
        }
      }
    }
  }
}

interface Options {
  readonly requiresApproval?: boolean
  /** Runs when the in-flight checkpoint of the call is saved. */
  readonly onDispatchCheckpoint?: () => void
}

function iterative(options: Options = {}) {
  const bodies: string[] = []
  const pause = new InMemoryPauseSwitch()
  const authority = new ApprovalAuthorityEngine()
  const adapter = new DurableApprovalEngineAdapter(authority)
  const logs = closingLog()
  let deny = false
  class Store extends InMemoryExecutionStepStore {
    override async saveCheckpoint(checkpoint: ExecutionCheckpoint) {
      await super.saveCheckpoint(checkpoint)
      if (checkpoint.state.pendingDecision && !checkpoint.state.stopReason) {
        options.onDispatchCheckpoint?.()
      }
    }
  }
  const store = new Store()
  const approvals: ApprovalEngine = {
    request: (request) => adapter.request(request),
    execution: adapter.execution
  }
  const tool = syntheticTool(options.requiresApproval ?? true, bodies)
  const runtime = new IterativeGovernedRuntime({
    orchestrator: new ScriptedOrchestrator({ script: [callTool, respond] }),
    modelGateway: new ScriptedModelGateway({ responses: ['synthetic'] }),
    policy: {
      evaluate: async () => ({
        outcome: deny ? 'DENY' : 'ALLOW',
        reason: deny ? DENIAL : 'synthetic',
        policyVersion: 'v1'
      })
    },
    approvals,
    tools: {
      list: () => [tool],
      resolve: (id) => (id === tool.id ? tool : undefined)
    },
    audit: { append: async () => undefined },
    telemetry: { record: () => undefined },
    stepStore: store,
    pause,
    effects: new InMemoryEffectLedger(),
    log: logs.log
  })
  const run = (overrides: Partial<RuntimeInput> = {}) =>
    runtime.execute({ ...input, ...overrides })
  /** Runs to the approval wait and approves it as an independent operator. */
  const approve = async () => {
    const first = await run()
    expect(first.stopReason).toBe('APPROVAL_REQUIRED')
    const approvalId = authority.list(input.tenantId)[0]!.approvalId
    authority.approve(input.tenantId, approvalId, {
      approverId: 'operator.synthetic.independent'
    })
    return {
      status: () => authority.get(input.tenantId, approvalId).status,
      resume: {
        resume: { kind: 'approval', approvalId: approvalId as never }
      } as const
    }
  }
  return {
    run,
    approve,
    bodies,
    pause,
    authority,
    logs,
    setDeny: (value: boolean) => {
      deny = value
    },
    steps: () => store.listSteps(input.tenantId, executionId),
    checkpoint: () => store.loadCheckpoint(input.tenantId, executionId)
  }
}

describe('AUD-0599 F02 — negação numa etapa retomada com encerramento perdido', () => {
  for (const lost of [false, true]) {
    const label = lost ? 'com tool/result rejeitado' : 'controle, log saudável'
    it(`política negada fecha a etapa WAITING como FAILED (${label})`, async () => {
      const h = iterative()
      await h.approve()
      const [waiting] = await h.steps()
      expect(waiting?.status).toBe('WAITING')

      h.setDeny(true)
      h.logs.failClosing(lost)
      const result = await h.run()

      expect(result.stopReason).toBe(
        lost ? 'INSUFFICIENT_EVIDENCE' : 'POLICY_DENIED'
      )
      expect(result.response).toContain(DENIAL)
      const steps = await h.steps()
      expect(steps).toHaveLength(1)
      expect(steps[0]).toMatchObject({
        stepId: waiting?.stepId,
        stepNumber: waiting?.stepNumber,
        status: 'FAILED',
        errorCode: 'policy_denied'
      })
      expect((await h.checkpoint())?.state.stopReason).toBe(result.stopReason)
      expect(h.bodies).toHaveLength(0)
    })

    it(`aprovação expirada fecha a etapa RUNNING como FAILED (${label})`, async () => {
      let pauseOnCheckpoint = true
      const h = iterative({
        onDispatchCheckpoint: () => {
          if (pauseOnCheckpoint) h.pause.pause(input.tenantId)
        }
      })
      const { status, resume } = await h.approve()
      expect((await h.run(resume)).stopReason).toBe('HUMAN_TAKEOVER')
      const [running] = await h.steps()
      expect(running?.status).toBe('RUNNING')

      h.authority.expireStale(new Date('2100-01-01T00:00:00.000Z'))
      pauseOnCheckpoint = false
      h.pause.resume(input.tenantId)
      h.logs.failClosing(lost)
      const result = await h.run(resume)

      expect(result.stopReason).toBe(
        lost ? 'INSUFFICIENT_EVIDENCE' : 'POLICY_DENIED'
      )
      if (lost) {
        expect(result.response).toContain(
          'The call was blocked before it started'
        )
      }
      const steps = await h.steps()
      expect(steps).toHaveLength(1)
      expect(steps[0]).toMatchObject({
        stepId: running?.stepId,
        stepNumber: running?.stepNumber,
        status: 'FAILED',
        errorCode: 'approval_denied'
      })
      expect((await h.checkpoint())?.state.stopReason).toBe(result.stopReason)
      expect(status()).toBe('EXPIRED')
      expect(h.bodies).toHaveLength(0)
    })
  }

  it('cancelamento depois do checkpoint de despacho fecha a etapa que ele abriu', async () => {
    const controller = new AbortController()
    const h = iterative({
      requiresApproval: false,
      onDispatchCheckpoint: () => controller.abort()
    })
    const result = await h.run({ signal: controller.signal })

    expect(result.stopReason).toBe('CANCELLED')
    const steps = await h.steps()
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({
      stepType: 'TOOL',
      status: 'FAILED',
      errorCode: 'cancelled'
    })
    expect((await h.checkpoint())?.state.stopReason).toBe('CANCELLED')
    expect(h.logs.closing()).toEqual([
      expect.objectContaining({ outcome: 'not_started' })
    ])
    expect(h.bodies).toHaveLength(0)
  })
})

describe('AUD-0599 F01 — single-pass preserva o motivo após reserva e log perdido', () => {
  for (const afterReserve of [false, true]) {
    const label = afterReserve ? 'depois da reserva' : 'antes da reserva'
    it(`guarda nega ${label}: INSUFFICIENT_EVIDENCE com o motivo, sem efeito`, async () => {
      const bodies: string[] = []
      const tool = syntheticTool(true, bodies)
      const authority = new ApprovalAuthorityEngine()
      const adapter = new DurableApprovalEngineAdapter(authority)
      const operationKey = 'single.synthetic'
      const pending = await adapter.request({
        tenantId: input.tenantId,
        agentId: input.agent.id,
        operationKey,
        toolId: tool.id,
        summary: tool.description,
        correlationId: input.correlationId,
        executionRef: executionId,
        operatorId: input.agent.id,
        agentVersion: input.agent.version,
        action: 'tool.execute',
        resource: { type: 'tool', id: tool.id },
        payload: {},
        policyVersion: 'v1'
      })
      const approvalId = pending.approvalId!
      authority.approve(input.tenantId, approvalId, {
        approverId: 'operator.synthetic.independent'
      })
      let reserved = false
      const logs = closingLog()
      logs.failClosing(true)
      const runtime = await KernelRuntime.boot(
        standardKernelPlugins({
          orchestrator: {
            decideNextStep: async () => ({
              action: 'CALL_TOOL',
              toolInvocation: { toolId: tool.id, input: {}, operationKey }
            })
          },
          modelGateway: new ScriptedModelGateway({ responses: ['unused'] }),
          policy: {
            evaluate: async () => ({
              outcome: 'ALLOW',
              reason: 'synthetic',
              policyVersion: 'v1'
            })
          },
          approvals: {
            request: (request) => adapter.request(request),
            execution: {
              ...adapter.execution,
              begin: async (request) => {
                const handle = await adapter.execution.begin(request)
                reserved = true
                return handle
              }
            }
          },
          tools: { list: () => [tool], resolve: () => tool },
          audit: { append: async () => undefined },
          telemetry: { record: () => undefined },
          log: logs.log,
          plugins: [
            {
              name: 'control.deny.synthetic',
              kind: 'control',
              apply: (ctx) => {
                ctx.guard(() =>
                  !afterReserve || reserved ? DENIAL : undefined
                )
              }
            }
          ]
        })
      )
      try {
        const result = await runtime.execute({
          ...input,
          runtimeProfile: 'single_pass'
        })
        expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
        expect(result.response).toContain('Kernel log could not record')
        expect(result.response).toContain(DENIAL)
        expect(bodies).toHaveLength(0)
        expect(logs.closing()).toHaveLength(1)
        expect(authority.get(input.tenantId, approvalId).status).toBe(
          afterReserve ? 'FAILED' : 'APPROVED'
        )
      } finally {
        await runtime.dispose()
      }
    })
  }
})
