import { Pool, Client } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { InMemoryEffectJournal } from '@cvg/harness'
import { runPostgresMigrations } from '@cvg/persistence'
import {
  DefaultConversationService,
  PostgresConversationStore,
  PostgresResponseDelivery,
  RulesFirstDialogueInterpreter,
  asConversationId,
  asMessageId,
  asSessionId,
  asTenantId,
  asTurnId,
  asCorrelationId,
  asExecutionId,
  createConversationTenantDatabase,
  createEffectJournalEvidenceVerifier,
  createStaticConversationProfileAuthority,
  type ConversationHarness,
  type ExecutionOutcome,
  type HarnessActionRequest,
  type HarnessActionResult,
  type TurnAcceptanceInput
} from '../index.ts'
import { createSyntheticServiceDeskProfile } from '../../../../examples/phase4a/profiles.ts'

const disposablePgEnabled =
  Boolean(process.env.TEST_DATABASE_URL) &&
  process.env.PHASE4A_DISPOSABLE_PG === '1'
const postgresIt = disposablePgEnabled ? it : it.skip
const profile = createSyntheticServiceDeskProfile()
const profileAuthority = createStaticConversationProfileAuthority([profile])

function input(
  tenant: string,
  number: number,
  text = 'Mostre os slots disponíveis em 2026-09-28.',
  overrides: Partial<TurnAcceptanceInput> = {}
): TurnAcceptanceInput {
  return {
    tenantId: asTenantId(tenant),
    conversationId: asConversationId('conversation-postgres-phase4a'),
    sessionId: asSessionId('session-postgres-phase4a'),
    profileId: profile.id,
    profileVersion: profile.version,
    turnId: asTurnId(`turn-postgres-phase4a-${tenant.slice(-3)}-${number}`),
    messageId: asMessageId(
      `message-postgres-phase4a-${tenant.slice(-3)}-${number}`
    ),
    correlationId: asCorrelationId(
      `correlation-postgres-phase4a-${tenant.slice(-3)}-${number}`
    ),
    idempotencyKey: `idempotency-postgres-phase4a-${tenant.slice(-3)}-${number}`,
    receivedAt: '2026-09-17T13:30:00.000Z',
    text,
    profile,
    ...overrides
  }
}

