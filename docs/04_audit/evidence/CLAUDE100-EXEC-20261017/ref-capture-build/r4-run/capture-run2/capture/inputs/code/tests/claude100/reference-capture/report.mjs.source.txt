import path from 'node:path'
import { CAPTURE_SOURCE_PATHS } from '../reference-port/bootstrap.mjs'
import {
  CASES,
  CASE_STATUSES,
  CHECK_IDS,
  CODES,
  FIXTURE_BYTES,
  LIMITS,
  MCP_BYTES,
  PHASES,
  PINS,
  ROLES,
  SETTINGS_BYTES,
  SIGNALS,
  SPEC_SHA256,
  STATUSES,
  canonical,
  caseOf,
  envSet,
  envSetDigest,
  fault,
  ordinalOf,
  processInvocation,
  argvDigest,
  envDigest,
  sha256
} from './constants.mjs'
import {
  CODE_INVENTORY,
  SCRIPT_INVENTORY,
  SPEC_ARTIFACT,
  parseManifest,
  scriptInventoryEntries
} from './inputs.mjs'
import {
  ControlStream,
  KeyStore,
  RAW_PIPES,
  Sequencer,
  caseStatus,
  deriveCase,
  deriveVersion,
  observerKey,
  orphanKeys
} from './model.mjs'
import { expectedWorkspaceState } from './workspace.mjs'
import { makeConfig, verifyInspect, verifyNamespaces } from './profile.mjs'
import { KINDS, UTC, parseControlLine, parseHostCommand } from './protocol.mjs'
import { CONTROL_TRACE, OBSERVER_TRACE } from './trace.mjs'

export const PATHS = Object.freeze({
  identities: 'inputs/identities.json',
  profile: 'profile.json',
  dockerCalls: 'docker/calls.json',
  inspect: (role) => `docker/inspect-${role}.json`,
  preflight: (role) => `preflight/${role}.json`,
  intent: (role) => `cleanup/intent-${role}.json`,
  cleanup: 'cleanup/cleanup.json',
  revalidation: 'revalidation/identities-final.json',
  failures: 'failures.json',
  control: CONTROL_TRACE,
  observer: OBSERVER_TRACE,
  partial: (role, pipe) => `raw/${role}-${pipe}-partial.bin`,
  nativeStart: (I) => `native/p${I}/start.json`,
  nativeEnd: (I) => `native/p${I}/end.json`
})
export const expectedDigests = () => ({
  claudeSha256: PINS.claudeSha256,
  nodeSha256: PINS.nodeSha256,
  dockerSha256: PINS.dockerSha256,
  imageId: PINS.imageId
})
export const LIMITATIONS = Object.freeze([
  'REFERENCE_CAPTURE_ONLY: scripted local responses with a synthetic key; no model inference, account, M1, CVG adapter, equivalence or functional parity.',
  'A FINISHED response proves local write completion only; consumption is shown by the following requests and the native end/stdout.',
  'Null native fields were not observed; wrapper exit codes never substitute for native results.',
  'Containment checks bind observed files, inspects and processes; no memory, kernel or daemon attestation.',
  'RC10 review, gates and acceptance belong to external sidecars; this collector never approves itself.'
])
const require = (condition, code = 'PROTOCOL') => {
  if (!condition) throw fault(code)
}
const same = (a, b) => canonical(a) === canonical(b)
const D = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const int = (v, lo, hi) => Number.isSafeInteger(v) && v >= lo && v <= hi
function closed(value, keys) {
  require(
    value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((k) => Object.hasOwn(value, k))
  )
  return value
}
/** Strict for our own outputs: valid UTF-8 JSON whose canonical bytes are identical. */
export function parseCanonical(bytes) {
  let value
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (cause) {
    throw fault('PROTOCOL', cause)
  }
  require(Buffer.from(canonical(value)).equals(Buffer.from(bytes)))
  return value
}
const base64 = (text) => {
  require(typeof text === 'string')
  const bytes = Buffer.from(text, 'base64')
  require(bytes.toString('base64') === text)
  return bytes
}
/** Deterministic order of evidence references: path, then trace ordinal. */
export function compareRefs(a, b) {
  const [pa, oa] = a.split('#'),
    [pb, ob] = b.split('#')
  if (pa !== pb) return pa < pb ? -1 : 1
  return (
    (oa === undefined ? -1 : Number(oa)) - (ob === undefined ? -1 : Number(ob))
  )
}
const sorted = (refs) => [...new Set(refs)].sort(compareRefs)

/** Physical artifact derived from one binary key: path, role and bindings. */
export function derivedArtifact(key) {
  if (key.role === 'client') {
    const I = key.processOrdinal
    return {
      path: `native/p${I}/${key.channel === 1 ? 'stdout' : 'stderr'}.bin`,
      role: key.channel === 1 ? 'NATIVE_STDOUT' : 'NATIVE_STDERR',
      bindings: {
        owner: 'client',
        caseId: caseOf(I),
        requestOrdinal: null,
        processOrdinal: I,
        segmentIndex: null
      }
    }
  }
  const caseId = key.caseTag === 0 ? null : CASES[key.caseTag - 1]
  const bindings = {
    owner: 'observer',
    caseId,
    requestOrdinal: key.requestOrdinal,
    processOrdinal: caseId === null ? null : ordinalOf(caseId),
    segmentIndex: key.segmentIndex
  }
  const q = `requests/q${String(key.requestOrdinal).padStart(2, '0')}`
  switch (key.kind) {
    case KINDS.REQUEST_BODY:
      return { path: `${q}/body.bin`, role: 'REQUEST_BODY', bindings }
    case KINDS.RESPONSE_HEADERS:
      return {
        path: `${q}/response-headers.json`,
        role: 'RESPONSE_HEADERS',
        bindings
      }
    case KINDS.RESPONSE_SEGMENT:
      return {
        path: `${q}/response-segment-${String(key.segmentIndex).padStart(3, '0')}.bin`,
        role: 'RESPONSE_SEGMENT',
        bindings
      }
    case KINDS.RESPONSE_BODY:
      return { path: `${q}/response-body.bin`, role: 'RESPONSE_BODY', bindings }
    default:
      return {
        path: `workspace/${caseId === null ? 'before-version' : `after-${caseId}`}.json`,
        role: 'WORKSPACE_STATE',
        bindings
      }
  }
}

