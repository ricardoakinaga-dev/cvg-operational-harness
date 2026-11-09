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

const tenantId = 'tenant_00000000-0000-0000-0000-000000000221'
const agentId = 'agent_00000000-0000-0000-0000-000000000221'
const versionId = 'agent_version_00000000-0000-0000-0000-000000000221'

const version = {
  id: versionId,
  agentId,
  version: 1,
  status: 'PUBLISHED',
  config: {
    persona: { name: 'Release Agent', role: 'assistant', tone: 'calm' },
    greeting: 'Olá.',
    promptBlocks: [],
    responseTemplates: { unknown: 'Handoff controlado.' },
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 128,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/fake'
    },
    policies: {
      version: 'policy-v1',
      minConfidence: 0.7,
      lowConfidence: 'handoff',
      maxClarifications: 1,
      enabledActions: ['respond'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: [],
    knowledge: [],
    handoff: {
      lowConfidenceDestination: 'controlled-reception',
      destinations: ['controlled-reception'],
      maxClarifications: 1
    }
  }
}

const envelope = <T,>(data: T) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data,
        error: null,
        meta: { correlationId: 'corr_release_candidate_fixture' }
      })
  } as Response)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('release candidate evidence ledger Control Center', () => {
  it('records and validates controlled evidence without mutating the version', async () => {
    let candidates: Array<Record<string, unknown>> = []
    const calls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url === '/v1/admin/agents') {
        return envelope([
          {
            id: agentId,
            slug: 'release-agent',
            name: 'Release Agent',
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
      if (url === `/v1/admin/release-candidates?agentId=${agentId}`) {
        return envelope(candidates)
      }
      if (url === '/v1/admin/release-candidates' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          agentId: string
          versionId: string
          gateResults: unknown[]
        }
        const created = {
          id: 'release_candidate_00000000-0000-0000-0000-000000000221',
          tenantId,
          agentId: body.agentId,
          versionId: body.versionId,
          evidenceDigest: 'a'.repeat(64),
          gateResults: body.gateResults,
          status: 'DRAFT',
          createdBy: 'admin.release',
          validatedBy: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          validatedAt: null
        }
        candidates = [created]
        return envelope(created)
      }
      if (
        url ===
          '/v1/admin/release-candidates/release_candidate_00000000-0000-0000-0000-000000000221/transition' &&
        init?.method === 'POST'
      ) {
        expect(init.headers).toMatchObject({
          'x-operator-id': 'approver.controlled',
          'x-operator-role': 'Admin',
          'x-tenant-id': tenantId
        })
        const body = JSON.parse(String(init.body)) as { target: string }
        const updated = {
          ...candidates[0],
          status: body.target,
          validatedBy: 'approver.controlled'
        }
        candidates = [updated]
        return envelope(updated)
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{ operatorId: 'admin.release', role: 'Admin', tenantId }}
      />
    )

    await screen.findByRole('button', {
      name: 'Carregar ledger de release candidates'
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Carregar ledger de release candidates'
      })
    )
    await screen.findByText('Nenhuma atestação controlada registrada.')
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Registrar evidência do release candidate'
      })
    )
    await screen.findByText(/release_candidate_00000000/)
    expect(candidates[0]).toMatchObject({ status: 'DRAFT' })
    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'Identidade do validador controlado'
      }),
      { target: { value: 'admin.release' } }
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Validar atestação controlada' })
    )
    await screen.findByText(
      'A validação exige uma identidade diferente da criadora.'
    )
    expect(candidates[0]).toMatchObject({ status: 'DRAFT' })
    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'Identidade do validador controlado'
      }),
      { target: { value: 'approver.controlled' } }
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Validar atestação controlada' })
    )
    await screen.findByText(
      'Atestação controlada validada; isto não é publish nem deploy.'
    )
    expect(candidates[0]).toMatchObject({ status: 'VALIDATED' })
    expect(screen.getByText('Validado por: approver.controlled')).toBeTruthy()
    expect(version.status).toBe('PUBLISHED')
    expect(calls.join('\n')).not.toMatch(/https?:\/\/|provider|dispatch/i)
    await waitFor(() =>
      expect(screen.getByText('Digest: ' + 'a'.repeat(64))).toBeTruthy()
    )
  })
})
