import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AgentConfigSchema } from '../contracts.ts'
import {
  CapabilityGateway,
  PluginRegistry,
  type CapabilityActorAuthorizer,
  type CapabilityExecutionInput,
  type PluginHandler
} from '../plugin-gateway.ts'
import {
  InMemoryCapabilityApprovalAuthority,
  type CapabilityApprovalIssueInput
} from '../approval-authority.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000111' as const
const agentId = 'agent_00000000-0000-4000-8000-000000000111' as const
const versionId = 'agent_version_00000000-0000-4000-8000-000000000111' as const
const approvalActorAuthorizer: CapabilityActorAuthorizer = ({
  actor,
  requiredPermission
}) => (actor.id === 'operator.fixture' ? [requiredPermission] : [])

const config = AgentConfigSchema.parse({
  persona: { name: 'Fixture', role: 'secretary', tone: 'calm' },
  greeting: 'Fixture',
  promptBlocks: [],
  responseTemplates: {},
  model: {
    provider: 'fake',
    model: 'fixture',
    temperature: 0,
    maxTokens: 64,
    timeoutMs: 1000,
    retries: 0,
    secretRef: 'secret://controlled/approval'
  },
  policies: {
    version: 'approval-v1',
    minConfidence: 0.7,
    lowConfidence: 'handoff',
    maxClarifications: 1,
    enabledActions: ['respond'],
    approvalActions: ['approve-controlled-read'],
    blockedActions: []
  },
  plugins: [
    {
      plugin: 'approval.fixture',
      version: '1.0.0',
      enabled: true,
      allowedTools: ['approve-controlled-read'],
      config: {}
    }
  ],
  knowledge: [],
  handoff: {
    lowConfidenceDestination: 'controlled-reception',
    destinations: ['controlled-reception'],
    maxClarifications: 1
  }
})

function createGateway(
  handler: PluginHandler,
  authority: InMemoryCapabilityApprovalAuthority,
  now: () => Date
) {
  const registry = new PluginRegistry().register({
    manifest: {
      name: 'approval.fixture',
      version: '1.0.0',
      capabilities: ['fixture.read'],
      permissions: ['fixture:read'],
      tools: [
        {
          name: 'approve-controlled-read',
          permission: 'fixture:read',
          risk: 'high',
          requiresApproval: true
        }
      ],
      hooks: [],
      dependencies: [],
      configSchemaVersion: '1'
    },
    handlers: { 'approve-controlled-read': handler },
    inputValidators: {
      'approve-controlled-read': z
        .object({ value: z.string().max(4000) })
        .strict()
    },
    outputValidators: {
      'approve-controlled-read': z.object({}).strict()
    }
  })
  return new CapabilityGateway(registry, {
    actorAuthorizer: approvalActorAuthorizer,
    approvalAuthority: authority,
    now
  })
}

function executionInput(
  overrides: Partial<CapabilityExecutionInput> = {}
): CapabilityExecutionInput {
  return {
    tenantId,
    agentId,
    versionId,
    config,
    toolName: 'approve-controlled-read',
    input: { value: 'fixture' },
    actor: {
      id: 'operator.fixture',
      role: 'Operator',
      permissions: ['fixture:read']
    },
    policy: { decision: 'requires_approval', reason: 'fixture' },
    dryRun: true,
    ...overrides
  }
}

