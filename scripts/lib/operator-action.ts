/**
 * SPEC 0262 §6.1 — decision logic of `scripts/revoke-operator-sessions.ts`.
 *
 * The trust boundary is the LOCAL OPERATING-SYSTEM ADMINISTRATOR who installs
 * the policy and the approved decision under root: nothing here proves that a
 * human approved anything, and a matching file outside that boundary is only
 * untrusted input. Everything that touches the OS or the database is injected
 * so the parser and the bindings can be proven with fixtures; the production
 * `main` passes the real implementations and has no test flag, no `--force`
 * and no way to choose another policy path.
 */
import { createHash } from 'node:crypto'
import { posix as path } from 'node:path'

export const OPERATOR_ACTION_POLICY_PATH =
  '/etc/cvg/operator-action-policy.json'
export const OPERATION = 'invalidate_operator_sessions'
export const AUTHORITY = 'local_operator_attestation_v1'
const MAX_PROOF_BYTES = 4096
const MAX_POLICY_BYTES = 16 * 1024
const MAX_WINDOW_MS = 30 * 60_000
const AUTHORIZED_STATES = new Set([
  'APPROVED_FOR_EXECUTION',
  'HANDOFF_AUTHORIZED_FOR_EXECUTION'
])
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256 = /^[0-9a-f]{64}$/
const TENANT = /^tenant_[0-9a-f-]{36}$/
const OPERATOR = /^[A-Za-z0-9._:-]{3,80}$/

export type OperatorActionOutcome =
  | 'DRY_RUN'
  | 'APPLIED'
  | 'REFUSED'
  | 'UNKNOWN'

export class OperatorActionRefusal extends Error {
  constructor(readonly reason: string) {
    super(reason)
    this.name = 'OperatorActionRefusal'
  }
}

function refuse(reason: string): never {
  throw new OperatorActionRefusal(reason)
}

export interface FileStat {
  readonly isFile: boolean
  readonly isDirectory: boolean
  readonly isSymlink: boolean
  readonly uid: number
  /** Hard links to the inode: a second name could outlive the checked path. */
  readonly nlink: number
  /** Permission bits only (e.g. 0o600). */
  readonly mode: number
  readonly size: number
}

export interface OperatorActionFileSystem {
  /** `lstat`: never follows a symlink. */
  lstat(file: string): FileStat | null
  readFile(file: string): Buffer
}

export interface DatastoreProfile {
  readonly host: string
  readonly port: number
  readonly database: string
  readonly user: string
}

export interface OperatorActionPolicy {
  readonly v: 1
  readonly operation: typeof OPERATION
  readonly approvedDecisionsDir: string
  readonly installedArtifactSha256: string
  readonly datastoreProfile: DatastoreProfile
  readonly connectionFile: string
}

export interface OperatorActionProof {
  readonly v: 1
  readonly decisionId: string
  readonly operation: typeof OPERATION
  readonly state: string
  readonly tenantId: string
  readonly operatorId: string
  readonly expectedRevision: number
  readonly authority: typeof AUTHORITY
  readonly operator: string
  readonly decisionRef: string
  readonly issuedAt: string
  readonly expiresAt: string
  readonly reason: string
  readonly installedArtifactSha256: string
  readonly datastoreProfileSha256: string
}

export interface ParsedArguments {
  readonly tenantId: string
  readonly operatorId: string
  readonly expectedRevision: number
  readonly proof: string
  readonly apply: boolean
}

export function datastoreProfileSha256(profile: DatastoreProfile): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        profile.host,
        profile.port,
        profile.database,
        profile.user
      ])
    )
    .digest('hex')
}

/** Strict argument parser: exact flags, no environment, no unknown option. */
export function parseArguments(argv: readonly string[]): ParsedArguments {
  const values = new Map<string, string>()
  let apply = false
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]!
    if (flag === '--apply') {
      if (apply) refuse('duplicate --apply')
      apply = true
      continue
    }
    if (
      flag !== '--tenant' &&
      flag !== '--operator-id' &&
      flag !== '--expected-revision' &&
      flag !== '--proof'
    ) {
      refuse(`unknown option ${flag.slice(0, 40)}`)
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) {
      refuse(`${flag} needs a value`)
    }
    if (values.has(flag)) refuse(`duplicate ${flag}`)
    values.set(flag, value)
    index += 1
  }
  const tenantId = values.get('--tenant')
  const operatorId = values.get('--operator-id')
  const revision = values.get('--expected-revision')
  const proof = values.get('--proof')
  if (!tenantId || !TENANT.test(tenantId)) refuse('--tenant is invalid')
  if (!operatorId || !OPERATOR.test(operatorId)) {
    refuse('--operator-id is invalid')
  }
  if (!revision || !/^[1-9][0-9]{0,15}$/.test(revision)) {
    refuse('--expected-revision is invalid')
  }
  const expectedRevision = Number(revision)
  if (!Number.isSafeInteger(expectedRevision)) {
    refuse('--expected-revision is invalid')
  }
  if (!proof || !path.isAbsolute(proof) || proof.includes('\0')) {
    refuse('--proof must be an absolute path')
  }
  return { tenantId, operatorId, expectedRevision, proof, apply }
}

