// Crítico AUD0621-REQUALIFY-20261021: sondas do auditor (data.test.ts)
// adaptadas à API nova (token de claim obrigatório) para medir se F06, F17,
// F05 (sweep) e F20 ainda reproduzem contra a candidata.
import { it, expect } from 'vitest'
import { Client } from 'pg'
import { writeFileSync } from 'node:fs'
import {
  runPostgresMigrations,
  PostgresRuntimeRepository,
  OUTBOX_MAX_ATTEMPTS
} from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/persistence/src/postgres.ts'
import { renewClaim } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/persistence/src/postgres-outbox.ts'
import { PostgresEffectJournal } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/persistence/src/effect-journal-postgres.ts'

const records: any[] = []
function record(name: string, data: any) {
  records.push({ name, ...data })
  writeFileSync('/mnt/dados/cvg-work/aud0621-int-runtime/critic/out/pg-extra-probes.json', JSON.stringify(records, null, 2) + '\n')
}
const url = process.env.TEST_DATABASE_URL as string
const tenant = 'tenant_00000000-0000-4000-8000-000000000101' as any
const other = 'tenant_00000000-0000-4000-8000-000000000102'
const sfx = Date.now().toString(36)
async function setup(schema: string) {
  const client = new Client({ connectionString: url })
  await client.connect()
  await runPostgresMigrations(client, { schemaName: schema })
  await client.query("SELECT set_config('cvg.tenant_id',$1,false)", [tenant])
  let now = new Date('2026-10-20T12:00:00Z')
  const clock = () => now
  const repo = new PostgresRuntimeRepository(client, { tenantIsolation: true, clock })
  const enqueue = () => repo.enqueue({ tenantId: tenant, type: 'synthetic.audit', payload: { synthetic: true }, correlationId: 'corr_00000000-0000-4000-8000-000000000101', idempotencyKey: schema, createdAt: now, availableAt: now })
  return { client, repo, enqueue, clock, advance: () => { now = new Date(now.getTime() + 31000) } }
}
async function settle<T>(p: Promise<T>) { try { return { ok: true, value: await p } } catch (e: any) { return { ok: false, code: e?.code, message: String(e?.message ?? e) } } }

it('F06 adapted: stale attempt token of the same worker id cannot close the newer claim', async () => {
  const x = await setup(`crit_fence_${sfx}`)
  try {
    const e = await x.enqueue()
    const first: any = await x.repo.claimNext({ tenantId: tenant, workerId: 'synthetic-same-worker', leaseMs: 30000 })
    x.advance()
    const second: any = await x.repo.claimNext({ tenantId: tenant, workerId: 'synthetic-same-worker', leaseMs: 30000 })
    const staleFail = await settle(x.repo.fail({ tenantId: tenant, eventId: e.id, workerId: 'synthetic-same-worker', claimToken: first.claimToken, terminal: true, error: 'stale-first-attempt' } as any))
    const staleAck = await settle(x.repo.ack({ tenantId: tenant, eventId: e.id, workerId: 'synthetic-same-worker', claimToken: first.claimToken } as any))
    const staleRenew = await renewClaim({ client: x.client as any, repositoryNow: x.clock }, { tenantId: tenant, eventId: e.id, workerId: 'synthetic-same-worker', claimToken: first.claimToken, leaseMs: 30000 } as any)
    const after: any = await x.repo.findOutboxById(tenant, e.id)
    const currentFail = await settle(x.repo.fail({ tenantId: tenant, eventId: e.id, workerId: 'synthetic-same-worker', claimToken: second.claimToken, error: 'current-attempt' } as any))
    record('outbox-attempt-fence-adapted', { firstToken: first.claimToken, secondToken: second.claimToken, staleFail, staleAck, staleRenew, statusAfterStale: after?.status, attemptsAfterStale: after?.attempts, currentFail: { ok: currentFail.ok, status: (currentFail as any).value?.status } })
    expect(first.claimToken).not.toBe(second.claimToken)
    expect(staleFail.ok).toBe(false)
    expect(staleAck.ok).toBe(false)
    expect(staleRenew).toBeNull()
    expect(after?.status).toBe('processing')
    expect(after?.attempts).toBe(2)
    expect(currentFail.ok).toBe(true)
  } finally { await x.client.end() }
})

