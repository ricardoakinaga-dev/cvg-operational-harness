import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  AgentConfigSchema,
  CapabilityGateway,
  createControlledCapabilityGateway,
  createControlledSchedulingPlugin,
  createValidatedControlledReleaseCandidate,
  InMemoryControlPlaneStore,
  PluginRegistry,
  composePrompt,
  evaluatePlatformPolicy,
  evaluateTestLabCase,
  evaluateTestLabSuite,
  InMemoryCapabilityApprovalAuthority,
  runTestLab
} from '../index.ts'
import type { CapabilityActorAuthorizer } from '../index.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000001'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000002'
const foundationActorAuthorizer: CapabilityActorAuthorizer = ({
  actor,
  requiredPermission
}) => (actor.id === 'admin' ? [requiredPermission] : [])
const foundationEchoOutputSchema = z.union([
  z.string().max(4000),
  z
    .object({
      ok: z.boolean().optional(),
      token: z.string().max(4000).optional()
    })
    .strict()
])

function createConfig() {
  return AgentConfigSchema.parse({
    persona: { name: 'Esmeralda', role: 'secretary', tone: 'calm' },
    greeting: 'Como posso ajudar?',
    promptBlocks: [
      {
        id: 'z-last',
        kind: 'instruction',
        content: 'Second block',
        priority: 20,
        enabled: true
      },
      {
        id: 'a-first',
        kind: 'persona',
        content: 'First block',
        priority: 10,
        enabled: true
      }
    ],
    responseTemplates: {
      unknown: 'Vou encaminhar sua solicitação.'
    },
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 256,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/fake'
    },
    policies: {
      version: 'policy-test-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: ['respond', 'institutional_question'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: [],
    knowledge: [],
    handoff: {
      lowConfidenceDestination: 'controlled-reception',
      destinations: ['controlled-reception'],
      maxClarifications: 2
    }
  })
}

