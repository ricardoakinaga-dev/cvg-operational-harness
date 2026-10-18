import { createHash } from 'node:crypto'
import { lstat, readFile, readlink, readdir } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { pathToFileURL } from 'node:url'
import { parseStrictJson } from '../qualification/strict-json.mjs'
import { canonicalJson } from '../../support/governed-test-kit/index.js'

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
  imageId:
    'sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94',
  version: '2.1.302'
})
export const LIMITS = Object.freeze({
  requests: 4,
  bodyBytes: 512 * 1024,
  totalBodyBytes: 2 * 1024 * 1024,
  headerBytes: 8 * 1024,
  nativeStdoutBytes: 1024 * 1024,
  nativeStderrBytes: 1024 * 1024,
  artifactBytes: 8 * 1024 * 1024,
  controlFrameBytes: 8 * 1024,
  controlFrames: 256,
  controlBytes: 512 * 1024,
  rawFrameBytes: 4096,
  nativeMs: 20000,
  controllerMs: 30000,
  cleanupMs: 5000,
  sources: 256,
  sourceBytes: 1024 * 1024
})
export const STDIN_TEXT = 'CVG_SYNTHETIC_NATIVE_PORT_PROBE_V1'
export const SETTINGS_TEXT = '{}'
export const MCP_TEXT = '{"mcpServers":{}}'
export const RESPONSE_BODY = Buffer.from(
  '{"type":"error","error":{"type":"overloaded_error","message":"CVG_SYNTHETIC_503"}}'
)
export const RESPONSE_HEADERS = Object.freeze({
  'content-type': 'application/json',
  'content-length': '82',
  connection: 'close'
})
if (RESPONSE_BODY.length !== 82) throw new Error('Fixed response byte mismatch')

export const canonical = canonicalJson
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
export function fault(code, cause) {
  return Object.assign(
    new Error(`Reference port ${code}`, cause ? { cause } : undefined),
    { code }
  )
}
const digest = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const integer = (v, lo, hi) => Number.isSafeInteger(v) && v >= lo && v <= hi
const portNumber = (v) => integer(v, 1, 65535)
const runIdentifier = (v) =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v)
const phase = (v) => v === 'version' || v === 'port'
export const SIGNALS = Object.freeze(
  'SIGHUP SIGINT SIGQUIT SIGILL SIGTRAP SIGABRT SIGBUS SIGFPE SIGKILL SIGUSR1 SIGSEGV SIGUSR2 SIGPIPE SIGALRM SIGTERM SIGCHLD SIGCONT SIGSTOP SIGTSTP SIGTTIN SIGTTOU SIGURG SIGXCPU SIGXFSZ SIGVTALRM SIGPROF SIGWINCH SIGIO SIGPWR SIGSYS'.split(
    ' '
  )
)

function requireValue(value) {
  if (!value) throw fault('PROTOCOL')
}
function closed(value, keys) {
  requireValue(
    value !== null && typeof value === 'object' && !Array.isArray(value)
  )
  requireValue(
    Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key))
  )
}
export function nativeInvocation(port) {
  requireValue(portNumber(port))
  return {
    file: '/toolchain/claude',
    versionArgs: ['--version'],
    args: [
      '--bare',
      '--print',
      '--output-format',
      'json',
      '--tools',
      '',
      '--no-session-persistence',
      '--strict-mcp-config',
      '--mcp-config',
      '/workspace/mcp.json',
      '--settings',
      '/workspace/settings.json',
      '--setting-sources',
      ''
    ],
    env: {
      HOME: '/scratch/home',
      CLAUDE_CONFIG_DIR: '/scratch/config',
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      LANG: 'C.UTF-8',
      TZ: 'UTC',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
      ANTHROPIC_API_KEY: 'cvg-synthetic-native-probe-v1'
    },
    cwd: '/workspace',
    stdin: Buffer.from(STDIN_TEXT)
  }
}

