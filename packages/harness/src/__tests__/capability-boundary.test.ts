import { describe, expect, it } from 'vitest'
import type {
  CapabilityOrigin,
  CapabilityImplementation,
  CapabilityRegistration,
  ModelGateway,
  RuntimeInput,
  ToolExecutionContext
} from '@cvg/harness-contracts'
import {
  CapabilityRegistryError,
  createCapabilityRegistry,
  createOperationalHarness,
  InMemoryEffectJournal
} from '../index.ts'
import * as publicApi from '../index.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  PHASE3_TENANT,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

const CAPABILITY_ID = 'synthetic.capability'
const CAPABILITY_VERSION = '1.0.0'

interface CapabilityOptions {
  readonly id?: string
  readonly origin?: CapabilityOrigin
  readonly providerId?: string
  readonly providerVersion?: string
  readonly outputValue?: string
  readonly outputValid?: boolean
  readonly sideEffect?: 'NONE' | 'READ' | 'WRITE' | 'EXTERNAL'
  readonly idempotent?: boolean
  readonly inputSchema?: unknown
  readonly outputSchema?: unknown
  readonly implementation?: CapabilityImplementation
  readonly observed?: Array<{ input: unknown; context: ToolExecutionContext }>
}

function registration(options: CapabilityOptions = {}): CapabilityRegistration {
  const id = options.id ?? CAPABILITY_ID
  const outputValue = options.outputValue ?? 'provider-a'
  return {
    descriptor: {
      id,
      version: CAPABILITY_VERSION,
      description: `Synthetic ${id}`,
      inputSchema: options.inputSchema ?? {
        type: 'object',
        required: ['value']
      },
      outputSchema: options.outputSchema ?? {
        type: 'object',
        required: ['provider']
      },
      risk: 'LOW',
      sideEffect: options.sideEffect ?? 'READ',
      idempotent: options.idempotent ?? true,
      requiresApproval: false,
      origin: options.origin ?? 'core',
      providerId: options.providerId ?? 'provider-a',
      providerVersion: options.providerVersion ?? '1.0.0'
    },
    implementation: options.implementation ?? {
      validateInput: (input) =>
        isRecord(input) && typeof input.value === 'string',
      execute: async (input, context) => {
        options.observed?.push({ input, context })
        return { status: 'SUCCEEDED', output: { provider: outputValue } }
      },
      validateOutput: (output) =>
        options.outputValid !== false &&
        isRecord(output) &&
        output.provider === outputValue
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function runtimeInput(
  toolId = CAPABILITY_ID,
  tools: readonly string[] = [CAPABILITY_ID],
  operationKey = `capability-operation-${toolId}`,
  overrides: Partial<RuntimeInput> = {}
): RuntimeInput {
  const { executionId: _executionId, ...base } = phase3RuntimeInput({
    runtimeProfile: 'single_pass',
    agent: phase3AgentProfile({ tools }),
    requestedTool: {
      toolId,
      toolVersion: CAPABILITY_VERSION,
      operationKey,
      input: { value: 'synthetic-input' }
    }
  })
  void _executionId
  return { ...base, ...overrides }
}

function publicPorts(approvalTools: readonly string[] = []) {
  const audit = new RecordingAuditSink()
  const telemetry = new RecordingTelemetrySink()
  const modelGateway: ModelGateway = {
    complete: async () => ({
      text: 'unused',
      provider: 'deterministic-v1',
      model: 'fixture',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0
    })
  }
  const policy = new ScriptedPolicyEngine([], [], approvalTools)
  return {
    modelGateway,
    policy,
    approvals: new InMemoryApprovalEngine(),
    audit,
    telemetry,
    auditEvents: audit.events,
    telemetryEvents: telemetry.events,
    policyEvaluations: policy.evaluations
  }
}

function createPublicHarness(
  registry: ReturnType<typeof createCapabilityRegistry>,
  operationKey = 'capability-public-operation',
  ports = publicPorts(),
  effectJournal = new InMemoryEffectJournal()
) {
  const harness = createOperationalHarness({
    ...ports,
    capabilities: registry,
    effectJournal,
    orchestrator: {
      decideNextStep: async ({ runtime }) => ({
        action: 'CALL_TOOL' as const,
        toolInvocation: runtime.requestedTool ?? {
          toolId: CAPABILITY_ID,
          toolVersion: CAPABILITY_VERSION,
          operationKey,
          input: { value: 'synthetic-input' }
        }
      })
    }
  })
  return { harness, effectJournal, ...ports }
}

describe('AAA-41 generic capability boundary', () => {
  it('keeps descriptors detached from implementations and registry snapshots immutable', () => {
    const base = createCapabilityRegistry()
    const registry = base.register(registration())
    const extended = registry.register(
      registration({ id: 'synthetic.capability.second' })
    )
    const descriptor = registry.listDescriptors()[0]!

    expect(base.listDescriptors()).toHaveLength(0)
    expect(extended.listDescriptors()).toHaveLength(2)
    expect(descriptor).not.toHaveProperty('implementation')
    expect(Object.isFrozen(descriptor)).toBe(true)
    expect(Object.isFrozen(descriptor.inputSchema)).toBe(true)
    expect(() => {
      ;(descriptor as { id: string }).id = 'tampered'
    }).toThrow()
    expect(registry.resolveDescriptor(CAPABILITY_ID, 'latest')).toBeUndefined()
    expect(registry).not.toHaveProperty('toToolRegistry')
    expect(publicApi).not.toHaveProperty('createCapabilityToolRegistry')
    expect(() => registry.register(registration())).toThrowError(
      CapabilityRegistryError
    )
  })

  it('requires exact versions and validates input and output at the adapter boundary', async () => {
    const observed: Array<{ input: unknown; context: ToolExecutionContext }> =
      []
    const registry = createCapabilityRegistry([
      registration({ observed }),
      registration({
        id: 'synthetic.capability.bad-output',
        outputValid: false
      })
    ])
    const badInput = (
      await createPublicHarness(registry).harness.execute(
        runtimeInput(CAPABILITY_ID, [CAPABILITY_ID], undefined, {
          requestedTool: {
            toolId: CAPABILITY_ID,
            toolVersion: CAPABILITY_VERSION,
            operationKey: 'capability-adapter-input',
            input: { value: 7 }
          }
        })
      )
    ).toolResult
    const badOutput = (
      await createPublicHarness(registry).harness.execute(
        runtimeInput('synthetic.capability.bad-output', [
          'synthetic.capability.bad-output'
        ])
      )
    ).toolResult

    expect(badInput).toEqual({
      status: 'REJECTED',
      error: 'capability_input_invalid'
    })
    expect(badOutput).toEqual({
      status: 'REJECTED',
      error: 'capability_output_invalid'
    })
    expect(observed).toHaveLength(0)
  })

  it('fails closed for unknown origins, version drift, and direct bypass attempts', async () => {
    expect(() =>
      createCapabilityRegistry([
        registration({ origin: 'remote' as CapabilityOrigin })
      ])
    ).toThrowError(CapabilityRegistryError)

    const observed: Array<{ input: unknown; context: ToolExecutionContext }> =
      []
    const registry = createCapabilityRegistry([registration({ observed })])
    const ports = publicPorts()
    const { harness, effectJournal } = createPublicHarness(
      registry,
      'negative-version',
      ports
    )
    const invalidResolutions = [
      { label: 'missing-version', toolId: CAPABILITY_ID, toolVersion: '' },
      { label: 'latest-version', toolId: CAPABILITY_ID, toolVersion: 'latest' },
      { label: 'unknown-version', toolId: CAPABILITY_ID, toolVersion: '2.0.0' },
      {
        label: 'unknown-capability',
        toolId: 'synthetic.capability.unknown',
        toolVersion: CAPABILITY_VERSION
      }
    ] as const

    for (const invalid of invalidResolutions) {
      const operationKey = `negative-${invalid.label}`
      const result = await harness.execute(
        runtimeInput(invalid.toolId, [invalid.toolId], operationKey, {
          requestedTool: {
            toolId: invalid.toolId,
            toolVersion: invalid.toolVersion,
            operationKey,
            input: { value: 'synthetic-input' }
          }
        })
      )

      expect(result.stopReason, invalid.label).toBe('TOOL_FAILURE')
      expect(result.toolCalls, invalid.label).toBe(1)
      expect(await effectJournal.get(PHASE3_TENANT, operationKey)).toBeNull()
    }

    expect(observed).toHaveLength(0)
    expect(ports.policyEvaluations).toHaveLength(0)
    expect(publicApi).not.toHaveProperty('createCapabilityToolRegistry')
    expect(() =>
      createOperationalHarness({
        ...publicPorts(),
        capabilities: registry,
        effectJournal: new InMemoryEffectJournal(),
        tools: { list: () => [], resolve: () => undefined }
      } as never)
    ).toThrow(/capabilities or tools/i)
  })

  it('rejects unsupported, unsafe, cyclic, and oversized JSON at registration', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const unsafe = Object.create(null) as Record<string, unknown>
    unsafe.__proto__ = 'blocked'
    const deep: Record<string, unknown> = {}
    let cursor = deep
    for (let index = 0; index < 66; index += 1) {
      cursor.next = {}
      cursor = cursor.next as Record<string, unknown>
    }

    const invalidSchemas: readonly unknown[] = [
      cyclic,
      unsafe,
      new Date(),
      { callback: () => undefined },
      { symbol: Symbol('blocked') },
      { number: Number.NaN },
      { oversized: 'x'.repeat(16_385) },
      deep,
      Array.from({ length: 513 }, () => true),
      Object.fromEntries(
        Array.from({ length: 513 }, (_, index) => [`key-${index}`, true])
      )
    ]

    for (const inputSchema of invalidSchemas) {
      expect(() =>
        createCapabilityRegistry([registration({ inputSchema })])
      ).toThrowError(CapabilityRegistryError)
    }
  })

  it('rejects malformed implementations and results without leaking provider errors', async () => {
    expect(() =>
      createCapabilityRegistry([
        registration({
          implementation: { execute: async () => undefined } as never
        })
      ])
    ).toThrowError(CapabilityRegistryError)

    const registry = createCapabilityRegistry([
      registration({
        implementation: {
          validateInput: () => true,
          execute: async () => ({ status: 'UNKNOWN' }) as never,
          validateOutput: () => true
        }
      })
    ])
    const result = (
      await createPublicHarness(registry).harness.execute(runtimeInput())
    ).toolResult

    expect(result).toEqual({
      status: 'REJECTED',
      error: 'capability_result_invalid'
    })
  })

  it('fails closed for malformed public inputs before provider execution or confirmation', async () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const accessor: Record<string, unknown> = {}
    Object.defineProperty(accessor, 'value', {
      enumerable: true,
      get: () => 'accessor-value'
    })
    const symbolValue: Record<string, unknown> = { value: 'ok' }
    Object.defineProperty(symbolValue, Symbol('blocked'), {
      enumerable: true,
      value: 'blocked'
    })
    const sparse = [] as unknown[]
    sparse[1] = 'sparse'
    const unsupportedPrototype = Object.create({ inherited: true }) as Record<
      string,
      unknown
    >
    unsupportedPrototype.value = 'prototype'
    const invalidInputs: readonly [string, unknown][] = [
      ['cyclic', cyclic],
      ['oversized-string', { value: 'x'.repeat(16_385) }],
      ['oversized-array', { value: Array.from({ length: 513 }, () => true) }],
      ['sparse-array', { value: sparse }],
      ['accessor', { value: accessor }],
      ['symbol', { value: symbolValue }],
      ['non-finite', { value: Number.NaN }],
      ['unsupported-prototype', { value: unsupportedPrototype }]
    ]
    const observed: Array<{ input: unknown; context: ToolExecutionContext }> =
      []
    const registry = createCapabilityRegistry([registration({ observed })])
    const journal = new InMemoryEffectJournal()
    const { harness } = createPublicHarness(
      registry,
      'malformed-public-inputs',
      publicPorts(),
      journal
    )

    for (const [label, input] of invalidInputs) {
      const operationKey = `malformed-input-${label}`
      const result = await harness.execute(
        runtimeInput(CAPABILITY_ID, [CAPABILITY_ID], operationKey, {
          requestedTool: {
            toolId: CAPABILITY_ID,
            toolVersion: CAPABILITY_VERSION,
            operationKey,
            input
          }
        })
      )
      const record = await journal.get(PHASE3_TENANT, operationKey)

      expect(result.stopReason, label).toBe('TOOL_FAILURE')
      expect(result.toolResult?.status, label).not.toBe('SUCCEEDED')
      expect(record?.state ?? 'NO_RECORD', label).not.toBe('CONFIRMED')
    }

    expect(observed).toHaveLength(0)
  })

  it('rejects cyclic, oversized, and non-finite provider results without confirmation', async () => {
    const outputCases = [
      {
        id: 'synthetic.capability.cyclic-output',
        create: () => {
          const output: Record<string, unknown> = {}
          output.self = output
          return output
        }
      },
      {
        id: 'synthetic.capability.oversized-output',
        create: () => ({ value: 'x'.repeat(16_385) })
      },
      {
        id: 'synthetic.capability.non-finite-output',
        create: () => ({ value: Number.NaN })
      }
    ] as const
    let executions = 0
    const registrations = outputCases.map(({ id, create }) =>
      registration({
        id,
        implementation: {
          validateInput: (input) => isRecord(input),
          execute: async () => {
            executions += 1
            return { status: 'SUCCEEDED', output: create() }
          },
          validateOutput: () => true
        }
      })
    )
    const journal = new InMemoryEffectJournal()
    const registry = createCapabilityRegistry(registrations)
    const { harness } = createPublicHarness(
      registry,
      'malformed-provider-results',
      publicPorts(),
      journal
    )

    for (const [index, { id }] of outputCases.entries()) {
      const operationKey = `malformed-output-${index}`
      const result = await harness.execute(
        runtimeInput(id, [id], operationKey, {
          requestedTool: {
            toolId: id,
            toolVersion: CAPABILITY_VERSION,
            operationKey,
            input: { value: 'synthetic-input' }
          }
        })
      )
      const record = await journal.get(PHASE3_TENANT, operationKey)

      expect(result.toolResult).toEqual({
        status: 'REJECTED',
        error: 'capability_result_invalid'
      })
      expect(record?.state).toBe('FAILED')
      expect(record?.state).not.toBe('CONFIRMED')
    }

    expect(executions).toBe(outputCases.length)
  })

  it('captures executable methods at registration without exposing mutable handlers', async () => {
    const mutableImplementation = {
      validateInput: () => true,
      execute: async () => ({
        status: 'SUCCEEDED' as const,
        output: { provider: 'before-mutation' }
      }),
      validateOutput: (output: unknown) => isRecord(output)
    }
    const { harness } = createPublicHarness(
      createCapabilityRegistry([
        registration({ implementation: mutableImplementation })
      ])
    )
    mutableImplementation.execute = async () => ({
      status: 'SUCCEEDED' as const,
      output: { provider: 'after-mutation' }
    })

    const result = await harness.execute(runtimeInput())

    expect(result.toolResult?.output).toEqual({
      provider: 'before-mutation'
    })
  })

  it('composes every declared origin through the same public harness path', async () => {
    const origins: readonly CapabilityOrigin[] = [
      'core',
      'skill',
      'plugin',
      'knowledge',
      'mcp'
    ]
    const registrations = origins.map((origin, index) =>
      registration({
        id: `synthetic.capability.${origin}`,
        origin,
        providerId: `provider-${index}`
      })
    )
    const forward = createCapabilityRegistry(registrations)
    const reverse = createCapabilityRegistry([...registrations].reverse())

    expect(
      forward
        .listDescriptors()
        .map((item) => item.origin)
        .sort()
    ).toEqual([...origins].sort())
    expect(forward.compositionFingerprint()).toBe(
      reverse.compositionFingerprint()
    )
    expect(forward.listDescriptors()).toHaveLength(origins.length)

    for (const origin of origins) {
      const { harness } = createPublicHarness(
        createCapabilityRegistry([registration({ origin })]),
        `origin-${origin}`
      )
      const result = await harness.execute(
        runtimeInput(CAPABILITY_ID, [CAPABILITY_ID], `origin-${origin}`)
      )
      expect(result.stopReason).toBe('COMPLETED')
    }
  })

  it('uses locale-independent code-unit ordering for composition fingerprints', () => {
    const registry = createCapabilityRegistry([
      registration({ id: 'z.synthetic.capability' }),
      registration({ id: 'a.synthetic.capability' }),
      registration({ id: 'A.synthetic.capability' })
    ])

    expect(
      registry.listDescriptors().map((descriptor) => descriptor.id)
    ).toEqual([
      'A.synthetic.capability',
      'a.synthetic.capability',
      'z.synthetic.capability'
    ])
  })

  it('binds approvals and concurrent effects to the capability composition', async () => {
    const observed: Array<{ input: unknown; context: ToolExecutionContext }> =
      []
    const registry = createCapabilityRegistry([
      registration({
        observed,
        sideEffect: 'WRITE',
        idempotent: false
      })
    ])
    const ports = publicPorts([CAPABILITY_ID])
    ports.approvals.approveOnRequest = true
    const { harness, effectJournal } = createPublicHarness(
      registry,
      'shared-effect',
      ports
    )
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        harness.execute(
          runtimeInput(CAPABILITY_ID, [CAPABILITY_ID], 'shared-effect')
        )
      )
    )

    expect(ports.approvals.requests[0]?.payload).toEqual({
      capabilityFingerprint: harness.capabilityFingerprint,
      input: { value: 'synthetic-input' }
    })
    expect(results.some((result) => result.stopReason === 'COMPLETED')).toBe(
      true
    )
    expect(observed).toHaveLength(1)
    expect(
      (await effectJournal.get(PHASE3_TENANT, 'shared-effect'))?.state
    ).toBe('CONFIRMED')
  })

  it('swaps provider implementations without changing the governed public path', async () => {
    const first = createPublicHarness(
      createCapabilityRegistry([
        registration({ providerId: 'provider-a', outputValue: 'a' })
      ])
    )
    const second = createPublicHarness(
      createCapabilityRegistry([
        registration({ providerId: 'provider-b', outputValue: 'b' })
      ])
    )

    const firstResult = await first.harness.execute(runtimeInput())
    const secondResult = await second.harness.execute(runtimeInput())

    expect(firstResult.stopReason).toBe('COMPLETED')
    expect(secondResult.stopReason).toBe('COMPLETED')
    expect(firstResult.toolResult?.output).toEqual({ provider: 'a' })
    expect(secondResult.toolResult?.output).toEqual({ provider: 'b' })
    expect(first.harness.capabilityFingerprint).not.toBe(
      second.harness.capabilityFingerprint
    )
    expect(first.auditEvents.map((event) => event.action)).toEqual([
      'harness.single_pass'
    ])
    expect(second.auditEvents.map((event) => event.action)).toEqual([
      'harness.single_pass'
    ])
    expect(
      first.policyEvaluations.map((event) => [event.action, event.tool.id])
    ).toEqual([['tool.execute', CAPABILITY_ID]])
    expect(
      second.policyEvaluations.map((event) => [event.action, event.tool.id])
    ).toEqual([['tool.execute', CAPABILITY_ID]])
  })

  it('filters the public catalog and blocks a requested capability outside the agent profile', async () => {
    const observed: Array<{ input: unknown; context: ToolExecutionContext }> =
      []
    const { harness, auditEvents } = createPublicHarness(
      createCapabilityRegistry([registration({ observed })])
    )
    const result = await harness.execute(runtimeInput(CAPABILITY_ID, ['other']))

    expect(result.stopReason).toBe('POLICY_DENIED')
    expect(result.toolCalls).toBe(0)
    expect(observed).toHaveLength(0)
    expect(auditEvents).toHaveLength(1)
  })

  it('preserves tenant and trace context for concurrent public executions', async () => {
    const observed: Array<{ input: unknown; context: ToolExecutionContext }> =
      []
    const { harness } = createPublicHarness(
      createCapabilityRegistry([registration({ observed })])
    )
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        harness.execute(
          runtimeInput(
            CAPABILITY_ID,
            [CAPABILITY_ID],
            `capability-concurrent-${index}`,
            {
              tenantId: (index % 2 === 0
                ? 'tenant_00000000-0000-4000-8000-000000000003'
                : 'tenant_00000000-0000-4000-8000-000000000004') as RuntimeInput['tenantId'],
              correlationId:
                `correlation_concurrent_${index}` as RuntimeInput['correlationId'],
              traceId: `trace_concurrent_${index}` as RuntimeInput['traceId']
            }
          )
        )
      )
    )

    expect(results.every((result) => result.stopReason === 'COMPLETED')).toBe(
      true
    )
    expect(observed).toHaveLength(20)
    expect(
      new Set(observed.map((item) => item.context.operationKey)).size
    ).toBe(20)
    expect(
      observed.every((item) =>
        item.context.traceId.startsWith('trace_concurrent_')
      )
    ).toBe(true)
  })

  it('keeps identical operation keys isolated across tenant contexts', async () => {
    const tenantA =
      'tenant_00000000-0000-4000-8000-000000000003' as RuntimeInput['tenantId']
    const tenantB =
      'tenant_00000000-0000-4000-8000-000000000004' as RuntimeInput['tenantId']
    const observed: Array<{ input: unknown; context: ToolExecutionContext }> =
      []
    const registry = createCapabilityRegistry([
      registration({
        observed,
        implementation: {
          validateInput: (input) => isRecord(input),
          execute: async (input, context) => {
            observed.push({ input, context })
            return {
              status: 'SUCCEEDED',
              output: { tenantId: context.tenantId }
            }
          },
          validateOutput: (output) =>
            isRecord(output) && typeof output.tenantId === 'string'
        }
      })
    ])
    const journal = new InMemoryEffectJournal()
    const ports = publicPorts()
    const { harness, policyEvaluations, auditEvents, telemetryEvents } =
      createPublicHarness(registry, 'cross-tenant-operation', ports, journal)

    const executeFor = (
      tenantId: RuntimeInput['tenantId'],
      payloadTenantId = tenantId,
      operationKey = 'cross-tenant-operation'
    ) =>
      harness.execute(
        runtimeInput(CAPABILITY_ID, [CAPABILITY_ID], operationKey, {
          tenantId,
          correlationId:
            `correlation-${tenantId}` as RuntimeInput['correlationId'],
          traceId: `trace-${tenantId}` as RuntimeInput['traceId'],
          requestedTool: {
            toolId: CAPABILITY_ID,
            toolVersion: CAPABILITY_VERSION,
            operationKey,
            input: { tenantId: payloadTenantId, value: 'synthetic-input' }
          }
        })
      )

    const first = await executeFor(tenantA)
    const second = await executeFor(tenantB)
    const replay = await executeFor(tenantA)
    const spoof = await executeFor(
      tenantB,
      tenantA,
      'cross-tenant-spoof-attempt'
    )

    expect(first.toolResult?.output).toEqual({ tenantId: tenantA })
    expect(second.toolResult?.output).toEqual({ tenantId: tenantB })
    expect(replay.toolResult?.output).toEqual({ tenantId: tenantA })
    expect(spoof.stopReason).toBe('TOOL_FAILURE')
    expect(spoof.toolResult).toEqual({
      status: 'REJECTED',
      error: 'capability_input_invalid'
    })
    expect(observed).toHaveLength(2)
    expect(observed.map(({ context }) => context.tenantId)).toEqual([
      tenantA,
      tenantB
    ])
    expect(observed.map(({ input }) => input)).toEqual([
      { tenantId: tenantA, value: 'synthetic-input' },
      { tenantId: tenantB, value: 'synthetic-input' }
    ])
    expect(policyEvaluations.map((evaluation) => evaluation.tenantId)).toEqual([
      tenantA,
      tenantB,
      tenantA,
      tenantB
    ])
    expect(auditEvents.map((event) => event.tenant)).toEqual([
      tenantA,
      tenantB,
      tenantA,
      tenantB
    ])
    expect(
      telemetryEvents.map((event) => [event.traceId, event.correlationId])
    ).toEqual([
      [`trace-${tenantA}`, `correlation-${tenantA}`],
      [`trace-${tenantB}`, `correlation-${tenantB}`],
      [`trace-${tenantA}`, `correlation-${tenantA}`],
      [`trace-${tenantB}`, `correlation-${tenantB}`]
    ])
    expect((await journal.get(tenantA, 'cross-tenant-operation'))?.state).toBe(
      'CONFIRMED'
    )
    expect((await journal.get(tenantB, 'cross-tenant-operation'))?.state).toBe(
      'CONFIRMED'
    )
    expect(
      (await journal.get(tenantB, 'cross-tenant-spoof-attempt'))?.state
    ).not.toBe('CONFIRMED')
  })

  it('replays a confirmed capability effect through the existing journal adapter', async () => {
    let executions = 0
    const registry = createCapabilityRegistry([
      registration({
        implementation: {
          validateInput: (input) => isRecord(input),
          execute: async () => {
            executions += 1
            await Promise.resolve()
            return { status: 'SUCCEEDED', output: { executions } }
          },
          validateOutput: (output) => isRecord(output)
        }
      })
    ])
    const journal = new InMemoryEffectJournal()
    const ports = publicPorts()
    const harness = createOperationalHarness({
      ...ports,
      capabilities: registry,
      effectJournal: journal,
      orchestrator: {
        decideNextStep: async ({ runtime }) => ({
          action: 'CALL_TOOL' as const,
          toolInvocation: runtime.requestedTool!
        })
      }
    })

    const first = await harness.execute(runtimeInput())
    const replay = await createOperationalHarness({
      ...ports,
      capabilities: registry,
      effectJournal: journal,
      orchestrator: {
        decideNextStep: async ({ runtime }) => ({
          action: 'CALL_TOOL' as const,
          toolInvocation: runtime.requestedTool!
        })
      }
    }).execute(runtimeInput())

    expect(first.stopReason).toBe('COMPLETED')
    expect(replay.stopReason).toBe('COMPLETED')
    expect(replay.toolResult?.output).toEqual({ executions: 1 })
    expect(executions).toBe(1)
    expect(
      (
        await journal.get(
          'tenant_00000000-0000-4000-8000-000000000003',
          'capability-operation-synthetic.capability'
        )
      )?.state
    ).toBe('CONFIRMED')
  })

  it('rejects a replay when the capability composition changes', async () => {
    const executions = { value: 0 }
    const firstRegistry = createCapabilityRegistry([
      registration({
        providerId: 'provider-a',
        outputValue: 'a',
        sideEffect: 'WRITE',
        idempotent: false,
        implementation: {
          validateInput: (input) => isRecord(input),
          execute: async () => {
            executions.value += 1
            return { status: 'SUCCEEDED', output: { provider: 'a' } }
          },
          validateOutput: (output) => isRecord(output)
        }
      })
    ])
    const secondRegistry = createCapabilityRegistry([
      registration({
        providerId: 'provider-b',
        outputValue: 'b',
        sideEffect: 'WRITE',
        idempotent: false,
        implementation: {
          validateInput: (input) => isRecord(input),
          execute: async () => {
            executions.value += 1
            return { status: 'SUCCEEDED', output: { provider: 'b' } }
          },
          validateOutput: (output) => isRecord(output)
        }
      })
    ])
    const journal = new InMemoryEffectJournal()
    const first = createPublicHarness(
      firstRegistry,
      'composition-bound-effect',
      publicPorts(),
      journal
    )
    const firstResult = await first.harness.execute(
      runtimeInput(CAPABILITY_ID, [CAPABILITY_ID], 'composition-bound-effect')
    )
    const second = createPublicHarness(
      secondRegistry,
      'composition-bound-effect',
      publicPorts(),
      journal
    )
    const secondResult = await second.harness.execute(
      runtimeInput(CAPABILITY_ID, [CAPABILITY_ID], 'composition-bound-effect')
    )

    expect(firstResult.stopReason).toBe('COMPLETED')
    expect(secondResult.stopReason).toBe('TOOL_FAILURE')
    expect(secondResult.toolResult?.error).toContain('different proposal')
    expect(executions.value).toBe(1)
  })

  it('fails closed when a durable input presents a different fingerprint', async () => {
    const { harness, policyEvaluations } = createPublicHarness(
      createCapabilityRegistry([registration()])
    )
    const result = await harness.execute(
      runtimeInput(CAPABILITY_ID, [CAPABILITY_ID], undefined, {
        executionId: 'exec_fingerprint_mismatch',
        capabilityFingerprint: 'tampered-composition'
      })
    )

    expect(result.stopReason).toBe('STATE_CONFLICT')
    expect(result.toolCalls).toBe(0)
    expect(policyEvaluations).toHaveLength(0)
  })

  it('fails closed when a durable input omits its composition fingerprint', async () => {
    const { harness, policyEvaluations } = createPublicHarness(
      createCapabilityRegistry([registration()])
    )
    const result = await harness.execute(
      runtimeInput(CAPABILITY_ID, [CAPABILITY_ID], undefined, {
        executionId: 'exec_fingerprint_missing'
      })
    )

    expect(result.stopReason).toBe('STATE_CONFLICT')
    expect(result.toolCalls).toBe(0)
    expect(policyEvaluations).toHaveLength(0)
  })

  it('fails closed when composition supplies no registry or two registries', () => {
    const ports = publicPorts()
    const common = {
      ...ports,
      orchestrator: {
        decideNextStep: async () => ({
          action: 'RESPOND' as const,
          response: 'ok'
        })
      }
    }
    expect(() =>
      createOperationalHarness(
        common as Parameters<typeof createOperationalHarness>[0]
      )
    ).toThrow()
    expect(() =>
      createOperationalHarness({
        ...common,
        capabilities: createCapabilityRegistry([registration()])
      })
    ).toThrow(/effect journal/i)
    expect(() =>
      createOperationalHarness({
        ...common,
        capabilities: createCapabilityRegistry([registration()]),
        tools: { list: () => [], resolve: () => undefined }
      })
    ).toThrow()
  })
})