const GLOBAL_HOST_ROLES = new Set([
  'INPUT_MANIFEST',
  'INPUT_SPEC',
  'INPUT_SETTINGS',
  'INPUT_MCP',
  'INPUT_FIXTURE',
  'CODE_BUNDLE',
  'INPUT_IDENTITIES',
  'PROFILE',
  'INSPECT',
  'CONTROL_TRACE',
  'OBSERVER_TRACE',
  'CLEANUP',
  'FAILURES'
])
/** Closed artifact manifest: unique paths, roles, bindings and byte identity. */
function loadArtifacts(files, artifacts) {
  require(Array.isArray(artifacts) && artifacts.length <= LIMITS.artifacts)
  const byPath = new Map()
  let total = 0
  for (const a of artifacts) {
    closed(a, ['path', 'role', 'sha256', 'bytes', 'bindings'])
    const b = closed(a.bindings, [
      'owner',
      'caseId',
      'requestOrdinal',
      'processOrdinal',
      'segmentIndex'
    ])
    require(
      typeof a.path === 'string' &&
        a.path
          .split('/')
          .every((p) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(p)) &&
        !byPath.has(a.path) &&
        ROLES.includes(a.role) &&
        D(a.sha256) &&
        int(a.bytes, 0, LIMITS.artifactBytes)
    )
    require(
      ['HOST', 'client', 'observer'].includes(b.owner) &&
        (b.caseId === null || CASES.includes(b.caseId)) &&
        (b.requestOrdinal === null || int(b.requestOrdinal, 0, 11)) &&
        (b.processOrdinal === null || int(b.processOrdinal, 0, 3)) &&
        (b.segmentIndex === null || int(b.segmentIndex, 0, 255))
    )
    const bytes = files.get(a.path)
    require(
      Buffer.isBuffer(bytes) &&
        bytes.length === a.bytes &&
        sha256(bytes) === a.sha256
    )
    if (GLOBAL_HOST_ROLES.has(a.role))
      require(
        b.owner === 'HOST' &&
          b.caseId === null &&
          b.requestOrdinal === null &&
          b.processOrdinal === null &&
          b.segmentIndex === null
      )
    total += a.bytes
    byPath.set(a.path, a)
  }
  require(total <= LIMITS.artifactBytes, 'CAP')
  const roleOf = (p) => byPath.get(p)?.role
  for (const [p, role] of [
    [PATHS.identities, 'INPUT_IDENTITIES'],
    [PATHS.revalidation, 'INPUT_IDENTITIES'],
    [PATHS.profile, 'PROFILE'],
    [PATHS.dockerCalls, 'INSPECT'],
    [PATHS.cleanup, 'CLEANUP'],
    [PATHS.failures, 'FAILURES'],
    [PATHS.control, 'CONTROL_TRACE'],
    [PATHS.observer, 'OBSERVER_TRACE'],
    ['inputs/manifest.json', 'INPUT_MANIFEST'],
    [SPEC_ARTIFACT, 'INPUT_SPEC'],
    [CODE_INVENTORY, 'CODE_BUNDLE'],
    [SCRIPT_INVENTORY, 'INPUT_SCRIPT'],
    ['inputs/workspace/settings.json', 'INPUT_SETTINGS'],
    ['inputs/workspace/mcp.json', 'INPUT_MCP'],
    ['inputs/workspace/input.txt', 'INPUT_FIXTURE']
  ])
    if (byPath.has(p)) require(roleOf(p) === role)
  for (const role of ['CONTROL_TRACE', 'OBSERVER_TRACE', 'FAILURES'])
    require(artifacts.filter((a) => a.role === role).length <= 1)
  return byPath
}

const HOST_TYPES = [
  'HOST_COMMAND',
  'HOST_COMMAND_RESULT',
  'HOST_ARTIFACT',
  'HOST_CASE_RESULT',
  'HOST_FAILURE'
]
/** Validate each physical trace partition before their union. */
function loadTraces(files, byPath, runId) {
  require(byPath.has(PATHS.control))
  const control = parseCanonical(files.get(PATHS.control))
  const observer = byPath.has(PATHS.observer)
    ? parseCanonical(files.get(PATHS.observer))
    : { version: 3, runId, file: OBSERVER_TRACE, records: [], partials: [] }
  closed(control, [
    'version',
    'runId',
    'file',
    'simulated',
    'records',
    'partials'
  ])
  closed(observer, ['version', 'runId', 'file', 'records', 'partials'])
  require(
    control.version === 3 &&
      observer.version === 3 &&
      control.file === CONTROL_TRACE &&
      observer.file === OBSERVER_TRACE &&
      control.runId === runId &&
      observer.runId === runId &&
      typeof control.simulated === 'boolean'
  )
  for (const [doc, sources] of [
    [control, ['HOST', 'client']],
    [observer, ['observer']]
  ]) {
    require(Array.isArray(doc.records))
    let last = -1,
      offset = 0
    for (const r of doc.records) {
      closed(r, ['ordinal', 'offsetMs', 'source', 'type', 'data'])
      require(
        sources.includes(r.source) &&
          int(r.ordinal, 0, 1 << 20) &&
          r.ordinal > last &&
          int(r.offsetMs, 0, LIMITS.offsetMs) &&
          r.offsetMs >= offset
      )
      require(
        r.source === 'HOST'
          ? HOST_TYPES.includes(r.type)
          : ['FRAME', 'RAW'].includes(r.type)
      )
      last = r.ordinal
      offset = r.offsetMs
    }
    require(Array.isArray(doc.partials))
  }
  const union = [...control.records, ...observer.records].sort(
    (a, b) => a.ordinal - b.ordinal
  )
  let offset = 0
  union.forEach((r, i) => {
    require(r.ordinal === i && r.offsetMs >= offset)
    offset = r.offsetMs
  })
  const count = (pred) => union.filter(pred).length
  require(count((r) => r.source === 'HOST') <= LIMITS.hostRecords, 'CAP')
  for (const role of ['client', 'observer']) {
    require(count((r) => r.source === role && r.type === 'FRAME') <=
      LIMITS.controlFrames, 'CAP')
    require(count((r) => r.source === role && r.type === 'RAW') <=
      LIMITS.rawFrames, 'CAP')
  }
  return { control, observer, union }
}
/** A reference resolves only inside the physical file it names. */
function resolveRef(reference, traces) {
  require(typeof reference === 'string')
  const [file, ordinal] = reference.split('#')
  const doc =
    file === CONTROL_TRACE
      ? traces.control
      : file === OBSERVER_TRACE
        ? traces.observer
        : null
  require(doc && /^(0|[1-9]\d*)$/.test(ordinal ?? ''))
  const record = doc.records.find((r) => r.ordinal === Number(ordinal))
  require(record)
  return record
}

/** Replay of the persisted records through the same admission and key rules. */
function replay(union, wires, runId, cutoff = Infinity) {
  const seq = new Sequencer()
  const keys = {
    client: new KeyStore('client'),
    observer: new KeyStore('observer')
  }
  const frames = { client: 0, observer: 0 }
  const commandSeq = { client: 0, observer: 0 }
  const results = new Map()
  const offsets = { client: 0, observer: 0 }
  const controlBytes = { client: 0, observer: 0 }
  const violations = []
  for (const r of union) {
    if (r.ordinal >= cutoff) break
    const d = r.data
    if (r.type === 'FRAME') {
      closed(d, ['rawBase64', 'frame'])
      const raw = base64(d.rawBase64)
      const frame = parseControlLine(raw, r.source, runId, frames[r.source]++)
      require(same(frame, d.frame))
      controlBytes[r.source] += raw.length
      const violation = seq.frame(r.source, frame, r.ordinal)
      if (violation) violations.push({ ordinal: r.ordinal, code: violation })
    } else if (r.type === 'HOST_COMMAND') {
      closed(d, ['to', 'commandSeq', 'frameBase64'])
      require(['client', 'observer'].includes(d.to))
      require(d.commandSeq === commandSeq[d.to]++)
      const command = parseHostCommand(
        base64(d.frameBase64),
        d.to,
        runId,
        d.commandSeq
      )
      seq.command(d.to, command.type, command.payload, r.ordinal)
      results.set(`${d.to}/${d.commandSeq}`, null)
    } else if (r.type === 'HOST_COMMAND_RESULT') {
      closed(d, ['to', 'commandSeq', 'outcome'])
      const key = `${d.to}/${d.commandSeq}`
      require(
        results.has(key) &&
          results.get(key) === null &&
          ['WRITTEN', 'FAILED'].includes(d.outcome)
      )
      results.set(key, d.outcome)
    } else if (r.type === 'RAW') {
      closed(d, [
        'wireArtifactPath',
        'wireOffset',
        'headerBytes',
        'payloadBytes',
        'frameSha256',
        'key'
      ])
      closed(d.key, [
        'role',
        'caseTag',
        'requestOrdinal',
        'kind',
        'processOrdinal',
        'channel',
        'segmentIndex'
      ])
      const role = r.source
      require(
        d.wireArtifactPath === RAW_PIPES[role] &&
          d.key.role === role &&
          d.wireOffset === offsets[role] &&
          d.headerBytes === (role === 'client' ? 11 : 14) &&
          int(d.payloadBytes, 0, LIMITS.rawPayloadBytes)
      )
      const wire = wires[role]
      require(wire)
      const bytes = wire.subarray(
        d.wireOffset,
        d.wireOffset + d.headerBytes + d.payloadBytes
      )
      require(
        bytes.length === d.headerBytes + d.payloadBytes &&
          sha256(bytes) === d.frameSha256
      )
      const decoded = keys[role].feed(bytes)
      require(
        !keys[role].error &&
          decoded.length === 1 &&
          same(decoded[0].key, d.key) &&
          decoded[0].offset === d.wireOffset
      )
      offsets[role] += bytes.length
    } else if (r.type === 'HOST_ARTIFACT') {
      closed(d, ['phase', 'caseId', 'artifactPath', 'sha256', 'bytes'])
    } else if (r.type === 'HOST_CASE_RESULT') {
      closed(d, ['caseId', 'status', 'dispatchRef', 'failureOrders'])
    } else if (r.type === 'HOST_FAILURE') {
      closed(d, ['order', 'code', 'phase', 'caseId', 'primary', 'causeOrders'])
    }
  }
  return {
    seq,
    keys,
    violations,
    offsets,
    controlBytes,
    results,
    frames
  }
}

