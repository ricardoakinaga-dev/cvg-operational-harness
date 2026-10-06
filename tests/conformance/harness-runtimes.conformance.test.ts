import { describe, expect, it } from 'vitest'
import type {
  ApprovalEngine,
  AuditEvent,
  AuditSink,
  HarnessRuntime,
  ModelGateway,
  ModelRequest,
  PolicyDecision,
  PolicyEngine,
  RuntimeInput,
  TelemetryEvent,
  ToolDefinition,
  ToolRegistry
} from '@cvg/harness-contracts'
import {
  ScriptedModelGateway,
  ScriptedOrchestrator
} from '@cvg/harness-orchestrator'
import { SinglePassGovernedRuntime } from '../../packages/harness/src/runtime.ts'
import { IterativeGovernedRuntime } from '../../packages/harness/src/iterative-runtime.ts'
import { DefaultContextEngine } from '../../packages/harness/src/context-engine.ts'
import { InMemoryExecutionStepStore } from '../../packages/harness/src/step-store.ts'
import {
  InMemoryKernelLog,
  InMemoryPauseSwitch,
  KernelBootError,
  KernelRuntime,
  standardKernelPlugins,
  type KernelPlugin,
  type StandardKernelOptions
} from '../../packages/harness/src/kernel/index.ts'

/**
 * KERNEL-PLUGINS-20261006 — suíte de conformidade da SPEC 0181. Invariantes
 * derivadas do DeepSeek Harness (ADR-011), executadas contra o kernel de
 * plugins, o single-pass (agora fachada do kernel) e o iterativo (ainda
 * independente até o KPLG-004). Lacuna testável que continua aberta usa
 * `it.fails`: o teste descreve o comportamento exigido e passa a falhar,
 * avisando, quando a lacuna for fechada.
 */

const TOOL = 'synthetic.conformance.write'
const TENANT = 'tenant_00000000-0000-4000-8000-000000000096'
const USER_MESSAGE = 'synthetic conformance request'

type Kind = 'kernel' | 'single_pass' | 'iterative'
const ON_KERNEL = (kind: Kind) => kind !== 'iterative'

interface Setup {
  readonly policy?: PolicyEngine
  readonly approvals?: ApprovalEngine
  readonly audit?: AuditSink
  readonly execute?: ToolDefinition['execute']
  readonly requiresApproval?: boolean
  readonly budget?: Partial<RuntimeInput['budget']>
  /** Plan a model-composed answer instead of a tool call. */
  readonly respond?: boolean
  readonly signal?: AbortSignal
}

class Audit implements AuditSink {
  readonly events: AuditEvent[] = []
  async append(event: AuditEvent): Promise<void> {
    this.events.push(event)
  }
}

class Telemetry {
  readonly events: TelemetryEvent[] = []
  record(event: TelemetryEvent): void {
    this.events.push(event)
  }
}

class RecordingModel implements ModelGateway {
  readonly requests: ModelRequest[] = []
  readonly #inner = new ScriptedModelGateway({ responses: ['composed'] })
  complete(request: ModelRequest) {
    this.requests.push(request)
    return this.#inner.complete(request)
  }
}

function policy(outcome: PolicyDecision['outcome']): PolicyEngine {
  return {
    evaluate: async () => ({
      outcome,
      reason: `synthetic ${outcome}`,
      policyVersion: 'conformance-v1'
    })
  }
}

const denyingApprovals: ApprovalEngine = {
  request: async () => ({ status: 'DENIED', reason: 'synthetic denial' })
}

