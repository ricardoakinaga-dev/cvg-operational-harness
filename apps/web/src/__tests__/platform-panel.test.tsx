// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformPanel } from '../features/platform/index.tsx'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000051'
const agentId = 'agent_00000000-0000-4000-8000-000000000051'
const versionId = 'agent_version_00000000-0000-4000-8000-000000000051'

const config = {
  persona: { name: 'Agente', role: 'assistant', tone: 'calm' },
  greeting: 'Saudação original.',
  promptBlocks: [],
  responseTemplates: { unknown: 'Resposta fictícia.' },
  model: {
    provider: 'fake',
    model: 'deterministic-v1',
    temperature: 0,
    maxTokens: 128,
    timeoutMs: 1000,
    retries: 0,
    secretRef: 'secret://controlled/fake'
  },
  featureFlags: { testLab: true, realChannels: true },
  policies: {
    version: 'policy-ui-v1',
    minConfidence: 0.7,
    lowConfidence: 'clarify',
    maxClarifications: 2,
    enabledActions: ['respond'],
    approvalActions: [],
    blockedActions: []
  },
  plugins: [
    {
      plugin: 'fake.echo',
      enabled: false,
      allowedTools: ['echo'],
      config: { mode: 'controlled' }
    }
  ],
  knowledge: [],
  handoff: {
    lowConfidenceDestination: 'controlled-reception',
    destinations: ['controlled-reception'],
    maxClarifications: 2
  }
}

