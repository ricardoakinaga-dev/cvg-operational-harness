// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformPanel } from './index.tsx'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000091'

const envelope = <T,>(data: T) =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data,
        error: null,
        meta: { correlationId: 'corr_00000000-0000-4000-8000-000000000091' }
      })
  } as Response)

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolveValue) => {
    resolve = resolveValue
  })
  return { promise, resolve }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Control Center multi-agent creation', () => {
  it('creates Agent A and Agent B in one tenant-scoped session with isolated drafts', async () => {
    const agents: Array<{
      id: string
      slug: string
      name: string
      description: string
      activeVersionId: string | null
    }> = []
    const versions = new Map<string, unknown[]>()
    const versionConfigs: Array<{
      agentId: string
      config: Record<string, unknown>
    }> = []
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      calls.push([input, init])
      const url = String(input)

      if (url === '/v1/admin/agents' && !init?.method) {
        return envelope([...agents])
      }
      if (url === '/v1/admin/agents' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          slug: string
          name: string
          description: string
        }
        const number = agents.length + 1
        const agent = {
          id: `agent_00000000-0000-4000-8000-00000000009${number}`,
          slug: body.slug,
          name: body.name,
          description: body.description,
          activeVersionId: null
        }
        agents.push(agent)
        return envelope(agent)
      }

      const versionMatch = url.match(
        /^\/v1\/admin\/agents\/([^/]+)\/versions(?:\/([^/]+))?$/
      )
      const agentId = versionMatch?.[1]
      if (versionMatch && agentId && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          config: Record<string, unknown>
        }
        versionConfigs.push({ agentId, config: body.config })
        const version = {
          id: `agent_version_${agentId.slice(-12)}`,
          agentId,
          version: 1,
          status: 'DRAFT',
          config: body.config
        }
        versions.set(agentId, [version])
        return envelope(version)
      }
      if (versionMatch && agentId && !init?.method) {
        return envelope(versions.get(agentId) ?? [])
      }

      if (url === '/v1/admin/test-lab/runs?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/execution-traces?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }

      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{
          operatorId: 'admin.multi-agent',
          role: 'Admin',
          tenantId
        }}
      />
    )

    expect(await screen.findByText('Nenhum agente configurado.')).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Carregar suites' })
        .getAttribute('disabled')
    ).not.toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Carregar ledger de release candidates' })
        .getAttribute('disabled')
    ).not.toBeNull()

    fireEvent.change(screen.getByLabelText('Slug do agente'), {
      target: { value: 'agent-a' }
    })
    fireEvent.change(screen.getByLabelText('Nome do agente'), {
      target: { value: 'Agent A' }
    })
    fireEvent.change(screen.getByLabelText('Saudação'), {
      target: { value: 'Saudação do Agent A.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }))

    await waitFor(() => expect(agents).toHaveLength(1))
    expect(await screen.findByText('Agent A')).toBeTruthy()
    expect(screen.getByLabelText('Slug do agente')).toHaveProperty(
      'readOnly',
      true
    )

    fireEvent.click(screen.getByRole('button', { name: 'Novo agente' }))

    expect(screen.getByLabelText('Slug do agente')).toHaveProperty(
      'readOnly',
      false
    )
    expect(screen.getByLabelText('Slug do agente')).toHaveProperty('value', '')
    expect(screen.getByLabelText('Nome do agente')).toHaveProperty('value', '')
    expect(screen.getByLabelText('Saudação')).toHaveProperty('value', '')
    expect(screen.getByRole('button', { name: 'Criar rascunho' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Slug do agente'), {
      target: { value: 'agent-b' }
    })
    fireEvent.change(screen.getByLabelText('Nome do agente'), {
      target: { value: 'Agent B' }
    })
    fireEvent.change(screen.getByLabelText('Saudação'), {
      target: { value: 'Saudação do Agent B.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Criar rascunho' }))

    await waitFor(() => expect(agents).toHaveLength(2))
    expect(await screen.findByText('Agent B')).toBeTruthy()
    expect(agents.map((agent) => agent.slug)).toEqual(['agent-a', 'agent-b'])
    expect(versionConfigs.map(({ config }) => config.greeting)).toEqual([
      'Saudação do Agent A.',
      'Saudação do Agent B.'
    ])
    expect(
      calls.filter(
        ([input, init]) =>
          String(input) === '/v1/admin/agents' && init?.method === 'POST'
      )
    ).toHaveLength(2)
    expect(
      calls.filter(
        ([input, init]) =>
          String(input).endsWith('/versions') && init?.method === 'POST'
      )
    ).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Agent Aagent-a' }))
    expect(await screen.findByDisplayValue('Saudação do Agent A.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Agent Bagent-b' }))
    expect(await screen.findByDisplayValue('Saudação do Agent B.')).toBeTruthy()

    const versionListCalls = calls.filter(
      ([input, init]) =>
        String(input).match(/^\/v1\/admin\/agents\/[^/]+\/versions$/) &&
        !init?.method
    )
    expect(versionListCalls.length).toBeGreaterThanOrEqual(2)
    for (const [, init] of versionListCalls) {
      expect(init?.headers).toMatchObject({ 'x-tenant-id': tenantId })
    }
  })

  it('keeps the versioned edit mode when the current agent is selected again', async () => {
    const agentId = 'agent_00000000-0000-4000-8000-000000000093'
    const versionId = 'agent_version_00000000-0000-4000-8000-000000000093'
    const version = {
      id: versionId,
      agentId,
      version: 1,
      status: 'DRAFT',
      config: {
        greeting: 'Saudação persistida.',
        policies: {},
        handoff: {},
        plugins: [],
        knowledge: []
      }
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      if (url === '/v1/admin/agents' && !init?.method) {
        return envelope([
          {
            id: agentId,
            slug: 'agent-a',
            name: 'Agent A',
            description: 'Fixture',
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
        return envelope([version])
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{
          operatorId: 'admin.multi-agent-reselect',
          role: 'Admin',
          tenantId
        }}
      />
    )

    await screen.findByDisplayValue('Saudação persistida.')
    fireEvent.change(screen.getByLabelText('Saudação'), {
      target: { value: 'Edição ainda não salva.' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agent Aagent-a' }))

    expect(
      await screen.findByRole('button', { name: 'Salvar nova versão' })
    ).toBeTruthy()
    expect(screen.getByLabelText('Saudação')).toHaveProperty(
      'value',
      'Edição ainda não salva.'
    )
  })

  it('shows only the selected agent traces in the tenant-scoped Trace Viewer', async () => {
    const agentAId = 'agent_00000000-0000-4000-8000-000000000099'
    const agentBId = 'agent_00000000-0000-4000-8000-000000000100'

    const traceFor = (traceId: string, agentId: string) => ({
      traceId,
      agentId,
      versionId: `version-${agentId}`,
      configVersion: `${agentId}:v1`,
      executionMode: 'TEST_LAB' as const,
      intent: { name: 'unknown', confidence: 0.3 },
      policy: [{ decision: 'clarify', reason: 'controlled' }],
      knowledge: { status: 'not_requested' },
      tools: [],
      handoff: {
        requested: false,
        reason: null,
        state: 'BOT_ACTIVE' as const
      },
      response: { text: '[redacted]', mode: 'clarify' },
      provider: {
        provider: 'fake',
        model: 'deterministic-v1',
        externalCall: false as const
      }
    })

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      if (url === '/v1/admin/agents' && !init?.method) {
        return envelope([
          {
            id: agentAId,
            slug: 'trace-agent-a',
            name: 'Trace Agent A',
            description: 'Fixture A',
            activeVersionId: null
          },
          {
            id: agentBId,
            slug: 'trace-agent-b',
            name: 'Trace Agent B',
            description: 'Fixture B',
            activeVersionId: null
          }
        ])
      }
      if (url === '/v1/admin/test-lab/runs?limit=10') {
        return envelope({
          items: [
            traceFor('trace_id_a_unique', agentAId),
            traceFor('trace_id_b_unique', agentBId)
          ],
          pageInfo: {}
        })
      }
      if (url === '/v1/admin/execution-traces?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url.endsWith('/versions')) return envelope([])
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{
          operatorId: 'admin.trace-viewer',
          role: 'Admin',
          tenantId
        }}
      />
    )

    expect(await screen.findByText('trace_id_a_unique')).toBeTruthy()
    expect(screen.queryByText('trace_id_b_unique')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Novo agente' }))
    expect(screen.queryByText('trace_id_a_unique')).toBeNull()
    expect(screen.queryByText('trace_id_b_unique')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Trace Agent Atrace-agent-a' })
    )
    expect(await screen.findByText('trace_id_a_unique')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Trace Agent Btrace-agent-b' })
    )
    expect(await screen.findByText('trace_id_b_unique')).toBeTruthy()
    expect(screen.queryByText('trace_id_a_unique')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Trace Agent Atrace-agent-a' })
    )
    expect(await screen.findByText('trace_id_a_unique')).toBeTruthy()
    expect(screen.queryByText('trace_id_b_unique')).toBeNull()
  })

  it('drops a late suite response after switching to another agent', async () => {
    const agentAId = 'agent_00000000-0000-4000-8000-000000000094'
    const agentBId = 'agent_00000000-0000-4000-8000-000000000095'
    const versionAId = 'agent_version_00000000-0000-4000-8000-000000000094'
    const versionBId = 'agent_version_00000000-0000-4000-8000-000000000095'
    const suitesResponse = deferred<Response>()
    const version = (agentId: string, versionId: string, greeting: string) => ({
      id: versionId,
      agentId,
      version: 1,
      status: 'DRAFT',
      config: {
        greeting,
        policies: {},
        handoff: {},
        plugins: [],
        knowledge: []
      }
    })
    const staleSuite = {
      id: 'suite_00000000-0000-4000-8000-000000000094',
      tenantId,
      slug: 'agent-a-stale-suite',
      name: 'Stale Agent A Suite',
      description: 'Fixture',
      agentId: agentAId,
      versionId: versionAId,
      version: 1,
      cases: [],
      previousSuiteId: null,
      createdBy: 'admin.multi-agent-race',
      createdAt: '2026-08-26T14:00:00.000Z',
      updatedAt: '2026-08-26T14:00:00.000Z'
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      if (url === '/v1/admin/agents' && !init?.method) {
        return envelope([
          {
            id: agentAId,
            slug: 'agent-a',
            name: 'Agent A',
            description: 'Fixture A',
            activeVersionId: versionAId
          },
          {
            id: agentBId,
            slug: 'agent-b',
            name: 'Agent B',
            description: 'Fixture B',
            activeVersionId: versionBId
          }
        ])
      }
      if (url === '/v1/admin/test-lab/runs?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/execution-traces?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === `/v1/admin/agents/${agentAId}/versions`) {
        return envelope([version(agentAId, versionAId, 'Saudação A.')])
      }
      if (url === `/v1/admin/agents/${agentBId}/versions`) {
        return envelope([version(agentBId, versionBId, 'Saudação B.')])
      }
      if (
        url ===
        `/v1/admin/test-lab/suites?agentId=${encodeURIComponent(agentAId)}`
      ) {
        return suitesResponse.promise
      }
      if (
        url ===
        `/v1/admin/test-lab/suites?agentId=${encodeURIComponent(agentBId)}`
      ) {
        return envelope([])
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{
          operatorId: 'admin.multi-agent-race',
          role: 'Admin',
          tenantId
        }}
      />
    )

    await screen.findByDisplayValue('Saudação A.')
    fireEvent.click(screen.getByRole('button', { name: 'Carregar suites' }))
    fireEvent.click(screen.getByRole('button', { name: 'Agent Bagent-b' }))
    await screen.findByDisplayValue('Saudação B.')

    suitesResponse.resolve(await envelope([staleSuite]))
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(screen.queryByText('Stale Agent A Suite v1')).toBeNull()
  })

  it('drops a pending response when the mounted panel changes tenant identity', async () => {
    const tenantA = tenantId
    const tenantB = 'tenant_00000000-0000-4000-8000-000000000092'
    const agentAId = 'agent_00000000-0000-4000-8000-000000000096'
    const agentBId = 'agent_00000000-0000-4000-8000-000000000097'
    const versionAId = 'agent_version_00000000-0000-4000-8000-000000000096'
    const versionBId = 'agent_version_00000000-0000-4000-8000-000000000097'
    const suitesResponse = deferred<Response>()
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    const version = (agentId: string, versionId: string, greeting: string) => ({
      id: versionId,
      agentId,
      version: 1,
      status: 'DRAFT',
      config: {
        greeting,
        policies: {},
        handoff: {},
        plugins: [],
        knowledge: []
      }
    })
    const staleSuite = {
      id: 'suite_00000000-0000-4000-8000-000000000096',
      tenantId: tenantA,
      slug: 'tenant-a-stale-suite',
      name: 'Tenant A Stale Suite',
      description: 'Fixture',
      agentId: agentAId,
      versionId: versionAId,
      version: 1,
      cases: [],
      previousSuiteId: null,
      createdBy: 'admin.tenant-switch',
      createdAt: '2026-08-26T14:00:00.000Z',
      updatedAt: '2026-08-26T14:00:00.000Z'
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      calls.push([input, init])
      const url = String(input)
      const requestTenant = (
        init?.headers as Record<string, string> | undefined
      )?.['x-tenant-id']
      if (url === '/v1/admin/agents' && !init?.method) {
        return envelope(
          requestTenant === tenantB
            ? [
                {
                  id: agentBId,
                  slug: 'tenant-b-agent',
                  name: 'Tenant B Agent',
                  description: 'Fixture B',
                  activeVersionId: versionBId
                }
              ]
            : [
                {
                  id: agentAId,
                  slug: 'tenant-a-agent',
                  name: 'Tenant A Agent',
                  description: 'Fixture A',
                  activeVersionId: versionAId
                }
              ]
        )
      }
      if (url === '/v1/admin/test-lab/runs?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/execution-traces?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === `/v1/admin/agents/${agentAId}/versions`) {
        return envelope(
          requestTenant === tenantA
            ? [version(agentAId, versionAId, 'Saudação tenant A.')]
            : []
        )
      }
      if (url === `/v1/admin/agents/${agentBId}/versions`) {
        return envelope(
          requestTenant === tenantB
            ? [version(agentBId, versionBId, 'Saudação tenant B.')]
            : []
        )
      }
      if (
        url ===
        `/v1/admin/test-lab/suites?agentId=${encodeURIComponent(agentAId)}`
      ) {
        return suitesResponse.promise
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    const view = render(
      <PlatformPanel
        identity={{
          operatorId: 'admin.tenant-switch',
          role: 'Admin',
          tenantId: tenantA
        }}
      />
    )

    await screen.findByDisplayValue('Saudação tenant A.')
    fireEvent.click(screen.getByRole('button', { name: 'Carregar suites' }))
    view.rerender(
      <PlatformPanel
        identity={{
          operatorId: 'admin.tenant-switch',
          role: 'Admin',
          tenantId: tenantB
        }}
      />
    )
    await screen.findByDisplayValue('Saudação tenant B.')

    suitesResponse.resolve(await envelope([staleSuite]))
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(screen.queryByText('Tenant A Stale Suite v1')).toBeNull()
    expect(
      calls.some(
        ([input, init]) =>
          String(input) === '/v1/admin/agents' &&
          (init?.headers as Record<string, string>)?.['x-tenant-id'] === tenantB
      )
    ).toBe(true)
  })

  it('preserves tenant-wide plugin and knowledge catalogs in new-agent mode', async () => {
    const agentId = 'agent_00000000-0000-4000-8000-000000000098'
    const versionId = 'agent_version_00000000-0000-4000-8000-000000000098'
    const version = {
      id: versionId,
      agentId,
      version: 1,
      status: 'DRAFT',
      config: {
        greeting: 'Saudação catalogada.',
        policies: {},
        handoff: {},
        plugins: [],
        knowledge: []
      }
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      if (url === '/v1/admin/agents' && !init?.method) {
        return envelope([
          {
            id: agentId,
            slug: 'catalog-agent',
            name: 'Catalog Agent',
            description: 'Fixture',
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
        return envelope([version])
      }
      if (url === '/v1/admin/plugins/catalog') return envelope([])
      if (url === '/v1/admin/knowledge-sources') return envelope([])
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{
          operatorId: 'admin.catalog-preservation',
          role: 'Admin',
          tenantId
        }}
      />
    )

    await screen.findByDisplayValue('Saudação catalogada.')
    fireEvent.click(
      screen.getByRole('button', { name: 'Carregar catálogo de plugins' })
    )
    expect(await screen.findByText('Nenhum plugin catalogado.')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Carregar catálogo de fontes de knowledge'
      })
    )
    expect(
      await screen.findByText('Nenhuma fonte de knowledge catalogada.')
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Novo agente' }))
    expect(await screen.findByText('Nenhum plugin catalogado.')).toBeTruthy()
    expect(
      await screen.findByText('Nenhuma fonte de knowledge catalogada.')
    ).toBeTruthy()
  })
})
