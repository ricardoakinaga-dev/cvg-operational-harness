// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type {
  CapabilityRegistration,
  SandboxGate,
  SandboxHandle,
  SandboxMode,
  ToolDefinition
} from '@cvg/harness-contracts'
import {
  createCapabilityRegistry,
  createOperationalHarness,
  InMemoryEffectJournal,
  InMemoryExecutionStepStore
} from '../packages/harness/src/index.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  phase3AgentProfile,
  phase3RuntimeInput
} from '../packages/harness/src/__tests__/fixtures/phase3-fixtures.ts'

const id = 'synthetic.aud0625.authority'
function tool(
  mode: SandboxMode,
  execute: ToolDefinition['execute']
): ToolDefinition {
  return {
    id,
    version: '1.0.0',
    description: 'Owned synthetic authority probe',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'LOW',
    sideEffect: 'READ',
    sandbox: mode,
    idempotent: true,
    requiresApproval: false,
    execute
  }
}
function registration(definition: ToolDefinition): CapabilityRegistration {
  const { execute, ...descriptor } = definition
  return {
    descriptor: {
      ...descriptor,
      origin: 'core',
      providerId: 'synthetic',
      providerVersion: '1.0.0'
    },
    implementation: {
      validateInput: () => true,
      execute,
      validateOutput: () => true
    }
  }
}
async function executeVia(
  path: 'tools' | 'capabilities',
  mode: SandboxMode = 'WORKSPACE',
  sandbox?: SandboxGate,
  profile: 'single_pass' | 'iterative' = 'single_pass'
) {
  let calls = 0
  let receivedHandle: SandboxHandle | undefined
  const definition = tool(mode, async (_input, context) => {
    calls++
    receivedHandle = context.sandboxHandle
    return { status: 'SUCCEEDED', output: { synthetic: true } }
  })
  const harness = createOperationalHarness({
    effectJournal: new InMemoryEffectJournal(),
    modelGateway: {
      complete: async () => ({
        text: 'unused',
        provider: 'synthetic',
        model: 'synthetic',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0
      })
    },
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    ...(sandbox ? { sandbox } : {}),
    stepStore: new InMemoryExecutionStepStore(),
    iterativeOrchestrator: {
      decide: async () => ({
        decision:
          calls > 0
            ? {
                decisionType: 'RESPOND' as const,
                reasonCode: 'GOAL_SATISFIED' as const,
                responseText: 'controlled done'
              }
            : {
                decisionType: 'CALL_TOOL' as const,
                reasonCode: 'TOOL_REQUIRED' as const,
                toolId: id,
                toolVersion: '1.0.0',
                toolInput: {}
              }
      })
    },
    ...(path === 'tools'
      ? { tools: { list: () => [definition], resolve: () => definition } }
      : { capabilities: createCapabilityRegistry([registration(definition)]) }),
    orchestrator: {
      decideNextStep: async () =>
        calls > 0
          ? { action: 'RESPOND' as const, response: 'controlled done' }
          : {
              action: 'CALL_TOOL' as const,
              toolInvocation: {
                toolId: id,
                toolVersion: '1.0.0',
                input: {},
                operationKey: 'aud0625-authority'
              }
            }
    }
  })
  const input = phase3RuntimeInput({
    runtimeProfile: profile,
    agent: phase3AgentProfile({ tools: [id] })
  })
  // This is a new public root, not a durable execution resume.
  const { executionId: _executionId, ...publicInput } = input
  void _executionId
  const result = await harness.execute(publicInput)
  return { result, calls, receivedHandle }
}

describe('AUD0625 F01 — preserve sandbox authority across public composition', () => {
  it('positive control: the tools route refuses a missing required sandbox', async () => {
    const actual = await executeVia('tools')
    expect(actual.result.stopReason).toBe('UNSAFE_REQUEST')
    expect(actual.calls).toBe(0)
  })
  it('F01 registration preserves the declared WORKSPACE mode', () => {
    const registry = createCapabilityRegistry([
      registration(
        tool('WORKSPACE', async () => ({ status: 'SUCCEEDED', output: {} }))
      )
    ])
    expect(registry.listDescriptors()[0]?.sandbox).toBe('WORKSPACE')
  })
  it('F01 WORKSPACE and PROCESS have distinct composition fingerprints', () => {
    const execute: ToolDefinition['execute'] = async () => ({
      status: 'SUCCEEDED',
      output: {}
    })
    const workspace = createCapabilityRegistry([
      registration(tool('WORKSPACE', execute))
    ])
    const process = createCapabilityRegistry([
      registration(tool('PROCESS', execute))
    ])
    expect(workspace.compositionFingerprint()).not.toBe(
      process.compositionFingerprint()
    )
  })
  it('F01 the capabilities route also refuses execution without a sandbox gate', async () => {
    const actual = await executeVia('capabilities')
    expect({
      stopReason: actual.result.stopReason,
      calls: actual.calls
    }).toEqual({ stopReason: 'UNSAFE_REQUEST', calls: 0 })
  })
})

