import type { AttendanceApprovalDecision } from './attendance-approval.ts'
import { DomainError } from '@cvg/shared'
import {
  TenantIdSchema,
  TenantScopeSchema,
  type AgentConfig,
  type AgentId,
  type AgentVersionId,
  type AgentVersionStatus,
  type AgentCreateInput,
  type AgentRecord,
  type AgentVersionRecord,
  type KnowledgeSourceCreateInput,
  type KnowledgeSourceId,
  type KnowledgeSourceRecord,
  type KnowledgeSourceStatus,
  type ReleaseCandidateCreateInput,
  type ReleaseCandidateId,
  type ReleaseCandidateRecord,
  type ReleaseCandidateStatus,
  type TenantScope,
  type TestRunTrace,
  type PluginCatalogCreateInput,
  type PluginCatalogId,
  type PluginCatalogRecord,
  type PluginCatalogStatus,
  type PluginManifest,
  type TenantId,
  type TestSuiteCloneInput,
  type TestSuiteCreateInput,
  type TestSuiteId,
  type TestSuiteRecord,
  type TestSuiteRunRecord
} from '@cvg/platform'
import type {
  ApprovalRequestRecord,
  AuditEventRecord,
  AuditEvidenceFilters,
  AuditEvidencePage,
  AuditEvidenceQuery,
  AuditEvidenceSummary,
  ConversationPage,
  InboundRuntimeContext,
  MessageRecord,
  SessionRecord,
  TaskRecord
} from './schema.ts'
import type {
  OutboxAckInput,
  OutboxClaimInput,
  OutboxEnqueueInput,
  OutboxFailInput,
  OutboxRequeueInput
} from './outbox.ts'
import type {
  AuditEvidenceCheckpointCreateInput,
  AuditEvidenceCheckpointRecord,
  AuditEvidenceCheckpointStatus
} from './audit-evidence-checkpoint.ts'
import {
  PostgresRuntimeRepository,
  type DurableOutboxEventRecord,
  type InboundRuntimeCompletionInput,
  type PostgresQueryable
} from './postgres.ts'
import { PostgresControlPlaneRepository } from './platform-control-plane-repository.ts'
import type { Channel, TaskStatus } from '@cvg/shared'

export const CVG_TENANT_CONTEXT_SETTING = 'cvg.tenant_id'

export interface PostgresPoolClient extends PostgresQueryable {
  release(error?: Error): void
}

export interface PostgresPoolLike {
  connect(): Promise<PostgresPoolClient>
}

/**
 * Runs an operation on one pool connection with a session-local tenant
 * context. The connection is destroyed when cleanup fails, preventing a
 * tenant context from leaking to the next borrower.
 */
export async function withTenantContext<T>(
  pool: PostgresPoolLike,
  rawTenantId: TenantId,
  operation: (client: PostgresPoolClient) => Promise<T>
): Promise<T> {
  const tenantId = TenantIdSchema.parse(rawTenantId)
  const client = await pool.connect()
  let contextSet = false
  let originalSearchPath: string | undefined
  let callbackResult: T | undefined
  let callbackError: unknown

  try {
    const searchPath = await client.query<{ search_path: string }>(
      'SHOW search_path'
    )
    originalSearchPath = searchPath.rows[0]?.search_path
    await client.query('SELECT set_config($1, $2, false)', [
      CVG_TENANT_CONTEXT_SETTING,
      tenantId
    ])
    contextSet = true
    try {
      callbackResult = await operation(client)
    } catch (error) {
      callbackError = error
    }

    let cleanupError: Error | undefined
    try {
      await client.query('SELECT set_config($1, $2, false)', [
        CVG_TENANT_CONTEXT_SETTING,
        ''
      ])
    } catch (error) {
      cleanupError = toError(error)
    }
    if (!cleanupError && originalSearchPath) {
      try {
        await client.query('SELECT set_config($1, $2, false)', [
          'search_path',
          originalSearchPath
        ])
        const restoredSearchPath = await client.query<{
          search_path: string
        }>('SHOW search_path')
        if (restoredSearchPath.rows[0]?.search_path !== originalSearchPath) {
          cleanupError = new Error(
            'PostgreSQL search_path reset was not verified'
          )
        }
      } catch (error) {
        cleanupError = toError(error)
      }
    }
    client.release(cleanupError)
    if (cleanupError) throw cleanupError
    if (callbackError) throw callbackError
    return callbackResult as T
  } catch (error) {
    if (!contextSet) client.release(toError(error))
    throw error
  }
}

