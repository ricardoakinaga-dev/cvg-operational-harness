import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { parseStrictJson } from '../qualification/strict-json.mjs'
import { CAPTURE_SOURCE_PATHS } from '../reference-port/bootstrap.mjs'
import {
  FIXTURE_BYTES,
  LIMITS,
  MARKER_PARENT,
  MARKER_ROOT,
  MCP_BYTES,
  PINS,
  SETTINGS_BYTES,
  SPEC_PATH,
  SPEC_SHA256,
  canonical,
  fault
} from './constants.mjs'
import { plannedScripts } from './script.mjs'

const tuple = (s) =>
  [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs, s.mode].map(String)
const same = (a, b) => a.every((v, i) => v === b[i])

/** Manifest: only {version:1, runId}, <=4KiB, strict UTF-8 JSON, no extras. */
export function parseManifest(bytes) {
  let value
  try {
    value = parseStrictJson(bytes, {
      maxBytes: LIMITS.manifestBytes,
      maxDepth: 1,
      maxStringBytes: 64
    })
  } catch (cause) {
    throw fault('INPUT_INVALID', cause)
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !Object.hasOwn(value, 'version') ||
    !Object.hasOwn(value, 'runId') ||
    value.version !== 1 ||
    typeof value.runId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(value.runId)
  )
    throw fault('INPUT_INVALID')
  return Object.freeze({ version: 1, runId: value.runId })
}

async function denySymlinkComponents(filename) {
  let part = path.parse(filename).root
  for (const component of filename.split(path.sep).filter(Boolean)) {
    part = path.join(part, component)
    if ((await lstat(part)).isSymbolicLink()) throw fault('INPUT_INVALID')
  }
}

/** Retained-descriptor pin of a selected file; drift is checked by path and fd. */
export async function pinFile(filename, expected, maximum) {
  if (!path.isAbsolute(filename)) throw fault('INPUT_INVALID')
  await denySymlinkComponents(filename)
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  )
  try {
    const before = await handle.stat({ bigint: true })
    if (
      !before.isFile() ||
      before.size > BigInt(maximum) ||
      (await realpath(`/proc/self/fd/${handle.fd}`)) !== filename
    )
      throw fault('INPUT_INVALID')
    const initial = tuple(before)
    const digest = async () => {
      const hash = createHash('sha256')
      const buffer = Buffer.alloc(1 << 20)
      let offset = 0
      for (;;) {
        const { bytesRead } = await handle.read(
          buffer,
          0,
          buffer.length,
          offset
        )
        if (!bytesRead) break
        offset += bytesRead
        if (offset > maximum) throw fault('CAP')
        hash.update(buffer.subarray(0, bytesRead))
      }
      return { sha256: hash.digest('hex'), size: offset }
    }
    const first = await digest()
    if (!same(initial, tuple(await handle.stat({ bigint: true }))))
      throw fault('INPUT_INVALID')
    if (expected && first.sha256 !== expected)
      throw Object.assign(fault('IDENTITY_MISMATCH'), {
        observedDigest: first.sha256
      })
    let closed = false
    return {
      filename,
      sha256: first.sha256,
      size: first.size,
      async verify() {
        if (closed) throw fault('DRIFT_RUNTIME')
        await denySymlinkComponents(filename)
        const pathname = await lstat(filename, { bigint: true })
        if (
          !same(initial, tuple(pathname)) ||
          (await realpath(`/proc/self/fd/${handle.fd}`)) !== filename
        )
          throw fault('DRIFT_RUNTIME')
        const now = await digest()
        if (
          now.sha256 !== first.sha256 ||
          !same(initial, tuple(await handle.stat({ bigint: true })))
        )
          throw fault('DRIFT_RUNTIME')
        return { path: filename, sha256: now.sha256, bytes: now.size }
      },
      async close() {
        if (!closed) {
          closed = true
          await handle.close()
        }
      }
    }
  } catch (cause) {
    await handle.close().catch(() => {})
    throw cause
  }
}

