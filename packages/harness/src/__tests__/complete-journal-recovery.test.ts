import { describe, expect, it, vi } from 'vitest'
import type {
  ExecutionCheckpoint,
  ExecutionStep,
  RuntimeInput,
  ToolDefinition,
  ToolExecutionContext,
  ToolRegistry,
  DecisionAdmissionRecord
} from '@cvg/harness-contracts'
import { EMPTY_BUDGET_USAGE } from '@cvg/harness-contracts'
import type { LoopRun } from '../iterative-runtime.ts'
import {
  InMemoryEffectJournal,
  createJournaledToolRegistry,
  readNativeConfirmedEffect
} from '../effect-journal.ts'
import { prepareCompleteToolRegistry } from '../complete-tool-results.ts'
import {
  settledRecoveryCandidate,
  stageSettledRecovery
} from '../complete-journal-recovery.ts'

const tenant = 'tenant_00000000-0000-4000-8000-00000000b901'
const executionId = 'recovery-unit'
const marker = Symbol.for('cvg.journal.validated-result.v1')
const tool: ToolDefinition = {
  id: 'recovery.tool',
  version: '1',
  description: 'Pure synthetic recovery',
  inputSchema: { type: 'object' },
  outputSchema: {},
  risk: 'LOW',
  sideEffect: 'NONE',
  idempotent: true,
  requiresApproval: false,
  execute: async () => ({ status: 'SUCCEEDED', output: null })
}

function fixture() {
  const pending = {
    decisionType: 'CALL_TOOL' as const,
    reasonCode: 'TOOL_REQUIRED' as const,
    toolId: tool.id,
    toolVersion: tool.version,
    toolInput: {}
  }
  const receipt: DecisionAdmissionRecord = {
    admissionId: 'a1',
    tenantId: tenant,
    executionId,
    stepNumber: 1,
    attempt: 0,
    purpose: 'ORCHESTRATION',
    status: 'SETTLED',
    requestSha256: 'a'.repeat(64),
    resultSha256: 'b'.repeat(64),
    measurement: {
      counterId: 'toy',
      counterVersion: '1',
      provider: 'synthetic',
      model: 'toy',
      formattingVersion: '1',
      inputUpperBoundTokens: 2,
      contextWindowTokens: 10000,
      costUpperBoundUsd: 0
    },
    reserved: { modelCalls: 1, inputTokens: 2, outputTokens: 512, costUsd: 0 },
    actual: { modelCalls: 1, inputTokens: 2, outputTokens: 1, costUsd: 0 }
  }
  const state: LoopRun['state'] = {
    goal: 'synthetic',
    stepNumber: 0,
    pendingStepNumber: 1,
    pendingDecision: pending,
    observations: [],
    openQuestions: [],
    resolvedInputs: {},
    loopSignatures: [],
    toolResultContext: {
      version: 1,
      deliveredThroughStep: 0,
      pendingDecisionAdmission: null,
      decisionAdmissions: [receipt],
      acceptedDecision: {
        stepNumber: 1,
        decision: pending,
        decisionAdmissionIds: ['a1']
      }
    }
  }
  // Pure predicate fixtures: caller validation of RuntimeInput/checkpoint is tested separately.
  const run: LoopRun = {
    input: { tenantId: tenant } as RuntimeInput,
    executionId,
    startedAtMs: 0,
    checkpointToken: { checkpointId: 'loaded', digest: 'a'.repeat(64) },
    state,
    observations: state.observations,
    usage: {
      ...EMPTY_BUDGET_USAGE,
      modelCalls: 1,
      inputTokens: 2,
      outputTokens: 1,
      toolCalls: 1
    },
    stepNumber: 0,
    responseText: null,
    lastDecision: pending,
    lastEvaluation: null,
    lastToolObservation: null,
    lastSufficiency: null,
    lastDecisionErrors: [],
    skipEvaluationOnce: false,
    countedSteps: new Set(),
    inFlightCounted: true
  }
  const checkpoint = {
    checkpointVersion: 2,
    state
  } as unknown as ExecutionCheckpoint
  const steps: ExecutionStep[] = [
    {
      tenantId: tenant,
      executionId,
      stepNumber: 1,
      stepType: 'TOOL',
      status: 'SUCCEEDED',
      attempt: 1,
      sideEffecting: true,
      stepId: `step_${executionId}_1_tool`,
      decisionType: 'CALL_TOOL',
      reasonCode: 'TOOL_REQUIRED',
      startedAt: '2026-10-18T00:00:00.000Z',
      completedAt: '2026-10-18T00:00:00.001Z',
      observationRefs: ['obs_recovered']
    }
  ]
  return { run, checkpoint, steps }
}

