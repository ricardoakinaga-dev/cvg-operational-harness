import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AgentConfigSchema } from '../contracts.ts'
import { InMemoryCapabilityApprovalAuthority } from '../approval-authority.ts'
import {
  CapabilityGateway,
  PluginRegistry,
  type CapabilityActorAuthorizer,
  type CapabilityExecutionInput,
  type PluginHandler,
  type RegisteredPlugin
} from '../plugin-gateway.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000421' as const
const agentId = 'agent_00000000-0000-4000-8000-000000000421' as const
const versionId = 'agent_version_00000000-0000-4000-8000-000000000421' as const
const traceId = 'trace_00000000-0000-4000-8000-000000000421' as const

const inputSchema = z.object({ value: z.string().min(1).max(80) }).strict()
const outputSchema = z.union([
  z.string().max(4000),
  z.object({ ok: z.boolean().optional() }).strict()
])

type BoundaryPlugin = RegisteredPlugin & {
  inputValidators: Record<string, z.ZodType>
  outputValidators: Record<string, z.ZodType>
}

function pluginFixture(
  overrides: Partial<RegisteredPlugin> = {},
  options: { withWrite?: boolean } = {}
): BoundaryPlugin {
  const tools = [
    {
      name: 'read',
      permission: 'fixture:read',
      risk: 'low' as const,
      requiresApproval: false,
      intents: ['schedule']
    },
    ...(options.withWrite
      ? [
          {
            name: 'write',
            permission: 'fixture:write',
            risk: 'low' as const,
            requiresApproval: false,
            intents: ['schedule']
          }
        ]
      : [])
  ]
  const names = tools.map((tool) => tool.name)
  return {
    manifest: {
      name: 'fixture.gateway',
      version: '1.0.0',
      capabilities: ['fixture.read'],
      permissions: tools.map((tool) => tool.permission),
      tools,
      hooks: [],
      dependencies: [],
      configSchemaVersion: '1'
    },
    handlers: Object.fromEntries(
      names.map((name) => [
        name,
        async () => ({ status: 'succeeded' as const })
      ])
    ),
    inputValidators: Object.fromEntries(
      names.map((name) => [name, inputSchema])
    ),
    outputValidators: Object.fromEntries(
      names.map((name) => [name, outputSchema])
    ),
    ...overrides
  } as BoundaryPlugin
}

function configFixture(
  plugins?: Array<Record<string, unknown>>,
  enabledActions: string[] = ['respond']
) {
  return AgentConfigSchema.parse({
    persona: { name: 'Gateway fixture', role: 'assistant', tone: 'calm' },
    greeting: 'Controlled.',
    promptBlocks: [],
    responseTemplates: {},
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 128,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/gateway-hardening'
    },
    featureFlags: { testLab: true, realChannels: false },
    policies: {
      version: 'gateway-hardening-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions,
      approvalActions: [],
      blockedActions: []
    },
    plugins: plugins ?? [
      {
        plugin: 'fixture.gateway',
        version: '1.0.0',
        enabled: true,
        allowedTools: ['read'],
        config: {}
      }
    ],
    knowledge: [],
    handoff: {
      lowConfidenceDestination: 'controlled-reception',
      destinations: ['controlled-reception'],
      maxClarifications: 2
    }
  })
}

const fixtureActorAuthorizer: CapabilityActorAuthorizer = ({
  actor,
  requiredPermission
}) => (actor.id.startsWith('operator.') ? [requiredPermission] : [])

function executionInput(
  overrides: Partial<CapabilityExecutionInput> = {}
): CapabilityExecutionInput {
  return {
    tenantId,
    agentId,
    versionId,
    config: configFixture(),
    toolName: 'read',
    input: { value: 'controlled' },
    actor: {
      id: 'operator.gateway',
      role: 'Operator',
      permissions: ['fixture:read']
    },
    policy: { decision: 'allowed', reason: 'controlled' },
    dryRun: true,
    ...overrides
  }
}

