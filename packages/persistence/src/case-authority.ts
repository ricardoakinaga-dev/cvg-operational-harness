/**
 * SPEC0176 — internal case assignment registry and per-case read authority.
 *
 * Shared contract for the in-memory synthetic implementation (this file) and
 * the PostgreSQL authority (`case-authority-postgres.ts`). The authority owns
 * principals, typed case roots, read_case grants and the lineage links of
 * executions and audit events. It never decides a role permission: the API
 * composition evaluates permissions and calls the snapshot to resolve the
 * object relationship inside one read unit.
 */
import { createHash, randomUUID } from 'node:crypto'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import { ApprovalStatusSchema, TaskStatusSchema } from '@cvg/shared'
import type { InMemoryDatabase } from './db.ts'
import { cloneAttendanceApproval } from './attendance-approval.ts'
import {
  createCaseId,
  memoryCaseKey as key,
  memoryCaseState as stateFor,
  registerMemoryCoreConversationRoot,
  type MemoryAssignment,
  type MemoryCaseState,
  type MemoryRoot
} from './case-authority-memory-state.ts'
import { AuditRepository } from './repositories/audit-repository.ts'
import type {
  ApprovalListQuery,
  ApprovalPage
} from './repositories/approval-repository.ts'
import { ConversationRepository } from './repositories/conversation-repository.ts'
import {
  assertStatusPageQuery,
  pageInfoFor,
  type TaskListQuery,
  type TaskPage
} from './repositories/task-repository.ts'
import type {
  AuditEventRecord,
  ConversationPage,
  MessageRecord,
  PageInfo,
  PaginationInput,
  SessionRecord
} from './schema.ts'
import type { PostgresQueryable } from './postgres.ts'

export const CASE_KINDS = [
  'core_conversation',
  'harness_conversation',
  'independent_execution'
] as const
export type CaseKind = (typeof CASE_KINDS)[number]

export const CASE_PRINCIPAL_ROLES = [
  'Operator',
  'Approver',
  'Supervisor',
  'Admin'
] as const
export type CasePrincipalRole = (typeof CASE_PRINCIPAL_ROLES)[number]

export type CaseIdentitySource = 'verified_adapter' | 'synthetic_fixture'
export type CaseAssignmentStatus = 'ACTIVE' | 'REVOKED'

export interface CasePrincipalRecord {
  readonly tenantId: TenantId
  readonly operatorId: string
  readonly role: CasePrincipalRole
  readonly active: boolean
  readonly revision: number
  readonly identitySource: CaseIdentitySource
  readonly authorityVersion: string
  readonly updatedAt: string
}

export interface CaseRootRecord {
  readonly caseId: string
  readonly kind: CaseKind
  readonly resourceId: string
  readonly createdAt: string
}

export interface CaseAssignmentRecord {
  readonly caseId: string
  readonly kind: CaseKind
  readonly resourceId: string
  readonly operatorId: string
  readonly scope: 'read_case'
  readonly status: CaseAssignmentStatus
  readonly revision: number
  readonly changedBy: string
  readonly changedAt: string
}

export interface CasePage<T> {
  readonly items: T[]
  readonly pageInfo: PageInfo
}

export interface CaseRegistryQuery {
  readonly kind?: CaseKind
  readonly resourceId?: string
  readonly limit: number
  readonly offset: number
}

export interface VerifiedPrincipalStateInput {
  readonly tenantId: TenantId
  readonly operatorId: string
  readonly role: CasePrincipalRole
  readonly active: boolean
  readonly expectedRevision: number
  readonly authorityVersion: string
  /** Opaque proof reference; only its digest is persisted. */
  readonly proofRef: string
  readonly identitySource: CaseIdentitySource
}

/**
 * The only writer of case principals. It is an internal composition port of
 * the verified identity adapter (SPEC0152), never an HTTP endpoint and never
 * reachable from the assignment registry.
 */
export interface PrincipalProvisioningPort {
  applyVerifiedPrincipalState(
    input: VerifiedPrincipalStateInput
  ): Promise<CasePrincipalRecord>
}

export interface CaseActor {
  readonly operatorId: string
  readonly role: CasePrincipalRole
}

export interface CaseAssignmentWriteInput {
  readonly tenantId: TenantId
  readonly caseId: string
  readonly operatorId: string
  readonly status: CaseAssignmentStatus
  readonly expectedRevision: number
  readonly actor: CaseActor
  readonly correlationId: string
  /**
   * Actor currency re-checked inside the write unit. `required` (trusted
   * identity) refuses an actor without a current principal; otherwise only a
   * persisted principal that is inactive or diverges is refused.
   */
  readonly actorPrincipal: {
    readonly required: boolean
    readonly authorityVersion: string | null
  }
}

export interface CaseAssignmentWriteResult {
  readonly assignment: CaseAssignmentRecord
  readonly changed: boolean
}

/** Server-side classification of the public submission's core parents. */
export type CoreParentPlan =
  | {
      readonly kind: 'core'
      readonly conversationId: string
      readonly sessionId: string
    }
  | {
      readonly kind: 'independent'
      /** Declared (absent) parents, re-checked inside the write unit. */
      readonly conversationId: string
      readonly sessionId: string
    }

