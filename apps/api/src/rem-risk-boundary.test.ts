import {
  CapabilityGateway,
  createControlledAgentConfig,
  createValidatedControlledReleaseCandidate,
  InMemoryControlPlaneStore
} from '@cvg/platform'
import { describe, expect, it, vi } from 'vitest'
import { buildServer } from './server.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000072'
describe('REM risk public API boundary', () => {
  it('preempts scheduling tools on the inbound HTTP runtime', async () => {
    const platform = new InMemoryControlPlaneStore()
    const scope = { tenantId }
    const agent = await platform.createAgent(scope, {
      slug: 'api-risk',
      name: 'Synthetic risk',
      description: 'Fixture'
    })
    const draft = await platform.createVersion(
      scope,
      agent.id,
      createControlledAgentConfig(),
      'admin.synthetic'
    )
    await platform.transitionVersion(scope, draft.id, 'TESTING')
    await platform.transitionVersion(scope, draft.id, 'APPROVED')
    const candidate = await createValidatedControlledReleaseCandidate(
      platform,
      tenantId,
      agent.id,
      draft.id,
      'admin.synthetic'
    )
    await platform.publishVersion(scope, draft.id, candidate.id)
    const app = buildServer({
      platform,
      inboundTenantResolver: () => tenantId,
      agentRuntime: { resolveAgentId: () => agent.id }
    })
    const planner = vi.spyOn(CapabilityGateway.prototype, 'planTools')
    const executor = vi.spyOn(CapabilityGateway.prototype, 'execute')
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/webhooks/channels/web/messages',
        payload: {
          externalMessageId: 'risk-api-synthetic-1',
          senderRef: 'synthetic-risk-sender',
          body: 'Quero consulta, meu cachorro está vomitando sangue.',
          receivedAt: '2026-09-05T10:00:00-03:00'
        }
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().data.runtime).toMatchObject({
        status: 'completed',
        trace: {
          risk: { level: 'high' },
          handoff: { requested: true, priority: 'high' },
          tools: [],
          provider: { externalCall: false }
        }
      })
      expect(planner).not.toHaveBeenCalled()
      expect(executor).not.toHaveBeenCalled()
    } finally {
      planner.mockRestore()
      executor.mockRestore()
      await app.close()
    }
  })

  it('retains an older unresolved symptom when the HTTP context is bounded', async () => {
    const platform = new InMemoryControlPlaneStore()
    const scope = { tenantId }
    const agent = await platform.createAgent(scope, {
      slug: 'api-long-history-risk',
      name: 'Synthetic long history risk',
      description: 'Fixture'
    })
    const draft = await platform.createVersion(
      scope,
      agent.id,
      createControlledAgentConfig(),
      'admin.synthetic'
    )
    await platform.transitionVersion(scope, draft.id, 'TESTING')
    await platform.transitionVersion(scope, draft.id, 'APPROVED')
    const candidate = await createValidatedControlledReleaseCandidate(
      platform,
      tenantId,
      agent.id,
      draft.id,
      'admin.synthetic'
    )
    await platform.publishVersion(scope, draft.id, candidate.id)
    const app = buildServer({
      platform,
      inboundTenantResolver: () => tenantId,
      agentRuntime: { resolveAgentId: () => agent.id }
    })
    try {
      const seed = await app.persistence.conversations.createWithSession({
        tenantId,
        channel: 'web',
        senderRef: 'synthetic-long-history',
        externalMessageId: 'api-long-history-seed',
        body: 'Olá'
      })
      for (const [index, body] of [
        'Meu cachorro está vomitando sangue.',
        ...Array.from(
          { length: 20 },
          () => 'Olá, preciso de informação institucional.'
        )
      ].entries()) {
        await app.persistence.conversations.createWithSession({
          tenantId,
          channel: 'web',
          senderRef: 'synthetic-long-history',
          externalMessageId: `api-long-history-${index}`,
          body,
          conversationId: seed.conversation.id,
          sessionId: seed.session.id
        })
      }
      const response = await app.inject({
        method: 'POST',
        url: '/v1/webhooks/channels/web/messages',
        payload: {
          externalMessageId: 'api-long-history-final',
          senderRef: 'synthetic-long-history',
          body: 'Quero consulta.',
          conversationId: seed.conversation.id,
          sessionId: seed.session.id,
          receivedAt: '2026-09-05T10:00:00-03:00'
        }
      })
      expect(response.statusCode).toBe(200)
      expect(response.json().data.runtime.trace).toMatchObject({
        risk: { level: 'high', reason: 'unresolved_history_symptom_risk' },
        tools: [],
        handoff: { requested: true, priority: 'high' }
      })
    } finally {
      await app.close()
    }
  })
})