function parsedLine(line) {
  try {
    requireValue(
      typeof line === 'string' ||
        Buffer.isBuffer(line) ||
        line instanceof Uint8Array
    )
    const bytes = Buffer.from(line)
    requireValue(bytes.length > 0 && bytes.length <= LIMITS.controlFrameBytes)
    // One optional framing LF; embedded newlines and CR are never JSON whitespace here.
    const body = bytes.at(-1) === 10 ? bytes.subarray(0, -1) : bytes
    requireValue(!body.includes(10) && !body.includes(13))
    return parseStrictJson(body, {
      maxBytes: LIMITS.controlFrameBytes,
      maxDepth: 16,
      maxStringBytes: 4096
    })
  } catch (error) {
    throw fault('PROTOCOL', error)
  }
}
function envelope(value, role, runId, expectedSeq, host) {
  requireValue(['observer', 'client'].includes(role) && runIdentifier(runId))
  closed(
    value,
    host
      ? ['version', 'runId', 'seq', 'type', 'payload']
      : ['version', 'runId', 'role', 'seq', 'type', 'payload']
  )
  requireValue(
    value.version === 1 &&
      value.runId === runId &&
      (host || value.role === role)
  )
  requireValue(
    integer(expectedSeq, 0, LIMITS.controlFrames - 1) &&
      value.seq === expectedSeq
  )
}
function ready(payload, role) {
  closed(payload, [
    'uid',
    'gid',
    'pid',
    'pidNamespace',
    'netNamespace',
    'interfaces',
    'routes',
    'hostMarkerAbsent',
    'port',
    ...(role === 'client' ? ['profileSha256', 'envSha256'] : [])
  ])
  requireValue(
    integer(payload.uid, 0, 0xffffffff) &&
      integer(payload.gid, 0, 0xffffffff) &&
      integer(payload.pid, 1, 0x7fffffff)
  )
  requireValue(
    [payload.pidNamespace, payload.netNamespace].every(
      (v) => typeof v === 'string' && /^\d{1,20}$/.test(v)
    )
  )
  // Schema validation retains mismatching observations for host containment classification.
  requireValue(
    Array.isArray(payload.interfaces) &&
      payload.interfaces.length <= 64 &&
      payload.interfaces.every(
        (v) => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(v)
      )
  )
  requireValue(
    Array.isArray(payload.routes) &&
      payload.routes.length <= 64 &&
      payload.routes.every(
        (v) => typeof v === 'string' && /^[A-Fa-f0-9.:/]{1,64}$/.test(v)
      )
  )
  requireValue(
    typeof payload.hostMarkerAbsent === 'boolean' && portNumber(payload.port)
  )
  if (role === 'client')
    requireValue(digest(payload.profileSha256) && digest(payload.envSha256))
}
export function parseControlLine(line, role, runId, expectedSeq) {
  const v = parsedLine(line)
  envelope(v, role, runId, expectedSeq, false)
  const p = v.payload
  switch (v.type) {
    case 'READY':
      ready(p, role)
      break
    case 'CLOSED':
      closed(p, [])
      break
    case 'NATIVE_START':
      requireValue(role === 'client')
      closed(p, [
        'phase',
        'pid',
        'ppid',
        'argvSha256',
        'envSha256',
        'stdinSha256'
      ])
      requireValue(
        phase(p.phase) &&
          integer(p.pid, 1, 0x7fffffff) &&
          integer(p.ppid, 1, 0x7fffffff)
      )
      requireValue(
        digest(p.argvSha256) && digest(p.envSha256) && digest(p.stdinSha256)
      )
      break
    case 'NATIVE_END':
      requireValue(role === 'client')
      closed(p, ['phase', 'exitCode', 'signal', 'timeout'])
      requireValue(
        phase(p.phase) &&
          (p.exitCode === null || integer(p.exitCode, 0, 255)) &&
          (p.signal === null || SIGNALS.includes(p.signal)) &&
          typeof p.timeout === 'boolean'
      )
      requireValue(p.exitCode === null || p.signal === null)
      break
    case 'ARMED':
      requireValue(role === 'observer')
      closed(p, ['phase', 'port'])
      requireValue(p.phase === 'port' && portNumber(p.port))
      break
    case 'REQUEST':
      requireValue(role === 'observer')
      closed(p, [
        'phase',
        'ordinal',
        'method',
        'path',
        'bodySha256',
        'bytes',
        'markerVerified',
        'contentType',
        'contentEncoding'
      ])
      requireValue(
        p.phase === 'port' &&
          integer(p.ordinal, 0, 3) &&
          p.method === 'POST' &&
          p.path === '/v1/messages'
      )
      requireValue(
        digest(p.bodySha256) &&
          integer(p.bytes, 0, LIMITS.bodyBytes) &&
          typeof p.markerVerified === 'boolean'
      )
      requireValue(
        ['JSON', 'OTHER', 'ABSENT'].includes(p.contentType) &&
          ['IDENTITY', 'OTHER', 'ABSENT'].includes(p.contentEncoding)
      )
      break
    case 'RESPONSE':
      requireValue(role === 'observer')
      closed(p, [
        'phase',
        'ordinal',
        'status',
        'headersSha256',
        'bodySha256',
        'outcome'
      ])
      requireValue(
        p.phase === 'port' &&
          integer(p.ordinal, 0, 3) &&
          p.status === 503 &&
          digest(p.headersSha256) &&
          digest(p.bodySha256) &&
          ['FINISHED', 'FAILED'].includes(p.outcome)
      )
      break
    case 'REJECTED':
      requireValue(role === 'observer')
      closed(p, ['reason', 'ordinal'])
      requireValue(
        [
          'EARLY_PHASE',
          'UNSUPPORTED_ROUTE',
          'MISSING_SENTINEL',
          'FORBIDDEN_AUTH',
          'CAP'
        ].includes(p.reason) && integer(p.ordinal, 0, 3)
      )
      break
    default:
      throw fault('PROTOCOL')
  }
  return v
}
export function parseHostCommand(line, role, runId, expectedSeq) {
  const v = parsedLine(line)
  envelope(v, role, runId, expectedSeq, true)
  if (v.type === 'CONFIGURE') {
    requireValue(role === 'client')
    closed(v.payload, ['port', 'profileSha256', 'envSha256'])
    requireValue(
      portNumber(v.payload.port) &&
        digest(v.payload.profileSha256) &&
        digest(v.payload.envSha256)
    )
  } else {
    requireValue(
      (role === 'client' &&
        ['START_NATIVE', 'START_PORT', 'STOP'].includes(v.type)) ||
        (role === 'observer' && ['ARM_PORT', 'STOP'].includes(v.type))
    )
    closed(v.payload, [])
  }
  return v
}
export function encodeCommand(runId, seq, type, payload = {}) {
  const line = Buffer.from(
    canonical({ version: 1, runId, seq, type, payload }) + '\n'
  )
  parseHostCommand(
    line,
    type === 'ARM_PORT' ? 'observer' : 'client',
    runId,
    seq
  )
  return line
}

