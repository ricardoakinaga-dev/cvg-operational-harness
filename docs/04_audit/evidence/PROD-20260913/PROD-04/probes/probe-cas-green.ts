/**
 * PROD-04 positive probe (GREEN, after durable wiring).
 *
 * Two adapters on two independent pools race the same APPROVED approval. The
 * durable authority must produce exactly one winner, one natural
 * `already_reserved` rejection and exactly one generation increment, and the
 * UPDATE it ships must carry the compare-and-set predicate.
 */
import { randomUUID } from 'node:crypto'
import { Client, Pool, type QueryResultRow } from 'pg'
import { ApprovalError } from '@cvg/approval-engine'
import {
  PostgresApprovalAuthority,
  runPostgresMigrations,
  type PostgresPoolClient,
  type PostgresPoolLike
} from '@cvg/persistence'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required')

const tenant = 'tenant_00000000-0000-4000-8000-000000000b01'
const hint = `green_cas_${randomUUID().slice(0, 8)}`

function requestInput() {
  return {
    tenantId: tenant,
    operatorId: 'op_1',
    agentId: 'agent_x',
    agentVersion: '1',
    action: 'appointment.confirm',
    resource: { type: 'appointment', id: 'apt_green_1' },
    payload: { draftId: 'draft_green_1' },
    policyVersion: 'pv1',
    correlationId: 'corr:cas:green',
    proposalHash: 'd'.repeat(64),
    proposalPayload: { draftId: 'draft_green_1' }
  }
}

function reserveInput(reservationId: string) {
  return {
    tenantId: tenant,
    approvalId: '',
    action: 'appointment.confirm',
    resource: { type: 'appointment', id: 'apt_green_1' },
    payload: { draftId: 'draft_green_1' },
    proposalHash: 'd'.repeat(64),
    reservationId,
    ttlMs: 60_000
  }
}

class RecordingPool implements PostgresPoolLike {
  readonly statements: string[] = []
  constructor(private readonly inner: Pool) {}
  async connect(): Promise<PostgresPoolClient> {
    const client = await this.inner.connect()
    const statements = this.statements
    return {
      query: async <T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ) => {
        statements.push(text)
        return client.query<T>(text, values)
      },
      release: (error?: Error) => client.release(error)
    }
  }
}

async function main(): Promise<void> {
  const schema = `prod04_probe_${Date.now()}_${randomUUID().slice(0, 6)}`
  const admin = new Client({ connectionString: databaseUrl })
  await admin.connect()
  const poolAInner = new Pool({
    connectionString: databaseUrl,
    max: 2,
    options: `-c search_path=${schema}`
  })
  const recordingA = new RecordingPool(poolAInner)
  const secondInner = new Pool({
    connectionString: databaseUrl,
    max: 2,
    options: `-c search_path=${schema}`
  })
  const recordingB = new RecordingPool(secondInner)
  try {
    await runPostgresMigrations(admin, { schemaName: schema })
    const authorityA = new PostgresApprovalAuthority(recordingA)
    const authorityB = new PostgresApprovalAuthority(recordingB)

    const record = await authorityA.request(requestInput())
    await authorityA.submit(tenant, record.approvalId, 'op_1')
    await authorityA.approve(tenant, record.approvalId, {
      approverId: 'op_2'
    })

    const results = await Promise.allSettled([
      authorityA.reserve({
        ...reserveInput(`rsv_green_${randomUUID()}`),
        approvalId: record.approvalId
      }),
      authorityB.reserve({
        ...reserveInput(`rsv_green_${randomUUID()}`),
        approvalId: record.approvalId
      })
    ])
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    console.log(
      `race outcome: ${fulfilled.length} fulfilled, ${rejected.length} rejected`
    )
    const reason = (rejected[0] as PromiseRejectedResult | undefined)?.reason
    console.log(
      `loser error: ${reason instanceof ApprovalError ? reason.code : 'unexpected'}`
    )

    const persisted = await authorityA.get(tenant, record.approvalId)
    const update = [...recordingA.statements, ...recordingB.statements].find(
      (statement) => statement.includes('UPDATE runtime_approvals')
    )
    const predicate =
      update !== undefined &&
      update.includes('AND revision = $') &&
      update.includes('AND status = $') &&
      update.includes("AND COALESCE(reservation_id, '') = $") &&
      update.includes('AND reservation_generation = $')
    console.log(
      `persisted generation=${persisted.reservationGeneration} usedTokens=${persisted.usedReservationIds?.length ?? 0} casPredicate=${predicate}`
    )

    if (
      fulfilled.length !== 1 ||
      rejected.length !== 1 ||
      !(reason instanceof ApprovalError) ||
      reason.code !== 'already_reserved' ||
      persisted.reservationGeneration !== 1 ||
      persisted.usedReservationIds?.length !== 1 ||
      !predicate
    ) {
      console.error(
        'RED: durable two-connection reserve did not honor the fencing invariant'
      )
      process.exitCode = 1
      return
    }
    console.log(
      'GREEN: exactly one connection reserved the approval with one generation increment and the CAS predicate in SQL'
    )
  } finally {
    await poolAInner.end().catch(() => undefined)
    await secondInner.end().catch(() => undefined)
    await admin
      .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      .catch(() => undefined)
    await admin.end().catch(() => undefined)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
