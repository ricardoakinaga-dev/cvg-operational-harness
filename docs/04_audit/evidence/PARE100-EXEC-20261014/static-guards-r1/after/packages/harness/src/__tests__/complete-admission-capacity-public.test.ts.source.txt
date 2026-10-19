import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import {
  canonicalizeCompleteJson,
  COMPLETE_CHECKPOINT_MAX_BYTES,
  type DecisionInputCounter,
  type ExecutionCheckpoint,
  type LoopDecision,
  type ModelGateway,
  type ModelRequest,
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

const traces: unknown[] = []
afterAll(() => {
  if (process.env.CVG_COMPLETE_ADMISSION_CAPACITY_EVIDENCE)
    writeFileSync(
      process.env.CVG_COMPLETE_ADMISSION_CAPACITY_EVIDENCE,
      JSON.stringify(traces, null, 2) + '\n'
    )
})
const limits = {
  maxBytes: COMPLETE_CHECKPOINT_MAX_BYTES,
  maxDepth: 64,
  maxNodes: 1_000_000
}
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
function unsigned(checkpoint: ExecutionCheckpoint) {
  const { checkpointId, createdAt, digest, ...value } = checkpoint
  void checkpointId
  void createdAt
  void digest
  return value
}
function snapshot(checkpoint: ExecutionCheckpoint) {
  const raw = canonicalizeCompleteJson(unsigned(checkpoint), limits)
  expect(sha('cvg.checkpoint.v2\n' + raw)).toBe(checkpoint.digest)
  const { fixturePadding, ...resolvedInputs } = checkpoint.state.resolvedInputs
  const padding = typeof fixturePadding === 'string' ? fixturePadding : ''
  const nulPrefix = padding.lastIndexOf('\u0000') + 1
  return {
    checkpointWithoutFixturePadding: {
      ...checkpoint,
      state: { ...checkpoint.state, resolvedInputs }
    },
    paddingRecipe: {
      field: 'state.resolvedInputs.fixturePadding',
      present: fixturePadding !== undefined,
      character: nulPrefix > 0 ? '\u0000' : 'p',
      repeat: nulPrefix > 0 ? nulPrefix : padding.length,
      suffix: nulPrefix > 0 ? padding.slice(nulPrefix) : '',
      sha256: sha(padding)
    },
    logicalUnsignedBytes: Buffer.byteLength(raw),
    remainingBytes: COMPLETE_CHECKPOINT_MAX_BYTES - Buffer.byteLength(raw)
  }
}
// This deliberately named synthetic pair uses ceil(canonical UTF8 bytes/64),
// including JSON framing for text. It claims no tokenizer/provider equivalence.
const tokens = (value: unknown) =>
  Math.ceil(
    Buffer.byteLength(
      canonicalizeCompleteJson(value, {
        maxBytes: 131_072,
        maxDepth: 64,
        maxNodes: 20_000
      })
    ) / 64
  )
const provider = 'synthetic.capacity.'.padEnd(512, 'p')
const modelName = 'toy64.'.padEnd(512, 'm')

describe('SPEC0224 TR05/TR08 public decision receipt capacity', () => {
  for (const priorReceipts of [false, true]) {
    for (const [freeBytes, paddingCharacter] of [
      [20_000, 'p'],
      [2_000, 'p'],
      [2_000, '\u0000']
    ] as const) {
      const refusal = freeBytes === 2_000
      const paddingMode = paddingCharacter === 'p' ? 'ASCII' : 'NUL'
      it(`${refusal ? 'refuses' : 'admits'} a real synthetic model attempt with ${freeBytes} seed bytes free, prior receipts=${priorReceipts}, padding=${paddingMode}`, async () => {
        const id = 'synthetic.admission.capacity'
        const store = new InMemoryExecutionStepStore()
        const journal = new InMemoryEffectJournal()
        const writes: unknown[] = []
        const measurements: unknown[] = []
        const calls: unknown[] = []
        const cas = store.compareAndSwapCheckpoint.bind(store)
        store.compareAndSwapCheckpoint = async (input) => {
          const result = await cas(input)
          writes.push({
            result,
            checkpoint: snapshot(
              (await store.loadCheckpoint(input.tenantId, input.executionId))!
            )
          })
          return result
        }
        let bodies = 0
        let completeEntries = 0
        let resumed = false
        const capabilities = createCapabilityRegistry([
          {
            descriptor: {
              id,
              version: '1',
              description: 'Pure synthetic prior result',
              inputSchema: {},
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
              execute: async () => {
                bodies++
                return {
                  status: 'SUCCEEDED',
                  output: { full: 'actual synthetic prior result' }
                }
              }
            }
          }
        ])
        const input = phase3RuntimeInput({
          executionId: `exec_admission_capacity_${freeBytes}_${priorReceipts}_${paddingMode}`,
          agent: phase3AgentProfile({ tools: [id] }),
          capabilityFingerprint: capabilities.compositionFingerprint()
        })
        const load = async () =>
          (await store.loadCheckpoint(input.tenantId, input.executionId!))!
        const ask: LoopDecision = {
          decisionType: 'ASK_USER',
          reasonCode: 'MISSING_INFORMATION',
          requestedInput: {
            questionType: 'CLARIFICATION',
            missingFields: ['syntheticAnswer'],
            promptIntent: 'Supply a synthetic answer.'
          }
        }
        const counter: DecisionInputCounter = {
          measure: async (request) => {
            const measurement = {
              counterId: 'synthetic.toy64.'.padEnd(512, 'c'),
              counterVersion: '1.'.padEnd(512, 'v'),
              provider,
              model: modelName,
              formattingVersion: 'canonical-json.'.padEnd(512, 'f'),
              inputUpperBoundTokens: tokens(request),
              contextWindowTokens: 100_000,
              costUpperBoundUsd: 0.25
            }
            measurements.push({
              resumed,
              request: structuredClone(request),
              measurement,
              checkpointBeforeReserve: snapshot(await load())
            })
            return measurement
          }
        }
        const model: ModelGateway = {
          complete: async ({ signal: _signal, ...request }: ModelRequest) => {
            completeEntries++
            void _signal
            const checkpoint = await load()
            const ctx = checkpoint.state.toolResultContext!
            const receipt = ctx.decisionAdmissions.find(
              (r) => r.admissionId === ctx.pendingDecisionAdmission
            )
            // Inspect the real stored reservation inside actual complete, before
            // returning a synthetic result. No receipt or approval is injected.
            expect(receipt).toMatchObject({
              status: 'RESERVED',
              tenantId: input.tenantId,
              executionId: input.executionId,
              requestSha256: sha(
                canonicalizeCompleteJson(request, {
                  maxBytes: 131_072,
                  maxDepth: 64,
                  maxNodes: 20_000
                })
              )
            })
            expect(receipt!.reserved.outputTokens).toBe(512)
            calls.push({
              resumed,
              request: structuredClone(request),
              receipt: structuredClone(receipt),
              checkpointAtComplete: snapshot(checkpoint)
            })
            const decision: LoopDecision = resumed
              ? {
                  decisionType: 'RESPOND',
                  reasonCode: 'GOAL_SATISFIED',
                  responseText: 'Synthetic admission control complete.'
                }
              : calls.length === 1
                ? {
                    decisionType: 'CALL_TOOL',
                    reasonCode: 'TOOL_REQUIRED',
                    toolId: id,
                    toolVersion: '1',
                    toolInput: {}
                  }
                : ask
            const text = JSON.stringify(decision)
            expect(request.maxOutputTokens).toBe(512)
            expect(tokens(text)).toBeLessThanOrEqual(512)
            return {
              text,
              provider,
              model: modelName,
              inputTokens: tokens(request),
              outputTokens: tokens(text),
              costUsd: 0.125
            }
          }
        }
        const rule = (_context: StepContext): LoopDecision | undefined => {
          void _context
          return !priorReceipts && !resumed ? ask : undefined
        }
        const harness = createOperationalHarness({
          toolResultContext: { version: 1 },
          capabilities,
          effectJournal: journal,
          stepStore: store,
          iterativeOrchestrator: new HybridOrchestrator({
            rules: [rule],
            decisionModel: model,
            decisionInputCounter: counter,
            decisionModelSupportsMaxOutputTokens: true
          }),
          modelGateway: model,
          policy: new ScriptedPolicyEngine(),
          approvals: new InMemoryApprovalEngine(),
          audit: new RecordingAuditSink(),
          telemetry: new RecordingTelemetrySink()
        })
        const first = await harness.run(input)
        expect(first.stopReason).toBe('NEEDS_USER_INPUT')
        expect(calls).toHaveLength(priorReceipts ? 2 : 0)
        const paused = await load()
        expect(
          paused.state.toolResultContext!.decisionAdmissions.map(
            (r) => r.status
          )
        ).toEqual(priorReceipts ? ['SETTLED', 'SETTLED'] : [])
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
          freeBytes -
          Buffer.byteLength(canonicalizeCompleteJson(base, limits))
        const bytesPerCharacter = paddingCharacter === 'p' ? 1 : 6
        const padding =
          paddingCharacter.repeat(
            Math.floor(paddingLength / bytesPerCharacter)
          ) + 'p'.repeat(paddingLength % bytesPerCharacter)
        const seeded = sealCheckpoint({
          ...base,
          state: {
            ...base.state,
            resolvedInputs: {
              ...base.state.resolvedInputs,
              fixturePadding: padding
            }
          }
        })
        expect(snapshot(seeded).remainingBytes).toBe(freeBytes)
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
        const oldJournal = priorReceipts
          ? await journal.get(input.tenantId, `${input.executionId}:s1:${id}`)
          : null
        const oldReceipts = seeded.state.toolResultContext!.decisionAdmissions
        const oldResults = seeded.state.observations.filter(
          (o) => o.type === 'TOOL_RESULT'
        )
        const modelsBefore = calls.length
        const bodiesBefore = bodies
        resumed = true
        const resumeInput = {
          ...input,
          resume: { kind: 'user_input' as const, message: 'synthetic answer' }
        }
        const result = await harness.run(resumeInput)
        const after = await load()
        const afterJournal = priorReceipts
          ? await journal.get(input.tenantId, `${input.executionId}:s1:${id}`)
          : null
        const repeated = refusal ? await harness.run(resumeInput) : null
        const afterRepeat = refusal ? await load() : null
        const afterRepeatJournal =
          priorReceipts && refusal
            ? await journal.get(input.tenantId, `${input.executionId}:s1:${id}`)
            : null
        traces.push({
          name: `free-${freeBytes}-prior-${priorReceipts}-${paddingMode}`,
          remainingSeedBytes: freeBytes,
          paddingMode,
          fixtureProvenance:
            'Actual public native pause, optional two actual settled model receipts and one actual pure result; one CAS adds only labelled synthetic data; real user resume. All 512-character metadata is legal explicit synthetic pair identity.',
          first,
          before: snapshot(seeded),
          result,
          after: snapshot(after),
          repeated,
          afterRepeat: afterRepeat ? snapshot(afterRepeat) : null,
          measurements,
          calls,
          writes,
          bodiesBefore,
          bodiesAfter: bodies,
          modelsBefore,
          actualModelsAfter: calls.length,
          actualCompleteEntries: completeEntries,
          oldJournal,
          afterJournal,
          afterRepeatJournal,
          scope:
            'Public memory path; distinguish actual complete count, live returned usage and acknowledged checkpoint budgets. No database/process restart/global qualification.'
        })
        expect(bodies).toBe(bodiesBefore)
        expect(completeEntries).toBe(modelsBefore + (refusal ? 0 : 1))
        expect(after.state.resolvedInputs.fixturePadding).toBe(
          seeded.state.resolvedInputs.fixturePadding
        )
        expect(
          after.state.observations.filter((o) => o.type === 'TOOL_RESULT')
        ).toEqual(oldResults)
        expect(afterJournal).toEqual(oldJournal)
        expect(
          after.state.toolResultContext!.decisionAdmissions.slice(
            0,
            oldReceipts.length
          )
        ).toEqual(oldReceipts)
        expect(measurements.length).toBeGreaterThan(modelsBefore)
        if (refusal) {
          expect(calls).toHaveLength(modelsBefore)
          expect(result.modelCalls).toBe(seeded.budgetUsage.modelCalls)
          expect(result.usage).toEqual({
            inputTokens: seeded.budgetUsage.inputTokens,
            outputTokens: seeded.budgetUsage.outputTokens,
            costUsd: seeded.budgetUsage.costUsd
          })
          expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
          expect(result.response).toBe(
            'CONTEXT_OVERFLOW: No checkpoint space for the decision receipt.'
          )
          expect(after.state.stopReason).toBe('INSUFFICIENT_EVIDENCE')
          expect(after.state.pendingQuestion).toBeUndefined()
          expect(after.budgetUsage.activeDurationMs).toBeGreaterThan(
            seeded.budgetUsage.activeDurationMs
          )
          expect(after.state.toolResultContext!.decisionAdmissions).toEqual(
            oldReceipts
          )
          for (const field of [
            'modelCalls',
            'inputTokens',
            'outputTokens',
            'costUsd',
            'toolCalls',
            'steps'
          ] as const)
            expect(after.budgetUsage[field]).toBe(seeded.budgetUsage[field])
          expect(repeated!.stopReason).toBe('STATE_CONFLICT')
          expect(repeated!.response).toContain(
            'Terminal execution cannot be resumed'
          )
          expect(afterRepeat).toEqual(after)
          expect(measurements).toHaveLength(modelsBefore + 1)
          expect(afterRepeatJournal).toEqual(oldJournal)
          expect(
            afterRepeat!.state.toolResultContext!.decisionAdmissions
          ).toEqual(oldReceipts)
        } else {
          expect(calls).toHaveLength(modelsBefore + 1)
          expect(result.stopReason).toBe('COMPLETED')
          const receipts = after.state.toolResultContext!.decisionAdmissions
          expect(receipts).toHaveLength(oldReceipts.length + 1)
          expect(receipts.at(-1)!.status).toBe('SETTLED')
          expect(after.budgetUsage.modelCalls).toBe(
            seeded.budgetUsage.modelCalls + 1
          )
          expect(after.budgetUsage.costUsd).toBe(
            seeded.budgetUsage.costUsd + 0.125
          )
          for (const field of [
            'inputTokens',
            'outputTokens',
            'costUsd'
          ] as const)
            expect(after.budgetUsage[field]).toBe(
              receipts.reduce((sum, r) => sum + r.actual![field], 0)
            )
        }
      }, 60_000)
    }
  }
})
