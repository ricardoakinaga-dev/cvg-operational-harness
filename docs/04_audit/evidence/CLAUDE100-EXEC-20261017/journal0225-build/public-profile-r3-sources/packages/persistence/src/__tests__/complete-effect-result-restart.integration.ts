import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  existsSync,
  readdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync
} from 'node:fs'
import { join } from 'node:path'
import {
  verifyNativeJournalBinding,
  privateJournalJson,
  journalRoot,
  journalTenant,
  publicJournalIdentity,
  publicJournalCaseIds,
  publicJournalValue,
  type PublicJournalPoint,
  type PublicJournalCaseId,
  type NativeJournalBinding
} from './fixtures/journal-result-process.ts'
import { createJournalResourceFixture } from './fixtures/journal-result-resource.ts'

let binding: NativeJournalBinding
let resource: ReturnType<typeof createJournalResourceFixture> | undefined
before(async () => {
  binding = verifyNativeJournalBinding()
  assert.equal(binding.profile, 'public-restart')
  resource = createJournalResourceFixture(binding)
  await resource.setup()
})
after(async () => {
  await resource?.cleanup()
})

interface Exit {
  code: number | null
  signal: NodeJS.Signals | null
  pid: number | undefined
  stdout: string
  stderr: string
  captureError: unknown
}
function startChild(
  point: PublicJournalPoint,
  role: 'writer' | 'reader',
  id: PublicJournalCaseId
) {
  const identity = publicJournalIdentity(binding, point, id)
  const script = join(
    journalRoot,
    'packages/persistence/src/__tests__/fixtures/journal-result-process.ts'
  )
  const argv = [
    '--experimental-strip-types',
    script,
    `public-${point}-${role}`,
    id
  ]
  const proc = spawn(process.execPath, argv, {
    cwd: journalRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stdout = '',
    stderr = '',
    closed = false,
    captureError: unknown
  const deadline = setTimeout(() => {
    captureError = new Error('Owned public child absolute deadline')
    proc.kill('SIGKILL')
  }, 45000)
  const append = (stream: 'stdout' | 'stderr', bytes: Buffer) => {
    const text = bytes.toString('utf8')
    if (stream === 'stdout') stdout += text
    else stderr += text
    if (
      Buffer.byteLength(stdout) > 65536 ||
      Buffer.byteLength(stderr) > 65536
    ) {
      captureError = new Error('Owned public child output limit')
      proc.kill('SIGKILL')
    }
  }
  proc.stdout.on('data', (bytes: Buffer) => append('stdout', bytes))
  proc.stderr.on('data', (bytes: Buffer) => append('stderr', bytes))
  proc.on('error', (error) => {
    captureError = error
  })
  const done = new Promise<Exit>((resolve) =>
    proc.on('close', (code, signal) => {
      clearTimeout(deadline)
      closed = true
      const exit = { code, signal, pid: proc.pid, stdout, stderr, captureError }
      try {
        writeFileSync(
          join(identity.dir, role + '.command.json'),
          JSON.stringify(
            {
              argv: [process.execPath, ...argv],
              cwd: journalRoot,
              ...exit,
              captureError: captureError
                ? {
                    name: (captureError as Error).name,
                    message: (captureError as Error).message
                  }
                : null
            },
            null,
            2
          ) + '\n',
          { mode: 0o600 }
        )
      } catch (error) {
        exit.captureError = error
      }
      resolve(exit)
    })
  )
  const ready = async () => {
    const until = Date.now() + 15000
    while (Date.now() < until) {
      if (existsSync(join(identity.dir, 'ready.json'))) {
        const value = privateJournalJson(join(identity.dir, 'ready.json')) as {
          pid: number
          phase: string
          operationKey: string
          token: unknown
        }
        assert.equal(value.pid, proc.pid)
        assert.equal(
          value.phase,
          point === 'cas'
            ? 'J09_FULL_CAS_COMMITTED'
            : 'J10_JOURNAL_COMMITTED_BEFORE_FULL_CAS'
        )
        return value
      }
      if (closed) {
        await done
        throw new Error(
          'Writer ended without a durable crashpoint; inspect private trace'
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('Writer did not reach its named durable crashpoint')
  }
  return {
    proc,
    done,
    ready,
    isClosed: () => closed,
    stop: async () => {
      if (!closed) proc.kill('SIGKILL')
      return await done
    }
  }
}

async function snapshot(executionId: string) {
  assert(resource)
  const { PostgresExecutionStepStore, withTenantContext } =
    await import('@cvg/persistence')
  const { TenantIdSchema } = await import('@cvg/platform')
  const store = new PostgresExecutionStepStore(resource.pool)
  const checkpoint = await store.loadCheckpoint(journalTenant, executionId)
  const rows = await withTenantContext(
    resource.pool,
    TenantIdSchema.parse(journalTenant),
    async (c) => ({
      backendPid: (
        await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]!.pid,
      journal: (
        await c.query(
          `SELECT tenant_id,operation_key,proposal_hash,state,attempt_id,result,result IS NOT NULL AS result_present,result_storage_version,result_storage_payload,error,created_at::text,updated_at::text FROM operational_effect_journal WHERE tenant_id=$1 AND left(operation_key,length($2)+1)=$2||':' ORDER BY operation_key`,
          [journalTenant, executionId]
        )
      ).rows,
      checkpoints: (
        await c.query(
          `SELECT checkpoint_id,checkpoint_version,digest,octet_length(state::text) AS physical_bytes,state->>'storageCodec' AS storage_codec FROM operational_execution_checkpoints WHERE tenant_id=$1 AND execution_id=$2`,
          [journalTenant, executionId]
        )
      ).rows,
      steps: (
        await c.query(
          `SELECT step_number,step_type,status,attempt,observation_refs FROM operational_execution_steps WHERE tenant_id=$1 AND execution_id=$2 ORDER BY step_number`,
          [journalTenant, executionId]
        )
      ).rows
    })
  )
  return { checkpoint, ...rows }
}

const complete = (
  checkpoint: Awaited<ReturnType<typeof snapshot>>['checkpoint']
) =>
  checkpoint?.state.observations.find(
    (o) =>
      o.type === 'TOOL_RESULT' &&
      (o.payload as { completion?: string }).completion === 'COMPLETE'
  )
const json = (dir: string, name: string) =>
  privateJournalJson(join(dir, name), 2 * 1024 * 1024) as Record<
    string,
    unknown
  >

describe(
  'SPEC0225 public factory restart — finite J09/J10 JSON matrix',
  { concurrency: false },
  () => {
    for (const point of ['cas', 'journal'] as const)
      for (const id of publicJournalCaseIds) {
        it(
          `${point}: SIGKILL/recreate ${id} preserves full tool bytes with one body`,
          { timeout: 60000 },
          async () => {
            assert(resource)
            verifyNativeJournalBinding()
            const identity = publicJournalIdentity(binding, point, id)
            mkdirSync(identity.dir, { recursive: true, mode: 0o700 })
            const { withTenantContext } = await import('@cvg/persistence')
            const { TenantIdSchema } = await import('@cvg/platform')
            const { canonicalizeCompleteJson } =
              await import('@cvg/harness-contracts')
            const expectedValue = publicJournalValue(id)
            const expectedText = canonicalizeCompleteJson(expectedValue)
            const expectedSha = createHash('sha256')
              .update(expectedText)
              .digest('hex')
            const save = (name: string, value: unknown) =>
              writeFileSync(
                join(identity.dir, name),
                JSON.stringify(value, null, 2) + '\n',
                { mode: 0o600 }
              )
            await withTenantContext(
              resource.pool,
              TenantIdSchema.parse(journalTenant),
              (c) =>
                c.query(
                  `INSERT INTO operational_executions(tenant_id,id,idempotency_key,request_hash,request,state) VALUES($1,$2,$2,$3,'{}'::jsonb,'RECEIVED')`,
                  [
                    journalTenant,
                    identity.executionId,
                    createHash('sha256')
                      .update(identity.executionId)
                      .digest('hex')
                  ]
                )
            )
            const children: ReturnType<typeof startChild>[] = []
            try {
              const writer = startChild(point, 'writer', id)
              children.push(writer)
              const marker = await writer.ready()
              const beforeKill = await snapshot(identity.executionId)
              const writerReadiness = json(
                identity.dir,
                'writer.readiness.json'
              ) as { backendPid: number }
              assert.notEqual(beforeKill.backendPid, writerReadiness.backendPid)
              assert.equal(beforeKill.journal.length, 1)
              const row = beforeKill.journal[0]!
              assert.equal(row.state, 'CONFIRMED')
              assert.equal(row.result_storage_version, 1)
              assert.equal(row.result, null)
              assert.equal(row.result_present, false)
              assert.equal(
                row.result_storage_payload.decodedSha256,
                expectedSha
              )
              assert.equal(
                row.result_storage_payload.decodedBytes,
                Buffer.byteLength(expectedText)
              )
              assert.equal(marker.operationKey, row.operation_key)
              if (point === 'cas') {
                assert(complete(beforeKill.checkpoint))
                assert.equal(beforeKill.checkpoint!.checkpointVersion, 2)
                assert.deepEqual(marker.token, {
                  checkpointId: beforeKill.checkpoint!.checkpointId,
                  digest: beforeKill.checkpoint!.digest
                })
              } else assert.equal(complete(beforeKill.checkpoint), undefined)
              save('before-kill.json', beforeKill)
              assert.equal(writer.proc.kill('SIGKILL'), true)
              const killed = await writer.done
              assert.equal(killed.code, null)
              assert.equal(killed.signal, 'SIGKILL')
              assert.equal(killed.captureError, undefined)
              const before = await snapshot(identity.executionId)
              save('before-reader.json', before)
              assert.deepEqual(
                { ...before, backendPid: null },
                { ...beforeKill, backendPid: null }
              )
              const reader = startChild(point, 'reader', id)
              children.push(reader)
              const read = await reader.done
              assert.equal(read.code, 0)
              assert.equal(read.signal, null)
              assert.equal(read.captureError, undefined)
              assert.notEqual(read.pid, killed.pid)
              const after = await snapshot(identity.executionId)
              save('after-reader.json', after)
              const outcome = json(identity.dir, 'reader.outcome.json') as {
                pid: number
                result: { stopReason: string; response?: string }
              }
              assert.equal(outcome.pid, read.pid)
              assert.equal(outcome.result.stopReason, 'COMPLETED')
              assert.equal(
                outcome.result.response,
                `sha256:${expectedSha};bytes:${Buffer.byteLength(expectedText)};type:${typeof expectedValue}`
              )
              const bodies = readFileSync(
                join(identity.dir, 'bodies.jsonl'),
                'utf8'
              )
                .trim()
                .split('\n')
                .map((s) => JSON.parse(s))
              assert.equal(bodies.length, 1)
              assert.equal(bodies[0].pid, killed.pid)
              const wt = json(identity.dir, 'writer.trace.json') as {
                requests: unknown[]
                results: {
                  inputTokens: number
                  outputTokens: number
                  costUsd: number
                }[]
                measurements: unknown[]
              }
              const rt = json(identity.dir, 'reader.trace.json') as {
                requests: { messages: { content: string }[] }[]
                results: {
                  inputTokens: number
                  outputTokens: number
                  costUsd: number
                }[]
                measurements: unknown[]
              }
              assert.equal(wt.requests.length, 1)
              assert.equal(rt.requests.length, 1)
              assert(wt.measurements.length >= 1 && rt.measurements.length >= 1)
              const observation = complete(after.checkpoint)
              assert(observation)
              const payload = observation.payload as {
                output: unknown
                outputBytes: number
                outputSha256: string
              }
              assert(
                canonicalizeCompleteJson(payload.output) === expectedText,
                'checkpoint output bytes changed'
              )
              assert.equal(payload.outputSha256, expectedSha)
              assert.equal(payload.outputBytes, Buffer.byteLength(expectedText))
              const frame = JSON.parse(rt.requests[0]!.messages[1]!.content)
              const item = frame.items.find(
                (x: { value?: { type?: string } }) =>
                  x.value?.type === 'TOOL_RESULT'
              )
              assert(item && Object.hasOwn(item.value.payload, 'output'))
              assert(
                canonicalizeCompleteJson(item.value.payload.output) ===
                  expectedText,
                'actual model frame output bytes changed'
              )
              assert.deepEqual(after.journal, before.journal)
              const admissions =
                after.checkpoint!.state.toolResultContext!.decisionAdmissions
              assert.deepEqual(
                admissions.map((x) => x.status),
                ['SETTLED', 'SETTLED']
              )
              assert.equal(
                new Set(admissions.map((x) => x.admissionId)).size,
                2
              )
              const usage = [...wt.results, ...rt.results]
              assert.equal(after.checkpoint!.budgetUsage.modelCalls, 2)
              assert.equal(before.checkpoint!.budgetUsage.modelCalls, 1)
              assert.equal(
                after.checkpoint!.budgetUsage.inputTokens,
                usage.reduce((s, x) => s + x.inputTokens, 0)
              )
              assert.equal(
                after.checkpoint!.budgetUsage.outputTokens,
                usage.reduce((s, x) => s + x.outputTokens, 0)
              )
              assert.deepEqual(
                admissions.map((x) => ({ ...x.actual })),
                usage.map((x) => ({
                  modelCalls: 1,
                  inputTokens: x.inputTokens,
                  outputTokens: x.outputTokens,
                  costUsd: x.costUsd
                }))
              )
              save('PASS.json', {
                scope: 'PUBLIC_J09_J10_JSON_MATRIX_ONLY',
                point,
                id,
                writerPid: killed.pid,
                readerPid: read.pid,
                writerSignal: killed.signal,
                bodyCalls: bodies.length,
                modelCalls: usage.length,
                fullOutputBytes: Buffer.byteLength(expectedText),
                fullOutputSha256: expectedSha,
                physicalJournalVersion: 1,
                checkpointVersion: 2,
                distinctSettledAdmissions: 2,
                resourceId: binding.containerId
              })
            } finally {
              for (const child of children)
                if (!child.isClosed()) await child.stop()
              const dest = join(
                binding.evidenceRoot,
                binding.runId + '-public',
                point + '-' + id
              )
              mkdirSync(dest, { recursive: true })
              for (const name of readdirSync(identity.dir))
                copyFileSync(join(identity.dir, name), join(dest, name))
            }
          }
        )
      }
  }
)
