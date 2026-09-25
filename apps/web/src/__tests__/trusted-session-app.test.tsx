import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App.tsx'
import { resetApiClientOptions } from '../api/client.ts'
import type { SessionBootstrap } from '../auth/session.ts'

const identity = {
  operatorId: 'operator.trusted.synthetic',
  role: 'Supervisor' as const,
  tenantId: 'tenant_00000000-0000-4000-8000-000000000701'
}

const envelope = <T,>(data: T) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data,
        error: null,
        meta: { correlationId: 'corr_rem21_005_trusted_web' }
      })
  } as Response)

afterEach(() => {
  cleanup()
  resetApiClientOptions()
  vi.restoreAllMocks()
})

function emptyOperationalApi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url === '/v1/conversations?limit=25&offset=0') {
      return envelope({
        items: [],
        pageInfo: { limit: 25, offset: 0, total: 0, hasNextPage: false }
      })
    }
    if (url === '/v1/approvals' || url === '/v1/tasks') return envelope([])
    return Promise.reject(new Error(`Unexpected URL ${url}`))
  })
}

describe('trusted web session composition', () => {
  it('renders only read-only server identity and uses cookie credentials', async () => {
    const fetch = emptyOperationalApi()
    const bootstrap: SessionBootstrap = {
      load: vi.fn().mockResolvedValue({
        identity,
        expiresAt: '2099-01-15T08:02:00.000Z'
      }),
      logout: vi.fn().mockResolvedValue(undefined)
    }

    render(<App identityMode="trusted" sessionBootstrap={bootstrap} />)

    expect(screen.queryByLabelText('ID do operador')).toBeNull()
    expect(screen.queryByLabelText('Papel operacional')).toBeNull()
    expect(screen.queryByLabelText('Tenant ID')).toBeNull()
    expect(await screen.findByText(identity.operatorId)).toBeTruthy()
    expect(screen.getByText(identity.role)).toBeTruthy()
    expect(screen.getByText(identity.tenantId)).toBeTruthy()

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    for (const [, init] of fetch.mock.calls) {
      expect(init?.credentials).toBe('include')
      expect(init?.headers).toEqual({})
    }
  })

  it('clears the trusted snapshot on logout and stays locked without a fallback form', async () => {
    emptyOperationalApi()
    const bootstrap: SessionBootstrap = {
      load: vi.fn().mockResolvedValue({
        identity,
        expiresAt: '2099-01-15T08:02:00.000Z'
      }),
      logout: vi.fn().mockResolvedValue(undefined)
    }

    render(<App identityMode="trusted" sessionBootstrap={bootstrap} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Encerrar sessão' })
    )

    await waitFor(() =>
      expect(
        screen.getAllByText('Autenticação necessária').length
      ).toBeGreaterThan(0)
    )
    expect(bootstrap.logout).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Reautenticar' })).toBeTruthy()
    expect(screen.queryByLabelText('ID do operador')).toBeNull()
  })

  it('fails closed when the host bridge cannot provide a trusted session', async () => {
    emptyOperationalApi()
    const bootstrap: SessionBootstrap = {
      load: vi
        .fn()
        .mockRejectedValue(
          new Error('Uma sessão confiável é necessária para continuar.')
        ),
      logout: vi.fn().mockResolvedValue(undefined)
    }

    render(<App identityMode="trusted" sessionBootstrap={bootstrap} />)

    expect(
      await screen.findByText(
        'Não foi possível autenticar a sessão operacional.'
      )
    ).toBeTruthy()
    expect(screen.queryByLabelText('ID do operador')).toBeNull()
    expect(screen.queryByText('Simulação controlada')).toBeNull()
  })

  it('deduplicates one-use bootstrap under StrictMode and restores focus on reauth', async () => {
    emptyOperationalApi()
    const bootstrap: SessionBootstrap = {
      load: vi.fn().mockResolvedValue({
        identity,
        expiresAt: '2099-01-15T08:02:00.000Z'
      }),
      logout: vi.fn().mockResolvedValue(undefined)
    }

    render(
      <StrictMode>
        <App identityMode="trusted" sessionBootstrap={bootstrap} />
      </StrictMode>
    )

    expect(await screen.findByText(identity.operatorId)).toBeTruthy()
    expect(bootstrap.load).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar sessão' }))
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Reautenticar' })
      )
    )
  })

  it('locks safely when the trusted session expiry is malformed', async () => {
    emptyOperationalApi()
    const bootstrap: SessionBootstrap = {
      load: vi.fn().mockResolvedValue({
        identity,
        expiresAt: 'not-a-date'
      }),
      logout: vi.fn().mockResolvedValue(undefined)
    }

    render(<App identityMode="trusted" sessionBootstrap={bootstrap} />)

    expect(await screen.findByText('Expiração inválida')).toBeTruthy()
    expect(
      await screen.findByText(
        'A sessão operacional tem uma expiração inválida.'
      )
    ).toBeTruthy()
    expect(screen.queryByLabelText('ID do operador')).toBeNull()
  })
})
