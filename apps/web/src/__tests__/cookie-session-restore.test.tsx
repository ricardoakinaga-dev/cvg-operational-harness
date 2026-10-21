/**
 * AUD0621 F12 (SPEC0250 P8, SPEC0144 invariant 3) — the shipped trusted
 * bootstrap restores the operator session from the cookie when no bootstrap
 * token exists, tells a first-visit 401 apart from an expired session and
 * shows an unavailable store as unavailability with retry.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App.tsx'
import { resetApiClientOptions } from '../api/client.ts'
import { createTrustedSessionBootstrap } from '../auth/session.ts'

const identity = {
  operatorId: 'operator.aud0621.cookie',
  role: 'Operator' as const,
  tenantId: 'tenant_00000000-0000-4000-8000-000000000629'
}

function respond(status: number, body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as Response)
}

const success = (data: unknown) =>
  respond(200, {
    success: true,
    data,
    error: null,
    meta: { correlationId: 'corr_aud0621_cookie' }
  })

const failure = (status: number, code: string) =>
  respond(status, {
    success: false,
    data: null,
    error: { code, message: 'synthetic failure' },
    meta: { correlationId: 'corr_aud0621_cookie' }
  })

type SessionReply = () => Promise<Response>

function operationalApi(sessionReply: SessionReply) {
  const sessionCalls: Array<RequestInit | undefined> = []
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((input, init) => {
      const url = String(input)
      if (url === '/v1/session') {
        sessionCalls.push(init)
        return sessionReply()
      }
      if (url === '/v1/conversations?limit=25&offset=0') {
        return success({
          items: [],
          pageInfo: { limit: 25, offset: 0, total: 0, hasNextPage: false }
        })
      }
      if (url.startsWith('/v1/approvals') || url.startsWith('/v1/tasks')) {
        return success([])
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })
  return { fetch, sessionCalls }
}

afterEach(() => {
  cleanup()
  resetApiClientOptions()
  vi.restoreAllMocks()
})

describe('trusted console cookie-only restoration (AUD0621 F12)', () => {
  it('P8: restores the session from the cookie without a bootstrap token', async () => {
    const { sessionCalls } = operationalApi(() =>
      success({ identity, expiresAt: '2099-01-15T08:02:00.000Z' })
    )
    render(
      <App
        identityMode="trusted"
        sessionBootstrap={createTrustedSessionBootstrap(() => null)}
      />
    )

    expect(await screen.findByText(identity.operatorId)).toBeTruthy()
    expect(screen.getByText('Sessão confiável')).toBeTruthy()
    expect(sessionCalls).toHaveLength(1)
    expect(sessionCalls[0]?.credentials).toBe('include')
    expect(sessionCalls[0]?.headers).toEqual({})
  })

  it('P8: still exchanges a fresh host token when one is provided', async () => {
    const { sessionCalls } = operationalApi(() =>
      success({ identity, expiresAt: '2099-01-15T08:02:00.000Z' })
    )
    render(
      <App
        identityMode="trusted"
        sessionBootstrap={createTrustedSessionBootstrap(() => ' token-x ')}
      />
    )

    expect(await screen.findByText(identity.operatorId)).toBeTruthy()
    expect(sessionCalls[0]?.headers).toEqual({
      'x-cvg-operator-token': 'token-x'
    })
  })

  it('P8: a one-use host token is sent once even when the store is unavailable', async () => {
    const { fetch, sessionCalls } = operationalApi(() =>
      failure(503, 'configuration_error')
    )
    render(
      <App
        identityMode="trusted"
        sessionBootstrap={createTrustedSessionBootstrap(() => 'token-once')}
      />
    )

    expect(
      await screen.findByText(
        'Sessão operacional indisponível. Tente novamente.'
      )
    ).toBeTruthy()
    expect(sessionCalls).toHaveLength(1)
    expect(sessionCalls[0]?.headers).toEqual({
      'x-cvg-operator-token': 'token-once'
    })
    expect(
      fetch.mock.calls.some(([input]) => String(input) === '/v1/session/logout')
    ).toBe(false)
  })

  it('P8: a first-visit 401 asks for authentication, never "expired"', async () => {
    const { sessionCalls } = operationalApi(() => failure(401, 'unauthorized'))
    render(
      <App
        identityMode="trusted"
        sessionBootstrap={createTrustedSessionBootstrap(() => null)}
      />
    )

    expect(
      await screen.findByText(
        'Uma sessão confiável é necessária para continuar.'
      )
    ).toBeTruthy()
    expect(sessionCalls).toHaveLength(1)
    expect(screen.getAllByText('Autenticação necessária').length).toBe(1)
    expect(
      screen.queryByText('A sessão operacional expirou. Reautentique-se.')
    ).toBeNull()
    expect(screen.queryByText('Sessão expirada')).toBeNull()
    expect(screen.getByRole('button', { name: 'Reautenticar' })).toBeTruthy()
  })

  it('P8: an unavailable session store shows unavailability and recovers', async () => {
    let available = false
    const { sessionCalls } = operationalApi(() =>
      available
        ? success({ identity, expiresAt: '2099-01-15T08:02:00.000Z' })
        : failure(503, 'configuration_error')
    )
    render(
      <App
        identityMode="trusted"
        sessionBootstrap={createTrustedSessionBootstrap(() => null)}
      />
    )

    expect(
      await screen.findByText(
        'Sessão operacional indisponível. Tente novamente.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Sessão indisponível')).toBeTruthy()
    expect(screen.queryByText('Autenticação necessária')).toBeNull()
    const retry = screen.getByRole('button', { name: 'Tentar novamente' })
    await waitFor(() => expect(document.activeElement).toBe(retry))
    const attemptsBeforeRetry = sessionCalls.length

    available = true
    fireEvent.click(retry)
    expect(await screen.findByText(identity.operatorId)).toBeTruthy()
    expect(sessionCalls.length).toBe(attemptsBeforeRetry + 1)
    expect(sessionCalls.every((init) => init?.method === undefined)).toBe(true)
  })
})
