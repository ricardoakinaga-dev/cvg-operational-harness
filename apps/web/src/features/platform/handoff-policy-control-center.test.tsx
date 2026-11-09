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

const tenantId = 'tenant_00000000-0000-4000-8000-000000000082'
const agentId = 'agent_00000000-0000-4000-8000-000000000082'
const versionId = 'agent_version_00000000-0000-4000-8000-000000000082'

const config = {
  persona: { name: 'Luna', role: 'secretary', tone: 'calm' },
  greeting: 'Olá.',
  promptBlocks: [],
  responseTemplates: { unknown: 'Resposta controlada.' },
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
    version: 'policy-handoff-ui-v1',
    minConfidence: 0.65,
    clarifyThreshold: 0.65,
    handoffThreshold: 0.4,
    lowConfidence: 'clarify',
    maxClarifications: 2,
    enabledActions: ['respond'],
    approvalActions: [],
    blockedActions: []
  },
  plugins: [],
  knowledge: [],
  handoff: {
    lowConfidenceDestination: 'controlled-reception',
    destinations: ['controlled-reception'],
    maxClarifications: 2,
    priority: 'medium'
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
        meta: { correlationId: 'corr_00000000-0000-4000-8000-000000000082' }
      })
  } as Response)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('handoff policy Control Center', () => {
  it('edits thresholds, destinations and priority through a new version', async () => {
    let clonedConfig: Record<string, unknown> | null = null
    const version = {
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
            slug: 'handoff-ui-agent',
            name: 'Handoff UI Agent',
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
      if (url === `/v1/admin/agents/${agentId}/versions/${versionId}/clone`) {
        clonedConfig = JSON.parse(String(init?.body)).config as Record<
          string,
          unknown
        >
        return envelope({
          ...version,
          id: 'agent_version_00000000-0000-4000-8000-000000000083',
          version: 2,
          status: 'DRAFT',
          config: clonedConfig
        })
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{ operatorId: 'admin.handoff', role: 'Admin', tenantId }}
      />
    )

    await screen.findByDisplayValue('0.65')
    fireEvent.change(screen.getByLabelText('Threshold de clarificação'), {
      target: { value: '0.7' }
    })
    fireEvent.change(screen.getByLabelText('Threshold de handoff'), {
      target: { value: '0.4' }
    })
    fireEvent.change(screen.getByLabelText('Máximo de clarificações'), {
      target: { value: '3' }
    })
    fireEvent.change(screen.getByLabelText('Destinos de handoff'), {
      target: { value: 'controlled-reception, controlled-supervisor' }
    })
    fireEvent.change(screen.getByLabelText('Prioridade de handoff'), {
      target: { value: 'high' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }))

    await waitFor(() => expect(clonedConfig).not.toBeNull())
    expect(clonedConfig).toMatchObject({
      policies: {
        minConfidence: 0.7,
        clarifyThreshold: 0.7,
        handoffThreshold: 0.4,
        maxClarifications: 3
      },
      handoff: {
        lowConfidenceDestination: 'controlled-reception',
        destinations: ['controlled-reception', 'controlled-supervisor'],
        maxClarifications: 3,
        priority: 'high'
      }
    })
    expect(await screen.findByText('Nova versão v2 criada.')).toBeTruthy()
  })

  it('rejects empty numeric policy fields before cloning', async () => {
    let cloneRequested = false
    const version = {
      id: versionId,
      agentId,
      version: 1,
      status: 'PUBLISHED',
      config
    }
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url === '/v1/admin/agents') {
        return envelope([
          {
            id: agentId,
            slug: 'handoff-ui-agent',
            name: 'Handoff UI Agent',
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
      if (url === `/v1/admin/agents/${agentId}/versions/${versionId}/clone`) {
        cloneRequested = true
        return envelope(version)
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{ operatorId: 'admin.handoff', role: 'Admin', tenantId }}
      />
    )

    await screen.findByDisplayValue('0.65')
    fireEvent.change(screen.getByLabelText('Threshold de clarificação'), {
      target: { value: '' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }))

    expect(
      await screen.findByText(
        'O threshold de clarificação deve estar entre 0 e 1.'
      )
    ).toBeTruthy()
    expect(cloneRequested).toBe(false)
  })
})
