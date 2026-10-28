/**
 * SPEC0259 Q6 — console no perfil OIDC (vitest + jsdom). O perfil de build é
 * trocado por `vi.mock` do módulo de perfil; as origens são sintéticas e o
 * `fetch` é simulado por URL absoluta. Nenhuma rede real.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App.tsx'
import { apiClient, resetApiClientOptions } from '../api/client.ts'
import {
  createApiUrl,
  parseAuthorizationUrl,
  resolveConsoleBuildProfile
} from '../api/origin.ts'

const API = 'https://api.cvg.test:8443'
const profile = vi.hoisted(() => ({
  kind: 'oidc' as const,
  consoleOrigin: '',
  apiOrigin: 'https://api.cvg.test:8443'
}))

vi.mock('../api/console-profile.ts', () => ({ consoleLoginProfile: profile }))

const identity = {
  operatorId: 'oidc_synthetic_operator_0259',
  role: 'Operator' as const,
  tenantId: 'tenant_0254aaaa-0000-4000-8000-00000000000a'
}

type Answer = { status: number; body?: unknown } | 'network'
type Router = Record<string, Answer | (() => Answer)>

function envelope(data: unknown) {
  return { success: true, data, error: null, meta: { correlationId: 'c' } }
}

function failure(code: string) {
  return {
    success: false,
    data: null,
    error: { code, message: code },
    meta: { correlationId: 'c' }
  }
}

const SESSION_URL = `${API}/v1/session`
const START_URL = `${API}/v1/auth/oidc/start`
const LOGOUT_URL = `${API}/v1/session/logout`
const PANELS = {
  conversations: `${API}/v1/conversations?limit=25&offset=0`,
  approvals: `${API}/v1/approvals?status=pending&limit=25&offset=0`,
  tasks: `${API}/v1/tasks?status=open,in_progress&limit=25&offset=0`
}

function emptyPanels(): Router {
  return {
    [PANELS.conversations]: {
      status: 200,
      body: envelope({
        items: [],
        pageInfo: { limit: 25, offset: 0, total: 0, hasNextPage: false }
      })
    },
    [PANELS.approvals]: { status: 200, body: envelope([]) },
    [PANELS.tasks]: { status: 200, body: envelope([]) }
  }
}

function session(expiresAt = '2099-01-15T08:02:00.000Z'): Answer {
  return { status: 200, body: envelope({ identity, expiresAt }) }
}

function route(router: Router) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    const entry = router[url]
    if (entry === undefined) {
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    }
    const answer = typeof entry === 'function' ? entry() : entry
    if (answer === 'network') {
      return Promise.reject(new TypeError('Failed to fetch'))
    }
    return Promise.resolve({
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: () =>
        answer.body === undefined
          ? Promise.reject(new SyntaxError('no body'))
          : Promise.resolve(answer.body)
    } as Response)
  })
}

function renderConsole(navigate = vi.fn()) {
  render(<App identityMode="trusted" navigate={navigate} />)
  return navigate
}

beforeEach(() => {
  profile.consoleOrigin = window.location.origin
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
  resetApiClientOptions()
  vi.restoreAllMocks()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

describe('SPEC0259 Q6 — build profile validator', () => {
  const valid = {
    VITE_CVG_OPERATOR_LOGIN: 'oidc',
    VITE_CVG_CONSOLE_ORIGIN: 'https://console.cvg.test',
    VITE_CVG_API_ORIGIN: 'https://api.cvg.test',
    VITE_CVG_WEB_IDENTITY_MODE: 'trusted',
    NODE_ENV: 'production'
  }

  it('accepts the current profile and an exact OIDC profile', () => {
    expect(resolveConsoleBuildProfile({ NODE_ENV: 'production' })).toEqual({
      login: '',
      consoleOrigin: '',
      apiOrigin: ''
    })
    expect(resolveConsoleBuildProfile(valid)).toEqual({
      login: 'oidc',
      consoleOrigin: 'https://console.cvg.test',
      apiOrigin: 'https://api.cvg.test'
    })
  })

  it.each([
    ['missing console origin', { VITE_CVG_CONSOLE_ORIGIN: undefined }],
    ['missing API origin', { VITE_CVG_API_ORIGIN: undefined }],
    ['http: console', { VITE_CVG_CONSOLE_ORIGIN: 'http://console.cvg.test' }],
    ['http: API', { VITE_CVG_API_ORIGIN: 'http://api.cvg.test' }],
    ['a path', { VITE_CVG_API_ORIGIN: 'https://api.cvg.test/v1' }],
    ['a trailing slash', { VITE_CVG_API_ORIGIN: 'https://api.cvg.test/' }],
    ['a query', { VITE_CVG_CONSOLE_ORIGIN: 'https://console.cvg.test?x=1' }],
    ['credentials', { VITE_CVG_API_ORIGIN: 'https://u:p@api.cvg.test' }],
    ['the same host', { VITE_CVG_API_ORIGIN: 'https://console.cvg.test:8443' }],
    ['NODE_ENV=test', { NODE_ENV: 'test' }],
    ['simulation identity', { VITE_CVG_WEB_IDENTITY_MODE: 'simulation' }],
    ['controlled test', { VITE_CVG_CONTROLLED_TEST: 'true' }],
    ['an unknown login', { VITE_CVG_OPERATOR_LOGIN: 'saml' }]
  ])('refuses the OIDC profile with %s', (_name, patch) => {
    expect(() => resolveConsoleBuildProfile({ ...valid, ...patch })).toThrow()
  })

  it('refuses a partial current profile', () => {
    for (const patch of [
      { VITE_CVG_CONSOLE_ORIGIN: 'https://console.cvg.test' },
      { VITE_CVG_API_ORIGIN: 'https://api.cvg.test' }
    ]) {
      expect(() =>
        resolveConsoleBuildProfile({ NODE_ENV: 'production', ...patch })
      ).toThrow(/parcial/)
    }
  })
})

describe('SPEC0259 Q6 — single transport', () => {
  it('builds only API URLs under /v1/ of the compiled origin', () => {
    const apiUrl = createApiUrl({
      kind: 'oidc',
      consoleOrigin: 'https://console.cvg.test',
      apiOrigin: API
    })
    expect(apiUrl('/v1/x')).toBe(`${API}/v1/x`)
    expect(apiUrl('/v1/session?x=1')).toBe(`${API}/v1/session?x=1`)
    for (const path of [
      '//evil.other.test/v1/x',
      'https://evil.other.test/v1/x',
      '/v1/../x',
      '/v1/%2e%2e/x',
      '/v1/%2E%2E/x',
      '\\\\evil',
      '/v1/\\x',
      '/v1/\nx',
      '/v1/\tx',
      '/v1/\u0000x',
      '/v1/\u007fx',
      '/x',
      'v1/x',
      ''
    ]) {
      expect(() => apiUrl(path), JSON.stringify(path)).toThrow()
    }
    const current = createApiUrl({ kind: 'current' })
    expect(current('/v1/session')).toBe('/v1/session')
  })

  it('never calls fetch for a path that escapes /v1/', async () => {
    const fetch = route({})
    await expect(
      apiClient.getTimeline('../../x', {
        operatorId: identity.operatorId,
        role: 'Operator'
      })
    ).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('accepts only https: authorization URLs without credentials', () => {
    expect(parseAuthorizationUrl('https://localhost:9443/authorize?x=1')).toBe(
      'https://localhost:9443/authorize?x=1'
    )
    for (const value of [
      'javascript:alert(1)',
      'http://localhost:9443/authorize',
      'https://user:secret@localhost/authorize',
      'https://user@localhost/authorize',
      'not a url',
      42,
      null
    ]) {
      expect(parseAuthorizationUrl(value), String(value)).toBeNull()
    }
  })
})

describe('SPEC0259 Q6 — OIDC console states', () => {
  it('asks to sign in on the first visit and calls only the API origin with cookies', async () => {
    const fetch = route({
      [SESSION_URL]: { status: 401, body: failure('unauthorized') }
    })
    renderConsole()
    expect(
      await screen.findByText('Entre com sua conta para continuar.')
    ).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Entrar' })
    await waitFor(() => expect(document.activeElement).toBe(button))
    for (const [url, init] of fetch.mock.calls) {
      expect(String(url).startsWith(`${API}/v1/`)).toBe(true)
      expect(init?.credentials).toBe('include')
      expect(init?.headers ?? {}).toEqual({})
    }
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it('restores by cookie and loads the panels at the API origin', async () => {
    const fetch = route({ [SESSION_URL]: session(), ...emptyPanels() })
    renderConsole()
    expect(await screen.findByText(identity.operatorId)).toBeTruthy()
    await waitFor(() =>
      expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(
        expect.arrayContaining(Object.values(PANELS))
      )
    )
    for (const [, init] of fetch.mock.calls) {
      expect(init?.credentials).toBe('include')
      expect(init?.headers ?? {}).toEqual({})
    }
  })

  it.each([
    ['503', { status: 503, body: failure('configuration_error') }],
    ['429', { status: 429, body: failure('rate_limited') }],
    ['network', 'network']
  ] as const)(
    'treats a session %s as unavailable and retries on demand',
    async (_name, answer) => {
      let current: Answer = answer
      route({ [SESSION_URL]: () => current, ...emptyPanels() })
      renderConsole()
      expect(
        await screen.findByText(
          'Sessão indisponível no momento. Tente novamente.'
        )
      ).toBeTruthy()
      const retry = screen.getByRole('button', { name: 'Tentar novamente' })
      await waitFor(() => expect(document.activeElement).toBe(retry))
      expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull()
      current = session()
      fireEvent.click(retry)
      expect(await screen.findByText(identity.operatorId)).toBeTruthy()
    }
  )

  it('shows a configuration error without action on a session 403', async () => {
    route({ [SESSION_URL]: { status: 403, body: failure('forbidden') } })
    renderConsole()
    const notice = await screen.findByText(
      'A configuração do console não é aceita pela API.'
    )
    expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Tentar novamente' })
    ).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(notice))
  })

  it('makes no call at all from a divergent origin', async () => {
    profile.consoleOrigin = 'https://console.cvg.test'
    const fetch = route({ [SESSION_URL]: session(), ...emptyPanels() })
    renderConsole()
    expect(
      await screen.findByText('Configuração do console inválida.')
    ).toBeTruthy()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('starts the login by keyboard-reachable button and navigates to the IdP', async () => {
    let releaseStart: (answer: Answer) => void = () => undefined
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url === SESSION_URL) {
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve(failure('unauthorized'))
        } as Response)
      }
      if (url === START_URL) {
        return new Promise<Answer>((resolve) => {
          releaseStart = resolve
        }).then(
          (answer) =>
            ({
              ok: true,
              status: (answer as { status: number }).status,
              json: () => Promise.resolve((answer as { body: unknown }).body)
            }) as Response
        )
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })
    const navigate = renderConsole()
    const button = await screen.findByRole('button', { name: 'Entrar' })
    fireEvent.click(button)
    expect(await screen.findByText('Abrindo o login…')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Entrar' }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
    const startCall = fetch.mock.calls.find(
      ([url]) => String(url) === START_URL
    )!
    expect(startCall[1]?.method).toBe('POST')
    expect(startCall[1]?.body ?? null).toBeNull()
    expect(startCall[1]?.credentials).toBe('include')
    expect(startCall[1]?.headers ?? {}).toEqual({})
    await act(async () => {
      releaseStart({
        status: 200,
        body: envelope({
          authorizationUrl: 'https://localhost:9443/authorize?state=s'
        })
      })
    })
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(
        'https://localhost:9443/authorize?state=s'
      )
    )
    expect(
      fetch.mock.calls.filter(([url]) => String(url) === START_URL)
    ).toHaveLength(1)
  })

  it.each([
    'javascript:alert(1)',
    'http://localhost:9443/authorize',
    'https://user:secret@localhost:9443/authorize'
  ])(
    'never navigates to the authorization URL %s',
    async (authorizationUrl) => {
      route({
        [SESSION_URL]: { status: 401, body: failure('unauthorized') },
        [START_URL]: { status: 200, body: envelope({ authorizationUrl }) }
      })
      const navigate = renderConsole()
      fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
      expect(
        await screen.findByText('Configuração do console inválida.')
      ).toBeTruthy()
      expect(navigate).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['503', { status: 503, body: failure('configuration_error') }],
    ['429', { status: 429, body: failure('rate_limited') }],
    ['network', 'network']
  ] as const)(
    'offers the login again when the start fails with %s',
    async (_name, answer) => {
      route({
        [SESSION_URL]: { status: 401, body: failure('unauthorized') },
        [START_URL]: answer
      })
      const navigate = renderConsole()
      fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
      // jsdom keeps the focus on the disabled button: move it to another
      // element so the assertion below sees the console return it.
      const elsewhere = document.createElement('input')
      document.body.appendChild(elsewhere)
      elsewhere.focus()
      expect(document.activeElement).toBe(elsewhere)
      expect(
        await screen.findByText(
          'Login indisponível no momento. Tente novamente.'
        )
      ).toBeTruthy()
      const button = screen.getByRole('button', { name: 'Entrar' })
      expect((button as HTMLButtonElement).disabled).toBe(false)
      await waitFor(() => expect(document.activeElement).toBe(button))
      elsewhere.remove()
      expect(navigate).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['400', { status: 400, body: failure('validation_failed') }],
    ['403', { status: 403, body: failure('forbidden') }]
  ] as const)(
    'shows a configuration error when the start answers %s',
    async (_name, answer) => {
      route({
        [SESSION_URL]: { status: 401, body: failure('unauthorized') },
        [START_URL]: answer
      })
      const navigate = renderConsole()
      fireEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
      expect(
        await screen.findByText(
          'A configuração do console não é aceita pela API.'
        )
      ).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Entrar' })).toBeNull()
      expect(navigate).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['#cvg-login=negado', 'Não foi possível entrar com esta conta.'],
    [
      '#cvg-login=indisponivel',
      'Login indisponível no momento. Tente novamente.'
    ]
  ])('reads the landing fragment %s once and clears it', async (hash, text) => {
    window.history.replaceState(null, '', `/${hash}`)
    const replace = vi.spyOn(window.history, 'replaceState')
    route({ [SESSION_URL]: { status: 401, body: failure('unauthorized') } })
    renderConsole()
    expect(await screen.findByText(text)).toBeTruthy()
    expect(window.location.hash).toBe('')
    expect(window.location.href).toBe(`${window.location.origin}/`)
    expect(replace).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy()
  })

  it('ignores any other fragment and leaves it in place', async () => {
    window.history.replaceState(null, '', '/#cvg-login=negado-mais')
    route({ [SESSION_URL]: { status: 401, body: failure('unauthorized') } })
    renderConsole()
    expect(
      await screen.findByText('Entre com sua conta para continuar.')
    ).toBeTruthy()
    expect(window.location.hash).toBe('#cvg-login=negado-mais')
  })

  it('expires by timer and by a later 401', async () => {
    const soon = new Date(Date.now() + 300).toISOString()
    route({ [SESSION_URL]: session(soon), ...emptyPanels() })
    renderConsole()
    expect(await screen.findByText(identity.operatorId)).toBeTruthy()
    expect(
      await screen.findByText('A sessão expirou. Entre novamente.', undefined, {
        timeout: 3_000
      })
    ).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Entrar' })
    await waitFor(() => expect(document.activeElement).toBe(button))
  })

  it('expires when a panel answers 401 after the session', async () => {
    route({
      [SESSION_URL]: session(),
      ...emptyPanels(),
      [PANELS.tasks]: { status: 401, body: failure('unauthorized') }
    })
    renderConsole()
    expect(
      await screen.findByText('A sessão expirou. Entre novamente.')
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy()
  })

  it('ends the session, says so and focuses the login', async () => {
    route({
      [SESSION_URL]: session(),
      ...emptyPanels(),
      [LOGOUT_URL]: { status: 200, body: envelope({ loggedOut: true }) }
    })
    renderConsole()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Encerrar sessão' })
    )
    expect(await screen.findByText('Sessão encerrada.')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Entrar' })
    await waitFor(() => expect(document.activeElement).toBe(button))
  })

  it('keeps the current logout behavior when the API cannot revoke', async () => {
    route({
      [SESSION_URL]: session(),
      ...emptyPanels(),
      [LOGOUT_URL]: { status: 503, body: failure('configuration_error') }
    })
    renderConsole()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Encerrar sessão' })
    )
    expect(
      await screen.findByText('Não foi possível encerrar a sessão no servidor.')
    ).toBeTruthy()
    expect(screen.queryByText(identity.operatorId)).toBeNull()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy()
  })

  it('tells "no permission" from "unavailable" in the panels', async () => {
    route({
      [SESSION_URL]: session(),
      ...emptyPanels(),
      [PANELS.tasks]: { status: 403, body: failure('forbidden') },
      [PANELS.approvals]: { status: 503, body: failure('configuration_error') }
    })
    renderConsole()
    expect(
      await screen.findByText('Sem permissão para esta área.')
    ).toBeTruthy()
    expect(
      await screen.findByText('Erro ao carregar dados operacionais.')
    ).toBeTruthy()
  })
})
