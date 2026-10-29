/**
 * SPEC0176 — PostgreSQL case authority (migration 0029).
 *
 * Reads run as one READ ONLY REPEATABLE READ transaction on the primary with
 * the tenant setting local to that transaction, so principal, grant, lineage
 * and content come from a single snapshot. Registry writes are short tenant
 * transactions whose audit event commits or rolls back with the state.
 */
import { randomUUID } from 'node:crypto'
import {
  ApprovalStatusSchema,
  DomainError,
  TaskStatusSchema,
  redactSensitiveText,
  sanitizeAuditEvidencePayload,
  type TaskPriority
} from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import {
  CASE_AUTHORITY_POLICY_VERSION,
  CaseAuthorityError,
  type AuthorizedMutationInput,
  assertActorPrincipalCurrent,
  assertAssignmentWriteInput,
  assertRegistryQuery,
  assertVerifiedPrincipalInput,
  caseAssignmentAuditPayload,
  casePrincipalAuditPayload,
  caseProofDigest,
  type AuditSessionRef,
  type CaseAssignmentRecord,
  type CaseAssignmentStatus,
  type CaseAssignmentWriteInput,
  type CaseAssignmentWriteResult,
  type CaseAuthorityPort,
  type CaseKind,
  type CaseListScope,
  type CasePage,
  type CasePrincipalRecord,
  type CaseReadSnapshot,
  type CaseRegistryQuery,
  type CaseRootRecord,
  type CoreParentClassification,
  type CoreParentPlan,
  type SessionCaseLookup,
  type VerifiedPrincipalStateInput
} from './case-authority.ts'
import type {
  ApprovalListQuery,
  ApprovalPage
} from './repositories/approval-repository.ts'
import {
  assertStatusPageQuery,
  pageInfoFor,
  type TaskListQuery,
  type TaskPage
} from './repositories/task-repository.ts'
import {
  PostgresRuntimeRepository,
  type PostgresQueryable
} from './postgres.ts'
import type {
  ApprovalRequestRecord,
  AuditEventRecord,
  ConversationListItem,
  ConversationPage,
  PaginationInput,
  TaskRecord
} from './schema.ts'
import {
  CVG_TENANT_CONTEXT_SETTING,
  withTenantTransaction,
  type PostgresPoolClient,
  type PostgresPoolLike
} from './tenant-scoped-postgres.ts'

export type CaseAuthorityPostgresConnection =
  | PostgresQueryable
  | PostgresPoolLike

export interface PostgresCaseAuthorityOptions {
  readonly clock?: () => Date
  /**
   * Explicit connection mode from the composition. `pool` borrows a tenant
   * connection per unit; `client` is the legacy single connection. Omitted:
   * detected (a pg Pool, or a connect-only pool double, is a pool).
   */
  readonly mode?: 'pool' | 'client'
}

interface PrincipalRow {
  tenant_id: string
  operator_id: string
  role: CasePrincipalRecord['role']
  active: boolean
  revision: string | number
  identity_source: CasePrincipalRecord['identitySource']
  authority_version: string
  updated_at: Date | string
}

interface RootRow {
  case_id: string
  kind: CaseKind
  resource_id: string
  created_at: Date | string
}

interface AssignmentRow extends RootRow {
  operator_id: string
  status: CaseAssignmentStatus
  revision: string | number
  changed_by: string
  changed_at: Date | string
}

interface AuditRow {
  id: string
  tenant_id: string | null
  type: AuditEventRecord['type']
  actor_type: AuditEventRecord['actorType']
  actor_id: string
  correlation_id: string
  policy_version: string
  payload: unknown
  created_at: Date
}

/**
 * SPEC0251 §4.1 — case of a task or approval request. The tenant is the one
 * of the session's conversation (`conversations.tenant_id`), so the same
 * statement serves the legacy schema, whose tasks and sessions have no
 * tenant column; RLS is never the only filter.
 */
const RESOURCE_CASE_SQL = {
  tasks: `SELECT t.session_id, r.case_id
            FROM tasks t
            JOIN sessions s ON s.id = t.session_id
            JOIN conversations c ON c.id = s.conversation_id
            LEFT JOIN case_roots r
              ON r.tenant_id = c.tenant_id AND r.core_conversation_id = c.id
           WHERE c.tenant_id = $1 AND t.id = $2`,
  approval_requests: `SELECT t.session_id, r.case_id
            FROM approval_requests t
            JOIN sessions s ON s.id = t.session_id
            JOIN conversations c ON c.id = s.conversation_id
            LEFT JOIN case_roots r
              ON r.tenant_id = c.tenant_id AND r.core_conversation_id = c.id
           WHERE c.tenant_id = $1 AND t.id = $2`
} as const

/** Legacy schema without 0029: existence in the tenant only, no case. */
const LEGACY_RESOURCE_CASE_SQL = {
  tasks: `SELECT t.session_id, NULL::text AS case_id
            FROM tasks t
            JOIN sessions s ON s.id = t.session_id
            JOIN conversations c ON c.id = s.conversation_id
           WHERE c.tenant_id = $1 AND t.id = $2`,
  approval_requests: `SELECT t.session_id, NULL::text AS case_id
            FROM approval_requests t
            JOIN sessions s ON s.id = t.session_id
            JOIN conversations c ON c.id = s.conversation_id
           WHERE c.tenant_id = $1 AND t.id = $2`
} as const

/**
 * SPEC0251 §4.1 — visibility of a task/approval row for the `assigned`
 * scope: the predicate of `listConversations`, bound through the row's
 * session conversation.
 */
function assignedSessionVisibility(operatorPlaceholder: string): string {
  return `EXISTS (
    SELECT 1 FROM case_roots r
      JOIN case_assignments a
        ON a.tenant_id = r.tenant_id AND a.case_id = r.case_id
     WHERE r.tenant_id = conversations.tenant_id
       AND r.core_conversation_id = sessions.conversation_id
       AND a.operator_id = ${operatorPlaceholder} AND a.status = 'ACTIVE')`
}

interface TaskRow {
  total: number
  id: string | null
  session_id: string
  title: string
  description: string
  priority: TaskPriority
  source: string
  status: TaskRecord['status']
  idempotency_key: string
  created_at: Date
}

interface ApprovalRow {
  total: number
  id: string | null
  session_id: string
  proposed_action: string
  summary: string
  risk_level: ApprovalRequestRecord['riskLevel']
  status: ApprovalRequestRecord['status']
  decided_by: string | null
  decided_at: Date | null
  created_at: Date
}