function loadFailures(files, byPath, traces) {
  require(byPath.has(PATHS.failures))
  const failures = parseCanonical(files.get(PATHS.failures))
  require(Array.isArray(failures) && failures.length <= LIMITS.failures)
  const hostFailures = traces.union.filter(
    (r) => r.source === 'HOST' && r.type === 'HOST_FAILURE'
  )
  const hostCount = traces.union.filter((r) => r.source === 'HOST').length
  require(hostFailures.length <= failures.length)
  failures.forEach((f, i) => {
    closed(f, [
      'order',
      'code',
      'phase',
      'caseId',
      'primary',
      'eventRef',
      'causeOrders'
    ])
    require(
      f.order === i &&
        CODES.includes(f.code) &&
        PHASES.includes(f.phase) &&
        (f.caseId === null || CASES.includes(f.caseId)) &&
        f.primary === (i === 0) &&
        Array.isArray(f.causeOrders) &&
        f.causeOrders.length <= LIMITS.causeChildren &&
        f.causeOrders.every(
          (o, j, a) => int(o, 0, i - 1) && (j === 0 || o > a[j - 1])
        )
    )
    if (i < hostFailures.length) {
      const record = hostFailures[i]
      require(f.eventRef === `${CONTROL_TRACE}#${record.ordinal}`)
      const data = { ...f }
      delete data.eventRef
      require(same(record.data, data))
    } else require(f.eventRef === null && hostCount === LIMITS.hostRecords)
  })
  return failures
}

/** Status precedence over closed failure codes; COLLECTED needs every proof. */
export function statusFor(failures, complete) {
  const codes = failures.map((f) => f.code)
  const infra = [
    'IO',
    'CLEANUP',
    'PROTOCOL',
    'PRIVACY',
    'CAP',
    'TIMEOUT',
    'SIGNAL',
    'DRIFT_RUNTIME'
  ]
  if (codes.some((c) => infra.includes(c))) return 'INFRA_FAILURE'
  if (
    failures.some(
      (f) =>
        f.code === 'IDENTITY_MISMATCH' &&
        !['VALIDATE', 'SNAPSHOT'].includes(f.phase)
    )
  )
    return 'INFRA_FAILURE'
  if (codes.includes('TOOLCHAIN_UNAVAILABLE')) return 'INFRA_FAILURE'
  if (codes.some((c) => ['INPUT_INVALID', 'IDENTITY_MISMATCH'].includes(c)))
    return 'INVALID_INPUT'
  if (codes.includes('CONTAINMENT')) return 'BLOCKED_CONTAINMENT'
  if (codes.includes('INCOMPATIBLE_TRANSCRIPT'))
    return 'INCOMPATIBLE_TRANSCRIPT'
  require(complete)
  return 'COLLECTED_REQUIRES_REVIEW'
}

function caseRefs(model, I, caseId, byPath) {
  const seq = model.seq
  const exists = (p) => (byPath.has(p) ? [p] : [])
  const requests = [],
    responses = [],
    outputs = [],
    states = []
  for (const r of seq.obs.requests.values()) {
    if (r.begin.caseId !== caseId) continue
    const q = r.begin.ordinal
    const key = (kind, s = null) =>
      derivedArtifact({
        role: 'observer',
        caseTag: ordinalOf(caseId),
        requestOrdinal: q,
        kind,
        segmentIndex: s
      }).path
    requests.push(`${OBSERVER_TRACE}#${r.beginOrdinal}`)
    if (r.decision) requests.push(`${OBSERVER_TRACE}#${r.decision.ordinal}`)
    requests.push(...exists(key(KINDS.REQUEST_BODY)))
    for (const [i, s] of r.segments.entries()) {
      responses.push(`${OBSERVER_TRACE}#${s.ordinal}`)
      responses.push(...exists(key(KINDS.RESPONSE_SEGMENT, i)))
    }
    if (r.response) responses.push(`${OBSERVER_TRACE}#${r.response.ordinal}`)
    responses.push(...exists(key(KINDS.RESPONSE_HEADERS)))
    responses.push(...exists(key(KINDS.RESPONSE_BODY)))
  }
  const start = seq.cli.starts.get(I),
    end = seq.cli.ends.get(I)
  if (start) outputs.push(`${CONTROL_TRACE}#${start.ordinal}`)
  if (end) outputs.push(`${CONTROL_TRACE}#${end.ordinal}`)
  outputs.push(
    ...exists(PATHS.nativeStart(I)),
    ...exists(PATHS.nativeEnd(I)),
    ...exists(`native/p${I}/stdout.bin`),
    ...exists(`native/p${I}/stderr.bin`)
  )
  const state = seq.obs.states.get(caseId),
    ended = seq.obs.caseEnded.get(caseId)
  if (state) states.push(`${OBSERVER_TRACE}#${state.ordinal}`)
  if (ended) states.push(`${OBSERVER_TRACE}#${ended.ordinal}`)
  states.push(...exists(`workspace/after-${caseId}.json`))
  return {
    requestRefs: sorted(requests),
    responseRefs: sorted(responses),
    outputRefs: sorted(outputs),
    fileStateRefs: sorted(states)
  }
}
function nativeExecution(model, I, hostTimeout) {
  const start = model.seq.cli.starts.get(I)
  if (!start) return null
  const end = model.seq.cli.ends.get(I)
  const p = start.payload
  return {
    startedAt: p.startedAt,
    endedAt: end?.payload.endedAt ?? null,
    exitCode: end?.payload.exitCode ?? null,
    signal: end?.payload.signal ?? null,
    timeout: end ? end.payload.timeout : hostTimeout,
    pid: p.pid,
    ppid: p.ppid,
    stdinSha256: p.stdinSha256,
    argvSha256: p.argvSha256,
    envSha256: p.envSha256,
    executableSha256: p.executableSha256,
    rawStartRef: `${CONTROL_TRACE}#${start.ordinal}`,
    rawEndRef: end ? `${CONTROL_TRACE}#${end.ordinal}` : null
  }
}

/** Every dispatched process has one HOST_CASE_RESULT equal to its replay. */
function verifyProcessResults(traces, wires, runId, model, failures, profile) {
  const results = traces.union.filter(
    (r) => r.source === 'HOST' && r.type === 'HOST_CASE_RESULT'
  )
  const outcomes = new Map()
  for (const caseId of [null, ...CASES]) {
    const I = ordinalOf(caseId)
    const own = results.filter((r) => r.data.caseId === caseId)
    const dispatch = model.seq.issued.start.get(I)
    const mine =
      caseId === null
        ? failures.filter((f) => f.phase === 'VERSION')
        : failures.filter((f) => f.caseId === caseId)
    if (!dispatch) {
      require(own.length === 0 && (caseId === null || mine.length === 0))
      outcomes.set(caseId, { status: 'NOT_RUN', dispatch: null, failures: [] })
      continue
    }
    require(own.length === 1 && profile)
    const result = own[0]
    const at = replay(traces.union, wires, runId, result.ordinal)
    const outcome =
      caseId === null
        ? deriveVersion({ seq: at.seq, keys: at.keys }, profile)
        : deriveCase({ seq: at.seq, keys: at.keys }, caseId, profile)
    const codes = mine.map((f) => f.code)
    for (const f of mine)
      require(
        f.eventRef === null || Number(f.eventRef.split('#')[1]) < result.ordinal
      )
    for (const code of outcome.derived) require(codes.includes(code))
    const status =
      caseId === null
        ? !outcome.dispatched
          ? 'NOT_RUN'
          : codes.some((c) => c !== 'INCOMPATIBLE_TRANSCRIPT')
            ? 'FAILED'
            : codes.length
              ? 'INCOMPATIBLE'
              : outcome.accepted && outcome.complete
                ? 'CAPTURED'
                : 'FAILED'
        : caseStatus(outcome, codes)
    require(
      CASE_STATUSES.includes(result.data.status) &&
        result.data.status === status &&
        result.data.dispatchRef === `${CONTROL_TRACE}#${dispatch.ordinal}` &&
        same(
          result.data.failureOrders,
          mine.map((f) => f.order)
        )
    )
    outcomes.set(caseId, { status, dispatch, failures: mine, result })
  }
  return outcomes
}

