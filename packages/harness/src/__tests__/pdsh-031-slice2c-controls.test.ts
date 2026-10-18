import { describe, expect, it, vi } from 'vitest'
import {
  InMemoryEffectLedger,
  InMemoryKernelLog,
  approvalsControl,
  auditControl,
  budgetControl,
  telemetryCapability
} from '../kernel/controls.ts'
import type { KernelPlugin } from '../kernel/types.ts'

interface StopLike {
  readonly stopReason?: string
  readonly response?: string
  readonly cause?: string
}

interface BudgetLike {
  beginModelRequest(): StopLike | undefined
  remainingMs(): number
  withDeadline<T>(operation: () => Promise<T>, ms?: number): Promise<T | symbol>
}

interface Captured {
  readonly services: Map<string, unknown>
  hook(name: string): (...args: never[]) => Promise<unknown>
}

async function capture(plugin: KernelPlugin): Promise<Captured> {
  const services = new Map<string, unknown>()
  const listeners = new Map<
    string,
    ((...args: never[]) => Promise<unknown> | unknown)[]
  >()
  const ctx = {
    provide: (name: string, service: unknown) => services.set(name, service),
    on: (event: string, listener: (...args: never[]) => unknown) => {
      const list = listeners.get(event) ?? []
      list.push(listener)
      listeners.set(event, list)
      return async () => {}
    },
    guard: () => async () => {},
    get: (name: string) => services.get(name)
  }
  await plugin.apply?.(ctx as never)
  return {
    services,
    hook: (name) => {
      const listener = listeners.get(name)?.[0]
      if (!listener) throw new Error(`missing listener for ${name}`)
      return listener as (...args: never[]) => Promise<unknown>
    }
  }
}

function runtimeInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant_pdsh031',
    agent: { id: 'agent_pdsh031', version: 'v1' },
    correlationId: 'corr_pdsh031',
    executionId: 'exec_pdsh031',
    traceId: 'trace_pdsh031',
    budget: {
      maxDurationMs: 10_000,
      maxModelCalls: 10,
      maxTokens: 1_000,
      maxCostUsd: 1
    },
    ...overrides
  }
}

async function budgetOf(
  input: Record<string, unknown> = runtimeInput()
): Promise<BudgetLike> {
  const { services } = await capture(budgetControl())
  const service = services.get('budget') as {
    begin(input: unknown, startedAt: number): BudgetLike
  }
  return service.begin(input, Date.now())
}

const next = async () => 'next'

function callState(
  budget: BudgetLike,
  overrides: Record<string, unknown> = {}
) {
  return {
    turn: {
      input: runtimeInput(),
      budget,
      metadata: {},
      startedAt: Date.now()
    },
    tool: {
      id: 'synthetic.tool',
      description: 'synthetic tool',
      requiresApproval: true
    },
    invocation: { operationKey: 'op_pdsh031', input: { synthetic: true } },
    needsApproval: false,
    ...overrides
  }
}

const resultLike = {
  stopReason: 'COMPLETED',
  usage: { costUsd: 0, inputTokens: 0, outputTokens: 0 },
  steps: 1
}

const request = { approvalId: 'appr_pdsh031', executionRef: 'exec_pdsh031' }
const handle = { reservationId: 'res_pdsh031' }

function settleCall(budget: BudgetLike) {
  return callState(budget, { approval: { request, handle } })
}

