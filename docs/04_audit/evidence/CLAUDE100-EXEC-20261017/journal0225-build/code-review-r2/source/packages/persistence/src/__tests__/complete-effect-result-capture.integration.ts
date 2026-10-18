import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  readFileSync
} from 'node:fs'
import { join } from 'node:path'
import {
  verifyNativeJournalBinding,
  privateJournalJson,
  journalRoot,
  journalTenant,
  journalCaptureIds,
  journalCaptureIdentity,
  journalCaptureRecipe,
  type JournalCaptureId,
  type NativeJournalBinding
} from './fixtures/journal-result-process.ts'
import { createJournalResourceFixture } from './fixtures/journal-result-resource.ts'

let binding: NativeJournalBinding
let resource: ReturnType<typeof createJournalResourceFixture> | undefined
before(async () => {
  binding = verifyNativeJournalBinding()
  assert.equal(binding.profile, 'capture-journal')
  resource = createJournalResourceFixture(binding)
  await resource.setup()
})
after(async () => {
  await resource?.cleanup()
})
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
const load = <T>(dir: string, name: string) =>
  privateJournalJson(join(dir, name), 512 * 1024) as T
const save = (dir: string, name: string, value: unknown) =>
  writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600
  })

interface Usage {
  inputTokens: number
  outputTokens: number
  costUsd: number
}
interface Trace {
  pid: number
  bodyCalls: number
  requests: unknown[]
  results: Usage[]
  sql: string[]
  journal: {
    method: string
    outputBytes?: number
    record?: { state: string }
    error?: { code: string; message: string }
    reason?: string
  }[]
}
interface Probe {
  state: string
  attemptId: string
  resultPresent: boolean
  resultBytes: number | null
  resultSha256: string | null
  qualifiedRead: boolean
}

function phase(id: JournalCaptureId, role: 'writer' | 'reader') {
  const identity = journalCaptureIdentity(binding, id)
  const argv = [
    '--experimental-strip-types',
    join(
      journalRoot,
      'packages/persistence/src/__tests__/fixtures/journal-result-process.ts'
    ),
    'capture-' + role,
    id
  ]
  const child = spawnSync(process.execPath, argv, {
    cwd: journalRoot,
    env: process.env,
    encoding: 'utf8',
    timeout: 45000,
    maxBuffer: 65536
  })
  save(identity.dir, role + '.command.json', {
    argv: [process.execPath, ...argv],
    pid: child.pid,
    code: child.status,
    signal: child.signal,
    stdout: child.stdout,
    stderr: child.stderr,
    error: child.error
      ? { name: child.error.name, message: child.error.message }
      : null
  })
  assert.equal(
    child.status,
    0,
    'contained capture phase failed; inspect command/trace'
  )
  assert.equal(child.signal, null)
  assert.equal(child.error, undefined)
  const result = JSON.parse(child.stdout)
  assert.equal(result.event, 'FINISHED')
  assert.equal(result.pid, child.pid)
  return child.pid
}

async function snapshot(executionId: string) {
  assert(resource)
  const { withTenantContext, PostgresExecutionStepStore } =
    await import('../../dist/index.js')
  const { TenantIdSchema } = await import('@cvg/platform')
  const journal = await withTenantContext(
    resource.pool,
    TenantIdSchema.parse(journalTenant),
    async (client) =>
      (
        await client.query(
          `SELECT operation_key,proposal_hash,state,attempt_id,result IS NOT NULL AS result_present,result_storage_version,
     CASE WHEN result_storage_payload IS NULL THEN NULL ELSE jsonb_build_object(
       'encoding',result_storage_payload->>'encoding','decodedBytes',result_storage_payload->'decodedBytes',
       'decodedSha256',result_storage_payload->>'decodedSha256','dataChars',length(result_storage_payload->>'data'),
       'envelopeBytes',octet_length(result_storage_payload::text)) END AS payload_meta,
     error,created_at::text,updated_at::text FROM operational_effect_journal WHERE tenant_id=$1 AND operation_key=$2`,
          [journalTenant, executionId + ':s1:synthetic.j225.capture.echo']
        )
      ).rows
  )
  const store = new PostgresExecutionStepStore(resource.pool)
  return {
    journal,
    checkpoint: await store.loadCheckpoint(journalTenant, executionId),
    steps: await store.listSteps(journalTenant, executionId)
  }
}

