/**
 * AUD19-007 — composed egress guard: static policy plus resolution.
 *
 * All DNS and fetch behavior is injected (no real network). A live
 * loopback integration case at the bottom uses real node:http + real DNS
 * with explicit private-network opt-in.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithSsrfGuard, resolveAndGuardOutboundUrl } from '../ssrf.ts'

const PUBLIC_IP = '93.184.216.34'
const PRIVATE_IP = '10.9.8.7'
const PRIVATE_V6 = 'fd00::99'

const publicDns = async () => [PUBLIC_IP]
const privateDns = async () => [PRIVATE_IP]
const mixedDns = async () => [PUBLIC_IP, PRIVATE_IP]
const failingDns = async () => {
  throw new Error('synthetic DNS outage')
}
const emptyDns = async () => []

function fakeFetch(
  handler: (url: string) => { status: number; location?: string }
) {
  const seen: string[] = []
  const impl = async (url: string, init?: Record<string, unknown>) => {
    void init
    seen.push(url)
    const { status, location } = handler(url)
    return {
      status,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'location' ? (location ?? null) : null
      }
    }
  }
  return { impl, seen }
}

describe('resolveAndGuardOutboundUrl (AUD19-007)', () => {
  it('denies an allowlisted host that resolves to a private address', async () => {
    await expect(
      resolveAndGuardOutboundUrl(
        'https://provider.example.test/chat',
        { allowedHosts: ['provider.example.test'] },
        { dnsLookup: privateDns }
      )
    ).rejects.toMatchObject({ name: 'UnsafeUrlError' })
  })

  it('allows an allowlisted host with public-only resolution', async () => {
    const guarded = await resolveAndGuardOutboundUrl(
      'https://provider.example.test/chat',
      { allowedHosts: ['provider.example.test'] },
      { dnsLookup: publicDns }
    )
    expect(guarded.url.hostname).toBe('provider.example.test')
    expect(guarded.resolvedAddresses).toEqual([PUBLIC_IP])
  })

  it('requires loopback-only answers for an explicit local HTTP opt-in', async () => {
    await expect(
      resolveAndGuardOutboundUrl(
        'http://local.example.test/ping',
        {
          allowHttp: true,
          allowPrivateNetworks: true,
          allowLoopbackOnly: true
        },
        { dnsLookup: publicDns }
      )
    ).rejects.toThrow(/loopback_address_required/)

    const guarded = await resolveAndGuardOutboundUrl(
      'http://127.0.0.1/ping',
      {
        allowHttp: true,
        allowPrivateNetworks: true,
        allowLoopbackOnly: true
      },
      { dnsLookup: publicDns }
    )
    expect(guarded.resolvedAddresses).toEqual(['127.0.0.1'])
  })

  it('denies when any resolved address is private (multi-answer)', async () => {
    await expect(
      resolveAndGuardOutboundUrl(
        'https://multi.example.test/',
        {},
        { dnsLookup: mixedDns }
      )
    ).rejects.toThrow(/dns_private_address/)
  })

  it('denies IPv6 private resolutions and literals without DNS', async () => {
    const lookup = vi.fn(async () => [PUBLIC_IP])
    await expect(
      resolveAndGuardOutboundUrl(
        'https://v6.example.test/',
        {},
        { dnsLookup: async () => [PRIVATE_V6] }
      )
    ).rejects.toThrow(/dns_private_address/)
    await expect(
      resolveAndGuardOutboundUrl('http://[fd00::1]/', { allowHttp: true })
    ).rejects.toThrow(/private_network_address/)
    expect(lookup).not.toHaveBeenCalled()
  })

  it('denies decimal-IP obfuscation that resolves to loopback', async () => {
    // Node normalizes http://2130706433/ to 127.0.0.1: denied statically.
    // A resolver that maps an opaque hostname to loopback is denied by DNS.
    await expect(
      resolveAndGuardOutboundUrl(
        'http://2130706433/',
        { allowHttp: true },
        { dnsLookup: async () => ['127.0.0.1'] }
      )
    ).rejects.toThrow(/private_network_address/)
    await expect(
      resolveAndGuardOutboundUrl(
        'http://opaque.example.test/',
        { allowHttp: true },
        { dnsLookup: async () => ['127.0.0.1'] }
      )
    ).rejects.toThrow(/dns_private_address/)
  })

  it('fails closed on DNS outage and empty resolution', async () => {
    await expect(
      resolveAndGuardOutboundUrl(
        'https://down.example.test/',
        {},
        { dnsLookup: failingDns }
      )
    ).rejects.toThrow(/dns_resolution_failed/)
    await expect(
      resolveAndGuardOutboundUrl(
        'https://empty.example.test/',
        {},
        { dnsLookup: emptyDns }
      )
    ).rejects.toThrow(/dns_no_addresses/)
  })

  it('denies rebinding when the second resolution turns private', async () => {
    const answers: string[][] = [[PUBLIC_IP], ['169.254.169.254']]
    const flapping = async () => answers.shift() ?? [PUBLIC_IP]
    const first = await resolveAndGuardOutboundUrl(
      'https://flap.example.test/',
      {},
      { dnsLookup: flapping }
    )
    expect(first.resolvedAddresses).toEqual([PUBLIC_IP])
    await expect(
      resolveAndGuardOutboundUrl(
        'https://flap.example.test/',
        {},
        { dnsLookup: flapping }
      )
    ).rejects.toThrow(/dns_private_address/)
  })

  it('keeps HTTPS-only and credential policy from the static guard', async () => {
    await expect(
      resolveAndGuardOutboundUrl(
        'http://provider.example.test/',
        {},
        { dnsLookup: publicDns }
      )
    ).rejects.toThrow(/protocol_not_allowed/)
    await expect(
      resolveAndGuardOutboundUrl(
        'https://user:pass@provider.example.test/',
        {},
        { dnsLookup: publicDns }
      )
    ).rejects.toThrow(/embedded_credentials/)
  })
})

describe('fetchWithSsrfGuard (AUD19-007)', () => {
  it('passes non-redirect responses through', async () => {
    const { impl, seen } = fakeFetch(() => ({ status: 200 }))
    const response = await fetchWithSsrfGuard(
      impl,
      'https://api.example.test/v1',
      { method: 'GET' },
      {},
      { dnsLookup: publicDns }
    )
    expect(response.status).toBe(200)
    expect(seen).toEqual(['https://api.example.test/v1'])
  })

  it('binds the transport to the validated address instead of re-resolving', async () => {
    type BoundFixtureResponse = {
      status: number
      headers: { get(name: string): string | null }
      address?: string
    }
    const fallback = vi.fn(
      async (): Promise<BoundFixtureResponse> => ({
        status: 500,
        headers: { get: () => null }
      })
    )
    const bound = vi.fn(
      async (
        _url: string,
        _init: Record<string, unknown>,
        addresses: readonly string[]
      ): Promise<BoundFixtureResponse> => ({
        status: 200,
        headers: { get: () => null },
        address: addresses[0] ?? ''
      })
    )
    const response = await fetchWithSsrfGuard<BoundFixtureResponse>(
      fallback,
      'https://api.example.test/v1',
      { method: 'GET' },
      {},
      { dnsLookup: publicDns, boundFetchImpl: bound }
    )
    expect(response.status).toBe(200)
    expect(response.address).toBe(PUBLIC_IP)
    expect(bound).toHaveBeenCalledWith(
      'https://api.example.test/v1',
      expect.objectContaining({ redirect: 'manual' }),
      [PUBLIC_IP]
    )
    expect(fallback).not.toHaveBeenCalled()
  })

  it('re-resolves and re-binds every redirect hop', async () => {
    const answers = [PUBLIC_IP, '93.184.216.35']
    const bound = vi.fn(
      async (
        url: string,
        _init: Record<string, unknown>,
        addresses: readonly string[]
      ) => ({
        status: url.endsWith('/start') ? 302 : 200,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'location' ? '/next' : null
        },
        address: addresses[0]
      })
    )
    const response = await fetchWithSsrfGuard(
      async () => {
        throw new Error('fallback transport must not run')
      },
      'https://api.example.test/start',
      {},
      {},
      {
        dnsLookup: async () => [answers.shift() ?? PUBLIC_IP],
        boundFetchImpl: bound
      }
    )
    expect(response.status).toBe(200)
    expect(bound.mock.calls.map((call) => call[2])).toEqual([
      [PUBLIC_IP],
      ['93.184.216.35']
    ])
  })

  it('never contacts a private redirect target', async () => {
    const { impl, seen } = fakeFetch((url) =>
      url === 'https://api.example.test/start'
        ? { status: 302, location: 'https://169.254.169.254/latest' }
        : { status: 200 }
    )
    await expect(
      fetchWithSsrfGuard(
        impl,
        'https://api.example.test/start',
        {},
        {},
        { dnsLookup: publicDns }
      )
    ).rejects.toThrow(/private_network_address|dns_private_address/)
    expect(seen).toEqual(['https://api.example.test/start'])
  })

  it('follows a relative redirect after revalidation', async () => {
    const { impl, seen } = fakeFetch((url) =>
      url === 'https://api.example.test/start'
        ? { status: 302, location: '/v2' }
        : { status: 200 }
    )
    const response = await fetchWithSsrfGuard(
      impl,
      'https://api.example.test/start',
      {},
      {},
      { dnsLookup: publicDns }
    )
    expect(response.status).toBe(200)
    expect(seen).toEqual([
      'https://api.example.test/start',
      'https://api.example.test/v2'
    ])
  })

  it('stops redirect loops and location-less redirects', async () => {
    const loop = fakeFetch(() => ({ status: 302, location: '/again' }))
    await expect(
      fetchWithSsrfGuard(
        loop.impl,
        'https://api.example.test/again',
        {},
        { maxRedirects: 2 },
        { dnsLookup: publicDns }
      )
    ).rejects.toThrow(/too_many_redirects/)
    expect(loop.seen).toHaveLength(3)
    const noLocation = fakeFetch(() => ({ status: 302 }))
    await expect(
      fetchWithSsrfGuard(
        noLocation.impl,
        'https://api.example.test/x',
        {},
        {},
        { dnsLookup: publicDns }
      )
    ).rejects.toThrow(/redirect_without_location/)
  })
})

describe('loopback integration with real DNS (AUD19-007)', () => {
  const servers: Server[] = []
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections()
            server.close(() => resolve())
          })
      )
    )
  })

  it('fetches a loopback server with explicit opt-in and denies by default', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end('synthetic-ok')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
    const port = (server.address() as AddressInfo).port
    const url = `http://127.0.0.1:${port}/ping`
    // Default policy denies loopback without touching the network...
    await expect(
      resolveAndGuardOutboundUrl(url, { allowHttp: true })
    ).rejects.toThrow(/private_network_address/)
    // ...explicit opt-in performs the real guarded fetch.
    const response = await fetchWithSsrfGuard(
      fetch,
      url,
      { method: 'GET' },
      { allowHttp: true, allowPrivateNetworks: true }
    )
    expect(response.status).toBe(200)
    expect(await (response as unknown as Response).text()).toBe('synthetic-ok')
  })
})