export function versionMatches(bytes, result) {
  if (result.exitCode !== 0 || result.signal !== null || result.timeout)
    return false
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return new RegExp(
      `^${PINS.version.replaceAll('.', '\\.')} \\(Claude Code\\)(?:\\r?\\n)?$`
    ).test(text)
  } catch {
    return false
  }
}

// Pure admission state used by the actual wrappers; commands themselves never spawn.
export function phaseGate(role) {
  requireValue(['client', 'observer'].includes(role))
  let configured = false,
    versionStarted = false,
    versionEnded = false
  let versionAccepted = false,
    portStarted = false,
    portEnded = false,
    armed = false,
    stopped = false
  return {
    command(type) {
      requireValue(!stopped)
      if (type === 'STOP') {
        stopped = true
        return
      }
      if (role === 'observer') {
        requireValue(type === 'ARM_PORT' && !armed)
        armed = true
        return
      }
      if (type === 'CONFIGURE') {
        requireValue(!configured)
        configured = true
        return
      }
      if (type === 'START_NATIVE') {
        requireValue(configured && !versionStarted)
        versionStarted = true
        return
      }
      requireValue(
        type === 'START_PORT' && versionEnded && versionAccepted && !portStarted
      )
      portStarted = true
    },
    end(phase, accepted = false) {
      requireValue(role === 'client' && !stopped)
      if (phase === 'version') {
        requireValue(versionStarted && !versionEnded && !portStarted)
        versionEnded = true
        versionAccepted = accepted
      } else {
        requireValue(phase === 'port' && portStarted && !portEnded)
        portEnded = true
      }
    }
  }
}

