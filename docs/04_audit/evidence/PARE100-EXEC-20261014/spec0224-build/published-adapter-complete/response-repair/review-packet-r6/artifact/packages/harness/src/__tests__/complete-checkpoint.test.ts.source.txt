import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_BUDGET_USAGE,
  canonicalizeCompleteJson,
  type AgentLoopState,
  type Observation,
  type DecisionAdmissionRecord,
  type ExecutionCheckpoint
} from '@cvg/harness-contracts'
import {
  completeCheckpointDigest,
  encodeCompleteCheckpointState,
  decodeCompleteCheckpointState
} from '../complete-checkpoint.ts'
import {
  sealCheckpoint,
  checkpointDigest,
  validateCheckpointIntegrity,
  InMemoryExecutionStepStore
} from '../step-store.ts'

export function completeFixture(stepNumber = 0) {
  return sealCheckpoint({
    tenantId: 'tenant_test',
    executionId: 'exec_test',
    checkpointVersion: 2,
    runtimeProfile: 'iterative',
    runtimeVersion: '2.0.0',
    orchestratorVersion: '1.0.0',
    stepNumber,
    state: {
      goal: 'synthetic',
      stepNumber,
      observations: [],
      openQuestions: [],
      resolvedInputs: {},
      loopSignatures: [],
      toolResultContext: {
        version: 1,
        deliveredThroughStep: 0,
        pendingDecisionAdmission: null,
        decisionAdmissions: []
      }
    },
    budgetUsage: { ...EMPTY_BUDGET_USAGE, steps: stepNumber }
  })
}

function reseal(
  checkpoint: ExecutionCheckpoint,
  state: AgentLoopState,
  budgetUsage = checkpoint.budgetUsage
) {
  const {
    checkpointId: _id,
    createdAt: _at,
    digest: _digest,
    ...unsigned
  } = checkpoint
  void _id
  void _at
  void _digest
  return sealCheckpoint({
    ...unsigned,
    stepNumber: state.stepNumber,
    state,
    budgetUsage
  })
}
function resultObservation(output: unknown, stepNumber = 1): Observation {
  const raw = canonicalizeCompleteJson(output)
  return {
    observationId: `obs_${stepNumber}`,
    stepId: `step_${stepNumber}`,
    stepNumber,
    executionId: 'exec_test',
    type: 'TOOL_RESULT',
    source: 'TOOL',
    trust: 'UNTRUSTED',
    timestamp: '2026-10-16T00:00:00.000Z',
    summary: 'preview',
    provenance: { sourceId: 'tool', operationKey: `op_${stepNumber}` },
    payload: {
      schemaVersion: 1,
      status: 'SUCCEEDED',
      sideEffect: 'NONE',
      completion: 'COMPLETE',
      resultAvailability: 'AVAILABLE',
      output,
      outputBytes: Buffer.byteLength(raw),
      outputSha256: createHash('sha256').update(raw).digest('hex')
    }
  }
}
function reservation(
  status: 'RESERVED' | 'SETTLED' | 'UNKNOWN' = 'RESERVED'
): DecisionAdmissionRecord {
  return {
    admissionId: 'adm_1',
    tenantId: 'tenant_test',
    executionId: 'exec_test',
    stepNumber: 2,
    attempt: 1,
    purpose: 'ORCHESTRATION',
    requestSha256: 'a'.repeat(64),
    measurement: {
      counterId: 'synthetic',
      counterVersion: '1',
      provider: 'synthetic',
      model: 'model',
      formattingVersion: '1',
      inputUpperBoundTokens: 100,
      contextWindowTokens: 1024,
      costUpperBoundUsd: 1
    },
    reserved: {
      modelCalls: 1,
      inputTokens: 100,
      outputTokens: 512,
      costUsd: 1
    },
    status,
    ...(status === 'SETTLED'
      ? {
          actual: {
            modelCalls: 1,
            inputTokens: 80,
            outputTokens: 20,
            costUsd: 0.5
          },
          resultSha256: 'b'.repeat(64)
        }
      : {}),
    ...(status === 'UNKNOWN' ? { unknownReason: 'timeout' } : {})
  }
}

