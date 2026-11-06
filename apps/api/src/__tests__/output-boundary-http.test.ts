import { AgentConfigSchema, CONTROLLED_SAFE_OUTPUTS } from '@cvg/platform'
import { afterEach, describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'

// SPEC 0317 G2 over HTTP: synthetic fixtures only.
const tenantId = 'tenant_00000000-0000-4000-8000-000000000318'
const headers = {
  'x-operator-id': 'admin.output-boundary',
  'x-operator-role': 'Admin',
  'x-tenant-id': tenantId
}

function config(template: string) {
  return AgentConfigSchema.parse({
    persona: { name: 'Boundary', role: 'assistant', tone: 'calm' },
    greeting: 'Resposta fictícia.',
    promptBlocks: [
      {
        id: 'system',
        kind: 'system',
        content: 'Use apenas dados fictícios.',
        priority: 1,
        enabled: true
      }
    ],
    responseTemplates: { scheduling: template },
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 128,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/output-boundary-http'
    },
    policies: {
      version: 'output-boundary-http-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: ['respond', 'scheduling'],
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

describe('output boundary over HTTP', () => {
  let app: ReturnType<typeof buildServer> | undefined
  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  async function publishFixture(template: string, slug: string) {
    app = buildServer()
    const agent = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers,
      payload: { slug, name: 'Boundary', description: 'Fixture fictícia' }
    })
    const agentId = (agent.json() as { data: { id: string } }).data.id
    const version = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agentId}/versions`,
      headers,
      payload: { config: config(template) }
    })
    const versionId = (version.json() as { data: { id: string } }).data.id
    return { app, agentId, versionId }
  }

  it.each([
    'tome 2 comprimidos de amoxicilina a cada 8 horas',
    'pague o boleto por PIX',
    'seu horário foi confirmado'
  ])('keeps the text out of payload and stored trace: %s', async (phrase) => {
    const fixture = await publishFixture(phrase, 'boundary-http-a')
    const run = await fixture.app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/runs',
      headers,
      payload: {
        agentId: fixture.agentId,
        versionId: fixture.versionId,
        message: 'Tem agenda amanhã?',
        history: []
      }
    })
    expect(run.statusCode).toBe(200)
    expect(run.body).not.toContain(phrase)
    expect(run.json()).toMatchObject({
      data: {
        response: { mode: 'handoff', text: CONTROLLED_SAFE_OUTPUTS.handoff },
        outputPolicy: {
          decision: 'rewritten',
          reason: 'unsafe_output_rejected',
          mode: 'handoff'
        },
        handoff: { requested: true, reason: 'unsafe_output_rejected' }
      }
    })
    const stored = await fixture.app.inject({
      method: 'GET',
      url: '/v1/admin/test-lab/runs?limit=10',
      headers
    })
    expect(stored.statusCode).toBe(200)
    expect(stored.body).toContain('unsafe_output_rejected')
    expect(stored.body).not.toContain(phrase)
  })

  it.each([
    [{ riskLevel: 'low' }],
    [{ risk: { level: 'low', reason: 'forged' } }],
    [{ evidence: { operation: 'x', result: 'succeeded' } }]
  ])('refuses a client-chosen label in the body: %j', async (forged) => {
    const fixture = await publishFixture('Texto fictício.', 'boundary-http-b')
    const run = await fixture.app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/runs',
      headers,
      payload: {
        agentId: fixture.agentId,
        versionId: fixture.versionId,
        message: 'Meu gato está vomitando sangue',
        history: [],
        ...forged
      }
    })
    expect(run.statusCode).toBe(400)
    expect(run.json()).toMatchObject({ error: { code: 'validation_failed' } })
  })
})
