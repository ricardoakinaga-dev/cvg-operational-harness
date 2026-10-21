import { isIP } from 'node:net'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export class EgressDeniedError extends Error {
  constructor(url: string) {
    super(`Egress denied for ${safeOrigin(url)}`)
    this.name = 'EgressDeniedError'
  }
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return 'invalid URL'
  }
}

/**
 * Fetch restricted to an explicit list of origins (scheme + host + port).
 * Redirects are never followed, so a configured service cannot bounce the
 * assistant to an unlisted destination.
 */
export function allowlistedFetch(
  allowedOrigins: readonly string[],
  fetchImpl: FetchLike = globalThis.fetch as FetchLike
): FetchLike {
  const allowed = new Set(
    allowedOrigins.map((origin) => new URL(origin).origin)
  )
  return async (input, init) => {
    let origin: string
    try {
      origin = new URL(input).origin
    } catch {
      throw new EgressDeniedError(input)
    }
    if (!allowed.has(origin)) throw new EgressDeniedError(input)
    return fetchImpl(input, { ...init, redirect: 'manual' })
  }
}

function privateIPv4(host: string): boolean {
  const [a = -1, b = -1] = host.split('.').map(Number)
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

function privateIPv6(host: string): boolean {
  const value = host.toLowerCase()
  // Loopback and unique local addresses (fc00::/7).
  return value === '::1' || /^f[cd][0-9a-f]{2}:/.test(value)
}

/**
 * True for an HTTP(S) URL without credentials whose host is loopback, a
 * private IPv4/IPv6 unique-local address, a single-label service name (a
 * Docker network alias) or a reserved internal suffix. Public names and
 * addresses, link-local/metadata (169.254.0.0/16, fe80::/10) and 0.0.0.0
 * are refused. The name is not resolved here: the backend network and the
 * host policy keep it internal (SPEC 0179 sections 8.2 and 9).
 */
export function isInternalServiceUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (url.username || url.password) return false
  const host = url.hostname.toLowerCase()
  if (host.startsWith('[')) return privateIPv6(host.slice(1, -1))
  if (isIP(host) === 4) return privateIPv4(host)
  if (host === 'localhost') return true
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host)) return true
  return /\.(?:local|internal|lan|home\.arpa)$/.test(host)
}
