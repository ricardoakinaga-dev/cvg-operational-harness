#!/usr/bin/env tsx
/**
 * PROD-0373 — barra 0373, condições 3, 4, 7, 9 e 10 na pilha real.
 *
 * Runs the hardened image (API and worker, NODE_ENV=production, --read-only,
 * --cap-drop ALL) against its own disposable PostgreSQL with separate
 * migration, runtime and operator-session roles, and records:
 *   - /live and /ready;
 *   - operator login (token → session cookie), protected route 200, no
 *     session 401;
 *   - a signed webhook accepted, processed by the worker kernel, an approval
 *     executed once, a repeated execution refused, and the original webhook
 *     replay refused after an API restart;
 *   - the kernel pause switch holding new work and draining it after resume;
 *   - a stop alert delivered to a receiver when the worker is stopped.
 * Synthetic data only; no provider, channel or external network.
 *
 * Usage: npx tsx scripts/production-stack-smoke.ts --image <ref> --output <file.json>
 */
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Client, Pool } from 'pg'
import {
  PostgresApprovalAuthority,
  PostgresWorkerOperations,
  TENANT_SCHEMA_TABLES,
  runPostgresMigrations,
  withTenantContext
} from '@cvg/persistence'
import { TenantIdSchema } from '@cvg/platform'
import {
  grantOperatorSessionFunctions,
  runOperatorSessionMigrations
} from '../packages/persistence/src/operator-session-migrations.ts'
import { createTrustedOperatorIdentityToken } from '../apps/api/src/operator-identity.ts'
import { createWebhookSignature } from '../apps/api/src/webhook-security.ts'

const TENANT = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000573'
)
const AGENT = 'agent_00000000-0000-4000-8000-000000000573'
const PASSWORD = 'synthetic_smoke_only'
const ORIGIN = 'https://smoke.synthetic.test'
const IDENTITY_KEY = {
  keyId: 'smoke-synthetic',
  secret: 'smoke-synthetic-identity-secret-0123456789abcdef'
}
const WEBHOOK_SECRET = 'smoke-synthetic-webhook-secret-0123456789abcdef'
const ALERT_SECRET = 'smoke-synthetic-alert-secret-0123456789abcdef'

interface Check {
  readonly name: string
  readonly pass: boolean
  readonly detail?: unknown
}

function args(): { image: string; output: string } {
  const value = (flag: string) => {
    const index = process.argv.indexOf(flag)
    const found = index >= 0 ? process.argv[index + 1] : undefined
    if (!found) throw new Error(`${flag} is required`)
    return found
  }
  return { image: value('--image'), output: path.resolve(value('--output')) }
}

function docker(argv: string[]): string {
  const result = spawnSync('docker', argv, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`docker ${argv.slice(0, 2).join(' ')}: ${result.stderr}`)
  }
  return result.stdout.trim()
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor<T>(
  probe: () => Promise<T | undefined>,
  timeoutMs = 30_000,
  intervalMs = 250
): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const value = await probe()
      if (value !== undefined) return value
    } catch (error) {
      lastError = error
    }
    await delay(intervalMs)
  }
  throw new Error(
    `timed out${lastError instanceof Error ? `: ${lastError.message}` : ''}`
  )
}

