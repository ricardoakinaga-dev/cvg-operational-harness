import { strict as assert } from 'node:assert'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { QueryResultRow } from 'pg'
import {
  createApproved,
  fail,
  newSchema,
  pass,
  REPO,
  reserveInput,
  REVIEW_DIR,
  tenantId
} from './lib.ts'
import type {
  PostgresPoolClient,
  PostgresPoolLike
} from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/tenant-scoped-postgres.ts'

const ORIGINAL = `${REPO}/packages/persistence/src/runtime-approval-store.ts`
const original = readFileSync(ORIGINAL, 'utf8')
const TAMPER_DIR = `${REVIEW_DIR}/tamper`
mkdirSync(TAMPER_DIR, { recursive: true })

const base = original.replace(
  "from './tenant-scoped-postgres.ts'",
  `from '${REPO}/packages/persistence/src/tenant-scoped-postgres.ts'`
)
const lockTarget = `       WHERE tenant_id = $1 AND approval_id = $2
       FOR UPDATE`
const lockReplace = `       WHERE tenant_id = $1 AND approval_id = $2`
const revLine = '         AND revision = $${casRevisionParam}'
const statusLine = '         AND status = $${casStatusParam}'
const resLine =
  "         AND COALESCE(reservation_id, '') = $${casReservationIdParam}"
const genLine = '         AND reservation_generation = $${casGenerationParam}'
assert.ok(base.includes(lockTarget), 'lock target not found in source')
assert.ok(base.includes(revLine), 'revision predicate not found in source')
assert.ok(base.includes(genLine), 'generation predicate not found in source')

// T1: FOR UPDATE removed, full CAS kept.
const t1 = base.replace(lockTarget, lockReplace)
// T2: revision + generation removed from the CAS predicate; lock kept.
const t2 = base
  .replace(
    revLine,
    () => '         AND ($${casRevisionParam}::bigint IS NOT NULL)'
  )
  .replace(
    genLine,
    () => '         AND ($${casGenerationParam}::bigint IS NOT NULL)'
  )
// T3: lock removed AND the full predicate neutralised (no serialization, no CAS).
const t3 = t1
  .replace(
    revLine,
    () => '         AND ($${casRevisionParam}::bigint IS NOT NULL)'
  )
  .replace(
    statusLine,
    () => '         AND ($${casStatusParam}::text IS NOT NULL)'
  )
  .replace(
    resLine,
    () => '         AND ($${casReservationIdParam}::text IS NOT NULL)'
  )
  .replace(
    genLine,
    () => '         AND ($${casGenerationParam}::bigint IS NOT NULL)'
  )

const variants: Array<[string, string]> = [
  ['runtime-approval-store-t1-nolock.ts', t1],
  ['runtime-approval-store-t2-nocas.ts', t2],
  ['runtime-approval-store-t3-nolock-nocas.ts', t3]
]
for (const [name, code] of variants)
  writeFileSync(`${TAMPER_DIR}/${name}`, code)
console.log(`wrote tampered copies to ${TAMPER_DIR}`)

const { PostgresApprovalAuthority } =
  await import('/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/runtime-approval-store.ts')
type AuthorityCtor = new (
  pool: PostgresPoolLike
) => InstanceType<typeof PostgresApprovalAuthority>
const t1Class = (
  (await import(`${TAMPER_DIR}/runtime-approval-store-t1-nolock.ts`)) as {
    PostgresApprovalAuthority: AuthorityCtor
  }
).PostgresApprovalAuthority
const t2Class = (
  (await import(`${TAMPER_DIR}/runtime-approval-store-t2-nocas.ts`)) as {
    PostgresApprovalAuthority: AuthorityCtor
  }
).PostgresApprovalAuthority
const t3Class = (
  (await import(`${TAMPER_DIR}/runtime-approval-store-t3-nolock-nocas.ts`)) as {
    PostgresApprovalAuthority: AuthorityCtor
  }
).PostgresApprovalAuthority

