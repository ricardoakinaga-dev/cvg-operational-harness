/**
 * SPEC0259 §4.11 — the three-host environment of the browser proof (test
 * support only, run with `tsx` by the Playwright global setup). It builds the
 * OIDC console bundle with `NODE_ENV=production` once the ports exist, serves
 * it with the real NGINX image of `Dockerfile` (hardened container, port only
 * on 127.0.0.1), starts the API entrypoint (`apps/api/src/main.ts`) with
 * PostgreSQL, the synthetic IdP over HTTPS and the TLS edge, then publishes
 * the non-secret state and serves a loopback control channel with a random
 * token. SIGTERM removes the container, stops processes by PID (never
 * `pkill -f`), drops the PostgreSQL roles and schemas and the temporary
 * directories. Nothing here is real data, a real IdP or production.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import {
  createServer as createHttpServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createOidcPostgresFixture,
  type OidcPostgresFixture
} from '../../../apps/api/src/__tests__/support/oidc-postgres-fixture.ts'
import {
  expectedOperatorId,
  findLeaks,
  SyntheticOidcIssuer,
  syntheticClientMaterial,
  syntheticGroupMatrix,
  syntheticOidcEnv,
  type SyntheticHttpsEndpoint
} from '../../../apps/api/src/__tests__/support/synthetic-oidc-issuer.ts'
import { createProofCertificates } from './certificates.ts'
import { ProofEdge, type EdgeFault, type EdgeLogEntry } from './edge.ts'
import {
  CONSOLE_NGINX_TEMPLATE_PATH,
  renderConsoleNginxConf
} from './nginx-console.ts'
import { LoginPacer, type PacedKind } from './pacer.ts'
import {
  FORBIDDEN_PORTS,
  READY_LINE,
  STATE_ENV,
  type ProofState,
  type ProofUser
} from './state.ts'

const root = process.cwd()
const CLIENT_ID = 'cvg-synthetic-console'

function portFromEnv(name: string): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return 0
  const port = Number(raw)
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`${name} must be a TCP port`)
  }
  if (FORBIDDEN_PORTS.has(port)) throw new Error(`${name} is reserved`)
  return port
}

async function freePort(preferred: number): Promise<number> {
  const server = createHttpServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(preferred, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (FORBIDDEN_PORTS.has(port)) return freePort(0)
  return port
}

function nginxImage(): string {
  const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')
  const match =
    /^FROM (nginxinc\/nginx-unprivileged:[^\s@]+@sha256:[0-9a-f]{64}) AS web$/m.exec(
      dockerfile
    )
  if (!match) throw new Error('Dockerfile has no pinned NGINX web stage')
  return match[1]!
}

function docker(args: string[]): string {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`docker ${args[0]} failed: ${result.stderr.trim()}`)
  }
  return result.stdout.trim()
}

function openReadable(path: string): void {
  const stat = statSync(path)
  if (stat.isDirectory()) {
    chmodSync(path, 0o755)
    for (const entry of readdirSync(path)) openReadable(join(path, entry))
  } else {
    chmodSync(path, 0o644)
  }
}

function countFiles(path: string): number {
  return statSync(path).isDirectory()
    ? readdirSync(path).reduce(
        (total, entry) => total + countFiles(join(path, entry)),
        0
      )
    : 1
}

function localGet(
  port: number,
  path: string,
  headers: Record<string, string> = {}
) {
  return new Promise<number>((resolve, reject) => {
    const outgoing = httpRequest(
      { host: '127.0.0.1', port, path, method: 'GET', headers },
      (incoming) => {
        incoming.resume()
        incoming.on('end', () => resolve(incoming.statusCode ?? 0))
      }
    )
    outgoing.on('error', reject)
    outgoing.end()
  })
}

async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs: number,
  what: string
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if (await check()) return
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`${what} did not become ready`)
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      try {
        resolve(text ? JSON.parse(text) : {})
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response
    .writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    })
    .end(JSON.stringify(body))
}

function html(
  response: ServerResponse,
  entry: EdgeLogEntry,
  body: string,
  headers: Record<string, string | string[]> = {}
) {
  entry.status = 200
  response
    .writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...headers
    })
    .end(body)
}

async function main(): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for the three-host proof')
  }
  const statePath = process.env[STATE_ENV]
  if (!statePath) throw new Error(`${STATE_ENV} is required`)
  const work = mkdtempSync(join(tmpdir(), 'cvg-0259-hosts-'))
  const cleanups: (() => Promise<void> | void)[] = [
    () => rmSync(work, { recursive: true, force: true })
  ]
  let apiChild: ChildProcess | undefined
  let apiOutput = ''
  let fixture: OidcPostgresFixture | undefined
  let idpEndpoint: SyntheticHttpsEndpoint | undefined
  let containerName: string | undefined
  let closing = false

  const shutdown = async (code: number) => {
    if (closing) return
    closing = true
    for (const step of cleanups.reverse()) {
      try {
        await step()
      } catch {
        // keep cleaning
      }
    }
    process.exit(code)
  }
  process.on('SIGTERM', () => void shutdown(0))
  process.on('SIGINT', () => void shutdown(0))

  try {
    const certificatesDir = join(work, 'certificates')
    mkdirSync(certificatesDir)
    const certificates = createProofCertificates(certificatesDir)
    const material = syntheticClientMaterial()
    const pacer = new LoginPacer()
    const plants = new Map<string, { cookies: string[]; link?: string }>()

    const edge = new ProofEdge({
      key: certificates.test.key,
      cert: certificates.test.cert,
      pacer,
      aux: {
        'reports.cvg.test': (_request, response, entry) =>
          html(
            response,
            entry,
            '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatórios sintéticos</title></head><body><main><h1>Relatórios sintéticos</h1></main></body></html>'
          ),
        'sibling.cvg.test': (request, response, entry) => {
          const match = /^\/plant\/([a-f0-9]{16})$/.exec(entry.path)
          const plant = match ? plants.get(match[1]!) : undefined
          const link = plant?.link
            ? `<p><a id="continuar" href="${plant.link.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}">Continuar</a></p>`
            : ''
          html(
            response,
            entry,
            `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Origem irmã sintética</title></head><body><main><h1>Origem irmã sintética</h1>${link}</main></body></html>`,
            plant ? { 'set-cookie': plant.cookies } : {}
          )
          void request
        },
        'evil.other.test': (_request, response, entry) =>
          html(response, entry, '<!doctype html><title>outro site</title>')
      }
    })
    const edgePort = await edge.listen(portFromEnv('CVG_OIDC_HOSTS_EDGE_PORT'))
    if (FORBIDDEN_PORTS.has(edgePort)) throw new Error('edge port is reserved')
    cleanups.push(() => edge.close())
    const origin = (host: string) => `https://${host}:${edgePort}`
    const origins = {
      console: origin('console.cvg.test'),
      api: origin('api.cvg.test'),
      mirror: origin('mirror.cvg.test'),
      reports: origin('reports.cvg.test'),
      sibling: origin('sibling.cvg.test'),
      evil: origin('evil.other.test')
    }
    edge.consoleOrigin = origins.console
    const redirectUri = `${origins.api}/v1/auth/oidc/callback`

    // IdP over HTTPS with a leaf of the shared ephemeral CA (§4.10).
    const idp = new SyntheticOidcIssuer({
      issuer: 'https://localhost',
      clientId: CLIENT_ID,
      clientSecret: material.clientSecret,
      redirectUri,
      groupsClaim: 'synthetic_groups'
    })
    idpEndpoint = await idp.listenHttps({
      ca: certificates.ca,
      key: certificates.idp.key,
      cert: certificates.idp.cert
    })
    cleanups.push(() => idpEndpoint?.close())
    const idpPort = Number(new URL(idpEndpoint.issuer).port)

    fixture = await createOidcPostgresFixture(databaseUrl)
    cleanups.push(() => fixture?.close())

    // Console bundle: OIDC profile, NODE_ENV=production, after the ports.
    const consoleDir = join(work, 'console')
    const build = spawnSync(
      process.execPath,
      [
        join(root, 'node_modules/vite/bin/vite.js'),
        '--config',
        'vite.config.mts',
        'build',
        'apps/web',
        '--outDir',
        consoleDir,
        '--emptyOutDir',
        '--logLevel',
        'error'
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 180_000,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: 'production',
          VITE_CVG_OPERATOR_LOGIN: 'oidc',
          VITE_CVG_CONSOLE_ORIGIN: origins.console,
          VITE_CVG_API_ORIGIN: origins.api,
          VITE_CVG_WEB_IDENTITY_MODE: 'trusted'
        }
      }
    )
    if (build.status !== 0) {
      throw new Error(`console build failed: ${build.stderr}`)
    }

    // Real NGINX: rendered template and bundle mounted read-only.
    const nginxDir = join(work, 'nginx')
    mkdirSync(nginxDir)
    writeFileSync(
      join(nginxDir, 'default.conf'),
      renderConsoleNginxConf(
        readFileSync(join(root, CONSOLE_NGINX_TEMPLATE_PATH), 'utf8'),
        origins.api
      )
    )
    openReadable(work)
    chmodSync(certificatesDir, 0o700)
    const image = nginxImage()
    containerName =
      process.env.CVG_OIDC_HOSTS_NGINX_NAME ||
      `cvg-0259-console-${randomBytes(4).toString('hex')}`
    const nginxHostPort = portFromEnv('CVG_OIDC_HOSTS_NGINX_PORT')
    docker([
      'run',
      '-d',
      '--name',
      containerName,
      '--read-only',
      '--tmpfs',
      '/tmp',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '-p',
      `127.0.0.1:${nginxHostPort === 0 ? '' : nginxHostPort}:8080`,
      '-v',
      `${join(nginxDir, 'default.conf')}:/etc/nginx/conf.d/default.conf:ro`,
      '-v',
      `${consoleDir}:/usr/share/nginx/html:ro`,
      image
    ])
    cleanups.push(() => {
      if (containerName) {
        spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' })
      }
    })
    const published = docker(['port', containerName, '8080/tcp'])
    const nginxPort = Number(/127\.0\.0\.1:(\d+)/.exec(published)?.[1])
    if (!nginxPort || FORBIDDEN_PORTS.has(nginxPort)) {
      throw new Error('NGINX port is unavailable')
    }
    await waitFor(
      async () => (await localGet(nginxPort, '/')) === 200,
      60_000,
      'NGINX'
    )

    // API entrypoint (O10 pattern): NODE_EXTRA_CA_CERTS only in the child.
    const apiPort = await freePort(portFromEnv('CVG_OIDC_HOSTS_API_PORT'))
    const apiEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'test',
      PORT: String(apiPort),
      NODE_EXTRA_CA_CERTS: certificates.caFile,
      CVG_IDENTITY_MODE: 'trusted',
      API_ALLOWED_ORIGINS: `${origins.console},${origins.reports}`,
      API_REQUIRE_HTTPS: 'true',
      API_TRUSTED_PROXY_ADDRESSES: '127.0.0.1',
      ...fixture.env,
      ...syntheticOidcEnv({
        issuer: idpEndpoint.issuer,
        clientId: CLIENT_ID,
        clientSecret: material.clientSecret,
        pendingCookieKey: material.pendingCookieKey,
        redirectUri,
        consoleOrigin: origins.console,
        matrix: syntheticGroupMatrix()
      })
    }
    apiChild = spawn(
      join(root, 'node_modules/.bin/tsx'),
      ['apps/api/src/main.ts'],
      { cwd: root, env: apiEnv }
    )
    apiChild.stdout?.on('data', (chunk) => {
      apiOutput += String(chunk)
    })
    apiChild.stderr?.on('data', (chunk) => {
      apiOutput += String(chunk)
    })
    const child = apiChild
    cleanups.push(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
        const timer = setTimeout(() => child.kill('SIGKILL'), 10_000)
        await new Promise((resolve) => child.once('close', resolve))
        clearTimeout(timer)
      }
    })
    await waitFor(
      async () => {
        if (child.exitCode !== null) {
          throw new Error('API exited')
        }
        return (await localGet(apiPort, '/live')) === 200
      },
      90_000,
      'API'
    ).catch((error: unknown) => {
      if (child.exitCode !== null) {
        throw new Error(`API exited early (${child.exitCode})`)
      }
      throw error
    })
    edge.upstreams = { apiPort, nginxPort }

    // Loopback control channel (random token, never in the state file).
    const token = randomBytes(24).toString('base64url')
    const tokenFile = join(work, 'control-token')
    writeFileSync(tokenFile, token, { mode: 0o600 })
    const extraSecrets = new Set<string>([
      material.pendingCookieKey,
      material.clientSecret,
      fixture.password
    ])
    const seedConversation = (tenantId: string, marker: string) =>
      new Promise<string>((resolve, reject) => {
        const body = JSON.stringify({
          externalMessageId: `spec0259-${marker}-${randomBytes(6).toString('hex')}`,
          senderRef: `+55119${String(randomBytes(3).readUIntBE(0, 3)).padStart(8, '0')}`,
          body: `Sintético ${marker}`,
          receivedAt: new Date().toISOString()
        })
        const outgoing = httpRequest(
          {
            host: '127.0.0.1',
            port: apiPort,
            method: 'POST',
            path: '/v1/webhooks/channels/whatsapp/messages',
            headers: {
              host: `api.cvg.test:${edgePort}`,
              'x-forwarded-proto': 'https',
              'x-tenant-id': tenantId,
              'content-type': 'application/json',
              'content-length': String(Buffer.byteLength(body))
            }
          },
          (incoming) => {
            const chunks: Buffer[] = []
            incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
            incoming.on('end', () => {
              try {
                const parsed = JSON.parse(
                  Buffer.concat(chunks).toString('utf8')
                )
                if (incoming.statusCode !== 200) {
                  reject(new Error(`seed failed with ${incoming.statusCode}`))
                  return
                }
                resolve(String(parsed.data.conversationId))
              } catch (error) {
                reject(error)
              }
            })
          }
        )
        outgoing.on('error', reject)
        outgoing.end(body)
      })

    const control = createHttpServer((request, response) => {
      void (async () => {
        if (request.headers.authorization !== `Bearer ${token}`) {
          sendJson(response, 401, { error: 'unauthorized' })
          return
        }
        const path = (request.url ?? '/').split('?')[0]
        const body = (
          request.method === 'POST' ? await readBody(request) : {}
        ) as Record<string, unknown>
        switch (`${request.method} ${path}`) {
          case 'GET /edge-log': {
            const since = Number(
              new URL(request.url ?? '/', 'http://x').searchParams.get(
                'since'
              ) ?? 0
            )
            sendJson(
              response,
              200,
              edge.log.filter((entry) => entry.seq > since)
            )
            return
          }
          case 'POST /edge-fault': {
            const target = String(body.path)
            const mode = body.mode as EdgeFault | null
            if (mode) edge.faults.set(target, mode)
            else edge.faults.delete(target)
            sendJson(response, 200, { ok: true })
            return
          }
          case 'POST /plant': {
            const id = randomBytes(8).toString('hex')
            plants.set(id, {
              cookies: (body.cookies as string[]).map(String),
              ...(typeof body.link === 'string' ? { link: body.link } : {})
            })
            sendJson(response, 200, { id })
            return
          }
          case 'POST /users': {
            const user = idp.addUser({
              groups: body.groups,
              ...(typeof body.idTokenTtlSeconds === 'number'
                ? { idTokenTtlSeconds: body.idTokenTtlSeconds }
                : {})
            })
            const proofUser: ProofUser = {
              username: user.username,
              password: user.password,
              totpSecretHex: user.totpSecret.toString('hex'),
              operatorId: expectedOperatorId(idp.issuer, user.sub)
            }
            sendJson(response, 200, proofUser)
            return
          }
          case 'GET /idp-calls':
            sendJson(response, 200, { ...idp.calls })
            return
          case 'POST /idp-controls': {
            if (body.tokenStatus === null) delete idp.controls.tokenStatus
            else if (typeof body.tokenStatus === 'number') {
              idp.controls.tokenStatus = body.tokenStatus
            }
            sendJson(response, 200, { ok: true })
            return
          }
          case 'POST /seed-conversation': {
            const conversationId = await seedConversation(
              String(body.tenantId),
              String(body.marker)
            )
            sendJson(response, 200, { conversationId })
            return
          }
          case 'GET /tasks-count': {
            const result = await fixture!.admin.query<{ n: number }>(
              `SELECT count(*)::int AS n FROM ${fixture!.data}.tasks`
            )
            sendJson(response, 200, { count: result.rows[0]!.n })
            return
          }
          case 'POST /reserve': {
            await pacer.reserve(body as Partial<Record<PacedKind, number>>)
            sendJson(response, 200, { ok: true, pacer: pacer.snapshot() })
            return
          }
          case 'POST /cancel-reservations':
            pacer.cancelReservations()
            sendJson(response, 200, { ok: true })
            return
          case 'GET /pacer':
            sendJson(response, 200, {
              snapshot: pacer.snapshot(),
              violations: edge.violations,
              paced: edge.log
                .filter((entry) => entry.paced)
                .map((entry) => ({
                  kind: entry.paced,
                  latencyMs: entry.latencyMs ?? null,
                  status: entry.status
                }))
            })
            return
          case 'POST /secrets': {
            for (const value of (body.values as string[]) ?? []) {
              if (typeof value === 'string' && value.length >= 6) {
                extraSecrets.add(value)
              }
            }
            sendJson(response, 200, { ok: true })
            return
          }
          case 'POST /leak-check': {
            const nginxLogs = spawnSync('docker', ['logs', containerName!], {
              encoding: 'utf8'
            })
            const sources: Record<string, string> = {
              edgeLog: JSON.stringify(edge.log),
              apiOutput,
              nginxLog: `${nginxLogs.stdout}${nginxLogs.stderr}`
            }
            const texts = (body.texts as Record<string, string>) ?? {}
            for (const [name, text] of Object.entries(texts)) {
              sources[`proof:${name}`] = String(text)
            }
            const secrets = [...idp.secrets, ...extraSecrets]
            const leaked: string[] = []
            for (const [name, text] of Object.entries(sources)) {
              if (findLeaks([text], secrets).length > 0) leaked.push(name)
            }
            sendJson(response, 200, {
              leakedSources: leaked,
              checkedSources: Object.keys(sources),
              secrets: secrets.length
            })
            return
          }
          default:
            sendJson(response, 404, { error: 'not_found' })
        }
      })().catch((error: unknown) => {
        if (!response.headersSent) {
          sendJson(response, 500, {
            error: error instanceof Error ? error.message : 'error'
          })
        }
      })
    })
    await new Promise<void>((resolve) =>
      control.listen(0, '127.0.0.1', () => resolve())
    )
    cleanups.push(
      () => new Promise<void>((resolve) => control.close(() => resolve()))
    )
    const controlPort = (control.address() as AddressInfo).port

    const state: ProofState = {
      edgePort,
      apiPort,
      nginxPort,
      idpPort,
      origins: { ...origins, idp: idpEndpoint.issuer },
      spki: [certificates.test.spki, certificates.idp.spki],
      caFile: certificates.caFile,
      control: { url: `http://127.0.0.1:${controlPort}`, tokenFile },
      nginx: { image, container: containerName },
      consoleBundle: { files: countFiles(consoleDir) }
    }
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
    process.stdout.write(`${READY_LINE} ${statePath}\n`)
  } catch (error) {
    process.stderr.write(
      `three-host environment failed: ${error instanceof Error ? error.message : String(error)}\n`
    )
    await shutdown(1)
  }
}

void main()
