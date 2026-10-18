import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Client, Pool } from 'pg'
import {
  verifyNativeJournalBinding,
  journalRoot,
  journalSchema,
  journalTenant,
  journalOtherTenant,
  journalValues,
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