class Barrier {
  #arrived = 0
  #waiters: Array<() => void> = []
  constructor(readonly needed: number) {}
  arrive(): Promise<void> {
    this.#arrived += 1
    if (this.#arrived >= this.needed) {
      const waiters = this.#waiters
      this.#waiters = []
      for (const wake of waiters) wake()
      return Promise.resolve()
    }
    return new Promise((resolve) => this.#waiters.push(resolve))
  }
}

class BarrierPool implements PostgresPoolLike {
  constructor(
    private readonly inner: { connect(): Promise<PostgresPoolClient> },
    private readonly barrier: Barrier
  ) {}
  async connect(): Promise<PostgresPoolClient> {
    const client = await this.inner.connect()
    const barrier = this.barrier
    return {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ) {
        if (text.includes('UPDATE runtime_approvals')) await barrier.arrive()
        return client.query<T>(text, values)
      },
      release: (error?: Error) => client.release(error)
    }
  }
}

class InjectPool implements PostgresPoolLike {
  constructor(
    private readonly inner: { connect(): Promise<PostgresPoolClient> },
    private readonly marker: string
  ) {}
  async connect(): Promise<PostgresPoolClient> {
    const client = await this.inner.connect()
    const marker = this.marker
    return {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ) {
        const result = await client.query<T>(text, values)
        if (
          text.includes('SELECT') &&
          text.includes('runtime_approvals') &&
          text.includes('FOR UPDATE') &&
          text.includes('approval_id = $2')
        ) {
          await client.query(
            `UPDATE runtime_approvals
               SET revision = 42, reservation_generation = 42, decision_reason = $3
             WHERE tenant_id = $1 AND approval_id = $2`,
            [values?.[0], values?.[1], marker]
          )
        }
        return result
      },
      release: (error?: Error) => client.release(error)
    }
  }
}

function summarize(settled: PromiseSettledResult<unknown>[]) {
  const winners = settled.filter((r) => r.status === 'fulfilled')
  const losers = settled.filter(
    (r) => r.status === 'rejected'
  ) as PromiseRejectedResult[]
  return {
    winners: winners.length,
    codes: losers.map(
      (l) => (l.reason as { code?: string })?.code ?? l.reason?.name
    )
  }
}

