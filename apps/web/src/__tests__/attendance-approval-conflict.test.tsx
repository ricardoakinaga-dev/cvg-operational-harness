import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App.tsx'
const envelope = (data: unknown) =>
  Promise.resolve({
    ok: true,
    json: async () => ({
      success: true,
      data,
      error: null,
      meta: { correlationId: 'corr_fixture' }
    })
  } as Response)
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
describe('attendance approval conflict recovery', () => {
  it('refreshes the queue and shows the winning state with a recovery message', async () => {
    let decided = false
    let reads = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url === '/v1/conversations?limit=25&offset=0')
        return envelope({
          items: [],
          pageInfo: { limit: 25, offset: 0, total: 0, hasNextPage: false }
        })
      if (url === '/v1/approvals?status=pending&limit=25&offset=0') {
        reads++
        return envelope([
          {
            id: 'approval_fixture',
            sessionId: 'sess_fixture',
            proposedAction: 'synthetic_review',
            riskLevel: 'low',
            status: decided ? 'rejected' : 'pending'
          }
        ])
      }
      if (url === '/v1/approvals/approval_fixture/decision') {
        decided = true
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({
            success: false,
            data: null,
            error: {
              code: 'conflict',
              message: 'Approval request is no longer pending'
            },
            meta: { correlationId: 'corr_fixture' }
          })
        } as Response)
      }
      if (url === '/v1/tasks?status=open,in_progress&limit=25&offset=0')
        return envelope([])
      return envelope([])
    })
    render(<App />)
    fireEvent.change(screen.getByLabelText('ID do operador'), {
      target: { value: 'synthetic.approver' }
    })
    fireEvent.change(screen.getByLabelText('Papel operacional'), {
      target: { value: 'Approver' }
    })
    const button = await screen.findByRole('button', {
      name: 'Aprovar synthetic_review'
    })
    const initialReads = reads
    fireEvent.click(button)
    expect(
      await screen.findByText(
        'Esta aprovacao ja foi decidida. A fila foi atualizada.'
      )
    ).toBeTruthy()
    expect(screen.getByText('low / rejected')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Aprovar synthetic_review' })
    ).toBeNull()
    expect(reads).toBeGreaterThan(initialReads)
  })
  it('discards a stale conflict after the identity changes', async () => {
    let rejectDecision!: (value: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url === '/v1/conversations?limit=25&offset=0')
        return envelope({
          items: [],
          pageInfo: { limit: 25, offset: 0, total: 0, hasNextPage: false }
        })
      if (url === '/v1/approvals?status=pending&limit=25&offset=0')
        return envelope([
          {
            id: 'approval_fixture',
            sessionId: 'sess_fixture',
            proposedAction: 'synthetic_review',
            riskLevel: 'low',
            status: 'pending'
          }
        ])
      if (url === '/v1/approvals/approval_fixture/decision')
        return new Promise((resolve) => {
          rejectDecision = resolve
        })
      return envelope([])
    })
    render(<App />)
    fireEvent.change(screen.getByLabelText('ID do operador'), {
      target: { value: 'synthetic.approver' }
    })
    fireEvent.change(screen.getByLabelText('Papel operacional'), {
      target: { value: 'Approver' }
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Aprovar synthetic_review' })
    )
    fireEvent.change(screen.getByLabelText('ID do operador'), {
      target: { value: 'synthetic.next' }
    })
    await waitFor(() => expect(rejectDecision).toBeTypeOf('function'))
    await act(async () => {
      rejectDecision({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: { code: 'conflict', message: 'Conflict' }
        })
      } as Response)
    })
    await waitFor(() => expect(screen.getByText('low / pending')).toBeTruthy())
    expect(
      screen.queryByText(
        'Esta aprovacao ja foi decidida. A fila foi atualizada.'
      )
    ).toBeNull()
  })
})
