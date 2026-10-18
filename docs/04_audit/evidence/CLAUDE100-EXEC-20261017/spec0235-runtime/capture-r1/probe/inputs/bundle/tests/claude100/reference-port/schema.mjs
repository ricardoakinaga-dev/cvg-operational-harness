import { types } from 'node:util'
import { parseStrictJson } from '../qualification/strict-json.mjs'

export const CHECK_IDS = Object.freeze([
  'INPUTS',
  'TOOLCHAIN',
  'BUNDLE',
  'CONTAINER_PROFILE',
  'NAMESPACES',
  'PHASES',
  'NATIVE_VERSION',
  'NATIVE_LINEAGE',
  'HTTP_EXCHANGE',
  'PRIVACY_CAPS',
  'DRIFT',
  'CLEANUP',
  'PUBLICATION_PREPARED'
])
export const ROLES = Object.freeze([
  'manifest',
  'stdin',
  'settings',
  'mcp',
  'consumed-inputs',
  'bundle-inventory',
  'bundle-source',
  'profile',
  'inspect',
  'preflight',
  'control-trace',
  'observer-trace',
  'native-stdout',
  'native-stderr',
  'request-body',
  'create-intents',
  'cleanup',
  'failures'
])
export const STATUSES = Object.freeze([
  'PORT_OBSERVED',
  'PORT_NOT_OBSERVED',
  'BLOCKED_CONTAINMENT',
  'INVALID_INPUT',
  'INFRA_FAILURE'
])
const SIGNALS = new Set(
  (
    'SIGHUP SIGINT SIGQUIT SIGILL SIGTRAP SIGABRT SIGBUS SIGFPE ' +
    'SIGKILL SIGUSR1 SIGSEGV SIGUSR2 SIGPIPE SIGALRM SIGTERM SIGCHLD SIGCONT ' +
    'SIGSTOP SIGTSTP SIGTTIN SIGTTOU SIGURG SIGXCPU SIGXFSZ SIGVTALRM ' +
    'SIGPROF SIGWINCH SIGIO SIGPWR SIGSYS'
  ).split(' ')
)
const HEX = /^[a-f0-9]{64}$/
const RUN = /^[A-Za-z0-9_-]{1,64}$/
const TOTAL = 8 * 1024 * 1024

export function probeError(code, cause) {
  return Object.assign(
    new Error(`Native port probe: ${code}`, cause ? { cause } : undefined),
    { code }
  )
}
function requireThat(condition, code = 'INPUT_INVALID') {
  if (!condition) throw probeError(code)
}
export function closed(value, keys, code = 'INPUT_INVALID') {
  requireThat(
    value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !types.isProxy(value),
    code
  )
  requireThat(
    [null, Object.prototype].includes(Object.getPrototypeOf(value)),
    code
  )
  const descriptors = Object.getOwnPropertyDescriptors(value)
  requireThat(Reflect.ownKeys(descriptors).length === keys.length, code)
  for (const key of keys)
    requireThat(
      Object.hasOwn(descriptors, key) &&
        Object.hasOwn(descriptors[key], 'value'),
      code
    )
  return value
}
const int = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max
const digest = (v, nullable = false) =>
  (nullable && v === null) || (typeof v === 'string' && HEX.test(v))
