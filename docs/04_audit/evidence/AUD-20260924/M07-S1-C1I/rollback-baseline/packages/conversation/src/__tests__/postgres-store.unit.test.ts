import { describe, expect, it } from 'vitest'
import {
  createConversationTenantDatabase,
  PostgresConversationStore,
  type ConversationSqlClient,
  type ConversationSqlPool,
  type ConversationSqlResult,
  type ConversationTenantDatabase
} from '../postgres-store.ts'
import {
  ConversationError,
  type ActionProposal,
  type AuthenticatedApprovalResume,
  type ConversationProfile,
  type ConversationScope,
  type DialogueInterpretation,
  type ExecutionOutcome,
  type TurnAcceptanceInput,
  type TurnCommitInput,
  type WorkingMemory
} from '../contracts.ts'
import { createEmptyWorkingMemory, createInitialSnapshot } from '../state.ts'

type Row = Record<string, unknown>

const now = '2026-09-24T00:00:00.000Z'
const scope: ConversationScope = {
  tenantId: 'tenant-synthetic' as ConversationScope['tenantId'],
  conversationId: 'conversation-synthetic' as ConversationScope['conversationId'],
  sessionId: 'session-synthetic' as ConversationScope['sessionId'],
  profileId: 'profile-synthetic' as ConversationScope['profileId'],
  profileVersion: 'profile-v1'
}
const profile = {
  id: scope.profileId,
  version: scope.profileVersion
} as ConversationProfile
const initialMemory = createInitialSnapshot(scope, now).workingMemory
const turnId = 'turn-synthetic' as TurnAcceptanceInput['turnId']
const messageId = 'message-synthetic' as TurnAcceptanceInput['messageId']
const executionId = 'execution-synthetic' as ExecutionOutcome['executionId']

function queryResult<ResultRow extends Record<string, unknown>>(
  rows: readonly Row[] = [],
  rowCount?: number
): ConversationSqlResult<ResultRow> {
  return {
    rows: rows as unknown as readonly ResultRow[],
    ...(rowCount === undefined ? {} : { rowCount })
  }
}

function sessionRow(overrides: Row = {}): Row {
  return {
    tenant_id: String(scope.tenantId),
    conversation_id: String(scope.conversationId),
    session_id: String(scope.sessionId),
    profile_id: String(scope.profileId),
    profile_version: scope.profileVersion,
    status: 'ACTIVE',
    state_version: 0,
    working_memory: structuredClone(initialMemory),
    created_at: now,
    updated_at: now,
    ...overrides
  }
}

function turnRow(overrides: Row = {}): Row {
  return {
    tenant_id: String(scope.tenantId),
    conversation_id: String(scope.conversationId),
    session_id: String(scope.sessionId),
    profile_id: String(scope.profileId),
    profile_version: scope.profileVersion,
    turn_id: String(turnId),
    message_id: String(messageId),
    correlation_id: 'correlation-synthetic',
    execution_id: null,
    idempotency_key: 'idem-synthetic',
    body: 'Olá',
    status: 'ACCEPTED',
    execution_status: null,
    interpretation: null,
    plan_kind: null,
    response: null,
    created_at: now,
    updated_at: now,
    ...overrides
  }
}

function acceptanceInput(overrides: Partial<TurnAcceptanceInput> = {}): TurnAcceptanceInput {
  return {
    ...scope,
    turnId,
    messageId,
    correlationId: 'correlation-synthetic' as TurnAcceptanceInput['correlationId'],
    text: 'Olá',
    idempotencyKey: 'idem-synthetic',
    receivedAt: now,
    profile,
    ...overrides
  }
}

function proposal(overrides: Partial<ActionProposal> = {}): ActionProposal {
  return {
    proposalId: 'proposal-synthetic',
    action: 'CREATE',
    capabilityId: 'synthetic-capability',
    capabilityVersion: '1',
    payload: { draft: true },
    proposalHash: 'proposal-hash-synthetic',
    operationKey: 'operation-synthetic',
    requiresApproval: false,
    entityVersions: {},
    createdTurnId: turnId,
    status: 'DRAFT',
    createdAt: now,
    ...overrides
  }
}

function executionRow(overrides: Row = {}): Row {
  return {
    operation_key: 'operation-synthetic',
    turn_id: String(turnId),
    proposal_hash: 'proposal-hash-synthetic',
    status: 'IN_FLIGHT',
    execution_id: String(executionId),
    lease_until: new Date(Date.now() + 60_000).toISOString(),
    lease_token: 'lease-synthetic',
    approval_id: null,
    effect_confirmed: false,
    output: null,
    response: null,
    stop_reason: null,
    evidence_refs: ['synthetic-evidence', 3],
    recorded_at: now,
    ...overrides
  }
}