/** Same DTO as `PostgresRuntimeRepository.mapTask` (SPEC0251 I6). */
function mapTaskRow(row: TaskRow & { id: string }): TaskRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    source: row.source,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at
  }
}

/** Same DTO as `PostgresRuntimeRepository.mapApproval` (SPEC0251 I6). */
function mapApprovalRow(
  row: ApprovalRow & { id: string }
): ApprovalRequestRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    proposedAction: row.proposed_action,
    summary: row.summary,
    riskLevel: row.risk_level,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at
  }
}

/**
 * SPEC0251 §4.1 — WHERE of the task/approval page: tenant of the session's
 * conversation, optional status filter and, for the `assigned` scope, the
 * grant predicate. Values start at $3 ($1/$2 are LIMIT/OFFSET).
 */
function statusPageWhere(
  table: 'tasks' | 'approval_requests',
  tenantId: TenantId,
  scope: CaseListScope,
  statuses: readonly string[] | undefined
): { where: string; values: unknown[] } {
  const values: unknown[] = [tenantId]
  const conditions = [`conversations.tenant_id = $3`]
  if (statuses) {
    values.push([...statuses])
    conditions.push(`${table}.status = ANY($${values.length + 2}::text[])`)
  }
  if (scope.kind === 'assigned') {
    values.push(scope.operatorId)
    conditions.push(assignedSessionVisibility(`$${values.length + 2}`))
  }
  return { where: `WHERE ${conditions.join(' AND ')}`, values }
}

const ROOT_COLUMNS = `r.case_id, r.kind,
  COALESCE(r.core_conversation_id, r.harness_conversation_id, r.execution_id) AS resource_id,
  r.created_at`

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

function isPool(
  connection: CaseAuthorityPostgresConnection
): connection is PostgresPoolLike {
  if (typeof (connection as PostgresPoolLike).connect !== 'function') {
    return false
  }
  // A pg Client (standalone or checked out) also exposes connect(); only a
  // pool, or a connect-only pool double, hands out tenant connections.
  return (
    typeof (connection as PostgresQueryable).query !== 'function' ||
    'totalCount' in connection
  )
}

/**
 * SPEC0176 §8 unit budget: statement 5s and lock 1s, unless the session or
 * role already configured a smaller deadline (which prevails).
 */
async function applyUnitDeadlines(client: PostgresQueryable): Promise<void> {
  await client.query(
    `SELECT set_config(name, $2, true)
       FROM pg_settings
      WHERE name = $1 AND (setting::bigint = 0 OR setting::bigint > $3)`,
    ['statement_timeout', '5s', 5_000]
  )
  await client.query(
    `SELECT set_config(name, $2, true)
       FROM pg_settings
      WHERE name = $1 AND (setting::bigint = 0 OR setting::bigint > $3)`,
    ['lock_timeout', '1s', 1_000]
  )
}

/**
 * Query-only view of the snapshot connection. Stores receiving it run their
 * reads on this transaction instead of borrowing another connection.
 */