function parseStrictJson(
  bytes: Buffer,
  label: string
): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString('utf8'), function reviver(key, value) {
      return key === '__proto__'
        ? refuse(`${label} has a forbidden key`)
        : value
    })
  } catch (error) {
    if (error instanceof OperatorActionRefusal) throw error
    refuse(`${label} is not valid JSON`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    refuse(`${label} must be a JSON object`)
  }
  return parsed as Record<string, unknown>
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string
): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    refuse(`${label} has unexpected or missing fields`)
  }
}

/** regular, not a symlink, root-owned, mode 0600, with trusted parents. */
export function assertPrivateRootFile(
  fs: OperatorActionFileSystem,
  file: string,
  label: string,
  maxBytes: number
): Buffer {
  if (!path.isAbsolute(file) || path.normalize(file) !== file) {
    refuse(`${label} path is not canonical`)
  }
  const stat = fs.lstat(file)
  if (!stat || stat.isSymlink || !stat.isFile) {
    refuse(`${label} is not a regular file`)
  }
  if (stat.uid !== 0) refuse(`${label} is not owned by root`)
  if (stat.nlink !== 1) refuse(`${label} has more than one hard link`)
  if (stat.mode !== 0o600) refuse(`${label} must have mode 0600`)
  if (stat.size > maxBytes) refuse(`${label} is too large`)
  assertTrustedParents(fs, file, label)
  const bytes = fs.readFile(file)
  if (bytes.length > maxBytes) refuse(`${label} is too large`)
  return bytes
}

function assertTrustedParents(
  fs: OperatorActionFileSystem,
  file: string,
  label: string
): void {
  let current = path.dirname(file)
  for (;;) {
    const stat = fs.lstat(current)
    if (!stat || stat.isSymlink || !stat.isDirectory) {
      refuse(`${label} has an untrusted parent`)
    }
    if (stat.uid !== 0) refuse(`${label} has a parent not owned by root`)
    if ((stat.mode & 0o022) !== 0) {
      refuse(`${label} has a parent writable by others`)
    }
    const next = path.dirname(current)
    if (next === current) break
    current = next
  }
}

export function loadPolicy(
  fs: OperatorActionFileSystem,
  policyPath: string = OPERATOR_ACTION_POLICY_PATH
): OperatorActionPolicy {
  const bytes = assertPrivateRootFile(
    fs,
    policyPath,
    'policy',
    MAX_POLICY_BYTES
  )
  const raw = parseStrictJson(bytes, 'policy')
  exactKeys(
    raw,
    [
      'v',
      'operation',
      'approvedDecisionsDir',
      'installedArtifactSha256',
      'datastoreProfile',
      'connectionFile'
    ],
    'policy'
  )
  if (raw.v !== 1 || raw.operation !== OPERATION) refuse('policy is not v1')
  if (
    typeof raw.approvedDecisionsDir !== 'string' ||
    !path.isAbsolute(raw.approvedDecisionsDir) ||
    path.normalize(raw.approvedDecisionsDir) !== raw.approvedDecisionsDir
  ) {
    refuse('policy decisions directory is invalid')
  }
  if (
    typeof raw.connectionFile !== 'string' ||
    !path.isAbsolute(raw.connectionFile) ||
    path.normalize(raw.connectionFile) !== raw.connectionFile
  ) {
    refuse('policy connection file is invalid')
  }
  if (
    typeof raw.installedArtifactSha256 !== 'string' ||
    !SHA256.test(raw.installedArtifactSha256)
  ) {
    refuse('policy artifact digest is invalid')
  }
  const profile = raw.datastoreProfile as Record<string, unknown> | null
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    refuse('policy datastore profile is invalid')
  }
  exactKeys(profile, ['host', 'port', 'database', 'user'], 'datastore profile')
  if (
    typeof profile.host !== 'string' ||
    !profile.host ||
    typeof profile.database !== 'string' ||
    !profile.database ||
    typeof profile.user !== 'string' ||
    !profile.user ||
    typeof profile.port !== 'number' ||
    !Number.isInteger(profile.port) ||
    profile.port < 1 ||
    profile.port > 65535
  ) {
    refuse('policy datastore profile is invalid')
  }
  return {
    v: 1,
    operation: OPERATION,
    approvedDecisionsDir: raw.approvedDecisionsDir,
    installedArtifactSha256: raw.installedArtifactSha256,
    datastoreProfile: {
      host: profile.host,
      port: profile.port,
      database: profile.database,
      user: profile.user
    },
    connectionFile: raw.connectionFile
  }
}

