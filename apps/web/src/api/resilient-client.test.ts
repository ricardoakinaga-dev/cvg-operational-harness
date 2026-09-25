/**
 * AUD19-010 — trusted identity and resilient requests (fetch mocked, no
 * network). The default `apiClient` keeps simulation bytes; every behavior
 * below is pinned with explicit configuration + reset.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiRequestError,
  ApiSession,
  apiClient,
  configureApiClientOptions,
  resetApiClientOptions,
  tokenAuthHeaders,
  type OperatorIdentity
} from './client.ts'

const identity: OperatorIdentity = {
  operatorId: 'operator.synthetic',
  role: 'Operator',
  tenantId: 'tenant_00000000-0000-4000-8000-000000000a01'
}

const envelope = <T>(data: T, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () =>
      Promise.resolve({
        success: true,
        data,
        error: null,
        meta: { correlationId: 'corr_test' }
      })
  } as Response)

const failureEnvelope = (status: number, code: string, message: string) =>
  Promise.resolve({
    ok: false,
    status,
    json: () =>
      Promise.resolve({
        success: false,
        data: null,
        error: { code, message },
        meta: { correlationId: 'corr_test' }
      })
  } as Response)

afterEach(() => {
  resetApiClientOptions()
  vi.restoreAllMocks()
})

describe('trusted identity adapter (AUD19-010)', () => {
  it('sends the trusted token instead of simulation headers', async () => {
    const calls: Array<RequestInit | undefined> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      calls.push(init)
      return envelope([])
    })
    configureApiClientOptions({
      auth: tokenAuthHeaders(() => 'trusted-token-abc')
    })
    await apiClient.listTasks(identity)
    expect(calls[0]?.headers).toEqual({
      'x-cvg-operator-token': 'trusted-token-abc'
    })
  })

  it('fails closed without a token and clears the session on 401', async () => {
    const session = new ApiSession(identity)
    session.setToken('expired-token')
    configureApiClientOptions({
      auth: tokenAuthHeaders(() => session.token),
      onUnauthorized: () => session.noteUnauthorized()
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      failureEnvelope(401, 'unauthorized', 'nope')
    )
    await expect(apiClient.listTasks(identity)).rejects.toMatchObject({
      status: 401
    })
    expect(session.token).toBeNull()
  })

  it('clears the token and advances the generation on identity switch', async () => {
    const session = new ApiSession(identity)
    session.setToken('token-a')
    const generation = session.generation
    expect(session.isStale(generation)).toBe(false)
    session.setIdentity({
      operatorId: 'other.operator',
      role: 'Operator',
      tenantId: 'tenant_00000000-0000-4000-8000-000000000a02'
    })
    expect(session.token).toBeNull()
    expect(session.isStale(generation)).toBe(true)
    expect(session.isStale(session.generation)).toBe(false)
  })
})

describe('resilient requests (AUD19-010)', () => {
  it('times out a hanging request with a predictable error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          )
        })
    )
    configureApiClientOptions({ timeoutMs: 50 })
    await expect(apiClient.listTasks(identity)).rejects.toMatchObject({
      code: 'timeout'
    })
  })

  it('maps non-JSON responses to request_failed without throwing SyntaxError', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new SyntaxError('not json'))
        }) as Promise<Response>
    )
    await expect(apiClient.listTasks(identity)).rejects.toMatchObject({
      code: 'request_failed'
    })
  })

  it('maps offline failures to network_unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.reject(new TypeError('Failed to fetch'))
    )
    configureApiClientOptions({ maxGetRetries: 0 })
    await expect(apiClient.listTasks(identity)).rejects.toMatchObject({
      code: 'network_unavailable'
    })
  })

  it('retries idempotent GETs on 503 and succeeds', async () => {
    let calls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      calls += 1
      return calls === 1
        ? failureEnvelope(503, 'internal_error', 'boom')
        : envelope([])
    })
    const tasks = await apiClient.listTasks(identity)
    expect(tasks).toEqual([])
    expect(calls).toBe(2)
  })

  it('never retries mutations', async () => {
    let calls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      calls += 1
      return failureEnvelope(503, 'internal_error', 'boom')
    })
    await expect(
      apiClient.updateTaskStatus({
        taskId: 'task_1',
        status: 'done',
        identity
      })
    ).rejects.toMatchObject({ status: 503 })
    expect(calls).toBe(1)
  })

  it('does not retry 403 and surfaces the envelope code', async () => {
    let calls = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      calls += 1
      return failureEnvelope(403, 'forbidden', 'denied')
    })
    const error = await apiClient
      .listTasks(identity)
      .catch((error: unknown) => error)
    expect(error).toMatchObject({ status: 403, code: 'forbidden' })
    expect(calls).toBe(1)
  })

  it('propagates an outer abort without retrying', async () => {
    let calls = 0
    const controller = new AbortController()
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      calls += 1
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        )
      })
    })
    const pending = apiClient.searchJourneyOwners(
      identity,
      '+551100000000',
      controller.signal
    )
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(ApiRequestError)
    expect(calls).toBe(1)
  })
})
