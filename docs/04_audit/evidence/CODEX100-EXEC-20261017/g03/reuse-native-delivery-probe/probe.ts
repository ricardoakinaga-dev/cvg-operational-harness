import { randomBytes } from 'node:crypto'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { createOperationalHarness } from '/tmp/cvg-codex100-exec-20261017/reuse-native-delivery-probe/source-view/packages/harness/src/createOperationalHarness.ts'
import { InMemoryExecutionStepStore } from '/tmp/cvg-codex100-exec-20261017/reuse-native-delivery-probe/source-view/packages/harness/src/step-store.ts'
import { DefaultContextEngine } from '/tmp/cvg-codex100-exec-20261017/reuse-native-delivery-probe/source-view/packages/harness/src/context-engine.ts'
import { HybridOrchestrator } from '/tmp/cvg-codex100-exec-20261017/reuse-native-delivery-probe/source-view/packages/orchestrator/src/hybrid-orchestrator.ts'
import type { RuntimeInput, ModelRequest, ToolDefinition } from '/tmp/cvg-codex100-exec-20261017/reuse-native-delivery-probe/source-view/packages/contracts/src/index.ts'

const save = (name: string, value: unknown) => writeFileSync('/work/' + name + '.json', JSON.stringify(value, null, 2) + '\n')
const limits = Object.fromEntries(['memory.max', 'memory.swap.max', 'cpu.max', 'pids.max'].map(name => [name, readFileSync('/limits/' + name, 'utf8').trim()]))
if (process.versions.node !== '22.23.2' || limits['memory.max'] !== '2147483648' || limits['memory.swap.max'] !== '0' || limits['cpu.max'] !== '100000 100000' || limits['pids.max'] !== '128') throw Error('kernel/Node guard failed')
if (process.env.PWD !== '/work' || Object.keys(process.env).some(k => !['PATH', 'LANG', 'PWD'].includes(k)) || existsSync('/home/ricardo') || existsSync('/run/user')) throw Error('environment guard failed')
if (readFileSync('/proc/net/route', 'utf8').trim().split('\n').length !== 1) throw Error('network route unexpectedly present')
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}'
}
function hasFull(value: unknown, expected: string): boolean {
  if (typeof value === 'string') {
    try { return hasFull(JSON.parse(value), expected) } catch { return false }
  }
  if (value === null || typeof value !== 'object') return false
  if (!Array.isArray(value) && canonical(value) === expected) return true
  return Object.values(value).some(child => hasFull(child, expected))
}

