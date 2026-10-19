// @vitest-environment node
// SIMULATED_TEST_CONTROL_PATH_NOT_NATIVE_EVIDENCE: the controller runs against
// a simulated engine with the real in-process wrapper cores and a scripted
// fake native client. These tests prove controller/validator mechanisms only.
import { afterAll, describe, expect, it } from 'vitest'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { freezeCaptureGraph } from '../reference-port/bootstrap.mjs'
import { PINS, canonical, sha256 } from './constants.mjs'
import { createCaptureRunner } from './controller.mjs'
import { createEvidence } from './evidence.mjs'
import { assertEvidence, buildReport, parseCanonical } from './report.mjs'
import { HOST_NAMESPACES, simulatedTransport } from './simulation.mjs'

const roots = []
afterAll(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true })
})
async function fixture(manifest = { version: 1, runId: 'sim_run' }) {
  await mkdir(path.join(tmpdir(), 'reference-capture-tests'), {
    recursive: true,
    mode: 0o700
  })
  const base = await mkdtemp(
    path.join(tmpdir(), 'reference-capture-tests', 'c-')
  )
  await chmod(base, 0o700)
  roots.push(base)
  await writeFile(
    path.join(base, 'manifest.json'),
    typeof manifest === 'string' || Buffer.isBuffer(manifest)
      ? manifest
      : JSON.stringify(manifest)
  )
  return base
}
async function run(knobs = {}, options = {}) {
  const base = options.base ?? (await fixture(options.manifest))
  const graph = await freezeCaptureGraph(base)
  const { engine, factory } = simulatedTransport(knobs)
  let removed = false
  const markers = []
  const runner = createCaptureRunner({
    transportFactory: factory,
    pinToolchains: async (_pins, observed) => {
      observed.claudeSha256 = PINS.claudeSha256
      observed.nodeSha256 = PINS.nodeSha256
      observed.dockerSha256 = PINS.dockerSha256
    },
    hostNamespaces: async () => HOST_NAMESPACES,
    createHostMarker: async (nonce) => {
      markers.push(nonce)
      return {
        path: `/tmp/cvg-claude100-exec-20261017/ref-capture-markers/${nonce}`,
        close: async () => {
          removed = true
        },
        get removed() {
          return removed
        }
      }
    },
    ...(options.createEvidence
      ? { createEvidence: options.createEvidence }
      : {})
  })
  const pending = runner(
    {
      manifest: 'manifest.json',
      evidenceRoot: base,
      out: options.out ?? 'capture'
    },
    graph
  )
  if (options.during) options.during(engine)
  const result = await pending
  return {
    result,
    base,
    engine,
    graph,
    out: path.join(base, options.out ?? 'capture')
  }
}
const statuses = (report) => report.cases.map((c) => c.status)
const check = (report, id) => report.checks.find((c) => c.id === id).status

async function loadPublished(out) {
  const report = parseCanonical(await readFile(path.join(out, 'report.json')))
  const files = new Map()
  for (const a of report.artifacts)
    files.set(a.path, await readFile(path.join(out, a.path)))
  return { report, files }
}