const text = (v, max) => typeof v === 'string' && Buffer.byteLength(v) <= max
function list(value, max, code = 'INPUT_INVALID') {
  requireThat(
    Array.isArray(value) && !types.isProxy(value) && value.length <= max,
    code
  )
  const keys = Reflect.ownKeys(Object.getOwnPropertyDescriptors(value))
  requireThat(keys.length === value.length + 1, code)
  for (let n = 0; n < value.length; n++)
    requireThat(
      Object.hasOwn(
        Object.getOwnPropertyDescriptor(value, String(n)) ?? {},
        'value'
      ),
      code
    )
  return value
}
export function safeRelative(value) {
  return (
    text(value, 1024) &&
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !value.includes('#') &&
    value.split('/').every((x) => x.length > 0 && x !== '.' && x !== '..')
  )
}
export function parseManifest(bytes) {
  let value
  try {
    value = parseStrictJson(bytes, {
      maxBytes: 65536,
      maxDepth: 16,
      maxStringBytes: 4096
    })
  } catch (cause) {
    throw probeError('INPUT_INVALID', cause)
  }
  closed(value, ['version', 'runId', 'fixtureId'])
  requireThat(
    value.version === 1 &&
      text(value.runId, 64) &&
      RUN.test(value.runId) &&
      value.fixtureId === 'NATIVE_PORT_503_V1'
  )
  return Object.freeze(value)
}
export function statusFor(failures, hasExchange) {
  const codes = failures.map((x) => x.code)
  const infrastructure = [
    'IO',
    'CLEANUP',
    'PROTOCOL',
    'PRIVACY',
    'CAP',
    'TIMEOUT',
    'SIGNAL',
    'DRIFT_RUNTIME',
    'TOOLCHAIN_UNAVAILABLE'
  ]
  if (codes.some((x) => infrastructure.includes(x))) return 'INFRA_FAILURE'
  if (codes.some((x) => ['INPUT_INVALID', 'IDENTITY_MISMATCH'].includes(x)))
    return 'INVALID_INPUT'
  if (codes.includes('CONTAINMENT')) return 'BLOCKED_CONTAINMENT'
  if (codes.some((x) => x !== 'NO_ELIGIBLE_EXCHANGE')) return 'INFRA_FAILURE'
  return hasExchange && codes.length === 0
    ? 'PORT_OBSERVED'
    : 'PORT_NOT_OBSERVED'
}
function timestamp(value) {
  return (
    value === null ||
    (typeof value === 'string' &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value)))
  )
}
function validateExecution(execution, ok) {
  closed(
    execution,
    ['versionObserved', 'versionProbe', 'portProbe'],
    'PROTOCOL'
  )
  requireThat(
    execution.versionObserved === null ||
      execution.versionObserved === '2.1.302',
    'PROTOCOL'
  )
  for (const name of ['versionProbe', 'portProbe']) {
    const p = closed(
      execution[name],
      ['startedAt', 'endedAt', 'exitCode', 'timeout', 'signal'],
      'PROTOCOL'
    )
    requireThat(
      timestamp(p.startedAt) &&
        timestamp(p.endedAt) &&
        (p.exitCode === null || int(p.exitCode, 255)) &&
        typeof p.timeout === 'boolean',
      'PROTOCOL'
    )
    requireThat(p.signal === null || SIGNALS.has(p.signal), 'PROTOCOL')
    if (p.startedAt === null)
      requireThat(
        p.endedAt === null &&
          p.exitCode === null &&
          p.signal === null &&
          !p.timeout,
        'PROTOCOL'
      )
    if (p.startedAt && p.endedAt)
      requireThat(Date.parse(p.endedAt) >= Date.parse(p.startedAt), 'PROTOCOL')
    if (ok)
      requireThat(
        p.startedAt !== null &&
          p.endedAt !== null &&
          p.exitCode !== null &&
          p.signal === null &&
          !p.timeout,
        'PROTOCOL'
      )
  }
  if (ok)
    requireThat(
      execution.versionObserved === '2.1.302' &&
        execution.versionProbe.exitCode === 0,
      'PROTOCOL'
    )
}

