import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApprovalEngine, InMemoryApprovalStore } from '@cvg/approval-engine'
import {
  DeterministicModelProvider,
  ModelGateway,
  PromptRegistry
} from '@cvg/model-gateway'
import type { ModelProfile } from '@cvg/model-gateway'
import { PolicyEngine, REFERENCE_POLICY_PROFILE } from '@cvg/policy-engine'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import { GovernedAgentRuntime, InMemoryEffectJournal } from '@cvg/agent-runtime'
import type { GovernedTurnInput } from '@cvg/agent-runtime'

/**
 * KERNEL-PLUGINS-20261006 — suíte de conformidade da SPEC 0181 contra o
 * kernel durável do worker (`GovernedAgentRuntime`). Mesmas invariantes da
 * suíte dos runtimes do harness, sem `it.fails` restante (barra 0373).
 */

const TENANT = 'tenant_00000000-0000-4000-8000-000000000097'
const AGENT = 'agent_00000000-0000-4000-8000-000000000097'
const NOW = new Date('2026-10-06T12:00:00.000Z')
const MODEL_INPUT = 'synthetic conformance cancel'

interface Faults {
  /** Durable pause switch read by the runtime (I12). */
  readonly pause?: { paused: boolean; throws?: boolean }
  readonly policyThrows?: boolean
  readonly approvalRequestThrows?: boolean
  readonly toolThrows?: boolean
  readonly auditThrowsAfterEffect?: boolean
}

function build(faults: Faults = {}) {
  const now = () => NOW
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'conformance',
    version: '1.0.0',
    content: 'Synthetic conformance prompt.',
    owner: 'platform',
    approvedBy: 'reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId: TENANT
  })
  const profile: ModelProfile = {
    name: 'fast',
    providerId: 'deterministic',
    model: 'deterministic-v1',
    location: 'local',
    temperature: 0,
    maxTokens: 256,
    timeoutMs: 5_000,
    maxCostUsd: 1,
    estimatedCostUsd: 0,
    maxRetries: 0,
    pricing: { inputPer1kUsd: 0, outputPer1kUsd: 0 }
  }
  const modelGateway = new ModelGateway({
    providers: [
      new DeterministicModelProvider({
        respond: () => ({
          text: JSON.stringify({ text: 'PAYLOAD' }),
          usage: { inputTokens: 10, outputTokens: 5 },
          providerId: 'deterministic',
          model: 'deterministic-v1',
          externalCall: false
        })
      })
    ],
    profiles: { fast: profile },
    prompts,
    clock: now,
    retry: { maxRetries: 0 }
  })
  const approvals = new ApprovalEngine({
    store: new InMemoryApprovalStore(),
    clock: now
  })
  const policy = new PolicyEngine({
    profile: REFERENCE_POLICY_PROFILE,
    documents: [],
    clock: now
  })
  const audit = new HashChainedAuditLedger()
  const telemetry = new InMemoryTelemetry({ clock: now })
  let effectDone = false
  const toolExecutor = vi.fn(async () => {
    effectDone = true
    if (faults.toolThrows) throw new Error('boom')
    return { result: { ok: true } }
  })
  const runtime = new GovernedAgentRuntime({
    policy,
    approvals,
    modelGateway,
    telemetry,
    audit,
    toolExecutor,
    outbox: async (event) => ({ eventId: `evt_${event.idempotencyKey}` }),
    clock: now,
    effectJournal: new InMemoryEffectJournal({ clock: now }),
    effectScopes: { 'record.cancel': 'controlled_fake' },
    ...(faults.pause
      ? {
          pause: {
            isPaused: () => {
              if (faults.pause?.throws) throw new Error('pause store down')
              return faults.pause?.paused ?? false
            }
          }
        }
      : {})
  })
  // Falhas injetadas só depois do pedido de aprovação, para isolar a fase.
  const arm = () => {
    if (faults.policyThrows) {
      policy.evaluate = () => {
        throw new Error('policy down')
      }
    }
    if (faults.approvalRequestThrows) {
      approvals.request = () => {
        throw new Error('approval channel down')
      }
    }
    if (faults.auditThrowsAfterEffect) {
      const append = audit.append.bind(audit)
      audit.append = (entry) => {
        if (effectDone) throw new Error('audit down')
        return append(entry)
      }
    }
  }
  return { runtime, approvals, toolExecutor, audit, telemetry, arm }
}

function turn(overrides: Partial<GovernedTurnInput> = {}): GovernedTurnInput {
  return {
    tenantId: TENANT,
    operatorId: 'op_1',
    operatorRole: 'Supervisor',
    agentId: AGENT,
    agentVersion: 'v1',
    agentProfile: 'assistant',
    conversationId: 'conv_conformance',
    correlationId: 'corr_00000000-0000-4000-8000-000000000097',
    capability: 'record.cancel',
    action: 'record.cancel',
    resource: { type: 'record', id: 'rec_1', tenantId: TENANT },
    dataClassification: 'INTERNAL',
    prompt: { promptId: 'conformance', version: '1.0.0' },
    modelProfile: 'fast',
    modelMessages: { messages: [{ role: 'user', content: MODEL_INPUT }] },
    structuredOutput: {
      schemaName: 'Payload',
      schema: z.object({ text: z.string() })
    },
    ...overrides
  }
}

async function approved(h: ReturnType<typeof build>): Promise<string> {
  const requested = await h.runtime.runTurn(turn())
  expect(requested.outcome).toBe('approval_required')
  const approvalId = requested.approvalId ?? ''
  h.approvals.submit(TENANT, approvalId, 'op_1')
  h.approvals.approve(TENANT, approvalId, { approverId: 'op_2' })
  return approvalId
}

