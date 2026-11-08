// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformPanel } from './index.tsx'
import { CONTROLLED_KERNEL_PROMPT_BLOCK } from './prompt-profile.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000081'
const agentId = 'agent_00000000-0000-4000-8000-000000000081'
const versionId = 'agent_version_00000000-0000-4000-8000-000000000081'

const config = {
  persona: { name: 'Agente', role: 'assistant', tone: 'calm' },
  greeting: 'Como posso ajudar?',
  promptBlocks: [
    CONTROLLED_KERNEL_PROMPT_BLOCK,
    {
      id: 'behavior',
      kind: 'instruction',
      content: 'Seja objetivo.',
      priority: 20,
      enabled: true
    }
  ],
  responseTemplates: { handoff: 'Vou encaminhar.' },
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
    enabledActions: ['respond'],
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

const envelope = <T,>(data: T) =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data,
        error: null,
        meta: { correlationId: 'corr_00000000-0000-4000-8000-000000000081' }
      })
  } as Response)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('prompt profile Control Center', () => {
  it('clones edited blocks/templates and preserves the kernel block', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    const createdVersion = {
      id: 'agent_version_00000000-0000-4000-8000-000000000082',
      agentId,
      version: 2,
      status: 'DRAFT',
      config: {
        ...config,
        promptBlocks: [
          CONTROLLED_KERNEL_PROMPT_BLOCK,
          {
            id: 'behavior',
            kind: 'instruction',
            content: 'Seja acolhedor e objetivo.',
            priority: 20,
            enabled: true
          }
        ],
        responseTemplates: {
          handoff: 'Vou encaminhar para a equipe controlada.',
          low_confidence: 'Pode esclarecer?'
        }
      }
    }
    let cloned = false

    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      calls.push([input, init])
      const url = String(input)
      if (url === '/v1/admin/agents' && !init?.method) {
        return envelope([
          {
            id: agentId,
            slug: 'profile-agent',
            name: 'Profile Agent',
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
      if (url === `/v1/admin/agents/${agentId}/versions` && !init?.method) {
        return envelope([
          cloned
            ? createdVersion
            : {
                id: versionId,
                agentId,
                version: 1,
                status: 'DRAFT',
                config
              }
        ])
      }
      if (
        url === `/v1/admin/agents/${agentId}/versions/${versionId}/clone` &&
        init?.method === 'POST'
      ) {
        cloned = true
        return envelope(createdVersion)
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(
      <PlatformPanel
        identity={{ operatorId: 'admin.profile', role: 'Admin', tenantId }}
      />
    )

    await screen.findByDisplayValue('Como posso ajudar?')
    fireEvent.change(screen.getByLabelText('Prompt blocks JSON'), {
      target: {
        value: JSON.stringify([
          CONTROLLED_KERNEL_PROMPT_BLOCK,
          {
            id: 'behavior',
            kind: 'instruction',
            content: 'Seja acolhedor e objetivo.',
            priority: 20,
            enabled: true
          }
        ])
      }
    })
    fireEvent.change(screen.getByLabelText('Response templates JSON'), {
      target: {
        value: JSON.stringify({
          handoff: 'Vou encaminhar para a equipe controlada.',
          low_confidence: 'Pode esclarecer?'
        })
      }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova versão' }))

    await waitFor(() =>
      expect(
        calls.find(
          ([input, init]) =>
            String(input).endsWith(`/versions/${versionId}/clone`) &&
            init?.method === 'POST'
        )
      ).toBeDefined()
    )
    const cloneCall = calls.find(
      ([input, init]) =>
        String(input).endsWith(`/versions/${versionId}/clone`) &&
        init?.method === 'POST'
    )
    const body = JSON.parse(String(cloneCall?.[1]?.body)) as {
      config: typeof createdVersion.config
    }
    expect(body.config.promptBlocks).toEqual(createdVersion.config.promptBlocks)
    expect(body.config.responseTemplates).toEqual(
      createdVersion.config.responseTemplates
    )
    expect(await screen.findByText('Nova versão v2 criada.')).toBeTruthy()
  })
})
