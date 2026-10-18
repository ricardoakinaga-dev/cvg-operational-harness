import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  appendFileSync
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type {
  RuntimeInput,
  ModelGateway,
  ModelRequest,
  DecisionInputCounter
} from '@cvg/harness-contracts'
import type { QueryResultRow } from 'pg'

export const journalTask = 'C100-FND-JOURNAL-0225-BUILD-001'
export const journalTmp = '/tmp/cvg-claude100-exec-20261017/journal0225-build'
export const journalSchema = 'c100_j225_active'
export const journalTenant = 'tenant_00000000-0000-4000-8000-00000000b901'
export const journalOtherTenant = 'tenant_00000000-0000-4000-8000-00000000b902'
export const journalRoot = realpathSync(
  fileURLToPath(new URL('../../../../../', import.meta.url))
)

export interface NativeJournalBinding {
  task: string
  profile: 'journal' | 'public-restart' | 'bound-journal' | 'capture-journal'
  runId: string
  containerId: string
  candidateRoot: string
  evidenceRoot: string
  inputs: { path: string; sha256: string }[]
}

export function privateJournalJson(path: string, maximum = 65536): unknown {
  assert.equal(realpathSync(journalTmp), journalTmp)
  const taskParent = lstatSync(dirname(journalTmp))
  assert(taskParent.isDirectory() && !taskParent.isSymbolicLink())
  assert.equal(taskParent.uid, process.getuid!())
  assert.equal(taskParent.mode & 0o022, 0)
  const base = lstatSync(journalTmp)
  assert(base.isDirectory() && !base.isSymbolicLink())
  assert.equal(base.uid, process.getuid!())
  assert.equal(base.mode & 0o022, 0)
  assert(
    path.startsWith(journalTmp + '/') &&
      realpathSync(dirname(path)).startsWith(journalTmp)
  )
  const before = lstatSync(path)
  assert(before.isFile() && !before.isSymbolicLink())
  assert.equal(before.uid, process.getuid!())
  assert.equal(before.mode & 0o077, 0)
  assert(before.size > 0 && before.size <= maximum)
  const fd = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  )
  try {
    const opened = fstatSync(fd)
    assert(
      opened.isFile() && opened.dev === before.dev && opened.ino === before.ino
    )
    const buffer = Buffer.alloc(maximum + 1)
    let total = 0
    while (total < buffer.length) {
      const n = readSync(fd, buffer, total, buffer.length - total, null)
      if (!n) break
      total += n
    }
    assert(total <= maximum)
    const after = fstatSync(fd),
      namedAfter = lstatSync(path)
    assert.equal(after.size, before.size)
    assert.equal(after.mtimeMs, before.mtimeMs)
    assert.equal(after.ctimeMs, before.ctimeMs)
    assert(namedAfter.dev === before.dev && namedAfter.ino === before.ino)
    return JSON.parse(buffer.subarray(0, total).toString('utf8')) as unknown
  } finally {
    closeSync(fd)
  }
}

export function journalCredentials(role: 'admin' | 'service' | 'old') {
  const names = {
    admin: 'c100_journal_owner',
    service: 'c100_j225_service',
    old: 'c100_j225_old'
  }
  const value = privateJournalJson(
    join(journalTmp, 'private', role + '.json')
  ) as Record<string, unknown>
  assert.deepEqual(Object.keys(value).sort(), [
    'database',
    'host',
    'password',
    'port',
    'user'
  ])
  assert.equal(value.host, '127.0.0.1')
  assert.equal(value.port, 55880)
  assert.equal(value.database, 'c100_journal_synthetic')
  assert.equal(value.user, names[role])
  assert(
    typeof value.password === 'string' && /^[a-f0-9]{48}$/.test(value.password)
  )
  return {
    host: '127.0.0.1',
    port: 55880,
    database: 'c100_journal_synthetic',
    user: names[role],
    password: value.password as string
  }
}

