import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { Client, Pool } from 'pg'
import { runPostgresMigrations } from '../packages/persistence/src/postgres.ts'
import {
  DefaultConversationService,
  InMemoryConversationStore,
  InMemoryResponseDelivery,
  RulesFirstDialogueInterpreter,
  asConversationId,
  asCorrelationId,
  asMessageId,
  asProfileId,
  asSessionId,
  asTenantId,
  asTurnId,
  createStaticConversationProfileAuthority,
  PostgresConversationStore,
  PostgresResponseDelivery,
  createConversationTenantDatabase,
  type ConversationHarness,
  type DeliveryRequest,
  type HarnessActionRequest,
  type HarnessActionResult
} from '../packages/conversation/src/index.ts'
import { createSyntheticServiceDeskProfile } from '../examples/phase4a/profiles.ts'

const outputPath = 'docs/phase4a/evidence/PERFORMANCE_RESULTS.json'
const profile = createSyntheticServiceDeskProfile()
const profileAuthority = createStaticConversationProfileAuthority([profile])

interface CandidateBinding {
  readonly candidateId: string
  readonly candidateDigest: string
}

async function readCandidateBinding(): Promise<CandidateBinding | null> {
  try {
    const value = JSON.parse(
      await readFile('docs/phase4a/evidence/CANDIDATE.json', 'utf8')
    ) as Partial<CandidateBinding>
    return typeof value.candidateId === 'string' &&
      typeof value.candidateDigest === 'string'
      ? {
          candidateId: value.candidateId,
          candidateDigest: value.candidateDigest
        }
      : null
  } catch {
    return null
  }
}

function turn(number: number) {
  return {
    tenantId: asTenantId('tenant_00000000-0000-4000-8000-000000000920'),
    conversationId: asConversationId('conversation-performance'),
    sessionId: asSessionId('session-performance'),
    profileId: profile.id,
    profileVersion: profile.version,
    turnId: asTurnId(`turn-performance-${number}`),
    messageId: asMessageId(`message-performance-${number}`),
    correlationId: asCorrelationId(`correlation-performance-${number}`),
    idempotencyKey: `idempotency-performance-${number}`,
    receivedAt: '2026-09-17T15:00:00.000Z',
    text: 'Mostre os horários disponíveis na sexta.',
    profile
  }
}

function postgresTurn(number: number) {
  return {
    ...turn(number),
    conversationId: asConversationId('conversation-performance-postgres'),
    sessionId: asSessionId('session-performance-postgres'),
    turnId: asTurnId(`turn-performance-postgres-${number}`),
    messageId: asMessageId(`message-performance-postgres-${number}`),
    correlationId: asCorrelationId(
      `correlation-performance-postgres-${number}`
    ),
    idempotencyKey: `idempotency-performance-postgres-${number}`
  }
}

async function measurePostgres(): Promise<Record<string, unknown>> {
  const connectionString = process.env.TEST_DATABASE_URL
  if (!connectionString || process.env.PHASE4A_DISPOSABLE_PG !== '1') {
    return {
      status: 'NOT_MEASURED',
      reason: 'Disposable PostgreSQL environment was not enabled.'
    }
  }

  const schemaName = `cvg_phase4a_perf_${Date.now()}`
  const admin = new Client({ connectionString })
  const pool = new Pool({
    connectionString,
    options: `-c search_path=${schemaName}`
  })
  await admin.connect()
  try {
    await runPostgresMigrations(admin, { schemaName })
    const database = createConversationTenantDatabase({
      connect: () => pool.connect()
    })
    const calls: HarnessActionRequest[] = []
    const harness: ConversationHarness = {
      async execute(request): Promise<HarnessActionResult> {
        calls.push(request)
        return {
          status: 'SUCCEEDED',
          executionId: request.executionId,
          proposalHash: request.proposal.proposalHash,
          operationKey: request.proposal.operationKey,
          effectConfirmed: true,
          output: [],
          evidenceRefs: [`effect:${request.executionId}`]
        }
      }
    }
    const service = new DefaultConversationService({
      store: new PostgresConversationStore({ database }),
      profileAuthority,
      interpreter: new RulesFirstDialogueInterpreter(),
      harness,
      effectEvidence: { verify: async () => true }
    })
    const started = performance.now()
    const turns = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        service.runTurn(postgresTurn(index))
      )
    )
    const turnsDurationMs = Number((performance.now() - started).toFixed(3))

    const first = turns[0]
    if (!first) throw new Error('PostgreSQL performance run produced no turn')
    let sends = 0
    const delivery = new PostgresResponseDelivery({
      database,
      send: async () => {
        sends += 1
        await new Promise<void>((resolve) => setTimeout(resolve, 2))
      }
    })
    const deliveryInput: DeliveryRequest = {
      scope: {
        tenantId: first.turn.identity.tenantId,
        conversationId: first.turn.identity.conversationId,
        sessionId: first.turn.identity.sessionId,
        profileId: profile.id,
        profileVersion: profile.version
      },
      turnId: first.turn.identity.turnId,
      responseId: first.response.responseId,
      deliveryKey: first.response.deliveryKey,
      text: first.response.text
    }
    const deliveryStarted = performance.now()
    const deliveryResults = await Promise.all(
      Array.from({ length: 20 }, () => delivery.deliver(deliveryInput))
    )
    const deliveryDurationMs = Number(
      (performance.now() - deliveryStarted).toFixed(3)
    )
    return {
      status: 'MEASURED',
      schemaName,
      turns20Concurrent: {
        calls: 20,
        durationMs: turnsDurationMs,
        governedHarnessCalls: calls.length,
        groundedResponses: turns.filter(
          (item) => item.response.groundingAccepted
        ).length
      },
      delivery20Concurrent: {
        attempts: 20,
        durationMs: deliveryDurationMs,
        sinkSends: sends,
        deliveredOrPending: deliveryResults.filter(
          (item) => item.status === 'DELIVERED' || item.status === 'PENDING'
        ).length
      }
    }
  } finally {
    await pool.end()
    await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
    await admin.end()
  }
}

