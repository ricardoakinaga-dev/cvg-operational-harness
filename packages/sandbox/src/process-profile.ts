import { createHash } from 'node:crypto'
import {
  constants,
  fstatSync,
  readSync,
  realpathSync,
  type BigIntStats
} from 'node:fs'
import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep
} from 'node:path'
import type { SandboxHandle } from '@cvg/harness-contracts'
import {
  closeQuietly,
  directoryDescriptorsAvailable,
  openDirectoryChain,
  openFileAt
} from './dir-fd.ts'

/** Host-created authority, not JSON accepted from a tool/model request. */
export interface ProcessContainmentProfile {
  readonly digest: string
}
export interface ProcessRuntimeFile {
  readonly source: string
  readonly destination?: string
}
export interface ProcessContainmentOptions {
  readonly workspaceRoot: string
  readonly bwrapPath: string
  readonly runtimeFiles: readonly ProcessRuntimeFile[]
  readonly executablePaths: readonly string[]
}
interface PinnedFile {
  readonly source: string
  readonly destination: string
  readonly stamp: string
  readonly sha256: string
  readonly bytes: number
  readonly mode: number
}
interface ProfileRecord {
  readonly workspaceRoot: string
  readonly workspaceIdentity: string
  readonly bwrap: PinnedFile
  readonly files: readonly PinnedFile[]
  readonly executablePaths: readonly string[]
  readonly digest: string
}
const profiles = new WeakMap<object, ProfileRecord>()
const MAX_FILE_BYTES = 256 * 1024 * 1024
const MAX_RUNTIME_BYTES = 512 * 1024 * 1024
const FIXED_ENV = Object.freeze({
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
  TZ: 'UTC'
})
function fail(reason: string): never {
  throw new Error(`process_profile_${reason}`)
}
function absolute(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 4096 ||
    value.includes('\0') ||
    !isAbsolute(value) ||
    resolve(value) !== value
  )
    fail('invalid_path')
  return value
}
function within(root: string, value: string): boolean {
  return (
    value === root || value.startsWith(root.endsWith(sep) ? root : root + sep)
  )
}
function workspaceIdentity(stat: BigIntStats): string {
  // Birth identity distinguishes an inode reused after the workspace is removed.
  if (
    !stat.isDirectory() ||
    typeof stat.birthtimeNs !== 'bigint' ||
    stat.birthtimeNs <= 0n
  )
    fail('workspace_identity_unavailable')
  return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`
}
function stamp(stat: BigIntStats): string {
  return [
    stat.dev,
    stat.ino,
    stat.size,
    stat.mode,
    stat.uid,
    stat.gid,
    stat.mtimeNs,
    stat.ctimeNs
  ].join(':')
}
function directory(path: string): number {
  const opened = openDirectoryChain(
    '/',
    relative('/', path).split(sep).filter(Boolean)
  )
  if (!opened.ok) fail('directory_changed_or_unavailable')
  return opened.fd
}
function file(path: string): number {
  const parent = directory(dirname(path))
  try {
    const opened = openFileAt(parent, basename(path), constants.O_RDONLY)
    if (!opened.ok) fail('runtime_file_unavailable')
    return opened.fd
  } finally {
    closeQuietly(parent)
  }
}
function hashFile(
  fd: number,
  remainingBytes = MAX_RUNTIME_BYTES
): { stamp: string; sha256: string; bytes: number; mode: number } {
  const before = fstatSync(fd, { bigint: true })
  if (
    !before.isFile() ||
    before.size > BigInt(MAX_FILE_BYTES) ||
    before.size > BigInt(remainingBytes)
  )
    fail('runtime_file_limit')
  const hash = createHash('sha256'),
    buffer = Buffer.allocUnsafe(64 * 1024)
  let bytes = 0
  for (;;) {
    const count = readSync(fd, buffer, 0, buffer.length, bytes)
    if (count === 0) break
    bytes += count
    if (bytes > MAX_FILE_BYTES) fail('runtime_file_limit')
    hash.update(buffer.subarray(0, count))
  }
  if (
    stamp(before) !== stamp(fstatSync(fd, { bigint: true })) ||
    BigInt(bytes) !== before.size
  )
    fail('runtime_changed_during_capture')
  return {
    stamp: stamp(before),
    sha256: hash.digest('hex'),
    bytes,
    mode: Number(before.mode)
  }
}
function capture(
  source: string,
  destination: string,
  remainingBytes = MAX_RUNTIME_BYTES
): PinnedFile {
  const fd = file(source)
  try {
    return Object.freeze({
      source,
      destination,
      ...hashFile(fd, remainingBytes)
    })
  } finally {
    closeQuietly(fd)
  }
}
function openPinned(record: PinnedFile): number {
  const fd = file(record.source)
  try {
    const current = hashFile(fd)
    if (
      current.stamp !== record.stamp ||
      current.sha256 !== record.sha256 ||
      current.bytes !== record.bytes
    )
      fail('runtime_identity_changed')
    return fd
  } catch (error) {
    closeQuietly(fd)
    throw error
  }
}
function recordOf(
  profile: ProcessContainmentProfile | undefined
): ProfileRecord {
  const record = profile && profiles.get(profile)
  if (!record) fail('qualified_profile_required')
  return record
}

/**
 * Capture an explicit, reviewed host manifest at composition time. This never
 * runs ldd or discovers dependencies from model argv. Capturing a profile is
 * not an attestation: the host must qualify this exact digest before rollout.
 * No descriptors remain open between calls.
 */
export function createProcessContainmentProfile(
  options: ProcessContainmentOptions
): ProcessContainmentProfile {
  if (!directoryDescriptorsAvailable()) fail('platform_unavailable')
  const workspaceRoot = realpathSync(absolute(options.workspaceRoot))
  if (workspaceRoot === '/') fail('unrestricted_workspace')
  const rootFd = directory(workspaceRoot)
  let identity: string
  try {
    identity = workspaceIdentity(fstatSync(rootFd, { bigint: true }))
  } finally {
    closeQuietly(rootFd)
  }
  if (
    !Array.isArray(options.runtimeFiles) ||
    options.runtimeFiles.length === 0 ||
    options.runtimeFiles.length > 64
  )
    fail('runtime_manifest_limit')
  if (
    !Array.isArray(options.executablePaths) ||
    options.executablePaths.length === 0 ||
    options.executablePaths.length > 16
  )
    fail('executable_manifest_limit')
  let totalBytes = 0
  const files = options.runtimeFiles
    .map((entry) => {
      const destination = absolute(entry.destination ?? entry.source),
        source = realpathSync(absolute(entry.source))
      if (
        within(workspaceRoot, source) ||
        within(workspaceRoot, destination) ||
        within(destination, workspaceRoot) ||
        ['/tmp', '/proc', '/dev'].some((p) => within(p, destination))
      )
        fail('runtime_workspace_or_private_mount_overlap')
      const captured = capture(
        source,
        destination,
        MAX_RUNTIME_BYTES - totalBytes
      )
      totalBytes += captured.bytes
      return captured
    })
    .sort((a, b) =>
      a.destination < b.destination ? -1 : a.destination > b.destination ? 1 : 0
    )
  if (
    new Set(files.map((f) => f.destination)).size !== files.length ||
    files.reduce((sum, f) => sum + f.bytes, 0) > MAX_RUNTIME_BYTES
  )
    fail('runtime_manifest_limit')
  const executablePaths = [
    ...new Set(options.executablePaths.map(absolute))
  ].sort()
  for (const executable of executablePaths) {
    const entry = files.find((f) => f.destination === executable)
    if (!entry) fail('executable_not_in_manifest')
    if ((entry.mode & 0o111) === 0) fail('runtime_not_executable')
  }
  const bwrapSource = realpathSync(absolute(options.bwrapPath))
  if (within(workspaceRoot, bwrapSource)) fail('backend_inside_workspace')
  const bwrap = capture(
    bwrapSource,
    bwrapSource,
    MAX_RUNTIME_BYTES - totalBytes
  )
  const data = {
    schemaVersion: 'process-containment-profile-v1',
    workspaceRoot,
    workspaceIdentity: identity,
    bwrap,
    files,
    executablePaths
  }
  const digest = createHash('sha256').update(JSON.stringify(data)).digest('hex')
  const profile = Object.freeze({ digest })
  profiles.set(
    profile,
    Object.freeze({
      ...data,
      digest,
      files: Object.freeze(files),
      executablePaths: Object.freeze(executablePaths)
    })
  )
  return profile
}

/** Bind a shell descriptor to the reviewed profile, not to mutable host env. */
export function processProfileVersion(
  profile: ProcessContainmentProfile,
  workspaceRoot: string
): string {
  const record = recordOf(profile)
  if (record.workspaceRoot !== workspaceRoot) fail('workspace_binding_mismatch')
  return `v1:${record.digest}`
}

export interface PreparedProcessLaunch {
  readonly executable: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly fds: readonly number[]
  /** Child fd of the private `--json-status-fd` pipe; the caller adds a 'pipe' stdio at this index. */
  readonly statusFdIndex?: number
  close(): void
}

/** Open and pin every mounted identity before a payload can be launched. */
export function prepareProcessLaunch(request: {
  readonly profile?: ProcessContainmentProfile
  readonly handle: SandboxHandle
  readonly argv: readonly string[]
  readonly cwd?: string
  readonly bwrapPath?: string
  /** Ask bubblewrap for its private status channel (SPEC 0286 I6). */
  readonly statusFd?: boolean
  /** Already validated by the process service; the profile's own variables always win. */
  readonly env?: Readonly<Record<string, string>>
}): PreparedProcessLaunch {
  const record = recordOf(request.profile)
  if (
    request.handle.mode !== 'PROCESS' ||
    !request.handle.allowSubprocess ||
    request.handle.allowNetwork
  )
    fail('invalid_process_grant')
  const grantRoot = realpathSync(absolute(request.handle.workspaceRoot))
  if (!within(grantRoot, record.workspaceRoot)) fail('workspace_outside_grant')
  const cwd =
    request.cwd === undefined
      ? record.workspaceRoot
      : realpathSync(absolute(request.cwd))
  if (!within(record.workspaceRoot, cwd)) fail('cwd_outside_profile')
  if (
    request.bwrapPath !== undefined &&
    realpathSync(absolute(request.bwrapPath)) !== record.bwrap.source
  )
    fail('backend_binding_mismatch')
  const program = request.argv[0]
  if (typeof program !== 'string' || !record.executablePaths.includes(program))
    fail('executable_not_approved')
  const fds: number[] = []
  try {
    for (const entry of record.files) fds.push(openPinned(entry))
    const rootFd = directory(record.workspaceRoot)
    fds.push(rootFd)
    if (
      workspaceIdentity(fstatSync(rootFd, { bigint: true })) !==
      record.workspaceIdentity
    )
      fail('workspace_identity_changed')
    // Verify the current cwd without following an unvalidated name at mount time.
    closeQuietly(directory(cwd))
    const backendFd = openPinned(record.bwrap)
    fds.push(backendFd)
    const args = [
      '--new-session',
      '--die-with-parent',
      '--unshare-pid',
      '--unshare-ipc',
      '--unshare-uts',
      '--unshare-net',
      '--tmpfs',
      '/'
    ]
    const parents = new Set<string>()
    for (const entry of record.files) {
      for (
        let parent = dirname(entry.destination);
        parent !== '/';
        parent = dirname(parent)
      )
        parents.add(parent)
    }
    for (const parent of [...parents].sort(
      (a, b) => a.split(sep).length - b.split(sep).length || (a < b ? -1 : 1)
    ))
      args.push('--dir', parent)
    args.push('--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp')
    record.files.forEach((entry, index) =>
      args.push('--ro-bind-fd', String(3 + index), entry.destination)
    )
    const rootIndex = record.files.length
    const workspaceParents: string[] = []
    for (
      let parent = dirname(record.workspaceRoot);
      parent !== '/';
      parent = dirname(parent)
    )
      workspaceParents.push(parent)
    for (const parent of workspaceParents.reverse())
      if (!parents.has(parent) || within('/tmp', parent))
        args.push('--dir', parent)
    args.push(
      '--bind-fd',
      String(3 + rootIndex),
      record.workspaceRoot,
      '--chdir',
      cwd,
      '--clearenv'
    )
    for (const [name, value] of Object.entries({
      ...request.env,
      ...FIXED_ENV,
      HOME: '/tmp',
      TMPDIR: '/tmp',
      PATH: '',
      PWD: cwd
    }))
      args.push('--setenv', name, value)
    const statusFdIndex = request.statusFd ? 3 + fds.length : undefined
    if (statusFdIndex !== undefined)
      args.push('--json-status-fd', String(statusFdIndex))
    args.push('--', ...request.argv)
    // Extra stdio entries are duplicated into child fd3,fd4,... before exec.
    return {
      executable: `/proc/self/fd/${3 + fds.length - 1}`,
      args,
      env: FIXED_ENV,
      fds,
      ...(statusFdIndex !== undefined ? { statusFdIndex } : {}),
      close: () => {
        for (const fd of fds.splice(0)) closeQuietly(fd)
      }
    }
  } catch (error) {
    for (const fd of fds) closeQuietly(fd)
    throw error
  }
}
