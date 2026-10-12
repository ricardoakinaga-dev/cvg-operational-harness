import { describe, expect, it } from 'vitest'
import type {
  CapabilityRegistration,
  ToolDefinition
} from '@cvg/harness-contracts'
import {
  CapabilityRegistry,
  CapabilityRegistryError,
  composeCapabilities,
  createCapabilityToolRegistry
} from '../capability-boundary.ts'
import {
  InMemoryEffectJournal,
  createEffectAttemptId,
  createJournaledToolRegistry
} from '../effect-journal.ts'

interface RegistrationOverrides {
  readonly descriptor?: Record<string, unknown>
  readonly implementation?: Record<string, unknown>
}

function registration(
  overrides: RegistrationOverrides = {}
): CapabilityRegistration {
  return {
    descriptor: {
      id: 'synthetic.cap',
      version: '1.0.0',
      description: 'synthetic capability',
      inputSchema: {},
      outputSchema: {},
      risk: 'LOW',
      sideEffect: 'READ',
      idempotent: true,
      requiresApproval: false,
      origin: 'core',
      providerId: 'provider.synthetic',
      providerVersion: '1.0.0',
      ...overrides.descriptor
    },
    implementation: {
      validateInput: () => true,
      execute: async () => ({ status: 'SUCCEEDED', output: { ok: true } }),
      validateOutput: () => true,
      ...overrides.implementation
    }
  } as never
}

const toolContext = {
  tenantId: 'tenant_pdsh031',
  agentId: 'agent_pdsh031',
  correlationId: 'corr_pdsh031',
  traceId: 'trace_pdsh031',
  operationKey: 'op_pdsh031'
}

function capabilityTool(overrides: RegistrationOverrides = {}) {
  const registry = new CapabilityRegistry([registration(overrides)])
  const tool = createCapabilityToolRegistry(registry).resolve(
    'synthetic.cap',
    '1.0.0'
  )
  if (!tool) throw new Error('expected the synthetic capability to resolve')
  return tool
}