export function verifyNativeJournalBinding(): NativeJournalBinding {
  assert.equal(process.cwd(), journalRoot)
  assert.equal(process.versions.node, '22.23.2')
  const binding = privateJournalJson(
    join(journalTmp, 'native-binding.json')
  ) as NativeJournalBinding
  assert.equal(binding.task, journalTask)
  assert(
    binding.profile === 'journal' ||
      binding.profile === 'public-restart' ||
      binding.profile === 'bound-journal' ||
      binding.profile === 'capture-journal'
  )
  assert(/^native-[0-9]{13}$/.test(binding.runId))
  assert(/^[a-f0-9]{64}$/.test(binding.containerId))
  assert.equal(binding.candidateRoot, journalRoot)
  const common = execFileSync(
    '/usr/bin/git',
    ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    {
      cwd: journalRoot,
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin' },
      timeout: 5000
    }
  ).trim()
  assert.equal(
    binding.evidenceRoot,
    join(
      dirname(realpathSync(common)),
      'docs/04_audit/evidence/CLAUDE100-EXEC-20261017/journal0225-build'
    )
  )
  const expected = [
    'packages/persistence/src/operational-effect-result-codec.ts',
    'packages/persistence/src/operational-effect-result-guard.ts',
    'packages/persistence/src/operational-effect-result-readiness.ts',
    'packages/persistence/src/operational-execution-postgres.ts',
    'packages/persistence/src/postgres-migrations.ts',
    'packages/persistence/migrations/0030_complete_tool_result_journal.sql',
    'packages/persistence/src/__tests__/fixtures/journal-result-process.ts',
    'packages/persistence/src/__tests__/complete-effect-result-postgres.integration.ts',
    'packages/persistence/dist/operational-effect-result-codec.js',
    'packages/persistence/dist/operational-effect-result-guard.js',
    'packages/persistence/dist/operational-effect-result-readiness.js',
    'packages/persistence/dist/operational-execution-postgres.js',
    'packages/persistence/dist/postgres-migrations.js',
    'packages/contracts/dist/complete-json.js',
    'packages/harness/dist/effect-journal.js',
    'packages/harness/src/effect-journal.ts',
    'packages/harness/src/iterative-runtime.ts',
    'packages/harness/dist/iterative-runtime.js',
    'packages/harness/src/complete-journal-recovery.ts',
    'packages/harness/dist/complete-journal-recovery.js',
    'packages/harness/src/__tests__/complete-journal-recovery.test.ts',
    'apps/worker/src/postgres-role-preflight.ts',
    'apps/worker/dist/postgres-role-preflight.js',
    'packages/persistence/src/__tests__/fixtures/journal-result-resource.ts',
    'packages/persistence/src/__tests__/complete-effect-result-restart.integration.ts',
    'packages/persistence/src/__tests__/complete-effect-result-context.integration.ts',
    'packages/persistence/src/operational-step-postgres.ts',
    'packages/persistence/dist/operational-step-postgres.js',
    'packages/harness/src/createOperationalHarness.ts',
    'packages/harness/dist/createOperationalHarness.js',
    'packages/harness/src/complete-tool-results.ts',
    'packages/harness/dist/complete-tool-results.js',
    'packages/harness/src/complete-checkpoint.ts',
    'packages/harness/dist/complete-checkpoint.js'
  ]
  if (binding.profile === 'journal')
    expected.push(
      'packages/persistence/src/__tests__/fixtures/journal-result-readers/jsonvalue.ts.source.txt',
      'packages/persistence/src/__tests__/fixtures/journal-result-readers/direct.ts.source.txt',
      'packages/persistence/src/__tests__/fixtures/journal-result-readers/present.ts.source.txt',
      'packages/persistence/dist/operational-execution-postgres.j06-jsonvalue.js',
      'packages/persistence/dist/operational-execution-postgres.j06-direct.js',
      'packages/persistence/dist/operational-execution-postgres.j06-present.js',
      'packages/persistence/src/tenant-scoped-postgres.ts',
      'packages/persistence/dist/tenant-scoped-postgres.js',
      'packages/persistence/src/controlled-published-fencing.ts',
      'packages/persistence/dist/controlled-published-fencing.js',
      'node_modules/typescript/lib/typescript.js',
      'node_modules/typescript/package.json'
    )
  if (binding.profile === 'bound-journal')
    expected.push(
      'packages/persistence/src/__tests__/complete-effect-result-bound.integration.ts',
      'packages/persistence/src/controlled-published-fencing.ts',
      'packages/persistence/dist/controlled-published-fencing.js',
      'packages/persistence/src/controlled-published-kernel-store.ts',
      'packages/persistence/dist/controlled-published-kernel-store.js',
      'packages/persistence/migrations/0029_controlled_published_kernel.sql',
      'packages/platform/src/controlled-kernel-continuation.ts',
      'packages/platform/dist/controlled-kernel-continuation.js',
      'packages/platform/src/controlled-kernel-adapters.ts',
      'packages/platform/dist/controlled-kernel-adapters.js',
      'packages/platform/src/controlled-plugins.ts',
      'packages/platform/dist/controlled-plugins.js',
      'packages/persistence/src/tenant-scoped-postgres.ts',
      'packages/persistence/dist/tenant-scoped-postgres.js',
      'packages/persistence/src/postgres-outbox.ts',
      'packages/persistence/dist/postgres-outbox.js'
    )
  if (binding.profile === 'capture-journal')
    expected.push(
      'packages/persistence/src/__tests__/complete-effect-result-capture.integration.ts',
      'packages/contracts/src/complete-tool-context.ts',
      'packages/contracts/dist/complete-tool-context.js'
    )
  assert.deepEqual(binding.inputs.map((x) => x.path).sort(), expected.sort())
  for (const input of binding.inputs) {
    assert(/^[a-f0-9]{64}$/.test(input.sha256))
    const path = resolve(journalRoot, input.path)
    assert(!relative(journalRoot, realpathSync(path)).startsWith('..'))
    assert(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink())
    assert.equal(
      createHash('sha256').update(readFileSync(path)).digest('hex'),
      input.sha256
    )
  }
  const format =
    '{{.Id}}|{{.Name}}|{{.Image}}|{{index .Config.Labels "cvg.task"}}|{{index .Config.Labels "cvg.owner"}}|{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostIp}}|{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}'
  const output = execFileSync(
    '/usr/bin/docker',
    [
      '--host',
      'unix:///var/run/docker.sock',
      '--config',
      join(journalTmp, 'docker-config'),
      'inspect',
      '--format',
      format,
      binding.containerId
    ],
    {
      encoding: 'utf8',
      timeout: 5000,
      env: { PATH: '/usr/bin:/bin', HOME: join(journalTmp, 'home') }
    }
  ).trim()
  assert.equal(
    output,
    [
      binding.containerId,
      '/cvg-claude100-journal225-pg',
      'sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94',
      journalTask,
      'claude100-local225',
      '127.0.0.1',
      '55880'
    ].join('|')
  )
  return binding
}

export const journalValues: readonly { id: string; value: unknown }[] = [
  { id: 'null', value: null },
  { id: 'false', value: false },
  { id: 'true', value: true },
  { id: 'zero', value: 0 },
  { id: 'negative', value: -2.5 },
  { id: 'minimum', value: Number.MIN_VALUE },
  { id: 'maximum', value: Number.MAX_VALUE },
  { id: 'empty-string', value: '' },
  { id: 'empty-array', value: [] },
  { id: 'empty-object', value: {} },
  { id: 'number-string', value: '42' },
  { id: 'null-string', value: 'null' },
  { id: 'object-string', value: '{}' },
  { id: 'ascii-4096-canonical-bytes', value: 'a'.repeat(4094) },
  { id: 'unicode-4096-canonical-bytes', value: 'é'.repeat(2047) },
  { id: 'nul-4096', value: '\0'.repeat(4096) },
  { id: 'escapes', value: '"\\\b\f\n\r\t\0' },
  {
    id: 'reserved-keys',
    value: JSON.parse(
      '{"__proto__":{"safe":1},"constructor":false,"":0,"\\u0000":"\\u0000"}'
    )
  },
  {
    id: 'apparent-envelope',
    value: {
      encoding: 'base64',
      decodedBytes: 1,
      decodedSha256: 'apparent',
      data: 'MA=='
    }
  },
  {
    id: 'nested',
    value: { z: [null, false, 0, '', [], {}], a: { unicode: '😀 e\u0301 é' } }
  },
  { id: 'large-300k', value: 'b'.repeat(300 * 1024 - 2) },
  { id: 'maximum-1m', value: 'm'.repeat(1048576 - 2) }
]

