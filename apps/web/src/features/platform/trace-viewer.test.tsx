import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlatformTraceView } from '../../api/client.ts'
import { TraceViewer } from './TraceViewer.tsx'

const trace: PlatformTraceView = {
  traceId: 'trace_controlled_015',
  agentId: 'agent_controlled_015',
  versionId: 'agent_version_controlled_015',
  configVersion: 'v1',
  executionMode: 'TEST_LAB',
  intent: { name: 'controlled_lookup', confidence: 0.9 },
  policy: [{ decision: 'ALLOW', reason: 'controlled_fixture' }],
  knowledge: { status: 'NOT_USED' },
  tools: [{ name: 'fake.echo', status: 'completed' }],
  handoff: {
    requested: false,
    reason: null,
    state: 'BOT_ACTIVE'
  },
  response: { text: 'Resposta fictícia.', mode: 'ANSWER' },
  provider: { provider: 'controlled', model: 'fixture', externalCall: false }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('TraceViewer', () => {
  it('renders a safe empty state', () => {
    render(<TraceViewer items={[]} onSelect={vi.fn()} />)

    expect(screen.getByRole('region', { name: 'Trace Viewer' })).toBeTruthy()
    expect(screen.getByText('Nenhuma trace persistida.')).toBeTruthy()
  })

  it('redacts through traceText and reports selection', () => {
    const onSelect = vi.fn()
    render(<TraceViewer items={[trace]} onSelect={onSelect} />)

    expect(screen.getByText('TEST_LAB')).toBeTruthy()
    expect(screen.getByText('fake.echo: completed')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: /trace_controlled_015/ })
    )
    expect(onSelect).toHaveBeenCalledWith(trace)
  })
})