describe('control plane foundation', () => {
  it('keeps config deterministic and rejects secret values', () => {
    const config = createConfig()
    expect(composePrompt(config)).toEqual({
      blockIds: ['a-first', 'z-last'],
      text: 'First block\n\nSecond block'
    })
    expect(config.model.secretRef).toBe('secret://controlled/fake')
    expect(() =>
      AgentConfigSchema.parse({
        ...config,
        knowledge: [
          {
            source: 'https://unapproved.example',
            enabled: true,
            requiresApprovedSource: true
          }
        ]
      })
    ).toThrow()

    expect(() =>
      AgentConfigSchema.parse({
        ...config,
        model: { ...config.model, apiKey: 'sk-real-looking-secret' }
      })
    ).toThrow(/apiKey|secret|credential|sensitive/i)
  })

  it('enforces tenant isolation and immutable published snapshots', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId: tenantA },
      { slug: 'secretary', name: 'Secretary', description: 'Controlled agent' }
    )
    const version = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      createConfig(),
      'admin-a'
    )
    await store.transitionVersion({ tenantId: tenantA }, version.id, 'TESTING')
    await store.transitionVersion({ tenantId: tenantA }, version.id, 'APPROVED')
    const releaseCandidate = await createValidatedControlledReleaseCandidate(
      store,
      tenantA,
      agent.id,
      version.id,
      'admin-a'
    )
    const published = await store.publishVersion(
      { tenantId: tenantA },
      version.id,
      releaseCandidate.id
    )

    const returned = await store.getVersion({ tenantId: tenantA }, published.id)
    expect(returned?.status).toBe('PUBLISHED')
    if (!returned) throw new Error('published version missing')
    const originalContent = returned.config.promptBlocks[0]!.content
    returned.config.promptBlocks[0]!.content = 'caller mutation'

    const reread = await store.getVersion({ tenantId: tenantA }, published.id)
    expect(reread?.config.promptBlocks[0]?.content).toBe(originalContent)
    await expect(
      store.getVersion({ tenantId: tenantB }, published.id)
    ).resolves.toBeNull()
    await expect(
      store.createVersion(
        { tenantId: tenantB },
        agent.id,
        createConfig(),
        'admin-b'
      )
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('rejects a stale lifecycle precondition without mutating the version', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId: tenantA },
      {
        slug: 'optimistic-agent',
        name: 'Optimistic Agent',
        description: 'Test'
      }
    )
    const version = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      createConfig(),
      'admin-a'
    )

    await store.transitionVersion(
      { tenantId: tenantA },
      version.id,
      'TESTING',
      'DRAFT'
    )
    await expect(
      store.transitionVersion(
        { tenantId: tenantA },
        version.id,
        'APPROVED',
        'DRAFT'
      )
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      store.getVersion({ tenantId: tenantA }, version.id)
    ).resolves.toMatchObject({ status: 'TESTING' })
  })

  it('publishes and rolls back through new immutable versions', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId: tenantA },
      { slug: 'rollback-agent', name: 'Rollback Agent', description: 'Test' }
    )
    const first = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      createConfig(),
      'admin-a'
    )
    await store.transitionVersion({ tenantId: tenantA }, first.id, 'TESTING')
    await store.transitionVersion({ tenantId: tenantA }, first.id, 'APPROVED')
    const firstCandidate = await createValidatedControlledReleaseCandidate(
      store,
      tenantA,
      agent.id,
      first.id,
      'admin-a'
    )
    await store.publishVersion(
      { tenantId: tenantA },
      first.id,
      firstCandidate.id
    )

    const secondConfig = createConfig()
    secondConfig.greeting = 'Nova saudação'
    const second = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      secondConfig,
      'admin-a'
    )
    await store.transitionVersion({ tenantId: tenantA }, second.id, 'TESTING')
    await store.transitionVersion({ tenantId: tenantA }, second.id, 'APPROVED')
    const secondCandidate = await createValidatedControlledReleaseCandidate(
      store,
      tenantA,
      agent.id,
      second.id,
      'admin-a'
    )
    await store.publishVersion(
      { tenantId: tenantA },
      second.id,
      secondCandidate.id
    )

    const rollback = await store.rollback(
      { tenantId: tenantA },
      agent.id,
      first.id,
      'admin-a',
      firstCandidate.id
    )
    expect(rollback.id).not.toBe(first.id)
    expect(rollback.status).toBe('PUBLISHED')
    expect(rollback.config.greeting).toBe('Como posso ajudar?')
    expect(
      (await store.resolvePublished({ tenantId: tenantA }, agent.id))?.id
    ).toBe(rollback.id)
  })

  it('enforces lifecycle, scope, actor and trace guardrails', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId: tenantA },
      { slug: 'guardrails', name: 'Guardrails', description: 'Test' }
    )
    const otherTenantAgent = await store.createAgent(
      { tenantId: tenantB },
      { slug: 'guardrails', name: 'Guardrails', description: 'Test' }
    )
    await expect(
      store.createAgent(
        { tenantId: tenantA },
        { slug: 'guardrails', name: 'Duplicate', description: 'Test' }
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })
    await expect(
      store.getAgent(
        { tenantId: tenantA },
        'agent_00000000-0000-4000-8000-000000000099'
      )
    ).resolves.toBeNull()
    await expect(store.listAgents({ tenantId: tenantB })).resolves.toHaveLength(
      1
    )
    await expect(
      store.createVersion(
        { tenantId: tenantB },
        agent.id,
        createConfig(),
        'admin-b'
      )
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      store.listVersions({ tenantId: tenantB }, agent.id)
    ).rejects.toMatchObject({ code: 'forbidden' })

    const draft = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      createConfig(),
      'admin-a'
    )
    await expect(
      store.createVersion({ tenantId: tenantA }, agent.id, createConfig(), '!!')
    ).rejects.toMatchObject({ code: 'validation_failed' })
    await expect(
      store.transitionVersion({ tenantId: tenantA }, draft.id, 'APPROVED')
    ).rejects.toMatchObject({ code: 'invalid_action' })
    await expect(
      store.publishVersion(
        { tenantId: tenantA },
        draft.id,
        'release_candidate_00000000-0000-4000-8000-000000000399'
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })
    await expect(
      store.rollback(
        { tenantId: tenantA },
        agent.id,
        draft.id,
        'admin-a',
        'release_candidate_00000000-0000-4000-8000-000000000399'
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })
    await expect(
      store.rollback(
        { tenantId: tenantA },
        otherTenantAgent.id,
        draft.id,
        'admin-a',
        'release_candidate_00000000-0000-4000-8000-000000000399'
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })
    await expect(
      store.resolvePublished({ tenantId: tenantA }, agent.id)
    ).resolves.toBeNull()

    const trace = await runTestLab({
      store,
      tenantId: tenantA,
      agentId: agent.id,
      versionId: draft.id,
      message: 'Olá',
      history: []
    })
    await expect(
      store.recordTestRun({ tenantId: tenantA }, {
        ...trace,
        provider: { ...trace.provider, externalCall: true }
      } as unknown as typeof trace)
    ).rejects.toMatchObject({ code: 'validation_failed' })
    await expect(
      store.listTestRuns({ tenantId: tenantA })
    ).resolves.toHaveLength(1)
    await expect(
      store.recordTestRun({ tenantId: tenantB }, trace)
    ).rejects.toMatchObject({ code: 'forbidden' })
    await expect(
      store.listTestRuns({ tenantId: tenantB })
    ).resolves.toHaveLength(0)

    await expect(
      store.recordExecutionTrace(
        { tenantId: tenantA },
        {
          ...trace,
          versionId:
            'agent_version_00000000-0000-4000-8000-000000000099' as typeof trace.versionId
        }
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })
  })
})

