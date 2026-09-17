import { randomUUID } from 'node:crypto'
import {
  ConversationError,
  isTerminalConversationStatus,
  type AcceptedTurn,
  type ConversationScope,
  type ConversationSnapshot,
  type ConversationStore,
  type DeliveryStatus,
  type ExecutionAuthorizationInput,
  type ExecutionClaim,
  type ExecutionClaimInput,
  type ExecutionOutcome,
  type MessageId,
  type TurnAcceptanceInput,
  type TurnCommitInput,
  type TurnCommitResult,
  type TurnId,
  type TurnRecord
} from './contracts.ts'
import {
  assertExecutionClaimFresh,
  assertWorkingMemory,
  createInitialSnapshot
} from './state.ts'
import { validateText } from './contracts.ts'

export interface ConversationSqlResult<
  Row extends Record<string, unknown> = Record<string, unknown>
> {
  readonly rows: readonly Row[]
  readonly rowCount?: number
}

export interface ConversationSqlClient {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<ConversationSqlResult<Row>>
  release(error?: Error): void
}

export interface ConversationSqlPool {
  connect(): Promise<ConversationSqlClient>
}

export interface ConversationTenantDatabase {
  withTenantContext<T>(
    tenantId: string,
    operation: (client: ConversationSqlClient) => Promise<T>
  ): Promise<T>
  withTenantTransaction<T>(
    tenantId: string,
    operation: (client: ConversationSqlClient) => Promise<T>
  ): Promise<T>
}

/**
 * Structural tenant adapter. Applications may instead inject the existing
 * persistence tenant wrappers; this local default keeps the optional package
 * independent of the product persistence aggregate.
 */
export function createConversationTenantDatabase(
  pool: ConversationSqlPool
): ConversationTenantDatabase {
  return {
    async withTenantContext<T>(
      tenantId: string,
      operation: (client: ConversationSqlClient) => Promise<T>
    ) {
      const client = await pool.connect()
      try {
        await setTenant(client, tenantId)
        const result = await operation(client)
        await clearTenant(client)
        client.release()
        return result
      } catch (error) {
        try {
          await clearTenant(client)
        } catch {
          client.release(toError(error))
          throw error
        }
        client.release(toError(error))
        throw error
      }
    },
    async withTenantTransaction<T>(
      tenantId: string,
      operation: (client: ConversationSqlClient) => Promise<T>
    ) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await setTenant(client, tenantId)
        const result = await operation(client)
        await clearTenant(client)
        await client.query('COMMIT')
        client.release()
        return result
      } catch (error) {
        try {
          await client.query('ROLLBACK')
        } catch {
          /* preserve original */
        }
        try {
          await clearTenant(client)
        } catch {
          client.release(toError(error))
          throw error
        }
        client.release(toError(error))
        throw error
      }
    }
  }
}

export interface PostgresConversationStoreOptions {
  readonly database: ConversationTenantDatabase
  readonly maxStateBytes?: number
}

interface SessionRow extends Record<string, unknown> {
  tenant_id: string
  conversation_id: string
  session_id: string
  profile_id: string
  profile_version: string
  status: ConversationSnapshot['status']
  state_version: number | string
  working_memory: unknown
  created_at: unknown
  updated_at: unknown
}

interface TurnRow extends Record<string, unknown> {
  tenant_id: string
  conversation_id: string
  session_id: string
  profile_id: string
  profile_version: string
  turn_id: string
  message_id: string
  correlation_id: string
  execution_id: string | null
  idempotency_key: string
  body: string
  status: TurnRecord['status']
  execution_status: TurnRecord['executionStatus'] | null
  interpretation: unknown
  plan_kind: TurnRecord['planKind'] | null
  response: unknown
  created_at: unknown
  updated_at: unknown
}

interface ExecutionRow extends Record<string, unknown> {
  operation_key: string
  turn_id: string
  proposal_hash: string
  status: ExecutionOutcome['status']
  execution_id: string
  lease_until: unknown
  lease_token: string | null
  approval_id: string | null
  effect_confirmed: boolean
  output: unknown
  response: string | null
  stop_reason: string | null
  evidence_refs: unknown
  recorded_at: unknown
}

/** PostgreSQL implementation with short CAS transactions and tenant scope. */
export class PostgresConversationStore implements ConversationStore {
  readonly #database: ConversationTenantDatabase
  readonly #maxStateBytes: number

