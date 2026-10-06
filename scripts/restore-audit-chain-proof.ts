#!/usr/bin/env tsx
/**
 * PROD-0373 — barra 0373, condição 8 ("backup testado"): a PostgreSQL backup
 * restored with the governed kernel's audit chain intact.
 *
 * 1. Own disposable PostgreSQL 16 container (synthetic data only).
 * 2. Real kernel workload: signed-off inbound → outbox → worker kernel turns
 *    (approval requested, approved, executed once, replay refused).
 * 3. The kernel audit chain is verified from `audit_events`.
 * 4. `pg_dump --format=custom` → `pg_restore` into a fresh database.
 * 5. The restored chain is verified again and must match the source
 *    (ledgers, event counts, head hashes); row counts must match too.
 * 6. One restored row is rewritten: the verifier must break.
 *
 * Profile: the in-process API runs the synthetic test profile (unsigned
 * inbound, NODE_ENV=test), as the kernel integration tests do; signed
 * production webhooks are proven by scripts/production-stack-smoke.ts.
 *
 * Usage: NODE_ENV=test npx tsx scripts/restore-audit-chain-proof.ts --output <file.json>
 */
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Client, Pool } from 'pg'
import { runPostgresMigrations, withTenantContext } from '@cvg/persistence'
import { TenantIdSchema } from '@cvg/platform'
import { buildServer } from '../apps/api/src/server.ts'
import {
  KERNEL_WORKER_RUNTIME,
  createPostgresKernelHandlers,
  createPostgresKernelRuntime
} from '../apps/worker/src/kernel-composition.ts'
import { createPostgresControlledWorker } from '../apps/worker/src/postgres-controlled.ts'
import {
  verifyPersistedKernelAudit,
  type KernelAuditChainReport
} from '../apps/worker/src/kernel-audit-chain.ts'

const TENANT = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000873'
)
const AGENT = 'agent_00000000-0000-4000-8000-000000000873'
const IMAGE = 'postgres:16-alpine'
const PASSWORD = 'synthetic-restore-proof'

function requireSyntheticProfile(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'restore-audit-chain-proof runs the in-process API under the synthetic test profile: run it with NODE_ENV=test'
    )
  }
}

function args(): { output: string } {
  const index = process.argv.indexOf('--output')
  const output = index >= 0 ? process.argv[index + 1] : undefined
  if (!output) throw new Error('--output <file.json> is required')
  return { output: path.resolve(output) }
}

function docker(argv: string[], input?: Buffer): Buffer {
  const result = spawnSync('docker', argv, {
    input,
    maxBuffer: 512 * 1024 * 1024
  })
  if (result.status !== 0) {
    throw new Error(
      `docker ${argv[0]} failed: ${result.stderr?.toString('utf8').slice(0, 500)}`
    )
  }
  return result.stdout
}

async function waitForPostgres(container: string): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = spawnSync('docker', [
      'exec',
      container,
      'pg_isready',
      '-U',
      'postgres'
    ])
    if (ready.status === 0) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('PostgreSQL did not become ready')
}

function chainSummary(report: KernelAuditChainReport) {
  return {
    valid: report.valid,
    events: report.events,
    payloadMismatches: report.payloadMismatches,
    ledgers: report.ledgers.map((ledger) => ({
      ledgerId: ledger.ledgerId,
      valid: ledger.valid,
      events: ledger.events,
      headHash: ledger.headHash ?? null,
      ...(ledger.reason
        ? { reason: ledger.reason, brokenAt: ledger.brokenAt }
        : {})
    }))
  }
}

