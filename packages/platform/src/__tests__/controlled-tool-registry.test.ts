import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  AgentConfigSchema,
  CapabilityGateway,
  InMemoryControlPlaneStore,
  PluginRegistry,
  runTestLab,
  type CapabilityActorAuthorizer,
  type PluginHandler,
  type RegisteredPlugin
} from '../index.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000201'
const fixtureOutputSchema = z.union([
  z.string().max(4000),
  z
    .object({
      controlled: z.boolean().optional(),
      fixtureOnly: z.boolean().optional(),
      safe: z.string().max(4000).optional(),
      token: z.string().max(4000).optional(),
      nested: z
        .object({ authorization: z.string().max(4000).optional() })
        .strict()
        .optional(),
      version: z.string().max(160).optional()
    })
    .strict()
])
const registryActorAuthorizer: CapabilityActorAuthorizer = ({
  actor,
  requiredPermission
}) =>
  actor.id === 'operator.registry' || actor.id === 'system.registry-fixture'
    ? [requiredPermission]
    : []

function config(
  plugins: Array<{
    plugin: string
    version?: string
    allowedTools: string[]
  }>
) {
  return AgentConfigSchema.parse({
    persona: { name: 'Registry fixture', role: 'assistant', tone: 'calm' },
    greeting: 'Resposta controlada.',
    promptBlocks: [],
    responseTemplates: {},
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 128,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/registry'
    },
    featureFlags: { testLab: true, realChannels: false },
    policies: {
      version: 'registry-policy-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: ['respond', 'scheduling'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: plugins.map((plugin) => ({
      plugin: plugin.plugin,
      ...(plugin.version ? { version: plugin.version } : {}),
      enabled: true,
      allowedTools: plugin.allowedTools,
      config: {}
    })),
    knowledge: [],
    handoff: {
      lowConfidenceDestination: 'controlled-reception',
      destinations: ['controlled-reception'],
      maxClarifications: 2
    }
  })
}

function fixturePlugin(
  name: string,
  toolName: string,
  permission: string,
  handler: PluginHandler
): RegisteredPlugin {
  return {
    manifest: {
      name,
      version: '1.0.0',
      capabilities: ['fixture.scheduling'],
      permissions: [permission],
      tools: [
        {
          name: toolName,
          permission,
          risk: 'low',
          requiresApproval: false,
          intents: ['scheduling']
        }
      ],
      hooks: [],
      dependencies: [],
      configSchemaVersion: '1'
    },
    handlers: { [toolName]: handler },
    inputValidators: {
      [toolName]: z
        .object({ message: z.string().max(4000).optional() })
        .strict()
    },
    outputValidators: { [toolName]: fixtureOutputSchema }
  }
}

function gatewayInput(
  gateway: CapabilityGateway,
  toolName: string,
  pluginConfig: ReturnType<typeof config>
) {
  return gateway.execute({
    tenantId,
    agentId: 'agent_00000000-0000-4000-8000-000000000201',
    versionId: 'agent_version_00000000-0000-4000-8000-000000000201',
    config: pluginConfig,
    toolName,
    input: { message: 'Quero consultar horários fictícios' },
    actor: {
      id: 'operator.registry',
      role: 'Operator',
      permissions: ['fixture:schedule:read', 'fixture:left', 'fixture:right']
    },
    policy: { decision: 'allowed' as const, reason: 'controlled_test' },
    dryRun: true
  })
}

