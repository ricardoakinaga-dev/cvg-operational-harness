import pg from '/home/ricardo/cvg-agent-secretary-v2/node_modules/pg/lib/index.js'
import { buildServer } from '/home/ricardo/cvg-agent-secretary-v2/apps/api/src/server.ts'
import { runPostgresMigrations } from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/index.ts'

const { Client, Pool } = pg
const DATABASE_URL = 'postgres://cvg_prod@127.0.0.1:55481/critic3_http'
const schema = 'critic3_http'
const tenant = 'tenant_00000000-0000-4000-8000-000000000902'
const conversationId = 'conv_00000000-0000-4000-8000-000000000902'
const sessionId = 'sess_00000000-0000-4000-8000-000000000902'
const results: Record<string, unknown>[] = []
const errors: string[] = []

async function main(): Promise<void> {
  const admin = new Client({ connectionString: DATABASE_URL })
  await admin.connect()
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await runPostgresMigrations(admin, { schemaName: schema })
  await admin.query(
    `INSERT INTO conversations(tenant_id,id,channel,sender_ref,sender_ref_hash,status,correlation_id,created_at,updated_at)
     VALUES($1,$2,'web','synthetic','fff','active','corr_00000000-0000-4000-8000-000000000902',now(),now())`,
    [tenant, conversationId]
  )
  await admin.query(
    `INSERT INTO sessions(tenant_id,id,conversation_id,status,takeover_state,created_at,updated_at)
     VALUES($1,$2,$3,'active','BOT_ACTIVE',now(),now())`,
    [tenant, sessionId, conversationId]
  )
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
    'x-operator-id': 'operator.trusted.critic3',
    'x-operator-role': 'Operator',
    'x-tenant-id': tenant
  }

  // --- HTTP task: spoofed body fields must be ignored; trusted header/meta recorded ---
  const taskResponse = await app.inject({
    method: 'POST',
    url: '/v1/journeys/tasks',
    headers: trustedHeaders,
    payload: {
      sessionId,
      title: 'spoof probe task',
      description: 'synthetic',
      idempotencyKey: 'spoof-task-0001',
      actorId: 'spoofed.actor',
      actorType: 'Admin',
      correlationId: 'corr_00000000-0000-4000-8000-000000000bad',
      tenantId: 'tenant_00000000-0000-4000-8000-0000000009ff',
      auditContext: {
        actorType: 'Admin',
        actorId: 'spoofed.actor',
        correlationId: 'corr_00000000-0000-4000-8000-000000000bad'
      }
    }
  })
  const taskBody = taskResponse.json() as {
    success: boolean
    data: { id: string; tenantId?: string }
    meta: { correlationId: string }
  }
  const taskAudit = await admin.query(
    `SELECT actor_type, actor_id, correlation_id, tenant_id, payload
       FROM audit_events
      WHERE payload->>'journey' = 'journey_task_created' AND payload->>'resourceId' = $1`,
    [taskBody.data?.id ?? 'none']
  )
  const storedTask = await admin.query(
    `SELECT tenant_id, id, session_id FROM tasks WHERE id = $1`,
    [taskBody.data?.id ?? 'none']
  )
  results.push({
    case: 'HTTP task with spoofed actor/correlation/tenant body fields',
    status: taskResponse.statusCode,
    responseMetaCorrelation: taskBody.meta?.correlationId,
    taskId: taskBody.data?.id,
    taskTenant: storedTask.rows[0]?.tenant_id,
    auditRow: taskAudit.rows[0]
      ? {
          actor_type: taskAudit.rows[0].actor_type,
          actor_id: taskAudit.rows[0].actor_id,
          correlation_id: taskAudit.rows[0].correlation_id,
          tenant_id: taskAudit.rows[0].tenant_id,
          payload: taskAudit.rows[0].payload
        }
      : null,
    recordedActorMatchesHeader:
      taskAudit.rows[0]?.actor_id === 'operator.trusted.critic3' &&
      taskAudit.rows[0]?.actor_type === 'Operator',
    recordedCorrelationMatchesMeta:
      taskAudit.rows[0]?.correlation_id === taskBody.meta?.correlationId,
    spoofedCorrelationIgnored:
      taskAudit.rows[0]?.correlation_id !==
      'corr_00000000-0000-4000-8000-000000000bad'
  })

  // --- HTTP owner draft with spoofed auditContext ---
  const ownerResponse = await app.inject({
    method: 'POST',
    url: '/v1/journeys/owner-drafts',
    headers: trustedHeaders,
    payload: {
      phone: '+5511999990009',
      name: 'Spoof Owner',
      idempotencyKey: 'spoof-owner-0001',
      actorId: 'spoofed.actor',
      actorType: 'Admin',
      correlationId: 'corr_00000000-0000-4000-8000-000000000bad',
      auditContext: { actorType: 'Admin', actorId: 'spoofed.actor' }
    }
  })
  const ownerBody = ownerResponse.json() as {
    data: { id: string }
    meta: { correlationId: string }
  }
  const ownerAudit = await admin.query(
    `SELECT actor_type, actor_id, correlation_id FROM audit_events
      WHERE payload->>'journey' = 'owner_draft_created' AND payload->>'resourceId' = $1`,
    [ownerBody.data?.id ?? 'none']
  )
  results.push({
    case: 'HTTP owner draft with spoofed auditContext',
    status: ownerResponse.statusCode,
    auditRow: ownerAudit.rows[0] ?? null,
    recordedActorMatchesHeader:
      ownerAudit.rows[0]?.actor_id === 'operator.trusted.critic3',
    recordedCorrelationMatchesMeta:
      ownerAudit.rows[0]?.correlation_id === ownerBody.meta?.correlationId
  })

  // --- HTTP task atomicity with real audit trigger ---
  const auditBefore = (
    await admin.query(`SELECT count(*)::int AS n FROM ${schema}.audit_events`)
  ).rows[0].n
  await admin.query(
    `CREATE FUNCTION reject_http_task_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic http audit failure'; END $$`
  )
  await admin.query(
    `CREATE TRIGGER reject_http_task_audit BEFORE INSERT ON ${schema}.audit_events FOR EACH ROW EXECUTE FUNCTION reject_http_task_audit()`
  )
  const failed = await app.inject({
    method: 'POST',
    url: '/v1/journeys/tasks',
    headers: trustedHeaders,
    payload: {
      sessionId,
      title: 'atomic failed task',
      description: 'synthetic',
      idempotencyKey: 'spoof-task-0002'
    }
  })
  const countsDuringTrigger = await admin.query(
    `SELECT (SELECT count(*) FROM tasks WHERE idempotency_key='spoof-task-0002')::int AS tasks,
            (SELECT count(*) FROM audit_events)::int AS audit_total`
  )
  await admin.query(`DROP TRIGGER reject_http_task_audit ON ${schema}.audit_events`)
  await admin.query(`DROP FUNCTION reject_http_task_audit()`)
  const retried = await app.inject({
    method: 'POST',
    url: '/v1/journeys/tasks',
    headers: trustedHeaders,
    payload: {
      sessionId,
      title: 'atomic failed task',
      description: 'synthetic',
      idempotencyKey: 'spoof-task-0002'
    }
  })
  const retriedBody = retried.json() as { data: { id: string } }
  const countsAfterRetry = await admin.query(
    `SELECT (SELECT count(*) FROM tasks WHERE idempotency_key='spoof-task-0002')::int AS tasks,
            (SELECT count(*) FROM audit_events WHERE payload->>'resourceId' = $1)::int AS audits`,
    [retriedBody.data?.id ?? 'none']
  )
  results.push({
    case: 'HTTP task atomicity: rejected audit leaves zero, retry yields one task/one event',
    failedStatus: failed.statusCode,
    failedCode: (failed.json() as { error: { code: string } }).error?.code,
    taskRowsOnFailure: countsDuringTrigger.rows[0]?.tasks,
    auditRowsOnFailure: countsDuringTrigger.rows[0]?.audit_total,
    auditRowsBefore: auditBefore,
    noAuditAddedOnFailure:
      countsDuringTrigger.rows[0]?.audit_total === auditBefore,
    retryStatus: retried.statusCode,
    taskRowsAfterRetry: countsAfterRetry.rows[0]?.tasks,
    auditsAfterRetry: countsAfterRetry.rows[0]?.audits
  })

  // --- payload audit for retried task also trusted ---
  const retriedAudit = await admin.query(
    `SELECT actor_type, actor_id, correlation_id FROM audit_events
      WHERE payload->>'resourceId' = $1 AND payload->>'journey' = 'journey_task_created'`,
    [retriedBody.data?.id ?? 'none']
  )
  results.push({
    case: 'retried HTTP task audit identity',
    auditRow: retriedAudit.rows[0] ?? null
  })

  await app.close()
  await pool.end()
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await admin.end()
  console.log(JSON.stringify({ results, errors }, null, 1))
}

main().catch((error) => {
  errors.push(error instanceof Error ? error.stack ?? error.message : String(error))
  console.log(JSON.stringify({ results, errors }, null, 1))
  process.exit(1)
})
