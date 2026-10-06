#!/usr/bin/env node
// PROD-0373 (barra 0373, condição 10) — the kernel "off button".
//
//   node scripts/ops-kernel-pause.mjs --tenant <tenant_id> --status
//   node scripts/ops-kernel-pause.mjs --tenant <tenant_id> --pause --actor <who> [--reason <text>]
//   node scripts/ops-kernel-pause.mjs --tenant <tenant_id> --resume --actor <who>
//
// Uses DATABASE_URL (and POSTGRES_SCHEMA when set). Pausing never deletes
// pending work: the worker stops claiming and the kernel starts no new effect;
// resuming lets the same pending items run. Writes go through the tenant's
// RLS context (migration 0027).
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const TENANT =
  /^tenant_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SCHEMA = /^[a-z][a-z0-9_]{0,62}$/

export function parseArgs(argv) {
  const args = { mode: undefined, tenant: undefined, actor: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = () => {
      const next = argv[index + 1]
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`${flag} requires a value`)
      }
      index += 1
      return next
    }
    if (flag === '--status' || flag === '--pause' || flag === '--resume') {
      if (args.mode)
        throw new Error('Choose one of --status, --pause, --resume')
      args.mode = flag.slice(2)
    } else if (flag === '--tenant') args.tenant = value()
    else if (flag === '--actor') args.actor = value()
    else if (flag === '--reason') args.reason = value()
    else throw new Error(`Unknown argument: ${flag}`)
  }
  if (!args.mode) throw new Error('Choose one of --status, --pause, --resume')
  if (!args.tenant || !TENANT.test(args.tenant)) {
    throw new Error('--tenant must be a tenant id (tenant_<uuid>)')
  }
  if (args.mode !== 'status') {
    if (
      !args.actor ||
      args.actor.trim().length < 1 ||
      args.actor.length > 200
    ) {
      throw new Error('--actor is required to change the switch')
    }
    if (args.reason !== undefined && args.reason.length > 500) {
      throw new Error('--reason must have at most 500 characters')
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new Error('DATABASE_URL is required')
  const schema = process.env.POSTGRES_SCHEMA?.trim()
  if (schema && !SCHEMA.test(schema)) throw new Error('Invalid POSTGRES_SCHEMA')
  const client = new pg.Client({
    connectionString,
    ...(schema ? { options: `-c search_path=${schema}` } : {})
  })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [
      args.tenant
    ])
    if (args.mode !== 'status') {
      await client.query(
        `INSERT INTO kernel_pause_switches (tenant_id, paused, reason, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (tenant_id) DO UPDATE SET
           paused = EXCLUDED.paused, reason = EXCLUDED.reason,
           updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [
          args.tenant,
          args.mode === 'pause',
          args.reason ?? null,
          args.actor.trim()
        ]
      )
    }
    const pause = await client.query(
      'SELECT paused, reason, updated_by, updated_at FROM kernel_pause_switches WHERE tenant_id = $1',
      [args.tenant]
    )
    const workers = await client.query(
      `SELECT worker_id, last_beat_at, last_progress_at, processed
         FROM worker_heartbeats WHERE tenant_id = $1 ORDER BY last_beat_at DESC LIMIT 20`,
      [args.tenant]
    )
    const queue = await client.query(
      `SELECT count(*) FILTER (WHERE status IN ('pending', 'failed'))::int AS waiting,
              count(*) FILTER (WHERE status = 'processing')::int AS processing
         FROM outbox_events WHERE tenant_id = $1`,
      [args.tenant]
    )
    await client.query('COMMIT')
    console.log(
      JSON.stringify(
        {
          tenantId: args.tenant,
          pause: pause.rows[0] ?? { paused: false },
          workers: workers.rows,
          queue: queue.rows[0]
        },
        null,
        2
      )
    )
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