describe('controlled tool registry identity boundary', () => {
  it('rejects latest aliases and validates preloaded registry entries', () => {
    expect(() =>
      config([
        {
          plugin: 'fixture.registry',
          version: 'latest',
          allowedTools: ['find_controlled_schedule']
        }
      ])
    ).toThrow(/exact|latest/i)

    const plugin = fixturePlugin(
      'fixture.preloaded',
      'preloaded_tool',
      'fixture:preloaded',
      vi.fn<PluginHandler>(async () => ({ status: 'succeeded' }))
    )
    expect(
      () => new PluginRegistry([{ manifest: plugin.manifest, handlers: {} }])
    ).toThrow('Every manifest tool requires a handler')
  })

  it('requires an exact plugin version before invoking a handler', async () => {
    const handler = vi.fn<PluginHandler>(async () => ({
      status: 'succeeded',
      data: { controlled: true }
    }))
    const gateway = new CapabilityGateway(
      new PluginRegistry().register(
        fixturePlugin(
          'fixture.registry',
          'find_controlled_schedule',
          'fixture:schedule:read',
          handler
        )
      ),
      { actorAuthorizer: registryActorAuthorizer }
    )

    await expect(
      gatewayInput(
        gateway,
        'find_controlled_schedule',
        config([
          {
            plugin: 'fixture.registry',
            allowedTools: ['find_controlled_schedule']
          }
        ])
      )
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'plugin_version_required'
    })
    expect(handler).not.toHaveBeenCalled()

    await expect(
      gatewayInput(
        gateway,
        'find_controlled_schedule',
        config([
          {
            plugin: 'fixture.registry',
            version: '1.0.0',
            allowedTools: ['find_controlled_schedule']
          }
        ])
      )
    ).resolves.toMatchObject({ status: 'succeeded' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('fails closed for a tool-name collision but deduplicates the same binding', async () => {
    const left = vi.fn<PluginHandler>(async () => ({
      status: 'succeeded',
      data: 'left'
    }))
    const right = vi.fn<PluginHandler>(async () => ({
      status: 'succeeded',
      data: 'right'
    }))
    const registry = new PluginRegistry()
      .register(
        fixturePlugin('fixture.left', 'shared_tool', 'fixture:left', left)
      )
      .register(
        fixturePlugin('fixture.right', 'shared_tool', 'fixture:right', right)
      )
    const gateway = new CapabilityGateway(registry, {
      actorAuthorizer: registryActorAuthorizer
    })

    await expect(
      gatewayInput(
        gateway,
        'shared_tool',
        config([
          {
            plugin: 'fixture.left',
            version: '1.0.0',
            allowedTools: ['shared_tool']
          },
          {
            plugin: 'fixture.right',
            version: '1.0.0',
            allowedTools: ['shared_tool']
          }
        ])
      )
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'tool_binding_ambiguous'
    })
    expect(left).not.toHaveBeenCalled()
    expect(right).not.toHaveBeenCalled()

    await expect(
      gatewayInput(
        gateway,
        'shared_tool',
        config([
          {
            plugin: 'fixture.left',
            version: '1.0.0',
            allowedTools: ['shared_tool']
          },
          {
            plugin: 'fixture.left',
            version: '1.0.0',
            allowedTools: ['shared_tool']
          }
        ])
      )
    ).resolves.toMatchObject({ status: 'succeeded' })
    expect(left).toHaveBeenCalledTimes(1)
  })

  it('plans a custom fixture by intent but refuses unreviewed code in Test Lab', async () => {
    const handler = vi.fn<PluginHandler>(async () => ({
      status: 'succeeded',
      data: { fixtureOnly: true }
    }))
    const registry = new PluginRegistry().register(
      fixturePlugin(
        'fixture.registry',
        'find_controlled_schedule',
        'fixture:schedule:read',
        handler
      )
    )
    const gateway = new CapabilityGateway(registry, {
      actorAuthorizer: registryActorAuthorizer
    })
    const plannedConfig = config([
      {
        plugin: 'fixture.registry',
        version: '1.0.0',
        allowedTools: ['find_controlled_schedule']
      },
      {
        plugin: 'fixture.registry',
        version: '1.0.0',
        allowedTools: ['find_controlled_schedule']
      }
    ])

    expect(gateway.planTools(plannedConfig, 'scheduling')).toEqual([
      {
        plugin: 'fixture.registry',
        version: '1.0.0',
        toolName: 'find_controlled_schedule'
      }
    ])

    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId },
      {
        slug: 'registry-fixture',
        name: 'Registry Fixture',
        description: 'Controlled registry fixture'
      }
    )
    const version = await store.createVersion(
      { tenantId },
      agent.id,
      plannedConfig,
      'operator.registry'
    )
    const trace = await runTestLab({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      message: 'Quero agendar uma consulta',
      history: [],
      capabilityGateway: gateway,
      actor: {
        id: 'system.registry-fixture',
        role: 'System',
        permissions: ['fixture:schedule:read']
      }
    })

    expect(trace.tools).toEqual([
      { name: 'find_controlled_schedule', status: 'not_run' }
    ])
    expect(trace.status).toBe('blocked')
    expect(trace.handoff.reason).toBe('controlled_runtime_unsafe_request')
    expect(trace.response.mode).toBe('handoff')
    expect(handler).not.toHaveBeenCalled()
  })

  it('never turns a catalog-only binding into executable code', async () => {
    const handler = vi.fn<PluginHandler>(async () => ({
      status: 'succeeded'
    }))
    const gateway = new CapabilityGateway(new PluginRegistry(), {
      actorAuthorizer: registryActorAuthorizer
    })

    await expect(
      gatewayInput(
        gateway,
        'catalog_only_tool',
        config([
          {
            plugin: 'catalog.approved.metadata',
            version: '1.0.0',
            allowedTools: ['catalog_only_tool']
          }
        ])
      )
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'plugin_version_not_registered'
    })
    expect(handler).not.toHaveBeenCalled()
  })
})
