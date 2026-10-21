import { createHash, randomBytes } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
  writeSync
} from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { ShiftStore, type StoreProjection } from './store.ts'

/**
 * Backup and restore of the assistant's volume (SPEC 0179 section 10,
 * PISO-008). The volume is copied only with the writer stopped; every
 * document gets a relative path, size and SHA-256 in the inventory, the copy
 * is verified hash by hash and only then is `backup_verified` emitted, as a
 * receipt outside the stopped set. Nothing is ever removed or pruned (D4).
 *
 * Built on the current journal format (V1): there is no journal UUID or
 * sequence number and no single-writer lock file yet (PISO-004, journal V2).
 * The writer is shown stopped by the operator's statement, a URL of the
 * assistant that must refuse connections (or the operator's recorded waiver)
 * and a second hash pass that must find the source unchanged after the copy.
 * A scan of open file handles is only a weak hint: the journal is opened and
 * closed on every commit, so a running writer is rarely caught holding it.
 */

export const BACKUP_TOOL = 'cvg-shift-backup/1'

export type FileKind =
  | 'journal_manifest'
  | 'journal_segment'
  | 'recovery'
  | 'media'
  | 'other'

export interface InventoryFile {
  path: string
  kind: FileKind
  bytes: number
  sha256: string
}

export interface SegmentSummary {
  file: string
  bytes: number
  sha256: string
  /** Bytes up to the last newline: what replay commits. */
  committedBytes: number
  committedSha256: string
  lines: number
  /** Bytes after the last newline (an uncommitted tail). */
  tailBytes: number
  events: Record<string, number>
  sealedPrefixBytes?: number
  sealedPrefixSha256?: string
}

export interface WriterChecks {
  operatorConfirmedStopped: boolean
  stoppedUrl: 'refused' | 'answered' | 'waived_by_operator'
  openHandles: 'none_visible' | 'found' | 'unavailable'
  unreadableProcesses: number
  stableDuringCopy: boolean
  lock: 'none_in_journal_v1'
}

export interface BackupInventory {
  schemaVersion: 1
  kind: 'shift-assistant-backup-inventory'
  tool: string
  backupId: string
  createdAt: string
  /** SHA-256 of the source realpath: restore refuses to write onto it. */
  sourceRealpathSha256: string
  journal: {
    format: 'v1'
    uuid: null
    seq: null
    dependency: string
    segments: SegmentSummary[]
  }
  media: { referenced: number; missing: string[]; orphans: string[] }
  writer: WriterChecks
  files: InventoryFile[]
  totals: { files: number; bytes: number }
}

export interface BackupReceipt {
  schemaVersion: 1
  kind: 'shift-assistant-backup-receipt'
  event: 'backup_verified' | 'backup_failed'
  status: 'VERIFIED' | 'FAILED'
  backupId: string
  tool: string
  createdAt: string
  completedAt: string
  files: number
  bytes: number
  inventorySha256?: string
  projectionSha256?: string
  reasons: string[]
  removal: 'none (D4: originals and copies are kept)'
}

export interface BackupOptions {
  dataDir: string
  outDir: string
  /** Operator statement that the assistant process is stopped. */
  writerStopped: boolean
  /**
   * Health or webhook URL of the assistant: it must refuse connections.
   * Required unless `stoppedUrlWaived` records the operator's explicit
   * decision to skip it (for example, no network path to the assistant).
   */
  stoppedUrl?: string
  stoppedUrlWaived?: boolean
  clock?: () => Date
}

/** Misuse that must not write anything (for example `outDir` in the volume). */
export class BackupUsageError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'BackupUsageError'
    this.code = code
  }
}

/** Absolute path with the nearest existing ancestor's symlinks resolved. */
function resolvedPath(path: string): string {
  let existing = resolve(path)
  const rest: string[] = []
  while (!existsSync(existing)) {
    const parent = dirname(existing)
    if (parent === existing) break
    rest.unshift(basename(existing))
    existing = parent
  }
  return join(realpathSync(existing), ...rest)
}

/** `path` and each of its ancestors, up to the root. */
function selfAndAncestors(path: string): string[] {
  const out = [path]
  let current = path
  while (dirname(current) !== current) {
    current = dirname(current)
    out.push(current)
  }
  return out
}

