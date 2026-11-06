import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformPanel } from './index.tsx'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000021'

const envelope = <T,>(data: T) =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data,
        error: null,
        meta: { correlationId: 'corr_00000000-0000-4000-8000-000000000001' }
      })
  } as Response)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PlatformPanel', () => {
  it('creates a declarative draft without exposing provider secrets', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        const url = String(input)
        if (url === '/v1/admin/agents' && !init?.method) {
          return envelope([])
        }
        if (url === '/v1/admin/agents' && init?.method === 'POST') {
          return envelope({ id: 'agent_00000000-0000-4000-8000-000000000021' })
        }
        if (url.endsWith('/versions') && init?.method === 'POST') {
          return envelope({
            id: 'agent_version_00000000-0000-4000-8000-000000000021',
            status: 'DRAFT'
          })
        }
        return Promise.reject(new Error(`Unexpected URL ${url}`))
      })

    render(
      <PlatformPanel
        identity={{
          operatorId: 'admin.platform',
          role: 'Admin',
          tenantId
        }}
      />
    )

    expect(await screen.findByText('Nenhum agente configurado.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Slug do agente'), {
      target: { value: 'reception-agent' }
    })
    fireEvent.change(screen.getByLabelText('Nome do agente'), {
      target: { value: 'Reception Agent' }
    })
    fireEvent.change(screen.getByLabelText('Saudação'), {
      target: { value: 'Olá, posso ajudar.' }
    })
    fireEvent.change(screen.getByLabelText('Provider lógico'), {
      target: { value: 'fake' }
    })
    fireEvent.change(screen.getByLabelText('Modelo lógico'), {
      target: { value: 'deterministic-v1' }
    })
    fireEvent.change(screen.getByLabelText('Fonte de knowledge controlada'), {
      target: { value: 'controlled://hours' }
    })
    fireEvent.click(screen.getByLabelText('Scheduling controlado'))
    fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/v1/admin/agents',
        expect.objectContaining({ method: 'POST' })
      )
    )
    const versionCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith('/versions')
    )
    expect(versionCall?.[1]).toBeDefined()
    const body = JSON.parse(String(versionCall?.[1]?.body)) as {
      config: {
        greeting: string
        model: { provider: string; model: string; secretRef?: string }
        knowledge: Array<{ source: string; version: string }>
      }
    }
    expect(body.config).toMatchObject({
      greeting: 'Olá, posso ajudar.',
      model: { provider: 'fake', model: 'deterministic-v1' },
      knowledge: [{ source: 'controlled://hours', version: 'controlled-v1' }],
      plugins: [
        {
          plugin: 'scheduling.controlled',
          allowedTools: ['find_available_slots']
        }
      ]
    })
    expect(body.config.model).not.toHaveProperty('apiKey')
    expect(body.config.model.secretRef).toMatch(/^secret:\/\//)
  })

  it('shows persisted Test Lab and controlled runtime traces in the Trace Viewer', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      if (url === '/v1/admin/agents' && !init?.method) {
        return envelope([
          {
            id: 'agent_00000000-0000-4000-8000-000000000021',
            slug: 'trace-agent',
            name: 'Trace Agent',
            description: 'Fixture',
            activeVersionId:
              'agent_version_00000000-0000-4000-8000-000000000021'
          }
        ])
      }
      if (url.endsWith('/versions') && !init?.method) {
        return envelope([])
      }
      if (url === '/v1/admin/test-lab/runs?limit=10') {
        return envelope({
          items: [],
          pageInfo: { limit: 10, offset: 0, total: 0, hasNextPage: false }
        })
      }
      if (url === '/v1/admin/execution-traces?limit=10') {
        return envelope({
          items: [
            {
              traceId: 'trace_00000000-0000-4000-8000-000000000021',
              agentId: 'agent_00000000-0000-4000-8000-000000000021',
              versionId: 'agent_version_00000000-0000-4000-8000-000000000021',
              executionMode: 'CONTROLLED_RUNTIME',
              intent: { name: 'scheduling', confidence: 0.92 },
              policy: [{ decision: 'allowed', reason: 'action_allowed' }],
              knowledge: { status: 'not_requested' },
              tools: [{ name: 'find_available_slots', status: 'succeeded' }],
              handoff: { requested: false, reason: null, state: 'BOT_ACTIVE' },
              response: { text: 'Contato alice@example.com', mode: 'answer' },
              provider: {
                provider: 'fake',
                model: 'deterministic-v1',
                externalCall: false
              },
              spans: {}
            }
          ],
          pageInfo: { limit: 10, offset: 0, total: 1, hasNextPage: false }
        })
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{ operatorId: 'admin.platform', role: 'Admin', tenantId }}
      />
    )

    expect(await screen.findByLabelText('Trace Viewer')).toBeTruthy()
    expect(await screen.findByText('CONTROLLED_RUNTIME')).toBeTruthy()
    expect(
      await screen.findByText('find_available_slots: succeeded')
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', {
        name: /trace_00000000-0000-4000-8000-000000000021/
      })
    )
    expect(
      await screen.findByText('response: Contato [redacted-email]')
    ).toBeTruthy()
    expect(await screen.findByText('spans: legacy trace')).toBeTruthy()
    expect(screen.queryByText('response: Contato alice@example.com')).toBeNull()
  })

  it('sends the configured knowledge version to Test Lab', async () => {
    const agentId = 'agent_00000000-0000-4000-8000-000000000022'
    const versionId = 'agent_version_00000000-0000-4000-8000-000000000022'
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      calls.push([input, init])
      const url = String(input)
      if (url === '/v1/admin/agents' && !init?.method) {
        return envelope([
          {
            id: agentId,
            slug: 'knowledge-agent',
            name: 'Knowledge Agent',
            description: 'Fixture',
            activeVersionId: versionId
          }
        ])
      }
      if (url === '/v1/admin/test-lab/runs?limit=10') {
        return envelope({
          items: [],
          pageInfo: { limit: 10, offset: 0, total: 0, hasNextPage: false }
        })
      }
      if (url === '/v1/admin/execution-traces?limit=10') {
        return envelope({
          items: [],
          pageInfo: { limit: 10, offset: 0, total: 0, hasNextPage: false }
        })
      }
      if (url === `/v1/admin/agents/${agentId}/versions`) {
        return envelope([
          {
            id: versionId,
            agentId,
            version: 1,
            status: 'PUBLISHED',
            config: {
              ...configForTestLab,
              knowledge: [
                {
                  source: 'controlled://hours',
                  version: 'knowledge-v7',
                  enabled: true,
                  requiresApprovedSource: true
                }
              ]
            }
          }
        ])
      }
      if (url === '/v1/admin/test-lab/runs' && init?.method === 'POST') {
        return envelope({
          traceId: 'trace_00000000-0000-4000-8000-000000000022',
          agentId,
          versionId,
          configVersion: `${versionId}:v1`,
          executionMode: 'TEST_LAB',
          intent: { name: 'institutional_question', confidence: 0.94 },
          policy: [{ decision: 'allowed', reason: 'action_allowed' }],
          knowledge: {
            status: 'answered',
            source: 'controlled://hours',
            version: 'knowledge-v7'
          },
          tools: [],
          handoff: { requested: false, reason: null, state: 'BOT_ACTIVE' },
          response: { text: 'Horário fictício.', mode: 'answer' },
          provider: {
            provider: 'fake',
            model: 'deterministic-v1',
            externalCall: false
          }
        })
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{ operatorId: 'admin.platform', role: 'Admin', tenantId }}
      />
    )

    await screen.findByDisplayValue('knowledge-v7')
    fireEvent.change(screen.getByLabelText('Mensagem fictícia para Test Lab'), {
      target: { value: 'Qual o horário de funcionamento?' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Executar dry-run' }))

    await waitFor(() =>
      expect(
        calls.find(
          ([input, init]) =>
            String(input) === '/v1/admin/test-lab/runs' &&
            init?.method === 'POST'
        )
      ).toBeDefined()
    )
    const request = calls.find(
      ([input, init]) =>
        String(input) === '/v1/admin/test-lab/runs' && init?.method === 'POST'
    )
    const body = JSON.parse(String(request?.[1]?.body)) as Record<
      string,
      unknown
    >
    // SPEC 0317 G3: the console has no authority over approved content.
    expect(body).not.toHaveProperty('approvedKnowledge')
  })
})

const configForTestLab = {
  persona: { name: 'Agent', role: 'assistant', tone: 'calm' },
  greeting: 'Como posso ajudar?',
  promptBlocks: [],
  responseTemplates: { institutional_question: 'Horário fictício.' },
  model: {
    provider: 'fake',
    model: 'deterministic-v1',
    temperature: 0,
    maxTokens: 128,
    timeoutMs: 1000,
    retries: 0,
    secretRef: 'secret://controlled/fake'
  },
  featureFlags: { testLab: true, realChannels: false },
  policies: {
    version: 'policy-v1',
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
}