export async function runJournalPhase(phase: 'write' | 'read' | 'reserve') {
  const binding = verifyNativeJournalBinding()
  assert.equal(binding.profile, 'journal')
  const pg = (await import('pg')).default
  const { PostgresOperationalEffectJournal } = await import('@cvg/persistence')
  const { canonicalizeCompleteJson } = await import('@cvg/harness-contracts')
  const pool = new pg.Pool({
    ...journalCredentials('service'),
    max: 1,
    application_name: 'c100-j225-phase-' + phase,
    options: '-c search_path=' + journalSchema,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    query_timeout: 12000
  })
  const journal = new PostgresOperationalEffectJournal(pool, {
    resultStorage: { version: 1 }
  })
  const frames: object[] = []
  try {
    for (const fixture of journalValues) {
      const operationKey = binding.runId + ':' + fixture.id
      const input = {
        tenantId: journalTenant,
        operationKey,
        proposalHash: 'proposal-' + fixture.id,
        attemptId: 'attempt-native'
      }
      if (phase === 'write') {
        assert.equal((await journal.reserve(input)).state, 'RESERVED')
        assert.equal((await journal.markStarted(input)).state, 'EFFECT_STARTED')
        assert.equal(
          (await journal.confirm({ ...input, result: fixture.value })).state,
          'CONFIRMED'
        )
      }
      const record =
        phase === 'reserve'
          ? await journal.reserve(input)
          : await journal.get(journalTenant, operationKey)
      assert(
        record &&
          record.state === 'CONFIRMED' &&
          record.attemptId === 'attempt-native'
      )
      assert(Object.hasOwn(record, 'result'))
      const text = canonicalizeCompleteJson(record.result, {
        maxBytes: 1048576,
        maxDepth: 64,
        maxNodes: 1000000
      })
      const expected = canonicalizeCompleteJson(fixture.value, {
        maxBytes: 1048576,
        maxDepth: 64,
        maxNodes: 1000000
      })
      assert(text === expected, 'native journal value bytes mismatch')
      assert.equal(typeof record.result, typeof fixture.value)
      assert.equal(await journal.get(journalOtherTenant, operationKey), null)
      frames.push({
        id: fixture.id,
        presence: true,
        type: typeof record.result,
        bytes: Buffer.byteLength(text),
        sha256: createHash('sha256').update(text).digest('hex')
      })
    }
    const result = {
      phase,
      pid: process.pid,
      status: 'PASS_COMPONENT_NATIVE_JOURNAL',
      frames,
      modelCalls: 0,
      toolBodies: 0,
      resourceId: binding.containerId,
      runId: binding.runId
    }
    writeFileSync(
      join(binding.evidenceRoot, binding.runId + '-' + phase + '.json'),
      JSON.stringify(result, null, 2) + '\n'
    )
    return result
  } finally {
    await pool.end()
  }
}

export const publicJournalCaseIds = [
  'null',
  'false',
  'true',
  'zero',
  'negative',
  'minimum',
  'maximum',
  'empty-string',
  'empty-array',
  'empty-object',
  'number-string',
  'null-string',
  'object-string',
  'ascii-4096-canonical-bytes',
  'unicode-4096-canonical-bytes',
  'nul-4096',
  'escapes',
  'reserved-keys',
  'apparent-envelope',
  'nested',
  'apparent-envelope-0',
  'apparent-envelope-1'
] as const
export type PublicJournalCaseId = (typeof publicJournalCaseIds)[number]
export function publicJournalValue(id: PublicJournalCaseId): unknown {
  assert(publicJournalCaseIds.includes(id))
  if (id === 'apparent-envelope-0' || id === 'apparent-envelope-1')
    return {
      result_storage_version: id === 'apparent-envelope-0' ? 0 : 1,
      result_storage_payload: {
        encoding: 'base64',
        decodedBytes: 4,
        decodedSha256: createHash('sha256').update('null').digest('hex'),
        data: 'bnVsbA=='
      },
      result: null
    }
  const fixture = journalValues.find((entry) => entry.id === id)
  assert(fixture)
  return fixture.value
}
export const journalContextIds = [
  'small',
  'ascii32768',
  'ascii32769',
  'unicode32768',
  'unicode32769',
  'depth32',
  'depth33',
  'nodes10000',
  'nodes10001',
  'large300k'
] as const
export type JournalContextId = (typeof journalContextIds)[number]
export function journalContextValue(id: JournalContextId): unknown {
  assert(journalContextIds.includes(id))
  if (id === 'small') return { value: 'small', n: null }
  if (id === 'ascii32768') return 'x'.repeat(32766)
  if (id === 'ascii32769') return 'x'.repeat(32767)
  if (id === 'unicode32768') return '🙂'.repeat(8191) + 'xx'
  if (id === 'unicode32769') return '🙂'.repeat(8191) + 'xxx'
  if (id === 'nodes10000') return Array(9999).fill(0)
  if (id === 'nodes10001') return Array(10000).fill(0)
  if (id === 'large300k') return 'b'.repeat(300 * 1024 - 2)
  let value: unknown = 0
  for (let level = 1; level < (id === 'depth32' ? 32 : 33); level++)
    value = [value]
  return value
}
export const journalRecoveryFaultPoints = [
  'recovery-get-failed',
  'recovery-cas-failed',
  'recovery-cas-ack-lost',
  'recovery-cas-failed-audit-failed',
  'recovery-cancelled',
  'recovery-paused',
  'recovery-read-deadline'
] as const
export type JournalRecoveryFaultPoint =
  (typeof journalRecoveryFaultPoints)[number]
export type PublicJournalPoint =
  | 'cas'
  | 'journal'
  | 'commit-ack'
  | 'context'
  | 'save-failure'
  | JournalRecoveryFaultPoint
type JournalFixtureId = PublicJournalCaseId | JournalContextId
export type PublicJournalRole = 'writer' | 'reader' | 'resolver'

export function publicJournalIdentity(
  binding: NativeJournalBinding,
  point: PublicJournalPoint,
  id: JournalFixtureId
) {
  return {
    executionId: 'j225-' + binding.runId + '-' + point + '-' + id,
    dir: join(journalTmp, binding.runId + '-public', point + '-' + id),
    applicationPrefix: 'j225-' + binding.runId + '-' + point + '-' + id
  }
}

