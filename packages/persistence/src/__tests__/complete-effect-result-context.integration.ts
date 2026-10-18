import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  copyFileSync
} from 'node:fs'
import { join } from 'node:path'
import {
  verifyNativeJournalBinding,
  privateJournalJson,
  journalRoot,
  journalTenant,
  journalContextIds,
  journalContextValue,
  publicJournalIdentity,
  journalRecoveryFaultPoints,
  type JournalRecoveryFaultPoint,
  type JournalContextId,
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

const load = (dir: string, name: string) =>
  privateJournalJson(join(dir, name), 8 * 1024 * 1024) as Record<
    string,
    unknown
  >
const sha = (text: string) => createHash('sha256').update(text).digest('hex')

async function snapshot(executionId: string) {
  assert(resource)
  const { withTenantContext, PostgresExecutionStepStore } = (await import(
    '../../dist/index.js' as string
  )) as typeof import('../index.ts')
  const { TenantIdSchema } = await import('@cvg/platform')
  const checkpoint = await new PostgresExecutionStepStore(
    resource.pool
  ).loadCheckpoint(journalTenant, executionId)
  const journal = await withTenantContext(
    resource.pool,
    TenantIdSchema.parse(journalTenant),
    async (client) =>
      (
        await client.query(
          `SELECT operation_key,state,attempt_id,result,result IS NOT NULL AS result_present,result_storage_version,result_storage_payload,error,created_at::text,updated_at::text FROM operational_effect_journal WHERE tenant_id=$1 AND left(operation_key,length($2)+1)=$2||':' ORDER BY operation_key`,
          [journalTenant, executionId]
        )
      ).rows
  )
  const steps = await new PostgresExecutionStepStore(resource.pool).listSteps(
    journalTenant,
    executionId
  )
  return { checkpoint, journal, steps }
}

function phase(
  point: 'context' | 'save-failure' | JournalRecoveryFaultPoint,
  role: 'writer' | 'reader' | 'resolver',
  id: JournalContextId
) {
  const identity = publicJournalIdentity(binding, point, id)
  const argv = [
    '--experimental-strip-types',
    join(
      journalRoot,
      'packages/persistence/src/__tests__/fixtures/journal-result-process.ts'
    ),
    point + '-' + role,
    id
  ]
  const child = spawnSync(process.execPath, argv, {
    cwd: journalRoot,
    env: process.env,
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 65536
  })
  writeFileSync(
    join(identity.dir, role + '.command.json'),
    JSON.stringify(
      {
        argv: [process.execPath, ...argv],
        cwd: journalRoot,
        pid: child.pid,
        code: child.status,
        signal: child.signal,
        stdout: child.stdout,
        stderr: child.stderr,
        error: child.error
          ? { name: child.error.name, message: child.error.message }
          : null
      },
      null,
      2
    ) + '\n',
    { mode: 0o600 }
  )
  assert.equal(
    child.status,
    0,
    'bounded context phase failed; inspect command/trace'
  )
  assert.equal(child.signal, null)
  assert.equal(child.error, undefined)
  return child.pid
}

interface Trace {
  requests: { messages: { content: string }[] }[]
  results: { inputTokens: number; outputTokens: number; costUsd: number }[]
  cas: {
    injectedBeforeNativeCAS?: boolean
    durableJournalState?: string
    error?: { message: string }
  }[]
}

describe(
  'SPEC0225 J11 context boundaries and post-confirm save failure',
  { concurrency: false },
  () => {
    const cases = [
      ...journalContextIds.map((id) => ({ id, point: 'context' as const })),
      { id: 'small' as const, point: 'save-failure' as const },
      { id: 'large300k' as const, point: 'save-failure' as const }
    ]
    for (const { id, point } of cases)
      it(
        `${point}/${id}: confirmed full output survives fresh process without repeated body`,
        { timeout: 120000 },
        async () => {
          assert(resource)
          verifyNativeJournalBinding()
          const identity = publicJournalIdentity(binding, point, id)
          mkdirSync(identity.dir, { recursive: true, mode: 0o700 })
          const save = (name: string, value: unknown) =>
            writeFileSync(
              join(identity.dir, name),
              JSON.stringify(value, null, 2) + '\n',
              { mode: 0o600 }
            )
          const { withTenantContext } = (await import(
            '../../dist/index.js' as string
          )) as typeof import('../index.ts')
          const { TenantIdSchema } = await import('@cvg/platform')
          const { canonicalizeCompleteJson } =
            await import('@cvg/harness-contracts')
          const text = canonicalizeCompleteJson(journalContextValue(id), {
            maxBytes: 1048576,
            maxDepth: 64,
            maxNodes: 1000000
          })
          if (id.includes('32768')) assert.equal(Buffer.byteLength(text), 32768)
          if (id.includes('32769')) assert.equal(Buffer.byteLength(text), 32769)
          if (id === 'large300k')
            assert.equal(Buffer.byteLength(text), 300 * 1024)
          const unavailable = [
            'ascii32769',
            'unicode32769',
            'depth33',
            'nodes10001',
            'large300k'
          ].includes(id)
          const frameOverflow = id === 'ascii32768'
          const reason = ['depth33', 'nodes10001'].includes(id)
            ? 'RESULT_COMPLEXITY'
            : 'RESULT_TOO_LARGE'
          await withTenantContext(
            resource.pool,
            TenantIdSchema.parse(journalTenant),
            (client) =>
              client.query(
                `INSERT INTO operational_executions(tenant_id,id,idempotency_key,request_hash,request,state) VALUES($1,$2,$2,$3,'{}'::jsonb,'RECEIVED')`,
                [journalTenant, identity.executionId, sha(identity.executionId)]
              )
          )
          try {
            const writerPid = phase(point, 'writer', id)
            const before = await snapshot(identity.executionId)
            save('before-reader.json', before)
            const readerPid = phase(point, 'reader', id)
            const after = await snapshot(identity.executionId)
            save('after-reader.json', after)
            assert.notEqual(writerPid, readerPid)
            assert.equal(before.journal.length, 1)
            assert.deepEqual(
              after.journal,
              before.journal,
              'restart changed confirmed journal'
            )
            const nativeTool = before.steps.filter(
              (step) => step.stepType === 'TOOL'
            )
            assert.equal(nativeTool.length, 1)
            assert.equal(nativeTool[0]!.status, 'SUCCEEDED')
            assert.equal(nativeTool[0]!.attempt, 1)
            assert.equal(nativeTool[0]!.observationRefs.length, 1)
            assert.equal(
              new Date(nativeTool[0]!.completedAt!).toISOString(),
              nativeTool[0]!.completedAt
            )
            assert.deepEqual(
              after.steps.filter((step) => step.stepType === 'TOOL'),
              nativeTool,
              'recovery mutated the settled step, ref or attempt'
            )
            const row = before.journal[0]!
            assert.equal(row.state, 'CONFIRMED')
            assert.equal(row.result_storage_version, 1)
            assert.equal(row.result_present, false)
            assert.equal(row.result, null)
            assert.equal(row.error, null)
            const envelope = row.result_storage_payload
            const physical = Buffer.from(envelope.data, 'base64')
            assert.equal(physical.toString('base64'), envelope.data)
            assert.equal(physical.toString('utf8'), text)
            assert.equal(envelope.decodedBytes, Buffer.byteLength(text))
            assert.equal(envelope.decodedSha256, sha(text))
            const bodies = readFileSync(
              join(identity.dir, 'bodies.jsonl'),
              'utf8'
            )
              .trim()
              .split('\n')
              .map((line) => JSON.parse(line))
            assert.equal(bodies.length, 1)
            assert.equal(bodies[0].pid, writerPid)
            assert.equal(bodies[0].sha256, sha(text))
            const wt = load(
              identity.dir,
              'writer.trace.json'
            ) as unknown as Trace
            const rt = load(
              identity.dir,
              'reader.trace.json'
            ) as unknown as Trace
            const writer = load(identity.dir, 'writer.outcome.json') as {
              result: { stopReason: string; response: string; steps: number }
            }
            const reader = load(identity.dir, 'reader.outcome.json') as {
              result: { stopReason: string; response: string; steps: number }
            }
            const obs = after.checkpoint?.state.observations.find(
              (o) => o.type === 'TOOL_RESULT'
            )
            assert(obs)
            const payload = obs.payload as {
              status: string
              completion: string
              resultAvailability: string
              reason?: string
              output?: unknown
              outputSha256?: string
              outputBytes?: number
            }
            assert.equal(payload.status, 'SUCCEEDED')
            if (unavailable) {
              assert.equal(payload.completion, 'UNAVAILABLE')
              assert.equal(payload.resultAvailability, 'UNAVAILABLE')
              assert.equal(payload.reason, reason)
              assert(!Object.hasOwn(payload, 'output'))
              assert.equal(wt.requests.length, 1)
              assert.equal(rt.requests.length, 0)
              assert.notEqual(writer.result.stopReason, 'COMPLETED')
              assert.notEqual(reader.result.stopReason, 'COMPLETED')
            } else {
              assert.equal(payload.completion, 'COMPLETE')
              assert.equal(payload.outputSha256, sha(text))
              assert.equal(payload.outputBytes, Buffer.byteLength(text))
              assert.equal(
                canonicalizeCompleteJson(payload.output, {
                  maxBytes: 1048576,
                  maxDepth: 64,
                  maxNodes: 1000000
                }),
                text
              )
              if (frameOverflow) {
                assert.equal(wt.requests.length, 1)
                assert.equal(rt.requests.length, 0)
                assert.equal(writer.result.stopReason, 'INSUFFICIENT_EVIDENCE')
                assert.match(writer.result.response, /^CONTEXT_OVERFLOW:/)
              } else {
                const modelTrace = point === 'save-failure' ? rt : wt
                assert.equal(
                  wt.requests.length,
                  point === 'save-failure' ? 1 : 2
                )
                assert.equal(
                  rt.requests.length,
                  point === 'save-failure' ? 1 : 0
                )
                const request = modelTrace.requests.at(-1)!
                const frame = JSON.parse(request.messages[1]!.content)
                const tool = frame.items.find(
                  (x: { value?: { type?: string } }) =>
                    x.value?.type === 'TOOL_RESULT'
                )
                assert(tool && Object.hasOwn(tool.value.payload, 'output'))
                assert.equal(
                  canonicalizeCompleteJson(tool.value.payload.output, {
                    maxBytes: 1048576,
                    maxDepth: 64,
                    maxNodes: 1000000
                  }),
                  text
                )
                assert.equal(
                  (point === 'save-failure' ? reader : writer).result
                    .stopReason,
                  'COMPLETED'
                )
              }
            }
            if (point === 'save-failure') {
              const faults = wt.cas.filter((x) => x.injectedBeforeNativeCAS)
              assert(faults.length >= 1)
              assert(
                faults.every(
                  (x) =>
                    x.durableJournalState === 'CONFIRMED' &&
                    x.error?.message ===
                      'SYNTHETIC_J11_POST_CONFIRM_SAVE_FAILED'
                )
              )
              assert.notEqual(writer.result.stopReason, 'COMPLETED')
              assert(
                !before.checkpoint!.state.observations.some(
                  (o) => o.type === 'TOOL_RESULT'
                )
              )
              assert.equal(obs.observationId, nativeTool[0]!.observationRefs[0])
              assert.equal(obs.stepId, nativeTool[0]!.stepId)
              assert.equal(obs.timestamp, nativeTool[0]!.completedAt)
              assert.equal(obs.provenance.operationKey, row.operation_key)
              assert.equal(obs.provenance.effectRef, row.operation_key)
              assert.equal(
                writer.result.steps,
                before.checkpoint!.budgetUsage.steps + 1
              )
              assert.equal(
                after.checkpoint!.budgetUsage.steps,
                before.checkpoint!.budgetUsage.steps +
                  1 +
                  (unavailable ? 0 : 1),
                'count the recovered tool once and a response only when the result is deliverable'
              )
              assert.equal(
                reader.result.steps,
                after.checkpoint!.budgetUsage.steps
              )
            }
            const usage = [...wt.results, ...rt.results]
            const checkpoint = after.checkpoint!
            assert.equal(checkpoint.budgetUsage.modelCalls, usage.length)
            for (const key of [
              'inputTokens',
              'outputTokens',
              'costUsd'
            ] as const)
              assert.equal(
                checkpoint.budgetUsage[key],
                usage.reduce((sum, item) => sum + item[key], 0)
              )
            const admissions =
              checkpoint.state.toolResultContext!.decisionAdmissions
            assert.equal(admissions.length, usage.length)
            assert(admissions.every((item) => item.status === 'SETTLED'))
            assert.equal(
              new Set(admissions.map((item) => item.admissionId)).size,
              usage.length
            )
            assert.deepEqual(
              admissions.map((item) => ({ ...item.actual })),
              usage.map((item) => ({
                modelCalls: 1,
                inputTokens: item.inputTokens,
                outputTokens: item.outputTokens,
                costUsd: item.costUsd
              }))
            )
            save('PASS.json', {
              scope: 'J11_ONLY_NOT_GLOBAL_QUALIFICATION',
              id,
              point,
              writerPid,
              readerPid,
              bodyCalls: 1,
              outputBytes: Buffer.byteLength(text),
              outputSha256: sha(text),
              contextCompletion: payload.completion,
              modelCalls: usage.length,
              writerStop: writer.result.stopReason,
              readerStop: reader.result.stopReason,
              resourceId: binding.containerId
            })
          } finally {
            const dest = join(
              binding.evidenceRoot,
              binding.runId + '-context',
              point + '-' + id
            )
            mkdirSync(dest, { recursive: true })
            for (const name of readdirSync(identity.dir))
              copyFileSync(join(identity.dir, name), join(dest, name))
          }
        }
      )
  }
)

describe(
  'SPEC0225 recovery fault boundaries — unbound only',
  { concurrency: false },
  () => {
    for (const point of journalRecoveryFaultPoints)
      it(
        `${point}: no replay or unproved continuation`,
        { timeout: 120000 },
        async () => {
          assert(resource)
          verifyNativeJournalBinding()
          const identity = publicJournalIdentity(binding, point, 'small')
          mkdirSync(identity.dir, { recursive: true, mode: 0o700 })
          const save = (name: string, value: unknown) =>
            writeFileSync(
              join(identity.dir, name),
              JSON.stringify(value, null, 2) + '\n',
              { mode: 0o600 }
            )
          const { withTenantContext } = (await import(
            '../../dist/index.js' as string
          )) as typeof import('../index.ts')
          const { TenantIdSchema } = await import('@cvg/platform')
          await withTenantContext(
            resource.pool,
            TenantIdSchema.parse(journalTenant),
            (client) =>
              client.query(
                `INSERT INTO operational_executions(tenant_id,id,idempotency_key,request_hash,request,state) VALUES($1,$2,$2,$3,'{}'::jsonb,'RECEIVED')`,
                [journalTenant, identity.executionId, sha(identity.executionId)]
              )
          )
          try {
            const writerPid = phase(point, 'writer', 'small')
            const before = await snapshot(identity.executionId)
            save('before-reader.json', before)
            assert.equal(before.journal.length, 1)
            assert.equal(before.journal[0]!.state, 'CONFIRMED')
            assert.equal(before.journal[0]!.result_storage_version, 1)
            assert.equal(before.steps.length, 1)
            const step = before.steps[0]!
            assert.equal(step.status, 'SUCCEEDED')
            assert.equal(step.attempt, 1)
            assert.equal(step.observationRefs.length, 1)
            assert(step.completedAt)
            assert(before.checkpoint)
            assert.equal(before.checkpoint.state.pendingStepNumber, 1)
            assert(
              !before.checkpoint.state.observations.some(
                (o) => o.type === 'TOOL_RESULT'
              )
            )
            assert.equal(before.checkpoint.budgetUsage.steps, 0)
            const readerPid = phase(point, 'reader', 'small')
            assert.notEqual(writerPid, readerPid)
            const after = await snapshot(identity.executionId)
            save('after-reader.json', after)
            assert.deepEqual(after.journal, before.journal)
            assert.deepEqual(after.steps, before.steps)
            const wt = load(
              identity.dir,
              'writer.trace.json'
            ) as unknown as Trace
            const rt = load(
              identity.dir,
              'reader.trace.json'
            ) as unknown as Trace & {
              journal: { method: string; state: string; qualified: boolean }[]
              audit: { action: string }[]
              cas: {
                input: {
                  next: {
                    state: {
                      stepNumber: number
                      pendingStepNumber?: number
                      observations: { type: string }[]
                    }
                  }
                }
                result?: {
                  status: string
                  token: { checkpointId: string; digest: string }
                }
                injectedBeforeNativeCAS?: boolean
              }[]
            }
            const outcome = load(identity.dir, 'reader.outcome.json') as {
              result: { stopReason: string; steps: number; response: string }
            }
            const controls = load(identity.dir, 'reader.controls.json')
            assert.equal(wt.requests.length, 1)
            assert.equal(wt.results.length, 1)
            assert.equal(rt.requests.length, 0)
            assert.equal(rt.results.length, 0)
            assert.equal(
              outcome.result.steps,
              before.checkpoint.budgetUsage.steps
            )
            const reads = rt.journal.filter((entry) => entry.method === 'get')
            const ack = point === 'recovery-cas-ack-lost'
            const casFailure =
              point === 'recovery-cas-failed' ||
              point === 'recovery-cas-failed-audit-failed'
            const inactive =
              point === 'recovery-cancelled' || point === 'recovery-paused'
            assert.equal(reads.length, inactive ? 0 : 1)
            assert(
              reads.every(
                (entry) => entry.state === 'CONFIRMED' && entry.qualified
              )
            )
            assert.equal(
              rt.cas.length,
              ack || casFailure ? 1 : 0,
              'failed recovery attempted an additional checkpoint write'
            )
            if (ack || casFailure) {
              const attempt = rt.cas[0]!
              assert.equal(attempt.input.next.state.stepNumber, 1)
              assert.equal(
                attempt.input.next.state.pendingStepNumber,
                undefined
              )
              assert(
                attempt.input.next.state.observations.some(
                  (o) => o.type === 'TOOL_RESULT'
                )
              )
              assert.equal(attempt.injectedBeforeNativeCAS === true, casFailure)
            }
            if (point === 'recovery-cas-failed-audit-failed') {
              assert(
                rt.audit.some((event) => event.action === 'runtime.stopped')
              )
              assert.match(outcome.result.response, /audit recording failed/)
            }
            if (point === 'recovery-cancelled') {
              assert.equal(controls.cancelled, true)
              assert.equal(outcome.result.stopReason, 'CANCELLED')
            } else if (point === 'recovery-paused') {
              assert.equal(controls.paused, true)
              assert.equal(outcome.result.stopReason, 'HUMAN_TAKEOVER')
            } else if (point === 'recovery-read-deadline') {
              assert.equal(controls.durationMs, 1000)
              assert.equal(outcome.result.stopReason, 'MAX_DURATION')
            } else
              assert.equal(outcome.result.stopReason, 'INSUFFICIENT_EVIDENCE')
            let resolverPid: number | null = null
            if (ack) {
              assert(after.checkpoint)
              assert.equal(rt.cas[0]!.result!.status, 'APPLIED')
              assert.deepEqual(rt.cas[0]!.result!.token, {
                checkpointId: after.checkpoint.checkpointId,
                digest: after.checkpoint.digest
              })
              assert.equal(after.checkpoint.state.stepNumber, 1)
              assert.equal(after.checkpoint.state.pendingStepNumber, undefined)
              assert.equal(after.checkpoint.budgetUsage.steps, 1)
              assert.deepEqual(
                { ...after.checkpoint.budgetUsage, steps: 0 },
                before.checkpoint.budgetUsage
              )
              assert.deepEqual(
                after.checkpoint.state.toolResultContext!.decisionAdmissions,
                before.checkpoint.state.toolResultContext!.decisionAdmissions
              )
              const recovered = after.checkpoint.state.observations.find(
                (o) => o.type === 'TOOL_RESULT'
              )!
              assert.equal(recovered.observationId, step.observationRefs[0])
              assert.equal(recovered.timestamp, step.completedAt)
              resolverPid = phase(point, 'resolver', 'small')
              assert(resolverPid !== writerPid && resolverPid !== readerPid)
              const resolved = await snapshot(identity.executionId)
              save('after-resolver.json', resolved)
              const resolver = load(
                identity.dir,
                'resolver.trace.json'
              ) as unknown as Trace
              const final = load(identity.dir, 'resolver.outcome.json') as {
                result: { stopReason: string }
              }
              assert.equal(final.result.stopReason, 'COMPLETED')
              assert.equal(resolver.requests.length, 1)
              assert.deepEqual(resolved.journal, before.journal)
              assert.deepEqual(
                resolved.steps.filter((s) => s.stepType === 'TOOL'),
                before.steps
              )
              assert.equal(resolved.checkpoint!.budgetUsage.steps, 2)
              const calls = [...wt.results, ...resolver.results]
              assert.equal(
                resolved.checkpoint!.budgetUsage.modelCalls,
                calls.length
              )
              for (const key of [
                'inputTokens',
                'outputTokens',
                'costUsd'
              ] as const)
                assert.equal(
                  resolved.checkpoint!.budgetUsage[key],
                  calls.reduce((sum, call) => sum + call[key], 0)
                )
              const receipts =
                resolved.checkpoint!.state.toolResultContext!.decisionAdmissions
              assert.equal(receipts.length, 2)
              assert(receipts.every((r) => r.status === 'SETTLED'))
              assert.equal(new Set(receipts.map((r) => r.admissionId)).size, 2)
              const frame = JSON.parse(
                resolver.requests[0]!.messages[1]!.content
              )
              const tool = frame.items.find(
                (item: { value?: { type?: string } }) =>
                  item.value?.type === 'TOOL_RESULT'
              )
              assert(tool)
              const { canonicalizeCompleteJson } =
                await import('@cvg/harness-contracts')
              const canonical = canonicalizeCompleteJson(
                tool.value.payload.output
              )
              assert.equal(
                sha(canonical),
                before.journal[0]!.result_storage_payload.decodedSha256
              )
              assert.equal(tool.value.observationId, step.observationRefs[0])
            } else
              assert.deepEqual(
                after,
                before,
                'failed recovery changed durable checkpoint/steps/journal'
              )
            const bodies = readFileSync(
              join(identity.dir, 'bodies.jsonl'),
              'utf8'
            )
              .trim()
              .split('\n')
              .map((line) => JSON.parse(line))
            assert.equal(bodies.length, 1)
            assert.equal(bodies[0].pid, writerPid)
            save('PASS.json', {
              scope: 'UNBOUND_RECOVERY_FAULT_ONLY',
              point,
              writerPid,
              readerPid,
              resolverPid,
              bodyCalls: 1,
              newReaderModelCalls: 0,
              readerCASAttempts: rt.cas.length,
              nativeCommitAckLost: ack,
              originalJournalAndStepUnchanged: true,
              resourceId: binding.containerId
            })
          } finally {
            const dest = join(
              binding.evidenceRoot,
              binding.runId + '-faults',
              point
            )
            mkdirSync(dest, { recursive: true })
            for (const name of readdirSync(identity.dir))
              copyFileSync(join(identity.dir, name), join(dest, name))
          }
        }
      )
  }
)
