import {
  AgentConfigSchema,
  createValidatedControlledReleaseCandidate,
  InMemoryControlPlaneStore
} from '@cvg/platform'
import { describe, expect, it, vi } from 'vitest'
import { InvocationEvidenceState } from '../../../../packages/platform/src/controlled-kernel-adapters.ts'
import { buildServer } from '../server.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000141'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000142'

const supervisorHeaders = (tenantId: string) => ({
  'x-operator-id': 'supervisor.capability',
  'x-operator-role': 'Supervisor',
  'x-tenant-id': tenantId
})

const operatorHeaders = (tenantId: string) => ({
  'x-operator-id': 'operator.capability',
  'x-operator-role': 'Operator',
  'x-tenant-id': tenantId
})

function schedulingConfig() {
  return AgentConfigSchema.parse({
    persona: { name: 'Fixture', role: 'secretary', tone: 'calm' },
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
      secretRef: 'secret://controlled/approval-api'
    },
    policies: {
      version: 'approval-api-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: ['respond', 'scheduling'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: [
      {
        plugin: 'scheduling.controlled',
        version: '1.0.0',
        enabled: true,
        allowedTools: ['find_available_slots'],
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

async function createPublishedAgent(store: InMemoryControlPlaneStore) {
  const agent = await store.createAgent(
    { tenantId: tenantA },
    {
      slug: 'approval-api-agent',
      name: 'Approval API Agent',
      description: 'Fixture controlada'
    }
  )
  const draft = await store.createVersion(
    { tenantId: tenantA },
    agent.id,
    schedulingConfig(),
    'admin.capability'
  )
  const testing = await store.transitionVersion(
    { tenantId: tenantA },
    draft.id,
    'TESTING'
  )
  const approved = await store.transitionVersion(
    { tenantId: tenantA },
    testing.id,
    'APPROVED'
  )
  const releaseCandidate = await createValidatedControlledReleaseCandidate(
    store,
    tenantA,
    agent.id,
    approved.id,
    'admin.capability'
  )
  await store.publishVersion(
    { tenantId: tenantA },
    approved.id,
    releaseCandidate.id
  )
  return { agent, version: approved }
}

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
}

describe('capability approval API', () => {
  it.each(['terminal-audit', 'cancel-before-journal-ACK'] as const)(
    'returns 400 and preserves consumed approval after %s',
    async (failure) => {
      const platform = new InMemoryControlPlaneStore()
      const { agent, version } = await createPublishedAgent(platform)
      const app = buildServer({ platform })
      const message = 'Quero agendar uma consulta'
      let release!: () => void
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const io = InvocationEvidenceState.prototype.io
      let injected = false
      let confirmations = 0
      const spy = vi
        .spyOn(InvocationEvidenceState.prototype, 'io')
        .mockImplementation(function <T>(
          this: InvocationEvidenceState,
          phase: string,
          operation: () => T | PromiseLike<T>,
          terminal?: boolean
        ) {
          if (phase === 'journal.confirm') confirmations++
          return io.call(
            this,
            phase,
            async () => {
              if (
                !injected &&
                failure === 'terminal-audit' &&
                phase === 'audit.runtime.completed'
              ) {
                injected = true
                throw new Error('private terminal diagnostic')
              }
              const value = await operation()
              if (
                !injected &&
                failure === 'cancel-before-journal-ACK' &&
                phase === 'journal.markStarted'
              ) {
                injected = true
                this.controller.abort()
                await held
              }
              return value
            },
            terminal
          ) as Promise<T>
        })
      try {
        const issued = await app.inject({
          method: 'POST',
          url: '/v1/admin/capability-approvals',
          headers: supervisorHeaders(tenantA),
          payload: {
            agentId: agent.id,
            versionId: version.id,
            toolName: 'find_available_slots',
            actorId: 'operator.capability',
            input: { message },
            expiresAt: new Date(Date.now() + 60_000).toISOString()
          }
        })
        expect(issued.statusCode).toBe(200)
        const approval = issued.json().data as { id: string }
        const execute = () =>
          app.inject({
            method: 'POST',
            url: `/v1/admin/capability-approvals/${approval.id}/execute`,
            headers: operatorHeaders(tenantA),
            payload: { message, history: [] }
          })
        const result = await execute()
        expect(injected).toBe(true)
        expect(result.statusCode).toBe(400)
        expect(result.json().data).toBeNull()
        expect(result.body).not.toContain('private terminal diagnostic')
        const count = failure === 'terminal-audit' ? 1 : 0
        expect(confirmations).toBe(count)
        release()
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(confirmations).toBe(count)
        const replay = await execute()
        expect(replay.statusCode).toBe(400)
        expect(confirmations).toBe(count)
        const stored = await app.inject({
          method: 'GET',
          url: `/v1/admin/capability-approvals/${approval.id}`,
          headers: supervisorHeaders(tenantA)
        })
        expect(stored.json().data.status).toBe('consumed')
      } finally {
        release()
        spy.mockRestore()
        await app.close()
      }
    }
  )

  it('issues, executes once, and rejects replay of a durable approval', async () => {
    const platform = new InMemoryControlPlaneStore()
    const { agent, version } = await createPublishedAgent(platform)
    const app = buildServer({ platform })
    const message = 'Quero agendar uma consulta'

    const selfIssued = await app.inject({
      method: 'POST',
      url: '/v1/admin/capability-approvals',
      headers: supervisorHeaders(tenantA),
      payload: {
        agentId: agent.id,
        versionId: version.id,
        toolName: 'find_available_slots',
        actorId: 'supervisor.capability',
        input: { message },
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      }
    })
    const issued = await app.inject({
      method: 'POST',
      url: '/v1/admin/capability-approvals',
      headers: supervisorHeaders(tenantA),
      payload: {
        agentId: agent.id,
        versionId: version.id,
        toolName: 'find_available_slots',
        actorId: 'operator.capability',
        input: { message },
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      }
    })
    const approval = (issued.json() as Envelope<{ id: string }>).data
    expect(issued.statusCode).toBe(200)
    expect(approval?.id).toMatch(/^approval_/)

    const executed = await app.inject({
      method: 'POST',
      url: `/v1/admin/capability-approvals/${approval?.id}/execute`,
      headers: operatorHeaders(tenantA),
      payload: { message, history: [] }
    })
    const replay = await app.inject({
      method: 'POST',
      url: `/v1/admin/capability-approvals/${approval?.id}/execute`,
      headers: operatorHeaders(tenantA),
      payload: { message, history: [] }
    })
    const stored = await app.inject({
      method: 'GET',
      url: `/v1/admin/capability-approvals/${approval?.id}`,
      headers: supervisorHeaders(tenantA)
    })
    await app.close()

    expect(selfIssued.statusCode).toBe(403)
    expect(executed.statusCode).toBe(200)
    expect(executed.json().data.tools).toEqual([
      { name: 'find_available_slots', status: 'succeeded' }
    ])
    expect(replay.statusCode).toBe(400)
    expect((stored.json() as Envelope<{ status: string }>).data?.status).toBe(
      'consumed'
    )
  })

  it('keeps capability approvals tenant-scoped and supports issuer revocation', async () => {
    const platform = new InMemoryControlPlaneStore()
    const { agent, version } = await createPublishedAgent(platform)
    const app = buildServer({ platform })
    const issued = await app.inject({
      method: 'POST',
      url: '/v1/admin/capability-approvals',
      headers: supervisorHeaders(tenantA),
      payload: {
        agentId: agent.id,
        versionId: version.id,
        toolName: 'find_available_slots',
        actorId: 'operator.capability',
        input: { message: 'Quero agendar uma consulta' },
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      }
    })
    const approval = (issued.json() as Envelope<{ id: string }>).data
    const crossTenant = await app.inject({
      method: 'GET',
      url: `/v1/admin/capability-approvals/${approval?.id}`,
      headers: supervisorHeaders(tenantB)
    })
    const revoked = await app.inject({
      method: 'POST',
      url: `/v1/admin/capability-approvals/${approval?.id}/revoke`,
      headers: supervisorHeaders(tenantA)
    })
    const afterRevoke = await app.inject({
      method: 'POST',
      url: `/v1/admin/capability-approvals/${approval?.id}/execute`,
      headers: operatorHeaders(tenantA),
      payload: { message: 'Quero agendar uma consulta', history: [] }
    })
    await app.close()

    expect(crossTenant.statusCode).toBe(400)
    expect(revoked.statusCode).toBe(200)
    expect(afterRevoke.statusCode).toBe(400)
  })

  it('rejects invalid approved knowledge before consuming a capability approval', async () => {
    const platform = new InMemoryControlPlaneStore()
    const { agent, version } = await createPublishedAgent(platform)
    const app = buildServer({ platform })
    const message = 'Quero agendar uma consulta'
    const issued = await app.inject({
      method: 'POST',
      url: '/v1/admin/capability-approvals',
      headers: supervisorHeaders(tenantA),
      payload: {
        agentId: agent.id,
        versionId: version.id,
        toolName: 'find_available_slots',
        actorId: 'operator.capability',
        input: { message },
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      }
    })
    const approval = (issued.json() as Envelope<{ id: string }>).data

    const rejected = await app.inject({
      method: 'POST',
      url: `/v1/admin/capability-approvals/${approval?.id}/execute`,
      headers: operatorHeaders(tenantA),
      payload: {
        message,
        history: [],
        approvedKnowledge: {
          source: `controlled://${'x'.repeat(201)}`,
          version: 'v1',
          answer: 'Resposta controlada.'
        }
      }
    })
    const stored = await app.inject({
      method: 'GET',
      url: `/v1/admin/capability-approvals/${approval?.id}`,
      headers: supervisorHeaders(tenantA)
    })
    await app.close()

    expect(rejected.statusCode).toBe(400)
    expect(rejected.json()).toMatchObject({
      success: false,
      error: { code: 'validation_failed' }
    })
    expect((stored.json() as Envelope<{ status: string }>).data?.status).toBe(
      'issued'
    )
  })

  it('rejects catalog-only tool metadata before issuing an approval', async () => {
    const platform = new InMemoryControlPlaneStore()
    const { agent, version } = await createPublishedAgent(platform)
    const app = buildServer({ platform })

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/capability-approvals',
      headers: supervisorHeaders(tenantA),
      payload: {
        agentId: agent.id,
        versionId: version.id,
        toolName: 'catalog_only_tool',
        actorId: 'operator.capability',
        input: { message: 'Quero consultar horários fictícios' },
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      }
    })
    await app.close()

    expect(response.statusCode).toBe(400)
    expect((response.json() as Envelope<unknown>).data).toBeNull()
  })
})
