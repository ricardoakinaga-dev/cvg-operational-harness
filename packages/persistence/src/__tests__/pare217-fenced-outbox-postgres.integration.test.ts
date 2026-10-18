import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Client, Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  PostgresRuntimeRepository,
  runPostgresMigrations
} from '../postgres.ts'
import {
  FencedRenewalStoppedError,
  type FencedClaimedEvent,
  type FencedRenewalControl
} from '../outbox.ts'
import {
  TenantScopedPostgresRuntimeRepository,
  withTenantContext,
  withTenantTransaction
} from '../tenant-scoped-postgres.ts'

// Deliberately does not use TEST_DATABASE_URL: this lane requires its explicitly
// assigned, disposable synthetic resource, never an ambient database.
const resourcePath = process.env.PARE217_A_PG_RESOURCE
if (process.env.PARE217_A_PG_REQUIRED === '1' && !resourcePath) {
  throw new Error(
    'PARE217_A_PG_RESOURCE is required for the assigned PG217 proof'
  )
}
const tenantId = 'tenant_00000000-0000-4000-8000-000000000217'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000218'
const workerId = `pare217-a:${randomUUID()}`
const suffix = `${Date.now()}_${randomBytes(4).toString('hex')}`
const schema = `pare217_lane_a_${suffix}`
const servingRole = `pare217_a_${suffix}`
const appName = `pare217_a_${suffix}`
let admin: Client | undefined
let pool: Pool
let repository: TenantScopedPostgresRuntimeRepository
let servingUrl: string
let schemaCreated = false
let roleCreated = false

function trace(action: string, details: Record<string, unknown> = {}) {
  console.info(
    'PARE217_LANE_A',
    JSON.stringify({ action, schema, servingRole, ...details })
  )
}
function renewalControl(
  controller = new AbortController()
): FencedRenewalControl {
  return { signal: controller.signal, assertActive() {} }
}
function newPool(applicationName = appName) {
  return new Pool({
    connectionString: servingUrl,
    max: 4,
    connectionTimeoutMillis: 1000,
    options: `-c search_path=${schema} -c statement_timeout=20000 -c lock_timeout=15000`,
    application_name: applicationName
  })
}
async function claim(
  label: string,
  session?: { conversationId: string; sessionId: string }
): Promise<FencedClaimedEvent> {
  const event = await repository.enqueue({
    tenantId,
    type: 'synthetic217',
    payload: { fixture: true },
    idempotencyKey: `pare217-a:${label}:${randomUUID()}`,
    ...session
  })
  const claimed = await repository.claimNextFenced({
    tenantId,
    workerId,
    eventId: event.id
  })
  if (!claimed) throw new Error('Synthetic event was not claimed')
  expect(
    claimed.event.leaseUntil!.getTime() - Date.parse(claimed.dbClaimedAt)
  ).toBe(10000)
  return claimed
}
function ackInput(claimed: FencedClaimedEvent) {
  return {
    tenantId,
    eventId: claimed.event.id,
    workerId: claimed.claimRef.processWorkerId,
    claimRef: claimed.claimRef,
    effect: vi.fn(async () => ({ status: 'completed' })),
    beforeFinalAck: vi.fn(async () => {})
  }
}
async function dbNow(): Promise<Date> {
  return (await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now'))
    .rows[0]!.now
}
async function eventState(eventId: string) {
  return withTenantContext(pool, tenantId, async (client) => {
    const event = await client.query(
      'SELECT status, attempts, lease_owner, lease_until FROM outbox_events WHERE tenant_id=$1 AND id=$2',
      [tenantId, eventId]
    )
    const attempts = await client.query(
      'SELECT id::text AS id, attempt, worker_id, outcome, claimed_at FROM outbox_attempts WHERE tenant_id=$1 AND event_id=$2 ORDER BY outbox_attempts.id',
      [tenantId, eventId]
    )
    const markers = await client.query(
      'SELECT event_id FROM outbox_effects WHERE tenant_id=$1 AND event_id=$2',
      [tenantId, eventId]
    )
    if (!event.rows[0]) throw new Error('Own synthetic outbox event is missing')
    return {
      event: event.rows[0],
      attempts: attempts.rows,
      markers: markers.rows
    }
  })
}
async function session() {
  return withTenantTransaction(pool, tenantId, async (client) => {
    const conversationId = `conv_${randomUUID()}`
    const sessionId = `sess_${randomUUID()}`
    await client.query(
      `INSERT INTO conversations
      (tenant_id,id,channel,sender_ref,sender_ref_hash,status,correlation_id)
      VALUES ($1,$2,'internal','synthetic217','synthetic217','active',$3)`,
      [tenantId, conversationId, `corr_${randomUUID()}`]
    )
    await client.query(
      "INSERT INTO sessions (tenant_id,id,conversation_id,status) VALUES ($1,$2,$3,'active')",
      [tenantId, sessionId, conversationId]
    )
    return { conversationId, sessionId }
  })
}
async function blocker(
  table: 'outbox_events' | 'outbox_attempts' | 'sessions',
  id: string
): Promise<PoolClient> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT set_config('cvg.tenant_id',$1,true)", [tenantId])
    const column = table === 'outbox_attempts' ? 'event_id' : 'id'
    const result = await client.query(
      `SELECT 1 FROM ${table} WHERE tenant_id=$1 AND ${column}=$2 FOR UPDATE`,
      [tenantId, id]
    )
    expect(result.rowCount).toBe(1)
    return client
  } catch (error) {
    await client.query('ROLLBACK')
    client.release()
    throw error
  }
}
async function unblock(client: PoolClient) {
  try {
    await client.query('ROLLBACK')
  } finally {
    client.release()
  }
}
async function waitForLock(applicationName: string) {
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const waiting = await admin!.query<{ pid: number; wait_event: string }>(
      "SELECT pid, wait_event FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",
      [applicationName]
    )
    if (waiting.rows[0]) return waiting.rows[0]
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(
    `Own serving session did not enter a database lock wait: ${applicationName}`
  )
}
async function untilExpired(claimed: FencedClaimedEvent) {
  // Wait against the real server clock. Never modify lease_until or the TTL.
  await admin!.query(
    `SELECT pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM
    ($1::timestamptz-clock_timestamp())))::double precision + 0.08)`,
    [claimed.event.leaseUntil]
  )
}

