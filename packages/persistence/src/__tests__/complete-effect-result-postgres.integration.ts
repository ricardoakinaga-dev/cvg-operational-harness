import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Client, Pool, QueryResultRow } from 'pg'
import {
  verifyNativeJournalBinding,
  journalRoot,
  journalSchema,
  journalTenant,
  journalOtherTenant,
  journalValues,
  journalCredentials,
  type NativeJournalBinding
} from './fixtures/journal-result-process.ts'
import { createJournalResourceFixture } from './fixtures/journal-result-resource.ts'

let binding: NativeJournalBinding
let resource: ReturnType<typeof createJournalResourceFixture> | undefined
let admin: Client | undefined
let pool: Pool | undefined
let Journal: typeof import('@cvg/persistence').PostgresOperationalEffectJournal
before(async () => {
  binding = verifyNativeJournalBinding()
  assert.equal(binding.profile, 'journal')
  resource = createJournalResourceFixture(binding)
  await resource.setup()
  admin = resource.admin
  pool = resource.pool
  Journal = resource.Journal
})
after(async () => {
  await resource?.cleanup()
})
const oldReaderDenied = async () => {
  assert(resource)
  await resource.oldReaderDenied()
}

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

    for (const mutation of [
      'public-grant',
      'membership',
      'checksum',
      'disabled-trigger',
      'inherit'
    ] as const) {
      it(`refuses isolated ${mutation} before admission and accepts its exact restoration`, async () => {
        assert(admin && pool)
        const journal = new Journal(pool, { resultStorage: { version: 1 } })
        const probe = binding.runId + ':readiness-probe'
        assert.equal(await journal.get(journalTenant, probe), null)
        const version = '0030_complete_tool_result_journal'
        const original =
          mutation === 'checksum'
            ? ((
                await admin.query(
                  `SELECT checksum FROM ${journalSchema}.schema_migrations WHERE version=$1`,
                  [version]
                )
              ).rows[0]!.checksum as string)
            : null
        const sql =
          mutation === 'public-grant'
            ? [
                `GRANT SELECT ON ${journalSchema}.operational_effect_journal TO PUBLIC`,
                `REVOKE SELECT ON ${journalSchema}.operational_effect_journal FROM PUBLIC`
              ]
            : mutation === 'membership'
              ? [
                  'GRANT c100_j225_old TO c100_j225_service',
                  'REVOKE c100_j225_old FROM c100_j225_service'
                ]
              : mutation === 'disabled-trigger'
                ? [
                    `ALTER TABLE ${journalSchema}.operational_effect_journal DISABLE TRIGGER journal_result_storage_guard`,
                    `ALTER TABLE ${journalSchema}.operational_effect_journal ENABLE TRIGGER journal_result_storage_guard`
                  ]
                : mutation === 'inherit'
                  ? [
                      'ALTER ROLE c100_j225_service INHERIT',
                      'ALTER ROLE c100_j225_service NOINHERIT'
                    ]
                  : null
        let restored = false
        try {
          if (sql) await admin.query(sql[0]!)
          else {
            const changed = await admin.query(
              `UPDATE ${journalSchema}.schema_migrations SET checksum=$2 WHERE version=$1`,
              [version, '0'.repeat(64)]
            )
            assert.equal(changed.rowCount, 1)
          }
          await assert.rejects(
            journal.get(journalTenant, probe),
            (error: unknown) =>
              (error as { message?: string }).message === 'JOURNAL_STORAGE_MODE'
          )
        } finally {
          if (sql) await admin.query(sql[1]!)
          else {
            const changed = await admin.query(
              `UPDATE ${journalSchema}.schema_migrations SET checksum=$2 WHERE version=$1`,
              [version, original]
            )
            assert.equal(changed.rowCount, 1)
          }
          assert.equal(await journal.get(journalTenant, probe), null)
          restored = true
        }
        writeFileSync(
          join(
            binding.evidenceRoot,
            binding.runId + '-negative-' + mutation + '.json'
          ),
          JSON.stringify(
            {
              mutation,
              rejected: true,
              restored,
              beforeAndAfterPositive: true,
              modelCalls: 0,
              toolBodies: 0,
              resourceId: binding.containerId
            },
            null,
            2
          ) + '\n'
        )
      })
    }

    it('rejects an old live login session without granting it journal access', async () => {
      assert(pool)
      const pg = (await import('pg')).default
      const journal = new Journal(pool, { resultStorage: { version: 1 } })
      const probe = binding.runId + ':session-probe'
      assert.equal(await journal.get(journalTenant, probe), null)
      const old = new pg.Client({
        ...journalCredentials('old'),
        options: '-c search_path=' + journalSchema,
        application_name: 'c100-j225-old-session-negative',
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000
      })
      try {
        await old.connect()
        await assert.rejects(
          old.query('SELECT result FROM operational_effect_journal'),
          (error: unknown) => (error as { code?: string }).code === '42501'
        )
        const service = await pool.connect()
        try {
          const visible = await service.query(
            'SELECT pid,usename,backend_type FROM pg_stat_activity WHERE datname=current_database() ORDER BY pid'
          )
          const owner = await admin!.query(
            'SELECT pid,usename,backend_type FROM pg_stat_activity WHERE datname=current_database() ORDER BY pid'
          )
          writeFileSync(
            join(
              binding.evidenceRoot,
              binding.runId + '-old-session-visibility.json'
            ),
            JSON.stringify(
              { service: visible.rows, owner: owner.rows },
              null,
              2
            ) + '\n'
          )
        } finally {
          service.release()
        }
        await assert.rejects(
          journal.get(journalTenant, probe),
          (error: unknown) =>
            (error as { message?: string }).message === 'JOURNAL_STORAGE_MODE'
        )
      } finally {
        await old.end()
      }
      assert.equal(await journal.get(journalTenant, probe), null)
      writeFileSync(
        join(
          binding.evidenceRoot,
          binding.runId + '-negative-old-session.json'
        ),
        JSON.stringify({
          oldSelect: '42501',
          servingReadiness: 'JOURNAL_STORAGE_MODE',
          restored: true,
          modelCalls: 0,
          toolBodies: 0
        }) + '\n'
      )
    })

    it('never treats forged GUC or application name as an activated principal', async () => {
      assert(pool)
      const pg = (await import('pg')).default
      const old = new pg.Client({
        ...journalCredentials('old'),
        options: '-c search_path=' + journalSchema,
        application_name: 'c100-j225-native-service',
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000
      })
      try {
        await old.connect()
        await old.query(
          "SELECT set_config('cvg.tenant_id',$1,false),set_config('cvg.journal_result_storage_version','1',false),set_config('cvg.journal_result_storage_principal','c100_j225_service',false)",
          [journalTenant]
        )
        await assert.rejects(
          new Journal(
            { query: old.query.bind(old) },
            { resultStorage: { version: 1 } }
          ).get(journalTenant, 'legacy-null'),
          (error: unknown) =>
            (error as { message?: string }).message === 'JOURNAL_STORAGE_MODE'
        )
        await assert.rejects(
          old.query('SELECT result FROM operational_effect_journal'),
          (error: unknown) => (error as { code?: string }).code === '42501'
        )
      } finally {
        await old.end()
      }
      assert.equal(
        await new Journal(pool, { resultStorage: { version: 1 } }).get(
          journalTenant,
          binding.runId + ':forged-probe'
        ),
        null
      )
    })

    it('refuses direct version0 insertion by the activated service principal', async () => {
      assert(pool)
      const { withTenantContext } = await import('@cvg/persistence')
      const { TenantIdSchema } = await import('@cvg/platform')
      await assert.rejects(
        withTenantContext(pool, TenantIdSchema.parse(journalTenant), (client) =>
          client.query(
            `INSERT INTO operational_effect_journal(tenant_id,operation_key,proposal_hash,state,attempt_id) VALUES($1,$2,'p','RESERVED','a')`,
            [journalTenant, binding.runId + ':forbidden0']
          )
        ),
        (error: unknown) => (error as { code?: string }).code === '42501'
      )
      assert.equal(
        await new Journal(pool, { resultStorage: { version: 1 } }).get(
          journalTenant,
          binding.runId + ':forbidden0'
        ),
        null
      )
    })

    for (const fault of [
      'before-update',
      'after-update',
      'before-commit',
      'commit-ack-loss'
    ] as const) {
      it(`preserves durable state and primary error for ${fault}`, async () => {
        assert(pool)
        const { withTenantContext } = await import('@cvg/persistence')
        const { TenantIdSchema } = await import('@cvg/platform')
        const journal = new Journal(pool, { resultStorage: { version: 1 } })
        const input = {
          tenantId: journalTenant,
          operationKey: binding.runId + ':transaction:' + fault,
          proposalHash: 'transaction-p',
          attemptId: 'transaction-a'
        }
        const value = { nul: '\0'.repeat(4096), value: null }
        await journal.reserve(input)
        await journal.markStarted(input)
        const before = await journal.get(journalTenant, input.operationKey)
        const primary = new Error('SYNTHETIC_' + fault)
        let injected = false
        let committed = false
        const operations: string[] = []
        await assert.rejects(
          withTenantContext(
            pool,
            TenantIdSchema.parse(journalTenant),
            async (client) => {
              const connection = {
                query: async <T extends QueryResultRow = QueryResultRow>(
                  text: string,
                  values?: unknown[]
                ) => {
                  const update =
                    /^UPDATE operational_effect_journal\s/.test(text.trim()) &&
                    values?.[2] === 'CONFIRMED'
                  const commit = text === 'COMMIT'
                  if (
                    update ||
                    commit ||
                    text === 'BEGIN' ||
                    text === 'ROLLBACK'
                  )
                    operations.push(update ? 'UPDATE_CONFIRM' : text)
                  if (
                    !injected &&
                    ((fault === 'before-update' && update) ||
                      (fault === 'before-commit' && commit))
                  ) {
                    injected = true
                    throw primary
                  }
                  const result = await client.query<T>(text, values)
                  if (commit) committed = true
                  if (
                    !injected &&
                    ((fault === 'after-update' && update) ||
                      (fault === 'commit-ack-loss' && commit))
                  ) {
                    injected = true
                    throw primary
                  }
                  return result
                }
              }
              return new Journal(connection, {
                resultStorage: { version: 1 }
              }).confirm({ ...input, result: value })
            }
          ),
          (error: unknown) => error === primary
        )
        assert.equal(injected, true, 'named fault was not reached')
        const after = await journal.get(journalTenant, input.operationKey)
        assert(after)
        assert.equal(committed, fault === 'commit-ack-loss')
        if (committed) {
          assert.equal(after.state, 'CONFIRMED')
          assert.equal(JSON.stringify(after.result), JSON.stringify(value))
          const same = await journal.confirm({ ...input, result: value })
          assert.deepEqual(same, after)
          await assert.rejects(
            journal.confirm({ ...input, result: false }),
            (error: unknown) => (error as { code?: string }).code === 'conflict'
          )
        } else {
          assert.deepEqual(
            after,
            before,
            'rolled-back UPDATE changed durable row'
          )
          assert.equal(after.state, 'EFFECT_STARTED')
          assert(!Object.hasOwn(after, 'result'))
          await journal.markUncertain({
            ...input,
            reason: 'synthetic commit not established'
          })
          assert.equal(
            (await journal.reserve({ ...input, attemptId: 'unsafe-retry' }))
              .state,
            'UNCERTAIN'
          )
        }
        writeFileSync(
          join(
            binding.evidenceRoot,
            binding.runId + '-fault-' + fault + '.json'
          ),
          JSON.stringify(
            {
              fault,
              injected,
              committed,
              operations,
              before,
              after,
              primaryPreserved: true
            },
            null,
            2
          ) + '\n'
        )
      })
    }

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