function runtimeInput(kind: Kind, setup: Setup): RuntimeInput {
  return {
    agent: {
      id: 'agent.conformance' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'Synthetic conformance goal.',
      instructions: ['synthetic only'],
      skills: [],
      tools: [TOOL],
      policies: ['synthetic-only']
    },
    tenantId: TENANT as RuntimeInput['tenantId'],
    executionId: 'exec_conformance',
    conversationId:
      'conversation_conformance' as RuntimeInput['conversationId'],
    sessionId: 'session_conformance' as RuntimeInput['sessionId'],
    correlationId: 'correlation_conformance' as RuntimeInput['correlationId'],
    traceId: 'trace_conformance' as RuntimeInput['traceId'],
    userMessage: USER_MESSAGE,
    context: {
      values: {},
      sourceIds: ['conformance'],
      capturedAt: '2026-10-06T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-10-06T00:00:00.000Z' },
    budget: {
      maxSteps: 8,
      maxModelCalls: 4,
      maxToolCalls: 4,
      maxDurationMs: 30_000,
      maxCostUsd: 1,
      maxTokens: 4_000,
      maxKnowledgeCalls: 3,
      maxReplans: 2,
      maxVerificationCalls: 3,
      maxDecisionRepairs: 1,
      ...setup.budget
    },
    runtimeProfile: kind === 'iterative' ? 'iterative' : 'single_pass',
    ...(setup.signal ? { signal: setup.signal } : {})
  }
}

function build(kind: Kind, setup: Setup = {}) {
  const executions: string[] = []
  const tool: ToolDefinition = {
    id: TOOL,
    version: 'v1',
    description: 'Synthetic conformance write',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'LOW',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval: setup.requiresApproval ?? false,
    execute:
      setup.execute ??
      (async () => {
        executions.push('executed')
        return { status: 'SUCCEEDED', output: { ok: true } }
      })
  }
  const tools: ToolRegistry = {
    list: () => [tool],
    resolve: (id) => (id === tool.id ? tool : undefined)
  }
  const audit = setup.audit ?? new Audit()
  const telemetry = new Telemetry()
  const model = new RecordingModel()
  const log = new InMemoryKernelLog()
  const common = {
    modelGateway: model,
    policy: setup.policy ?? policy('ALLOW'),
    approvals: setup.approvals ?? denyingApprovals,
    tools,
    audit,
    telemetry
  }
  const singlePassPlanner = {
    decideNextStep: async () =>
      setup.respond
        ? ({ action: 'RESPOND' } as const)
        : ({
            action: 'CALL_TOOL',
            toolInvocation: {
              toolId: TOOL,
              input: {},
              operationKey: 'conformance-op'
            }
          } as const)
  }
  let runtime: HarnessRuntime
  if (kind === 'kernel') {
    runtime = KernelRuntime.lazy(
      standardKernelPlugins({ ...common, orchestrator: singlePassPlanner, log })
    )
  } else if (kind === 'single_pass') {
    runtime = new SinglePassGovernedRuntime({
      ...common,
      orchestrator: singlePassPlanner,
      log
    })
  } else {
    runtime = new IterativeGovernedRuntime({
      ...common,
      orchestrator: new ScriptedOrchestrator({
        script: setup.respond
          ? [
              {
                decisionType: 'RESPOND',
                reasonCode: 'GOAL_SATISFIED',
                responseIntent: 'answer'
              }
            ]
          : [
              {
                decisionType: 'CALL_TOOL',
                reasonCode: 'TOOL_REQUIRED',
                toolId: TOOL,
                toolInput: {}
              },
              {
                decisionType: 'RESPOND',
                reasonCode: 'GOAL_SATISFIED',
                responseText: 'ok'
              }
            ]
      }),
      stepStore: new InMemoryExecutionStepStore(),
      contextEngine: new DefaultContextEngine()
    })
  }
  return {
    run: () => runtime.execute(runtimeInput(kind, setup)),
    executions,
    audit,
    telemetry,
    model,
    log
  }
}

const failing = (message: string) => async () => {
  throw new Error(message)
}