async function rowCounts(url: string): Promise<Record<string, number>> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const counts: Record<string, number> = {}
    for (const table of [
      'audit_events',
      'outbox_events',
      'runtime_approvals',
      'effect_journal',
      'messages',
      'schema_migrations'
    ]) {
      const result = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ${table}`
      )
      counts[table] = Number(result.rows[0]?.count ?? 0)
    }
    return counts
  } finally {
    await client.end()
  }
}

async function workload(url: string): Promise<{ turns: number }> {
  const pool = new Pool({ connectionString: url })
  const apiPool = new Pool({ connectionString: url })
  const env: NodeJS.ProcessEnv = {
    DATABASE_URL: url,
    POSTGRES_SCHEMA: 'public',
    POSTGRES_RLS_ENFORCEMENT: 'true',
    CVG_WORKER_CONTROLLED_MODE: 'true',
    CVG_WORKER_TENANT_ID: TENANT,
    CVG_WORKER_AGENT_ID: AGENT,
    CVG_WORKER_RUNTIME: KERNEL_WORKER_RUNTIME,
    CVG_WORKER_ID: 'worker-restore-proof'
  }
  const app = buildServer({
    persistence: { kind: 'postgres-pool', pool: apiPool },
    durableInbound: true,
    inboundTenantResolver: () => TENANT
  })
  const runtime = createPostgresKernelRuntime({
    pool,
    tenantId: TENANT,
    env,
    agentId: AGENT
  })
  const worker = createPostgresControlledWorker(
    env,
    createPostgresKernelHandlers(env, runtime)
  )
  let turns = 0
  const body = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      cvgTurn: {
        capability: 'record.update',
        action: 'record.update',
        resource: { type: 'record_draft', id: 'draft_restore_proof' },
        dataClassification: 'INTERNAL',
        operatorId: 'op_synthetic_restore',
        operatorRole: 'Operator',
        agentVersion: 'synthetic-v1',
        agentProfile: 'assistant',
        modelProfile: 'fast',
        message: 'synthetic restore proof draft update',
        idempotencyKey: 'restore-proof-op',
        ...overrides
      }
    })
  const inbound = async (
    externalMessageId: string,
    payloadBody: string,
    thread?: { conversationId: string; sessionId: string }
  ) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        senderRef: 'synthetic-restore-sender',
        externalMessageId,
        body: payloadBody,
        receivedAt: '2026-10-06T12:00:00.000Z',
        ...(thread
          ? {
              conversationId: thread.conversationId,
              sessionId: thread.sessionId
            }
          : {})
      }
    })
    if (response.statusCode !== 200) {
      throw new Error(`inbound ${externalMessageId}: ${response.statusCode}`)
    }
    const data = response.json<{
      data: {
        outbox: { id: string; conversationId: string; sessionId: string }
      }
    }>().data
    const processed = await worker.worker.processNext(data.outbox.id)
    if (processed?.status !== 'processed') {
      throw new Error(`turn ${externalMessageId}: ${processed?.status}`)
    }
    turns += 1
    return data.outbox
  }
  try {
    await runtime.preflight()
    const first = await inbound('restore-msg-1', body())
    const [approval] = await runtime.approvals.list(TENANT, 'REQUESTED')
    if (!approval) throw new Error('no approval was requested')
    await runtime.approvals.submit(
      TENANT,
      approval.approvalId,
      'op_synthetic_restore'
    )
    await runtime.approvals.approve(TENANT, approval.approvalId, {
      approverId: 'op_synthetic_approver'
    })
    await inbound(
      'restore-msg-2',
      body({ approvalId: approval.approvalId }),
      first
    )
    await inbound(
      'restore-msg-3',
      body({ approvalId: approval.approvalId }),
      first
    )
    if (runtime.toolInvocations.length !== 1) {
      throw new Error(
        `expected one effect, saw ${runtime.toolInvocations.length}`
      )
    }
    return { turns }
  } finally {
    await app.close()
    await worker.pool.end()
    await pool.end()
    await apiPool.end()
  }
}

async function main(): Promise<void> {
  requireSyntheticProfile()
  const { output } = args()
  const container = `cvg-restore-proof-${randomBytes(4).toString('hex')}`
  const startedAt = new Date().toISOString()
  docker([
    'run',
    '-d',
    '--rm',
    '--name',
    container,
    '-e',
    `POSTGRES_PASSWORD=${PASSWORD}`,
    '-p',
    '127.0.0.1::5432',
    IMAGE
  ])
  try {
    await waitForPostgres(container)
    const port = docker(['port', container, '5432/tcp'])
      .toString('utf8')
      .trim()
      .split(':')
      .pop()
    const base = `postgres://postgres:${PASSWORD}@127.0.0.1:${port}`
    const admin = new Client({ connectionString: `${base}/postgres` })
    await admin.connect()
    await admin.query('CREATE DATABASE cvg_source')
    await admin.query('CREATE DATABASE cvg_restored')
    await admin.query('CREATE DATABASE cvg_payload_tamper')
    await admin.end()
    const sourceUrl = `${base}/cvg_source`
    const restoredUrl = `${base}/cvg_restored`

    const migrator = new Client({ connectionString: sourceUrl })
    await migrator.connect()
    await runPostgresMigrations(migrator)
    await migrator.end()

    const work = await workload(sourceUrl)
    const sourcePool = new Pool({ connectionString: sourceUrl })
    const sourceChain = await verifyPersistedKernelAudit(sourcePool, TENANT)
    await sourcePool.end()
    const sourceCounts = await rowCounts(sourceUrl)

    const dump = docker([
      'exec',
      container,
      'pg_dump',
      '-U',
      'postgres',
      '--format=custom',
      '--no-owner',
      'cvg_source'
    ])
    const restore = (database: string) =>
      docker(
        [
          'exec',
          '-i',
          container,
          'pg_restore',
          '-U',
          'postgres',
          '--no-owner',
          '--exit-on-error',
          '-d',
          database
        ],
        dump
      )
    restore('cvg_restored')
    restore('cvg_payload_tamper')

    const restoredPool = new Pool({ connectionString: restoredUrl })
    // The restored copy must end exactly where the source ended.
    const anchors = Object.fromEntries(
      sourceChain.ledgers.map((ledger) => [
        ledger.ledgerId,
        { events: ledger.events, headHash: ledger.headHash ?? '' }
      ])
    )
    const restoredChain = await verifyPersistedKernelAudit(
      restoredPool,
      TENANT,
      {
        anchors
      }
    )
    const restoredCounts = await rowCounts(restoredUrl)

    // Tamper control: rewrite one restored event; the verifier must break.
    await withTenantContext(restoredPool, TENANT, (client) =>
      client.query(
        `UPDATE audit_events
            SET payload = jsonb_set(payload, '{kernelAudit,eventType}', '"runtime.executed"')
          WHERE id = (SELECT id FROM audit_events
                       WHERE payload ? 'kernelAudit'
                       ORDER BY created_at, id LIMIT 1 OFFSET 2)`
      )
    )
    const tamperedChain = await verifyPersistedKernelAudit(restoredPool, TENANT)
    await restoredPool.end()

    // Payload control on a second restore: only a stored payload changes.
    const payloadPool = new Pool({
      connectionString: `${base}/cvg_payload_tamper`
    })
    await withTenantContext(payloadPool, TENANT, (client) =>
      client.query(
        `UPDATE audit_events
            SET payload = jsonb_set(payload, '{kernelAudit,payload}', '{"synthetic":"rewritten"}')
          WHERE id = (SELECT id FROM audit_events
                       WHERE payload ? 'kernelAudit'
                       ORDER BY created_at, id LIMIT 1 OFFSET 4)`
      )
    )
    const payloadTamperedChain = await verifyPersistedKernelAudit(
      payloadPool,
      TENANT
    )
    await payloadPool.end()

    const sameChains =
      JSON.stringify(chainSummary(sourceChain).ledgers) ===
      JSON.stringify(chainSummary(restoredChain).ledgers)
    const sameCounts =
      JSON.stringify(sourceCounts) === JSON.stringify(restoredCounts)
    const pass =
      sourceChain.valid &&
      restoredChain.valid &&
      sameChains &&
      sameCounts &&
      !tamperedChain.valid &&
      !payloadTamperedChain.valid &&
      sourceChain.events > 0
    const report = {
      schemaVersion: 1,
      kind: 'cvg-restore-audit-chain-proof',
      condition: 'barra-0373-condicao-8',
      task: 'PROD-0373-20261006',
      startedAt,
      finishedAt: new Date().toISOString(),
      postgres: { image: IMAGE, format: 'pg_dump-custom' },
      dataPolicy: 'synthetic-only',
      workload: work,
      backup: { bytes: dump.length },
      source: { chain: chainSummary(sourceChain), counts: sourceCounts },
      restored: { chain: chainSummary(restoredChain), counts: restoredCounts },
      verification: { payloads: 'strict', anchoredToSource: true },
      apiProfile: 'synthetic test profile (NODE_ENV=test, unsigned inbound)',
      payloadTamperControl: {
        rewritten: 'kernelAudit.payload of the fifth persisted event',
        detected: !payloadTamperedChain.valid,
        chain: chainSummary(payloadTamperedChain)
      },
      tamperControl: {
        rewritten: 'kernelAudit.eventType of the third persisted event',
        detected: !tamperedChain.valid,
        chain: chainSummary(tamperedChain)
      },
      checks: { sameChains, sameCounts },
      status: pass ? 'PASS' : 'FAIL'
    }
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
    process.stdout.write(
      `${JSON.stringify({ status: report.status, output, events: sourceChain.events })}\n`
    )
    if (!pass) process.exitCode = 1
  } finally {
    spawnSync('docker', ['rm', '--force', container], { stdio: 'ignore' })
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  )
  process.exitCode = 1
})