export async function runPublicJournalPhase(
  point: PublicJournalPoint,
  role: PublicJournalRole,
  id: JournalFixtureId
) {
  const binding = verifyNativeJournalBinding()
  assert.equal(binding.profile, 'public-restart')
  const faultCase = journalRecoveryFaultPoints.includes(
    point as JournalRecoveryFaultPoint
  )
  assert(
    faultCase ||
      ['cas', 'journal', 'commit-ack', 'context', 'save-failure'].some(
        (p) => p === point
      )
  )
  assert(role === 'writer' || role === 'reader' || role === 'resolver')
  if (role === 'resolver') assert(point === 'recovery-cas-ack-lost')
  if (faultCase) assert(id === 'small')
  const contextCase =
    point === 'context' || point === 'save-failure' || faultCase
  assert(
    contextCase
      ? journalContextIds.includes(id as JournalContextId)
      : publicJournalCaseIds.includes(id as PublicJournalCaseId)
  )
  const identity = publicJournalIdentity(binding, point, id)
  const owned = lstatSync(identity.dir)
  assert(
    owned.isDirectory() &&
      !owned.isSymbolicLink() &&
      owned.uid === process.getuid!() &&
      (owned.mode & 0o077) === 0
  )
  const pg = (await import('pg')).default
  const { PostgresOperationalEffectJournal, PostgresExecutionStepStore } =
    await import('@cvg/persistence')
  const { createOperationalHarness, createCapabilityRegistry } =
    await import('@cvg/harness')
  const { HybridOrchestrator } = await import('@cvg/harness-orchestrator')
  const { canonicalizeCompleteJson } = await import('@cvg/harness-contracts')
  const { verifyJournalResultStorage } =
    await import('../../../dist/operational-effect-result-readiness.js')
  const pool = new pg.Pool({
    ...journalCredentials('service'),
    max: 3,
    options: '-c search_path=' + journalSchema,
    application_name: identity.applicationPrefix + '-' + role,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    query_timeout: 12000
  })
  const journalConnection =
    role === 'writer' && point === 'commit-ack'
      ? {
          connect: async () => {
            const client = await pool.connect()
            let confirmedOperation: string | undefined
            return {
              release: (error?: Error) => client.release(error),
              query: async <T extends QueryResultRow = QueryResultRow>(
                text: string,
                values?: unknown[]
              ) => {
                if (text === 'BEGIN') confirmedOperation = undefined
                const result = await client.query<T>(text, values)
                if (
                  /^UPDATE operational_effect_journal\s/.test(text.trim()) &&
                  values?.[2] === 'CONFIRMED'
                )
                  confirmedOperation = values[1] as string
                if (text === 'COMMIT' && confirmedOperation) {
                  flush()
                  await ready(
                    'J08_COMMIT_DURABLE_ACK_NOT_RETURNED',
                    confirmedOperation,
                    null
                  )
                }
                return result
              }
            }
          }
        }
      : pool
  const journal = new PostgresOperationalEffectJournal(journalConnection, {
    resultStorage: { version: 1 }
  })
  const store = new PostgresExecutionStepStore(pool)
  const toolId = 'synthetic.j225.public.echo'
  const value = contextCase
    ? journalContextValue(id as JournalContextId)
    : publicJournalValue(id as PublicJournalCaseId)
  const canonical = (v: unknown) =>
    canonicalizeCompleteJson(v, {
      maxBytes: 1048576,
      maxDepth: 64,
      maxNodes: 1000000
    })
  const sha = (v: string) => createHash('sha256').update(v).digest('hex')
  const count = (v: unknown) =>
    Math.ceil(
      Buffer.byteLength(
        canonicalizeCompleteJson(v, {
          maxBytes: 1000000,
          maxDepth: 64,
          maxNodes: 1000000
        })
      ) / 64
    )
  const trace: {
    pid: number
    point: PublicJournalPoint
    role: PublicJournalRole
    requests: unknown[]
    results: unknown[]
    measurements: unknown[]
    cas: unknown[]
    journal: unknown[]
    audit: unknown[]
    telemetry: unknown[]
  } = {
    pid: process.pid,
    point,
    role,
    requests: [],
    results: [],
    measurements: [],
    cas: [],
    journal: [],
    audit: [],
    telemetry: []
  }
  const save = (name: string, v: unknown) =>
    writeFileSync(join(identity.dir, name), JSON.stringify(v, null, 2) + '\n', {
      mode: 0o600
    })
  const flush = () => save(role + '.trace.json', trace)
  const ready = async (
    phase:
      | 'J09_FULL_CAS_COMMITTED'
      | 'J10_JOURNAL_COMMITTED_BEFORE_FULL_CAS'
      | 'J08_COMMIT_DURABLE_ACK_NOT_RETURNED',
    operationKey: string,
    token: unknown
  ) => {
    save('ready.json', {
      pid: process.pid,
      point,
      role,
      id,
      phase,
      executionId: identity.executionId,
      operationKey,
      token,
      resourceId: binding.containerId
    })
    process.stdout.write(
      JSON.stringify({ event: 'READY', pid: process.pid, phase }) + '\n'
    )
    await new Promise<never>(() => {
      setInterval(() => {}, 1000)
    })
  }
  let operationKey: string | undefined
  const confirm = journal.confirm.bind(journal)
  journal.confirm = async (input) => {
    const result = await confirm(input)
    operationKey = input.operationKey
    trace.journal.push({
      method: 'confirm',
      operationKey: input.operationKey,
      state: result.state,
      attemptId: result.attemptId,
      resultPresent: Object.hasOwn(result, 'result'),
      bytes: Buffer.byteLength(canonical(result.result)),
      sha256: sha(canonical(result.result))
    })
    flush()
    if (role === 'writer' && point === 'journal')
      await ready(
        'J10_JOURNAL_COMMITTED_BEFORE_FULL_CAS',
        input.operationKey,
        null
      )
    return result
  }
  const cas = store.compareAndSwapCheckpoint.bind(store)
  const get = journal.get.bind(journal)
  journal.get = async (tenant, operation) => {
    const result = await get(tenant, operation)
    trace.journal.push({
      method: 'get',
      operationKey: operation,
      state: result?.state ?? null,
      qualified: result
        ? Object.getOwnPropertyDescriptor(
            result,
            Symbol.for('cvg.journal.validated-result.v1')
          )?.value === 1
        : false
    })
    flush()
    if (role === 'reader' && point === 'recovery-get-failed')
      throw new Error('SYNTHETIC_RECOVERY_GET_FAILED')
    if (role === 'reader' && point === 'recovery-read-deadline')
      await new Promise<never>(() => {})
    return result
  }
  store.compareAndSwapCheckpoint = async (input) => {
    const hasTool = input.next.state.observations.some(
      (o) => o.type === 'TOOL_RESULT'
    )
    if (
      role === 'writer' &&
      (point === 'save-failure' || faultCase) &&
      hasTool
    ) {
      assert(operationKey)
      const durable = await journal.get(journalTenant, operationKey)
      assert(durable?.state === 'CONFIRMED')
      assert(canonical(durable.result) === canonical(value))
      const error = new Error('SYNTHETIC_J11_POST_CONFIRM_SAVE_FAILED')
      trace.cas.push({
        injectedBeforeNativeCAS: true,
        durableJournalState: durable.state,
        error: { name: error.name, message: error.message },
        input
      })
      flush()
      throw error
    }
    if (
      role === 'reader' &&
      (point === 'recovery-cas-failed' ||
        point === 'recovery-cas-failed-audit-failed')
    ) {
      const error = new Error('SYNTHETIC_RECOVERY_CAS_FAILED')
      trace.cas.push({
        injectedBeforeNativeCAS: true,
        hasTool,
        input,
        error: { message: error.message }
      })
      flush()
      assert(
        hasTool &&
          input.next.state.stepNumber === 1 &&
          input.next.state.pendingStepNumber === undefined
      )
      throw error
    }
    const result = await cas(input)
    trace.cas.push({ input, result })
    flush()
    if (role === 'reader' && point === 'recovery-cas-ack-lost') {
      assert(
        hasTool &&
          result.status === 'APPLIED' &&
          input.next.state.stepNumber === 1
      )
      throw new Error('SYNTHETIC_RECOVERY_CAS_ACK_LOST')
    }
    const full = input.next.state.observations.find(
      (o) =>
        o.type === 'TOOL_RESULT' &&
        (o.payload as { completion?: string }).completion === 'COMPLETE'
    )
    if (
      role === 'writer' &&
      point === 'cas' &&
      result.status === 'APPLIED' &&
      full
    ) {
      assert(operationKey)
      await ready('J09_FULL_CAS_COMMITTED', operationKey, result.token)
    }
    return result
  }
  const capabilities = createCapabilityRegistry([
    {
      descriptor: {
        id: toolId,
        version: '1',
        description: 'Pure synthetic JSON output',
        inputSchema: { type: 'object' },
        outputSchema: {},
        risk: 'LOW',
        sideEffect: 'NONE',
        idempotent: true,
        requiresApproval: false,
        origin: 'core',
        providerId: 'synthetic.j225.public',
        providerVersion: '1'
      },
      implementation: {
        validateInput: () => true,
        validateOutput: () => true,
        execute: async (_input, context) => {
          appendFileSync(
            join(identity.dir, 'bodies.jsonl'),
            JSON.stringify({
              pid: process.pid,
              role,
              operationKey: context.operationKey,
              bytes: Buffer.byteLength(canonical(value)),
              sha256: sha(canonical(value))
            }) + '\n',
            { mode: 0o600 }
          )
          return { status: 'SUCCEEDED', output: value }
        }
      }
    }
  ])
  const model: ModelGateway = {
    complete: async ({ signal: _signal, ...request }: ModelRequest) => {
      void _signal
      assert.equal(request.maxOutputTokens, 512)
      trace.requests.push(structuredClone(request))
      flush()
      const frame = JSON.parse(request.messages[1]!.content)
      const observed = frame.items.find(
        (item: { value?: { type?: string } }) =>
          item.value?.type === 'TOOL_RESULT'
      )
      let decision: object
      if (observed) {
        const payload = observed.value.payload
        assert.equal(payload.completion, 'COMPLETE')
        assert(Object.hasOwn(payload, 'output'))
        const actual = canonical(payload.output)
        assert.equal(payload.outputSha256, sha(actual))
        assert.equal(payload.outputBytes, Buffer.byteLength(actual))
        // The answer is derived only from the actual post-tool frame, never fixture.value.
        decision = {
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseText:
            'sha256:' +
            sha(actual) +
            ';bytes:' +
            Buffer.byteLength(actual) +
            ';type:' +
            typeof payload.output
        }
      } else
        decision = {
          decisionType: 'CALL_TOOL',
          reasonCode: 'TOOL_REQUIRED',
          toolId,
          toolVersion: '1',
          toolInput: {}
        }
      const text = JSON.stringify(decision)
      assert(count(text) <= request.maxOutputTokens!)
      const result = {
        text,
        provider: 'synthetic.j225.public',
        model: 'toy64-v1',
        inputTokens: count(request),
        outputTokens: count(text),
        costUsd: 0
      }
      trace.results.push(result)
      flush()
      return result
    }
  }
  const counter: DecisionInputCounter = {
    measure: async (request) => {
      const result = {
        counterId: 'toy64',
        counterVersion: '1',
        provider: 'synthetic.j225.public',
        model: 'toy64-v1',
        formattingVersion: '1',
        inputUpperBoundTokens: count(request),
        contextWindowTokens: 100000,
        costUpperBoundUsd: 0
      }
      trace.measurements.push({ request: structuredClone(request), result })
      flush()
      return result
    }
  }
  const harness = createOperationalHarness({
    toolResultContext: { version: 1 },
    capabilities,
    effectJournal: journal,
    stepStore: store,
    ...(role === 'reader' && point === 'recovery-paused'
      ? { pause: { isPaused: () => true } }
      : {}),
    iterativeOrchestrator: new HybridOrchestrator({
      decisionModel: model,
      decisionInputCounter: counter,
      decisionModelSupportsMaxOutputTokens: true
    }),
    modelGateway: model,
    policy: {
      evaluate: async () => ({
        outcome: 'ALLOW',
        reason: 'Pure synthetic fixture only',
        policyVersion: 'synthetic-v1'
      })
    },
    approvals: {
      request: async () => ({
        status: 'PENDING',
        reason: 'No sensitive effect admitted by this fixture'
      })
    },
    audit: {
      append: async (event) => {
        trace.audit.push(event)
        flush()
        if (role === 'reader' && point === 'recovery-cas-failed-audit-failed')
          throw new Error('SYNTHETIC_RECOVERY_AUDIT_FAILED')
      }
    },
    telemetry: {
      record: (event) => {
        trace.telemetry.push(event)
      }
    }
  })
  const input: RuntimeInput = {
    agent: {
      id: 'agent.j225.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'Preserve a synthetic JSON result',
      instructions: ['synthetic only', 'never act without authorization'],
      skills: [],
      tools: [toolId],
      policies: ['synthetic-only']
    },
    tenantId: journalTenant as RuntimeInput['tenantId'],
    executionId: identity.executionId,
    capabilityFingerprint: capabilities.compositionFingerprint(),
    conversationId: 'conversation_j225' as RuntimeInput['conversationId'],
    sessionId: 'session_j225' as RuntimeInput['sessionId'],
    correlationId: 'correlation_j225' as RuntimeInput['correlationId'],
    traceId: 'trace_j225' as RuntimeInput['traceId'],
    userMessage:
      'Use the pure synthetic tool and report only the observed value digest.',
    context: {
      values: { fixture: 'j225' },
      sourceIds: ['synthetic-fixture'],
      capturedAt: '2026-10-18T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-10-18T00:00:00.000Z' },
    budget: {
      maxSteps: 8,
      maxModelCalls: 4,
      maxToolCalls: 4,
      maxDurationMs:
        role === 'reader' && point === 'recovery-read-deadline' ? 1000 : 30000,
      maxCostUsd: 1,
      maxTokens: 10000,
      maxKnowledgeCalls: 3,
      maxReplans: 2,
      maxVerificationCalls: 3,
      maxDecisionRepairs: 1
    },
    runtimeProfile: 'iterative',
    ...(role === 'reader' && point === 'recovery-cancelled'
      ? { signal: AbortSignal.abort() }
      : {})
  }
  save(role + '.input.json', input)
  save(role + '.controls.json', {
    cancelled: input.signal?.aborted === true,
    paused: role === 'reader' && point === 'recovery-paused',
    durationMs: input.budget.maxDurationMs
  })
  try {
    const c = await pool.connect()
    try {
      save(role + '.readiness.json', {
        pid: process.pid,
        backendPid: (await c.query('SELECT pg_backend_pid() AS pid')).rows[0]
          .pid,
        readiness: await verifyJournalResultStorage(c, 1)
      })
    } finally {
      c.release()
    }
    const result = await harness.run(input)
    flush()
    save(role + '.outcome.json', { pid: process.pid, result })
    process.stdout.write(
      JSON.stringify({
        event: 'FINISHED',
        pid: process.pid,
        stopReason: result.stopReason
      }) + '\n'
    )
    return result
  } finally {
    await pool.end()
  }
}