export type CoreParentClassification =
  | {
      readonly kind: 'core'
      readonly conversationId: string
      readonly sessionId: string
      readonly caseId: string | null
    }
  | { readonly kind: 'independent' }
  | { readonly kind: 'invalid' }

export interface CaseLookup {
  readonly caseId: string | null
}

/** SPEC0251: case of a task or approval request through its core session. */
export type SessionCaseLookup = CaseLookup & { readonly sessionId: string }

export type AuditSessionRef =
  | { readonly kind: 'core'; readonly sessionId: string }
  | {
      readonly kind: 'harness'
      readonly conversationId: string
      readonly sessionId: string
    }

export type CaseListScope =
  | { readonly kind: 'tenant' }
  | { readonly kind: 'assigned'; readonly operatorId: string }

export type CaseAuthorityErrorCode =
  | 'assignment_conflict'
  | 'assignment_target_unavailable'
  | 'principal_conflict'
  | 'principal_not_current'
  | 'case_not_found'
  | 'case_link_conflict'
  | 'case_parent_invalid'
  | 'case_integrity'
  | 'case_authority_unavailable'
  | 'validation_failed'

export class CaseAuthorityError extends Error {
  readonly code: CaseAuthorityErrorCode

  constructor(code: CaseAuthorityErrorCode, message: string) {
    super(message)
    this.name = 'CaseAuthorityError'
    this.code = code
  }
}

/**
 * One authorization + content read unit. PostgreSQL runs it in a single READ
 * ONLY REPEATABLE READ transaction on the primary; memory serializes it with
 * every registry write.
 */
export interface CaseReadSnapshot {
  /** Transaction connection for same-snapshot content reads (PostgreSQL). */
  readonly queryable: PostgresQueryable | null
  /**
   * False only on the legacy single-connection schema (test-only, no 0029
   * tables): grants cannot be evaluated, so scoped readers must refuse.
   */
  scopedAuthorityAvailable(): Promise<boolean>
  principal(operatorId: string): Promise<CasePrincipalRecord | null>
  /**
   * SPEC0254 §4.8 step 6: whether any principal of the snapshot tenant has an
   * authority version that starts with `prefix` and differs from `current`
   * (matrix edited without raising its version). Read-only, no new state.
   */
  hasPrincipalVersionMismatch(prefix: string, current: string): Promise<boolean>
  coreConversationExists(conversationId: string): Promise<boolean>
  coreConversationCase(conversationId: string): Promise<CaseLookup | null>
  coreSessionCase(
    sessionId: string
  ): Promise<(CaseLookup & { readonly conversationId: string }) | null>
  harnessSessionCase(
    conversationId: string,
    sessionId: string
  ): Promise<CaseLookup | null>
  executionCase(executionId: string): Promise<CaseLookup | null>
  /**
   * SPEC0251 §4.1: `null` when the task does not exist in the snapshot
   * tenant (tenant of the session's conversation); otherwise the case of the
   * core root of that conversation, `null` when it has no root.
   */
  taskCase(taskId: string): Promise<SessionCaseLookup | null>
  /** SPEC0251 §4.1: same contract as `taskCase` for approval requests. */
  approvalRequestCase(
    approvalRequestId: string
  ): Promise<SessionCaseLookup | null>
  hasActiveGrant(caseId: string, operatorId: string): Promise<boolean>
  listCoreConversations(
    scope: CaseListScope,
    page: PaginationInput
  ): Promise<ConversationPage>
  /**
   * SPEC0251 §4.1: the SPEC0250 page of tasks (bounds, status filter, order
   * and `pageInfo`) restricted, for the `assigned` scope, to sessions whose
   * core case has an ACTIVE grant of the operator, before COUNT and paging.
   */
  listTasks(scope: CaseListScope, query: TaskListQuery): Promise<TaskPage>
  /** SPEC0251 §4.1: same contract as `listTasks` for approval requests. */
  listApprovalRequests(
    scope: CaseListScope,
    query: ApprovalListQuery
  ): Promise<ApprovalPage>
  coreTimeline(
    conversationId: string
  ): Promise<{ messages: MessageRecord[]; sessions: SessionRecord[] }>
  linkedAuditEvents(ref: AuditSessionRef): Promise<AuditEventRecord[]>
  listRoots(query: CaseRegistryQuery): Promise<CasePage<CaseRootRecord>>
  listAssignments(
    query: CaseRegistryQuery
  ): Promise<CasePage<CaseAssignmentRecord>>
}

/**
 * SPEC 0262 §4/§7 — what the writer of an authorized mutation receives. On
 * PostgreSQL `authorizeOnClient` is the hook the creation transaction runs
 * AFTER its tenant context and BEFORE the operation lock: it locks the actor's
 * principal and assignments (`FOR SHARE`, held until COMMIT) and evaluates the
 * same policy on that client. On memory the whole unit already runs inside the
 * authority queue, so no hook is needed.
 */
