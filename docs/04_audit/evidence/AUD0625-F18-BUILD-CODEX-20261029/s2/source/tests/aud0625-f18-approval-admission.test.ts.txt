// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import {
  approvalsControl,
  budgetControl,
  policyControl
} from '../packages/harness/src/kernel/controls.ts'
import { KernelHost } from '../packages/harness/src/kernel/host.ts'
import { createTurnState } from '../packages/harness/src/kernel/pipeline.ts'
import {
  stop,
  type ToolCallState,
  type ToolOutcome
} from '../packages/harness/src/kernel/types.ts'
import {
  InMemoryApprovalEngine,
  ScriptedPolicyEngine,
  phase3RuntimeInput
} from '../packages/harness/src/__tests__/fixtures/phase3-fixtures.ts'

async function admission(
  requiresApproval: boolean,
  needsApproval: boolean,
  policyRequires: boolean
) {
  const approvals = new InMemoryApprovalEngine()
  const host = await KernelHost.boot(
    [
      budgetControl(),
      policyControl(new ScriptedPolicyEngine()),
      approvalsControl(approvals)
    ],
    ['budget', 'policy', 'approvals']
  )
  let calls = 0
  try {
    const input = phase3RuntimeInput()
    const turn = createTurnState(
      input,
      Date.now(),
      host.get('budget').begin(input, Date.now()),
      new AbortController().signal
    )
    const call: ToolCallState = {
      turn,
      needsApproval,
      policyDecision: {
        outcome: policyRequires ? 'REQUIRE_APPROVAL' : 'ALLOW',
        reason: 'owned',
        policyVersion: 'owned-v1'
      },
      invocation: {
        toolId: 'owned.required',
        input: {},
        operationKey: 'owned-op'
      },
      tool: {
        id: 'owned.required',
        version: 'v1',
        description: 'owned',
        inputSchema: {},
        outputSchema: {},
        risk: 'HIGH',
        sideEffect: 'WRITE',
        idempotent: false,
        requiresApproval,
        execute: async () => ({ status: 'SUCCEEDED' })
      }
    }
    // Directly exercise the real execute control independently of pre-execute,
    // with no grant and no malicious extension. next is only a counted seam.
    const listener = host.listeners('tool/execute')[0]!
    const outcome = await listener.fn(call, async (): Promise<ToolOutcome> => {
      calls++
      return { kind: 'not_started', gate: stop('POLICY_DENIED', 'OWNED-NEXT') }
    })
    return { calls, outcome }
  } finally {
    await host.dispose()
  }
}
const cases = [
  [true, false, false],
  [false, true, false],
  [false, false, true],
  [false, false, false]
] as const
const observations: Awaited<ReturnType<typeof admission>>[] = []
beforeAll(async () => {
  for (const [a, b, c] of cases) observations.push(await admission(a, b, c))
})
describe('F18 missing-grant approval defense independently of mutable hooks', () => {
  it.each([0, 1, 2])('refuses without a grant for case %s', (index) => {
    const value = observations[index]!
    expect(value.calls).toBe(0)
    expect(value.outcome).toMatchObject({
      kind: 'not_started',
      gate: { stopReason: 'INSUFFICIENT_EVIDENCE', cause: 'approval_unbound' }
    })
  })
  it('does not require a grant when neither policy nor descriptor needs approval', () => {
    expect(observations[3]!.calls).toBe(1)
  })
})
