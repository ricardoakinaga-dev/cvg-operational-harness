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

async function defaultDnsLookup(
  hostname: string,
  signal: AbortSignal | undefined
): Promise<string[]> {
  const { lookup } = await import('node:dns/promises')
  // SPEC 0263 §3: an abort observed while the module loaded never starts
  // getaddrinfo; no await between this check and the native lookup.
  throwIfCancelled(signal)
  const records = await lookup(hostname, { all: true, verbatim: true })
  return records.map((record) => record.address)
}

/**
 * SPEC 0263 §4: cancellation is a constant AbortError, or a TimeoutError
 * when that is the recognised reason. A custom reason is never surfaced.
 */
function cancellationError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason
  const timedOut =
    typeof reason === 'object' &&
    reason !== null &&
    (reason as { name?: unknown }).name === 'TimeoutError'
  // A plain Error named like the DOM exceptions: an Error in every realm
  // (jsdom's DOMException is not), which is what the mappers check.
  const error = new Error(
    timedOut ? 'The operation timed out' : 'The operation was aborted'
  )
  error.name = timedOut ? 'TimeoutError' : 'AbortError'
  return error
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw cancellationError(signal)
}

/** A present but invalid signal is a TypeError before any I/O. */
function operationSignal(value: unknown): AbortSignal | undefined {
  if (value === undefined || value === null) return undefined
  if (
    typeof value === 'object' &&
    typeof (value as { aborted?: unknown }).aborted === 'boolean' &&
    typeof (value as { addEventListener?: unknown }).addEventListener ===
      'function' &&
    typeof (value as { removeEventListener?: unknown }).removeEventListener ===
      'function'
  ) {
    return value as AbortSignal
  }
  throw new TypeError('signal must be an AbortSignal')
}

/**
 * SPEC 0263 §3: wait for `thunk` while honouring `signal`. The thunk is never
 * invoked once the signal is aborted (checked again after the listener is
 * installed), its sync throw and late settlement are always observed, the
 * listener is removed on every exit, and a value that arrives after the abort
 * is handed to `onLateValue` for cleanup instead of being used.
 */
function awaitWithSignal<T>(
  thunk: () => T | PromiseLike<T>,
  signal: AbortSignal | undefined,
  onLateValue?: (value: T) => void
): Promise<T> {
  if (!signal) {
    try {
      return Promise.resolve(thunk())
    } catch (error) {
      return Promise.reject(error)
    }
  }
  if (signal.aborted) return Promise.reject(cancellationError(signal))
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const settle = (finish: () => void): boolean => {
      if (settled) return false
      settled = true
      signal.removeEventListener('abort', onAbort)
      finish()
      return true
    }
    const onAbort = (): void => {
      settle(() => reject(cancellationError(signal)))
    }
    signal.addEventListener('abort', onAbort)
    if (signal.aborted) {
      onAbort()
      return
    }
    let result: T | PromiseLike<T>
    try {
      result = thunk()
    } catch (error) {
      settle(() => reject(error))
      return
    }
    Promise.resolve(result).then(
      (value) => {
        if (!settle(() => resolve(value)) && onLateValue) {
          try {
            onLateValue(value)
          } catch {
            // Cleanup of a discarded late value never surfaces.
          }
        }
      },
      (error: unknown) => {
        settle(() => reject(error))
      }
    )
  })
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
  deps: { dnsLookup?: EgressDns['lookup']; signal?: AbortSignal } = {}
): Promise<GuardedOutboundUrl> {
  const signal = operationSignal(deps.signal)
  // An aborted operation resolves nothing, not even a literal IP.
  throwIfCancelled(signal)
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
  const dnsLookup = deps.dnsLookup
  let addresses: readonly string[]
  try {
    addresses = await awaitWithSignal(
      () =>
        dnsLookup ? dnsLookup(hostname) : defaultDnsLookup(hostname, signal),
      signal
    )
  } catch {
    // Cancellation is never reported as a DNS failure.
    throwIfCancelled(signal)
    throw new UnsafeUrlError('dns_resolution_failed')
  }
  // A resolution that finished after the abort has no authority.
  throwIfCancelled(signal)
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
  /** Released when the response is discarded (SPEC 0263 §4). */
  body?: { cancel(reason?: unknown): Promise<unknown> } | null
}

/**
 * Starts releasing a discarded response without waiting for it; a cleanup
 * failure is observed and never replaces the main outcome.
 */
function discardResponse(response: GuardedFetchResponse): void {
  try {
    const pending = response.body?.cancel()
    if (pending && typeof pending.then === 'function') {
      pending.then(undefined, () => undefined)
    }
  } catch {
    // Same rule as a rejected cancel.
  }
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
  // SPEC 0263 §2: the caller's composed signal bounds DNS and every hop; no
  // hop creates or renews a timeout.
  const signal = operationSignal(init?.signal)
  const guardDeps = {
    ...(deps.dnsLookup ? { dnsLookup: deps.dnsLookup } : {}),
    ...(signal ? { signal } : {})
  }
  let currentGuard = await resolveAndGuardOutboundUrl(
    rawUrl,
    options,
    guardDeps
  )
  let current = currentGuard.url
  for (let hop = 0; ; hop += 1) {
    const requestInit = { ...(init ?? {}), redirect: 'manual' }
    const target = current.toString()
    const addresses = currentGuard.resolvedAddresses
    const boundFetchImpl = deps.boundFetchImpl
    const response = await awaitWithSignal<T>(
      () =>
        boundFetchImpl
          ? boundFetchImpl(target, requestInit, addresses)
          : fetchImpl(target, requestInit),
      signal,
      discardResponse
    )
    if (signal?.aborted) {
      discardResponse(response)
      throw cancellationError(signal)
    }
    if (response.status < 300 || response.status >= 400) return response
    // A redirect response is released before the next hop is validated.
    discardResponse(response)
    if (hop >= maxRedirects) {
      throw new UnsafeUrlError('too_many_redirects')
    }
    const next = redirectTarget(current, response.headers.get('location'))
    if (!next) {
      throw new UnsafeUrlError('redirect_without_location')
    }
    currentGuard = await resolveAndGuardOutboundUrl(
      next.toString(),
      options,
      guardDeps
    )
    current = currentGuard.url
  }
}
