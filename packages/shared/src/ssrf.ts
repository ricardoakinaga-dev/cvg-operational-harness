/**
 * SSRF defense for outbound HTTP tools/providers.
 *
 * Static URL validation plus optional DNS resolution verification. Private,
 * loopback, link-local, multicast and documentation ranges are denied by
 * default; host allowlists are exact or `*.suffix` matches.
 */
export const DEFAULT_URL_MAX_LENGTH = 2048

export interface UrlGuardOptions {
  allowedProtocols?: readonly string[]
  allowedHosts?: readonly string[]
  allowPrivateNetworks?: boolean
  /** Restrict a private-network opt-in to loopback addresses only. */
  allowLoopbackOnly?: boolean
  allowHttp?: boolean
  maxUrlLength?: number
}

export interface UrlGuardAllowed {
  allowed: true
  url: URL
}

export interface UrlGuardDenied {
  allowed: false
  reason: string
}

export type UrlGuardResult = UrlGuardAllowed | UrlGuardDenied

export class UnsafeUrlError extends Error {
  readonly reason: string

  constructor(reason: string) {
    super(`Outbound URL rejected: ${reason}`)
    this.name = 'UnsafeUrlError'
    this.reason = reason
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'instance-data'
])

const BLOCKED_HOST_SUFFIXES = [
  '.local',
  '.internal',
  '.localhost',
  '.home.arpa'
]

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    octets.push(value)
  }
  return octets
}

function isPrivateIpv4(octets: readonly number[]): boolean {
  const [a = 0, b = 0, c = 0] = octets
  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 0 && c === 0) return true
  if (a === 192 && b === 0 && c === 2) return true
  if (a === 192 && b === 168) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  if (a >= 224) return true
  return false
}

export function isPrivateIpAddress(rawAddress: string): boolean {
  const address = rawAddress.trim().toLowerCase()
  if (address.length === 0) return true

  const ipv4 = parseIpv4(address)
  if (ipv4) return isPrivateIpv4(ipv4)

  if (address.includes(':')) {
    if (address === '::' || address === '::1') return true
    if (address.startsWith('::ffff:')) {
      const mapped = address.slice('::ffff:'.length)
      const mappedIpv4 = parseIpv4(mapped)
      if (mappedIpv4) return isPrivateIpv4(mappedIpv4)
      return true
    }
    const firstGroup = address.split(':')[0] ?? ''
    if (/^f[cd][0-9a-f]{2}$/.test(firstGroup)) return true
    if (/^fe[89ab][0-9a-f]$/.test(firstGroup)) return true
    if (/^ff[0-9a-f]{2}$/.test(firstGroup)) return true
    if (address.startsWith('2001:db8')) return true
    if (address.startsWith('64:ff9b')) return true
    return false
  }

  return false
}

export function isLoopbackHostname(rawHostname: string): boolean {
  const hostname = rawHostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname === 'localhost.localdomain') {
    return true
  }
  const ipv4 = parseIpv4(hostname)
  if (ipv4) return ipv4[0] === 127
  return hostname === '::1' || hostname === '::ffff:127.0.0.1'
}

function isLoopbackIpAddress(rawAddress: string): boolean {
  const address = rawAddress.trim().toLowerCase()
  const ipv4 = parseIpv4(address)
  if (ipv4) return ipv4[0] === 127
  return address === '::1' || address === '::ffff:127.0.0.1'
}

function hostMatchesAllowlist(
  hostname: string,
  allowedHosts: readonly string[]
): boolean {
  const host = hostname.toLowerCase()
  return allowedHosts.some((entry) => {
    const pattern = entry.trim().toLowerCase()
    if (pattern.length === 0) return false
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1)
      return host.endsWith(suffix) && host.length > suffix.length
    }
    return host === pattern
  })
}

export function evaluateOutboundUrl(
  rawUrl: string,
  options: UrlGuardOptions = {}
): UrlGuardResult {
  const maxLength = options.maxUrlLength ?? DEFAULT_URL_MAX_LENGTH
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return { allowed: false, reason: 'empty_url' }
  }
  if (rawUrl.length > maxLength) {
    return { allowed: false, reason: 'url_too_long' }
  }

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { allowed: false, reason: 'malformed_url' }
  }

  const protocols =
    options.allowedProtocols ??
    (options.allowHttp ? ['https:', 'http:'] : ['https:'])
  if (!protocols.includes(url.protocol)) {
    return { allowed: false, reason: 'protocol_not_allowed' }
  }
  if (url.username.length > 0 || url.password.length > 0) {
    return { allowed: false, reason: 'embedded_credentials' }
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (hostname.length === 0) {
    return { allowed: false, reason: 'missing_host' }
  }
  if (options.allowedHosts && options.allowedHosts.length > 0) {
    if (!hostMatchesAllowlist(hostname, options.allowedHosts)) {
      return { allowed: false, reason: 'host_not_allowlisted' }
    }
    return { allowed: true, url }
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { allowed: false, reason: 'blocked_hostname' }
  }
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return { allowed: false, reason: 'blocked_hostname_suffix' }
  }
  if (!options.allowPrivateNetworks && isPrivateIpAddress(hostname)) {
    return { allowed: false, reason: 'private_network_address' }
  }
  return { allowed: true, url }
}

export function assertSafeOutboundUrl(
  rawUrl: string,
  options: UrlGuardOptions = {}
): URL {
  const result = evaluateOutboundUrl(rawUrl, options)
  if (!result.allowed) {
    throw new UnsafeUrlError(result.reason)
  }
  return result.url
}