interface StoreState {
  session: Row | null
  turns: Row[]
  messages: Row[]
  claims: Map<string, Row>
  loseNextReclaim: boolean
  raceOnNextInsert: boolean
  raceClaim: Row | null
  failSessionCas: boolean
  failTurnCas: boolean
  ignoreSessionScope: boolean
}

function makeStoreFixture(options: {
  session?: Row | null
  turns?: Row[]
  claims?: Row[]
  maxStateBytes?: number
  ignoreSessionScope?: boolean
} = {}) {
  const state: StoreState = {
    session: options.session === undefined ? null : options.session,
    turns: options.turns ?? [],
    messages: [],
    claims: new Map((options.claims ?? []).map((row) => [String(row.operation_key), row])),
    loseNextReclaim: false,
    raceOnNextInsert: false,
    raceClaim: null,
    failSessionCas: false,
    failTurnCas: false,
    ignoreSessionScope: options.ignoreSessionScope ?? false
  }
  const statements: string[] = []
  const tenantOperations: string[] = []
  const client: ConversationSqlClient = {
    async query<ResultRow extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      values: readonly unknown[] = []
    ): Promise<ConversationSqlResult<ResultRow>> {
      const sql = text.trim().replace(/\s+/gu, ' ')
      statements.push(sql)
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return queryResult<ResultRow>()
      }
      if (sql.includes('FROM cvg_conversation_sessions') && sql.startsWith('SELECT')) {
        const row = state.session
        return queryResult<ResultRow>(row && (state.ignoreSessionScope ||
          (row.tenant_id === values[0] && row.conversation_id === values[1]))
          ? [row]
          : [])
      }
      if (sql.startsWith('INSERT INTO cvg_conversation_sessions')) {
        if (!state.session) {
          state.session = sessionRow({
            tenant_id: values[0],
            conversation_id: values[1],
            session_id: values[2],
            profile_id: values[3],
            profile_version: values[4],
            status: values[5],
            state_version: values[6],
            working_memory: JSON.parse(String(values[7])) as WorkingMemory,
            created_at: values[8],
            updated_at: values[8]
          })
        }
        return queryResult<ResultRow>()
      }
      if (sql.includes('FROM cvg_conversation_turns') && sql.startsWith('SELECT')) {
        if (sql.includes('(message_id = $3 OR')) {
          const matches = state.turns.filter((row) => row.tenant_id === values[0] &&
            row.conversation_id === values[1] &&
            (row.message_id === values[2] || (values[3] !== null && row.idempotency_key === values[3])))
          return queryResult<ResultRow>(matches)
        }
        return queryResult<ResultRow>(state.turns.filter((row) => row.tenant_id === values[0] &&
          row.conversation_id === values[1] && row.turn_id === values[2]).slice(0, 1))
      }
      if (sql.startsWith('INSERT INTO cvg_conversation_messages')) {
        state.messages.push({
          tenant_id: values[0],
          conversation_id: values[1],
          turn_id: values[2],
          message_id: values[3],
          body: values[4],
          created_at: values[5]
        })
        return queryResult<ResultRow>()
      }
      if (sql.startsWith('INSERT INTO cvg_conversation_turns')) {
        state.turns.push(turnRow({
          tenant_id: values[0],
          conversation_id: values[1],
          session_id: values[2],
          profile_id: values[3],
          profile_version: String(values[4]),
          turn_id: String(values[5]),
          message_id: String(values[6]),
          correlation_id: String(values[7]),
          execution_id: values[8] as string | null,
          idempotency_key: String(values[9]),
          body: String(values[10]),
          created_at: values[11],
          updated_at: values[11]
        }))
        return queryResult<ResultRow>()
      }
      if (sql.startsWith('UPDATE cvg_conversation_sessions')) {
        if (state.failSessionCas) {
          state.failSessionCas = false
          return queryResult<ResultRow>([], 0)
        }
        if (!state.session || Number(state.session.state_version) !== Number(values[5])) {
          return queryResult<ResultRow>([], 0)
        }
        state.session = {
          ...state.session,
          status: values[2],
          state_version: Number(state.session.state_version) + 1,
          working_memory: JSON.parse(String(values[3])) as WorkingMemory,
          updated_at: values[4]
        }
        return queryResult<ResultRow>([], 1)
      }
      if (sql.startsWith('UPDATE cvg_conversation_turns SET status')) {
        if (state.failTurnCas) {
          state.failTurnCas = false
          return queryResult<ResultRow>([], 0)
        }
        const row = state.turns.find((entry) => entry.tenant_id === values[0] &&
          entry.conversation_id === values[1] && entry.turn_id === values[2])
        if (!row) return queryResult<ResultRow>([], 0)
        Object.assign(row, {
          status: values[3],
          execution_status: values[4],
          execution_id: values[5],
          interpretation: values[6],
          plan_kind: values[7],
          response: values[8],
          updated_at: values[9]
        })
        return queryResult<ResultRow>([], 1)
      }
      if (sql.startsWith('UPDATE cvg_conversation_turns SET response')) {
        const row = state.turns.find((entry) => entry.tenant_id === values[0] &&
          entry.conversation_id === values[1] && entry.turn_id === values[2])
        if (!row) return queryResult<ResultRow>([], 0)
        row.response = values[3]
        row.updated_at = values[4]
        return queryResult<ResultRow>([], 1)
      }
      if (sql.includes('FROM cvg_conversation_execution_claims') && sql.startsWith('SELECT')) {
        const row = state.claims.get(String(values[2]))
        return queryResult<ResultRow>(row ? [row] : [])
      }
      if (sql.startsWith('INSERT INTO cvg_conversation_execution_claims')) {
        if (state.raceOnNextInsert) {
          state.raceOnNextInsert = false
          if (state.raceClaim) state.claims.set(String(state.raceClaim.operation_key), state.raceClaim)
          return queryResult<ResultRow>([], 0)
        }
        if (state.claims.has(String(values[2]))) return queryResult<ResultRow>([], 0)
        state.claims.set(String(values[2]), executionRow({
          operation_key: values[2],
          turn_id: values[3],
          proposal_hash: values[4],
          execution_id: values[5],
          recorded_at: values[6],
          lease_until: new Date(Date.now() + Number(values[7]) * 1_000).toISOString(),
          lease_token: values[8]
        }))
        return queryResult<ResultRow>([{ operation_key: values[2] }], 1)
      }
      if (sql.startsWith('UPDATE cvg_conversation_execution_claims SET lease_until')) {
        if (state.loseNextReclaim) {
          state.loseNextReclaim = false
          return queryResult<ResultRow>([], 0)
        }
        const row = state.claims.get(String(values[2]))
        if (!row || row.status !== 'IN_FLIGHT' || Date.parse(String(row.lease_until)) > Date.now()) {
          return queryResult<ResultRow>([], 0)
        }
        Object.assign(row, {
          lease_token: values[3],
          lease_until: new Date(Date.now() + Number(values[4]) * 1_000).toISOString(),
          recorded_at: values[5]
        })
        return queryResult<ResultRow>([row], 1)
      }
      if (sql.startsWith("UPDATE cvg_conversation_execution_claims SET status = 'IN_FLIGHT'")) {
        const row = state.claims.get(String(values[2]))
        if (!row) return queryResult<ResultRow>([], 0)
        Object.assign(row, {
          status: 'IN_FLIGHT',
          lease_until: new Date(Date.now() + Number(values[4]) * 1_000).toISOString(),
          lease_token: values[5],
          recorded_at: values[3]
        })
        return queryResult<ResultRow>([], 1)
      }
      if (sql.startsWith('UPDATE cvg_conversation_execution_claims SET status = $4, execution_id = $5')) {
        const row = state.claims.get(String(values[2]))
        if (!row || row.status !== 'IN_FLIGHT' || row.turn_id !== values[12] ||
            row.proposal_hash !== values[13] || row.execution_id !== values[4] ||
            !values[14] || row.lease_token !== values[14]) {
          return queryResult<ResultRow>([], 0)
        }
        Object.assign(row, {
          status: values[3],
          execution_id: values[4],
          lease_until: null,
          lease_token: null,
          approval_id: values[5],
          effect_confirmed: values[6],
          output: values[7] === null ? null : JSON.parse(String(values[7])),
          response: values[8],
          stop_reason: values[9],
          evidence_refs: JSON.parse(String(values[10])),
          recorded_at: values[11]
        })
        return queryResult<ResultRow>([], 1)
      }
      throw new Error(`Unexpected synthetic SQL: ${sql}`)
    },
    release: () => undefined
  }
  const database: ConversationTenantDatabase = {
    async withTenantContext<T>(tenantId: string, operation: (dbClient: ConversationSqlClient) => Promise<T>) {
      tenantOperations.push(`context:${tenantId}`)
      return operation(client)
    },
    async withTenantTransaction<T>(tenantId: string, operation: (dbClient: ConversationSqlClient) => Promise<T>) {
      tenantOperations.push(`transaction:${tenantId}`)
      return operation(client)
    }
  }
  return {
    state,
    statements,
    tenantOperations,
    store: new PostgresConversationStore({
      database,
      ...(options.maxStateBytes === undefined ? {} : { maxStateBytes: options.maxStateBytes })
    })
  }
}