describe.each<Kind>(['kernel', 'single_pass', 'iterative'])(
  'conformidade SPEC 0181 — runtime %s',
  (kind) => {
    it('controle: caminho feliz executa a ferramenta uma vez e audita', async () => {
      const h = build(kind)
      const result = await h.run()
      expect(h.executions).toEqual(['executed'])
      expect(result.toolCalls).toBe(1)
      expect((h.audit as Audit).events.length).toBeGreaterThan(0)
    })

    it('C01/I3 — negação da política impede a execução', async () => {
      const h = build(kind, { policy: policy('DENY') })
      const result = await h.run()
      expect(h.executions).toEqual([])
      expect(result.toolCalls).toBe(0)
    })

    it('C03/I4 — canal de aprovação indisponível vira negação', async () => {
      const h = build(kind, {
        policy: policy('REQUIRE_APPROVAL'),
        approvals: { request: failing('approval channel down') }
      })
      const result = await h.run()
      expect(h.executions).toEqual([])
      expect(result.stopReason).not.toBe('COMPLETED')
    })

    it('C03/I4 — aprovação pendente não executa', async () => {
      const h = build(kind, {
        policy: policy('REQUIRE_APPROVAL'),
        approvals: {
          request: async () => ({ status: 'PENDING', reason: 'waiting' })
        }
      })
      const result = await h.run()
      expect(h.executions).toEqual([])
      expect(result.stopReason).toBe('APPROVAL_REQUIRED')
    })

    it('C05/I5 — exceção da ferramenta vira TOOL_FAILURE auditado uma vez', async () => {
      const h = build(kind, { execute: failing('boom') })
      const result = await h.run()
      expect(result.stopReason).toBe('TOOL_FAILURE')
      const finals = (h.audit as Audit).events.filter(
        (event) => event.result === 'TOOL_FAILURE'
      )
      expect(finals).toHaveLength(1)
    })

    it('C05/I5 — chamada registrada antes de executar', async () => {
      const order: string[] = []
      const h = build(kind, {
        execute: async () => {
          order.push(
            ON_KERNEL(kind)
              ? `log:${h.log.events.map((event) => event.type).join(',')}`
              : 'body'
          )
          return { status: 'SUCCEEDED', output: { ok: true } }
        }
      })
      await h.run()
      if (ON_KERNEL(kind)) {
        expect(order[0]).toContain('tool/call')
        expect(order[0]).not.toContain('tool/result')
      } else {
        const results = (h.audit as Audit).events.map((event) => event.result)
        expect(results.some((value) => /RUNNING/.test(value))).toBe(true)
      }
    })

    const modelRequestLogged = async () => {
      const h = build(kind, { respond: true })
      await h.run()
      expect(h.model.requests.length).toBeGreaterThan(0)
      const logged = JSON.stringify([
        h.log.events,
        (h.audit as Audit).events,
        h.telemetry.events
      ])
      expect(logged).toContain(USER_MESSAGE)
    }
    if (ON_KERNEL(kind)) {
      it(
        'C06/I6 — requisição ao modelo registrada antes do envio',
        modelRequestLogged
      )
    } else {
      // O iterativo não registra a requisição; fecha no KPLG-004.
      it.fails(
        'C06/I6 — requisição ao modelo registrada (LACUNA iterativo)',
        modelRequestLogged
      )
    }

    it('C07/I7 — exceção da política não derruba o processo nem executa', async () => {
      const h = build(kind, { policy: { evaluate: failing('policy down') } })
      const result = await h.run()
      expect(h.executions).toEqual([])
      expect(result.stopReason).not.toBe('COMPLETED')
    })

    const cancelledBeforeDispatch = async () => {
      const controller = new AbortController()
      controller.abort()
      const h = build(kind, { signal: controller.signal })
      const result = await h.run()
      expect(h.executions).toEqual([])
      expect(result.stopReason).toBe('CANCELLED')
    }
    if (ON_KERNEL(kind)) {
      it('C08/I8 — cancelamento antes do despacho', cancelledBeforeDispatch)
    } else {
      // O iterativo ignora `RuntimeInput.signal`; fecha no KPLG-004.
      it.fails(
        'C08/I8 — cancelamento antes do despacho (LACUNA iterativo)',
        cancelledBeforeDispatch
      )
    }

    it('C09/I9 — aprovação concedida sem porta de uso único é recusada', async () => {
      const h = build(kind, {
        requiresApproval: true,
        policy: policy('REQUIRE_APPROVAL'),
        approvals: {
          request: async () => ({
            status: 'APPROVED',
            approvalId: 'approval-without-port' as never,
            reason: 'approved'
          })
        }
      })
      const result = await h.run()
      expect(h.executions).toEqual([])
      expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    })

    it('C10/I10 — auditoria falhando após efeito não vira sucesso silencioso', async () => {
      const h = build(kind, { audit: { append: failing('audit down') } })
      const result = await h.run()
      expect(h.executions).toEqual(['executed'])
      expect(result.stopReason).not.toBe('COMPLETED')
    })

    it('C11/I11 — orçamento de ferramenta zero impede a execução', async () => {
      const h = build(kind, { budget: { maxToolCalls: 0 } })
      const result = await h.run()
      expect(h.executions).toEqual([])
      expect(result.stopReason).toBe('MAX_TOOL_CALLS')
    })
  }
)