// Register turns in HTTP arrival order while bodies may complete concurrently.
export function orderedTurns() {
  let previous = Promise.resolve()
  return () => {
    const wait = previous
    let release
    previous = new Promise((resolve) => {
      release = resolve
    })
    return { wait, release }
  }
}

export function encodeRawFrames(bytes, role, phaseOrOrdinal, channel) {
  requireValue(Buffer.isBuffer(bytes) && ['client', 'observer'].includes(role))
  requireValue(
    role === 'observer'
      ? integer(phaseOrOrdinal, 0, 3)
      : phase(phaseOrOrdinal) && ['stdout', 'stderr'].includes(channel)
  )
  const output = []
  for (
    let offset = 0;
    offset < Math.max(1, bytes.length);
    offset += LIMITS.rawFrameBytes
  ) {
    const part = bytes.subarray(offset, offset + LIMITS.rawFrameBytes)
    const header = Buffer.alloc(role === 'client' ? 11 : 10)
    header.write(role === 'client' ? 'CVGN1' : 'CVGB1')
    header[5] =
      role === 'client'
        ? phaseOrOrdinal === 'version'
          ? 0
          : 1
        : phaseOrOrdinal
    if (role === 'client') header[6] = channel === 'stdout' ? 1 : 2
    header.writeUInt32BE(part.length, role === 'client' ? 7 : 6)
    output.push(Buffer.concat([header, part]))
  }
  return output
}
export function decodeRawFrames(buffer, role) {
  requireValue(Buffer.isBuffer(buffer) && ['client', 'observer'].includes(role))
  // Worst-case one-byte frames are bounded too, before allocating the result list.
  requireValue(buffer.length <= LIMITS.artifactBytes)
  let offset = 0,
    total = 0,
    lastOrdinal = -1,
    lastPhase = 0
  const counts = { stdout: 0, stderr: 0 },
    bodyCounts = [0, 0, 0, 0],
    frames = []
  const terminals = new Set(),
    seenPhases = new Set(),
    seenOrdinals = new Set()
  const headerSize = role === 'client' ? 11 : 10
  while (offset < buffer.length) {
    requireValue(buffer.length - offset >= headerSize)
    requireValue(
      buffer
        .subarray(offset, offset + 5)
        .equals(Buffer.from(role === 'client' ? 'CVGN1' : 'CVGB1'))
    )
    const tag = buffer[offset + 5],
      ch = buffer[offset + 6]
    const length = buffer.readUInt32BE(offset + (role === 'client' ? 7 : 6))
    requireValue(
      length <= LIMITS.rawFrameBytes &&
        buffer.length - offset - headerSize >= length
    )
    const bytes = Buffer.from(
      buffer.subarray(offset + headerSize, offset + headerSize + length)
    )
    if (role === 'client') {
      requireValue(
        (tag === 0 || tag === 1) && (ch === 1 || ch === 2) && tag >= lastPhase
      )
      lastPhase = tag
      const channel = ch === 1 ? 'stdout' : 'stderr'
      const key = `${tag}/${channel}`
      requireValue(!terminals.has(key))
      seenPhases.add(tag)
      if (length === 0) terminals.add(key)
      counts[channel] += length
      requireValue(
        counts[channel] <=
          (ch === 1 ? LIMITS.nativeStdoutBytes : LIMITS.nativeStderrBytes)
      )
      frames.push({ phase: tag === 0 ? 'version' : 'port', channel, bytes })
    } else {
      requireValue(integer(tag, 0, 3) && tag >= lastOrdinal)
      requireValue(!terminals.has(tag))
      seenOrdinals.add(tag)
      if (length === 0) terminals.add(tag)
      lastOrdinal = tag
      bodyCounts[tag] += length
      total += length
      requireValue(
        bodyCounts[tag] <= LIMITS.bodyBytes && total <= LIMITS.totalBodyBytes
      )
      frames.push({ ordinal: tag, bytes })
    }
    offset += headerSize + length
  }
  // This API validates an entire buffer. Incremental host decoders wait for these
  // markers AND their corresponding trusted control event before classification.
  if (role === 'client') {
    for (const tag of seenPhases)
      requireValue(
        terminals.has(`${tag}/stdout`) && terminals.has(`${tag}/stderr`)
      )
  } else
    for (const ordinal of seenOrdinals) requireValue(terminals.has(ordinal))
  return frames
}