const envelope = <T,>(data: T) =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data,
        error: null,
        meta: { correlationId: 'corr_00000000-0000-4000-8000-000000000051' }
      })
  } as Response)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('platform control center', () => {
  it('lists and transitions metadata-only plugin catalog entries with tenant scope', async () => {
    const pluginId = 'plugin_catalog_00000000-0000-4000-8000-000000000061'
    const draft = {
      tenantId,
      id: pluginId,
      manifest: {
        name: 'fake.echo',
        version: '1.0.0',
        capabilities: ['controlled.echo'],
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
      status: 'DRAFT',
      createdBy: 'admin.ui',
      approvedBy: null,
      createdAt: '2026-08-24T20:00:00.000Z',
      updatedAt: '2026-08-24T20:00:00.000Z'
    }
    const approved = { ...draft, status: 'APPROVED', approvedBy: 'admin.ui' }
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      calls.push([input, init])
      const url = String(input)
      if (url === '/v1/admin/agents') return envelope([])
      if (url === '/v1/admin/test-lab/runs?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/execution-traces?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/plugins/catalog' && !init?.method) {
        return envelope([])
      }
      if (url === '/v1/admin/plugins/catalog' && init?.method === 'POST') {
        return envelope(draft)
      }
      if (
        url === `/v1/admin/plugins/catalog/${pluginId}/transition` &&
        init?.method === 'POST'
      ) {
        return envelope(approved)
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{ operatorId: 'admin.ui', role: 'Admin', tenantId }}
      />
    )

    await screen.findByText('Nenhum agente configurado.')
    fireEvent.click(
      screen.getByRole('button', { name: 'Carregar catálogo de plugins' })
    )
    expect(await screen.findByText('Nenhum plugin catalogado.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Plugin lógico'), {
      target: { value: 'fake.echo' }
    })
    fireEvent.change(
      screen.getByLabelText('Versão pinned do plugin (opcional)'),
      {
        target: { value: '1.0.0' }
      }
    )
    fireEvent.change(screen.getByLabelText('Tools do plugin'), {
      target: { value: 'echo' }
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Criar metadata do plugin' })
    )

    expect(await screen.findByText('fake.echo@1.0.0')).toBeTruthy()
    expect(
      await screen.findByText(
        'APPROVED: metadata revisada; execução continua bloqueada.'
      )
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Aprovar metadata do plugin' })
    )
    expect(
      await screen.findByText(
        'Metadata do plugin aprovada; execução continua bloqueada.'
      )
    ).toBeTruthy()

    const createCall = calls.find(
      ([input, init]) =>
        String(input) === '/v1/admin/plugins/catalog' && init?.method === 'POST'
    )
    expect(createCall?.[1]?.headers).toMatchObject({
      'x-operator-id': 'admin.ui',
      'x-operator-role': 'Admin',
      'x-tenant-id': tenantId
    })
    const createBody = JSON.parse(String(createCall?.[1]?.body)) as Record<
      string,
      unknown
    >
    expect(createBody).toHaveProperty('manifest')
    expect(JSON.stringify(createBody)).not.toMatch(
      /apiKey|secret|handler|sourceCode|executable/i
    )
    const transitionCall = calls.find(([input]) =>
      String(input).endsWith(`/plugins/catalog/${pluginId}/transition`)
    )
    expect(JSON.parse(String(transitionCall?.[1]?.body))).toEqual({
      target: 'APPROVED',
      expectedStatus: 'DRAFT'
    })
  })

  it('surfaces a stale plugin catalog conflict without weakening the metadata boundary', async () => {
    const pluginId = 'plugin_catalog_00000000-0000-4000-8000-000000000062'
    const draft = {
      tenantId,
      id: pluginId,
      manifest: {
        name: 'fake.echo',
        version: '1.0.0',
        capabilities: ['controlled.echo'],
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
      status: 'DRAFT',
      createdBy: 'admin.ui',
      approvedBy: null,
      createdAt: '2026-08-24T20:00:00.000Z',
      updatedAt: '2026-08-24T20:00:00.000Z'
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      if (url === '/v1/admin/agents') return envelope([])
      if (url === '/v1/admin/test-lab/runs?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/execution-traces?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/plugins/catalog' && !init?.method) {
        return envelope([draft])
      }
      if (
        url === `/v1/admin/plugins/catalog/${pluginId}/transition` &&
        init?.method === 'POST'
      ) {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () =>
            Promise.resolve({
              success: false,
              data: null,
              error: {
                code: 'conflict',
                message: 'Plugin catalog entry changed'
              },
              meta: { correlationId: 'corr_plugin_conflict' }
            })
        } as Response)
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{ operatorId: 'admin.ui', role: 'Admin', tenantId }}
      />
    )

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Carregar catálogo de plugins'
      })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Aprovar metadata do plugin' })
    )
    expect(
      await screen.findByText(
        'O metadata do plugin mudou em outro operador. Recarregue o catálogo antes de tentar novamente.'
      )
    ).toBeTruthy()
  })

  it('rejects invalid plugin metadata locally before sending it to the API', async () => {
    const created = {
      tenantId,
      id: 'plugin_catalog_00000000-0000-4000-8000-000000000063',
      manifest: {
        name: 'fake.valid',
        version: '1.0.0',
        capabilities: ['controlled:fake.valid:metadata.read'],
        permissions: ['plugin:fake.valid:metadata.read'],
        tools: [
          {
            name: 'metadata.read',
            permission: 'plugin:fake.valid:metadata.read',
            risk: 'low',
            requiresApproval: false
          }
        ],
        hooks: [],
        dependencies: [],
        configSchemaVersion: '1'
      },
      status: 'DRAFT',
      createdBy: 'admin.ui',
      approvedBy: null,
      createdAt: '2026-08-24T20:00:00.000Z',
      updatedAt: '2026-08-24T20:00:00.000Z'
    }
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      calls.push([input, init])
      const url = String(input)
      if (url === '/v1/admin/agents') return envelope([])
      if (url === '/v1/admin/test-lab/runs?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/execution-traces?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/plugins/catalog' && init?.method === 'POST') {
        return envelope(created)
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{ operatorId: 'admin.ui', role: 'Admin', tenantId }}
      />
    )

    await screen.findByText('Nenhum agente configurado.')
    const pluginName = screen.getByRole('textbox', { name: 'Plugin lógico' })
    const pluginVersion = screen.getByLabelText(
      'Versão pinned do plugin (opcional)'
    )
    const pluginTools = screen.getByLabelText('Tools do plugin')
    const createButton = screen.getByRole('button', {
      name: 'Criar metadata do plugin'
    })

    fireEvent.click(createButton)
    expect(
      await screen.findByText(/Informe um nome de plugin válido/)
    ).toBeTruthy()

    fireEvent.change(pluginName, { target: { value: 'fake.valid' } })
    fireEvent.change(pluginVersion, { target: { value: 'x'.repeat(81) } })
    fireEvent.click(createButton)
    expect(
      await screen.findByText('A versão da metadata do plugin é muito longa.')
    ).toBeTruthy()

    fireEvent.change(pluginVersion, { target: { value: '1.0.0' } })
    fireEvent.change(pluginTools, { target: { value: 'bad tool' } })
    fireEvent.click(createButton)
    expect(
      await screen.findByText(/Cada tool do catálogo deve usar/)
    ).toBeTruthy()

    fireEvent.change(pluginVersion, { target: { value: '' } })
    fireEvent.change(pluginTools, { target: { value: 'metadata.read' } })
    fireEvent.click(createButton)
    expect(await screen.findByText('fake.valid@1.0.0')).toBeTruthy()
    const createCall = calls.find(
      ([input, init]) =>
        String(input) === '/v1/admin/plugins/catalog' && init?.method === 'POST'
    )
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      manifest: { name: 'fake.valid', version: '1.0.0' }
    })
  })

  it('loads a version into the editor and saves edits as a new draft', async () => {
    let clonedConfig: Record<string, unknown> | null = null
    const originalVersion = {
      id: versionId,
      agentId,
      version: 1,
      status: 'PUBLISHED',
      config
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      if (url === '/v1/admin/agents') {
        return envelope([
          {
            id: agentId,
            slug: 'ui-agent',
            name: 'Agente UI',
            description: 'Fixture UI',
            activeVersionId: versionId
          }
        ])
      }
      if (url === '/v1/admin/test-lab/runs?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/execution-traces?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === `/v1/admin/agents/${agentId}/versions`) {
        return envelope([originalVersion])
      }
      if (url === `/v1/admin/agents/${agentId}/versions/${versionId}/clone`) {
        clonedConfig = JSON.parse(String(init?.body)).config as Record<
          string,
          unknown
        >
        return envelope({
          ...originalVersion,
          id: 'agent_version_00000000-0000-4000-8000-000000000052',
          version: 2,
          status: 'DRAFT',
          config: clonedConfig
        })
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{
          operatorId: 'admin.ui',
          role: 'Admin',
          tenantId
        }}
      />
    )

    const greeting = await screen.findByDisplayValue('Saudação original.')
    fireEvent.change(greeting, { target: { value: 'Saudação editada.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }))

    await waitFor(() => {
      expect(clonedConfig).toMatchObject({ greeting: 'Saudação editada.' })
    })
    const capturedConfig = clonedConfig as unknown as Record<string, unknown>
    expect(capturedConfig.plugins).toEqual([
      expect.objectContaining({
        plugin: 'fake.echo',
        enabled: false,
        config: { mode: 'controlled' }
      })
    ])
    expect(capturedConfig.featureFlags).toMatchObject({ realChannels: false })
    expect(await screen.findByText('Nova versão v2 criada.')).toBeTruthy()
  })

  it('shows the snapshot identity in the redacted Trace Viewer', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url === '/v1/admin/agents') {
        return envelope([
          {
            id: agentId,
            slug: 'ui-trace-agent',
            name: 'Agente de trace',
            description: 'Fixture de trace',
            activeVersionId: versionId
          }
        ])
      }
      if (url === `/v1/admin/agents/${agentId}/versions`) {
        return envelope([])
      }
      if (url === '/v1/admin/test-lab/runs?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/execution-traces?limit=10') {
        return envelope({
          items: [
            {
              traceId: 'trace_00000000-0000-4000-8000-000000000051',
              agentId,
              versionId,
              configVersion: `${versionId}:v7`,
              executionMode: 'TEST_LAB',
              intent: { name: 'unknown', confidence: 0.3 },
              policy: [{ decision: 'handoff', reason: 'controlled' }],
              knowledge: { status: 'not_requested' },
              tools: [],
              handoff: {
                requested: true,
                reason: 'controlled',
                state: 'HANDOFF_REQUESTED'
              },
              response: { text: '[redacted]', mode: 'handoff' },
              provider: {
                provider: 'fake',
                model: 'deterministic-v1',
                externalCall: false
              }
            }
          ],
          pageInfo: {}
        })
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{ operatorId: 'admin.ui', role: 'Admin', tenantId }}
      />
    )

    expect(await screen.findByText(`${versionId}:v7`)).toBeTruthy()
  })

  it('surfaces a stale version conflict without treating it as a policy failure', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      calls.push([input, init])
      const url = String(input)
      if (url === '/v1/admin/agents') {
        return envelope([
          {
            id: agentId,
            slug: 'ui-agent',
            name: 'Agente UI',
            description: 'Fixture UI',
            activeVersionId: versionId
          }
        ])
      }
      if (url === `/v1/admin/agents/${agentId}/versions`) {
        return envelope([
          {
            id: versionId,
            agentId,
            version: 1,
            status: 'DRAFT',
            config
          }
        ])
      }
      if (url === '/v1/admin/test-lab/runs?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/execution-traces?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (
        url ===
          `/v1/admin/agents/${agentId}/versions/${versionId}/transition` &&
        init?.method === 'POST'
      ) {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () =>
            Promise.resolve({
              success: false,
              data: null,
              error: {
                code: 'conflict',
                message: 'Agent version changed'
              },
              meta: { correlationId: 'corr_conflict' }
            })
        } as Response)
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{
          operatorId: 'admin.ui',
          role: 'Admin',
          tenantId
        }}
      />
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Enviar para teste' })
    )

    expect(
      await screen.findByText(
        'A versão mudou em outro operador. Recarregue o agente antes de tentar novamente.'
      )
    ).toBeTruthy()
    const transitionCall = calls.find(([input]) =>
      String(input).endsWith(`/versions/${versionId}/transition`)
    )
    expect(JSON.parse(String(transitionCall?.[1]?.body))).toEqual({
      target: 'TESTING',
      expectedStatus: 'DRAFT'
    })
  })
})
