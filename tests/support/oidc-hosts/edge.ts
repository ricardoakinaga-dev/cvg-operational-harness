/**
 * SPEC0259 §4.11 — TLS edge of the three-host proof (test support only).
 * Terminates TLS for the synthetic `.test` hosts and routes by `Host`: the
 * console and the mirror go to the real NGINX, the API host goes to the API
 * process with `X-Forwarded-Proto: https`, and the other hosts are pages of
 * the test. Per request it records only cookie NAMES (hex), the `Origin`,
 * whether the answer carried credentialed CORS and the status — never a
 * cookie value, a query string or a body. A fault can answer 503 or cut the
 * connection on a chosen API path (Q9n). Starts and callbacks go through the
 * login pacer (DB10).
 */
import {
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import { createServer, type Server } from 'node:https'
import type { AddressInfo } from 'node:net'
import { LoginPacer, type PacedKind } from './pacer.ts'

export const MAX_PACED_LATENCY_MS = 5_000

export interface EdgeLogEntry {
  readonly seq: number
  readonly at: number
  readonly host: string
  readonly method: string
  readonly path: string
  readonly origin: string | null
  readonly cookieNamesHex: readonly string[]
  status: number
  acao: string | null
  acac: boolean
  paced?: PacedKind
  latencyMs?: number
  /**
   * Callback answers only: the fixed landing category of the `Location`
   * (`console`, `negado`, `indisponivel`, `other` or `none`), never the URL.
   */
  landing?: 'console' | 'negado' | 'indisponivel' | 'other' | 'none'
  fault?: 'status-503' | 'status-403' | 'cut'
}

/**
 * `503` and `cut` prove "unavailable" (Q9n, DB6). `403` stands in for a role
 * refusal on a panel route: no panel route of the console answers 403 to a
 * role of the synthetic matrix (Q9e route choice, recorded in the report).
 */
export type EdgeFault = '503' | '403' | 'cut'

export interface EdgeUpstreams {
  readonly apiPort: number
  readonly nginxPort: number
}

export type AuxHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  entry: EdgeLogEntry
) => void

export interface EdgeOptions {
  readonly key: Buffer
  readonly cert: Buffer
  readonly pacer: LoginPacer
  readonly aux: Readonly<Record<string, AuxHandler>>
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer'
])

export function cookieNamesHex(header: string | undefined): string[] {
  if (!header) return []
  return header.split(';').map((segment) => {
    const separator = segment.indexOf('=')
    const name = separator === -1 ? segment : segment.slice(0, separator)
    return Buffer.from(name.replace(/^[ \t]+|[ \t]+$/g, ''), 'latin1').toString(
      'hex'
    )
  })
}

export class ProofEdge {
  readonly log: EdgeLogEntry[] = []
  readonly faults = new Map<string, EdgeFault>()
  readonly violations: { seq: number; kind: PacedKind; latencyMs: number }[] =
    []
  upstreams: EdgeUpstreams | null = null
  /** Only the console origin gets readable CORS on an injected 503. */
  consoleOrigin: string | null = null
  private seq = 0
  private readonly server: Server

  constructor(private readonly options: EdgeOptions) {
    this.server = createServer(
      { key: options.key, cert: options.cert },
      (request, response) => {
        void this.handle(request, response)
      }
    )
  }

