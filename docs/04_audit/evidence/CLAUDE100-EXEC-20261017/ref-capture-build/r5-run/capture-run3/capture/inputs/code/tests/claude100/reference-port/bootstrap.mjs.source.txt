// Trusted pre-import boundary. Do not import any probe/helper JavaScript here.
import { constants } from 'node:fs'
import {
  open,
  lstat,
  realpath,
  mkdir,
  readdir,
  unlink,
  rmdir
} from 'node:fs/promises'
import { createHash, randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SOURCE_PATHS = Object.freeze(
  [
    'scripts/claude100-reference-port.mjs',
    'tests/claude100/reference-port/schema.mjs',
    'tests/claude100/reference-port/evidence.mjs',
    'tests/claude100/reference-port/inputs.mjs',
    'tests/claude100/reference-port/profile.mjs',
    'tests/claude100/reference-port/docker.mjs',
    'tests/claude100/reference-port/capture.mjs',
    'tests/claude100/reference-port/run-state.mjs',
    'tests/claude100/reference-port/report.mjs',
    'tests/claude100/reference-port/controller.mjs',
    'tests/claude100/reference-port/protocol.mjs',
    'tests/claude100/reference-port/client.mjs',
    'tests/claude100/reference-port/observer.mjs',
    'tests/claude100/qualification/strict-json.mjs',
    'tests/claude100/qualification/errors.mjs',
    'tests/claude100/qualification/safe-io.mjs',
    'tests/support/governed-test-kit/index.js',
    'tests/support/governed-test-kit/package.json',
    'docs/02_spec/0235_claude_native_port_probe.md',
    'tests/claude100/reference-port/bootstrap.mjs'
  ].sort()
)
export const BUILTIN_ALLOWLIST = Object.freeze([
  'node:buffer',
  'node:child_process',
  'node:crypto',
  'node:events',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:os',
  'node:path',
  'node:perf_hooks',
  'node:url',
  'node:util'
])
// SPEC0238 second literal profile: its own closed list, SPEC and entry.
export const CAPTURE_SOURCE_PATHS = Object.freeze(
  [
    'scripts/claude100-reference-capture.mjs',
    'tests/claude100/reference-capture/client.mjs',
    'tests/claude100/reference-capture/constants.mjs',
    'tests/claude100/reference-capture/controller.mjs',
    'tests/claude100/reference-capture/docker.mjs',
    'tests/claude100/reference-capture/evidence.mjs',
    'tests/claude100/reference-capture/inputs.mjs',
    'tests/claude100/reference-capture/model.mjs',
    'tests/claude100/reference-capture/observer.mjs',
    'tests/claude100/reference-capture/profile.mjs',
    'tests/claude100/reference-capture/protocol.mjs',
    'tests/claude100/reference-capture/report.mjs',
    'tests/claude100/reference-capture/script.mjs',
    'tests/claude100/reference-capture/trace.mjs',
    'tests/claude100/reference-capture/workspace.mjs',
    'tests/claude100/qualification/strict-json.mjs',
    'tests/claude100/qualification/errors.mjs',
    'tests/claude100/qualification/safe-io.mjs',
    'tests/support/governed-test-kit/index.js',
    'tests/support/governed-test-kit/package.json',
    'docs/02_spec/0238_claude_scripted_reference_capture.md',
    'tests/claude100/reference-port/bootstrap.mjs'
  ].sort()
)
export const CAPTURE_BUILTIN_ALLOWLIST = Object.freeze([
  'node:buffer',
  'node:child_process',
  'node:crypto',
  'node:events',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:os',
  'node:path',
  'node:perf_hooks',
  'node:url',
  'node:util'
])
// The single literal transfer point of the SPEC0238 CLI, after this boundary.
export const CAPTURE_ENTRY = 'tests/claude100/reference-capture/controller.mjs'
export const CAPTURE_CLI = 'scripts/claude100-reference-capture.mjs'
const MAX_FILES = 256,
  MAX_BYTES = 1024 * 1024
const SPEC_SHA256 =
  'aaa12b3ee55021e357fc9a17518316135eb4ca423b87215af754cd18dbb41f04'
const CAPTURE_SPEC_SHA256 =
  '73ab205e2a7b84e3db9792bd2833ac515dd332647bfd30480e9fef6b81debadc'
const SOURCE_ROOT = path.resolve(
  fileURLToPath(new URL('../../../', import.meta.url))
)
// Literal profiles only. No data, manifest or CLI argument selects one.
const PORT_PROFILE = Object.freeze({
  label: 'Native port bootstrap',
  sources: SOURCE_PATHS,
  builtins: BUILTIN_ALLOWLIST,
  specSuffix: '/0235_claude_native_port_probe.md',
  specSha256: SPEC_SHA256,
  prefix: '.native-port-bootstrap-',
  signals: Object.freeze(['SIGINT', 'SIGTERM']),
  scanImports: false,
  cli: null
})
const CAPTURE_PROFILE = Object.freeze({
  label: 'Reference capture bootstrap',
  sources: CAPTURE_SOURCE_PATHS,
  builtins: CAPTURE_BUILTIN_ALLOWLIST,
  specSuffix: '/0238_claude_scripted_reference_capture.md',
  specSha256: CAPTURE_SPEC_SHA256,
  prefix: '.reference-capture-bootstrap-',
  signals: Object.freeze(['SIGHUP', 'SIGINT', 'SIGTERM']),
  scanImports: true,
  cli: CAPTURE_CLI
})
const tuple = (s) =>
  [
    s.dev,
    s.ino,
    s.size,
    s.mtimeNs,
    s.ctimeNs,
    s.mode,
    s.uid,
    s.gid,
    s.nlink
  ].map(String)
const directoryTuple = (s) => [s.dev, s.ino, s.mode, s.uid, s.gid].map(String)
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

/** Closed static import graph of one literal profile; builtins only from its allowlist. */
export function scanProfileImports(entries, sources, builtins, cli) {
  const listed = new Set(sources)
  for (const { path: relative, bytes } of entries) {
    if (!/\.(?:mjs|js)$/.test(relative)) continue
    let text
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      return false
    }
    // Whitespace and block/line comments may sit between a keyword and its
    // target; none of them hides an import from this closed scan.
    const gap = String.raw`(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)*`
    const dynamic = [
      ...text.matchAll(new RegExp(String.raw`\bimport${gap}\(`, 'g'))
    ].length
    if (dynamic !== (relative === cli ? 1 : 0)) return false
    const specifiers = [
      ...[
        ...text.matchAll(
          new RegExp(String.raw`\bfrom${gap}['"]([^'"\n]+)['"]`, 'g')
        )
      ].map((m) => m[1]),
      ...[
        ...text.matchAll(
          new RegExp(String.raw`\bimport${gap}['"]([^'"\n]+)['"]`, 'g')
        )
      ].map((m) => m[1])
    ]
    for (const specifier of specifiers) {
      if (specifier.startsWith('node:')) {
        if (!builtins.includes(specifier)) return false
        continue
      }
      if (!specifier.startsWith('./') && !specifier.startsWith('../'))
        return false
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(relative), specifier)
      )
      if (target.startsWith('../') || !listed.has(target)) return false
    }
  }
  return true
}

