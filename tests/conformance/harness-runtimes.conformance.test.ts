import { describe, expect, it } from 'vitest'
import type {
  ApprovalEngine,
  AuditEvent,
  AuditSink,
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

/**
 * KERNEL-PLUGINS-20261006 — suíte de conformidade da SPEC 0181, executada
 * contra os runtimes atuais do `packages/harness` antes do kernel de plugins.
 * Invariantes derivadas do DeepSeek Harness (ADR-011). Lacunas sem mecanismo para testar (guardas,
 * pausa, boot do kernel) ficam na auditoria 0596. Cada lacuna testável
 * usa `it.fails`: o teste descreve o comportamento exigido e passa a falhar
 * (avisando) quando a lacuna for fechada, para virar `it` comum.
 */

const TOOL = 'synthetic.conformance.write'
const TENANT = 'tenant_00000000-0000-4000-8000-000000000096'

type Kind = 'single_pass' | 'iterative'

interface Setup {
  readonly policy?: PolicyEngine
  readonly approvals?: ApprovalEngine
  readonly audit?: AuditSink
  readonly execute?: ToolDefinition['execute']
  readonly requiresApproval?: boolean
  readonly budget?: Partial<RuntimeInput['budget']>
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

function runtimeInput(kind: Kind, budget: Setup['budget']): RuntimeInput {
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
    userMessage: 'synthetic conformance request',
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
      ...budget
    },
    runtimeProfile: kind
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
  const common = {
    modelGateway: new ScriptedModelGateway({ responses: ['done'] }),
    policy: setup.policy ?? policy('ALLOW'),
    approvals: setup.approvals ?? denyingApprovals,
    tools,
    audit,
    telemetry
  }
  const runtime =
    kind === 'single_pass'
      ? new SinglePassGovernedRuntime({
          ...common,
          orchestrator: {
            decideNextStep: async () => ({
              action: 'CALL_TOOL',
              toolInvocation: {
                toolId: TOOL,
                input: {},
                operationKey: 'conformance-op'
              }
            })
          }
        })
      : new IterativeGovernedRuntime({
          ...common,
          orchestrator: new ScriptedOrchestrator({
            script: [
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
  return {
    run: () => runtime.execute(runtimeInput(kind, setup.budget)),
    executions,
    audit,
    telemetry
  }
}

const failing = (message: string) => async () => {
  throw new Error(message)
}

describe.each<Kind>(['single_pass', 'iterative'])(
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

    const preExecutionRecorded = async () => {
      const h = build(kind)
      await h.run()
      const results = (h.audit as Audit).events.map((event) => event.result)
      // Exige um registro anterior ao resultado final da ferramenta.
      expect(results.some((value) => /RUNNING/.test(value))).toBe(true)
    }
    if (kind === 'iterative') {
      it('C05/I5 — chamada registrada antes de executar', preExecutionRecorded)
    } else {
      // Single-pass só audita o desfecho final do turno.
      it.fails(
        'C05/I5 — chamada registrada antes de executar (LACUNA single-pass)',
        preExecutionRecorded
      )
    }

    // Nenhum dos runtimes registra a requisição enviada ao modelo; auditoria e
    // telemetria guardam só desfecho e métricas.
    it.fails(
      'C06/I6 — requisição ao modelo reconstruível pelo log (LACUNA)',
      async () => {
        const h = build(kind)
        await h.run()
        const logged = JSON.stringify([
          (h.audit as Audit).events,
          h.telemetry.events
        ])
        expect(logged).toContain('synthetic conformance request')
      }
    )

    it('C07/I7 — exceção da política não derruba o processo nem executa', async () => {
      const h = build(kind, {
        policy: { evaluate: failing('policy down') }
      })
      const result = await h.run()
      expect(h.executions).toEqual([])
      expect(result.stopReason).not.toBe('COMPLETED')
    })

    // RuntimeInput não aceita AbortSignal: não há como cancelar uma execução
    // em andamento pelo chamador.
    it.fails(
      'C08/I8 — cancelamento antes do despacho (LACUNA: sem signal em RuntimeInput)',
      async () => {
        const controller = new AbortController()
        controller.abort()
        const h = build(kind)
        const input = runtimeInput(kind, undefined) as RuntimeInput & {
          signal?: AbortSignal
        }
        expect('signal' in input || Object.keys(input).includes('signal')).toBe(
          true
        )
        await h.run()
        expect(h.executions).toEqual([])
      }
    )

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