function commitInput(overrides: Partial<TurnCommitInput> = {}): TurnCommitInput {
  const interpretation = {
    intent: 'INFO',
    confidence: 1,
    entities: [],
    references: [],
    confirmationSignal: false,
    untrustedSpans: [],
    reasonCodes: []
  } as DialogueInterpretation
  return {
    scope,
    turnId,
    idempotencyKey: 'idem-synthetic',
    expectedStateVersion: 0,
    conversationStatus: 'ACTIVE',
    status: 'COMPLETED',
    executionStatus: 'SUCCEEDED',
    memory: createEmptyWorkingMemory(),
    interpretation,
    planKind: 'ANSWER',
    response: {
      responseId: 'response-synthetic',
      deliveryKey: 'delivery-synthetic',
      text: 'Resposta sintética',
      groundingAccepted: true,
      deliveryStatus: 'PENDING'
    },
    now,
    ...overrides
  }
}

describe('PostgresConversationStore with synthetic SQL doubles', () => {
  it('sets and clears tenant scope and releases clients on success and failure', async () => {
    const statements: string[] = []
    const releases: Array<Error | undefined> = []
    let failClear = false
    let failRollback = false
    const client: ConversationSqlClient = {
      async query<ResultRow extends Record<string, unknown> = Record<string, unknown>>(
        text: string
      ): Promise<ConversationSqlResult<ResultRow>> {
        statements.push(text)
        if (failRollback && text === 'ROLLBACK') {
          failRollback = false
          throw new Error('synthetic rollback failed')
        }
        if (failClear && text.includes("set_config('cvg.tenant_id', '', false)")) {
          failClear = false
          throw new Error('synthetic clear failed')
        }
        return queryResult<ResultRow>()
      },
      release(error) { releases.push(error) }
    }
    const pool: ConversationSqlPool = { connect: async () => client }
    const database = createConversationTenantDatabase(pool)

    await expect(database.withTenantContext('tenant-a', async () => 'ok')).resolves.toBe('ok')
    expect(statements.slice(0, 2)).toEqual([
      "SELECT set_config('cvg.tenant_id', $1, false)",
      "SELECT set_config('cvg.tenant_id', '', false)"
    ])
    expect(releases[0]).toBeUndefined()

    await expect(database.withTenantTransaction('tenant-a', async () => 'committed')).resolves.toBe('committed')
    expect(statements.slice(2, 6)).toEqual([
      'BEGIN',
      "SELECT set_config('cvg.tenant_id', $1, false)",
      "SELECT set_config('cvg.tenant_id', '', false)",
      'COMMIT'
    ])
    expect(releases[1]).toBeUndefined()

    const operationError = new Error('synthetic operation failed')
    await expect(database.withTenantTransaction('tenant-a', async () => {
      throw operationError
    })).rejects.toBe(operationError)
    expect(statements.slice(6)).toEqual([
      'BEGIN',
      "SELECT set_config('cvg.tenant_id', $1, false)",
      'ROLLBACK',
      "SELECT set_config('cvg.tenant_id', '', false)"
    ])
    expect(releases[2]).toBe(operationError)

    failClear = true
    await expect(database.withTenantContext('tenant-a', async () => {
      throw operationError
    })).rejects.toBe(operationError)
    expect(releases[3]).toBe(operationError)

    await expect(database.withTenantContext('   ', async () => 'unreachable'))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(releases[4]).toBeInstanceOf(ConversationError)

    failRollback = true
    await expect(database.withTenantTransaction('tenant-a', async () => {
      throw operationError
    })).rejects.toBe(operationError)
    expect(releases[5]).toBe(operationError)
  })

  it('accepts, replays, loads and delivers a scoped turn without opening a connection', async () => {
    const fixture = makeStoreFixture()
    const accepted = await fixture.store.acceptTurn(acceptanceInput())
    expect(accepted.replayed).toBe(false)
    expect(accepted.turn.status).toBe('ACCEPTED')
    expect(accepted.snapshot.workingMemory).toEqual(initialMemory)
    expect(fixture.state.messages).toHaveLength(1)

    const replay = await fixture.store.acceptTurn(acceptanceInput())
    expect(replay.replayed).toBe(true)
    expect(replay.turn.identity.turnId).toBe(turnId)
    expect(fixture.state.messages).toHaveLength(1)
    await expect(fixture.store.load(scope)).resolves.toMatchObject({ stateVersion: 0 })
    await expect(fixture.store.getTurn(scope, turnId)).resolves.toMatchObject({ text: 'Olá' })
    await expect(fixture.store.getTurnByMessage(scope, messageId)).resolves.toMatchObject({
      identity: { messageId }
    })
    await fixture.store.commitTurn(commitInput())
    const delivered = await fixture.store.updateDelivery(scope, turnId, 'DELIVERED')
    expect(delivered.response?.deliveryStatus).toBe('DELIVERED')
    expect(fixture.tenantOperations.every((operation) => operation.endsWith(String(scope.tenantId))))
      .toBe(true)
  })

  it('rejects invalid input, identity conflicts, terminal sessions and corrupt persisted values', async () => {
    const invalid = makeStoreFixture()
    await expect(invalid.store.acceptTurn(acceptanceInput({ text: '   ' })))
      .rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(invalid.store.acceptTurn(acceptanceInput({ turnId: ('x'.repeat(201)) as TurnAcceptanceInput['turnId'] })))
      .rejects.toThrow('turnId is outside bounds')
    expect(invalid.statements).toHaveLength(0)

    const existing = turnRow()
    const conflict = makeStoreFixture({ session: sessionRow(), turns: [existing] })
    await expect(conflict.store.acceptTurn(acceptanceInput({ text: 'Outro texto' })))
      .rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    const terminal = makeStoreFixture({ session: sessionRow({ status: 'COMPLETED' }) })
    await expect(terminal.store.acceptTurn(acceptanceInput()))
      .rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    const cancelled = makeStoreFixture({ session: sessionRow({ status: 'CANCELLED' }) })
    await expect(cancelled.store.acceptTurn(acceptanceInput()))
      .rejects.toMatchObject({ code: 'STATE_CONFLICT' })

    const absent = makeStoreFixture()
    await expect(absent.store.getTurn(scope, turnId)).resolves.toBeNull()
    await expect(absent.store.getTurnByMessage(scope, messageId)).resolves.toBeNull()

    const malformedMemory = makeStoreFixture({ session: sessionRow({ working_memory: '{broken' }) })
    await expect(malformedMemory.store.load(scope)).rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' })
    const malformedDate = makeStoreFixture({ session: sessionRow({ updated_at: 'bad-date' }) })
    await expect(malformedDate.store.load(scope)).rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' })
    const wrongProfile = makeStoreFixture({ session: sessionRow({ profile_id: 'another-profile' }) })
    await expect(wrongProfile.store.load(scope)).rejects.toMatchObject({ code: 'PROFILE_MISMATCH' })
    const wrongTenant = makeStoreFixture({
      session: sessionRow({ tenant_id: 'another-tenant' }),
      ignoreSessionScope: true
    })
    await expect(wrongTenant.store.load(scope)).rejects.toMatchObject({ code: 'TENANT_MISMATCH' })
    const wrongSession = makeStoreFixture({ session: sessionRow({ session_id: 'another-session' }) })
    await expect(wrongSession.store.load(scope)).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    const validSerializedMemory = makeStoreFixture({ session: sessionRow({
      working_memory: JSON.stringify(initialMemory),
      created_at: new Date(now),
      updated_at: new Date(now)
    }) })
    await expect(validSerializedMemory.store.load(scope)).resolves.toMatchObject({
      createdAt: now,
      updatedAt: now,
      workingMemory: initialMemory
    })
    const dateTurn = makeStoreFixture({
      session: sessionRow(),
      turns: [turnRow({ created_at: new Date(now), updated_at: new Date(now) })]
    })
    await expect(dateTurn.store.getTurn(scope, turnId)).resolves.toMatchObject({
      createdAt: now,
      updatedAt: now
    })

    const duplicateIdentity = makeStoreFixture({
      session: sessionRow(),
      turns: [
        turnRow({ turn_id: 'turn-one', message_id: 'message-one' }),
        turnRow({ turn_id: 'turn-two', message_id: 'message-two' })
      ]
    })
    await expect(duplicateIdentity.store.acceptTurn(acceptanceInput()))
      .rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    const pinnedProfileMismatch = makeStoreFixture()
    await expect(pinnedProfileMismatch.store.acceptTurn(acceptanceInput({
      profile: { ...profile, id: 'another-profile' } as ConversationProfile
    }))).rejects.toMatchObject({ code: 'PROFILE_MISMATCH' })
  })

  it('requires a session, a persisted turn and an object response for delivery updates', async () => {
    const absentSession = makeStoreFixture()
    await expect(absentSession.store.updateDelivery(scope, turnId, 'FAILED'))
      .rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' })
    const absentTurn = makeStoreFixture({ session: sessionRow() })
    await expect(absentTurn.store.updateDelivery(scope, turnId, 'FAILED'))
      .rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' })
    const invalidResponse = makeStoreFixture({
      session: sessionRow(),
      turns: [turnRow({ response: '[]' })]
    })
    await expect(invalidResponse.store.updateDelivery(scope, turnId, 'FAILED'))
      .rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' })
  })

  it('commits memory and response with compare-and-swap and rejects stale or oversized state', async () => {
    const fixture = makeStoreFixture()
    await fixture.store.acceptTurn(acceptanceInput())
    const committed = await fixture.store.commitTurn(commitInput({
      memory: { ...initialMemory, sourceRefs: ['synthetic-source'] },
      executionId
    }))
    expect(committed.snapshot.stateVersion).toBe(1)
    expect(committed.snapshot.workingMemory.sourceRefs).toEqual(['synthetic-source'])
    expect(committed.turn.status).toBe('COMPLETED')
    expect(committed.turn.identity.executionId).toBe(executionId)
    expect(committed.turn.response?.text).toBe('Resposta sintética')

    const stale = makeStoreFixture({ session: sessionRow(), turns: [turnRow()] })
    await expect(stale.store.commitTurn(commitInput({ expectedStateVersion: 2 })))
      .rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    const oversized = makeStoreFixture({
      session: sessionRow(),
      turns: [turnRow()],
      maxStateBytes: 32
    })
    await expect(oversized.store.commitTurn(commitInput({
      memory: { ...initialMemory, sourceRefs: ['long'.repeat(30)] }
    }))).rejects.toThrow('Working memory exceeds the persistence bound')
    const invalidMemory = makeStoreFixture({ session: sessionRow(), turns: [turnRow()] })
    await expect(invalidMemory.store.commitTurn(commitInput({
      memory: { ...initialMemory, version: -1 } as WorkingMemory
    }))).rejects.toMatchObject({ code: 'INVALID_INPUT' })

    const completedTurn = makeStoreFixture({
      session: sessionRow(),
      turns: [turnRow({ status: 'COMPLETED' })]
    })
    const noOp = await completedTurn.store.commitTurn(commitInput())
    expect(noOp.turn.status).toBe('COMPLETED')
    expect(completedTurn.statements.some((sql) => sql.startsWith('UPDATE cvg_conversation_sessions')))
      .toBe(false)

    const missingSession = makeStoreFixture()
    await expect(missingSession.store.commitTurn(commitInput()))
      .rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' })
    const missingTurn = makeStoreFixture({ session: sessionRow() })
    await expect(missingTurn.store.commitTurn(commitInput()))
      .rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' })
    const sessionCasRace = makeStoreFixture({ session: sessionRow(), turns: [turnRow()] })
    sessionCasRace.state.failSessionCas = true
    await expect(sessionCasRace.store.commitTurn(commitInput()))
      .rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    const turnCasRace = makeStoreFixture({ session: sessionRow(), turns: [turnRow()] })
    turnCasRace.state.failTurnCas = true
    await expect(turnCasRace.store.commitTurn(commitInput()))
      .rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  })

  it('claims, authorizes and finalizes an effect with an owner turn and lease token', async () => {
    const fixture = makeStoreFixture({ session: sessionRow(), turns: [turnRow()] })
    const executionProposal = proposal()
    const claim = await fixture.store.claimExecution({
      scope,
      proposal: executionProposal,
      turnId,
      executionId,
      expectedStateVersion: 0
    })
    expect(claim.kind).toBe('EXECUTE')
    if (claim.kind !== 'EXECUTE') throw new Error('expected synthetic execution claim')

    await expect(fixture.store.authorizeExecution({
      scope,
      proposal: executionProposal,
      turnId,
      executionId,
      expectedStateVersion: 0,
      leaseToken: claim.leaseToken
    })).resolves.toBeUndefined()

    const outcome: ExecutionOutcome = {
      status: 'SUCCEEDED',
      turnId,
      executionId,
      proposalHash: executionProposal.proposalHash,
      operationKey: executionProposal.operationKey,
      effectConfirmed: true,
      output: { result: 'synthetic' },
      response: 'done',
      evidenceRefs: ['synthetic-evidence'],
      recordedAt: now,
      leaseToken: claim.leaseToken
    }
    await fixture.store.finalizeExecution(scope, outcome)
    expect(fixture.state.claims.get(executionProposal.operationKey)).toMatchObject({
      status: 'SUCCEEDED',
      effect_confirmed: true,
      output: { result: 'synthetic' },
      lease_token: null
    })
    const replay = await fixture.store.claimExecution({
      scope,
      proposal: executionProposal,
      turnId,
      executionId,
      expectedStateVersion: 0
    })
    expect(replay.kind).toBe('REPLAY')
    if (replay.kind === 'REPLAY') expect(replay.outcome.evidenceRefs).toEqual(['synthetic-evidence'])
  })

  it('reports in-flight, expired, raced, approval-waiting and conflicting claims', async () => {
    const executionProposal = proposal()
    const activeClaim = executionRow()
    const inFlight = makeStoreFixture({ session: sessionRow(), turns: [turnRow()], claims: [activeClaim] })
    const inFlightResult = await inFlight.store.claimExecution({
      scope, proposal: executionProposal, turnId, executionId, expectedStateVersion: 0
    })
    expect(inFlightResult.kind).toBe('IN_FLIGHT')
    if (inFlightResult.kind === 'IN_FLIGHT') expect(inFlightResult.outcome.evidenceRefs).toEqual(['synthetic-evidence'])

    const expiredClaim = executionRow({ lease_until: '2000-01-01T00:00:00.000Z' })
    const expired = makeStoreFixture({ session: sessionRow(), turns: [turnRow()], claims: [expiredClaim] })
    const reclaimed = await expired.store.claimExecution({
      scope, proposal: executionProposal, turnId, executionId, expectedStateVersion: 0
    })
    expect(reclaimed.kind).toBe('STALE')
    if (reclaimed.kind === 'STALE') expect(reclaimed.outcome.leaseToken).not.toBe('lease-synthetic')
    const lostRace = makeStoreFixture({
      session: sessionRow(),
      turns: [turnRow()],
      claims: [executionRow({ lease_until: '2000-01-01T00:00:00.000Z' })]
    })
    lostRace.state.loseNextReclaim = true
    await expect(lostRace.store.claimExecution({
      scope, proposal: executionProposal, turnId, executionId, expectedStateVersion: 0
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT' })

    const raced = makeStoreFixture({ session: sessionRow(), turns: [turnRow()] })
    raced.state.raceOnNextInsert = true
    raced.state.raceClaim = executionRow({ status: 'WAITING_APPROVAL', approval_id: 'approval-race' })
    const raceResult = await raced.store.claimExecution({
      scope, proposal: executionProposal, turnId, executionId, expectedStateVersion: 0
    })
    expect(raceResult.kind).toBe('WAITING_APPROVAL')
    const missingRacedClaim = makeStoreFixture({ session: sessionRow(), turns: [turnRow()] })
    missingRacedClaim.state.raceOnNextInsert = true
    await expect(missingRacedClaim.store.claimExecution({
      scope, proposal: executionProposal, turnId, executionId, expectedStateVersion: 0
    })).rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' })

    const waitingProposal = proposal({ status: 'PENDING_APPROVAL', requiresApproval: true })
    const waitingApproval = {
      approvalId: 'approval-synthetic',
      proposalHash: waitingProposal.proposalHash,
      operationKey: waitingProposal.operationKey,
      executionId,
      requestedAt: now
    }
    const waitingMemory = {
      ...initialMemory,
      pendingProposal: waitingProposal,
      pendingApproval: waitingApproval
    }
    const waitingClaim = executionRow({ status: 'WAITING_APPROVAL', approval_id: 'approval-synthetic' })
    const waiting = makeStoreFixture({
      session: sessionRow({ working_memory: waitingMemory }),
      turns: [turnRow()],
      claims: [waitingClaim]
    })
    const waitingResult = await waiting.store.claimExecution({
      scope, proposal: waitingProposal, turnId, executionId, expectedStateVersion: 0
    })
    expect(waitingResult.kind).toBe('WAITING_APPROVAL')
    await expect(waiting.store.claimExecution({
      scope, proposal: waitingProposal, turnId, executionId, expectedStateVersion: 0,
      approvalResume: {
        authenticated: true,
        approvalId: 'different-approval',
        proposalHash: waitingProposal.proposalHash,
        operationKey: waitingProposal.operationKey,
        executionId
      }
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    const resume: AuthenticatedApprovalResume = {
      authenticated: true,
      approvalId: 'approval-synthetic',
      proposalHash: waitingProposal.proposalHash,
      operationKey: waitingProposal.operationKey,
      executionId
    }
    const resumed = await waiting.store.claimExecution({
      scope, proposal: waitingProposal, turnId, executionId, expectedStateVersion: 0,
      approvalResume: resume
    })
    expect(resumed.kind).toBe('EXECUTE')

    const wrongProposal = makeStoreFixture({
      session: sessionRow(),
      turns: [turnRow()],
      claims: [executionRow({ proposal_hash: 'another-hash' })]
    })
    await expect(wrongProposal.store.claimExecution({
      scope, proposal: executionProposal, turnId, executionId, expectedStateVersion: 0
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    const staleState = makeStoreFixture({ session: sessionRow(), turns: [turnRow()] })
    await expect(staleState.store.claimExecution({
      scope, proposal: executionProposal, turnId, executionId, expectedStateVersion: 9
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    const missingSession = makeStoreFixture()
    await expect(missingSession.store.claimExecution({
      scope, proposal: executionProposal, turnId, executionId, expectedStateVersion: 0
    })).rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' })
    const missingTurn = makeStoreFixture({ session: sessionRow() })
    await expect(missingTurn.store.claimExecution({
      scope, proposal: executionProposal, turnId, executionId, expectedStateVersion: 0
    })).rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' })
    const inactiveProposal = makeStoreFixture({ session: sessionRow(), turns: [turnRow()] })
    await expect(inactiveProposal.store.claimExecution({
      scope,
      proposal: proposal({ createdTurnId: 'another-turn' as TurnAcceptanceInput['turnId'] }),
      turnId,
      executionId,
      expectedStateVersion: 0
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  })

  it('fails closed on stale authorization and finalization tokens', async () => {
    const executionProposal = proposal()
    const fixture = makeStoreFixture({ session: sessionRow(), turns: [turnRow()], claims: [executionRow()] })
    await expect(fixture.store.authorizeExecution({
      scope,
      proposal: executionProposal,
      turnId,
      executionId,
      expectedStateVersion: 0,
      leaseToken: 'wrong-lease'
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    await expect(fixture.store.authorizeExecution({
      scope,
      proposal: executionProposal,
      turnId,
      executionId,
      expectedStateVersion: 1,
      leaseToken: 'lease-synthetic'
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    const expiredLease = makeStoreFixture({
      session: sessionRow(),
      turns: [turnRow()],
      claims: [executionRow({ lease_until: '2000-01-01T00:00:00.000Z' })]
    })
    await expect(expiredLease.store.authorizeExecution({
      scope,
      proposal: executionProposal,
      turnId,
      executionId,
      expectedStateVersion: 0,
      leaseToken: 'lease-synthetic'
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    const absentSession = makeStoreFixture()
    await expect(absentSession.store.authorizeExecution({
      scope,
      proposal: executionProposal,
      turnId,
      executionId,
      expectedStateVersion: 0,
      leaseToken: 'lease-synthetic'
    })).rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' })
    const absentTurn = makeStoreFixture({ session: sessionRow() })
    await expect(absentTurn.store.authorizeExecution({
      scope,
      proposal: executionProposal,
      turnId,
      executionId,
      expectedStateVersion: 0,
      leaseToken: 'lease-synthetic'
    })).rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' })
    await expect(fixture.store.authorizeExecution({
      scope,
      proposal: proposal({ createdTurnId: 'another-turn' as TurnAcceptanceInput['turnId'] }),
      turnId,
      executionId,
      expectedStateVersion: 0,
      leaseToken: 'lease-synthetic'
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    await expect(fixture.store.finalizeExecution(scope, {
      status: 'SUCCEEDED',
      turnId,
      executionId,
      proposalHash: executionProposal.proposalHash,
      operationKey: executionProposal.operationKey,
      effectConfirmed: true,
      evidenceRefs: [],
      recordedAt: now,
      leaseToken: 'wrong-lease'
    })).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    await expect(makeStoreFixture().store.finalizeExecution(scope, {
      status: 'SUCCEEDED',
      turnId,
      executionId,
      proposalHash: executionProposal.proposalHash,
      operationKey: executionProposal.operationKey,
      effectConfirmed: true,
      evidenceRefs: [],
      recordedAt: now,
      leaseToken: 'lease-synthetic'
    })).rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' })
  })
})