describe('complete checkpoint codec and memory CAS', () => {
  it('uses domain-separated logical digest, schema optional normalization and legacy digest', () => {
    const checkpoint = completeFixture()
    const { checkpointId, createdAt, digest, ...unsigned } = checkpoint
    expect(digest).toBe(completeCheckpointDigest(unsigned))
    expect(digest).toBe(
      createHash('sha256')
        .update(
          'cvg.checkpoint.v2\n' +
            canonicalizeCompleteJson(unsigned, {
              maxBytes: 8388608,
              maxDepth: 64,
              maxNodes: 1000000
            })
        )
        .digest('hex')
    )
    expect(
      completeCheckpointDigest({
        ...unsigned,
        state: { ...unsigned.state, pendingDecision: undefined }
      })
    ).toBe(digest)
    expect(() =>
      completeCheckpointDigest({
        ...unsigned,
        state: { ...unsigned.state, resolvedInputs: { invalid: undefined } }
      })
    ).toThrow()
    validateCheckpointIntegrity(checkpoint, {
      tenantId: checkpoint.tenantId,
      executionId: checkpoint.executionId
    })
    const legacy = sealCheckpoint({
      ...unsigned,
      checkpointVersion: 1,
      state: { ...unsigned.state, toolResultContext: undefined }
    })
    expect(legacy.digest).not.toBe(digest)
    expect(checkpointId).toBeTruthy()
    expect(createdAt).toBeTruthy()
  })

  it('round trips NUL keys and 4096 NULs with ASCII physical wrapper', () => {
    const state = {
      ...completeFixture().state,
      resolvedInputs: { '\u0000😀': '\u0000'.repeat(4096) }
    }
    const encoded = encodeCompleteCheckpointState(state)
    expect(JSON.stringify(encoded)).not.toContain('\u0000')
    expect(decodeCompleteCheckpointState(encoded)).toEqual(state)
    expect(encoded.data).toBe(
      Buffer.from(
        canonicalizeCompleteJson(state, {
          maxBytes: 8388608,
          maxDepth: 64,
          maxNodes: 1000000
        })
      ).toString('base64')
    )
  })

  it('rejects malformed physical wrappers, UTF8, JSON, noncanonical JSON and tamper', () => {
    const encoded = encodeCompleteCheckpointState(completeFixture().state)
    const wrap = (data: Buffer) => ({
      ...encoded,
      data: data.toString('base64'),
      decodedBytes: data.length,
      decodedSha256: createHash('sha256').update(data).digest('hex')
    })
    for (const raw of [
      null,
      {},
      { ...encoded, extra: 1 },
      { ...encoded, data: encoded.data + '=' },
      { ...encoded, decodedBytes: encoded.decodedBytes + 1 },
      { ...encoded, decodedSha256: '0'.repeat(64) },
      wrap(Buffer.from([0xff])),
      wrap(Buffer.from('{"a":1,"a":2}')),
      wrap(Buffer.from('null ')),
      wrap(Buffer.from('{"goal":"x"}')),
      { ...encoded, data: 'A'.repeat(11184816) }
    ]) {
      expect(() => decodeCompleteCheckpointState(raw)).toThrow()
    }
    const tampered = { ...completeFixture(), tenantId: 'other' }
    expect(() =>
      validateCheckpointIntegrity(tampered, {
        tenantId: 'tenant_test',
        executionId: 'exec_test'
      })
    ).toThrow()
    expect(() =>
      encodeCompleteCheckpointState({
        ...completeFixture().state,
        toolResultContext: undefined
      } as AgentLoopState)
    ).toThrow()
  })

  it('rejects invalid result hashes, cursor, receipts, external NUL and unsigned size', () => {
    const base = completeFixture()
    expect(() => sealCheckpoint({ ...base, tenantId: 'bad\u0000id' })).toThrow()
    expect(() =>
      encodeCompleteCheckpointState({
        ...base.state,
        goal: 'x'.repeat(8388608)
      })
    ).toThrow()
    expect(() =>
      encodeCompleteCheckpointState({
        ...base.state,
        toolResultContext: {
          ...base.state.toolResultContext!,
          deliveredThroughStep: 1
        }
      })
    ).toThrow()
    expect(() =>
      encodeCompleteCheckpointState({
        ...base.state,
        toolResultContext: {
          ...base.state.toolResultContext!,
          pendingDecisionAdmission: 'missing'
        }
      })
    ).toThrow()
  })

  it('has one winner for initial and same-token races; refuses simple V2 and V1 overwrite', async () => {
    const store = new InMemoryExecutionStepStore(),
      first = completeFixture()
    const input = {
      tenantId: first.tenantId,
      executionId: first.executionId,
      expected: null,
      next: first
    }
    const race = await Promise.all([
      store.compareAndSwapCheckpoint(input),
      store.compareAndSwapCheckpoint({ ...input, next: completeFixture() })
    ])
    expect(race.map((x) => x.status).sort()).toEqual(['APPLIED', 'CONFLICT'])
    const token = { checkpointId: first.checkpointId, digest: first.digest }
    const second = completeFixture(1)
    const updates = await Promise.all([
      store.compareAndSwapCheckpoint({
        ...input,
        expected: token,
        next: second
      }),
      store.compareAndSwapCheckpoint({
        ...input,
        expected: token,
        next: completeFixture(1)
      })
    ])
    expect(updates.map((x) => x.status).sort()).toEqual(['APPLIED', 'CONFLICT'])
    await expect(store.saveCheckpoint(first)).rejects.toThrow()
    const {
      checkpointId: _id,
      createdAt: _at,
      digest: _digest,
      ...unsigned
    } = first
    void _id
    void _at
    void _digest
    const legacy = sealCheckpoint({
      ...unsigned,
      checkpointVersion: 1,
      state: { ...first.state, toolResultContext: undefined }
    })
    await expect(store.saveCheckpoint(legacy)).rejects.toThrow()
    const loaded = await store.loadCheckpoint(first.tenantId, first.executionId)
    expect(loaded).toEqual(second)
    await expect(
      store.compareAndSwapCheckpoint({ ...input, tenantId: 'other' })
    ).rejects.toThrow()
    await expect(
      store.compareAndSwapCheckpoint({
        ...input,
        expected: { checkpointId: second.checkpointId, digest: second.digest },
        next: second
      })
    ).rejects.toThrow()
    const old = new InMemoryExecutionStepStore()
    await old.saveCheckpoint(legacy)
    await old.saveCheckpoint(legacy)
    expect(
      await old.loadCheckpoint(legacy.tenantId, legacy.executionId)
    ).toEqual(legacy)
  })

  it('retains 50 full TOOL_RESULT observations, validates result integrity and immutable receipts across CAS', async () => {
    const tooMany = completeFixture(51)
    expect(() =>
      reseal(tooMany, {
        ...tooMany.state,
        observations: Array.from({ length: 51 }, (_, i) =>
          resultObservation('bounded', i + 1)
        )
      })
    ).toThrow()
    const store = new InMemoryExecutionStepStore(),
      base = completeFixture(50)
    const observations = Array.from({ length: 50 }, (_, i) =>
      resultObservation({ '\u0000😀': 'a'.repeat(4096) }, i + 1)
    )
    let checkpoint = reseal(base, { ...base.state, observations })
    const update = async (next: ExecutionCheckpoint) => {
      const result = await store.compareAndSwapCheckpoint({
        tenantId: checkpoint.tenantId,
        executionId: checkpoint.executionId,
        expected: {
          checkpointId: checkpoint.checkpointId,
          digest: checkpoint.digest
        },
        next
      })
      if (result.status === 'APPLIED') checkpoint = next
      return result
    }
    await store.compareAndSwapCheckpoint({
      tenantId: checkpoint.tenantId,
      executionId: checkpoint.executionId,
      expected: null,
      next: checkpoint
    })
    await expect(
      update(
        reseal(checkpoint, {
          ...checkpoint.state,
          observations: observations.slice(1)
        })
      )
    ).rejects.toThrow()
    const changed = [...observations]
    changed[0] = { ...changed[0]!, summary: 'altered' }
    await expect(
      update(reseal(checkpoint, { ...checkpoint.state, observations: changed }))
    ).rejects.toThrow()
    const cursor = {
      ...checkpoint.state.toolResultContext!,
      deliveredThroughStep: 50
    }
    expect(
      (
        await update(
          reseal(checkpoint, { ...checkpoint.state, toolResultContext: cursor })
        )
      ).status
    ).toBe('APPLIED')
    expect(
      (await store.loadCheckpoint(checkpoint.tenantId, checkpoint.executionId))!
        .state.observations
    ).toHaveLength(50)
    const receipt = { ...reservation(), stepNumber: 51 }
    const budget = { ...checkpoint.budgetUsage, ...receipt.reserved }
    await update(
      reseal(
        checkpoint,
        {
          ...checkpoint.state,
          toolResultContext: {
            ...cursor,
            decisionAdmissions: [receipt],
            pendingDecisionAdmission: receipt.admissionId
          }
        },
        budget
      )
    )
    const settled = { ...reservation('SETTLED'), stepNumber: 51 }
    await update(
      reseal(
        checkpoint,
        {
          ...checkpoint.state,
          toolResultContext: {
            ...cursor,
            decisionAdmissions: [settled],
            pendingDecisionAdmission: null
          }
        },
        { ...budget, ...settled.actual! }
      )
    )
    // Repeating identical logical settlement with a fresh storage token is harmless.
    expect((await update(reseal(checkpoint, checkpoint.state))).status).toBe(
      'APPLIED'
    )
    expect(
      decodeCompleteCheckpointState(
        encodeCompleteCheckpointState(checkpoint.state)
      ).toolResultContext!.decisionAdmissions[0]!.resultSha256
    ).toBe(settled.resultSha256)
    await expect(
      update(
        reseal(checkpoint, {
          ...checkpoint.state,
          toolResultContext: {
            ...cursor,
            decisionAdmissions: [],
            pendingDecisionAdmission: null
          }
        })
      )
    ).rejects.toThrow()
    await expect(
      update(
        reseal(checkpoint, {
          ...checkpoint.state,
          toolResultContext: {
            ...cursor,
            decisionAdmissions: [{ ...settled, resultSha256: 'c'.repeat(64) }],
            pendingDecisionAdmission: null
          }
        })
      )
    ).rejects.toThrow()
    const bad = structuredClone(observations[0]!)
    ;(bad.payload as Record<string, unknown>).output = 'tampered'
    expect(() =>
      reseal(checkpoint, { ...checkpoint.state, observations: [bad] })
    ).toThrow()
  })

  it('rejects corrupt native receipt bindings, budget, enum, pending pointer and missing state fields', () => {
    const base = completeFixture(1),
      reserved = reservation()
    const state = {
      ...base.state,
      toolResultContext: {
        ...base.state.toolResultContext!,
        decisionAdmissions: [reserved],
        pendingDecisionAdmission: reserved.admissionId
      }
    }
    const budget = { ...base.budgetUsage, ...reserved.reserved }
    expect(() => reseal(base, state, budget)).not.toThrow()
    for (const bad of [
      { ...reserved, tenantId: 'other' },
      { ...reserved, executionId: 'other' },
      { ...reserved, attempt: -1 },
      { ...reserved, actual: reserved.reserved },
      { ...reserved, resultSha256: 'c'.repeat(64) },
      { ...reserved, reserved: { ...reserved.reserved, modelCalls: 2 } },
      {
        ...reservation('SETTLED'),
        actual: { ...reserved.reserved, inputTokens: 101 }
      },
      { ...reservation('SETTLED'), resultSha256: undefined },
      { ...reservation('UNKNOWN'), unknownReason: undefined },
      {
        ...reserved,
        measurement: { ...reserved.measurement, contextWindowTokens: 512 }
      }
    ])
      expect(() =>
        reseal(
          base,
          {
            ...state,
            toolResultContext: {
              ...state.toolResultContext,
              decisionAdmissions: [bad as DecisionAdmissionRecord]
            }
          },
          budget
        )
      ).toThrow()
    expect(() => reseal(base, state)).toThrow()
    expect(() =>
      reseal(
        base,
        {
          ...state,
          toolResultContext: {
            ...state.toolResultContext,
            decisionAdmissions: [reserved, reserved]
          }
        },
        budget
      )
    ).toThrow()
    expect(() =>
      encodeCompleteCheckpointState({
        ...base.state,
        invented: null
      } as AgentLoopState)
    ).toThrow()
    expect(() =>
      encodeCompleteCheckpointState({
        ...base.state,
        resolvedInputs: { nested: { a: undefined } }
      })
    ).toThrow()
    expect(() =>
      encodeCompleteCheckpointState({ ...base.state, pendingStepNumber: 9 })
    ).toThrow()
  })

  it('enforces exact 8MiB logical bytes and total depth/node limits before decoding', () => {
    const base = completeFixture().state
    const empty = canonicalizeCompleteJson(base, {
      maxBytes: 8388608,
      maxDepth: 64,
      maxNodes: 1000000
    })
    const exact = {
      ...base,
      goal: base.goal + 'a'.repeat(8388608 - Buffer.byteLength(empty))
    }
    const wrapper = encodeCompleteCheckpointState(exact)
    expect(wrapper.decodedBytes).toBe(8388608)
    expect(decodeCompleteCheckpointState(wrapper).goal).toBe(exact.goal)
    expect(() =>
      encodeCompleteCheckpointState({ ...exact, goal: exact.goal + 'a' })
    ).toThrow()
    // The unsigned checkpoint includes bindings and budgets, beyond the state envelope.
    const checkpoint = completeFixture()
    const {
      checkpointId: _id,
      createdAt: _at,
      digest: _digest,
      ...unsigned
    } = checkpoint
    void _id
    void _at
    void _digest
    const unsignedBytes = Buffer.byteLength(
      canonicalizeCompleteJson(unsigned, {
        maxBytes: 8388608,
        maxDepth: 64,
        maxNodes: 1000000
      })
    )
    const exactUnsigned = {
      ...unsigned,
      state: { ...base, goal: base.goal + 'a'.repeat(8388608 - unsignedBytes) }
    }
    expect(() => completeCheckpointDigest(exactUnsigned)).not.toThrow()
    expect(() =>
      completeCheckpointDigest({
        ...exactUnsigned,
        state: { ...exactUnsigned.state, goal: exactUnsigned.state.goal + 'a' }
      })
    ).toThrow()
    let allowedDepth: unknown = 0
    for (let i = 0; i < 61; i++) allowedDepth = [allowedDepth]
    expect(() =>
      encodeCompleteCheckpointState({
        ...base,
        resolvedInputs: { deep: allowedDepth }
      })
    ).not.toThrow()
    expect(() =>
      encodeCompleteCheckpointState({
        ...base,
        resolvedInputs: { deep: [allowedDepth] }
      })
    ).toThrow()
    let deep: unknown = 0
    for (let i = 0; i < 65; i++) deep = [deep]
    expect(() =>
      encodeCompleteCheckpointState({ ...base, resolvedInputs: { deep } })
    ).toThrow()
    const wrap = (raw: string) => ({
      storageCodec: 'cvg.checkpoint-state/2',
      encoding: 'base64',
      data: Buffer.from(raw).toString('base64'),
      decodedBytes: Buffer.byteLength(raw),
      decodedSha256: createHash('sha256').update(raw).digest('hex')
    })
    expect(() =>
      decodeCompleteCheckpointState(wrap('['.repeat(66) + '0' + ']'.repeat(66)))
    ).toThrow()
    expect(() =>
      decodeCompleteCheckpointState(
        wrap('[' + Array(1000000).fill('0').join(',') + ']')
      )
    ).toThrow()
    expect(() =>
      decodeCompleteCheckpointState(wrap('{"a":0,"\\u0061":1}'))
    ).toThrow()
  })

  it('retains observed UNKNOWN breach usage and requires componentwise conservative budget coverage', () => {
    const base = completeFixture(1)
    const actual = {
      modelCalls: 1,
      inputTokens: 120,
      outputTokens: 10,
      costUsd: 2
    }
    const breach = {
      ...reservation('UNKNOWN'),
      unknownReason: 'ADMISSION_BREACH',
      actual
    }
    const state = {
      ...base.state,
      toolResultContext: {
        ...base.state.toolResultContext!,
        decisionAdmissions: [breach]
      }
    }
    const covered = {
      ...base.budgetUsage,
      modelCalls: 1,
      inputTokens: 120,
      outputTokens: 512,
      costUsd: 2
    }
    const checkpoint = reseal(base, state, covered)
    validateCheckpointIntegrity(checkpoint, {
      tenantId: base.tenantId,
      executionId: base.executionId
    })
    expect(
      decodeCompleteCheckpointState(encodeCompleteCheckpointState(state))
        .toolResultContext!.decisionAdmissions[0]!.actual
    ).toEqual(actual)
    for (const key of [
      'modelCalls',
      'inputTokens',
      'outputTokens',
      'costUsd'
    ] as const) {
      expect(() =>
        reseal(base, state, { ...covered, [key]: covered[key] - 1 })
      ).toThrow()
    }
    expect(() =>
      reseal(
        base,
        {
          ...state,
          toolResultContext: {
            ...state.toolResultContext,
            decisionAdmissions: [
              {
                ...reservation('UNKNOWN'),
                unknownReason: 'ADMISSION_BREACH',
                attempt: 0
              }
            ]
          }
        },
        covered
      )
    ).not.toThrow()
    expect(() =>
      reseal(
        base,
        {
          ...state,
          toolResultContext: {
            ...state.toolResultContext,
            decisionAdmissions: [{ ...breach, unknownReason: 'timeout' }]
          }
        },
        covered
      )
    ).toThrow()
  })

  it('preserves accepted decision separately from counted pendingDecision and binds all settled step receipts', async () => {
    const base = completeFixture(1),
      settled = reservation('SETTLED')
    const acceptedDecision = {
      stepNumber: 2,
      decision: {
        decisionType: 'CALL_TOOL' as const,
        reasonCode: 'TOOL_REQUIRED' as const,
        toolId: 'synthetic',
        toolInput: { key: '\u0000' }
      },
      decisionAdmissionIds: [settled.admissionId]
    }
    const state = {
      ...base.state,
      toolResultContext: {
        ...base.state.toolResultContext!,
        decisionAdmissions: [settled],
        acceptedDecision
      }
    }
    const budget = { ...base.budgetUsage, ...settled.actual! }
    const checkpoint = reseal(base, state, budget)
    expect(
      decodeCompleteCheckpointState(encodeCompleteCheckpointState(state))
    ).toEqual(state)
    expect(checkpoint.state.pendingDecision).toBeUndefined()
    const counted = {
      ...state,
      pendingDecision: acceptedDecision.decision,
      pendingStepNumber: 2
    }
    expect(() => reseal(base, counted, budget)).not.toThrow()
    expect(() =>
      reseal(
        base,
        {
          ...counted,
          pendingDecision: {
            decisionType: 'STOP',
            reasonCode: 'USER_REQUESTED_STOP'
          }
        },
        budget
      )
    ).toThrow()
    for (const invalid of [
      { ...acceptedDecision, stepNumber: 4 },
      { ...acceptedDecision, decisionAdmissionIds: [] },
      { ...acceptedDecision, decisionAdmissionIds: ['missing'] },
      {
        ...acceptedDecision,
        decisionAdmissionIds: [settled.admissionId, settled.admissionId]
      }
    ]) {
      expect(() =>
        reseal(
          base,
          {
            ...state,
            toolResultContext: {
              ...state.toolResultContext,
              acceptedDecision: invalid
            }
          },
          budget
        )
      ).toThrow()
    }
    const store = new InMemoryExecutionStepStore()
    await store.compareAndSwapCheckpoint({
      tenantId: base.tenantId,
      executionId: base.executionId,
      expected: null,
      next: checkpoint
    })
    await expect(
      store.compareAndSwapCheckpoint({
        tenantId: base.tenantId,
        executionId: base.executionId,
        expected: {
          checkpointId: checkpoint.checkpointId,
          digest: checkpoint.digest
        },
        next: reseal(
          checkpoint,
          {
            ...state,
            toolResultContext: {
              ...state.toolResultContext,
              acceptedDecision: undefined
            }
          },
          budget
        )
      })
    ).rejects.toThrow()
    // This intermediate crash state is legal storage; the native runtime must stop it conservatively on resume.
    expect(() =>
      reseal(
        base,
        {
          ...state,
          toolResultContext: {
            ...state.toolResultContext,
            acceptedDecision: undefined
          }
        },
        budget
      )
    ).not.toThrow()
  })

  it('permits a V1 transition only without legacy results and refuses downgrade/old token replay', async () => {
    const next = completeFixture(),
      store = new InMemoryExecutionStepStore()
    const { checkpointId: _id, createdAt: _at, digest: _d, ...unsigned } = next
    void _id
    void _at
    void _d
    const legacy = sealCheckpoint({
      ...unsigned,
      checkpointVersion: 1,
      state: { ...unsigned.state, toolResultContext: undefined }
    })
    await store.saveCheckpoint(legacy)
    expect(
      (
        await store.compareAndSwapCheckpoint({
          tenantId: next.tenantId,
          executionId: next.executionId,
          expected: {
            checkpointId: legacy.checkpointId,
            digest: legacy.digest
          },
          next
        })
      ).status
    ).toBe('APPLIED')
    expect(
      (
        await store.compareAndSwapCheckpoint({
          tenantId: next.tenantId,
          executionId: next.executionId,
          expected: {
            checkpointId: legacy.checkpointId,
            digest: legacy.digest
          },
          next: completeFixture()
        })
      ).status
    ).toBe('CONFLICT')
    await expect(
      store.compareAndSwapCheckpoint({
        tenantId: next.tenantId,
        executionId: next.executionId,
        expected: { checkpointId: next.checkpointId, digest: next.digest },
        next: legacy
      })
    ).rejects.toThrow()
    const legacyResult = sealCheckpoint({
      ...unsigned,
      checkpointVersion: 1,
      state: { ...legacy.state, observations: [resultObservation('legacy')] }
    })
    const other = new InMemoryExecutionStepStore()
    await other.saveCheckpoint(legacyResult)
    await expect(
      other.compareAndSwapCheckpoint({
        tenantId: next.tenantId,
        executionId: next.executionId,
        expected: {
          checkpointId: legacyResult.checkpointId,
          digest: legacyResult.digest
        },
        next
      })
    ).rejects.toThrow()
  })

  it('preserves legacy hashing, simple saves, step transition fences and defensive copies', async () => {
    const store = new InMemoryExecutionStepStore()
    const step = {
      stepId: 'step_1',
      tenantId: 'tenant_test',
      executionId: 'exec_test',
      stepNumber: 1,
      stepType: 'TOOL' as const,
      status: 'RUNNING' as const,
      attempt: 1,
      sideEffecting: false,
      observationRefs: [] as string[],
      startedAt: '2026-10-16T00:00:00.000Z'
    }
    await store.recordStep(step)
    await expect(
      store.recordStep({ ...step, stepId: 'other' })
    ).rejects.toThrow()
    await expect(
      store.recordStep({ ...step, stepId: 'step_2', stepNumber: 2 })
    ).rejects.toThrow()
    await store.recordStep({ ...step, status: 'SUCCEEDED' })
    await expect(store.recordStep(step)).rejects.toThrow()
    const listed = await store.listSteps(step.tenantId, step.executionId)
    expect(listed[0]!.status).toBe('SUCCEEDED')
    ;(listed[0]!.observationRefs as string[]).push('mutated')
    expect(
      (await store.listSteps(step.tenantId, step.executionId))[0]!
        .observationRefs
    ).toEqual([])
    const v2 = completeFixture()
    const { checkpointId: _id, createdAt: _at, digest: _d, ...unsigned } = v2
    void _id
    void _at
    void _d
    const v1 = {
      ...unsigned,
      checkpointVersion: 1,
      state: { ...unsigned.state, toolResultContext: undefined }
    }
    // Fixed V1 vector independently generated with Python's sorted JSON encoding.
    expect(checkpointDigest(v1)).toBe(
      '580ac62ae308c5e216e4b2a673c43ca6670fa0a5842afbb8dfcd1218e586e3a4'
    )
    const checkpoint = sealCheckpoint(v1)
    await store.saveCheckpoint(checkpoint)
    expect(await store.loadCheckpoint(step.tenantId, step.executionId)).toEqual(
      checkpoint
    )
  })
})
