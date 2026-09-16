import pg from '/home/ricardo/cvg-agent-secretary-v2/node_modules/pg/lib/index.js'
import { runPostgresMigrations } from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/postgres.ts'
import { PostgresJourneyRepository } from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/journeys-postgres.ts'
async function main() {
  const admin = new pg.Pool({
    connectionString: 'postgres://audit_user@127.0.0.1:55583/postgres'
  })
  await admin.query('CREATE DATABASE cvg_backend_probe')
  await admin.end()
  const pool = new pg.Pool({
    connectionString: 'postgres://audit_user@127.0.0.1:55583/cvg_backend_probe'
  })
  try {
    const client = await pool.connect()
    try {
      await runPostgresMigrations(client)
    } finally {
      client.release()
    }
    await pool.query(
      `CREATE FUNCTION reject_probe_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`
    )
    await pool.query(
      'CREATE TRIGGER reject_probe_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_probe_audit()'
    )
    const repo = new PostgresJourneyRepository(pool as any)
    const input = {
      tenantId: 'tenant_00000000-0000-4000-8000-000000000191',
      idempotencyKey: 'synthetic-audit-failure-1',
      name: 'Synthetic Owner'
    } as any
    let firstError
    try {
      await repo.createOwnerDraft(input)
    } catch (e) {
      firstError = (e as Error).message
    }
    const afterFailure = await pool.query(
      'SELECT count(*)::int AS count FROM journey_owner_drafts'
    )
    await pool.query('DROP TRIGGER reject_probe_audit ON audit_events')
    const replay = await repo.createOwnerDraft(input)
    const audit = await pool.query(
      'SELECT count(*)::int AS count FROM audit_events'
    )
    console.log(
      JSON.stringify(
        {
          database: 'cvg_backend_probe',
          firstError,
          draftsAfterFailedMutation: afterFailure.rows[0].count,
          replayStatus: replay.status,
          auditRowsAfterReplay: audit.rows[0].count
        },
        null,
        2
      )
    )
  } finally {
    await pool.end()
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