export async function pinToolchains(pins, observed) {
  for (const [key, filename, expected, maximum] of [
    ['claudeSha256', PINS.claudePath, PINS.claudeSha256, 512 * 1024 * 1024],
    ['nodeSha256', PINS.nodePath, PINS.nodeSha256, 256 * 1024 * 1024],
    ['dockerSha256', PINS.dockerPath, PINS.dockerSha256, 128 * 1024 * 1024]
  ]) {
    try {
      const pin = await pinFile(filename, expected, maximum)
      pins.push(pin)
      observed[key] = pin.sha256
    } catch (cause) {
      if (cause.observedDigest) observed[key] = cause.observedDigest
      if (cause.code === 'IDENTITY_MISMATCH') throw cause
      throw fault('TOOLCHAIN_UNAVAILABLE', cause)
    }
  }
}

const SCRIPT_DIR = 'inputs/scripts'

/**
 * Materialize every consumed input from frozen constants and the verified
 * bootstrap snapshot: exact SPEC copy, inert code copies with their inventory,
 * the workspace fixtures and the planned scripts. The raw manifest artifact is
 * stored by the caller before parsing. `store(role, path, bytes, owner, dims)`
 * writes one HOST artifact and its HOST_ARTIFACT record.
 */
export async function materializeInputs(
  evidence,
  { manifestArtifact, graph, store }
) {
  const copies = new Map(
    graph.pins
      .filter((pin) => pin.filename.startsWith(`${graph.root}/`))
      .map((pin) => [pin.filename.slice(graph.root.length + 1), pin])
  )
  if (
    canonical(graph.entries.map((e) => e.path)) !==
      canonical(CAPTURE_SOURCE_PATHS) ||
    copies.size !== CAPTURE_SOURCE_PATHS.length
  )
    throw fault('INPUT_INVALID')
  const specCopy = copies.get(SPEC_PATH)
  if (!specCopy || specCopy.sha256 !== SPEC_SHA256)
    throw fault('IDENTITY_MISMATCH')
  const spec = await store('INPUT_SPEC', SPEC_ARTIFACT, specCopy.bytes)
  const codeEntries = []
  for (const entry of graph.entries) {
    const copy = copies.get(entry.path)
    if (!copy || copy.sha256 !== entry.sha256 || copy.size !== entry.bytes)
      throw fault('DRIFT_RUNTIME')
    const artifact = await store(
      'CODE_BUNDLE',
      `inputs/code/${entry.path}.source.txt`,
      copy.bytes
    )
    codeEntries.push({
      sourcePath: entry.path,
      artifactPath: artifact.path,
      bytes: artifact.bytes,
      sha256: artifact.sha256
    })
  }
  codeEntries.sort((a, b) =>
    a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0
  )
  const codeInventory = await store(
    'CODE_BUNDLE',
    CODE_INVENTORY,
    Buffer.from(canonical({ version: 1, entries: codeEntries }))
  )
  const settings = await store(
    'INPUT_SETTINGS',
    'inputs/workspace/settings.json',
    SETTINGS_BYTES
  )
  const mcp = await store('INPUT_MCP', 'inputs/workspace/mcp.json', MCP_BYTES)
  const fixture = await store(
    'INPUT_FIXTURE',
    'inputs/workspace/input.txt',
    FIXTURE_BYTES
  )
  const scriptInventory = await store(
    'INPUT_SCRIPT',
    SCRIPT_INVENTORY,
    Buffer.from(canonical(await storeScripts(store)))
  )
  const emptyVolume = await evidence.emptyDirectory('inputs/empty-volume')
  return {
    workspace: evidence.absolute('inputs/workspace'),
    emptyVolume,
    digests: {
      manifest: manifestArtifact.sha256,
      spec: spec.sha256,
      codeBundle: codeInventory.sha256,
      settings: settings.sha256,
      mcp: mcp.sha256,
      fixture: fixture.sha256,
      scripts: scriptInventory.sha256
    }
  }
}
export const SPEC_ARTIFACT =
  'inputs/spec/0238_claude_scripted_reference_capture.md.source.txt'
export const CODE_INVENTORY = 'inputs/code-inventory.json'
export const SCRIPT_INVENTORY = `${SCRIPT_DIR}/inventory.json`
export const scriptPath = (name, part, index = null) =>
  `${SCRIPT_DIR}/${name}/${
    part === 'HEADERS'
      ? 'headers.json'
      : part === 'BODY'
        ? 'body.bin'
        : `segment-${String(index).padStart(3, '0')}.bin`
  }`
