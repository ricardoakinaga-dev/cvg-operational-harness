import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { canonicalJson } from '../governed-test-kit/index.js'
import {
  closed,
  fail,
  guardCurrentEnvironment,
  snapshot,
  validateRecording
} from './contract.js'

// Linux Node22 private test support: directory FDs anchor each no-follow walk,
// so replacing a path component after validation cannot redirect an open.
async function directory(path, handles) {
  const fd = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  )
  handles.push(fd)
  const stat = await fd.stat()
  if (!stat.isDirectory()) fail('directory required')
  return `/proc/self/fd/${fd.fd}`
}

export async function persistSyntheticRecording(input, inputOptions) {
  const options = snapshot(inputOptions)
  closed(options, ['evidenceRoot', 'path', 'mode', 'previousDigest'])
  if (
    !['record', 'refresh'].includes(options.mode) ||
    (options.mode === 'record'
      ? options.previousDigest !== null
      : typeof options.previousDigest !== 'string' ||
        !/^[a-f0-9]{64}$/.test(options.previousDigest))
  )
    fail('persistence mode')
  const recording = validateRecording(input)
  if (
    typeof options.evidenceRoot !== 'string' ||
    Buffer.byteLength(options.evidenceRoot) > 4096 ||
    !isAbsolute(options.evidenceRoot) ||
    typeof options.path !== 'string' ||
    Buffer.byteLength(options.path) > 4096 ||
    isAbsolute(options.path)
  )
    fail('path')
  const components = options.path.split('/')
  if (
    !components.length ||
    components.some(
      (part) =>
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(part) ||
        part === '.' ||
        part === '..'
    )
  )
    fail('relative path')
  const root = resolve(options.evidenceRoot)
  const temp = resolve(tmpdir())
  const rel = relative(temp, root)
  if (
    !rel ||
    rel.startsWith(`..${sep}`) ||
    rel === '..' ||
    isAbsolute(rel) ||
    options.evidenceRoot !== root
  )
    fail('owned temporary root required')
  // No filesystem call precedes the current environment guard.
  guardCurrentEnvironment()
  const handles = []
  let primary = null
  let result
  try {
    let physical = '/'
    for (const part of root.split('/').filter(Boolean)) {
      physical = await directory(join(physical, part), handles)
    }
    const stat = await handles.at(-1).stat()
    if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0)
      fail('root must be private and owned')
    for (const part of components.slice(0, -1)) {
      physical = await directory(join(physical, part), handles)
      const child = await handles.at(-1).stat()
      if (child.uid !== process.getuid() || (child.mode & 0o022) !== 0)
        fail('unowned directory')
    }
    const name = components.at(-1)
    if (options.mode === 'refresh') {
      const old = await open(
        join(physical, name),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      )
      handles.push(old)
      const oldStat = await old.stat()
      if (
        !oldStat.isFile() ||
        oldStat.nlink !== 1 ||
        oldStat.uid !== process.getuid() ||
        oldStat.size > 400000
      )
        fail('historical file required')
      const bytes = await old.readFile()
      let parsed
      try {
        parsed = JSON.parse(bytes.toString('utf8'))
      } catch {
        fail('historical JSON')
      }
      const previous = validateRecording(parsed)
      if (
        previous.digest !== options.previousDigest ||
        !bytes.equals(Buffer.from(`${canonicalJson(previous)}\n`)) ||
        previous.suiteId !== recording.suiteId ||
        previous.caseId !== recording.caseId
      )
        fail('historical identity or canonical bytes')
    }
    const target =
      options.mode === 'record'
        ? name
        : `${name}.refresh-${recording.digest}.json`
    if (Buffer.byteLength(target) >= 255) fail('filename cap')
    // Exclusive no-follow creation never truncates any historical artifact.
    const file = await open(
      join(physical, target),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    )
    handles.push(file)
    await file.writeFile(`${canonicalJson(recording)}\n`)
    await file.sync()
    result = snapshot({
      path: join(dirname(options.path), target),
      digest: recording.digest
    })
  } catch (cause) {
    primary = new Error('synthetic persistence rejected', { cause })
  } finally {
    const cleanupFailures = []
    for (const handle of handles.reverse()) {
      try {
        await handle.close()
      } catch (cause) {
        cleanupFailures.push(
          new Error('synthetic persistence cleanup failed', { cause })
        )
      }
    }
    const cleanup =
      cleanupFailures.length > 1
        ? new AggregateError(
            cleanupFailures,
            'synthetic persistence cleanup failures'
          )
        : (cleanupFailures[0] ?? null)
    if (primary && cleanup)
      throw new AggregateError(
        [primary, cleanup],
        'synthetic persistence failures',
        { cause: primary }
      )
    if (primary || cleanup) throw primary ?? cleanup
  }
  return result
}