// ------------------------------------------------ invariantes só do kernel

function kernelOptions(
  overrides: Partial<StandardKernelOptions> = {}
): StandardKernelOptions & { executions: string[] } {
  const executions: string[] = []
  const tool: ToolDefinition = {
    id: TOOL,
    version: 'v1',
    description: 'Synthetic conformance write',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'LOW',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval: false,
    execute: async () => {
      executions.push('executed')
      return { status: 'SUCCEEDED', output: { ok: true } }
    }
  }
  return {
    executions,
    orchestrator: {
      decideNextStep: async () => ({
        action: 'CALL_TOOL',
        toolInvocation: { toolId: TOOL, input: {}, operationKey: 'k-op' }
      })
    },
    modelGateway: new ScriptedModelGateway({ responses: ['unused'] }),
    policy: policy('ALLOW'),
    approvals: denyingApprovals,
    tools: {
      list: () => [tool],
      resolve: (id) => (id === TOOL ? tool : undefined)
    },
    audit: new Audit(),
    telemetry: new Telemetry(),
    ...overrides
  }
}

describe('conformidade SPEC 0181 — invariantes do kernel de plugins', () => {
  it('C02/I3 — guarda posterior nega mesmo com a política permitindo', async () => {
    const options = kernelOptions()
    const denyAll: KernelPlugin = {
      name: 'control.deny-all',
      kind: 'control',
      apply: (ctx) => void ctx.guard(() => 'synthetic guard denial')
    }
    const runtime = await KernelRuntime.boot(
      standardKernelPlugins({ ...options, plugins: [denyAll] })
    )
    const result = await runtime.execute(runtimeInput('kernel', {}))
    expect(options.executions).toEqual([])
    expect(result).toMatchObject({
      stopReason: 'POLICY_DENIED',
      response: 'synthetic guard denial'
    })
  })

  it('C02/I3 — capacidade posterior não desfaz negação da política', async () => {
    const options = kernelOptions({ policy: policy('DENY') })
    const tryAllow: KernelPlugin = {
      name: 'capability.try-allow',
      kind: 'capability',
      apply: (ctx) =>
        void ctx.on('tool/pre-execute', async () => ({ kind: 'proceed' }))
    }
    const runtime = await KernelRuntime.boot(
      standardKernelPlugins({ ...options, plugins: [tryAllow] })
    )
    const result = await runtime.execute(runtimeInput('kernel', {}))
    expect(options.executions).toEqual([])
    expect(result.stopReason).toBe('POLICY_DENIED')
  })

  it('C07/I7 — listener que lança exceção vira desfecho normalizado', async () => {
    const options = kernelOptions()
    const broken: KernelPlugin = {
      name: 'capability.broken',
      kind: 'capability',
      apply: (ctx) =>
        void ctx.on('tool/pre-execute', async () => {
          throw new Error('listener exploded')
        })
    }
    const runtime = await KernelRuntime.boot(
      standardKernelPlugins({ ...options, plugins: [broken] })
    )
    const result = await runtime.execute(runtimeInput('kernel', {}))
    expect(options.executions).toEqual([])
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.response).toContain('capability.broken')
  })

  it('C12/I12 — pausa impede novo passo e retomada volta a executar', async () => {
    const pause = new InMemoryPauseSwitch()
    const options = kernelOptions({ pause })
    const runtime = await KernelRuntime.boot(standardKernelPlugins(options))
    pause.pause(TENANT)
    const paused = await runtime.execute(runtimeInput('kernel', {}))
    expect(paused.stopReason).toBe('HUMAN_TAKEOVER')
    expect(options.executions).toEqual([])
    pause.resume(TENANT)
    const resumed = await runtime.execute(runtimeInput('kernel', {}))
    expect(resumed.stopReason).toBe('COMPLETED')
    expect(options.executions).toEqual(['executed'])
  })

  it('C12/I12 — pausa durante o turno impede o efeito ainda não iniciado', async () => {
    const pause = new InMemoryPauseSwitch()
    const options = kernelOptions({
      pause,
      policy: {
        evaluate: async () => {
          pause.pause(TENANT)
          return { outcome: 'ALLOW', reason: 'ok', policyVersion: 'v1' }
        }
      }
    })
    const runtime = await KernelRuntime.boot(standardKernelPlugins(options))
    const result = await runtime.execute(runtimeInput('kernel', {}))
    expect(result.stopReason).toBe('HUMAN_TAKEOVER')
    expect(options.executions).toEqual([])
  })

  it('C13/I1 — boot recusado sem um controle obrigatório', async () => {
    const plugins = standardKernelPlugins(kernelOptions()).filter(
      (plugin) => plugin.name !== 'control.audit'
    )
    await expect(KernelRuntime.boot(plugins)).rejects.toMatchObject({
      code: 'missing_service'
    })
  })

  it('C13/I1 — fachada sem controle obrigatório falha fechada, sem executar', async () => {
    const options = kernelOptions()
    const plugins = standardKernelPlugins(options).filter(
      (plugin) => plugin.name !== 'control.pause'
    )
    const result = await KernelRuntime.lazy(plugins).execute(
      runtimeInput('kernel', {})
    )
    expect(result.stopReason).toBe('INTERNAL_FAILURE')
    expect(options.executions).toEqual([])
  })

  it('C14/I2 — capacidade não registra guarda', async () => {
    const sneaky: KernelPlugin = {
      name: 'capability.sneaky-guard',
      kind: 'capability',
      apply: (ctx) => void ctx.guard(() => undefined)
    }
    await expect(
      KernelRuntime.boot(
        standardKernelPlugins({ ...kernelOptions(), plugins: [sneaky] })
      )
    ).rejects.toMatchObject({ code: 'guard_from_capability' })
  })

  it('C14/I2 — capacidade não fornece serviço de controle', async () => {
    const fakeAudit: KernelPlugin = {
      name: 'capability.fake-audit',
      kind: 'capability',
      provides: ['audit'],
      apply: (ctx) => void ctx.provide('audit', new Audit())
    }
    const plugins = standardKernelPlugins(kernelOptions()).filter(
      (plugin) => plugin.name !== 'control.audit'
    )
    await expect(
      KernelRuntime.boot([...plugins, fakeAudit])
    ).rejects.toBeInstanceOf(KernelBootError)
  })

  it('C14/I2 — host selado não aceita registro depois do boot', async () => {
    let captured: Parameters<KernelPlugin['apply']>[0] | undefined
    const capture: KernelPlugin = {
      name: 'control.capture',
      kind: 'control',
      apply: (ctx) => {
        captured = ctx
      }
    }
    await KernelRuntime.boot(
      standardKernelPlugins({ ...kernelOptions(), plugins: [capture] })
    )
    expect(() => captured?.guard(() => undefined)).toThrow(/sealed/)
  })
})