describe('PDSH-031 slice 2c — budget control edges', () => {
  it('stops a model request whose duration budget is exhausted', async () => {
    const service = await budgetOf(
      runtimeInput({
        budget: {
          maxDurationMs: 0,
          maxModelCalls: 1,
          maxTokens: 1,
          maxCostUsd: 1
        }
      })
    )
    expect(service.beginModelRequest()).toMatchObject({
      stopReason: 'MAX_DURATION',
      response: expect.stringContaining('before the call was started')
    })
  })

  it('re-checks the duration window in both control hooks', async () => {
    const { hook } = await capture(budgetControl())
    const expired = {
      turn: { budget: { remainingMs: () => -1 } }
    } as never
    expect(
      await hook('model/before-call')(expired, next as never)
    ).toMatchObject({
      stopReason: 'MAX_DURATION',
      response: expect.stringContaining('before model execution')
    })
    expect(
      await hook('tool/pre-execute')(expired, next as never)
    ).toMatchObject({
      stopReason: 'MAX_DURATION',
      response: expect.stringContaining('before policy evaluation')
    })
  })

  it('keeps the in-memory log and effect ledger bounded', () => {
    const log = new InMemoryKernelLog(1)
    log.append({ event: 1 } as never)
    log.append({ event: 2 } as never)
    expect(log.events).toEqual([{ event: 2 }])

    const ledger = new InMemoryEffectLedger(1)
    ledger.started({ executionRef: 'exec-1', operationKey: 'op-1' } as never)
    ledger.finished(
      { executionRef: 'exec-2', operationKey: 'op-2' } as never,
      'succeeded'
    )
    expect(ledger.entries).toHaveLength(1)
    expect(ledger.entries[0]).toMatchObject({
      phase: 'succeeded',
      ref: { executionRef: 'exec-2' }
    })
  })
})

