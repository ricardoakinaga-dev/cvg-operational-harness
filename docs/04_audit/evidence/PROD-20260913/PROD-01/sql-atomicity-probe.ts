/**
 * PROD-01 baseline probe — reproduces D13-01 (journey mutation and audit are
 * committed separately) on the current tree, before any correction.
 *
 * Synthetic data only. Uses a disposable database via TEST_DATABASE_URL and a
 * dedicated schema so repeated runs start clean.
 */
import pg from 'pg'
import { runPostgresMigrations } from '../../../../../packages/persistence/src/postgres.ts'
import { PostgresJourneyRepository } from '../../../../../packages/persistence/src/journeys-postgres.ts'

const url =
  process.env.TEST_DATABASE_URL ??
  'postgres://cvg_prod@127.0.0.1:55481/prod01_probe'
const schema = process.env.PROD_PROBE_SCHEMA ?? 'prod01_probe_atomicity'

async function main(): Promise<void> {
  const admin = new pg.Client({ connectionString: url })
  await admin.connect()
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await runPostgresMigrations(admin, { schemaName: schema })
  } finally {
    await admin.end()
  }

  const pool = new pg.Pool({
    connectionString: url,
    options: `-c search_path=${schema}`
  })
  try {
    await pool.query(
      `CREATE FUNCTION reject_probe_audit() RETURNS trigger
         LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`
    )
    await pool.query(
      'CREATE TRIGGER reject_probe_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_probe_audit()'
    )
    const repo = new PostgresJourneyRepository(pool)
    const input = {
      tenantId: 'tenant_00000000-0000-4000-8000-000000000191',
      idempotencyKey: 'synthetic-audit-failure-prod01',
      name: 'Synthetic Owner'
    }
    let firstError: string | undefined
    try {
      await repo.createOwnerDraft(input as never)
    } catch (error) {
      firstError = (error as Error).message
    }
    const afterFailure = await pool.query(
      'SELECT count(*)::int AS count FROM journey_owner_drafts'
    )
    const auditAfterFailure = await pool.query(
      'SELECT count(*)::int AS count FROM audit_events'
    )
    await pool.query('DROP TRIGGER reject_probe_audit ON audit_events')
    const replay = await repo.createOwnerDraft(input as never)
    const audit = await pool.query(
      'SELECT count(*)::int AS count FROM audit_events'
    )
    console.log(
      JSON.stringify(
        {
          probe: 'sql-atomicity',
          schema,
          firstError,
          draftsAfterFailedMutation: afterFailure.rows[0].count,
          auditAfterFailedMutation: auditAfterFailure.rows[0].count,
          replayStatus: replay.status,
          auditRowsAfterReplay: audit.rows[0].count,
          verdict:
            afterFailure.rows[0].count === 0 &&
            auditAfterFailure.rows[0].count === 0 &&
            Boolean(firstError) &&
            replay.status === 'draft' &&
            audit.rows[0].count === 1
              ? 'PASS_ATOMIC'
              : 'FAIL_PARTIAL_STATE'
        },
        null,
        2
      )
    )
  } finally {
    await pool.end()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
