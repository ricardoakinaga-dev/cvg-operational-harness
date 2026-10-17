import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import {
  canonicalizeCompleteJson,
  COMPLETE_CHECKPOINT_MAX_BYTES,
  type ExecutionCheckpoint,
  type LoopDecision,
  type ModelGateway,
  type StepContext
} from '@cvg/harness-contracts'
import { HybridOrchestrator } from '@cvg/harness-orchestrator'
import {
  createCapabilityRegistry,
  createOperationalHarness,
  InMemoryEffectJournal,
  InMemoryExecutionStepStore
} from '../index.ts'
import { sealCheckpoint } from '../step-store.ts'
import {
  phase3AgentProfile,
  phase3RuntimeInput,
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine
} from './fixtures/phase3-fixtures.ts'

const limits = {
  maxBytes: COMPLETE_CHECKPOINT_MAX_BYTES,
  maxDepth: 64,
  maxNodes: 1_000_000
}
const traces: unknown[] = []
afterAll(() => {
  if (process.env.CVG_COMPLETE_CAPACITY_EVIDENCE)
    writeFileSync(
      process.env.CVG_COMPLETE_CAPACITY_EVIDENCE,
      JSON.stringify(traces, null, 2) + '\n'
    )
})
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
function unsigned(checkpoint: ExecutionCheckpoint) {
  const { checkpointId, createdAt, digest, ...value } = checkpoint
  void checkpointId
  void createdAt
  void digest
  return value
}
function logicalBytes(checkpoint: ExecutionCheckpoint): number {
  return Buffer.byteLength(
    canonicalizeCompleteJson(unsigned(checkpoint), limits)
  )
}
// Evidence uses a lossless, explicitly labelled recipe to avoid storing many
// identical 8 MiB padding strings. This projection never enters the runtime.
function snapshot(checkpoint: ExecutionCheckpoint) {
  const { fixturePadding, ...resolvedInputs } = checkpoint.state.resolvedInputs
  expect(
    typeof fixturePadding === 'string' || fixturePadding === undefined
  ).toBe(true)
  const padding = typeof fixturePadding === 'string' ? fixturePadding : ''
  const bytes = logicalBytes(checkpoint)
  expect(checkpoint.digest).toBe(
    sha(
      'cvg.checkpoint.v2\n' +
        canonicalizeCompleteJson(unsigned(checkpoint), limits)
    )
  )
  return {
    checkpointWithoutFixturePadding: {
      ...checkpoint,
      state: { ...checkpoint.state, resolvedInputs }
    },
    paddingRecipe: {
      field: 'state.resolvedInputs.fixturePadding',
      present: fixturePadding !== undefined,
      character: 'p',
      repeat: padding.length,
      sha256: sha(padding)
    },
    logicalUnsignedBytes: bytes,
    remainingBytes: COMPLETE_CHECKPOINT_MAX_BYTES - bytes
  }
}

