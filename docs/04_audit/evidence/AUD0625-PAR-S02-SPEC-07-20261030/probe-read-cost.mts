// Evidence probe (SPEC 0292): cost of one read of a session of N events through the S01 handle.
// Run: TEST_DATABASE_URL=... npx tsx <this file>. Creates and drops its own schema and role.
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { materializeSessionEvent } from '../../../../packages/harness/src/session/index.ts'
import { runSessionEventMigrations } from '../../../../packages/persistence/src/session-events.ts'
import {
  createPgPhysicalSessionPool,
  createPostgresSessionPersistence
} from '../../../../packages/persistence/src/session-persistence.ts'

const url = process.env.TEST_DATABASE_URL!
const sfx = randomBytes(5).toString('hex')
const schema = `s02probe_${sfx}`
const role = `s02probe_role_${sfx}`
const tenant = 'tenant-synthetic-A'
const admin = new Client({ connectionString: url })
await admin.connect()
await runSessionEventMigrations(admin, { schemaName: schema })
await admin.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'p'`)
await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
await admin.query(`GRANT SELECT, INSERT ON ${schema}.session_events, ${schema}.session_streams TO ${role}`)
await admin.query(`GRANT UPDATE (next_sequence) ON ${schema}.session_streams TO ${role}`)
await admin.query(`GRANT SELECT ON ${schema}.schema_migrations TO ${role}`)
const u = new URL(url)
u.username = role
u.password = 'p'
const readPool = new Pool({ connectionString: u.toString(), max: 4 })
const svc = (
  await createPostgresSessionPersistence(createPgPhysicalSessionPool({ connectionString: u.toString() }), readPool, {
    tenantId: tenant,
    schemaName: schema,
    maxOpenWriters: 4
  })
).service
const turn = (id: string, from: number, c: string) =>
  [
    ['message/user', { text: `ask ${c}` }],
    ['turn/start', { correlationId: c }],
    ['model/request', null],
    ['turn/end', { correlationId: c, stopReason: 'COMPLETED' }],
    ['message/assistant', { text: `answer ${c}` }]
  ]
    .filter(([t]) => t !== 'model/request')
    .map(([type, payload], i) =>
      materializeSessionEvent(
        {
          tenantId: tenant, sessionId: id, formatVersion: 1, eventId: `${id}-${from + i}`,
          timestamp: '2026-10-29T00:00:00.000Z', correlationId: c, traceId: 't', type, payload
        } as never,
        from + i
      )
    )
const rows: string[] = []
for (const turns of [25, 250, 1250, 5000]) {
  const id = `p${turns}`
  const w = await svc.create({ version: 1, id, createdAt: 1, isSeeded: false })
  let n = 1
  for (let t = 0; t < turns; t += 50) {
    const batch = []
    for (let k = t; k < Math.min(turns, t + 50); k++) {
      const ev = turn(id, n, `c${k}`)
      batch.push(...ev)
      n += ev.length
    }
    await w.append(batch)
  }
  await w.close()
  const r = await svc.open(id, 'read')
  const events = n - 1
  const time = async (f: () => Promise<unknown>) => {
    const t0 = performance.now()
    await f()
    return performance.now() - t0
  }
  const full = await time(() => r.read(0))
  const one = await time(() => r.read(events - 1, 1))
  const rows1 = await admin.query(`SELECT count(*)::int n FROM ${schema}.session_events WHERE session_id=$1`, [id])
  rows.push(`${events} events | read(0) ${full.toFixed(0)} ms | read(last 1) ${one.toFixed(0)} ms | rows ${rows1.rows[0].n}`)
  console.log(rows.at(-1))
  await r.close()
}
await readPool.end()
await admin.query(`DROP SCHEMA ${schema} CASCADE`)
await admin.query(`DROP ROLE ${role}`)
await admin.end()