describe('plugin registry normalization failures', () => {
  it('rejects missing handlers, invalid validators and undeclared hooks', () => {
    expect(() => new PluginRegistry([pluginFixture({ handlers: {} })])).toThrow(
      /requires a handler/
    )

    const base = pluginFixture()
    expect(
      () =>
        new PluginRegistry([
          {
            ...base,
            handlers: { read: 'not-callable' }
          } as never
        ])
    ).toThrow(/callable handler/)

    expect(
      () =>
        new PluginRegistry([
          {
            ...base,
            inputValidators: { read: { safeParse: 'not-a-function' } }
          } as never
        ])
    ).toThrow(/Invalid input validator/)

    expect(
      () =>
        new PluginRegistry([
          {
            ...base,
            outputValidators: { read: { safeParse: 42 } }
          } as never
        ])
    ).toThrow(/Invalid output validator/)

    expect(
      () =>
        new PluginRegistry([
          {
            ...base,
            hooks: { 'message.received': () => undefined }
          }
        ])
    ).toThrow(/declared by the manifest/)

    expect(
      () =>
        new PluginRegistry([
          {
            ...base,
            manifest: { ...base.manifest, hooks: ['message.received'] },
            hooks: { 'message.received': 'not-callable' }
          } as never
        ])
    ).toThrow(/requires a handler/)
  })
})

