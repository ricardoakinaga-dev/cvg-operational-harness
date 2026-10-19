import { createHash } from 'node:crypto'
import { canonicalJson } from '../../support/governed-test-kit/index.js'

// SPEC0238 literals. Nothing here is selected by the manifest or by the target.
export const TASK = 'C100-Q01-REF-CAPTURE-001'
export const OWNER = 'CLAUDE100-EXEC-20261017'
export const SPEC_PATH =
  'docs/02_spec/0238_claude_scripted_reference_capture.md'
export const SPEC_SHA256 =
  '73ab205e2a7b84e3db9792bd2833ac515dd332647bfd30480e9fef6b81debadc'
export const PINS = Object.freeze({
  claudePath: '/home/ricardo/.local/share/claude/versions/2.1.302',
  claudeSha256:
    '60d7eb7f12fbb28a52533fe8be5884097403562aa02dc73991a021c7067e29a5',
  nodePath: '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node',
  nodeSha256:
    '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327',
  dockerPath: '/usr/bin/docker',
  dockerSha256:
    '7ed12b00293d64742419a6601ae97960a367a0ce97c88b06e3278cc0a409557b',
  dockerSocket: '/var/run/docker.sock',
  dockerApi: '1.51',
  imageId:
    'sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94',
  version: '2.1.302'
})
export const MODEL = 'claude-opus-5-5'
export const API_KEY = 'cvg-synthetic-capture-v1'
export const MARKER_PARENT = '/tmp/cvg-claude100-exec-20261017'
export const MARKER_ROOT =
  '/tmp/cvg-claude100-exec-20261017/ref-capture-markers'
export const NATIVE_PATH =
  '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
export const CASES = Object.freeze(['TEXT', 'READ', 'WRITE_DENIED'])
export const PHASES = Object.freeze([
  'VALIDATE',
  'SNAPSHOT',
  'CREATE',
  'PREFLIGHT',
  'VERSION',
  'TEXT',
  'READ',
  'WRITE_DENIED',
  'STOP',
  'CLEANUP',
  'REVALIDATE',
  'PUBLISH'
])
export const CODES = Object.freeze([
  'IO',
  'CLEANUP',
  'PROTOCOL',
  'PRIVACY',
  'CAP',
  'TIMEOUT',
  'SIGNAL',
  'DRIFT_RUNTIME',
  'IDENTITY_MISMATCH',
  'TOOLCHAIN_UNAVAILABLE',
  'INPUT_INVALID',
  'CONTAINMENT',
  'INCOMPATIBLE_TRANSCRIPT'
])
export const STATUSES = Object.freeze([
  'COLLECTED_REQUIRES_REVIEW',
  'INFRA_FAILURE',
  'INVALID_INPUT',
  'BLOCKED_CONTAINMENT',
  'INCOMPATIBLE_TRANSCRIPT'
])
export const CASE_STATUSES = Object.freeze([
  'NOT_RUN',
  'FAILED',
  'INCOMPATIBLE',
  'CAPTURED'
])
export const CHECK_IDS = Object.freeze(
  Array.from({ length: 11 }, (_, i) => `RC${String(i + 1).padStart(2, '0')}`)
)
export const CHECK_MESSAGES = Object.freeze([
  'NOT_REACHED',
  'EVIDENCE_BOUND',
  'EVIDENCE_REJECTED',
  'EXTERNAL_GATE_PENDING'
])
export const ROLES = Object.freeze([
  'INPUT_MANIFEST',
  'INPUT_SPEC',
  'INPUT_SETTINGS',
  'INPUT_MCP',
  'INPUT_FIXTURE',
  'INPUT_SCRIPT',
  'CODE_BUNDLE',
  'INPUT_IDENTITIES',
  'PROFILE',
  'INSPECT',
  'PREFLIGHT',
  'CONTROL_TRACE',
  'OBSERVER_TRACE',
  'REQUEST_BODY',
  'RESPONSE_HEADERS',
  'RESPONSE_SEGMENT',
  'RESPONSE_BODY',
  'NATIVE_STDOUT',
  'NATIVE_STDERR',
  'NATIVE_START',
  'NATIVE_END',
  'WORKSPACE_STATE',
  'CLEANUP',
  'FAILURES',
  'RAW_PIPE',
  'PARTIAL_PIPE'
])
export const SIGNALS = Object.freeze(
  'SIGHUP SIGINT SIGQUIT SIGILL SIGTRAP SIGABRT SIGBUS SIGFPE SIGKILL SIGUSR1 SIGSEGV SIGUSR2 SIGPIPE SIGALRM SIGTERM SIGCHLD SIGCONT SIGSTOP SIGTSTP SIGTTIN SIGTTOU SIGURG SIGXCPU SIGXFSZ SIGVTALRM SIGPROF SIGWINCH SIGIO SIGPWR SIGSYS'.split(
    ' '
  )
)
export const LIMITS = Object.freeze({
  controllerMs: 90000,
  closeMs: 10000,
  versionMs: 5000,
  caseMs: 20000,
  killGraceMs: 500,
  wrapperLifeMs: 115000,
  attachHandshakeMs: 2000,
  dockerCalls: 32,
  dockerCallMs: 2000,
  dockerStreamBytes: 256 * 1024,
  requests: 12,
  eligiblePosts: 5,
  headerBytes: 8 * 1024,
  bodyBytes: 512 * 1024,
  totalBodyBytes: 3 * 1024 * 1024,
  responseBytes: 16 * 1024,
  totalResponseBytes: 80 * 1024,
  nativeStreamBytes: 1024 * 1024,
  controlFrameBytes: 8 * 1024,
  controlFrames: 1024,
  controlBytes: 1024 * 1024,
  rawPayloadBytes: 4096,
  rawFrames: 8192,
  rawWireBytes: 8 * 1024 * 1024,
  bundleFiles: 256,
  bundleBytes: 1024 * 1024,
  artifacts: 512,
  artifactBytes: 16 * 1024 * 1024,
  jsonDepth: 64,
  jsonString: 64 * 1024,
  hostRecords: 1024,
  failures: 1024,
  causeChildren: 64,
  manifestBytes: 4096,
  offsetMs: 100000,
  workspaceStateBytes: 4096,
  workspaceEntries: 16,
  workspaceFileBytes: 64 * 1024
})
export const SETTINGS_BYTES = Buffer.from(
  '{"permissions":{"defaultMode":"dontAsk","allow":["Read"]}}'
)
export const MCP_BYTES = Buffer.from('{"mcpServers":{}}')
export const FIXTURE_BYTES = Buffer.from('CVG_CAPTURE_READ_INPUT_V1\n')
export const STDIN_MARKERS = Object.freeze({
  TEXT: 'CVG_CAPTURE_TEXT_V1',
  READ: 'CVG_CAPTURE_READ_V1',
  WRITE_DENIED: 'CVG_CAPTURE_WRITE_DENIED_V1'
})
export const VERSION_PATTERN = /^2\.1\.302 \(Claude Code\)(?:\r?\n)?$/