describe('native settled recovery predicate and staged checkpoint, component only', () => {
  it('restores one step and native ref without mutating original usage, receipts or step', () => {
    const f = fixture()
    const before = JSON.stringify(f)
    const candidate = settledRecoveryCandidate(
      f.run,
      f.checkpoint,
      f.steps,
      tool
    )
    expect(candidate).not.toBeNull()
    const staged = stageSettledRecovery(f.run, candidate!, null, 6)
    expect(JSON.stringify(f)).toBe(before)
    expect(staged.usage).toEqual({ ...f.run.usage, steps: 1 })
    expect(staged.state.toolResultContext!.decisionAdmissions).toEqual(
      f.run.state.toolResultContext!.decisionAdmissions
    )
    expect(staged.lastToolObservation).toMatchObject({
      observationId: 'obs_recovered',
      stepId: f.steps[0]!.stepId,
      timestamp: f.steps[0]!.completedAt,
      payload: { completion: 'COMPLETE', output: null }
    })
    expect(staged.state.pendingDecision).toBeUndefined()
    expect(staged.state.toolResultContext!.acceptedDecision).toBeUndefined()
    expect(staged.state.loopSignatures).toHaveLength(1)
    expect(staged.countedSteps.has(1)).toBe(true)
    expect(staged.checkpointToken).toEqual(f.run.checkpointToken)
  })

  const changes: [string, (f: ReturnType<typeof fixture>) => void][] = [
    [
      'pending cursor',
      (f) => {
        f.run.state.pendingStepNumber = 2
      }
    ],
    [
      'wrong tool',
      (f) => {
        f.run.state.pendingDecision = {
          ...f.run.state.pendingDecision!,
          toolId: 'other'
        }
      }
    ],
    [
      'accepted decision mismatch',
      (f) => {
        f.run.state.pendingDecision = {
          ...f.run.state.pendingDecision!,
          toolInput: { changed: true }
        }
      }
    ],
    [
      'missing accepted decision',
      (f) => {
        f.run.state.toolResultContext = {
          ...f.run.state.toolResultContext!,
          acceptedDecision: undefined
        }
      }
    ],
    [
      'unknown receipt',
      (f) => {
        const c = f.run.state.toolResultContext!
        f.run.state.toolResultContext = {
          ...c,
          decisionAdmissions: [
            { ...c.decisionAdmissions[0]!, status: 'UNKNOWN' }
          ]
        }
      }
    ],
    [
      'duplicate receipt',
      (f) => {
        const c = f.run.state.toolResultContext!
        f.run.state.toolResultContext = {
          ...c,
          decisionAdmissions: [
            ...c.decisionAdmissions,
            c.decisionAdmissions[0]!
          ]
        }
      }
    ],
    [
      'receipt tenant',
      (f) => {
        const c = f.run.state.toolResultContext!
        f.run.state.toolResultContext = {
          ...c,
          decisionAdmissions: [
            { ...c.decisionAdmissions[0]!, tenantId: 'other' }
          ]
        }
      }
    ],
    [
      'duplicate native step',
      (f) => {
        f.steps.push({ ...f.steps[0]! })
      }
    ],
    [
      'wrong native tenant',
      (f) => {
        f.steps[0] = { ...f.steps[0]!, tenantId: 'other' }
      }
    ],
    [
      'wrong native execution',
      (f) => {
        f.steps[0] = { ...f.steps[0]!, executionId: 'other' }
      }
    ],
    [
      'wrong native attempt',
      (f) => {
        f.steps[0] = { ...f.steps[0]!, attempt: 2 }
      }
    ],
    [
      'wrong native step id',
      (f) => {
        f.steps[0] = { ...f.steps[0]!, stepId: 'other' }
      }
    ],
    [
      'nonsettled step',
      (f) => {
        f.steps[0] = { ...f.steps[0]!, status: 'RUNNING' }
      }
    ],
    [
      'wrong native decision',
      (f) => {
        f.steps[0] = { ...f.steps[0]!, decisionType: 'RESPOND' }
      }
    ],
    [
      'missing completed time',
      (f) => {
        const { completedAt: _time, ...step } = f.steps[0]!
        void _time
        f.steps[0] = step
      }
    ],
    [
      'invalid completed time',
      (f) => {
        f.steps[0] = { ...f.steps[0]!, completedAt: 'now' }
      }
    ],
    [
      'completed before started',
      (f) => {
        f.steps[0] = { ...f.steps[0]!, completedAt: '2026-10-17T00:00:00.000Z' }
      }
    ],
    [
      'missing ref',
      (f) => {
        f.steps[0] = { ...f.steps[0]!, observationRefs: [] }
      }
    ],
    [
      'ambiguous ref',
      (f) => {
        f.steps[0] = { ...f.steps[0]!, observationRefs: ['one', 'two'] }
      }
    ],
    [
      'control in ref',
      (f) => {
        f.steps[0] = { ...f.steps[0]!, observationRefs: ['bad\0ref'] }
      }
    ],
    [
      'already counted',
      (f) => {
        f.run.countedSteps.add(1)
      }
    ],
    [
      'ref collision',
      (f) => {
        f.run.observations.push({ observationId: 'obs_recovered' } as never)
      }
    ],
    [
      'saved unavailable result',
      (f) => {
        f.run.observations.push({
          observationId: 'different',
          type: 'TOOL_RESULT',
          stepNumber: 1
        } as never)
      }
    ]
  ]
  it.each(changes)('refuses %s before reading or staging', (_name, change) => {
    const f = fixture()
    change(f)
    expect(
      settledRecoveryCandidate(f.run, f.checkpoint, f.steps, tool)
    ).toBeNull()
  })
  it('stages unavailable context without truncating or pretending it is deliverable', () => {
    const f = fixture()
    const candidate = settledRecoveryCandidate(
      f.run,
      f.checkpoint,
      f.steps,
      tool
    )!
    const staged = stageSettledRecovery(f.run, candidate, 'x'.repeat(32767), 6)
    expect(staged.lastToolObservation!.payload).toMatchObject({
      status: 'SUCCEEDED',
      completion: 'UNAVAILABLE',
      reason: 'RESULT_TOO_LARGE'
    })
    expect(staged.lastToolObservation!.payload).not.toHaveProperty('output')
    expect(f.run.usage.steps).toBe(0)
  })
  it('compares extended ISO years by time rather than their string order', () => {
    const f = fixture()
    f.steps[0] = {
      ...f.steps[0]!,
      startedAt: '9999-12-31T23:59:59.999Z',
      completedAt: '+010000-01-01T00:00:00.000Z'
    }
    expect(
      settledRecoveryCandidate(f.run, f.checkpoint, f.steps, tool)
    ).not.toBeNull()
    f.steps[0] = {
      ...f.steps[0]!,
      startedAt: '+010000-01-01T00:00:00.000Z',
      completedAt: '9999-12-31T23:59:59.999Z'
    }
    expect(
      settledRecoveryCandidate(f.run, f.checkpoint, f.steps, tool)
    ).toBeNull()
  })
})

