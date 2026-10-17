// @vitest-environment node
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client, Pool, type QueryResultRow } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  AgentConfigSchema,
  InMemoryControlPlaneStore,
  type TestRunTrace
} from '@cvg/platform'
import { runPostgresMigrations, withTenantContext } from '@cvg/persistence'
import { buildServer } from '../../../api/src/server.ts'
import {
  HmacWebhookVerifier,
  PostgresWebhookReplayStore,
  createWebhookSignature
} from '../../../api/src/webhook-security.ts'
import {
  createPostgresControlledWorker,
  type PostgresControlledWorkerRuntime
} from '../postgres-controlled.ts'
import {
  assertPublishedPostgresWorkerPreflight,
  assertPostgresWorkerPreflight,
  WORKER_CRITICAL_TABLES,
  PUBLISHED_POSTGRES_CRITICAL_TABLES,
  PUBLISHED_POSTGRES_TABLE_ACCESS
} from '../postgres-role-preflight.ts'

const resourcePath =
  process.env.PARE217_WORKER_PG_RESOURCE ?? process.env.PARE217_PG_RESOURCE
const outputPath = process.env.PARE217_WORKER_PG_OUTPUT
if (
  process.env.PARE217_WORKER_PG_REQUIRED === '1' &&
  (!resourcePath || !outputPath)
) {
  throw new Error(
    'Assigned PG217 resource and lane-b-worker-pg output are required'
  )
}
const tenantId = 'tenant_00000000-0000-4000-8000-000000000217'
const secret = 'synthetic-pare217-worker-b-signing-secret-no-real-data'
type Row = Record<string, unknown>

/** Observes real clients only; returns the original query result/promise unchanged. */
function observeQueries(pool: Pool, role: string, records: Row[]): void {
  pool.on('connect', (client) => {
    const query = client.query
    client.query = function (...args: unknown[]) {
      const record: Row = {
        role,
        backendPid: Reflect.get(client, 'processID') ?? null,
        sql:
          typeof args[0] === 'string'
            ? args[0]
            : Reflect.get(args[0] as object, 'text'),
        values: Array.isArray(args[1]) ? args[1] : [],
        startedAt: new Date().toISOString()
      }
      records.push(record)
      const result: unknown = Reflect.apply(query, client, args)
      if (result instanceof Promise) {
        void result.then(
          (response: { rowCount?: number; command?: string }) => {
            record.finishedAt = new Date().toISOString()
            record.rowCount = response.rowCount
            record.command = response.command
          },
          (error: unknown) => {
            record.finishedAt = new Date().toISOString()
            record.error = {
              message: error instanceof Error ? error.message : String(error),
              code:
                error && typeof error === 'object'
                  ? Reflect.get(error, 'code')
                  : null
            }
          }
        )
      }
      return result
    } as typeof client.query
  })
}

type CompletionCut =
  | 'BEFORE_COMPLETION'
  | 'AFTER_COMPLETION_COMMIT'
  | 'AFTER_S1_COMMIT'

async function launchWorkerProcess(input: {
  directory: string
  env: Record<string, string>
  config: unknown
  eventId: string
  stopAt?: CompletionCut
}) {
  await mkdir(input.directory, { recursive: true })
  const home = resolve(input.directory, 'home')
  const temporary = resolve(input.directory, 'tmp')
  await mkdir(home, { recursive: true })
  await mkdir(temporary, { recursive: true })
  const path = resolve(input.directory, 'private-synthetic-process-config.json')
  await writeFile(
    path,
    JSON.stringify({
      env: input.env,
      config: input.config,
      eventId: input.eventId,
      ...(input.stopAt ? { stopAt: input.stopAt } : {})
    }),
    { mode: 0o600 }
  )
  const executable = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
  const args = [
    '--import',
    'tsx',
    'apps/worker/src/__tests__/fixtures/pare217-published-worker-process.ts',
    path
  ]
  const child: ChildProcessWithoutNullStreams = spawn(executable, args, {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: {
      PATH: '/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin',
      HOME: home,
      TMPDIR: temporary,
      XDG_CONFIG_HOME: resolve(home, 'config'),
      XDG_DATA_HOME: resolve(home, 'data'),
      LANG: 'C.UTF-8'
    }
  })
  const startedAt = new Date().toISOString()
  let stdout = '',
    stderr = '',
    pending = '',
    spawnError: string | undefined
  const messages: Row[] = []
  const listeners = new Set<() => void>()
  child.stdout.on('data', (data: Buffer) => {
    const chunk = data.toString()
    stdout += chunk
    pending += chunk
    if (Buffer.byteLength(stdout) > 16 * 1024 * 1024) child.kill('SIGKILL')
    let end: number
    while ((end = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, end)
      pending = pending.slice(end + 1)
      try {
        const message = JSON.parse(line) as Row
        if (typeof message.point === 'string')
          messages.push({ ...message, receivedAt: new Date().toISOString() })
      } catch {
        /* Preserve non-JSON diagnostics in the raw stdout. */
      }
    }
    for (const listener of listeners) listener()
  })
  child.stderr.on('data', (data: Buffer) => {
    stderr += data.toString()
    if (Buffer.byteLength(stderr) > 2 * 1024 * 1024) child.kill('SIGKILL')
  })
  const exited = new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((finish) => {
    child.once('error', (error) => {
      spawnError = error.message
    })
    child.once('close', (code, signal) => {
      finish({ code, signal })
      for (const listener of listeners) listener()
    })
  })
  const awaitPoint = (point: string) =>
    new Promise<Row>((finish, reject) => {
      const timeout = setTimeout(() => {
        listeners.delete(check)
        reject(
          new Error(
            `Actual worker process readiness ${point} timed out: ${stderr}`
          )
        )
      }, 20_000)
      const check = () => {
        const found = messages.find((message) => message.point === point)
        if (
          found ||
          child.exitCode !== null ||
          child.signalCode !== null ||
          spawnError
        ) {
          clearTimeout(timeout)
          listeners.delete(check)
          if (found) finish(found)
          else
            reject(
              new Error(
                `Actual worker process exited before ${point}: ${spawnError ?? stderr}`
              )
            )
        }
      }
      listeners.add(check)
      check()
    })
  let recordPromise: Promise<Awaited<typeof exited>> | undefined
  const record = () =>
    (recordPromise ??= (async () => {
      const exit = await exited
      await writeFile(resolve(input.directory, 'stdout.log'), stdout)
      await writeFile(resolve(input.directory, 'stderr.log'), stderr)
      await writeFile(
        resolve(input.directory, 'process.json'),
        JSON.stringify(
          {
            executable,
            args: [
              ...args.slice(0, -1),
              'private-synthetic-process-config.json (removed after exit)'
            ],
            pid: child.pid,
            startedAt,
            finishedAt: new Date().toISOString(),
            exit,
            spawnError,
            eventId: input.eventId,
            schema: input.env.POSTGRES_SCHEMA,
            stopAt: input.stopAt ?? null,
            messages
          },
          null,
          2
        ) + '\n'
      )
      await unlink(path)
      return exit
    })())
  return { child, messages, exited, awaitPoint, record }
}

function first<T>(rows: T[]): T {
  const value = rows[0]
  if (value === undefined) throw new Error('Expected one PostgreSQL proof row')
  return value
}