describe('SPEC0224 TR08 public prospective checkpoint capacity', () => {
  for (const priorResult of [false, true]) {
    for (const remainingBytes of [200_000, 80_000]) {
      const refusal = remainingBytes === 80_000
      it(`${refusal ? 'refuses before' : 'admits'} a pure body with ${remainingBytes} bytes free, prior result=${priorResult}`, async () => {
        const id = 'synthetic.checkpoint.capacity'
        const pauseStep = priorResult ? 2 : 1
        const attemptStep = pauseStep + 1
        let bodies = 0
        let modelCalls = 0
        const ruleContexts: unknown[] = []
        const bodyCalls: unknown[] = []
        const writes: unknown[] = []
        const call = (step: number): LoopDecision => ({
          decisionType: 'CALL_TOOL',
          reasonCode: 'TOOL_REQUIRED',
          toolId: id,
          toolVersion: '1',
          toolInput: { round: step }
        })
        const rule = (context: StepContext): LoopDecision => {
          ruleContexts.push({
            stepNumber: context.stepNumber,
            observations: structuredClone(context.observations),
            stateSummary: context.stateSummary,
            requiredObservationIds:
              context.toolResultContext?.requiredObservationIds
          })
          if (priorResult && context.stepNumber === 1) return call(1)
          if (context.stepNumber === pauseStep)
            return {
              decisionType: 'ASK_USER',
              reasonCode: 'MISSING_INFORMATION',
              requestedInput: {
                questionType: 'CLARIFICATION',
                missingFields: ['syntheticAnswer'],
                promptIntent: 'Supply the synthetic answer.'
              }
            }
          if (context.stepNumber === attemptStep) return call(attemptStep)
          return {
            decisionType: 'RESPOND',
            reasonCode: 'GOAL_SATISFIED',
            responseText: 'Synthetic capacity control complete.'
          }
        }
        const capabilities = createCapabilityRegistry([
          {
            descriptor: {
              id,
              version: '1',
              description: 'Pure synthetic checkpoint capacity probe',
              inputSchema: { type: 'object' },
              outputSchema: {},
              risk: 'LOW',
              sideEffect: 'NONE',
              idempotent: true,
              requiresApproval: false,
              origin: 'core',
              providerId: 'synthetic.capacity',
              providerVersion: '1'
            },
            implementation: {
              validateInput: () => true,
              validateOutput: () => true,
              execute: async (input, context) => {
                bodies++
                const output = {
                  round: (input as { round: number }).round,
                  full: 'retained'
                }
                bodyCalls.push({ operationKey: context.operationKey, output })
                return { status: 'SUCCEEDED', output }
              }
            }
          }
        ])
        const model: ModelGateway = {
          complete: async () => {
            modelCalls++
            throw new Error(
              'Rules must decide without a model in this capacity fixture.'
            )
          }
        }
        const store = new InMemoryExecutionStepStore()
        const cas = store.compareAndSwapCheckpoint.bind(store)
        // Read-only observation of genuine CAS: no injected refusal or guard.
        store.compareAndSwapCheckpoint = async (input) => {
          const result = await cas(input)
          const committed = await store.loadCheckpoint(
            input.tenantId,
            input.executionId
          )
          writes.push({ result, next: snapshot(committed!) })
          return result
        }
        const journal = new InMemoryEffectJournal()
        const harness = createOperationalHarness({
          toolResultContext: { version: 1 },
          capabilities,
          effectJournal: journal,
          stepStore: store,
          iterativeOrchestrator: new HybridOrchestrator({
            rules: [rule],
            decisionModel: model
          }),
          modelGateway: model,
          policy: new ScriptedPolicyEngine(),
          approvals: new InMemoryApprovalEngine(),
          audit: new RecordingAuditSink(),
          telemetry: new RecordingTelemetrySink()
        })
        const input = phase3RuntimeInput({
          executionId: `exec_capacity_${remainingBytes}_${priorResult}`,
          capabilityFingerprint: capabilities.compositionFingerprint(),
          agent: phase3AgentProfile({ tools: [id] })
        })
        // Obtain an actual resumable checkpoint and, when requested, an actual
        // native CONFIRMED result. Only the large synthetic data field is seeded.
        const first = await harness.run(input)
        expect(first.stopReason).toBe('NEEDS_USER_INPUT')
        expect(bodies).toBe(priorResult ? 1 : 0)
        const paused = (await store.loadCheckpoint(
          input.tenantId,
          input.executionId!
        ))!
        const base = {
          ...unsigned(paused),
          state: {
            ...paused.state,
            resolvedInputs: {
              ...paused.state.resolvedInputs,
              fixturePadding: ''
            }
          }
        }
        const paddingLength =
          COMPLETE_CHECKPOINT_MAX_BYTES -
          remainingBytes -
          Buffer.byteLength(canonicalizeCompleteJson(base, limits))
        const seeded = sealCheckpoint({
          ...base,
          state: {
            ...base.state,
            resolvedInputs: {
              ...base.state.resolvedInputs,
              fixturePadding: 'p'.repeat(paddingLength)
            }
          }
        })
        expect(logicalBytes(seeded)).toBe(
          COMPLETE_CHECKPOINT_MAX_BYTES - remainingBytes
        )
        expect(
          await store.compareAndSwapCheckpoint({
            tenantId: input.tenantId,
            executionId: input.executionId!,
            expected: {
              checkpointId: paused.checkpointId,
              digest: paused.digest
            },
            next: seeded
          })
        ).toMatchObject({ status: 'APPLIED' })
        const oldResults = seeded.state.observations.filter(
          (o) => o.type === 'TOOL_RESULT'
        )
        const oldJournal = priorResult
          ? await journal.get(input.tenantId, `${input.executionId}:s1:${id}`)
          : null
        const result = await harness.run({
          ...input,
          resume: { kind: 'user_input', message: 'synthetic answer' }
        })
        const after = (await store.loadCheckpoint(
          input.tenantId,
          input.executionId!
        ))!
        const attemptedJournal = await journal.get(
          input.tenantId,
          `${input.executionId}:s${attemptStep}:${id}`
        )
        const afterResults = after.state.observations.filter(
          (o) => o.type === 'TOOL_RESULT'
        )
        traces.push({
          name: `free-${remainingBytes}-prior-${priorResult}`,
          fixtureProvenance:
            'Real native tool/pause, one CAS adding only synthetic resolvedInputs.fixturePadding, real user resume; no fabricated result/receipt/approval.',
          first,
          before: snapshot(seeded),
          result,
          after: snapshot(after),
          bodies,
          modelCalls,
          bodyCalls,
          oldJournal,
          attemptedJournal,
          steps: await store.listSteps(input.tenantId, input.executionId!),
          ruleContexts,
          writes,
          scope:
            'In-memory public factory, rules only; no model admission/database/process restart proof. Checkpoint identity and duration may change on refusal; original results and spend must survive.'
        })
        expect(modelCalls).toBe(0)
        expect(
          ruleContexts.some(
            (c) => (c as { stepNumber: number }).stepNumber === attemptStep
          )
        ).toBe(true)
        expect(after.state.resolvedInputs.fixturePadding).toBe(
          'p'.repeat(paddingLength)
        )
        expect(afterResults.slice(0, oldResults.length)).toEqual(oldResults)
        expect(after.state.toolResultContext!.decisionAdmissions).toEqual([])
        expect(after.state.toolResultContext!.deliveredThroughStep).toBe(0)
        for (const field of [
          'modelCalls',
          'inputTokens',
          'outputTokens',
          'costUsd',
          'decisionRepairs'
        ] as const)
          expect(after.budgetUsage[field]).toBe(seeded.budgetUsage[field])
        if (priorResult) {
          expect(oldJournal?.state).toBe('CONFIRMED')
          expect(
            await journal.get(input.tenantId, `${input.executionId}:s1:${id}`)
          ).toEqual(oldJournal)
        }
        if (refusal) {
          expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
          expect(result.response).toBe(
            'CONTEXT_OVERFLOW: Prospective checkpoint cannot reserve full tool result and step overhead.'
          )
          expect(bodies).toBe(priorResult ? 1 : 0)
          expect(afterResults).toEqual(oldResults)
          expect(attemptedJournal).toBeNull()
          expect(after.budgetUsage.toolCalls).toBe(seeded.budgetUsage.toolCalls)
          expect(after.budgetUsage.steps).toBe(seeded.budgetUsage.steps)
          expect(
            (await store.listSteps(input.tenantId, input.executionId!)).some(
              (s) => s.stepNumber === attemptStep
            )
          ).toBe(false)
        } else {
          expect(result.stopReason).toBe('COMPLETED')
          expect(bodies).toBe(priorResult ? 2 : 1)
          expect(attemptedJournal).toMatchObject({
            state: 'CONFIRMED',
            result: { round: attemptStep, full: 'retained' }
          })
          expect(afterResults).toHaveLength(oldResults.length + 1)
          expect(afterResults.at(-1)!.payload).toMatchObject({
            completion: 'COMPLETE',
            output: { round: attemptStep, full: 'retained' }
          })
          expect(after.budgetUsage.toolCalls).toBe(
            seeded.budgetUsage.toolCalls + 1
          )
        }
      }, 60_000)
    }
  }
})
