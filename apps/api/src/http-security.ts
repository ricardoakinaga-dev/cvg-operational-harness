import { isIP } from 'node:net'
import {
  createCorrelationId,
  fail,
  TRUSTED_PROXY_HOPS_MIGRATION_ERROR
} from '@cvg/shared'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { CORRELATION_RESPONSE_HEADER } from './response-correlation.ts'

export { TRUSTED_PROXY_HOPS_MIGRATION_ERROR }

export const HTTP_SECURITY_ALLOWED_METHODS = [
  'GET',
  'POST',
  'PATCH',
  'OPTIONS'
] as const

export const HTTP_SECURITY_ALLOWED_HEADERS = [
  'accept',
  'content-type',
  'x-cvg-operator-token',
  'x-operator-id',
  'x-operator-role',
  'x-tenant-id',
  'x-cvg-webhook-id',
  'x-cvg-webhook-signature',
  'x-cvg-webhook-timestamp'
] as const

const DEFAULT_HSTS_MAX_AGE_SECONDS = 31_536_000
const HSTS_MIN_AGE_SECONDS = 300
const HSTS_MAX_AGE_SECONDS = 31_536_000
const MAX_TRUSTED_PROXY_ADDRESSES = 32
const CORS_MAX_AGE_SECONDS = 600
const TRUSTED_PROXY_ADDRESS_ERROR =
  'trusted proxy address configuration (trustedProxyAddresses/API_TRUSTED_PROXY_ADDRESSES) must contain at most 32 explicit IPv4/IPv6 addresses and must not contain aliases, wildcards or unspecified addresses'

export const API_CONTENT_SECURITY_POLICY =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

export interface HttpSecurityOptions {
  allowedOrigins?: readonly string[]
  enforceHttps?: boolean
  trustedProxyAddresses?: readonly string[]
  /** @deprecated Configure trustedProxyAddresses instead. Only zero is accepted. */
  trustedProxyHops?: number
  hstsMaxAgeSeconds?: number
}

export interface NormalizedHttpSecurityOptions {
  allowedOrigins: readonly string[]
  enforceHttps: boolean
  trustedProxyAddresses: readonly string[]
  /** @deprecated Always zero; retained for callers migrating from the old API. */
  trustedProxyHops: 0
  hstsMaxAgeSeconds: number
}

export function normalizeOrigin(rawOrigin: string): string {
  const value = rawOrigin.trim()
  if (!value || value === '*' || value.toLowerCase() === 'null') {
    throw new Error('HTTP security origin is invalid')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('HTTP security origin is invalid')
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.origin === 'null'
  ) {
    throw new Error('HTTP security origin is invalid')
  }

  return parsed.origin
}

export function parseAllowedOrigins(rawOrigins?: string): string[] {
  if (rawOrigins === undefined || rawOrigins.trim() === '') return []
  const values = rawOrigins.split(',').map((origin) => origin.trim())
  if (values.some((origin) => origin.length === 0)) {
    throw new Error('API_ALLOWED_ORIGINS contains an empty origin')
  }
  return [...new Set(values.map(normalizeOrigin))]
}

/**
 * Parse the comma-separated trusted proxy environment value.
 *
 * Trust is deliberately limited to individual IP literals. CIDRs, names,
 * wildcards and unspecified addresses are rejected so a configuration cannot
 * accidentally turn an internet-facing socket into a trusted proxy.
 */
export function parseTrustedProxyAddresses(rawAddresses?: string): string[] {
  if (rawAddresses === undefined) return []
  if (typeof rawAddresses !== 'string') {
    throw new Error(TRUSTED_PROXY_ADDRESS_ERROR)
  }
  if (rawAddresses.trim() === '') return []
  const values = rawAddresses.split(',').map((address) => address.trim())
  if (values.some((address) => address.length === 0)) {
    throw new Error(TRUSTED_PROXY_ADDRESS_ERROR)
  }
  return normalizeTrustedProxyAddresses(values)
}