export function evaluateResolvedAddresses(
  addresses: readonly string[],
  options: Pick<
    UrlGuardOptions,
    'allowPrivateNetworks' | 'allowLoopbackOnly'
  > = {}
): UrlGuardResult | { allowed: true } {
  if (addresses.length === 0) {
    return { allowed: false, reason: 'dns_no_addresses' }
  }
  if (options.allowLoopbackOnly) {
    for (const address of addresses) {
      if (!isLoopbackIpAddress(address)) {
        return { allowed: false, reason: 'loopback_address_required' }
      }
    }
    return { allowed: true }
  }
  if (options.allowPrivateNetworks) return { allowed: true }
  for (const address of addresses) {
    if (isPrivateIpAddress(address)) {
      return { allowed: false, reason: 'dns_private_address' }
    }
  }
  return { allowed: true }
}

export interface EgressDns {
  lookup(hostname: string): Promise<readonly string[]>
}

export interface EgressGuardOptions extends UrlGuardOptions {
  maxRedirects?: number
}

export interface GuardedOutboundUrl {
  url: URL
  resolvedAddresses: readonly string[]
}

const MAX_EGRESS_REDIRECTS = 5

async function defaultDnsLookup(hostname: string): Promise<string[]> {
  const { lookup } = await import('node:dns/promises')
  const records = await lookup(hostname, { all: true, verbatim: true })
  return records.map((record) => record.address)
}

function stripBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '')
}

/**
 * AUD19-007 — composed egress guard: static policy PLUS resolution.
 * Every resolved address is validated, including for allowlisted hosts
 * (an allowlist names who may be contacted, never which addresses are
 * safe). Literal IP hostnames skip DNS. Any DNS failure, empty resolution
 * or private/reserved address denies fail-closed.
 */
export async function resolveAndGuardOutboundUrl(
  rawUrl: string,
  options: EgressGuardOptions = {},
  deps: { dnsLookup?: EgressDns['lookup'] } = {}
): Promise<GuardedOutboundUrl> {
  const checked = evaluateOutboundUrl(rawUrl, options)
  if (!checked.allowed) {
    throw new UnsafeUrlError(checked.reason)
  }
  const hostname = stripBrackets(checked.url.hostname.toLowerCase())
  if (isPrivateIpAddress(hostname) && !options.allowPrivateNetworks) {
    // Literal private/reserved IP: deny without DNS even when the static
    // hostname spelling was not recognized as an address above.
    throw new UnsafeUrlError('private_network_address')
  }
  const literalIpv4 = parseIpv4(hostname)
  const looksLikeIp = literalIpv4 !== null || hostname.includes(':')
  if (looksLikeIp) {
    if (options.allowLoopbackOnly && !isLoopbackIpAddress(hostname)) {
      throw new UnsafeUrlError('loopback_address_required')
    }
    return { url: checked.url, resolvedAddresses: [hostname] }
  }
  const lookup = deps.dnsLookup ?? defaultDnsLookup
  let addresses: readonly string[]
  try {
    addresses = await lookup(hostname)
  } catch {
    throw new UnsafeUrlError('dns_resolution_failed')
  }
  const verdict = evaluateResolvedAddresses(addresses, options)
  if (!verdict.allowed) {
    throw new UnsafeUrlError(
      (verdict as UrlGuardDenied).reason ?? 'dns_private_address'
    )
  }
  return { url: checked.url, resolvedAddresses: addresses }
}

function redirectTarget(current: URL, location: string | null): URL | null {
  if (!location) return null
  try {
    return new URL(location, current)
  } catch {
    return null
  }
}

export interface GuardedFetchResponse {
  status: number
  headers: { get(name: string): string | null }
}

export type BoundFetchImpl<T extends GuardedFetchResponse> = (
  url: string,
  init: Record<string, unknown>,
  resolvedAddresses: readonly string[]
) => Promise<T>

/**
 * AUD19-007 — fetch with per-hop egress validation. The initial URL and
 * every redirect target (absolute or relative) pass the full composed guard
 * before any bytes are sent to that hop. Redirects are followed manually so
 * no hop is ever contacted without validation.
 */
export async function fetchWithSsrfGuard<T extends GuardedFetchResponse>(
  fetchImpl: (url: string, init: Record<string, unknown>) => Promise<T>,
  rawUrl: string,
  init: Record<string, unknown> | undefined,
  options: EgressGuardOptions = {},
  deps: {
    dnsLookup?: EgressDns['lookup']
    boundFetchImpl?: BoundFetchImpl<T>
  } = {}
): Promise<T> {
  const maxRedirects = options.maxRedirects ?? MAX_EGRESS_REDIRECTS
  let currentGuard = await resolveAndGuardOutboundUrl(rawUrl, options, deps)
  let current = currentGuard.url
  for (let hop = 0; ; hop += 1) {
    const requestInit = { ...(init ?? {}), redirect: 'manual' }
    const response = deps.boundFetchImpl
      ? await deps.boundFetchImpl(
          current.toString(),
          requestInit,
          currentGuard.resolvedAddresses
        )
      : await fetchImpl(current.toString(), requestInit)
    if (response.status < 300 || response.status >= 400) return response
    if (hop >= maxRedirects) {
      throw new UnsafeUrlError('too_many_redirects')
    }
    const target = redirectTarget(current, response.headers.get('location'))
    if (!target) {
      throw new UnsafeUrlError('redirect_without_location')
    }
    currentGuard = await resolveAndGuardOutboundUrl(
      target.toString(),
      options,
      deps
    )
    current = currentGuard.url
  }
}
