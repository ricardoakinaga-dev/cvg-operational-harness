import { constants } from 'node:fs'
import { open, lstat, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { openEvidenceRoot } from '../qualification/safe-io.mjs'
import { canonicalJson } from '../../support/governed-test-kit/index.js'
import { probeError, safeRelative, validateReport } from './schema.mjs'

export const sha256 = (bytes) =>
  createHash('sha256').update(bytes).digest('hex')
export const canonicalBytes = (value) => Buffer.from(canonicalJson(value))
const tuple = (s) =>
  [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs, s.mode].map(String)
const same = (a, b) => a.every((v, i) => v === b[i])

async function denySymlinkComponents(filename) {
  let part = path.parse(filename).root
  for (const component of filename.split(path.sep).filter(Boolean)) {
    part = path.join(part, component)
    if ((await lstat(part)).isSymbolicLink()) throw probeError('INPUT_INVALID')
  }
}

/** Retain the selected descriptor; bound reads and verify both path and inode. */
export async function pinFile(
  filename,
  expected,
  maximum,
  retainBytes = false
) {
  if (
    !path.isAbsolute(filename) ||
    !Number.isSafeInteger(maximum) ||
    maximum < 0
  )
    throw probeError('INPUT_INVALID')
  await denySymlinkComponents(filename)
  let handle
  try {
    handle = await open(
      filename,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    )
    const before = await handle.stat({ bigint: true })
    if (
      !before.isFile() ||
      before.size > BigInt(maximum) ||
      (await realpath(`/proc/self/fd/${handle.fd}`)) !== filename
    )
      throw probeError('INPUT_INVALID')
    const initial = tuple(before)
    async function readHash(keep = false) {
      const hash = createHash('sha256')
      const chunks = []
      let offset = 0
      while (true) {
        const buffer = Buffer.alloc(Math.min(65536, maximum + 1 - offset))
        const result = await handle.read(buffer, 0, buffer.length, offset)
        if (!result.bytesRead) break
        offset += result.bytesRead
        if (offset > maximum) throw probeError('CAP')
        const bytes = buffer.subarray(0, result.bytesRead)
        hash.update(bytes)
        if (keep) chunks.push(bytes)
      }
      return {
        sha256: hash.digest('hex'),
        bytes: keep ? Buffer.concat(chunks) : null,
        size: offset
      }
    }
    const result = await readHash(retainBytes)
    if (!same(initial, tuple(await handle.stat({ bigint: true }))))
      throw probeError('INPUT_INVALID')
    if (expected && result.sha256 !== expected)
      throw Object.assign(probeError('IDENTITY_MISMATCH'), {
        observedDigest: result.sha256
      })
    let closed = false
    return {
      filename,
      sha256: result.sha256,
      size: result.size,
      bytes: result.bytes,
      stat: {
        dev: initial[0],
        ino: initial[1],
        size: initial[2],
        mtimeNs: initial[3],
        ctimeNs: initial[4],
        mode: initial[5]
      },
      async verify() {
        if (closed) throw probeError('DRIFT_RUNTIME')
        await denySymlinkComponents(filename)
        const pathname = await lstat(filename, { bigint: true })
        if (
          !same(initial, tuple(pathname)) ||
          (await realpath(`/proc/self/fd/${handle.fd}`)) !== filename
        )
          throw probeError('DRIFT_RUNTIME')
        const observed = await readHash()
        if (
          observed.sha256 !== result.sha256 ||
          !same(initial, tuple(await handle.stat({ bigint: true })))
        )
          throw probeError('DRIFT_RUNTIME')
        return {
          path: filename,
          sha256: observed.sha256,
          bytes: observed.size,
          stat: this.stat
        }
      },
      async close() {
        if (!closed) {
          closed = true
          await handle.close()
        }
      }
    }
  } catch (primary) {
    if (handle) {
      try {
        await handle.close()
      } catch (cleanup) {
        throw probeError('IO', new AggregateError([primary, cleanup]))
      }
    }
    throw primary
  }
}

/** Use the qualified fd-anchored writer, with the probe's stricter aggregate cap. */
export async function createEvidence(evidenceRoot, outputName) {
  const selected = await lstat(evidenceRoot)
  if (
    !selected.isDirectory() ||
    selected.isSymbolicLink() ||
    selected.uid !== process.getuid() ||
    (selected.mode & 0o077) !== 0
  )
    throw probeError('INPUT_INVALID')
  const io = await openEvidenceRoot(evidenceRoot)
  let output
  try {
    const relative = path.relative(io.root, path.resolve(io.root, outputName))
    if (
      !safeRelative(relative) ||
      /[,\r\n\0]/.test(path.resolve(io.root, outputName))
    )
      throw probeError('INPUT_INVALID')
    output = await io.createOutput(outputName)
  } catch (cause) {
    await io.close().catch((cleanup) => {
      throw probeError('IO', new AggregateError([cause, cleanup]))
    })
    throw cause
  }
  const outputPath = path.resolve(io.root, output.path)
  const directories = new Map([['', output]])
  const artifacts = []
  const retained = new Map()
  let total = 0
  let sealed = false
  let published = false
  async function directory(relative) {
    if (directories.has(relative)) return directories.get(relative)
    await directory(
      path.posix.dirname(relative) === '.' ? '' : path.posix.dirname(relative)
    )
    const result = await io.createOutput(path.posix.join(output.path, relative))
    directories.set(relative, result)
    return result
  }
  async function write(relative, input) {
    if (sealed || !safeRelative(relative)) throw probeError('IO')
    const bytes = Buffer.from(input)
    if (total + bytes.length > 8 * 1024 * 1024) throw probeError('CAP')
    const dirname = path.posix.dirname(relative)
    const writer = await directory(dirname === '.' ? '' : dirname)
    const result = await writer.write(path.posix.basename(relative), bytes)
    total += bytes.length
    return { result, bytes }
  }
  return {
    root: io.root,
    outputPath,
    outputRelative: output.path,
    artifacts,
    retained,
    read: (name, cap) => io.read(name, cap),
    reserveBytes(bytes) {
      if (
        !Number.isSafeInteger(bytes) ||
        bytes < 0 ||
        total + bytes > 8 * 1024 * 1024
      )
        throw probeError('CAP')
      total += bytes
    },
    async physicalArtifacts() {
      const physical = new Map()
      for (const artifact of artifacts) {
        let current
        try {
          current = await io.read(artifact.path, artifact.bytes)
        } catch (cause) {
          throw probeError('DRIFT_RUNTIME', cause)
        }
        if (
          current.size !== artifact.bytes ||
          current.sha256 !== artifact.sha256
        )
          throw probeError('DRIFT_RUNTIME')
        physical.set(artifact.path, current.bytes)
      }
      return physical
    },
    async add(role, relative, input) {
      if (artifacts.length >= 512) throw probeError('CAP')
      const { result, bytes } = await write(relative, input)
      const artifact = { role, ...result }
      artifacts.push(artifact)
      retained.set(artifact.path, Buffer.from(bytes))
      return artifact
    },
    async addJson(role, relative, value) {
      return this.add(role, relative, canonicalBytes(value))
    },
    async emptyDirectory(relative) {
      if (!safeRelative(relative)) throw probeError('INPUT_INVALID')
      await directory(relative)
      return path.join(outputPath, relative)
    },
    async publish(report) {
      validateReport(report)
      // The bytes returned are exactly the bytes staged. No fallible operation
      // follows the final exclusive link; failure leaves only pending evidence.
      await write('report.pending.json', canonicalBytes(report))
      await io.close()
      sealed = true
      output.publish(['report.pending.json'], () => 'report.pending.json')
      published = true
      return report
    },
    async close() {
      if (!sealed && !published) {
        sealed = true
        await io.close()
      }
    },
    get totalBytes() {
      return total
    },
    get published() {
      return published
    }
  }
}

export async function closePins(pins, primary = null) {
  const results = await Promise.allSettled(pins.map((pin) => pin.close()))
  const causes = results
    .filter((r) => r.status === 'rejected')
    .map((r) => r.reason)
  if (causes.length)
    throw probeError(
      'IO',
      new AggregateError(primary ? [primary, ...causes] : causes)
    )
}