export interface AuthorizedMutationUnit {
  readonly authorizeOnClient?: (client: PostgresQueryable) => Promise<void>
}

export interface AuthorizedMutationInput<T> {
  readonly operatorId: string
  /** Policy check evaluated on the snapshot of this unit (throws to deny). */
  readonly authorize: (snapshot: CaseReadSnapshot) => Promise<void>
  /** The write; runs with the authorization retained until it resolves. */
  readonly write: (unit: AuthorizedMutationUnit) => Promise<T>
}

/**
 * SPEC 0262 §6.1 — global invalidation of every session family of one
 * operator by bumping ONLY `case_principals.revision`. It never edits role,
 * active, source or authority version and never writes the Auth pool: a
 * cookie bound to the previous revision is simply not current any more.
 */
export interface InvalidateOperatorSessionsInput {
  readonly tenantId: TenantId
  readonly operatorId: string
  readonly expectedRevision: number
  /** Opaque approval/handoff reference; only its digest is audited. */
  readonly approvalRef: string
  /** sha256 (hex) of the private proof file. */
  readonly proofDigest: string
  /** Bounded identifier of the local administrator who attests. */
  readonly localOperator: string
}

export interface OperatorSessionInvalidationPort {
  invalidateOperatorSessions(
    input: InvalidateOperatorSessionsInput
  ): Promise<CasePrincipalRecord>
}

export function assertInvalidateOperatorSessionsInput(
  input: InvalidateOperatorSessionsInput
): InvalidateOperatorSessionsInput {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  if (
    !isCaseOperatorId(input.operatorId) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1 ||
    typeof input.approvalRef !== 'string' ||
    input.approvalRef.length < 8 ||
    input.approvalRef.length > 512 ||
    !/^[0-9a-f]{64}$/.test(input.proofDigest) ||
    !/^[A-Za-z0-9._:@-]{3,80}$/.test(input.localOperator)
  ) {
    throw new CaseAuthorityError(
      'validation_failed',
      'Operator session invalidation is invalid'
    )
  }
  return { ...input, tenantId }
}

export function operatorSessionInvalidationAuditPayload(
  input: InvalidateOperatorSessionsInput & { revision: number }
): Record<string, unknown> {
  return {
    tenantId: input.tenantId,
    event: 'operator_sessions_invalidated',
    subjectOperatorId: input.operatorId,
    previousRevision: input.expectedRevision,
    revision: input.revision,
    approvalRefDigest: caseProofDigest(input.approvalRef),
    proofDigest: input.proofDigest,
    localOperator: input.localOperator
  }
}

export interface CaseAuthorityPort
  extends PrincipalProvisioningPort, OperatorSessionInvalidationPort {
  readonly kind: 'memory' | 'postgres'
  readSnapshot<T>(
    tenantId: TenantId,
    operation: (snapshot: CaseReadSnapshot) => Promise<T>
  ): Promise<T>
  /**
   * SPEC 0262: the authorization decision and the write share one unit of
   * failure and one commit order. A revocation that wins the order denies the
   * write; a write that commits first completes before the revocation applies.
   */
  runAuthorizedMutation<T>(
    tenantId: TenantId,
    input: AuthorizedMutationInput<T>
  ): Promise<T>
  putAssignment(
    input: CaseAssignmentWriteInput
  ): Promise<CaseAssignmentWriteResult>
  classifyCoreParents(
    tenantId: TenantId,
    conversationId: string,
    sessionId: string
  ): Promise<CoreParentClassification>
  /**
   * Persists the execution lineage. `created=false` (idempotent duplicate)
   * only verifies that an existing link matches; it never invents one.
   */
  registerExecutionLink(
    tenantId: TenantId,
    executionId: string,
    plan: CoreParentPlan,
    created: boolean
  ): Promise<void>
  /**
   * Appends an audit event produced on a persisted session and links it to
   * that session's case in the same unit. The payload is never the source of
   * the link.
   */
  appendLinkedAudit(
    tenantId: TenantId,
    /** A `tenantId` on the input is ignored; the explicit scope wins. */
    input: Omit<AuditEventRecord, 'id' | 'createdAt'>,
    ref: { readonly kind: 'core'; readonly sessionId: string }
  ): Promise<AuditEventRecord>
  /** Idempotent lineage backfill of core conversation roots (batch <= 100). */
  backfillCoreRoots(
    tenantId: TenantId,
    input: {
      readonly afterConversationId: string | null
      readonly limit: number
    }
  ): Promise<{ created: number; lastConversationId: string | null }>
}

const CASE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const OPERATOR_ID = /^[A-Za-z0-9._:-]{3,80}$/
const RESOURCE_ID = /^[A-Za-z0-9._:-]{1,200}$/
const AUTHORITY_VERSION = /^[A-Za-z0-9._:-]{1,120}$/

export function isCaseId(value: unknown): value is string {
  return typeof value === 'string' && CASE_ID.test(value)
}

export function isCaseOperatorId(value: unknown): value is string {
  return typeof value === 'string' && OPERATOR_ID.test(value)
}

export function isCaseResourceId(value: unknown): value is string {
  return typeof value === 'string' && RESOURCE_ID.test(value)
}

