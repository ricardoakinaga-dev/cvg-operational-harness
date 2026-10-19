import { constants, lstatSync, realpathSync, linkSync } from 'node:fs'
import { lstat, open, realpath, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { homedir } from 'node:os'
import { QualificationError } from './errors.mjs'

const MAX_FILE = 4 * 1024 * 1024
const MAX_TOTAL = 64 * 1024 * 1024
// Inputs can occupy 64MiB; copies, two projections and inventories need room.
const MAX_OUTPUT = 256 * 1024 * 1024
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const within = (root, target) =>
  target === root || target.startsWith(`${root}${path.sep}`)
const sensitiveComponent =
  /^(?:\.env(?:\..*)?|\.ssh|\.aws|\.azure|\.config|\.claude|\.codex|\.npmrc|\.netrc|\.git-credentials|\.git|secret-store|secrets)$/i
function inputError(message, cause) {
  return new QualificationError(
    'INVALID_INPUT',
    message,
    cause ? { cause } : undefined
  )
}

async function noSymlinkComponents(absolute) {
  const parts = absolute.split(path.sep).filter(Boolean)
  let current = path.parse(absolute).root
  for (const part of parts) {
    current = path.join(current, part)
    const stat = await lstat(current)
    if (stat.isSymbolicLink())
      throw inputError('Symlink components are not permitted')
  }
}

/** Linux fd identity is checked before any content read or write. */
async function actualPath(handle) {
  try {
    return await realpath(`/proc/self/fd/${handle.fd}`)
  } catch (cause) {
    throw new QualificationError(
      'INFRA_FAILURE',
      'Cannot verify physical file descriptor identity',
      { cause }
    )
  }
}

export async function openEvidenceRoot(inputRoot) {
  if (
    typeof inputRoot !== 'string' ||
    !path.isAbsolute(inputRoot) ||
    inputRoot.includes('\0')
  )
    throw inputError('Evidence root must be an absolute directory')
  const selected = path.resolve(inputRoot)
  if (
    selected === path.parse(selected).root ||
    selected === path.resolve(homedir()) ||
    selected.split(path.sep).some((part) => sensitiveComponent.test(part))
  )
    throw inputError('A user profile or secret store is not an evidence root')
  let root
  try {
    await noSymlinkComponents(inputRoot)
    root = await realpath(inputRoot)
    if (!(await lstat(root)).isDirectory())
      throw inputError('Evidence root is not a directory')
  } catch (cause) {
    if (cause instanceof QualificationError) throw cause
    throw inputError('Cannot open evidence root', cause)
  }
  const handles = new Set()
  const snapshots = new Map()
  let totalBytes = 0
  let closed = false
  let readyToPublish = false
  let reads = Promise.resolve()
  const assertOpen = () => {
    if (closed)
      throw new QualificationError('INFRA_FAILURE', 'Evidence reader is closed')
  }
  function resolveInput(name) {
    if (
      typeof name !== 'string' ||
      name.length === 0 ||
      name.includes('\0') ||
      name.includes('\\') ||
      name.split('/').some((part) => part === '..' || part === '.')
    )
      throw inputError('Invalid evidence path')
    const resolved = path.resolve(root, name)
    if (name.split('/').some((part) => sensitiveComponent.test(part)))
      throw inputError('Secret/profile files are not qualification evidence')
    if (!within(root, resolved) || resolved === root)
      throw inputError('Evidence path escapes its root')
    return resolved
  }
  async function closeOne(handle) {
    if (!handles.has(handle)) return
    try {
      await handle.close()
    } finally {
      handles.delete(handle)
    }
  }
  async function materialize(name, maxBytes = MAX_FILE) {
    assertOpen()
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > MAX_FILE)
      throw inputError('Invalid file byte limit')
    const absolute = resolveInput(name)
    let handle
    let primary
    let retained = false
    try {
      await noSymlinkComponents(absolute)
      handle = await open(
        absolute,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      )
      handles.add(handle)
      const actual = await actualPath(handle)
      if (!within(root, actual) || actual !== absolute)
        throw inputError('Opened descriptor does not match confined path')
      const stat = await handle.stat({ bigint: true })
      if (!stat.isFile())
        throw inputError('Evidence input must be a regular file')
      if (stat.size > BigInt(maxBytes))
        throw inputError('Evidence file exceeds its byte limit')
      const key = `${stat.dev}:${stat.ino}`
      let snapshot = snapshots.get(key)
      if (
        snapshot &&
        (snapshot.stat.size !== stat.size ||
          snapshot.stat.mtimeNs !== stat.mtimeNs ||
          snapshot.stat.ctimeNs !== stat.ctimeNs)
      )
        throw inputError('Evidence changed after its first snapshot')
      if (!snapshot) {
        // Bounded reads also catch growth after stat without an unbounded buffer.
        const chunks = []
        let length = 0
        for (;;) {
          const buffer = Buffer.alloc(Math.min(65536, maxBytes - length + 1))
          const { bytesRead } = await handle.read(
            buffer,
            0,
            buffer.length,
            null
          )
          if (bytesRead === 0) break
          length += bytesRead
          if (length > maxBytes || totalBytes + length > MAX_TOTAL)
            throw inputError('Evidence inputs exceed their byte limit')
          chunks.push(buffer.subarray(0, bytesRead))
        }
        const after = await handle.stat({ bigint: true })
        if (
          stat.size !== after.size ||
          stat.mtimeNs !== after.mtimeNs ||
          stat.ctimeNs !== after.ctimeNs ||
          BigInt(length) !== stat.size ||
          (await actualPath(handle)) !== actual
        )
          throw inputError('Evidence changed while materializing its snapshot')
        const bytes = Buffer.concat(chunks, length)
        snapshot = { bytes, sha256: sha256(bytes), size: length, stat }
        snapshots.set(key, snapshot)
        totalBytes += length
        // Keep the descriptor that produced each immutable snapshot alive
        // through validation/comparison and release it in the final cleanup.
        retained = true
      }
      if (snapshot.size > maxBytes)
        throw inputError('Cached file exceeds the requested byte limit')
      return {
        path: path.relative(root, absolute).split(path.sep).join('/'),
        bytes: Buffer.from(snapshot.bytes),
        sha256: snapshot.sha256,
        size: snapshot.size
      }
    } catch (cause) {
      primary =
        cause instanceof QualificationError
          ? cause
          : inputError('Cannot read confined evidence file', cause)
      throw primary
    } finally {
      if (handle && !retained) {
        try {
          await closeOne(handle)
        } catch (cause) {
          throw new QualificationError(
            'INFRA_FAILURE',
            'Evidence file could not be closed',
            { cause: primary ? new AggregateError([primary, cause]) : cause }
          )
        }
      }
    }
  }
  function read(name, maxBytes = MAX_FILE) {
    const operation = reads.then(() => materialize(name, maxBytes))
    reads = operation.catch(() => undefined)
    return operation
  }

  async function createOutput(name) {
    assertOpen()
    const absolute = resolveInput(name)
    const parent = path.dirname(absolute)
    let directory
    let parentHandle
    let primary
    try {
      await noSymlinkComponents(parent)
      if (!within(root, await realpath(parent)))
        throw inputError('Output parent escapes evidence root')
      parentHandle = await open(
        parent,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
      )
      handles.add(parentHandle)
      if ((await actualPath(parentHandle)) !== parent)
        throw inputError('Output parent identity changed')
      // The operator-owned root has no concurrent writers. Exclusive creation
      // refuses all pre-existing output directories, including empty ones.
      const anchoredPath = `/proc/self/fd/${parentHandle.fd}/${path.basename(absolute)}`
      await mkdir(anchoredPath, { mode: 0o700 })
      directory = await open(
        anchoredPath,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
      )
      handles.add(directory)
      if ((await actualPath(directory)) !== absolute)
        throw inputError('Output directory identity changed')
    } catch (cause) {
      primary = cause
      if (directory) {
        try {
          await closeOne(directory)
        } catch (cleanup) {
          primary = new AggregateError([primary, cleanup])
        }
      }
      throw new QualificationError(
        'INFRA_FAILURE',
        'Cannot create a new confined output directory',
        { cause: primary }
      )
    } finally {
      if (parentHandle) {
        try {
          await closeOne(parentHandle)
        } catch (cleanup) {
          throw new QualificationError(
            'INFRA_FAILURE',
            'Output parent handle could not be closed',
            {
              cause: primary ? new AggregateError([primary, cleanup]) : cleanup
            }
          )
        }
      }
    }
    let outputBytes = 0
    const stagedFiles = new Map()
    const directoryIdentity = await directory.stat({ bigint: true })
    return {
      path: path.relative(root, absolute).split(path.sep).join('/'),
      async write(filename, input) {
        assertOpen()
        if (
          typeof filename !== 'string' ||
          !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(filename)
        )
          throw inputError('Invalid output filename')
        if (!(input instanceof Uint8Array) && typeof input !== 'string')
          throw inputError('Output must be bytes')
        const bytes = Buffer.from(input)
        if (bytes.length > MAX_FILE || outputBytes + bytes.length > MAX_OUTPUT)
          throw inputError('Output byte limit exceeded')
        outputBytes += bytes.length
        if ((await actualPath(directory)) !== absolute)
          throw inputError('Output directory no longer belongs to its root')
        let handle
        let primary
        try {
          // Anchor file creation to the already-open directory, not a replaceable
          // textual parent. No artifact content can be used as a filename.
          handle = await open(
            `/proc/self/fd/${directory.fd}/${filename}`,
            constants.O_WRONLY |
              constants.O_CREAT |
              constants.O_EXCL |
              constants.O_NOFOLLOW,
            0o600
          )
          handles.add(handle)
          if ((await actualPath(handle)) !== path.join(absolute, filename))
            throw inputError('Output descriptor escapes its directory')
          await handle.writeFile(bytes)
          await handle.sync()
          stagedFiles.set(filename, await handle.stat({ bigint: true }))
          return {
            path: `${path.relative(root, absolute).split(path.sep).join('/')}/${filename}`,
            sha256: sha256(bytes),
            bytes: bytes.length
          }
        } catch (cause) {
          primary =
            cause instanceof QualificationError
              ? cause
              : new QualificationError(
                  'INFRA_FAILURE',
                  'Cannot write exclusive output',
                  { cause }
                )
          throw primary
        } finally {
          if (handle) {
            try {
              await closeOne(handle)
            } catch (cause) {
              throw new QualificationError(
                'INFRA_FAILURE',
                'Output file could not be closed',
                {
                  cause: primary ? new AggregateError([primary, cause]) : cause
                }
              )
            }
          }
        }
      },
      // All async writes, syncs and handle cleanup precede this final operation.
      // A pending file is never a completed report. The link is exclusive; no
      // overwrite or fallible cleanup follows a successful publication syscall.
      publish(filenames, select) {
        if (!readyToPublish)
          throw new QualificationError(
            'INFRA_FAILURE',
            'Cleanup must complete before publication'
          )
        if (
          !Array.isArray(filenames) ||
          filenames.length < 1 ||
          filenames.length > 2 ||
          filenames.some((name) => !stagedFiles.has(name)) ||
          typeof select !== 'function'
        )
          throw new QualificationError('INFRA_FAILURE', 'Unknown staged report')
        try {
          let component = path.parse(absolute).root
          for (const part of absolute.split(path.sep).filter(Boolean)) {
            component = path.join(component, part)
            if (lstatSync(component).isSymbolicLink())
              throw new Error('Output path changed')
          }
          const current = lstatSync(absolute, { bigint: true })
          if (
            !current.isDirectory() ||
            current.dev !== directoryIdentity.dev ||
            current.ino !== directoryIdentity.ino ||
            realpathSync(absolute) !== absolute
          )
            throw new Error('Output directory changed')
          for (const filename of filenames) {
            const file = path.join(absolute, filename)
            const stat = lstatSync(file, { bigint: true })
            const expected = stagedFiles.get(filename)
            if (
              !stat.isFile() ||
              stat.dev !== expected.dev ||
              stat.ino !== expected.ino ||
              stat.size !== expected.size ||
              stat.mtimeNs !== expected.mtimeNs ||
              stat.ctimeNs !== expected.ctimeNs
            )
              throw new Error('Staged report changed')
          }
          // Trusted local synchronous selector; never sourced from JSON. No
          // await or additional filesystem check separates authority and link.
          const filename = select()
          if (!filenames.includes(filename))
            throw new Error('Unknown report selection')
          linkSync(
            path.join(absolute, filename),
            path.join(absolute, 'report.json')
          )
        } catch (cause) {
          throw new QualificationError(
            'INFRA_FAILURE',
            'Cannot publish completed report',
            { cause }
          )
        }
      }
    }
  }
  return {
    root,
    read,
    createOutput,
    get totalBytes() {
      return totalBytes
    },
    async close() {
      if (closed) return
      closed = true
      await reads
      const results = await Promise.allSettled([...handles].map(closeOne))
      const failures = results
        .filter((r) => r.status === 'rejected')
        .map((r) => r.reason)
      if (failures.length)
        throw new QualificationError(
          'INFRA_FAILURE',
          'Evidence handles could not all be closed',
          { cause: new AggregateError(failures) }
        )
      readyToPublish = true
    }
  }
}
