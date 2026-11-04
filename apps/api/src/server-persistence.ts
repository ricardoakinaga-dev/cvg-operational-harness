import { DomainError } from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import {
  JourneyRepository,
  PostgresJourneyRepository,
  type JourneyRepositoryPort
} from './legacy-composition.ts'
import {
  ApprovalRepository,
  type AuditEventRecord,
  type AuditEvidenceFilters,
  type AuditEvidenceQuery,
  type AuditEvidenceCheckpointCreateInput,
  type AuditEvidenceCheckpointRecord,
  AuditRepository,
  ConversationRepository,
  type DurableOutboxAdapter,
  InMemoryApiCreation,
  InMemoryDatabase,
  PostgresApiCreation,
  PostgresAuthorizedWrites,
  type ApiCreationPort,
  OutboxRepository,
  PostgresRuntimeRepository,
  TenantScopedPostgresRuntimeRepository,
  type PostgresPoolClient,
  type PostgresPoolLike,
  guardPostgresPoolErrors,
  TaskRepository,
  type PostgresQueryable,
  type TaskRecord,
  type TaskStatusTransitionCommand,
  withTenantContext
} from '@cvg/persistence'
import { Pool } from 'pg'
import { BuildServerOptions } from './server-options.ts'

export function assertSafeRuntimeSchemaName(
  schemaName: string | undefined
): void {
  if (schemaName && !/^[a-z][a-z0-9_]{0,62}$/.test(schemaName)) {
    throw new Error('Invalid PostgreSQL schema name')
  }
}

/**
 * Builds a bounded database readiness probe from the configured persistence.
 * Pool connections are returned on success and destroyed on failure/timeout so
 * repeated probes cannot accumulate leaked clients.
 */
export function createReadinessDatabaseProbe(
  persistence: BuildServerOptions['persistence']
): (() => Promise<void>) | undefined {
  if (!persistence || persistence.kind === 'memory') return undefined
  if (persistence.kind === 'postgres') {
    const client = persistence.client
    return async () => {
      await client.query('SELECT 1')
    }
  }
  const pool = persistence.pool
  // Keep admission occupied until the underlying acquisition/query settles.
  // A deadline cannot cancel pool.connect(), so admitting another probe while
  // it is pending would grow the pool queue on every health check.
  let occupied = false
  return async () => {
    if (occupied) throw new Error('readiness probe is still pending')
    occupied = true
    let expired = false
    let releaseClient: ((error?: Error) => void) | undefined
    const timeoutError = new Error('readiness probe timeout')
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        expired = true
        reject(timeoutError)
        releaseClient?.(timeoutError)
      }, 900)
      timer.unref?.()
    })
    const operation = (async () => {
      try {
        const client = await pool.connect()
        let released = false
        releaseClient = (error?: Error): void => {
          if (released) return
          released = true
          client.release(error)
        }
        if (expired) {
          releaseClient(timeoutError)
          throw timeoutError
        }
        try {
          await client.query('SELECT 1')
          if (expired) throw timeoutError
          releaseClient()
        } catch (error) {
          releaseClient(
            error instanceof Error ? error : new Error('readiness failed')
          )
          throw error
        }
      } finally {
        occupied = false
      }
    })()
    try {
      await Promise.race([operation, deadline])
    } finally {
      clearTimeout(timer)
    }
  }
}

export function createPostgresPool(
  connectionString: string,
  schemaName: string | undefined
): Pool {
  assertSafeRuntimeSchemaName(schemaName)
  return guardPostgresPoolErrors(
    new Pool({
      connectionString,
      ...(schemaName ? { options: `-c search_path=${schemaName}` } : {})
    })
  )
}

export interface RuntimePersistence {
  /** SPEC0176: synthetic memory database backing the in-memory case authority. */
  memoryDb?: InMemoryDatabase
  /** Legacy direct-client fixtures do not have the tenant-scoped pin columns. */
  sessionVersionPinning: boolean
  outbox: DurableOutboxAdapter
  /** R3 controlled journey store: memory or tenant-scoped PostgreSQL adapter. */
  journeys: JourneyRepositoryPort | null
  /**
   * SPEC 0257: atomic creation of task/approval + audit + receipt. Absent on a
   * shared queryable client (no exclusive transactional pool): the two POSTs
   * answer 503 before any write.
   */
  apiCreation: ApiCreationPort | null
  /** SPEC 0262: task status and attendance decision in the authorization unit. */
  authorizedWrites: PostgresAuthorizedWrites | null
  conversations:
    | ConversationRepository
    | PostgresRuntimeRepository
    | TenantScopedPostgresRuntimeRepository

