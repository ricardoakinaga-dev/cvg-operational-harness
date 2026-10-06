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
  InMemoryKernelLog,
  InMemoryPauseSwitch
} from '../../packages/harness/src/kernel/index.ts'
import {
  PHASE3_TOOL_RESERVE,
  phase3RuntimeInput
} from '../../packages/harness/src/__tests__/fixtures/phase3-fixtures.ts'
import { DurableApprovalEngineAdapter } from '../../packages/persistence/src/operational-approval-adapter.ts'

/**
 * AUD-0598 R01/R02 — pausa e retomada (I12) com o `DurableApprovalEngineAdapter`
 * e a máquina de estados `ApprovalEngine` reais, em memória. Um mock da porta de
 * execução aceita qualquer novo `begin` e esconde o estado da aprovação; aqui a
 * aprovação precisa continuar utilizável, com uso único (I4/I9).
 */

const input = phase3RuntimeInput()
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

interface Options {
  /** Runs when the in-flight checkpoint of the approved call is saved. */
  readonly onDispatchCheckpoint?: () => void
  /** Runs right after the durable reservation is taken. */
  readonly onReserved?: () => void
  readonly maxToolCalls?: number
}

function durable(options: Options = {}) {
  const bodies: string[] = []
  const pause = new InMemoryPauseSwitch()
  const effects = new InMemoryEffectLedger()
  const log = new InMemoryKernelLog()
  const authority = new ApprovalAuthorityEngine()
  const adapter = new DurableApprovalEngineAdapter(authority)
  const approved = () =>
    authority
      .list(input.tenantId)
      .some((record) => record.status === 'APPROVED')
  class Store extends InMemoryExecutionStepStore {
    override async saveCheckpoint(checkpoint: ExecutionCheckpoint) {
      await super.saveCheckpoint(checkpoint)
      if (checkpoint.state.pendingDecision && approved()) {
        options.onDispatchCheckpoint?.()
      }
    }
  }
  const approvals: ApprovalEngine = {
    request: (request) => adapter.request(request),
    execution: {
      ...adapter.execution,
      begin: async (request) => {
        const handle = await adapter.execution.begin(request)
        options.onReserved?.()
        return handle
      }
    }
  }
  const tool: ToolDefinition = {
    id: PHASE3_TOOL_RESERVE,
    version: 'v1',
    description: 'synthetic only',
    inputSchema: {},
    outputSchema: {},
    risk: 'LOW',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval: true,
    execute: async () => {
      bodies.push('body')
      return { status: 'SUCCEEDED', output: { ok: true } }
    }
  }
  const runtime = new IterativeGovernedRuntime({
    orchestrator: new ScriptedOrchestrator({ script: [callTool, respond] }),
    modelGateway: new ScriptedModelGateway({ responses: ['synthetic'] }),
    policy: {
      evaluate: async () => ({
        outcome: 'ALLOW',
        reason: 'synthetic',
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
    stepStore: new Store(),
    pause,
    effects,
    log
  })
  const run = (overrides: Partial<RuntimeInput> = {}) =>
    runtime.execute({
      ...input,
      budget: {
        ...input.budget,
        maxToolCalls: options.maxToolCalls ?? input.budget.maxToolCalls
      },
      ...overrides
    })
  /** Runs to the approval wait and approves it as an independent operator. */
  const approve = async () => {
    const first = await run()
    expect(first.stopReason).toBe('APPROVAL_REQUIRED')
    const approvalId = authority.list(input.tenantId)[0]!.approvalId
    authority.approve(input.tenantId, approvalId, {
      approverId: 'operator.synthetic.independent'
    })
    const status = () => authority.get(input.tenantId, approvalId).status
    const resume = {
      resume: { kind: 'approval', approvalId: approvalId as never }
    } as const
    return { status, resume }
  }
  return { run, approve, bodies, pause, effects, log, authority }
}

describe('SPEC 0181 I12 — pausa e retomada com aprovação durável real', () => {
  it('controle: aprovação durável conclui uma vez sem pausa', async () => {
    const h = durable()
    const { status, resume } = await h.approve()
    const completed = await h.run(resume)
    expect(completed.stopReason).toBe('COMPLETED')
    expect(status()).toBe('EXECUTED')
    expect(h.bodies).toHaveLength(1)
  })

  it('R01: pausa depois da reserva devolve a aprovação e a retomada executa uma vez', async () => {
    let pauseOnReserve = true
    const h = durable({
      onReserved: () => {
        if (pauseOnReserve) h.pause.pause(input.tenantId)
      }
    })
    const { status, resume } = await h.approve()

    const paused = await h.run(resume)
    expect(paused.stopReason).toBe('HUMAN_TAKEOVER')
    expect(h.bodies).toHaveLength(0)
    expect(h.effects.entries).toEqual([])
    // Sem efeito comprovado: a aprovação volta a ser utilizável, não FAILED.
    expect(status()).toBe('APPROVED')

    pauseOnReserve = false
    h.pause.resume(input.tenantId)
    const resumed = await h.run(resume)
    expect(resumed.stopReason).toBe('COMPLETED')
    expect(resumed.toolCalls).toBe(1)
    expect(h.bodies).toHaveLength(1)
    expect(status()).toBe('EXECUTED')

    // Uso único preservado: a execução concluída não roda de novo.
    const replay = await h.run(resume)
    expect(replay.stopReason).not.toBe('COMPLETED')
    expect(h.bodies).toHaveLength(1)
    expect(status()).toBe('EXECUTED')
  })

  it('R01: pausas repetidas depois da reserva nunca executam nem consomem a aprovação', async () => {
    const h = durable({ onReserved: () => h.pause.pause(input.tenantId) })
    const { status, resume } = await h.approve()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const paused = await h.run(resume)
      expect(paused.stopReason).toBe('HUMAN_TAKEOVER')
      expect(status()).toBe('APPROVED')
      h.pause.resume(input.tenantId)
    }
    expect(h.bodies).toHaveLength(0)
    expect(h.effects.entries).toEqual([])
  })

  it('R02: pausa no checkpoint da chamada aprovada preserva o último slot de ferramenta', async () => {
    let pauseOnCheckpoint = true
    const h = durable({
      maxToolCalls: 1,
      onDispatchCheckpoint: () => {
        if (pauseOnCheckpoint) h.pause.pause(input.tenantId)
      }
    })
    const { status, resume } = await h.approve()

    const paused = await h.run(resume)
    expect(paused.stopReason).toBe('HUMAN_TAKEOVER')
    expect(status()).toBe('APPROVED')
    expect(h.bodies).toHaveLength(0)

    pauseOnCheckpoint = false
    h.pause.resume(input.tenantId)
    const completed = await h.run(resume)
    expect(completed.stopReason).toBe('COMPLETED')
    expect(completed.toolCalls).toBe(1)
    expect(h.bodies).toHaveLength(1)
    expect(status()).toBe('EXECUTED')

    const replay = await h.run(resume)
    expect(replay.stopReason).not.toBe('COMPLETED')
    expect(h.bodies).toHaveLength(1)
  })

  it('R01+R02: pausa depois da reserva com orçamento de uma chamada conclui na retomada', async () => {
    let pauseOnReserve = true
    const h = durable({
      maxToolCalls: 1,
      onReserved: () => {
        if (pauseOnReserve) h.pause.pause(input.tenantId)
      }
    })
    const { status, resume } = await h.approve()
    expect((await h.run(resume)).stopReason).toBe('HUMAN_TAKEOVER')
    pauseOnReserve = false
    h.pause.resume(input.tenantId)
    const completed = await h.run(resume)
    expect(completed.stopReason).toBe('COMPLETED')
    expect(completed.toolCalls).toBe(1)
    expect(h.bodies).toHaveLength(1)
    expect(status()).toBe('EXECUTED')
  })

  it('aprovação rejeitada pelo operador encerra a espera como negação, sem executar', async () => {
    const h = durable()
    const first = await h.run()
    expect(first.stopReason).toBe('APPROVAL_REQUIRED')
    const approvalId = h.authority.list(input.tenantId)[0]!.approvalId
    h.authority.reject(input.tenantId, approvalId, {
      approverId: 'operator.synthetic.independent'
    })
    const denied = await h.run({
      resume: { kind: 'approval', approvalId: approvalId as never }
    })
    expect(denied.stopReason).toBe('POLICY_DENIED')
    expect(h.bodies).toHaveLength(0)
    expect(h.effects.entries).toEqual([])
  })

  it('aprovação expirada durante a pausa nega a retomada sem executar', async () => {
    let pauseOnCheckpoint = true
    const h = durable({
      onDispatchCheckpoint: () => {
        if (pauseOnCheckpoint) h.pause.pause(input.tenantId)
      }
    })
    const { resume } = await h.approve()
    expect((await h.run(resume)).stopReason).toBe('HUMAN_TAKEOVER')
    expect(h.authority.expireStale(new Date('2100-01-01T00:00:00.000Z'))).toBe(
      1
    )
    pauseOnCheckpoint = false
    h.pause.resume(input.tenantId)
    const denied = await h.run(resume)
    expect(denied.stopReason).toBe('POLICY_DENIED')
    expect(h.bodies).toHaveLength(0)
    expect(h.effects.entries).toEqual([])
  })
})