/**
 * Runs a short transaction on one pool connection with the same session-local
 * tenant context used by {@link withTenantContext}. The callback, its state
 * mutations and any audit insert commit together; a failure rolls everything
 * back and the tenant context is cleared before the connection returns to the
 * pool. A connection whose context cleanup fails is destroyed instead of
 * being reused with a dirty context.
 */
export async function withTenantTransaction<T>(
  pool: PostgresPoolLike,
  rawTenantId: TenantId,
  operation: (client: PostgresPoolClient) => Promise<T>
): Promise<T> {
  const tenantId = TenantIdSchema.parse(rawTenantId)
  const client = await pool.connect()
  let released = false
  const release = (error?: Error): void => {
    if (released) return
    released = true
    client.release(error)
  }
  let cleanupFailure: Error | undefined
  const clearTenantContext = async (): Promise<void> => {
    try {
      await client.query('SELECT set_config($1, $2, false)', [
        CVG_TENANT_CONTEXT_SETTING,
        ''
      ])
      const leaked = await client.query<{ tenant_id: string | null }>(
        `SELECT NULLIF(current_setting($1, true), '') AS tenant_id`,
        [CVG_TENANT_CONTEXT_SETTING]
      )
      if (leaked.rows.length !== 1 || leaked.rows[0]?.tenant_id !== null) {
        throw new Error('PostgreSQL tenant context cleanup was not verified')
      }
    } catch (error) {
      cleanupFailure = toError(error)
      throw error
    }
  }
  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, false)', [
      CVG_TENANT_CONTEXT_SETTING,
      tenantId
    ])
    const result = await operation(client)
    await clearTenantContext()
    await client.query('COMMIT')
    release()
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      release(toError(rollbackError))
      throw error
    }
    try {
      await clearTenantContext()
    } catch (cleanupError) {
      release(toError(cleanupError))
      throw error
    }
    release(cleanupFailure)
    throw error
  }
}

export class TenantScopedPostgresRuntimeRepository {
  constructor(private readonly pool: PostgresPoolLike) {}

  enqueue(input: OutboxEnqueueInput): Promise<DurableOutboxEventRecord> {
    return this.run(input.tenantId, (repository) => repository.enqueue(input))
  }

  findOutboxById(
    tenantId: TenantId,
    eventId: string
  ): Promise<DurableOutboxEventRecord | null> {
    return this.run(tenantId, (repository) =>
      repository.findOutboxById(tenantId, eventId)
    )
  }

  claimNext(input: OutboxClaimInput): Promise<DurableOutboxEventRecord | null> {
    return this.run(input.tenantId, (repository) => repository.claimNext(input))
  }

  ack(input: OutboxAckInput): Promise<DurableOutboxEventRecord> {
    return this.run(input.tenantId, (repository) => repository.ack(input))
  }

  fail(input: OutboxFailInput): Promise<DurableOutboxEventRecord> {
    return this.run(input.tenantId, (repository) => repository.fail(input))
  }

  requeueDeadLetter(
    input: OutboxRequeueInput
  ): Promise<DurableOutboxEventRecord> {
    return this.run(input.tenantId, (repository) =>
      repository.requeueDeadLetter(input)
    )
  }

  findByExternalMessage(
    tenantId: TenantId,
    channel: Channel,
    externalMessageId: string
  ): Promise<MessageRecord | null> {
    return this.run(tenantId, (repository) =>
      repository.findByExternalMessage(tenantId, channel, externalMessageId)
    )
  }

  createWithSession(
    input: Parameters<PostgresRuntimeRepository['createWithSession']>[0]
  ): Promise<
    Awaited<ReturnType<PostgresRuntimeRepository['createWithSession']>>
  > {
    return this.run(input.tenantId, (repository) =>
      repository.createWithSession(input)
    )
  }

  createWithSessionAndOutbox(
    input: Parameters<PostgresRuntimeRepository['createWithSession']>[0],
    outbox: OutboxEnqueueInput
  ): Promise<
    Awaited<ReturnType<PostgresRuntimeRepository['createWithSessionAndOutbox']>>
  > {
    return this.run(input.tenantId, (repository) =>
      repository.createWithSessionAndOutbox(input, outbox)
    )
  }

  bindSessionAgentVersion(
    tenantId: TenantId,
    sessionId: string,
    agentId: AgentId,
    agentVersionId: AgentVersionId
  ): Promise<SessionRecord | null> {
    return this.run(tenantId, (repository) =>
      repository.bindSessionAgentVersion(
        tenantId,
        sessionId,
        agentId,
        agentVersionId
      )
    )
  }