const auditTypes = (h: ReturnType<typeof build>) =>
  h.audit.records().map((record) => record.type)

describe('conformidade SPEC 0181 — GovernedAgentRuntime', () => {
  it('controle: escrita aprovada executa uma vez, com cadeia de auditoria válida', async () => {
    const h = build()
    const approvalId = await approved(h)
    const result = await h.runtime.runTurn(turn({ approvalId }))
    expect(result.outcome).toBe('executed')
    expect(result.auditChainValid).toBe(true)
    expect(h.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('C03/I4 — canal de aprovação indisponível vira negação', async () => {
    const h = build({ approvalRequestThrows: true })
    h.arm()
    const result = await h.runtime.runTurn(turn())
    expect(result.outcome).toBe('denied')
    expect(h.toolExecutor).not.toHaveBeenCalled()
  })

  it('C04/I4 — aprovação reapresentada para outro recurso é negada sem efeito', async () => {
    const h = build()
    const approvalId = await approved(h)
    await h.runtime.runTurn(turn({ approvalId }))
    const other = await h.runtime.runTurn(
      turn({
        approvalId,
        resource: { type: 'record', id: 'rec_2', tenantId: TENANT }
      })
    )
    expect(other.outcome).toBe('denied')
    expect(h.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('C05/I5 — exceção da ferramenta não vira sucesso e marca efeito incerto', async () => {
    const h = build({ toolThrows: true })
    const approvalId = await approved(h)
    const result = await h.runtime.runTurn(turn({ approvalId }))
    expect(result.outcome).not.toBe('executed')
    expect(auditTypes(h)).toContain('approval.uncertain')
  })

  it('C05/I5 — início do efeito registrado antes da execução', async () => {
    const h = build()
    const approvalId = await approved(h)
    await h.runtime.runTurn(turn({ approvalId }))
    const types = auditTypes(h)
    expect(types.indexOf('journal.effect_started')).toBeGreaterThan(-1)
    expect(types.indexOf('journal.effect_started')).toBeLessThan(
      types.indexOf('tool.executed')
    )
  })

  it('C06/I6 — requisição ao modelo registrada antes do envio e reconstruível pelo log', async () => {
    const h = build()
    await h.runtime.runTurn(turn())
    const records = h.audit.records()
    const requested = records.findIndex((r) => r.type === 'model.requested')
    expect(requested).toBeGreaterThan(-1)
    expect(requested).toBeLessThan(
      records.findIndex((r) => r.type === 'model.completed')
    )
    expect(records[requested]?.payload).toMatchObject({
      promptId: 'conformance',
      promptVersion: '1.0.0',
      modelProfile: 'fast',
      structuredOutputSchema: 'Payload',
      input: turn().modelMessages
    })
  })

  it('C07/I7 — exceção da política vira desfecho normalizado e auditado', async () => {
    const h = build({ policyThrows: true })
    h.arm()
    const result = await h.runtime.runTurn(turn())
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('policy_failed')
    expect(auditTypes(h)).toContain('runtime.denied')
    expect(result.auditChainValid).toBe(true)
    expect(h.toolExecutor).not.toHaveBeenCalled()
  })

  it('C08/I8 — cancelamento antes do despacho não executa', async () => {
    const h = build()
    const approvalId = await approved(h)
    const controller = new AbortController()
    controller.abort()
    const result = await h.runtime.runTurn(
      turn({ approvalId, cancelSignal: controller.signal })
    )
    expect(result.outcome).toBe('denied')
    expect(h.toolExecutor).not.toHaveBeenCalled()
  })

  // Com a auditoria fora do ar de forma persistente, a falha escapa de
  // `runTurn` depois do efeito: explícita (I10 atendida), mas não normalizada
  // (mesmo padrão do C07).
  it('C10/I10 — auditoria falhando após efeito não vira sucesso silencioso', async () => {
    const h = build({ auditThrowsAfterEffect: true })
    const approvalId = await approved(h)
    h.arm()
    const outcome = await h.runtime
      .runTurn(turn({ approvalId }))
      .then((result) => result.outcome)
      .catch((error: unknown) => `threw:${(error as Error).message}`)
    expect(h.toolExecutor).toHaveBeenCalledTimes(1)
    expect(outcome).not.toBe('executed')
  })

  it('C12/I12 — pausa antes da execução aprovada não executa nem consome a aprovação; a retomada executa uma vez', async () => {
    const pause = { paused: false }
    const h = build({ pause })
    const approvalId = await approved(h)
    pause.paused = true
    const paused = await h.runtime.runTurn(turn({ approvalId }))
    expect(paused.outcome).toBe('paused')
    expect(paused.reason).toBe('operator_paused')
    expect(h.toolExecutor).not.toHaveBeenCalled()
    expect(h.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    expect(auditTypes(h)).toContain('runtime.paused')

    pause.paused = false
    const resumed = await h.runtime.runTurn(turn({ approvalId }))
    expect(resumed.outcome).toBe('executed')
    expect(h.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('C12/I12 — pausa antes do modelo não chama o modelo nem pede aprovação', async () => {
    const h = build({ pause: { paused: true } })
    const result = await h.runtime.runTurn(turn())
    expect(result.outcome).toBe('paused')
    expect(result.modelResult).toBeUndefined()
    expect(h.approvals.list(TENANT)).toHaveLength(0)
  })

  it('C12/I12 — estado de pausa ilegível conta como pausa, sem efeito', async () => {
    const h = build({ pause: { paused: false, throws: true } })
    const result = await h.runtime.runTurn(turn())
    expect(result.outcome).toBe('paused')
    expect(result.reason).toBe('pause_state_unavailable')
    expect(h.toolExecutor).not.toHaveBeenCalled()
  })
})