it('F17 adapted: crash reclaim stops at the outbox maximum and dead-letters', async () => {
  const x = await setup(`crit_retry_${sfx}`)
  try {
    const e = await x.enqueue()
    const claims: any[] = []
    for (let i = 0; i < OUTBOX_MAX_ATTEMPTS + 2; i++) {
      claims.push(await x.repo.claimNext({ tenantId: tenant, workerId: 'synthetic-worker-' + i, leaseMs: 30000 }))
      x.advance()
    }
    const final: any = await x.repo.findOutboxById(tenant, e.id)
    const attemptsRows = await x.client.query('SELECT attempt, outcome FROM outbox_attempts WHERE event_id=$1 ORDER BY attempt', [e.id])
    record('outbox-unbounded-crash-retry-adapted', { max: OUTBOX_MAX_ATTEMPTS, claims: claims.map((c) => (c ? { attempts: c.attempts, status: c.status } : null)), final: { status: final?.status, attempts: final?.attempts, lastError: final?.lastError }, attemptRows: attemptsRows.rows })
    expect(claims.filter(Boolean).length).toBe(OUTBOX_MAX_ATTEMPTS)
    expect(final?.status).toBe('dead_letter')
    expect(final?.attempts).toBe(OUTBOX_MAX_ATTEMPTS)
  } finally { await x.client.end() }
})

it('F05 adapted: journal sweep under tenant A leaves tenant B row untouched even without RLS', async () => {
  const schema = `crit_sweep_${sfx}`
  const x = await setup(schema)
  try {
    await x.client.query(`ALTER TABLE ${schema}.effect_journal DISABLE ROW LEVEL SECURITY`)
    const journal = new PostgresEffectJournal(x.client as any)
    await journal.reserve({ tenantId: other, operationKey: 'crit-tenant-B-expired', proposalHash: 'a'.repeat(64), attemptId: 'synthetic-attempt', expiresAt: '2026-10-01T00:00:00Z' } as any)
    await x.client.query("SELECT set_config('cvg.tenant_id',$1,false)", [tenant])
    const released = await journal.releaseExpired(new Date('2026-10-22T12:00:00Z'), 30000)
    const row = (await x.client.query("SELECT tenant_id,state FROM effect_journal WHERE operation_key='crit-tenant-B-expired'")).rows[0]
    record('worker-sweep-tenant-predicate', { released, foreignRow: row })
    expect(row.tenant_id).toBe(other)
    expect(row.state).toBe('RESERVED')
  } finally { await x.client.end() }
})

it('F20 adapted: heartbeat extends the live lease and refuses an expired/taken claim', async () => {
  const x = await setup(`crit_renew_${sfx}`)
  try {
    const e = await x.enqueue()
    const first: any = await x.repo.claimNext({ tenantId: tenant, workerId: 'synthetic-worker-a', leaseMs: 30000 })
    const before: any = await x.repo.findOutboxById(tenant, e.id)
    const renewed: any = await renewClaim({ client: x.client as any, repositoryNow: () => new Date(x.clock().getTime() + 20000) }, { tenantId: tenant, eventId: e.id, workerId: 'synthetic-worker-a', claimToken: first.claimToken, leaseMs: 30000 } as any)
    const afterRenew: any = await x.repo.findOutboxById(tenant, e.id)
    x.advance(); x.advance()
    const late = await renewClaim({ client: x.client as any, repositoryNow: x.clock }, { tenantId: tenant, eventId: e.id, workerId: 'synthetic-worker-a', claimToken: first.claimToken, leaseMs: 30000 } as any)
    const second: any = await x.repo.claimNext({ tenantId: tenant, workerId: 'synthetic-worker-b', leaseMs: 30000 })
    const stale = await renewClaim({ client: x.client as any, repositoryNow: x.clock }, { tenantId: tenant, eventId: e.id, workerId: 'synthetic-worker-a', claimToken: first.claimToken, leaseMs: 30000 } as any)
    record('heartbeat-renew', { leaseBefore: before?.leaseUntil, leaseAfterRenew: afterRenew?.leaseUntil, renewedNotNull: renewed !== null, lateRenew: late, secondOwner: second?.leaseOwner, staleRenew: stale })
    expect(renewed).not.toBeNull()
    expect(new Date(afterRenew.leaseUntil).getTime()).toBeGreaterThan(new Date(before.leaseUntil).getTime())
    expect(late).toBeNull()
    expect(second?.leaseOwner).toBe('synthetic-worker-b')
    expect(stale).toBeNull()
  } finally { await x.client.end() }
})
