const PROGRESS = (m: string) => console.error(`[progress] ${m}`)
import pg from '/home/ricardo/cvg-agent-secretary-v2/node_modules/pg/lib/index.js'
import {
  runPostgresMigrations,
  PostgresJourneyRepository,
  InMemoryDatabase,
  JourneyRepository,
  ConversationRepository,
  AuditRepository
} from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/index.ts'

const { Client, Pool } = pg
const DATABASE_URL = 'postgres://cvg_prod@127.0.0.1:55481/critic3_http'
const schema = 'critic3_atomic'
const tenant = 'tenant_00000000-0000-4000-8000-000000000901'
const conversationId = 'conv_00000000-0000-4000-8000-000000000901'
const sessionId = 'sess_00000000-0000-4000-8000-000000000901'
const context = {
  actorType: 'Operator',
  actorId: 'operator.critic3',
  correlationId: 'corr_00000000-0000-4000-8000-000000000901'
}
const results: Record<string, unknown>[] = []
const errors: string[] = []

async function main(): Promise<void> {
  const admin = new Client({ connectionString: DATABASE_URL })
  await admin.connect()
  PROGRESS('admin connected')
  PROGRESS('memory parity done')
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await runPostgresMigrations(admin, { schemaName: schema })
  PROGRESS('migrations done')
  await admin.query(
    `INSERT INTO conversations(tenant_id,id,channel,sender_ref,sender_ref_hash,status,correlation_id,created_at,updated_at)
     VALUES($1,$2,'web','synthetic','fff','active',$3,now(),now())`,
    [tenant, conversationId, context.correlationId]
  )
  await admin.query(
    `INSERT INTO sessions(tenant_id,id,conversation_id,status,takeover_state,created_at,updated_at)
     VALUES($1,$2,$3,'active','BOT_ACTIVE',now(),now())`,
    [tenant, sessionId, conversationId]
  )

  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 1,
    options: `-c search_path=${schema}`
  })
  const removed: string[] = []
  pool.on('remove', () => removed.push('removed'))

  const repo = new PostgresJourneyRepository(pool)
  const input = (key: string) => ({
    tenantId: tenant,
    sessionId,
    title: 'synthetic task',
    description: 'synthetic',
    idempotencyKey: key,
    auditContext: context
  })

  // --- atomicity: real trigger rejects audit_events ---
  await admin.query(
    `CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`
  )
  await admin.query(
    `CREATE TRIGGER reject_audit BEFORE INSERT ON ${schema}.audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit()`
  )
  const pidBefore = (await pool.query('SELECT pg_backend_pid() AS pid')).rows[0]
    .pid
  let atomicError: string | undefined
  PROGRESS('trigger installed, calling repo')
  const atomicCode: string | undefined = await (async () => {
    try {
      await repo.createJourneyTask(input('atomic-1') as never)
      return undefined
    } catch (error) {
      atomicError = error instanceof Error ? error.message : String(error)
      return (error as { code?: string }).code
    }
  })()
  PROGRESS('atomic call returned')
  const afterFail = await pool.query(
    `SELECT pg_backend_pid() AS pid, NULLIF(current_setting('cvg.tenant_id', true), '') AS tenant_id,
            (SELECT count(*) FROM tasks)::int AS tasks,
            (SELECT count(*) FROM audit_events)::int AS audits`
  )
  results.push({
    case: 'trigger rejects audit: task/event zero, original error, context cleared after ROLLBACK, connection reused',
    atomicError,
    code: atomicCode,
    tasks: afterFail.rows[0].tasks,
    audits: afterFail.rows[0].audits,
    ownerContextAfterRollback: afterFail.rows[0].tenant_id,
    sameBackendReused: afterFail.rows[0].pid === pidBefore,
    poolRemoved: removed.length
  })
  await admin.query(`DROP TRIGGER reject_audit ON ${schema}.audit_events`)
  await admin.query(`DROP FUNCTION reject_audit()`)

  // --- retry after failure: exactly one task + one event ---
  PROGRESS('checking retry')
  const first = await repo.createJourneyTask(input('retry-01') as never)
  const replay = await repo.createJourneyTask(input('retry-01') as never)
  const state = await admin.query(
    `SELECT (SELECT count(*) FROM tasks)::int AS tasks,
            (SELECT count(*) FROM audit_events)::int AS audits`
  )
  const auditRow = await admin.query(
    `SELECT actor_type, actor_id, correlation_id FROM audit_events ORDER BY created_at DESC LIMIT 1`
  )
  results.push({
    case: 'retry after failure yields one task/one event with trusted context',
    sameId: first.id === replay.id,
    tasks: state.rows[0].tasks,
    audits: state.rows[0].audits,
    audit: auditRow.rows[0]
  })

  // --- concurrent identical replay with barrier, capture any 25P02 ---
  await pool.end()
  const pool2 = new Pool({
    connectionString: DATABASE_URL,
    max: 2,
    options: `-c search_path=${schema}`
  })
  let arrivals = 0
  let unlock: () => void = () => undefined
  const barrier = new Promise<void>((resolve) => {
    unlock = resolve
  })
  const wrapped = {
    connect: async () => {
      const client = await pool2.connect()
      return {
        query: async (sql: string, args?: unknown[]) => {
          if (sql.trim().startsWith('INSERT INTO tasks')) {
            if (++arrivals === 2) unlock()
            await barrier
          }
          return client.query(sql, args)
        },
        release: (error?: Error) => client.release(error)
      }
    }
  }
  const raceRepo = new PostgresJourneyRepository(wrapped as never)
  PROGRESS('starting concurrent replay')
  const settled = await Promise.allSettled([
    raceRepo.createJourneyTask(input('race-0001') as never),
    raceRepo.createJourneyTask(input('race-0001') as never)
  ])
  const raceShape = settled.map((entry) =>
    entry.status === 'fulfilled'
      ? { status: entry.status, id: entry.value.id }
      : {
          status: entry.status,
          code: (entry.reason as { code?: string }).code,
          message: (entry.reason as { message?: string }).message
        }
  )
  const raceCounts = await admin.query(
    `SELECT (SELECT count(*) FROM tasks WHERE idempotency_key='race-0001')::int AS tasks,
            (SELECT count(*) FROM audit_events WHERE payload->>'resourceId' = $1)::int AS audits`,
    [settled[0]!.status === 'fulfilled' ? settled[0]!.value.id : 'none']
  )
  results.push({
    case: 'concurrent same-key replay: same task, one event, no 25P02',
    raceShape,
    taskCountForKey: raceCounts.rows[0].tasks,
    eventCount: raceCounts.rows[0].audits,
    has25P02: JSON.stringify(raceShape).includes('25P02')
  })
  await pool2.end()
  PROGRESS('concurrency done')

  // --- memory parity: audit failure restores state, retry one event ---
  const db = new InMemoryDatabase()
  const seeded = new ConversationRepository(db).createWithSession({
    tenantId: tenant as never,
    channel: 'web',
    senderRef: 'synthetic',
    externalMessageId: 'synthetic-memory-parity',
    body: 'synthetic'
  })
  const memoryRepo = new JourneyRepository(db)
  const memoryInput = {
    tenantId: tenant as never,
    sessionId: seeded.session.id,
    title: 'synthetic',
    description: 'synthetic',
    idempotencyKey: 'memory-parity',
    auditContext: context as never
  }
  const auditAppend = AuditRepository.prototype.append
  let appendCalls = 0
  ;(AuditRepository.prototype as unknown as { append: unknown }).append =
    function patched(this: unknown, ...args: unknown[]) {
      appendCalls += 1
      if (appendCalls === 1) throw new Error('synthetic memory audit failure')
      return (auditAppend as (...a: unknown[]) => unknown).apply(this, args)
    }
  let memoryError: string | undefined
  try {
    memoryRepo.createJourneyTask(memoryInput as never)
  } catch (error) {
    memoryError = error instanceof Error ? error.message : String(error)
  }
  const tasksAfterFail = db.state.tasks.length
  const auditsAfterFail = db.state.auditEvents.length
  ;(AuditRepository.prototype as unknown as { append: unknown }).append =
    auditAppend
  const memoryTask = memoryRepo.createJourneyTask(memoryInput as never)
  const memoryReplay = memoryRepo.createJourneyTask(memoryInput as never)
  results.push({
    case: 'memory parity: failed audit restores zero state, retry same id one event',
    memoryError,
    tasksAfterFail,
    auditsAfterFail,
    sameId: memoryTask.id === memoryReplay.id,
    tasks: db.state.tasks.length,
    audits: db.state.auditEvents.length
  })

  PROGRESS('memory parity done')
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await admin.end()
  console.log(JSON.stringify({ results, errors }, null, 1))
}

main().catch((error) => {
  errors.push(
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  )
  console.log(JSON.stringify({ results, errors }, null, 1))
  process.exitCode = 1
})
