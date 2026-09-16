import pg from '/home/ricardo/cvg-agent-secretary-v2/node_modules/pg/lib/index.js'
import { buildServer } from '/tmp/cvg-m1-round2-ixwtdmce/candidate/apps/api/src/server.ts'
const { Client, Pool } = pg
async function main() {
  const admin = new Client({
    connectionString: 'postgres://m1audit@127.0.0.1:55584/m1critic'
  })
  await admin.connect()
  await admin.query('SET search_path=critic')
  await admin.query(
    `INSERT INTO outbox_events(id,type,payload,status,tenant_id,idempotency_key,correlation_id,available_at) VALUES('ob_critic','synthetic','{}','pending','tenant_00000000-0000-4000-8000-000000000822','critic','corr_00000000-0000-4000-8000-000000000822',now()) ON CONFLICT DO NOTHING`
  )
  const role = new Client({
    connectionString: 'postgres://m1critic_worker@127.0.0.1:55584/m1critic'
  })
  await role.connect()
  await role.query('SET search_path=critic')
  await role.query(
    `SELECT set_config('cvg.tenant_id','tenant_00000000-0000-4000-8000-000000000821',false)`
  )
  console.log(
    JSON.stringify({
      case: 'tenant-A-reads-B-after-accepted-unsafe-policy',
      rows: (await role.query('SELECT tenant_id FROM outbox_events')).rows
    })
  )
  await role.end()
  const pool = new Pool({
    connectionString: 'postgres://m1audit@127.0.0.1:55584/m1critic',
    options: '-c search_path=critic'
  })
  const app = buildServer({
    persistence: { kind: 'postgres-pool', pool },
    requireAuthenticatedMutations: true
  })
  const headers = {
    'x-operator-id': 'operator.critic',
    'x-operator-role': 'Operator',
    'x-tenant-id': 'tenant_00000000-0000-4000-8000-000000000821'
  }
  await admin.query(
    `CREATE OR REPLACE FUNCTION reject_critic_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`
  )
  await admin.query(
    `CREATE TRIGGER reject_critic_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_critic_audit()`
  )
  const task = await app.inject({
    method: 'POST',
    url: '/v1/journeys/tasks',
    headers,
    payload: {
      sessionId: 'sess_00000000-0000-4000-8000-000000000821',
      title: 'synthetic HTTP',
      description: 'synthetic',
      idempotencyKey: 'http-critic'
    }
  })
  console.log(
    JSON.stringify({
      case: 'http-task-audit-failure',
      status: task.statusCode,
      counts: (
        await admin.query(
          'SELECT (SELECT count(*) FROM tasks) as tasks,(SELECT count(*) FROM audit_events) as audits'
        )
      ).rows
    })
  )
  const payload = {
    phone: '+5511999990001',
    name: 'Synthetic critic',
    idempotencyKey: 'http-owner-critic',
    auditContext: {
      actorType: 'Operator',
      actorId: 'forged',
      correlationId: 'corr_00000000-0000-4000-8000-000000000888'
    }
  }
  const before = await app.inject({
    method: 'POST',
    url: '/v1/journeys/owner-drafts',
    headers,
    payload
  })
  console.log(
    JSON.stringify({
      case: 'http-owner-audit-rejected',
      status: before.statusCode,
      counts: (await admin.query('SELECT count(*) FROM journey_owner_drafts'))
        .rows
    })
  )
  await admin.query('DROP TRIGGER reject_critic_audit ON audit_events')
  const after = await app.inject({
    method: 'POST',
    url: '/v1/journeys/owner-drafts',
    headers,
    payload
  })
  console.log(
    JSON.stringify({
      case: 'http-owner-retry-trusted-actor',
      status: after.statusCode,
      correlation: after.json().meta.correlationId,
      rows: (
        await admin.query(
          'SELECT actor_type,actor_id,correlation_id FROM audit_events'
        )
      ).rows
    })
  )
  await app.close()
  await pool.end()
  await admin.end()
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
