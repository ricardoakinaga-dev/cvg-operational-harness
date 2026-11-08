// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformPanel } from './index.tsx'

const tenantId = 'tenant_00000000-0000-0000-0000-000000000111'
const agentId = 'agent_00000000-0000-0000-0000-000000000111'

const envelope = <T,>(data: T) =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data,
        error: null,
        meta: { correlationId: 'corr_knowledge_catalog_fixture' }
      })
  } as Response)

afterEach(() => vi.restoreAllMocks())

describe('knowledge source catalog Control Center', () => {
  it('loads, creates and approves metadata without editing an agent snapshot', async () => {
    let catalog: Array<Record<string, unknown>> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      if (url === '/v1/admin/agents') {
        return envelope([
          {
            id: agentId,
            slug: 'knowledge-agent',
            name: 'Knowledge Agent',
            description: 'Fixture',
            activeVersionId: null
          }
        ])
      }
      if (url === '/v1/admin/test-lab/runs?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/execution-traces?limit=10') {
        return envelope({ items: [], pageInfo: {} })
      }
      if (url === '/v1/admin/knowledge-sources') {
        if (init?.method === 'POST') {
          const created = {
            id: 'knowledge_source_00000000-0000-0000-0000-000000000111',
            tenantId,
            source: 'controlled://institutional-hours',
            version: 'v1',
            label: 'Horários fictícios',
            description: 'Metadata controlada.',
            status: 'DRAFT',
            createdBy: 'admin.knowledge',
            approvedBy: null
          }
          catalog = [created]
          return envelope(created)
        }
        return envelope(catalog)
      }
      if (url.endsWith('/transition') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { target: string }
        const updated = {
          ...catalog[0],
          status: body.target,
          approvedBy: 'admin.knowledge'
        }
        catalog = [updated]
        return envelope(updated)
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{ operatorId: 'admin.knowledge', role: 'Admin', tenantId }}
      />
    )

    await screen.findByRole('button', {
      name: 'Carregar catálogo de fontes de knowledge'
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Carregar catálogo de fontes de knowledge'
      })
    )
    await screen.findByText('Nenhuma fonte de knowledge catalogada.')
    fireEvent.click(
      screen.getByRole('button', { name: 'Criar metadata da fonte' })
    )
    await waitFor(() =>
      expect(screen.getByText('Horários fictícios')).toBeTruthy()
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Aprovar fonte de knowledge' })
    )
    await screen.findByText(
      'Fonte de knowledge aprovada; catálogo metadata-only.'
    )
    expect(catalog[0]).toMatchObject({ status: 'APPROVED' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Arquivar fonte de knowledge' })
    )
    await screen.findByText(
      'Fonte de knowledge arquivada; catálogo metadata-only.'
    )
    expect(catalog[0]).toMatchObject({ status: 'ARCHIVED' })
  })
})