describe('capability gateway durable approval', () => {
  it('consumes a durable approval before the handler and blocks replay/substitution', async () => {
    const now = new Date('2026-09-01T10:00:00.000Z')
    const clock = () => now
    const authority = new InMemoryCapabilityApprovalAuthority(clock)
    const handler = vi.fn<PluginHandler>(async () => ({
      status: 'succeeded' as const
    }))
    const gateway = createGateway(handler, authority, clock)
    const input = executionInput()
    const issue: CapabilityApprovalIssueInput = {
      tenantId,
      agentId,
      versionId,
      toolName: input.toolName,
      input: input.input,
      actorId: input.actor.id,
      issuer: 'approver.fixture',
      expiresAt: new Date('2026-09-01T11:00:00.000Z')
    }
    const approval = await authority.issue(issue)

    await expect(
      gateway.execute({
        ...input,
        approval: {
          id: approval.id,
          tenantId,
          agentId,
          versionId,
          toolName: input.toolName,
          actorId: input.actor.id,
          expiresAt: approval.expiresAt
        }
      })
    ).resolves.toMatchObject({ status: 'succeeded' })
    await expect(
      gateway.execute({
        ...input,
        approval: {
          id: approval.id,
          tenantId,
          agentId,
          versionId,
          toolName: input.toolName,
          actorId: input.actor.id,
          expiresAt: approval.expiresAt
        }
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'approval_required' })
    expect(handler).toHaveBeenCalledTimes(1)

    const substituted = await authority.issue(issue)
    await expect(
      gateway.execute({
        ...input,
        input: { value: 'substituted' },
        approval: {
          id: substituted.id,
          tenantId,
          agentId,
          versionId,
          toolName: input.toolName,
          actorId: input.actor.id,
          expiresAt: substituted.expiresAt
        }
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'approval_required' })
  })

  it('fails closed when the configured clock is invalid', async () => {
    const authorityNow = new Date('2026-09-01T10:00:00.000Z')
    const authority = new InMemoryCapabilityApprovalAuthority(
      () => authorityNow
    )
    const handler = vi.fn<PluginHandler>(async () => ({
      status: 'succeeded' as const
    }))
    const gateway = createGateway(
      handler,
      authority,
      () => new Date(Number.NaN)
    )
    const input = executionInput()
    const approval = await authority.issue({
      tenantId,
      agentId,
      versionId,
      toolName: input.toolName,
      input: input.input,
      actorId: input.actor.id,
      issuer: 'approver.fixture',
      expiresAt: new Date('2026-09-03T11:00:00.000Z')
    })
    const verifyAndConsume = vi.spyOn(authority, 'verifyAndConsume')

    await expect(
      gateway.execute({
        ...input,
        approval: {
          id: approval.id,
          tenantId,
          agentId,
          versionId,
          toolName: input.toolName,
          actorId: input.actor.id,
          expiresAt: approval.expiresAt
        }
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'approval_required' })
    expect(handler).not.toHaveBeenCalled()
    expect(verifyAndConsume).not.toHaveBeenCalled()
    expect(await authority.get(approval.id, tenantId)).toMatchObject({
      status: 'issued'
    })
  })

  it('fails closed before consuming an approval expired for the gateway clock', async () => {
    const authorityNow = new Date('2026-09-01T10:00:00.000Z')
    const gatewayNow = new Date('2026-09-01T12:00:00.000Z')
    const clock = () => authorityNow
    const authority = new InMemoryCapabilityApprovalAuthority(clock)
    const handler = vi.fn<PluginHandler>(async () => ({
      status: 'succeeded' as const
    }))
    const gateway = createGateway(handler, authority, () => gatewayNow)
    const input = executionInput()
    const approval = await authority.issue({
      tenantId,
      agentId,
      versionId,
      toolName: input.toolName,
      input: input.input,
      actorId: input.actor.id,
      issuer: 'approver.fixture',
      expiresAt: new Date('2026-09-01T11:00:00.000Z')
    })
    const verifyAndConsume = vi.spyOn(authority, 'verifyAndConsume')

    await expect(
      gateway.execute({
        ...input,
        approval: {
          id: approval.id,
          tenantId,
          agentId,
          versionId,
          toolName: input.toolName,
          actorId: input.actor.id,
          expiresAt: approval.expiresAt
        }
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'approval_required' })
    expect(handler).not.toHaveBeenCalled()
    expect(verifyAndConsume).not.toHaveBeenCalled()
    expect(await authority.get(approval.id, tenantId)).toMatchObject({
      status: 'issued'
    })
  })

  it('fails closed when the configured clock throws', async () => {
    const authorityNow = new Date('2026-09-01T10:00:00.000Z')
    const authority = new InMemoryCapabilityApprovalAuthority(
      () => authorityNow
    )
    const handler = vi.fn<PluginHandler>(async () => ({
      status: 'succeeded' as const
    }))
    const gateway = createGateway(handler, authority, () => {
      throw new Error('clock unavailable')
    })
    const input = executionInput()
    const approval = await authority.issue({
      tenantId,
      agentId,
      versionId,
      toolName: input.toolName,
      input: input.input,
      actorId: input.actor.id,
      issuer: 'approver.fixture',
      expiresAt: new Date('2026-09-03T11:00:00.000Z')
    })
    const verifyAndConsume = vi.spyOn(authority, 'verifyAndConsume')

    await expect(
      gateway.execute({
        ...input,
        approval: {
          id: approval.id,
          tenantId,
          agentId,
          versionId,
          toolName: input.toolName,
          actorId: input.actor.id,
          expiresAt: approval.expiresAt
        }
      })
    ).resolves.toMatchObject({ status: 'blocked', reason: 'approval_required' })
    expect(handler).not.toHaveBeenCalled()
    expect(verifyAndConsume).not.toHaveBeenCalled()
    expect(await authority.get(approval.id, tenantId)).toMatchObject({
      status: 'issued'
    })
  })
})