describe(
  'SPEC0225 J12 capture component — distinct from journal confirmation',
  { concurrency: false },
  () => {
    it('accepts exactly 8388608 bytes of the entire plain ToolResult', async () => {
      const { prepareCompleteToolResult } =
        await import('../../../harness/dist/complete-tool-results.js')
      const raw = { output: 'a'.repeat(8388574), status: 'SUCCEEDED' as const }
      assert.equal(Buffer.byteLength(JSON.stringify(raw)), 8388608)
      const prepared = prepareCompleteToolResult(raw)
      assert.equal(prepared.status, 'SUCCEEDED')
      assert.equal(prepared.output, raw.output)
      save(
        binding.evidenceRoot,
        binding.runId + '-capture-component-limit.json',
        {
          scope: 'ACTUAL_COMPILED_CAPTURE_COMPONENT_ONLY',
          bytes: 8388608,
          outputBytes: 8388576,
          accepted: true,
          journalConfirmed: false,
          modelCalls: 0,
          toolBodies: 0
        }
      )
    })
    it('rejects exactly 8388609 bytes before a journal confirmation is involved', async () => {
      const { prepareCompleteToolResult } =
        await import('../../../harness/dist/complete-tool-results.js')
      const raw = { output: 'a'.repeat(8388575), status: 'SUCCEEDED' as const }
      assert.equal(Buffer.byteLength(JSON.stringify(raw)), 8388609)
      assert.throws(() => prepareCompleteToolResult(raw), {
        message: 'unknown_effect: complete_result_not_representable'
      })
      save(
        binding.evidenceRoot,
        binding.runId + '-capture-component-plus-one.json',
        {
          scope: 'ACTUAL_COMPILED_CAPTURE_COMPONENT_ONLY',
          bytes: 8388609,
          rejected: true,
          journalInvolved: false,
          modelCalls: 0,
          toolBodies: 0
        }
      )
    })
  }
)

