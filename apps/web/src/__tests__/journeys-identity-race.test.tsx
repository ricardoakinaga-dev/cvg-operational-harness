import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { JourneysPanel } from '../features/journeys/index.tsx'
import type { OperatorIdentity } from '../api/client.ts'

const envelope = (data: unknown) =>
  ({
    ok: true,
    json: async () => ({
      success: true,
      data,
      error: null,
      meta: { correlationId: 'corr_fixture' }
    })
  }) as Response

const identityA: OperatorIdentity = {
  operatorId: 'synthetic.operator',
  role: 'Operator',
  tenantId: 'tenant_00000000-0000-4000-8000-000000000001'
}
const identityB: OperatorIdentity = {
  ...identityA,
  tenantId: 'tenant_00000000-0000-4000-8000-000000000002'
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('journey panel identity generation', () => {
  it('discards a delayed success response from the previous tenant', async () => {
    let resolveSearch: (value: Response) => void = () => undefined
    const pendingSearch = new Promise<Response>((resolve) => {
      resolveSearch = resolve
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (String(input).includes('/v1/journeys/owners/search')) {
        return pendingSearch
      }
      return Promise.resolve(envelope([]))
    })

    const view = render(<JourneysPanel identity={identityA} />)
    fireEvent.change(screen.getByLabelText('Telefone sintético'), {
      target: { value: '+5511999990001' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar tutor' }))

    view.rerender(<JourneysPanel identity={identityB} />)

    await act(async () => {
      resolveSearch(
        envelope({
          matches: [
            {
              id: 'candidate_A',
              displayName: 'SYNTHETIC TENANT A PRIVATE NAME',
              kind: 'owner'
            }
          ]
        })
      )
      await pendingSearch
    })

    expect(screen.queryByText('SYNTHETIC TENANT A PRIVATE NAME')).toBeNull()
  })

  it('discards a delayed error from the previous identity', async () => {
    let rejectSearch: (reason: Error) => void = () => undefined
    const pendingSearch = new Promise<Response>((_resolve, reject) => {
      rejectSearch = reject
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (String(input).includes('/v1/journeys/owners/search')) {
        return pendingSearch
      }
      return Promise.resolve(envelope([]))
    })

    const view = render(<JourneysPanel identity={identityA} />)
    fireEvent.change(screen.getByLabelText('Telefone sintético'), {
      target: { value: '+5511999990001' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar tutor' }))

    view.rerender(<JourneysPanel identity={identityB} />)

    await act(async () => {
      rejectSearch(new Error('stale tenant A failure'))
      await pendingSearch.catch(() => undefined)
    })

    expect(screen.queryByText('stale tenant A failure')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('keeps a current-identity response visible', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      if (String(input).includes('/v1/journeys/owners/search')) {
        return Promise.resolve(
          envelope({
            matches: [
              {
                id: 'candidate_B',
                displayName: 'SYNTHETIC TENANT B VISIBLE',
                kind: 'owner'
              }
            ]
          })
        )
      }
      return Promise.resolve(envelope([]))
    })

    render(<JourneysPanel identity={identityB} />)
    fireEvent.change(screen.getByLabelText('Telefone sintético'), {
      target: { value: '+5511999990001' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Buscar tutor' }))

    expect(await screen.findByText('SYNTHETIC TENANT B VISIBLE')).toBeTruthy()
  })
})

const deferredResponse = () => {
  let resolve!: (value: Response) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<Response>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const searchOwner = () => {
  fireEvent.change(screen.getByLabelText('Telefone sintético'), {
    target: { value: '+5511999990002' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar tutor' }))
}

for (const session of ['session_B', null]) {
  for (const outcome of ['success', 'error']) {
    it(`invalidates session A ${outcome} on selection ${session} and preserves the current operation`, async () => {
      const old = deferredResponse()
      const current = deferredResponse()
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(current.promise)
      const view = render(
        <JourneysPanel identity={identityA} selectedSessionId="session_A" />
      )
      fireEvent.click(
        screen.getByRole('button', { name: 'Criar tarefa para a sessão' })
      )
      const oldSignal = fetch.mock.calls[0]![1]!.signal!
      view.rerender(
        <JourneysPanel identity={identityA} selectedSessionId={session} />
      )
      expect(oldSignal.aborted).toBe(true)
      expect(
        (
          screen.getByRole('button', {
            name: 'Carregar horários sintéticos'
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
      expect(
        (
          screen.getByRole('button', {
            name: 'Criar tarefa para a sessão'
          }) as HTMLButtonElement
        ).disabled
      ).toBe(session === null)
      searchOwner()
      expect(fetch).toHaveBeenCalledTimes(2)
      await act(async () => {
        if (outcome === 'success') old.resolve(envelope({ id: 'task_A' }))
        else old.reject(new Error('SYNTHETIC SESSION A PRIVATE ERROR'))
        await old.promise.catch(() => undefined)
      })
      expect(screen.queryByRole('status')).toBeNull()
      expect(
        (
          screen.getByRole('button', {
            name: 'Buscar tutor'
          }) as HTMLButtonElement
        ).disabled
      ).toBe(true)
      await act(async () => {
        current.resolve(
          envelope({
            matches: [
              {
                id: 'current',
                displayName: 'CURRENT SESSION OWNER',
                kind: 'owner'
              }
            ]
          })
        )
        await current.promise
      })
      expect(screen.getByText('CURRENT SESSION OWNER')).toBeTruthy()
      expect(
        (
          screen.getByRole('button', {
            name: 'Buscar tutor'
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
    })
  }
}

const transitions: [string, OperatorIdentity | null, string | null][] = [
  ['tenant', identityB, 'session_A'],
  ['actor', { ...identityA, operatorId: 'synthetic.other' }, 'session_A'],
  ['role', { ...identityA, role: 'Admin' }, 'session_A'],
  ['logout', null, 'session_A'],
  ['session', identityA, 'session_B'],
  ['session cleared', identityA, null]
]

it.each(transitions)(
  'clears all form values and draft associations after %s changes',
  async (_label, nextIdentity, nextSession) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        envelope({
          id: 'synthetic-owner-draft',
          status: 'draft',
          candidateIds: ['synthetic-owner']
        })
      )
    )
    const view = render(
      <JourneysPanel identity={identityA} selectedSessionId="session_A" />
    )
    fireEvent.change(screen.getByLabelText('Telefone sintético'), {
      target: { value: '+5511999990001' }
    })
    fireEvent.change(screen.getByLabelText('Nome opcional do tutor'), {
      target: { value: 'SYNTHETIC PRIVATE OWNER' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await screen.findByLabelText('Nome do pet')
    fireEvent.change(screen.getByLabelText('Nome do pet'), {
      target: { value: 'SYNTHETIC PRIVATE PET' }
    })
    view.rerender(
      <JourneysPanel identity={nextIdentity} selectedSessionId={nextSession} />
    )
    expect(screen.queryByLabelText('Nome do pet')).toBeNull()
    expect(screen.queryByText('Draft: draft')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    if (!nextIdentity)
      view.rerender(
        <JourneysPanel identity={identityA} selectedSessionId={nextSession} />
      )
    expect(
      (screen.getByLabelText('Telefone sintético') as HTMLInputElement).value
    ).toBe('')
    expect(
      (screen.getByLabelText('Nome opcional do tutor') as HTMLInputElement)
        .value
    ).toBe('')
    fireEvent.change(screen.getByLabelText('Telefone sintético'), {
      target: { value: '+5511999990002' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    const patientInput = (await screen.findByLabelText(
      'Nome do pet'
    )) as HTMLInputElement
    expect(patientInput.value).toBe('Bolt')
  }
)