export interface LoadedProof {
  readonly proof: OperatorActionProof
  /** sha256 of the private proof bytes (the only trace in the public audit). */
  readonly digest: string
}

export function loadProof(
  fs: OperatorActionFileSystem,
  policy: OperatorActionPolicy,
  args: ParsedArguments,
  context: {
    readonly now: Date
    readonly installedArtifactSha256: string
  }
): LoadedProof {
  const dir = policy.approvedDecisionsDir
  const dirStat = fs.lstat(dir)
  if (!dirStat || dirStat.isSymlink || !dirStat.isDirectory) {
    refuse('decisions directory is not a directory')
  }
  if (dirStat.uid !== 0) refuse('decisions directory is not owned by root')
  if (dirStat.mode !== 0o700) refuse('decisions directory must have mode 0700')
  if (path.dirname(args.proof) !== dir) {
    refuse('proof is outside the approved decisions directory')
  }
  const bytes = assertPrivateRootFile(fs, args.proof, 'proof', MAX_PROOF_BYTES)
  const raw = parseStrictJson(bytes, 'proof')
  exactKeys(
    raw,
    [
      'v',
      'decisionId',
      'operation',
      'state',
      'tenantId',
      'operatorId',
      'expectedRevision',
      'authority',
      'operator',
      'decisionRef',
      'issuedAt',
      'expiresAt',
      'reason',
      'installedArtifactSha256',
      'datastoreProfileSha256'
    ],
    'proof'
  )
  if (raw.v !== 1) refuse('proof is not v1')
  if (typeof raw.decisionId !== 'string' || !UUID.test(raw.decisionId)) {
    refuse('proof decisionId is not a UUID')
  }
  if (path.basename(args.proof) !== `${raw.decisionId}.json`) {
    refuse('proof file name does not match its decisionId')
  }
  if (raw.operation !== OPERATION) refuse('proof operation differs')
  if (typeof raw.state !== 'string' || !AUTHORIZED_STATES.has(raw.state)) {
    refuse('proof state does not authorize execution')
  }
  if (raw.authority !== AUTHORITY) refuse('proof authority differs')
  if (raw.tenantId !== args.tenantId) refuse('proof tenant differs')
  if (raw.operatorId !== args.operatorId)
    refuse('proof target operator differs')
  if (raw.expectedRevision !== args.expectedRevision) {
    refuse('proof revision differs')
  }
  if (
    typeof raw.operator !== 'string' ||
    !/^[A-Za-z0-9._:@-]{3,80}$/.test(raw.operator)
  ) {
    refuse('proof operator is invalid')
  }
  if (
    typeof raw.decisionRef !== 'string' ||
    raw.decisionRef.length < 8 ||
    raw.decisionRef.length > 512
  ) {
    refuse('proof decisionRef is invalid')
  }
  if (
    typeof raw.reason !== 'string' ||
    raw.reason.length < 1 ||
    raw.reason.length > 500
  ) {
    refuse('proof reason is invalid')
  }
  const issued = Date.parse(String(raw.issuedAt))
  const expires = Date.parse(String(raw.expiresAt))
  if (
    !Number.isFinite(issued) ||
    !Number.isFinite(expires) ||
    typeof raw.issuedAt !== 'string' ||
    typeof raw.expiresAt !== 'string' ||
    !raw.issuedAt.endsWith('Z') ||
    !raw.expiresAt.endsWith('Z')
  ) {
    refuse('proof timestamps are invalid')
  }
  const nowMs = context.now.getTime()
  if (issued > nowMs || nowMs > expires) refuse('proof is not valid now')
  if (expires - issued > MAX_WINDOW_MS)
    refuse('proof window exceeds 30 minutes')
  if (
    raw.installedArtifactSha256 !== policy.installedArtifactSha256 ||
    raw.installedArtifactSha256 !== context.installedArtifactSha256
  ) {
    refuse('installed artifact differs')
  }
  if (
    raw.datastoreProfileSha256 !==
    datastoreProfileSha256(policy.datastoreProfile)
  ) {
    refuse('datastore profile differs')
  }
  return {
    proof: raw as unknown as OperatorActionProof,
    digest: createHash('sha256').update(bytes).digest('hex')
  }
}