function verifyCleanup(files, byPath, intents) {
  if (!byPath.has(PATHS.cleanup)) return null
  const cleanup = parseCanonical(files.get(PATHS.cleanup))
  closed(cleanup, [
    'version',
    'nonce',
    'containers',
    'markerRemoved',
    'attachmentsClosed',
    'pinsClosed',
    'bootstrapDisposed',
    'revalidated',
    'stagedInventory'
  ])
  require(
    cleanup.version === 1 &&
      /^[a-f0-9]{32}$/.test(cleanup.nonce) &&
      Array.isArray(cleanup.containers) &&
      cleanup.containers.length === 2
  )
  const calls = byPath.has(PATHS.dockerCalls)
    ? parseCanonical(files.get(PATHS.dockerCalls)).calls
    : []
  require(Array.isArray(calls) && calls.length <= LIMITS.dockerCalls)
  const out = (c) => Buffer.from(c.stdoutBase64, 'base64').toString('utf8')
  const err = (c) => Buffer.from(c.stderrBase64, 'base64').toString('utf8')
  const absent = (c) =>
    c.exitCode === 1 && /no such (?:object|container)/i.test(err(c))
  const entries = []
  for (const [index, role] of ['observer', 'client'].entries()) {
    const c = cleanup.containers[index]
    closed(c, [
      'role',
      'name',
      'id',
      'labels',
      'configSha256',
      'attempted',
      'createOutcome',
      'recovered',
      'status'
    ])
    require(
      c.role === role && c.name === `cvg-c100-capture-${cleanup.nonce}-${role}`
    )
    const intentPath = PATHS.intent(role)
    const intent = intents.get(role)
    const creates = calls.filter(
      (x) =>
        x.args[0] === 'create' &&
        x.args[x.args.indexOf('--name') + 1] === c.name
    )
    require(creates.length <= 1) // An uncertain create is never repeated.
    const createCall = creates[0]
    let derived = 'UNRESOLVED'
    const refs = []
    if (!intent) {
      require(
        !c.attempted &&
          !createCall &&
          c.id === null &&
          c.createOutcome === 'NOT_ATTEMPTED'
      )
      derived = 'NOT_CREATED'
    } else {
      refs.push(intentPath)
      require(
        c.attempted &&
          intent.name === c.name &&
          intent.configSha256 === c.configSha256 &&
          same(intent.labels, c.labels) &&
          intent.imageId === PINS.imageId
      )
      const created = Boolean(
        createCall &&
        createCall.exitCode === 0 &&
        createCall.complete === true &&
        out(createCall).trim() === c.id
      )
      // Only a completed CLI with a nonzero exit and no signal is definitive.
      const refused = Boolean(
        createCall &&
        Number.isInteger(createCall.exitCode) &&
        createCall.exitCode !== 0 &&
        createCall.complete === true &&
        createCall.signal === null
      )
      require(
        c.createOutcome ===
          (created ? 'CREATED' : refused ? 'REFUSED' : 'UNCERTAIN')
      )
      const later = createCall
        ? calls.filter((x) => x.ordinal > createCall.ordinal)
        : []
      const byName = later.filter(
        (x) => x.args.join(' ') === `container inspect ${c.name}`
      )
      // A recovery binding is recomputed from an exact-name inspect, not a flag.
      const recovered = byName.some((x) => {
        if (x.exitCode !== 0) return false
        let list
        try {
          list = JSON.parse(out(x))
        } catch {
          return false
        }
        return (
          Array.isArray(list) &&
          list.length === 1 &&
          list[0].Id === c.id &&
          list[0].Name === `/${c.name}` &&
          list[0].Image === PINS.imageId &&
          same(list[0].Config?.Labels ?? {}, intent.labels)
        )
      })
      if (c.id && (created || recovered)) {
        const rm = later.find(
          (x) => x.args.join(' ') === `container rm --force ${c.id}`
        )
        const finalInspect = [...later]
          .reverse()
          .find((x) => x.args.join(' ') === `container inspect ${c.id}`)
        if (
          finalInspect &&
          absent(finalInspect) &&
          (!rm || (rm.exitCode === 0 && finalInspect.ordinal > rm.ordinal))
        )
          derived = 'REMOVED'
      } else if (!c.id && refused && byName.some(absent))
        derived = 'NOT_CREATED'
      refs.push(PATHS.cleanup)
      if (byPath.has(PATHS.dockerCalls)) refs.push(PATHS.dockerCalls)
    }
    require(c.status === derived)
    entries.push({
      role,
      id: c.id,
      name: c.name,
      configSha256: c.configSha256,
      status: derived,
      evidenceRefs: sorted(refs)
    })
  }
  const complete =
    entries.every((e) => e.status !== 'UNRESOLVED') &&
    cleanup.markerRemoved === true &&
    cleanup.attachmentsClosed === true &&
    cleanup.pinsClosed === true &&
    cleanup.bootstrapDisposed === true &&
    cleanup.revalidated === true
  return {
    document: cleanup,
    report: {
      containers: entries,
      bootstrapDisposed: cleanup.bootstrapDisposed === true,
      complete
    }
  }
}

function check(id, status, refs = []) {
  return {
    id,
    status,
    evidenceRefs: status === 'NOT_RUN' ? [] : sorted(refs),
    message:
      id === 'RC10'
        ? 'EXTERNAL_GATE_PENDING'
        : status === 'PASS'
          ? 'EVIDENCE_BOUND'
          : status === 'FAIL'
            ? 'EVIDENCE_REJECTED'
            : 'NOT_REACHED'
  }
}

/**
 * Rebuild the complete report from the persisted bytes only. Every physical,
 * causal and proof invariant is enforced here; the controller publishes only a
 * report equal to this reconstruction.
 */
