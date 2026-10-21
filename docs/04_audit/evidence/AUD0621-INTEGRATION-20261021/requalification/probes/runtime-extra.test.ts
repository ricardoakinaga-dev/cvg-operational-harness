// Crítico AUD0621-REQUALIFY-20261021: complementos das sondas do auditor que
// abortavam antes de registrar (gateway lança agora) e o caso só-prazo do F03.
import { it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { createOperationalHarness } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/harness/src/createOperationalHarness.ts'
import { HybridOrchestrator, ScriptedModelGateway } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/orchestrator/src/index.ts'
import { DefaultContextEngine } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/harness/src/context-engine.ts'
import { InMemoryExecutionStepStore } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/harness/src/step-store.ts'
import { phase3RuntimeInput, createPhase3ToolRegistry, ScriptedPolicyEngine, InMemoryApprovalEngine, RecordingAuditSink, RecordingTelemetrySink } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/harness/src/__tests__/fixtures/phase3-fixtures.ts'
import { ModelGateway } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/model-gateway/src/gateway.ts'
import { PromptRegistry } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/model-gateway/src/prompt-registry.ts'
import { DeterministicModelProvider } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/model-gateway/src/providers/deterministic.ts'

const records: unknown[] = []
function record(name: string, data: any) { records.push({ name, ...data }); writeFileSync('/mnt/dados/cvg-work/aud0621-int-runtime/critic/out/runtime-extra-probes.json', JSON.stringify(records, null, 2) + '\n') }
const stop = JSON.stringify({ decisionType: 'STOP', reasonCode: 'USER_REQUESTED_STOP' })
function composition(extra: any = {}) {
  return { modelGateway: new ScriptedModelGateway({ responses: ['unused'] }), tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }), policy: new ScriptedPolicyEngine(), approvals: new InMemoryApprovalEngine(), audit: new RecordingAuditSink(), telemetry: new RecordingTelemetrySink(), stepStore: new InMemoryExecutionStepStore(), ...extra }
}

it('F03 deadline only: blocked context build ends MAX_DURATION before release, 0 orchestrator calls', async () => {
  let release: any; let calls = 0
  const building = new Promise((resolve) => { release = resolve }); const fallback = new DefaultContextEngine()
  const h = createOperationalHarness(composition({ contextEngine: { build: async (input: any) => { await building; return fallback.build(input) } }, iterativeOrchestrator: { decide: async () => { calls++; return { decision: JSON.parse(stop) } } } }))
  const original = phase3RuntimeInput(); let settled = false; const begin = Date.now()
  const pending = h.execute({ ...original, budget: { ...original.budget, maxDurationMs: 40 } }).then((r) => { settled = true; return r })
  await new Promise((r) => setTimeout(r, 150)); const settledBeforeRelease = settled
  release(); const result: any = await pending
  record('context-deadline-only', { elapsedMs: Date.now() - begin, settledBeforeRelease, orchestratorCalls: calls, stopReason: result.stopReason, response: result.response })
  expect(settledBeforeRelease).toBe(true); expect(calls).toBe(0); expect(result.stopReason).toBe('MAX_DURATION')
})

it('F04 deadline during decision aborts the orchestrator signal', async () => {
  let signal: AbortSignal | undefined; let release: any
  const deciding = new Promise<any>((resolve) => { release = resolve })
  const h = createOperationalHarness(composition({ iterativeOrchestrator: { decide: async (input: any) => { signal = input.signal; return deciding } } }))
  const original = phase3RuntimeInput(); let settled = false
  const pending = h.execute({ ...original, budget: { ...original.budget, maxDurationMs: 60 } }).then((r) => { settled = true; return r })
  await new Promise((r) => setTimeout(r, 200)); const obs = { settled, aborted: signal?.aborted }
  release({ decision: JSON.parse(stop) }); const result: any = await pending
  record('decision-deadline', { ...obs, stopReason: result.stopReason })
  expect(obs.settled).toBe(true); expect(obs.aborted).toBe(true); expect(result.stopReason).toBe('MAX_DURATION')
})