/** Planned script files and their canonical inventory (all material bytes). */
export function scriptInventoryEntries() {
  const entries = []
  for (const script of plannedScripts()) {
    const parts = [
      ['HEADERS', null, script.headersBytes],
      ...script.segments.map((s, i) => ['SEGMENT', i, s]),
      ['BODY', null, script.body]
    ]
    for (const [part, index, bytes] of parts)
      entries.push({
        script: script.name,
        caseId: script.caseId,
        part,
        segmentIndex: index,
        artifactPath: scriptPath(script.name, part, index),
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        content: bytes
      })
  }
  return entries
}
async function storeScripts(store) {
  const entries = []
  for (const entry of scriptInventoryEntries()) {
    const { content, caseId, ...item } = entry
    await store('INPUT_SCRIPT', entry.artifactPath, content, 'HOST', {
      caseId,
      segmentIndex: entry.segmentIndex
    })
    entries.push(item)
  }
  return { version: 1, entries }
}

/** Verified empty directory over the image volume, retained by descriptor. */
export async function pinEmptyDirectory(filename) {
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  )
  const initial = await handle.stat({ bigint: true })
  let closed = false
  const pin = {
    filename,
    async verify() {
      if (closed) throw fault('DRIFT_RUNTIME')
      const stat = await lstat(filename, { bigint: true })
      if (
        !stat.isDirectory() ||
        stat.dev !== initial.dev ||
        stat.ino !== initial.ino ||
        stat.mtimeNs !== initial.mtimeNs ||
        (await realpath(`/proc/self/fd/${handle.fd}`)) !== filename ||
        (await readdir(`/proc/self/fd/${handle.fd}`)).length
      )
        throw fault('DRIFT_RUNTIME')
      return { path: filename, entries: [] }
    },
    async close() {
      if (!closed) {
        closed = true
        await handle.close()
      }
    }
  }
  try {
    await pin.verify()
  } catch (cause) {
    await pin.close().catch(() => {})
    throw cause
  }
  return pin
}

/** Own synthetic marker outside every bind; it must be absent in both preflights. */
export async function createHostMarker(nonce) {
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw fault('INPUT_INVALID')
  for (const parent of [MARKER_PARENT, MARKER_ROOT]) {
    await mkdir(parent, { mode: 0o700 }).catch((cause) => {
      if (cause.code !== 'EEXIST') throw cause
    })
    const stat = await lstat(parent)
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid() ||
      stat.mode & 0o077
    )
      throw fault('INPUT_INVALID')
  }
  const dir = await open(
    MARKER_ROOT,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  )
  const filename = path.join(MARKER_ROOT, nonce)
  const anchored = `/proc/self/fd/${dir.fd}/${nonce}`
  let file = null,
    initial = null,
    removed = false,
    closed = false
  async function close() {
    if (closed) return
    closed = true
    const causes = []
    if (file) {
      try {
        const current = await lstat(anchored, { bigint: true })
        if (
          !current.isFile() ||
          current.dev !== initial.dev ||
          current.ino !== initial.ino
        )
          throw fault('CLEANUP')
        await unlink(anchored)
        removed = true
      } catch (cause) {
        causes.push(cause)
      }
      try {
        await file.close()
      } catch (cause) {
        causes.push(cause)
      }
    }
    try {
      await dir.close()
    } catch (cause) {
      causes.push(cause)
    }
    if (causes.length) throw fault('CLEANUP', new AggregateError(causes))
  }
  try {
    if ((await realpath(`/proc/self/fd/${dir.fd}`)) !== MARKER_ROOT)
      throw fault('INPUT_INVALID')
    file = await open(
      anchored,
      constants.O_RDWR |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    )
    initial = await file.stat({ bigint: true })
    await file.writeFile('CVG_CAPTURE_UNMOUNTED_SYNTHETIC_MARKER')
    await file.sync()
    initial = await file.stat({ bigint: true })
    return {
      path: filename,
      close,
      get removed() {
        return removed
      }
    }
  } catch (primary) {
    await close().catch(() => {})
    throw primary
  }
}