export function wrapperArguments(argv) {
  requireValue(
    argv.length === 2 &&
      runIdentifier(argv[0]) &&
      /^\/tmp\/cvg-claude100-exec-20261017\/ref-port-markers\/[a-f0-9]{32}$/.test(
        argv[1]
      )
  )
  return { runId: argv[0], hostMarkerPath: argv[1] }
}
export function isDirectMain(url) {
  return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === url
}

export async function preflight(hostMarkerPath) {
  wrapperArguments(['preflight', hostMarkerPath])
  try {
    const [pidLink, netLink, ipv4, ipv6, names] = await Promise.all([
      readlink('/proc/self/ns/pid'),
      readlink('/proc/self/ns/net'),
      readFile('/proc/net/route', 'utf8'),
      readFile('/proc/net/ipv6_route', 'utf8'),
      readdir('/sys/class/net')
    ])
    const inode = (link, kind) => {
      const match = new RegExp(`^${kind}:\\[(\\d+)\\]$`).exec(link)
      if (!match) throw fault('CONTAINMENT')
      return match[1]
    }
    const interfaces = names.sort()
    const addresses = networkInterfaces()
    if (
      interfaces.length !== 1 ||
      interfaces[0] !== 'lo' ||
      Object.keys(addresses).some((name) => name !== 'lo') ||
      Object.values(addresses)
        .flat()
        .some((a) => !a.internal)
    )
      throw fault('CONTAINMENT')
    const routes = []
    for (const row of ipv4.trim().split('\n').slice(1)) {
      if (!row.trim()) continue
      const fields = row.trim().split(/\s+/)
      if (
        fields.length < 8 ||
        fields[0] !== 'lo' ||
        !/^[a-fA-F0-9]{8}$/.test(fields[1]) ||
        fields[1].slice(6).toLowerCase() !== '7f' ||
        fields[2] !== '00000000' ||
        !/^[a-fA-F0-9]{8}$/.test(fields[7])
      )
        throw fault('CONTAINMENT')
      const destination = [...Buffer.from(fields[1], 'hex')].reverse()
      const mask = [...Buffer.from(fields[7], 'hex')]
        .reverse()
        .map((v) => v.toString(2).padStart(8, '0'))
        .join('')
      if (!/^1{8,32}0*$/.test(mask)) throw fault('CONTAINMENT')
      routes.push(
        `${destination.join('.')}/${mask.indexOf('0') === -1 ? 32 : mask.indexOf('0')}`
      )
    }
    for (const row of ipv6.trim().split('\n')) {
      if (!row.trim()) continue
      const f = row.trim().split(/\s+/)
      // Linux includes unreachable default entries on lo: they are not routes.
      if (f.length !== 10 || f[9] !== 'lo') throw fault('CONTAINMENT')
      if ((Number.parseInt(f[8], 16) & 0x200) !== 0) continue
      if (
        f[0] !== '00000000000000000000000000000001' ||
        f[1] !== '80' ||
        f[4] !== '00000000000000000000000000000000'
      )
        throw fault('CONTAINMENT')
      routes.push('::1/128')
    }
    let hostMarkerAbsent = false
    try {
      await lstat(hostMarkerPath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      hostMarkerAbsent = true
    }
    const result = {
      uid: process.getuid(),
      gid: process.getgid(),
      pid: process.pid,
      pidNamespace: inode(pidLink, 'pid'),
      netNamespace: inode(netLink, 'net'),
      interfaces,
      routes,
      hostMarkerAbsent
    }
    if (
      result.uid !== 1000 ||
      result.gid !== 1000 ||
      result.pid !== 1 ||
      !hostMarkerAbsent
    )
      throw fault('CONTAINMENT')
    return result
  } catch (error) {
    throw fault('CONTAINMENT', error)
  }
}

// Shared trusted IO; no raw child data ever enters these control helpers.
export function controlWriter(stream, role, runId) {
  let seq = 0,
    bytes = 0
  return async (type, payload = {}) => {
    const frame = Buffer.from(
      canonical({ version: 1, runId, role, seq, type, payload }) + '\n'
    )
    parseControlLine(frame, role, runId, seq)
    bytes += frame.length
    if (bytes > LIMITS.controlBytes) throw fault('CAP')
    seq++
    await writeBytes(stream, frame)
  }
}
export function writeBytes(stream, bytes) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(fault('TIMEOUT')), LIMITS.cleanupMs)
    try {
      stream.write(bytes, (error) => {
        clearTimeout(timeout)
        if (error) reject(fault('IO', error))
        else resolve()
      })
    } catch (error) {
      clearTimeout(timeout)
      reject(fault('IO', error))
    }
  })
}
export async function* hostCommands(stream, role, runId) {
  let pending = Buffer.alloc(0),
    total = 0,
    seq = 0
  const seen = new Set()
  for await (const chunk of stream) {
    total += chunk.length
    if (total > LIMITS.controlBytes) throw fault('CAP')
    pending = Buffer.concat([pending, chunk])
    let end
    const commands = []
    while ((end = pending.indexOf(10)) !== -1) {
      const line = pending.subarray(0, end + 1)
      const command = parseHostCommand(line, role, runId, seq++)
      requireValue(!seen.has(command.type) && !seen.has('STOP'))
      seen.add(command.type)
      commands.push(command)
      pending = pending.subarray(end + 1)
    }
    if (pending.length >= LIMITS.controlFrameBytes) throw fault('CAP')
    if (seen.has('STOP') && pending.length) throw fault('PROTOCOL')
    for (const command of commands) yield command
  }
  throw fault('PROTOCOL') // EOF is never a substitute for STOP.
}