describe('PDSH-031 slice 2d-2 — capability boundary edges', () => {
  it('rejects every invalid descriptor shape', () => {
    const cases: {
      mutate(reg: ReturnType<typeof registration>): unknown
      message: string
    }[] = [
      {
        mutate: () =>
          new Proxy(
            {},
            {
              getPrototypeOf: () => {
                throw new Error('hostile prototype')
              }
            }
          ),
        message: 'must be a plain object'
      },
      { mutate: () => null, message: 'must be a plain object' },
      {
        mutate: (reg) => ({ ...reg, descriptor: 'not-a-record' }),
        message: 'Capability descriptor must be a plain object'
      },
      {
        mutate: (reg) => ({
          ...reg,
          descriptor: { ...reg.descriptor, id: 'bad id!' }
        }),
        message: 'Capability id is invalid'
      },
      {
        mutate: (reg) => ({
          ...reg,
          descriptor: { ...reg.descriptor, version: 'latest' }
        }),
        message: 'Capability version must be exact and bounded'
      },
      {
        mutate: (reg) => ({
          ...reg,
          descriptor: { ...reg.descriptor, description: ' ' }
        }),
        message: 'Capability description is invalid'
      },
      {
        mutate: (reg) => ({
          ...reg,
          descriptor: { ...reg.descriptor, origin: 'unknown' }
        }),
        message: 'Capability origin is invalid'
      },
      {
        mutate: (reg) => ({
          ...reg,
          descriptor: { ...reg.descriptor, providerId: '' }
        }),
        message: 'Capability provider id is invalid'
      },
      {
        mutate: (reg) => ({
          ...reg,
          descriptor: { ...reg.descriptor, providerVersion: 'latest' }
        }),
        message: 'Capability provider version is invalid'
      },
      {
        mutate: (reg) => ({
          ...reg,
          descriptor: { ...reg.descriptor, risk: 'EXTREME' }
        }),
        message: 'Capability governance metadata is invalid'
      },
      {
        mutate: (reg) => ({ ...reg, implementation: null }),
        message: 'requires input validation'
      }
    ]
    for (const entry of cases) {
      const value = entry.mutate(registration())
      expect(() => new CapabilityRegistry([value as never])).toThrow(
        entry.message
      )
    }
  })

  it('accepts every governance metadata combination', () => {
    for (const risk of ['MEDIUM', 'HIGH', 'CRITICAL'] as const) {
      for (const sideEffect of ['NONE', 'WRITE', 'EXTERNAL'] as const) {
        const registry = new CapabilityRegistry([
          registration({
            descriptor: {
              id: `cap.${risk}.${sideEffect}`,
              risk,
              sideEffect
            }
          })
        ])
        expect(registry.listDescriptors()).toHaveLength(1)
      }
    }
  })

  it('rejects duplicates and accepts distinct versions of the same id', () => {
    expect(
      () => new CapabilityRegistry([registration(), registration()])
    ).toThrow(CapabilityRegistryError)
    const registry = new CapabilityRegistry([
      registration(),
      registration({ descriptor: { version: '2.0.0' } })
    ])
    expect(registry.listDescriptors()).toHaveLength(2)
  })

  it('rejects registries not created by the neutral factory', () => {
    expect(() => createCapabilityToolRegistry({} as never)).toThrow(
      'Capability registry was not created by the neutral registry factory'
    )
  })

  it('resolves descriptors only for bounded identifiers and versions', () => {
    const registry = new CapabilityRegistry([
      registration(),
      registration({ descriptor: { version: '2.0.0' } })
    ])
    expect(registry.resolveDescriptor('bad id!', '1.0.0')).toBeUndefined()
    expect(
      registry.resolveDescriptor('synthetic.cap', 'latest')
    ).toBeUndefined()
    expect(registry.resolveDescriptor('synthetic.cap', '2.0.0')?.version).toBe(
      '2.0.0'
    )
    expect(registry.resolveDescriptor('synthetic.cap', '3.0.0')).toBeUndefined()
    expect(registry.resolveDescriptor('other.cap', '1.0.0')).toBeUndefined()
  })

  it('sorts descriptors by id and version and composes fingerprints', () => {
    const registry = new CapabilityRegistry([
      registration({ descriptor: { id: 'b.cap' } }),
      registration({ descriptor: { id: 'a.cap', version: '2.0.0' } }),
      registration({ descriptor: { id: 'a.cap', version: '1.0.0' } })
    ])
    expect(
      registry.listDescriptors().map((entry) => `${entry.id}@${entry.version}`)
    ).toEqual(['a.cap@1.0.0', 'a.cap@2.0.0', 'b.cap@1.0.0'])

    const composition = composeCapabilities([registration()])
    expect(composition.fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(composition.registry.listDescriptors()).toHaveLength(1)
  })

  it('executes successful capabilities and enforces the input contract', async () => {
    const tool = capabilityTool()
    await expect(
      tool.execute({ nested: [1, { ok: true }] }, toolContext as never)
    ).resolves.toMatchObject({ status: 'SUCCEEDED', output: { ok: true } })

    await expect(
      tool.execute({ tenantId: 'other-tenant' }, toolContext as never)
    ).resolves.toMatchObject({
      status: 'REJECTED',
      error: 'capability_input_invalid'
    })

    await expect(
      tool.execute('plain scalar input', toolContext as never)
    ).resolves.toMatchObject({ status: 'SUCCEEDED' })

    await expect(
      tool.execute(null, toolContext as never)
    ).resolves.toMatchObject({ status: 'SUCCEEDED' })

    await expect(
      tool.execute(
        { nested: { tenantId: 'other-tenant' } },
        toolContext as never
      )
    ).resolves.toMatchObject({
      status: 'REJECTED',
      error: 'capability_input_invalid'
    })

    const deepChain = (() => {
      const root: Record<string, unknown> = {}
      let node = root
      for (let index = 0; index < 70; index += 1) {
        const next: Record<string, unknown> = {}
        node.child = next
        node = next
      }
      return root
    })()
    const hostileInput = { deep: deepChain }
    await expect(
      tool.execute(hostileInput, toolContext as never)
    ).resolves.toMatchObject({
      status: 'REJECTED',
      error: 'capability_input_invalid'
    })

    const nodeHeavy = Object.fromEntries(
      Array.from({ length: 40 }, (_value, group) => [
        `group_${group}`,
        Object.fromEntries(
          Array.from({ length: 512 }, (_entry, index) => [`k_${index}`, 1])
        )
      ])
    )
    await expect(
      tool.execute(nodeHeavy, toolContext as never)
    ).resolves.toMatchObject({
      status: 'REJECTED',
      error: 'capability_input_invalid'
    })

    const huge = Object.fromEntries(
      Array.from({ length: 20 }, (_value, index) => [
        `key_${index}`,
        'x'.repeat(16_000)
      ])
    )
    await expect(
      tool.execute(huge, toolContext as never)
    ).resolves.toMatchObject({
      status: 'REJECTED',
      error: 'capability_input_invalid'
    })
  })

  it('normalizes execution failures and invalid results', async () => {
    const throwing = capabilityTool({
      implementation: {
        execute: async () => {
          throw new Error('executor exploded')
        }
      }
    })
    await expect(
      throwing.execute({}, toolContext as never)
    ).resolves.toMatchObject({
      status: 'FAILED',
      error: 'capability_execution_failed'
    })

    const scalar = capabilityTool({
      implementation: { execute: async () => 'not-a-record' }
    })
    await expect(
      scalar.execute({}, toolContext as never)
    ).resolves.toMatchObject({
      status: 'REJECTED',
      error: 'capability_result_invalid'
    })

    const badError = capabilityTool({
      implementation: {
        execute: async () => ({ status: 'FAILED', error: 7 })
      }
    })
    await expect(
      badError.execute({}, toolContext as never)
    ).resolves.toMatchObject({
      status: 'REJECTED',
      error: 'capability_result_invalid'
    })

    const longError = capabilityTool({
      implementation: {
        execute: async () => ({ status: 'FAILED', error: 'x'.repeat(241) })
      }
    })
    await expect(
      longError.execute({}, toolContext as never)
    ).resolves.toMatchObject({
      status: 'REJECTED',
      error: 'capability_result_invalid'
    })
  })

  it('returns failed results with and without details', async () => {
    const bare = capabilityTool({
      implementation: {
        execute: async () => ({ status: 'FAILED' })
      }
    })
    await expect(bare.execute({}, toolContext as never)).resolves.toEqual({
      status: 'FAILED'
    })

    const detailed = capabilityTool({
      implementation: {
        execute: async () => ({ status: 'FAILED', error: 'tool broke' })
      }
    })
    await expect(detailed.execute({}, toolContext as never)).resolves.toEqual({
      status: 'FAILED',
      error: 'tool broke'
    })
  })

  it('rejects invalid and hostile output validation', async () => {
    const rejecting = capabilityTool({
      implementation: { validateOutput: () => false }
    })
    await expect(
      rejecting.execute({}, toolContext as never)
    ).resolves.toMatchObject({
      status: 'REJECTED',
      error: 'capability_output_invalid'
    })

    const throwing = capabilityTool({
      implementation: {
        validateOutput: () => {
          throw new Error('validator exploded')
        }
      }
    })
    await expect(
      throwing.execute({}, toolContext as never)
    ).resolves.toMatchObject({
      status: 'REJECTED',
      error: 'capability_output_invalid'
    })

    const mutating = capabilityTool({
      implementation: {
        validateOutput: (output: unknown) => {
          ;(output as Record<string, unknown>).injected = () => 1
          return true
        }
      }
    })
    await expect(
      mutating.execute({}, toolContext as never)
    ).resolves.toMatchObject({
      status: 'REJECTED',
      error: 'capability_result_invalid'
    })
  })
})

function journaledTool(
  journal: InMemoryEffectJournal,
  options: Record<string, unknown> = {},
  tool: Partial<ToolDefinition> = {}
) {
  const registry = createJournaledToolRegistry(
    {
      list: () => [],
      resolve: () => ({ ...baseTool(), ...tool }) as ToolDefinition
    } as never,
    journal,
    options as never
  )
  const resolved = registry.resolve('synthetic.tool', 'v1')
  if (!resolved) throw new Error('expected the journaled tool to resolve')
  return resolved
}

function baseTool(): ToolDefinition {
  return {
    id: 'synthetic.tool',
    version: 'v1',
    description: 'synthetic tool',
    inputSchema: {},
    outputSchema: {},
    risk: 'LOW',
    sideEffect: 'READ',
    idempotent: true,
    requiresApproval: false,
    execute: async () => ({ status: 'SUCCEEDED', output: { ok: true } })
  } as ToolDefinition
}

describe('PDSH-031 slice 2d-2 — effect journal edges', () => {
  it('bounds attempt ids and operation keys', async () => {
    expect(() => createEffectAttemptId(() => '')).toThrow(
      'attemptId token is required'
    )
    expect(() => createEffectAttemptId(() => 'x'.repeat(501))).toThrow(
      'attemptId token is too long'
    )
    expect(createEffectAttemptId(() => 'token')).toBe('attempt_token')

    const journal = new InMemoryEffectJournal()
    const tool = journaledTool(journal)
    await expect(
      tool.execute({}, { ...toolContext, operationKey: '' } as never)
    ).rejects.toThrow('operationKey is required')
    await expect(
      tool.execute({}, {
        ...toolContext,
        operationKey: 'x'.repeat(501)
      } as never)
    ).rejects.toThrow('operationKey is too long')
    const withoutKey = { ...toolContext } as Record<string, unknown>
    delete withoutKey.operationKey
    await expect(tool.execute({}, withoutKey as never)).rejects.toThrow(
      'operationKey is required'
    )
  })

  it('enforces the transition table and idempotent outcomes', async () => {
    const journal = new InMemoryEffectJournal()
    await expect(
      journal.markStarted({
        tenantId: 'tenant_x',
        operationKey: 'op_missing',
        attemptId: 'attempt_a'
      })
    ).rejects.toThrow('Effect reservation is missing')

    const reserved = await journal.reserve({
      tenantId: 'tenant_x',
      operationKey: 'op_gate',
      proposalHash: 'hash_a',
      attemptId: 'attempt_a'
    })
    expect(reserved.state).toBe('RESERVED')
    await expect(
      journal.markStarted({
        tenantId: 'tenant_x',
        operationKey: 'op_gate',
        attemptId: 'attempt_other'
      })
    ).rejects.toThrow('Effect attempt is fenced')
    await expect(
      journal.confirm({
        tenantId: 'tenant_x',
        operationKey: 'op_gate',
        attemptId: 'attempt_a',
        result: {}
      })
    ).rejects.toThrow('Effect outcome is not valid for its current state')

    await journal.markStarted({
      tenantId: 'tenant_x',
      operationKey: 'op_gate',
      attemptId: 'attempt_a'
    })
    await expect(
      journal.markStarted({
        tenantId: 'tenant_x',
        operationKey: 'op_gate',
        attemptId: 'attempt_a'
      })
    ).rejects.toThrow('Effect cannot start from its current state')

    const first = await journal.confirm({
      tenantId: 'tenant_x',
      operationKey: 'op_gate',
      attemptId: 'attempt_a',
      result: { ok: true }
    })
    expect(first.state).toBe('CONFIRMED')
    const replay = await journal.confirm({
      tenantId: 'tenant_x',
      operationKey: 'op_gate',
      attemptId: 'attempt_a',
      result: { ok: true }
    })
    expect(replay.state).toBe('CONFIRMED')
  })

  it('re-reserves failed operations preserving their creation time', async () => {
    const journal = new InMemoryEffectJournal()
    await journal.reserve({
      tenantId: 'tenant_x',
      operationKey: 'op_retry',
      proposalHash: 'hash_a',
      attemptId: 'attempt_a'
    })
    await journal.markStarted({
      tenantId: 'tenant_x',
      operationKey: 'op_retry',
      attemptId: 'attempt_a'
    })
    await journal.fail({
      tenantId: 'tenant_x',
      operationKey: 'op_retry',
      attemptId: 'attempt_a',
      error: 'synthetic failure'
    })
    const retried = await journal.reserve({
      tenantId: 'tenant_x',
      operationKey: 'op_retry',
      proposalHash: 'hash_a',
      attemptId: 'attempt_b'
    })
    expect(retried.state).toBe('RESERVED')
    expect(retried.attemptId).toBe('attempt_b')
    expect(retried.createdAt).toBeTruthy()
  })

  it('rejects an existing reservation held by another attempt', async () => {
    const staleJournal = {
      reserve: async () => ({
        tenantId: toolContext.tenantId,
        operationKey: 'op_pdsh031',
        proposalHash: 'hash_page031',
        state: 'RESERVED',
        attemptId: 'attempt_stale',
        createdAt: '2026-10-12T00:00:00.000Z',
        updatedAt: '2026-10-12T00:00:00.000Z'
      }),
      markStarted: async () => ({}),
      confirm: async () => ({}),
      fail: async () => ({}),
      markUncertain: async () => ({}),
      get: async () => null
    }
    const tool = journaledTool(staleJournal as never, {
      attemptIdFactory: () => 'attempt_fresh'
    })
    await expect(tool.execute({}, toolContext as never)).resolves.toMatchObject(
      {
        status: 'REJECTED',
        error: expect.stringContaining('requires reconciliation')
      }
    )
  })

  it('records bare tool failures with the default error text', async () => {
    const journal = new InMemoryEffectJournal()
    const tool = journaledTool(
      journal,
      {},
      { execute: async () => ({ status: 'FAILED' }) as never }
    )
    await expect(tool.execute({}, toolContext as never)).resolves.toMatchObject(
      { status: 'FAILED' }
    )
    const record = await journal.get(toolContext.tenantId, 'op_pdsh031')
    expect(record).toMatchObject({ state: 'FAILED', error: 'tool failed' })
  })

  it('marks uncertain on executor failures with and without an Error', async () => {
    const journal = new InMemoryEffectJournal()
    const failing = journaledTool(
      journal,
      {},
      {
        execute: async () => {
          throw new Error('executor exploded')
        }
      }
    )
    await expect(
      failing.execute({}, { ...toolContext, operationKey: 'op_error' } as never)
    ).resolves.toMatchObject({
      status: 'REJECTED',
      error: 'unknown_effect: executor outcome is uncertain'
    })
    expect(await journal.get(toolContext.tenantId, 'op_error')).toMatchObject({
      state: 'UNCERTAIN',
      error: expect.stringContaining('executor exploded')
    })

    const raw = journaledTool(
      journal,
      {},
      {
        execute: async () => {
          throw 'raw failure'
        }
      }
    )
    await expect(
      raw.execute({}, { ...toolContext, operationKey: 'op_raw' } as never)
    ).resolves.toMatchObject({ status: 'REJECTED' })
    expect(await journal.get(toolContext.tenantId, 'op_raw')).toMatchObject({
      state: 'UNCERTAIN',
      error: expect.stringContaining('tool execution failed')
    })
  })
})
