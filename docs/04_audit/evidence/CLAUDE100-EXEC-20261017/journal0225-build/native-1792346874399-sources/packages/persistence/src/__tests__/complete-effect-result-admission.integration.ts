import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import type { Client, Pool } from 'pg'
import type { RuntimeInput } from '@cvg/harness-contracts'
import {
  verifyNativeJournalBinding,
  journalRoot,
  journalSchema,
  journalTenant,
  journalCredentials,
  fleetOldReaderApplication,
  type NativeJournalBinding
} from './fixtures/journal-result-process.ts'
import { createJournalResourceFixture } from './fixtures/journal-result-resource.ts'

/*
 * SPEC0225 J07 (R1-E01): one isolated case per still-missing admission guard.
 * Each negative keeps every other precondition valid, is preceded and followed
 * by a native version1 positive, and restores the exact catalog snapshot.
 * Synthetic PostgreSQL only; no model, provider, account or tool body exists.
 */

const service = 'c100_j225_service'
const migration0030 = '0030_complete_tool_result_journal'
const zero = { claims: 0, models: 0, bodies: 0 }

let binding: NativeJournalBinding
let resource: ReturnType<typeof createJournalResourceFixture> | undefined
let admin: Client | undefined
let pool: Pool | undefined
let Journal: typeof import('../../dist/index.js').PostgresOperationalEffectJournal
let positiveKey = ''
const positiveValue = { j07: 'positive', nested: { z: [null, 0], a: '' } }

before(async () => {
  binding = verifyNativeJournalBinding()
  assert.equal(binding.profile, 'admission-journal')
  resource = createJournalResourceFixture(binding)
  await resource.setup()
  admin = resource.admin
  pool = resource.pool
  Journal = resource.Journal
  positiveKey = binding.runId + ':j07-positive'
  const journal = new Journal(pool, { resultStorage: { version: 1 } })
  const input = {
    tenantId: journalTenant,
    operationKey: positiveKey,
    proposalHash: 'p-j07',
    attemptId: 'a-j07'
  }
  await journal.reserve(input)
  await journal.markStarted(input)
  await journal.confirm({ ...input, result: positiveValue })
})
after(async () => {
  await resource?.cleanup()
})

function evidence(name: string, value: unknown): void {
  writeFileSync(
    join(binding.evidenceRoot, binding.runId + '-j07-' + name + '.json'),
    JSON.stringify(value, null, 2) + '\n'
  )
}

/** Version1 admission works and returns the exact confirmed value. */
async function healthy(): Promise<void> {
  assert(pool)
  const record = await new Journal(pool, { resultStorage: { version: 1 } }).get(
    journalTenant,
    positiveKey
  )
  assert(record && record.state === 'CONFIRMED')
  assert.deepEqual(record.result, positiveValue)
}

/** The refused action never reaches a claim, model call or tool body. */
async function refusedBeforeDownstream(
  action: () => Promise<unknown>
): Promise<typeof zero> {
  const downstream = { ...zero }
  await assert.rejects(
    async () => {
      await action()
      downstream.claims++
      downstream.models++
      downstream.bodies++
    },
    (error: unknown) =>
      (error as { message?: string }).message === 'JOURNAL_STORAGE_MODE'
  )
  assert.deepEqual(downstream, zero)
  return downstream
}

async function rowsOf(client: Client, sql: string, values: unknown[] = []) {
  return (await client.query(sql, values)).rows as Record<string, unknown>[]
}

