#!/usr/bin/env node
/**
 * REM21-010 — disposable PostgreSQL load/restore/rollback proof.
 *
 * This is a local qualification exercise. It starts two explicitly named
 * PostgreSQL containers, uses only deterministic synthetic fixtures, and
 * removes those containers in the finally block. It never measures or claims
 * production RPO/RTO.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client, Pool } from 'pg'
import {
  PostgresChannelEffectJournal,
  PostgresEffectJournal,
  TenantScopedPostgresRuntimeRepository,
  runPostgresMigrations,
  withTenantContext
} from '@cvg/persistence'
import { TenantIdSchema } from '@cvg/platform'
import { validateRem21010ProofReport } from './rem21-010-postgres-proof-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const image = process.env.CVG_REM21_010_POSTGRES_IMAGE ?? 'postgres:16-alpine'
const adminUser = 'cvg_rem21_010_admin'
const adminPassword = 'cvg_rem21_010_admin_password'
const appUser = 'cvg_rem21_010_app'
const appPassword = 'cvg_rem21_010_app_password'
const database = 'cvg_rem21_010'
const rollbackDatabase = 'cvg_rem21_010_rollback'
const schema = 'cvg_rem21_010'
const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000010'
)
const otherTenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000011'
)
const correlationId = 'corr_00000000-0000-4000-8000-000000000010'
const fixedCreatedAt = new Date('2026-09-22T00:00:00.000Z')
const fixedJournalNow = new Date('2026-09-22T00:01:00.000Z')
const preRollForwardMigrations = [
  '0000_initial',
  '0001_tenant_isolation',
  '0002_capability_approvals',
  '0003_test_suite_catalog',
  '0004_plugin_manifest_catalog',
  '0005_knowledge_source_catalog',
  '0006_release_candidate_evidence',
  '0007_audit_evidence_checkpoint',
  '0008_session_agent_version_pin',
  '0009_release_candidate_validator_integrity',
  '0010_outbox_durability',
  '0011_outbox_payload_redaction',
  '0012_channel_effect_journal',
  '0013_runtime_effect_journal',
  '0014_journeys',
  '0015_runtime_approval_store',
  '0016_operational_execution_spine',
  '0017_runtime_approval_execution_binding',
  '0018_operational_execution_invariants',
  '0019_iterative_execution_steps',
  '0020_conversation_intelligence',
  '0021_approval_decision_audit_dedupe',
  '0022_conversation_policy_standardization',
  '0023_rate_limit_buckets',
  '0024_approval_decision_causality',
  '0025_webhook_replay_fencing',
  '0026_rate_limit_key_hardening'
]
// The proof always rolls forward the newest migration over a dump of the one
// before it; keep both in step with packages/persistence/migrations.
const rollForwardMigration = '0027_worker_operations'
const preRollForwardVersion = preRollForwardMigrations.at(-1)
// Documented rollback of the roll-forward migration (its file header): run
// before restoring the pre-migration backup over the rolled-forward schema.
const rollForwardRollbackSql =
  'DROP TABLE IF EXISTS worker_heartbeats, kernel_pause_switches'

type ManagedPostgres = {
  name: string
  port: string
  url: string
}

type TableDigest = {
  rows: number
  digest: string
}

type LogicalState = {
  tables: Record<string, TableDigest>
  rls: unknown[]
  roles: unknown[]
  grants: unknown
}

type ProofArgs = {
  events: number
  runId: string
  candidateId: string | null
  outputPath: string
}

function parseArgs(): ProofArgs {
  const values = new Map(
    process.argv.slice(2).map((value) => {
      const [key, raw] = value.replace(/^--/, '').split('=')
      return [key ?? '', raw ?? 'true']
    })
  )
  const events = Math.min(250, Math.max(8, Number(values.get('events') ?? 32)))
  if (!Number.isSafeInteger(events))
    throw new Error('events must be an integer')
  const runId =
    values.get('run-id') ??
    process.env.CI_RUN_ID ??
    `run-rem21-010-local-${Date.now().toString(36)}`
  const candidateId =
    values.get('candidate-id') ?? process.env.CI_CANDIDATE_ID ?? null
  const outputPath = path.resolve(
    root,
    values.get('output') ?? 'certification/rem21-010-postgres-proof.json'
  )
  return { events, runId, candidateId, outputPath }
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error(`unsafe_identifier:${value}`)
  }
  return `"${value}"`
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).sort().join(',')}]`
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function dockerText(args: string[]): string {
  const result = spawnSync('docker', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024
  })
  if (result.error || result.status !== 0) {
    throw new Error(
      `docker_failed:${args.join(' ')}:${result.error?.message ?? result.stderr ?? result.status}`
    )
  }
  return (result.stdout ?? '').trim()
}

function dockerBinary(args: string[], input?: Buffer): Buffer {
  const result = spawnSync('docker', args, {
    cwd: root,
    input,
    maxBuffer: 256 * 1024 * 1024
  })
  if (result.error || result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8')
      : String(result.stderr ?? '')
    throw new Error(
      `docker_failed:${args.join(' ')}:${result.error?.message ?? stderr ?? result.status}`
    )
  }
  return Buffer.isBuffer(result.stdout)
    ? result.stdout
    : Buffer.from(result.stdout ?? '')
}

async function waitForPostgres(container: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = spawnSync(
      'docker',
      ['exec', container, 'pg_isready', '-U', adminUser, '-d', database],
      { cwd: root, encoding: 'utf8' }
    )
    if (result.status === 0) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`postgres_not_ready:${container}`)
}

async function startPostgres(label: string): Promise<ManagedPostgres> {
  const name = `cvg-rem21-010-${label}-${process.pid}-${Date.now().toString(36)}`
  dockerText([
    'run',
    '--detach',
    '--name',
    name,
    '--env',
    `POSTGRES_USER=${adminUser}`,
    '--env',
    `POSTGRES_PASSWORD=${adminPassword}`,
    '--env',
    `POSTGRES_DB=${database}`,
    '--publish',
    '127.0.0.1::5432',
    image
  ])
  const port = dockerText([
    'inspect',
    '--format',
    '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
    name
  ])
  await waitForPostgres(name)
  return {
    name,
    port,
    url: `postgres://${adminUser}:${adminPassword}@127.0.0.1:${port}/${database}`
  }
}

function stopPostgres(instance: ManagedPostgres | undefined): void {
  if (!instance) return
  spawnSync('docker', ['rm', '--force', instance.name], {
    cwd: root,
    encoding: 'utf8'
  })
}

async function connect(url: string): Promise<Client> {
  let lastError: unknown
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const client = new Client({ connectionString: url })
    try {
      await client.connect()
      return client
    } catch (error) {
      lastError = error
      await client.end().catch(() => undefined)
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`postgres_connect_failed:${String(lastError)}`)
}

async function ensureSyntheticRole(client: Client): Promise<void> {
  const existing = await client.query<{ rolname: string }>(
    'SELECT rolname FROM pg_roles WHERE rolname = $1',
    [appUser]
  )
  if (existing.rows.length === 0) {
    await client.query(
      `CREATE ROLE ${quoteIdentifier(appUser)} LOGIN PASSWORD ${quoteLiteral(appPassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`
    )
  } else {
    await client.query(
      `ALTER ROLE ${quoteIdentifier(appUser)} LOGIN PASSWORD ${quoteLiteral(appPassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`
    )
  }
}

async function grantSyntheticRole(client: Client): Promise<void> {
  const schemaIdentifier = quoteIdentifier(schema)
  await client.query(
    `ALTER ROLE ${quoteIdentifier(appUser)} SET search_path TO ${schemaIdentifier}`
  )
  await client.query(
    `GRANT USAGE ON SCHEMA ${schemaIdentifier} TO ${quoteIdentifier(appUser)}`
  )
  await client.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schemaIdentifier} TO ${quoteIdentifier(appUser)}`
  )
}

async function createDatabase(client: Client, name: string): Promise<void> {
  const existing = await client.query<{ datname: string }>(
    'SELECT datname FROM pg_database WHERE datname = $1',
    [name]
  )
  if (existing.rows.length === 0) {
    await client.query(`CREATE DATABASE ${quoteIdentifier(name)}`)
  }
}

async function dropDatabase(client: Client, name: string): Promise<void> {
  await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)}`)
}

function dumpDatabase(instance: ManagedPostgres, databaseName: string): Buffer {
  return dockerBinary([
    'exec',
    instance.name,
    'pg_dump',
    '-U',
    adminUser,
    '-d',
    databaseName,
    '--format=custom',
    '--schema',
    schema,
    '--no-owner'
  ])
}

function restoreDatabase(
  instance: ManagedPostgres,
  databaseName: string,
  dump: Buffer
): void {
  dockerBinary(
    [
      'exec',
      '--interactive',
      instance.name,
      'pg_restore',
      '-U',
      adminUser,
      '-d',
      databaseName,
      '--no-owner',
      '--clean',
      '--if-exists',
      '--exit-on-error'
    ],
    dump
  )
}

async function runPreMigrations(client: Client): Promise<void> {
  await runPostgresMigrations(client, {
    schemaName: schema,
    migrations: preRollForwardMigrations
  })
}

async function runRollForward(client: Client): Promise<void> {
  await runPostgresMigrations(client, {
    schemaName: schema,
    migrations: [rollForwardMigration]
  })
}

async function runSyntheticWorkload(
  appPool: Pool,
  events: number
): Promise<{ eventIds: string[]; firstEventId: string }> {
  const runtime = new TenantScopedPostgresRuntimeRepository(appPool)
  const eventIds: string[] = []
  for (let index = 0; index < events; index += 1) {
    const eventId = `outbox_rem21_010_${String(index).padStart(4, '0')}`
    eventIds.push(eventId)
    await runtime.enqueue({
      tenantId,
      eventId,
      type: 'message.outbound',
      payload: { synthetic: true, workload: 'rem21-010', index },
      idempotencyKey: `rem21-010-load-${String(index).padStart(4, '0')}`,
      correlationId,
      createdAt: fixedCreatedAt,
      availableAt: fixedCreatedAt
    })
  }

  const processed = new Set<string>()
  let duplicates = 0
  async function worker(workerId: string): Promise<void> {
    for (let attempt = 0; attempt < events * 3; attempt += 1) {
      const event = await runtime.claimNext({ tenantId, workerId })
      if (!event) return
      if (processed.has(event.id)) duplicates += 1
      await runtime.ack({
        tenantId,
        eventId: event.id,
        workerId,
        result: { accepted: true, synthetic: true, eventId: event.id }
      })
      processed.add(event.id)
    }
    throw new Error(`worker_did_not_drain:${workerId}`)
  }
  await Promise.all([
    worker('rem21-010-worker-a'),
    worker('rem21-010-worker-b')
  ])
  if (processed.size !== events || duplicates !== 0) {
    throw new Error(
      `workload_invariant_failed:processed=${processed.size}:duplicates=${duplicates}`
    )
  }

  await withTenantContext(appPool, tenantId, async (client) => {
    const effectJournal = new PostgresEffectJournal(client, {
      clock: () => new Date(fixedJournalNow)
    })
    const operationKey = 'rem21-010-effect-operation'
    const attemptId = 'rem21-010-effect-attempt-1'
    const reserved = await effectJournal.reserve({
      tenantId,
      operationKey,
      proposalHash: 'a'.repeat(64),
      attemptId,
      expiresAt: new Date(fixedJournalNow.getTime() + 60_000).toISOString()
    })
    if (reserved.outcome !== 'reserved') {
      throw new Error(`effect_journal_reserve:${reserved.outcome}`)
    }
    await effectJournal.markEffectStarted({ tenantId, operationKey, attemptId })
    await effectJournal.confirmEffect({
      tenantId,
      operationKey,
      attemptId,
      executionRef: 'rem21-010-execution-1',
      resultDigest: 'b'.repeat(64)
    })

    const channelJournal = new PostgresChannelEffectJournal(client, {
      clock: () => fixedJournalNow.getTime()
    })
    const identity = {
      tenantId,
      channel: 'whatsapp',
      operationKind: 'outbound_message' as const,
      idempotencyKey: 'rem21-010-channel-operation'
    }
    const channelOwner = 'rem21-010-channel-worker'
    const channelReserved = await channelJournal.reserve({
      identity,
      payloadHash: 'c'.repeat(64),
      hashVersion: 'shared-rfc8785-subset-v1',
      leaseOwner: channelOwner,
      leaseMs: 60_000
    })
    if (channelReserved.outcome !== 'reserved') {
      throw new Error(`channel_journal_reserve:${channelReserved.outcome}`)
    }
    await channelJournal.claimSend(identity, channelOwner)
    const completed = await channelJournal.complete(identity, channelOwner, {
      externalId: 'synthetic-external-message-1',
      channel: 'whatsapp',
      accepted: true,
      sentAt: fixedJournalNow.toISOString()
    })
    if (completed !== 'committed')
      throw new Error('channel_journal_not_committed')
  })

  return { eventIds, firstEventId: eventIds[0] as string }
}

async function tableNames(client: Client): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = $1 AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [schema]
  )
  return result.rows.map((row) => row.table_name)
}

async function tableDigest(
  client: Client,
  table: string
): Promise<TableDigest> {
  const result = await client.query<{ rows: string | number; digest: string }>(
    `SELECT count(*)::bigint AS rows,
            md5(COALESCE(
              string_agg(to_jsonb(row_data)::text, E'\\n' ORDER BY to_jsonb(row_data)::text),
              ''
            )) AS digest
     FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)} AS row_data`
  )
  return {
    rows: Number(result.rows[0]?.rows ?? 0),
    digest: result.rows[0]?.digest ?? sha256('')
  }
}

async function captureRls(client: Client): Promise<unknown[]> {
  const result = await client.query(
    `SELECT c.relname AS table_name,
            c.relrowsecurity,
            c.relforcerowsecurity,
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'name', p.polname,
                  'using', pg_get_expr(p.polqual, p.polrelid),
                  'check', pg_get_expr(p.polwithcheck, p.polrelid)
                ) ORDER BY p.polname
              ) FILTER (WHERE p.polname IS NOT NULL),
              '[]'::jsonb
            ) AS policies
     FROM pg_class AS c
     INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
     LEFT JOIN pg_policy AS p ON p.polrelid = c.oid
     WHERE n.nspname = $1 AND c.relkind = 'r'
     GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
     ORDER BY c.relname`,
    [schema]
  )
  return result.rows
}

async function captureRoles(client: Client): Promise<unknown[]> {
  const result = await client.query(
    `SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
            rolcanlogin, rolreplication, rolbypassrls, rolconfig
     FROM pg_roles
     WHERE rolname = ANY($1::text[])
     ORDER BY rolname`,
    [[adminUser, appUser]]
  )
  return result.rows
}

async function captureGrants(client: Client): Promise<unknown> {
  const schemaUsage = await client.query<{ allowed: boolean }>(
    'SELECT has_schema_privilege($1, $2, $3) AS allowed',
    [appUser, schema, 'USAGE']
  )
  const tableGrants = await client.query(
    `SELECT table_name, grantee, privilege_type
     FROM information_schema.role_table_grants
     WHERE table_schema = $1 AND grantee = $2
     ORDER BY table_name, privilege_type`,
    [schema, appUser]
  )
  return {
    schemaUsage: schemaUsage.rows[0]?.allowed === true,
    tableGrants: tableGrants.rows
  }
}

async function captureLogicalState(client: Client): Promise<LogicalState> {
  const tables: Record<string, TableDigest> = {}
  for (const table of await tableNames(client)) {
    tables[table] = await tableDigest(client, table)
  }
  return {
    tables,
    rls: await captureRls(client),
    roles: await captureRoles(client),
    grants: await captureGrants(client)
  }
}

function statesMatch(left: LogicalState, right: LogicalState): boolean {
  return canonicalJson(left) === canonicalJson(right)
}

async function migrationVersion(client: Client): Promise<string> {
  const result = await client.query<{ version: string }>(
    `SELECT version FROM ${quoteIdentifier(schema)}.schema_migrations
     ORDER BY version DESC LIMIT 1`
  )
  return result.rows[0]?.version ?? 'missing'
}

async function writeReport(outputPath: string, report: unknown): Promise<void> {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
}

async function main(): Promise<void> {
  const args = parseArgs()
  let source: ManagedPostgres | undefined
  let target: ManagedPostgres | undefined
  let sourceAdmin: Client | undefined
  let targetAdmin: Client | undefined
  let rollbackAdmin: Client | undefined
  let sourcePool: Pool | undefined
  let targetPool: Pool | undefined
  let rollbackUrl: string | undefined
  let rollbackWasCreated = false
  let stage = 'start'

  try {
    stage = 'start-source'
    source = await startPostgres('source')
    stage = 'start-target'
    target = await startPostgres('target')
    stage = 'connect-admin'
    sourceAdmin = await connect(source.url)
    targetAdmin = await connect(target.url)

    stage = 'ensure-roles'
    await ensureSyntheticRole(sourceAdmin)
    await ensureSyntheticRole(targetAdmin)
    stage = 'migrate-source-pre-roll-forward'
    await runPreMigrations(sourceAdmin)
    stage = 'grant-source-role'
    await grantSyntheticRole(sourceAdmin)

    stage = 'connect-source-app'
    sourcePool = new Pool({
      connectionString: `postgres://${appUser}:${appPassword}@127.0.0.1:${source.port}/${database}`,
      max: 4
    })
    stage = 'run-synthetic-workload'
    const workload = await runSyntheticWorkload(sourcePool, args.events)
    stage = 'dump-pre-roll-forward'
    const preDump = dumpDatabase(source, database)

    stage = 'roll-forward-source'
    await runRollForward(sourceAdmin)
    // Grants are reapplied after every migration, as a deployment does, so
    // tables added by the roll-forward are covered in the backup too.
    stage = 'grant-source-role-after-roll-forward'
    await grantSyntheticRole(sourceAdmin)
    stage = 'dump-post-roll-forward'
    const postDump = dumpDatabase(source, database)

    stage = 'restore-target'
    await createDatabase(targetAdmin, database)
    restoreDatabase(target, database, postDump)
    stage = 'grant-target-role'
    await grantSyntheticRole(targetAdmin)
    stage = 'idempotent-target-migrations'
    await runPostgresMigrations(targetAdmin, { schemaName: schema })

    stage = 'compare-target-state'
    const sourceState = await captureLogicalState(sourceAdmin)
    const restoredState = await captureLogicalState(targetAdmin)
    const cleanStateMatch = statesMatch(sourceState, restoredState)

    targetPool = new Pool({
      connectionString: `postgres://${appUser}:${appPassword}@127.0.0.1:${target.port}/${database}`,
      max: 4
    })
    stage = 'application-read-after-restore'
    const restoredRead = await new TenantScopedPostgresRuntimeRepository(
      targetPool
    ).findOutboxById(tenantId, workload.firstEventId)
    const crossTenantRead = await new TenantScopedPostgresRuntimeRepository(
      targetPool
    ).findOutboxById(otherTenantId, workload.firstEventId)
    const applicationRead = Boolean(restoredRead)
    const rlsIsolation = crossTenantRead === null

    stage = 'corruption-detection'
    const beforeCorruption = await tableDigest(targetAdmin, 'outbox_events')
    await targetAdmin.query(
      `UPDATE ${quoteIdentifier(schema)}.outbox_events
       SET payload = '{"synthetic":true,"corrupted":true}'::jsonb
       WHERE id = $1`,
      [workload.firstEventId]
    )
    const afterCorruption = await tableDigest(targetAdmin, 'outbox_events')
    const corruptionDetected =
      beforeCorruption.digest !== afterCorruption.digest ||
      beforeCorruption.rows !== afterCorruption.rows
    restoreDatabase(target, database, postDump)
    stage = 'recover-after-corruption'
    await grantSyntheticRole(targetAdmin)
    const finalState = await captureLogicalState(targetAdmin)
    const recoveredAfterCorruption = statesMatch(sourceState, finalState)

    stage = 'rollback-database'
    await createDatabase(targetAdmin, rollbackDatabase)
    rollbackWasCreated = true
    rollbackUrl = `postgres://${adminUser}:${adminPassword}@127.0.0.1:${target.port}/${rollbackDatabase}`
    restoreDatabase(target, rollbackDatabase, preDump)
    stage = 'rollback-check'
    rollbackAdmin = await connect(rollbackUrl)
    const rolledBackVersion = await migrationVersion(rollbackAdmin)
    await runRollForward(rollbackAdmin)
    stage = 'rollback-re-restore'
    const firstRollForwardVersion = await migrationVersion(rollbackAdmin)
    await rollbackAdmin.query(
      `SET search_path TO ${quoteIdentifier(schema)}; ${rollForwardRollbackSql}`
    )
    restoreDatabase(target, rollbackDatabase, preDump)
    const restoredPreMigrationVersion = await migrationVersion(rollbackAdmin)
    await runRollForward(rollbackAdmin)
    const secondRollForwardVersion = await migrationVersion(rollbackAdmin)
    const migrationRecovery =
      rolledBackVersion === preRollForwardVersion &&
      firstRollForwardVersion === rollForwardMigration &&
      restoredPreMigrationVersion === preRollForwardVersion &&
      secondRollForwardVersion === rollForwardMigration

    const pass =
      applicationRead &&
      rlsIsolation &&
      cleanStateMatch &&
      corruptionDetected &&
      recoveredAfterCorruption &&
      migrationRecovery &&
      workload.eventIds.length === args.events

    const report = {
      schemaVersion: 1,
      kind: 'rem21-010-postgres-proof',
      contract: 'rem21-010-v1',
      generatedAt: new Date().toISOString(),
      runId: args.runId,
      candidateId: args.candidateId,
      node: process.version,
      verdict: pass ? 'PASS' : 'FAIL',
      scope: {
        environment: 'local-disposable-postgresql',
        production: false,
        realData: false,
        sourceImage: image,
        workloadPath: 'synthetic-api-repository->postgresql->controlled-worker',
        rpoRtoClaim: 'RPO_RTO_NOT_MEASURED_IN_PRODUCTION'
      },
      workload: {
        status:
          applicationRead && workload.eventIds.length === args.events
            ? 'PASS'
            : 'FAIL',
        events: args.events,
        workers: 2,
        enqueued: workload.eventIds.length,
        processed: workload.eventIds.length,
        duplicates: 0,
        applicationReadAfterRestore: applicationRead,
        crossTenantReadBlocked: rlsIsolation,
        firstEventId: workload.firstEventId
      },
      backupRestore: {
        status: cleanStateMatch && recoveredAfterCorruption ? 'PASS' : 'FAIL',
        format: 'pg_dump-custom',
        sourceContainer: source.name,
        targetContainer: target.name,
        sourceSchema: schema,
        dumpPreRollForwardSha256: sha256(preDump),
        dumpPostRollForwardSha256: sha256(postDump),
        sourceTables: Object.keys(sourceState.tables).length,
        restoredTables: Object.keys(restoredState.tables).length,
        logicalStateMatch: cleanStateMatch,
        recoveredAfterCorruption
      },
      migrationRecovery: {
        status: migrationRecovery ? 'PASS' : 'FAIL',
        strategy: 'restore-pre-migration-backup-then-roll-forward',
        preMigrationVersion: rolledBackVersion,
        firstRollForwardVersion,
        restoredPreMigrationVersion,
        secondRollForwardVersion,
        migration: rollForwardMigration
      },
      integrity: {
        status: cleanStateMatch && rlsIsolation ? 'PASS' : 'FAIL',
        rowsAndTableChecksums: cleanStateMatch,
        rlsAndPolicies:
          canonicalJson(sourceState.rls) === canonicalJson(restoredState.rls),
        roles:
          canonicalJson(sourceState.roles) ===
          canonicalJson(restoredState.roles),
        grants:
          canonicalJson(sourceState.grants) ===
          canonicalJson(restoredState.grants),
        outboxAndJournals: [
          'outbox_events',
          'outbox_attempts',
          'outbox_effects',
          'effect_journal',
          'channel_effect_journal'
        ].every(
          (table) =>
            sourceState.tables[table]?.digest ===
              restoredState.tables[table]?.digest &&
            sourceState.tables[table]?.rows ===
              restoredState.tables[table]?.rows
        )
      },
      corruptionGate: {
        status: corruptionDetected ? 'PASS' : 'FAIL',
        detected: corruptionDetected,
        table: 'outbox_events',
        beforeDigest: beforeCorruption.digest,
        corruptedDigest: afterCorruption.digest,
        recoveryVerified: recoveredAfterCorruption
      },
      rpoRto: {
        measured: false,
        verdict: 'RPO_RTO_NOT_MEASURED_IN_PRODUCTION',
        note: 'Local container dump/restore timings are not production RPO/RTO evidence.'
      },
      limitations: [
        'No production infrastructure, provider, channel, IdP, secret or real data was used.',
        'Rollback is demonstrated by restoring a pre-migration backup; no generic down-migration is claimed.',
        'Final certification and external review remain deferred.'
      ]
    }
    validateRem21010ProofReport(report, {
      runId: args.runId,
      ...(args.candidateId ? { candidateId: args.candidateId } : {})
    })
    await writeReport(args.outputPath, report)
    console.log(JSON.stringify(report))
    if (!pass) process.exitCode = 1
  } catch (error) {
    const report = {
      schemaVersion: 1,
      kind: 'rem21-010-postgres-proof',
      contract: 'rem21-010-v1',
      generatedAt: new Date().toISOString(),
      runId: args.runId,
      candidateId: args.candidateId,
      node: process.version,
      verdict: 'FAIL',
      scope: { production: false, realData: false },
      error: `${stage}:${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
    }
    await writeReport(args.outputPath, report)
    console.error(JSON.stringify(report))
    process.exitCode = 1
  } finally {
    await rollbackAdmin?.end().catch(() => undefined)
    if (targetAdmin && rollbackWasCreated) {
      await dropDatabase(targetAdmin, rollbackDatabase).catch(() => undefined)
    }
    await targetPool?.end().catch(() => undefined)
    await sourcePool?.end().catch(() => undefined)
    await targetAdmin?.end().catch(() => undefined)
    await sourceAdmin?.end().catch(() => undefined)
    stopPostgres(target)
    stopPostgres(source)
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
