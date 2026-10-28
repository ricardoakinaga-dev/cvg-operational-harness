/**
 * SPEC0259 §4.8 (todos os perfis) — um painel com 403 diz "sem permissão" e
 * continua distinto de "indisponível". Perfil atual (caminhos relativos).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App.tsx'
import { resetApiClientOptions } from '../api/client.ts'
import type { SessionBootstrap } from '../auth/session.ts'

const identity = {
  operatorId: 'operator.forbidden.synthetic',
  role: 'Operator' as const,
  tenantId: 'tenant_00000000-0000-4000-8000-000000000701'
}

function answer(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as Response)
}

const ok = (data: unknown) =>
  answer(200, { success: true, data, error: null, meta: {} })
const refused = (status: number, code: string) =>
  answer(status, {
    success: false,
    data: null,
    error: { code, message: code },
    meta: {}
  })

afterEach(() => {
  cleanup()
  resetApiClientOptions()
  vi.restoreAllMocks()
})

describe('SPEC0259 §4.8 — panel 403 in the current profile', () => {
  it('shows "Sem permissão para esta área." for 403 and keeps the unavailable text for 503', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url === '/v1/conversations?limit=25&offset=0') {
        return refused(503, 'configuration_error')
      }
      if (url === '/v1/approvals?status=pending&limit=25&offset=0') {
        return ok([])
      }
      if (url === '/v1/tasks?status=open,in_progress&limit=25&offset=0') {
        return refused(403, 'forbidden')
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })
    const bootstrap: SessionBootstrap = {
      load: vi
        .fn()
        .mockResolvedValue({ identity, expiresAt: '2099-01-15T08:02:00.000Z' }),
      logout: vi.fn().mockResolvedValue(undefined)
    }
    render(<App identityMode="trusted" sessionBootstrap={bootstrap} />)
    expect(
      await screen.findByText('Sem permissão para esta área.')
    ).toBeTruthy()
    expect(
      (await screen.findAllByText('Erro ao carregar dados operacionais.'))
        .length
    ).toBeGreaterThan(0)
  })
})
