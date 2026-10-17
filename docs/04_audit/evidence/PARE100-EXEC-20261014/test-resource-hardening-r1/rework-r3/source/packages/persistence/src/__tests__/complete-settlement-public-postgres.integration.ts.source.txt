import {
  inspectCompleteResource,
  assignedResource,
  ownedPath
} from './fixtures/complete-process-support.ts'
/** SPEC217/224 synthetic settlement containment; trusted prepared fixture, not consumer lifecycle. */
import { appendFileSync } from 'node:fs'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Client, Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canonicalizeCompleteJson,
  type DecisionInputCounter,
  type DecisionAdmissionPort,
  type DecisionAdmissionSettlement,
  type DecisionAdmissionReserveInput,
  type IterativeOrchestrator,
  type ModelRequest,
  type ModelResult,
  type ExecutionCheckpoint,
  type ModelGateway
} from '@cvg/harness-contracts'
import { HybridOrchestrator } from '@cvg/harness-orchestrator'
import {
  createCapabilityRegistry,
  createOperationalHarness
} from '../../../harness/src/index.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine
} from '../../../harness/src/__tests__/fixtures/phase3-fixtures.ts'
import {
  AgentConfigSchema,
  DeterministicModelProvider,
  InMemoryControlPlaneStore,
  TenantIdSchema,
  controlledDigest,
  createControlledCapabilityGateway,
  createTraceId,
  prepareControlledPublishedAdmission,
  type ControlledPublishedPrepared
} from '@cvg/platform'
import { createCorrelationId } from '@cvg/shared'
import { runPostgresMigrations } from '../postgres-migrations.ts'
import { PostgresControlledPublishedKernelStore } from '../controlled-published-kernel-store.ts'
import { PostgresExecutionStepStore } from '../operational-step-postgres.ts'
import { PostgresOperationalEffectJournal } from '../operational-execution-postgres.ts'
import { TenantScopedPostgresCapabilityApprovalRepository } from '../tenant-scoped-capability-approval-repository.ts'
import {
  TenantScopedPostgresRuntimeRepository,
  withTenantContext,
  withTenantTransaction
} from '../tenant-scoped-postgres.ts'

const assignedRoot = process.env.SPEC0224_SETTLE_ASSIGNED_ROOT
const resourcePath = process.env.SPEC0224_SETTLE_RESOURCE
const serviceResource = process.env.SPEC0224_SETTLE_SERVICE_RESOURCE
const evidence = process.env.SPEC0224_SETTLE_EVIDENCE
if (
  !assignedRoot ||
  !/^\/tmp\/cvg-pare100-exec-20261014-6az3hlay\/spec0224-build\/settlement-failures\/(?:builder-r1|review-r[1-9][0-9]*)$/.test(
    assignedRoot
  ) ||
  resolve(assignedRoot) !== assignedRoot ||
  !resourcePath ||
  !resolve(resourcePath).startsWith(assignedRoot + '/') ||
  !serviceResource ||
  !resolve(serviceResource).startsWith(assignedRoot + '/') ||
  !evidence ||
  !resolve(evidence).startsWith(assignedRoot + '/')
)
  throw new Error(
    'Exact assigned settlement resource required; no skip/default'
  )
const output = evidence
const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000224'
)
const containerId =
  '0f148bb34b78385de5c7d70bd0f807658918e13295c6645a0daedf4680d2681c'
const tenantB = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000225'
)
const writerApplication = 'settlement-writer-' + process.pid
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
]
// PRIVATE raw inputs/results. Nonfinite values must never silently become JSON null.
function tagged(_key: string, value: unknown) {
  return typeof value === 'number' && !Number.isFinite(value)
    ? { $number: String(value) }
    : value
}
const savedFiles: string[] = []
const save = async (path: string, value: unknown) => {
  await writeFile(path, JSON.stringify(value, tagged, 2) + '\n', {
    flag: 'wx',
    mode: 0o600
  })
  savedFiles.push(path)
}
let sqlScope = 'provision',
  sqlSequence = 0
function instrumentSql(client: Client | PoolClient, label: string) {
  const original = client.query.bind(client)
  const wire = (value: unknown) =>
    appendFileSync(
      join(output, 'sql-wire-private.jsonl'),
      JSON.stringify(value, tagged) + '\n',
      { mode: 0o600 }
    )
  client.query = ((...args: unknown[]) => {
    const sequence = ++sqlSequence
    const callback = args.at(-1)
    wire({
      sequence,
      type: 'SQL-entry',
      scope: sqlScope,
      pid: process.pid,
      label,
      args: args.filter((value) => typeof value !== 'function')
    })
    if (typeof callback === 'function') {
      args[args.length - 1] = (...returned: unknown[]) => {
        wire({
          sequence,
          type: 'SQL-callback',
          error: returned[0] ? errorInfo(returned[0]) : null,
          result: returned[1]
        })
        return Reflect.apply(callback, undefined, returned)
      }
    }
    try {
      const value: unknown = Reflect.apply(original, undefined, args)
      if (value instanceof Promise)
        return value.then(
          (result: unknown) => {
            wire({ sequence, type: 'SQL-return', result })
            return result
          },
          (error: unknown) => {
            wire({ sequence, type: 'SQL-error', error: errorInfo(error) })
            throw error
          }
        )
      return value
    } catch (error) {
      wire({ sequence, type: 'SQL-error', error: errorInfo(error) })
      throw error
    }
  }) as typeof client.query
}
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
const errorInfo = (error: unknown) =>
  error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as Error & { code?: string }).code
      }
    : { message: String(error) }
const canonical = (value: unknown): string =>
  value === null || typeof value !== 'object'
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? '[' + value.map(canonical).join(',') + ']'
      : '{' +
        Object.keys(value)
          .sort()
          .map(
            (key) =>
              JSON.stringify(key) +
              ':' +
              canonical((value as Record<string, unknown>)[key])
          )
          .join(',') +
        '}'
const tokens = (value: unknown) =>
  Math.ceil(
    Buffer.byteLength(
      canonicalizeCompleteJson(value, {
        maxBytes: 131072,
        maxDepth: 64,
        maxNodes: 20000
      })
    ) / 64
  )
type Connection = {
  host: string
  port: number
  database: string
  user: string
  password: string
  options: string
}
let admin: Client | undefined,
  pool: Pool | undefined,
  connection: Connection,
  schema: string,
  serviceRole: string