describe('PDSH-031 slice 2c — approval control edges', () => {
  it('treats a non-Error approval failure as unknown and defaults policyVersion', async () => {
    const approvals = {
      request: vi.fn((request: Record<string, unknown>) =>
        Promise.reject(request.policyVersion)
      ),
      execution: { begin: vi.fn() }
    }
    const { hook } = await capture(approvalsControl(approvals as never))
    const budget = await budgetOf()
    const gate = (await hook('tool/pre-execute')(
      callState(budget) as never,
      next as never
    )) as StopLike

    expect(approvals.request).toHaveBeenCalledTimes(1)
    expect(approvals.request.mock.calls[0]?.[0]).toMatchObject({
      policyVersion: 'unknown',
      executionRef: 'exec_pdsh031'
    })
    expect(gate).toMatchObject({
      stopReason: 'INSUFFICIENT_EVIDENCE',
      cause: 'approval_failed'
    })
    expect(gate.response).toContain('unknown failure')
  })

  it('stops approval evaluation and reservation on an exhausted budget', async () => {
    const approvals = { request: vi.fn(), execution: { begin: vi.fn() } }
    const { hook } = await capture(approvalsControl(approvals as never))
    const expired = await budgetOf(
      runtimeInput({
        budget: {
          maxDurationMs: 0,
          maxModelCalls: 1,
          maxTokens: 1,
          maxCostUsd: 1
        }
      })
    )
    const decision = (await hook('tool/pre-execute')(
      callState(expired) as never,
      next as never
    )) as StopLike
    expect(decision).toMatchObject({
      stopReason: 'MAX_DURATION',
      response: expect.stringContaining('before approval evaluation')
    })

    const reservation = (await hook('tool/execute')(
      callState(expired, { grant: request }) as never,
      next as never
    )) as { kind?: string; gate?: StopLike }
    expect(reservation).toMatchObject({
      kind: 'not_started',
      gate: {
        stopReason: 'MAX_DURATION',
        response: expect.stringContaining('before approval execution')
      }
    })
  })

  it('refuses to reserve without the single-use execution port', async () => {
    const approvals = { request: vi.fn(), execution: undefined }
    const { hook } = await capture(approvalsControl(approvals as never))
    const budget = await budgetOf()
    const reservation = (await hook('tool/execute')(
      callState(budget, { grant: request }) as never,
      next as never
    )) as { kind?: string; gate?: StopLike }
    expect(reservation).toMatchObject({
      kind: 'not_started',
      gate: {
        stopReason: 'INSUFFICIENT_EVIDENCE',
        cause: 'approval_unbound'
      }
    })
  })

  it('stops a reservation that overruns its window', async () => {
    const approvals = {
      request: vi.fn(),
      execution: { begin: vi.fn(() => new Promise(() => {})) }
    }
    const { hook } = await capture(approvalsControl(approvals as never))
    const budget = await budgetOf(
      runtimeInput({
        budget: {
          maxDurationMs: 100,
          maxModelCalls: 1,
          maxTokens: 1,
          maxCostUsd: 1
        }
      })
    )
    const reservation = (await hook('tool/execute')(
      callState(budget, { grant: request }) as never,
      next as never
    )) as { kind?: string; gate?: StopLike }
    expect(reservation).toMatchObject({
      kind: 'not_started',
      gate: {
        stopReason: 'INSUFFICIENT_EVIDENCE',
        cause: 'approval_failed',
        response: expect.stringContaining('timed out')
      }
    })
  })

  it('settles every not-started, failure and confirm path and swallows port failures', async () => {
    const port = {
      begin: vi.fn(),
      release: undefined,
      fail: vi.fn(() => Promise.reject(new Error('synthetic'))),
      uncertain: vi.fn(() => Promise.reject(new Error('synthetic'))),
      complete: vi.fn()
    }
    const approvals = { request: vi.fn(), execution: port }
    const { hook } = await capture(approvalsControl(approvals as never))
    const budget = await budgetOf()
    const settle = hook('tool/post-execute')
    const call = settleCall(budget) as never

    const notStarted = {
      kind: 'not_started',
      gate: { stopReason: 'POLICY_DENIED', response: 'denied' }
    }
    expect(await settle(call, notStarted as never)).toBe(notStarted)
    expect(port.fail).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceRef: 'exec_pdsh031:tool_not_started' })
    )

    const deadline = { kind: 'deadline', durationMs: 5 }
    expect(await settle(call, deadline as never)).toBe(deadline)
    expect(port.uncertain).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceRef: 'exec_pdsh031:tool_deadline' })
    )

    const cancelled = { kind: 'cancelled', durationMs: 5 }
    expect(await settle(call, cancelled as never)).toBe(cancelled)
    expect(port.uncertain).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceRef: 'exec_pdsh031:tool_cancelled' })
    )

    const threw = { kind: 'threw', error: 'synthetic', durationMs: 5 }
    expect(await settle(call, threw as never)).toBe(threw)
    expect(port.uncertain).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceRef: 'exec_pdsh031:tool_uncertain' })
    )

    const failed = { kind: 'failed', result: {}, durationMs: 5 }
    expect(await settle(call, failed as never)).toBe(failed)
    expect(port.fail).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceRef: 'exec_pdsh031:tool_failed' })
    )

    const confirmFailed = {
      kind: 'confirm_failed',
      result: {},
      error: 'synthetic',
      durationMs: 5
    }
    expect(await settle(call, confirmFailed as never)).toBe(confirmFailed)
  })
})

describe('PDSH-031 slice 2c — audit and telemetry defaults', () => {
  it('records audit under the default action with the grace window', async () => {
    const audit = { append: vi.fn(() => Promise.resolve(undefined)) }
    const { hook } = await capture(auditControl(audit as never))
    const budget = await budgetOf()
    await hook('turn/end')(
      {
        budget,
        input: runtimeInput(),
        metadata: {},
        startedAt: Date.now()
      } as never,
      resultLike as never
    )
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'harness.kernel' })
    )
  })

  it('records telemetry under the default name', async () => {
    const telemetry = { record: vi.fn() }
    const { hook } = await capture(telemetryCapability(telemetry as never))
    const budget = await budgetOf()
    await hook('turn/end')(
      {
        budget,
        input: runtimeInput(),
        metadata: { provider: 'synthetic' },
        startedAt: Date.now()
      } as never,
      resultLike as never
    )
    expect(telemetry.record).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'harness.kernel', errors: 0 })
    )
  })
})
