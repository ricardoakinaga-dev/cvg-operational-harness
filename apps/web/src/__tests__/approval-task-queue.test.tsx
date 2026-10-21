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

  it('keeps paging when a case is selected while the next page loads', async () => {
    const activeTasksPage2 =
      '/v1/tasks?status=open,in_progress&limit=25&offset=25'
    const task = (suffix: string) => ({
      id: `task_${suffix}`,
      sessionId: `sess_${suffix}`,
      title: `Tarefa ${suffix}`,
      priority: 'medium',
      status: 'open'
    })
    const deferred: Record<string, (response: Response) => void> = {}
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
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
        return envelope([approval('a')], {
          limit: 25,
          offset: 0,
          total: 26,
          hasNextPage: true
        })
      }
      if (url === activeTasks) {
        return envelope([task('a')], {
          limit: 25,
          offset: 0,
          total: 26,
          hasNextPage: true
        })
      }
      if (url === approvalQueuePage2 || url === activeTasksPage2) {
        return new Promise<Response>((resolve) => {
          deferred[url] = resolve
        })
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(<App />)
    fireEvent.change(screen.getByLabelText('ID do operador'), {
      target: { value: 'operator.aud0621' }
    })
    const approvals = within(
      (await screen.findByRole('heading', { name: 'Aprovacoes' })).closest(
        'section'
      )!
    )
    const tasks = within(
      screen.getByRole('heading', { name: 'Tarefas' }).closest('section')!
    )
    expect(await approvals.findByText('Resumo: Resumo a')).toBeTruthy()
    expect(await tasks.findByText('Tarefa a')).toBeTruthy()

    fireEvent.click(
      approvals.getByRole('button', { name: 'Próxima página de aprovações' })
    )
    fireEvent.click(
      tasks.getByRole('button', { name: 'Próxima página de tarefas' })
    )
    await waitFor(() => {
      expect(deferred[approvalQueuePage2]).toEqual(expect.any(Function))
      expect(deferred[activeTasksPage2]).toEqual(expect.any(Function))
    })
    // The view scope changes while both pages are in flight.
    fireEvent.click(screen.getByRole('button', { name: /sender-b/ }))
    deferred[approvalQueuePage2]!(
      (await envelope([approval('z')], {
        limit: 25,
        offset: 25,
        total: 26,
        hasNextPage: false
      })) as Response
    )
    deferred[activeTasksPage2]!(
      (await envelope([task('z')], {
        limit: 25,
        offset: 25,
        total: 26,
        hasNextPage: false
      })) as Response
    )

    expect(await approvals.findByText('Resumo: Resumo z')).toBeTruthy()
    expect(await tasks.findByText('Tarefa z')).toBeTruthy()
    expect(approvals.queryByText('Carregando...')).toBeNull()
    expect(tasks.queryByText('Carregando...')).toBeNull()
  })

  it('reloads the current page after a decision and falls back to the first page when it empties', async () => {
    let page2Reads = 0
    let decided = false
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      if (url === '/v1/conversations?limit=25&offset=0') {
        return envelope({
          items: [],
          pageInfo: { limit: 25, offset: 0, total: 0, hasNextPage: false }
        })
      }
      if (url === approvalQueue) {
        return envelope([approval('a')], {
          limit: 25,
          offset: 0,
          total: decided ? 25 : 26,
          hasNextPage: !decided
        })
      }
      if (url === approvalQueuePage2) {
        page2Reads += 1
        return decided
          ? envelope([], {
              limit: 25,
              offset: 25,
              total: 25,
              hasNextPage: false
            })
          : envelope([approval('z')], {
              limit: 25,
              offset: 25,
              total: 26,
              hasNextPage: false
            })
      }
      if (
        url === '/v1/approvals/approval_z/decision' &&
        init?.method === 'POST'
      ) {
        decided = true
        return envelope({ ...approval('z'), status: 'approved' })
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
    expect(await panel.findByText('Resumo: Resumo a')).toBeTruthy()
    fireEvent.click(
      panel.getByRole('button', { name: 'Próxima página de aprovações' })
    )
    expect(await panel.findByText('Resumo: Resumo z')).toBeTruthy()

    fireEvent.click(
      panel.getByRole('button', { name: 'Aprovar create_appointment_draft' })
    )
    // The decision reloads offset 25, which is now empty, then offset 0.
    expect(await panel.findByText('Resumo: Resumo a')).toBeTruthy()
    expect(page2Reads).toBe(2)
    expect(panel.queryByText('Resumo: Resumo z')).toBeNull()
    expect(panel.getByText('25')).toBeTruthy()
  })
})