  async listen(port: number): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(port, '127.0.0.1', () => resolve())
    })
    return (this.server.address() as AddressInfo).port
  }

  async close(): Promise<void> {
    this.server.closeAllConnections()
    await new Promise<void>((resolve) => this.server.close(() => resolve()))
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const host = (request.headers.host ?? '').replace(/:\d+$/, '').toLowerCase()
    const url = request.url ?? '/'
    const path = url.split('?')[0] ?? '/'
    const origin =
      typeof request.headers.origin === 'string' ? request.headers.origin : null
    const entry: EdgeLogEntry = {
      seq: (this.seq += 1),
      at: Date.now(),
      host,
      method: request.method ?? 'GET',
      path,
      origin,
      cookieNamesHex: cookieNamesHex(request.headers.cookie),
      status: 0,
      acao: null,
      acac: false
    }
    this.log.push(entry)
    try {
      if (host === 'api.cvg.test') {
        await this.toApi(request, response, entry)
        return
      }
      if (host === 'console.cvg.test' || host === 'mirror.cvg.test') {
        this.forward(request, response, entry, this.upstreams!.nginxPort, {})
        return
      }
      const aux = this.options.aux[host]
      if (aux) {
        aux(request, response, entry)
        return
      }
      entry.status = 421
      response.writeHead(421).end()
    } catch {
      entry.status = 502
      if (!response.headersSent) response.writeHead(502)
      response.end()
    }
  }

  private async toApi(
    request: IncomingMessage,
    response: ServerResponse,
    entry: EdgeLogEntry
  ): Promise<void> {
    const fault = this.faults.get(entry.path)
    if (fault === 'cut') {
      entry.fault = 'cut'
      request.socket.destroy()
      return
    }
    if (fault === '503' || fault === '403') {
      const status = fault === '503' ? 503 : 403
      entry.fault = fault === '503' ? 'status-503' : 'status-403'
      entry.status = status
      const cors: Record<string, string> = {}
      if (entry.origin !== null && entry.origin === this.consoleOrigin) {
        cors['access-control-allow-origin'] = entry.origin
        cors['access-control-allow-credentials'] = 'true'
        cors.vary = 'Origin'
      }
      entry.acao = cors['access-control-allow-origin'] ?? null
      entry.acac = Boolean(cors['access-control-allow-credentials'])
      response
        .writeHead(status, {
          ...cors,
          'content-type': 'application/json',
          'cache-control': 'private, no-store'
        })
        .end(
          JSON.stringify({
            success: false,
            data: null,
            error:
              status === 503
                ? {
                    code: 'configuration_error',
                    message: 'Synthetic edge outage'
                  }
                : { code: 'forbidden', message: 'Synthetic edge refusal' },
            meta: { correlationId: 'corr_spec0259_edge_fault' }
          })
        )
      return
    }
    const kind: PacedKind | undefined =
      request.method === 'POST' && entry.path === '/v1/auth/oidc/start'
        ? 'start'
        : request.method === 'GET' && entry.path === '/v1/auth/oidc/callback'
          ? 'callback'
          : undefined
    let releasedAt: number | undefined
    if (kind) {
      entry.paced = kind
      releasedAt = await this.options.pacer.release(kind)
    }
    this.forward(
      request,
      response,
      entry,
      this.upstreams!.apiPort,
      {
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '127.0.0.1'
      },
      releasedAt !== undefined && kind !== undefined
        ? (respondedAt) => {
            const latencyMs = respondedAt - releasedAt!
            entry.latencyMs = latencyMs
            if (latencyMs > MAX_PACED_LATENCY_MS) {
              this.violations.push({ seq: entry.seq, kind, latencyMs })
            }
          }
        : undefined
    )
  }

  private landing(
    location: string | undefined
  ): NonNullable<EdgeLogEntry['landing']> {
    if (location === undefined) return 'none'
    const console = this.consoleOrigin
    if (location === `${console}/`) return 'console'
    if (location === `${console}/#cvg-login=negado`) return 'negado'
    if (location === `${console}/#cvg-login=indisponivel`) return 'indisponivel'
    return 'other'
  }

  private forward(
    request: IncomingMessage,
    response: ServerResponse,
    entry: EdgeLogEntry,
    port: number,
    extra: Record<string, string>,
    onHeaders?: (at: number) => void
  ): void {
    const headers: IncomingHttpHeaders = {}
    for (const [name, value] of Object.entries(request.headers)) {
      if (HOP_BY_HOP.has(name)) continue
      if (name === 'x-forwarded-proto' || name === 'x-forwarded-for') continue
      if (name === 'forwarded' || name === 'x-forwarded-host') continue
      headers[name] = value
    }
    Object.assign(headers, extra)
    const upstream = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: request.method,
        path: request.url,
        headers
      },
      (incoming) => {
        onHeaders?.(Date.now())
        entry.status = incoming.statusCode ?? 0
        const acao = incoming.headers['access-control-allow-origin']
        entry.acao = typeof acao === 'string' ? acao : null
        entry.acac =
          incoming.headers['access-control-allow-credentials'] === 'true'
        if (
          entry.host === 'api.cvg.test' &&
          entry.path === '/v1/auth/oidc/callback'
        ) {
          entry.landing = this.landing(incoming.headers.location)
        }
        const out: Record<string, string | string[]> = {}
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (HOP_BY_HOP.has(name) || value === undefined) continue
          out[name] = value
        }
        response.writeHead(incoming.statusCode ?? 502, out)
        incoming.pipe(response)
      }
    )
    upstream.on('error', () => {
      entry.status = 502
      if (!response.headersSent) response.writeHead(502)
      response.end()
    })
    request.pipe(upstream)
  }
}
