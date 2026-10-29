/**
 * SPEC 0263 D09/D13: a provider waiting on a slow DNS answer with the request
 * signal reports `cancelled` (abort) or `timeout`, never an invalid endpoint,
 * and the transport is never entered. DNS and fetch are injected.
 */
import { describe, expect, it, vi } from 'vitest'
import type { ProviderRequest } from '../contracts.ts'
import { OpenAICompatibleProvider } from '../providers/openai-compatible.ts'

function providerRequest(
  overrides: Partial<ProviderRequest> = {}
): ProviderRequest {
  return {
    requestId: 'req_0263_0001',
    tenantId: 'tenant_0263' as ProviderRequest['tenantId'],
    correlationId: 'corr_00000000-0000-4000-8000-000000000263',
    model: 'synthetic-model',
    input: { messages: [{ role: 'user', content: 'ola' }] },
    temperature: 0,
    maxTokens: 16,
    promptSha256: 'a'.repeat(64),
    signal: new AbortController().signal,
    timeoutMs: 5_000,
    ...overrides
  }
}

function provider(dnsLookup: () => Promise<readonly string[]>) {
  const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))
  return {
    fetchSpy,
    provider: new OpenAICompatibleProvider({
      id: 'synthetic-provider',
      baseUrl: 'https://provider.example/v1',
      model: 'synthetic-model',
      location: 'external',
      allowedHosts: ['provider.example'],
      apiKey: 'synthetic-key-not-a-secret',
      dnsLookup,
      fetch: fetchSpy
    } as ConstructorParameters<typeof OpenAICompatibleProvider>[0])
  }
}

describe('SPEC 0263 D13: provider with a slow DNS and the request signal', () => {
  it('abort while DNS is pending reports cancelled and never fetches', async () => {
    let release!: (addresses: readonly string[]) => void
    const pending = new Promise<readonly string[]>((resolve) => {
      release = resolve
    })
    const { provider: subject, fetchSpy } = provider(() => pending)
    const controller = new AbortController()
    const operation = subject.execute(
      providerRequest({ signal: controller.signal })
    )
    controller.abort()
    await expect(operation).rejects.toMatchObject({ kind: 'cancelled' })
    release(['93.184.216.34'])
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('the request timeout during DNS reports timeout, not an endpoint error', async () => {
    const keepAlive = setTimeout(() => undefined, 1000)
    try {
      const { provider: subject, fetchSpy } = provider(
        () => new Promise<readonly string[]>(() => undefined)
      )
      await expect(
        subject.execute(providerRequest({ timeoutMs: 40 }))
      ).rejects.toMatchObject({ kind: 'timeout' })
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      clearTimeout(keepAlive)
    }
  })
})