async function journalFixture(
  decorate: (record: object) => void = (record) => {
    Object.defineProperty(record, marker, {
      value: 1,
      enumerable: false,
      configurable: false,
      writable: false
    })
  }
) {
  const backing = new InMemoryEffectJournal()
  const body = vi.fn(async () => ({
    status: 'SUCCEEDED' as const,
    output: null
  }))
  const source = { ...tool, execute: body }
  const base: ToolRegistry = {
    list: () => [source],
    resolve: (id) => (id === source.id ? source : undefined)
  }
  const registry = createJournaledToolRegistry(base, backing, {
    compositionFingerprint: 'frozen',
    attemptIdFactory: () => 'unit'
  })
  const key = 'recovery-operation'
  await registry.resolve(tool.id)!.execute({}, {
    tenantId: tenant,
    agentId: 'agent.synthetic',
    correlationId: 'synthetic',
    traceId: 'synthetic',
    operationKey: key
  } as ToolExecutionContext)
  const read = backing.get.bind(backing)
  backing.get = vi.fn(async (t, k) => {
    const record = await read(t, k)
    if (record) decorate(record)
    return record
  })
  const writes = [
    'reserve',
    'markStarted',
    'confirm',
    'fail',
    'markUncertain'
  ] as const
  const spies = writes.map((name) => vi.spyOn(backing, name))
  return { registry, key, body, spies }
}