  appendOutboundMessage(
    input: Parameters<PostgresRuntimeRepository['appendOutboundMessage']>[0]
  ): Promise<
    Awaited<ReturnType<PostgresRuntimeRepository['appendOutboundMessage']>>
  > {
    return this.run(input.tenantId, (repository) =>
      repository.appendOutboundMessage(input)
    )
  }

  markInboundRuntimeCompleted(
    messageId: string,
    tenantId: TenantId
  ): Promise<boolean> {
    return this.run(tenantId, (repository) =>
      repository.markInboundRuntimeCompleted(messageId, tenantId)
    )
  }

  findInboundRuntimeContext(
    tenantId: TenantId,
    conversationId: string,
    sessionId: string | null,
    messageId: string
  ): Promise<InboundRuntimeContext | null> {
    return this.run(tenantId, (repository) =>
      repository.findInboundRuntimeContext(
        tenantId,
        conversationId,
        sessionId,
        messageId
      )
    )
  }

  completeInboundRuntime(
    input: InboundRuntimeCompletionInput
  ): Promise<{ status: 'completed' | 'paused' }> {
    return withTenantContext(this.pool, input.tenantId, (client) =>
      new PostgresRuntimeRepository(client, {
        tenantIsolation: true
      }).completeInboundRuntime(
        input,
        new PostgresControlPlaneRepository(client)
      )
    )
  }

  transitionTakeover(
    tenantId: TenantId,
    sessionId: string,
    event: Parameters<PostgresRuntimeRepository['transitionTakeover']>[2]
  ): Promise<SessionRecord | null> {
    return this.run(tenantId, (repository) =>
      repository.transitionTakeover(tenantId, sessionId, event)
    )
  }

  appendAudit(
    input: Parameters<PostgresRuntimeRepository['appendAudit']>[0],
    rawTenantId?: TenantId
  ): Promise<AuditEventRecord> {
    const tenantId = requireTenantId(rawTenantId)
    const payloadTenantId = readPayloadTenantId(input.payload)
    if (payloadTenantId !== tenantId) {
      throw new DomainError(
        'invalid_action',
        'Audit payload tenant does not match the explicit tenant scope'
      )
    }
    return this.run(tenantId, (repository) =>
      repository.appendAudit({ ...input, tenantId })
    )
  }

  listAuditBySession(
    sessionId: string,
    tenantId: TenantId
  ): Promise<AuditEventRecord[]> {
    return this.run(tenantId, (repository) =>
      repository.listAuditBySession(sessionId, tenantId)
    )
  }

  listAuditEvidence(
    query: AuditEvidenceQuery,
    tenantId: TenantId
  ): Promise<AuditEvidencePage> {
    return this.run(tenantId, (repository) =>
      repository.listAuditEvidence(query, tenantId)
    )
  }

  summarizeAuditEvidence(
    filters: AuditEvidenceFilters,
    tenantId: TenantId
  ): Promise<AuditEvidenceSummary> {
    return this.run(tenantId, (repository) =>
      repository.summarizeAuditEvidence(filters, tenantId)
    )
  }

  createAuditEvidenceCheckpoint(
    input: AuditEvidenceCheckpointCreateInput,
    createdBy: string,
    tenantId: TenantId
  ): Promise<AuditEvidenceCheckpointRecord> {
    return this.run(tenantId, (repository) =>
      repository.createAuditEvidenceCheckpoint(input, createdBy, tenantId)
    )
  }

  getAuditEvidenceCheckpoint(
    id: string,
    tenantId: TenantId
  ): Promise<AuditEvidenceCheckpointRecord | null> {
    return this.run(tenantId, (repository) =>
      repository.getAuditEvidenceCheckpoint(id, tenantId)
    )
  }

  listAuditEvidenceCheckpoints(
    tenantId: TenantId
  ): Promise<AuditEvidenceCheckpointRecord[]> {
    return this.run(tenantId, (repository) =>
      repository.listAuditEvidenceCheckpoints(tenantId)
    )
  }

  transitionAuditEvidenceCheckpoint(
    id: string,
    status: AuditEvidenceCheckpointStatus,
    updatedBy: string,
    expectedStatus: AuditEvidenceCheckpointStatus,
    tenantId: TenantId
  ): Promise<AuditEvidenceCheckpointRecord | null> {
    return this.run(tenantId, (repository) =>
      repository.transitionAuditEvidenceCheckpoint(
        id,
        status,
        updatedBy,
        expectedStatus,
        tenantId
      )
    )
  }

