// R2 pure component probe for R1-01. Imports candidate dist modules read-only.
// No PG, network, model or file writes outside stdout.
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
const C = '/mnt/ia/cvg-claude100-journal0225-20261018'
const imp = (p) => import(pathToFileURL(C + '/' + p).href)
const ej = await imp('packages/harness/dist/effect-journal.js')
const ctr = await imp('packages/harness/dist/complete-tool-results.js')
const rec = await imp('packages/harness/dist/complete-journal-recovery.js')
const cc = await imp('packages/harness/dist/complete-checkpoint.js')
const contracts = await imp('packages/contracts/dist/index.js')
const sha = (p) => createHash('sha256').update(readFileSync(C + '/' + p)).digest('hex')
const bound = Object.fromEntries([
  'packages/harness/dist/effect-journal.js','packages/harness/dist/complete-tool-results.js',
  'packages/harness/dist/complete-journal-recovery.js','packages/harness/dist/complete-checkpoint.js',
  'packages/harness/dist/iterative-runtime.js','packages/contracts/dist/complete-json.js','packages/contracts/dist/execution-v2.js'
].map((p) => [p, sha(p)]))
const tenant = 'tenant_00000000-0000-4000-8000-00000000b901'
const executionId = 'r2-probe'
const marker = Symbol.for('cvg.journal.validated-result.v1')
const baseTool = {
  id: 'recovery.tool', version: '1', description: 'synthetic', inputSchema: { type: 'object' },
  outputSchema: {}, risk: 'LOW', sideEffect: 'NONE', idempotent: true, requiresApproval: false
}
const opKey = `${executionId}:s1:${baseTool.id}`
// Exact transform of iterative-runtime.ts:1323-1329 (complete mode) vs legacy.
const admit = (modelText, complete) => {
  const s = contracts.sanitizeLoopDecision(JSON.parse(modelText))
  return complete ? JSON.parse(ctr.completeSnapshot(s)) : s
}
async function scenario({ modelText, complete = true, recoveryOverride, fingerprintAtRecovery = 'frozen', tenantAtRecovery = tenant, opAtRecovery }) {
  const backing = new ej.InMemoryEffectJournal()
  let bodies = 0
  const bodyInputs = []
  const source = { ...baseTool, execute: async (input) => { bodies++; bodyInputs.push(JSON.stringify(input)); return { status: 'SUCCEEDED', output: { ok: true } } } }
  const base = { list: () => [source], resolve: (id) => (id === source.id ? source : undefined) }
  const reg = ctr.prepareCompleteToolRegistry(ej.createJournaledToolRegistry(base, backing, { compositionFingerprint: 'frozen', attemptIdFactory: () => 'probe' }))
  const decision = admit(modelText, complete)
  // dispatch: invocation.input = decision.toolInput ?? {}
  const r = await reg.resolve(baseTool.id).execute(decision.toolInput ?? {}, { tenantId: tenant, agentId: 'a', correlationId: 'c', traceId: 't', operationKey: opKey })
  if (r.status !== 'SUCCEEDED') throw new Error('first execute failed')
  const read = backing.get.bind(backing)
  backing.get = async (t, k) => { const rec0 = await read(t, k); if (rec0) Object.defineProperty(rec0, marker, { value: 1, enumerable: false, configurable: false, writable: false }); return rec0 }
  const writes = ['reserve', 'markStarted', 'confirm', 'fail', 'markUncertain']
  const counts = Object.fromEntries(writes.map((w) => [w, 0]))
  for (const w of writes) { const f = backing[w].bind(backing); backing[w] = async (...a) => { counts[w]++; return f(...a) } }
  // Checkpoint persistence: pending/accepted decision are serialized by the V2 canonical codec.
  const pendingFromCheckpoint = JSON.parse(contracts.canonicalizeCompleteJson(recoveryOverride ?? decision, { maxBytes: 1 << 24, maxDepth: 64, maxNodes: 1000000 }))
  const receipt = { admissionId: 'a1', tenantId: tenant, executionId, stepNumber: 1, attempt: 0, purpose: 'ORCHESTRATION', status: 'SETTLED',
    requestSha256: 'a'.repeat(64), resultSha256: 'b'.repeat(64),
    measurement: { counterId: 'toy', counterVersion: '1', provider: 'synthetic', model: 'toy', formattingVersion: '1', inputUpperBoundTokens: 2, contextWindowTokens: 10000, costUpperBoundUsd: 0 },
    reserved: { modelCalls: 1, inputTokens: 2, outputTokens: 512, costUsd: 0 }, actual: { modelCalls: 1, inputTokens: 2, outputTokens: 1, costUsd: 0 } }
  const state = { goal: 'synthetic', stepNumber: 0, pendingStepNumber: 1, pendingDecision: pendingFromCheckpoint, observations: [], openQuestions: [], resolvedInputs: {}, loopSignatures: [],
    toolResultContext: { version: 1, deliveredThroughStep: 0, pendingDecisionAdmission: null, decisionAdmissions: [receipt], acceptedDecision: { stepNumber: 1, decision: JSON.parse(JSON.stringify(pendingFromCheckpoint)), decisionAdmissionIds: ['a1'] } } }
  const run = { input: { tenantId: tenant }, executionId, startedAtMs: 0, checkpointToken: { checkpointId: 'loaded', digest: 'a'.repeat(64) }, state, observations: [],
    usage: { ...contracts.EMPTY_BUDGET_USAGE, modelCalls: 1, inputTokens: 2, outputTokens: 1, toolCalls: 1 }, stepNumber: 0, responseText: null, lastDecision: pendingFromCheckpoint,
    lastEvaluation: null, lastToolObservation: null, lastSufficiency: null, lastDecisionErrors: [], skipEvaluationOnce: false, countedSteps: new Set(), inFlightCounted: true }
  const steps = [{ tenantId: tenant, executionId, stepNumber: 1, stepType: 'TOOL', status: 'SUCCEEDED', attempt: 1, sideEffecting: true, stepId: `step_${executionId}_1_tool`,
    decisionType: 'CALL_TOOL', reasonCode: 'TOOL_REQUIRED', startedAt: '2026-10-18T00:00:00.000Z', completedAt: '2026-10-18T00:00:00.001Z', observationRefs: ['obs_recovered'] }]
  const tool = reg.resolve(baseTool.id)
  const candidate = rec.settledRecoveryCandidate(run, { checkpointVersion: 2, state }, steps, tool)
  let recoveryTool = tool
  if (fingerprintAtRecovery !== 'frozen') {
    // A different composition fingerprint over the SAME backing journal.
    const reg2 = ctr.prepareCompleteToolRegistry(ej.createJournaledToolRegistry(base, backing, { compositionFingerprint: fingerprintAtRecovery, attemptIdFactory: () => 'probe2' }))
    recoveryTool = reg2.resolve(baseTool.id)
  }
  const proof = candidate ? await ej.readNativeConfirmedEffect(recoveryTool, tenantAtRecovery, opAtRecovery ?? candidate.operationKey, candidate.pending.toolInput ?? {}) : 'NO_CANDIDATE'
  let staged = null
  if (proof && proof !== 'NO_CANDIDATE') staged = rec.stageSettledRecovery(run, candidate, proof.output, 6)
  return { candidate: Boolean(candidate), recovered: proof !== null && proof !== 'NO_CANDIDATE', proof: proof === 'NO_CANDIDATE' ? proof : proof ? 'OUTPUT' : null,
    staged: staged ? staged.lastToolObservation.payload.completion : null, bodies, bodyInputs, journalWritesAfterBody: counts,
    journalState: (await read(tenant, opKey)).state }
}
const dec = (toolInputText) => `{"decisionType":"CALL_TOOL","reasonCode":"TOOL_REQUIRED","toolId":"recovery.tool","toolVersion":"1","toolInput":${toolInputText}}`
const inputs = {
  empty: '{}',
  sortedControl: '{"a":2,"z":1}',
  topUnsorted: '{"z":1,"a":2}',
  nestedUnsorted: '{"nested":{"z":1,"a":2}}',
  integerKeys: '{"b":1,"10":2,"9":3,"a":{"2":1,"1":0}}',
  arrayOfObjects: '{"arr":[{"d":1,"c":2},{"b":[{"y":1,"x":2}]}],"0":null}',
  unicodeKeys: '{"é":1,"e":2,"Z":3,"a":4,"😀":5,"ｚ":6}',
  protoKey: '{"__proto__":{"z":1,"a":2},"y":true}',
  deep: '{"l1":{"z":{"y":{"x":{"w":{"v":[{"u":1,"t":2}]}}}},"a":0}}'
}
const out = { node: process.version, bound, positives: {}, preFixDiscrimination: {}, negatives: {}, strictness: {} }
let ok = true
const expect = (cond, label) => { if (!cond) { ok = false; out.failures = [...(out.failures ?? []), label] } }
for (const [name, ti] of Object.entries(inputs)) {
  const fixed = await scenario({ modelText: dec(ti) })
  out.positives[name] = fixed
  expect(fixed.candidate && fixed.recovered && fixed.staged === 'COMPLETE' && fixed.bodies === 1 && Object.values(fixed.journalWritesAfterBody).every((n) => n === 0) && fixed.journalState === 'CONFIRMED', 'positive ' + name)
  const legacy = await scenario({ modelText: dec(ti), complete: false })
  out.preFixDiscrimination[name] = { recovered: legacy.recovered, candidate: legacy.candidate, bodies: legacy.bodies }
  const parsed = JSON.parse(ti)
  const orderSensitive = JSON.stringify(parsed) !== JSON.stringify(JSON.parse(contracts.canonicalizeCompleteJson(parsed)))
  expect(legacy.recovered === !orderSensitive, 'pre-fix discrimination ' + name)
  out.preFixDiscrimination[name].orderSensitive = orderSensitive
}
// Negatives: actually changed inputs and identity.
const neg = async (label, args) => { const r = await scenario(args); out.negatives[label] = { candidate: r.candidate, recovered: r.recovered, bodies: r.bodies, writes: r.journalWritesAfterBody }; expect(!r.recovered && r.bodies === 1 && Object.values(r.journalWritesAfterBody).every((n) => n === 0), 'negative ' + label) }
const changedPending = (ti) => contracts.sanitizeLoopDecision(JSON.parse(dec(ti)))
await neg('changed-top-value', { modelText: dec(inputs.topUnsorted), recoveryOverride: changedPending('{"z":1,"a":3}') })
await neg('changed-nested-value', { modelText: dec(inputs.nestedUnsorted), recoveryOverride: changedPending('{"nested":{"z":1,"a":3}}') })
await neg('added-key', { modelText: dec(inputs.nestedUnsorted), recoveryOverride: changedPending('{"nested":{"z":1,"a":2},"extra":null}') })
await neg('type-change-number-string', { modelText: dec(inputs.topUnsorted), recoveryOverride: changedPending('{"z":"1","a":2}') })
await neg('other-fingerprint', { modelText: dec(inputs.topUnsorted), fingerprintAtRecovery: 'other' })
await neg('other-tenant', { modelText: dec(inputs.topUnsorted), tenantAtRecovery: 'tenant_00000000-0000-4000-8000-00000000b902' })
await neg('other-operation', { modelText: dec(inputs.topUnsorted), opAtRecovery: opKey + 'x' })
// Strictness: canonical admission now runs before validateDecision.
for (const [label, text] of [['negative-zero', '{"x":-0}'], ['lone-surrogate', '{"x":"\\ud800"}']]) {
  try { admit(dec(text), true); out.strictness[label] = 'ACCEPTED' } catch (e) { out.strictness[label] = `${e.name}:${e.code ?? ''}` }
  try { admit(dec(text), false); out.strictness[label + '-legacy'] = 'ACCEPTED' } catch (e) { out.strictness[label + '-legacy'] = `${e.name}` }
}
out.allExpectationsMet = ok
console.log(JSON.stringify(out, null, 1))
process.exitCode = ok ? 0 : 1
