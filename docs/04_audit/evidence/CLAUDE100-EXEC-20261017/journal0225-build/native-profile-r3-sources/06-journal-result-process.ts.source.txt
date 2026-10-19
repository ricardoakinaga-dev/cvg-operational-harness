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
  writeFileSync
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
    'apps/worker/src/postgres-role-preflight.ts',
    'apps/worker/dist/postgres-role-preflight.js'
  ]
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const phase = process.argv[2]
  assert.equal(process.argv.length, 3)
  assert(phase === 'write' || phase === 'read' || phase === 'reserve')
  try {
    console.log(JSON.stringify(await runJournalPhase(phase)))
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