async function main(): Promise<void> {
  const { image, output } = args()
  const id = randomBytes(4).toString('hex')
  const network = `cvg-prod-smoke-${id}`
  const pgName = `cvg-prod-smoke-pg-${id}`
  const apiName = `cvg-prod-smoke-api-${id}`
  const workerName = `cvg-prod-smoke-worker-${id}`
  const receiverName = `cvg-prod-smoke-alerts-${id}`
  const checks: Check[] = []
  const check = (name: string, pass: boolean, detail?: unknown) => {
    checks.push({ name, pass, ...(detail !== undefined ? { detail } : {}) })
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}\n`)
  }
  const startedAt = new Date().toISOString()
  const hardened = [
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=16m'
  ]

  docker(['network', 'create', network])
  try {
    const gateway = docker([
      'network',
      'inspect',
      network,
      '--format',
      '{{(index .IPAM.Config 0).Gateway}}'
    ])
    docker([
      'run',
      '-d',
      '--name',
      pgName,
      '--network',
      network,
      '-e',
      `POSTGRES_PASSWORD=${PASSWORD}`,
      '-p',
      '127.0.0.1::5432',
      'postgres:16-alpine'
    ])
    await waitFor(async () =>
      spawnSync('docker', ['exec', pgName, 'pg_isready', '-U', 'postgres'])
        .status === 0
        ? true
        : undefined
    )
    const hostPort = docker(['port', pgName, '5432/tcp']).split(':').pop()
    // The image restarts the server after init: wait for a real query.
    await waitFor(
      async () => {
        const probe = new Client({
          connectionString: `postgres://postgres:${PASSWORD}@127.0.0.1:${hostPort}/postgres`
        })
        probe.on('error', () => undefined)
        try {
          await probe.connect()
          await probe.query('SELECT 1')
          return true
        } finally {
          await probe.end().catch(() => undefined)
        }
      },
      60_000,
      500
    )
    await delay(1_000)
    const hostUrl = (role: string) =>
      `postgres://${role}:${PASSWORD}@127.0.0.1:${hostPort}/postgres`
    const netUrl = (role: string) =>
      `postgres://${role}:${PASSWORD}@${pgName}:5432/postgres`

    // Roles and schemas: migration owner, runtime, auth owner, session.
    const data = 'cvg_data'
    const auth = 'cvg_auth'
    const migration = 'cvg_migration'
    const owner = 'cvg_auth_owner'
    const runtime = 'cvg_runtime'
    const session = 'cvg_session'
    const admin = new Client({ connectionString: hostUrl('postgres') })
    await admin.connect()
    for (const role of [migration, owner, runtime, session]) {
      await admin.query(
        `CREATE ROLE ${role} LOGIN PASSWORD '${PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`
      )
    }
    await admin.query(`CREATE SCHEMA ${data} AUTHORIZATION ${migration}`)
    await admin.query(`GRANT USAGE ON SCHEMA ${data} TO ${runtime}`)
    await admin.query(`ALTER ROLE ${migration} SET search_path = ${data}`)
    await admin.query(`ALTER ROLE ${runtime} SET search_path = ${data}`)
    const migrator = new Client({ connectionString: hostUrl(migration) })
    await migrator.connect()
    await runPostgresMigrations(migrator, {
      schemaName: data,
      createSchema: false
    })
    await migrator.end()
    await admin.query(`GRANT CREATE ON DATABASE postgres TO ${owner}`)
    const authOwner = new Client({ connectionString: hostUrl(owner) })
    await authOwner.connect()
    await runOperatorSessionMigrations(authOwner, auth, data)
    await grantOperatorSessionFunctions(authOwner, auth, session)
    await authOwner.end()
    await admin.query(`REVOKE CREATE ON DATABASE postgres FROM ${owner}`)
    for (const table of TENANT_SCHEMA_TABLES) {
      await admin.query(
        `GRANT SELECT,INSERT,UPDATE ON ${data}.${table} TO ${runtime}`
      )
    }
    await admin.query(`GRANT SELECT ON ${data}.schema_migrations TO ${runtime}`)
    await admin.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ${data}.webhook_replay_events,${data}.rate_limit_buckets TO ${runtime}`
    )
    await admin.end()
    check('postgres.roles_separated', true, {
      migration,
      runtime,
      session,
      owner
    })

    // Alert receiver: same image, plain node HTTP server on the network.
    docker([
      'run',
      '-d',
      '--name',
      receiverName,
      '--network',
      network,
      ...hardened,
      image,
      'node',
      '-e',
      "require('http').createServer((q,r)=>{let b='';q.on('data',c=>b+=c);q.on('end',()=>{console.log(JSON.stringify({signature:q.headers['x-cvg-alert-signature'],timestamp:q.headers['x-cvg-alert-timestamp'],body:b}));r.writeHead(204).end()})}).listen(8080)"
    ])

    const apiEnv: Record<string, string> = {
      NODE_ENV: 'production',
      PORT: '3000',
      API_PERSISTENCE_MODE: 'postgres',
      DATABASE_URL: netUrl(runtime),
      DATABASE_MIGRATION_URL: netUrl(migration),
      POSTGRES_SCHEMA: data,
      POSTGRES_RLS_ENFORCEMENT: 'true',
      POSTGRES_AUTO_MIGRATE: 'false',
      OUTBOX_DURABLE_INBOUND: 'true',
      CVG_IDENTITY_MODE: 'trusted',
      CVG_OPERATOR_IDENTITY_KEYRING: JSON.stringify({ current: IDENTITY_KEY }),
      CVG_OPERATOR_SESSION_DATABASE_URL: netUrl(session),
      CVG_OPERATOR_AUTH_SCHEMA: auth,
      CVG_OPERATOR_SESSION_ROLE: session,
      CVG_RATE_LIMIT_KEYRING: JSON.stringify({
        budgetSecret: 'smoke-synthetic-budget-secret-0123456789abcdef',
        current: {
          keyId: 'smoke-rate',
          secret: 'smoke-synthetic-rate-secret-0123456789abcdef'
        }
      }),
      INBOUND_TENANT_ID: TENANT,
      INBOUND_AGENT_ID: AGENT,
      WEBHOOK_SIGNING_SECRET: WEBHOOK_SECRET,
      API_ALLOWED_ORIGINS: ORIGIN,
      API_REQUIRE_HTTPS: 'true',
      // Host requests reach the published port through the bridge gateway,
      // which stands in for the TLS-terminating proxy.
      API_TRUSTED_PROXY_ADDRESSES: gateway,
      CVG_STOP_ALERT_WEBHOOK_URL: `http://${receiverName}:8080/alerts`,
      CVG_STOP_ALERT_WEBHOOK_SECRET: ALERT_SECRET,
      CVG_STOP_ALERT_TENANT_ID: TENANT,
      CVG_STOP_ALERT_WORKER_STALE_MS: '3000',
      CVG_STOP_ALERT_QUEUE_STALLED_MS: '3000',
      CVG_STOP_ALERT_INTERVAL_MS: '1000'
    }
    const envArgs = (env: Record<string, string>) =>
      Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`])
    const startApi = () => {
      docker([
        'run',
        '-d',
        '--name',
        apiName,
        '--network',
        network,
        ...hardened,
        '-p',
        '127.0.0.1::3000',
        ...envArgs(apiEnv),
        image
      ])
      return docker(['port', apiName, '3000/tcp']).split(':').pop()
    }
    let apiPort = startApi()
    const api = (pathname: string, init: RequestInit = {}) =>
      fetch(`http://127.0.0.1:${apiPort}${pathname}`, {
        ...init,
        headers: {
          origin: ORIGIN,
          'x-forwarded-proto': 'https',
          ...(init.headers as Record<string, string> | undefined)
        }
      })
    const live = await waitFor(async () => {
      const response = await api('/live')
      return response.status === 200 ? response.status : undefined
    }, 60_000)
    const ready = (await api('/ready')).status
    check('api.live', live === 200, live)
    check('api.ready', ready === 200, ready)

    // Condition 4: operator login.
    const identity = {
      operatorId: 'smoke.synthetic',
      role: 'Admin' as const,
      tenantId: TENANT
    }
    const anonymous = (await api('/v1/admin/agents')).status
    const login = await api('/v1/session', {
      headers: {
        'x-cvg-operator-token': createTrustedOperatorIdentityToken(
          identity,
          IDENTITY_KEY
        )
      }
    })
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
    const protectedStatus = (
      await api('/v1/admin/agents', { headers: { cookie } })
    ).status
    check('auth.no_session_401', anonymous === 401, anonymous)
    check(
      'auth.login_200',
      login.status === 200 && cookie.length > 0,
      login.status
    )
    check('auth.protected_200', protectedStatus === 200, protectedStatus)

    // Worker: production opt-in, continuous, durable kernel.
    const workerEnv: Record<string, string> = {
      NODE_ENV: 'production',
      DATABASE_URL: netUrl(runtime),
      POSTGRES_SCHEMA: data,
      POSTGRES_RLS_ENFORCEMENT: 'true',
      CVG_WORKER_CONTROLLED_MODE: 'true',
      CVG_WORKER_PRODUCTION_ENABLED: 'true',
      CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled',
      CVG_WORKER_RUN_MODE: 'continuous',
      CVG_WORKER_RUNTIME: 'kernel',
      CVG_WORKER_TENANT_ID: TENANT,
      CVG_WORKER_AGENT_ID: AGENT,
      CVG_WORKER_ID: 'worker-prod-smoke'
    }
    const startWorker = () =>
      docker([
        'run',
        '-d',
        '--name',
        workerName,
        '--network',
        network,
        ...hardened,
        ...envArgs(workerEnv),
        image,
        'node',
        'apps/worker/dist/main.js'
      ])
    startWorker()

    const pool = new Pool({ connectionString: hostUrl(runtime) })
    const approvals = new PostgresApprovalAuthority(pool)
    const operations = new PostgresWorkerOperations(pool)
    const outboxRows = () =>
      withTenantContext(
        pool,
        TENANT,
        async (client) =>
          (
            await client.query<{ id: string; type: string; status: string }>(
              'SELECT id, type, status FROM outbox_events WHERE tenant_id = $1 ORDER BY created_at',
              [TENANT]
            )
          ).rows
      )
    const journalRows = () =>
      withTenantContext(
        pool,
        TENANT,
        async (client) =>
          (
            await client.query<{ state: string }>(
              'SELECT state FROM effect_journal WHERE tenant_id = $1',
              [TENANT]
            )
          ).rows
      )
    await waitFor(async () =>
      (await operations.status(TENANT)).workers.length > 0 ? true : undefined
    )
    check('worker.started_production_kernel', true)

    let messageCount = 0
    const sendInbound = async (
      cvgTurn: Record<string, unknown>,
      thread?: { conversationId: string; sessionId: string },
      replay?: {
        eventId: string
        timestampSeconds: number
        rawBody: string
        body: Record<string, unknown>
      }
    ) => {
      messageCount += 1
      const eventId = replay?.eventId ?? `smoke_${id}_${messageCount}`
      const body =
        replay?.body ??
        ({
          body: JSON.stringify({ cvgTurn }),
          externalMessageId: eventId,
          receivedAt: new Date().toISOString(),
          senderRef: 'synthetic_smoke_sender',
          ...(thread ?? {})
        } as Record<string, unknown>)
      const rawBody = replay?.rawBody ?? JSON.stringify(body)
      const timestampSeconds =
        replay?.timestampSeconds ?? Math.floor(Date.now() / 1000)
      const response = await api('/v1/webhooks/channels/web/messages', {
        method: 'POST',
        body: rawBody,
        headers: {
          'content-type': 'application/json',
          'x-cvg-webhook-id': eventId,
          'x-cvg-webhook-timestamp': String(timestampSeconds),
          'x-cvg-webhook-signature': createWebhookSignature(WEBHOOK_SECRET, {
            eventId,
            timestampSeconds,
            channel: 'web',
            body,
            rawBody
          })
        }
      })
      const json = (await response.json().catch(() => ({}))) as {
        data?: {
          outbox?: { id: string; conversationId: string; sessionId: string }
        }
      }
      return {
        status: response.status,
        outbox: json.data?.outbox,
        replay: { eventId, timestampSeconds, rawBody, body }
      }
    }
    const turn = (overrides: Record<string, unknown> = {}) => ({
      capability: 'record.update',
      action: 'record.update',
      resource: { type: 'record_draft', id: 'draft_prod_smoke' },
      dataClassification: 'INTERNAL',
      operatorId: 'op_synthetic_smoke',
      operatorRole: 'Operator',
      agentVersion: 'synthetic-v1',
      agentProfile: 'assistant',
      modelProfile: 'fast',
      message: 'synthetic production smoke draft update',
      idempotencyKey: `prod-smoke-op-${id}`,
      ...overrides
    })
    const processed = (outboxId: string) =>
      waitFor(async () => {
        const row = (await outboxRows()).find(
          (candidate) => candidate.id === outboxId
        )
        return row?.status === 'processed' ? row : undefined
      })

    // Signed webhook → worker kernel → approval requested.
    const first = await sendInbound(turn())
    check(
      'webhook.signed_accepted',
      first.status === 200 && Boolean(first.outbox),
      first.status
    )
    await processed(first.outbox!.id)
    const [requested] = await approvals.list(TENANT, 'REQUESTED')
    check('kernel.approval_requested', Boolean(requested))
    await approvals.submit(TENANT, requested!.approvalId, 'op_synthetic_smoke')
    await approvals.approve(TENANT, requested!.approvalId, {
      approverId: 'op_synthetic_approver'
    })
    const thread = {
      conversationId: first.outbox!.conversationId,
      sessionId: first.outbox!.sessionId
    }
    const second = await sendInbound(
      turn({ approvalId: requested!.approvalId }),
      thread
    )
    await processed(second.outbox!.id)
    const third = await sendInbound(
      turn({ approvalId: requested!.approvalId }),
      thread
    )
    await processed(third.outbox!.id)
    const journal = await journalRows()
    const outbound = (await outboxRows()).filter(
      (row) => row.type === 'message.outbound'
    )
    check(
      'kernel.approved_effect_once',
      journal.length === 1 && journal[0]?.state === 'CONFIRMED',
      journal
    )
    check(
      'kernel.reuse_without_duplicate',
      outbound.length === 1,
      outbound.length
    )
    check(
      'kernel.approval_executed',
      (await approvals.get(TENANT, requested!.approvalId)).status === 'EXECUTED'
    )

    // Replay of the first signed webhook after an API restart.
    docker(['rm', '--force', apiName])
    apiPort = startApi()
    await waitFor(
      async () => ((await api('/ready')).status === 200 ? true : undefined),
      60_000
    )
    const replayed = await sendInbound({}, undefined, first.replay)
    check(
      'webhook.replay_refused_after_restart',
      replayed.status >= 400 && replayed.status < 500,
      replayed.status
    )

    // Condition 10: pause holds new work; resume drains it.
    await operations.setPaused(TENANT, {
      paused: true,
      actor: 'operator.synthetic',
      reason: 'prod smoke drill'
    })
    await delay(1_500)
    const held = await sendInbound(
      turn({ idempotencyKey: `prod-smoke-held-${id}` })
    )
    await delay(3_000)
    const heldRow = (await outboxRows()).find(
      (row) => row.id === held.outbox!.id
    )
    check(
      'pause.holds_pending_work',
      heldRow?.status === 'pending',
      heldRow?.status
    )
    await operations.setPaused(TENANT, {
      paused: false,
      actor: 'operator.synthetic'
    })
    await processed(held.outbox!.id)
    check('pause.resume_drains', true)

    // Condition 9: stop the worker; the API monitor alerts the receiver.
    docker(['rm', '--force', workerName])
    const alerts = await waitFor(
      async () => {
        const lines = docker(['logs', receiverName])
          .split('\n')
          .filter((line) => line.startsWith('{'))
          .map(
            (line) =>
              JSON.parse(line) as {
                body: string
                signature: string
                timestamp: string
              }
          )
        const firing = lines.filter(
          (line) => JSON.parse(line.body).code === 'worker_down'
        )
        return firing.length > 0 ? lines : undefined
      },
      30_000,
      500
    )
    const { createHmac } = await import('node:crypto')
    const signed = alerts.every(
      (alert) =>
        alert.signature ===
        createHmac('sha256', ALERT_SECRET)
          .update(`${alert.timestamp}.${alert.body}`)
          .digest('hex')
    )
    check(
      'alert.worker_down_delivered_signed',
      signed,
      alerts.map((alert) => JSON.parse(alert.body))
    )
    await pool.end()

    const pass = checks.every((entry) => entry.pass)
    const report = {
      schemaVersion: 1,
      kind: 'cvg-production-stack-smoke',
      task: 'PROD-0373-20261006',
      conditions: ['3', '4', '7', '9', '10'],
      image,
      imageId: docker(['image', 'inspect', image, '--format', '{{.Id}}']),
      runtime: { hardened, nodeEnv: 'production' },
      dataPolicy: 'synthetic-only',
      startedAt,
      finishedAt: new Date().toISOString(),
      checks,
      status: pass ? 'PASS' : 'FAIL'
    }
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
    process.stdout.write(
      `${JSON.stringify({ status: report.status, output })}\n`
    )
    if (!pass) process.exitCode = 1
  } catch (error) {
    for (const name of [apiName, workerName]) {
      const logs = spawnSync('docker', ['logs', '--tail', '30', name], {
        encoding: 'utf8'
      })
      process.stderr.write(`--- ${name}\n${logs.stdout}${logs.stderr}\n`)
    }
    throw error
  } finally {
    for (const name of [apiName, workerName, receiverName, pgName]) {
      spawnSync('docker', ['rm', '--force', name], { stdio: 'ignore' })
    }
    spawnSync('docker', ['network', 'rm', network], { stdio: 'ignore' })
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  )
  process.exitCode = 1
})