  timeline(
    tenantId: TenantId,
    conversationId: string
  ): Promise<Awaited<ReturnType<PostgresRuntimeRepository['timeline']>>> {
    return this.run(tenantId, (repository) =>
      repository.timeline(tenantId, conversationId)
    )
  }

  listPage(
    tenantId: TenantId,
    input: Parameters<PostgresRuntimeRepository['listPage']>[1]
  ): Promise<ConversationPage> {
    return this.run(tenantId, (repository) =>
      repository.listPage(tenantId, input)
    )
  }

  createTask(
    input: Parameters<PostgresRuntimeRepository['createTask']>[0],
    tenantId?: TenantId
  ): Promise<TaskRecord> {
    const scope = requireTenantId(tenantId)
    return this.run(scope, (repository) => repository.createTask(input, scope))
  }

  listTasks(tenantId?: TenantId): Promise<TaskRecord[]> {
    const scope = requireTenantId(tenantId)
    return this.run(scope, (repository) => repository.listTasks(scope))
  }

  findTaskById(id: string, tenantId?: TenantId): Promise<TaskRecord | null> {
    const scope = requireTenantId(tenantId)
    return this.run(scope, (repository) => repository.findTaskById(id, scope))
  }

  updateTaskStatus(
    id: string,
    status: TaskStatus,
    tenantId?: TenantId
  ): Promise<TaskRecord | null> {
    const scope = requireTenantId(tenantId)
    return this.run(scope, (repository) =>
      repository.updateTaskStatus(id, status, scope)
    )
  }

  saveApproval(
    request: ApprovalRequestRecord,
    tenantId?: TenantId
  ): Promise<ApprovalRequestRecord> {
    const scope = requireTenantId(tenantId)
    return this.run(scope, (repository) =>
      repository.saveApproval(request, scope)
    )
  }

  decideApprovalWithAudit(
    input: AttendanceApprovalDecision,
    tenantId?: TenantId
  ): Promise<ApprovalRequestRecord> {
    const scope = requireTenantId(tenantId)
    return this.run(scope, (repository) =>
      repository.decideApprovalWithAudit(input, scope)
    )
  }

  findApprovalById(
    id: string,
    tenantId?: TenantId
  ): Promise<ApprovalRequestRecord | null> {
    const scope = requireTenantId(tenantId)
    return this.run(scope, (repository) =>
      repository.findApprovalById(id, scope)
    )
  }

  listApprovals(tenantId?: TenantId): Promise<ApprovalRequestRecord[]> {
    const scope = requireTenantId(tenantId)
    return this.run(scope, (repository) => repository.listApprovals(scope))
  }

  private run<T>(
    tenantId: TenantId,
    operation: (repository: PostgresRuntimeRepository) => Promise<T>
  ): Promise<T> {
    return withTenantContext(this.pool, tenantId, (client) =>
      operation(
        new PostgresRuntimeRepository(client, { tenantIsolation: true })
      )
    )
  }
}

export class TenantScopedPostgresControlPlaneRepository {
  constructor(private readonly pool: PostgresPoolLike) {}

  createAgent(
    scope: TenantScope,
    input: AgentCreateInput
  ): Promise<AgentRecord> {
    return this.run(scope, (repository) => repository.createAgent(scope, input))
  }

  getAgent(scope: TenantScope, agentId: AgentId): Promise<AgentRecord | null> {
    return this.run(scope, (repository) => repository.getAgent(scope, agentId))
  }

  listAgents(scope: TenantScope): Promise<AgentRecord[]> {
    return this.run(scope, (repository) => repository.listAgents(scope))
  }

  createVersion(
    scope: TenantScope,
    agentId: AgentId,
    config: AgentConfig,
    createdBy: string
  ): Promise<AgentVersionRecord> {
    return this.run(scope, (repository) =>
      repository.createVersion(scope, agentId, config, createdBy)
    )
  }

  getVersion(
    scope: TenantScope,
    versionId: AgentVersionId
  ): Promise<AgentVersionRecord | null> {
    return this.run(scope, (repository) =>
      repository.getVersion(scope, versionId)
    )
  }

  listVersions(
    scope: TenantScope,
    agentId: AgentId
  ): Promise<AgentVersionRecord[]> {
    return this.run(scope, (repository) =>
      repository.listVersions(scope, agentId)
    )
  }