describe('Phase 4A PostgreSQL durability boundary', () => {
  postgresIt(
    'replays durable turns, coalesces claims, and isolates tenants on a disposable database',
    async () => {
      const schemaName = `cvg_phase4a_${Date.now()}`
      const admin = new Client({
        connectionString: process.env.TEST_DATABASE_URL
      })
      const pool = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
        options: `-c search_path=${schemaName}`
      })
      const effectJournal = new InMemoryEffectJournal()
      const readerRole = `cvg_phase4a_reader_${Date.now()}`
      let reader: Client | undefined
      let readerRoleCreated = false
      const execute = vi.fn(
        async (request: HarnessActionRequest): Promise<HarnessActionResult> => {
          const result: HarnessActionResult = {
            status: 'SUCCEEDED',
            executionId: request.executionId,
            proposalHash: request.proposal.proposalHash,
            operationKey: request.proposal.operationKey,
            effectConfirmed: true,
            output: [
              {
                id: 'slot-postgres-1',
                label: 'Sala sintética às 09:00',
                value: { date: '2026-09-28', time: '09:00', room: 'Âmbar' },
                sourceRef: 'postgres:synthetic:slot-1'
              }
            ],
            stopReason: 'COMPLETED',
            evidenceRefs: [
              `execution:${request.executionId}:completed`,
              `effect:${request.executionId}`
            ]
          }
          const attemptId = String(request.executionId)
          await effectJournal.reserve({
            tenantId: String(request.identity.tenantId),
            operationKey: request.proposal.operationKey,
            proposalHash: `journal:${request.proposal.proposalHash}`,
            attemptId
          })
          await effectJournal.markStarted({
            tenantId: String(request.identity.tenantId),
            operationKey: request.proposal.operationKey,
            attemptId
          })
          await effectJournal.confirm({
            tenantId: String(request.identity.tenantId),
            operationKey: request.proposal.operationKey,
            attemptId,
            result: result.output ?? null
          })
          return result
        }
      )
      const harness: ConversationHarness = { execute }

      await admin.connect()
      try {
        await runPostgresMigrations(admin, { schemaName })
        const database = createConversationTenantDatabase({
          connect: () => pool.connect()
        })
        const store = new PostgresConversationStore({ database })
        const service = () =>
          new DefaultConversationService({
            store,
            profileAuthority,
            interpreter: new RulesFirstDialogueInterpreter(),
            harness,
            effectEvidence: createEffectJournalEvidenceVerifier(effectJournal)
          })

        const collisionConversation = asConversationId(
          'conversation-postgres-identity-collision'
        )
        const collisionSession = asSessionId(
          'session-postgres-identity-collision'
        )
        const collisionA = input(
          'tenant_00000000-0000-4000-8000-000000000921',
          1,
          'first collision turn',
          { conversationId: collisionConversation, sessionId: collisionSession }
        )
        const collisionB = input(
          'tenant_00000000-0000-4000-8000-000000000921',
          2,
          'second collision turn',
          { conversationId: collisionConversation, sessionId: collisionSession }
        )
        await store.acceptTurn(collisionA)
        await store.acceptTurn(collisionB)
        await expect(
          store.acceptTurn({
            ...collisionA,
            turnId: asTurnId('turn-postgres-identity-collision-c'),
            messageId: asMessageId('message-postgres-identity-collision-c'),
            correlationId: asCorrelationId(
              'correlation-postgres-identity-collision-c'
            ),
            idempotencyKey: collisionB.idempotencyKey
          })
        ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })

        const terminalConversation = asConversationId(
          'conversation-postgres-terminal'
        )
        const terminalSession = asSessionId('session-postgres-terminal')
        const terminalOverrides = {
          conversationId: terminalConversation,
          sessionId: terminalSession
        }
        const terminal = await service().runTurn(
          input(
            'tenant_00000000-0000-4000-8000-000000000922',
            1,
            'encerrar',
            terminalOverrides
          )
        )
        expect(terminal.snapshot.status).toBe('CANCELLED')
        await expect(
          service().runTurn(
            input(
              'tenant_00000000-0000-4000-8000-000000000922',
              2,
              'Mostre os horários disponíveis na sexta.',
              terminalOverrides
            )
          )
        ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
        const firstInput = input(
          'tenant_00000000-0000-4000-8000-000000000917',
          1
        )
        const concurrent = await Promise.all([
          service().runTurn(firstInput),
          ...Array.from({ length: 20 }, (_, index) =>
            service().runTurn(
              input('tenant_00000000-0000-4000-8000-000000000917', index + 100)
            )
          )
        ])

        expect(execute).toHaveBeenCalledTimes(1)
        expect(
          concurrent.every((item) => item.response.groundingAccepted)
        ).toBe(true)
        const replay = await service().runTurn(firstInput)
        expect(replay.replayed).toBe(true)
        expect(execute).toHaveBeenCalledTimes(1)

        const otherTenant = await service().runTurn(
          input('tenant_00000000-0000-4000-8000-000000000918', 2)
        )
        expect(otherTenant.snapshot.scope.tenantId).toBe(
          'tenant_00000000-0000-4000-8000-000000000918'
        )
        expect(execute).toHaveBeenCalledTimes(2)
        expect(
          (
            await service().inspect({
              tenantId: firstInput.tenantId,
              conversationId: firstInput.conversationId,
              sessionId: firstInput.sessionId,
              profileId: firstInput.profileId,
              profileVersion: firstInput.profileVersion
            })
          )?.scope.tenantId
        ).toBe(firstInput.tenantId)

        const delivered = concurrent[0]
        if (!delivered) throw new Error('expected a committed turn')
        let sends = 0
        const delivery = new PostgresResponseDelivery({
          database,
          send: async () => {
            sends += 1
            await new Promise<void>((resolve) => setTimeout(resolve, 10))
          }
        })
        const deliveryInput = {
          scope: {
            tenantId: firstInput.tenantId,
            conversationId: firstInput.conversationId,
            sessionId: firstInput.sessionId,
            profileId: firstInput.profileId,
            profileVersion: firstInput.profileVersion
          },
          turnId: delivered.turn.identity.turnId,
          responseId: delivered.response.responseId,
          deliveryKey: delivered.response.deliveryKey,
          text: delivered.response.text
        }
        const deliveryResults = await Promise.all(
          Array.from({ length: 20 }, () => delivery.deliver(deliveryInput))
        )
        expect(sends).toBe(1)
        expect(
          deliveryResults.some((item) => item.status === 'DELIVERED')
        ).toBe(true)
        expect((await delivery.deliver(deliveryInput)).status).toBe('DELIVERED')

        const recoveryTenant = 'tenant_00000000-0000-0000-0000-000000000919'
        const recoveryInput = input(
          recoveryTenant,
          90,
          'Reserve Friday at 10 in room Blue.'
        )
        const proposalTurn = await service().runTurn(recoveryInput)
        const proposal = proposalTurn.snapshot.workingMemory.pendingProposal
        if (!proposal) throw new Error('expected a durable recovery proposal')
        const recoveryScope = {
          tenantId: recoveryInput.tenantId,
          conversationId: recoveryInput.conversationId,
          sessionId: recoveryInput.sessionId,
          profileId: recoveryInput.profileId,
          profileVersion: recoveryInput.profileVersion
        }
        const recoveryExecutionId = asExecutionId('execution-postgres-recovery')
        const recoveryClaim = await store.claimExecution({
          scope: recoveryScope,
          proposal,
          turnId: proposalTurn.turn.identity.turnId,
          executionId: recoveryExecutionId,
          expectedStateVersion: proposalTurn.snapshot.stateVersion
        })
        expect(recoveryClaim.kind).toBe('EXECUTE')
        if (recoveryClaim.kind !== 'EXECUTE')
          throw new Error('expected an executable recovery claim')
        const forgedOutcome: ExecutionOutcome = {
          status: 'UNCERTAIN',
          turnId: asTurnId('turn-postgres-forged-owner'),
          executionId: recoveryExecutionId,
          proposalHash: proposal.proposalHash,
          operationKey: proposal.operationKey,
          effectConfirmed: false,
          evidenceRefs: ['execution:forged-owner'],
          recordedAt: '2026-09-17T13:30:00.000Z',
          leaseToken: recoveryClaim.leaseToken
        }
        await expect(
          store.finalizeExecution(recoveryScope, forgedOutcome)
        ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
        await expect(
          store.finalizeExecution(recoveryScope, {
            ...forgedOutcome,
            turnId: proposalTurn.turn.identity.turnId,
            executionId: asExecutionId('execution-postgres-forged-id'),
            evidenceRefs: ['execution:forged-id']
          })
        ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
        await admin.query(
          `UPDATE "${schemaName}".cvg_conversation_execution_claims
              SET lease_until = now() - interval '1 second'
            WHERE tenant_id = $1 AND conversation_id = $2 AND operation_key = $3`,
          [
            recoveryTenant,
            String(recoveryInput.conversationId),
            proposal.operationKey
          ]
        )
        const callsBeforeRecovery = execute.mock.calls.length
        const recovered = await new DefaultConversationService({
          store,
          profileAuthority,
          interpreter: new RulesFirstDialogueInterpreter(),
          harness,
          effectEvidence: {
            verify: async () => true,
            recover: async ({ proposal: staleProposal, executionId }) => ({
              status: 'SUCCEEDED' as const,
              executionId,
              proposalHash: staleProposal.proposalHash,
              operationKey: staleProposal.operationKey,
              effectConfirmed: true,
              output: { reservationId: 'recovered-postgres-reservation' },
              stopReason: 'RECOVERED_EFFECT',
              evidenceRefs: [
                `execution:${executionId}:recovered`,
                `effect:${executionId}`
              ]
            })
          }
        }).runTurn(input(recoveryTenant, 91, 'sim'))
        expect(recovered.turn.executionStatus).toBe('SUCCEEDED')
        expect(execute).toHaveBeenCalledTimes(callsBeforeRecovery)

        const persisted = await admin.query<{
          session_count: string
          turn_count: string
          claim_count: string
          delivery_count: string
        }>(
          `SELECT
             (SELECT count(*) FROM "${schemaName}".cvg_conversation_sessions) AS session_count,
             (SELECT count(*) FROM "${schemaName}".cvg_conversation_turns) AS turn_count,
             (SELECT count(*) FROM "${schemaName}".cvg_conversation_execution_claims) AS claim_count,
             (SELECT count(*) FROM "${schemaName}".cvg_conversation_deliveries) AS delivery_count`
        )
        expect(Number(persisted.rows[0]?.session_count)).toBe(5)
        expect(Number(persisted.rows[0]?.turn_count)).toBeGreaterThanOrEqual(24)
        expect(Number(persisted.rows[0]?.claim_count)).toBe(3)
        expect(Number(persisted.rows[0]?.delivery_count)).toBe(1)

        const recoveredTurn = await admin.query<{
          execution_id: string | null
        }>(
          `SELECT execution_id
             FROM "${schemaName}".cvg_conversation_turns
            WHERE tenant_id = $1 AND conversation_id = $2 AND turn_id = $3`,
          [
            recoveryTenant,
            String(recoveryInput.conversationId),
            String(recovered.turn.identity.turnId)
          ]
        )
        expect(recoveredTurn.rows[0]?.execution_id).toBe(
          String(recovered.turn.identity.executionId)
        )

        await admin.query(
          `CREATE ROLE "${readerRole}" LOGIN PASSWORD 'phase4a' NOSUPERUSER NOBYPASSRLS`
        )
        readerRoleCreated = true
        await admin.query(
          `GRANT USAGE ON SCHEMA "${schemaName}" TO "${readerRole}"`
        )
        for (const table of [
          'cvg_conversation_sessions',
          'cvg_conversation_messages',
          'cvg_conversation_turns',
          'cvg_conversation_execution_claims',
          'cvg_conversation_deliveries'
        ]) {
          await admin.query(
            `GRANT SELECT ON TABLE "${schemaName}".${table} TO "${readerRole}"`
          )
        }
        const databaseUrl = new URL(process.env.TEST_DATABASE_URL ?? '')
        reader = new Client({
          host: databaseUrl.hostname,
          port: Number(databaseUrl.port),
          database: databaseUrl.pathname.replace(/^\//, ''),
          user: readerRole,
          password: 'phase4a',
          options: `-c search_path=${schemaName}`
        })
        await reader.connect()
        await reader.query("SELECT set_config('cvg.tenant_id', $1, false)", [
          String(firstInput.tenantId)
        ])
        const tenantAVisible = await reader.query<{ count: string }>(
          `SELECT count(*) FROM "${schemaName}".cvg_conversation_sessions`
        )
        expect(Number(tenantAVisible.rows[0]?.count)).toBe(1)
        await reader.query("SELECT set_config('cvg.tenant_id', $1, false)", [
          'tenant_00000000-0000-4000-8000-000000000918'
        ])
        const tenantBVisible = await reader.query<{ count: string }>(
          `SELECT count(*) FROM "${schemaName}".cvg_conversation_sessions`
        )
        expect(Number(tenantBVisible.rows[0]?.count)).toBe(1)
      } finally {
        await reader?.end().catch(() => undefined)
        await pool.end()
        await admin.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        if (readerRoleCreated)
          await admin.query(`DROP ROLE IF EXISTS "${readerRole}"`)
        await admin.end()
      }
    }
  )
})
