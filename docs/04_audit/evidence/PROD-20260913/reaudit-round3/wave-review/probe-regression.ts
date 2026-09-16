/**
 * Independent critical probe (wave3): M1 regression on new bytes.
 *  - PROD-06: journey owner-draft HTTP ignores spoofed body actor/auditContext.
 *  - AAA-22: readiness /ready 503 on failing db, /live 200, bounded probes and
 *    no pool-connection accumulation across repeats.
 * Writes only to stdout and to a dedicated schema in the disposable DB.
 */
import pg from '/home/ricardo/cvg-agent-secretary-v2/node_modules/pg/lib/index.js'
import { buildServer } from '/home/ricardo/cvg-agent-secretary-v2/apps/api/src/server.ts'
import { runPostgresMigrations } from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/index.ts'

const { Client, Pool } = pg
const DATABASE_URL = 'postgres://cvg_prod@127.0.0.1:55481/critic_wave3'
const schema = 'critic_wave3_http'
const tenant = 'tenant_00000000-0000-4000-8000-000000000902'
const otherTenant = 'tenant_00000000-0000-4000-8000-0000000009ff'
const results: Record<string, unknown> = {}

async function main(): Promise<void> {
  // ---------- PROD-06 ----------
  const admin = new Client({ connectionString: DATABASE_URL })
  await admin.connect()
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await runPostgresMigrations(admin, { schemaName: schema })
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 4,
    options: `-c search_path=${schema}`
  })
  const app = buildServer({
    persistence: { kind: 'postgres-pool', pool },
    requireAuthenticatedMutations: true
  })
  const trustedHeaders = {
    'x-operator-id': 'operator.wave3.critic',
    'x-operator-role': 'Operator',
    'x-tenant-id': tenant
  }
  const draft = await app.inject({
    method: 'POST',
    url: '/v1/journeys/owner-drafts',
    headers: trustedHeaders,
    payload: {
      phone: '+5511999990009',
      name: 'Wave3 Spoof Owner',
      idempotencyKey: 'wave3-spoof-owner-0001',
      actorId: 'spoofed.actor',
      actorType: 'Admin',
      correlationId: 'corr_00000000-0000-4000-8000-000000000bad',
      tenantId: otherTenant,
      auditContext: {
        actorType: 'Admin',
        actorId: 'spoofed.actor',
        correlationId: 'corr_00000000-0000-4000-8000-000000000bad'
      }
    }
  })
  const body = draft.json() as {
    success: boolean
    data: { id: string; tenantId?: string }
    meta: { correlationId: string }
    error: { code: string } | null
  }
  const audit = await admin.query(
    `SELECT actor_type, actor_id, correlation_id, tenant_id
       FROM ${schema}.audit_events
      WHERE payload->>'journey' = 'owner_draft_created'
        AND payload->>'resourceId' = $1`,
    [body.data?.id ?? 'none']
  )
  const row = audit.rows[0] as
    | {
        actor_type: string
        actor_id: string
        correlation_id: string
        tenant_id: string
      }
    | undefined
  results.prod06OwnerDraftSpoof = {
    status: draft.statusCode,
    responseTenant: body.data?.tenantId,
    auditRow: row ?? null,
    recordedActorIsTrustedHeader:
      row?.actor_id === 'operator.wave3.critic' &&
      row?.actor_type === 'Operator',
    recordedCorrelationMatchesResponseMeta:
      row?.correlation_id === body.meta?.correlationId,
    spoofedCorrelationIgnored:
      row?.correlation_id !== 'corr_00000000-0000-4000-8000-000000000bad',
    spoiledTenantIgnored: body.data?.tenantId === tenant
  }
  await app.close()
  await pool.end()
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await admin.end()

  // ---------- AAA-22: throwing singleton client ----------
  let queries = 0
  const failingClient = {
    query: async () => {
      queries += 1
      throw new Error('synthetic database unavailable postgres://secret@h/db')
    }
  }
  const readyApp = buildServer({
    persistence: { kind: 'postgres', client: failingClient as never },
    durableInbound: true
  })
  const readyStatuses: number[] = []
  for (let i = 0; i < 3; i += 1) {
    readyStatuses.push(
      (await readyApp.inject({ method: 'GET', url: '/ready' })).statusCode
    )
  }
  const readyBody = (
    await readyApp.inject({ method: 'GET', url: '/ready' })
  ).json() as {
    data: {
      ready: boolean
      checks: Array<{ name: string; status: string; detail: string }>
    }
  }
  const liveStatus = (await readyApp.inject({ method: 'GET', url: '/live' }))
    .statusCode
  results.aaa22ThrowingClient = {
    readyStatuses,
    allReady503: readyStatuses.every((status) => status === 503),
    liveStatus,
    readyFalse: readyBody.data?.ready === false,
    databaseCheckStatus: readyBody.data?.checks.find(
      (c) => c.name === 'database'
    )?.status,
    sanitized: !JSON.stringify(readyBody).includes('secret'),
    queries
  }
  await readyApp.close()

  // ---------- AAA-22: pool accumulation across repeats ----------
  let connected = 0
  let released = 0
  let destroyed = 0
  const failingPool = {
    connect: async () => {
      connected += 1
      return {
        query: async () => {
          throw new Error('synthetic pool failure')
        },
        release: (error?: Error) => {
          released += 1
          if (error) destroyed += 1
        }
      }
    }
  }
  const poolApp = buildServer({
    persistence: { kind: 'postgres-pool', pool: failingPool as never },
    durableInbound: true
  })
  const poolStatuses: number[] = []
  for (let i = 0; i < 5; i += 1) {
    poolStatuses.push(
      (await poolApp.inject({ method: 'GET', url: '/ready' })).statusCode
    )
  }
  const poolLive = (await poolApp.inject({ method: 'GET', url: '/live' }))
    .statusCode
  results.aaa22PoolAccumulation = {
    poolStatuses,
    allReady503: poolStatuses.every((status) => status === 503),
    liveStatus: poolLive,
    connected,
    released,
    destroyed,
    balanced: connected === released && released === destroyed
  }
  await poolApp.close()

  console.log(JSON.stringify(results, null, 1))
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      probe_error: error instanceof Error ? error.stack : String(error)
    })
  )
  process.exit(1)
})