function queryOnly(client: PostgresQueryable): PostgresQueryable {
  return { query: (text, values) => client.query(text, values) }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function sqlState(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined
}

/**
 * Database failures never become a permissive answer: anything that is not a
 * typed authority/domain decision is reported as an unavailable authority.
 */
function guard(error: unknown): never {
  if (error instanceof CaseAuthorityError || error instanceof DomainError) {
    throw error
  }
  if (sqlState(error) === '23514' || sqlState(error) === '23503') {
    throw new CaseAuthorityError(
      'case_parent_invalid',
      'Case lineage is invalid'
    )
  }
  throw new CaseAuthorityError(
    'case_authority_unavailable',
    'Case authority is unavailable'
  )
}

function mapPrincipal(row: PrincipalRow): CasePrincipalRecord {
  return {
    tenantId: TenantIdSchema.parse(row.tenant_id),
    operatorId: row.operator_id,
    role: row.role,
    active: row.active,
    revision: Number(row.revision),
    identitySource: row.identity_source,
    authorityVersion: row.authority_version,
    updatedAt: iso(row.updated_at)
  }
}

function mapRoot(row: RootRow): CaseRootRecord {
  return {
    caseId: row.case_id,
    kind: row.kind,
    resourceId: row.resource_id,
    createdAt: iso(row.created_at)
  }
}

function mapAssignment(row: AssignmentRow): CaseAssignmentRecord {
  return {
    caseId: row.case_id,
    kind: row.kind,
    resourceId: row.resource_id,
    operatorId: row.operator_id,
    scope: 'read_case',
    status: row.status,
    revision: Number(row.revision),
    changedBy: row.changed_by,
    changedAt: iso(row.changed_at)
  }
}

function mapAudit(row: AuditRow): AuditEventRecord {
  return {
    id: row.id,
    ...(row.tenant_id ? { tenantId: TenantIdSchema.parse(row.tenant_id) } : {}),
    type: row.type,
    actorType: row.actor_type,
    actorId: row.actor_id,
    correlationId: row.correlation_id,
    policyVersion: row.policy_version,
    payload: sanitizeAuditEvidencePayload(row.payload).payload,
    createdAt: row.created_at
  }
}

function registryFilter(query: CaseRegistryQuery, values: unknown[]): string {
  const clauses: string[] = []
  if (query.kind !== undefined) {
    values.push(query.kind)
    clauses.push(`r.kind = $${values.length}`)
  }
  if (query.resourceId !== undefined) {
    values.push(query.resourceId)
    const column =
      query.kind === 'core_conversation'
        ? 'r.core_conversation_id'
        : query.kind === 'harness_conversation'
          ? 'r.harness_conversation_id'
          : 'r.execution_id'
    clauses.push(`${column} = $${values.length}`)
  }
  return clauses.length > 0 ? ` AND ${clauses.join(' AND ')}` : ''
}

async function readCoreParents(
  client: PostgresQueryable,
  tenantId: TenantId,
  conversationId: string,
  sessionId: string
): Promise<{
  conversationExists: boolean
  sessionConversationId: string | null
  caseId: string | null
}> {
  const result = await client.query<{
    conversation_id: string | null
    session_conversation_id: string | null
    case_id: string | null
  }>(
    `SELECT
       (SELECT c.id FROM conversations c
         WHERE c.tenant_id = $1 AND c.id = $2) AS conversation_id,
       (SELECT s.conversation_id FROM sessions s
          JOIN conversations sc
            ON sc.id = s.conversation_id AND sc.tenant_id = s.tenant_id
         WHERE s.tenant_id = $1 AND s.id = $3) AS session_conversation_id,
       (SELECT r.case_id FROM case_roots r
         WHERE r.tenant_id = $1 AND r.core_conversation_id = $2) AS case_id`,
    [tenantId, conversationId, sessionId]
  )
  const row = result.rows[0]
  return {
    conversationExists: Boolean(row?.conversation_id),
    sessionConversationId: row?.session_conversation_id ?? null,
    caseId: row?.case_id ?? null
  }
}

function classify(
  parents: Awaited<ReturnType<typeof readCoreParents>>,
  conversationId: string,
  sessionId: string
): CoreParentClassification {
  const sessionExists = parents.sessionConversationId !== null
  if (!parents.conversationExists && !sessionExists) {
    return { kind: 'independent' }
  }
  if (
    !parents.conversationExists ||
    parents.sessionConversationId !== conversationId
  ) {
    return { kind: 'invalid' }
  }
  return { kind: 'core', conversationId, sessionId, caseId: parents.caseId }
}

/**
 * Persists (or verifies) the execution lineage inside the caller's
 * transaction. Used by the execution store so the link, the root of an
 * independent execution, the accepted submission and its queue row commit
 * together.
 */
export async function applyExecutionCaseLinkInTransaction(
  client: PostgresQueryable,
  rawTenantId: TenantId,
  executionId: string,
  plan: CoreParentPlan,
  created: boolean,
  now: Date
): Promise<void> {
  try {
    await applyExecutionCaseLink(
      client,
      rawTenantId,
      executionId,
      plan,
      created,
      now
    )
  } catch (error) {
    guard(error)
  }
}

async function applyExecutionCaseLink(
  client: PostgresQueryable,
  rawTenantId: TenantId,
  executionId: string,
  plan: CoreParentPlan,
  created: boolean,
  now: Date
): Promise<void> {
  const tenantId = TenantIdSchema.parse(rawTenantId)
  const existing = await client.query<{
    case_id: string
    core_session_id: string | null
    kind: CaseKind
    core_conversation_id: string | null
  }>(
    `SELECT l.case_id, l.core_session_id, r.kind, r.core_conversation_id
       FROM case_execution_links l
       JOIN case_roots r ON r.tenant_id = l.tenant_id AND r.case_id = l.case_id
      WHERE l.tenant_id = $1 AND l.execution_id = $2`,
    [tenantId, executionId]
  )
  const current = existing.rows[0]
  if (current) {
    const same =
      plan.kind === 'independent'
        ? current.core_session_id === null &&
          current.kind === 'independent_execution'
        : current.core_session_id === plan.sessionId &&
          current.kind === 'core_conversation' &&
          current.core_conversation_id === plan.conversationId
    if (!same) {
      throw new CaseAuthorityError(
        'case_link_conflict',
        'Execution case link cannot change'
      )
    }
    return
  }
  if (!created) return
  const parents = await readCoreParents(
    client,
    tenantId,
    plan.conversationId,
    plan.sessionId
  )
  const classified = classify(parents, plan.conversationId, plan.sessionId)
  if (classified.kind !== plan.kind) {
    throw new CaseAuthorityError(
      'case_parent_invalid',
      'Execution parent pair is invalid'
    )
  }
  if (plan.kind === 'independent') {
    const caseId = randomUUID()
    await client.query(
      `INSERT INTO case_roots
         (tenant_id, case_id, kind, execution_id, created_at)
       VALUES ($1, $2, 'independent_execution', $3, $4)`,
      [tenantId, caseId, executionId, now]
    )
    await client.query(
      `INSERT INTO case_execution_links
         (tenant_id, execution_id, case_id, core_session_id, validated_by, created_at)
       VALUES ($1, $2, $3, NULL, 'independent_root', $4)`,
      [tenantId, executionId, caseId, now]
    )
    return
  }
  const caseId = await ensureCoreConversationRootInTransaction(
    client,
    tenantId,
    plan.conversationId,
    now
  )
  await client.query(
    `INSERT INTO case_execution_links
       (tenant_id, execution_id, case_id, core_session_id, validated_by, created_at)
     VALUES ($1, $2, $3, $4, 'core_parent_pair', $5)`,
    [tenantId, executionId, caseId, plan.sessionId, now]
  )
}

import {
  ensureCoreConversationRootInTransaction,
  linkAuditEventToCoreSessionInTransaction
} from './case-root-sql.ts'

export {
  ensureCoreConversationRootInTransaction,
  insertCoreConversationRootInTransaction,
  linkAuditEventToCoreSessionInTransaction,
  linkAuditEventToCoreSessionWhenAvailable
} from './case-root-sql.ts'

export class PostgresCaseAuthority implements CaseAuthorityPort {
  readonly kind = 'postgres' as const
  private readonly clock: () => Date
  private readonly tenantIsolation: boolean
  private caseTables: Promise<boolean> | undefined

  constructor(
    private readonly connection: CaseAuthorityPostgresConnection,
    options: PostgresCaseAuthorityOptions = {}
  ) {
    this.clock = options.clock ?? (() => new Date())
    this.tenantIsolation =
      options.mode === undefined ? isPool(connection) : options.mode === 'pool'
  }

  private get pool(): PostgresPoolLike | null {
    return this.tenantIsolation ? (this.connection as PostgresPoolLike) : null
  }

  /**
   * The single-connection legacy mode (test-only, initial schema) has no case
   * tables; it can serve tenant-wide reads but never a scoped grant.
   */
  private hasCaseTables(client: PostgresQueryable): Promise<boolean> {
    if (this.tenantIsolation) return Promise.resolve(true)
    // Only a completed probe is cached: a transient error is an outage (503),
    // never a permanent "no case schema" answer.
    this.caseTables ??= client
      .query<{ present: boolean }>(
        `SELECT to_regclass('case_principals') IS NOT NULL AS present`
      )
      .then((result) => result.rows[0]?.present === true)
      .catch((error: unknown) => {
        this.caseTables = undefined
        throw error
      })
    return this.caseTables
  }

  private async requireCaseTables(client: PostgresQueryable): Promise<void> {
    if (!(await this.hasCaseTables(client))) {
      throw new CaseAuthorityError(
        'case_authority_unavailable',
        'Case authority is unavailable'
      )
    }
  }

  private async read<T>(
    tenantId: TenantId,
    operation: (client: PostgresQueryable) => Promise<T>
  ): Promise<T> {
    const pool = this.pool
    if (!pool) {
      return operation(this.connection as PostgresQueryable)
    }
    let client: PostgresPoolClient
    try {
      client = await pool.connect()
    } catch (error) {
      guard(error)
    }
    let releaseError: Error | undefined
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      await client.query('SELECT set_config($1, $2, true)', [
        CVG_TENANT_CONTEXT_SETTING,
        tenantId
      ])
      await applyUnitDeadlines(client)
      const result = await operation(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        releaseError = toError(rollbackError)
      }
      throw error
    } finally {
      client.release(releaseError)
    }
  }

  private async write<T>(
    tenantId: TenantId,
    operation: (client: PostgresQueryable) => Promise<T>
  ): Promise<T> {
    try {
      const pool = this.pool
      if (pool) {
        return await withTenantTransaction(pool, tenantId, async (client) => {
          await applyUnitDeadlines(client)
          return operation(client)
        })
      }
      const client = this.connection as PostgresQueryable
      await client.query('BEGIN')
      try {
        const result = await operation(client)
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      }
    } catch (error) {
      guard(error)
    }
  }

  private repository(client: PostgresQueryable): PostgresRuntimeRepository {
    return new PostgresRuntimeRepository(client, {
      tenantIsolation: this.tenantIsolation
    })
  }

  async applyVerifiedPrincipalState(
    rawInput: VerifiedPrincipalStateInput
  ): Promise<CasePrincipalRecord> {
    const input = assertVerifiedPrincipalInput(rawInput)
    const now = this.clock()
    return this.write(input.tenantId, async (client) => {
      await this.requireCaseTables(client)
      const current = await client.query<{ revision: string | number }>(
        `SELECT revision FROM case_principals
          WHERE tenant_id = $1 AND operator_id = $2
          FOR UPDATE`,
        [input.tenantId, input.operatorId]
      )
      const currentRevision = Number(current.rows[0]?.revision ?? 0)
      if (currentRevision !== input.expectedRevision) {
        throw new CaseAuthorityError(
          'principal_conflict',
          'Principal revision is stale'
        )
      }
      const values = [
        input.tenantId,
        input.operatorId,
        input.role,
        input.active,
        input.identitySource,
        input.authorityVersion,
        caseProofDigest(input.proofRef),
        now
      ]
      const written =
        currentRevision === 0
          ? await client.query<PrincipalRow>(
              `INSERT INTO case_principals
                 (tenant_id, operator_id, role, active, revision,
                  identity_source, authority_version, proof_digest, updated_at)
               VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8)
               ON CONFLICT (tenant_id, operator_id) DO NOTHING
               RETURNING tenant_id, operator_id, role, active, revision,
                         identity_source, authority_version, updated_at`,
              values
            )
          : await client.query<PrincipalRow>(
              `UPDATE case_principals
                  SET role = $3, active = $4, revision = revision + 1,
                      identity_source = $5, authority_version = $6,
                      proof_digest = $7, updated_at = $8
                WHERE tenant_id = $1 AND operator_id = $2 AND revision = $9
                RETURNING tenant_id, operator_id, role, active, revision,
                          identity_source, authority_version, updated_at`,
              [...values, currentRevision]
            )
      const row = written.rows[0]
      if (!row) {
        throw new CaseAuthorityError(
          'principal_conflict',
          'Principal revision is stale'
        )
      }
      const principal = mapPrincipal(row)
      await this.repository(client).appendAudit({
        tenantId: input.tenantId,
        type: 'policy_decision',
        actorType: 'System',
        actorId: 'case-principal-provisioning',
        correlationId: `corr_${randomUUID()}`,
        policyVersion: CASE_AUTHORITY_POLICY_VERSION,
        payload: casePrincipalAuditPayload({
          tenantId: input.tenantId,
          operatorId: input.operatorId,
          previousRevision: currentRevision,
          revision: principal.revision,
          role: principal.role,
          active: principal.active,
          identitySource: principal.identitySource,
          authorityVersion: principal.authorityVersion
        })
      })
      return principal
    })
  }

  /**
   * SPEC 0262 §4 steps 1-2: runs INSIDE the caller's open transaction (READ
   * COMMITTED, tenant context set, unit deadlines applied). The actor's
   * principal row and every assignment row of that actor are locked
   * `FOR SHARE` and stay locked until COMMIT. A revocation or principal
   * change takes `FOR UPDATE` on the same rows, so it either committed
   * before (and the policy below sees it) or waits for this unit. The policy
   * itself runs on a snapshot bound to this very client.
   */
  async authorizeOnClient(
    rawTenantId: TenantId,
    operatorId: string,
    client: PostgresQueryable,
    authorize: (snapshot: CaseReadSnapshot) => Promise<void>
  ): Promise<void> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    try {
      await applyUnitDeadlines(client)
      await client.query(
        `SELECT 1 FROM case_principals
          WHERE tenant_id = $1 AND operator_id = $2
            FOR SHARE`,
        [tenantId, operatorId]
      )
      await client.query(
        `SELECT 1 FROM case_assignments
          WHERE tenant_id = $1 AND operator_id = $2
            FOR SHARE`,
        [tenantId, operatorId]
      )
      await authorize(this.snapshot(tenantId, client))
    } catch (error) {
      guard(error)
    }
  }

  /**
   * The PostgreSQL unit is owned by the writer's transaction (see
   * `PostgresApiCreation`): it receives this authority's hook and runs it
   * before the operation lock. A shared queryable client has no exclusive
   * transactional pool, so the mutation is refused (SPEC 0262 §4.1).
   */
  async runAuthorizedMutation<T>(
    rawTenantId: TenantId,
    input: AuthorizedMutationInput<T>
  ): Promise<T> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    if (!this.pool) {
      throw new CaseAuthorityError(
        'case_authority_unavailable',
        'A transactional pool is required for authorized mutations'
      )
    }
    return input.write({
      authorizeOnClient: (client) =>
        this.authorizeOnClient(
          tenantId,
          input.operatorId,
          client,
          input.authorize
        )
    })
  }

  async readSnapshot<T>(
    rawTenantId: TenantId,
    operation: (snapshot: CaseReadSnapshot) => Promise<T>
  ): Promise<T> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    try {
      return await this.read(tenantId, (client) =>
        operation(this.snapshot(tenantId, client))
      )
    } catch (error) {
      guard(error)
    }
  }

  private snapshot(
    tenantId: TenantId,
    client: PostgresQueryable
  ): CaseReadSnapshot {
    const scoped = async <T>(run: () => Promise<T>): Promise<T> => {
      try {
        await this.requireCaseTables(client)
        return await run()
      } catch (error) {
        guard(error)
      }
    }
    const plain = async <T>(run: () => Promise<T>): Promise<T> => {
      try {
        return await run()
      } catch (error) {
        guard(error)
      }
    }
    return {
      queryable: queryOnly(client),
      scopedAuthorityAvailable: () => this.hasCaseTables(client),
      principal: (operatorId) =>
        plain(async () => {
          if (!(await this.hasCaseTables(client))) return null
          const result = await client.query<PrincipalRow>(
            `SELECT tenant_id, operator_id, role, active, revision,
                    identity_source, authority_version, updated_at
               FROM case_principals
              WHERE tenant_id = $1 AND operator_id = $2`,
            [tenantId, operatorId]
          )
          return result.rows[0] ? mapPrincipal(result.rows[0]) : null
        }),
      hasPrincipalVersionMismatch: (prefix, current) =>
        scoped(async () => {
          const result = await client.query<{ mismatch: boolean }>(
            `SELECT EXISTS (
               SELECT 1 FROM case_principals
                WHERE tenant_id = $1
                  AND left(authority_version, length($2)) = $2
                  AND authority_version <> $3
             ) AS mismatch`,
            [tenantId, prefix, current]
          )
          return result.rows[0]?.mismatch === true
        }),
      coreConversationExists: (conversationId) =>
        plain(async () => {
          const result = await client.query(
            `SELECT 1 FROM conversations WHERE tenant_id = $1 AND id = $2`,
            [tenantId, conversationId]
          )
          return result.rows.length === 1
        }),
      coreConversationCase: (conversationId) =>
        scoped(async () => {
          const result = await client.query<{ case_id: string | null }>(
            `SELECT r.case_id
               FROM conversations c
               LEFT JOIN case_roots r
                 ON r.tenant_id = c.tenant_id AND r.core_conversation_id = c.id
              WHERE c.tenant_id = $1 AND c.id = $2`,
            [tenantId, conversationId]
          )
          const row = result.rows[0]
          return row ? { caseId: row.case_id } : null
        }),
      coreSessionCase: (sessionId) =>
        plain(async () => {
          if (!(await this.hasCaseTables(client))) {
            // Legacy single-connection schema: existence only (sessions carry
            // no tenant column there; the conversation owns the tenant).
            const legacy = await client.query<{ conversation_id: string }>(
              `SELECT s.conversation_id
                 FROM sessions s
                 JOIN conversations c ON c.id = s.conversation_id
                WHERE c.tenant_id = $1 AND s.id = $2`,
              [tenantId, sessionId]
            )
            const found = legacy.rows[0]
            return found
              ? { conversationId: found.conversation_id, caseId: null }
              : null
          }
          const result = await client.query<{
            conversation_id: string
            case_id: string | null
          }>(
            `SELECT s.conversation_id, r.case_id
               FROM sessions s
               JOIN conversations c
                 ON c.id = s.conversation_id AND c.tenant_id = s.tenant_id
               LEFT JOIN case_roots r
                 ON r.tenant_id = c.tenant_id AND r.core_conversation_id = c.id
              WHERE s.tenant_id = $1 AND s.id = $2`,
            [tenantId, sessionId]
          )
          if (result.rows.length > 1) {
            throw new CaseAuthorityError(
              'case_integrity',
              'Session lineage is ambiguous'
            )
          }
          const row = result.rows[0]
          return row
            ? { conversationId: row.conversation_id, caseId: row.case_id }
            : null
        }),
      harnessSessionCase: (conversationId, sessionId) =>
        scoped(async () => {
          const result = await client.query<{ case_id: string | null }>(
            `SELECT r.case_id
               FROM cvg_conversation_sessions h
               LEFT JOIN case_roots r
                 ON r.tenant_id = h.tenant_id
                AND r.harness_conversation_id = h.conversation_id
              WHERE h.tenant_id = $1 AND h.conversation_id = $2
                AND h.session_id = $3`,
            [tenantId, conversationId, sessionId]
          )
          if (result.rows.length > 1) {
            throw new CaseAuthorityError(
              'case_integrity',
              'Harness session lineage is ambiguous'
            )
          }
          const row = result.rows[0]
          return row ? { caseId: row.case_id } : null
        }),
      executionCase: (executionId) =>
        scoped(async () => {
          const result = await client.query<{ case_id: string }>(
            `SELECT case_id FROM case_execution_links
              WHERE tenant_id = $1 AND execution_id = $2`,
            [tenantId, executionId]
          )
          const row = result.rows[0]
          return row ? { caseId: row.case_id } : null
        }),
      taskCase: (taskId) =>
        plain(() => this.resourceCase(client, tenantId, 'tasks', taskId)),
      approvalRequestCase: (approvalRequestId) =>
        plain(() =>
          this.resourceCase(
            client,
            tenantId,
            'approval_requests',
            approvalRequestId
          )
        ),
      listTasks: (scope, query) =>
        scope.kind === 'tenant'
          ? plain(() => this.listTaskPage(client, tenantId, scope, query))
          : scoped(() => this.listTaskPage(client, tenantId, scope, query)),
      listApprovalRequests: (scope, query) =>
        scope.kind === 'tenant'
          ? plain(() => this.listApprovalPage(client, tenantId, scope, query))
          : scoped(() => this.listApprovalPage(client, tenantId, scope, query)),
      hasActiveGrant: (caseId, operatorId) =>
        scoped(async () => {
          const result = await client.query(
            `SELECT 1 FROM case_assignments
              WHERE tenant_id = $1 AND case_id = $2 AND operator_id = $3
                AND status = 'ACTIVE'`,
            [tenantId, caseId, operatorId]
          )
          return result.rows.length === 1
        }),
      listCoreConversations: (scope, page) =>
        scope.kind === 'tenant'
          ? plain(() => this.listConversations(client, tenantId, scope, page))
          : scoped(() => this.listConversations(client, tenantId, scope, page)),
      coreTimeline: (conversationId) =>
        plain(() => this.repository(client).timeline(tenantId, conversationId)),
      linkedAuditEvents: (ref) =>
        scoped(() => this.linkedAudit(client, tenantId, ref)),
      listRoots: (rawQuery) =>
        scoped(() =>
          this.listRoots(client, tenantId, assertRegistryQuery(rawQuery))
        ),
      listAssignments: (rawQuery) =>
        scoped(() =>
          this.listAssignments(client, tenantId, assertRegistryQuery(rawQuery))
        )
    }
  }

  private async resourceCase(
    client: PostgresQueryable,
    tenantId: TenantId,
    table: 'tasks' | 'approval_requests',
    id: string
  ): Promise<SessionCaseLookup | null> {
    const sql = (await this.hasCaseTables(client))
      ? RESOURCE_CASE_SQL[table]
      : LEGACY_RESOURCE_CASE_SQL[table]
    const result = await client.query<{
      session_id: string
      case_id: string | null
    }>(sql, [tenantId, id])
    if (result.rows.length > 1) {
      throw new CaseAuthorityError(
        'case_integrity',
        'Resource lineage is ambiguous'
      )
    }
    const row = result.rows[0]
    return row ? { caseId: row.case_id, sessionId: row.session_id } : null
  }

  /**
   * SPEC0251 §4.1 — the SPEC0250 single statement (COUNT + LATERAL page),
   * so `total` and the page share one snapshot even on the legacy single
   * connection; the case predicate filters before COUNT, OFFSET and LIMIT.
   */
  private async listTaskPage(
    client: PostgresQueryable,
    tenantId: TenantId,
    scope: CaseListScope,
    query: TaskListQuery
  ): Promise<TaskPage> {
    const { limit, offset, statuses } = assertStatusPageQuery(
      query,
      TaskStatusSchema.options
    )
    const { where, values } = statusPageWhere(
      'tasks',
      tenantId,
      scope,
      statuses
    )
    const from = `FROM tasks
         INNER JOIN sessions ON sessions.id = tasks.session_id
         INNER JOIN conversations ON conversations.id = sessions.conversation_id
         ${where}`
    const result = await client.query<TaskRow>(
      `SELECT counted.total, page.id, page.session_id, page.title, page.description,
              page.priority, page.source, page.status, page.idempotency_key, page.created_at
       FROM (
         SELECT COUNT(*)::integer AS total
         ${from}
       ) counted
       LEFT JOIN LATERAL (
         SELECT tasks.id, tasks.session_id, tasks.title, tasks.description, tasks.priority,
                tasks.source, tasks.status, tasks.idempotency_key, tasks.created_at
         ${from}
         ORDER BY tasks.created_at ASC, tasks.id ASC
         LIMIT $1 OFFSET $2
       ) page ON true
       ORDER BY page.created_at ASC, page.id ASC`,
      [limit, offset, ...values]
    )
    const items = result.rows
      .filter((row): row is TaskRow & { id: string } => row.id !== null)
      .map(mapTaskRow)
    const total = result.rows[0]?.total ?? 0
    return {
      items,
      pageInfo: pageInfoFor({ limit, offset }, items.length, total)
    }
  }

  /** SPEC0251 §4.1 — same single statement as `listTaskPage`. */
  private async listApprovalPage(
    client: PostgresQueryable,
    tenantId: TenantId,
    scope: CaseListScope,
    query: ApprovalListQuery
  ): Promise<ApprovalPage> {
    const { limit, offset, statuses } = assertStatusPageQuery(
      query,
      ApprovalStatusSchema.options
    )
    const { where, values } = statusPageWhere(
      'approval_requests',
      tenantId,
      scope,
      statuses
    )
    const from = `FROM approval_requests
         INNER JOIN sessions ON sessions.id = approval_requests.session_id
         INNER JOIN conversations ON conversations.id = sessions.conversation_id
         ${where}`
    const result = await client.query<ApprovalRow>(
      `SELECT counted.total, page.id, page.session_id, page.proposed_action, page.summary,
              page.risk_level, page.status, page.decided_by, page.decided_at, page.created_at
       FROM (
         SELECT COUNT(*)::integer AS total
         ${from}
       ) counted
       LEFT JOIN LATERAL (
         SELECT approval_requests.id, approval_requests.session_id, approval_requests.proposed_action,
                approval_requests.summary, approval_requests.risk_level, approval_requests.status,
                approval_requests.decided_by, approval_requests.decided_at, approval_requests.created_at
         ${from}
         ORDER BY approval_requests.created_at ASC, approval_requests.id ASC
         LIMIT $1 OFFSET $2
       ) page ON true
       ORDER BY page.created_at ASC, page.id ASC`,
      [limit, offset, ...values]
    )
    const items = result.rows
      .filter((row): row is ApprovalRow & { id: string } => row.id !== null)
      .map(mapApprovalRow)
    const total = result.rows[0]?.total ?? 0
    return {
      items,
      pageInfo: pageInfoFor({ limit, offset }, items.length, total)
    }
  }

  private async listConversations(
    client: PostgresQueryable,
    tenantId: TenantId,
    scope: CaseListScope,
    page: PaginationInput
  ): Promise<ConversationPage> {
    const values: unknown[] = [tenantId]
    let visibility = ''
    if (scope.kind === 'assigned') {
      values.push(scope.operatorId)
      visibility = ` AND EXISTS (
        SELECT 1 FROM case_roots r
          JOIN case_assignments a
            ON a.tenant_id = r.tenant_id AND a.case_id = r.case_id
         WHERE r.tenant_id = c.tenant_id AND r.core_conversation_id = c.id
           AND a.operator_id = $${values.length} AND a.status = 'ACTIVE')`
    }
    const where = `WHERE c.tenant_id = $1${visibility}`
    const counted = await client.query<{ total: number }>(
      `SELECT COUNT(*)::integer AS total FROM conversations c ${where}`,
      values
    )
    const total = counted.rows[0]?.total ?? 0
    const result = await client.query<{
      id: string
      channel: ConversationListItem['channel']
      sender_ref: string
      status: ConversationListItem['status']
      correlation_id: string
      open_session_id: string | null
      last_message_body: string | null
      last_message_at: Date | null
      created_at: Date
      updated_at: Date
    }>(
      `SELECT c.id, c.channel, c.sender_ref, c.status, c.correlation_id,
              open_sessions.id AS open_session_id,
              last_messages.body AS last_message_body,
              last_messages.created_at AS last_message_at,
              c.created_at, c.updated_at
         FROM conversations c
         LEFT JOIN LATERAL (
           SELECT sessions.id FROM sessions
            WHERE sessions.conversation_id = c.id AND sessions.status = 'open'
            ORDER BY sessions.created_at DESC
            LIMIT 1
         ) open_sessions ON true
         LEFT JOIN LATERAL (
           SELECT messages.body, messages.created_at FROM messages
            WHERE messages.conversation_id = c.id
            ORDER BY messages.created_at DESC
            LIMIT 1
         ) last_messages ON true
        ${where}
        ORDER BY COALESCE(last_messages.created_at, c.updated_at) DESC,
                 c.created_at DESC, c.id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, page.limit, page.offset]
    )
    const items: ConversationListItem[] = result.rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      senderRef: redactSensitiveText(row.sender_ref),
      status: row.status,
      correlationId: row.correlation_id,
      openSessionId: row.open_session_id,
      lastMessageBody: row.last_message_body
        ? redactSensitiveText(row.last_message_body)
        : null,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
    return {
      items,
      pageInfo: {
        limit: page.limit,
        offset: page.offset,
        total,
        hasNextPage: page.offset + items.length < total
      }
    }
  }

  private async linkedAudit(
    client: PostgresQueryable,
    tenantId: TenantId,
    ref: AuditSessionRef
  ): Promise<AuditEventRecord[]> {
    const result =
      ref.kind === 'core'
        ? await client.query<AuditRow>(
            `SELECT e.id, e.tenant_id, e.type, e.actor_type, e.actor_id,
                    e.correlation_id, e.policy_version, e.payload, e.created_at
               FROM case_audit_links l
               JOIN audit_events e
                 ON e.tenant_id = l.tenant_id AND e.id = l.audit_event_id
              WHERE l.tenant_id = $1 AND l.core_session_id = $2
              ORDER BY e.created_at ASC, e.id ASC`,
            [tenantId, ref.sessionId]
          )
        : await client.query<AuditRow>(
            `SELECT e.id, e.tenant_id, e.type, e.actor_type, e.actor_id,
                    e.correlation_id, e.policy_version, e.payload, e.created_at
               FROM case_audit_links l
               JOIN audit_events e
                 ON e.tenant_id = l.tenant_id AND e.id = l.audit_event_id
              WHERE l.tenant_id = $1 AND l.harness_conversation_id = $2
                AND l.harness_session_id = $3
              ORDER BY e.created_at ASC, e.id ASC`,
            [tenantId, ref.conversationId, ref.sessionId]
          )
    return result.rows.map(mapAudit)
  }

  private async listRoots(
    client: PostgresQueryable,
    tenantId: TenantId,
    query: CaseRegistryQuery
  ): Promise<CasePage<CaseRootRecord>> {
    const values: unknown[] = [tenantId]
    const filter = registryFilter(query, values)
    const counted = await client.query<{ total: number }>(
      `SELECT COUNT(*)::integer AS total FROM case_roots r
        WHERE r.tenant_id = $1${filter}`,
      values
    )
    const total = counted.rows[0]?.total ?? 0
    const rows = await client.query<RootRow>(
      `SELECT ${ROOT_COLUMNS} FROM case_roots r
        WHERE r.tenant_id = $1${filter}
        ORDER BY r.created_at DESC, r.case_id DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.limit, query.offset]
    )
    const items = rows.rows.map(mapRoot)
    return {
      items,
      pageInfo: {
        limit: query.limit,
        offset: query.offset,
        total,
        hasNextPage: query.offset + items.length < total
      }
    }
  }

  private async listAssignments(
    client: PostgresQueryable,
    tenantId: TenantId,
    query: CaseRegistryQuery
  ): Promise<CasePage<CaseAssignmentRecord>> {
    const values: unknown[] = [tenantId]
    const filter = registryFilter(query, values)
    const from = `FROM case_assignments a
      JOIN case_roots r ON r.tenant_id = a.tenant_id AND r.case_id = a.case_id
     WHERE a.tenant_id = $1${filter}`
    const counted = await client.query<{ total: number }>(
      `SELECT COUNT(*)::integer AS total ${from}`,
      values
    )
    const total = counted.rows[0]?.total ?? 0
    const rows = await client.query<AssignmentRow>(
      `SELECT ${ROOT_COLUMNS}, a.operator_id, a.status, a.revision,
              a.changed_by, a.changed_at
         ${from}
        ORDER BY a.changed_at DESC, a.case_id ASC, a.operator_id ASC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.limit, query.offset]
    )
    const items = rows.rows.map(mapAssignment)
    return {
      items,
      pageInfo: {
        limit: query.limit,
        offset: query.offset,
        total,
        hasNextPage: query.offset + items.length < total
      }
    }
  }

  async putAssignment(
    rawInput: CaseAssignmentWriteInput
  ): Promise<CaseAssignmentWriteResult> {
    const input = assertAssignmentWriteInput(rawInput)
    const now = this.clock()
    return this.write(input.tenantId, async (client) => {
      await this.requireCaseTables(client)
      const actor = await client.query<{
        role: CasePrincipalRecord['role']
        active: boolean
        authority_version: string
      }>(
        `SELECT role, active, authority_version FROM case_principals
          WHERE tenant_id = $1 AND operator_id = $2
          FOR SHARE`,
        [input.tenantId, input.actor.operatorId]
      )
      const actorRow = actor.rows[0]
      assertActorPrincipalCurrent(
        actorRow
          ? {
              role: actorRow.role,
              active: actorRow.active,
              authorityVersion: actorRow.authority_version
            }
          : null,
        input
      )
      const rootResult = await client.query<RootRow>(
        `SELECT ${ROOT_COLUMNS} FROM case_roots r
          WHERE r.tenant_id = $1 AND r.case_id = $2`,
        [input.tenantId, input.caseId]
      )
      const rootRow = rootResult.rows[0]
      if (!rootRow) {
        throw new CaseAuthorityError('case_not_found', 'Resource not found')
      }
      const root = mapRoot(rootRow)
      const currentResult = await client.query<{
        status: CaseAssignmentStatus
        revision: string | number
      }>(
        `SELECT status, revision FROM case_assignments
          WHERE tenant_id = $1 AND case_id = $2 AND operator_id = $3
          FOR UPDATE`,
        [input.tenantId, input.caseId, input.operatorId]
      )
      const current = currentResult.rows[0]
      const currentRevision = Number(current?.revision ?? 0)
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
        const unchanged = await client.query<AssignmentRow>(
          `SELECT ${ROOT_COLUMNS}, a.operator_id, a.status, a.revision,
                  a.changed_by, a.changed_at
             FROM case_assignments a
             JOIN case_roots r ON r.tenant_id = a.tenant_id AND r.case_id = a.case_id
            WHERE a.tenant_id = $1 AND a.case_id = $2 AND a.operator_id = $3`,
          [input.tenantId, input.caseId, input.operatorId]
        )
        return { assignment: mapAssignment(unchanged.rows[0]!), changed: false }
      }
      if (input.status === 'ACTIVE') {
        // FOR SHARE: a concurrent deactivation or role change of the target
        // waits for this grant, so an ACTIVE grant never commits against a
        // principal that already stopped being an active Operator/Approver.
        const target = await client.query<{
          role: CasePrincipalRecord['role']
          active: boolean
        }>(
          `SELECT role, active FROM case_principals
            WHERE tenant_id = $1 AND operator_id = $2
            FOR SHARE`,
          [input.tenantId, input.operatorId]
        )
        const principal = target.rows[0]
        if (
          !principal ||
          !principal.active ||
          (principal.role !== 'Operator' && principal.role !== 'Approver')
        ) {
          throw new CaseAuthorityError(
            'assignment_target_unavailable',
            'Assignment target is unavailable'
          )
        }
      }
      const written = current
        ? await client.query<{ revision: string | number }>(
            `UPDATE case_assignments
                SET status = $4, revision = revision + 1,
                    changed_by = $5, changed_at = $6
              WHERE tenant_id = $1 AND case_id = $2 AND operator_id = $3
                AND revision = $7
              RETURNING revision`,
            [
              input.tenantId,
              input.caseId,
              input.operatorId,
              input.status,
              input.actor.operatorId,
              now,
              currentRevision
            ]
          )
        : await client.query<{ revision: string | number }>(
            `INSERT INTO case_assignments
               (tenant_id, case_id, operator_id, scope, status, revision,
                changed_by, changed_at)
             VALUES ($1, $2, $3, 'read_case', $4, 1, $5, $6)
             ON CONFLICT (tenant_id, case_id, operator_id) DO NOTHING
             RETURNING revision`,
            [
              input.tenantId,
              input.caseId,
              input.operatorId,
              input.status,
              input.actor.operatorId,
              now
            ]
          )
      if (!written.rows[0]) {
        throw new CaseAuthorityError(
          'assignment_conflict',
          'Assignment revision is stale'
        )
      }
      const revision = Number(written.rows[0].revision)
      await this.repository(client).appendAudit({
        tenantId: input.tenantId,
        type: 'policy_decision',
        actorType: input.actor.role,
        actorId: input.actor.operatorId,
        correlationId: input.correlationId,
        policyVersion: CASE_AUTHORITY_POLICY_VERSION,
        payload: caseAssignmentAuditPayload({
          tenantId: input.tenantId,
          root,
          operatorId: input.operatorId,
          previousRevision: currentRevision,
          revision,
          previousStatus: current?.status ?? null,
          status: input.status
        })
      })
      return {
        assignment: {
          caseId: root.caseId,
          kind: root.kind,
          resourceId: root.resourceId,
          operatorId: input.operatorId,
          scope: 'read_case',
          status: input.status,
          revision,
          changedBy: input.actor.operatorId,
          changedAt: now.toISOString()
        },
        changed: true
      }
    })
  }

  async classifyCoreParents(
    rawTenantId: TenantId,
    conversationId: string,
    sessionId: string
  ): Promise<CoreParentClassification> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    try {
      return await this.read(tenantId, async (client) => {
        await this.requireCaseTables(client)
        return classify(
          await readCoreParents(client, tenantId, conversationId, sessionId),
          conversationId,
          sessionId
        )
      })
    } catch (error) {
      guard(error)
    }
  }

  async registerExecutionLink(
    rawTenantId: TenantId,
    executionId: string,
    plan: CoreParentPlan,
    created: boolean
  ): Promise<void> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const now = this.clock()
    await this.write(tenantId, async (client) => {
      await this.requireCaseTables(client)
      await applyExecutionCaseLinkInTransaction(
        client,
        tenantId,
        executionId,
        plan,
        created,
        now
      )
    })
  }

  async appendLinkedAudit(
    rawTenantId: TenantId,
    input: Omit<AuditEventRecord, 'id' | 'createdAt'>,
    ref: { readonly kind: 'core'; readonly sessionId: string }
  ): Promise<AuditEventRecord> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const now = this.clock()
    const legacy = this.connection as PostgresQueryable
    if (!this.pool && !(await this.hasCaseTables(legacy).catch(guard))) {
      // Legacy single-connection schema (test-only): no lineage table exists,
      // so the event stays unlinked and only the full audit reader sees it.
      return this.repository(legacy).appendAudit({
        ...input,
        tenantId
      })
    }
    return this.write(tenantId, async (client) => {
      const session = await client.query(
        `SELECT 1 FROM sessions WHERE tenant_id = $1 AND id = $2`,
        [tenantId, ref.sessionId]
      )
      if (session.rows.length !== 1) {
        throw new CaseAuthorityError(
          'case_parent_invalid',
          'Audit session lineage is invalid'
        )
      }
      const event = await this.repository(client).appendAudit({
        ...input,
        tenantId
      })
      await linkAuditEventToCoreSessionInTransaction(
        client,
        tenantId,
        event.id,
        ref.sessionId,
        now
      )
      return event
    })
  }

  async backfillCoreRoots(
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
      throw new CaseAuthorityError(
        'validation_failed',
        'Backfill batch is invalid'
      )
    }
    return this.write(tenantId, async (client) => {
      await this.requireCaseTables(client)
      const batch = await client.query<{ id: string; created_at: Date }>(
        `SELECT id, created_at FROM conversations
          WHERE tenant_id = $1 AND ($2::text IS NULL OR id > $2)
          ORDER BY id ASC
          LIMIT $3`,
        [tenantId, input.afterConversationId, input.limit]
      )
      let created = 0
      for (const row of batch.rows) {
        const inserted = await client.query(
          `INSERT INTO case_roots
             (tenant_id, case_id, kind, core_conversation_id, created_at)
           VALUES ($1, $2, 'core_conversation', $3, $4)
           ON CONFLICT (tenant_id, core_conversation_id) DO NOTHING`,
          [tenantId, randomUUID(), row.id, row.created_at]
        )
        created += inserted.rowCount ?? 0
      }
      return {
        created,
        lastConversationId: batch.rows.at(-1)?.id ?? null
      }
    })
  }
}