  transitionVersion(
    scope: TenantScope,
    versionId: AgentVersionId,
    target: AgentVersionStatus,
    expectedStatus?: AgentVersionStatus
  ): Promise<AgentVersionRecord> {
    return this.run(scope, (repository) =>
      repository.transitionVersion(scope, versionId, target, expectedStatus)
    )
  }

  publishVersion(
    scope: TenantScope,
    versionId: AgentVersionId,
    releaseCandidateId: ReleaseCandidateId,
    expectedStatus?: AgentVersionStatus
  ): Promise<AgentVersionRecord> {
    return this.run(scope, (repository) =>
      repository.publishVersion(
        scope,
        versionId,
        releaseCandidateId,
        expectedStatus
      )
    )
  }

  rollback(
    scope: TenantScope,
    agentId: AgentId,
    versionId: AgentVersionId,
    createdBy: string,
    releaseCandidateId: ReleaseCandidateId,
    expectedStatus?: AgentVersionStatus
  ): Promise<AgentVersionRecord> {
    return this.run(scope, (repository) =>
      repository.rollback(
        scope,
        agentId,
        versionId,
        createdBy,
        releaseCandidateId,
        expectedStatus
      )
    )
  }

  resolvePublished(
    scope: TenantScope,
    agentId: AgentId
  ): Promise<AgentVersionRecord | null> {
    return this.run(scope, (repository) =>
      repository.resolvePublished(scope, agentId)
    )
  }

  createKnowledgeSource(
    scope: TenantScope,
    input: KnowledgeSourceCreateInput,
    createdBy: string
  ): Promise<KnowledgeSourceRecord> {
    return this.run(scope, (repository) =>
      repository.createKnowledgeSource(scope, input, createdBy)
    )
  }

  getKnowledgeSource(
    scope: TenantScope,
    sourceId: KnowledgeSourceId
  ): Promise<KnowledgeSourceRecord | null> {
    return this.run(scope, (repository) =>
      repository.getKnowledgeSource(scope, sourceId)
    )
  }

  listKnowledgeSources(scope: TenantScope): Promise<KnowledgeSourceRecord[]> {
    return this.run(scope, (repository) =>
      repository.listKnowledgeSources(scope)
    )
  }

  transitionKnowledgeSource(
    scope: TenantScope,
    sourceId: KnowledgeSourceId,
    target: KnowledgeSourceStatus,
    actorId: string,
    expectedStatus?: KnowledgeSourceStatus
  ): Promise<KnowledgeSourceRecord> {
    return this.run(scope, (repository) =>
      repository.transitionKnowledgeSource(
        scope,
        sourceId,
        target,
        actorId,
        expectedStatus
      )
    )
  }

  createReleaseCandidate(
    scope: TenantScope,
    input: ReleaseCandidateCreateInput,
    createdBy: string
  ): Promise<ReleaseCandidateRecord> {
    return this.run(scope, (repository) =>
      repository.createReleaseCandidate(scope, input, createdBy)
    )
  }

  getReleaseCandidate(
    scope: TenantScope,
    candidateId: ReleaseCandidateId
  ): Promise<ReleaseCandidateRecord | null> {
    return this.run(scope, (repository) =>
      repository.getReleaseCandidate(scope, candidateId)
    )
  }

  listReleaseCandidates(
    scope: TenantScope,
    agentId?: AgentId
  ): Promise<ReleaseCandidateRecord[]> {
    return this.run(scope, (repository) =>
      repository.listReleaseCandidates(scope, agentId)
    )
  }

  transitionReleaseCandidate(
    scope: TenantScope,
    candidateId: ReleaseCandidateId,
    target: ReleaseCandidateStatus,
    actorId: string,
    expectedStatus?: ReleaseCandidateStatus
  ): Promise<ReleaseCandidateRecord> {
    return this.run(scope, (repository) =>
      repository.transitionReleaseCandidate(
        scope,
        candidateId,
        target,
        actorId,
        expectedStatus
      )
    )
  }

  createPluginCatalogEntry(
    scope: TenantScope,
    input: PluginCatalogCreateInput,
    createdBy: string
  ): Promise<PluginCatalogRecord> {
    return this.run(scope, (repository) =>
      repository.createPluginCatalogEntry(scope, input, createdBy)
    )
  }

  getPluginCatalogEntry(
    scope: TenantScope,
    pluginId: PluginCatalogId
  ): Promise<PluginCatalogRecord | null> {
    return this.run(scope, (repository) =>
      repository.getPluginCatalogEntry(scope, pluginId)
    )
  }