export const canonical = canonicalJson
export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex')
export const digestOf = (value) => sha256(canonical(value))

/** Closed typed failure. Messages never carry native text, env or auth. */
export function fault(code, cause) {
  return Object.assign(
    new Error(`Reference capture ${code}`, cause ? { cause } : undefined),
    { code }
  )
}

export const caseOf = (processOrdinal) =>
  processOrdinal === 0 ? null : CASES[processOrdinal - 1]
export const ordinalOf = (caseId) =>
  caseId === null ? 0 : CASES.indexOf(caseId) + 1
export const caseTag = (caseId) => (caseId === null ? 0 : ordinalOf(caseId))
export const caseFromTag = (tag) => (tag === 0 ? null : CASES[tag - 1])

const COMMON_ARGS = Object.freeze([
  '--bare',
  '--print',
  '--output-format',
  'json',
  '--model',
  MODEL,
  '--permission-mode',
  'dontAsk',
  '--permission-prompts',
  'none',
  '--no-session-persistence',
  '--strict-mcp-config',
  '--mcp-config',
  '/workspace/mcp.json',
  '--settings',
  '/workspace/settings.json',
  '--setting-sources',
  ''
])
export const NATIVE_FILE = '/toolchain/claude'
export const NATIVE_CWD = '/workspace'

/** Fixed per-process invocation. Port is the only operational variable. */
export function processInvocation(processOrdinal, port) {
  if (
    !Number.isSafeInteger(processOrdinal) ||
    processOrdinal < 0 ||
    processOrdinal > 3 ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw fault('PROTOCOL')
  const caseId = caseOf(processOrdinal)
  const scratch = `/scratch/${caseId ?? 'version'}`
  const args =
    processOrdinal === 0
      ? ['--version']
      : caseId === 'TEXT'
        ? [...COMMON_ARGS, '--tools', '']
        : [...COMMON_ARGS, '--tools', 'Read,Edit', '--allowedTools', 'Read']
  return {
    processOrdinal,
    caseId,
    file: NATIVE_FILE,
    args,
    cwd: NATIVE_CWD,
    scratch,
    env: {
      HOME: `${scratch}/home`,
      CLAUDE_CONFIG_DIR: `${scratch}/config`,
      PATH: NATIVE_PATH,
      LANG: 'C.UTF-8',
      TZ: 'UTC',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
      ANTHROPIC_API_KEY: API_KEY
    },
    stdin: Buffer.from(caseId === null ? '' : STDIN_MARKERS[caseId])
  }
}
export const argvDigest = (invocation) =>
  digestOf([invocation.file, ...invocation.args])
export const envDigest = (invocation) => digestOf(invocation.env)
/** The map {version,TEXT,READ,WRITE_DENIED} bound by CONFIGURE and READY. */
export function envSet(port) {
  return {
    version: processInvocation(0, port).env,
    TEXT: processInvocation(1, port).env,
    READ: processInvocation(2, port).env,
    WRITE_DENIED: processInvocation(3, port).env
  }
}
export const envSetDigest = (port) => digestOf(envSet(port))