describe('simulated controller path', () => {
  it('collects three complete transcripts, publishes once and disposes its snapshot', async () => {
    const { result, base, engine, out } = await run()
    expect(result.exitCode).toBe(0)
    const report = result.report
    expect(report.status).toBe('COLLECTED_REQUIRES_REVIEW')
    expect(statuses(report)).toEqual(['CAPTURED', 'CAPTURED', 'CAPTURED'])
    expect(report.checks.map((c) => c.status)).toEqual([
      ...Array(9).fill('PASS'),
      'NOT_RUN',
      'PASS'
    ])
    expect(report.checks[9].message).toBe('EXTERNAL_GATE_PENDING')
    expect(report.verificationClass).toBe('REFERENCE_CAPTURE_ONLY')
    expect(report.reviewStatus).toBe('PENDING')
    expect(
      report.cases.every((c) => c.semanticQualification === 'NOT_GRANTED')
    ).toBe(true)
    expect(report.limitations).toContain(
      'SIMULATED_TEST_CONTROL_PATH_NOT_NATIVE_EVIDENCE'
    )
    expect(report.cleanup.complete).toBe(true)
    expect(report.cleanup.containers.map((c) => c.status)).toEqual([
      'REMOVED',
      'REMOVED'
    ])
    expect(engine.containers.size).toBe(0)
    expect(engine.calls).toBeLessThanOrEqual(32)
    const published = await readFile(path.join(out, 'report.json'))
    expect(published.equals(Buffer.from(canonical(report)))).toBe(true)
    expect(
      (await readdir(base)).filter((n) =>
        n.startsWith('.reference-capture-bootstrap-')
      )
    ).toEqual([])
    // Every case binds its dispatch, native lineage and bodies by reference.
    for (const c of report.cases) {
      expect(c.dispatchRef).toMatch(/^control-trace\.json#\d+$/)
      expect(c.nativeExecution.ppid).toBe(1)
      expect(c.nativeExecution.exitCode).toBe(0)
      expect(c.requestRefs.some((r) => r.endsWith('/body.bin'))).toBe(true)
      expect(c.outputRefs).toContain(
        `native/p${report.cases.indexOf(c) + 1}/stdout.bin`
      )
    }
    const { files } = await loadPublished(out)
    expect(() => assertEvidence(report, files, report.artifacts)).not.toThrow()
    // Code copies are inert .source.txt, never importable names.
    expect(
      report.artifacts
        .filter(
          (a) =>
            a.role === 'CODE_BUNDLE' && a.path !== 'inputs/code-inventory.json'
        )
        .every((a) => a.path.endsWith('.source.txt'))
    ).toBe(true)
    expect(report.artifacts.find((a) => a.role === 'INPUT_SPEC').sha256).toBe(
      '73ab205e2a7b84e3db9792bd2833ac515dd332647bfd30480e9fef6b81debadc'
    )
  })
  it('collects the admitted ?beta=true route with queryClass BETA_TRUE and no URL text', async () => {
    const { result, out } = await run({ query: true })
    expect(result.exitCode).toBe(0)
    expect(result.report.status).toBe('COLLECTED_REQUIRES_REVIEW')
    expect(statuses(result.report)).toEqual([
      'CAPTURED',
      'CAPTURED',
      'CAPTURED'
    ])
    const { report, files } = await loadPublished(out)
    expect(() => assertEvidence(report, files, report.artifacts)).not.toThrow()
    const observer = JSON.parse(files.get('observer-trace.json'))
    const frames = observer.records
      .filter((r) => r.type === 'FRAME')
      .map((r) => r.data.frame)
    const begins = frames.filter((f) => f.type === 'REQUEST_BEGIN')
    const requests = frames.filter((f) => f.type === 'REQUEST')
    expect(begins).toHaveLength(5)
    expect(begins.every((f) => f.payload.queryClass === 'BETA_TRUE')).toBe(true)
    expect(begins.every((f) => f.payload.expectClass === 'NONE')).toBe(true)
    expect(requests.map((f) => f.payload.queryClass)).toEqual(
      Array(5).fill('BETA_TRUE')
    )
    expect(observer.version).toBe(3)
    expect(JSON.parse(files.get('control-trace.json')).version).toBe(3)
    expect(report.version).toBe(3)
    expect(files.get('observer-trace.json').toString()).not.toContain('beta=')
  })
  it('preserves a tampered Read value raw without qualifying it', async () => {
    const { result, out } = await run({ tamperedRead: true })
    expect(result.report.status).toBe('COLLECTED_REQUIRES_REVIEW')
    const { report, files } = await loadPublished(out)
    const bodies = report.artifacts.filter((a) => a.role === 'REQUEST_BODY')
    expect(bodies.some((a) => files.get(a.path).includes('TAMPERED'))).toBe(
      true
    )
    expect(report.cases[1].semanticQualification).toBe('NOT_GRANTED')
  })
})

describe('terminal precedence and partial states', () => {
  it.each([
    [
      { query: '/v1/messages?beta=false' },
      'INCOMPATIBLE_TRANSCRIPT',
      ['INCOMPATIBLE', 'NOT_RUN', 'NOT_RUN']
    ],
    [
      { query: '/v1/messages?' },
      'INCOMPATIBLE_TRANSCRIPT',
      ['INCOMPATIBLE', 'NOT_RUN', 'NOT_RUN']
    ],
    [
      { expect: '100-continue' },
      'INCOMPATIBLE_TRANSCRIPT',
      ['INCOMPATIBLE', 'NOT_RUN', 'NOT_RUN']
    ],
    [
      { missingKey: true },
      'INCOMPATIBLE_TRANSCRIPT',
      ['INCOMPATIBLE', 'NOT_RUN', 'NOT_RUN']
    ],
    [
      { wrongMarker: true },
      'INCOMPATIBLE_TRANSCRIPT',
      ['INCOMPATIBLE', 'NOT_RUN', 'NOT_RUN']
    ],
    [
      { model: 'other' },
      'INCOMPATIBLE_TRANSCRIPT',
      ['INCOMPATIBLE', 'NOT_RUN', 'NOT_RUN']
    ],
    [
      { extraPost: true },
      'INCOMPATIBLE_TRANSCRIPT',
      ['INCOMPATIBLE', 'NOT_RUN', 'NOT_RUN']
    ],
    [
      { wrongResult: true },
      'INCOMPATIBLE_TRANSCRIPT',
      ['INCOMPATIBLE', 'NOT_RUN', 'NOT_RUN']
    ],
    [
      { extraTools: true },
      'INCOMPATIBLE_TRANSCRIPT',
      ['CAPTURED', 'INCOMPATIBLE', 'NOT_RUN']
    ],
    [
      { onlyRead: true },
      'INCOMPATIBLE_TRANSCRIPT',
      ['CAPTURED', 'INCOMPATIBLE', 'NOT_RUN']
    ],
    [
      { readDenial: true },
      'INCOMPATIBLE_TRANSCRIPT',
      ['CAPTURED', 'INCOMPATIBLE', 'NOT_RUN']
    ],
    [
      { wrongToolId: true },
      'INCOMPATIBLE_TRANSCRIPT',
      ['CAPTURED', 'INCOMPATIBLE', 'NOT_RUN']
    ],
    [
      { noDenial: true },
      'INCOMPATIBLE_TRANSCRIPT',
      ['CAPTURED', 'CAPTURED', 'INCOMPATIBLE']
    ],
    [
      { writeNotError: true },
      'INCOMPATIBLE_TRANSCRIPT',
      ['CAPTURED', 'CAPTURED', 'INCOMPATIBLE']
    ],
    [
      { denialInput: { file_path: '/workspace/denied.txt' } },
      'INCOMPATIBLE_TRANSCRIPT',
      ['CAPTURED', 'CAPTURED', 'INCOMPATIBLE']
    ],
    [
      { versionText: '2.1.301 (Claude Code)\n' },
      'INCOMPATIBLE_TRANSCRIPT',
      ['NOT_RUN', 'NOT_RUN', 'NOT_RUN']
    ],
    [
      { authorization: true },
      'INFRA_FAILURE',
      ['FAILED', 'NOT_RUN', 'NOT_RUN']
    ],
    [
      { authValue: 'sk-ant-api03-looks-real' },
      'INFRA_FAILURE',
      ['FAILED', 'NOT_RUN', 'NOT_RUN']
    ],
    [{ signal: 'SIGSEGV' }, 'INFRA_FAILURE', ['FAILED', 'NOT_RUN', 'NOT_RUN']],
    [{ spawnError: true }, 'INFRA_FAILURE', ['FAILED', 'NOT_RUN', 'NOT_RUN']],
    [
      { executableSha256: '1'.repeat(64) },
      'INFRA_FAILURE',
      ['NOT_RUN', 'NOT_RUN', 'NOT_RUN']
    ],
    [{ rmFails: true }, 'INFRA_FAILURE', ['CAPTURED', 'CAPTURED', 'CAPTURED']],
    [{ noClosed: true }, 'INFRA_FAILURE', ['CAPTURED', 'CAPTURED', 'CAPTURED']],
    [{ dockerDown: true }, 'INFRA_FAILURE', ['NOT_RUN', 'NOT_RUN', 'NOT_RUN']],
    [
      { writableMount: true },
      'BLOCKED_CONTAINMENT',
      ['NOT_RUN', 'NOT_RUN', 'NOT_RUN']
    ],
    [
      { imageId: `sha256:${'0'.repeat(64)}` },
      'INVALID_INPUT',
      ['NOT_RUN', 'NOT_RUN', 'NOT_RUN']
    ],
    [
      { probe: true },
      'COLLECTED_REQUIRES_REVIEW',
      ['CAPTURED', 'CAPTURED', 'CAPTURED']
    ],
    [
      { residue: 'observer' },
      'INFRA_FAILURE',
      ['CAPTURED', 'CAPTURED', 'CAPTURED']
    ],
    [
      { residue: 'client' },
      'INFRA_FAILURE',
      ['CAPTURED', 'CAPTURED', 'CAPTURED']
    ],
    [{ unbacked: true }, 'INFRA_FAILURE', ['FAILED', 'NOT_RUN', 'NOT_RUN']],
    [
      { orphanNull: true },
      'INFRA_FAILURE',
      ['CAPTURED', 'CAPTURED', 'CAPTURED']
    ]
  ])('%j -> %s %j', async (knobs, status, cases) => {
    const { result, out } = await run(knobs)
    expect(result.report.status).toBe(status)
    expect(statuses(result.report)).toEqual(cases)
    expect(result.exitCode).toBe(status === 'COLLECTED_REQUIRES_REVIEW' ? 0 : 1)
    // A failed terminal report still binds every reached PASS to its proof.
    const { report, files } = await loadPublished(out)
    expect(() => assertEvidence(report, files, report.artifacts)).not.toThrow()
    for (const c of report.cases.filter((x) => x.status === 'NOT_RUN'))
      expect(c.dispatchRef).toBeNull()
    for (const c of report.cases.filter((x) =>
      ['FAILED', 'INCOMPATIBLE'].includes(x.status)
    )) {
      expect(c.dispatchRef).not.toBeNull()
      expect(c.failureOrders.length).toBeGreaterThan(0)
    }
    if (status !== 'COLLECTED_REQUIRES_REVIEW')
      expect(report.failures.filter((f) => f.primary)).toHaveLength(1)
  })
  it.each([
    ['observer', true, 'REMOVED', true],
    ['observer', false, 'UNRESOLVED', false],
    ['client', true, 'REMOVED', true],
    ['client', false, 'UNRESOLVED', false]
  ])(
    'never declares NOT_CREATED after an uncertain %s create (late=%s): %s',
    async (role, late, expected, complete) => {
      const { result } = await run({ uncertainCreate: { role, late } })
      const entry = result.report.cleanup.containers.find(
        (c) => c.role === role
      )
      expect(entry.status).toBe(expected)
      expect(result.report.cleanup.complete).toBe(complete)
      expect(check(result.report, 'RC09')).toBe(complete ? 'PASS' : 'FAIL')
      expect(result.report.status).toBe('INFRA_FAILURE')
      expect(statuses(result.report)).toEqual(['NOT_RUN', 'NOT_RUN', 'NOT_RUN'])
    }
  )
  it('declares NOT_CREATED only after a definitive refusal and absence by name', async () => {
    const { result } = await run({ refusedCreate: 'client' })
    const client = result.report.cleanup.containers.find(
      (c) => c.role === 'client'
    )
    expect(client.status).toBe('NOT_CREATED')
    expect(result.report.cleanup.complete).toBe(true)
  })
  it.each([{ reorderRejected: true }, {}])(
    'keeps MISSING_SENTINEL INCOMPATIBLE with in-flight response keys %j',
    async (delivery) => {
      const { result } = await run({ missingKey: true, ...delivery })
      expect(result.report.status).toBe('INCOMPATIBLE_TRANSCRIPT')
      expect(statuses(result.report)).toEqual([
        'INCOMPATIBLE',
        'NOT_RUN',
        'NOT_RUN'
      ])
      expect(result.report.failures.map((f) => f.code)).toEqual([
        'INCOMPATIBLE_TRANSCRIPT'
      ])
    }
  )
  it('records residue and unbacked keys as PROTOCOL causes, never COLLECTED', async () => {
    for (const knobs of [
      { residue: 'observer' },
      { unbacked: true },
      { orphanNull: true }
    ]) {
      const { result } = await run(knobs)
      expect(result.report.failures.map((f) => f.code)).toContain('PROTOCOL')
      expect(result.report.status).not.toBe('COLLECTED_REQUIRES_REVIEW')
    }
  })
  it('keeps a removal failure UNRESOLVED and never COLLECTED after three captures', async () => {
    const { result } = await run({ rmFails: true })
    expect(result.report.cleanup.complete).toBe(false)
    expect(
      result.report.cleanup.containers.some((c) => c.status === 'UNRESOLVED')
    ).toBe(true)
    expect(check(result.report, 'RC09')).toBe('FAIL')
  })
  it('records a spawn failure as FAILED with dispatch and no invented PID', async () => {
    const { result } = await run({ spawnError: true })
    const text = result.report.cases[0]
    expect(text.nativeExecution).toBeNull()
    expect(result.report.failures.map((f) => f.code)).toContain(
      'TOOLCHAIN_UNAVAILABLE'
    )
  })
  it('times out a hanging native child, preserves its partial evidence and launches nothing else', async () => {
    const { result } = await run({ hang: true })
    expect(result.report.status).toBe('INFRA_FAILURE')
    expect(statuses(result.report)).toEqual(['FAILED', 'NOT_RUN', 'NOT_RUN'])
    expect(result.report.failures.map((f) => f.code)).toContain('TIMEOUT')
    expect(result.report.cases[0].nativeExecution.startedAt).toMatch(/Z$/)
  }, 60000)
})

describe('cancellation, input and publication (RC01/RC09)', () => {
  it('turns SIGINT into SIGNAL, still cleans up and publishes a failed report', async () => {
    const { result, engine } = await run(
      {},
      {
        during: () => {
          setTimeout(() => process.emit('SIGINT', 'SIGINT'), 150)
        }
      }
    )
    expect(result.report.status).toBe('INFRA_FAILURE')
    expect(result.report.failures.map((f) => f.code)).toContain('SIGNAL')
    expect(engine.containers.size).toBe(0)
    expect(result.report.cleanup.bootstrapDisposed).toBe(true)
    expect(process.listenerCount('SIGINT')).toBe(0)
  })
  it.each([
    ['duplicate key', '{"version":1,"runId":"a","runId":"b"}'],
    ['extra field', '{"version":1,"runId":"a","x":1}'],
    ['version 2', '{"version":2,"runId":"a"}'],
    ['bad runId', '{"version":1,"runId":"a b"}'],
    ['invalid UTF-8', Buffer.from([0x7b, 0xff, 0x7d])],
    ['over 4KiB', `{"version":1,"runId":"a","p":"${'x'.repeat(4096)}"}`]
  ])('rejects manifest %s before any Docker call', async (_name, manifest) => {
    const { result, engine } = await run({}, { manifest })
    expect(engine.calls).toBe(0)
    if (result.report) {
      expect(result.report.status).toBe('INVALID_INPUT')
      expect(result.report.runId).toBeNull()
      expect(check(result.report, 'RC01')).toBe('FAIL')
    } else expect(result.exitCode).toBe(1)
  })
  it('accepts a manifest of exactly 4096 bytes', async () => {
    const head = '{"version":1,"runId":"edge"}'
    const manifest = head + ' '.repeat(4096 - head.length)
    expect(Buffer.byteLength(manifest)).toBe(4096)
    const { result } = await run({}, { manifest })
    expect(result.report.runId).toBe('edge')
  })
  it('refuses a symlinked manifest and an existing destination without Docker', async () => {
    const base = await fixture()
    await rm(path.join(base, 'manifest.json'))
    await writeFile(path.join(base, 'real.json'), '{"version":1,"runId":"a"}')
    await symlink(
      path.join(base, 'real.json'),
      path.join(base, 'manifest.json')
    )
    const linked = await run({}, { base })
    expect(linked.engine.calls).toBe(0)
    expect(linked.result.report?.status ?? 'NONE').not.toBe(
      'COLLECTED_REQUIRES_REVIEW'
    )
    const again = await fixture()
    await mkdir(path.join(again, 'capture'), { mode: 0o700 })
    const existing = await run({}, { base: again })
    expect(existing.result.report).toBeNull()
    expect(existing.result.exitCode).toBe(1)
    expect(existing.engine.calls).toBe(0)
  })
  it('leaves only pending evidence and no report when the final link fails', async () => {
    const failingPublish = async (root, out) => {
      const evidence = await createEvidence(root, out)
      evidence.publish = async () => {
        throw Object.assign(new Error('link'), { code: 'IO' })
      }
      return evidence
    }
    const { result, out } = await run({}, { createEvidence: failingPublish })
    expect(result.report).toBeNull()
    expect(result.exitCode).toBe(1)
    await expect(readFile(path.join(out, 'report.json'))).rejects.toMatchObject(
      {
        code: 'ENOENT'
      }
    )
    expect((await readdir(out)).length).toBeGreaterThan(0)
  })
})

describe('validator mutants (RC08)', () => {
  let baseline
  async function published() {
    if (!baseline) {
      const { out } = await run({ query: '/v1/messages?beta=false' })
      baseline = await loadPublished(out)
    }
    return {
      report: structuredClone(baseline.report),
      files: new Map([...baseline.files].map(([k, v]) => [k, Buffer.from(v)]))
    }
  }
  const rewrite = (state, file, value) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(canonical(value))
    state.files.set(file, bytes)
    const a = state.report.artifacts.find((x) => x.path === file)
    a.sha256 = sha256(bytes)
    a.bytes = bytes.length
  }
  const rejects = (state) =>
    expect(() =>
      assertEvidence(state.report, state.files, state.report.artifacts)
    ).toThrow()
  it('accepts the untouched evidence', async () => {
    const s = await published()
    expect(() =>
      assertEvidence(s.report, s.files, s.report.artifacts)
    ).not.toThrow()
    expect(s.report.status).toBe('INCOMPATIBLE_TRANSCRIPT')
  })
  it('rejects version 2 traces or report (wire of run r1)', async () => {
    for (const file of ['control-trace.json', 'observer-trace.json']) {
      const s = await published()
      const doc = parseCanonical(s.files.get(file))
      expect(doc.version).toBe(3)
      doc.version = 2
      rewrite(s, file, doc)
      rejects(s)
    }
    const s = await published()
    s.report.version = 2
    rejects(s)
  })
  it('rejects a record moved to the other physical trace (partition)', async () => {
    const s = await published()
    const control = parseCanonical(s.files.get('control-trace.json'))
    const observer = parseCanonical(s.files.get('observer-trace.json'))
    const moved = control.records.findIndex((r) => r.source === 'client')
    observer.records.push(control.records.splice(moved, 1)[0])
    observer.records.sort((a, b) => a.ordinal - b.ordinal)
    rewrite(s, 'control-trace.json', control)
    rewrite(s, 'observer-trace.json', observer)
    rejects(s)
  })
  it('rejects a reference resolved in the wrong physical file', async () => {
    const s = await published()
    s.report.cases[0].dispatchRef = s.report.cases[0].dispatchRef.replace(
      'control-trace',
      'observer-trace'
    )
    rejects(s)
  })
  it('rejects swapped ordinals, a gap and a duplicated record', async () => {
    for (const mutate of [
      (records) => {
        const [a, b] = [records[3], records[4]]
        ;[a.ordinal, b.ordinal] = [b.ordinal, a.ordinal]
      },
      (records) => {
        records.splice(5, 1)
      },
      (records) => {
        records.splice(5, 0, structuredClone(records[5]))
      }
    ]) {
      const s = await published()
      const control = parseCanonical(s.files.get('control-trace.json'))
      mutate(control.records)
      rewrite(s, 'control-trace.json', control)
      rejects(s)
    }
  })
  it('rejects omitted, duplicated or reordered failure causes', async () => {
    for (const mutate of [
      (f) => f.splice(0, 1),
      (f) => f.push({ ...f[0], order: f.length, primary: false }),
      (f) => {
        f[0].code = 'IO'
      }
    ]) {
      const s = await published()
      const failures = parseCanonical(s.files.get('failures.json'))
      mutate(failures)
      rewrite(s, 'failures.json', failures)
      s.report.failures = failures
      rejects(s)
    }
  })
  it('rejects altered response/body bytes even with a matching manifest digest', async () => {
    const s = await published()
    const body = s.report.artifacts.find((a) => a.role === 'RESPONSE_BODY')
    const bytes = Buffer.from(s.files.get(body.path))
    bytes[0] ^= 1
    rewrite(s, body.path, bytes)
    rejects(s)
  })
  it('rejects a declared status, case or PASS that the evidence does not prove', async () => {
    for (const mutate of [
      (r) => {
        r.status = 'COLLECTED_REQUIRES_REVIEW'
        r.exitCode = 0
      },
      (r) => {
        r.cases[0].status = 'CAPTURED'
      },
      (r) => {
        r.checks[3].status = 'PASS'
        r.checks[3].message = 'EVIDENCE_BOUND'
      },
      (r) => {
        r.cases[1].dispatchRef = r.cases[0].dispatchRef
      },
      (r) => {
        r.cleanup.complete = false
      }
    ]) {
      const s = await published()
      mutate(s.report)
      rejects(s)
    }
  })
  it('rejects an altered native end and a dropped raw pipe tail', async () => {
    const s = await published()
    const end = parseCanonical(s.files.get('native/p1/end.json'))
    end.exitCode = 0
    rewrite(s, 'native/p1/end.json', end)
    rejects(s)
    const t = await published()
    const pipe = t.files.get('raw/observer-stderr.bin')
    rewrite(
      t,
      'raw/observer-stderr.bin',
      Buffer.concat([pipe, Buffer.from('CVGO2')])
    )
    rejects(t)
  })
  it('rejects a partial tail or a cleanup claim the docker calls do not prove', async () => {
    const s = await published()
    s.report.artifacts.push({
      path: 'raw/client-binary-partial.bin',
      role: 'PARTIAL_PIPE',
      sha256: sha256(Buffer.from('CVGN2')),
      bytes: 5,
      bindings: {
        owner: 'client',
        caseId: null,
        requestOrdinal: null,
        processOrdinal: null,
        segmentIndex: null
      }
    })
    s.files.set('raw/client-binary-partial.bin', Buffer.from('CVGN2'))
    rejects(s)
    const t = await published()
    const cleanup = parseCanonical(t.files.get('cleanup/cleanup.json'))
    cleanup.containers[0].status = 'NOT_CREATED'
    rewrite(t, 'cleanup/cleanup.json', cleanup)
    rejects(t)
  })
  it('rebuilds the same report from the bytes alone', async () => {
    const s = await published()
    expect(canonical(buildReport(s.files, s.report.artifacts))).toBe(
      canonical(s.report)
    )
  })
})