  listPluginCatalogEntries(
    scope: TenantScope,
    name?: string
  ): Promise<PluginCatalogRecord[]> {
    return this.run(scope, (repository) =>
      repository.listPluginCatalogEntries(scope, name)
    )
  }

  transitionPluginCatalogEntry(
    scope: TenantScope,
    pluginId: PluginCatalogId,
    target: PluginCatalogStatus,
    actorId: string,
    expectedStatus?: PluginCatalogStatus
  ): Promise<PluginCatalogRecord> {
    return this.run(scope, (repository) =>
      repository.transitionPluginCatalogEntry(
        scope,
        pluginId,
        target,
        actorId,
        expectedStatus
      )
    )
  }

  resolveApprovedPlugin(
    scope: TenantScope,
    name: string,
    version?: string
  ): Promise<PluginManifest | null> {
    return this.run(scope, (repository) =>
      repository.resolveApprovedPlugin(scope, name, version)
    )
  }

  recordTestRun(
    scope: TenantScope,
    trace: TestRunTrace
  ): Promise<TestRunTrace> {
    return this.run(scope, (repository) =>
      repository.recordTestRun(scope, trace)
    )
  }

  listTestRuns(scope: TenantScope, limit?: number): Promise<TestRunTrace[]> {
    return this.run(scope, (repository) =>
      repository.listTestRuns(scope, limit)
    )
  }

  recordExecutionTrace(
    scope: TenantScope,
    trace: TestRunTrace
  ): Promise<TestRunTrace> {
    return this.run(scope, (repository) =>
      repository.recordExecutionTrace(scope, trace)
    )
  }

  listExecutionTraces(
    scope: TenantScope,
    limit?: number
  ): Promise<TestRunTrace[]> {
    return this.run(scope, (repository) =>
      repository.listExecutionTraces(scope, limit)
    )
  }

  createTestSuite(
    scope: TenantScope,
    input: TestSuiteCreateInput,
    createdBy: string
  ): Promise<TestSuiteRecord> {
    return this.run(scope, (repository) =>
      repository.createTestSuite(scope, input, createdBy)
    )
  }

  getTestSuite(
    scope: TenantScope,
    suiteId: TestSuiteId
  ): Promise<TestSuiteRecord | null> {
    return this.run(scope, (repository) =>
      repository.getTestSuite(scope, suiteId)
    )
  }

  listTestSuites(
    scope: TenantScope,
    agentId?: AgentId
  ): Promise<TestSuiteRecord[]> {
    return this.run(scope, (repository) =>
      repository.listTestSuites(scope, agentId)
    )
  }

  cloneTestSuite(
    scope: TenantScope,
    suiteId: TestSuiteId,
    input: TestSuiteCloneInput,
    createdBy: string
  ): Promise<TestSuiteRecord> {
    return this.run(scope, (repository) =>
      repository.cloneTestSuite(scope, suiteId, input, createdBy)
    )
  }

  recordTestSuiteRun(
    scope: TenantScope,
    run: TestSuiteRunRecord
  ): Promise<TestSuiteRunRecord> {
    return this.run(scope, (repository) =>
      repository.recordTestSuiteRun(scope, run)
    )
  }

  listTestSuiteRuns(
    scope: TenantScope,
    suiteId: TestSuiteId,
    limit?: number
  ): Promise<TestSuiteRunRecord[]> {
    return this.run(scope, (repository) =>
      repository.listTestSuiteRuns(scope, suiteId, limit)
    )
  }

  private run<T>(
    rawScope: TenantScope,
    operation: (repository: PostgresControlPlaneRepository) => Promise<T>
  ): Promise<T> {
    const scope = TenantScopeSchema.parse(rawScope)
    return withTenantContext(this.pool, scope.tenantId, (client) =>
      operation(new PostgresControlPlaneRepository(client))
    )
  }
}

function readPayloadTenantId(payload: unknown): TenantId {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'tenantId' in payload
  ) {
    const parsed = TenantIdSchema.safeParse(payload.tenantId)
    if (parsed.success) return parsed.data
  }
  throw new DomainError(
    'invalid_action',
    'A tenant-scoped audit payload is required'
  )
}

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('PostgreSQL tenant context failure')
}

function requireTenantId(rawTenantId: TenantId | undefined): TenantId {
  if (!rawTenantId) {
    throw new DomainError('invalid_action', 'Tenant scope is required')
  }
  return TenantIdSchema.parse(rawTenantId)
}
