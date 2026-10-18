#!/usr/bin/env node
/**
 * PLAN0374 Fase C (C6) — kernel audit chain anchors for backups.
 *
 * Runs INSIDE the harness image (same digest as serving), mounted read-only
 * at /app/scripts/cvg-chain-anchors.mjs, so it uses the image's `pg` driver
 * and the compiled verifier `verifyKernelAuditRows`
 * (apps/worker/dist/kernel-audit-chain.js) — the same check that
 * scripts/restore-audit-chain-proof.ts and verifyPersistedKernelAudit apply,
 * over the same rows (`audit_events` with `payload ? 'kernelAudit'`, read
 * under the tenant's `cvg.tenant_id` context).
 *
 *   emit    Opens a REPEATABLE READ READ ONLY transaction, prints
 *           `SNAPSHOT <id>` (pg_export_snapshot), verifies every tenant's
 *           chains inside that snapshot and prints `ANCHORS <json>`. It keeps
 *           the transaction open until stdin closes, so
 *           `pg_dump --snapshot=<id>` captures exactly the anchored state.
 *           An invalid live chain fails the backup (exit 2).
 *   verify  Reads an anchors document from stdin, verifies every anchored
 *           tenant against it (same ledgers, same event counts, same head
 *           hashes, no extra ledger) and prints `REPORT <json>`; exit 1 on
 *           any mismatch.
 *
 * Env: CVG_ANCHOR_DATABASE_URL (no password; node-postgres reads
 * PGPASSWORD), POSTGRES_SCHEMA, CVG_ANCHOR_TENANT_IDS (emit, comma list).
 * Diagnostics go to stderr as JSON lines and never echo connection strings.
 */
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export const SCHEMA_PATTERN = /^[a-z][a-z0-9_]{0,62}$/
export const TENANT_PATTERN =
  /^tenant_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const VERIFIER_MODULE = '../apps/worker/dist/kernel-audit-chain.js'
const KERNEL_AUDIT_ROWS = `SELECT correlation_id, payload
  FROM audit_events
 WHERE tenant_id = $1 AND payload ? 'kernelAudit'`

/** Anchors of one tenant from a verifier report (format of the proof). */
export function tenantAnchors(rows, verifyKernelAuditRows) {
  if (rows.length === 0) return { valid: true, events: 0, ledgers: {} }
  const report = verifyKernelAuditRows(rows, { payloads: 'strict' })
  return {
    valid: report.valid,
    events: report.events,
    invalidLedgers: report.ledgers
      .filter((ledger) => !ledger.valid)
      .map((ledger) => ({ ledgerId: ledger.ledgerId, reason: ledger.reason })),
    ledgers: Object.fromEntries(
      report.ledgers.map((ledger) => [
        ledger.ledgerId,
        { events: ledger.events, headHash: ledger.headHash ?? '' }
      ])
    )
  }
}

/** Verifies one tenant's restored rows against its stored anchors. */
export function verifyTenantAgainstAnchors(
  rows,
  expected,
  verifyKernelAuditRows
) {
  const anchored = expected?.ledgers ?? {}
  const expectedEvents = Number(expected?.events ?? 0)
  if (Object.keys(anchored).length === 0) {
    return {
      valid: rows.length === 0 && expectedEvents === 0,
      events: rows.length,
      expectedEvents,
      anchorMismatches: [],
      extraLedgers: [],
      payloadMismatches: 0
    }
  }
  const report = verifyKernelAuditRows(rows, {
    payloads: 'strict',
    anchors: anchored
  })
  const extraLedgers = report.ledgers
    .map((ledger) => ledger.ledgerId)
    .filter((ledgerId) => !(ledgerId in anchored))
  return {
    valid:
      report.valid &&
      extraLedgers.length === 0 &&
      report.events === expectedEvents,
    events: report.events,
    expectedEvents,
    anchorMismatches: report.anchorMismatches ?? [],
    extraLedgers,
    payloadMismatches: report.payloadMismatches
  }
}