describe('F01 authenticated sandbox mode matrix and legacy compatibility', () => {
  const execute: ToolDefinition['execute'] = async () => ({
    status: 'SUCCEEDED',
    output: {}
  })
  const modes = ['IN_PROCESS', 'WORKSPACE', 'PROCESS', 'EGRESS'] as const
  for (const mode of modes) {
    it(`${mode}: list, resolve and fingerprint retain the same mode`, () => {
      const registry = createCapabilityRegistry([
        registration(tool(mode, execute))
      ])
      expect(registry.listDescriptors()[0]?.sandbox).toBe(mode)
      expect(registry.resolveDescriptor(id, '1.0.0')?.sandbox).toBe(mode)
      expect(Object.isFrozen(registry.listDescriptors()[0])).toBe(true)
    })
    for (const profile of ['single_pass', 'iterative'] as const) {
      for (const kind of [
        'missing',
        'denied',
        'unavailable',
        'throw',
        'wrong-handle',
        'allowed'
      ] as const) {
        it(`${profile}/${mode}/${kind} traverses the public capabilities factory`, async () => {
          let gateCalls = 0
          const gate: SandboxGate = {
            evaluate: async (input) => {
              gateCalls++
              expect(input.descriptor.sandbox).toBe(mode)
              if (kind === 'denied')
                return { kind: 'denied', reason: 'owned fixture denial' }
              if (kind === 'unavailable')
                return {
                  kind: 'unavailable',
                  reason: 'owned fixture unavailable'
                }
              if (kind === 'throw')
                throw new Error('owned fixture gate failure')
              return {
                kind: 'allowed',
                mode,
                handle: {
                  mode: kind === 'wrong-handle' ? 'NONE' : mode,
                  allowNetwork: mode === 'EGRESS',
                  allowSubprocess: mode === 'PROCESS',
                  workspaceRoot: '/tmp',
                  deadlineMs: 2000
                }
              }
            }
          }
          const actual = await executeVia(
            'capabilities',
            mode,
            kind === 'missing' ? undefined : gate,
            profile
          )
          expect(actual.calls).toBe(kind === 'allowed' ? 1 : 0)
          expect(gateCalls).toBe(kind === 'missing' ? 0 : 1)
          if (kind !== 'allowed')
            expect(actual.result.stopReason).toBe('UNSAFE_REQUEST')
          else {
            expect(actual.receivedHandle?.mode).toBe(mode)
            expect(Object.isFrozen(actual.receivedHandle)).toBe(true)
          }
        })
      }
    }
  }
  it('all required modes have distinct fingerprints', () => {
    const fingerprints = modes.map((mode) =>
      createCapabilityRegistry([
        registration(tool(mode, execute))
      ]).compositionFingerprint()
    )
    expect(new Set(fingerprints).size).toBe(4)
  })
  for (const variant of ['absent', 'undefined', 'NONE'] as const) {
    it(`${variant}: preserves the exact legacy fingerprint and omitted field`, () => {
      const entry = registration(tool('NONE', execute))
      const descriptor = { ...entry.descriptor }
      if (variant === 'absent') delete descriptor.sandbox
      if (variant === 'undefined')
        Object.defineProperty(descriptor, 'sandbox', {
          value: undefined,
          enumerable: true
        })
      const registry = createCapabilityRegistry([{ ...entry, descriptor }])
      expect(registry.listDescriptors()[0]).not.toHaveProperty('sandbox')
      expect(registry.compositionFingerprint()).toBe(
        '98f036d6248561631916f90a5f3755b6c018673541201e250a0c403fea1fac05'
      )
    })
  }
  for (const value of [null, 'UNKNOWN', 'workspace', 12, false, {}, []]) {
    it(`invalid sandbox ${JSON.stringify(value)} is rejected rather than downgraded`, () => {
      const entry = registration(tool('NONE', execute))
      Object.defineProperty(entry.descriptor, 'sandbox', {
        value,
        enumerable: true
      })
      expect(() => createCapabilityRegistry([entry])).toThrowError(
        expect.objectContaining({ code: 'invalid_descriptor' })
      )
    })
  }
  it('rejects a sandbox accessor without calling it', () => {
    const entry = registration(tool('NONE', execute))
    let reads = 0
    Object.defineProperty(entry.descriptor, 'sandbox', {
      enumerable: true,
      get: () => {
        reads++
        return 'NONE'
      }
    })
    expect(() => createCapabilityRegistry([entry])).toThrowError(
      expect.objectContaining({ code: 'invalid_descriptor' })
    )
    expect(reads).toBe(0)
  })
  it('NONE remains callable without a sandbox gate', async () => {
    const actual = await executeVia('capabilities', 'NONE')
    expect(actual.calls).toBe(1)
    expect(actual.receivedHandle).toBeUndefined()
  })
})
