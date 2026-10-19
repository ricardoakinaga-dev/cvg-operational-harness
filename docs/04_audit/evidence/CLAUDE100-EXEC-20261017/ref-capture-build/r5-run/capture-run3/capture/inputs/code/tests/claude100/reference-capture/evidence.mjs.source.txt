import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { openEvidenceRoot } from '../qualification/safe-io.mjs'
import { LIMITS, ROLES, canonical, fault, sha256 } from './constants.mjs'

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const tuple = (s) =>
  [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs, s.mode, s.nlink].map(String)
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
export function safeRelative(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 1024 &&
    value.split('/').every((part) => NAME.test(part))
  )
}
const BINDING_KEYS = [
  'owner',
  'caseId',
  'requestOrdinal',
  'processOrdinal',
  'segmentIndex'
]
export function binding(owner, dimensions = {}) {
  return {
    owner,
    caseId: dimensions.caseId ?? null,
    requestOrdinal: dimensions.requestOrdinal ?? null,
    processOrdinal: dimensions.processOrdinal ?? null,
    segmentIndex: dimensions.segmentIndex ?? null
  }
}

/**
 * Exclusive output under a private 0700 evidence root. Every artifact keeps
 * its own descriptor until publication; bytes are re-read through those same
 * descriptors and compared before the qualified exclusive 0229 publication.
 */
