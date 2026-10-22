/**
 * SPEC0251 §4.4 / S8 — a 404 on an approval decision or on a task status
 * change means the item is no longer available to this operator (case not
 * assigned, revoked or gone): the console reloads the current queue page and
 * shows a status message instead of putting the panel in the failed state.
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

const UNAVAILABLE = 'Este item não está mais disponível para você.'
const approvalQueue = '/v1/approvals?status=pending&limit=25&offset=0'
const activeTasks = '/v1/tasks?status=open,in_progress&limit=25&offset=0'
const emptyPage = { limit: 25, offset: 0, total: 0, hasNextPage: false }

function envelope(data: unknown, pageInfo?: Record<string, unknown>) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data,
        error: null,
        meta: {
          correlationId: 'corr_00000000-0000-4000-8000-000000000251',
          ...(pageInfo ? { pageInfo } : {})
        }
      })
  } as Response)
}

function notFound() {
  return Promise.resolve({
    ok: false,
    status: 404,
    json: () =>
      Promise.resolve({
        success: false,
        data: null,
        error: { code: 'not_found', message: 'Resource not found' },
        meta: { correlationId: 'corr_00000000-0000-4000-8000-000000000251' }
      })
  } as Response)
}

function panel(name: string) {
  return within(
    screen.getByRole('heading', { name }).closest('section') as HTMLElement
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SPEC0251 S8 — unavailable item after a 404', () => {
  it('reloads the approval queue and shows the message without a failed state', async () => {
    let available = true
    let reads = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url === '/v1/conversations?limit=25&offset=0') {
        return envelope({ items: [], pageInfo: emptyPage })
      }
      if (url === approvalQueue) {
        reads += 1
        return envelope(
          available
            ? [
                {
                  id: 'approval_unassigned',
                  sessionId: 'sess_unassigned',
                  proposedAction: 'synthetic_review',
                  summary: 'Resumo sintético',
                  riskLevel: 'low',
                  status: 'pending',
                  createdAt: '2026-10-21T12:00:00.000Z'
                }
              ]
            : [],
          { ...emptyPage, total: available ? 1 : 0 }
        )
      }
      if (url === '/v1/approvals/approval_unassigned/decision') {
        available = false
        return notFound()
      }
      if (url === activeTasks) return envelope([], emptyPage)
      return envelope([])
    })

    render(<App />)
    fireEvent.change(screen.getByLabelText('ID do operador'), {
      target: { value: 'approver.unassigned' }
    })
    fireEvent.change(screen.getByLabelText('Papel operacional'), {
      target: { value: 'Approver' }
    })
    const approve = await screen.findByRole('button', {
      name: 'Aprovar synthetic_review'
    })
    const readsBefore = reads
    fireEvent.click(approve)

    expect(await panel('Aprovacoes').findByText(UNAVAILABLE)).toBeTruthy()
    expect(panel('Aprovacoes').getByRole('status').textContent).toBe(
      UNAVAILABLE
    )
    expect(reads).toBeGreaterThan(readsBefore)
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Aprovar synthetic_review' })
      ).toBeNull()
    )
    expect(panel('Aprovacoes').queryByRole('alert')).toBeNull()
  })

  it('reloads the task board and shows the message in the task panel without a failed state', async () => {
    let available = true
    let reads = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      if (url === '/v1/conversations?limit=25&offset=0') {
        return envelope({ items: [], pageInfo: emptyPage })
      }
      if (url === approvalQueue) return envelope([], emptyPage)
      if (url === activeTasks && !init?.method) {
        reads += 1
        return envelope(
          available
            ? [
                {
                  id: 'task_unassigned',
                  sessionId: 'sess_unassigned',
                  title: 'Tarefa sem vínculo',
                  priority: 'medium',
                  status: 'open'
                }
              ]
            : [],
          { ...emptyPage, total: available ? 1 : 0 }
        )
      }
      if (url === '/v1/tasks/task_unassigned/status') {
        available = false
        return notFound()
      }
      return envelope([])
    })

    render(<App />)
    fireEvent.change(screen.getByLabelText('ID do operador'), {
      target: { value: 'operator.unassigned' }
    })
    expect(await screen.findByText('Tarefa sem vínculo')).toBeTruthy()
    expect(panel('Tarefas').queryByRole('status')).toBeNull()
    const readsBefore = reads
    fireEvent.click(
      await screen.findByRole('button', { name: 'Iniciar Tarefa sem vínculo' })
    )

    expect(await panel('Tarefas').findByText(UNAVAILABLE)).toBeTruthy()
    expect(panel('Tarefas').getByRole('status').textContent).toBe(UNAVAILABLE)
    expect(reads).toBeGreaterThan(readsBefore)
    await waitFor(() =>
      expect(screen.queryByText('Tarefa sem vínculo')).toBeNull()
    )
    expect(panel('Tarefas').queryByRole('alert')).toBeNull()
  })
})