export function normalizeTrustedProxyAddresses(
  addresses: readonly string[]
): string[] {
  if (
    !Array.isArray(addresses) ||
    addresses.length > MAX_TRUSTED_PROXY_ADDRESSES
  ) {
    throw new Error(TRUSTED_PROXY_ADDRESS_ERROR)
  }

  const normalized = addresses.map((address) => {
    if (typeof address !== 'string') {
      throw new Error(TRUSTED_PROXY_ADDRESS_ERROR)
    }
    const value = address.trim()
    const version = isIP(value)
    if (
      !value ||
      value.includes('%') ||
      version === 0 ||
      ((version === 4 || version === 6) && isUnspecifiedAddress(value, version))
    ) {
      throw new Error(TRUSTED_PROXY_ADDRESS_ERROR)
    }
    return value
  })

  return [...new Set(normalized)]
}

export function normalizeHttpSecurityOptions(
  options: HttpSecurityOptions = {}
): NormalizedHttpSecurityOptions {
  assertLegacyTrustedProxyHops(options.trustedProxyHops)
  const allowedOrigins = [
    ...new Set((options.allowedOrigins ?? []).map(normalizeOrigin))
  ]
  const enforceHttps = options.enforceHttps ?? false
  const trustedProxyAddresses = normalizeTrustedProxyAddresses(
    options.trustedProxyAddresses ?? []
  )
  const hstsMaxAgeSeconds =
    options.hstsMaxAgeSeconds ?? DEFAULT_HSTS_MAX_AGE_SECONDS

  if (
    !Number.isInteger(hstsMaxAgeSeconds) ||
    hstsMaxAgeSeconds < HSTS_MIN_AGE_SECONDS ||
    hstsMaxAgeSeconds > HSTS_MAX_AGE_SECONDS
  ) {
    throw new Error('hstsMaxAgeSeconds is outside the allowed range')
  }

  return {
    allowedOrigins,
    enforceHttps,
    trustedProxyAddresses,
    trustedProxyHops: 0,
    hstsMaxAgeSeconds
  }
}

export function parseHttpSecurityEnv(
  env: NodeJS.ProcessEnv,
  overrides: HttpSecurityOptions = {}
): NormalizedHttpSecurityOptions {
  assertLegacyTrustedProxyHops(overrides.trustedProxyHops)
  if (env.NODE_ENV === 'production') {
    const allowedOrigins = parseAllowedOrigins(env.API_ALLOWED_ORIGINS)
    const requireHttps = parseBooleanEnv(env.API_REQUIRE_HTTPS, false)
    const trustedProxyAddresses = parseTrustedProxyAddresses(
      env.API_TRUSTED_PROXY_ADDRESSES
    )
    const trustedProxyHops = parseTrustedProxyHops(env.API_TRUSTED_PROXY_HOPS)
    if (allowedOrigins.length === 0) {
      throw new Error(
        'Production requires a non-empty API_ALLOWED_ORIGINS allowlist'
      )
    }
    if (!requireHttps) {
      throw new Error('Production requires API_REQUIRE_HTTPS=true')
    }
    return normalizeHttpSecurityOptions({
      allowedOrigins,
      enforceHttps: true,
      trustedProxyAddresses,
      trustedProxyHops
    })
  }

  const trustedProxyAddresses =
    env.API_TRUSTED_PROXY_ADDRESSES !== undefined
      ? parseTrustedProxyAddresses(env.API_TRUSTED_PROXY_ADDRESSES)
      : undefined
  const trustedProxyHops =
    env.API_TRUSTED_PROXY_HOPS !== undefined
      ? parseTrustedProxyHops(env.API_TRUSTED_PROXY_HOPS)
      : undefined
  return normalizeHttpSecurityOptions({
    ...overrides,
    ...(env.API_ALLOWED_ORIGINS !== undefined
      ? { allowedOrigins: parseAllowedOrigins(env.API_ALLOWED_ORIGINS) }
      : {}),
    ...(env.API_REQUIRE_HTTPS !== undefined
      ? { enforceHttps: parseBooleanEnv(env.API_REQUIRE_HTTPS, false) }
      : {}),
    ...(trustedProxyAddresses !== undefined ? { trustedProxyAddresses } : {}),
    ...(trustedProxyHops !== undefined ? { trustedProxyHops } : {})
  })
}