function milliseconds(value: unknown): number {
  return value instanceof Date
    ? value.getTime()
    : new Date(String(value)).getTime()
}

function sha(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function provenance() {
  const paths = [
    'docs/02_spec/0217_pare100_durable_kernel_composition.md',
    'packages/persistence/migrations/0029_controlled_published_kernel.sql',
    'packages/persistence/src/controlled-published-kernel-store.ts',
    'packages/platform/src/controlled-kernel-continuation.ts',
    'packages/platform/src/controlled-kernel-execution.ts',
    'packages/platform/src/test-lab.ts',
    'apps/api/src/server.ts',
    'apps/worker/src/postgres-controlled.ts',
    'apps/worker/src/published-kernel-composition.ts',
    'apps/worker/src/claimed-execution-lifecycle.ts',
    'apps/worker/src/jobs/process-outbox-event.ts',
    'apps/worker/src/postgres-role-preflight.ts',
    'packages/agent-core/src/commands/execute-published-agent.ts',
    'apps/worker/src/__tests__/pare217-published-postgres.integration.test.ts',
    'apps/worker/src/__tests__/fixtures/pare217-published-worker-process.ts',
    'apps/worker/src/__tests__/fixtures/pare217-function-call-probe.ts',
    'apps/worker/src/__tests__/fixtures/pare217-platform-process.ts'
  ]
  return Promise.all(
    paths.map(async (path) => ({
      path,
      sha256: sha(await readFile(resolve(path)))
    }))
  )
}

async function fixture(
  label: string,
  run: (f: Fixture) => Promise<void>
): Promise<void> {
  if (!resourcePath || !outputPath) throw new Error('PG217 test is not armed')
  if (
    ![
      '/spec217-build/lane-b-worker-pg',
      '/spec217-build/lane-b-worker-process'
    ].some((suffix) => resolve(outputPath).endsWith(suffix))
  )
    throw new Error('Unexpected worker PG evidence directory')
  const resourceBytes = await readFile(resourcePath, 'utf8')
  const resource = JSON.parse(resourceBytes) as {
    test_database_url: string
    name: string
  }
  const url = new URL(resource.test_database_url)
  if (
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/pare217_synthetic' ||
    url.username !== 'pare217' ||
    resource.name !== 'cvg-pare100-217-pg'
  ) {
    throw new Error('Refusing an unassigned PostgreSQL resource')
  }
  const suffix = `s1_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
  const schema = `pare217_worker_b_${suffix}`
  const workerRole = `pare217_b_worker_${suffix}`
  const apiRole = `pare217_b_api_${suffix}`
  const admin = new Client({
    connectionString: url.toString(),
    application_name: `pare217_b_admin_${suffix}`
  })
  const proof: Record<string, unknown> = {
    label,
    schema,
    workerRole,
    apiRole,
    pid: process.pid,
    observedAt: new Date().toISOString(),
    resourceFileSHA256: sha(resourceBytes),
    resourceClaim: { resourcePath, schema, workerRole, apiRole },
    sourceBefore: await provenance(),
    queries: [],
    nativeQueries: [],
    assertions: 'NOT_RUN',
    cleanup: 'NOT_RUN'
  }
  const queries = proof.queries as Array<{
    sql: string
    values: unknown[]
    rows: QueryResultRow[]
  }>
  const pools: Pool[] = []
  const workers: PostgresControlledWorkerRuntime[] = []
  const children: Awaited<ReturnType<typeof launchWorkerProcess>>[] = []
  const roles: string[] = []
  let schemaCreated = false
  let app: ReturnType<typeof buildServer> | undefined
  let env!: Record<string, string>
  let failure: unknown
  await mkdir(outputPath, { recursive: true })
  const save = () =>
    writeFile(
      resolve(outputPath, `${schema}-${label}.json`),
      `${JSON.stringify(proof, null, 2)}\n`
    )
  try {
    await admin.connect()
    await admin.query(`CREATE SCHEMA ${schema}`)
    schemaCreated = true
    await runPostgresMigrations(admin, {
      schemaName: schema,
      createSchema: false
    })
    const migration = first(
      await select(
        `SELECT version,checksum FROM ${schema}.schema_migrations WHERE version='0029_controlled_published_kernel'`
      )
    )
    const before = proof.sourceBefore as Array<{ path: string; sha256: string }>
    expect(migration.checksum).toBe(
      before.find((file) =>
        file.path.endsWith('0029_controlled_published_kernel.sql')
      )!.sha256
    )
    const passwords = new Map<string, string>()
    for (const role of [workerRole, apiRole]) {
      const password = randomBytes(24).toString('hex')
      await admin.query(
        `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`
      )
      roles.push(role)
      passwords.set(role, password)
      await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
    }
    const legacyTables = new Set<string>(WORKER_CRITICAL_TABLES)
    const grantTables =
      label === 'k11'
        ? [
            ...new Set([
              ...PUBLISHED_POSTGRES_CRITICAL_TABLES,
              ...WORKER_CRITICAL_TABLES
            ])
          ]
        : PUBLISHED_POSTGRES_CRITICAL_TABLES
    for (const table of grantTables) {
      // Default-off retains the existing legacy worker qualification and grants.
      // K01 uses the exact exported published serving-role contract.
      const mode =
        label === 'k11' && legacyTables.has(table)
          ? 'write'
          : (PUBLISHED_POSTGRES_TABLE_ACCESS[table] ?? 'write')
      const privileges =
        mode === 'read'
          ? 'SELECT'
          : mode === 'append'
            ? 'SELECT,INSERT'
            : mode === 'consume'
              ? 'SELECT,UPDATE'
              : 'SELECT,INSERT,UPDATE'
      await admin.query(
        `GRANT ${privileges} ON ${schema}.${table} TO ${workerRole}`
      )
    }
    await admin.query(
      `GRANT SELECT ON ${schema}.schema_migrations TO ${workerRole}`
    )
    await admin.query(
      `GRANT USAGE ON SEQUENCE ${schema}.outbox_attempts_id_seq,${schema}.operational_execution_events_sequence_seq TO ${workerRole}`
    )
    await admin.query(
      `GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA ${schema} TO ${apiRole}`
    )
    await admin.query(
      `GRANT DELETE ON ${schema}.webhook_replay_events TO ${apiRole}`
    )
    await admin.query(
      `GRANT USAGE ON ALL SEQUENCES IN SCHEMA ${schema} TO ${apiRole}`
    )
    const roleUrl = (role: string) => {
      const value = new URL(url.toString())
      value.username = role
      value.password = passwords.get(role)!
      return value.toString()
    }
    const apiPool = new Pool({
      connectionString: roleUrl(apiRole),
      max: 4,
      connectionTimeoutMillis: 1000,
      options: `-c search_path=${schema}`
    })
    pools.push(apiPool)
    observeQueries(apiPool, apiRole, proof.nativeQueries as Row[])
    const config = AgentConfigSchema.parse({
      persona: { name: 'Synthetic217WorkerB', role: 'assistant', tone: 'calm' },
      greeting: 'Resposta controlada.',
      promptBlocks: [],
      responseTemplates: {},
      model: {
        provider: 'fake',
        model: 'deterministic-v1',
        temperature: 0,
        maxTokens: 128,
        timeoutMs: 60000,
        retries: 0,
        secretRef: 'secret://controlled/synthetic'
      },
      policies: {
        version: 'synthetic217',
        minConfidence: 0.7,
        lowConfidence: 'clarify',
        maxClarifications: 2,
        enabledActions: ['respond', 'scheduling'],
        approvalActions: [],
        blockedActions: []
      },
      plugins: [
        {
          plugin: 'scheduling.controlled',
          version: '1.0.0',
          enabled: true,
          allowedTools: ['find_available_slots'],
          config: {}
        }
      ],
      knowledge: [],
      handoff: {
        lowConfidenceDestination: 'synthetic',
        destinations: ['synthetic'],
        maxClarifications: 2
      }
    })
    const seed = new InMemoryControlPlaneStore()
    const agent = await seed.createAgent(
      { tenantId },
      {
        slug: `synthetic217-${suffix.replaceAll('_', '-')}`,
        name: 'Synthetic',
        description: 'Synthetic only'
      }
    )
    const version = await seed.createVersion(
      { tenantId },
      agent.id,
      config,
      'synthetic'
    )
    await admin.query(
      `INSERT INTO ${schema}.platform_agents(tenant_id,id,slug,name,description) VALUES($1,$2,$3,'Synthetic','Synthetic only')`,
      [tenantId, agent.id, agent.slug]
    )
    await admin.query(
      `INSERT INTO ${schema}.platform_agent_versions(tenant_id,id,agent_id,version,status,config,created_by,published_at) VALUES($1,$2,$3,1,'PUBLISHED',$4::jsonb,'synthetic',clock_timestamp())`,
      [tenantId, version.id, agent.id, JSON.stringify(config)]
    )
    await admin.query(
      `UPDATE ${schema}.platform_agents SET active_version_id=$3 WHERE tenant_id=$1 AND id=$2`,
      [tenantId, agent.id, version.id]
    )
    const verifier = new HmacWebhookVerifier({
      secret,
      replayStore: new PostgresWebhookReplayStore(apiPool)
    })
    app = buildServer({
      persistence: { kind: 'postgres-pool', pool: apiPool },
      durableInbound: true,
      webhookVerifier: verifier.verifyWithLease,
      inboundTenantResolver: () => tenantId,
      agentRuntime: { resolveAgentId: () => agent.id }
    })
    env = {
      NODE_ENV: 'test',
      DATABASE_URL: roleUrl(workerRole),
      POSTGRES_SCHEMA: schema,
      POSTGRES_RLS_ENFORCEMENT: 'true',
      CVG_WORKER_CONTROLLED_MODE: 'true',
      CVG_WORKER_TENANT_ID: tenantId,
      CVG_WORKER_AGENT_ID: agent.id,
      CVG_WORKER_ID: `pare217_b_${label}`,
      CVG_WORKER_RUNTIME: 'published-agent',
      CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled',
      CVG_WORKER_PUBLISHED_DURABILITY: 'postgres-v1'
    }
    proof.handshake = {
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      config,
      roleParameters: {
        workerRole,
        apiRole,
        workerGrantProfile:
          label === 'k11'
            ? 'legacy-worker-defaultoff'
            : 'published-exported-minimum'
      },
      profile: {
        durability: 'postgres-v1',
        outerTTL: 10000,
        innerTTL: 10000,
        tick: 2000,
        modelTimeout: 60000,
        poolMax: 4,
        connectTimeout: 1000
      },
      positiveEntry:
        'signed API app.inject -> createPostgresControlledWorker -> worker.processNext -> native ackClaim effect; no handler/store/facade overrides'
    }
    await run({
      schema,
      workerRole,
      proof,
      select,
      snapshot,
      env,
      createWorker,
      launchProcess,
      ingress
    })
    proof.assertions = 'PASS'
  } catch (error) {
    failure = error
    if (schemaCreated) {
      try {
        proof.failureSnapshot = await snapshot()
      } catch (snapshotError) {
        proof.snapshotError = String(snapshotError)
      }
    }
    proof.assertions = 'FAIL'
    proof.error = {
      name: error instanceof Error ? error.name : null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null
    }
    console.error(
      'PARE217_B_WORKER_PG_FAILURE',
      JSON.stringify({ schema, label, error: proof.error })
    )
  } finally {
    const cleanupErrors: string[] = []
    await app?.close().catch((error: unknown) => {
      cleanupErrors.push(String(error))
    })
    for (const child of children) {
      if (child.child.exitCode === null && child.child.signalCode === null)
        child.child.kill('SIGKILL')
      await child.record().catch((error: unknown) => {
        cleanupErrors.push(String(error))
      })
    }
    for (const worker of workers) {
      await worker.claimExecutions?.stopAndDrain().catch((error: unknown) => {
        cleanupErrors.push(String(error))
      })
      await worker.pool.end().catch((error: unknown) => {
        cleanupErrors.push(String(error))
      })
    }
    await Promise.all(
      pools.map((pool) =>
        pool.end().catch((error: unknown) => {
          cleanupErrors.push(String(error))
        })
      )
    )
    if (schemaCreated)
      await admin
        .query(`DROP SCHEMA ${schema} CASCADE`)
        .catch((error: unknown) => {
          cleanupErrors.push(String(error))
        })
    for (const role of roles)
      await admin.query(`DROP ROLE ${role}`).catch((error: unknown) => {
        cleanupErrors.push(String(error))
      })
    try {
      proof.remainingResources = await admin
        .query(
          `SELECT (SELECT count(*)::int FROM pg_namespace WHERE nspname=$1) AS schemas,
        (SELECT count(*)::int FROM pg_roles WHERE rolname=ANY($2::text[])) AS roles,
        (SELECT count(*)::int FROM pg_stat_activity WHERE usename=ANY($2::text[])) AS sessions`,
          [schema, roles]
        )
        .then((result) => first(result.rows))
      const remaining = proof.remainingResources as {
        schemas: number
        roles: number
        sessions: number
      }
      if (
        remaining.schemas !== 0 ||
        remaining.roles !== 0 ||
        remaining.sessions !== 0
      )
        cleanupErrors.push('Own schema/role/session cleanup is incomplete')
    } catch (error) {
      cleanupErrors.push(String(error))
    }
    await admin.end().catch((error: unknown) => {
      cleanupErrors.push(String(error))
    })
    proof.sourceAfter = await provenance()
    proof.cleanup = cleanupErrors.length
      ? { status: 'FAIL', errors: cleanupErrors }
      : 'PASS'
    await save()
    if (!failure && cleanupErrors.length)
      failure = new Error(`Own PG cleanup failed: ${cleanupErrors.join('; ')}`)
  }
  if (failure) throw failure

  async function select<T extends QueryResultRow = Row>(
    sql: string,
    values: unknown[] = []
  ): Promise<T[]> {
    const result = await admin.query<T>(sql, values)
    queries.push({ sql, values, rows: result.rows })
    return result.rows
  }
  function createWorker(extra: Record<string, string | undefined> = {}) {
    const worker = createPostgresControlledWorker({ ...env, ...extra })
    observeQueries(worker.pool, workerRole, proof.nativeQueries as Row[])
    workers.push(worker)
    return worker
  }
  async function launchProcess(
    label: string,
    eventId: string,
    stopAt?: CompletionCut
  ) {
    const config = (proof.handshake as { config: unknown }).config
    const child = await launchWorkerProcess({
      directory: resolve(outputPath!, schema, label),
      env,
      config,
      eventId,
      ...(stopAt ? { stopAt } : {})
    })
    children.push(child)
    return child
  }
  async function snapshot() {
    const s = schema
    const outbox = await select(
      `SELECT *,xmin::text AS write_xid FROM ${s}.outbox_events ORDER BY created_at`
    )
    const attempts = await select(
      `SELECT *,xmin::text AS write_xid FROM ${s}.outbox_attempts ORDER BY id`
    )
    const effects = await select(
      `SELECT *,xmin::text AS write_xid FROM ${s}.outbox_effects ORDER BY applied_at`
    )
    const bindings = await select(
      `SELECT *,xmin::text AS write_xid FROM ${s}.controlled_published_bindings ORDER BY created_at`
    )
    const evidence = await select(
      `SELECT *,xmin::text AS write_xid FROM ${s}.controlled_published_evidence ORDER BY sequence`
    )
    const executions = await select(
      `SELECT *,xmin::text AS write_xid FROM ${s}.operational_executions ORDER BY created_at`
    )
    const journal = await select(
      `SELECT *,xmin::text AS write_xid FROM ${s}.operational_effect_journal ORDER BY created_at`
    )
    const messages = await select(
      `SELECT *,xmin::text AS write_xid FROM ${s}.messages ORDER BY created_at`
    )
    const traces = await select(
      `SELECT *,xmin::text AS write_xid FROM ${s}.platform_execution_traces ORDER BY created_at`
    )
    const audits = await select(
      `SELECT *,xmin::text AS write_xid FROM ${s}.audit_events ORDER BY created_at`
    )
    const testRuns = await select(
      `SELECT count(*)::int AS count FROM ${s}.platform_test_runs`
    )
    return {
      outbox,
      attempts,
      effects,
      bindings,
      evidence,
      executions,
      journal,
      messages,
      traces,
      audits,
      testRuns
    }
  }
  async function ingress() {
    const body = {
      senderRef: `synthetic-${randomUUID()}`,
      externalMessageId: `synthetic217-${randomUUID()}`,
      body: 'Quero uma consulta',
      receivedAt: new Date().toISOString()
    }
    const input = {
      eventId: `signed217-${randomUUID()}`,
      timestampSeconds: Math.floor(Date.now() / 1000),
      channel: 'web',
      body,
      rawBody: JSON.stringify(body)
    }
    const signature = createWebhookSignature(secret, input)
    const headers = {
      'content-type': 'application/json',
      'x-cvg-webhook-id': input.eventId,
      'x-cvg-webhook-timestamp': String(input.timestampSeconds),
      'x-cvg-webhook-signature': signature
    }
    const unauthenticated = await app!.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: input.rawBody,
      headers: {
        ...headers,
        'x-cvg-webhook-signature': 'invalid-synthetic-signature'
      }
    })
    expect(unauthenticated.statusCode).toBe(401)
    expect(
      await select(`SELECT count(*)::int AS count FROM ${schema}.outbox_events`)
    ).toEqual([{ count: 0 }])
    const response = await app!.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: input.rawBody,
      headers
    })
    const json = response.json<{
      data: {
        messageId: string
        conversationId: string
        sessionId: string
        outbox: { id: string; status: string }
      }
    }>()
    proof.ingress = {
      input,
      signatureSHA256: sha(signature),
      unauthenticatedStatus: unauthenticated.statusCode,
      status: response.statusCode,
      response: json
    }
    expect(response.statusCode, JSON.stringify(json)).toBe(200)
    expect(json.data.outbox.status).toBe('pending')
    const replay = await app!.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: input.rawBody,
      headers
    })
    expect(replay.statusCode).toBe(401)
    return json.data
  }
}

interface Fixture {
  schema: string
  workerRole: string
  proof: Record<string, unknown>
  select: <T extends QueryResultRow = Row>(
    sql: string,
    values?: unknown[]
  ) => Promise<T[]>
  snapshot: () => Promise<{
    outbox: Row[]
    attempts: Row[]
    effects: Row[]
    bindings: Row[]
    evidence: Row[]
    executions: Row[]
    journal: Row[]
    messages: Row[]
    traces: Row[]
    audits: Row[]
    testRuns: Row[]
  }>
  env: Record<string, string>
  createWorker: (
    extra?: Record<string, string | undefined>
  ) => PostgresControlledWorkerRuntime
  launchProcess: (
    label: string,
    eventId: string,
    stopAt?: CompletionCut
  ) => Promise<Awaited<ReturnType<typeof launchWorkerProcess>>>
  ingress: () => Promise<{
    messageId: string
    conversationId: string
    sessionId: string
    outbox: { id: string; status: string }
  }>
}

describe.skipIf(!resourcePath)(
  'SPEC217 actual signed API -> serving worker -> native fenced ACK -> durable public facade',
  () => {
    it('K01 follows actual durable ingress and commits one tool mirror, completion and outer ACK', async () => {
      await fixture('k01', async (f) => {
        const queued = await f.ingress()
        const initial = await f.snapshot()
        f.proof.beforeWorker = initial
        expect(initial.outbox).toHaveLength(1)
        expect(initial.bindings).toHaveLength(0)
        expect(initial.executions).toHaveLength(0)
        expect(initial.attempts).toHaveLength(0)
        expect(initial.effects).toHaveLength(0)
        expect(initial.traces).toHaveLength(0)
        const worker = f.createWorker()
        expect(worker.claimExecutions).toBeDefined()
        expect(worker.pool.options.max).toBe(4)
        expect(worker.pool.options.connectionTimeoutMillis).toBe(1000)
        f.proof.servingRole = await withTenantContext(
          worker.pool,
          tenantId,
          async (client) =>
            client
              .query(
                `SELECT current_user AS role,pg_backend_pid() AS pid,clock_timestamp() AS db_now,r.rolsuper,r.rolbypassrls,
          r.rolcreatedb,r.rolcreaterole,has_schema_privilege(current_user,current_schema(),'CREATE') AS schema_create,
          (SELECT pg_get_userbyid(c.relowner)<>current_user FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname=current_schema() AND c.relname='controlled_published_bindings') AS nonowner
          FROM pg_roles r WHERE r.rolname=current_user`
              )
              .then((result) => result.rows)
        )
        expect(first(f.proof.servingRole as Row[])).toMatchObject({
          role: f.workerRole,
          rolsuper: false,
          rolbypassrls: false,
          rolcreatedb: false,
          rolcreaterole: false,
          schema_create: false,
          nonowner: true
        })
        const migrationBefore = await f.select(
          `SELECT version,checksum FROM ${f.schema}.schema_migrations ORDER BY version`
        )
        f.proof.catalogPolicies = await f.select(
          `SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname=$1 ORDER BY tablename,policyname`,
          [f.schema]
        )
        await assertPublishedPostgresWorkerPreflight({
          ...worker,
          claimExecutions: worker.claimExecutions!
        })
        expect(
          await f.select(
            `SELECT version,checksum FROM ${f.schema}.schema_migrations ORDER BY version`
          )
        ).toEqual(migrationBefore)
        const result = await worker.worker.processNext(queued.outbox.id)
        const final = await f.snapshot()
        f.proof.workerResult = result
        f.proof.afterWorker = final
        expect(
          result,
          JSON.stringify({
            result,
            lastError: final.outbox[0]?.last_error,
            bindings: final.bindings
          })
        ).toMatchObject({ status: 'processed' })
        expect(final.bindings).toHaveLength(1)
        expect(final.executions).toHaveLength(1)
        expect(final.attempts).toHaveLength(1)
        expect(final.effects).toHaveLength(1)
        const binding = first(final.bindings),
          outer = first(final.outbox),
          attempt = first(final.attempts),
          marker = first(final.effects)
        expect(binding).toMatchObject({
          phase_state: 'CLOSED',
          dispatch_closed: true,
          outbox_id: queued.outbox.id,
          inbound_message_id: queued.messageId,
          active_outer_worker_id: worker.workerId
        })
        expect(first(final.executions)).toMatchObject({
          state: 'SUCCEEDED',
          id: binding.execution_id,
          attempt: 1
        })
        expect(outer).toMatchObject({ status: 'processed', attempts: 1 })
        expect(attempt).toMatchObject({
          outcome: 'processed',
          worker_id: worker.workerId,
          attempt: 1
        })
        expect(String(binding.active_outer_attempt_row_id)).toBe(
          String(attempt.id)
        )
        expect(marker.event_id).toBe(outer.id)
        expect(marker.write_xid).toBe(outer.write_xid)
        expect(binding.write_xid).not.toBe(outer.write_xid)
        expect(
          Number(new Date(String(binding.expires_at)).getTime()) -
            new Date(String(binding.started_at)).getTime()
        ).toBe(60_000)
        expect(final.journal).toHaveLength(1)
        expect(first(final.journal)).toMatchObject({
          state: 'CONFIRMED',
          operation_key: `${binding.execution_id}:s2:find_available_slots`
        })
        expect(final.traces).toHaveLength(1)
        expect(first(final.testRuns).count).toBe(0)
        const trace = first(final.traces).trace as TestRunTrace
        expect(trace).toMatchObject({
          traceId: binding.trace_id,
          tenantId,
          conversationId: queued.conversationId,
          sessionId: queued.sessionId,
          status: 'completed',
          provider: { externalCall: false },
          knowledge: { status: 'not_requested' },
          tools: [{ name: 'find_available_slots', status: 'succeeded' }]
        })
        expect(binding.closed_trace).toEqual(trace)
        expect(binding.runtime_result).toMatchObject({
          stopReason: 'COMPLETED',
          modelCalls: 1,
          toolCalls: 1
        })
        const callbacks = final.evidence.filter(
          (row) => row.event_type === 'callback.tool'
        )
        const modelIntents = final.evidence.filter(
          (row) =>
            row.event_type === 'phase.intent' &&
            (row.canonical_payload as Row).phaseType === 'model.request'
        )
        expect(modelIntents).toHaveLength(1)
        expect(callbacks).toHaveLength(1)
        const receipt = first(callbacks).canonical_payload as {
          mirrorAuditId: string
          event: { traceId: string; correlationId: string }
        }
        const toolAudits = final.audits.filter(
          (row) => row.type === 'tool_call'
        )
        expect(toolAudits).toHaveLength(1)
        expect(first(toolAudits).id).toBe(receipt.mirrorAuditId)
        expect(first(toolAudits).write_xid).toBe(first(callbacks).write_xid)
        expect(receipt.event).toMatchObject({
          traceId: binding.trace_id,
          correlationId: binding.correlation_id
        })
        expect(outer.correlation_id).toBe(binding.correlation_id)
        const inbound = final.messages.filter(
          (row) => row.direction === 'inbound'
        )
        const outbound = final.messages.filter(
          (row) => row.direction === 'outbound'
        )
        expect(inbound).toHaveLength(1)
        expect(first(inbound).runtime_status).toBe('completed')
        expect(outbound).toHaveLength(1)
        expect(first(outbound).external_message_id).toBe(
          `runtime:${binding.trace_id}`
        )
        expect(first(final.traces).write_xid).toBe(first(inbound).write_xid)
        f.proof.linearization = {
          outerFinalAckXid: outer.write_xid,
          effectMarkerXid: marker.write_xid,
          innerCloseXid: binding.write_xid,
          completionXid: first(inbound).write_xid,
          toolMirrorXid: first(toolAudits).write_xid,
          callbackEvidenceXid: first(callbacks).write_xid
        }
        await expect(
          worker.worker.processNext(queued.outbox.id)
        ).resolves.toBeNull()
      })
    }, 120_000)

    it('K02 SIGKILL after committed S1 resumes by ordinary native claim within the original deadline', async () => {
      await fixture('k02-s1', async (f) => {
        const queued = await f.ingress()
        const a = await f.launchProcess(
          'process-a',
          queued.outbox.id,
          'AFTER_S1_COMMIT'
        )
        const ready = await a.awaitPoint('AFTER_S1_COMMIT')
        f.proof.childAReady = ready
        expect(ready.counts).toEqual({
          model: 1,
          plan: 1,
          inputParse: 1,
          body: 0
        })
        const before = await f.snapshot()
        f.proof.beforeKill = before
        expect(before.bindings).toHaveLength(1)
        expect(before.executions).toHaveLength(1)
        const binding = first(before.bindings)
        const inner = first(before.executions)
        const state = binding.state as Row
        const checkpoint = binding.sealed_checkpoint as Row
        const command = first(state.attempts as Row[])
        expect(binding).toMatchObject({
          phase_state: 'IDLE_SEALED',
          dispatch_closed: false,
          fault: null,
          active_outer_worker_id: ready.workerId,
          active_outer_attempt: 1,
          consumed_seal_id: null,
          open_phase_id: null,
          outbox_id: queued.outbox.id,
          inbound_message_id: queued.messageId
        })
        expect(ready.seal).toMatchObject({
          sealId: binding.seal_id,
          stateRevision: 1
        })
        expect(state).toMatchObject({
          safePoint: 'S1',
          planSealed: true,
          planOutcome: 'ready',
          expectedStep: 2,
          nextPlannerStep: 2,
          providerInvoked: true,
          finalIssued: false,
          dispatchClosed: false,
          fault: null,
          stop: null,
          executionId: binding.execution_id,
          traceId: binding.trace_id,
          requestDigest: binding.request_digest,
          expiresAt: new Date(milliseconds(binding.expires_at)).toISOString(),
          budgetUsage: { modelCalls: 1, toolCalls: 0 }
        })
        expect(checkpoint).toMatchObject({
          executionId: binding.execution_id,
          stepNumber: 1,
          budgetUsage: state.budgetUsage
        })
        // S1 carries the prepared command; step2 assigns the deterministic journal key.
        const operationKey = `${binding.execution_id}:s${Number(checkpoint.stepNumber) + 1}:find_available_slots`
        expect(command).toMatchObject({ phase: 'PENDING', attempted: false })
        expect(inner).toMatchObject({
          id: binding.execution_id,
          state: 'RUNNING',
          attempt: 1,
          lease_owner: ready.workerId
        })
        expect(before.journal).toHaveLength(0)
        expect(before.effects).toHaveLength(0)
        expect(before.traces).toHaveLength(0)
        expect(
          before.messages.filter((row) => row.direction === 'outbound')
        ).toHaveLength(0)
        expect(
          before.evidence.filter((row) => row.event_type === 'callback.tool')
        ).toHaveLength(0)
        expect(
          before.evidence.filter((row) => row.event_type === 'resume.sealed')
        ).toHaveLength(1)
        expect(first(before.outbox)).toMatchObject({
          status: 'processing',
          attempts: 1,
          lease_owner: ready.workerId,
          processed_at: null
        })
        const checkpointRows = await f.select(
          `SELECT *,xmin::text AS write_xid FROM ${f.schema}.operational_execution_checkpoints`
        )
        f.proof.s1Checkpoints = checkpointRows
        expect(checkpointRows).toHaveLength(1)
        expect(first(checkpointRows)).toMatchObject({
          execution_id: binding.execution_id,
          step_number: 1,
          digest: checkpoint.digest,
          budget_usage: state.budgetUsage
        })
        expect(first(checkpointRows).write_xid).toBe(binding.write_xid)
        const killedAt = new Date().toISOString()
        expect(
          Date.parse(killedAt) - Date.parse(String(ready.at))
        ).toBeLessThan(5_000)
        expect(a.child.kill('SIGKILL')).toBe(true)
        const exitA = await a.record()
        expect(exitA).toEqual({ code: null, signal: 'SIGKILL' })
        f.proof.kill = {
          pid: a.child.pid,
          readyAt: ready.at,
          killedAt,
          exit: exitA
        }
        const clockSql = `SELECT clock_timestamp() AS db_now,o.lease_until AS outer_until,e.lease_until AS inner_until,q.lease_until AS queue_until,
          o.lease_owner AS outer_owner,e.lease_owner AS inner_owner,q.lease_owner AS queue_owner,b.expires_at
          FROM ${f.schema}.outbox_events o JOIN ${f.schema}.controlled_published_bindings b ON b.outbox_id=o.id AND b.tenant_id=o.tenant_id
          JOIN ${f.schema}.operational_executions e ON e.id=b.execution_id AND e.tenant_id=b.tenant_id
          JOIN ${f.schema}.operational_execution_outbox q ON q.execution_id=e.id AND q.tenant_id=e.tenant_id WHERE o.tenant_id=$1 AND o.id=$2`
        const clock = first(
          await f.select(clockSql, [tenantId, queued.outbox.id])
        )
        for (const key of ['outer_until', 'inner_until', 'queue_until']) {
          expect(
            milliseconds(clock[key]) - milliseconds(clock.db_now)
          ).toBeGreaterThan(0)
          expect(
            milliseconds(clock[key]) - milliseconds(clock.db_now)
          ).toBeLessThanOrEqual(10_000)
        }
        expect(clock).toMatchObject({
          outer_owner: ready.workerId,
          inner_owner: ready.workerId,
          queue_owner: ready.workerId
        })
        const remaining =
          Math.max(
            ...['outer_until', 'inner_until', 'queue_until'].map((key) =>
              milliseconds(clock[key])
            )
          ) - milliseconds(clock.db_now)
        const delay = Math.max(10_050, remaining + 150)
        const waitStartedAt = new Date().toISOString()
        await new Promise((resolve) => setTimeout(resolve, delay))
        const expired = first(
          await f.select(clockSql, [tenantId, queued.outbox.id])
        )
        for (const key of ['outer_until', 'inner_until', 'queue_until'])
          expect(milliseconds(expired.db_now)).toBeGreaterThan(
            milliseconds(expired[key])
          )
        expect(
          milliseconds(expired.db_now) - milliseconds(clock.db_now)
        ).toBeGreaterThanOrEqual(10_000)
        expect(milliseconds(expired.db_now)).toBeLessThan(
          milliseconds(binding.expires_at)
        )
        f.proof.realExpiry = {
          beforeWait: clock,
          afterWait: expired,
          requestedDelayMs: delay,
          waitStartedAt,
          waitFinishedAt: new Date().toISOString()
        }
        const b = await f.launchProcess('process-b', queued.outbox.id)
        const resumed = await b.awaitPoint('RESULT')
        const exitB = await b.record()
        f.proof.childBResult = resumed
        f.proof.childBExit = exitB
        expect(exitB).toEqual({ code: 0, signal: null })
        expect(resumed.pid).not.toBe(ready.pid)
        expect(resumed.workerId).not.toBe(ready.workerId)
        for (const id of [ready.workerId, resumed.workerId])
          expect(String(id)).toMatch(/^pare217_b_k02-s1:[a-f0-9-]{36}$/)
        expect(resumed.result).toMatchObject({ status: 'processed' })
        expect(resumed.counts).toEqual({
          model: 0,
          plan: 0,
          inputParse: 0,
          body: 1
        })
        expect(resumed.completionCalls).toBe(1)
        const after = await f.snapshot()
        f.proof.afterRecovery = after
        const finalBinding = first(after.bindings)
        const outer = first(after.outbox)
        const finalInner = first(after.executions)
        const finalClock = first(
          await f.select('SELECT clock_timestamp() AS db_now')
        )
        f.proof.finishedClock = finalClock
        expect(milliseconds(finalClock.db_now)).toBeLessThan(
          milliseconds(binding.expires_at)
        )
        for (const key of [
          'tenant_id',
          'execution_id',
          'trace_id',
          'correlation_id',
          'request_digest',
          'capability_fingerprint',
          'prepared_digest',
          'agent_id',
          'version_id',
          'inbound_message_id',
          'conversation_id',
          'session_id',
          'outbox_id',
          'started_at',
          'expires_at',
          'admission_input',
          'admission_runtime',
          'prepared_runtime',
          'prepared'
        ])
          expect(finalBinding[key], key).toEqual(binding[key])
        expect(
          milliseconds(finalBinding.expires_at) -
            milliseconds(finalBinding.started_at)
        ).toBe(60_000)
        expect(after.bindings).toHaveLength(1)
        expect(after.executions).toHaveLength(1)
        expect(finalBinding).toMatchObject({
          phase_state: 'CLOSED',
          dispatch_closed: true,
          active_outer_attempt: 2,
          active_outer_worker_id: resumed.workerId
        })
        expect(finalInner).toMatchObject({
          id: inner.id,
          state: 'SUCCEEDED',
          attempt: 2
        })
        expect(finalBinding.runtime_result).toMatchObject({
          stopReason: 'COMPLETED',
          modelCalls: 1,
          toolCalls: 1
        })
        const finalState = finalBinding.state as Row
        expect(finalState.budgetUsage).toMatchObject({
          modelCalls: 1,
          toolCalls: 1
        })
        expect((finalState.budgetUsage as Row).steps).toBeGreaterThanOrEqual(
          Number((state.budgetUsage as Row).steps)
        )
        for (const [key, value] of Object.entries(state.budgetUsage as Row)) {
          if (!['steps', 'toolCalls', 'activeDurationMs'].includes(key))
            expect((finalState.budgetUsage as Row)[key], key).toEqual(value)
        }
        expect((finalState.budgetUsage as Row).steps).toBe(3)
        expect(
          Number((finalState.budgetUsage as Row).activeDurationMs)
        ).toBeGreaterThanOrEqual(
          Number((state.budgetUsage as Row).activeDurationMs)
        )
        expect(finalInner.request).toEqual(inner.request)
        expect(finalInner.request_hash).toBe(inner.request_hash)
        expect(finalInner.idempotency_key).toBe(inner.idempotency_key)
        const finalCommand = first(finalState.attempts as Row[])
        expect(finalCommand.operationKey).toBe(operationKey)
        const { output, ...recoveredCommand } = finalCommand.command as Row
        expect(recoveredCommand).toEqual(command.command)
        expect(output).toMatchObject({ status: 'succeeded' })
        expect(after.evidence.slice(0, before.evidence.length)).toEqual(
          before.evidence
        )
        expect(
          after.evidence.filter(
            (row) =>
              row.event_type === 'phase.intent' &&
              (row.canonical_payload as Row).phaseType === 'model.request'
          )
        ).toHaveLength(1)
        expect(
          after.evidence.filter(
            (row) =>
              row.event_type === 'phase.intent' &&
              (row.canonical_payload as Row).phaseType === 'plan.seal'
          )
        ).toHaveLength(1)
        expect(after.journal).toHaveLength(1)
        expect(first(after.journal)).toMatchObject({
          tenant_id: tenantId,
          operation_key: operationKey,
          state: 'CONFIRMED'
        })
        const callbacks = after.evidence.filter(
          (row) => row.event_type === 'callback.tool'
        )
        const toolAudits = after.audits.filter(
          (row) => row.type === 'tool_call'
        )
        expect(callbacks).toHaveLength(1)
        expect(toolAudits).toHaveLength(1)
        const receipt = first(callbacks).canonical_payload as Row
        expect(receipt.mirrorAuditId).toBe(first(toolAudits).id)
        expect(first(callbacks).write_xid).toBe(first(toolAudits).write_xid)
        expect(receipt.event).toMatchObject({
          traceId: binding.trace_id,
          correlationId: binding.correlation_id
        })
        expect(after.traces).toHaveLength(1)
        const trace = first(after.traces).trace as TestRunTrace
        expect(trace).toEqual(finalBinding.closed_trace)
        expect(trace).toMatchObject({
          traceId: binding.trace_id,
          tenantId,
          conversationId: queued.conversationId,
          sessionId: queued.sessionId,
          status: 'completed',
          provider: { externalCall: false },
          tools: [{ name: 'find_available_slots', status: 'succeeded' }]
        })
        const completion = first(
          b.messages.filter((message) => message.point === 'COMPLETION_ENTER')
        )
        expect((completion.input as Row).toolAuditEvents).toEqual([])
        expect((completion.input as Row).trace).toEqual(trace)
        const inbound = first(
          after.messages.filter((row) => row.direction === 'inbound')
        )
        const outbound = after.messages.filter(
          (row) => row.direction === 'outbound'
        )
        expect(after.messages).toHaveLength(2)
        expect(inbound).toMatchObject({
          id: queued.messageId,
          runtime_status: 'completed'
        })
        expect(outbound).toHaveLength(1)
        expect(first(outbound).external_message_id).toBe(
          `runtime:${binding.trace_id}`
        )
        expect(first(outbound).write_xid).toBe(inbound.write_xid)
        expect(first(after.traces).write_xid).toBe(inbound.write_xid)
        expect(after.effects).toHaveLength(1)
        expect(first(after.effects).event_id).toBe(queued.outbox.id)
        expect(first(after.effects).write_xid).toBe(outer.write_xid)
        expect(outer).toMatchObject({
          id: queued.outbox.id,
          status: 'processed',
          attempts: 2,
          lease_owner: null
        })
        expect(after.attempts).toHaveLength(2)
        const processed = after.attempts.filter(
          (row) => row.outcome === 'processed'
        )
        expect(processed).toHaveLength(1)
        expect(first(processed)).toMatchObject({
          worker_id: resumed.workerId,
          attempt: 2
        })
        expect(first(processed).write_xid).toBe(outer.write_xid)
        expect(String(finalBinding.active_outer_attempt_row_id)).toBe(
          String(first(processed).id)
        )
        expect(first(after.testRuns).count).toBe(0)
        f.proof.recovery = {
          originalExecutionId: inner.id,
          originalTraceId: binding.trace_id,
          originalDeadline: binding.expires_at,
          originalOperationKey: operationKey,
          s1Budget: state.budgetUsage,
          finalBudget: finalState.budgetUsage,
          processA: {
            pid: ready.pid,
            workerId: ready.workerId,
            counts: ready.counts
          },
          processB: {
            pid: resumed.pid,
            workerId: resumed.workerId,
            counts: resumed.counts
          },
          completionXid: inbound.write_xid,
          finalAckXid: outer.write_xid,
          effectMarkerXid: first(after.effects).write_xid
        }
      })
    }, 120_000)

    it('K11 bounded default-off compatibility and strict unsupported/production refusal leave the bound store untouched', async () => {
      await fixture('k11', async (f) => {
        const queued = await f.ingress()
        const before = await f.snapshot()
        expect(() =>
          f.createWorker({ CVG_WORKER_PUBLISHED_DURABILITY: 'unknown-v2' })
        ).toThrow()
        expect(() =>
          f.createWorker({
            NODE_ENV: 'production',
            CVG_WORKER_PRODUCTION_ENABLED: 'true'
          })
        ).toThrow()
        expect(await f.snapshot()).toEqual(before)
        const worker = f.createWorker({
          CVG_WORKER_PUBLISHED_DURABILITY: undefined
        })
        expect(worker.claimExecutions).toBeUndefined()
        expect(worker.workerId).toBe('pare217_b_k11')
        await assertPostgresWorkerPreflight(worker.pool, { tenantId })
        const result = await worker.worker.processNext(queued.outbox.id)
        const after = await f.snapshot()
        f.proof.workerResult = result
        f.proof.afterWorker = after
        expect(result).toMatchObject({ status: 'processed' })
        expect(after.bindings).toHaveLength(0)
        expect(after.evidence).toHaveLength(0)
        expect(after.executions).toHaveLength(0)
        expect(after.effects).toHaveLength(1)
        expect(after.traces).toHaveLength(1)
        expect(
          after.audits.filter((row) => row.type === 'tool_call')
        ).toHaveLength(1)
        expect(
          (first(after.traces).trace as TestRunTrace).provider.externalCall
        ).toBe(false)
      })
    }, 120_000)

    for (const cut of [
      'BEFORE_COMPLETION',
      'AFTER_COMPLETION_COMMIT'
    ] as const) {
      it(`K03 SIGKILL ${cut} resumes the actual native worker after real outer expiry without reopening S3`, async () => {
        await fixture(`k03-${cut.toLowerCase()}`, async (f) => {
          if (
            !resolve(outputPath!).endsWith(
              '/spec217-build/lane-b-worker-process'
            )
          ) {
            throw new Error(
              'K03 requires its assigned lane-b-worker-process evidence directory'
            )
          }
          const queued = await f.ingress()
          const a = await f.launchProcess('process-a', queued.outbox.id, cut)
          const ready = await a.awaitPoint(cut)
          f.proof.childAReady = ready
          const before = await f.snapshot()
          f.proof.beforeKill = before
          const binding = first(before.bindings)
          const inner = first(before.executions)
          expect(binding).toMatchObject({
            phase_state: 'CLOSED',
            dispatch_closed: true,
            active_outer_worker_id: ready.workerId,
            active_outer_attempt: 1
          })
          expect(inner).toMatchObject({ state: 'SUCCEEDED', attempt: 1 })
          expect(binding.runtime_result).toMatchObject({
            stopReason: 'COMPLETED',
            modelCalls: 1,
            toolCalls: 1
          })
          expect(ready.counts).toEqual({
            model: 1,
            plan: 1,
            inputParse: 1,
            body: 1
          })
          expect((ready.input as Row).toolAuditEvents).toEqual([])
          expect((ready.input as Row).trace).toEqual(binding.closed_trace)
          expect(before.journal).toHaveLength(1)
          expect(first(before.journal).state).toBe('CONFIRMED')
          expect(
            before.audits.filter((row) => row.type === 'tool_call')
          ).toHaveLength(1)
          expect(before.effects).toHaveLength(0)
          expect(first(before.outbox)).toMatchObject({
            status: 'processing',
            attempts: 1,
            lease_owner: ready.workerId,
            processed_at: null
          })
          expect(first(before.testRuns).count).toBe(0)
          const completed = cut === 'AFTER_COMPLETION_COMMIT'
          const inboundBefore = first(
            before.messages.filter((row) => row.direction === 'inbound')
          )
          expect(inboundBefore.runtime_status).toBe(
            completed ? 'completed' : 'pending'
          )
          expect(before.traces).toHaveLength(completed ? 1 : 0)
          expect(
            before.messages.filter((row) => row.direction === 'outbound')
          ).toHaveLength(completed ? 1 : 0)
          const killedAt = new Date().toISOString()
          const readyToKillMs =
            Date.parse(killedAt) - Date.parse(String(ready.at))
          expect(readyToKillMs).toBeLessThan(5_000)
          expect(a.child.kill('SIGKILL')).toBe(true)
          const exitA = await a.record()
          expect(exitA).toEqual({ code: null, signal: 'SIGKILL' })
          f.proof.kill = {
            pid: a.child.pid,
            readyAt: ready.at,
            killedAt,
            readyToKillMs,
            exit: exitA
          }
          const clock = first(
            await f.select(
              `SELECT clock_timestamp() AS db_now,lease_until,lease_owner,status,attempts FROM ${f.schema}.outbox_events WHERE tenant_id=$1 AND id=$2`,
              [tenantId, queued.outbox.id]
            )
          )
          const remaining =
            milliseconds(clock.lease_until) - milliseconds(clock.db_now)
          expect(remaining).toBeGreaterThan(0)
          expect(remaining).toBeLessThanOrEqual(10_000)
          // Wait at least a real 10s after the kill. No SQL expiry mutation or fake timers.
          const delay = Math.max(10_050, remaining + 150)
          const waitStartedAt = new Date().toISOString()
          await new Promise((resolve) => setTimeout(resolve, delay))
          const expired = first(
            await f.select(
              `SELECT clock_timestamp() AS db_now,lease_until,lease_owner,status,attempts FROM ${f.schema}.outbox_events WHERE tenant_id=$1 AND id=$2`,
              [tenantId, queued.outbox.id]
            )
          )
          expect(milliseconds(expired.db_now)).toBeGreaterThan(
            milliseconds(expired.lease_until)
          )
          expect(
            milliseconds(expired.db_now) - milliseconds(clock.db_now)
          ).toBeGreaterThanOrEqual(10_000)
          f.proof.realExpiry = {
            beforeWait: clock,
            afterWait: expired,
            remainingMs: remaining,
            requestedDelayMs: delay,
            waitStartedAt,
            waitFinishedAt: new Date().toISOString()
          }
          const b = await f.launchProcess('process-b', queued.outbox.id)
          const resumed = await b.awaitPoint('RESULT')
          const exitB = await b.record()
          f.proof.childBResult = resumed
          f.proof.childBExit = exitB
          expect(exitB).toEqual({ code: 0, signal: null })
          expect(resumed.pid).not.toBe(ready.pid)
          expect(resumed.workerId).not.toBe(ready.workerId)
          expect(resumed.result).toMatchObject({ status: 'processed' })
          expect(resumed.counts).toEqual({
            model: 0,
            plan: 0,
            inputParse: 0,
            body: 0
          })
          expect(resumed.completionCalls).toBe(completed ? 0 : 1)
          if (!completed) {
            const replayCompletion = first(
              b.messages.filter(
                (message) => message.point === 'COMPLETION_ENTER'
              )
            )
            expect((replayCompletion.input as Row).toolAuditEvents).toEqual([])
            expect((replayCompletion.input as Row).trace).toEqual(
              binding.closed_trace
            )
          } else {
            expect(
              b.messages.some((message) => message.point === 'COMPLETION_ENTER')
            ).toBe(false)
          }
          const after = await f.snapshot()
          f.proof.afterRecovery = after
          expect(first(after.outbox)).toMatchObject({
            status: 'processed',
            attempts: 2,
            lease_owner: null
          })
          expect(after.attempts).toHaveLength(2)
          expect(
            after.attempts.filter((row) => row.outcome === 'processed')
          ).toHaveLength(1)
          expect(
            first(after.attempts.filter((row) => row.outcome === 'processed'))
          ).toMatchObject({
            worker_id: resumed.workerId,
            attempt: 2
          })
          expect(after.effects).toHaveLength(1)
          expect(first(after.effects).write_xid).toBe(
            first(after.outbox).write_xid
          )
          expect(after.bindings).toEqual(before.bindings)
          expect(after.executions).toEqual(before.executions)
          expect(after.journal).toEqual(before.journal)
          expect(after.evidence).toEqual(before.evidence)
          const finalBinding = first(after.bindings)
          expect(finalBinding.expires_at).toEqual(binding.expires_at)
          expect(
            milliseconds(finalBinding.expires_at) -
              milliseconds(finalBinding.started_at)
          ).toBe(60_000)
          expect(after.traces).toHaveLength(1)
          expect(first(after.traces).trace).toEqual(binding.closed_trace)
          expect(
            after.audits.filter((row) => row.type === 'tool_call')
          ).toEqual(before.audits.filter((row) => row.type === 'tool_call'))
          const outbound = after.messages.filter(
            (row) => row.direction === 'outbound'
          )
          expect(outbound).toHaveLength(1)
          expect(first(outbound).external_message_id).toBe(
            `runtime:${binding.trace_id}`
          )
          expect(
            first(after.messages.filter((row) => row.direction === 'inbound'))
              .runtime_status
          ).toBe('completed')
          expect(first(after.testRuns).count).toBe(0)
          if (completed) {
            expect(after.traces).toEqual(before.traces)
            expect(after.messages).toEqual(before.messages)
          }
          f.proof.recovery = {
            originalExecutionId: inner.id,
            originalTraceId: binding.trace_id,
            originalDeadline: binding.expires_at,
            unchangedInnerAttempt: inner.attempt,
            processA: {
              pid: ready.pid,
              workerId: ready.workerId,
              counts: ready.counts
            },
            processB: {
              pid: resumed.pid,
              workerId: resumed.workerId,
              counts: resumed.counts
            },
            finalAckXid: first(after.outbox).write_xid,
            effectMarkerXid: first(after.effects).write_xid,
            beforeCompletionCommitted: completed,
            completionCallsOnB: resumed.completionCalls
          }
        })
      }, 120_000)
    }
  }
)