export function buildReport(files, artifacts) {
  const byPath = loadArtifacts(files, artifacts)
  const manifestBytes = files.get('inputs/manifest.json')
  let manifest = null
  try {
    manifest = manifestBytes ? parseManifest(manifestBytes) : null
  } catch {}
  const runId = manifest?.runId ?? null
  const traces = loadTraces(files, byPath, runId)
  const failures = loadFailures(files, byPath, traces)
  const identities = byPath.has(PATHS.identities)
    ? parseCanonical(files.get(PATHS.identities))
    : null
  const profile = byPath.has(PATHS.profile)
    ? parseCanonical(files.get(PATHS.profile))
    : null
  const wires = {}
  for (const role of ['client', 'observer'])
    wires[role] = byPath.has(RAW_PIPES[role])
      ? files.get(RAW_PIPES[role])
      : null
  const model = replay(traces.union, wires, runId)
  // Every result is paired; tails hold no omitted complete frame/line.
  for (const value of model.results.values()) require(value !== null)
  for (const role of ['client', 'observer']) {
    const owned = artifacts.filter(
      (a) => a.role === 'PARTIAL_PIPE' && a.bindings.owner === role
    )
    const binary = byPath.get(PATHS.partial(role, 'binary'))
    const wire = wires[role] ?? Buffer.alloc(0)
    const tail = wire.subarray(model.offsets[role])
    if (binary) require(files.get(binary.path).equals(tail) && tail.length > 0)
    else require(tail.length === 0)
    if (tail.length) {
      const before = model.keys[role].decoder.error
      require(model.keys[role].feed(tail).length === 0 || before)
    }
    const control = byPath.get(PATHS.partial(role, 'control'))
    if (control) {
      const stream = new ControlStream(role, runId)
      stream.seq = model.frames[role]
      stream.bytes = model.controlBytes[role]
      require(stream.feed(files.get(control.path)).length === 0)
    }
    for (const a of owned)
      require(
        [
          PATHS.partial(role, 'binary'),
          PATHS.partial(role, 'control'),
          PATHS.partial(role, 'docker')
        ].includes(a.path)
      )
    const doc = role === 'observer' ? traces.observer : traces.control
    require(
      same(
        doc.partials.filter((p) => p.startsWith(`raw/${role}-`)).sort(),
        owned.map((a) => a.path).sort()
      )
    )
  }
  require(
    traces.observer.partials.every((p) => p.startsWith('raw/observer-')) &&
      traces.control.partials.every((p) => p.startsWith('raw/client-'))
  )
  // Derived per-key artifacts are exactly their key payloads, never aliases.
  const derivedPaths = new Set()
  for (const role of ['client', 'observer'])
    for (const entry of model.keys[role].keys.values()) {
      const target = derivedArtifact(entry.key)
      const a = byPath.get(target.path)
      require(
        a &&
          a.role === target.role &&
          same(a.bindings, target.bindings) &&
          files.get(a.path).equals(Buffer.concat(entry.payloads))
      )
      derivedPaths.add(a.path)
    }
  for (const a of artifacts)
    if (
      [
        'REQUEST_BODY',
        'RESPONSE_HEADERS',
        'RESPONSE_SEGMENT',
        'RESPONSE_BODY',
        'WORKSPACE_STATE',
        'NATIVE_STDOUT',
        'NATIVE_STDERR'
      ].includes(a.role)
    )
      require(derivedPaths.has(a.path))
  for (const role of ['client', 'observer'])
    if (wires[role])
      require(
        byPath.get(RAW_PIPES[role]).role === 'RAW_PIPE' &&
          byPath.get(RAW_PIPES[role]).bindings.owner === role
      )
  // NATIVE_START/END artifacts equal the frames that produced them.
  for (const [I, start] of model.seq.cli.starts) {
    const a = byPath.get(PATHS.nativeStart(I))
    require(
      a &&
        a.role === 'NATIVE_START' &&
        same(a.bindings, {
          owner: 'client',
          caseId: caseOf(I),
          requestOrdinal: null,
          processOrdinal: I,
          segmentIndex: null
        }) &&
        same(parseCanonical(files.get(a.path)), start.payload)
    )
    const end = model.seq.cli.ends.get(I)
    const b = byPath.get(PATHS.nativeEnd(I))
    if (end)
      require(
        b &&
          b.role === 'NATIVE_END' &&
          same(parseCanonical(files.get(b.path)), end.payload)
      )
    else require(!b)
  }
  require(
    artifacts.filter((a) => a.role === 'NATIVE_START').length ===
      model.seq.cli.starts.size &&
      artifacts.filter((a) => a.role === 'NATIVE_END').length ===
        model.seq.cli.ends.size
  )
  // HOST_ARTIFACT records bind to existing artifacts and their exact bytes.
  for (const r of traces.union.filter((x) => x.type === 'HOST_ARTIFACT')) {
    const a = byPath.get(r.data.artifactPath)
    require(
      a &&
        a.sha256 === r.data.sha256 &&
        a.bytes === r.data.bytes &&
        PHASES.includes(r.data.phase)
    )
  }
  // Violations, orphans or command-order breaks require a recorded PROTOCOL.
  const anomalies =
    model.violations.length +
    orphanKeys(model).length +
    model.seq.commandViolations().length
  if (anomalies) require(failures.some((f) => f.code === 'PROTOCOL'))
  // Residue: a partial tail or an unterminated key is never a clean pipe.
  const residue =
    artifacts.some((a) => a.role === 'PARTIAL_PIPE') ||
    ['client', 'observer'].some((role) =>
      [...model.keys[role].keys.values()].some((e) => !e.terminated)
    )
  if (residue) require(failures.some((f) => f.code === 'PROTOCOL'))
  // The initial workspace state is re-proved from its own bytes, not trusted.
  if (model.seq.obs.before) {
    const expected = expectedWorkspaceState()
    const key = model.keys.observer.entry(
      observerKey(null, null, KINDS.WORKSPACE_STATE)
    )
    const ready = model.seq.obs.ready?.payload
    const exact =
      ready &&
      key?.terminated &&
      key.bytes.equals(expected.bytes) &&
      model.seq.obs.before.payload.sha256 === expected.sha256 &&
      model.seq.obs.before.payload.bytes === expected.bytes.length &&
      ready.workspaceStateSha256 === expected.sha256 &&
      ready.workspaceStateBytes === expected.bytes.length
    if (!exact)
      require(
        !model.seq.issued.start.size &&
          failures.some((f) => ['DRIFT_RUNTIME', 'PROTOCOL'].includes(f.code))
      )
  }
  // Arrival-time REJECTED reasons each have their recorded cause.
  for (const [reason, code] of [
    ['CAP', 'CAP'],
    ['FORBIDDEN_AUTH', 'PRIVACY'],
    ['EARLY_PHASE', 'PROTOCOL'],
    ['MISSING_SENTINEL', 'INCOMPATIBLE_TRANSCRIPT']
  ]) {
    const seen = [...model.seq.obs.requests.values()].filter(
      (r) =>
        r.decision?.type === 'REJECTED' && r.decision.payload.reason === reason
    ).length
    require(failures.filter((f) => f.code === code).length >= seen)
  }
  const outcomes = verifyProcessResults(
    traces,
    wires,
    runId,
    model,
    failures,
    profile
  )
  const intents = new Map()
  for (const role of ['observer', 'client'])
    if (byPath.has(PATHS.intent(role))) {
      const intent = parseCanonical(files.get(PATHS.intent(role)))
      closed(intent, [
        'version',
        'runId',
        'nonce',
        'role',
        'name',
        'imageId',
        'configSha256',
        'labels',
        'attempted'
      ])
      require(
        intent.role === role && intent.runId === runId && intent.attempted
      )
      intents.set(role, intent)
    }
  const cleanup = verifyCleanup(files, byPath, intents)
  const observedToolchain = identities?.toolchain?.observed ?? {
    claudeSha256: null,
    nodeSha256: null,
    dockerSha256: null,
    imageId: null
  }
  const inputDigests = {
    manifest: byPath.get('inputs/manifest.json')?.sha256 ?? null,
    spec: byPath.get(SPEC_ARTIFACT)?.sha256 ?? null,
    codeBundle: byPath.get(CODE_INVENTORY)?.sha256 ?? null,
    settings: byPath.get('inputs/workspace/settings.json')?.sha256 ?? null,
    mcp: byPath.get('inputs/workspace/mcp.json')?.sha256 ?? null,
    fixture: byPath.get('inputs/workspace/input.txt')?.sha256 ?? null,
    scripts: byPath.get(SCRIPT_INVENTORY)?.sha256 ?? null,
    profile: byPath.get(PATHS.profile)?.sha256 ?? null
  }
  const cases = CASES.map((caseId) => {
    const I = ordinalOf(caseId)
    const outcome = outcomes.get(caseId)
    if (outcome.status === 'NOT_RUN')
      return {
        caseId,
        status: 'NOT_RUN',
        dispatchRef: null,
        nativeExecution: null,
        requestRefs: [],
        responseRefs: [],
        outputRefs: [],
        fileStateRefs: [],
        failureOrders: [],
        semanticQualification: 'NOT_GRANTED'
      }
    return {
      caseId,
      status: outcome.status,
      dispatchRef: `${CONTROL_TRACE}#${outcome.dispatch.ordinal}`,
      nativeExecution: nativeExecution(
        model,
        I,
        outcome.failures.some((f) => f.code === 'TIMEOUT')
      ),
      ...caseRefs(model, I, caseId, byPath),
      failureOrders: outcome.failures.map((f) => f.order),
      semanticQualification: 'NOT_GRANTED'
    }
  })
  const partial = {
    runId,
    verificationClass: 'REFERENCE_CAPTURE_ONLY',
    reviewStatus: 'PENDING',
    cases,
    artifacts
  }
  const checks = computeChecks({
    files,
    byPath,
    artifacts,
    runId,
    manifest,
    identities,
    profile,
    model,
    traces,
    failures,
    outcomes,
    cases,
    cleanup,
    partial
  })
  const complete =
    cases.every((c) => c.status === 'CAPTURED') &&
    checks.every((c) =>
      c.id === 'RC10' ? c.status === 'NOT_RUN' : c.status === 'PASS'
    ) &&
    cleanup?.report.complete === true &&
    !residue
  const status = statusFor(failures, complete)
  const report = {
    version: 3,
    runId,
    status,
    exitCode: status === 'COLLECTED_REQUIRES_REVIEW' ? 0 : 1,
    verificationClass: 'REFERENCE_CAPTURE_ONLY',
    reviewStatus: 'PENDING',
    inputDigests,
    toolchainDigests: {
      expected: expectedDigests(),
      observed: observedToolchain
    },
    cases,
    checks,
    artifacts,
    failures,
    cleanup: cleanup?.report ?? {
      containers: ['observer', 'client'].map((role) => ({
        role,
        id: null,
        name: null,
        configSha256: null,
        status: 'NOT_CREATED',
        evidenceRefs: []
      })),
      bootstrapDisposed: false,
      complete: false
    },
    limitations: traces.control.simulated
      ? [...LIMITATIONS, 'SIMULATED_TEST_CONTROL_PATH_NOT_NATIVE_EVIDENCE']
      : [...LIMITATIONS]
  }
  validateSchema(report)
  return report
}