const privateConnection = resolve(serviceResource!)
async function provision() {
  const assigned = await assignedResource(
    'settlement',
    resourcePath!,
    assignedRoot!
  )
  if (assigned.claim.evidence !== evidence)
    throw new Error('Wrong assigned evidence')
  if (assigned.claim.service !== serviceResource)
    throw new Error('Wrong assigned service')
  await ownedPath(assignedRoot!, serviceResource!, 'file', true)
  const resource = assigned.resource
  const url = new URL(resource.test_database_url)
  const inspected = JSON.parse(
    await inspectCompleteResource(
      'settlement',
      resourcePath!,
      assignedRoot!,
      'array'
    )
  )[0]
  const ports = inspected.NetworkSettings.Ports['5432/tcp']
  if (
    resource.containerId !== containerId ||
    inspected.Id !== containerId ||
    inspected.Config.Image !== 'postgres:16.4-alpine' ||
    inspected.Image !== resource.imageId ||
    inspected.Image !==
      'sha256:5660c2cbfea50c7a9127d17dc4e48543eedd3d7a41a595a2dfa572471e37e64c' ||
    !inspected.State.Running ||
    resource.synthetic !== true ||
    !resource.exclusiveClaim ||
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    url.username !== 'pare224' ||
    url.pathname !== '/pare224_synthetic' ||
    url.search ||
    url.hash ||
    ports?.length !== 1 ||
    ports[0].HostIp !== '127.0.0.1' ||
    ports[0].HostPort !== url.port ||
    resource.hostPort.HostPort !== url.port ||
    resource.hostPort.HostIp !== '127.0.0.1' ||
    !/^pare224_settle_(?:r1|i1_r[1-9][0-9]*)$/.test(resource.schemaName) ||
    resource.roleName !== resource.schemaName + '_service'
  )
    throw new Error('Refusing nonassigned bound PG224 resource')
  schema = resource.schemaName
  serviceRole = resource.roleName
  await mkdir(output, { recursive: true })
  admin = new Client({ connectionString: url.toString() })
  await admin.connect()
  const absent = (
    await admin.query(
      'SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS schema_exists,EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$2) AS role_exists',
      [schema, serviceRole]
    )
  ).rows[0]
  await save(join(output, 'preexistence.json'), absent)
  expect(absent).toEqual({ schema_exists: false, role_exists: false })
  await admin.query(`CREATE SCHEMA ${schema}`)
  const migrations = await runPostgresMigrations(admin, {
    schemaName: schema,
    createSchema: false
  })
  const password = randomBytes(32).toString('hex')
  await admin.query(
    `CREATE ROLE ${serviceRole} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
  )
  await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${serviceRole}`)
  await admin.query(
    `GRANT SELECT,INSERT,UPDATE ON ${tables.map((t) => schema + '.' + t).join(',')} TO ${serviceRole}`
  )
  await admin.query(
    `REVOKE UPDATE ON ${schema}.controlled_published_evidence FROM ${serviceRole}`
  )
  await admin.query(
    `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${serviceRole}`
  )
  connection = {
    host: '127.0.0.1',
    port: Number(url.port),
    database: 'pare224_synthetic',
    user: serviceRole,
    password,
    options: `-c search_path=${schema} -c statement_timeout=10000 -c lock_timeout=3000`
  }
  await writeFile(
    privateConnection,
    JSON.stringify(connection, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 }
  )
  pool = new Pool({
    ...connection,
    max: 3,
    application_name: writerApplication
  })
  pool.on('connect', (client) =>
    instrumentSql(client, 'authenticated-service-writer')
  )
  const identity = (
    await pool.query(
      `SELECT current_user,session_user,current_schema(),current_database(),rolsuper,rolbypassrls,rolinherit,rolcreatedb,rolcreaterole,(SELECT count(*)::int FROM pg_auth_members WHERE member=r.oid) AS memberships,(SELECT count(*)::int FROM pg_namespace WHERE nspowner=r.oid) AS owned_schemas,(SELECT count(*)::int FROM pg_class WHERE relowner=r.oid) AS owned_relations FROM pg_roles r WHERE rolname=current_user`
    )
  ).rows[0]
  expect(identity).toMatchObject({
    current_user: serviceRole,
    session_user: serviceRole,
    rolsuper: false,
    rolbypassrls: false,
    rolinherit: false,
    rolcreatedb: false,
    rolcreaterole: false,
    memberships: 0,
    owned_schemas: 0,
    owned_relations: 0
  })
  const rls = (
    await pool.query(
      'SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=$1::regnamespace AND relname=ANY($2) ORDER BY relname',
      [schema, tables]
    )
  ).rows
  expect(rls).toHaveLength(tables.length)
  for (const row of rls)
    expect(row).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true
    })
  const grants = (
    await pool.query(
      'SELECT table_name,privilege_type FROM information_schema.role_table_grants WHERE grantee=$1 AND table_schema=$2 ORDER BY table_name,privilege_type',
      [serviceRole, schema]
    )
  ).rows
  await save(join(output, 'resource-public.json'), {
    containerId,
    imageId: inspected.Image,
    schema,
    serviceRole,
    port: ports[0],
    database: 'pare224_synthetic'
  })
  await save(join(output, 'identity-rls-grants.json'), {
    identity,
    rls,
    grants,
    migrations
  })
  await admin.end()
  admin = undefined
}
async function snapshot(db: Pool, tenant = tenantId) {
  return withTenantContext(db, tenant, async (c) => {
    const result: Record<string, unknown> = {}
    for (const table of tables)
      result[table] = (
        await c.query(
          `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`
        )
      ).rows
    return result
  })
}
async function physical(
  dbConnection: Connection,
  executionId: string,
  tenant = tenantId
) {
  const reader = new Client(dbConnection)
  try {
    await reader.connect()
    instrumentSql(reader, 'fresh-authenticated-service-reader')
    await reader.query("SELECT set_config('cvg.tenant_id',$1,false)", [tenant])
    const identity = (
      await reader.query(
        "SELECT current_user,session_user,pg_backend_pid() AS backend_pid,current_schema(),current_setting('cvg.tenant_id') AS tenant_context"
      )
    ).rows[0]
    const physicalQuery = await reader.query(
      'SELECT *,state::text AS physical_state_text FROM operational_execution_checkpoints WHERE tenant_id=$1 AND execution_id=$2',
      [tenant, executionId]
    )
    const rows = physicalQuery.rows
    expect(rows).toHaveLength(1)
    const row = rows[0],
      wrapper = row.state
    expect(wrapper.storageCodec).toBe('cvg.checkpoint-state/2')
    expect(wrapper.encoding).toBe('base64')
    const decoded = Buffer.from(wrapper.data, 'base64')
    expect(decoded.toString('base64')).toBe(wrapper.data)
    expect(decoded.length).toBe(wrapper.decodedBytes)
    expect(createHash('sha256').update(decoded).digest('hex')).toBe(
      wrapper.decodedSha256
    )
    const state = JSON.parse(decoded.toString('utf8'))
    expect(canonical(state)).toBe(decoded.toString('utf8'))
    const cp: ExecutionCheckpoint = {
      checkpointId: row.checkpoint_id,
      executionId: row.execution_id,
      tenantId: row.tenant_id,
      checkpointVersion: row.checkpoint_version,
      runtimeProfile: row.runtime_profile,
      runtimeVersion: row.runtime_version,
      orchestratorVersion: row.orchestrator_version,
      stepNumber: row.step_number,
      state,
      budgetUsage: row.budget_usage,
      digest: row.digest,
      createdAt: row.created_at.toISOString()
    }
    const { checkpointId: _id, createdAt: _created, digest, ...unsigned } = cp
    void _id
    void _created
    expect(sha('cvg.checkpoint.v2\n' + canonical(unsigned))).toBe(digest)
    const authority = (
      await reader.query(
        `SELECT p.id AS execution_id,p.tenant_id,p.request,p.state AS execution_state,
        p.attempt,p.lease_owner,p.lease_until,b.request_digest,b.capability_fingerprint,
        b.prepared_digest,b.admission_runtime,b.prepared_runtime,b.phase_state,
        b.open_phase_id,b.open_phase_acked,b.active_outer_attempt,b.active_outer_worker_id,
        b.active_outer_attempt_row_id,b.expires_at,b.dispatch_closed,b.fault,clock_timestamp() AS observed_at
        FROM operational_executions p JOIN controlled_published_bindings b
        ON b.tenant_id=p.tenant_id AND b.execution_id=p.id
        WHERE p.tenant_id=$1 AND p.id=$2`,
        [tenant, executionId]
      )
    ).rows
    expect(authority).toHaveLength(1)
    expect(authority[0].request.runtime.context.values.adapterVersion).toBe(
      'controlled-published-v1'
    )
    return {
      identity,
      row,
      checkpoint: cp,
      authority: authority[0],
      wire: {
        command: physicalQuery.command,
        rowCount: physicalQuery.rowCount,
        fields: physicalQuery.fields
      }
    }
  } finally {
    await reader.end()
  }
}
async function prepare(
  db: Pool,
  label: string,
  timeoutMs = 30000,
  tenant = tenantId,
  controller = new AbortController(),
  outerLeaseMs = 30000
) {
  const tenantId = tenant
  const config = AgentConfigSchema.parse({
    persona: { name: 'Synthetic bound224', role: 'assistant', tone: 'calm' },
    greeting: 'Synthetic.',
    promptBlocks: [],
    responseTemplates: {},
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 512,
      timeoutMs,
      retries: 0
    },
    policies: {
      version: 'synthetic224-bound',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: ['respond'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: [],
    knowledge: [],
    handoff: {
      lowConfidenceDestination: 'synthetic',
      destinations: ['synthetic'],
      maxClarifications: 2
    }
  })
  const control = new InMemoryControlPlaneStore()
  const agent = await control.createAgent(
    { tenantId },
    {
      slug: 'bound-' + randomUUID(),
      name: 'Synthetic bound',
      description: 'Synthetic fixture only'
    }
  )
  const version = await control.createVersion(
    { tenantId },
    agent.id,
    config,
    'synthetic'
  )
  await withTenantTransaction(db, tenantId, async (c) => {
    await c.query(
      "INSERT INTO platform_agents(tenant_id,id,slug,name,description) VALUES($1,$2,$3,'Synthetic bound','Fixture')",
      [tenantId, agent.id, agent.slug]
    )
    await c.query(
      "INSERT INTO platform_agent_versions(tenant_id,id,agent_id,version,status,config,created_by) VALUES($1,$2,$3,1,'PUBLISHED',$4::jsonb,'synthetic')",
      [tenantId, version.id, agent.id, JSON.stringify(config)]
    )
  })
  const repository = new TenantScopedPostgresRuntimeRepository(db),
    published = new PostgresControlledPublishedKernelStore(db)
  const inbound = await repository.createWithSession({
    tenantId,
    channel: 'web',
    senderRef: 'synthetic-' + randomUUID(),
    externalMessageId: randomUUID(),
    body: 'Synthetic bound ' + label
  })
  const outer = await repository.enqueue({
    tenantId,
    type: 'inbound.process',
    idempotencyKey: 'bound:' + randomUUID(),
    payload: { synthetic: true },
    conversationId: inbound.conversation.id,
    sessionId: inbound.session.id,
    inboundMessageId: inbound.message.id
  })
  const outerClaim = await repository.claimNextFenced({
    tenantId,
    eventId: outer.id,
    workerId: 'bound:' + randomUUID(),
    leaseMs: outerLeaseMs
  })
  if (!outerClaim) throw new Error('No native outer claim')
  const input = {
    tenantId,
    agentId: agent.id,
    versionId: version.id,
    traceId: createTraceId(),
    executionId: 'exec_' + randomUUID(),
    correlationId: createCorrelationId(),
    inboundMessageId: inbound.message.id,
    message: 'Synthetic bound ' + label,
    history: [],
    executionMode: 'CONTROLLED_RUNTIME' as const,
    requireCapabilityApproval: false,
    context: {
      conversationId: inbound.conversation.id,
      sessionId: inbound.session.id
    }
  }
  const gateway = createControlledCapabilityGateway({
    approvalAuthority: new TenantScopedPostgresCapabilityApprovalRepository(db)
  })
  const admission = prepareControlledPublishedAdmission({
    version,
    input,
    actor: { id: 'system.controlled-runtime', role: 'System', permissions: [] },
    gateway
  })
  const admitted = await published.admit(admission, outerClaim.claimRef),
    claim = await published.claim(input.executionId, outerClaim.claimRef)
  expect(claim.disposition).toBe('ACTIVE')
  const host = published.createHost(
    claim,
    { assertActive() {}, requestStop() {}, async stopAndJoin() {} },
    controller.signal
  )
  const prepared: ControlledPublishedPrepared = {
    schema: 'controlled-published-prepared-v1',
    requestDigest: claim.requestDigest,
    fingerprint: claim.fingerprint,
    message: input.message,
    history: [],
    promptWithHistory: 'Synthetic trusted preparation',
    intent: 'respond',
    policy: {
      decision: 'allowed',
      reason: 'synthetic',
      layer: 'agent_behavior',
      policyVersion: 'synthetic224-bound'
    },
    risk: { level: 'low', reason: 'synthetic' },
    response: { mode: 'answer', text: 'Synthetic' },
    sourceIds: [],
    configDigest: controlledDigest(config)
  }
  const started = await host.continuation.startPrepared(
    host.identity,
    prepared,
    admission.runtime
  )
  const phase = await host.continuation.beginPhase(
    host.identity,
    claim.state.sealId,
    'checkpoint.settlement',
    controlledDigest({ synthetic: true, label })
  )
  const dir = join(output, label)
  await mkdir(dir, { recursive: true })
  await save(join(dir, 'native-authority.json'), {
    provenance:
      'Catalog DML fixture only; native inbound/enqueue/claim/admit/claim/startPrepared/beginPhase; trusted prepared payload is synthetic, not published adapter integration or approval.',
    admission,
    admitted,
    claim,
    hostIdentity: host.identity,
    prepared,
    started,
    phase
  })
  expect(admission.runtime.budget).toMatchObject({
    maxModelCalls: 1,
    maxCostUsd: 0,
    maxTokens: 1000,
    maxDurationMs: timeoutMs
  })
  expect(claim.fence).toBeDefined()
  const fence = { ...claim.fence!, signal: controller.signal }
  const runtimeInput = { ...admission.runtime, signal: controller.signal }
  await save(join(dir, 'signal-linkage.json'), {
    sameRuntimeHostFenceSignal:
      runtimeInput.signal === controller.signal &&
      fence.signal === controller.signal,
    timeoutMs,
    outerLeaseMs,
    provenance:
      'Host was constructed with this exact AbortController signal; no fake lifecycle or admission.'
  })
  return {
    input: runtimeInput,
    fence,
    started,
    dir,
    controller,
    outerClaim,
    claim,
    repository,
    published,
    outer
  }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
type Prepared = Awaited<ReturnType<typeof prepare>>
type Fault =
  | 'normal'
  | 'throw-after-body'
  | 'nan'
  | 'over-output'
  | 'before-cas'
  | 'ack-loss'
  | 'hold'
type Attempt = ReturnType<typeof createAttempt>
function createPair() {
  let active:
    | {
        complete: ModelGateway['complete']
        measure: DecisionInputCounter['measure']
      }
    | undefined
  const model: ModelGateway = {
    complete: (request) => {
      if (!active) throw new Error('No active synthetic pair fixture')
      return active.complete(request)
    }
  }
  const counter: DecisionInputCounter = {
    measure: (request) => {
      if (!active) throw new Error('No active synthetic pair fixture')
      return active.measure(request)
    }
  }
  const hybrid = new HybridOrchestrator({
    decisionModel: model,
    decisionInputCounter: counter,
    decisionModelSupportsMaxOutputTokens: true,
    maxDecisionRepairs: 0
  })
  return {
    model,
    hybrid,
    activate(value: NonNullable<typeof active>) {
      active = value
    }
  }
}
interface AttemptOptions {
  fault?: Fault
  pair?: ReturnType<typeof createPair>
  beforeSettle?: (
    args: DecisionAdmissionSettlement,
    attempt: Attempt
  ) => Promise<void>
}
function createAttempt(
  prepared: Prepared,
  name: string,
  options: AttemptOptions = {}
) {
  const db = pool!,
    fault = options.fault ?? 'normal'
  const dir = join(prepared.dir, name),
    events: Array<Record<string, unknown>> = []
  const ready = mkdir(dir, { recursive: true })
  let calls = 0,
    measurements = 0,
    injected = false
  let nativePort: DecisionAdmissionPort | undefined
  let originalSettlement: DecisionAdmissionSettlement | undefined
  let actualProviderResult: ModelResult | undefined
  const entered = deferred(),
    release = deferred(),
    delivered = deferred()
  const decisions: Promise<unknown>[] = []
  const event = (type: string, value: Record<string, unknown> = {}) => {
    const n = events.length + 1
    // Snapshot now, including tagged NaN; later native mutation cannot rewrite a witness.
    events.push(
      JSON.parse(
        JSON.stringify(
          {
            sequence: n,
            pid: process.pid,
            type,
            at: new Date().toISOString(),
            ...value
          },
          tagged
        )
      )
    )
    return n
  }
  const store = new PostgresExecutionStepStore(db, { fence: prepared.fence })
  const nativeLoad = store.loadCheckpoint.bind(store),
    nativeCAS = store.compareAndSwapCheckpoint.bind(store)
  store.compareAndSwapCheckpoint = async (value) => {
    const receipt =
      value.next.state.toolResultContext?.decisionAdmissions.at(-1)
    const entry = event('CAS-entry', {
      expected: value.expected,
      checkpoint: value.next,
      receiptStatus: receipt?.status ?? null
    })
    const target =
      !injected &&
      receipt?.status === 'SETTLED' &&
      (fault === 'before-cas' || fault === 'ack-loss')
    try {
      if (target && fault === 'before-cas') {
        injected = true
        event('CAS-fault-injection', {
          entry,
          stage: 'BEFORE_NATIVE_CAS',
          nativeInvoked: false
        })
        throw new Error('synthetic_settlement_before_native_cas')
      }
      const result = await nativeCAS(value)
      event('CAS-return-after-transaction', {
        entry,
        result,
        checkpointId: value.next.checkpointId,
        digest: value.next.digest,
        pendingReceipt:
          value.next.state.toolResultContext?.pendingDecisionAdmission ?? null
      })
      if (target && fault === 'ack-loss') {
        expect(result.status).toBe('APPLIED')
        injected = true
        const physicalAfterCommit = await physical(
          connection,
          prepared.input.executionId!,
          TenantIdSchema.parse(prepared.input.tenantId)
        )
        event('CAS-fault-injection', {
          entry,
          stage: 'AFTER_NATIVE_CAS_APPLIED_BEFORE_ACK',
          nativeInvoked: true,
          result,
          physicalAfterCommit
        })
        throw new Error('synthetic_settlement_ack_lost_after_commit')
      }
      return result
    } catch (error) {
      event('CAS-error', {
        entry,
        error: errorInfo(error),
        injected,
        stage: target ? fault : 'NATIVE'
      })
      throw error
    }
  }
  const pair = options.pair ?? createPair()
  pair.activate({
    measure: async (request) => {
      event('counter-entry', { measurementNumber: ++measurements, request })
      const measurement = {
        counterId: 'toy64-settlement',
        counterVersion: '1',
        provider: 'fake',
        model: 'deterministic-v1',
        formattingVersion: '1',
        inputUpperBoundTokens: tokens(request),
        contextWindowTokens: 8192,
        costUpperBoundUsd: 0
      }
      event('counter-return', { measurement })
      return measurement
    },
    complete: async ({ signal, ...request }: ModelRequest) => {
      const entry = event('model.complete-entry', {
        call: ++calls,
        request,
        signalAborted: signal?.aborted ?? null
      })
      try {
        const writerBackends = (
          await db.query(
            'SELECT pid FROM pg_stat_activity WHERE usename=$1 AND application_name=$2 ORDER BY pid',
            [connection.user, writerApplication]
          )
        ).rows.map((row) => row.pid as number)
        const observed = await physical(
          connection,
          prepared.input.executionId!,
          TenantIdSchema.parse(prepared.input.tenantId)
        )
        const cp = observed.checkpoint,
          ctx = cp.state.toolResultContext!,
          receipt = ctx.decisionAdmissions.find(
            (r) => r.admissionId === ctx.pendingDecisionAdmission
          )
        expect(observed.identity.current_user).toBe(connection.user)
        expect(observed.identity.session_user).toBe(connection.user)
        expect(writerBackends).not.toContain(observed.identity.backend_pid)
        expect(receipt).toMatchObject({
          status: 'RESERVED',
          requestSha256: sha(canonical(request)),
          reserved: { modelCalls: 1, outputTokens: 512, costUsd: 0 }
        })
        const commit = [...events]
          .reverse()
          .find(
            (e) =>
              e.type === 'CAS-return-after-transaction' &&
              e.checkpointId === cp.checkpointId &&
              e.digest === cp.digest &&
              e.pendingReceipt === receipt!.admissionId
          )
        expect(commit).toBeDefined()
        expect(Number(commit!.sequence)).toBeLessThan(entry)
        event('fresh-service-SQL', {
          entry,
          commit: commit!.sequence,
          physical: observed,
          writerBackends
        })
        const frame = JSON.parse(request.messages![1]!.content)
        const responseText =
          fault === 'over-output'
            ? 'X'.repeat(33000)
            : 'Settlement response: ' + frame.goal
        const text = JSON.stringify({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseText
        })
        expect(request.maxOutputTokens).toBe(512)
        if (fault === 'over-output') {
          expect(responseText.length).toBeGreaterThan(32768)
          expect(tokens(text)).toBeGreaterThan(512)
        } else expect(tokens(text)).toBeLessThanOrEqual(512)
        const nativeResult = await new DeterministicModelProvider().complete({
          prompt: canonical(request),
          fallbackText: text
        })
        expect(nativeResult.externalCall).toBe(false)
        actualProviderResult = {
          text: nativeResult.text,
          provider: nativeResult.provider,
          model: nativeResult.model,
          inputTokens: fault === 'nan' ? Number.NaN : tokens(request),
          outputTokens: tokens(nativeResult.text),
          costUsd: 0
        }
        event('native-fake-provider-return', {
          entry,
          nativeResult,
          actualProviderResult,
          syntheticUsage:
            'Toy64 canonical bytes / 64; cost 0; deliberately invalid NaN or over-output pair is never qualified',
          fault
        })
        if (fault === 'nan')
          event('model-fault-witness', {
            field: 'inputTokens',
            taggedValue: { $number: 'NaN' },
            isNaN: Number.isNaN(actualProviderResult.inputTokens)
          })
        entered.resolve()
        if (fault === 'hold') {
          event('provider-reply-held', { entry })
          await release.promise
          event('provider-reply-released', {
            entry,
            signalAborted: signal?.aborted ?? null
          })
        }
        if (fault === 'throw-after-body')
          throw new Error('synthetic_gateway_unknown_ack_after_provider_body')
        event('model.complete-return', { entry, result: actualProviderResult })
        return actualProviderResult
      } catch (error) {
        event('model.complete-error', { entry, error: errorInfo(error) })
        throw error
      } finally {
        delivered.resolve()
      }
    }
  })
  const orchestrator: IterativeOrchestrator = {
    contextProtocol: 'complete-tool-v1',
    decide: async (input) => {
      if (!input.decisionAdmission)
        throw new Error('No actual runtime native port')
      nativePort = input.decisionAdmission
      event('decide-native-port', {
        nativeClass: nativePort.constructor.name,
        context: input.context,
        protocol: pair.hybrid.contextProtocol
      })
      const original = nativePort
      const wrapped: DecisionAdmissionPort = {
        reserve: async (args: DecisionAdmissionReserveInput) => {
          const entry = event('native-reserve-entry', { args })
          try {
            const result = await original.reserve(args)
            event('native-reserve-return', { entry, result })
            return result
          } catch (error) {
            event('native-reserve-error', { entry, error: errorInfo(error) })
            throw error
          }
        },
        settle: async (args) => {
          originalSettlement = structuredClone(args)
          const entry = event('native-settle-entry', { args })
          try {
            await options.beforeSettle?.(args, attempt)
            const result = await original.settle(args)
            event('native-settle-return', { entry, result })
            return result
          } catch (error) {
            event('native-settle-error', { entry, error: errorInfo(error) })
            throw error
          }
        }
      }
      const promise = pair.hybrid.decide({
        ...input,
        decisionAdmission: wrapped
      })
      const settled = promise.then(
        (turn) => {
          event('hybrid-turn', { turn })
          return turn
        },
        (error: unknown) => {
          event('hybrid-error', { error: errorInfo(error) })
          throw error
        }
      )
      decisions.push(settled)
      return settled
    }
  }
  const audit = new RecordingAuditSink()
  const harness = createOperationalHarness({
    toolResultContext: { version: 1 },
    defaultRuntimeProfile: 'iterative',
    capabilities: createCapabilityRegistry([]),
    effectJournal: new PostgresOperationalEffectJournal(db, {
      fence: prepared.fence
    }),
    stepStore: store,
    iterativeOrchestrator: orchestrator,
    modelGateway: pair.model,
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    audit,
    telemetry: new RecordingTelemetrySink(),
    completionEvaluator: {
      evaluate: async () => ({
        outcome: 'COMPLETE',
        reasonCode: 'COMPLETION_CONFIRMED',
        deterministic: true
      })
    }
  })
  const runResult = ready.then(async () => {
    event('runtime-entry', { input: prepared.input, fault })
    try {
      const result = await harness.run(prepared.input)
      event('runtime-return', { result })
      return result
    } catch (error) {
      event('runtime-error', { error: errorInfo(error) })
      throw error
    }
  })
  const attempt = {
    prepared,
    dir,
    pair,
    events,
    event,
    harness,
    store,
    nativeLoad,
    runResult,
    entered,
    release,
    delivered,
    get calls() {
      return calls
    },
    get measurements() {
      return measurements
    },
    get nativePort() {
      if (!nativePort)
        throw new Error('Native port not captured from decide input')
      return nativePort
    },
    get settlement() {
      if (!originalSettlement) throw new Error('No actual native settlement')
      return originalSettlement
    },
    get providerResult() {
      return actualProviderResult
    },
    async joinDelivery() {
      release.resolve()
      if (calls > 0) await delivered.promise
      await Promise.allSettled(decisions)
    },
    async finish() {
      await attempt.joinDelivery()
      const outcome = await runResult.then(
        (result) => ({ result }),
        (error: unknown) => ({ result: null, error: errorInfo(error) })
      )
      const final = await nativeLoad(
        prepared.input.tenantId,
        prepared.input.executionId!
      )
      const record = {
        pid: process.pid,
        input: prepared.input,
        ...outcome,
        final,
        calls,
        measurements,
        events,
        audit: audit.events,
        fault,
        actualProviderResult
      }
      await save(join(dir, 'result.json'), record)
      return record
    }
  }
  return attempt
}
async function awaitProvider(a: Attempt) {
  await Promise.race([
    a.entered.promise,
    a.runResult.then((result) => {
      throw new Error(
        'Runtime returned before provider body: ' + result.stopReason
      )
    })
  ])
}
async function readPhysical(a: Attempt, name: string) {
  const value = await physical(
    connection,
    a.prepared.input.executionId!,
    TenantIdSchema.parse(a.prepared.input.tenantId)
  )
  await save(join(a.dir, name + '.json'), value)
  return value
}
async function probe(
  a: Attempt,
  name: string,
  args: DecisionAdmissionSettlement,
  expected: 'STATE_CONFLICT' | 'SETTLED'
) {
  const before = await readPhysical(a, name + '-before'),
    dbBefore = await snapshot(
      pool!,
      TenantIdSchema.parse(a.prepared.input.tenantId)
    )
  const entry = a.event('native-probe-entry', { name, args })
  let result: unknown, error: ReturnType<typeof errorInfo> | undefined
  try {
    result = await a.nativePort.settle(args)
    a.event('native-probe-return', { entry, result })
  } catch (caught) {
    error = errorInfo(caught)
    a.event('native-probe-error', { entry, error })
  }
  const after = await readPhysical(a, name + '-after'),
    dbAfter = await snapshot(
      pool!,
      TenantIdSchema.parse(a.prepared.input.tenantId)
    )
  await save(join(a.dir, name + '-probe.json'), {
    name,
    args,
    result,
    error,
    expected,
    before: join(a.dir, name + '-before.json'),
    after: join(a.dir, name + '-after.json'),
    dbBefore,
    dbAfter
  })
  expect(after.row).toEqual(before.row)
  expect(after.checkpoint).toEqual(before.checkpoint)
  expect(dbAfter).toEqual(dbBefore)
  if (expected === 'STATE_CONFLICT')
    expect(error).toMatchObject({ code: 'STATE_CONFLICT' })
  else {
    expect(error).toBeUndefined()
    expect(result).toMatchObject({ status: 'SETTLED' })
  }
}
async function replay(a: Attempt) {
  const before = await readPhysical(a, 'replay-before'),
    counts = { calls: a.calls, measurements: a.measurements }
  const result = await a.harness.run(a.prepared.input)
  const after = await readPhysical(a, 'replay-after')
  await save(join(a.dir, 'replay.json'), {
    result,
    countsBefore: counts,
    countsAfter: { calls: a.calls, measurements: a.measurements },
    before: join(a.dir, 'replay-before.json'),
    after: join(a.dir, 'replay-after.json')
  })
  expect(a.calls).toBe(counts.calls)
  expect(a.measurements).toBe(counts.measurements)
  expect(after.checkpoint.state.toolResultContext).toEqual(
    before.checkpoint.state.toolResultContext
  )
  expect(after.checkpoint.budgetUsage.modelCalls).toBe(
    before.checkpoint.budgetUsage.modelCalls
  )
  expect(after.checkpoint.budgetUsage.inputTokens).toBe(
    before.checkpoint.budgetUsage.inputTokens
  )
  expect(after.checkpoint.budgetUsage.outputTokens).toBe(
    before.checkpoint.budgetUsage.outputTokens
  )
  return result
}
function receipt(cp: ExecutionCheckpoint) {
  return cp.state.toolResultContext!.decisionAdmissions[0]!
}
function assertUnaccepted(cp: ExecutionCheckpoint) {
  expect(cp.state.toolResultContext?.acceptedDecision).toBeUndefined()
  expect(cp.state.toolResultContext?.deliveredThroughStep).toBe(0)
}

const caseIndex: Array<Record<string, unknown>> = []
async function caseRun(
  id: string,
  body: (attempts: Attempt[]) => Promise<void>
) {
  sqlScope = id
  const dir = join(output, id),
    attempts: Attempt[] = []
  await mkdir(dir, { recursive: true })
  const before = {
    tenant224: await snapshot(pool!),
    tenant225: await snapshot(pool!, tenantB)
  }
  await save(join(dir, 'db18-before-private.json'), before)
  let failure: unknown
  try {
    await body(attempts)
  } catch (error) {
    failure = error
  } finally {
    for (const a of attempts) {
      try {
        await a.finish()
      } catch (error) {
        failure ??= error
        await save(join(a.dir, 'finish-error.json'), {
          error: errorInfo(error),
          events: a.events,
          calls: a.calls,
          measurements: a.measurements
        })
      }
    }
    await save(join(dir, 'db18-after-private.json'), {
      tenant224: await snapshot(pool!),
      tenant225: await snapshot(pool!, tenantB)
    })
    const record = {
      id,
      containment: failure ? 'FAIL' : 'PASS',
      error: failure ? errorInfo(failure) : null,
      functionalQualification:
        id === 'SP06' || id === 'SP07'
          ? 'FAIL_INVALID_PAIR_NOT_QUALIFIED'
          : 'NOT_A_PROVIDER_QUALIFICATION',
      privateByDefault: true,
      rawFiles: savedFiles.filter((p) => p.startsWith(dir + '/')),
      attempts: attempts.map((a) => ({
        result: join(a.dir, 'result.json'),
        inputAuthority: join(a.prepared.dir, 'native-authority.json'),
        calls: a.calls,
        measurements: a.measurements,
        executionId: a.prepared.input.executionId,
        tenantId: a.prepared.input.tenantId
      })),
      limitations:
        'Synthetic trusted prepared support; actual public factory/Hybrid/native admission/CAS/claim. Parent RUNNING/OPEN or FAULTED remains; no consumer ACK, lifecycle completion, real billing, full TR05 or global/program closure.'
    }
    await save(join(dir, 'case-summary-index.json'), record)
    caseIndex.push(record)
  }
  if (failure) throw failure
}
function addAttempt(
  attempts: Attempt[],
  prepared: Prepared,
  name = 'main',
  options: AttemptOptions = {}
) {
  const a = createAttempt(prepared, name, options)
  attempts.push(a)
  return a
}
function assertOne(a: Attempt) {
  expect(a.calls).toBe(1)
  expect(a.measurements).toBe(1)
}
async function positive(a: Attempt) {
  expect((await a.runResult).stopReason).toBe('COMPLETED')
  assertOne(a)
  const value = await readPhysical(a, 'positive-final')
  expect(receipt(value.checkpoint).status).toBe('SETTLED')
  return value
}
async function uncertain(a: Attempt, status = 'UNKNOWN') {
  const result = await a.runResult
  expect(result.stopReason).not.toBe('COMPLETED')
  assertOne(a)
  const value = await readPhysical(a, 'uncertain-final')
  assertUnaccepted(value.checkpoint)
  expect(receipt(value.checkpoint).status).toBe(status)
  return { result, ...value }
}

describe('SPEC217/224 native public persistent settlement/failure proof', () => {
  beforeAll(provision, 60000)
  afterAll(async () => {
    try {
      await save(join(output, 'case-summary-index.json'), {
        cases: caseIndex,
        sqlWire: join(output, 'sql-wire-private.jsonl'),
        privateByDefault: true,
        taggedNumberEncoding: { $number: 'NaN|Infinity|-Infinity' },
        schema:
          'R12-compatible result.json and physical {row,checkpoint,identity,authority}; all file paths are actual saved raw files'
      })
    } finally {
      await pool?.end()
      await admin?.end()
    }
  })
  it('SP01 identical native RESULT after SETTLED and port close is an exact no-op', () =>
    caseRun('SP01', async (attempts) => {
      const a = addAttempt(attempts, await prepare(pool!, 'SP01'))
      await positive(a)
      await probe(a, 'identical-after-close', a.settlement, 'SETTLED')
      await replay(a)
    }))
  it('SP02 wrong request digest while RESERVED conflicts and valid original completes', () =>
    caseRun('SP02', async (attempts) => {
      const a = addAttempt(attempts, await prepare(pool!, 'SP02'), 'main', {
        beforeSettle: async (args, current) => {
          expect(args.kind).toBe('RESULT')
          await probe(
            current,
            'wrong-request-reserved',
            { ...args, requestSha256: '0'.repeat(64) },
            'STATE_CONFLICT'
          )
        }
      })
      await positive(a)
    }))
  it('SP03 conflicting RESULT after SETTLED conflicts with no mutation', () =>
    caseRun('SP03', async (attempts) => {
      const a = addAttempt(attempts, await prepare(pool!, 'SP03'))
      await positive(a)
      const args = a.settlement
      if (args.kind !== 'RESULT') throw new Error('Expected actual RESULT')
      await probe(
        a,
        'conflicting-settled',
        {
          ...args,
          result: { ...args.result, text: args.result.text + ' conflict' }
        },
        'STATE_CONFLICT'
      )
    }))
  it('SP04 actual tenant224 receipt cannot settle actual tenant225 execution', () =>
    caseRun('SP04', async (attempts) => {
      const a = addAttempt(attempts, await prepare(pool!, 'SP04/A'))
      await positive(a)
      const args = a.settlement
      const b = addAttempt(
        attempts,
        await prepare(pool!, 'SP04/B', 30000, tenantB),
        'main',
        {
          beforeSettle: async (_valid, current) => {
            const beforeA = await snapshot(pool!, tenantId)
            await probe(
              current,
              'actual-A-receipt-on-B',
              args,
              'STATE_CONFLICT'
            )
            expect(await snapshot(pool!, tenantId)).toEqual(beforeA)
            await save(join(current.dir, 'foreign-receipt-origin.json'), {
              actualAArgs: args,
              sourceResult: join(a.dir, 'result.json'),
              beforeA,
              afterA: await snapshot(pool!, tenantId)
            })
          }
        }
      )
      await positive(b)
      expect(a.calls + b.calls).toBe(2)
      expect(a.measurements + b.measurements).toBe(2)
    }))
  it('SP05 actual fake body completes before gateway throws with unknown acknowledgement', () =>
    caseRun('SP05', async (attempts) => {
      const a = addAttempt(attempts, await prepare(pool!, 'SP05'), 'main', {
        fault: 'throw-after-body'
      })
      const value = await uncertain(a)
      expect(a.providerResult).toBeDefined()
      expect(receipt(value.checkpoint).unknownReason).toBe(
        'DECISION_USAGE_UNKNOWN'
      )
      expect(value.checkpoint.budgetUsage.outputTokens).toBe(512)
      expect(a.events.some((e) => e.type === 'model.complete-error')).toBe(true)
      await replay(a)
    }))
  it('SP06 tagged NaN usage breaches and same Hybrid blocks a fresh bound execution', () =>
    caseRun('SP06', async (attempts) => {
      const a = addAttempt(attempts, await prepare(pool!, 'SP06/A'), 'main', {
        fault: 'nan'
      })
      const value = await uncertain(a)
      expect(Number.isNaN(a.providerResult!.inputTokens)).toBe(true)
      expect(receipt(value.checkpoint).unknownReason).toBe('ADMISSION_BREACH')
      expect(
        a.events.some(
          (e) =>
            e.type === 'hybrid-error' &&
            (e.error as { code: string }).code === 'ADMISSION_BREACH'
        )
      ).toBe(true)
      await replay(a)
      const b = addAttempt(
        attempts,
        await prepare(pool!, 'SP06/fresh-bound'),
        'main',
        { pair: a.pair }
      )
      const result = await b.runResult
      expect(result.stopReason).not.toBe('COMPLETED')
      expect(result.response).toContain('ADMISSION_UNAVAILABLE')
      expect(b.calls).toBe(0)
      expect(b.measurements).toBe(0)
      const fresh = await readPhysical(b, 'breached-pair-fresh-final')
      expect(
        fresh.checkpoint.state.toolResultContext!.decisionAdmissions
      ).toEqual([])
      expect(fresh.checkpoint.budgetUsage.modelCalls).toBe(0)
      expect(a.pair.hybrid).toBe(b.pair.hybrid)
      await save(join(b.dir, 'same-hybrid-witness.json'), {
        sameHybrid: a.pair.hybrid === b.pair.hybrid,
        firstResult: join(a.dir, 'result.json'),
        secondResult: join(b.dir, 'result.json'),
        qualification: 'FAIL_INVALID_NAN_PAIR',
        result
      })
    }))
  it('SP07 actual NativeFake output exceeds512 Toy64 tokens; finite overuse remains UNKNOWN', () =>
    caseRun('SP07', async (attempts) => {
      const a = addAttempt(attempts, await prepare(pool!, 'SP07'), 'main', {
        fault: 'over-output'
      })
      const value = await uncertain(a),
        actual = a.providerResult!
      expect(actual.text.length).toBeGreaterThan(32768)
      expect(actual.outputTokens).toBeGreaterThan(512)
      expect(Number.isFinite(actual.outputTokens)).toBe(true)
      expect(receipt(value.checkpoint)).toMatchObject({
        unknownReason: 'ADMISSION_BREACH',
        actual: { outputTokens: actual.outputTokens }
      })
      expect(value.checkpoint.budgetUsage.outputTokens).toBe(
        actual.outputTokens
      )
      await replay(a)
    }))
  it('SP08 throw once before SETTLED CAS retains conservative upper; no replay', () =>
    caseRun('SP08', async (attempts) => {
      const a = addAttempt(attempts, await prepare(pool!, 'SP08'), 'main', {
        fault: 'before-cas'
      })
      const value = await uncertain(a)
      expect(value.checkpoint.budgetUsage.outputTokens).toBe(512)
      const injections = a.events.filter(
        (e) => e.type === 'CAS-fault-injection'
      )
      expect(injections).toHaveLength(1)
      expect(injections[0]).toMatchObject({
        stage: 'BEFORE_NATIVE_CAS',
        nativeInvoked: false
      })
      await replay(a)
    }))
  it('SP09 actual SETTLED CAS applies then ACK is lost; durable actual is never rolled back', () =>
    caseRun('SP09', async (attempts) => {
      const a = addAttempt(attempts, await prepare(pool!, 'SP09'), 'main', {
        fault: 'ack-loss'
      })
      const value = await uncertain(a, 'SETTLED')
      expect(value.checkpoint.budgetUsage.outputTokens).toBe(
        a.providerResult!.outputTokens
      )
      expect(value.result.usage.outputTokens).toBe(512)
      expect(receipt(value.checkpoint).actual?.outputTokens).toBe(
        a.providerResult!.outputTokens
      )
      expect(
        a.events.filter((e) => e.type === 'CAS-fault-injection')
      ).toHaveLength(1)
      expect(
        a.events.some(
          (e) =>
            e.type === 'CAS-return-after-transaction' &&
            (e.result as { status: string }).status === 'CONFLICT'
        )
      ).toBe(true)
      await replay(a)
    }))
  for (const id of ['SP10', 'SP11'] as const)
    it(
      id +
        ' native deadline/cancellation precedes late provider reply; no late mutation',
      () =>
        caseRun(id, async (attempts) => {
          const controller = new AbortController()
          const a = addAttempt(
            attempts,
            await prepare(
              pool!,
              id,
              id === 'SP10' ? 1000 : 30000,
              tenantId,
              controller
            ),
            'main',
            { fault: 'hold' }
          )
          try {
            await awaitProvider(a)
            if (id === 'SP11') {
              a.event('external-native-abort', { bodyAlreadyComputed: true })
              controller.abort()
            }
            const result = await a.runResult
            // Nonterminal uncertainty writes inherit native dispatch signal/deadline;
            // terminal diagnostics ignore these but still require true lease ownership.
            expect(result.stopReason).toBe('INTERNAL_FAILURE')
            const before = await readPhysical(a, 'late-before'),
              dbBefore = await snapshot(pool!)
            assertUnaccepted(before.checkpoint)
            const status = receipt(before.checkpoint).status
            expect(['UNKNOWN', 'RESERVED']).toContain(status)
            if (status === 'RESERVED')
              expect(
                a.events.some(
                  (e) =>
                    e.type === 'CAS-error' &&
                    (e.error as { code?: string }).code === 'lease_lost'
                )
              ).toBe(true)
            a.release.resolve()
            await a.joinDelivery()
            const after = await readPhysical(a, 'late-after'),
              dbAfter = await snapshot(pool!)
            expect(after.row).toEqual(before.row)
            expect(after.checkpoint).toEqual(before.checkpoint)
            expect(dbAfter).toEqual(dbBefore)
            assertOne(a)
            await save(join(a.dir, 'late-delivery.json'), {
              result,
              durableStatus: status,
              before: join(a.dir, 'late-before.json'),
              after: join(a.dir, 'late-after.json'),
              dbBefore,
              dbAfter,
              delivered: true,
              nativeFenceError: 'lease_lost',
              note: 'RESERVED is not called UNKNOWN; terminal diagnostic may be saved while original receipt remains RESERVED.'
            })
          } finally {
            a.release.resolve()
            await a.joinDelivery()
            await a.runResult
          }
        })
    )
  it(
    'SP12 real database lease expiry and native takeover fence the old late result',
    () =>
      caseRun('SP12', async (attempts) => {
        const prepared = await prepare(
          pool!,
          'SP12',
          30000,
          tenantId,
          new AbortController(),
          1000
        )
        const a = addAttempt(attempts, prepared, 'main', { fault: 'hold' })
        try {
          await awaitProvider(a)
          const lease = await withTenantContext(pool!, tenantId, async (c) => {
            const sql = `SELECT p.attempt,p.lease_owner,p.lease_until AS parent_lease_until,q.attempts AS queue_attempt,q.lease_owner AS queue_owner,q.lease_until AS queue_lease_until,o.attempts AS outer_attempt,o.lease_owner AS outer_owner,o.lease_until AS outer_lease_until,b.expires_at AS prepared_expires_at,clock_timestamp() AS observed_at,GREATEST(p.lease_until,q.lease_until,o.lease_until) AS max_lease_until FROM operational_executions p JOIN operational_execution_outbox q ON q.tenant_id=p.tenant_id AND q.execution_id=p.id JOIN controlled_published_bindings b ON b.tenant_id=p.tenant_id AND b.execution_id=p.id JOIN outbox_events o ON o.tenant_id=b.tenant_id AND o.id=b.outbox_id WHERE p.tenant_id=$1 AND p.id=$2`
            const observed = (
              await c.query(sql, [tenantId, prepared.input.executionId!])
            ).rows[0]
            if (!observed) throw new Error('Missing actual bound leases')
            expect(Date.parse(observed.prepared_expires_at)).toBeGreaterThan(
              Date.parse(observed.max_lease_until)
            )
            a.event('actual-max-lease-observed', {
              sql,
              args: [tenantId, prepared.input.executionId],
              observed
            })
            // Wait on the server clock for the actual greatest expiry; never UPDATE leases or mock time.
            const sleepSql =
              'SELECT pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM ($1::timestamptz-clock_timestamp()))) + 0.05), clock_timestamp() AS after_expiry'
            const slept = (await c.query(sleepSql, [observed.max_lease_until]))
              .rows
            return { sql, observed, sleepSql, slept }
          })
          const newWorker = 'settlement-takeover:' + randomUUID()
          const newOuter = await prepared.repository.claimNextFenced({
            tenantId,
            eventId: prepared.outer.id,
            workerId: newWorker,
            leaseMs: 30000
          })
          if (!newOuter)
            throw new Error(
              'Native takeover outer claim refused after true expiry'
            )
          const next = await prepared.published.claim(
            prepared.input.executionId!,
            newOuter.claimRef
          )
          expect(next.disposition).toBe('SETTLEMENT')
          expect(next.fence.attempt).toBeGreaterThan(
            prepared.claim.fence.attempt
          )
          expect(newOuter.claimRef.expectedAttemptRowId).not.toBe(
            prepared.outerClaim.claimRef.expectedAttemptRowId
          )
          const before = await readPhysical(a, 'takeover-before-late')
          expect(before.authority).toMatchObject({
            phase_state: 'FAULTED',
            dispatch_closed: true,
            lease_owner: newWorker
          })
          expect(Date.parse(before.authority.expires_at)).toBeGreaterThan(
            Date.parse(before.authority.observed_at)
          )
          const dbBefore = await snapshot(pool!)
          await save(join(a.dir, 'takeover-native-claims.json'), {
            lease,
            oldClaim: prepared.claim,
            oldOuter: prepared.outerClaim,
            newOuter,
            next,
            newWorker,
            before: join(a.dir, 'takeover-before-late.json'),
            preparedStillValid: true,
            noConsumerACK: true
          })
          a.release.resolve()
          await a.joinDelivery()
          const result = await a.runResult
          // Old fence ownership fails even for terminal diagnostics; finalize cannot prove a checkpoint.
          expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
          const after = await readPhysical(a, 'takeover-after-late'),
            dbAfter = await snapshot(pool!)
          expect(after.row).toEqual(before.row)
          expect(after.checkpoint).toEqual(before.checkpoint)
          expect(dbAfter).toEqual(dbBefore)
          expect(receipt(after.checkpoint).status).toBe('RESERVED')
          assertUnaccepted(after.checkpoint)
          assertOne(a)
          expect(
            a.events.some(
              (e) =>
                e.type === 'CAS-error' &&
                (e.error as { code?: string }).code === 'lease_lost'
            )
          ).toBe(true)
          await save(join(a.dir, 'takeover-late-result.json'), {
            result,
            durableStatus: 'RESERVED',
            before: join(a.dir, 'takeover-before-late.json'),
            after: join(a.dir, 'takeover-after-late.json'),
            dbBefore,
            dbAfter,
            delivered: true,
            noSecondModel: a.calls === 1,
            nativeFenceRefusalRequired: true
          })
        } finally {
          a.release.resolve()
          await a.joinDelivery()
          await a.runResult
        }
      }),
    60000
  )
})