async function observe(mode: 'legacy' | 'complete') {
  const script = [
    { decisionType: 'CALL_TOOL', reasonCode: 'TOOL_REQUIRED', toolId: 'synthetic.native.read', toolVersion: 'v1', toolInput: {} },
    { decisionType: 'RESPOND', reasonCode: 'GOAL_SATISFIED', responseIntent: 'Give a neutral diagnostic response.' }
  ] as const
  const input: RuntimeInput = {
    agent: { id: 'agent.synthetic' as any, version: 'v1' as any, objective: 'Observe admitted synthetic READ output.', instructions: ['Synthetic diagnostic only.'], skills: [], tools: ['synthetic.native.read'], policies: ['synthetic-only'] },
    tenantId: 'tenant_synthetic' as any, executionId: 'reuse_' + mode,
    conversationId: 'conversation_synthetic' as any, sessionId: 'session_' + mode as any,
    correlationId: 'correlation_' + mode as any, traceId: 'trace_' + mode as any,
    userMessage: 'Perform the synthetic read and respond neutrally.',
    context: { values: {}, sourceIds: ['synthetic'], capturedAt: '2026-10-18T00:00:00Z' },
    state: { version: 1, values: {}, updatedAt: '2026-10-18T00:00:00Z' },
    budget: { maxSteps: 4, maxModelCalls: 3, maxToolCalls: 1, maxDurationMs: 15000, maxCostUsd: 1, maxTokens: 8000, maxKnowledgeCalls: 0, maxReplans: 0, maxVerificationCalls: 0, maxDecisionRepairs: 0 }, runtimeProfile: 'iterative'
  }
  const contexts: unknown[] = [], requests: any[] = [], toolCalls: any[] = [], audits: unknown[] = []
  let born: string | undefined
  let expected: unknown
  const tool: ToolDefinition = {
    id: 'synthetic.native.read', version: 'v1', description: 'Synthetic READ only',
    inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, risk: 'LOW',
    sideEffect: 'READ', sandbox: 'NONE', idempotent: true, requiresApproval: false,
    execute: async (toolInput, toolContext) => {
      born = randomBytes(24).toString('hex')
      expected = { nonce: born, text: 'ação\u0000🚦' + 'x'.repeat(4096) + '|TAIL:' + born, values: [false, 0, '', null, { literal: '𝄞\u0000fim' }] }
      const result = { status: 'SUCCEEDED' as const, output: expected }
      toolCalls.push({ input: structuredClone(toolInput), context: structuredClone({ ...toolContext, signal: undefined }), result })
      save(mode + '-tool-calls', toolCalls)
      return result
    }
  }
  // The provider can inspect only the true request, and returns a fixed response.
  // No closure access to the expected output is used to construct model results.
  const model = { complete: async (request: ModelRequest) => {
    requests.push({ jsonAtBoundary: JSON.stringify(request), request: structuredClone({ ...request, signal: undefined }) })
    save(mode + '-model-requests', requests)
    return { text: 'Synthetic constant response.', provider: 'synthetic', model: 'constant', inputTokens: 1, outputTokens: 1, costUsd: 0 }
  } }
  const orchestrator = new HybridOrchestrator({ decisionModel: model, decisionModelSupportsMaxOutputTokens: true, maxDecisionRepairs: 0, rules: [context => script[context.stepNumber === 1 ? 0 : 1]] })
  const steps = new InMemoryExecutionStepStore()
  const harness = createOperationalHarness({
    ...(mode === 'complete' ? { toolResultContext: { version: 1 as const } } : {}),
    iterativeOrchestrator: { contextProtocol: orchestrator.contextProtocol, decide: async args => { contexts.push(structuredClone(args.context)); save(mode + '-decision-contexts', contexts); return orchestrator.decide(args) } },
    stepStore: steps, contextEngine: new DefaultContextEngine(), modelGateway: model,
    policy: { evaluate: async () => ({ outcome: 'ALLOW' as const, reason: 'Synthetic READ only.', policyVersion: 'synthetic-v1' }) },
    approvals: { request: async () => { throw Error('Unexpected approval request') } },
    tools: { list: () => [tool], resolve: id => id === tool.id ? tool : undefined },
    audit: { append: async event => { audits.push(event) } }, telemetry: { record: () => {} }
  })
  save(mode + '-stimulus', { input, script, selectedProfile: harness.resolveProfile(input), unselectedDefault: harness.resolveProfile({ ...input, runtimeProfile: undefined }) })
  const result = await harness.execute(input)
  save(mode + '-result', result)
  save(mode + '-checkpoint', await steps.loadCheckpoint(input.tenantId, input.executionId!))
  save(mode + '-steps', await steps.listSteps(input.tenantId, input.executionId!))
  save(mode + '-audits', audits)
  const hasNonce = (value: unknown) => !!born && JSON.stringify(value).includes(born)
  const responses = requests.filter(row => row.request.purpose === 'RESPONSE')
  const summary = { mode, toolCalls: toolCalls.length, decisions: contexts.length, modelCalls: requests.length, responseRequests: responses.length,
    nonce: born, initialInputContainsNonce: hasNonce(input), staticDecisionsContainNonce: hasNonce(script), firstContextContainsNonce: hasNonce(contexts[0]),
    nextContextContainsNonce: hasNonce(contexts[1]), actualResponseRequestContainsNonce: hasNonce(responses),
    fullBodyAtResponseBoundary: expected !== undefined && responses.some(row => hasFull(row.request, canonical(expected))),
    expectedBodyCanonicalBytes: expected === undefined ? null : Buffer.byteLength(canonical(expected)), stopReason: result.stopReason,
    functionalReceipts: 0, publicHostsQualified: false, postgresOrRestartQualified: false }
  save(mode + '-summary', summary)
  if (summary.toolCalls !== 1 || summary.decisions !== 2 || summary.responseRequests !== 1 || result.stopReason !== 'COMPLETED' || summary.initialInputContainsNonce || summary.staticDecisionsContainNonce || summary.firstContextContainsNonce || !summary.nextContextContainsNonce) throw Error('Native diagnostic preconditions failed for ' + mode)
  if (summary.fullBodyAtResponseBoundary !== (mode === 'complete')) throw Error('Observed R19 response delivery differs from predicted selector behavior: ' + mode)
  return summary
}

try {
  const cases = [await observe('legacy'), await observe('complete')]
  save('summary', { kind: 'OBSERVED_R19_CORE_RECOMPOSITION_MEMORY_ONLY_NOT_PARITY', cases, functionalReceipts: 0, nativeFeatureBuild: false })
  console.log(JSON.stringify(cases.map(c => ({ mode: c.mode, fullBodyAtResponseBoundary: c.fullBodyAtResponseBoundary, stopReason: c.stopReason }))))
} catch (error) {
  save('first-failure', { name: (error as Error).name, message: (error as Error).message, stack: (error as Error).stack })
  throw error
}