function computeChecks(c) {
  const { files, byPath, failures, model, cases, cleanup } = c
  const failed = (pred) => failures.some(pred)
  const refs = (...paths) => paths.filter((p) => byPath.has(p))
  const results = []
  // RC01: closed manifest, pins, frozen closure, scripts and fixtures.
  {
    const proof = refs(
      'inputs/manifest.json',
      SPEC_ARTIFACT,
      CODE_INVENTORY,
      SCRIPT_INVENTORY,
      'inputs/workspace/settings.json',
      'inputs/workspace/mcp.json',
      'inputs/workspace/input.txt',
      PATHS.identities
    )
    let ok = proof.length === 8 && c.manifest !== null
    if (ok) {
      ok &&= sha256(files.get(SPEC_ARTIFACT)) === SPEC_SHA256
      ok &&= files.get('inputs/workspace/settings.json').equals(SETTINGS_BYTES)
      ok &&= files.get('inputs/workspace/mcp.json').equals(MCP_BYTES)
      ok &&= files.get('inputs/workspace/input.txt').equals(FIXTURE_BYTES)
      const inventory = parseCanonical(files.get(CODE_INVENTORY))
      ok &&= same(
        inventory.entries.map((e) => e.sourcePath),
        CAPTURE_SOURCE_PATHS
      )
      for (const e of inventory.entries) {
        const a = byPath.get(e.artifactPath)
        ok &&=
          a?.role === 'CODE_BUNDLE' &&
          e.artifactPath === `inputs/code/${e.sourcePath}.source.txt` &&
          a.sha256 === e.sha256 &&
          a.bytes === e.bytes
      }
      ok &&=
        byPath.get(
          `inputs/code/${'docs/02_spec/0238_claude_scripted_reference_capture.md'}.source.txt`
        )?.sha256 === SPEC_SHA256
      const scripts = parseCanonical(files.get(SCRIPT_INVENTORY))
      const expected = scriptInventoryEntries()
      ok &&= scripts.entries.length === expected.length
      expected.forEach((e, i) => {
        const a = byPath.get(e.artifactPath)
        const { content, caseId, ...item } = e
        ok &&=
          same(scripts.entries[i], item) &&
          a?.role === 'INPUT_SCRIPT' &&
          files.get(a.path).equals(content) &&
          a.bindings.caseId === caseId &&
          a.bindings.segmentIndex === e.segmentIndex
      })
      ok &&= same(c.identities?.toolchain?.observed, expectedDigests())
      ok &&=
        c.identities?.manifest?.sha256 ===
        byPath.get('inputs/manifest.json').sha256
    }
    const rejected = failed(
      (f) =>
        ['VALIDATE', 'SNAPSHOT'].includes(f.phase) &&
        ['INPUT_INVALID', 'IDENTITY_MISMATCH', 'DRIFT_RUNTIME'].includes(f.code)
    )
    results.push(
      check(
        'RC01',
        ok && !rejected ? 'PASS' : ok || rejected ? 'FAIL' : 'NOT_RUN',
        proof
      )
    )
  }
  // RC02: real inspect/preflight before any Claude; profile recomputed.
  {
    const proof = refs(
      PATHS.profile,
      PATHS.inspect('observer'),
      PATHS.inspect('client'),
      PATHS.preflight('observer'),
      PATHS.preflight('client'),
      PATHS.identities
    )
    let ok =
      proof.length === 6 && c.profile && c.identities && model.seq.cli.ready
    if (ok) {
      try {
        verifyProfile(c.profile, c.identities, model, c.runId)
        for (const role of ['observer', 'client']) {
          const ready = (role === 'observer' ? model.seq.obs : model.seq.cli)
            .ready
          const inspect = parseCanonical(files.get(PATHS.inspect(role)))
          verifyInspect(
            inspect,
            { ...c.profile[role], config: c.profile[role].config },
            c.profile.imageEnv
          )
          require(
            same(
              parseCanonical(files.get(PATHS.preflight(role))),
              ready.payload
            )
          )
          require(byPath.get(PATHS.preflight(role)).bindings.owner === role)
        }
        verifyNamespaces(
          model.seq.obs.ready.payload,
          model.seq.cli.ready.payload,
          c.identities.hostNamespaces
        )
        const echo = model.seq.cli.ready.payload
        require(
          echo.port === c.profile.port &&
            echo.profileSha256 === byPath.get(PATHS.profile).sha256 &&
            echo.envSetSha256 === envSetDigest(c.profile.port)
        )
        const start0 = model.seq.issued.start.get(0)
        const inspected = c.traces.union.filter(
          (r) =>
            r.type === 'HOST_ARTIFACT' &&
            [PATHS.inspect('observer'), PATHS.inspect('client')].includes(
              r.data.artifactPath
            )
        )
        require(inspected.length === 2)
        if (start0) require(inspected.every((r) => r.ordinal < start0.ordinal))
      } catch {
        ok = false
      }
    }
    const rejected = failed(
      (f) =>
        f.code === 'CONTAINMENT' || ['CREATE', 'PREFLIGHT'].includes(f.phase)
    )
    results.push(
      check(
        'RC02',
        ok && !rejected ? 'PASS' : ok || rejected ? 'FAIL' : 'NOT_RUN',
        proof
      )
    )
  }
  // RC03: each dispatched child consumed its exact frozen argv/env/stdin.
  {
    const issued = [...model.seq.issued.start.keys()]
    let ok = issued.length > 0 && c.profile
    const proof = []
    if (ok)
      for (const I of issued) {
        const start = model.seq.cli.starts.get(I)
        const inv = c.profile.invocations[I]
        if (
          !start ||
          start.payload.ppid !== 1 ||
          start.payload.pid <= 1 ||
          start.payload.executableSha256 !== PINS.claudeSha256 ||
          start.payload.argvSha256 !== inv.argvSha256 ||
          start.payload.envSha256 !== inv.envSha256 ||
          start.payload.stdinSha256 !== inv.stdinSha256
        )
          ok = false
        else
          proof.push(`${CONTROL_TRACE}#${start.ordinal}`, PATHS.nativeStart(I))
      }
    if (ok)
      ok =
        model.violations.length === 0 &&
        orphanKeys(model).length === 0 &&
        model.seq.commandViolations().length === 0
    if (ok) proof.push(PATHS.profile)
    results.push(
      check('RC03', !issued.length ? 'NOT_RUN' : ok ? 'PASS' : 'FAIL', proof)
    )
  }
  // RC04-RC06: one per case; CAPTURED only, never inferred from FINISHED.
  for (const [id, caseId] of [
    ['RC04', 'TEXT'],
    ['RC05', 'READ'],
    ['RC06', 'WRITE_DENIED']
  ]) {
    const entry = cases.find((x) => x.caseId === caseId)
    results.push(
      check(
        id,
        entry.status === 'NOT_RUN'
          ? 'NOT_RUN'
          : entry.status === 'CAPTURED'
            ? 'PASS'
            : 'FAIL',
        [
          entry.dispatchRef,
          ...entry.requestRefs,
          ...entry.responseRefs,
          ...entry.outputRefs,
          ...entry.fileStateRefs
        ].filter(Boolean)
      )
    )
  }
  // RC07: recount every cap from the evidence; privacy causes fail closed.
  {
    const reached = model.seq.obs.ready !== null || model.seq.cli.ready !== null
    let ok = !failed((f) => ['CAP', 'PRIVACY'].includes(f.code))
    const requests = [...model.seq.obs.requests.values()]
    const eligible = requests.filter((r) => r.decision?.type === 'REQUEST')
    ok &&= requests.length <= LIMITS.requests
    ok &&= eligible.length <= LIMITS.eligiblePosts
    ok &&= eligible.every((r) => r.decision.payload.bytes <= LIMITS.bodyBytes)
    ok &&=
      eligible.reduce((n, r) => n + r.decision.payload.bytes, 0) <=
      LIMITS.totalBodyBytes
    const responses = requests.filter((r) => r.response)
    ok &&= responses.every(
      (r) => r.response.payload.bytes <= LIMITS.responseBytes
    )
    ok &&=
      responses.reduce((n, r) => n + r.response.payload.bytes, 0) <=
      LIMITS.totalResponseBytes
    for (const channel of [1, 2]) {
      let total = 0
      for (const entry of model.keys.client.keys.values())
        if (entry.key.channel === channel)
          total += entry.payloads.reduce((n, p) => n + p.length, 0)
      ok &&= total <= LIMITS.nativeStreamBytes
    }
    ok &&= !requests.some(
      (r) =>
        r.decision?.type === 'REJECTED' &&
        ['CAP', 'FORBIDDEN_AUTH'].includes(r.decision.payload.reason)
    )
    for (const role of ['client', 'observer'])
      ok &&=
        model.controlBytes[role] <= LIMITS.controlBytes &&
        model.frames[role] <= LIMITS.controlFrames
    results.push(
      check(
        'RC07',
        !reached ? 'NOT_RUN' : ok ? 'PASS' : 'FAIL',
        refs(
          PATHS.control,
          PATHS.observer,
          RAW_PIPES.client,
          RAW_PIPES.observer
        )
      )
    )
  }
  // RC08: the physical/causal validation above succeeded for this evidence.
  results.push(
    check(
      'RC08',
      'PASS',
      refs(
        PATHS.control,
        PATHS.observer,
        PATHS.failures,
        RAW_PIPES.client,
        RAW_PIPES.observer
      )
    )
  )
  // RC09: own IDs absent, bootstrap disposed, revalidated, staged inventory.
  {
    let ok = Boolean(cleanup?.report.complete)
    if (ok && byPath.has(PATHS.revalidation)) {
      const revalidation = parseCanonical(files.get(PATHS.revalidation))
      ok =
        revalidation.revalidated === true &&
        Array.isArray(revalidation.identities)
    } else ok = false
    if (ok) {
      const staged = cleanup.document.stagedInventory
      const position = c.artifacts.findIndex((a) => a.path === PATHS.cleanup)
      ok =
        Array.isArray(staged) &&
        same(
          staged,
          c.artifacts.slice(0, position).map((a) => ({
            path: a.path,
            role: a.role,
            sha256: a.sha256,
            bytes: a.bytes
          }))
        )
    }
    ok &&= !failed(
      (f) =>
        ['CLEANUP', 'DRIFT_RUNTIME'].includes(f.code) &&
        ['STOP', 'CLEANUP', 'REVALIDATE', 'PUBLISH'].includes(f.phase)
    )
    results.push(
      check(
        'RC09',
        ok ? 'PASS' : 'FAIL',
        refs(PATHS.cleanup, PATHS.revalidation)
      )
    )
  }
  results.push(check('RC10', 'NOT_RUN'))
  // RC11: no promotion, receipt, index or self-approval in this evidence.
  {
    const ok =
      c.partial.verificationClass === 'REFERENCE_CAPTURE_ONLY' &&
      c.partial.reviewStatus === 'PENDING' &&
      cases.every((x) => x.semanticQualification === 'NOT_GRANTED') &&
      c.artifacts.every(
        (a) =>
          ROLES.includes(a.role) &&
          (a.path.startsWith('inputs/code/') ||
            !/(receipt|catalog|capture-index|authority-index)/i.test(a.path))
      ) &&
      byPath.has(PATHS.cleanup)
    results.push(check('RC11', ok ? 'PASS' : 'FAIL', refs(PATHS.cleanup)))
  }
  return results
}