export async function createEvidence(evidenceRoot, outputName) {
  if (
    typeof evidenceRoot !== 'string' ||
    !path.isAbsolute(evidenceRoot) ||
    typeof outputName !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(outputName)
  )
    throw fault('INPUT_INVALID')
  const selected = await lstat(evidenceRoot).catch((cause) => {
    throw fault('INPUT_INVALID', cause)
  })
  if (
    !selected.isDirectory() ||
    selected.isSymbolicLink() ||
    selected.uid !== process.getuid() ||
    (selected.mode & 0o777) !== 0o700
  )
    throw fault('INPUT_INVALID')
  let io
  try {
    io = await openEvidenceRoot(evidenceRoot)
  } catch (cause) {
    throw fault('INPUT_INVALID', cause)
  }
  let output
  try {
    // Exclusive: an existing destination fails here, before any Docker call.
    output = await io.createOutput(outputName)
  } catch (cause) {
    await io.close().catch(() => {})
    throw fault('INPUT_INVALID', cause)
  }
  const outDir = path.join(io.root, output.path)
  const dirs = new Map()
  const files = new Map()
  const artifacts = []
  let total = 0,
    closed = false,
    published = false
  async function openDirectory(relative, filename) {
    const handle = await open(
      filename,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    )
    try {
      if ((await realpath(`/proc/self/fd/${handle.fd}`)) !== filename)
        throw fault('IO')
      const stat = await handle.stat({ bigint: true })
      if (
        stat.uid !== BigInt(process.getuid()) ||
        (stat.mode & 0o777n) !== 0o700n
      )
        throw fault('IO')
    } catch (cause) {
      await handle.close()
      throw cause
    }
    dirs.set(relative, { handle, filename })
    return dirs.get(relative)
  }
  await openDirectory('', outDir)
  async function directory(relative) {
    if (dirs.has(relative)) return dirs.get(relative)
    const parentName = path.posix.dirname(relative)
    const parent = await directory(parentName === '.' ? '' : parentName)
    const name = path.posix.basename(relative)
    if (!NAME.test(name)) throw fault('IO')
    await mkdir(`/proc/self/fd/${parent.handle.fd}/${name}`, { mode: 0o700 })
    return openDirectory(relative, path.join(parent.filename, name))
  }
  function assertOpen() {
    if (closed || published) throw fault('IO')
  }
  return {
    root: io.root,
    outDir,
    outputName: output.path,
    artifacts,
    absolute: (relative) => path.join(outDir, relative),
    async read(name, maximum) {
      assertOpen()
      try {
        return await io.read(name, maximum)
      } catch (cause) {
        throw fault('INPUT_INVALID', cause)
      }
    },
    async emptyDirectory(relative) {
      assertOpen()
      if (!safeRelative(relative) || dirs.has(relative)) throw fault('IO')
      return (await directory(relative)).filename
    },
    /** Exclusive create; the descriptor is retained for the final re-read. */
    async add(role, relative, input, bindings) {
      assertOpen()
      if (
        !ROLES.includes(role) ||
        !safeRelative(relative) ||
        files.has(relative) ||
        canonical(Object.keys(bindings ?? {}).sort()) !==
          canonical([...BINDING_KEYS].sort())
      )
        throw fault('PROTOCOL')
      const bytes = Buffer.from(input)
      if (artifacts.length + 1 > LIMITS.artifacts) throw fault('CAP')
      if (total + bytes.length > LIMITS.artifactBytes) throw fault('CAP')
      const parentName = path.posix.dirname(relative)
      const parent = await directory(parentName === '.' ? '' : parentName)
      const filename = path.join(outDir, relative)
      const handle = await open(
        `/proc/self/fd/${parent.handle.fd}/${path.posix.basename(relative)}`,
        constants.O_RDWR |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600
      )
      try {
        if ((await realpath(`/proc/self/fd/${handle.fd}`)) !== filename)
          throw fault('IO')
        let offset = 0
        while (offset < bytes.length) {
          const { bytesWritten } = await handle.write(
            bytes,
            offset,
            bytes.length - offset,
            offset
          )
          offset += bytesWritten
        }
        await handle.sync()
      } catch (cause) {
        files.set(relative, { handle, filename, stat: null })
        throw cause?.code ? cause : fault('IO', cause)
      }
      total += bytes.length
      const stat = tuple(await handle.stat({ bigint: true }))
      files.set(relative, { handle, filename, stat })
      const artifact = {
        path: relative,
        role,
        sha256: sha256(bytes),
        bytes: bytes.length,
        bindings: { ...bindings }
      }
      artifacts.push(artifact)
      return artifact
    },
    addJson(role, relative, value, bindings) {
      return this.add(role, relative, Buffer.from(canonical(value)), bindings)
    },
    /** Re-read every artifact through its own retained descriptor. */
    async reread() {
      const result = new Map()
      for (const artifact of artifacts) {
        const file = files.get(artifact.path)
        const now = tuple(await file.handle.stat({ bigint: true }))
        const pathname = tuple(await lstat(file.filename, { bigint: true }))
        if (!same(now, file.stat) || !same(pathname, file.stat))
          throw fault('DRIFT_RUNTIME')
        const buffer = Buffer.alloc(artifact.bytes + 1)
        let size = 0
        for (;;) {
          const { bytesRead } = await file.handle.read(
            buffer,
            size,
            buffer.length - size,
            size
          )
          if (!bytesRead) break
          size += bytesRead
          if (size > artifact.bytes) throw fault('DRIFT_RUNTIME')
        }
        const bytes = buffer.subarray(0, size)
        if (size !== artifact.bytes || sha256(bytes) !== artifact.sha256)
          throw fault('DRIFT_RUNTIME')
        result.set(artifact.path, Buffer.from(bytes))
      }
      return result
    },
    async closeAll() {
      const causes = []
      for (const file of files.values())
        try {
          await file.handle.close()
        } catch (cause) {
          causes.push(cause)
        }
      files.clear()
      for (const dir of [...dirs.values()].reverse())
        try {
          await dir.handle.close()
        } catch (cause) {
          causes.push(cause)
        }
      dirs.clear()
      if (causes.length) throw fault('IO', new AggregateError(causes))
    },
    /**
     * Stage report.pending.json, close every handle, then the single exclusive
     * link. No fallible operation follows a successful link.
     */
    async publish(reportBytes) {
      assertOpen()
      await this.closeAll()
      closed = true
      await output.write('report.pending.json', reportBytes)
      await io.close()
      output.publish(['report.pending.json'], () => 'report.pending.json')
      published = true
    },
    async abort() {
      if (published) return
      const causes = []
      try {
        await this.closeAll()
      } catch (cause) {
        causes.push(cause)
      }
      closed = true
      try {
        await io.close()
      } catch (cause) {
        causes.push(cause)
      }
      if (causes.length) throw fault('IO', new AggregateError(causes))
    },
    get totalBytes() {
      return total
    },
    get published() {
      return published
    }
  }
}
