/**
 * SPEC 0263 — cancellation during DNS and between hops (AUD0625 U06/HISO-011).
 * Every DNS lookup and fetch is injected; no socket or real resolver is used.
 * IDs D01–D11 follow the acceptance table of the SPEC.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchWithSsrfGuard,
  resolveAndGuardOutboundUrl,
  type GuardedFetchResponse
} from '../ssrf.ts'

const OPTIONS = { allowedHosts: ['public.example', 'next.example'] }
const PUBLIC = ['93.184.216.34']

function response(
  status = 200,
  location: string | null = null,
  cancel?: () => Promise<unknown>
): GuardedFetchResponse {
  return {
    status,
    headers: { get: () => location },
    ...(cancel ? { body: { cancel } } : {})
  }
}

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Counts the listeners the guard installs and removes on a signal. */
function trackedController() {
  const controller = new AbortController()
  const signal = controller.signal
  let installed = 0
  let removed = 0
  const add = signal.addEventListener.bind(signal)
  const remove = signal.removeEventListener.bind(signal)
  signal.addEventListener = ((...args: Parameters<typeof add>) => {
    installed += 1
    add(...args)
  }) as typeof signal.addEventListener
  signal.removeEventListener = ((...args: Parameters<typeof remove>) => {
    removed += 1
    remove(...args)
  }) as typeof signal.removeEventListener
  return {
    controller,
    signal,
    balance: () => installed - removed,
    installed: () => installed
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => unhandled.push(reason)
process.on('unhandledRejection', onUnhandled)
afterEach(() => {
  unhandled.length = 0
})

describe('SPEC 0263 D01: an aborted signal starts nothing', () => {
  it('pre-aborted: zero lookups and zero fetches', async () => {
    const controller = new AbortController()
    controller.abort()
    const dnsLookup = vi.fn(async () => PUBLIC)
    const fetchImpl = vi.fn(async () => response())
    await expect(
      fetchWithSsrfGuard(
        fetchImpl,
        'https://public.example/',
        { signal: controller.signal },
        OPTIONS,
        { dnsLookup }
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(dnsLookup).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('pre-aborted with a literal IP and a custom reason: no fetch, no leak', async () => {
    const controller = new AbortController()
    controller.abort('secret custom reason')
    const fetchImpl = vi.fn(async () => response())
    const error = await fetchWithSsrfGuard(
      fetchImpl,
      'https://93.184.216.34/',
      { signal: controller.signal },
      { allowedHosts: ['93.184.216.34'] }
    ).catch((caught: unknown) => caught as Error)
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ name: 'AbortError' })
    expect(String((error as Error).message)).not.toContain('secret')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('a thunk that aborts synchronously and returns a pending promise settles without a lost listener', async () => {
    const tracked = trackedController()
    const never = deferred<readonly string[]>()
    const dnsLookup = vi.fn(() => {
      tracked.controller.abort()
      return never.promise
    })
    await expect(
      resolveAndGuardOutboundUrl('https://public.example/', OPTIONS, {
        dnsLookup,
        signal: tracked.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(tracked.balance()).toBe(0)
    // The pending promise later rejects: it is observed, not unhandled.
    never.reject(new Error('late lookup failure'))
    await flush()
    expect(unhandled).toEqual([])
  })

  it('a synchronous throw of the lookup is observed as a DNS failure', async () => {
    const tracked = trackedController()
    const controller = tracked.controller
    const dnsLookup = vi.fn(() => {
      throw new Error('sync resolver crash')
    })
    await expect(
      resolveAndGuardOutboundUrl('https://public.example/', OPTIONS, {
        dnsLookup: dnsLookup as never,
        signal: controller.signal
      })
    ).rejects.toMatchObject({
      name: 'UnsafeUrlError',
      reason: 'dns_resolution_failed'
    })
    // Review P3-b: the listener is released on the synchronous-throw exit too.
    expect(tracked.installed()).toBeGreaterThan(0)
    expect(tracked.balance()).toBe(0)
  })
})

describe('SPEC 0263 D02–D04: abort while waiting', () => {
  it('D02: abort during the initial DNS ends without waiting; releasing it later never fetches', async () => {
    const controller = new AbortController()
    const pending = deferred<readonly string[]>()
    const fetchImpl = vi.fn(async () => response())
    const operation = fetchWithSsrfGuard(
      fetchImpl,
      'https://public.example/',
      { signal: controller.signal },
      OPTIONS,
      { dnsLookup: () => pending.promise }
    )
    controller.abort()
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    pending.resolve(PUBLIC)
    await flush()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('D03: abort during the second hop DNS: only the first fetch happened', async () => {
    const controller = new AbortController()
    const second = deferred<readonly string[]>()
    let lookups = 0
    const dnsLookup = () => {
      lookups += 1
      return lookups === 1 ? Promise.resolve(PUBLIC) : second.promise
    }
    const fetchImpl = vi.fn(async () =>
      fetchImpl.mock.calls.length === 1
        ? response(302, 'https://next.example/')
        : response()
    )
    const operation = fetchWithSsrfGuard(
      fetchImpl,
      'https://public.example/',
      { signal: controller.signal },
      OPTIONS,
      { dnsLookup }
    )
    await vi.waitFor(() => expect(lookups).toBe(2))
    controller.abort()
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    second.resolve(PUBLIC)
    await flush()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('D04: late rejections of lookup and fetch after abort stay observed', async () => {
    const dnsController = new AbortController()
    const lateLookup = deferred<readonly string[]>()
    const first = fetchWithSsrfGuard(
      vi.fn(async () => response()),
      'https://public.example/',
      { signal: dnsController.signal },
      OPTIONS,
      { dnsLookup: () => lateLookup.promise }
    )
    dnsController.abort()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    lateLookup.reject(new Error('late dns error'))

    const fetchController = new AbortController()
    const lateFetch = deferred<GuardedFetchResponse>()
    const second = fetchWithSsrfGuard(
      () => lateFetch.promise,
      'https://public.example/',
      { signal: fetchController.signal },
      OPTIONS,
      { dnsLookup: async () => PUBLIC }
    )
    await flush()
    fetchController.abort()
    await expect(second).rejects.toMatchObject({ name: 'AbortError' })
    lateFetch.reject(new Error('late fetch error'))
    await flush()
    expect(unhandled).toEqual([])
  })
})

describe('SPEC 0263 D05–D06: one deadline, last check before dispatch', () => {
  it('D05: a timeout signal bounds slow DNS and several hops without renewal', async () => {
    const signal = AbortSignal.timeout(80)
    const keepAlive = setTimeout(() => undefined, 1000)
    const started = Date.now()
    const slowDns = () =>
      new Promise<readonly string[]>((resolve) =>
        setTimeout(() => resolve(PUBLIC), 30)
      )
    const fetchImpl = vi.fn(async () => response(302, '/again'))
    try {
      await expect(
        fetchWithSsrfGuard(
          fetchImpl,
          'https://public.example/',
          { signal },
          OPTIONS,
          { dnsLookup: slowDns }
        )
      ).rejects.toMatchObject({ name: 'TimeoutError' })
    } finally {
      clearTimeout(keepAlive)
    }
    // 80 ms original deadline; three 30 ms lookups would need 90 ms or more.
    expect(Date.now() - started).toBeLessThan(400)
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('D06: abort right after DNS resolves and before dispatch never enters the transport', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async () => response())
    const dnsLookup = () => {
      const resolved = Promise.resolve(PUBLIC)
      void resolved.then(() => controller.abort())
      return resolved
    }
    await expect(
      fetchWithSsrfGuard(
        fetchImpl,
        'https://public.example/',
        { signal: controller.signal },
        OPTIONS,
        { dnsLookup }
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('SPEC 0263 D07–D09: behaviour without abort is preserved', () => {
  it('D07: immediate and delayed DNS, relative and absolute redirects within the limit', async () => {
    const controller = new AbortController()
    const delayed = () =>
      new Promise<readonly string[]>((resolve) =>
        setTimeout(() => resolve(PUBLIC), 5)
      )
    const hops = [
      response(301, '/relative'),
      response(302, 'https://next.example/absolute'),
      response(200)
    ]
    const fetchImpl = vi.fn<(url: string) => Promise<GuardedFetchResponse>>(
      async () => hops.shift()!
    )
    const result = await fetchWithSsrfGuard(
      fetchImpl,
      'https://public.example/',
      { signal: controller.signal },
      OPTIONS,
      { dnsLookup: delayed }
    )
    expect(result.status).toBe(200)
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      'https://public.example/',
      'https://public.example/relative',
      'https://next.example/absolute'
    ])
    await expect(
      fetchWithSsrfGuard(
        async () => response(302, '/loop'),
        'https://public.example/',
        { signal: controller.signal },
        { ...OPTIONS, maxRedirects: 2 },
        { dnsLookup: async () => PUBLIC }
      )
    ).rejects.toMatchObject({ reason: 'too_many_redirects' })
  })

  it('D08: private, mixed, empty and failed resolution stay refused with a signal present', async () => {
    const controller = new AbortController()
    for (const [dnsLookup, reason] of [
      [async () => ['10.9.8.7'], 'dns_private_address'],
      [async () => [PUBLIC[0]!, '10.9.8.7'], 'dns_private_address'],
      [async () => [], 'dns_no_addresses'],
      [
        async () => {
          throw new Error('nxdomain')
        },
        'dns_resolution_failed'
      ]
    ] as const) {
      const error = await resolveAndGuardOutboundUrl(
        'https://public.example/',
        OPTIONS,
        { dnsLookup, signal: controller.signal }
      ).catch((caught: unknown) => caught as Error)
      expect(error).toMatchObject({ name: 'UnsafeUrlError' })
      expect(error).toMatchObject({ reason })
    }
  })

  it('D09: cancellation during DNS is never reported as a DNS failure', async () => {
    const controller = new AbortController()
    const pending = deferred<readonly string[]>()
    const operation = resolveAndGuardOutboundUrl(
      'https://public.example/',
      OPTIONS,
      { dnsLookup: () => pending.promise, signal: controller.signal }
    )
    controller.abort(new Error('custom reason object'))
    const error = await operation.catch((caught: unknown) => caught as Error)
    expect(error).toMatchObject({
      name: 'AbortError',
      message: 'The operation was aborted'
    })
    pending.reject(new Error('dns failed after abort'))
    await flush()
    expect(unhandled).toEqual([])
  })

  it('an invalid signal is a TypeError before any I/O', async () => {
    const dnsLookup = vi.fn(async () => PUBLIC)
    await expect(
      fetchWithSsrfGuard(
        vi.fn(async () => response()),
        'https://public.example/',
        { signal: { aborted: false } },
        OPTIONS,
        { dnsLookup }
      )
    ).rejects.toBeInstanceOf(TypeError)
    expect(dnsLookup).not.toHaveBeenCalled()
  })
})

describe('SPEC 0263 D10–D11: discarded responses and listeners', () => {
  it('D10: a redirect body is cancelled before the next DNS, even when cancel and DNS stay pending', async () => {
    const order: string[] = []
    const controller = new AbortController()
    const nextDns = deferred<readonly string[]>()
    let lookups = 0
    const dnsLookup = () => {
      lookups += 1
      if (lookups === 1) return Promise.resolve(PUBLIC)
      order.push('dns:2')
      return nextDns.promise
    }
    const neverCancel = () => {
      order.push('cancel')
      return new Promise<unknown>(() => undefined)
    }
    const operation = fetchWithSsrfGuard(
      async () => response(302, 'https://next.example/', neverCancel),
      'https://public.example/',
      { signal: controller.signal },
      OPTIONS,
      { dnsLookup }
    )
    await vi.waitFor(() => expect(order).toEqual(['cancel', 'dns:2']))
    controller.abort()
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('D10: a rejected cancel is observed and never replaces the main error', async () => {
    const error = await fetchWithSsrfGuard(
      async () =>
        response(302, 'https://elsewhere.example/', () =>
          Promise.reject(new Error('cancel failed'))
        ),
      'https://public.example/',
      undefined,
      OPTIONS,
      { dnsLookup: async () => PUBLIC }
    ).catch((caught: unknown) => caught as Error)
    expect(error).toMatchObject({ name: 'UnsafeUrlError' })
    await flush()
    expect(unhandled).toEqual([])
  })

  it('D10: a response that arrives after the abort is cancelled, a terminal one stays with the caller', async () => {
    const controller = new AbortController()
    const late = deferred<GuardedFetchResponse>()
    const cancel = vi.fn(async () => undefined)
    const operation = fetchWithSsrfGuard(
      () => late.promise,
      'https://public.example/',
      { signal: controller.signal },
      OPTIONS,
      { dnsLookup: async () => PUBLIC }
    )
    await flush()
    controller.abort()
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    late.resolve(response(200, null, cancel))
    await flush()
    expect(cancel).toHaveBeenCalledTimes(1)

    const terminalCancel = vi.fn(async () => undefined)
    const delivered = await fetchWithSsrfGuard(
      async () => response(200, null, terminalCancel),
      'https://public.example/',
      { signal: new AbortController().signal },
      OPTIONS,
      { dnsLookup: async () => PUBLIC }
    )
    expect(delivered.status).toBe(200)
    expect(terminalCancel).not.toHaveBeenCalled()
  })

  it('D11: every listener the guard installs is removed on success, error and abort', async () => {
    const ok = trackedController()
    await fetchWithSsrfGuard(
      async () => response(),
      'https://public.example/',
      { signal: ok.signal },
      OPTIONS,
      { dnsLookup: async () => PUBLIC }
    )
    expect(ok.installed()).toBeGreaterThan(0)
    expect(ok.balance()).toBe(0)

    const failed = trackedController()
    await fetchWithSsrfGuard(
      async () => {
        throw new Error('transport down')
      },
      'https://public.example/',
      { signal: failed.signal },
      OPTIONS,
      { dnsLookup: async () => PUBLIC }
    ).catch(() => undefined)
    expect(failed.balance()).toBe(0)

    const aborted = trackedController()
    const pending = fetchWithSsrfGuard(
      () => new Promise<GuardedFetchResponse>(() => undefined),
      'https://public.example/',
      { signal: aborted.signal },
      OPTIONS,
      { dnsLookup: async () => PUBLIC }
    )
    await flush()
    aborted.controller.abort()
    await pending.catch(() => undefined)
    expect(aborted.balance()).toBe(0)

    // A later positive call on a fresh signal is unaffected.
    const again = await fetchWithSsrfGuard(
      async () => response(),
      'https://public.example/',
      { signal: new AbortController().signal },
      OPTIONS,
      { dnsLookup: async () => PUBLIC }
    )
    expect(again.status).toBe(200)
  })
})

describe('SPEC 0263 review P3 (AUD0625-REVIEW-0263-D9)', () => {
  it('P3-a: the guard alone refuses a literal IP when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      resolveAndGuardOutboundUrl(
        'https://93.184.216.34/',
        { allowedHosts: ['93.184.216.34'] },
        { signal: controller.signal }
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('P3-a: the guard alone discards a resolution that finishes after the abort (exam-egress path)', async () => {
    const controller = new AbortController()
    const dnsLookup = () => {
      const resolved = Promise.resolve(PUBLIC)
      void resolved.then(() => controller.abort())
      return resolved
    }
    await expect(
      resolveAndGuardOutboundUrl('https://public.example/', OPTIONS, {
        dnsLookup,
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('P3-c: with an aborted signal, cancellation wins over an invalid URL', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      resolveAndGuardOutboundUrl('not a url', OPTIONS, {
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
