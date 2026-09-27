import { expect, test } from '@playwright/test'
import {
  AgentConfigSchema,
  createControlledAgentConfig,
  createValidatedControlledReleaseCandidate,
  InMemoryControlPlaneStore
} from '@cvg/platform'
import { buildServer } from '../../apps/api/src/server.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000091'

async function publishVersion(
  platform: InMemoryControlPlaneStore,
  agentId: Parameters<InMemoryControlPlaneStore['createVersion']>[1],
  config: Parameters<InMemoryControlPlaneStore['createVersion']>[2],
  createdBy: string
) {
  const draft = await platform.createVersion(
    { tenantId },
    agentId,
    config,
    createdBy
  )
  const testing = await platform.transitionVersion(
    { tenantId },
    draft.id,
    'TESTING'
  )
  const approved = await platform.transitionVersion(
    { tenantId },
    testing.id,
    'APPROVED'
  )
  const releaseCandidate = await createValidatedControlledReleaseCandidate(
    platform,
    tenantId,
    agentId,
    approved.id,
    createdBy
  )
  return platform.publishVersion({ tenantId }, approved.id, releaseCandidate.id)
}

test('keeps a browser/API conversation on its first published snapshot', async ({
  page
}) => {
  const platform = new InMemoryControlPlaneStore()
  const agent = await platform.createAgent(
    { tenantId },
    {
      slug: `e2e-session-pin-${Date.now()}`,
      name: 'E2E Session Pin Agent',
      description: 'Controlled browser fixture'
    }
  )
  const firstVersion = await publishVersion(
    platform,
    agent.id,
    createControlledAgentConfig(),
    'e2e.session-pin'
  )
  const app = buildServer({
    platform,
    inboundTenantResolver: () => tenantId,
    webhookVerifier: () => true,
    agentRuntime: { resolveAgentId: () => agent.id }
  })

  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 })
  try {
    await page.goto(`${baseUrl}/health`)
    await expect(page.locator('body')).toContainText('"runtime":"api"')

    const first = await page.request.post(
      `${baseUrl}/v1/webhooks/channels/web/messages`,
      {
        data: {
          externalMessageId: 'e2e-session-pin-1',
          senderRef: 'browser-fixture-sender',
          body: 'Primeira mensagem fictícia',
          receivedAt: '2026-08-25T10:00:00-03:00'
        }
      }
    )
    expect(first.status()).toBe(200)
    const firstData = (await first.json()).data as {
      conversationId: string
      sessionId: string
    }

    const secondVersion = await publishVersion(
      platform,
      agent.id,
      AgentConfigSchema.parse({
        ...firstVersion.config,
        greeting: 'Greeting da segunda versão fictícia.'
      }),
      'e2e.session-pin'
    )
    const continued = await page.request.post(
      `${baseUrl}/v1/webhooks/channels/web/messages`,
      {
        data: {
          externalMessageId: 'e2e-session-pin-2',
          senderRef: 'browser-fixture-sender',
          body: 'Continuação fictícia',
          conversationId: firstData.conversationId,
          sessionId: firstData.sessionId,
          receivedAt: '2026-08-25T10:01:00-03:00'
        }
      }
    )
    expect(continued.status()).toBe(200)

    const traces = await platform.listExecutionTraces({ tenantId })
    expect(secondVersion.id).not.toBe(firstVersion.id)
    expect(traces.map((trace) => trace.versionId)).toEqual([
      firstVersion.id,
      firstVersion.id
    ])
  } finally {
    await app.close()
  }
})
