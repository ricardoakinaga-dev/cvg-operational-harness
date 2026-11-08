/** SPEC 0317 G1: the requester on the neutral execution spine (memory store). */
import { describe, expect, it } from 'vitest'
import type { RuntimeInput } from '@cvg/harness-contracts'
import {
  computeExecutionRequestHash,
  createInMemoryOperationalExecutionStore,
  OperationalExecutionError,
  parseExecutionSubmission,
  resolveSubmittedBy,
  sameExecutionPrincipal
} from '../execution-spine.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000e23'
const human = { kind: 'human', id: 'human.a', tenantId } as const

function runtime(): RuntimeInput {
  return {
    agent: {
      id: 'agent.synthetic',
      version: 'v1',
      objective: 'synthetic',
      instructions: [],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId,
    conversationId: 'conversation_synthetic',
    sessionId: 'session_synthetic',
    correlationId: 'correlation_synthetic',
    traceId: 'trace_synthetic',
    userMessage: 'synthetic',
    context: { values: {}, sourceIds: [], capturedAt: '2026-11-06T00:00:00Z' },
    state: { version: 1, values: {}, updatedAt: '2026-11-06T00:00:00Z' },
    budget: {
      maxSteps: 1,
      maxModelCalls: 1,
      maxToolCalls: 1,
      maxDurationMs: 1_000,
      maxCostUsd: 1,
      maxTokens: 100
    }
  } as unknown as RuntimeInput
}

describe('submittedBy on the execution spine', () => {
  it('stores the principal apart from the request and its hash', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const submission = {
      tenantId,
      idempotencyKey: 'key-author',
      runtime: runtime()
    }
    const { record } = await store.submit({ ...submission, submittedBy: human })
    expect(record.submittedBy).toEqual(human)
    expect(record.request).not.toHaveProperty('submittedBy')
    expect(record.requestHash).toBe(computeExecutionRequestHash(submission))
  })

  it('keeps the author through a claim, a retry and a transition', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const { record } = await store.submit({
      tenantId,
      idempotencyKey: 'key-keep',
      submittedBy: human,
      runtime: runtime()
    })
    const claimed = await store.claimNext(tenantId, 'worker-author')
    expect(claimed?.record.submittedBy).toEqual(human)
    const failed = await store.transition({
      tenantId,
      executionId: record.id,
      to: 'RUNNING',
      workerId: 'worker-author',
      fenceToken: claimed!.record.attempt
    })
    expect(failed.submittedBy).toEqual(human)
  })

  it('without a principal the origin is unknown', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const { record } = await store.submit({
      tenantId,
      idempotencyKey: 'key-unknown',
      runtime: runtime()
    })
    expect(record.submittedBy).toEqual({ kind: 'unknown' })
  })

  it.each([
    ['undefined', undefined],
    ['null', null]
  ])(
    'refuses a missing submission (%s) as a validation failure',
    async (_label, raw) => {
      const store = createInMemoryOperationalExecutionStore()
      await expect(store.submit(raw as never)).rejects.toBeInstanceOf(
        OperationalExecutionError
      )
      await expect(store.submit(raw as never)).rejects.toMatchObject({
        code: 'validation_failed',
        message: 'tenantId is required'
      })
    }
  )

  it('a replay by the same principal converges; any other one conflicts', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const submission = {
      tenantId,
      idempotencyKey: 'key-replay',
      runtime: runtime()
    }
    const first = await store.submit({ ...submission, submittedBy: human })
    const replay = await store.submit({ ...submission, submittedBy: human })
    expect(replay.created).toBe(false)
    expect(replay.record.id).toBe(first.record.id)
    for (const other of [
      { ...submission, submittedBy: { ...human, id: 'human.b' } },
      submission
    ]) {
      await expect(store.submit(other)).rejects.toMatchObject({
        code: 'conflict',
        message: 'Idempotency key is already bound to a different request'
      })
    }
  })

  it('accepts a system principal only when the composition declares it', async () => {
    const system = { kind: 'system', id: 'system.scheduler', tenantId } as const
    const submission = {
      tenantId,
      idempotencyKey: 'key-system',
      submittedBy: system,
      runtime: runtime()
    }
    await expect(
      createInMemoryOperationalExecutionStore().submit(submission)
    ).rejects.toMatchObject({ code: 'validation_failed' })
    const declared = createInMemoryOperationalExecutionStore({
      systemPrincipals: ['system.scheduler']
    })
    expect((await declared.submit(submission)).record.submittedBy).toEqual(
      system
    )
  })

  it.each([
    ['another tenant', { ...human, tenantId: 'tenant_other' }],
    ['the unknown kind', { kind: 'unknown' }],
    ['an empty id', { ...human, id: '   ' }],
    ['a null', null]
  ])('refuses %s instead of storing it', (_label, raw) => {
    expect(() => resolveSubmittedBy(raw, tenantId)).toThrow(
      OperationalExecutionError
    )
  })

  it('compares every field of a principal', () => {
    expect(sameExecutionPrincipal(human, { ...human })).toBe(true)
    expect(sameExecutionPrincipal(human, { ...human, id: 'human.b' })).toBe(
      false
    )
    expect(sameExecutionPrincipal(human, { ...human, kind: 'system' })).toBe(
      false
    )
    expect(
      sameExecutionPrincipal(human, { ...human, tenantId: 'tenant_other' })
    ).toBe(false)
    expect(sameExecutionPrincipal(human, { kind: 'unknown' })).toBe(false)
    expect(
      sameExecutionPrincipal({ kind: 'unknown' }, { kind: 'unknown' })
    ).toBe(true)
  })
})

describe('the public boundary', () => {
  it('refuses submittedBy at the top level and in the runtime', () => {
    expect(() =>
      parseExecutionSubmission(
        {
          idempotencyKey: 'key-forged',
          submittedBy: human,
          runtime: runtime()
        },
        tenantId
      )
    ).toThrow('submittedBy is set by the authenticated composition')
    expect(() =>
      parseExecutionSubmission(
        {
          idempotencyKey: 'key-forged',
          runtime: { ...runtime(), submittedBy: human }
        },
        tenantId
      )
    ).toThrow('submittedBy is set by the authenticated composition')
  })
})