describe('platform policy and capability gateway', () => {
  it('always lets hard safety win over configurable behavior', () => {
    const config = createConfig()
    expect(
      evaluatePlatformPolicy({
        action: 'confirm_appointment',
        confidence: 1,
        config
      })
    ).toMatchObject({ decision: 'blocked', layer: 'hard_safety' })
    expect(
      evaluatePlatformPolicy({ action: 'respond', confidence: 0.1, config })
    ).toMatchObject({ decision: 'clarify', layer: 'agent_behavior' })
    expect(
      evaluatePlatformPolicy({
        action: 'respond',
        confidence: 1,
        config,
        policyAvailable: false
      })
    ).toMatchObject({
      decision: 'blocked',
      reason: 'policy_unavailable_fail_closed'
    })
  })

  it('rejects malformed gateway scope ids before resolving or invoking a tool', async () => {
    const handler = vi.fn(async () => ({ status: 'succeeded' as const }))
    const gateway = new CapabilityGateway(
      new PluginRegistry().register({
        manifest: {
          name: 'fixture.gateway',
          version: '1.0.0',
          capabilities: ['fixture.read'],
          permissions: ['fixture:read'],
          tools: [
            {
              name: 'read',
              permission: 'fixture:read',
              risk: 'low',
              requiresApproval: false
            }
          ],
          hooks: [],
          dependencies: [],
          configSchemaVersion: '1'
        },
        handlers: { read: handler },
        inputValidators: { read: z.object({}).strict() },
        outputValidators: { read: z.object({}).strict() }
      })
    )

    const result = await gateway.execute({
      tenantId: 'not-a-tenant' as never,
      agentId: 'agent_00000000-0000-4000-8000-000000000001',
      versionId: 'agent_version_00000000-0000-4000-8000-000000000001',
      config: AgentConfigSchema.parse({
        ...createConfig(),
        plugins: [
          {
            plugin: 'fixture.gateway',
            version: '1.0.0',
            enabled: true,
            allowedTools: ['read'],
            config: {}
          }
        ]
      }),
      toolName: 'read',
      input: {},
      actor: {
        id: 'operator',
        role: 'Operator',
        permissions: ['fixture:read']
      },
      policy: { decision: 'allowed', reason: 'test' },
      dryRun: true
    })

    expect(result).toMatchObject({
      status: 'blocked',
      reason: 'invalid_scope_id'
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('blocks an unpermissioned plugin before invoking its handler', async () => {
    const handler = vi.fn(async () => ({
      status: 'succeeded' as const,
      data: 'ok'
    }))
    const registry = new PluginRegistry().register({
      manifest: {
        name: 'fake.echo',
        version: '1.0.0',
        capabilities: ['demo.echo'],
        permissions: ['tool:echo'],
        tools: [
          {
            name: 'echo',
            permission: 'tool:echo',
            risk: 'low',
            requiresApproval: false
          }
        ],
        hooks: [],
        dependencies: [],
        configSchemaVersion: '1'
      },
      handlers: { echo: handler },
      inputValidators: {
        echo: z
          .object({
            email: z.string().email().max(320).optional(),
            value: z.string().max(4000)
          })
          .strict()
      },
      outputValidators: { echo: foundationEchoOutputSchema }
    })
    const gateway = new CapabilityGateway(registry, {
      actorAuthorizer: foundationActorAuthorizer
    })
    const config = {
      ...createConfig(),
      plugins: [
        {
          plugin: 'fake.echo',
          version: '1.0.0',
          enabled: true,
          allowedTools: ['echo'],
          config: {}
        }
      ]
    }

    const blocked = await gateway.execute({
      tenantId: tenantA,
      agentId: 'agent_00000000-0000-4000-8000-000000000001',
      versionId: 'agent_version_00000000-0000-4000-8000-000000000001',
      config,
      toolName: 'echo',
      input: { value: 'controlled' },
      actor: { id: 'operator', role: 'Operator', permissions: [] },
      policy: { decision: 'allowed', reason: 'test' },
      dryRun: true
    })
    expect(blocked).toMatchObject({
      status: 'blocked',
      reason: 'permission_denied'
    })
    expect(handler).not.toHaveBeenCalled()

    const allowed = await gateway.execute({
      tenantId: tenantA,
      agentId: 'agent_00000000-0000-4000-8000-000000000001',
      versionId: 'agent_version_00000000-0000-4000-8000-000000000001',
      config,
      toolName: 'echo',
      input: { value: 'controlled' },
      actor: { id: 'admin', role: 'Admin', permissions: ['tool:echo'] },
      policy: { decision: 'allowed', reason: 'test' },
      dryRun: true
    })
    expect(allowed.status).toBe('succeeded')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('fails closed for every gateway boundary and records sanitized outcomes', async () => {
    const handler = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'failed' as const,
        data: { token: 'x' }
      })
      .mockRejectedValueOnce(new Error('controlled handler failure'))
      .mockResolvedValue({ status: 'succeeded' as const, data: { ok: true } })
    const manifest = {
      name: 'fake.boundaries',
      version: '1.0.0',
      capabilities: ['demo.echo'],
      permissions: ['tool:echo'],
      tools: [
        {
          name: 'echo',
          permission: 'tool:echo',
          risk: 'low' as const,
          requiresApproval: false
        }
      ],
      hooks: [],
      dependencies: [],
      configSchemaVersion: '1'
    }
    const registry = new PluginRegistry().register({
      manifest,
      handlers: { echo: handler },
      inputValidators: {
        echo: z
          .object({
            email: z.string().email().max(320).optional(),
            value: z.string().max(4000)
          })
          .strict()
      },
      outputValidators: { echo: foundationEchoOutputSchema }
    })
    const gateway = new CapabilityGateway(registry, {
      actorAuthorizer: foundationActorAuthorizer
    })
    const config = {
      ...createConfig(),
      plugins: [
        {
          plugin: manifest.name,
          version: '1.0.0',
          enabled: true,
          allowedTools: ['echo'],
          config: {}
        }
      ]
    }
    const base = {
      tenantId: tenantA,
      agentId: 'agent_00000000-0000-4000-8000-000000000001' as const,
      versionId: 'agent_version_00000000-0000-4000-8000-000000000001' as const,
      config,
      toolName: 'echo',
      input: { email: 'operator@example.com', value: 'controlled' },
      actor: { id: 'admin', role: 'Admin', permissions: ['tool:echo'] },
      policy: { decision: 'allowed' as const, reason: 'test' },
      dryRun: true,
      onAudit: vi.fn()
    }

    await expect(
      gateway.execute({ ...base, config: { ...config, plugins: [] } })
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'plugin_binding_missing'
    })
    await expect(
      gateway.execute({
        ...base,
        config: {
          ...config,
          plugins: [{ ...config.plugins[0]!, plugin: 'missing.plugin' }]
        }
      })
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'plugin_version_not_registered'
    })
    await expect(
      gateway.execute({
        ...base,
        toolName: 'missing-tool',
        config: {
          ...config,
          plugins: [{ ...config.plugins[0]!, allowedTools: ['missing-tool'] }]
        }
      })
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'tool_not_registered'
    })
    await expect(
      gateway.execute({
        ...base,
        config: {
          ...config,
          plugins: [{ ...config.plugins[0]!, allowedTools: ['other'] }]
        }
      })
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'plugin_binding_missing'
    })
    await expect(
      gateway.execute({
        ...base,
        actor: {
          id: 'operator',
          role: 'Operator',
          permissions: ['tool:echo']
        }
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'permission_denied' })
    await expect(
      gateway.execute({
        ...base,
        policy: { decision: 'blocked', reason: 'hard safety' }
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'policy_blocked' })
    await expect(
      gateway.execute({
        ...base,
        policy: { decision: 'handoff', reason: 'human takeover' }
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'policy_handoff' })

    await expect(gateway.execute(base)).resolves.toMatchObject({
      status: 'failed'
    })
    await expect(gateway.execute(base)).resolves.toMatchObject({
      status: 'failed',
      reason: 'tool_execution_failed'
    })
    expect(base.onAudit).toHaveBeenCalled()
    expect(base.onAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        payload: expect.objectContaining({
          input: { value: 'controlled' }
        })
      })
    )
  })

  it('requires approval and validates plugin registrations immutably', async () => {
    const handler = vi.fn(async () => ({ status: 'succeeded' as const }))
    const manifest = {
      name: 'fake.approval',
      version: '1.0.0',
      capabilities: ['demo.approval'],
      permissions: ['tool:approve'],
      tools: [
        {
          name: 'approve',
          permission: 'tool:approve',
          risk: 'high' as const,
          requiresApproval: true
        }
      ],
      hooks: [],
      dependencies: [],
      configSchemaVersion: '1'
    }
    const registry = new PluginRegistry().register({
      manifest,
      handlers: { approve: handler },
      inputValidators: { approve: z.object({}).strict() },
      outputValidators: { approve: z.object({}).strict() }
    })
    expect(registry.list()).toHaveLength(1)
    expect(() =>
      registry.register({
        manifest,
        handlers: { approve: handler },
        inputValidators: { approve: z.object({}).strict() },
        outputValidators: { approve: z.object({}).strict() }
      })
    ).toThrow('already registered')
    expect(() =>
      new PluginRegistry().register({
        manifest,
        handlers: {},
        inputValidators: { approve: z.object({}).strict() },
        outputValidators: { approve: z.object({}).strict() }
      })
    ).toThrow('Every manifest tool')

    const approvalAuthority = new InMemoryCapabilityApprovalAuthority()
    const gateway = new CapabilityGateway(registry, {
      actorAuthorizer: foundationActorAuthorizer,
      approvalAuthority
    })
    const config = {
      ...createConfig(),
      plugins: [
        {
          plugin: manifest.name,
          version: '1.0.0',
          enabled: true,
          allowedTools: ['approve'],
          config: {}
        }
      ]
    }
    const input = {
      tenantId: tenantA,
      agentId: 'agent_00000000-0000-4000-8000-000000000002' as const,
      versionId: 'agent_version_00000000-0000-4000-8000-000000000002' as const,
      config,
      toolName: 'approve',
      input: {},
      actor: { id: 'admin', role: 'Admin', permissions: ['tool:approve'] },
      policy: { decision: 'requires_approval' as const, reason: 'approval' },
      dryRun: true
    }
    await expect(gateway.execute(input)).resolves.toMatchObject({
      status: 'blocked',
      reason: 'approval_required'
    })
    await expect(
      gateway.execute({
        ...input,
        approval: {
          id: 'approval_00000000-0000-4000-8000-000000000001',
          tenantId: tenantB,
          agentId: input.agentId,
          versionId: input.versionId,
          toolName: input.toolName,
          actorId: input.actor.id,
          expiresAt: new Date(Date.now() + 60_000)
        }
      })
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'approval_required'
    })
    const issued = await approvalAuthority.issue({
      tenantId: tenantA,
      agentId: input.agentId,
      versionId: input.versionId,
      toolName: input.toolName,
      input: {},
      actorId: input.actor.id,
      issuer: 'approver.foundation',
      expiresAt: new Date(Date.now() + 60_000)
    })
    await expect(
      gateway.execute({
        ...input,
        approval: {
          id: issued.id,
          tenantId: tenantA,
          agentId: input.agentId,
          versionId: input.versionId,
          toolName: input.toolName,
          actorId: input.actor.id,
          expiresAt: new Date(Date.now() + 60_000)
        }
      })
    ).resolves.toMatchObject({ status: 'succeeded' })
    expect(handler).toHaveBeenCalledTimes(1)
    await expect(
      gateway.execute({
        ...input,
        approval: {
          id: issued.id,
          tenantId: tenantA,
          agentId: input.agentId,
          versionId: input.versionId,
          toolName: input.toolName,
          actorId: input.actor.id,
          expiresAt: issued.expiresAt
        }
      })
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'approval_required'
    })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('Test Lab dry-run', () => {
  it('returns a complete trace without an external call', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId: tenantA },
      {
        slug: 'lab-agent',
        name: 'Lab Agent',
        description: 'Controlled test agent'
      }
    )
    const version = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      AgentConfigSchema.parse({
        ...createConfig(),
        knowledge: [
          {
            source: 'controlled://institutional-hours',
            version: 'knowledge-v1',
            enabled: true,
            requiresApprovedSource: true
          }
        ]
      }),
      'admin-a'
    )

    const trace = await runTestLab({
      store,
      tenantId: tenantA,
      agentId: agent.id,
      versionId: version.id,
      message: 'Qual o horario de funcionamento?',
      history: [],
      approvedKnowledge: {
        version: 'knowledge-v1',
        answer: 'Atendimento fictício de segunda a sexta.',
        source: 'controlled://institutional-hours'
      }
    })

    expect(trace).toMatchObject({
      tenantId: tenantA,
      agentId: agent.id,
      versionId: version.id,
      intent: { name: 'institutional_question' },
      knowledge: {
        status: 'answered',
        source: 'controlled://institutional-hours'
      },
      provider: {
        provider: 'fake',
        model: 'deterministic-v1',
        externalCall: false
      },
      handoff: { requested: false }
    })
    expect(trace.response.mode).toBe('answer')
    expect(trace.traceId).toMatch(/^trace_[0-9a-f-]{36}$/)
    expect(trace).toMatchObject({
      status: 'completed',
      risk: { level: 'low' },
      prompt: { version: `${version.id}:v1`, blockIds: ['a-first', 'z-last'] },
      tokenUsage: {
        estimated: true,
        total: expect.any(Number)
      },
      spans: expect.arrayContaining([
        expect.objectContaining({ name: 'prompt' }),
        expect.objectContaining({ name: 'model' })
      ]),
      toolResults: [],
      startedAt: expect.any(Date),
      completedAt: expect.any(Date),
      latencyMs: expect.any(Number)
    })
    expect(await store.listTestRuns({ tenantId: tenantA })).toHaveLength(1)
  })

  it('redacts trace text again at the persistence boundary', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId: tenantA },
      {
        slug: 'redaction-boundary',
        name: 'Redaction Boundary',
        description: 'Test'
      }
    )
    const version = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      AgentConfigSchema.parse({
        ...createConfig(),
        knowledge: [
          {
            source: 'controlled://institutional-address',
            version: 'knowledge-pii-v1',
            enabled: true,
            requiresApprovedSource: true
          }
        ]
      }),
      'admin-a'
    )
    const trace = {
      traceId: 'trace_00000000-0000-4000-8000-000000000031' as const,
      tenantId: tenantA,
      agentId: agent.id,
      versionId: version.id,
      input: { message: 'email ana@example.com', historySize: 0 },
      intent: { name: 'unknown', confidence: 0.1 },
      policy: [],
      knowledge: { status: 'not_requested' as const },
      tools: [],
      handoff: {
        requested: false,
        reason: null,
        state: 'BOT_ACTIVE' as const
      },
      response: { text: 'Telefone +5511999999999', mode: 'answer' as const },
      provider: {
        provider: 'fake',
        model: 'deterministic-v1',
        externalCall: false as const
      },
      configVersion: 'controlled',
      executionMode: 'TEST_LAB' as const,
      createdAt: new Date()
    }

    await store.recordExecutionTrace({ tenantId: tenantA }, trace)
    const stored = await store.listExecutionTraces({ tenantId: tenantA })

    expect(stored[0]?.input.message).toBe('email [redacted-email]')
    expect(stored[0]?.response.text).toBe('Telefone [redacted-phone]')
  })

  it('turns an approval decision into a safe handoff and never runs its tool', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId: tenantA },
      {
        slug: 'approval-boundary',
        name: 'Approval Boundary',
        description: 'Test'
      }
    )
    const version = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      AgentConfigSchema.parse({
        ...createConfig(),
        policies: {
          ...createConfig().policies,
          enabledActions: ['respond', 'scheduling'],
          approvalActions: ['scheduling']
        },
        plugins: [
          {
            plugin: 'scheduling.controlled',
            version: '1.0.0',
            enabled: true,
            allowedTools: ['find_available_slots'],
            config: {}
          }
        ]
      }),
      'admin-a'
    )

    const trace = await runTestLab({
      store,
      tenantId: tenantA,
      agentId: agent.id,
      versionId: version.id,
      message: 'Quero agendar uma consulta',
      history: []
    })

    expect(trace.policy[0]).toMatchObject({
      decision: 'requires_approval',
      reason: 'approval_required_by_published_policy'
    })
    expect(trace.handoff).toMatchObject({
      requested: true,
      reason: 'controlled_runtime_policy_denied'
    })
    expect(trace.status).toBe('blocked')
    expect(trace.response.mode).toBe('handoff')
    expect(trace.tools).toEqual([
      { name: 'find_available_slots', status: 'blocked' }
    ])
  })

  it('hands off institutional questions when no approved source is supplied', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId: tenantA },
      { slug: 'missing-source', name: 'Missing Source', description: 'Test' }
    )
    const version = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      AgentConfigSchema.parse({
        ...createConfig(),
        knowledge: [
          {
            source: 'controlled://hours',
            version: 'kb-v1',
            enabled: true,
            requiresApprovedSource: true
          },
          {
            source: 'controlled://institutional-address',
            version: 'knowledge-pii-v1',
            enabled: true,
            requiresApprovedSource: true
          }
        ]
      }),
      'admin-a'
    )

    const trace = await runTestLab({
      store,
      tenantId: tenantA,
      agentId: agent.id,
      versionId: version.id,
      message: 'Qual o horário de funcionamento?',
      history: []
    })

    expect(trace.knowledge.status).toBe('approved_source_missing')
    expect(trace.handoff).toMatchObject({
      requested: true,
      reason: 'approved_source_missing',
      state: 'HANDOFF_REQUESTED',
      destination: 'controlled-reception',
      priority: 'medium'
    })
    expect(trace.response.mode).toBe('handoff')
  })

  it('uses the approved source answer in the dry-run response', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId: tenantA },
      { slug: 'source-answer', name: 'Source Answer', description: 'Test' }
    )
    const version = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      AgentConfigSchema.parse({
        ...createConfig(),
        knowledge: [
          {
            source: 'controlled://institutional-address',
            version: 'knowledge-v1',
            enabled: true,
            requiresApprovedSource: true
          }
        ]
      }),
      'admin-a'
    )

    const trace = await runTestLab({
      store,
      tenantId: tenantA,
      agentId: agent.id,
      versionId: version.id,
      message: 'Qual o endereço?',
      history: [],
      approvedKnowledge: {
        version: 'knowledge-v1',
        source: 'controlled://institutional-address',
        answer: 'Endereço fictício usado somente no teste.'
      }
    })

    expect(trace.response).toEqual({
      mode: 'answer',
      text: 'Endereço fictício usado somente no teste.'
    })
  })

  it('does not answer from a knowledge source outside the version snapshot', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId: tenantA },
      {
        slug: 'source-provenance',
        name: 'Source Provenance',
        description: 'Test'
      }
    )
    const version = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      AgentConfigSchema.parse({
        ...createConfig(),
        knowledge: [
          {
            source: 'controlled://institutional-hours',
            version: 'knowledge-v1',
            enabled: true,
            requiresApprovedSource: true
          }
        ]
      }),
      'admin-a'
    )

    const trace = await runTestLab({
      store,
      tenantId: tenantA,
      agentId: agent.id,
      versionId: version.id,
      message: 'Qual o endereço?',
      history: [],
      approvedKnowledge: {
        version: 'knowledge-v1',
        source: 'controlled://unconfigured-source',
        answer: 'Resposta que não pertence ao snapshot.'
      }
    })

    expect(trace.knowledge).toEqual({ status: 'approved_source_missing' })
    expect(trace.response.mode).toBe('handoff')
    expect(trace.response.text).not.toContain('Resposta que não pertence')
  })

  it('covers scheduling, triage, clarification, blocked actions and redaction', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId: tenantA },
      { slug: 'lab-branches', name: 'Lab Branches', description: 'Test' }
    )
    const version = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      AgentConfigSchema.parse({
        ...createConfig(),
        knowledge: [
          {
            source: 'controlled://hours',
            version: 'kb-v1',
            enabled: true,
            requiresApprovedSource: true
          },
          {
            source: 'controlled://institutional-address',
            version: 'knowledge-pii-v1',
            enabled: true,
            requiresApprovedSource: true
          }
        ]
      }),
      'admin-a'
    )
    const base = {
      store,
      tenantId: tenantA,
      agentId: agent.id,
      versionId: version.id
    }

    const scheduling = await runTestLab({
      ...base,
      message: 'Quero agendar uma consulta',
      history: []
    })
    expect(scheduling.intent.name).toBe('scheduling')
    expect(scheduling.tools).toEqual([])
    expect(scheduling.response.mode).toBe('blocked')

    const schedulingConfig = AgentConfigSchema.parse({
      ...createConfig(),
      policies: {
        ...createConfig().policies,
        enabledActions: ['respond', 'institutional_question', 'scheduling']
      },
      plugins: [
        {
          plugin: 'scheduling.controlled',
          version: '1.0.0',
          enabled: true,
          allowedTools: ['find_available_slots'],
          config: {}
        }
      ]
    })
    const schedulingAgent = await store.createAgent(
      { tenantId: tenantA },
      {
        slug: 'lab-scheduling-enabled',
        name: 'Scheduling Enabled',
        description: 'Test'
      }
    )
    const schedulingVersion = await store.createVersion(
      { tenantId: tenantA },
      schedulingAgent.id,
      schedulingConfig,
      'admin-a'
    )
    const enabledScheduling = await runTestLab({
      store,
      tenantId: tenantA,
      agentId: schedulingAgent.id,
      versionId: schedulingVersion.id,
      message: 'Quero agendar uma consulta',
      history: []
    })
    expect(enabledScheduling.tools).toEqual([
      { name: 'find_available_slots', status: 'succeeded' }
    ])

    const blockedAction = await runTestLab({
      ...base,
      message: 'Confirmar consulta',
      history: []
    })
    expect(blockedAction.policy[0]).toMatchObject({
      decision: 'blocked',
      layer: 'hard_safety'
    })

    const triage = await runTestLab({
      ...base,
      message: 'Estou com dor e vomitando',
      history: []
    })
    expect(triage.intent.name).toBe('triage')
    expect(triage.handoff).toMatchObject({
      requested: true,
      reason: 'high_risk_requires_handoff'
    })

    const medication = await runTestLab({
      ...base,
      message: 'Meu cachorro está vomitando. Posso dar dipirona?',
      history: []
    })
    expect(medication).toMatchObject({
      intent: { name: 'medication_advice' },
      risk: { level: 'critical' },
      policy: [
        expect.objectContaining({
          decision: 'blocked',
          layer: 'hard_safety'
        })
      ],
      handoff: { requested: true },
      response: { mode: 'handoff' },
      provider: { externalCall: false },
      tools: [],
      toolResults: []
    })
    expect(medication.response.text).toMatch(/veterin[aá]ri/i)

    const EnglishMedication = await runTestLab({
      ...base,
      message: 'Can I give my dog medicine?',
      history: []
    })
    expect(EnglishMedication).toMatchObject({
      intent: { name: 'medication_advice' },
      risk: { level: 'critical' },
      handoff: { requested: true },
      response: { mode: 'handoff' },
      provider: { externalCall: false }
    })

    const clarify = await runTestLab({
      ...base,
      message: 'Olá',
      history: []
    })
    expect(clarify.response.mode).toBe('clarify')

    const handoffAfterClarifications = await runTestLab({
      ...base,
      message: 'Olá novamente',
      history: ['primeira pergunta', 'segunda pergunta']
    })
    expect(handoffAfterClarifications.response.mode).toBe('handoff')

    const redacted = await runTestLab({
      ...base,
      message: 'Contato teste@example.com +55 (11) 99999-9999',
      history: []
    })
    expect(redacted.input.message).toBe(
      'Contato [redacted-email] [redacted-phone]'
    )

    const piiTrace = await runTestLab({
      ...base,
      message:
        'Meu nome é Ana. Endereço: Rua Fictícia, 123. CPF 111.222.333-44.',
      history: [],
      approvedKnowledge: {
        version: 'knowledge-pii-v1',
        source: 'controlled://institutional-address',
        answer: 'Rua Fictícia, 123'
      }
    })
    expect(piiTrace.input.message).toBe(
      'Meu nome é [redacted-name]. Endereço: [redacted-address]. CPF [redacted-cpf].'
    )
    expect(piiTrace.response.text).toBe('[redacted-address]')
  })

  it('registers the controlled scheduling plugin with an immutable gateway', async () => {
    const plugin = createControlledSchedulingPlugin()
    const registry = new PluginRegistry().register(plugin)
    const gateway = createControlledCapabilityGateway()

    expect(registry.list()).toEqual([
      expect.objectContaining({
        manifest: expect.objectContaining({ name: 'scheduling.controlled' })
      })
    ])
    await expect(
      gateway.execute({
        tenantId: tenantA,
        agentId: 'agent_00000000-0000-0000-0000-000000000001',
        versionId: 'agent_version_00000000-0000-0000-0000-000000000001',
        config: AgentConfigSchema.parse({
          ...createConfig(),
          plugins: [
            {
              plugin: 'scheduling.controlled',
              version: '1.0.0',
              enabled: true,
              allowedTools: ['find_available_slots'],
              config: {}
            }
          ]
        }),
        toolName: 'find_available_slots',
        input: { message: 'Quero agendar' },
        actor: {
          id: 'system.runtime',
          role: 'System',
          permissions: ['scheduling:read']
        },
        policy: { decision: 'allowed', reason: 'controlled_test' },
        dryRun: true
      })
    ).resolves.toMatchObject({ status: 'succeeded' })
  })

  it('rejects invalid dry-run input and unavailable versions', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId: tenantA },
      { slug: 'lab-validation', name: 'Lab Validation', description: 'Test' }
    )
    const version = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      createConfig(),
      'admin-a'
    )
    const base = {
      store,
      tenantId: tenantA,
      agentId: agent.id,
      versionId: version.id,
      history: []
    }

    await expect(runTestLab({ ...base, message: '   ' })).rejects.toMatchObject(
      { code: 'validation_failed' }
    )
    await expect(
      runTestLab({
        ...base,
        message: 'ok',
        history: ['x'.repeat(4001)]
      })
    ).rejects.toMatchObject({ code: 'validation_failed' })
    await expect(
      runTestLab({
        ...base,
        versionId: 'agent_version_00000000-0000-4000-8000-000000000099',
        message: 'ok'
      })
    ).rejects.toMatchObject({ code: 'invalid_action' })
    await expect(
      runTestLab({
        ...base,
        message: 'ok',
        approvedKnowledge: {
          version: 'kb-v1',
          answer: 'not approved',
          source: 'https://unapproved.example'
        }
      })
    ).rejects.toMatchObject({ code: 'validation_failed' })
  })

  it('runs deterministic Test Lab evaluations and reports regressions', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId: tenantA },
      { slug: 'lab-evals', name: 'Lab Evals', description: 'Test' }
    )
    const version = await store.createVersion(
      { tenantId: tenantA },
      agent.id,
      AgentConfigSchema.parse({
        ...createConfig(),
        knowledge: [
          {
            source: 'controlled://hours',
            version: 'kb-v1',
            enabled: true,
            requiresApprovedSource: true
          }
        ]
      }),
      'admin-a'
    )
    const base = {
      store,
      tenantId: tenantA,
      agentId: agent.id,
      versionId: version.id
    }

    const passing = await evaluateTestLabCase({
      ...base,
      testCase: {
        id: 'institutional-answer',
        message: 'Qual o horário de funcionamento?',
        history: [],
        expectedPolicyDecision: 'allowed',
        expectedResponseMode: 'answer',
        expectedHandoff: false,
        approvedKnowledge: {
          version: 'kb-v1',
          answer: 'Horário fictício.',
          source: 'controlled://hours'
        }
      }
    })
    expect(passing).toMatchObject({
      caseId: 'institutional-answer',
      passed: true
    })

    const suite = await evaluateTestLabSuite({
      ...base,
      cases: [
        {
          id: 'expected-clarify',
          message: 'Olá',
          history: [],
          expectedResponseMode: 'clarify'
        },
        {
          id: 'regression',
          message: 'Confirmar consulta',
          history: [],
          expectedResponseMode: 'answer'
        }
      ]
    })
    expect(suite.passed).toBe(false)
    expect(suite.results[0]?.passed).toBe(true)
    expect(suite.results[1]?.failures).toContain(
      'response_expected_answer_got_blocked'
    )

    const failing = await evaluateTestLabCase({
      ...base,
      testCase: {
        id: 'wrong-expectations',
        message: 'Olá',
        history: [],
        expectedPolicyDecision: 'allowed',
        expectedResponseMode: 'clarify',
        expectedHandoff: true
      }
    })
    expect(failing.passed).toBe(false)
    expect(failing.failures).toEqual([
      'policy_expected_allowed_got_clarify',
      'handoff_expected_true_got_false'
    ])
  })
})