// All SQL identifiers are generated locally under the explicitly assigned
// prefixes. Only this schema and role are created/dropped; no container/DB DDL.
describe.skipIf(!resourcePath)(
  'SPEC0217 fenced outbox on assigned PostgreSQL/RLS',
  () => {
    beforeAll(async () => {
      const resource = JSON.parse(await readFile(resourcePath!, 'utf8')) as {
        test_database_url: string
      }
      const url = new URL(resource.test_database_url)
      if (
        url.hostname !== '127.0.0.1' ||
        url.pathname !== '/pare217_synthetic' ||
        url.username !== 'pare217'
      ) {
        throw new Error(
          'Refusing a resource outside the assigned disposable PG217 database'
        )
      }
      if (
        !/^pare217_lane_a_[a-z0-9_]+$/.test(schema) ||
        !/^pare217_a_[a-z0-9_]+$/.test(servingRole)
      ) {
        throw new Error('Invalid lane A schema/role prefix')
      }
      admin = new Client({
        connectionString: url.toString(),
        application_name: `${appName}_ddl`
      })
      await admin.connect()
      await admin.query(`CREATE SCHEMA ${schema}`)
      schemaCreated = true
      // Use the Lead's existing migration unchanged, in this lane's schema.
      await runPostgresMigrations(admin, {
        schemaName: schema,
        createSchema: false
      })
      // Only the own-schema identity sequence is seeded above 2^53. This is
      // a bigint precision fixture, never a lease/expiry override.
      await admin.query(
        `ALTER SEQUENCE ${schema}.outbox_attempts_id_seq RESTART WITH 9007199254740993`
      )
      const password = randomBytes(24).toString('hex')
      await admin.query(
        `CREATE ROLE ${servingRole} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
      )
      roleCreated = true
      await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${servingRole}`)
      await admin.query(
        `GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA ${schema} TO ${servingRole}`
      )
      await admin.query(
        `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${servingRole}`
      )
      url.username = servingRole
      url.password = password
      servingUrl = url.toString()
      pool = newPool()
      repository = new TenantScopedPostgresRuntimeRepository(pool)
      const migrations = await admin.query(
        'SELECT version,checksum FROM schema_migrations ORDER BY version'
      )
      expect(
        migrations.rows.some(
          (row) => row.version === '0029_controlled_published_kernel'
        )
      ).toBe(true)
      trace('setup', { migrations: migrations.rows, database: url.pathname })
    }, 60000)

    afterAll(async () => {
      await pool?.end()
      try {
        if (schemaCreated) await admin!.query(`DROP SCHEMA ${schema} CASCADE`)
        if (roleCreated) await admin!.query(`DROP ROLE ${servingRole}`)
        const remaining = await admin!.query(
          'SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS schema_exists, EXISTS(SELECT 1 FROM pg_roles WHERE rolname=$2) AS role_exists',
          [schema, servingRole]
        )
        expect(remaining.rows[0]).toEqual({
          schema_exists: false,
          role_exists: false
        })
        trace('cleanup', {
          schemaDropped: schemaCreated,
          roleDropped: roleCreated,
          verifiedAbsent: remaining.rows[0]
        })
      } finally {
        await admin?.end()
      }
    }, 30000)

    it('serves through a non-owner NOBYPASSRLS role with forced isolation', async () => {
      const role = await pool.query(
        'SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user'
      )
      expect(role.rows[0]).toEqual({
        current_user: servingRole,
        rolsuper: false,
        rolbypassrls: false
      })
      const policies = await admin!.query(
        'SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace=$1::regnamespace AND relname=ANY($2)',
        [schema, ['outbox_events', 'outbox_attempts', 'outbox_effects']]
      )
      expect(policies.rows).toHaveLength(3)
      for (const row of policies.rows)
        expect(row).toMatchObject({
          relrowsecurity: true,
          relforcerowsecurity: true
        })
      const claimed = await claim('rls')
      expect((await pool.query('SELECT id FROM outbox_events')).rows).toEqual(
        []
      )
      expect(
        await repository.findOutboxById(tenantB, claimed.event.id)
      ).toBeNull()
      await expect(
        repository.renewOutboxClaim(
          { ...claimed.claimRef, tenantId: tenantB },
          renewalControl()
        )
      ).rejects.toMatchObject({ code: 'conflict' })
    })

    it('uses DB time and actual bigint attempt identity with a fixed 10-second fenced claim', async () => {
      const event = await repository.enqueue({
        tenantId,
        type: 'synthetic217',
        payload: {},
        idempotencyKey: randomUUID()
      })
      const before = await dbNow()
      const claimed = await repository.claimNextFenced({
        tenantId,
        eventId: event.id,
        workerId,
        now: new Date(0),
        leaseMs: 30000
      })
      const after = await dbNow()
      expect(claimed).not.toBeNull()
      expect(Date.parse(claimed!.dbClaimedAt)).toBeGreaterThanOrEqual(
        before.getTime()
      )
      expect(Date.parse(claimed!.dbClaimedAt)).toBeLessThanOrEqual(
        after.getTime()
      )
      expect(
        claimed!.event.leaseUntil!.getTime() - Date.parse(claimed!.dbClaimedAt)
      ).toBe(10000)
      const state = await eventState(event.id)
      expect(state.attempts[0]).toMatchObject({
        id: claimed!.claimRef.expectedAttemptRowId,
        attempt: 1,
        worker_id: workerId,
        outcome: null
      })
      expect(typeof claimed!.claimRef.expectedAttemptRowId).toBe('string')
      expect(BigInt(claimed!.claimRef.expectedAttemptRowId)).toBeGreaterThan(
        BigInt(Number.MAX_SAFE_INTEGER)
      )
      expect(state.attempts[0]!.claimed_at.toISOString()).toBe(
        claimed!.dbClaimedAt
      )
      const renewed = await repository.renewOutboxClaim(
        claimed!.claimRef,
        renewalControl()
      )
      expect(Date.parse(renewed.leaseUntil) - Date.parse(renewed.dbNow)).toBe(
        10000
      )
      trace('db-clock-claim-renew', {
        claimedAt: claimed!.dbClaimedAt,
        claimLeaseUntil: claimed!.event.leaseUntil,
        renewed
      })
    })

    it('allows only one concurrent ordinary claim for the same event', async () => {
      const event = await repository.enqueue({
        tenantId,
        type: 'synthetic217',
        payload: {},
        idempotencyKey: randomUUID()
      })
      const claims = await Promise.all([
        repository.claimNextFenced({ tenantId, workerId, eventId: event.id }),
        repository.claimNextFenced({
          tenantId,
          workerId: `pare217-a:${randomUUID()}`,
          eventId: event.id
        })
      ])
      expect(claims.filter(Boolean)).toHaveLength(1)
      expect((await eventState(event.id)).attempts).toHaveLength(1)
    })

    it('retains one ACK connection but releases both transactions around effect and final hook', async () => {
      const claimed = await claim('ack-two-transactions')
      let checkouts = 0
      const tracked = new TenantScopedPostgresRuntimeRepository({
        async connect() {
          checkouts++
          return pool.connect()
        }
      })
      const input = ackInput(claimed)
      let expectedStatus = 'processing'
      const assertUnlocked = () =>
        withTenantTransaction(pool, tenantId, async (client) => {
          const selected = await client.query(
            'SELECT status FROM outbox_events WHERE tenant_id=$1 AND id=$2 FOR UPDATE NOWAIT',
            [tenantId, claimed.event.id]
          )
          expect(selected.rows[0]?.status).toBe(expectedStatus)
        })
      input.effect.mockImplementation(async () => {
        await assertUnlocked()
        return { status: 'completed' }
      })
      input.beforeFinalAck.mockImplementation(assertUnlocked)
      expect((await tracked.ackClaim(input)).status).toBe('processed')
      expect(checkouts).toBe(1)
      expect(input.effect).toHaveBeenCalledTimes(1)
      expect(input.beforeFinalAck).toHaveBeenCalledTimes(1)
      expect(input.effect.mock.invocationCallOrder[0]).toBeLessThan(
        input.beforeFinalAck.mock.invocationCallOrder[0]!
      )
      expect((await eventState(claimed.event.id)).attempts[0]!.outcome).toBe(
        'processed'
      )
      expectedStatus = 'processed'
      await tracked.ackClaim(input)
      expect(input.effect).toHaveBeenCalledTimes(1)
      expect(input.beforeFinalAck).toHaveBeenCalledTimes(2)
    })

    it('rejects stale ABA refs after real terminal failure/requeue/counter reset', async () => {
      const old = await claim('aba')
      await repository.failClaim({
        ...ackInput(old),
        error: 'synthetic terminal',
        terminal: true
      })
      await repository.requeueDeadLetter({
        tenantId,
        eventId: old.event.id,
        operatorId: 'synthetic-operator',
        correlationId: `corr_${randomUUID()}`
      })
      const fresh = await repository.claimNextFenced({
        tenantId,
        workerId,
        eventId: old.event.id
      })
      expect(fresh!.claimRef.expectedOuterAttempt).toBe(
        old.claimRef.expectedOuterAttempt
      )
      expect(fresh!.claimRef.expectedAttemptRowId).not.toBe(
        old.claimRef.expectedAttemptRowId
      )
      await expect(
        repository.renewOutboxClaim(old.claimRef, renewalControl())
      ).rejects.toMatchObject({ code: 'conflict' })
      await expect(repository.ackClaim(ackInput(old))).rejects.toMatchObject({
        code: 'conflict'
      })
      await expect(
        repository.failClaim({ ...ackInput(old), error: 'stale failure' })
      ).rejects.toMatchObject({ code: 'conflict' })
      await repository.renewOutboxClaim(fresh!.claimRef, renewalControl())
      const state = await eventState(old.event.id)
      expect(state.event).toMatchObject({
        status: 'processing',
        attempts: 1,
        lease_owner: workerId
      })
      expect(state.attempts.map((a) => a.outcome)).toEqual([
        'dead_letter',
        'requeued',
        null
      ])
      trace('aba-refusal', {
        old: old.claimRef,
        fresh: fresh!.claimRef,
        outcomes: state.attempts.map((a) => a.outcome)
      })
    })

    it('denies renewal and settlement for a finalized exact attempt outcome without resurrecting it', async () => {
      const claimed = await claim('outcome')
      // Deliberately inconsistent metadata is a negative fixture, under serving
      // RLS. No clock or lease field is changed.
      await withTenantTransaction(pool, tenantId, (client) =>
        client.query(
          "UPDATE outbox_attempts SET outcome='failed' WHERE tenant_id=$1 AND event_id=$2 AND id=$3::bigint",
          [tenantId, claimed.event.id, claimed.claimRef.expectedAttemptRowId]
        )
      )
      const before = await eventState(claimed.event.id)
      await expect(
        repository.renewOutboxClaim(claimed.claimRef, renewalControl())
      ).rejects.toMatchObject({ code: 'conflict' })
      await expect(
        repository.ackClaim(ackInput(claimed))
      ).rejects.toMatchObject({ code: 'conflict' })
      await expect(
        repository.failClaim({ ...ackInput(claimed), error: 'failure' })
      ).rejects.toMatchObject({ code: 'conflict' })
      expect(await eventState(claimed.event.id)).toEqual(before)
    })

    it('rechecks DB time after an exact-attempt lock wait and permits real expiry takeover only after 10s', async () => {
      const claimed = await claim('attempt-lock-expiry')
      const holding = await blocker('outbox_attempts', claimed.event.id)
      const applicationName = `${appName}_expiry`
      const waitingPool = newPool(applicationName)
      const waitingRepo = new TenantScopedPostgresRuntimeRepository(waitingPool)
      const input = ackInput(claimed)
      let released = false
      const outcome = waitingRepo.ackClaim(input).then(
        (value) => ({ value, error: undefined }),
        (error) => ({ value: undefined, error })
      )
      try {
        const wait = await waitForLock(applicationName)
        await untilExpired(claimed)
        await unblock(holding)
        released = true
        expect((await outcome).error).toMatchObject({ code: 'conflict' })
        expect(input.effect).not.toHaveBeenCalled()
        const expired = await eventState(claimed.event.id)
        expect(expired.attempts[0]!.outcome).toBeNull()
        await expect(
          repository.renewOutboxClaim(claimed.claimRef, renewalControl())
        ).rejects.toMatchObject({ code: 'conflict' })
        const fresh = await repository.claimNextFenced({
          tenantId,
          workerId: `pare217-a:${randomUUID()}`,
          eventId: claimed.event.id
        })
        expect(fresh!.claimRef.expectedOuterAttempt).toBe(2)
        expect(Date.parse(fresh!.dbClaimedAt)).toBeGreaterThanOrEqual(
          claimed.event.leaseUntil!.getTime()
        )
        expect(
          (await eventState(claimed.event.id)).attempts.map((a) => a.outcome)
        ).toEqual(['lease_expired', null])
        await expect(
          repository.failClaim({ ...ackInput(claimed), error: 'old process' })
        ).rejects.toMatchObject({ code: 'conflict' })
        trace('real-10s-expiry-after-attempt-lock', {
          wait,
          claimedAt: claimed.dbClaimedAt,
          expiredAt: claimed.event.leaseUntil,
          takeoverAt: fresh!.dbClaimedAt
        })
      } finally {
        if (!released) await unblock(holding)
        await outcome
        await waitingPool.end()
      }
    }, 30000)

    it('joins a stopped renewal SELECT through actual rollback, tenant cleanup and pool release', async () => {
      const claimed = await claim('abort-join')
      const holding = await blocker('outbox_events', claimed.event.id)
      const applicationName = `${appName}_abort`
      const waitingPool = newPool(applicationName)
      const waitingRepo = new TenantScopedPostgresRuntimeRepository(waitingPool)
      const controller = new AbortController()
      const before = (await eventState(claimed.event.id)).event.lease_until
      let settled = false
      let released = false
      const outcome = waitingRepo
        .renewOutboxClaim(claimed.claimRef, renewalControl(controller))
        .then(
          (value) => {
            settled = true
            return { value, error: undefined }
          },
          (error) => {
            settled = true
            return { value: undefined, error }
          }
        )
      try {
        await waitForLock(applicationName)
        controller.abort()
        await Promise.resolve()
        expect(settled).toBe(false)
        expect(waitingPool.idleCount).toBe(0)
        await unblock(holding)
        released = true
        const result = await outcome
        expect(result.error).toBeInstanceOf(FencedRenewalStoppedError)
        expect(result.error).toMatchObject({
          signal: controller.signal,
          cleanupConfirmed: true
        })
        expect(waitingPool.idleCount).toBe(1)
        expect(
          (
            await waitingPool.query(
              "SELECT NULLIF(current_setting('cvg.tenant_id',true),'') AS tenant_id"
            )
          ).rows[0]?.tenant_id
        ).toBeNull()
        expect((await eventState(claimed.event.id)).event.lease_until).toEqual(
          before
        )
        trace('abort-join', {
          cleanupConfirmed: result.error.cleanupConfirmed,
          idle: waitingPool.idleCount
        })
      } finally {
        if (!released) await unblock(holding)
        await outcome
        await waitingPool.end()
      }
    })

    it('preserves real lock_timeout SQL error racing an abort instead of relabeling it expected stop', async () => {
      const claimed = await claim('sql-error-race')
      const holding = await blocker('outbox_events', claimed.event.id)
      const applicationName = `${appName}_sqlerror`
      const waitingPool = newPool(applicationName)
      const waitingRepo = new TenantScopedPostgresRuntimeRepository(waitingPool)
      const controller = new AbortController()
      const outcome = waitingRepo
        .renewOutboxClaim(claimed.claimRef, renewalControl(controller))
        .then(
          (value) => ({ value, error: undefined }),
          (error) => ({ value: undefined, error })
        )
      try {
        await waitForLock(applicationName)
        controller.abort()
        const result = await outcome
        expect(result.error).not.toBeInstanceOf(FencedRenewalStoppedError)
        expect(result.error).toMatchObject({ code: '55P03' })
        expect(waitingPool.idleCount).toBe(1)
        expect(
          (
            await waitingPool.query(
              "SELECT NULLIF(current_setting('cvg.tenant_id',true),'') AS tenant_id"
            )
          ).rows[0]?.tenant_id
        ).toBeNull()
        trace('sql-error-not-stop', {
          code: result.error.code,
          signalAborted: controller.signal.aborted
        })
      } finally {
        await unblock(holding)
        await outcome
        await waitingPool.end()
      }
    })

    it('rejects a lost fence after the outside-lock final hook without marking the replacement processed', async () => {
      const old = await claim('ack-final-fence')
      const input = ackInput(old)
      let fresh: FencedClaimedEvent | null = null
      input.beforeFinalAck.mockImplementation(async () => {
        await repository.failClaim({
          ...ackInput(old),
          error: 'handoff fixture',
          terminal: true
        })
        await repository.requeueDeadLetter({
          tenantId,
          eventId: old.event.id,
          operatorId: 'synthetic-operator',
          correlationId: `corr_${randomUUID()}`
        })
        fresh = await repository.claimNextFenced({
          tenantId,
          workerId: `pare217-a:${randomUUID()}`,
          eventId: old.event.id
        })
      })
      await expect(repository.ackClaim(input)).rejects.toMatchObject({
        code: 'conflict'
      })
      const state = await eventState(old.event.id)
      expect(input.effect).toHaveBeenCalledTimes(1)
      expect(state.event).toMatchObject({
        status: 'processing',
        lease_owner: fresh!.claimRef.processWorkerId
      })
      expect(state.markers).toEqual([])
    })

    it('rechecks takeover under a real session lock and settles only the current exact attempt', async () => {
      const sessionIds = await session()
      const claimed = await claim('takeover', sessionIds)
      await withTenantTransaction(pool, tenantId, (client) =>
        client.query(
          "UPDATE sessions SET takeover_state='HUMAN_ACTIVE' WHERE tenant_id=$1 AND id=$2",
          [tenantId, sessionIds.sessionId]
        )
      )
      const input = ackInput(claimed)
      input.beforeFinalAck.mockImplementation(async () => {
        await withTenantTransaction(pool, tenantId, async (client) => {
          await client.query(
            'SELECT id FROM outbox_events WHERE tenant_id=$1 AND id=$2 FOR UPDATE NOWAIT',
            [tenantId, claimed.event.id]
          )
          await client.query(
            'SELECT id FROM sessions WHERE tenant_id=$1 AND id=$2 FOR UPDATE NOWAIT',
            [tenantId, sessionIds.sessionId]
          )
        })
      })
      expect((await repository.ackClaim(input)).status).toBe('dead_letter')
      expect(input.effect).not.toHaveBeenCalled()
      expect(input.beforeFinalAck).toHaveBeenCalledTimes(1)
      const state = await eventState(claimed.event.id)
      expect(state.attempts[0]!.outcome).toBe('handoff')
      expect(state.markers).toEqual([])
    })

    it('refuses final takeover settlement after a real session lock wait crosses the 10s lease', async () => {
      const ids = await session()
      const claimed = await claim('session-lock-expiry', ids)
      await withTenantTransaction(pool, tenantId, (client) =>
        client.query(
          "UPDATE sessions SET takeover_state='HUMAN_ACTIVE' WHERE tenant_id=$1 AND id=$2",
          [tenantId, ids.sessionId]
        )
      )
      const applicationName = `${appName}_session_expiry`
      const waitingPool = newPool(applicationName)
      const waitingRepo = new TenantScopedPostgresRuntimeRepository(waitingPool)
      const input = ackInput(claimed)
      let holding: PoolClient | undefined
      input.beforeFinalAck.mockImplementation(async () => {
        holding = await blocker('sessions', ids.sessionId)
      })
      const outcome = waitingRepo.ackClaim(input).then(
        (value) => ({ value, error: undefined }),
        (error) => ({ value: undefined, error })
      )
      try {
        const wait = await waitForLock(applicationName)
        expect(input.beforeFinalAck).toHaveBeenCalledTimes(1)
        await untilExpired(claimed)
        await unblock(holding!)
        holding = undefined
        expect((await outcome).error).toMatchObject({ code: 'conflict' })
        expect(input.effect).not.toHaveBeenCalled()
        const state = await eventState(claimed.event.id)
        expect(state.event.status).toBe('processing')
        expect(state.attempts[0]!.outcome).toBeNull()
        expect(state.markers).toEqual([])
        const currentSession = await withTenantContext(
          pool,
          tenantId,
          (client) =>
            client.query(
              'SELECT takeover_state FROM sessions WHERE tenant_id=$1 AND id=$2',
              [tenantId, ids.sessionId]
            )
        )
        expect(currentSession.rows[0]?.takeover_state).toBe('HUMAN_ACTIVE')
        trace('real-10s-expiry-after-session-lock', {
          wait,
          claimedAt: claimed.dbClaimedAt,
          expiredAt: claimed.event.leaseUntil,
          observedAt: await dbNow()
        })
      } finally {
        if (holding) await unblock(holding)
        await outcome
        await waitingPool.end()
      }
    }, 30000)

    it('keeps the old unbound clock/30s lease/ACK and fail contracts on the actual serving connection', async () => {
      await withTenantContext(pool, tenantId, async (client) => {
        const fixtureTime = new Date('2026-01-01T00:00:00.000Z')
        const old = new PostgresRuntimeRepository(client, {
          tenantIsolation: true,
          clock: () => fixtureTime
        })
        const event = await old.enqueue({
          tenantId,
          type: 'synthetic217',
          payload: {},
          idempotencyKey: randomUUID()
        })
        const claimed = await old.claimNext({
          tenantId,
          workerId,
          eventId: event.id,
          leaseMs: 30000,
          now: new Date(0)
        })
        expect(claimed!.leaseUntil!.getTime() - fixtureTime.getTime()).toBe(
          30000
        )
        let body = 0
        expect(
          (
            await old.ack({
              tenantId,
              eventId: event.id,
              workerId,
              effect: () => {
                body++
                return {}
              }
            })
          ).status
        ).toBe('processed')
        expect(body).toBe(1)
        const failEvent = await old.enqueue({
          tenantId,
          type: 'synthetic217',
          payload: {},
          idempotencyKey: randomUUID()
        })
        await old.claimNext({
          tenantId,
          workerId,
          eventId: failEvent.id,
          leaseMs: 30000
        })
        const failed = await old.fail({
          tenantId,
          eventId: failEvent.id,
          workerId,
          error: 'synthetic failure'
        })
        expect(failed.status).toBe('failed')
        expect(failed.availableAt.getTime()).toBe(fixtureTime.getTime() + 1000)
        trace('old-api-compatibility', {
          appClock: fixtureTime.toISOString(),
          leaseMs: 30000,
          ack: 'processed',
          fail: failed.status
        })
      })
    })

    it('keeps public tenant transaction rollback and clears the real connection tenant context', async () => {
      const eventId = `outbox_${randomUUID()}`
      const failure = new Error('synthetic rollback')
      await expect(
        withTenantTransaction(pool, tenantId, async (client) => {
          await new PostgresRuntimeRepository(client).enqueue(
            {
              tenantId,
              id: eventId,
              type: 'synthetic217',
              payload: {},
              idempotencyKey: randomUUID()
            },
            client
          )
          throw failure
        })
      ).rejects.toBe(failure)
      expect(await repository.findOutboxById(tenantId, eventId)).toBeNull()
      expect(
        (
          await pool.query(
            "SELECT NULLIF(current_setting('cvg.tenant_id',true),'') AS tenant_id"
          )
        ).rows[0]?.tenant_id
      ).toBeNull()
    })
  }
)