/** The frozen profile equals its recomputation from the closed constants. */
function verifyProfile(profile, identities, model, runId) {
  require(profile.version === 2 && profile.runId === runId)
  const port = model.seq.obs.ready.payload.port
  require(
    profile.port === port && profile.baseUrl === `http://127.0.0.1:${port}`
  )
  require(
    profile.envSetSha256 === envSetDigest(port) &&
      same(profile.envSet, envSet(port))
  )
  require(same(profile.sourcePaths, CAPTURE_SOURCE_PATHS))
  require(
    profile.workspace === path.join(identities.outDir, 'inputs/workspace') &&
      profile.emptyVolume ===
        path.join(identities.outDir, 'inputs/empty-volume') &&
      profile.bundleRoot === identities.bootstrap?.root
  )
  for (const role of ['observer', 'client']) {
    const expected = makeConfig(role, {
      bundle: profile.bundleRoot,
      workspace: profile.workspace,
      emptyVolume: profile.emptyVolume,
      runId: profile.runId,
      marker: profile.marker,
      observerId: profile.observer.id
    })
    require(same(profile[role].config, expected))
    require(profile[role].configSha256 === sha256(canonical(expected)))
    require(
      profile[role].name === `cvg-c100-capture-${profile.nonce}-${role}` &&
        profile[role].labels['cvg.nonce'] === profile.nonce &&
        profile[role].labels['cvg.config-sha256'] ===
          profile[role].configSha256 &&
        profile[role].labels['cvg.role'] === role
    )
  }
  for (let I = 0; I <= 3; I++) {
    const inv = processInvocation(I, port)
    require(
      same(profile.invocations[I], {
        processOrdinal: I,
        caseId: inv.caseId,
        file: inv.file,
        args: inv.args,
        env: inv.env,
        cwd: inv.cwd,
        stdinBase64: inv.stdin.toString('base64'),
        argvSha256: argvDigest(inv),
        envSha256: envDigest(inv),
        stdinSha256: sha256(inv.stdin)
      })
    )
  }
  require(same(profile.imageEnv, identities.image.env))
}