describe('plugin planning branches', () => {
  it('plans only enabled, versioned, registered and intent-matching tools', () => {
    const registry = new PluginRegistry([
      pluginFixture({}, { withWrite: true })
    ])
    const gateway = new CapabilityGateway(registry)

    expect(
      gateway
        .planTools(configFixture(), 'schedule')
        .map((plan) => plan.toolName)
    ).toEqual(['read'])
    expect(gateway.planTools(configFixture(), 'other-intent')).toEqual([])
    expect(gateway.planTools({} as never, 'schedule')).toEqual([])
    expect(gateway.planTools(configFixture(), '')).toEqual([])

    const disabled = configFixture([
      {
        plugin: 'fixture.gateway',
        version: '1.0.0',
        enabled: false,
        allowedTools: ['read'],
        config: {}
      }
    ])
    expect(gateway.planTools(disabled, 'schedule')).toEqual([])

    const unversioned = configFixture([
      {
        plugin: 'fixture.gateway',
        enabled: true,
        allowedTools: ['read'],
        config: {}
      }
    ])
    expect(gateway.planTools(unversioned, 'schedule')).toEqual([])

    const unregistered = configFixture([
      {
        plugin: 'missing.plugin',
        version: '1.0.0',
        enabled: true,
        allowedTools: ['read'],
        config: {}
      }
    ])
    expect(gateway.planTools(unregistered, 'schedule')).toEqual([])

    const notAllowed = configFixture([
      {
        plugin: 'fixture.gateway',
        version: '1.0.0',
        enabled: true,
        allowedTools: ['not-listed'],
        config: {}
      }
    ])
    expect(gateway.planTools(notAllowed, 'schedule')).toEqual([])
  })

  it('drops ambiguous tool identities shared by more than one plugin', () => {
    const second = pluginFixture()
    second.manifest = { ...second.manifest, name: 'other.gateway' }
    const registry = new PluginRegistry([pluginFixture(), second])
    const gateway = new CapabilityGateway(registry)
    const ambiguous = configFixture([
      {
        plugin: 'fixture.gateway',
        version: '1.0.0',
        enabled: true,
        allowedTools: ['read'],
        config: {}
      },
      {
        plugin: 'other.gateway',
        version: '1.0.0',
        enabled: true,
        allowedTools: ['read'],
        config: {}
      }
    ])

    expect(gateway.planTools(ambiguous, 'schedule')).toEqual([])
  })

  it('resolves configured tools and reports every blocked binding reason', () => {
    const registry = new PluginRegistry([pluginFixture()])
    const gateway = new CapabilityGateway(registry)

    expect(gateway.resolveConfiguredTool({} as never, 'read')).toEqual({
      status: 'blocked',
      reason: 'invalid_tool_context'
    })
    expect(gateway.resolveConfiguredTool(configFixture(), '')).toEqual({
      status: 'blocked',
      reason: 'invalid_tool_context'
    })
    expect(
      gateway.resolveConfiguredTool(
        configFixture([
          {
            plugin: 'fixture.gateway',
            version: '1.0.0',
            enabled: true,
            allowedTools: ['missing'],
            config: {}
          }
        ]),
        'missing'
      )
    ).toEqual({ status: 'blocked', reason: 'tool_not_registered' })
    expect(gateway.resolveConfiguredTool(configFixture([]), 'read')).toEqual({
      status: 'blocked',
      reason: 'plugin_binding_missing'
    })
    expect(
      gateway.resolveConfiguredTool(
        configFixture([
          {
            plugin: 'fixture.gateway',
            enabled: true,
            allowedTools: ['read'],
            config: {}
          }
        ]),
        'read'
      )
    ).toEqual({ status: 'blocked', reason: 'plugin_version_required' })
    expect(
      gateway.resolveConfiguredTool(
        configFixture([
          {
            plugin: 'fixture.gateway',
            version: '9.9.9',
            enabled: true,
            allowedTools: ['read'],
            config: {}
          }
        ]),
        'read'
      )
    ).toEqual({
      status: 'blocked',
      reason: 'plugin_version_not_registered'
    })

    const resolved = gateway.resolveConfiguredTool(configFixture(), 'read')
    expect(resolved).toMatchObject({
      status: 'resolved',
      plugin: 'fixture.gateway',
      version: '1.0.0',
      toolName: 'read',
      permission: 'fixture:read',
      requiresApproval: false
    })
    expect(gateway.permissionForConfiguredTool(configFixture(), 'read')).toBe(
      'fixture:read'
    )
    expect(
      gateway.permissionForConfiguredTool(configFixture([]), 'read')
    ).toBeNull()
  })

  it('blocks ambiguous bindings across two registered plugins', () => {
    const second = pluginFixture()
    second.manifest = { ...second.manifest, name: 'other.gateway' }
    const gateway = new CapabilityGateway(
      new PluginRegistry([pluginFixture(), second])
    )
    const ambiguous = configFixture([
      {
        plugin: 'fixture.gateway',
        version: '1.0.0',
        enabled: true,
        allowedTools: ['read'],
        config: {}
      },
      {
        plugin: 'other.gateway',
        version: '1.0.0',
        enabled: true,
        allowedTools: ['read'],
        config: {}
      }
    ])

    expect(gateway.resolveConfiguredTool(ambiguous, 'read')).toEqual({
      status: 'blocked',
      reason: 'tool_binding_ambiguous'
    })
  })

  it('orders registry versions with numeric and opaque version strings', () => {
    const numeric = pluginFixture()
    const releaseCandidate = pluginFixture()
    releaseCandidate.manifest = {
      ...releaseCandidate.manifest,
      version: '1.0.0-rc.1'
    }
    const registry = new PluginRegistry([numeric, releaseCandidate])
    expect(registry.getLatest('fixture.gateway')?.manifest.version).toMatch(
      /^1\.0\.0/
    )

    const opaqueA = pluginFixture()
    opaqueA.manifest = { ...opaqueA.manifest, version: 'beta' }
    const opaqueB = pluginFixture()
    opaqueB.manifest = { ...opaqueB.manifest, version: 'alpha' }
    const opaqueRegistry = new PluginRegistry([opaqueA, opaqueB])
    expect(opaqueRegistry.list().map((item) => item.manifest.version)).toEqual([
      'alpha',
      'beta'
    ])
  })
})