export function caseProofDigest(proofRef: string): string {
  return createHash('sha256').update(proofRef, 'utf8').digest('hex')
}

export function assertVerifiedPrincipalInput(
  input: VerifiedPrincipalStateInput
): VerifiedPrincipalStateInput {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  if (
    !isCaseOperatorId(input.operatorId) ||
    !CASE_PRINCIPAL_ROLES.includes(input.role) ||
    typeof input.active !== 'boolean' ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    typeof input.authorityVersion !== 'string' ||
    !AUTHORITY_VERSION.test(input.authorityVersion) ||
    typeof input.proofRef !== 'string' ||
    input.proofRef.length < 8 ||
    input.proofRef.length > 512 ||
    (input.identitySource !== 'verified_adapter' &&
      input.identitySource !== 'synthetic_fixture')
  ) {
    throw new CaseAuthorityError(
      'validation_failed',
      'Verified principal state is invalid'
    )
  }
  return { ...input, tenantId }
}

export function assertAssignmentWriteInput(
  input: CaseAssignmentWriteInput
): CaseAssignmentWriteInput {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  if (
    !isCaseId(input.caseId) ||
    !isCaseOperatorId(input.operatorId) ||
    (input.status !== 'ACTIVE' && input.status !== 'REVOKED') ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    !isCaseOperatorId(input.actor.operatorId) ||
    (input.actor.role !== 'Supervisor' && input.actor.role !== 'Admin') ||
    typeof input.actorPrincipal?.required !== 'boolean'
  ) {
    throw new CaseAuthorityError(
      'validation_failed',
      'Case assignment write is invalid'
    )
  }
  return { ...input, tenantId }
}

export function assertRegistryQuery(
  query: CaseRegistryQuery
): CaseRegistryQuery {
  if (
    !Number.isSafeInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > 100 ||
    !Number.isSafeInteger(query.offset) ||
    query.offset < 0 ||
    (query.kind !== undefined && !CASE_KINDS.includes(query.kind)) ||
    (query.resourceId !== undefined &&
      (query.kind === undefined || !isCaseResourceId(query.resourceId)))
  ) {
    throw new CaseAuthorityError(
      'validation_failed',
      'Case registry query is invalid'
    )
  }
  return query
}

export function caseAssignmentAuditPayload(input: {
  tenantId: TenantId
  root: CaseRootRecord
  operatorId: string
  previousRevision: number
  revision: number
  previousStatus: CaseAssignmentStatus | null
  status: CaseAssignmentStatus
}): Record<string, unknown> {
  return {
    tenantId: input.tenantId,
    event: 'case_assignment_changed',
    caseId: input.root.caseId,
    caseKind: input.root.kind,
    subjectOperatorId: input.operatorId,
    previousRevision: input.previousRevision,
    revision: input.revision,
    previousStatus: input.previousStatus,
    status: input.status
  }
}

export function casePrincipalAuditPayload(input: {
  tenantId: TenantId
  operatorId: string
  previousRevision: number
  revision: number
  role: CasePrincipalRole
  active: boolean
  identitySource: CaseIdentitySource
  authorityVersion: string
}): Record<string, unknown> {
  return {
    tenantId: input.tenantId,
    event: 'case_principal_changed',
    subjectOperatorId: input.operatorId,
    previousRevision: input.previousRevision,
    revision: input.revision,
    role: input.role,
    active: input.active,
    identitySource: input.identitySource,
    authorityVersion: input.authorityVersion
  }
}

export {
  createCaseId,
  registerMemoryCoreConversationRoot,
  snapshotMemoryCaseRoots
} from './case-authority-memory-state.ts'

/** Shared actor-currency rule for assignment writes (memory and PG). */
export function assertActorPrincipalCurrent(
  principal: Pick<
    CasePrincipalRecord,
    'role' | 'active' | 'authorityVersion'
  > | null,
  input: CaseAssignmentWriteInput
): void {
  const current = principal
    ? principal.active &&
      principal.role === input.actor.role &&
      (!input.actorPrincipal.required ||
        principal.authorityVersion === input.actorPrincipal.authorityVersion)
    : !input.actorPrincipal.required
  if (!current) {
    throw new CaseAuthorityError(
      'principal_not_current',
      'Operator principal is not current'
    )
  }
}

export const CASE_AUTHORITY_POLICY_VERSION = 'case-authority-v1'