async function main(): Promise<void> {
  const candidate = await readCandidateBinding()
  const calls: HarnessActionRequest[] = []
  const harness: ConversationHarness = {
    async execute(request): Promise<HarnessActionResult> {
      calls.push(request)
      return {
        status: 'SUCCEEDED',
        executionId: request.executionId,
        proposalHash: request.proposal.proposalHash,
        operationKey: request.proposal.operationKey,
        effectConfirmed: true,
        output: [],
        evidenceRefs: [`effect:${request.executionId}`]
      }
    }
  }
  const service = new DefaultConversationService({
    store: new InMemoryConversationStore(),
    profileAuthority,
    interpreter: new RulesFirstDialogueInterpreter(),
    harness,
    effectEvidence: { verify: async () => true }
  })
  const started = performance.now()
  const turns = await Promise.all(
    Array.from({ length: 20 }, (_, index) => service.runTurn(turn(index)))
  )
  const memoryDurationMs = Number((performance.now() - started).toFixed(3))

  let sends = 0
  const delivery = new InMemoryResponseDelivery({
    send: async () => {
      sends += 1
      await new Promise<void>((resolve) => setTimeout(resolve, 2))
    }
  })
  const deliveryInput: DeliveryRequest = {
    scope: {
      tenantId: asTenantId('tenant_00000000-0000-4000-8000-000000000920'),
      conversationId: asConversationId('conversation-performance'),
      sessionId: asSessionId('session-performance'),
      profileId: asProfileId('synthetic-service-desk'),
      profileVersion: '1.0.0'
    },
    turnId: asTurnId('turn-performance-delivery'),
    responseId: 'response-performance',
    deliveryKey: 'delivery:performance',
    text: 'Resposta sintética de baseline.'
  }
  const deliveryStarted = performance.now()
  const deliveryResults = await Promise.all(
    Array.from({ length: 20 }, () => delivery.deliver(deliveryInput))
  )
  const deliveryDurationMs = Number(
    (performance.now() - deliveryStarted).toFixed(3)
  )

  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    controlledScope: 'synthetic-local-only',
    production: 'NO_GO',
    runtime: process.version,
    measurements: {
      memory20ConcurrentTurns: {
        calls: 20,
        durationMs: memoryDurationMs,
        governedHarnessCalls: calls.length,
        groundedResponses: turns.filter(
          (item) => item.response.groundingAccepted
        ).length
      },
      memory20ConcurrentDelivery: {
        attempts: 20,
        durationMs: deliveryDurationMs,
        sinkSends: sends,
        deliveredOrPending: deliveryResults.filter(
          (item) => item.status === 'DELIVERED' || item.status === 'PENDING'
        ).length
      },
      postgres: await measurePostgres()
    },
    candidateId: candidate?.candidateId ?? null,
    candidateDigest: candidate?.candidateDigest ?? null,
    candidateBound: candidate !== null
  }

  await mkdir('docs/phase4a/evidence', { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`)
  await writeFile(
    'docs/phase4a/evidence/PERFORMANCE_BASELINE.md',
    `# Phase 4A performance baseline — AAA-4A\n\n` +
      `Generated ${result.generatedAt} in ${result.controlledScope}.\n\n` +
      `- 20 concurrent in-memory turns completed in ${memoryDurationMs} ms; governed Harness calls: ${calls.length}; grounded responses: ${result.measurements.memory20ConcurrentTurns.groundedResponses}/20.\n` +
      `- 20 concurrent delivery attempts completed in ${deliveryDurationMs} ms; sink sends: ${sends}; delivered or pending receipts: ${result.measurements.memory20ConcurrentDelivery.deliveredOrPending}/20.\n` +
      `- PostgreSQL raw 20-way turn and delivery timings: ${String(result.measurements.postgres.status)}. See PERFORMANCE_RESULTS.json for the disposable schema measurement; RLS and stale-lease recovery remain covered by the focused integration test.\n\n` +
      `These are local synthetic observations, not an SLO, capacity target or production performance claim. Production remains NO_GO.\n`
  )
  console.log(
    JSON.stringify({
      event: 'phase4a.performance_evidence',
      outputPath,
      memoryDurationMs,
      deliveryDurationMs,
      governedHarnessCalls: calls.length,
      sinkSends: sends,
      candidateBound: result.candidateBound,
      postgresStatus: result.measurements.postgres.status,
      controlledScope: result.controlledScope,
      production: result.production
    })
  )
  if (
    calls.length !== 1 ||
    sends !== 1 ||
    !result.candidateBound ||
    (process.env.TEST_DATABASE_URL &&
      process.env.PHASE4A_DISPOSABLE_PG === '1' &&
      result.measurements.postgres.status !== 'MEASURED')
  )
    process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