describe(
  'SPEC0225 J12 public capture and fresh-process refusal',
  { concurrency: false },
  () => {
    const pids = new Set<number>()
    for (const id of journalCaptureIds)
      it(
        id +
          ': capture and journal boundaries remain separate across processes',
        { timeout: 120000 },
        async () => {
          assert(resource)
          verifyNativeJournalBinding()
          const identity = journalCaptureIdentity(binding, id),
            recipe = journalCaptureRecipe(id)
          const captureRejected =
            id === 'capture-plus-one' || id === 'capture-started'
          const uncertainFault = id === 'started' || id === 'capture-started'
          mkdirSync(identity.dir, { recursive: true, mode: 0o700 })
          const { withTenantContext } = await import('../../dist/index.js')
          const { TenantIdSchema } = await import('@cvg/platform')
          await withTenantContext(
            resource.pool,
            TenantIdSchema.parse(journalTenant),
            (client) =>
              client.query(
                "INSERT INTO operational_executions(tenant_id,id,idempotency_key,request_hash,request,state) VALUES($1,$2,$2,$3,'{}'::jsonb,'RECEIVED')",
                [journalTenant, identity.executionId, sha(identity.executionId)]
              )
          )
          try {
            const writerPid = phase(id, 'writer')
            const before = await snapshot(identity.executionId)
            save(identity.dir, 'before-reader.json', before)
            const wt = load<Trace>(identity.dir, 'writer.trace.json')
            assert.equal(wt.pid, writerPid)
            assert.equal(wt.bodyCalls, 1)
            assert.equal(wt.requests.length, 1)
            assert.equal(wt.results.length, 1)
            assert.equal(
              wt.journal.filter((e) => e.method === 'reserve').length,
              1
            )
            assert.equal(
              wt.journal.filter((e) => e.method === 'markStarted').length,
              1
            )
            assert.equal(
              wt.journal.filter((e) => e.method === 'fail').length,
              0
            )
            const confirmations = wt.journal.filter(
              (e) => e.method === 'confirm'
            )
            const settlements = wt.journal.filter(
              (e) => e.method === 'markUncertain'
            )
            assert.equal(confirmations.length, captureRejected ? 0 : 1)
            assert.equal(settlements.length, id === 'journal-limit' ? 0 : 1)
            assert.equal(before.journal.length, 1)
            const row = before.journal[0]!
            const expectedState =
              id === 'journal-limit'
                ? 'CONFIRMED'
                : uncertainFault
                  ? 'EFFECT_STARTED'
                  : 'UNCERTAIN'
            assert.equal(row.state, expectedState)
            assert.equal(row.result_storage_version, 1)
            assert.equal(row.result_present, false)
            assert.notEqual(row.state, 'FAILED')
            if (id !== 'journal-limit' && !captureRejected) {
              assert.equal(confirmations[0]!.outputBytes, recipe.outputBytes)
              assert.equal(confirmations[0]!.error?.code, 'validation_failed')
              assert.equal(
                confirmations[0]!.error?.message,
                'JOURNAL_RESULT_TOO_LARGE'
              )
            }
            if (captureRejected)
              assert.match(
                settlements[0]!.reason!,
                /complete_result_not_representable/
              )
            if (uncertainFault) {
              assert.equal(
                settlements[0]!.error?.message,
                'SYNTHETIC_CAPTURE_UNCERTAIN_UPDATE_FAILURE'
              )
              assert(wt.sql.includes('INJECT_BEFORE_NATIVE_UNCERTAIN_UPDATE'))
              assert.equal(wt.sql.at(-1), 'ROLLBACK')
            }
            const probe = load<Probe>(identity.dir, 'writer.probe-after.json')
            assert.equal(probe.state, expectedState)
            assert.equal(probe.resultPresent, id === 'journal-limit')
            assert.equal(probe.qualifiedRead, id === 'journal-limit')
            if (id === 'journal-limit') {
              assert.equal(row.payload_meta.decodedBytes, 1048576)
              assert.equal(row.payload_meta.dataChars, 1398104)
              assert(row.payload_meta.envelopeBytes <= 1398616)
              assert.equal(probe.resultBytes, 1048576)
              assert.equal(probe.resultSha256, row.payload_meta.decodedSha256)
              assert(before.checkpoint)
              const observation = before.checkpoint.state.observations.find(
                (o) => o.type === 'TOOL_RESULT'
              )!
              assert(observation)
              assert.equal(
                (observation.payload as { completion: string }).completion,
                'UNAVAILABLE'
              )
              assert(
                observation.payload !== null &&
                  typeof observation.payload === 'object'
              )
              assert.equal(Object.hasOwn(observation.payload, 'output'), false)
            } else assert.equal(row.payload_meta, null)
            const bc = before.checkpoint
            assert(bc)
            assert.equal(bc.budgetUsage.modelCalls, 1)
            assert.equal(bc.budgetUsage.toolCalls, 1)
            const admissions = bc.state.toolResultContext!.decisionAdmissions
            assert.equal(admissions.length, 1)
            assert.equal(admissions[0]!.status, 'SETTLED')
            const actual = admissions[0]!.actual
            assert(actual)
            assert.deepEqual(Object.keys(actual).sort(), [
              'costUsd',
              'inputTokens',
              'modelCalls',
              'outputTokens'
            ])
            assert.equal(actual.modelCalls, 1)
            assert.equal(actual.inputTokens, wt.results[0]!.inputTokens)
            assert.equal(actual.outputTokens, wt.results[0]!.outputTokens)
            assert.equal(actual.costUsd, wt.results[0]!.costUsd)
            assert(
              before.steps.some((s) => s.stepType === 'TOOL' && s.sideEffecting)
            )
            const readerPid = phase(id, 'reader')
            assert.notEqual(readerPid, writerPid)
            assert(!pids.has(writerPid) && !pids.has(readerPid))
            pids.add(writerPid)
            pids.add(readerPid)
            const after = await snapshot(identity.executionId)
            save(identity.dir, 'after-reader.json', after)
            const rt = load<Trace>(identity.dir, 'reader.trace.json')
            assert.equal(rt.pid, readerPid)
            assert.equal(rt.bodyCalls, 0)
            assert.equal(rt.requests.length, 0)
            assert.equal(rt.results.length, 0)
            assert.equal(
              rt.journal.filter((e) =>
                ['confirm', 'markStarted', 'markUncertain', 'fail'].includes(
                  e.method
                )
              ).length,
              0
            )
            assert.deepEqual(after.journal, before.journal)
            assert.deepEqual(after.steps, before.steps)
            assert(after.checkpoint)
            assert.deepEqual(
              after.checkpoint.state.toolResultContext!.decisionAdmissions,
              admissions
            )
            assert.deepEqual(
              after.checkpoint.state.observations,
              bc.state.observations
            )
            assert.deepEqual(
              { ...after.checkpoint.budgetUsage, activeDurationMs: 0 },
              { ...bc.budgetUsage, activeDurationMs: 0 }
            )
            assert.deepEqual(
              load<Probe>(identity.dir, 'reader.probe-before.json'),
              probe
            )
            assert.deepEqual(
              load<Probe>(identity.dir, 'reader.probe-after.json'),
              probe
            )
            const bodies = readFileSync(
              join(identity.dir, 'bodies.jsonl'),
              'utf8'
            )
              .trim()
              .split('\n')
              .map((line) => JSON.parse(line))
            assert.equal(bodies.length, 1)
            assert.equal(bodies[0]!.pid, writerPid)
            assert.equal(bodies[0]!.outputBytes, recipe.outputBytes)
            assert.equal(bodies[0]!.toolResultBytes, recipe.toolResultBytes)
            if (id === 'journal-limit')
              assert.equal(bodies[0]!.outputSha256, probe.resultSha256)
            const wo = load<{ result: { stopReason: string } }>(
              identity.dir,
              'writer.outcome.json'
            )
            const ro = load<{ result: { stopReason: string } }>(
              identity.dir,
              'reader.outcome.json'
            )
            assert.notEqual(wo.result.stopReason, 'COMPLETED')
            assert.notEqual(ro.result.stopReason, 'COMPLETED')
            save(identity.dir, 'PASS.json', {
              scope: 'NATIVE_PUBLIC_CAPTURE_BOUNDARIES_ONLY',
              id,
              writerPid,
              readerPid,
              expectedState,
              bodyCalls: bodies.length,
              writerModelCalls: wt.requests.length,
              readerModelCalls: rt.requests.length,
              confirmAttempts: confirmations.length,
              uncertainAttempts: settlements.length,
              outputBytes: recipe.outputBytes,
              toolResultBytes: recipe.toolResultBytes,
              journalStepReceiptUsageUnchanged: true,
              sourceBindingInputs: 37,
              resourceId: binding.containerId
            })
          } finally {
            const destination = join(
              binding.evidenceRoot,
              binding.runId + '-capture',
              id
            )
            mkdirSync(destination, { recursive: true })
            for (const name of readdirSync(identity.dir))
              copyFileSync(join(identity.dir, name), join(destination, name))
          }
        }
      )
  }
)