function page<T>(all: T[], query: { limit: number; offset: number }) {
  const items = all.slice(query.offset, query.offset + query.limit)
  return {
    items,
    pageInfo: {
      limit: query.limit,
      offset: query.offset,
      total: all.length,
      hasNextPage: query.offset + items.length < all.length
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory synthetic authority
// ---------------------------------------------------------------------------

function toRootRecord(root: MemoryRoot): CaseRootRecord {
  return {
    caseId: root.caseId,
    kind: root.kind,
    resourceId: root.resourceId,
    createdAt: root.createdAt.toISOString()
  }
}

class SerialQueue {
  private tail: Promise<void> = Promise.resolve()

  run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation, operation)
    this.tail = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }
}

export interface InMemoryCaseAuthorityOptions {
  readonly clock?: () => Date
}

/**
 * Synthetic in-memory authority for controlled fixtures. Every read unit and
 * registry write is serialized, giving the same observable ordering as the
 * PostgreSQL snapshot: a revocation that completed before a read unit started
 * is always visible to it.
 */
export class InMemoryCaseAuthority implements CaseAuthorityPort {
  readonly kind = 'memory' as const
  private readonly queue = new SerialQueue()
  private readonly clock: () => Date

  constructor(
    private readonly db: InMemoryDatabase,
    options: InMemoryCaseAuthorityOptions = {}
  ) {
    this.clock = options.clock ?? (() => new Date())
  }

  private get state(): MemoryCaseState {
    return stateFor(this.db)
  }

  applyVerifiedPrincipalState(
    rawInput: VerifiedPrincipalStateInput
  ): Promise<CasePrincipalRecord> {
    return this.queue.run(async () => {
      const input = assertVerifiedPrincipalInput(rawInput)
      const principalKey = key(input.tenantId, input.operatorId)
      const current = this.state.principals.get(principalKey)
      const currentRevision = current?.revision ?? 0
      if (currentRevision !== input.expectedRevision) {
        throw new CaseAuthorityError(
          'principal_conflict',
          'Principal revision is stale'
        )
      }
      const next: CasePrincipalRecord = {
        tenantId: input.tenantId,
        operatorId: input.operatorId,
        role: input.role,
        active: input.active,
        revision: currentRevision + 1,
        identitySource: input.identitySource,
        authorityVersion: input.authorityVersion,
        updatedAt: this.clock().toISOString()
      }
      new AuditRepository(this.db).append(
        {
          type: 'policy_decision',
          actorType: 'System',
          actorId: 'case-principal-provisioning',
          correlationId: `corr_${randomUUID()}`,
          policyVersion: CASE_AUTHORITY_POLICY_VERSION,
          payload: casePrincipalAuditPayload({
            tenantId: input.tenantId,
            operatorId: input.operatorId,
            previousRevision: currentRevision,
            revision: next.revision,
            role: next.role,
            active: next.active,
            identitySource: next.identitySource,
            authorityVersion: next.authorityVersion
          })
        },
        input.tenantId
      )
      this.state.principals.set(principalKey, next)
      return { ...next }
    })
  }

  invalidateOperatorSessions(
    rawInput: InvalidateOperatorSessionsInput
  ): Promise<CasePrincipalRecord> {
    return this.queue.run(async () => {
      const input = assertInvalidateOperatorSessionsInput(rawInput)
      const principalKey = key(input.tenantId, input.operatorId)
      const current = this.state.principals.get(principalKey)
      if (!current || current.revision !== input.expectedRevision) {
        throw new CaseAuthorityError(
          'principal_conflict',
          'Principal revision is stale or the principal is absent'
        )
      }
      // Only the revision moves: identity attributes are left untouched.
      const next: CasePrincipalRecord = {
        ...current,
        revision: current.revision + 1,
        updatedAt: this.clock().toISOString()
      }
      new AuditRepository(this.db).append(
        {
          type: 'policy_decision',
          actorType: 'System',
          actorId: 'operator-session-invalidation',
          correlationId: `corr_${randomUUID()}`,
          policyVersion: CASE_AUTHORITY_POLICY_VERSION,
          payload: operatorSessionInvalidationAuditPayload({
            ...input,
            revision: next.revision
          })
        },
        input.tenantId
      )
      this.state.principals.set(principalKey, next)
      return { ...next }
    })
  }

  readSnapshot<T>(
    rawTenantId: TenantId,
    operation: (snapshot: CaseReadSnapshot) => Promise<T>
  ): Promise<T> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return this.queue.run(() => operation(this.snapshot(tenantId)))
  }

  /**
   * SPEC 0262 §7: the decision and the writer run inside the SAME queue as
   * `readSnapshot`, `putAssignment` and `applyVerifiedPrincipalState`, so a
   * revocation waits for the write to resolve and never interleaves with it.
   * The callback must not call back into this authority (the queue is not
   * reentrant): it receives a snapshot, not the authority.
   */
  runAuthorizedMutation<T>(
    rawTenantId: TenantId,
    input: AuthorizedMutationInput<T>
  ): Promise<T> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return this.queue.run(async () => {
      await input.authorize(this.snapshot(tenantId))
      return input.write({})
    })
  }

  private conversation(tenantId: TenantId, conversationId: string) {
    return this.db.state.conversations.find(
      (item) => item.id === conversationId && item.tenantId === tenantId
    )
  }

  private session(tenantId: TenantId, sessionId: string) {
    const session = this.db.state.sessions.find((item) => item.id === sessionId)
    if (!session) return undefined
    return this.conversation(tenantId, session.conversationId)
      ? session
      : undefined
  }

  private coreRoot(tenantId: TenantId, conversationId: string) {
    return this.state.roots.find(
      (root) =>
        root.tenantId === tenantId &&
        root.kind === 'core_conversation' &&
        root.resourceId === conversationId
    )
  }

  private rootById(tenantId: TenantId, caseId: string) {
    return this.state.roots.find(
      (root) => root.tenantId === tenantId && root.caseId === caseId
    )
  }

  private activeGrant(tenantId: TenantId, caseId: string, operatorId: string) {
    return (
      this.state.assignments.get(key(tenantId, caseId, operatorId))?.status ===
      'ACTIVE'
    )
  }

  /** Case of a persisted core session of the tenant; root absent → null. */
  private sessionCase(
    tenantId: TenantId,
    sessionId: string
  ): SessionCaseLookup | null {
    const session = this.session(tenantId, sessionId)
    if (!session) return null
    return {
      caseId: this.coreRoot(tenantId, session.conversationId)?.caseId ?? null,
      sessionId: session.id
    }
  }

  /** SPEC0251 list visibility: tenant of the session, then the grant. */
  private sessionVisible(
    tenantId: TenantId,
    scope: CaseListScope,
    sessionId: string
  ): boolean {
    const session = this.session(tenantId, sessionId)
    if (!session) return false
    if (scope.kind === 'tenant') return true
    const root = this.coreRoot(tenantId, session.conversationId)
    return (
      root !== undefined &&
      this.activeGrant(tenantId, root.caseId, scope.operatorId)
    )
  }

  private filteredRoots(tenantId: TenantId, query: CaseRegistryQuery) {
    return this.state.roots
      .filter(
        (root) =>
          root.tenantId === tenantId &&
          (query.kind === undefined || root.kind === query.kind) &&
          (query.resourceId === undefined ||
            root.resourceId === query.resourceId)
      )
      .map((root, index) => ({ root, index }))
      .sort((left, right) => {
        const delta =
          right.root.createdAt.getTime() - left.root.createdAt.getTime()
        return delta !== 0 ? delta : right.index - left.index
      })
      .map(({ root }) => root)
  }

  private snapshot(tenantId: TenantId): CaseReadSnapshot {
    const conversations = new ConversationRepository(this.db)
    return {
      queryable: null,
      scopedAuthorityAvailable: async () => true,
      principal: async (operatorId) => {
        const principal = this.state.principals.get(key(tenantId, operatorId))
        return principal ? { ...principal } : null
      },
      hasPrincipalVersionMismatch: async (prefix, current) =>
        [...this.state.principals.values()].some(
          (principal) =>
            principal.tenantId === tenantId &&
            principal.authorityVersion.startsWith(prefix) &&
            principal.authorityVersion !== current
        ),
      coreConversationExists: async (conversationId) =>
        this.conversation(tenantId, conversationId) !== undefined,
      coreConversationCase: async (conversationId) => {
        if (!this.conversation(tenantId, conversationId)) return null
        return {
          caseId: this.coreRoot(tenantId, conversationId)?.caseId ?? null
        }
      },
      coreSessionCase: async (sessionId) => {
        const session = this.session(tenantId, sessionId)
        if (!session) return null
        return {
          conversationId: session.conversationId,
          caseId:
            this.coreRoot(tenantId, session.conversationId)?.caseId ?? null
        }
      },
      // The harness conversation family is not part of the synthetic memory
      // database; the namespace is fixed by the route and has no rows here.
      harnessSessionCase: async () => null,
      executionCase: async (executionId) => {
        const link = this.state.executionLinks.get(key(tenantId, executionId))
        return link ? { caseId: link.caseId } : null
      },
      taskCase: async (taskId) => {
        const task = this.db.state.tasks.find((item) => item.id === taskId)
        return task ? this.sessionCase(tenantId, task.sessionId) : null
      },
      approvalRequestCase: async (approvalRequestId) => {
        const approval = this.db.state.approvals.find(
          (item) => item.id === approvalRequestId
        )
        return approval ? this.sessionCase(tenantId, approval.sessionId) : null
      },
      hasActiveGrant: async (caseId, operatorId) =>
        this.activeGrant(tenantId, caseId, operatorId),
      listCoreConversations: async (scope, pagination) =>
        conversations.listPageWhere(tenantId, pagination, (conversation) => {
          if (scope.kind === 'tenant') return true
          const root = this.coreRoot(tenantId, conversation.id)
          return (
            root !== undefined &&
            this.activeGrant(tenantId, root.caseId, scope.operatorId)
          )
        }),
      listTasks: async (scope, query) => {
        const { limit, offset, statuses } = assertStatusPageQuery(
          query,
          TaskStatusSchema.options
        )
        const matching = this.db.state.tasks.filter(
          (task) =>
            this.sessionVisible(tenantId, scope, task.sessionId) &&
            (!statuses || statuses.includes(task.status))
        )
        const items = matching.slice(offset, offset + limit)
        return {
          items,
          pageInfo: pageInfoFor(
            { limit, offset },
            items.length,
            matching.length
          )
        }
      },
      listApprovalRequests: async (scope, query) => {
        const { limit, offset, statuses } = assertStatusPageQuery(
          query,
          ApprovalStatusSchema.options
        )
        const matching = this.db.state.approvals.filter(
          (approval) =>
            this.sessionVisible(tenantId, scope, approval.sessionId) &&
            (!statuses || statuses.includes(approval.status))
        )
        const items = matching
          .slice(offset, offset + limit)
          .map(cloneAttendanceApproval)
        return {
          items,
          pageInfo: pageInfoFor(
            { limit, offset },
            items.length,
            matching.length
          )
        }
      },
      coreTimeline: async (conversationId) =>
        conversations.timeline(tenantId, conversationId),
      linkedAuditEvents: async (ref) => {
        if (ref.kind !== 'core') return []
        const linked = new Set(
          [...this.state.auditLinks.values()]
            .filter(
              (link) =>
                link.tenantId === tenantId &&
                link.coreSessionId === ref.sessionId
            )
            .map((link) => link.auditEventId)
        )
        return this.db.state.auditEvents.filter(
          (event) => event.tenantId === tenantId && linked.has(event.id)
        )
      },
      listRoots: async (rawQuery) => {
        const query = assertRegistryQuery(rawQuery)
        return page(
          this.filteredRoots(tenantId, query).map(toRootRecord),
          query
        )
      },
      listAssignments: async (rawQuery) => {
        const query = assertRegistryQuery(rawQuery)
        const roots = new Map(
          this.filteredRoots(tenantId, query).map((root) => [root.caseId, root])
        )
        const items = [...this.state.assignments.values()]
          .filter(
            (assignment) =>
              assignment.tenantId === tenantId && roots.has(assignment.caseId)
          )
          .sort((left, right) => {
            const delta = right.changedAt.getTime() - left.changedAt.getTime()
            if (delta !== 0) return delta
            return left.caseId === right.caseId
              ? left.operatorId.localeCompare(right.operatorId)
              : left.caseId.localeCompare(right.caseId)
          })
          .map((assignment) => {
            const root = roots.get(assignment.caseId)!
            return {
              caseId: assignment.caseId,
              kind: root.kind,
              resourceId: root.resourceId,
              operatorId: assignment.operatorId,
              scope: 'read_case' as const,
              status: assignment.status,
              revision: assignment.revision,
              changedBy: assignment.changedBy,
              changedAt: assignment.changedAt.toISOString()
            }
          })
        return page(items, query)
      }
    }
  }

  putAssignment(
    rawInput: CaseAssignmentWriteInput
  ): Promise<CaseAssignmentWriteResult> {
    return this.queue.run(async () => {
      const input = assertAssignmentWriteInput(rawInput)
      assertActorPrincipalCurrent(
        this.state.principals.get(
          key(input.tenantId, input.actor.operatorId)
        ) ?? null,
        input
      )
      const root = this.rootById(input.tenantId, input.caseId)
      if (!root) {
        throw new CaseAuthorityError('case_not_found', 'Resource not found')
      }
      const assignmentKey = key(input.tenantId, input.caseId, input.operatorId)
      const current = this.state.assignments.get(assignmentKey)
      const target = this.state.principals.get(
        key(input.tenantId, input.operatorId)
      )
      const currentRevision = current?.revision ?? 0
      if (!current && input.status === 'REVOKED') {
        throw new CaseAuthorityError(
          'assignment_conflict',
          'Assignment revision is stale'
        )
      }
      if (currentRevision !== input.expectedRevision) {
        throw new CaseAuthorityError(
          'assignment_conflict',
          'Assignment revision is stale'
        )
      }
      if (current && current.status === input.status) {
        return {
          assignment: this.toAssignment(root, current),
          changed: false
        }
      }
      if (
        input.status === 'ACTIVE' &&
        (!target ||
          !target.active ||
          (target.role !== 'Operator' && target.role !== 'Approver'))
      ) {
        throw new CaseAuthorityError(
          'assignment_target_unavailable',
          'Assignment target is unavailable'
        )
      }
      const next: MemoryAssignment = {
        tenantId: input.tenantId,
        caseId: input.caseId,
        operatorId: input.operatorId,
        status: input.status,
        revision: currentRevision + 1,
        changedBy: input.actor.operatorId,
        changedAt: this.clock()
      }
      new AuditRepository(this.db).append(
        {
          type: 'policy_decision',
          actorType: input.actor.role,
          actorId: input.actor.operatorId,
          correlationId: input.correlationId,
          policyVersion: CASE_AUTHORITY_POLICY_VERSION,
          payload: caseAssignmentAuditPayload({
            tenantId: input.tenantId,
            root: toRootRecord(root),
            operatorId: input.operatorId,
            previousRevision: currentRevision,
            revision: next.revision,
            previousStatus: current?.status ?? null,
            status: next.status
          })
        },
        input.tenantId
      )
      this.state.assignments.set(assignmentKey, next)
      return { assignment: this.toAssignment(root, next), changed: true }
    })
  }

  private toAssignment(
    root: MemoryRoot,
    assignment: MemoryAssignment
  ): CaseAssignmentRecord {
    return {
      caseId: root.caseId,
      kind: root.kind,
      resourceId: root.resourceId,
      operatorId: assignment.operatorId,
      scope: 'read_case',
      status: assignment.status,
      revision: assignment.revision,
      changedBy: assignment.changedBy,
      changedAt: assignment.changedAt.toISOString()
    }
  }

  classifyCoreParents(
    rawTenantId: TenantId,
    conversationId: string,
    sessionId: string
  ): Promise<CoreParentClassification> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return this.queue.run(async () =>
      this.classify(tenantId, conversationId, sessionId)
    )
  }

  private classify(
    tenantId: TenantId,
    conversationId: string,
    sessionId: string
  ): CoreParentClassification {
    const conversation = this.conversation(tenantId, conversationId)
    const session = this.session(tenantId, sessionId)
    if (!conversation && !session) return { kind: 'independent' }
    if (
      !conversation ||
      !session ||
      session.conversationId !== conversation.id
    ) {
      return { kind: 'invalid' }
    }
    return {
      kind: 'core',
      conversationId,
      sessionId,
      caseId: this.coreRoot(tenantId, conversationId)?.caseId ?? null
    }
  }

  registerExecutionLink(
    rawTenantId: TenantId,
    executionId: string,
    plan: CoreParentPlan,
    created: boolean
  ): Promise<void> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return this.queue.run(async () => {
      const linkKey = key(tenantId, executionId)
      const existing = this.state.executionLinks.get(linkKey)
      if (existing) {
        const root = this.rootById(tenantId, existing.caseId)
        const same =
          plan.kind === 'independent'
            ? existing.coreSessionId === null &&
              root?.kind === 'independent_execution'
            : existing.coreSessionId === plan.sessionId &&
              root?.kind === 'core_conversation' &&
              root.resourceId === plan.conversationId
        if (!same) {
          throw new CaseAuthorityError(
            'case_link_conflict',
            'Execution case link cannot change'
          )
        }
        return
      }
      if (!created) return
      const now = this.clock()
      if (plan.kind === 'independent') {
        if (
          this.classify(tenantId, plan.conversationId, plan.sessionId).kind !==
          'independent'
        ) {
          throw new CaseAuthorityError(
            'case_parent_invalid',
            'Execution parent pair is invalid'
          )
        }
        const root: MemoryRoot = {
          tenantId,
          caseId: createCaseId(),
          kind: 'independent_execution',
          resourceId: executionId,
          createdAt: now
        }
        this.state.roots = [...this.state.roots, root]
        this.state.executionLinks.set(linkKey, {
          tenantId,
          executionId,
          caseId: root.caseId,
          coreSessionId: null
        })
        return
      }
      const classified = this.classify(
        tenantId,
        plan.conversationId,
        plan.sessionId
      )
      if (classified.kind !== 'core') {
        throw new CaseAuthorityError(
          'case_parent_invalid',
          'Execution parent pair is invalid'
        )
      }
      const caseId = registerMemoryCoreConversationRoot(
        this.db,
        tenantId,
        plan.conversationId,
        now
      )
      this.state.executionLinks.set(linkKey, {
        tenantId,
        executionId,
        caseId,
        coreSessionId: plan.sessionId
      })
    })
  }

  appendLinkedAudit(
    rawTenantId: TenantId,
    input: Omit<AuditEventRecord, 'id' | 'createdAt'>,
    ref: { readonly kind: 'core'; readonly sessionId: string }
  ): Promise<AuditEventRecord> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return this.queue.run(async () => {
      const session = this.session(tenantId, ref.sessionId)
      if (!session) {
        throw new CaseAuthorityError(
          'case_parent_invalid',
          'Audit session lineage is invalid'
        )
      }
      const caseId = registerMemoryCoreConversationRoot(
        this.db,
        tenantId,
        session.conversationId,
        this.clock()
      )
      const event = new AuditRepository(this.db).append(input, tenantId)
      this.state.auditLinks.set(key(tenantId, event.id), {
        tenantId,
        auditEventId: event.id,
        caseId,
        coreSessionId: session.id
      })
      return event
    })
  }

  backfillCoreRoots(
    rawTenantId: TenantId,
    input: {
      readonly afterConversationId: string | null
      readonly limit: number
    }
  ): Promise<{ created: number; lastConversationId: string | null }> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    if (
      !Number.isSafeInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    ) {
      return Promise.reject(
        new CaseAuthorityError('validation_failed', 'Backfill batch is invalid')
      )
    }
    return this.queue.run(async () => {
      const batch = this.db.state.conversations
        .filter(
          (conversation) =>
            conversation.tenantId === tenantId &&
            (input.afterConversationId === null ||
              conversation.id > input.afterConversationId)
        )
        .sort((left, right) => left.id.localeCompare(right.id))
        .slice(0, input.limit)
      let created = 0
      for (const conversation of batch) {
        if (!this.coreRoot(tenantId, conversation.id)) {
          registerMemoryCoreConversationRoot(
            this.db,
            tenantId,
            conversation.id,
            conversation.createdAt
          )
          created += 1
        }
      }
      return {
        created,
        lastConversationId: batch.at(-1)?.id ?? null
      }
    })
  }
}