export const journalCaptureIds = [
  'journal-limit',
  'journal-plus-one',
  'capture-limit',
  'capture-plus-one',
  'started',
  'capture-started'
] as const
export type JournalCaptureId = (typeof journalCaptureIds)[number]
export function journalCaptureRecipe(id: JournalCaptureId) {
  assert(journalCaptureIds.includes(id))
  const stringUnits =
    id === 'journal-limit'
      ? 1048574
      : id === 'capture-limit'
        ? 8388574
        : id === 'capture-plus-one' || id === 'capture-started'
          ? 8388575
          : 1048575
  return {
    stringUnits,
    outputBytes: stringUnits + 2,
    toolResultBytes: stringUnits + 34
  }
}
export function journalCaptureIdentity(
  binding: NativeJournalBinding,
  id: JournalCaptureId
) {
  assert(journalCaptureIds.includes(id))
  return {
    executionId: 'j225-' + binding.runId + '-capture-' + id,
    dir: join(journalTmp, binding.runId + '-capture', id)
  }
}

export async function runCaptureJournalPhase(
  role: 'writer' | 'reader',
  id: JournalCaptureId
) {
  const binding = verifyNativeJournalBinding()
  assert.equal(binding.profile, 'capture-journal')
  assert(role === 'writer' || role === 'reader')
  const recipe = journalCaptureRecipe(id)
  const identity = journalCaptureIdentity(binding, id)
  const owned = lstatSync(identity.dir)
  assert(
    owned.isDirectory() &&
      !owned.isSymbolicLink() &&
      owned.uid === process.getuid!() &&
      (owned.mode & 0o077) === 0
  )
  const pg = (await import('pg')).default
  const { PostgresOperationalEffectJournal, PostgresExecutionStepStore } =
    await import('@cvg/persistence')
  const { createOperationalHarness, createCapabilityRegistry } =
    await import('@cvg/harness')
  const { HybridOrchestrator } = await import('@cvg/harness-orchestrator')
  const { canonicalizeCompleteJson } = await import('@cvg/harness-contracts')
  const { verifyJournalResultStorage } =
    await import('../../../dist/operational-effect-result-readiness.js')
  const pool = new pg.Pool({
    ...journalCredentials('service'),
    max: 2,
    options: '-c search_path=' + journalSchema,
    application_name: 'j225-capture-' + id + '-' + role,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    query_timeout: 12000
  })
  const trace: {
    pid: number
    role: string
    id: string
    requests: unknown[]
    results: { inputTokens: number; outputTokens: number; costUsd: number }[]
    journal: unknown[]
    cas: unknown[]
    sql: string[]
    bodyCalls: number
  } = {
    pid: process.pid,
    role,
    id,
    requests: [],
    results: [],
    journal: [],
    cas: [],
    sql: [],
    bodyCalls: 0
  }
  const save = (name: string, data: unknown) =>
    writeFileSync(
      join(identity.dir, role + '.' + name + '.json'),
      JSON.stringify(data, null, 2) + '\n',
      { mode: 0o600 }
    )
  const flush = () => save('trace', trace)
  const failure = (error: unknown) => {
    const e = error as { name?: string; code?: string; message?: string }
    return { name: e?.name, code: e?.code, message: e?.message }
  }
  const connection =
    role === 'writer' && (id === 'started' || id === 'capture-started')
      ? {
          connect: async () => {
            const client = await pool.connect()
            return {
              release: (error?: Error) => client.release(error),
              query: async <T extends QueryResultRow = QueryResultRow>(
                text: string,
                values?: unknown[]
              ) => {
                if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) trace.sql.push(text)
                if (
                  /^UPDATE operational_effect_journal\s/.test(text.trim()) &&
                  values?.[2] === 'UNCERTAIN'
                ) {
                  trace.sql.push('INJECT_BEFORE_NATIVE_UNCERTAIN_UPDATE')
                  flush()
                  throw new Error('SYNTHETIC_CAPTURE_UNCERTAIN_UPDATE_FAILURE')
                }
                return client.query<T>(text, values)
              }
            }
          }
        }
      : pool
  const journal = new PostgresOperationalEffectJournal(connection, {
    resultStorage: { version: 1 }
  })
  const metadata = (record: Awaited<ReturnType<typeof journal.get>>) => {
    if (!record) return null
    const resultPresent = Object.hasOwn(record, 'result')
    const text = resultPresent ? JSON.stringify(record.result) : undefined
    return {
      state: record.state,
      attemptId: record.attemptId,
      resultPresent,
      resultBytes: text === undefined ? null : Buffer.byteLength(text),
      resultSha256:
        text === undefined
          ? null
          : createHash('sha256').update(text).digest('hex'),
      error: record.error,
      qualifiedRead:
        Object.getOwnPropertyDescriptor(
          record,
          Symbol.for('cvg.journal.validated-result.v1')
        )?.value === 1
    }
  }
  const reserve = journal.reserve.bind(journal)
  journal.reserve = async (input) => {
    try {
      const record = await reserve(input)
      trace.journal.push({ method: 'reserve', record: metadata(record) })
      flush()
      return record
    } catch (error) {
      trace.journal.push({ method: 'reserve', error: failure(error) })
      flush()
      throw error
    }
  }
  const start = journal.markStarted.bind(journal)
  journal.markStarted = async (input) => {
    try {
      const record = await start(input)
      trace.journal.push({ method: 'markStarted', record: metadata(record) })
      flush()
      return record
    } catch (error) {
      trace.journal.push({ method: 'markStarted', error: failure(error) })
      flush()
      throw error
    }
  }
  const confirm = journal.confirm.bind(journal)
  journal.confirm = async (input) => {
    try {
      const record = await confirm(input)
      trace.journal.push({
        method: 'confirm',
        outputBytes:
          typeof input.result === 'string' ? input.result.length + 2 : null,
        record: metadata(record)
      })
      flush()
      return record
    } catch (error) {
      trace.journal.push({
        method: 'confirm',
        outputBytes:
          typeof input.result === 'string' ? input.result.length + 2 : null,
        error: failure(error)
      })
      flush()
      throw error
    }
  }
  const fail = journal.fail.bind(journal)
  journal.fail = async (input) => {
    trace.journal.push({ method: 'fail' })
    flush()
    return fail(input)
  }
  const uncertain = journal.markUncertain.bind(journal)
  journal.markUncertain = async (input) => {
    try {
      const record = await uncertain(input)
      trace.journal.push({
        method: 'markUncertain',
        reason: input.reason,
        record: metadata(record)
      })
      flush()
      return record
    } catch (error) {
      trace.journal.push({
        method: 'markUncertain',
        reason: input.reason,
        error: failure(error)
      })
      flush()
      throw error
    }
  }
  const get = journal.get.bind(journal)
  journal.get = async (tenant, operation) => {
    const record = await get(tenant, operation)
    trace.journal.push({ method: 'get', record: metadata(record) })
    flush()
    return record
  }
  const store = new PostgresExecutionStepStore(pool)
  const cas = store.compareAndSwapCheckpoint.bind(store)
  store.compareAndSwapCheckpoint = async (input) => {
    const result = await cas(input)
    trace.cas.push({
      stepNumber: input.next.state.stepNumber,
      pendingStepNumber: input.next.state.pendingStepNumber,
      usage: input.next.budgetUsage,
      observations: input.next.state.observations.map((o) => ({
        type: o.type,
        payload: o.type === 'TOOL_RESULT' ? o.payload : undefined
      })),
      result
    })
    flush()
    return result
  }
  const toolId = 'synthetic.j225.capture.echo'
  const capabilities = createCapabilityRegistry([
    {
      descriptor: {
        id: toolId,
        version: '1',
        description: 'Pure synthetic capture boundary',
        inputSchema: { type: 'object' },
        outputSchema: {},
        risk: 'LOW',
        sideEffect: 'NONE',
        idempotent: true,
        requiresApproval: false,
        origin: 'core',
        providerId: 'synthetic.j225.capture',
        providerVersion: '1'
      },
      implementation: {
        validateInput: () => true,
        validateOutput: () => true,
        execute: async (_input, context) => {
          trace.bodyCalls++
          const value = 'a'.repeat(recipe.stringUnits)
          const raw = { output: value, status: 'SUCCEEDED' as const }
          const outputJson = JSON.stringify(value),
            toolJson = JSON.stringify(raw)
          assert.equal(Buffer.byteLength(outputJson), recipe.outputBytes)
          assert.equal(Buffer.byteLength(toolJson), recipe.toolResultBytes)
          appendFileSync(
            join(identity.dir, 'bodies.jsonl'),
            JSON.stringify({
              pid: process.pid,
              role,
              operationKey: context.operationKey,
              outputBytes: recipe.outputBytes,
              toolResultBytes: recipe.toolResultBytes,
              outputSha256: createHash('sha256')
                .update(outputJson)
                .digest('hex'),
              toolResultSha256: createHash('sha256')
                .update(toolJson)
                .digest('hex')
            }) + '\n',
            { mode: 0o600 }
          )
          flush()
          return raw
        }
      }
    }
  ])
  const count = (value: unknown) =>
    Math.ceil(Buffer.byteLength(canonicalizeCompleteJson(value)) / 64)
  const model: ModelGateway = {
    complete: async ({ signal: _signal, ...request }) => {
      assert(!_signal?.aborted)
      trace.requests.push(structuredClone(request))
      flush()
      const decision =
        role === 'writer' && trace.requests.length === 1
          ? {
              decisionType: 'CALL_TOOL',
              reasonCode: 'TOOL_REQUIRED',
              toolId,
              toolVersion: '1',
              toolInput: {}
            }
          : {
              decisionType: 'RESPOND',
              reasonCode: 'GOAL_SATISFIED',
              responseText: 'Synthetic unexpected continuation'
            }
      const text = JSON.stringify(decision)
      const result = {
        text,
        provider: 'synthetic.j225.capture',
        model: 'toy64-v1',
        inputTokens: count(request),
        outputTokens: count(text),
        costUsd: 0
      }
      trace.results.push(result)
      flush()
      return result
    }
  }
  const counter: DecisionInputCounter = {
    measure: async (request) => ({
      counterId: 'toy64',
      counterVersion: '1',
      provider: 'synthetic.j225.capture',
      model: 'toy64-v1',
      formattingVersion: '1',
      inputUpperBoundTokens: count(request),
      contextWindowTokens: 100000,
      costUpperBoundUsd: 0
    })
  }
  const harness = createOperationalHarness({
    toolResultContext: { version: 1 },
    capabilities,
    effectJournal: journal,
    stepStore: store,
    iterativeOrchestrator: new HybridOrchestrator({
      decisionModel: model,
      decisionInputCounter: counter,
      decisionModelSupportsMaxOutputTokens: true
    }),
    modelGateway: model,
    policy: {
      evaluate: async () => ({
        outcome: 'ALLOW',
        reason: 'Pure synthetic fixture only',
        policyVersion: 'synthetic-j225'
      })
    },
    approvals: {
      request: async () => ({
        status: 'PENDING',
        reason: 'Synthetic fixture admits no sensitive effect'
      })
    },
    audit: { append: async () => {} },
    telemetry: { record: () => {} }
  })
  const input: RuntimeInput = {
    agent: {
      id: 'agent.j225.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'Preserve synthetic capture boundaries',
      instructions: ['Synthetic only'],
      skills: [],
      tools: [toolId],
      policies: ['synthetic-only']
    },
    tenantId: journalTenant as RuntimeInput['tenantId'],
    executionId: identity.executionId,
    capabilityFingerprint: capabilities.compositionFingerprint(),
    conversationId: 'conversation_j225' as RuntimeInput['conversationId'],
    sessionId: 'session_j225' as RuntimeInput['sessionId'],
    correlationId: 'correlation_j225' as RuntimeInput['correlationId'],
    traceId: 'trace_j225' as RuntimeInput['traceId'],
    userMessage: 'Use the pure synthetic tool once.',
    context: {
      values: { fixture: 'j225-capture' },
      sourceIds: ['synthetic-fixture'],
      capturedAt: '2026-10-18T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-10-18T00:00:00.000Z' },
    runtimeProfile: 'iterative',
    budget: {
      maxSteps: 8,
      maxModelCalls: 4,
      maxToolCalls: 4,
      maxDurationMs: 30000,
      maxCostUsd: 1,
      maxTokens: 10000,
      maxKnowledgeCalls: 3,
      maxReplans: 2,
      maxVerificationCalls: 3,
      maxDecisionRepairs: 1
    }
  }
  save('input', input)
  try {
    const client = await pool.connect()
    try {
      save('readiness', {
        pid: process.pid,
        identity: (
          await client.query(
            'SELECT current_user,session_user,pg_backend_pid() AS pid'
          )
        ).rows[0],
        readiness: await verifyJournalResultStorage(client, 1)
      })
    } finally {
      client.release()
    }
    if (role === 'reader')
      save(
        'probe-before',
        metadata(
          await journal.get(
            journalTenant,
            identity.executionId + ':s1:' + toolId
          )
        )
      )
    const result = await harness.run(input)
    const { toolResult, ...safe } = result
    save('outcome', {
      pid: process.pid,
      result: safe,
      toolResult: toolResult
        ? {
            status: toolResult.status,
            error: toolResult.error,
            outputPresent: Object.hasOwn(toolResult, 'output')
          }
        : null
    })
    save(
      'probe-after',
      metadata(
        await journal.get(journalTenant, identity.executionId + ':s1:' + toolId)
      )
    )
    flush()
    process.stdout.write(
      JSON.stringify({
        event: 'FINISHED',
        pid: process.pid,
        id,
        role,
        stopReason: result.stopReason
      }) + '\n'
    )
  } finally {
    await pool.end()
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const phase = process.argv[2]
  try {
    if (phase === 'capture-writer' || phase === 'capture-reader') {
      assert.equal(process.argv.length, 4)
      assert(journalCaptureIds.includes(process.argv[3] as JournalCaptureId))
      await runCaptureJournalPhase(
        phase === 'capture-writer' ? 'writer' : 'reader',
        process.argv[3] as JournalCaptureId
      )
    } else if (phase === 'write' || phase === 'read' || phase === 'reserve') {
      assert.equal(process.argv.length, 3)
      console.log(JSON.stringify(await runJournalPhase(phase)))
    } else if (
      journalRecoveryFaultPoints.some((point) =>
        ['writer', 'reader', 'resolver'].some(
          (role) => phase === point + '-' + role
        )
      )
    ) {
      assert.equal(process.argv.length, 4)
      assert.equal(process.argv[3], 'small')
      assert(typeof phase === 'string')
      const role = phase.endsWith('-resolver')
        ? 'resolver'
        : phase.endsWith('-writer')
          ? 'writer'
          : 'reader'
      const point = phase.slice(
        0,
        -(role.length + 1)
      ) as JournalRecoveryFaultPoint
      if (role === 'resolver') assert(point === 'recovery-cas-ack-lost')
      await runPublicJournalPhase(point, role, 'small')
    } else if (
      phase === 'context-writer' ||
      phase === 'context-reader' ||
      phase === 'save-failure-writer' ||
      phase === 'save-failure-reader'
    ) {
      assert.equal(process.argv.length, 4)
      const id = process.argv[3]
      assert(journalContextIds.includes(id as JournalContextId))
      await runPublicJournalPhase(
        phase.startsWith('context-') ? 'context' : 'save-failure',
        phase.endsWith('-writer') ? 'writer' : 'reader',
        id as JournalContextId
      )
    } else {
      assert.equal(process.argv.length, 4)
      assert(
        phase === 'public-cas-writer' ||
          phase === 'public-cas-reader' ||
          phase === 'public-journal-writer' ||
          phase === 'public-journal-reader' ||
          phase === 'public-commit-ack-writer' ||
          phase === 'public-commit-ack-reader'
      )
      const id = process.argv[3]
      assert(publicJournalCaseIds.includes(id as PublicJournalCaseId))
      await runPublicJournalPhase(
        phase.includes('-cas-')
          ? 'cas'
          : phase.includes('-commit-ack-')
            ? 'commit-ack'
            : 'journal',
        phase.endsWith('-writer') ? 'writer' : 'reader',
        id as PublicJournalCaseId
      )
    }
  } catch (error) {
    const e = error as { code?: unknown; message?: unknown }
    console.error(
      JSON.stringify({
        status: 'FAIL_NATIVE_JOURNAL_PHASE',
        phase,
        pid: process.pid,
        code: typeof e.code === 'string' ? e.code : null,
        reason:
          typeof e.message === 'string' &&
          /^JOURNAL_|^LEGACY_RESULT_/.test(e.message)
            ? e.message
            : 'native phase failed'
      })
    )
    process.exitCode = 1
  }
}
