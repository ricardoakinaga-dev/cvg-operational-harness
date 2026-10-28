/**
 * SPEC0259 §4.11 — client side of the three-host proof (test support only):
 * the published state, the loopback control channel and raw HTTPS requests
 * that go through the TLS edge with the ephemeral CA (never a global
 * `NODE_EXTRA_CA_CERTS` or `ignoreHTTPSErrors`; build note O1).
 */
import { readFileSync } from 'node:fs'
import { request as httpsRequest } from 'node:https'
import { syntheticTotp } from '../../../apps/api/src/__tests__/support/synthetic-oidc-issuer.ts'
import type { EdgeLogEntry } from './edge.ts'
import { STATE_ENV, type ProofState, type ProofUser } from './state.ts'

export type { EdgeLogEntry, ProofState, ProofUser }

export function loadProofState(): ProofState {
  const path = process.env[STATE_ENV]
  if (!path) throw new Error(`${STATE_ENV} is not set by the global setup`)
  return JSON.parse(readFileSync(path, 'utf8')) as ProofState
}

export class ProofControl {
  private readonly token: string
  constructor(private readonly state: ProofState) {
    this.token = readFileSync(state.control.tokenFile, 'utf8')
  }

  async call<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`${this.state.control.url}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(150_000)
    })
    const parsed = (await response.json()) as T
    if (!response.ok) {
      throw new Error(`control ${path} failed with ${response.status}`)
    }
    return parsed
  }

  user(groups: unknown, idTokenTtlSeconds?: number) {
    return this.call<ProofUser>('POST', '/users', {
      groups,
      ...(idTokenTtlSeconds !== undefined ? { idTokenTtlSeconds } : {})
    })
  }

  edgeLog(since = 0) {
    return this.call<EdgeLogEntry[]>('GET', `/edge-log?since=${since}`)
  }

  async lastSeq(): Promise<number> {
    const log = await this.edgeLog()
    return log.at(-1)?.seq ?? 0
  }

  fault(path: string, mode: '503' | '403' | 'cut' | null) {
    return this.call('POST', '/edge-fault', { path, mode })
  }

  plant(cookies: string[], link?: string) {
    return this.call<{ id: string }>('POST', '/plant', {
      cookies,
      ...(link ? { link } : {})
    })
  }

  idpCalls() {
    return this.call<{ token: number; authorize: number }>('GET', '/idp-calls')
  }

  idpControls(controls: { tokenStatus: number | null }) {
    return this.call('POST', '/idp-controls', controls)
  }

  seedConversation(tenantId: string, marker: string) {
    return this.call<{ conversationId: string }>('POST', '/seed-conversation', {
      tenantId,
      marker
    })
  }

  async tasksCount(): Promise<number> {
    return (await this.call<{ count: number }>('GET', '/tasks-count')).count
  }

  reserve(slots: { start?: number; callback?: number }) {
    return this.call('POST', '/reserve', slots)
  }

  cancelReservations() {
    return this.call('POST', '/cancel-reservations', {})
  }

  pacer() {
    return this.call<{
      violations: { kind: string; latencyMs: number }[]
      paced: { kind: string; latencyMs: number | null; status: number }[]
    }>('GET', '/pacer')
  }

  secrets(values: string[]) {
    return this.call('POST', '/secrets', { values })
  }

  leakCheck(texts: Record<string, string>) {
    return this.call<{
      leakedSources: string[]
      checkedSources: string[]
      secrets: number
    }>('POST', '/leak-check', { texts })
  }
}

export interface RawResponse {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

/** A raw HTTPS request through the edge, trusting only the ephemeral CA. */
export function rawEdge(
  state: ProofState,
  input: {
    host: string
    method: string
    path: string
    headers?: Record<string, string>
    body?: string
  }
): Promise<RawResponse> {
  const ca = readFileSync(state.caFile)
  return new Promise((resolve, reject) => {
    const outgoing = httpsRequest(
      {
        host: '127.0.0.1',
        port: state.edgePort,
        servername: input.host,
        ca,
        method: input.method,
        path: input.path,
        headers: {
          host: `${input.host}:${state.edgePort}`,
          ...(input.headers ?? {}),
          ...(input.body !== undefined
            ? { 'content-length': String(Buffer.byteLength(input.body)) }
            : {})
        }
      },
      (incoming) => {
        const chunks: Buffer[] = []
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
        incoming.on('end', () =>
          resolve({
            status: incoming.statusCode ?? 0,
            headers: incoming.headers,
            body: Buffer.concat(chunks).toString('utf8')
          })
        )
        incoming.on('error', reject)
      }
    )
    outgoing.on('error', reject)
    outgoing.end(input.body)
  })
}

/** POST of the IdP login form without following the redirect. */
export function rawIdpLogin(
  state: ProofState,
  authorizationUrl: string,
  form: { username: string; password: string; totp: string }
): Promise<RawResponse> {
  const ca = readFileSync(state.caFile)
  const target = new URL(authorizationUrl)
  const body = new URLSearchParams(form).toString()
  return new Promise((resolve, reject) => {
    const outgoing = httpsRequest(
      {
        host: '127.0.0.1',
        port: Number(target.port),
        servername: target.hostname,
        ca,
        method: 'POST',
        path: `${target.pathname}${target.search}`,
        headers: {
          host: target.host,
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': String(Buffer.byteLength(body))
        }
      },
      (incoming) => {
        const chunks: Buffer[] = []
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
        incoming.on('end', () =>
          resolve({
            status: incoming.statusCode ?? 0,
            headers: incoming.headers,
            body: Buffer.concat(chunks).toString('utf8')
          })
        )
      }
    )
    outgoing.on('error', reject)
    outgoing.end(body)
  })
}

export function totpFor(user: ProofUser, atMs = Date.now()): string {
  return syntheticTotp(Buffer.from(user.totpSecretHex, 'hex'), atMs)
}

export function setCookieValue(
  response: RawResponse,
  name: string
): string | null {
  const values = response.headers['set-cookie']
  const list = Array.isArray(values) ? values : values ? [values] : []
  for (const cookie of list) {
    const pair = cookie.split(';')[0]!
    const separator = pair.indexOf('=')
    if (pair.slice(0, separator) === name && !/Max-Age=0/i.test(cookie)) {
      return pair.slice(separator + 1)
    }
  }
  return null
}

export function hexName(name: string): string {
  return Buffer.from(name, 'latin1').toString('hex')
}