export interface DatastoreSession {
  /** `current_database()`, `current_user` after connecting. */
  identity(): Promise<{ database: string; user: string }>
  invalidate(input: {
    tenantId: string
    operatorId: string
    expectedRevision: number
    approvalRef: string
    proofDigest: string
    localOperator: string
  }): Promise<{ revision: number }>
  close(): Promise<void>
}

export interface OperatorActionDependencies {
  readonly fs: OperatorActionFileSystem
  readonly euid: number
  readonly now: () => Date
  /** sha256 of the artifact file that is actually executing. */
  readonly installedArtifactSha256: () => string
  /** Parses the private connection file and opens the session (no URL output). */
  readonly connect: (
    connectionText: string,
    expected: DatastoreProfile
  ) => Promise<DatastoreSession>
  readonly policyPath?: string
}

export interface OperatorActionResult {
  readonly outcome: OperatorActionOutcome
  readonly reason?: string
  readonly decisionId?: string
  readonly proofDigest?: string
  readonly revision?: number
}

/**
 * Dry-run is the default and never connects. `--apply` re-checks every binding
 * and the live datastore identity before the single write; an uncertain commit
 * is reported UNKNOWN and is NEVER retried with another revision.
 */
export async function runOperatorAction(
  dependencies: OperatorActionDependencies,
  argv: readonly string[]
): Promise<OperatorActionResult> {
  let args: ParsedArguments
  try {
    args = parseArguments(argv)
    if (dependencies.euid !== 0) refuse('a real launch requires euid 0')
    const policy = loadPolicy(dependencies.fs, dependencies.policyPath)
    const loaded = loadProof(dependencies.fs, policy, args, {
      now: dependencies.now(),
      installedArtifactSha256: dependencies.installedArtifactSha256()
    })
    if (!args.apply) {
      return {
        outcome: 'DRY_RUN',
        decisionId: loaded.proof.decisionId,
        proofDigest: loaded.digest
      }
    }
    const connectionBytes = assertPrivateRootFile(
      dependencies.fs,
      policy.connectionFile,
      'connection file',
      4096
    )
    let session: DatastoreSession | undefined
    try {
      session = await dependencies.connect(
        connectionBytes.toString('utf8').trim(),
        policy.datastoreProfile
      )
      const live = await session.identity()
      if (
        live.database !== policy.datastoreProfile.database ||
        live.user !== policy.datastoreProfile.user
      ) {
        refuse('live datastore identity differs from the policy')
      }
      try {
        const result = await session.invalidate({
          tenantId: args.tenantId,
          operatorId: args.operatorId,
          expectedRevision: args.expectedRevision,
          approvalRef: loaded.proof.decisionRef,
          proofDigest: loaded.digest,
          localOperator: loaded.proof.operator
        })
        return {
          outcome: 'APPLIED',
          decisionId: loaded.proof.decisionId,
          proofDigest: loaded.digest,
          revision: result.revision
        }
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code
        if (code === 'principal_conflict' || code === 'validation_failed') {
          return {
            outcome: 'REFUSED',
            reason: String(code),
            decisionId: loaded.proof.decisionId,
            proofDigest: loaded.digest
          }
        }
        // The commit may or may not have happened: reconcile by revision,
        // audit and proof digest; never increment again with another revision.
        return {
          outcome: 'UNKNOWN',
          reason:
            'commit outcome is uncertain; reconcile by revision and audit',
          decisionId: loaded.proof.decisionId,
          proofDigest: loaded.digest
        }
      }
    } finally {
      await session?.close().catch(() => undefined)
    }
  } catch (error) {
    if (error instanceof OperatorActionRefusal) {
      return { outcome: 'REFUSED', reason: error.reason }
    }
    return { outcome: 'REFUSED', reason: 'unexpected failure before any write' }
  }
}

/**
 * Digest of the installed artifact (SPEC 0262 section 6.1): the entry script,
 * the decision library and the persistence code that performs the write. The
 * label (a repository-relative path) is part of the digest, so renaming or
 * swapping files changes it, and the order of `files` does not.
 */
export function artifactSha256(
  files: readonly { readonly label: string; readonly bytes: Buffer }[]
): string {
  const lines = files
    .map(
      (file) =>
        `${file.label}\0${createHash('sha256').update(file.bytes).digest('hex')}\n`
    )
    .sort()
  if (lines.length === 0) throw new Error('artifact has no files')
  return createHash('sha256').update(lines.join(''), 'utf8').digest('hex')
}