/** Closed diagnostic report, deliberately incompatible with functional receipts. */
export function validateReport(report) {
  closed(
    report,
    [
      'version',
      'runId',
      'fixtureId',
      'verificationClass',
      'status',
      'exitCode',
      'toolchainDigests',
      'driverSha256',
      'profileSha256',
      'containmentChecks',
      'observations',
      'nativeExecution',
      'artifacts',
      'limitations',
      'reviewStatus'
    ],
    'PROTOCOL'
  )
  const ok = report.status === 'PORT_OBSERVED'
  requireThat(
    report.version === 1 &&
      report.verificationClass === 'REFERENCE_RECON_ONLY' &&
      report.reviewStatus === 'PENDING',
    'PROTOCOL'
  )
  requireThat(
    STATUSES.includes(report.status) && report.exitCode === (ok ? 0 : 1),
    'PROTOCOL'
  )
  requireThat(
    (report.runId === null && report.status === 'INVALID_INPUT') ||
      (text(report.runId, 64) && RUN.test(report.runId)),
    'PROTOCOL'
  )
  requireThat(
    (report.fixtureId === null && report.status === 'INVALID_INPUT') ||
      report.fixtureId === 'NATIVE_PORT_503_V1',
    'PROTOCOL'
  )
  const td = closed(
    report.toolchainDigests,
    ['expected', 'observed'],
    'PROTOCOL'
  )
  for (const name of ['expected', 'observed']) {
    const d = closed(
      td[name],
      ['claudeSha256', 'nodeSha256', 'dockerSha256', 'imageId'],
      'PROTOCOL'
    )
    for (const key of ['claudeSha256', 'nodeSha256', 'dockerSha256'])
      requireThat(digest(d[key], name === 'observed' && !ok), 'PROTOCOL')
    requireThat(
      (name === 'observed' && !ok && d.imageId === null) ||
        (typeof d.imageId === 'string' &&
          /^sha256:[a-f0-9]{64}$/.test(d.imageId)),
      'PROTOCOL'
    )
    if (ok && name === 'observed')
      for (const key of Object.keys(d))
        requireThat(d[key] === td.expected[key], 'PROTOCOL')
  }
  requireThat(
    digest(report.driverSha256, !ok) && digest(report.profileSha256, !ok),
    'PROTOCOL'
  )
  const artifacts = list(report.artifacts, 512, 'PROTOCOL')
  const paths = new Map()
  let bytes = 0
  for (const a of artifacts) {
    closed(a, ['role', 'path', 'sha256', 'bytes'], 'PROTOCOL')
    requireThat(
      ROLES.includes(a.role) &&
        safeRelative(a.path) &&
        !paths.has(a.path) &&
        digest(a.sha256) &&
        int(a.bytes, TOTAL),
      'PROTOCOL'
    )
    paths.set(a.path, a)
    bytes += a.bytes
  }
  requireThat(bytes <= TOTAL, 'CAP')
  const ref = (value) =>
    typeof value === 'string' &&
    paths.has(value.split('#')[0]) &&
    (!value.includes('#') || /^[^#]+#\d+$/.test(value))
  const checks = list(report.containmentChecks, CHECK_IDS.length, 'PROTOCOL')
  requireThat(checks.length === CHECK_IDS.length, 'PROTOCOL')
  for (let i = 0; i < checks.length; i++) {
    const check = closed(
      checks[i],
      ['id', 'status', 'message', 'artifactPaths'],
      'PROTOCOL'
    )
    requireThat(
      check.id === CHECK_IDS[i] &&
        ['PASS', 'FAIL', 'NOT_RUN'].includes(check.status) &&
        text(check.message, 512),
      'PROTOCOL'
    )
    const references = list(check.artifactPaths, 16, 'PROTOCOL')
    requireThat(
      new Set(references).size === references.length && references.every(ref),
      'PROTOCOL'
    )
    if (check.status === 'PASS') requireThat(references.length > 0, 'PROTOCOL')
    if (ok) requireThat(check.status === 'PASS', 'PROTOCOL')
  }
  const observations = list(report.observations, 4, 'PROTOCOL')
  let last = -1
  for (const o of observations) {
    closed(
      o,
      [
        'ordinal',
        'method',
        'path',
        'bodySha256',
        'bytes',
        'markerVerified',
        'encodingKnown',
        'offsetMs',
        'bodyPath',
        'eventPath',
        'responsePath',
        'contentType',
        'contentEncoding'
      ],
      'PROTOCOL'
    )
    requireThat(
      int(o.ordinal, 3) &&
        o.ordinal > last &&
        o.method === 'POST' &&
        o.path === '/v1/messages',
      'PROTOCOL'
    )
    last = o.ordinal
    requireThat(
      digest(o.bodySha256) &&
        int(o.bytes, 512 * 1024) &&
        int(o.offsetMs, 35000),
      'PROTOCOL'
    )
    requireThat(
      typeof o.markerVerified === 'boolean' &&
        typeof o.encodingKnown === 'boolean' &&
        ['JSON', 'OTHER', 'ABSENT'].includes(o.contentType) &&
        ['IDENTITY', 'OTHER', 'ABSENT'].includes(o.contentEncoding),
      'PROTOCOL'
    )
    requireThat(
      o.encodingKnown === (o.contentEncoding !== 'OTHER') &&
        ref(o.bodyPath) &&
        ref(o.eventPath) &&
        ref(o.responsePath),
      'PROTOCOL'
    )
    const body = paths.get(o.bodyPath)
    requireThat(
      body?.role === 'request-body' &&
        body.sha256 === o.bodySha256 &&
        body.bytes === o.bytes,
      'PROTOCOL'
    )
    requireThat(
      paths.get(o.eventPath.split('#')[0])?.role === 'observer-trace' &&
        paths.get(o.responsePath.split('#')[0])?.role === 'observer-trace',
      'PROTOCOL'
    )
  }
  requireThat(
    artifacts.filter((a) => a.role === 'request-body').length ===
      observations.length,
    'PROTOCOL'
  )
  if (ok) {
    requireThat(observations.length > 0, 'PROTOCOL')
    for (const role of [
      'manifest',
      'stdin',
      'settings',
      'mcp',
      'consumed-inputs',
      'bundle-inventory',
      'profile',
      'cleanup',
      'failures'
    ])
      requireThat(
        artifacts.filter((a) => a.role === role).length === 1,
        'PROTOCOL'
      )
    requireThat(
      artifacts.some((a) => a.role === 'bundle-source'),
      'PROTOCOL'
    )
  }
  const limitations = list(report.limitations, 32, 'PROTOCOL')
  requireThat(
    limitations.length > 0 &&
      limitations.every((x) => text(x, 512) && x.length > 0),
    'PROTOCOL'
  )
  validateExecution(report.nativeExecution, ok)
  return report
}