function insideOrEqual(child: string, parent: string): boolean {
  return (
    child === parent ||
    child.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`)
  )
}

export interface BackupResult {
  backupDir: string
  receipt: BackupReceipt
}

export interface RestoreCheck {
  name: string
  pass: boolean
  detail?: string
}

export interface RestoreReport {
  schemaVersion: 1
  kind: 'shift-assistant-restore-proof'
  backupId?: string
  verdict: 'PASS' | 'FAIL'
  checks: RestoreCheck[]
  projectionSha256?: string
  counts?: Record<string, number>
}

const HEX64 = /^[0-9a-f]{64}$/
const SEGMENT = /^events(?:-\d{4})?\.jsonl$/

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** JSON with object keys sorted at every level: equal data, equal bytes. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** Relative POSIX path with no absolute root, `..`, `.` or empty part. */
export function safeRelativePath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 512) {
    return false
  }
  if (path.includes('\0') || path.includes('\\') || isAbsolute(path)) {
    return false
  }
  return path
    .split('/')
    .every((part) => part !== '' && part !== '.' && part !== '..')
}

interface Walk {
  files: string[]
  unsupported: string[]
}

/** Regular files under `root` (sorted); symlinks and specials are reported. */
function walk(
  root: string,
  prefix = '',
  into: Walk = { files: [], unsupported: [] }
): Walk {
  for (const name of readdirSync(join(root, prefix)).sort()) {
    const path = prefix ? `${prefix}/${name}` : name
    const stat = lstatSync(join(root, path))
    if (stat.isDirectory()) walk(root, path, into)
    else if (stat.isFile()) into.files.push(path)
    else into.unsupported.push(path)
  }
  return into
}

function kindOf(path: string): FileKind {
  if (path === 'journal.json') return 'journal_manifest'
  if (SEGMENT.test(path)) return 'journal_segment'
  if (path.startsWith('recovery/')) return 'recovery'
  if (path.startsWith('media/')) return 'media'
  return 'other'
}

function writeDurably(path: string, bytes: Uint8Array): void {
  const fd = openSync(path, 'wx', 0o600)
  try {
    let offset = 0
    while (offset < bytes.byteLength) {
      offset += writeSync(fd, bytes, offset, bytes.byteLength - offset)
    }
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function syncDirectory(path: string): void {
  const fd = openSync(path, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function ensureDirectory(root: string, relative: string): void {
  let current = root
  for (const part of relative.split('/').slice(0, -1)) {
    current = join(current, part)
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 })
  }
}

function directoriesOf(files: string[]): string[] {
  const dirs = new Set<string>([''])
  for (const file of files) {
    const parts = file.split('/')
    for (let index = 1; index < parts.length; index += 1) {
      dirs.add(parts.slice(0, index).join('/'))
    }
  }
  // Deepest first, so each directory is synced after its children.
  return [...dirs].sort((left, right) => right.length - left.length)
}

/**
 * Copies `files` from `fromDir` into `toDir` (0700 directories, 0600 files,
 * create-exclusive) and verifies each written file against `expected`.
 * Returns the paths whose copy does not match.
 */
async function copyVerified(
  fromDir: string,
  toDir: string,
  files: string[],
  expected: Map<string, { bytes: number; sha256: string }>
): Promise<string[]> {
  for (const path of files) {
    await nextTurn()
    ensureDirectory(toDir, path)
    writeDurably(join(toDir, path), readFileSync(join(fromDir, path)))
  }
  for (const dir of directoriesOf(files)) syncDirectory(join(toDir, dir))
  return files.filter((path) => {
    const copy = readFileSync(join(toDir, path))
    const want = expected.get(path)
    return (
      !want || copy.byteLength !== want.bytes || sha256(copy) !== want.sha256
    )
  })
}

function hashes(
  root: string,
  files: string[]
): Map<string, { bytes: number; sha256: string }> {
  const out = new Map<string, { bytes: number; sha256: string }>()
  for (const path of files) {
    const bytes = readFileSync(join(root, path))
    out.set(path, { bytes: bytes.byteLength, sha256: sha256(bytes) })
  }
  return out
}

function sameHashes(
  left: Map<string, { bytes: number; sha256: string }>,
  right: Map<string, { bytes: number; sha256: string }>
): boolean {
  if (left.size !== right.size) return false
  for (const [path, entry] of left) {
    const other = right.get(path)
    if (!other || other.bytes !== entry.bytes || other.sha256 !== entry.sha256)
      return false
  }
  return true
}

/** Open file handles of other processes inside `dataDir` (Linux /proc). */
function openHandles(dataDir: string): {
  state: WriterChecks['openHandles']
  unreadable: number
} {
  if (!existsSync('/proc/self/fd'))
    return { state: 'unavailable', unreadable: 0 }
  const real = realpathSync(dataDir)
  let found = false
  let unreadable = 0
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid) || Number(pid) === process.pid) continue
    let fds: string[]
    try {
      fds = readdirSync(`/proc/${pid}/fd`)
    } catch {
      unreadable += 1
      continue
    }
    for (const fd of fds) {
      try {
        const target = readlinkSync(`/proc/${pid}/fd/${fd}`)
        if (target === real || target.startsWith(`${real}/`)) found = true
      } catch {
        // The descriptor closed while scanning.
      }
    }
  }
  return { state: found ? 'found' : 'none_visible', unreadable }
}

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(1500),
      redirect: 'manual'
    })
    await response.body?.cancel().catch(() => undefined)
    return true
  } catch {
    return false
  }
}

function summarizeSegments(root: string, files: string[]): SegmentSummary[] {
  const manifestPath = join(root, 'journal.json')
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        segments?: Array<{
          file?: string
          prefixBytes?: number
          prefixSha256?: string
        }>
      })
    : { segments: [{ file: 'events.jsonl' }] }
  const listed = (manifest.segments ?? []).filter(
    (
      segment
    ): segment is {
      file: string
      prefixBytes?: number
      prefixSha256?: string
    } => typeof segment.file === 'string' && files.includes(segment.file)
  )
  return listed.map((segment) => {
    const bytes = readFileSync(join(root, segment.file))
    const end = bytes.lastIndexOf(0x0a) + 1
    const committed = bytes.subarray(0, end)
    const events: Record<string, number> = {}
    const count = (type: unknown) => {
      const key =
        typeof type === 'string' && /^[a-z_]{1,64}$/.test(type)
          ? type
          : '<invalid>'
      events[key] = (events[key] ?? 0) + 1
    }
    let lines = 0
    for (const line of committed.toString('utf8').split('\n').slice(0, -1)) {
      lines += 1
      if (!line.trim()) continue
      try {
        const record = JSON.parse(line) as { type?: unknown; events?: unknown }
        if (record.type === 'transaction' && Array.isArray(record.events)) {
          for (const event of record.events) {
            count((event as { type?: unknown } | null)?.type)
          }
        } else count(record.type)
      } catch {
        count(undefined)
      }
    }
    return {
      file: segment.file,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      committedBytes: end,
      committedSha256: sha256(committed),
      lines,
      tailBytes: bytes.byteLength - end,
      events,
      ...(segment.prefixBytes !== undefined
        ? { sealedPrefixBytes: segment.prefixBytes }
        : {}),
      ...(segment.prefixSha256 !== undefined
        ? { sealedPrefixSha256: segment.prefixSha256 }
        : {})
    }
  })
}

function mediaReport(
  projection: StoreProjection,
  files: string[]
): BackupInventory['media'] {
  const referenced = new Set(
    projection.notes
      .map((note) => note.mediaFile)
      .filter((name): name is string => typeof name === 'string')
      .map((name) => `media/${name}`)
  )
  const present = new Set(files.filter((path) => path.startsWith('media/')))
  return {
    referenced: referenced.size,
    missing: [...referenced].filter((path) => !present.has(path)).sort(),
    orphans: [...present].filter((path) => !referenced.has(path)).sort()
  }
}

/**
 * Backs up a stopped volume into a new directory under `outDir`. Always
 * writes `receipt.json` there: `backup_verified` only after every copied
 * file matched its inventory hash and the source stayed unchanged; any
 * failure is `backup_failed` and authorizes nothing. An `outDir` inside the
 * volume is refused before anything is written (BackupUsageError).
 */
export async function createBackup(
  options: BackupOptions
): Promise<BackupResult> {
  const source = options.dataDir
  const sourceExists = existsSync(source) && statSync(source).isDirectory()
  if (
    sourceExists &&
    insideOrEqual(resolvedPath(options.outDir), realpathSync(source))
  ) {
    throw new BackupUsageError('out_inside_source')
  }
  const clock = options.clock ?? (() => new Date())
  const createdAt = clock().toISOString()
  const backupId = `shift-backup-${createdAt.replace(/[-:.]/g, '').slice(0, 15)}-${randomBytes(3).toString('hex')}`
  mkdirSync(options.outDir, { recursive: true, mode: 0o700 })
  const backupDir = join(options.outDir, backupId)
  mkdirSync(backupDir, { mode: 0o700 })
  const reasons: string[] = []
  let totals = { files: 0, bytes: 0 }
  const hashesOf: { inventorySha256?: string; projectionSha256?: string } = {}

  const finish = (): BackupResult => {
    const status = reasons.length === 0 ? 'VERIFIED' : 'FAILED'
    const receipt: BackupReceipt = {
      schemaVersion: 1,
      kind: 'shift-assistant-backup-receipt',
      event: status === 'VERIFIED' ? 'backup_verified' : 'backup_failed',
      status,
      backupId,
      tool: BACKUP_TOOL,
      createdAt,
      completedAt: clock().toISOString(),
      files: totals.files,
      bytes: totals.bytes,
      ...hashesOf,
      reasons,
      removal: 'none (D4: originals and copies are kept)'
    }
    writeDurably(
      join(backupDir, 'receipt.json'),
      Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`)
    )
    syncDirectory(backupDir)
    return { backupDir, receipt }
  }

  if (!options.writerStopped) reasons.push('writer_not_confirmed_stopped')
  if (!options.stoppedUrl && options.stoppedUrlWaived !== true) {
    reasons.push('stopped_url_required')
  }
  if (!sourceExists) reasons.push('source_missing')
  if (reasons.length > 0) return finish()

  const stoppedUrl: WriterChecks['stoppedUrl'] = options.stoppedUrl
    ? (await answers(options.stoppedUrl))
      ? 'answered'
      : 'refused'
    : 'waived_by_operator'
  if (stoppedUrl === 'answered') reasons.push('writer_answering')
  const handles = openHandles(source)
  if (handles.state === 'found') reasons.push('writer_holds_files')
  const first = walk(source)
  if (first.unsupported.length > 0) reasons.push('unsupported_entry_in_source')
  if (reasons.length > 0) return finish()

  const before = hashes(source, first.files)
  const copyDir = join(backupDir, 'data')
  mkdirSync(copyDir, { mode: 0o700 })
  const mismatched = await copyVerified(source, copyDir, first.files, before)
  if (mismatched.length > 0) reasons.push('copy_hash_mismatch')
  const second = walk(source)
  const stable =
    second.unsupported.length === 0 &&
    sameHashes(before, hashes(source, second.files))
  if (!stable) reasons.push('source_changed_during_copy')

  let projection: StoreProjection | undefined
  try {
    projection = new ShiftStore(copyDir, { readOnly: true }).projection()
  } catch {
    reasons.push('journal_corrupt')
  }
  let segments: SegmentSummary[] = []
  try {
    segments = summarizeSegments(copyDir, first.files)
  } catch {
    if (!reasons.includes('journal_corrupt')) reasons.push('journal_corrupt')
  }
  const media = projection
    ? mediaReport(projection, first.files)
    : { referenced: 0, missing: [], orphans: [] }
  if (media.missing.length > 0) reasons.push('media_missing')

  const files: InventoryFile[] = first.files.map((path) => ({
    path,
    kind: kindOf(path),
    bytes: before.get(path)!.bytes,
    sha256: before.get(path)!.sha256
  }))
  totals = {
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0)
  }
  const inventory: BackupInventory = {
    schemaVersion: 1,
    kind: 'shift-assistant-backup-inventory',
    tool: BACKUP_TOOL,
    backupId,
    createdAt,
    sourceRealpathSha256: sha256(realpathSync(source)),
    journal: {
      format: 'v1',
      uuid: null,
      seq: null,
      dependency:
        'journal UUID, sequence, prefix hash chain and writer lock arrive with journal V2 (PISO-004)',
      segments
    },
    media,
    writer: {
      operatorConfirmedStopped: true,
      stoppedUrl,
      openHandles: handles.state,
      unreadableProcesses: handles.unreadable,
      stableDuringCopy: stable,
      lock: 'none_in_journal_v1'
    },
    files,
    totals
  }
  const inventoryBytes = Buffer.from(`${JSON.stringify(inventory, null, 2)}\n`)
  writeDurably(join(backupDir, 'inventory.json'), inventoryBytes)
  hashesOf.inventorySha256 = sha256(inventoryBytes)
  if (projection) {
    const projectionBytes = Buffer.from(canonicalJson(projection))
    writeDurably(join(backupDir, 'projection.json'), projectionBytes)
    hashesOf.projectionSha256 = sha256(projectionBytes)
  }
  syncDirectory(backupDir)
  return finish()
}

