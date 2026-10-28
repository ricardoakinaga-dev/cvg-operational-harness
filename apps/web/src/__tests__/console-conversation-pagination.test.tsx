/**
 * AUD0625 F17 (SPEC 0269) — the console reaches conversations past the first
 * page: "Carregar mais conversas" appends the next page and "Abrir caso"
 * finds a case that sits beyond the loaded pages.
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
          correlationId: 'corr_00000000-0000-4000-8000-000000000625',
          ...(pageInfo ? { pageInfo } : {})
        }
      })
  } as Response)
}

const TOTAL = 60
const conversation = (n: number) => ({
  id: `conv_${n}`,
  channel: 'whatsapp',
  senderRef: `sender-${n}`,
  status: 'active',
  correlationId: 'corr_00000000-0000-4000-8000-000000000625',
  openSessionId: `sess_${n}`,
  lastMessageBody: `Mensagem ${n}`,
  lastMessageAt: '2026-10-28T12:00:00.000Z',
  updatedAt: '2026-10-28T12:00:00.000Z'
})

function conversationPage(offset: number, limit: number) {
  const end = Math.min(offset + limit, TOTAL)
  const items = Array.from({ length: end - offset }, (_, i) =>
    conversation(offset + i)
  )
  return envelope({
    items,
    pageInfo: { limit, offset, total: TOTAL, hasNextPage: end < TOTAL }
  })
}

const approvalForFarCase = {
  id: 'approval_far',
  sessionId: 'sess_55',
  proposedAction: 'create_appointment_draft',
  summary: 'Caso distante',
  riskLevel: 'medium',
  status: 'pending',
  createdAt: '2026-10-28T12:00:00.000Z'
}

function mockApi(requested: string[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    requested.push(url)
    const match = /^\/v1\/conversations\?limit=(\d+)&offset=(\d+)$/.exec(url)
    if (match) return conversationPage(Number(match[2]), Number(match[1]))
    if (url.endsWith('/timeline')) return envelope({ messages: [] })
    if (url.startsWith('/v1/audit/sessions/')) return envelope({ events: [] })
    if (url.startsWith('/v1/approvals?')) {
      return envelope([approvalForFarCase], {
        limit: 25,
        offset: 0,
        total: 1,
        hasNextPage: false
      })
    }
    if (url.startsWith('/v1/tasks?')) return envelope([])
    return Promise.reject(new Error(`Unexpected URL ${url}`))
  })
}

async function signIn() {
  render(<App />)
  fireEvent.change(screen.getByLabelText('ID do operador'), {
    target: { value: 'approver.aud0625' }
  })
  fireEvent.change(screen.getByLabelText('Papel operacional'), {
    target: { value: 'Approver' }
  })
  return within(
    (await screen.findByRole('heading', { name: 'Conversas' })).closest(
      'section'
    )!
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('console conversation pagination (AUD0625 F17)', () => {
  it('appends the next page of conversations on demand', async () => {
    const requested: string[] = []
    mockApi(requested)
    const panel = await signIn()

    expect(await panel.findByText('sender-24')).toBeTruthy()
    expect(panel.queryByText('sender-25')).toBeNull()
    expect(panel.getByText('25 de 60')).toBeTruthy()

    fireEvent.click(
      panel.getByRole('button', { name: 'Carregar mais conversas' })
    )
    expect(await panel.findByText('sender-25')).toBeTruthy()
    expect(panel.getByText('sender-0')).toBeTruthy()
    expect(requested).toContain('/v1/conversations?limit=25&offset=25')
    expect(panel.getByText('50 de 60')).toBeTruthy()

    fireEvent.click(
      panel.getByRole('button', { name: 'Carregar mais conversas' })
    )
    expect(await panel.findByText('sender-59')).toBeTruthy()
    expect(
      panel.queryByRole('button', { name: 'Carregar mais conversas' })
    ).toBeNull()
  })

  it('opens an approval case that is beyond the first page', async () => {
    const requested: string[] = []
    mockApi(requested)
    const panel = await signIn()
    expect(await panel.findByText('sender-24')).toBeTruthy()
    expect(panel.queryByText('sender-55')).toBeNull()

    const approvals = within(
      (await screen.findByRole('heading', { name: 'Aprovacoes' })).closest(
        'section'
      )!
    )
    fireEvent.click(
      await approvals.findByRole('button', { name: 'Abrir caso sess_55' })
    )

    await waitFor(() =>
      expect(requested).toContain('/v1/conversations/conv_55/timeline')
    )
    expect(requested).toContain('/v1/conversations?limit=25&offset=50')
    expect(await panel.findByText('sender-55')).toBeTruthy()
  })

  it('does not offer extra paging when everything fits in one page', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.startsWith('/v1/conversations?')) {
        return envelope({
          items: [conversation(0)],
          pageInfo: { limit: 25, offset: 0, total: 1, hasNextPage: false }
        })
      }
      if (url.endsWith('/timeline')) return envelope({ messages: [] })
      if (url.startsWith('/v1/audit/sessions/')) return envelope({ events: [] })
      if (url.startsWith('/v1/approvals?') || url.startsWith('/v1/tasks?')) {
        return envelope([])
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })
    const panel = await signIn()
    expect(await panel.findByText('sender-0')).toBeTruthy()
    expect(
      panel.queryByRole('button', { name: 'Carregar mais conversas' })
    ).toBeNull()
  })
})