const h = await newSchema('f')
const pools: Array<{ end(): Promise<void> }> = []
try {
  const { PostgresApprovalAuthority: RealAuthority } =
    await import('/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/runtime-approval-store.ts')
  const setup = h.makePool(4)
  pools.push(setup)
  const seed = new RealAuthority(setup)

  const race = async (
    label: string,
    cls: AuthorityCtor,
    barrier: boolean
  ): Promise<{
    winners: number
    codes: Array<string | undefined>
    reservationIds: string[]
  }> => {
    const tenant = tenantId(`tamper_${label}`)
    const hint = `tamper_${label}`
    const record = await createApproved(seed, tenant, hint)
    const inner1 = h.makePool(1)
    const inner2 = h.makePool(1)
    pools.push(inner1, inner2)
    const sharedBarrier = new Barrier(2)
    const p1 = barrier ? new BarrierPool(inner1, sharedBarrier) : inner1
    const p2 = barrier ? new BarrierPool(inner2, sharedBarrier) : inner2
    const a1 = new cls(p1)
    const a2 = new cls(p2)
    const t1 = `rsv_${hint}_1`
    const t2 = `rsv_${hint}_2`
    const settled = await Promise.allSettled([
      a1.reserve(reserveInput(tenant, hint, record.approvalId, t1)),
      a2.reserve(reserveInput(tenant, hint, record.approvalId, t2))
    ])
    const summary = summarize(settled)
    const persisted = await seed.get(tenant, record.approvalId)
    const reservationIds = settled
      .filter(
        (r): r is PromiseFulfilledResult<{ reservationId: string }> =>
          r.status === 'fulfilled'
      )
      .map((r) => r.value.reservationId)
    console.log(
      `${label}: winners=${summary.winners} loserCodes=${JSON.stringify(summary.codes)} persisted=${persisted.status} persistedToken=${persisted.reservationId ?? 'none'} winnerTokens=${JSON.stringify(reservationIds)}`
    )
    return { ...summary, reservationIds }
  }

  const control = await race(
    'control-real',
    RealAuthority as unknown as AuthorityCtor,
    false
  )
  assert.equal(
    control.winners,
    1,
    'control: real adapter must have exactly one winner'
  )

  const t1Result = await race('t1-no-lock-cas-kept', t1Class, true)
  assert.equal(
    t1Result.winners,
    1,
    't1: CAS alone must still protect (one winner)'
  )

  const t2Result = await race('t2-lock-kept-cas-trimmed', t2Class, false)
  assert.equal(
    t2Result.winners,
    1,
    't2: lock alone must still protect (one winner)'
  )

  const t3Result = await race('t3-no-lock-no-cas', t3Class, true)
  assert.equal(
    t3Result.winners,
    2,
    't3: with both guards removed two reservations must win (guards are load-bearing)'
  )
  assert.equal(
    new Set(t3Result.reservationIds).size,
    2,
    't3: both winners must hold distinct tokens (double-award)'
  )
  console.log(
    'T3 falsification: two clients both believe they reserved distinct tokens; the row keeps only one -> lost update without lock+CAS'
  )

  // Stale-write falsification: an interleaved writer bumps revision+generation
  // after the FOR UPDATE load. The real predicate must detect it; the trimmed
  // predicate (t2) silently overwrites it.
  const staleRace = async (
    label: string,
    cls: AuthorityCtor
  ): Promise<{
    winner: number
    code?: string
    generation: string
    marker: string | null
    status: string
  }> => {
    const tenant = tenantId(`stale_${label}`)
    const hint = `stale_${label}`
    const record = await createApproved(seed, tenant, hint)
    const inner = h.makePool(1)
    pools.push(inner)
    const injected = new InjectPool(inner, label)
    const authority = new cls(injected)
    const settled = await Promise.allSettled([
      authority.reserve(
        reserveInput(tenant, hint, record.approvalId, `rsv_${hint}_1`)
      )
    ])
    const summary = summarize(settled)
    const row = await h.admin.query<{
      reservation_generation: string
      decision_reason: string | null
      status: string
    }>(
      `SELECT reservation_generation::text, decision_reason, status
       FROM ${h.schema}.runtime_approvals WHERE tenant_id = $1 AND approval_id = $2`,
      [tenant, record.approvalId]
    )
    console.log(
      `${label}: winner=${summary.winners} code=${summary.codes.join(',') || 'none'} persistedGeneration=${row.rows[0]?.reservation_generation} marker=${row.rows[0]?.decision_reason} status=${row.rows[0]?.status}`
    )
    return {
      winner: summary.winners,
      code: summary.codes[0],
      generation: row.rows[0]?.reservation_generation ?? '',
      marker: row.rows[0]?.decision_reason ?? null,
      status: row.rows[0]?.status ?? ''
    }
  }

  const realStale = await staleRace(
    'real-cas-detects',
    RealAuthority as unknown as AuthorityCtor
  )
  assert.equal(
    realStale.winner,
    0,
    'real adapter must reject the interleaved stale write'
  )
  assert.equal(
    realStale.code,
    'conflict',
    'real adapter must surface domain conflict'
  )

  const t2Stale = await staleRace('t2-cas-trimmed', t2Class)
  assert.equal(
    t2Stale.winner,
    1,
    't2 must accept the stale write (guard stripped)'
  )
  assert.equal(t2Stale.status, 'RESERVED')
  console.log(
    'Stale-write falsification: removing revision+generation from the predicate turns a detected conflict into a silent stale overwrite'
  )

  await setup.end()
  pass('tamper probes: guards are load-bearing; original bytes untouched')
} catch (error) {
  console.error(error)
  fail(`probe-f aborted: ${(error as Error).message}`)
} finally {
  await h.drop(...(pools as never[]))
}