  tasks: {
    create: TaskRepository['create'] | PostgresRuntimeRepository['createTask']
    list: TaskRepository['list'] | PostgresRuntimeRepository['listTasks']
    findById:
      | TaskRepository['findById']
      | PostgresRuntimeRepository['findTaskById']
    transitionStatusWithAudit: (
      command: TaskStatusTransitionCommand,
      tenantId?: TenantId
    ) => TaskRecord | Promise<TaskRecord>
  }
  approvals: {
    save: ApprovalRepository['save'] | PostgresRuntimeRepository['saveApproval']
    decideWithAudit:
      | ApprovalRepository['decideWithAudit']
      | PostgresRuntimeRepository['decideApprovalWithAudit']
    findById:
      | ApprovalRepository['findById']
      | PostgresRuntimeRepository['findApprovalById']
    list:
      | ApprovalRepository['list']
      | PostgresRuntimeRepository['listApprovals']
  }
  audit: {
    append: (
      input: Parameters<AuditRepository['append']>[0],
      tenantId?: TenantId
    ) => AuditEventRecord | Promise<AuditEventRecord>
    listBySession:
      | AuditRepository['listBySession']
      | PostgresRuntimeRepository['listAuditBySession']
    listEvidence:
      | AuditRepository['listEvidence']
      | PostgresRuntimeRepository['listAuditEvidence']
    summarizeEvidence:
      | AuditRepository['summarizeEvidence']
      | PostgresRuntimeRepository['summarizeAuditEvidence']
    createAuditEvidenceCheckpoint: (
      input: AuditEvidenceCheckpointCreateInput,
      createdBy: string,
      tenantId: TenantId
    ) => AuditEvidenceCheckpointRecord | Promise<AuditEvidenceCheckpointRecord>
    getAuditEvidenceCheckpoint: (
      id: string,
      tenantId: TenantId
    ) =>
      | AuditEvidenceCheckpointRecord
      | null
      | Promise<AuditEvidenceCheckpointRecord | null>
    listAuditEvidenceCheckpoints: (
      tenantId: TenantId
    ) =>
      | AuditEvidenceCheckpointRecord[]
      | Promise<AuditEvidenceCheckpointRecord[]>
    transitionAuditEvidenceCheckpoint: (
      id: string,
      status: 'SEALED' | 'ARCHIVED',
      updatedBy: string,
      expectedStatus: 'SEALED' | 'ARCHIVED',
      tenantId: TenantId
    ) =>
      | AuditEvidenceCheckpointRecord
      | null
      | Promise<AuditEvidenceCheckpointRecord | null>
  }
}

/**
 * SPEC0250 §3.3 — the atomic task transition is not on
 * `TenantScopedPostgresRuntimeRepository` (the paged reads moved to the case
 * snapshot in SPEC0251 §4.1); in pool mode this applies the same
 * tenant context per operation that its `run` does. The single-client mode is
 * not production and shares one connection across requests (SPEC0250 §8).
 */
export function runTaskApprovalOperation<T>(
  config: PostgresPersistenceConfig,
  direct: PostgresRuntimeRepository | null,
  rawTenantId: TenantId | undefined,
  operation: (repository: PostgresRuntimeRepository) => Promise<T>
): Promise<T> {
  if (config.kind === 'postgres' && direct) return operation(direct)
  if (config.kind !== 'postgres-pool') {
    return Promise.reject(
      new DomainError('invalid_action', 'PostgreSQL persistence is required')
    )
  }
  const tenantId = TenantIdSchema.safeParse(rawTenantId)
  if (!tenantId.success) {
    return Promise.reject(
      new DomainError('invalid_action', 'Tenant scope is required')
    )
  }
  return withTenantContext(config.pool, tenantId.data, (client) =>
    operation(new PostgresRuntimeRepository(client, { tenantIsolation: true }))
  )
}