export function inspectRequest(method, url, rawHeaders, armed) {
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0)
    return { reason: 'FORBIDDEN_AUTH' }
  const headers = new Map()
  let bytes = Buffer.byteLength(`${method} ${url} HTTP/1.1\r\n`) + 2
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const key = rawHeaders[i].toLowerCase(),
      value = rawHeaders[i + 1]
    bytes += Buffer.byteLength(rawHeaders[i]) + Buffer.byteLength(value) + 4
    if (
      headers.has(key) ||
      (/(auth|cookie|token|api[-_]?key)/i.test(key) && key !== 'x-api-key') ||
      (key === 'x-api-key' && value !== 'cvg-synthetic-native-probe-v1')
    )
      return { reason: 'FORBIDDEN_AUTH' }
    headers.set(key, value)
  }
  if (bytes > LIMITS.headerBytes) return { reason: 'CAP' }
  if (!armed) return { reason: 'EARLY_PHASE' }
  if (method !== 'POST' || !/^\/v1\/messages(?:\?beta=true)?$/.test(url))
    return { reason: 'UNSUPPORTED_ROUTE' }
  if (!headers.has('x-api-key')) return { reason: 'MISSING_SENTINEL' }
  return {
    contentType: !headers.has('content-type')
      ? 'ABSENT'
      : /^application\/json(?:\s*;.*)?$/i.test(headers.get('content-type'))
        ? 'JSON'
        : 'OTHER',
    contentEncoding: !headers.has('content-encoding')
      ? 'ABSENT'
      : headers.get('content-encoding').toLowerCase() === 'identity'
        ? 'IDENTITY'
        : 'OTHER'
  }
}
export function markerVerified(bytes, classification) {
  if (
    classification.contentType !== 'JSON' ||
    classification.contentEncoding === 'OTHER'
  )
    return false
  try {
    const body = parseStrictJson(bytes, {
      maxBytes: LIMITS.bodyBytes,
      maxDepth: 16,
      maxStringBytes: 4096
    })
    // Recognize only the user-message text shape; free text anywhere else is not proof.
    if (!body || !Array.isArray(body.messages)) return false
    return body.messages.some(
      (m) =>
        m?.role === 'user' &&
        (m.content === STDIN_TEXT ||
          (Array.isArray(m.content) &&
            m.content.some((c) => c?.type === 'text' && c.text === STDIN_TEXT)))
    )
  } catch {
    return false
  }
}