/** Freeze one fixed literal graph using builtins only, before any protected import. */
async function freezeGraph(profile, evidenceRoot) {
  const error = (code, cause) =>
    Object.assign(
      new Error(`${profile.label}: ${code}`, cause ? { cause } : undefined),
      { code }
    )
  const combined = (code, causes) =>
    error(
      code,
      new AggregateError(causes, `${profile.label} causes`, {
        cause: causes[0]
      })
    )
  function requireThat(condition, code = 'INPUT_INVALID') {
    if (!condition) throw error(code)
  }
  function absolute(filename) {
    requireThat(
      typeof filename === 'string' &&
        path.isAbsolute(filename) &&
        !filename.includes('\0') &&
        !filename.includes('\\')
    )
    requireThat(
      filename.split('/').every((part) => part !== '.' && part !== '..')
    )
    return path.resolve(filename)
  }
  const destination = absolute(evidenceRoot)
  let cancellation = null
  const signalHandlers = new Map(
    profile.signals.map((signal) => [
      signal,
      () => {
        cancellation ??= Object.assign(error('SIGNAL'), { signal })
      }
    ])
  )
  const checkCancellation = () => {
    if (cancellation) throw cancellation
  }
  for (const [signal, handler] of signalHandlers) process.on(signal, handler)
  const directories = new Map(),
    files = [],
    pins = [],
    entries = []
  const createdDirectories = [],
    createdFiles = [],
    scanned = []
  let root = null,
    totalBytes = 0,
    disposePromise = null
  async function verifyDirectory(node) {
    if (node.parent) await verifyDirectory(node.parent)
    const stat = await lstat(node.filename, { bigint: true })
    requireThat(
      stat.isDirectory() &&
        !stat.isSymbolicLink() &&
        same(node.identity, directoryTuple(stat)) &&
        same(
          node.identity,
          directoryTuple(await node.handle.stat({ bigint: true }))
        ) &&
        (await realpath(`/proc/self/fd/${node.handle.fd}`)) === node.filename,
      'DRIFT_RUNTIME'
    )
  }
  async function directory(filename) {
    filename = absolute(filename)
    if (directories.has(filename)) {
      const node = directories.get(filename)
      await verifyDirectory(node)
      return node
    }
    const parent =
      filename === '/' ? null : await directory(path.dirname(filename))
    const anchored = parent
      ? `/proc/self/fd/${parent.handle.fd}/${path.basename(filename)}`
      : '/'
    const before = await lstat(anchored, { bigint: true })
    requireThat(before.isDirectory() && !before.isSymbolicLink())
    const handle = await open(
      anchored,
      constants.O_RDONLY |
        constants.O_DIRECTORY |
        constants.O_NOFOLLOW |
        constants.O_NONBLOCK
    )
    const node = {
      filename,
      handle,
      parent,
      identity: directoryTuple(before),
      closed: false
    }
    directories.set(filename, node)
    requireThat(
      same(node.identity, directoryTuple(await handle.stat({ bigint: true })))
    )
    await verifyDirectory(node)
    return node
  }
  async function newDirectory(parent, name) {
    requireThat(
      name.length > 0 && name !== '.' && name !== '..' && !name.includes('/')
    )
    await verifyDirectory(parent)
    const anchored = `/proc/self/fd/${parent.handle.fd}/${name}`
    await mkdir(anchored, { mode: 0o700 }) // Exclusive: never adopt/retry EEXIST.
    const node = await directory(path.join(parent.filename, name))
    createdDirectories.push(node)
    const stat = await node.handle.stat({ bigint: true })
    requireThat(
      stat.uid === BigInt(process.getuid()) && (stat.mode & 0o777n) === 0o700n
    )
    return node
  }
  async function snapshotParent(relative, base) {
    let parent = base
    for (const name of relative.split('/').slice(0, -1)) {
      const filename = path.join(parent.filename, name)
      parent = directories.has(filename)
        ? await directory(filename)
        : await newDirectory(parent, name)
    }
    return parent
  }
  async function selectedFile(filename, parent, flags, mode) {
    await verifyDirectory(parent)
    const anchored = `/proc/self/fd/${parent.handle.fd}/${path.basename(filename)}`
    const handle = await open(
      anchored,
      flags | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      mode
    )
    const state = {
      handle,
      filename,
      parent,
      closed: false,
      closePromise: null
    }
    state.close = () => {
      if (!state.closePromise)
        state.closePromise = handle.close().then(() => {
          state.closed = true
        })
      return state.closePromise
    }
    files.push(state)
    return state
  }
  async function readHash(state, keep = false) {
    const hash = createHash('sha256'),
      chunks = []
    let offset = 0
    while (offset <= MAX_BYTES) {
      checkCancellation()
      const buffer = Buffer.alloc(Math.min(65536, MAX_BYTES + 1 - offset))
      const { bytesRead } = await state.handle.read(
        buffer,
        0,
        buffer.length,
        offset
      )
      if (!bytesRead) break
      offset += bytesRead
      requireThat(offset <= MAX_BYTES, 'CAP')
      const bytes = buffer.subarray(0, bytesRead)
      hash.update(bytes)
      if (keep) chunks.push(bytes)
    }
    return {
      sha256: hash.digest('hex'),
      size: offset,
      bytes: keep ? Buffer.concat(chunks, offset) : null
    }
  }
  async function pin(state) {
    const before = await state.handle.stat({ bigint: true })
    requireThat(before.isFile() && before.size <= BigInt(MAX_BYTES))
    const initial = tuple(before)
    const result = await readHash(state, true)
    const selected = Object.freeze({
      filename: state.filename,
      sha256: result.sha256,
      size: result.size,
      bytes: result.bytes,
      stat: Object.freeze({
        dev: initial[0],
        ino: initial[1],
        size: initial[2],
        mtimeNs: initial[3],
        ctimeNs: initial[4],
        mode: initial[5]
      }),
      async verify() {
        try {
          requireThat(!state.closed && !state.closePromise, 'DRIFT_RUNTIME')
          await verifyDirectory(state.parent)
          const anchored = `/proc/self/fd/${state.parent.handle.fd}/${path.basename(state.filename)}`
          const pathname = await lstat(anchored, { bigint: true })
          requireThat(
            pathname.isFile() &&
              !pathname.isSymbolicLink() &&
              same(initial, tuple(pathname)) &&
              same(initial, tuple(await state.handle.stat({ bigint: true }))) &&
              (await realpath(`/proc/self/fd/${state.handle.fd}`)) ===
                state.filename,
            'DRIFT_RUNTIME'
          )
          const observed = await readHash(state)
          requireThat(
            observed.sha256 === result.sha256 &&
              observed.size === result.size &&
              same(initial, tuple(await state.handle.stat({ bigint: true }))) &&
              same(initial, tuple(await lstat(anchored, { bigint: true }))),
            'DRIFT_RUNTIME'
          )
          return {
            path: state.filename,
            sha256: observed.sha256,
            bytes: observed.size,
            stat: this.stat
          }
        } catch (cause) {
          if (cause.code === 'SIGNAL') throw cause
          throw error('DRIFT_RUNTIME', cause)
        }
      },
      close: state.close
    })
    await selected.verify()
    pins.push(selected)
    return { selected, initial }
  }
  async function closeDirectories() {
    const causes = []
    for (const node of [...directories.values()].reverse()) {
      if (node.closed) continue
      try {
        await node.handle.close()
        node.closed = true
      } catch (cause) {
        causes.push(cause)
      }
    }
    if (causes.length) throw combined('CLEANUP', causes)
  }
  async function dispose() {
    if (disposePromise) return disposePromise
    requireThat(
      files.every((state) => state.closed),
      'CLEANUP'
    )
    disposePromise = (async () => {
      const causes = []
      try {
        // Validate the entire owned tree BEFORE deleting any known child.
        const children = new Map(
          createdDirectories.map((node) => [node.filename, new Set()])
        )
        for (const node of createdDirectories)
          if (children.has(node.parent.filename))
            children.get(node.parent.filename).add(path.basename(node.filename))
        for (const record of createdFiles)
          children
            .get(record.parent.filename)
            .add(path.basename(record.filename))
        for (const node of createdDirectories) {
          await verifyDirectory(node)
          const actual = await readdir(`/proc/self/fd/${node.handle.fd}`)
          const expected = children.get(node.filename)
          requireThat(
            actual.length === expected.size &&
              actual.every((name) => expected.has(name)),
            'CLEANUP'
          )
        }
        for (const record of createdFiles) {
          const current = await lstat(
            `/proc/self/fd/${record.parent.handle.fd}/${path.basename(record.filename)}`,
            { bigint: true }
          )
          requireThat(
            record.initial !== null &&
              current.isFile() &&
              same(record.initial, tuple(current)),
            'CLEANUP'
          )
        }
        for (const record of [...createdFiles].reverse()) {
          await verifyDirectory(record.parent)
          const anchored = `/proc/self/fd/${record.parent.handle.fd}/${path.basename(record.filename)}`
          requireThat(
            same(
              record.initial,
              tuple(await lstat(anchored, { bigint: true }))
            ),
            'CLEANUP'
          )
          await unlink(anchored)
        }
        for (const node of [...createdDirectories].reverse()) {
          await verifyDirectory(node)
          await rmdir(
            `/proc/self/fd/${node.parent.handle.fd}/${path.basename(node.filename)}`
          )
        }
      } catch (cause) {
        causes.push(cause)
      }
      try {
        await closeDirectories()
      } catch (cause) {
        causes.push(cause)
      }
      if (causes.length) throw combined('CLEANUP', causes)
    })()
    return disposePromise
  }

  try {
    checkCancellation()
    requireThat(
      profile.sources.length <= MAX_FILES &&
        new Set(profile.sources).size === profile.sources.length
    )
    const evidence = await directory(destination)
    const evidenceStat = await evidence.handle.stat({ bigint: true })
    requireThat(
      evidenceStat.uid === BigInt(process.getuid()) &&
        (evidenceStat.mode & 0o777n) === 0o700n
    )
    checkCancellation()
    const base = await newDirectory(
      evidence,
      `${profile.prefix}${randomBytes(16).toString('hex')}`
    )
    root = base.filename
    checkCancellation()
    for (const relative of profile.sources) {
      checkCancellation()
      requireThat(
        !path.isAbsolute(relative) &&
          relative
            .split('/')
            .every((part) => part && part !== '.' && part !== '..')
      )
      const originalName = path.join(SOURCE_ROOT, relative)
      const original = await selectedFile(
        originalName,
        await directory(path.dirname(originalName)),
        constants.O_RDONLY
      )
      const { selected } = await pin(original)
      if (relative.endsWith(profile.specSuffix))
        requireThat(selected.sha256 === profile.specSha256, 'IDENTITY_MISMATCH')
      totalBytes += selected.size
      requireThat(totalBytes <= MAX_BYTES, 'CAP')
      if (profile.scanImports)
        scanned.push({ path: relative, bytes: selected.bytes })
      const parent = await snapshotParent(relative, base)
      const copyName = path.join(root, relative)
      const copy = await selectedFile(
        copyName,
        parent,
        constants.O_RDWR | constants.O_CREAT | constants.O_EXCL,
        0o600
      )
      const record = { filename: copyName, parent, state: copy, initial: null }
      createdFiles.push(record)
      const fresh = await copy.handle.stat({ bigint: true })
      requireThat(
        fresh.isFile() &&
          fresh.uid === BigInt(process.getuid()) &&
          (fresh.mode & 0o777n) === 0o600n &&
          fresh.nlink === 1n
      )
      await copy.handle.writeFile(selected.bytes)
      await copy.handle.sync()
      const copied = await pin(copy)
      record.initial = copied.initial
      requireThat(
        copied.selected.sha256 === selected.sha256 &&
          copied.selected.size === selected.size,
        'DRIFT_RUNTIME'
      )
      entries.push(
        Object.freeze({
          path: relative,
          sha256: selected.sha256,
          bytes: selected.size
        })
      )
    }
    if (profile.scanImports)
      requireThat(
        scanProfileImports(
          scanned,
          profile.sources,
          profile.builtins,
          profile.cli
        )
      )
    for (const selected of pins) {
      checkCancellation()
      await selected.verify()
    }
    await base.handle.sync()
    checkCancellation()
    return Object.freeze({
      root,
      pins: Object.freeze([...pins]),
      entries: Object.freeze(entries),
      totalBytes,
      builtinAllowlist: profile.builtins,
      dispose
    })
  } catch (primary) {
    const causes = [primary]
    // A partial write still belongs to this exclusive file descriptor. Capture
    // only its own final stat; a substituted pathname will not match on dispose.
    for (const record of createdFiles)
      if (record.initial === null) {
        try {
          record.initial = tuple(
            await record.state.handle.stat({ bigint: true })
          )
        } catch (cause) {
          causes.push(cause)
        }
      }
    const closed = await Promise.allSettled(files.map((state) => state.close()))
    for (const result of closed)
      if (result.status === 'rejected') causes.push(result.reason)
    try {
      if (root !== null) await dispose()
      else await closeDirectories()
    } catch (cause) {
      causes.push(cause)
      try {
        await closeDirectories()
      } catch (cleanup) {
        causes.push(cleanup)
      }
    }
    if (cancellation && !causes.includes(cancellation))
      causes.push(cancellation)
    if (causes.length > 1) throw combined(primary.code ?? 'IO', causes)
    throw error(primary.code ?? 'IO', primary)
  } finally {
    for (const [signal, handler] of signalHandlers) process.off(signal, handler)
  }
}

/** SPEC0235 profile: unchanged signature, list, signals and behavior. */
export async function freezeHostGraph(evidenceRoot) {
  return freezeGraph(PORT_PROFILE, evidenceRoot)
}

/** SPEC0238 profile: separate literal list, SPEC, CLI and SIGHUP/SIGINT/SIGTERM. */
export async function freezeCaptureGraph(evidenceRoot) {
  return freezeGraph(CAPTURE_PROFILE, evidenceRoot)
}