export function installHttpSecurityHooks(
  app: FastifyInstance,
  options: NormalizedHttpSecurityOptions
): void {
  app.addHook('onRequest', async (request, reply) => {
    if (
      options.enforceHttps &&
      !isInContainerLivenessProbe(request) &&
      (!isTrustedForwardedProtocolRequest(request, options) ||
        request.protocol !== 'https')
    ) {
      reply.code(426).header('upgrade', 'TLS/1.2')
      return reply.send(
        fail(
          'secure_transport_required',
          'Secure transport is required',
          createCorrelationId()
        )
      )
    }

    const originResult = readOrigin(request)
    if (!originResult.valid) {
      return sendForbidden(reply, 'Origin header is invalid')
    }

    if (request.method === 'OPTIONS') {
      const preflight = validatePreflight(request, originResult.origin, options)
      if (!preflight.valid || !preflight.origin) {
        return sendForbidden(reply, 'CORS preflight is not allowed')
      }
      applyCorsHeaders(reply, preflight.origin, true)
      reply.code(204)
      return reply.send()
    }

    if (originResult.origin) {
      if (!options.allowedOrigins.includes(originResult.origin)) {
        return sendForbidden(reply, 'Origin is not allowed')
      }
      applyCorsHeaders(reply, originResult.origin, false)
    }
  })

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('content-security-policy', API_CONTENT_SECURITY_POLICY)
    reply.header('x-content-type-options', 'nosniff')
    reply.header('x-frame-options', 'DENY')
    reply.header('referrer-policy', 'no-referrer')
    reply.header('x-permitted-cross-domain-policies', 'none')
    if (isTrustedForwardedProtocolRequest(request, options)) {
      reply.header(
        'strict-transport-security',
        `max-age=${options.hstsMaxAgeSeconds}`
      )
    }
    return payload
  })
}

function readOrigin(request: FastifyRequest): {
  valid: boolean
  origin: string | null
} {
  const rawOrigin = request.headers.origin
  if (rawOrigin === undefined) return { valid: true, origin: null }
  if (Array.isArray(rawOrigin) || typeof rawOrigin !== 'string') {
    return { valid: false, origin: null }
  }
  try {
    return { valid: true, origin: normalizeOrigin(rawOrigin) }
  } catch {
    return { valid: false, origin: null }
  }
}

function validatePreflight(
  request: FastifyRequest,
  origin: string | null,
  options: NormalizedHttpSecurityOptions
): { valid: boolean; origin: string | null } {
  if (!origin || !options.allowedOrigins.includes(origin)) {
    return { valid: false, origin: null }
  }
  const requestedMethod = readSingleHeader(
    request.headers['access-control-request-method']
  )
  if (
    !requestedMethod ||
    !HTTP_SECURITY_ALLOWED_METHODS.includes(
      requestedMethod.toUpperCase() as (typeof HTTP_SECURITY_ALLOWED_METHODS)[number]
    )
  ) {
    return { valid: false, origin: null }
  }

  const rawHeaders = request.headers['access-control-request-headers']
  if (rawHeaders !== undefined) {
    const requestedHeaders = readSingleHeader(rawHeaders)
    if (!requestedHeaders) return { valid: false, origin: null }
    const allAllowed = requestedHeaders
      .split(',')
      .map((header) => header.trim().toLowerCase())
      .every((header) =>
        (HTTP_SECURITY_ALLOWED_HEADERS as readonly string[]).includes(header)
      )
    if (!allAllowed) return { valid: false, origin: null }
  }

  return { valid: true, origin }
}

function applyCorsHeaders(
  reply: FastifyReply,
  origin: string,
  preflight: boolean
): void {
  reply.header('access-control-allow-origin', origin)
  reply.header('vary', 'Origin')
  if (!preflight) {
    reply.header('access-control-expose-headers', CORRELATION_RESPONSE_HEADER)
    return
  }
  reply.header(
    'access-control-allow-methods',
    HTTP_SECURITY_ALLOWED_METHODS.join(', ')
  )
  reply.header(
    'access-control-allow-headers',
    HTTP_SECURITY_ALLOWED_HEADERS.join(', ')
  )
  reply.header('access-control-max-age', String(CORS_MAX_AGE_SECONDS))
}

function sendForbidden(reply: FastifyReply, message: string) {
  reply.code(403)
  return reply.send(fail('forbidden', message, createCorrelationId()))
}