function readJson(path: string): { bytes: Buffer; value: unknown } | undefined {
  try {
    const bytes = readFileSync(path)
    return { bytes, value: JSON.parse(bytes.toString('utf8')) }
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validEntry(entry: unknown): entry is InventoryFile {
  return (
    isRecord(entry) &&
    typeof entry.path === 'string' &&
    typeof entry.bytes === 'number' &&
    Number.isInteger(entry.bytes) &&
    entry.bytes >= 0 &&
    typeof entry.sha256 === 'string' &&
    HEX64.test(entry.sha256)
  )
}

/**
 * Restores a verified backup into a new, empty volume and reopens it under
 * hold (read-only): every path, file type and hash is checked before the
 * first byte is written, and the restored projection must equal the
 * backed-up one. Never writes onto a non-empty directory or the source.
 */
export async function restoreBackup(options: {
  backupDir: string
  targetDir: string
}): Promise<RestoreReport> {
  const checks: RestoreCheck[] = []
  const report = (extra: Partial<RestoreReport> = {}): RestoreReport => ({
    schemaVersion: 1,
    kind: 'shift-assistant-restore-proof',
    ...extra,
    verdict:
      checks.length > 0 && checks.every((check) => check.pass)
        ? 'PASS'
        : 'FAIL',
    checks
  })
  const check = (name: string, pass: boolean, detail?: string): boolean => {
    checks.push({ name, pass, ...(detail ? { detail } : {}) })
    return pass
  }

  const receipt = readJson(join(options.backupDir, 'receipt.json'))
  const receiptValue = isRecord(receipt?.value) ? receipt.value : undefined
  const backupId =
    typeof receiptValue?.backupId === 'string'
      ? receiptValue.backupId
      : undefined
  const id = backupId ? { backupId } : {}
  if (
    !check(
      'receipt verified',
      receiptValue?.status === 'VERIFIED' &&
        receiptValue.event === 'backup_verified'
    )
  ) {
    return report(id)
  }
  const inventory = readJson(join(options.backupDir, 'inventory.json'))
  const inventoryValue = isRecord(inventory?.value)
    ? inventory.value
    : undefined
  const entries = Array.isArray(inventoryValue?.files)
    ? inventoryValue.files
    : []
  if (
    !check(
      'inventory hash matches receipt',
      inventory !== undefined &&
        sha256(inventory.bytes) === receiptValue!.inventorySha256 &&
        entries.every(validEntry)
    )
  ) {
    return report(id)
  }
  const projectionFile = readJson(join(options.backupDir, 'projection.json'))
  if (
    !check(
      'projection hash matches receipt',
      projectionFile !== undefined &&
        sha256(projectionFile.bytes) === receiptValue!.projectionSha256
    )
  ) {
    return report(id)
  }
  const files = entries as InventoryFile[]
  const paths = files.map((file) => file.path)
  const unsafe = paths.filter((path) => !safeRelativePath(path))
  if (
    !check(
      'paths are relative and inside the set',
      unsafe.length === 0 && new Set(paths).size === paths.length,
      unsafe.length > 0 ? `${unsafe.length} unsafe path(s)` : undefined
    )
  ) {
    return report(id)
  }
  const dataDir = join(options.backupDir, 'data')
  let found: Walk
  try {
    if (!lstatSync(dataDir).isDirectory()) throw new Error('not a directory')
    found = walk(dataDir)
  } catch {
    check('no symlink or special file', false, 'backup data unreadable')
    return report(id)
  }
  if (
    !check(
      'no symlink or special file',
      found.unsupported.length === 0,
      found.unsupported.length > 0
        ? `${found.unsupported.length} entr(y/ies)`
        : undefined
    )
  ) {
    return report(id)
  }
  const wanted = new Set(paths)
  const extra = found.files.filter((path) => !wanted.has(path))
  const missing = paths.filter((path) => !found.files.includes(path))
  if (
    !check(
      'set matches the inventory exactly',
      extra.length === 0 && missing.length === 0,
      extra.length + missing.length > 0
        ? `${extra.length} extra, ${missing.length} missing`
        : undefined
    )
  ) {
    return report(id)
  }
  const expected = new Map(
    files.map((file) => [file.path, { bytes: file.bytes, sha256: file.sha256 }])
  )
  const actual = hashes(dataDir, paths)
  const divergent = paths.filter((path) => {
    const want = expected.get(path)!
    const have = actual.get(path)!
    return want.bytes !== have.bytes || want.sha256 !== have.sha256
  })
  if (
    !check(
      'hashes match before writing',
      divergent.length === 0,
      divergent.length > 0 ? `${divergent.length} file(s)` : undefined
    )
  ) {
    return report(id)
  }

  const target = options.targetDir
  let targetOk = true
  let targetDetail: string | undefined
  // The target (symlinks of its existing ancestors resolved) must not be the
  // source volume or lie inside it: compare each ancestor's realpath hash.
  const sourceHash = inventoryValue!.sourceRealpathSha256
  if (
    selfAndAncestors(resolvedPath(target)).some(
      (path) => sha256(path) === sourceHash
    )
  ) {
    targetOk = false
    targetDetail = 'source volume or inside it'
  } else if (existsSync(target)) {
    const stat = lstatSync(target)
    if (!stat.isDirectory()) {
      targetOk = false
      targetDetail = 'not a directory'
    } else if (readdirSync(target).length > 0) {
      targetOk = false
      targetDetail = 'not empty'
    }
  }
  if (targetOk && !existsSync(target)) {
    try {
      mkdirSync(target, { mode: 0o700 })
    } catch {
      targetOk = false
      targetDetail = 'cannot create (parent missing?)'
    }
  }
  if (!check('target is new and empty', targetOk, targetDetail)) {
    return report(id)
  }
  const copied = await copyVerified(dataDir, target, paths, expected)
  if (
    !check(
      'copied hashes match',
      copied.length === 0,
      copied.length > 0 ? `${copied.length} file(s)` : undefined
    )
  ) {
    return report(id)
  }

  let restored: StoreProjection | undefined
  let pendingTailBytes = 0
  try {
    const store = new ShiftStore(target, { readOnly: true })
    restored = store.projection()
    pendingTailBytes = store.pendingTailBytes
  } catch {
    restored = undefined
  }
  const restoredBytes = restored
    ? Buffer.from(canonicalJson(restored))
    : undefined
  const projectionSha256 = restoredBytes ? sha256(restoredBytes) : undefined
  check(
    'projection matches under hold',
    restoredBytes !== undefined &&
      canonicalJson(projectionFile!.value) === restoredBytes.toString('utf8'),
    projectionSha256
  )
  const media = restored
    ? mediaReport(restored, paths)
    : { referenced: 0, missing: ['<unreadable>'], orphans: [] }
  check(
    'referenced media present',
    media.missing.length === 0,
    `${media.referenced} referenced, ${media.orphans.length} orphan(s) kept`
  )
  const counts: Record<string, number> = {
    files: paths.length,
    messages: restored?.messages.length ?? 0,
    notes: restored?.notes.length ?? 0,
    tasks: restored?.tasks.length ?? 0,
    pendingTailBytes
  }
  for (const task of restored?.tasks ?? []) {
    counts[`tasks_${task.status}`] = (counts[`tasks_${task.status}`] ?? 0) + 1
  }
  return report({
    ...id,
    ...(projectionSha256 ? { projectionSha256 } : {}),
    counts
  })
}

/** Exposed for the restore sandbox: same create-exclusive verified copy. */
export async function copyVolume(
  fromDir: string,
  toDir: string
): Promise<{ ok: boolean; detail?: string }> {
  const found = walk(fromDir)
  if (found.unsupported.length > 0) {
    return { ok: false, detail: 'unsupported entry' }
  }
  if (existsSync(toDir) && readdirSync(toDir).length > 0) {
    return { ok: false, detail: 'not empty' }
  }
  try {
    if (!existsSync(toDir)) mkdirSync(toDir, { mode: 0o700 })
  } catch {
    return { ok: false, detail: 'cannot create' }
  }
  const expected = hashes(fromDir, found.files)
  const mismatched = await copyVerified(fromDir, toDir, found.files, expected)
  return mismatched.length === 0
    ? { ok: true }
    : { ok: false, detail: `${mismatched.length} file(s)` }
}
