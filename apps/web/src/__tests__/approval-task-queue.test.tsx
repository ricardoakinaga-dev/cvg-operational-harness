/**
 * AUD0621 F22/F23 (SPEC0250 §3.6) — the console asks for bounded, filtered
 * pages (pending approvals, active tasks), pages through them and opens the
 * case of an approval through the existing conversation selection.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App.tsx'

const approvalQueue = '/v1/approvals?status=pending&limit=25&offset=0'
const approvalQueuePage2 = '/v1/approvals?status=pending&limit=25&offset=25'
const activeTasks = '/v1/tasks?status=open,in_progress&limit=25&offset=0'

interface PageInfo {
  limit: number
  offset: number
  total: number
  hasNextPage: boolean
}

function envelope(data: unknown, pageInfo?: PageInfo) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data,
        error: null,
        meta: {
          correlationId: 'corr_00000000-0000-4000-8000-000000000630',
          ...(pageInfo ? { pageInfo } : {})
        }
      })
  } as Response)
}

const conversation = (suffix: string) => ({
  id: `conv_${suffix}`,
  channel: 'whatsapp',
  senderRef: `sender-${suffix}`,
  status: 'active',
  correlationId: 'corr_00000000-0000-4000-8000-000000000630',
  openSessionId: `sess_${suffix}`,
  lastMessageBody: `Mensagem ${suffix}`,
  lastMessageAt: '2026-10-20T12:00:00.000Z',
  updatedAt: '2026-10-20T12:00:00.000Z'
})

const approval = (suffix: string) => ({
  id: `approval_${suffix}`,
  sessionId: `sess_${suffix}`,
  proposedAction: 'create_appointment_draft',
  summary: `Resumo ${suffix}`,
  riskLevel: 'medium',
  status: 'pending',
  createdAt: '2026-10-20T12:00:00.000Z'
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('approval queue and task board pages (AUD0621 F22/F23)', () => {
  it('requests bounded filtered pages, pages forward and opens the approval case', async () => {
    const requested: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      requested.push(url)
      if (url === '/v1/conversations?limit=25&offset=0') {
        return envelope({
          items: [conversation('a'), conversation('b')],
          pageInfo: { limit: 25, offset: 0, total: 2, hasNextPage: false }
        })
      }
      if (url.endsWith('/timeline')) return envelope({ messages: [] })
      if (url.startsWith('/v1/audit/sessions/')) {
        return envelope({ events: [] })
      }
      if (url === approvalQueue) {
        return envelope([approval('a'), approval('b')], {
          limit: 25,
          offset: 0,
          total: 27,
          hasNextPage: true
        })
      }
      if (url === approvalQueuePage2) {
        return envelope([approval('c')], {
          limit: 25,
          offset: 25,
          total: 27,
          hasNextPage: false
        })
      }
      if (url === activeTasks) return envelope([])
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(<App />)
    fireEvent.change(screen.getByLabelText('ID do operador'), {
      target: { value: 'approver.aud0621' }
    })
    fireEvent.change(screen.getByLabelText('Papel operacional'), {
      target: { value: 'Approver' }
    })

    const panel = within(
      (await screen.findByRole('heading', { name: 'Aprovacoes' })).closest(
        'section'
      )!
    )
    expect(await panel.findByText('Resumo: Resumo b')).toBeTruthy()
    expect(panel.getByText('27')).toBeTruthy()
    expect(panel.getByText('1–2 de 27')).toBeTruthy()
    expect(requested).toContain(approvalQueue)
    expect(requested).toContain(activeTasks)
    expect(requested.some((url) => url === '/v1/approvals')).toBe(false)
    expect(requested.some((url) => url === '/v1/tasks')).toBe(false)

    fireEvent.click(panel.getByRole('button', { name: 'Abrir caso sess_b' }))
    await waitFor(() =>
      expect(requested).toContain('/v1/conversations/conv_b/timeline')
    )

    fireEvent.click(
      panel.getByRole('button', { name: 'Próxima página de aprovações' })
    )
    expect(await panel.findByText('Resumo: Resumo c')).toBeTruthy()
    expect(requested).toContain(approvalQueuePage2)
    expect(panel.getByText('26–26 de 27')).toBeTruthy()
    expect(
      panel.getByRole('button', { name: 'Próxima página de aprovações' })
    ).toHaveProperty('disabled', true)
    expect(
      panel.getByRole('button', { name: 'Página anterior de aprovações' })
    ).toHaveProperty('disabled', false)
  })
})