  constructor(options: PostgresConversationStoreOptions) {
    this.#database = options.database
    this.#maxStateBytes = options.maxStateBytes ?? 32_000
  }

  async acceptTurn(input: TurnAcceptanceInput): Promise<AcceptedTurn> {
    validateText(input.text)
    validateInput(input)
    const scope = toScope(input)
    return this.#database.withTenantTransaction(
      String(scope.tenantId),
      async (client) => {
        let session = await this.loadSession(client, scope, true)
        if (!session) {
          const initial = createInitialSnapshot(scope, input.receivedAt)
          await client.query(
            `INSERT INTO cvg_conversation_sessions
             (tenant_id, conversation_id, session_id, profile_id, profile_version, status, state_version, working_memory, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9)
           ON CONFLICT DO NOTHING`,
            [
              String(scope.tenantId),
              String(scope.conversationId),
              String(scope.sessionId),
              String(scope.profileId),
              scope.profileVersion,
              initial.status,
              initial.stateVersion,
              JSON.stringify(initial.workingMemory),
              input.receivedAt
            ]
          )
          session = await this.loadSession(client, scope, true)
        }
        if (!session)
          throw new ConversationError(
            'PERSISTENCE_FAILURE',
            'Conversation session could not be created'
          )
        assertSessionScope(session, scope)
        const identityMatches = await this.findTurns(
          client,
          scope,
          input.messageId,
          input.idempotencyKey
        )
        const existingByTurn = await this.findTurnById(
          client,
          scope,
          input.turnId
        )
        const identityTurnIds = new Set(
          identityMatches.map((turn) => turn.turn_id)
        )
        if (
          identityTurnIds.size > 1 ||
          (existingByTurn &&
            [...identityTurnIds].some(
              (turnId) => turnId !== existingByTurn.turn_id
            ))
        ) {
          throw new ConversationError(
            'STATE_CONFLICT',
            'Message, idempotency and turn identities point to different turns'
          )
        }
        const existing = identityMatches[0]
        if (existing) {
          if (
            existing.body !== input.text ||
            existing.message_id !== String(input.messageId) ||
            existing.idempotency_key !== input.idempotencyKey
          ) {
            throw new ConversationError(
              'STATE_CONFLICT',
              'Message identity is already bound to another turn'
            )
          }
          return {
            turn: mapTurn(existing),
            snapshot: mapSnapshot(session, scope),
            replayed: true
          }
        }
        if (existingByTurn) {
          if (
            existingByTurn.message_id !== String(input.messageId) ||
            existingByTurn.idempotency_key !== input.idempotencyKey ||
            existingByTurn.body !== input.text
          ) {
            throw new ConversationError(
              'STATE_CONFLICT',
              'Turn identity is already bound to another message'
            )
          }
          return {
            turn: mapTurn(existingByTurn),
            snapshot: mapSnapshot(session, scope),
            replayed: true
          }
        }
        if (isTerminalConversationStatus(session.status)) {
          throw new ConversationError(
            'STATE_CONFLICT',
            'Conversation is terminal and cannot accept a new turn'
          )
        }
        await client.query(
          `INSERT INTO cvg_conversation_messages
           (tenant_id, conversation_id, turn_id, message_id, direction, body, created_at)
         VALUES ($1, $2, $3, $4, 'inbound', $5, $6)`,
          [
            String(scope.tenantId),
            String(scope.conversationId),
            String(input.turnId),
            String(input.messageId),
            input.text,
            input.receivedAt
          ]
        )
        const turn = await insertTurn(client, input, scope)
        return {
          turn: mapTurn(turn),
          snapshot: mapSnapshot(session, scope),
          replayed: false
        }
      }
    )
  }

  async load(scope: ConversationScope): Promise<ConversationSnapshot | null> {
    return this.#database.withTenantContext(
      String(scope.tenantId),
      async (client) => {
        const session = await this.loadSession(client, scope, false)
        if (!session) return null
        assertSessionScope(session, scope)
        return mapSnapshot(session, scope)
      }
    )
  }

  async commitTurn(input: TurnCommitInput): Promise<TurnCommitResult> {
    assertWorkingMemory(input.memory)
    const scope = input.scope
    return this.#database.withTenantTransaction(
      String(scope.tenantId),
      async (client) => {
        const session = await this.loadSession(client, scope, true)
        if (!session)
          throw new ConversationError(
            'PERSISTENCE_FAILURE',
            'Conversation session does not exist'
          )
        assertSessionScope(session, scope)
        const turn = await this.findTurnById(client, scope, input.turnId)
        if (!turn)
          throw new ConversationError(
            'PERSISTENCE_FAILURE',
            'Turn does not exist'
          )
        if (turn.status !== 'ACCEPTED' && turn.status !== 'PROCESSING') {
          return { turn: mapTurn(turn), snapshot: mapSnapshot(session, scope) }
        }
        if (Number(session.state_version) !== input.expectedStateVersion) {
          throw new ConversationError(
            'STATE_CONFLICT',
            'Conversation state version changed'
          )
        }
        const serialized = JSON.stringify(input.memory)
        if (Buffer.byteLength(serialized, 'utf8') > this.#maxStateBytes) {
          throw new ConversationError(
            'INVALID_INPUT',
            'Working memory exceeds the persistence bound'
          )
        }
        const sessionUpdate = await client.query(
          `UPDATE cvg_conversation_sessions
            SET status = $3, state_version = state_version + 1, working_memory = $4::jsonb, updated_at = $5
          WHERE tenant_id = $1 AND conversation_id = $2 AND state_version = $6`,
          [
            String(scope.tenantId),
            String(scope.conversationId),
            input.conversationStatus,
            serialized,
            input.now,
            input.expectedStateVersion
          ]
        )
        if (
          sessionUpdate.rowCount !== undefined &&
          sessionUpdate.rowCount !== 1
        ) {
          throw new ConversationError(
            'STATE_CONFLICT',
            'Conversation state CAS did not update exactly one session'
          )
        }
        const responseJson = JSON.stringify(input.response)
        const turnUpdate = await client.query(
          `UPDATE cvg_conversation_turns
            SET status = $4, execution_status = $5, execution_id = $6, interpretation = $7::jsonb, plan_kind = $8,
                response = $9::jsonb, updated_at = $10
          WHERE tenant_id = $1 AND conversation_id = $2 AND turn_id = $3`,
          [
            String(scope.tenantId),
            String(scope.conversationId),
            String(input.turnId),
            input.status,
            input.executionStatus ?? null,
            input.executionId ? String(input.executionId) : null,
            JSON.stringify(input.interpretation),
            input.planKind,
            responseJson,
            input.now
          ]
        )
        if (turnUpdate.rowCount !== undefined && turnUpdate.rowCount !== 1) {
          throw new ConversationError(
            'STATE_CONFLICT',
            'Conversation turn CAS did not update exactly one turn'
          )
        }
        const [nextSession, nextTurn] = await Promise.all([
          this.loadSession(client, scope, false),
          this.findTurnById(client, scope, input.turnId)
        ])
        if (!nextSession || !nextTurn)
          throw new ConversationError(
            'PERSISTENCE_FAILURE',
            'Committed turn could not be reloaded'
          )
        return {
          turn: mapTurn(nextTurn),
          snapshot: mapSnapshot(nextSession, scope)
        }
      }
    )
  }

  async getTurn(
    scope: ConversationScope,
    turnId: TurnId
  ): Promise<TurnRecord | null> {
    return this.#database.withTenantContext(
      String(scope.tenantId),
      async (client) => {
        const session = await this.loadSession(client, scope, false)
        if (!session) return null
        assertSessionScope(session, scope)
        const row = await this.findTurnById(client, scope, turnId)
        return row ? mapTurn(row) : null
      }
    )
  }

  async getTurnByMessage(
    scope: ConversationScope,
    messageId: MessageId
  ): Promise<TurnRecord | null> {
    return this.#database.withTenantContext(
      String(scope.tenantId),
      async (client) => {
        const session = await this.loadSession(client, scope, false)
        if (!session) return null
        assertSessionScope(session, scope)
        const row = await this.findTurn(client, scope, messageId, undefined)
        return row ? mapTurn(row) : null
      }
    )
  }

  async updateDelivery(
    scope: ConversationScope,
    turnId: TurnId,
    deliveryStatus: DeliveryStatus
  ): Promise<TurnRecord> {
    return this.#database.withTenantTransaction(
      String(scope.tenantId),
      async (client) => {
        const session = await this.loadSession(client, scope, true)
        if (!session)
          throw new ConversationError(
            'PERSISTENCE_FAILURE',
            'Conversation session does not exist'
          )
        assertSessionScope(session, scope)
        const turn = await this.findTurnById(client, scope, turnId)
        if (!turn)
          throw new ConversationError(
            'PERSISTENCE_FAILURE',
            'Turn does not exist'
          )
        const response = parseJsonObject(turn.response, 'response')
        const next = { ...response, deliveryStatus }
        await client.query(
          `UPDATE cvg_conversation_turns SET response = $4::jsonb, updated_at = $5
          WHERE tenant_id = $1 AND conversation_id = $2 AND turn_id = $3`,
          [
            String(scope.tenantId),
            String(scope.conversationId),
            String(turnId),
            JSON.stringify(next),
            new Date().toISOString()
          ]
        )
        const updated = await this.findTurnById(client, scope, turnId)
        if (!updated)
          throw new ConversationError(
            'PERSISTENCE_FAILURE',
            'Updated turn could not be reloaded'
          )
        return mapTurn(updated)
      }
    )
  }

  async claimExecution(input: ExecutionClaimInput): Promise<ExecutionClaim> {
    const scope = input.scope
    const leaseSeconds = 30
    const leaseToken = randomUUID()
    return this.#database.withTenantTransaction(
      String(scope.tenantId),
      async (client) => {
        const session = await this.loadSession(client, scope, true)
        if (!session)
          throw new ConversationError(
            'PERSISTENCE_FAILURE',
            'Conversation session does not exist'
          )
        assertSessionScope(session, scope)
        const ownerTurn = await this.findTurnById(client, scope, input.turnId)
        if (!ownerTurn) {
          throw new ConversationError(
            'PERSISTENCE_FAILURE',
            'Execution turn does not exist in the conversation'
          )
        }
        const result = await client.query<ExecutionRow>(
          `SELECT operation_key, turn_id, proposal_hash, status, execution_id, lease_until, lease_token, approval_id, effect_confirmed,
                output, response, stop_reason, evidence_refs, recorded_at
           FROM cvg_conversation_execution_claims
          WHERE tenant_id = $1 AND conversation_id = $2 AND operation_key = $3
          FOR UPDATE`,
          [
            String(scope.tenantId),
            String(scope.conversationId),
            input.proposal.operationKey
          ]
        )
        let existing = result.rows[0]
        if (!existing) {
          assertExecutionClaimFresh({
            snapshot: mapSnapshot(session, scope),
            proposal: input.proposal,
            turnId: input.turnId,
            expectedStateVersion: input.expectedStateVersion,
            ...(input.approvalResume
              ? { approvalResume: input.approvalResume }
              : {})
          })
          const inserted = await client.query<{ operation_key: string }>(
            `INSERT INTO cvg_conversation_execution_claims
             (tenant_id, conversation_id, operation_key, turn_id, proposal_hash, status, execution_id, lease_until, lease_token, effect_confirmed, evidence_refs, recorded_at)
           VALUES ($1, $2, $3, $4, $5, 'IN_FLIGHT', $6, now() + ($8::text || ' seconds')::interval, $9, false, '[]'::jsonb, $7)
           ON CONFLICT (tenant_id, conversation_id, operation_key) DO NOTHING
           RETURNING operation_key`,
            [
              String(scope.tenantId),
              String(scope.conversationId),
              input.proposal.operationKey,
              String(input.turnId),
              input.proposal.proposalHash,
              String(input.executionId),
              new Date().toISOString(),
              leaseSeconds,
              leaseToken
            ]
          )
          if (inserted.rowCount === 1 || inserted.rows.length === 1)
            return { kind: 'EXECUTE', leaseToken, turnId: input.turnId }
          const reread = await client.query<ExecutionRow>(
            `SELECT operation_key, turn_id, proposal_hash, status, execution_id, lease_until, lease_token, approval_id, effect_confirmed,
                  output, response, stop_reason, evidence_refs, recorded_at
             FROM cvg_conversation_execution_claims
            WHERE tenant_id = $1 AND conversation_id = $2 AND operation_key = $3
            FOR UPDATE`,
            [
              String(scope.tenantId),
              String(scope.conversationId),
              input.proposal.operationKey
            ]
          )
          existing = reread.rows[0]
          if (!existing)
            throw new ConversationError(
              'PERSISTENCE_FAILURE',
              'Execution reservation could not be read after a concurrent insert'
            )
        }
        if (existing.proposal_hash !== input.proposal.proposalHash) {
          throw new ConversationError(
            'STATE_CONFLICT',
            'Operation key is bound to another proposal'
          )
        }
        const outcome = mapOutcome(existing, input.proposal.operationKey)
        if (
          outcome.status === 'IN_FLIGHT' &&
          isLeaseExpired(outcome.leaseUntil)
        ) {
          const reclaimedToken = randomUUID()
          const reclaimed = await client.query<ExecutionRow>(
            `UPDATE cvg_conversation_execution_claims
                SET lease_until = now() + ($5::text || ' seconds')::interval,
                    lease_token = $4, recorded_at = $6
              WHERE tenant_id = $1 AND conversation_id = $2 AND operation_key = $3
                AND status = 'IN_FLIGHT' AND lease_until <= now()
              RETURNING operation_key, turn_id, proposal_hash, status, execution_id, lease_until, lease_token, approval_id,
                        effect_confirmed, output, response, stop_reason, evidence_refs, recorded_at`,
            [
              String(scope.tenantId),
              String(scope.conversationId),
              input.proposal.operationKey,
              reclaimedToken,
              leaseSeconds,
              new Date().toISOString()
            ]
          )
          const reclaimedRow = reclaimed.rows[0]
          if (!reclaimedRow)
            throw new ConversationError(
              'STATE_CONFLICT',
              'Expired execution lease was claimed by another worker'
            )
          return {
            kind: 'STALE',
            outcome: mapOutcome(reclaimedRow, input.proposal.operationKey)
          }
        }
        if (outcome.status === 'IN_FLIGHT')
          return { kind: 'IN_FLIGHT', outcome }
        if (outcome.status === 'WAITING_APPROVAL') {
          if (input.approvalResume) {
            assertExecutionClaimFresh({
              snapshot: mapSnapshot(session, scope),
              proposal: input.proposal,
              turnId: input.turnId,
              expectedStateVersion: input.expectedStateVersion,
              approvalResume: input.approvalResume
            })
          }
          const approved =
            input.approvalResume?.authenticated === true &&
            input.approvalResume.approvalId === outcome.approvalId &&
            input.approvalResume.proposalHash === outcome.proposalHash &&
            input.approvalResume.operationKey === outcome.operationKey &&
            (input.approvalResume.executionId === undefined ||
              input.approvalResume.executionId === outcome.executionId)
          if (!approved) return { kind: 'WAITING_APPROVAL', outcome }
          const resumedToken = randomUUID()
          await client.query(
            `UPDATE cvg_conversation_execution_claims SET status = 'IN_FLIGHT', lease_until = now() + ($5::text || ' seconds')::interval, lease_token = $6, recorded_at = $4
            WHERE tenant_id = $1 AND conversation_id = $2 AND operation_key = $3`,
            [
              String(scope.tenantId),
              String(scope.conversationId),
              input.proposal.operationKey,
              new Date().toISOString(),
              leaseSeconds,
              resumedToken
            ]
          )
          return {
            kind: 'EXECUTE',
            leaseToken: resumedToken,
            turnId: outcome.turnId
          }
        }
        return { kind: 'REPLAY', outcome }
      }
    )
  }

  async authorizeExecution(input: ExecutionAuthorizationInput): Promise<void> {
    const scope = input.scope
    return this.#database.withTenantTransaction(
      String(scope.tenantId),
      async (client) => {
        const session = await this.loadSession(client, scope, true)
        if (!session)
          throw new ConversationError(
            'PERSISTENCE_FAILURE',
            'Conversation session does not exist'
          )
        assertSessionScope(session, scope)
        const ownerTurn = await this.findTurnById(client, scope, input.turnId)
        if (!ownerTurn) {
          throw new ConversationError(
            'PERSISTENCE_FAILURE',
            'Execution turn does not exist in the conversation'
          )
        }
        // Lock the session and reservation together. If a correction commits
        // first, this read observes its new state version and fails closed;
        // if this transaction commits first, authorization is the ordering
        // point for the external Harness call.
        assertExecutionClaimFresh({
          snapshot: mapSnapshot(session, scope),
          proposal: input.proposal,
          turnId: input.turnId,
          expectedStateVersion: input.expectedStateVersion,
          ...(input.approvalResume
            ? { approvalResume: input.approvalResume }
            : {})
        })
        const result = await client.query<ExecutionRow>(
          `SELECT operation_key, turn_id, proposal_hash, status, execution_id, lease_until, lease_token, approval_id, effect_confirmed,
                output, response, stop_reason, evidence_refs, recorded_at
           FROM cvg_conversation_execution_claims
          WHERE tenant_id = $1 AND conversation_id = $2 AND operation_key = $3
          FOR UPDATE`,
          [
            String(scope.tenantId),
            String(scope.conversationId),
            input.proposal.operationKey
          ]
        )
        const current = result.rows[0]
        const outcome = current
          ? mapOutcome(current, input.proposal.operationKey)
          : null
        if (
          !outcome ||
          outcome.status !== 'IN_FLIGHT' ||
          outcome.proposalHash !== input.proposal.proposalHash ||
          outcome.turnId !== input.turnId ||
          outcome.executionId !== input.executionId ||
          outcome.leaseToken !== input.leaseToken ||
          isLeaseExpired(outcome.leaseUntil)
        ) {
          throw new ConversationError(
            'STATE_CONFLICT',
            'Execution reservation is no longer authorized for the effect'
          )
        }
      }
    )
  }

  async finalizeExecution(
    scope: ConversationScope,
    outcome: ExecutionOutcome
  ): Promise<void> {
    return this.#database.withTenantTransaction(
      String(scope.tenantId),
      async (client) => {
        const session = await this.loadSession(client, scope, true)
        if (!session)
          throw new ConversationError(
            'PERSISTENCE_FAILURE',
            'Conversation session does not exist'
          )
        assertSessionScope(session, scope)
        const result = await client.query(
          `UPDATE cvg_conversation_execution_claims
            SET status = $4, execution_id = $5, lease_until = NULL, lease_token = NULL, approval_id = $6, effect_confirmed = $7,
                output = $8::jsonb, response = $9, stop_reason = $10, evidence_refs = $11::jsonb, recorded_at = $12
          WHERE tenant_id = $1 AND conversation_id = $2 AND operation_key = $3
            AND turn_id = $13 AND proposal_hash = $14 AND execution_id = $5
            AND status = 'IN_FLIGHT'
            AND $15::text IS NOT NULL AND lease_token = $15`,
          [
            String(scope.tenantId),
            String(scope.conversationId),
            outcome.operationKey,
            outcome.status,
            String(outcome.executionId),
            outcome.approvalId ?? null,
            outcome.effectConfirmed,
            outcome.output === undefined
              ? null
              : JSON.stringify(outcome.output),
            outcome.response ?? null,
            outcome.stopReason ?? null,
            JSON.stringify(outcome.evidenceRefs),
            outcome.recordedAt,
            String(outcome.turnId),
            outcome.proposalHash,
            outcome.leaseToken ?? null
          ]
        )
        if (result.rowCount !== undefined && result.rowCount !== 1) {
          throw new ConversationError(
            'STATE_CONFLICT',
            'Execution reservation was already finalized or changed'
          )
        }
      }
    )
  }

  private async loadSession(
    client: ConversationSqlClient,
    scope: ConversationScope,
    forUpdate: boolean
  ): Promise<SessionRow | null> {
    const result = await client.query<SessionRow>(
      `SELECT tenant_id, conversation_id, session_id, profile_id, profile_version, status,
              state_version, working_memory, created_at, updated_at
         FROM cvg_conversation_sessions
        WHERE tenant_id = $1 AND conversation_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
      [String(scope.tenantId), String(scope.conversationId)]
    )
    return result.rows[0] ?? null
  }

  private async findTurn(
    client: ConversationSqlClient,
    scope: ConversationScope,
    messageId: MessageId,
    idempotencyKey: string | undefined
  ): Promise<TurnRow | null> {
    const rows = await this.findTurns(client, scope, messageId, idempotencyKey)
    return rows[0] ?? null
  }

  private async findTurns(
    client: ConversationSqlClient,
    scope: ConversationScope,
    messageId: MessageId,
    idempotencyKey: string | undefined
  ): Promise<readonly TurnRow[]> {
    const result = await client.query<TurnRow>(
      `SELECT tenant_id, conversation_id, session_id, profile_id, profile_version, turn_id,
              message_id, correlation_id, execution_id, idempotency_key, body, status,
              execution_status, interpretation, plan_kind, response, created_at, updated_at
         FROM cvg_conversation_turns
        WHERE tenant_id = $1 AND conversation_id = $2
          AND (message_id = $3 OR ($4::text IS NOT NULL AND idempotency_key = $4::text))
        ORDER BY created_at ASC, turn_id ASC`,
      [
        String(scope.tenantId),
        String(scope.conversationId),
        String(messageId),
        idempotencyKey ?? null
      ]
    )
    return result.rows
  }

  private async findTurnById(
    client: ConversationSqlClient,
    scope: ConversationScope,
    turnId: TurnId
  ): Promise<TurnRow | null> {
    const result = await client.query<TurnRow>(
      `SELECT tenant_id, conversation_id, session_id, profile_id, profile_version, turn_id,
              message_id, correlation_id, execution_id, idempotency_key, body, status,
              execution_status, interpretation, plan_kind, response, created_at, updated_at
         FROM cvg_conversation_turns
        WHERE tenant_id = $1 AND conversation_id = $2 AND turn_id = $3`,
      [String(scope.tenantId), String(scope.conversationId), String(turnId)]
    )
    return result.rows[0] ?? null
  }
}

async function insertTurn(
  client: ConversationSqlClient,
  input: TurnAcceptanceInput,
  scope: ConversationScope
): Promise<TurnRow> {
  await client.query(
    `INSERT INTO cvg_conversation_turns
       (tenant_id, conversation_id, session_id, profile_id, profile_version, turn_id, message_id,
        correlation_id, execution_id, idempotency_key, body, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACCEPTED', $12, $12)`,
    [
      String(scope.tenantId),
      String(scope.conversationId),
      String(scope.sessionId),
      String(scope.profileId),
      scope.profileVersion,
      String(input.turnId),
      String(input.messageId),
      String(input.correlationId),
      // Execution identity is allocated by claimExecution, never trusted
      // from the inbound transport envelope.
      null,
      input.idempotencyKey,
      input.text,
      input.receivedAt
    ]
  )
  const result = await client.query<TurnRow>(
    `SELECT tenant_id, conversation_id, session_id, profile_id, profile_version, turn_id,
            message_id, correlation_id, execution_id, idempotency_key, body, status,
            execution_status, interpretation, plan_kind, response, created_at, updated_at
       FROM cvg_conversation_turns
      WHERE tenant_id = $1 AND conversation_id = $2 AND turn_id = $3`,
    [String(scope.tenantId), String(scope.conversationId), String(input.turnId)]
  )
  const row = result.rows[0]
  if (!row)
    throw new ConversationError(
      'PERSISTENCE_FAILURE',
      'Inserted turn could not be reloaded'
    )
  return row
}

function mapSnapshot(
  row: SessionRow,
  scope: ConversationScope
): ConversationSnapshot {
  const memory = parseJsonObject(
    row.working_memory,
    'working_memory'
  ) as unknown as ConversationSnapshot['workingMemory']
  assertWorkingMemory(memory)
  return {
    scope,
    status: row.status,
    stateVersion: Number(row.state_version),
    workingMemory: memory,
    createdAt: dateString(row.created_at),
    updatedAt: dateString(row.updated_at)
  }
}

function mapTurn(row: TurnRow): TurnRecord {
  return {
    identity: {
      tenantId: row.tenant_id as TurnRecord['identity']['tenantId'],
      conversationId:
        row.conversation_id as TurnRecord['identity']['conversationId'],
      sessionId: row.session_id as TurnRecord['identity']['sessionId'],
      profileId: row.profile_id as TurnRecord['identity']['profileId'],
      profileVersion: row.profile_version,
      turnId: row.turn_id as TurnId,
      messageId: row.message_id as MessageId,
      correlationId:
        row.correlation_id as TurnRecord['identity']['correlationId'],
      ...(row.execution_id
        ? {
            executionId:
              row.execution_id as TurnRecord['identity']['executionId']
          }
        : {})
    },
    idempotencyKey: row.idempotency_key,
    text: row.body,
    status: row.status,
    ...(row.execution_status ? { executionStatus: row.execution_status } : {}),
    ...(row.interpretation
      ? {
          interpretation: parseJsonObject(
            row.interpretation,
            'interpretation'
          ) as unknown as TurnRecord['interpretation']
        }
      : {}),
    ...(row.plan_kind ? { planKind: row.plan_kind } : {}),
    ...(row.response
      ? {
          response: parseJsonObject(
            row.response,
            'response'
          ) as unknown as TurnRecord['response']
        }
      : {}),
    createdAt: dateString(row.created_at),
    updatedAt: dateString(row.updated_at)
  }
}

function mapOutcome(row: ExecutionRow, operationKey: string): ExecutionOutcome {
  return {
    status: row.status,
    turnId: row.turn_id as TurnId,
    executionId: row.execution_id as ExecutionOutcome['executionId'],
    proposalHash: row.proposal_hash,
    operationKey,
    ...(row.approval_id ? { approvalId: row.approval_id } : {}),
    effectConfirmed: row.effect_confirmed,
    ...(row.output !== null && row.output !== undefined
      ? { output: row.output as ExecutionOutcome['output'] }
      : {}),
    ...(row.response ? { response: row.response } : {}),
    ...(row.stop_reason ? { stopReason: row.stop_reason } : {}),
    evidenceRefs: Array.isArray(row.evidence_refs)
      ? row.evidence_refs.filter(
          (item): item is string => typeof item === 'string'
        )
      : [],
    recordedAt: dateString(row.recorded_at),
    ...(row.lease_until ? { leaseUntil: dateString(row.lease_until) } : {}),
    ...(row.lease_token ? { leaseToken: row.lease_token } : {})
  }
}

function isLeaseExpired(value: string | undefined): boolean {
  return Boolean(value && new Date(value).getTime() <= Date.now())
}

function assertSessionScope(row: SessionRow, scope: ConversationScope): void {
  if (row.tenant_id !== String(scope.tenantId))
    throw new ConversationError(
      'TENANT_MISMATCH',
      'Stored tenant does not match scope'
    )
  if (
    row.conversation_id !== String(scope.conversationId) ||
    row.session_id !== String(scope.sessionId)
  )
    throw new ConversationError(
      'STATE_CONFLICT',
      'Stored conversation identity does not match scope'
    )
  if (
    row.profile_id !== String(scope.profileId) ||
    row.profile_version !== scope.profileVersion
  )
    throw new ConversationError(
      'PROFILE_MISMATCH',
      'Stored profile is not the requested pinned profile'
    )
}

function validateInput(input: TurnAcceptanceInput): void {
  if (
    !input.tenantId ||
    !input.conversationId ||
    !input.sessionId ||
    !input.profileId ||
    !input.profileVersion ||
    !input.turnId ||
    !input.messageId ||
    !input.correlationId ||
    !input.idempotencyKey
  )
    throw new ConversationError(
      'INVALID_INPUT',
      'Complete conversation identity is required'
    )
  if (
    String(input.profile.id) !== String(input.profileId) ||
    input.profile.version !== input.profileVersion
  )
    throw new ConversationError(
      'PROFILE_MISMATCH',
      'Profile is not pinned to identity'
    )
  for (const [label, value] of Object.entries({
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    turnId: input.turnId,
    messageId: input.messageId,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey
  })) {
    if (typeof value !== 'string' || value.length > 200) {
      throw new ConversationError('INVALID_INPUT', `${label} is outside bounds`)
    }
  }
}

function toScope(input: TurnAcceptanceInput): ConversationScope {
  return {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    profileId: input.profileId,
    profileVersion: input.profileVersion
  }
}

async function setTenant(
  client: ConversationSqlClient,
  tenantId: string
): Promise<void> {
  if (!tenantId.trim())
    throw new ConversationError('INVALID_INPUT', 'Tenant is required')
  await client.query("SELECT set_config('cvg.tenant_id', $1, false)", [
    tenantId
  ])
}

async function clearTenant(client: ConversationSqlClient): Promise<void> {
  await client.query("SELECT set_config('cvg.tenant_id', '', false)")
}

function parseJsonObject(
  value: unknown,
  label: string
): Record<string, unknown> {
  const parsed = typeof value === 'string' ? safeJsonParse(value) : value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new ConversationError(
      'PERSISTENCE_FAILURE',
      `${label} JSON is invalid`
    )
  return parsed as Record<string, unknown>
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new ConversationError(
      'PERSISTENCE_FAILURE',
      'Persisted JSON is invalid'
    )
  }
}

function dateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  const result = new Date(String(value))
  if (Number.isNaN(result.getTime()))
    throw new ConversationError(
      'PERSISTENCE_FAILURE',
      'Persisted timestamp is invalid'
    )
  return result.toISOString()
}

function toError(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error('conversation PostgreSQL connection failure')
}