export function createPersistence(
  config: BuildServerOptions['persistence'],
  journeyRepository?: JourneyRepositoryPort | null
): RuntimePersistence {
  if (config?.kind === 'postgres' || config?.kind === 'postgres-pool') {
    const postgres =
      config.kind === 'postgres'
        ? new PostgresRuntimeRepository(config.client)
        : new TenantScopedPostgresRuntimeRepository(config.pool)
    const journeys =
      journeyRepository !== undefined
        ? journeyRepository
        : createPostgresJourneyRepository(config)
    const direct =
      postgres instanceof PostgresRuntimeRepository ? postgres : null
    return {
      sessionVersionPinning: config.kind === 'postgres-pool',
      outbox: postgres as unknown as DurableOutboxAdapter,
      journeys,
      conversations: postgres,
      apiCreation:
        config.kind === 'postgres-pool'
          ? new PostgresApiCreation(config.pool)
          : null,
      authorizedWrites:
        config.kind === 'postgres-pool'
          ? new PostgresAuthorizedWrites(config.pool)
          : null,
      tasks: {
        create: (
          input: Parameters<PostgresRuntimeRepository['createTask']>[0],
          tenantId?: TenantId
        ) => postgres.createTask(input, tenantId),
        list: (tenantId) => postgres.listTasks(tenantId),
        findById: (id, tenantId) => postgres.findTaskById(id, tenantId),
        transitionStatusWithAudit: (command, tenantId) =>
          runTaskApprovalOperation(config, direct, tenantId, (repository) =>
            repository.transitionTaskStatusWithAudit(command, tenantId)
          )
      },
      approvals: {
        decideWithAudit: (input, tenantId) =>
          postgres.decideApprovalWithAudit(input, tenantId),
        save: (request, tenantId) => postgres.saveApproval(request, tenantId),
        findById: (id, tenantId) => postgres.findApprovalById(id, tenantId),
        list: (tenantId) => postgres.listApprovals(tenantId)
      },
      audit: {
        append: (input, tenantId) =>
          config.kind === 'postgres-pool'
            ? postgres.appendAudit(input, tenantId)
            : postgres.appendAudit(
                tenantId === undefined ? input : { ...input, tenantId }
              ),
        listBySession: (sessionId, tenantId: TenantId) =>
          postgres.listAuditBySession(sessionId, tenantId),
        listEvidence: (query: AuditEvidenceQuery, tenantId: TenantId) =>
          postgres.listAuditEvidence(query, tenantId),
        summarizeEvidence: (
          filters: AuditEvidenceFilters,
          tenantId: TenantId
        ) => postgres.summarizeAuditEvidence(filters, tenantId),
        createAuditEvidenceCheckpoint: (
          input: AuditEvidenceCheckpointCreateInput,
          createdBy: string,
          tenantId: TenantId
        ) => postgres.createAuditEvidenceCheckpoint(input, createdBy, tenantId),
        getAuditEvidenceCheckpoint: (id: string, tenantId: TenantId) =>
          postgres.getAuditEvidenceCheckpoint(id, tenantId),
        listAuditEvidenceCheckpoints: (tenantId: TenantId) =>
          postgres.listAuditEvidenceCheckpoints(tenantId),
        transitionAuditEvidenceCheckpoint: (
          id: string,
          status: 'SEALED' | 'ARCHIVED',
          updatedBy: string,
          expectedStatus: 'SEALED' | 'ARCHIVED',
          tenantId: TenantId
        ) =>
          postgres.transitionAuditEvidenceCheckpoint(
            id,
            status,
            updatedBy,
            expectedStatus,
            tenantId
          )
      }
    }
  }

  const db = new InMemoryDatabase()
  const outbox = new OutboxRepository(db)
  return {
    memoryDb: db,
    sessionVersionPinning: true,
    outbox,
    journeys:
      journeyRepository !== undefined
        ? journeyRepository
        : new JourneyRepository(db),
    conversations: new ConversationRepository(db),
    apiCreation: new InMemoryApiCreation(db),
    authorizedWrites: null,
    tasks: new TaskRepository(db),
    approvals: new ApprovalRepository(db),
    audit: new AuditRepository(db)
  }
}

export type PostgresPersistenceConfig = Extract<
  NonNullable<BuildServerOptions['persistence']>,
  { kind: 'postgres' } | { kind: 'postgres-pool' }
>

/**
 * PostgreSQL persistence mode always exposes a concrete journey repository.
 * If the configured adapter cannot carry tenant-scoped transactions, startup
 * fails closed instead of hiding a missing adapter behind a cast.
 */
export function createPostgresJourneyRepository(
  config: PostgresPersistenceConfig
): PostgresJourneyRepository {
  if (config.kind === 'postgres-pool') {
    if (typeof config.pool?.connect !== 'function') {
      throw new Error(
        'PostgreSQL journey persistence requires a pool adapter with connect()'
      )
    }
    return new PostgresJourneyRepository(config.pool)
  }
  if (typeof config.client?.query !== 'function') {
    throw new Error(
      'PostgreSQL journey persistence requires a queryable persistence client'
    )
  }
  return new PostgresJourneyRepository(singleConnectionPool(config.client))
}

export function singleConnectionPool(
  client: PostgresQueryable
): PostgresPoolLike {
  const pooled: PostgresPoolClient = {
    query: (text, values) => client.query(text, values),
    release: () => undefined
  }
  return { connect: async () => pooled }
}
