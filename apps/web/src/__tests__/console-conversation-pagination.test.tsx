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

let total = 60
/** Optional per-URL overrides, e.g. a deferred or rejected page. */
let overrides: Record<string, () => Promise<Response>> = {}
/** Overlap: page 2 repeats the last item of page 1. */
let overlapSecondPage = false
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
  const end = Math.min(offset + limit, total)
  const first = overlapSecondPage && offset === 25 ? offset - 1 : offset
  const items = Array.from({ length: end - first }, (_, i) =>
    conversation(first + i)
  )
  return envelope({
    items,
    pageInfo: { limit, offset, total, hasNextPage: end < total }
  })
}

const approvalFor = (sessionId: string) => ({
  id: `approval_${sessionId}`,
  sessionId,
  proposedAction: 'create_appointment_draft',
  summary: 'Caso',
  riskLevel: 'medium',
  status: 'pending',
  createdAt: '2026-10-28T12:00:00.000Z'
})

let approvalSession = 'sess_55'

function mockApi(requested: string[]) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    requested.push(url)
    const override = overrides[url]
    if (override) return override()
    const match = /^\/v1\/conversations\?limit=(\d+)&offset=(\d+)$/.exec(url)
    if (match) return conversationPage(Number(match[2]), Number(match[1]))
    if (url.endsWith('/timeline')) return envelope({ messages: [] })
    if (url.startsWith('/v1/audit/sessions/')) return envelope({ events: [] })
    if (url.startsWith('/v1/approvals?')) {
      return envelope([approvalFor(approvalSession)], {
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
  total = 60
  overrides = {}
  overlapSecondPage = false
  approvalSession = 'sess_55'
})

function deferred() {
  let settle!: (response: Response) => void
  const promise = new Promise<Response>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

async function approvalsPanel() {
  return within(
    (await screen.findByRole('heading', { name: 'Aprovacoes' })).closest(
      'section'
    )!
  )
}

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

  it('does not duplicate a conversation that repeats across pages', async () => {
    overlapSecondPage = true
    mockApi([])
    const panel = await signIn()
    expect(await panel.findByText('sender-24')).toBeTruthy()
    fireEvent.click(
      panel.getByRole('button', { name: 'Carregar mais conversas' })
    )
    expect(await panel.findByText('sender-49')).toBeTruthy()
    expect(panel.getAllByText('sender-24')).toHaveLength(1)
    expect(panel.getByText('50 de 60')).toBeTruthy()
  })

  it('discards a page that arrives after the operator changed', async () => {
    const late = deferred()
    overrides['/v1/conversations?limit=25&offset=25'] = () => late.promise
    mockApi([])
    const panel = await signIn()
    expect(await panel.findByText('sender-24')).toBeTruthy()
    fireEvent.click(
      panel.getByRole('button', { name: 'Carregar mais conversas' })
    )
    fireEvent.change(screen.getByLabelText('ID do operador'), {
      target: { value: 'other.operator' }
    })
    expect(await panel.findByText('sender-24')).toBeTruthy()
    late.settle(await conversationPage(25, 25))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(panel.queryByText('sender-25')).toBeNull()
    expect(panel.getByText('25 de 60')).toBeTruthy()
  })

  it('says the case was not found after paging through every conversation', async () => {
    approvalSession = 'sess_999'
    const requested: string[] = []
    mockApi(requested)
    const panel = await signIn()
    expect(await panel.findByText('sender-24')).toBeTruthy()
    const approvals = await approvalsPanel()
    fireEvent.click(
      await approvals.findByRole('button', { name: 'Abrir caso sess_999' })
    )
    expect(
      await approvals.findByText('Caso não encontrado entre as conversas.')
    ).toBeTruthy()
    expect(requested).toContain('/v1/conversations?limit=25&offset=50')
  })

  it('stops looking after 20 pages and says so', async () => {
    total = 1000
    approvalSession = 'sess_999'
    const requested: string[] = []
    mockApi(requested)
    const panel = await signIn()
    expect(await panel.findByText('sender-24')).toBeTruthy()
    const approvals = await approvalsPanel()
    fireEvent.click(
      await approvals.findByRole('button', { name: 'Abrir caso sess_999' })
    )
    expect(
      await approvals.findByText(
        'Caso não encontrado nas conversas carregadas.'
      )
    ).toBeTruthy()
    const extraPages = requested.filter(
      (url) => url.startsWith('/v1/conversations?') && !url.endsWith('offset=0')
    )
    expect(extraPages).toHaveLength(20)
  })

  it('reports a failed page instead of "not found" and keeps the list', async () => {
    overrides['/v1/conversations?limit=25&offset=25'] = () =>
      Promise.reject(new Error('network down'))
    mockApi([])
    const panel = await signIn()
    expect(await panel.findByText('sender-24')).toBeTruthy()
    const approvals = await approvalsPanel()
    fireEvent.click(
      await approvals.findByRole('button', { name: 'Abrir caso sess_55' })
    )
    expect(
      await approvals.findByText('Não foi possível carregar mais conversas.')
    ).toBeTruthy()
    expect(approvals.queryByText(/Caso não encontrado/)).toBeNull()
    expect(panel.getByText('sender-0')).toBeTruthy()
    expect(panel.getByText('25 de 60')).toBeTruthy()
  })

  it('contains a failed "Carregar mais" and keeps the button', async () => {
    overrides['/v1/conversations?limit=25&offset=25'] = () =>
      Promise.reject(new Error('network down'))
    mockApi([])
    const panel = await signIn()
    expect(await panel.findByText('sender-24')).toBeTruthy()
    fireEvent.click(
      panel.getByRole('button', { name: 'Carregar mais conversas' })
    )
    await waitFor(() =>
      expect(
        (
          panel.getByRole('button', {
            name: 'Carregar mais conversas'
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
    )
    expect(panel.getByText('25 de 60')).toBeTruthy()
  })

  it('says nothing about a case search whose view changed meanwhile', async () => {
    const late = deferred()
    overrides['/v1/conversations?limit=25&offset=25'] = () => late.promise
    mockApi([])
    const panel = await signIn()
    expect(await panel.findByText('sender-24')).toBeTruthy()
    const approvals = await approvalsPanel()
    fireEvent.click(
      await approvals.findByRole('button', { name: 'Abrir caso sess_55' })
    )
    fireEvent.change(screen.getByLabelText('ID do operador'), {
      target: { value: 'other.operator' }
    })
    expect(await panel.findByText('sender-24')).toBeTruthy()
    late.settle(await conversationPage(25, 25))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByText(/Caso não encontrado/)).toBeNull()
    expect(screen.queryByText(/Não foi possível carregar mais/)).toBeNull()
  })

  it('forgets the old page info while the new operator conversations load', async () => {
    const pending = deferred()
    let armed = false
    let heldFirstPages = 0
    mockApi([])
    const base = vi.mocked(globalThis.fetch).getMockImplementation()!
    vi.mocked(globalThis.fetch).mockImplementation((input, init) => {
      if (armed && String(input) === '/v1/conversations?limit=25&offset=0') {
        heldFirstPages += 1
        return pending.promise
      }
      return base(input, init)
    })
    const panel = await signIn()
    expect(await panel.findByText('sender-24')).toBeTruthy()
    armed = true
    fireEvent.change(screen.getByLabelText('ID do operador'), {
      target: { value: 'other.operator' }
    })
    await waitFor(() => expect(heldFirstPages).toBeGreaterThan(0))
    const approvals = await approvalsPanel()
    await approvals.findByText(/sess_55/)
    expect(
      approvals.queryByRole('button', { name: 'Abrir caso sess_55' })
    ).toBeNull()
    pending.settle(await conversationPage(0, 25))
  })
})