function readSingleHeader(value: unknown): string | null {
  if (Array.isArray(value) || typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean
): boolean {
  if (value === undefined) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error('HTTP security boolean environment value is invalid')
}

function parseTrustedProxyHops(value: string | undefined): number {
  if (value === undefined || value === '0') return 0
  throw new Error(TRUSTED_PROXY_HOPS_MIGRATION_ERROR)
}

function assertLegacyTrustedProxyHops(value: number | undefined): void {
  if (value !== undefined && value !== 0) {
    throw new Error(TRUSTED_PROXY_HOPS_MIGRATION_ERROR)
  }
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/**
 * The image healthcheck asks GET /live over loopback from inside the
 * container, where no TLS terminates (PROD-0373). Only that exact probe is
 * exempt from the HTTPS requirement: liveness carries no data, and any
 * request with forwarding headers came through a proxy and stays enforced.
 */
function isInContainerLivenessProbe(request: FastifyRequest): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  if (request.url !== '/live') return false
  if (
    request.headers['x-forwarded-for'] !== undefined ||
    request.headers['x-forwarded-proto'] !== undefined ||
    request.headers.forwarded !== undefined
  ) {
    return false
  }
  const remote = request.raw.socket?.remoteAddress
  return typeof remote === 'string' && LOOPBACK_ADDRESSES.has(remote)
}

function isTrustedForwardedProtocolRequest(
  request: FastifyRequest,
  options: NormalizedHttpSecurityOptions
): boolean {
  if (request.protocol !== 'https') return false

  const forwardedProto = request.headers['x-forwarded-proto']
  if (forwardedProto === undefined) return true

  const remoteAddress = request.raw.socket?.remoteAddress
  if (typeof remoteAddress !== 'string') return false
  const normalizedRemote = canonicalizeIpAddress(remoteAddress)
  return options.trustedProxyAddresses.some(
    (address) => canonicalizeIpAddress(address) === normalizedRemote
  )
}

function isUnspecifiedAddress(address: string, version: 4 | 6): boolean {
  if (version === 4) return address === '0.0.0.0'
  const words = expandIpv6(address)
  if (!words) return false
  if (words.every((part) => part === 0)) return true
  return (
    words[0] === 0 &&
    words[1] === 0 &&
    words[2] === 0 &&
    words[3] === 0 &&
    words[4] === 0 &&
    words[5] === 0xffff &&
    words[6] === 0 &&
    words[7] === 0
  )
}

function canonicalizeIpAddress(address: string): string | null {
  const version = isIP(address)
  if (version === 4) return `4:${address}`
  if (version !== 6) return null

  const words = expandIpv6(address)
  if (!words) return null
  if (
    words[0] === 0 &&
    words[1] === 0 &&
    words[2] === 0 &&
    words[3] === 0 &&
    words[4] === 0 &&
    words[5] === 0xffff
  ) {
    const word6 = words[6]
    const word7 = words[7]
    if (word6 === undefined || word7 === undefined) return null
    const first = (word6 >> 8) & 0xff
    const second = word6 & 0xff
    const third = (word7 >> 8) & 0xff
    const fourth = word7 & 0xff
    return `4:${first}.${second}.${third}.${fourth}`
  }
  return `6:${words.map((word) => word.toString(16).padStart(4, '0')).join(':')}`
}

function expandIpv6(address: string): number[] | null {
  if (isIP(address) !== 6 || address.includes('%')) return null
  const lower = address.toLowerCase()
  const halves = lower.split('::')
  if (halves.length > 2) return null
  const left = parseIpv6Words(halves[0] ?? '')
  const right = parseIpv6Words(halves.length === 2 ? (halves[1] ?? '') : '')
  if (!left || !right) return null
  const missing = 8 - left.length - right.length
  if (halves.length === 1 && missing !== 0) return null
  if (halves.length === 2 && missing < 1) return null
  return [...left, ...Array.from({ length: missing }, () => 0), ...right]
}

function parseIpv6Words(value: string): number[] | null {
  if (!value) return []
  const parts = value.split(':')
  const words: number[] = []
  for (const part of parts) {
    if (part.includes('.')) {
      const octets = part.split('.')
      if (
        octets.length !== 4 ||
        octets.some((octet) => !/^\d+$/.test(octet) || Number(octet) > 255)
      ) {
        return null
      }
      words.push(
        Number(octets[0]) * 256 + Number(octets[1]),
        Number(octets[2]) * 256 + Number(octets[3])
      )
      continue
    }
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null
    words.push(Number.parseInt(part, 16))
  }
  return words
}