/** Every admission precondition the readiness gate reads, plus durable rows. */
async function snapshot(client: Client = admin!, schema = journalSchema) {
  const table = schema + '.operational_effect_journal'
  return {
    migrations: await rowsOf(
      client,
      `SELECT to_jsonb(m)::text AS row FROM "${schema}".schema_migrations m ORDER BY version`
    ),
    functions: await rowsOf(
      client,
      `SELECT p.oid::text AS oid,p.proname,p.prosrc,p.proconfig,p.prosecdef,p.proacl::text AS acl,
         pg_get_userbyid(p.proowner) AS owner,md5(pg_get_functiondef(p.oid)) AS definition
       FROM pg_proc p WHERE p.pronamespace=to_regnamespace($1) AND p.prokind='f'
       ORDER BY p.proname,p.oid`,
      [schema]
    ),
    triggers: await rowsOf(
      client,
      `SELECT tgname,tgtype,tgenabled,tgfoid::text AS function_oid,tgqual IS NULL AS unconditional
       FROM pg_trigger WHERE tgrelid=to_regclass($1) AND NOT tgisinternal ORDER BY tgname`,
      [table]
    ),
    columns: await rowsOf(
      client,
      `SELECT a.attname,a.atttypid::regtype::text AS type,a.attnotnull,
         pg_get_expr(d.adbin,d.adrelid) AS default_expression
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
       WHERE a.attrelid=to_regclass($1) AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,
      [table]
    ),
    constraints: await rowsOf(
      client,
      `SELECT conname,pg_get_constraintdef(oid) AS definition,convalidated
       FROM pg_constraint WHERE conrelid=to_regclass($1) ORDER BY conname`,
      [table]
    ),
    policies: await rowsOf(
      client,
      `SELECT polname,polcmd,polpermissive,polroles::text AS roles,
         pg_get_expr(polqual,polrelid) AS using_expression,
         pg_get_expr(polwithcheck,polrelid) AS check_expression
       FROM pg_policy WHERE polrelid=to_regclass($1) ORDER BY polname`,
      [table]
    ),
    security: await rowsOf(
      client,
      `SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) AS owner
       FROM pg_class WHERE oid=to_regclass($1)`,
      [table]
    ),
    roles: await rowsOf(
      client,
      `SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
         rolreplication,rolbypassrls FROM pg_roles
       WHERE rolname LIKE 'c100\\_%' ORDER BY rolname`
    ),
    memberships: await rowsOf(
      client,
      `SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member
       FROM pg_auth_members ORDER BY 1,2`
    ),
    tableAcl: await rowsOf(
      client,
      `SELECT c.relname,pg_get_userbyid(a.grantor) AS grantor,
         CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
         a.privilege_type,a.is_grantable
       FROM pg_class c,aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
       WHERE c.relnamespace=to_regnamespace($1) AND c.relkind IN('r','p','v','S')
       ORDER BY 1,2,3,4`,
      [schema]
    ),
    schemaAcl: await rowsOf(
      client,
      `SELECT pg_get_userbyid(a.grantor) AS grantor,
         CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
         a.privilege_type
       FROM pg_namespace n,aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) a
       WHERE n.oid=to_regnamespace($1) ORDER BY 1,2,3`,
      [schema]
    ),
    databaseAcl: await rowsOf(
      client,
      `SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
         a.privilege_type
       FROM pg_database d,aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) a
       WHERE d.datname=current_database() ORDER BY 1,2`
    ),
    rows: await rowsOf(
      client,
      `SELECT to_jsonb(j)::text AS row FROM ${table} j ORDER BY tenant_id,operation_key`
    )
  }
}
type Snapshot = Awaited<ReturnType<typeof snapshot>>

function without<K extends keyof Snapshot>(value: Snapshot, ...keys: K[]) {
  const copy: Partial<Snapshot> = { ...value }
  for (const key of keys) delete copy[key]
  return copy
}

async function sessionsOf(user: string, database?: string): Promise<number> {
  return (
    await admin!.query(
      `SELECT count(*)::integer AS count FROM pg_stat_activity
        WHERE usename=$1 AND ($2::text IS NULL OR datname=$2)`,
      [user, database ?? null]
    )
  ).rows[0]!.count as number
}

async function drained(user: string, database?: string): Promise<number[]> {
  const observed: number[] = []
  for (let attempt = 0; attempt < 100; attempt++) {
    const count = await sessionsOf(user, database)
    observed.push(count)
    if (count === 0) return observed
    await delay(50)
  }
  assert.fail(user + ' sessions did not drain')
}

/** Finite private environment for owned children; never process.env wholesale. */
function childEnvironment(extra: Record<string, string> = {}) {
  const keys = [
    'PATH',
    'HOME',
    'TMPDIR',
    'TMP',
    'TEMP',
    'XDG_CONFIG_HOME',
    'XDG_CACHE_HOME',
    'XDG_DATA_HOME',
    'XDG_STATE_HOME',
    'LANG',
    'TZ'
  ]
  for (const forbidden of [
    'DATABASE_URL',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'NODE_ENV'
  ])
    assert.equal(process.env[forbidden], undefined)
  const env: Record<string, string> = {}
  for (const key of keys) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  return { ...env, ...extra }
}

interface OwnedChild {
  child: ChildProcess
  stdout: () => string
  stderr: () => string
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
}

/** Spawns an owned child without a shell and bounds what it may print. */
function ownedChild(argv: string[], env: Record<string, string>): OwnedChild {
  const child = spawn(process.execPath, argv, {
    cwd: journalRoot,
    env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let out = ''
  let err = ''
  const limit = 256 * 1024
  child.stdout!.setEncoding('utf8')
  child.stderr!.setEncoding('utf8')
  child.stdout!.on('data', (chunk: string) => {
    out += chunk
    if (out.length > limit) child.kill('SIGKILL')
  })
  child.stderr!.on('data', (chunk: string) => {
    err += chunk
    if (err.length > limit) child.kill('SIGKILL')
  })
  const exit = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal }))
  )
  return { child, stdout: () => out, stderr: () => err, exit }
}

async function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, delay(ms).then(() => null)])
}

/** SIGTERM, then SIGKILL, only to this owned PID. */
async function terminate(owned: OwnedChild) {
  if (owned.child.exitCode !== null || owned.child.signalCode !== null)
    return { signalSent: null, result: await owned.exit }
  owned.child.kill('SIGTERM')
  const graceful = await within(owned.exit, 10000)
  if (graceful) return { signalSent: 'SIGTERM', result: graceful }
  owned.child.kill('SIGKILL')
  return { signalSent: 'SIGKILL', result: await owned.exit }
}

describe(
  'SPEC0225 J07 isolated admission guards — no global or functional credit',
  { concurrency: false },
  () => {
    it('invalid-version: the real constructor refuses version2 before any connection', async () => {
      const before = await snapshot()
      await healthy()
      const calls: string[] = []
      const connection = {
        connect: async () => {
          calls.push('connect')
          throw new Error('unexpected connection')
        },
        query: async () => {
          calls.push('query')
          throw new Error('unexpected query')
        }
      }
      // Known-good control: version1 constructs without touching the connection.
      new Journal(connection as never, { resultStorage: { version: 1 } })
      assert.deepEqual(calls, [])
      let thrown: unknown
      const downstream = { ...zero }
      try {
        const journal = new Journal(connection as never, {
          resultStorage: { version: 2 } as never
        })
        await journal.get(journalTenant, positiveKey)
        downstream.claims++
        downstream.models++
        downstream.bodies++
      } catch (error) {
        thrown = error
      }
      assert(thrown instanceof Error)
      assert.equal(thrown.message, 'JOURNAL_STORAGE_MODE')
      assert.equal((thrown as { code?: string }).code, 'validation_failed')
      assert.deepEqual(calls, [])
      assert.deepEqual(downstream, zero)
      await healthy()
      assert.deepEqual(await snapshot(), before)
      evidence('invalid-version', {
        kind: 'REAL_CONSTRUCTOR_PRE_ADMISSION_COMPONENT',
        scope:
          'constructor refusal before any connection; not a PostgreSQL roundtrip',
        positiveVersion1Calls: 0,
        refusal: { message: thrown.message, code: 'validation_failed' },
        connectionCalls: calls.length,
        downstream,
        nativeVersion1PositiveBeforeAfter: true,
        snapshotExact: true,
        modelCalls: 0,
        toolBodies: 0
      })
    })

    it('missing-0030-record: deleting only the applied 0030 row refuses admission; exact row restored', async () => {
      assert(admin && pool)
      const journal = new Journal(pool, { resultStorage: { version: 1 } })
      const before = await snapshot()
      await healthy()
      assert.deepEqual(
        (
          await rowsOf(
            admin,
            `SELECT attname FROM pg_attribute WHERE attrelid=to_regclass($1)
              AND attnum>0 AND NOT attisdropped ORDER BY attnum`,
            [journalSchema + '.schema_migrations']
          )
        ).map((row) => row.attname),
        ['version', 'applied_at', 'checksum']
      )
      const [row] = (
        await admin.query(
          `SELECT version,applied_at::text AS applied_at,checksum,to_jsonb(m)::text AS full_row
           FROM ${journalSchema}.schema_migrations m WHERE version=$1`,
          [migration0030]
        )
      ).rows as {
        version: string
        applied_at: string
        checksum: string
        full_row: string
      }[]
      assert(row && /\.\d{1,6}\+00$/.test(row.applied_at))
      assert.equal(
        row.checksum,
        createHash('sha256')
          .update(
            readFileSync(
              join(
                journalRoot,
                'packages/persistence/migrations/' + migration0030 + '.sql'
              ),
              'utf8'
            ),
            'utf8'
          )
          .digest('hex')
      )
      const probe = binding.runId + ':j07-missing-record-reserve'
      let deleted = false
      let during: Snapshot | undefined
      let downstream: typeof zero | undefined
      try {
        const removed = await admin.query(
          `DELETE FROM ${journalSchema}.schema_migrations WHERE version=$1`,
          [migration0030]
        )
        assert.equal(removed.rowCount, 1)
        deleted = true
        during = await snapshot()
        // Only the one metadata row differs; every other precondition holds.
        assert.deepEqual(
          without(during, 'migrations'),
          without(before, 'migrations')
        )
        assert.deepEqual(
          during.migrations,
          before.migrations.filter((entry) => entry.row !== row.full_row)
        )
        downstream = await refusedBeforeDownstream(() =>
          journal.get(journalTenant, positiveKey)
        )
        await refusedBeforeDownstream(() =>
          journal.reserve({
            tenantId: journalTenant,
            operationKey: probe,
            proposalHash: 'p',
            attemptId: 'a'
          })
        )
      } finally {
        if (deleted) {
          const restored = await admin.query(
            `INSERT INTO ${journalSchema}.schema_migrations(version,applied_at,checksum)
             VALUES($1,$2::timestamptz,$3)`,
            [row.version, row.applied_at, row.checksum]
          )
          assert.equal(restored.rowCount, 1)
        }
      }
      await healthy()
      assert.equal(await journal.get(journalTenant, probe), null)
      const afterSnapshot = await snapshot()
      assert.deepEqual(afterSnapshot, before)
      evidence('missing-0030-record', {
        kind: 'NATIVE',
        removedRow: row,
        otherPreconditionsUnchangedDuringFault: true,
        refusedGetAndReserve: 'JOURNAL_STORAGE_MODE',
        downstream,
        restoredExactRowIncludingMicroseconds: true,
        nativeVersion1PositiveBeforeAfter: true,
        snapshotExact: true,
        resourceId: binding.containerId,
        modelCalls: 0,
        toolBodies: 0
      })
    })

    it('inactive-activation-wiring: the original closed 0030 guard refuses version1; exact activation restored', async () => {
      assert(admin && pool)
      const guards = (await import(
        pathToFileURL(
          join(
            journalRoot,
            'packages/persistence/dist/operational-effect-result-guard.js'
          )
        ).href
      )) as typeof import('../../dist/operational-effect-result-guard.js')
      const migrationText = readFileSync(
        join(
          journalRoot,
          'packages/persistence/migrations/' + migration0030 + '.sql'
        ),
        'utf8'
      )
      const parts = migrationText.split('$cvg0030$')
      assert.equal(parts.length, 3)
      const inactiveBody = parts[1]!
      assert.equal(inactiveBody, guards.JOURNAL_RESULT_INACTIVE_GUARD_BODY)
      const activation = guards.renderJournalResultActivation(
        journalSchema,
        service
      )
      const journal = new Journal(pool, { resultStorage: { version: 1 } })
      const before = await snapshot()
      await healthy()
      const activeGuard = before.functions.find(
        (entry) => entry.prosrc === activation.body
      )
      assert(activeGuard)
      let installed = false
      let during: Snapshot | undefined
      let downstream: typeof zero | undefined
      const probe = binding.runId + ':j07-inactive-reserve'
      try {
        await admin.query(
          `CREATE OR REPLACE FUNCTION "${journalSchema}"."${guards.JOURNAL_RESULT_GUARD_FUNCTION}"() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $cvg0030$${inactiveBody}$cvg0030$`
        )
        installed = true
        during = await snapshot()
        // Same function OID/owner/ACL/config, columns, migration, role and grants.
        assert.deepEqual(
          without(during, 'functions'),
          without(before, 'functions')
        )
        assert.deepEqual(
          during.functions.filter((entry) => entry.oid !== activeGuard.oid),
          before.functions.filter((entry) => entry.oid !== activeGuard.oid)
        )
        const inactive = during.functions.find(
          (entry) => entry.oid === activeGuard.oid
        )
        assert(inactive && inactive.prosrc === inactiveBody)
        assert.deepEqual(
          { ...inactive, prosrc: null, definition: null },
          { ...activeGuard, prosrc: null, definition: null }
        )
        downstream = await refusedBeforeDownstream(() =>
          journal.get(journalTenant, positiveKey)
        )
        await refusedBeforeDownstream(() =>
          journal.reserve({
            tenantId: journalTenant,
            operationKey: probe,
            proposalHash: 'p',
            attemptId: 'a'
          })
        )
      } finally {
        if (installed) await admin.query(activation.sql)
      }
      await healthy()
      assert.equal(await journal.get(journalTenant, probe), null)
      assert.deepEqual(await snapshot(), before)
      evidence('inactive-activation-wiring', {
        kind: 'NATIVE',
        installedBodySha256: createHash('sha256')
          .update(inactiveBody, 'utf8')
          .digest('hex'),
        restoredBindingSha256: activation.bindingSha256,
        sameFunctionOid: true,
        otherPreconditionsUnchangedDuringFault: true,
        refusedGetAndReserve: 'JOURNAL_STORAGE_MODE',
        downstream,
        nativeVersion1PositiveBeforeAfter: true,
        snapshotExact: true,
        resourceId: binding.containerId,
        modelCalls: 0,
        toolBodies: 0
      })
    })

    it('missing-physical-expansion: a fresh separate empty resource without the expansion columns refuses before effect', async () => {
      assert(admin)
      const pg = (await import('pg')).default
      const runtime = await import('../../dist/index.js')
      const guards =
        await import('../../dist/operational-effect-result-guard.js')
      const readinessModule =
        await import('../../dist/operational-effect-result-readiness.js')
      const database = 'c100_j225_j07_expand'
      const schema = 'c100_j225_j07_expand'
      const principal = 'c100_j225_j07_expand_service'
      const mainBefore = await snapshot()
      await healthy()
      assert.equal(
        (
          await admin.query(
            'SELECT count(*)::integer AS count FROM pg_database WHERE datname=$1',
            [database]
          )
        ).rows[0]!.count,
        0
      )
      assert.equal(
        (
          await admin.query(
            'SELECT count(*)::integer AS count FROM pg_roles WHERE rolname=$1',
            [principal]
          )
        ).rows[0]!.count,
        0
      )
      // Memory-only secret: never written, never shared with another resource.
      const password = randomBytes(24).toString('hex')
      let databaseCreated = false
      let roleCreated = false
      let owner: Client | undefined
      let fresh: Pool | undefined
      const record: Record<string, unknown> = {}
      try {
        await admin.query(
          `CREATE DATABASE ${database} OWNER c100_journal_owner TEMPLATE template0`
        )
        databaseCreated = true
        await admin.query(
          `CREATE ROLE ${principal} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`
        )
        roleCreated = true
        owner = new pg.Client({
          ...journalCredentials('admin'),
          database,
          application_name: 'c100-j225-j07-expand-owner',
          connectionTimeoutMillis: 5000,
          statement_timeout: 30000
        })
        await owner.connect()
        await owner.query(
          `REVOKE CREATE,TEMPORARY ON DATABASE ${database} FROM PUBLIC`
        )
        await runtime.runPostgresMigrations(owner, { schemaName: schema })
        await owner.query(`GRANT USAGE ON SCHEMA ${schema} TO ${principal}`)
        await owner.query(
          `GRANT SELECT,INSERT,UPDATE ON ${schema}.operational_effect_journal TO ${principal}`
        )
        await owner.query(
          `GRANT SELECT ON ${schema}.schema_migrations,${schema}.operational_executions TO ${principal}`
        )
        const activation = guards.renderJournalResultActivation(
          schema,
          principal
        )
        await owner.query(activation.sql)
        fresh = new pg.Pool({
          host: '127.0.0.1',
          port: 55880,
          database,
          user: principal,
          password,
          max: 1,
          options: '-c search_path=' + schema,
          application_name: 'c100-j225-j07-expand-service',
          connectionTimeoutMillis: 5000,
          statement_timeout: 10000,
          query_timeout: 12000
        })
        const journal = new Journal(fresh, { resultStorage: { version: 1 } })
        // Known-good: fully migrated, activated and qualified fresh resource.
        assert.equal(await journal.get(journalTenant, 'j07-expand-probe'), null)
        const readiness = await (async () => {
          const client = await fresh!.connect()
          try {
            return await readinessModule.verifyJournalResultStorage(client, 1)
          } finally {
            client.release()
          }
        })()
        assert.equal(readiness.mode, 1)
        assert.equal(readiness.expanded, true)
        assert.equal(readiness.bindingSha256, activation.bindingSha256)
        const countRows = async () =>
          (
            await owner!.query(
              `SELECT count(*)::integer AS count FROM ${schema}.operational_effect_journal`
            )
          ).rows[0]!.count as number
        assert.equal(await countRows(), 0)
        const healthySnapshot = await snapshot(owner, schema)
        // Physical fault on the new empty table only. The CHECK constraints
        // that reference the dropped columns necessarily disappear with them.
        await owner.query(
          `ALTER TABLE ${schema}.operational_effect_journal DROP COLUMN result_storage_payload, DROP COLUMN result_storage_version`
        )
        const during = await snapshot(owner, schema)
        assert.deepEqual(
          without(during, 'columns', 'constraints'),
          without(healthySnapshot, 'columns', 'constraints')
        )
        assert.deepEqual(
          during.columns,
          healthySnapshot.columns.filter(
            (column) =>
              column.attname !== 'result_storage_payload' &&
              column.attname !== 'result_storage_version'
          )
        )
        const droppedConstraints = healthySnapshot.constraints
          .filter(
            (constraint) =>
              !during.constraints.some(
                (kept) => kept.conname === constraint.conname
              )
          )
          .map((constraint) => constraint.conname)
        assert.deepEqual(droppedConstraints.sort(), [
          'journal_result_storage_envelope',
          'journal_result_storage_shape',
          'journal_result_storage_version'
        ])
        const downstream = await refusedBeforeDownstream(() =>
          journal.get(journalTenant, 'j07-expand-probe')
        )
        await refusedBeforeDownstream(() =>
          journal.reserve({
            tenantId: journalTenant,
            operationKey: 'j07-expand-reserve',
            proposalHash: 'p',
            attemptId: 'a'
          })
        )
        assert.equal(await countRows(), 0)
        Object.assign(record, {
          freshResource: { database, schema, principal, template: 'template0' },
          positiveBeforeFault: {
            mode: readiness.mode,
            expanded: readiness.expanded,
            bindingSha256: readiness.bindingSha256,
            migrationChecksum: readiness.migrationChecksum
          },
          keptDuringFault: {
            migrations: during.migrations.length,
            guardFunction: during.functions.some(
              (entry) =>
                entry.proname === guards.JOURNAL_RESULT_GUARD_FUNCTION &&
                entry.prosrc === activation.body
            ),
            triggers: during.triggers.map((trigger) => trigger.tgname),
            policies: during.policies.map((policy) => policy.polname),
            roles: 'unchanged'
          },
          droppedColumns: ['result_storage_payload', 'result_storage_version'],
          droppedConstraints,
          refusedGetAndReserve: 'JOURNAL_STORAGE_MODE',
          downstream,
          journalRowsBeforeAndAfter: 0
        })
      } finally {
        await fresh?.end()
        await owner?.end()
        if (databaseCreated) {
          record.drains = {
            service: await drained(principal),
            owner: await drained('c100_journal_owner', database)
          }
          await admin.query(`DROP DATABASE ${database}`)
        }
        if (roleCreated) await admin.query(`DROP ROLE ${principal}`)
      }
      assert.equal(
        (
          await admin.query(
            'SELECT (SELECT count(*) FROM pg_database WHERE datname=$1)::integer + (SELECT count(*) FROM pg_roles WHERE rolname=$2)::integer AS count',
            [database, principal]
          )
        ).rows[0]!.count,
        0
      )
      await healthy()
      assert.deepEqual(await snapshot(), mainBefore)
      evidence('missing-physical-expansion', {
        kind: 'NATIVE_SEPARATE_EMPTY_RESOURCE',
        ...record,
        credential: 'memory-only random secret; not shared with any resource',
        cleanup:
          'clients drained; dropped only the new database, then the new role without CASCADE',
        mainResourceSnapshotExact: true,
        resourceId: binding.containerId,
        modelCalls: 0,
        toolBodies: 0
      })
    })

    it('mixed-fleet: a live original reader process with the old credential refuses version1 until it exits', async () => {
      assert(admin && pool)
      const journal = new Journal(pool, { resultStorage: { version: 1 } })
      const before = await snapshot()
      await healthy()
      assert.equal(await sessionsOf('c100_j225_old'), 0)
      const owned = ownedChild(
        [
          '--experimental-strip-types',
          join(
            journalRoot,
            'packages/persistence/src/__tests__/fixtures/journal-result-process.ts'
          ),
          'fleet-old-reader'
        ],
        childEnvironment()
      )
      let ready: Record<string, unknown> | undefined
      let catalog: Record<string, unknown>[] = []
      let downstream: typeof zero | undefined
      let ended: Awaited<ReturnType<typeof terminate>> | undefined
      try {
        for (let attempt = 0; attempt < 600 && !ready; attempt++) {
          const line = owned
            .stdout()
            .split('\n')
            .find((entry) => entry.includes('READY_FLEET_OLD_READER'))
          if (line) ready = JSON.parse(line) as Record<string, unknown>
          else if (owned.child.exitCode !== null) break
          else await delay(50)
        }
        assert(ready, 'fleet reader did not become ready: ' + owned.stderr())
        assert.equal(ready.pid, owned.child.pid)
        assert.equal(ready.originalSqlDenied, '42501')
        assert.equal(ready.reader, 'present')
        assert.equal(
          ready.readerEmitSha256,
          binding.inputs.find(
            (input) =>
              input.path ===
              'packages/persistence/dist/operational-execution-postgres.j06-present.js'
          )!.sha256
        )
        catalog = await rowsOf(
          admin,
          `SELECT pid,usename,application_name,datname,state IS NOT NULL AS visible
             FROM pg_stat_activity WHERE pid=$1`,
          [ready.backendPid]
        )
        assert.deepEqual(
          catalog.map((entry) => ({
            usename: entry.usename,
            application_name: entry.application_name,
            datname: entry.datname
          })),
          [
            {
              usename: 'c100_j225_old',
              application_name: fleetOldReaderApplication,
              datname: 'c100_journal_synthetic'
            }
          ]
        )
        // The old principal still has no journal access; nothing else moved.
        assert.deepEqual(await snapshot(), before)
        assert.equal(owned.child.exitCode, null)
        process.kill(owned.child.pid!, 0)
        downstream = await refusedBeforeDownstream(() =>
          journal.get(journalTenant, positiveKey)
        )
        await refusedBeforeDownstream(() =>
          journal.reserve({
            tenantId: journalTenant,
            operationKey: binding.runId + ':j07-fleet-reserve',
            proposalHash: 'p',
            attemptId: 'a'
          })
        )
        assert.equal(owned.child.exitCode, null)
      } finally {
        ended = await terminate(owned)
      }
      const drains = await drained('c100_j225_old')
      await healthy()
      assert.equal(
        await journal.get(journalTenant, binding.runId + ':j07-fleet-reserve'),
        null
      )
      assert.deepEqual(await snapshot(), before)
      assert.equal(ended.signalSent, 'SIGTERM')
      assert.equal(ended.result.code, 0)
      evidence('mixed-fleet', {
        kind: 'TWO_REAL_OS_PROCESSES',
        scope:
          'original present-reader module in a separate PID with the old credential; not whole historical worker binary certification',
        parentPid: process.pid,
        ready,
        independentCatalog: catalog,
        refusedGetAndReserveWhileAlive: 'JOURNAL_STORAGE_MODE',
        downstream,
        termination: ended,
        drains,
        childStderr: owned.stderr(),
        nativeVersion1PositiveBeforeAfter: true,
        snapshotExact: true,
        resourceId: binding.containerId,
        modelCalls: 0,
        toolBodies: 0
      })
    })

    it('default-host-no-optin: the compiled default worker refuses the activated schema before its first claim', async () => {
      assert(admin && pool)
      const worker = (await import(
        pathToFileURL(join(journalRoot, 'apps/worker/dist/worker.js')).href
      )) as typeof import('../../../../apps/worker/dist/worker.js')
      const preflight = (await import(
        pathToFileURL(
          join(journalRoot, 'apps/worker/dist/postgres-role-preflight.js')
        ).href
      )) as typeof import('../../../../apps/worker/dist/postgres-role-preflight.js')
      const runtime = await import('../../dist/index.js')
      const mainSource = readFileSync(
        join(journalRoot, 'apps/worker/dist/main.js'),
        'utf8'
      )
      const harnessSource = readFileSync(
        join(journalRoot, 'apps/worker/dist/operational-harness-worker.js'),
        'utf8'
      )
      // Source order: the qualification preflight precedes the first claim,
      // and the default host constructs its journal without any opt-in.
      const body = mainSource.slice(
        mainSource.indexOf('async function runOperationalHarnessWorker(')
      )
      const preflightAt = body.indexOf(
        'await assertOperationalHarnessPostgresPreflight(runtime)'
      )
      const claimAt = body.indexOf('runtime.worker.processNext()')
      assert(preflightAt > 0 && claimAt > preflightAt)
      assert.equal(
        harnessSource.match(/new PostgresOperationalEffectJournal\(/g)?.length,
        1
      )
      assert(
        harnessSource.includes('new PostgresOperationalEffectJournal(pool)')
      )
      assert(!harnessSource.includes('resultStorage'))
      const critical = [
        ...new Set([
          ...preflight.WORKER_CRITICAL_TABLES,
          ...preflight.OPERATIONAL_HARNESS_CRITICAL_TABLES
        ])
      ]
      assert(critical.every((name) => /^[a-z][a-z0-9_]*$/.test(name)))
      const before = await snapshot()
      await healthy()
      const queueTables = [
        'operational_executions',
        'operational_execution_outbox',
        'operational_execution_events',
        'operational_execution_steps',
        'operational_execution_checkpoints',
        'operational_effect_journal',
        'runtime_approvals'
      ]
      const bookend = async () => {
        const out: Record<string, unknown> = {}
        for (const table of queueTables)
          out[table] = await rowsOf(
            admin!,
            `SELECT to_jsonb(t)::text AS row FROM "${journalSchema}"."${table}" t ORDER BY 1`
          )
        return out
      }
      // A claimable pending execution makes "no claim" observable.
      const seedPool = new (await import('pg')).default.Pool({
        ...journalCredentials('admin'),
        max: 1,
        options: '-c search_path=' + journalSchema,
        application_name: 'c100-j225-j07-seed-owner',
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000
      })
      let seeded: { id?: string; state?: string } = {}
      try {
        const submitted = await new runtime.PostgresOperationalExecutionStore(
          seedPool
        ).submit({
          tenantId: journalTenant,
          idempotencyKey: binding.runId + ':j07-default-host-queue',
          runtime: syntheticRuntimeInput()
        })
        seeded = { id: submitted.record.id, state: submitted.record.state }
      } finally {
        await seedPool.end()
      }
      const credentials = journalCredentials('service')
      const workerEnvironment = childEnvironment({
        CVG_WORKER_RUNTIME: 'operational-harness',
        CVG_WORKER_CONTROLLED_MODE: 'true',
        CVG_WORKER_TENANT_ID: journalTenant,
        CVG_WORKER_ID: 'c100-j225-j07-default-host',
        DATABASE_URL: `postgresql://${credentials.user}:${credentials.password}@127.0.0.1:55880/c100_journal_synthetic`,
        POSTGRES_SCHEMA: journalSchema,
        CVG_WORKER_MAX_EVENTS: '1',
        CVG_WORKER_IDLE_WAIT_MS: '0'
      })
      // The parent sees no configuration error with the exact child env.
      assert.equal(worker.getWorkerStartupFailure(workerEnvironment), null)
      const redact = (text: string) =>
        text.split(credentials.password).join('<redacted>')
      await admin.query(
        `GRANT SELECT,INSERT,UPDATE ON ${critical.map((name) => `"${journalSchema}"."${name}"`).join(',')} TO ${service}`
      )
      let output: Record<string, unknown> = {}
      let rejected: Record<string, unknown> | undefined
      let ended: Awaited<ReturnType<typeof terminate>> | undefined
      const queueBefore = await bookend()
      try {
        const owned = ownedChild(
          [join(journalRoot, 'apps/worker/dist/main.js')],
          workerEnvironment
        )
        const result = await within(owned.exit, 30000)
        ended = result ? { signalSent: null, result } : await terminate(owned)
        const stdout = redact(owned.stdout())
        const stderr = redact(owned.stderr())
        assert(!stdout.includes(credentials.password))
        const events = [...stdout.split('\n'), ...stderr.split('\n')]
          .filter((line) => line.startsWith('{'))
          .map((line) => JSON.parse(line) as Record<string, unknown>)
        output = { pid: owned.child.pid, stdout, stderr, events }
        assert.equal(ended.signalSent, null)
        assert.equal(ended.result.code, 1)
        rejected = events.find(
          (event) => event.event === 'worker.operational_harness_failed'
        )
        assert.deepEqual(rejected, {
          event: 'worker.operational_harness_failed',
          code: 'operational_harness_failed',
          message:
            'Worker composition is not qualified for journal result storage'
        })
        assert(
          !events.some(
            (event) =>
              event.event === 'worker.operational_harness_ready' ||
              event.event === 'worker.operational_harness_completed' ||
              (event.event === 'worker.readiness' && event.status === 'ready')
          )
        )
        assert(!events.some((event) => event.event === 'worker.startup_failed'))
      } finally {
        await admin.query(
          `REVOKE SELECT,INSERT,UPDATE ON ${critical
            .filter(
              (name) =>
                ![
                  'operational_effect_journal',
                  'operational_executions'
                ].includes(name)
            )
            .map((name) => `"${journalSchema}"."${name}"`)
            .join(',')} FROM ${service}`
        )
        await admin.query(
          `REVOKE INSERT,UPDATE ON "${journalSchema}"."operational_executions" FROM ${service}`
        )
      }
      const drains = await drained(service)
      assert.deepEqual(await bookend(), queueBefore)
      await healthy()
      assert.deepEqual(await snapshot(), before)
      evidence('default-host-no-optin', {
        kind: 'REAL_COMPILED_WORKER_BOOTSTRAP',
        entry: 'apps/worker/dist/main.js',
        node: process.version,
        parentStartupFailure: null,
        sourceOrder: { preflightAt, claimAt },
        defaultJournalWithoutOptIn: true,
        criticalTables: critical,
        seededPendingExecution: seeded,
        exit: ended,
        rejected,
        worker: output,
        queueStepsJournalUnchanged: true,
        drains,
        nativeVersion1PositiveBeforeAfter: true,
        snapshotExact: true,
        environmentKeys: Object.keys(workerEnvironment).sort(),
        credential: 'DATABASE_URL password redacted from every capture',
        resourceId: binding.containerId,
        modelCalls: 0,
        toolBodies: 0
      })
    })
  }
)

function syntheticRuntimeInput(): RuntimeInput {
  return {
    agent: {
      id: 'agent.j07.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'J07 admission fixture',
      instructions: ['synthetic'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: journalTenant as RuntimeInput['tenantId'],
    conversationId:
      'conversation_j07_synthetic' as RuntimeInput['conversationId'],
    sessionId: 'session_j07_synthetic' as RuntimeInput['sessionId'],
    correlationId: 'correlation_j07_synthetic' as RuntimeInput['correlationId'],
    traceId: 'trace_j07_synthetic' as RuntimeInput['traceId'],
    userMessage: 'J07 admission fixture',
    context: {
      values: {},
      sourceIds: [],
      capturedAt: '2026-10-18T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-10-18T00:00:00.000Z' },
    budget: {
      maxSteps: 1,
      maxModelCalls: 1,
      maxToolCalls: 0,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 100
    }
  }
}