it('F02 tokens: maxTokens below the first invalid answer stops without repair call', async () => {
  let calls = 0
  const h = createOperationalHarness(composition({ iterativeOrchestrator: new HybridOrchestrator({ maxDecisionRepairs: 5, decisionModel: { complete: async () => { calls++; return { text: 'malformed', inputTokens: 500, outputTokens: 500, costUsd: 0.01, provider: 'synthetic' } } } }) }))
  const original = phase3RuntimeInput(); const result: any = await h.execute({ ...original, budget: { ...original.budget, maxTokens: 100, maxModelCalls: 10, maxDecisionRepairs: 3 } })
  record('tokens-overrun', { calls, stopReason: result.stopReason, usage: result.usage, modelCalls: result.modelCalls })
  expect(calls).toBe(1); expect(result.stopReason).toBe('MAX_TOKENS'); expect(result.modelCalls).toBe(1)
})

function gateway() {
  let calls = 0, providerSignal: boolean | undefined
  const prompts = new PromptRegistry(); prompts.register({ promptId: 'audit-safe', version: '1.0.0', content: 'Synthetic administrative text only', owner: 'audit', approvedBy: 'audit-reviewer', status: 'approved', effectiveFrom: '2026-09-01T00:00:00.000Z', classification: 'INTERNAL' } as any)
  const provider = new DeterministicModelProvider({ respond: (r: any) => { calls++; providerSignal = r.signal.aborted; return { text: 'safe', usage: { inputTokens: 1, outputTokens: 1 }, providerId: 'deterministic', model: 'deterministic-v1', externalCall: false } } } as any)
  const profile = (maxCostUsd: number) => ({ fast: { name: 'fast', providerId: 'deterministic', model: 'deterministic-v1', location: 'local', temperature: 0, maxTokens: 512, timeoutMs: 1000, maxCostUsd, estimatedCostUsd: 0.1, maxRetries: 0, pricing: { inputPer1kUsd: 1, outputPer1kUsd: 1 } } })
  const request = { requestId: 'audit-req', tenantId: 'tenant_00000000-0000-4000-8000-000000000001', correlationId: 'audit-corr', promptId: 'audit-safe', promptVersion: '1.0.0', modelProfile: 'fast' as const, dataClassification: 'INTERNAL' as const, input: { messages: [{ role: 'user' as const, content: 'Synthetic administrative text' }] } }
  return { make: (c: number) => new ModelGateway({ providers: [provider], profiles: profile(c) as any, prompts }), request, state: () => ({ calls, providerSignal }) }
}
async function settle(p: Promise<any>) { try { const v = await p; return { ok: true, costUsd: v.costUsd } } catch (e: any) { return { ok: false, code: e?.code, message: e?.message } } }

it('F13: pre-aborted signal reaches no provider', async () => {
  const x = gateway(); const out = await settle(x.make(1).generate({ ...x.request, signal: AbortSignal.abort() } as any))
  record('gateway-pre-abort-adapted', { ...x.state(), out }); expect(x.state().calls).toBe(0); expect(out.ok).toBe(false); expect(out.code).toBe('cancelled')
})

it('F14: request ceiling 0 and profile ceiling 0 deny before provider; each alone also denies', async () => {
  const x = gateway()
  const both = await settle(x.make(0).generate({ ...x.request, maxCostUsd: 0 } as any))
  const requestOnly = await settle(x.make(1).generate({ ...x.request, maxCostUsd: 0 } as any))
  const profileOnly = await settle(x.make(0).generate({ ...x.request } as any))
  const within = await settle(x.make(1).generate({ ...x.request, maxCostUsd: 1 } as any))
  record('gateway-cost-ceiling-adapted', { calls: x.state().calls, both, requestOnly, profileOnly, within })
  expect(both.code).toBe('budget_exceeded'); expect(requestOnly.code).toBe('budget_exceeded'); expect(profileOnly.code).toBe('budget_exceeded')
  expect(within.ok).toBe(true); expect(x.state().calls).toBe(1)
})
