import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JourneysPanel } from './index.tsx'

const identity = {
  operatorId: 'operator.journey-ui',
  role: 'Operator' as const,
  tenantId: 'tenant_00000000-0000-4000-8000-000000000901'
}

const envelope = <T,>(data: T) =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data,
        error: null,
        meta: { correlationId: 'corr_00000000-0000-4000-8000-000000000901' }
      })
  } as Response)

afterEach(() => vi.restoreAllMocks())

describe('controlled journeys panel', () => {
  it('walks identify, draft, link and approval-blocked scheduling steps', async () => {
    const idempotencyKeys: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (method === 'POST' && init?.body) {
        const body = JSON.parse(String(init.body)) as {
          idempotencyKey?: string
        }
        if (body.idempotencyKey) idempotencyKeys.push(body.idempotencyKey)
      }
      if (url.includes('/owners/search')) {
        return envelope({
          matches: [
            {
              id: 'owner_fixture_901_1',
              displayName: 'Ana Ficticia',
              kind: 'owner'
            }
          ]
        })
      }
      if (url === '/v1/journeys/owner-drafts' && method === 'POST') {
        return envelope({
          id: 'owner-draft-901',
          candidateIds: ['owner_fixture_901_1'],
          status: 'draft'
        })
      }
      if (url === '/v1/journeys/patient-drafts' && method === 'POST') {
        return envelope({
          id: 'patient-draft-901',
          candidateIds: ['patient_fixture_901_1'],
          status: 'draft'
        })
      }
      if (url.includes('/patient-drafts/patient-draft-901/link')) {
        return envelope({
          id: 'patient-draft-901',
          candidateIds: ['patient_fixture_901_1'],
          status: 'linked'
        })
      }
      if (url === '/v1/journeys/slots') {
        return envelope({
          slots: [
            {
              id: 'slot_901_20260905_1',
              startsAt: '2026-09-06T22:00:00.000Z',
              sourceVersion: 'synthetic-schedule-v1'
            }
          ]
        })
      }
      if (url === '/v1/journeys/appointment-drafts' && method === 'POST') {
        return envelope({
          id: 'appointment-draft-901',
          status: 'awaiting_approval',
          confirmationBlocked: true
        })
      }
      if (url === '/v1/journeys/tasks' && method === 'POST') {
        return envelope({ id: 'task-journey-901', status: 'open' })
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })

    render(<JourneysPanel identity={identity} selectedSessionId="sess-901" />)
    fireEvent.change(screen.getByLabelText('Telefone sintético'), {
      target: { value: '+5511999990001' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar tutor' }))
    expect(
      await screen.findByText(
        'Tutor encontrado; a associação ainda é um rascunho.'
      )
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    expect(await screen.findByText(/Rascunho de tutor persistido/)).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Salvar rascunho do pet' })
    )
    expect(await screen.findByText(/Rascunho de pet persistido/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Vincular candidato' }))
    expect(await screen.findByText(/Pet vinculado ao rascunho/)).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Carregar horários sintéticos' })
    )
    expect(
      await screen.findByText(/Horários sintéticos carregados/)
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Criar sugestão para aprovação' })
    )
    expect(
      await screen.findByText(/Sugestão de horário persistida/)
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Criar tarefa para a sessão' })
    )
    await waitFor(() =>
      expect(screen.getByText(/Tarefa operacional criada/)).toBeTruthy()
    )
    expect(idempotencyKeys).toHaveLength(4)
    expect(new Set(idempotencyKeys).size).toBe(4)
    for (const key of idempotencyKeys) {
      expect(key).toMatch(
        /^journey_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )
    }
    expect(screen.queryByRole('button', { name: /Confirmar/ })).toBeNull()
  })
})
