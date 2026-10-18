import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { writeFileSync, chmodSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import type { Client, Pool } from 'pg'
import {
  verifyNativeJournalBinding,
  journalCredentials,
  journalTmp,
  journalSchema,
  journalTenant,
  type NativeJournalBinding
} from './journal-result-process.ts'

/** Test-owned disposable lifecycle; never imported by production. */
export function createJournalResourceFixture(binding: NativeJournalBinding) {
  let admin: Client | undefined
  let pool: Pool | undefined
  let Journal:
    | typeof import('../../index.ts').PostgresOperationalEffectJournal
    | undefined
  let created = false
  const createdRoles: string[] = []
  const roleNames = ['c100_j225_service', 'c100_j225_old'] as const
  let activationReceipt: unknown
  const queryOld = `SELECT tenant_id,operation_key,proposal_hash,state,attempt_id,
  result,error,created_at,updated_at FROM operational_effect_journal
  WHERE tenant_id=$1 AND operation_key=$2`

  async function oldReaderDenied(): Promise<void> {
    const pg = (await import('pg')).default
    const old = new pg.Client({
      ...journalCredentials('old'),
      options: '-c search_path=' + journalSchema,
      application_name: 'c100-j225-old-negative',
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000
    })
    try {
      await old.connect()
      await assert.rejects(
        old.query(queryOld, [journalTenant, 'legacy-null']),
        (e: unknown) => (e as { code?: string }).code === '42501'
      )
    } finally {
      await old.end()
    }
  }

  const setup = async () => {
    assert.deepEqual(binding, verifyNativeJournalBinding())
    const pg = (await import('pg')).default
    const runtime = (await import(
      '../../../dist/index.js' as string
    )) as typeof import('../../index.ts')
    const guard = (await import(
      '../../../dist/operational-effect-result-guard.js' as string
    )) as typeof import('../../operational-effect-result-guard.ts')
    const readiness = (await import(
      '../../../dist/operational-effect-result-readiness.js' as string
    )) as typeof import('../../operational-effect-result-readiness.ts')
    Journal = runtime.PostgresOperationalEffectJournal
    admin = new pg.Client({
      ...journalCredentials('admin'),
      application_name: 'c100-j225-native-owner',
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000
    })
    await admin.connect()
    const identity = (
      await admin.query(
        'SELECT current_user AS principal,current_database() AS database'
      )
    ).rows[0]
    assert.equal(identity.principal, 'c100_journal_owner')
    assert.equal(identity.database, 'c100_journal_synthetic')
    assert.equal(
      (
        await admin.query('SELECT to_regnamespace($1) IS NULL AS absent', [
          journalSchema
        ])
      ).rows[0].absent,
      true
    )
    assert.equal(
      (
        await admin.query(
          'SELECT count(*)::integer AS count FROM pg_roles WHERE rolname=ANY($1::text[])',
          [roleNames]
        )
      ).rows[0].count,
      0
    )
    await runtime.runPostgresMigrations(admin, { schemaName: journalSchema })
    created = true
    // Fixture history predates activation; no conversion or adoption of these rows.
    await admin.query(
      `INSERT INTO operational_effect_journal(tenant_id,operation_key,proposal_hash,state,attempt_id,result) VALUES($1,'legacy-null','legacy-p','CONFIRMED','legacy-a','null'::jsonb),($1,'legacy-failed','legacy-p','FAILED','legacy-a',NULL),($1,'legacy-unknown','legacy-p','CONFIRMED','legacy-a',NULL)`,
      [journalTenant]
    )
    for (const [index, role] of roleNames.entries()) {
      const password = randomBytes(24).toString('hex')
      // Both identifiers are finite literals; the generated password is hex, not input.
      await admin.query(
        `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`
      )
      createdRoles.push(role)
      const path = join(
        journalTmp,
        'private',
        index === 0 ? 'service.json' : 'old.json'
      )
      writeFileSync(
        path,
        JSON.stringify({
          host: '127.0.0.1',
          port: 55880,
          database: 'c100_journal_synthetic',
          user: role,
          password
        }) + '\n',
        { mode: 0o600 }
      )
      chmodSync(path, 0o600)
    }
    await admin.query(
      'REVOKE CREATE,TEMPORARY ON DATABASE c100_journal_synthetic FROM PUBLIC'
    )
    await admin.query(
      `GRANT USAGE ON SCHEMA ${journalSchema} TO c100_j225_service,c100_j225_old`
    )
    await admin.query(
      `GRANT SELECT,INSERT,UPDATE ON ${journalSchema}.operational_effect_journal TO c100_j225_service`
    )
    await admin.query(
      `GRANT SELECT ON ${journalSchema}.schema_migrations,${journalSchema}.operational_executions TO c100_j225_service`
    )
    if (
      binding.profile === 'public-restart' ||
      binding.profile === 'capture-journal'
    ) {
      await admin.query(
        `GRANT SELECT,INSERT,UPDATE ON ${journalSchema}.operational_executions,${journalSchema}.operational_execution_steps,${journalSchema}.operational_execution_checkpoints TO c100_j225_service`
      )
    }
    if (binding.profile === 'bound-journal') {
      const tables = [
        'conversations',
        'messages',
        'sessions',
        'idempotency',
        'outbox_events',
        'outbox_attempts',
        'platform_agents',
        'platform_agent_versions',
        'operational_executions',
        'operational_execution_outbox',
        'operational_execution_events',
        'controlled_published_bindings',
        'controlled_published_evidence',
        'operational_execution_steps',
        'operational_execution_checkpoints',
        'operational_effect_journal',
        'effect_journal',
        'kernel_pause_switches'
      ] as const
      await admin.query(
        `GRANT SELECT,INSERT,UPDATE ON ${tables.map((name) => journalSchema + '.' + name).join(',')} TO c100_j225_service`
      )
      await admin.query(
        `GRANT USAGE ON SEQUENCE ${journalSchema}.outbox_attempts_id_seq,${journalSchema}.operational_execution_events_sequence_seq TO c100_j225_service`
      )
    }
    // Old credentials resolve the intended table and fail42501 before binding opens.
    await oldReaderDenied()
    const acl = (
      await admin.query(
        `SELECT NOT has_table_privilege('c100_j225_old',$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') AS old_denied,
    (SELECT count(*)::integer FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='c100_j225_service') OR roleid=(SELECT oid FROM pg_roles WHERE rolname='c100_j225_service')) AS memberships,
    (SELECT count(*)::integer FROM pg_stat_activity WHERE datname=current_database() AND usename='c100_j225_old') AS old_sessions`,
        [journalSchema + '.operational_effect_journal']
      )
    ).rows[0]
    assert.deepEqual(acl, { old_denied: true, memberships: 0, old_sessions: 0 })
    const activation = guard.renderJournalResultActivation(
      journalSchema,
      'c100_j225_service'
    )
    await admin.query(activation.sql)
    pool = new pg.Pool({
      ...journalCredentials('service'),
      max: 1,
      options: '-c search_path=' + journalSchema,
      application_name: 'c100-j225-native-service',
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
      query_timeout: 12000
    })
    const client = await pool.connect()
    try {
      activationReceipt = {
        runId: binding.runId,
        resourceId: binding.containerId,
        acl,
        bindingSha256: activation.bindingSha256,
        readiness: await readiness.verifyJournalResultStorage(client, 1),
        schema: journalSchema,
        principal: 'c100_j225_service',
        compiledInputs: binding.inputs,
        modelCalls: 0,
        toolBodies: 0
      }
    } finally {
      client.release()
    }
    writeFileSync(
      join(binding.evidenceRoot, binding.runId + '-activation.json'),
      JSON.stringify(activationReceipt, null, 2) + '\n'
    )
  }
  const cleanup = async () => {
    const failures: unknown[] = []
    if (pool) {
      try {
        await pool.end()
      } catch (error) {
        failures.push(error)
      }
    }
    if (!admin) return
    try {
      if (created) {
        // Actual durable bytes are retained as a bounded synthetic state artifact, not a service log.
        const rows = (
          await admin.query(
            `SELECT to_jsonb(j) AS row FROM ${journalSchema}.operational_effect_journal j ORDER BY tenant_id,operation_key`
          )
        ).rows.map((x) => x.row)
        const raw = Buffer.from(JSON.stringify(rows))
        writeFileSync(
          join(binding.evidenceRoot, binding.runId + '-durable-rows.json.gz'),
          gzipSync(raw)
        )
        writeFileSync(
          join(binding.evidenceRoot, binding.runId + '-durable-state.json'),
          JSON.stringify(
            {
              kind: 'SYNTHETIC_DURABLE_STATE_ONLY',
              rows: rows.length,
              bytes: raw.length,
              sha256: createHash('sha256').update(raw).digest('hex'),
              resourceId: binding.containerId,
              modelCalls: 0,
              toolBodies: 0
            },
            null,
            2
          ) + '\n'
        )
        verifyNativeJournalBinding()
        const sessions = (
          await admin.query(
            'SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname=current_database() AND usename=ANY($1::text[])',
            [roleNames]
          )
        ).rows[0].count
        assert.equal(sessions, 0)
        await admin.query(`DROP SCHEMA ${journalSchema} CASCADE`)
      }
      for (const role of createdRoles) {
        await admin.query(`DROP OWNED BY ${role}`)
        await admin.query(`DROP ROLE ${role}`)
      }
      for (const name of createdRoles.map((role) =>
        role === roleNames[0] ? 'service' : 'old'
      ))
        unlinkSync(join(journalTmp, 'private', name + '.json'))
    } catch (error) {
      failures.push(error)
    } finally {
      try {
        await admin.end()
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length)
      throw new AggregateError(
        failures,
        'Native journal fixture cleanup failed'
      )
  }
  return {
    setup,
    cleanup,
    oldReaderDenied,
    get admin() {
      assert(admin)
      return admin
    },
    get pool() {
      assert(pool)
      return pool
    },
    get Journal() {
      assert(Journal)
      return Journal
    },
    get activationReceipt() {
      return activationReceipt
    }
  }
}