describe('capability gateway denied paths', () => {
  it('blocks malformed execution input shapes before side effects', async () => {
    const handler = vi.fn<PluginHandler>(async () => ({ status: 'succeeded' }))
    const registry = new PluginRegistry([
      pluginFixture({ handlers: { read: handler } })
    ])
    const gateway = new CapabilityGateway(registry)

    for (const override of [
      { agentId: 'agent-invalid' as never },
      { versionId: 'agent_version-invalid' as never }
    ]) {
      await expect(
        gateway.execute(executionInput(override))
      ).resolves.toMatchObject({
        status: 'blocked',
        reason: 'invalid_scope_id'
      })
    }

    const invalidInputs: Array<Partial<CapabilityExecutionInput>> = [
      { config: {} as never },
      { toolName: 'invalid tool name' },
      { policy: { decision: 'unknown', reason: 'x' } as never },
      { dryRun: 'yes' as never },
      { requireApproval: 'yes' as never },
      { onAudit: 'not-a-function' as never }
    ]

    for (const override of invalidInputs) {
      await expect(
        gateway.execute(executionInput(override))
      ).resolves.toMatchObject({
        status: 'blocked',
        reason: 'invalid_execution_input'
      })
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('fails closed on hostile configuration objects without throwing', async () => {
    const gateway = new CapabilityGateway(new PluginRegistry([pluginFixture()]))
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('prototype access denied')
        }
      }
    )

    await expect(
      gateway.execute(executionInput({ config: hostile as never }))
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'invalid_execution_input'
    })
    expect(gateway.planTools(hostile as never, 'schedule')).toEqual([])
  })

  it('blocks actor authorization denials, policy decisions and approvals', async () => {
    const registry = new PluginRegistry([pluginFixture()])

    const noAuthorizer = new CapabilityGateway(registry)
    await expect(noAuthorizer.execute(executionInput())).resolves.toMatchObject(
      {
        status: 'blocked',
        reason: 'actor_authorization_unavailable'
      }
    )

    const emptyAuthorizer = new CapabilityGateway(registry, {
      actorAuthorizer: () => []
    })
    await expect(
      emptyAuthorizer.execute(executionInput())
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'permission_denied'
    })

    const nullAuthorizer = new CapabilityGateway(registry, {
      actorAuthorizer: () => null
    })
    await expect(
      nullAuthorizer.execute(executionInput())
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'actor_authorization_denied'
    })

    const throwingAuthorizer = new CapabilityGateway(registry, {
      actorAuthorizer: () => {
        throw new Error('identity provider unavailable')
      }
    })
    await expect(
      throwingAuthorizer.execute(executionInput())
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'actor_authorization_denied'
    })

    const invalidAuthorizer = new CapabilityGateway(registry, {
      actorAuthorizer: () => [42] as never
    })
    await expect(
      invalidAuthorizer.execute(executionInput())
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'actor_authorization_denied'
    })

    const authorized = new CapabilityGateway(registry, {
      actorAuthorizer: fixtureActorAuthorizer
    })
    await expect(
      authorized.execute(
        executionInput({
          policy: { decision: 'blocked', reason: 'policy says no' }
        })
      )
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'policy_blocked'
    })
    await expect(
      authorized.execute(
        executionInput({
          policy: { decision: 'clarify', reason: 'needs clarification' }
        })
      )
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'policy_clarify'
    })
    await expect(
      authorized.execute(
        executionInput({
          requireApproval: true,
          approval: {
            id: 'approval_00000000-0000-4000-8000-000000000421',
            tenantId,
            agentId,
            versionId,
            toolName: 'read',
            actorId: 'operator.gateway',
            expiresAt: new Date(Date.now() + 60_000)
          }
        })
      )
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'approval_required'
    })
  })

  it('fails closed when approval clocks or authorities misbehave', async () => {
    const registry = new PluginRegistry([pluginFixture()])
    const approval = {
      id: 'approval_00000000-0000-4000-8000-000000000422',
      tenantId,
      agentId,
      versionId,
      toolName: 'read',
      actorId: 'operator.gateway',
      expiresAt: new Date(Date.now() + 60_000)
    }

    const nonDateClock = new CapabilityGateway(registry, {
      actorAuthorizer: fixtureActorAuthorizer,
      now: () => 'not-a-date' as never
    })
    await expect(
      nonDateClock.execute(executionInput({ requireApproval: true, approval }))
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'approval_required'
    })

    const throwingClock = new CapabilityGateway(registry, {
      actorAuthorizer: fixtureActorAuthorizer,
      now: () => {
        throw new Error('clock unavailable')
      }
    })
    await expect(
      throwingClock.execute(executionInput({ requireApproval: true, approval }))
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'approval_required'
    })

    const throwingAuthority = {
      issue: vi.fn(),
      verifyAndConsume: vi.fn().mockRejectedValue(new Error('authority down')),
      revoke: vi.fn()
    } as never
    const authorityGateway = new CapabilityGateway(registry, {
      actorAuthorizer: fixtureActorAuthorizer,
      approvalAuthority: throwingAuthority
    })
    await expect(
      authorityGateway.execute(
        executionInput({ requireApproval: true, approval })
      )
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'approval_required'
    })
  })

  it('propagates the execution trace into the approval consumption audit', async () => {
    const registry = new PluginRegistry([pluginFixture()])
    const authority = new InMemoryCapabilityApprovalAuthority()
    const issued = await authority.issue({
      tenantId,
      agentId,
      versionId,
      toolName: 'read',
      input: { value: 'controlled' },
      actorId: 'operator.gateway',
      issuer: 'approver.coverage',
      expiresAt: new Date(Date.now() + 60_000)
    })
    const verifyAndConsume = vi.spyOn(authority, 'verifyAndConsume')
    const gateway = new CapabilityGateway(registry, {
      actorAuthorizer: fixtureActorAuthorizer,
      approvalAuthority: authority
    })

    const result = await gateway.execute(
      executionInput({
        traceId,
        requireApproval: true,
        approval: {
          id: issued.id,
          tenantId,
          agentId,
          versionId,
          toolName: 'read',
          actorId: 'operator.gateway',
          expiresAt: new Date(Date.now() + 60_000)
        }
      })
    )

    expect(result.status).toBe('succeeded')
    expect(verifyAndConsume).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalId: issued.id,
        consumptionAudit: expect.objectContaining({ traceId })
      })
    )
  })

  it('reports handler failures with audit availability semantics', async () => {
    const registry = new PluginRegistry([
      pluginFixture({
        handlers: {
          read: async () => {
            throw new Error('handler exploded')
          }
        }
      })
    ])
    const gateway = new CapabilityGateway(registry, {
      actorAuthorizer: fixtureActorAuthorizer
    })

    await expect(gateway.execute(executionInput())).resolves.toMatchObject({
      status: 'failed',
      reason: 'tool_execution_failed'
    })

    const auditDown = new CapabilityGateway(registry, {
      actorAuthorizer: fixtureActorAuthorizer
    })
    await expect(
      auditDown.execute(
        executionInput({
          onAudit: () => {
            throw new Error('audit down')
          }
        })
      )
    ).resolves.toMatchObject({
      status: 'failed',
      reason: 'audit_unavailable'
    })

    const invalidResultRegistry = new PluginRegistry([
      pluginFixture({
        handlers: {
          read: async () => ({ status: 'succeeded', data: { raw: 'secret' } })
        }
      })
    ])
    const invalidResult = new CapabilityGateway(invalidResultRegistry, {
      actorAuthorizer: fixtureActorAuthorizer
    })
    await expect(
      invalidResult.execute(executionInput())
    ).resolves.toMatchObject({
      status: 'failed',
      reason: 'tool_result_invalid'
    })
    await expect(
      invalidResult.execute(
        executionInput({
          onAudit: () => {
            throw new Error('audit down')
          }
        })
      )
    ).resolves.toMatchObject({
      status: 'failed',
      reason: 'audit_unavailable'
    })

    const blockedAuditDown = new CapabilityGateway(registry, {
      actorAuthorizer: () => null
    })
    await expect(
      blockedAuditDown.execute(
        executionInput({
          onAudit: () => {
            throw new Error('audit down')
          }
        })
      )
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'audit_unavailable'
    })
  })
})