/** Closed report v2 schema with its literal fields and enum domains. */
export function validateSchema(report) {
  closed(report, [
    'version',
    'runId',
    'status',
    'exitCode',
    'verificationClass',
    'reviewStatus',
    'inputDigests',
    'toolchainDigests',
    'cases',
    'checks',
    'artifacts',
    'failures',
    'cleanup',
    'limitations'
  ])
  require(
    report.version === 3 &&
      report.verificationClass === 'REFERENCE_CAPTURE_ONLY' &&
      report.reviewStatus === 'PENDING' &&
      STATUSES.includes(report.status) &&
      report.exitCode ===
        (report.status === 'COLLECTED_REQUIRES_REVIEW' ? 0 : 1)
  )
  require(report.runId === null || /^[A-Za-z0-9_-]{1,64}$/.test(report.runId))
  const digests = closed(report.inputDigests, [
    'manifest',
    'spec',
    'codeBundle',
    'settings',
    'mcp',
    'fixture',
    'scripts',
    'profile'
  ])
  for (const v of Object.values(digests)) require(v === null || D(v))
  const td = closed(report.toolchainDigests, ['expected', 'observed'])
  for (const name of ['expected', 'observed']) {
    const d = closed(td[name], [
      'claudeSha256',
      'nodeSha256',
      'dockerSha256',
      'imageId'
    ])
    for (const key of ['claudeSha256', 'nodeSha256', 'dockerSha256'])
      require((name === 'observed' && d[key] === null) || D(d[key]))
    require(
      (name === 'observed' && d.imageId === null) ||
        (typeof d.imageId === 'string' &&
          /^sha256:[a-f0-9]{64}$/.test(d.imageId))
    )
  }
  require(Array.isArray(report.cases) && report.cases.length === 3)
  report.cases.forEach((x, i) => {
    closed(x, [
      'caseId',
      'status',
      'dispatchRef',
      'nativeExecution',
      'requestRefs',
      'responseRefs',
      'outputRefs',
      'fileStateRefs',
      'failureOrders',
      'semanticQualification'
    ])
    require(
      x.caseId === CASES[i] &&
        CASE_STATUSES.includes(x.status) &&
        x.semanticQualification === 'NOT_GRANTED'
    )
    for (const key of [
      'requestRefs',
      'responseRefs',
      'outputRefs',
      'fileStateRefs'
    ])
      require(
        Array.isArray(x[key]) &&
          same(x[key], sorted(x[key])) &&
          x[key].length <= 4096
      )
    require(
      Array.isArray(x.failureOrders) &&
        x.failureOrders.every(
          (o, j, a) => int(o, 0, 1023) && (j === 0 || o > a[j - 1])
        )
    )
    if (x.status === 'NOT_RUN')
      require(
        x.dispatchRef === null &&
          x.nativeExecution === null &&
          !x.requestRefs.length &&
          !x.responseRefs.length &&
          !x.outputRefs.length &&
          !x.fileStateRefs.length &&
          !x.failureOrders.length
      )
    else {
      require(typeof x.dispatchRef === 'string')
      if (x.status === 'CAPTURED')
        require(!x.failureOrders.length && x.nativeExecution)
      else require(x.failureOrders.length > 0)
    }
    if (x.nativeExecution) {
      const n = closed(x.nativeExecution, [
        'startedAt',
        'endedAt',
        'exitCode',
        'signal',
        'timeout',
        'pid',
        'ppid',
        'stdinSha256',
        'argvSha256',
        'envSha256',
        'executableSha256',
        'rawStartRef',
        'rawEndRef'
      ])
      require(
        UTC(n.startedAt) &&
          (n.endedAt === null ||
            (UTC(n.endedAt) &&
              Date.parse(n.endedAt) >= Date.parse(n.startedAt))) &&
          (n.exitCode === null || int(n.exitCode, 0, 255)) &&
          (n.signal === null || SIGNALS.includes(n.signal)) &&
          (n.exitCode === null || n.signal === null) &&
          typeof n.timeout === 'boolean' &&
          int(n.pid, 2, 0x7fffffff) &&
          n.ppid === 1 &&
          [n.stdinSha256, n.argvSha256, n.envSha256, n.executableSha256].every(
            D
          ) &&
          typeof n.rawStartRef === 'string' &&
          (n.rawEndRef === null || typeof n.rawEndRef === 'string')
      )
      if (n.endedAt === null)
        require(
          n.exitCode === null && n.signal === null && n.rawEndRef === null
        )
    }
  })
  require(
    Array.isArray(report.checks) && report.checks.length === CHECK_IDS.length
  )
  report.checks.forEach((x, i) => {
    closed(x, ['id', 'status', 'evidenceRefs', 'message'])
    require(
      x.id === CHECK_IDS[i] &&
        ['PASS', 'FAIL', 'NOT_RUN'].includes(x.status) &&
        Array.isArray(x.evidenceRefs) &&
        same(x.evidenceRefs, sorted(x.evidenceRefs))
    )
    const message =
      x.id === 'RC10'
        ? 'EXTERNAL_GATE_PENDING'
        : {
            PASS: 'EVIDENCE_BOUND',
            FAIL: 'EVIDENCE_REJECTED',
            NOT_RUN: 'NOT_REACHED'
          }[x.status]
    require(x.message === message)
    if (x.id === 'RC10')
      require(x.status === 'NOT_RUN' && !x.evidenceRefs.length)
    if (x.status === 'PASS') require(x.evidenceRefs.length > 0)
  })
  require(Array.isArray(report.failures))
  if (report.failures.length)
    require(report.failures.filter((f) => f.primary).length === 1)
  const cleanup = closed(report.cleanup, [
    'containers',
    'bootstrapDisposed',
    'complete'
  ])
  require(Array.isArray(cleanup.containers) && cleanup.containers.length === 2)
  cleanup.containers.forEach((x, i) => {
    closed(x, ['role', 'id', 'name', 'configSha256', 'status', 'evidenceRefs'])
    require(
      x.role === ['observer', 'client'][i] &&
        ['REMOVED', 'UNRESOLVED', 'NOT_CREATED'].includes(x.status) &&
        (x.id === null || /^[a-f0-9]{64}$/.test(x.id)) &&
        (x.configSha256 === null || D(x.configSha256)) &&
        Array.isArray(x.evidenceRefs)
    )
    if (x.status === 'REMOVED')
      require(x.id !== null && x.evidenceRefs.length > 0)
  })
  require(
    typeof cleanup.bootstrapDisposed === 'boolean' &&
      typeof cleanup.complete === 'boolean'
  )
  require(
    Array.isArray(report.limitations) &&
      report.limitations.length > 0 &&
      report.limitations.every((x) => typeof x === 'string' && x.length <= 512)
  )
  if (report.status === 'COLLECTED_REQUIRES_REVIEW')
    require(
      !report.failures.length &&
        report.cases.every((x) => x.status === 'CAPTURED') &&
        cleanup.complete
    )
  return report
}

/**
 * Validator: a claimed report must equal the reconstruction from the bytes
 * re-read through the retained descriptors, including every reached PASS.
 */
export function assertEvidence(report, files, artifacts) {
  validateSchema(report)
  require(same(report.artifacts, artifacts))
  // Every reference in the report resolves in the file it names.
  const traces = loadTraces(
    files,
    loadArtifacts(files, artifacts),
    report.runId
  )
  const paths = new Set(artifacts.map((a) => a.path))
  const check = (reference) => {
    if (reference.includes('#')) resolveRef(reference, traces)
    else require(paths.has(reference))
  }
  for (const x of report.cases) {
    if (x.dispatchRef) {
      const r = resolveRef(x.dispatchRef, traces)
      require(r.source === 'HOST' && r.type === 'HOST_COMMAND')
    }
    for (const key of [
      'requestRefs',
      'responseRefs',
      'outputRefs',
      'fileStateRefs'
    ])
      x[key].forEach(check)
    if (x.nativeExecution) {
      resolveRef(x.nativeExecution.rawStartRef, traces)
      if (x.nativeExecution.rawEndRef)
        resolveRef(x.nativeExecution.rawEndRef, traces)
    }
  }
  for (const x of report.checks) x.evidenceRefs.forEach(check)
  for (const x of report.cleanup.containers) x.evidenceRefs.forEach(check)
  for (const f of report.failures)
    if (f.eventRef) {
      const r = resolveRef(f.eventRef, traces)
      require(r.source === 'HOST' && r.type === 'HOST_FAILURE')
    }
  require(same(buildReport(files, artifacts), report))
  return report
}