describe('private read-only native recovery callback, component provenance only', () => {
  it('keeps JSON null and survives the actual native spread wrapper without new body or writes', async () => {
    const f = await journalFixture()
    const prepared = prepareCompleteToolRegistry(f.registry)
    expect(
      await readNativeConfirmedEffect(
        prepared.resolve(tool.id),
        tenant,
        f.key,
        {}
      )
    ).toEqual({ output: null })
    expect(f.body).toHaveBeenCalledTimes(1)
    for (const spy of f.spies) expect(spy).not.toHaveBeenCalled()
  })
  const invalid: [string, (record: object) => void][] = [
    ['absent', () => {}],
    [
      'textual marker',
      (r) => {
        Object.assign(r, { 'cvg.journal.validated-result.v1': 1 })
      }
    ],
    [
      'wrong value',
      (r) => {
        Object.defineProperty(r, marker, { value: true })
      }
    ],
    [
      'enumerable marker',
      (r) => {
        Object.defineProperty(r, marker, { value: 1, enumerable: true })
      }
    ],
    [
      'writable marker',
      (r) => {
        Object.defineProperty(r, marker, { value: 1, writable: true })
      }
    ],
    [
      'configurable marker',
      (r) => {
        Object.defineProperty(r, marker, { value: 1, configurable: true })
      }
    ]
  ]
  it.each(invalid)(
    'refuses %s without body or journal write',
    async (_name, decorate) => {
      const f = await journalFixture(decorate)
      expect(
        await readNativeConfirmedEffect(
          f.registry.resolve(tool.id),
          tenant,
          f.key,
          {}
        )
      ).toBeNull()
      expect(f.body).toHaveBeenCalledTimes(1)
      for (const spy of f.spies) expect(spy).not.toHaveBeenCalled()
    }
  )
  it('does not invoke a marker getter', async () => {
    const getter = vi.fn(() => 1)
    const f = await journalFixture((r) => {
      Object.defineProperty(r, marker, { get: getter })
    })
    expect(
      await readNativeConfirmedEffect(
        f.registry.resolve(tool.id),
        tenant,
        f.key,
        {}
      )
    ).toBeNull()
    expect(getter).not.toHaveBeenCalled()
  })
  it.each([
    'tenantId',
    'operationKey',
    'proposalHash',
    'state',
    'attemptId',
    'result'
  ] as const)('refuses invalid %s without invoking accessors', async (key) => {
    const getter = vi.fn(() => 'invalid')
    const f = await journalFixture((r) => {
      Object.defineProperty(r, marker, { value: 1 })
      Object.defineProperty(r, key, { get: getter, configurable: true })
    })
    expect(
      await readNativeConfirmedEffect(
        f.registry.resolve(tool.id),
        tenant,
        f.key,
        {}
      )
    ).toBeNull()
    expect(getter).not.toHaveBeenCalled()
    for (const spy of f.spies) expect(spy).not.toHaveBeenCalled()
  })
  it('refuses a changed input/proposal and a non-native descriptor', async () => {
    const f = await journalFixture()
    expect(
      await readNativeConfirmedEffect(
        f.registry.resolve(tool.id),
        tenant,
        f.key,
        { changed: true }
      )
    ).toBeNull()
    expect(await readNativeConfirmedEffect(tool, tenant, f.key, {})).toBeNull()
    for (const spy of f.spies) expect(spy).not.toHaveBeenCalled()
  })
})
