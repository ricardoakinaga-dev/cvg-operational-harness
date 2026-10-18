import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { randomBytes, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { writeFileSync, chmodSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import type { Client, Pool } from 'pg'
import {
  verifyNativeJournalBinding,
  journalCredentials,
  journalTmp,
  journalRoot,
  journalSchema,
  journalTenant,
  journalOtherTenant,
  journalValues,
  type NativeJournalBinding
} from './fixtures/journal-result-process.ts'

// Explicit Node22 native command only. No describe.skip or default unit discovery.
let binding: NativeJournalBinding
let admin: Client | undefined
let pool: Pool | undefined
let Journal: typeof import('@cvg/persistence').PostgresOperationalEffectJournal
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

before(async () => {
  binding = verifyNativeJournalBinding()
  const pg = (await import('pg')).default
  const runtime = await import('@cvg/persistence')
  const guard = await import('../../dist/operational-effect-result-guard.js')
  const readiness =
    await import('../../dist/operational-effect-result-readiness.js')
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
})

after(async () => {
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
    throw new AggregateError(failures, 'Native journal fixture cleanup failed')
})

describe(
  'SPEC0225 native journal profile — no public-loop or global credit',
  { concurrency: false },
  () => {
    it('preserves JSON value/type/bytes via write/get/re-reserve in three fresh OS processes', () => {
      const frames: { pid: number; phase: string; frames: unknown[] }[] = []
      for (const phase of ['write', 'read', 'reserve']) {
        const script = join(
          journalRoot,
          'packages/persistence/src/__tests__/fixtures/journal-result-process.ts'
        )
        const args = ['--experimental-strip-types', script, phase]
        const child = spawnSync(process.execPath, args, {
          cwd: journalRoot,
          env: process.env,
          encoding: 'utf8',
          timeout: 90000,
          maxBuffer: 1024 * 1024
        })
        writeFileSync(
          join(
            binding.evidenceRoot,
            binding.runId + '-' + phase + '-command.json'
          ),
          JSON.stringify(
            {
              argv: [process.execPath, ...args],
              pid: child.pid,
              status: child.status,
              signal: child.signal,
              stdout: child.stdout,
              stderr: child.stderr,
              error: child.error
                ? { name: child.error.name, message: child.error.message }
                : null
            },
            null,
            2
          ) + '\n'
        )
        assert.equal(child.status, 0, 'contained native journal phase failed')
        const result = JSON.parse(child.stdout)
        assert.equal(result.phase, phase)
        assert.equal(result.pid, child.pid)
        assert.notEqual(result.pid, process.pid)
        assert.equal(result.frames.length, journalValues.length)
        frames.push(result)
      }
      assert.equal(new Set(frames.map((x) => x.pid)).size, 3)
      assert.deepEqual(frames[0]!.frames, frames[1]!.frames)
      assert.deepEqual(frames[1]!.frames, frames[2]!.frames)
    })

    it('requires identical bytes for idempotent confirmation and refuses conflicting value or attempt', async () => {
      const journal = new Journal(pool!, { resultStorage: { version: 1 } })
      const input = {
        tenantId: journalTenant,
        operationKey: binding.runId + ':idempotent',
        proposalHash: 'p',
        attemptId: 'a'
      }
      await journal.reserve(input)
      await journal.markStarted(input)
      await journal.confirm({ ...input, result: { nul: '\0', n: null } })
      assert.equal(
        (await journal.confirm({ ...input, result: { n: null, nul: '\0' } }))
          .state,
        'CONFIRMED'
      )
      await assert.rejects(
        journal.confirm({ ...input, result: { nul: 'different', n: null } }),
        (e: unknown) => (e as { code?: string }).code === 'conflict'
      )
      await assert.rejects(
        journal.confirm({
          ...input,
          attemptId: 'other',
          result: { nul: '\0', n: null }
        }),
        (e: unknown) => (e as { code?: string }).code === 'lease_lost'
      )
      assert.equal(
        (await journal.get(journalTenant, input.operationKey))!.state,
        'CONFIRMED'
      )
      assert.equal(
        await journal.get(journalOtherTenant, input.operationKey),
        null
      )
    })

    it('inspects legacy JSON null separately from SQL NULL but never adopts a legacy reservation', async () => {
      const journal = new Journal(pool!, { resultStorage: { version: 1 } })
      const known = await journal.get(journalTenant, 'legacy-null')
      const unknown = await journal.get(journalTenant, 'legacy-unknown')
      assert(known && Object.hasOwn(known, 'result') && known.result === null)
      assert(unknown && !Object.hasOwn(unknown, 'result'))
      for (const operationKey of [
        'legacy-null',
        'legacy-unknown',
        'legacy-failed'
      ]) {
        await assert.rejects(
          journal.reserve({
            tenantId: journalTenant,
            operationKey,
            proposalHash: 'legacy-p',
            attemptId: 'new'
          }),
          (e: unknown) => (e as { code?: string }).code === 'invalid_action'
        )
      }
    })

    it('refuses a default journal on the activated principal without an implicit opt-in', async () => {
      await assert.rejects(
        new Journal(pool!).get(journalTenant, 'legacy-null'),
        (e: unknown) =>
          (e as { message?: string }).message === 'JOURNAL_STORAGE_MODE'
      )
    })

    it('keeps old credential SELECT denied42501 after activation', async () => {
      await oldReaderDenied()
    })

    it('leaves an over-cap confirmation unconfirmed and blocks unsafe repeat reservation', async () => {
      const journal = new Journal(pool!, { resultStorage: { version: 1 } })
      const input = {
        tenantId: journalTenant,
        operationKey: binding.runId + ':too-large',
        proposalHash: 'p',
        attemptId: 'a'
      }
      await journal.reserve(input)
      await journal.markStarted(input)
      await assert.rejects(
        journal.confirm({ ...input, result: 'x'.repeat(1048576 - 1) }),
        (e: unknown) =>
          (e as { message?: string }).message === 'JOURNAL_RESULT_TOO_LARGE'
      )
      assert.equal(
        (await journal.get(journalTenant, input.operationKey))!.state,
        'EFFECT_STARTED'
      )
      await journal.markUncertain({
        ...input,
        reason: 'synthetic confirmation refused'
      })
      const reserved = await journal.reserve({ ...input, attemptId: 'new' })
      assert.equal(reserved.state, 'UNCERTAIN')
      assert.equal(reserved.attemptId, 'a')
    })
    it('refuses the activated default worker at its native preflight before downstream admission', async () => {
      const worker = (await import(
        pathToFileURL(
          join(journalRoot, 'apps/worker/dist/postgres-role-preflight.js')
        ).href
      )) as typeof import('../../../../apps/worker/dist/postgres-role-preflight.js')
      const { TenantIdSchema } = await import('@cvg/platform')
      const critical = [
        ...new Set([
          ...worker.WORKER_CRITICAL_TABLES,
          ...worker.OPERATIONAL_HARNESS_CRITICAL_TABLES
        ])
      ]
      assert(critical.every((name) => /^[a-z][a-z0-9_]*$/.test(name)))
      // All earlier standard role/table/policy/migration checks must pass;
      // a failure on any of them cannot satisfy this mode-specific negative.
      await admin!.query(
        `GRANT SELECT,INSERT,UPDATE ON ${critical.map((name) => `"${journalSchema}"."${name}"`).join(',')} TO c100_j225_service`
      )
      const downstream = { claims: 0, models: 0, bodies: 0 }
      await assert.rejects(
        async () => {
          await worker.assertPostgresWorkerPreflight(pool!, {
            tenantId: TenantIdSchema.parse(journalTenant),
            criticalTables: critical,
            requiredMigrations: worker.OPERATIONAL_HARNESS_REQUIRED_MIGRATIONS
          })
          downstream.claims++
          downstream.models++
          downstream.bodies++
        },
        (error: unknown) =>
          (error as { message?: string }).message ===
          'Worker composition is not qualified for journal result storage'
      )
      assert.deepEqual(downstream, { claims: 0, models: 0, bodies: 0 })
      const borrowed = await pool!.connect()
      try {
        assert.equal(
          (
            await borrowed.query(
              "SELECT NULLIF(current_setting('cvg.tenant_id',true),'') AS tenant"
            )
          ).rows[0].tenant,
          null
        )
      } finally {
        borrowed.release()
      }
      writeFileSync(
        join(binding.evidenceRoot, binding.runId + '-native-preclaim.json'),
        JSON.stringify(
          {
            scope:
              'NATIVE_PREFLIGHT_METHOD_AND_ADMISSION_WRAPPER; no host CLI or fullJ07 credit',
            downstream,
            tenantContextCleared: true,
            criticalTables: critical,
            resourceId: binding.containerId
          },
          null,
          2
        ) + '\n'
      )
    })
  }
)