function log(event, fields = {}) {
  process.stderr.write(`${JSON.stringify({ event, ...fields })}\n`)
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function schemaName() {
  const schema = requiredEnv('POSTGRES_SCHEMA')
  if (!SCHEMA_PATTERN.test(schema))
    throw new Error('POSTGRES_SCHEMA is invalid')
  return schema
}

function tenantIds(raw) {
  const ids = raw.split(',').map((value) => value.trim())
  if (ids.length === 0 || ids.some((id) => !TENANT_PATTERN.test(id))) {
    throw new Error('tenant ids must be tenant_<uuid>, comma separated')
  }
  return [...new Set(ids)]
}

async function connect(schema) {
  const { default: pg } = await import('pg')
  const connectionString = requiredEnv('CVG_ANCHOR_DATABASE_URL')
  const client = new pg.Client({ connectionString })
  client.on('error', () => undefined)
  await client.connect()
  await client.query('SELECT set_config($1, $2, false)', [
    'search_path',
    `"${schema}"`
  ])
  return client
}

async function readTenantRows(client, tenantId) {
  await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [tenantId])
  return (await client.query(KERNEL_AUDIT_ROWS, [tenantId])).rows
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      data += chunk
    })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

async function emit(verifyKernelAuditRows) {
  const schema = schemaName()
  const tenants = tenantIds(requiredEnv('CVG_ANCHOR_TENANT_IDS'))
  const client = await connect(schema)
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    // The exporting session idles while pg_dump runs.
    await client.query('SET LOCAL idle_in_transaction_session_timeout = 0')
    const snapshot = (
      await client.query('SELECT pg_export_snapshot() AS snapshot')
    ).rows[0]?.snapshot
    if (typeof snapshot !== 'string' || !/^[0-9A-Fa-f-]+$/.test(snapshot)) {
      throw new Error('pg_export_snapshot returned an unexpected value')
    }
    process.stdout.write(`SNAPSHOT ${snapshot}\n`)
    const document = {
      schemaVersion: 1,
      kind: 'cvg-harness-ledger-anchors',
      createdAt: new Date().toISOString(),
      schema,
      snapshot,
      tenants: {}
    }
    const invalid = []
    for (const tenantId of tenants) {
      const anchors = tenantAnchors(
        await readTenantRows(client, tenantId),
        verifyKernelAuditRows
      )
      if (!anchors.valid) {
        invalid.push({ tenantId, ledgers: anchors.invalidLedgers })
      }
      document.tenants[tenantId] = {
        events: anchors.events,
        ledgers: anchors.ledgers
      }
    }
    if (invalid.length > 0) {
      log('anchors.chain_invalid', { invalid })
      await client.query('ROLLBACK')
      return 2
    }
    process.stdout.write(`ANCHORS ${JSON.stringify(document)}\n`)
    log('anchors.ready', {
      tenants: tenants.length,
      events: Object.values(document.tenants).reduce(
        (sum, tenant) => sum + tenant.events,
        0
      )
    })
    // Hold the snapshot until the caller closes stdin (pg_dump finished).
    await readStdin()
    await client.query('COMMIT')
    log('anchors.released')
    return 0
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function verify(verifyKernelAuditRows) {
  const schema = schemaName()
  const document = JSON.parse(await readStdin())
  if (
    document?.kind !== 'cvg-harness-ledger-anchors' ||
    document.schemaVersion !== 1 ||
    typeof document.tenants !== 'object' ||
    document.tenants === null
  ) {
    throw new Error('stdin is not a cvg-harness-ledger-anchors document')
  }
  const tenants = tenantIds(Object.keys(document.tenants).join(','))
  const client = await connect(schema)
  const results = {}
  try {
    for (const tenantId of tenants) {
      await client.query('BEGIN READ ONLY')
      const rows = await readTenantRows(client, tenantId)
      await client.query('COMMIT')
      results[tenantId] = verifyTenantAgainstAnchors(
        rows,
        document.tenants[tenantId],
        verifyKernelAuditRows
      )
    }
  } finally {
    await client.end().catch(() => undefined)
  }
  const valid = Object.values(results).every((result) => result.valid)
  const report = {
    schemaVersion: 1,
    kind: 'cvg-harness-anchor-verification',
    schema,
    anchorsCreatedAt: document.createdAt,
    snapshot: document.snapshot,
    tenants: results,
    status: valid ? 'PASS' : 'FAIL'
  }
  process.stdout.write(`REPORT ${JSON.stringify(report)}\n`)
  return valid ? 0 : 1
}

async function main() {
  const mode = process.argv[2]
  if (mode !== 'emit' && mode !== 'verify') {
    throw new Error('usage: cvg-chain-anchors.mjs emit|verify')
  }
  const { verifyKernelAuditRows } = await import(
    new URL(VERIFIER_MODULE, import.meta.url).href
  )
  return mode === 'emit'
    ? emit(verifyKernelAuditRows)
    : verify(verifyKernelAuditRows)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      const message =
        error instanceof Error
          ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]')
          : 'unknown error'
      log('anchors.failed', { message })
      process.exitCode = 1
    })
}
