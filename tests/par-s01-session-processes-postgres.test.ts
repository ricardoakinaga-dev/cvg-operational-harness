// @vitest-environment node
import { execFileSync, fork, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { materializeSessionEvent, sessionEventInputDigest } from '@cvg/harness'
import {
  PostgresSessionEventStore,
  runSessionEventMigrations
} from '../packages/persistence/src/session-events.ts'

// PAR-S01 slice 6: witnesses S1-S5 across really distinct processes (SPEC 0221 §10: SP03, SP04,
// SP08, SP09, SP15, SP16, SP17, SP20). Deadlines: operation 5s, child 180s, teardown TERM 1s /
// KILL 2s / join 5s. Waiting is on observable conditions (pg_locks, IPC replies), never a sleep.
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_S01_PG_REQUIRED === '1')
  throw new Error('PAR-S01 requires its own disposable TEST_DATABASE_URL')
const container = process.env.PAR_S01_PG_CONTAINER
const suffix = randomBytes(6).toString('hex')
const schema = `pars01p_${suffix}`
const role = `pars01p_role_${suffix}`
const password = 'pars01-synthetic-only'
const tenantA = 'tenant-synthetic-A'
const tenantB = 'tenant-synthetic-B'
const OPERATION_MS = 5_000
const CHILD_MS = 180_000
const childScript = fileURLToPath(
  new URL('./support/par-s01-child.ts', import.meta.url)
)

interface Reply {
  readonly id: number
  readonly ok: boolean
  readonly value?: any
  readonly error?: { name: string; message: string; code?: string }
}
class Child {
  readonly #proc: ChildProcess
  readonly #pending = new Map<number, (r: Reply) => void>()
  readonly #exited: Promise<void>
  #seq = 0
  readonly ready: Promise<void>
  constructor(
    readonly tenant: string,
    connectionString: string
  ) {
    this.#proc = fork(childScript, [], {
      execArgv: ['--import', 'tsx'],
      env: {
        ...process.env,
        PAR_S01_CHILD_CONFIG: JSON.stringify({
          url: connectionString,
          schema,
          tenant
        })
      },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    })
    this.#exited = new Promise((resolve) =>
      this.#proc.once('exit', () => resolve())
    )
    const deadline = setTimeout(() => this.#proc.kill('SIGKILL'), CHILD_MS)
    deadline.unref()
    this.#exited.then(() => clearTimeout(deadline))
    this.ready = new Promise((resolve, reject) => {
      this.#proc.on('message', (m: Reply) => {
        if (m.id === 0) return resolve()
        this.#pending.get(m.id)?.(m)
        this.#pending.delete(m.id)
      })
      this.#proc.once('exit', () => reject(new Error('child exited')))
    })
    this.ready.catch(() => undefined)
  }
  get pid(): number {
    return this.#proc.pid!
  }
  /** One operation with a 5s budget; resolves to the child's reply, never throws for domain errors. */
  async call(cmd: string, args: Record<string, unknown> = {}): Promise<Reply> {
    await this.ready
    const id = (this.#seq += 1)
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${cmd} exceeded ${OPERATION_MS}ms`)),
        OPERATION_MS
      )
      this.#pending.set(id, (r) => {
        clearTimeout(timer)
        resolve(r)
      })
      this.#proc.send({ id, cmd, ...args }, (e) => {
        if (!e) return
        clearTimeout(timer)
        resolve({
          id,
          ok: false,
          error: { name: 'ChannelClosed', message: e.message }
        })
      })
    })
  }
  async ok(cmd: string, args: Record<string, unknown> = {}): Promise<any> {
    const r = await this.call(cmd, args)
    if (!r.ok)
      throw new Error(`${cmd} failed: ${r.error?.name} ${r.error?.message}`)
    return r.value
  }
  /** Abrupt death: no close, no flush, no goodbye. */
  async kill(): Promise<void> {
    this.#proc.kill('SIGKILL')
    await this.#exited
  }
  /** Teardown: TERM, 1s, KILL, 2s, join within 5s. */
  async stop(): Promise<void> {
    if (this.#proc.exitCode !== null || this.#proc.signalCode !== null) return
    this.#proc.kill('SIGTERM')
    const t1 = setTimeout(() => this.#proc.kill('SIGKILL'), 1_000)
    await Promise.race([
      this.#exited,
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error('child not joined')), 5_000)
      )
    ]).finally(() => clearTimeout(t1))
  }
}

let admin: Client
let readPool: Pool
let roleUrl: string
const children: Child[] = []
const spawn = (tenant = tenantA): Child => {
  const c = new Child(tenant, roleUrl)
  children.push(c)
  return c
}
const stored = async (tenant: string, id: string) =>
  (
    await admin.query(
      `SELECT sequence, event_id FROM ${schema}.session_events WHERE tenant_id=$1 AND session_id=$2 ORDER BY sequence`,
      [tenant, id]
    )
  ).rows.map((r) => Number(r.sequence))
const holderPids = async (id: string): Promise<number[]> =>
  (
    await admin.query(
      `SELECT l.pid FROM pg_locks l WHERE l.locktype='advisory' AND l.objsubid=2 AND l.granted
       AND l.classid = ((SELECT '${schema}.session_streams'::regclass::oid::bigint + 2147483648) % 4294967296)::oid
       AND l.objid = (SELECT writer_lock_id FROM ${schema}.session_streams WHERE session_id=$1 LIMIT 1)::oid`,
      [id]
    )
  ).rows.map((r) => r.pid as number)
async function waitFor(
  check: () => Promise<boolean>,
  budgetMs = OPERATION_MS
): Promise<void> {
  const start = Date.now()
  for (;;) {
    if (await check()) return
    if (Date.now() - start > budgetMs) throw new Error('condition not reached')
    await new Promise((r) => setImmediate(r))
  }
}
const eventsOf = (sessionId: string, tenant: string, n: number) =>
  Array.from({ length: n }, (_, i) =>
    materializeSessionEvent(
      {
        tenantId: tenant,
        sessionId,
        formatVersion: 1,
        eventId: `${sessionId}-e${i + 1}`,
        timestamp: '2026-10-29T00:00:00.000Z',
        correlationId: 'corr-synthetic',
        traceId: 'trace-synthetic',
        type: 'message/user',
        payload: { text: `${sessionId}#${i + 1}` }
      },
      i + 1
    )
  )

describe.skipIf(!url)(
  'PAR-S01 slice 6: witnesses in distinct processes',
  () => {
    beforeAll(async () => {
      admin = new Client({ connectionString: url })
      admin.on('error', () => undefined)
      await admin.connect()
      await runSessionEventMigrations(admin, { schemaName: schema })
      await admin.query(
        `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '${password}'`
      )
      await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
      await admin.query(
        `GRANT SELECT, INSERT ON ${schema}.session_events, ${schema}.session_streams TO ${role}`
      )
      await admin.query(
        `GRANT UPDATE (next_sequence) ON ${schema}.session_streams TO ${role}`
      )
      await admin.query(
        `GRANT SELECT ON ${schema}.schema_migrations TO ${role}`
      )
      const u = new URL(url!)
      u.username = role
      u.password = password
      roleUrl = u.toString()
      readPool = new Pool({ connectionString: roleUrl, max: 4 })
      readPool.on('error', () => undefined)
    })
    afterAll(async () => {
      await Promise.allSettled(children.map((c) => c.stop()))
      await readPool?.end().catch(() => undefined)
      await admin
        ?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        .catch(() => undefined)
      await admin?.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined)
      await admin?.end().catch(() => undefined)
    })

    describe('S1: two processes on the same log', () => {
      it('lets exactly one process own a session while the other reads freely and progresses elsewhere', async () => {
        const a = spawn()
        const b = spawn()
        expect(a.pid).not.toBe(b.pid)
        expect(a.pid).not.toBe(process.pid)
        await a.ok('create', { session: 's1', name: 'w' })
        await a.ok('append', { session: 's1', name: 'w', from: 1, count: 3 })
        // The second process cannot own it, immediately and with the distinct error.
        const refused = await b.call('open', {
          session: 's1',
          name: 'w',
          access: 'write'
        })
        expect(refused.ok).toBe(false)
        expect(refused.error!.name).toBe('SessionAlreadyOwnedError')
        // It reads the exact prefix and writes another session at the same time.
        const read = await b.ok('open', {
          session: 's1',
          name: 'r',
          access: 'read'
        })
        expect(read.access).toBe('read')
        expect((await b.ok('read', { name: 'r' })).events).toEqual(
          eventsOf('s1', tenantA, 3)
        )
        await b.ok('create', { session: 's1b', name: 'other' })
        await b.ok('append', {
          session: 's1b',
          name: 'other',
          from: 1,
          count: 2
        })
        expect(await stored(tenantA, 's1b')).toEqual([1, 2])
        // The read-only handle in B cannot write.
        const ro = await b.call('append', {
          session: 's1',
          name: 'r',
          from: 4,
          count: 1
        })
        expect(ro.error!.name).toBe('SessionReadOnlyError')
        expect(await stored(tenantA, 's1')).toEqual([1, 2, 3])
        await a.ok('close', { name: 'w' })
        await b.ok('close', { name: 'other' })
      })

      it('admits exactly one of two processes racing to own the same existing session', async () => {
        const seed = spawn()
        await seed.ok('create', { session: 's1c', name: 'w' })
        await seed.ok('close', { name: 'w' })
        const a = spawn()
        const b = spawn()
        const results = await Promise.all([
          a.call('open', { session: 's1c', name: 'w', access: 'write' }),
          b.call('open', { session: 's1c', name: 'w', access: 'write' })
        ])
        expect(results.filter((r) => r.ok)).toHaveLength(1)
        const loser = results.find((r) => !r.ok)!
        expect(loser.error!.name).toBe('SessionAlreadyOwnedError')
        expect(await holderPids('s1c')).toHaveLength(1)
      })
    })

    describe('S2: the legacy store is refused under an owner', () => {
      const legacy = () =>
        new PostgresSessionEventStore(readPool, {
          tenantId: tenantA,
          schemaName: schema
        })
      const legacyInput = (sessionId: string, eventId: string) => {
        const {
          sequence: _s,
          schemaFingerprint: _f,
          ...input
        } = eventsOf(sessionId, tenantA, 1)[0]!
        void _s
        void _f
        return { ...input, eventId }
      }
      it('rejects an append from another process connection while the owner lives, writing nothing', async () => {
        const a = spawn()
        await a.ok('create', { session: 's2', name: 'w' })
        await a.ok('append', { session: 's2', name: 'w', from: 1, count: 2 })
        await expect(
          legacy().append(legacyInput('s2', 'legacy-1'))
        ).rejects.toThrow()
        expect(await stored(tenantA, 's2')).toEqual([1, 2])
        expect(
          (
            await admin.query(
              `SELECT next_sequence FROM ${schema}.session_streams WHERE session_id='s2'`
            )
          ).rows[0].next_sequence
        ).toBe('3')
        await a.ok('close', { name: 'w' })
        // Once released, the legacy store continues the same log.
        await legacy().append(legacyInput('s2', 'legacy-2'))
        expect(await stored(tenantA, 's2')).toEqual([1, 2, 3])
      })

      it('does not deadlock when a legacy transaction holds the stream row before the owner appends', async () => {
        const a = spawn()
        await a.ok('create', { session: 's2i', name: 'w' })
        const legacyConn = new Client({ connectionString: roleUrl })
        await legacyConn.connect()
        try {
          // Role has no UPDATE on anything but the cursor; FOR UPDATE needs UPDATE privilege on a column.
          await legacyConn.query('BEGIN')
          await legacyConn.query(
            "SELECT set_config('cvg.tenant_id', $1, true)",
            [tenantA]
          )
          await legacyConn.query(
            `SELECT next_sequence FROM ${schema}.session_streams WHERE session_id='s2i' FOR UPDATE`
          )
          const owner = a.call('append', {
            session: 's2i',
            name: 'w',
            from: 1,
            count: 1
          })
          // The owner's append is now queued behind the legacy row lock, observable in pg_locks.
          await waitFor(
            async () =>
              (
                await admin.query(
                  `SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND datname=current_database() AND usename=$1`,
                  [role]
                )
              ).rowCount! > 0
          )
          // The legacy side then writes: the guard fails at once instead of waiting on the owner.
          const row = eventsOf('s2i', tenantA, 1)[0]!
          const { sequence: _s, schemaFingerprint: _f, ...input } = row
          void _s
          void _f
          await expect(
            legacyConn.query(
              `INSERT INTO ${schema}.session_events (tenant_id, session_id, sequence, event_id, format_version, event_type, schema_fingerprint, input_digest, record)
               VALUES ($1, 's2i', 1, $2, 1, $3, $4, $5, $6::jsonb)`,
              [
                tenantA,
                row.eventId,
                row.type,
                row.schemaFingerprint,
                sessionEventInputDigest(input),
                JSON.stringify(row)
              ]
            )
          ).rejects.toMatchObject({ code: '55P03' })
          await legacyConn.query('ROLLBACK')
          const done = await owner
          expect(done.ok).toBe(true)
          expect(await stored(tenantA, 's2i')).toEqual([1])
        } finally {
          await legacyConn.end()
        }
        await a.ok('close', { name: 'w' })
      })
    })

    describe('S3: two tenants with the same session id, non-owner roles', () => {
      it('keeps both logs apart across processes and refuses DDL and metadata updates', async () => {
        const a = spawn(tenantA)
        const b = spawn(tenantB)
        await Promise.all([
          a.ok('create', { session: 'dup', name: 'w' }),
          b.ok('create', { session: 'dup', name: 'w' })
        ])
        await Promise.all([
          a.ok('append', { session: 'dup', name: 'w', from: 1, count: 3 }),
          b.ok('append', { session: 'dup', name: 'w', from: 1, count: 2 })
        ])
        expect(await stored(tenantA, 'dup')).toEqual([1, 2, 3])
        expect(await stored(tenantB, 'dup')).toEqual([1, 2])
        expect((await a.ok('readFresh', { session: 'dup' })).events).toEqual(
          eventsOf('dup', tenantA, 3)
        )
        expect((await b.ok('readFresh', { session: 'dup' })).events).toEqual(
          eventsOf('dup', tenantB, 2)
        )
        // Two owners of the same id in two tenants hold distinct advisory keys.
        expect(
          (
            await admin.query(
              `SELECT count(DISTINCT writer_lock_id)::int AS n FROM ${schema}.session_streams WHERE session_id='dup'`
            )
          ).rows[0].n
        ).toBe(2)
        for (const sql of [
          `ALTER TABLE ${schema}.session_events ADD COLUMN x int`,
          `UPDATE ${schema}.session_streams SET header = '{}'::jsonb WHERE session_id='dup'`,
          `UPDATE ${schema}.session_streams SET writer_lock_id = 1 WHERE session_id='dup'`,
          `DELETE FROM ${schema}.session_streams WHERE session_id='dup'`,
          `TRUNCATE ${schema}.session_events`
        ]) {
          const r = await a.call('sql', { sql })
          expect(r.ok, sql).toBe(false)
        }
        expect(await stored(tenantA, 'dup')).toEqual([1, 2, 3])
        await Promise.all([
          a.ok('close', { name: 'w' }),
          b.ok('close', { name: 'w' })
        ])
      })
    })

    describe('S4: ACK, abrupt kill, another process reads the exact prefix', () => {
      it('keeps every acknowledged event after the owner process dies without close', async () => {
        const a = spawn()
        await a.ok('create', { session: 's4', name: 'w' })
        await a.ok('flush', { name: 'w' }) // empty create is itself durable
        await a.ok('append', { session: 's4', name: 'w', from: 1, count: 5 })
        await a.ok('flush', { name: 'w' }) // ACK received: the barrier
        await a.kill()
        await waitFor(async () => (await holderPids('s4')).length === 0)
        const b = spawn()
        await b.ok('open', { session: 's4', name: 'w', access: 'write' })
        expect((await b.ok('read', { name: 'w' })).events).toEqual(
          eventsOf('s4', tenantA, 5)
        )
        // The log continues with the next sequence, no gap, no rewrite.
        await b.ok('append', { session: 's4', name: 'w', from: 6, count: 1 })
        expect(await stored(tenantA, 's4')).toEqual([1, 2, 3, 4, 5, 6])
        await b.ok('close', { name: 'w' })
      })

      it('survives the death of a process that created an empty session', async () => {
        const a = spawn()
        await a.ok('create', { session: 's4e', name: 'w' })
        await a.kill()
        await waitFor(async () => (await holderPids('s4e')).length === 0)
        const b = spawn()
        await b.ok('open', { session: 's4e', name: 'w', access: 'write' })
        expect((await b.ok('read', { name: 'w' })).events).toEqual([])
        await b.ok('close', { name: 'w' })
      })

      it('replays a real SDK turn from another process after the first one is killed (SP20)', async () => {
        const a = spawn()
        await a.ok('create', { session: 's4s', name: 'w' })
        const turn = await a.ok('sdkTurn', {
          session: 's4s',
          name: 'w',
          text: 'hello',
          prefix: 'first'
        })
        await a.ok('flush', { name: 'w' })
        await a.kill()
        await waitFor(async () => (await holderPids('s4s')).length === 0)
        const b = spawn()
        await b.ok('open', { session: 's4s', name: 'w', access: 'write' })
        const reopened = await b.ok('read', { name: 'w' })
        expect(reopened.events).toEqual(turn.events)
        const second = await b.ok('sdkTurn', {
          session: 's4s',
          name: 'w',
          text: 'again',
          prefix: 'second',
          idStart: 100
        })
        expect(second.events.slice(0, turn.events.length)).toEqual(turn.events)
        expect(second.events.length).toBeGreaterThan(turn.events.length)
        expect(
          second.events.map((e: { sequence: number }) => e.sequence)
        ).toEqual(second.events.map((_: unknown, i: number) => i + 1))
        await b.ok('close', { name: 'w' })
      })

      it('never exposes a partial batch: a killed owner leaves only whole acknowledged batches', async () => {
        const a = spawn()
        await a.ok('create', { session: 's4p', name: 'w' })
        await a.ok('append', { session: 's4p', name: 'w', from: 1, count: 4 })
        // A large second batch is in flight when the process dies.
        const inflight = a
          .call('append', { session: 's4p', name: 'w', from: 5, count: 200 })
          .catch(() => undefined)
        await a.kill()
        await inflight
        await waitFor(async () => (await holderPids('s4p')).length === 0)
        const seq = await stored(tenantA, 's4p')
        expect([4, 204]).toContain(seq.length)
        expect(seq).toEqual(seq.map((_, i) => i + 1))
        const next = Number(
          (
            await admin.query(
              `SELECT next_sequence FROM ${schema}.session_streams WHERE session_id='s4p'`
            )
          ).rows[0].next_sequence
        )
        expect(next).toBe(seq.length + 1)
      })
    })

    describe('S5: losing the PostgreSQL session', () => {
      it('leaves the old handle LOST forever, even after another process owned and released the log', async () => {
        const a = spawn()
        await a.ok('create', { session: 's5', name: 'w' })
        await a.ok('append', { session: 's5', name: 'w', from: 1, count: 2 })
        const [pid] = await holderPids('s5')
        await admin.query('SELECT pg_terminate_backend($1)', [pid])
        await waitFor(async () => (await holderPids('s5')).length === 0)
        const lost = await a.call('append', {
          session: 's5',
          name: 'w',
          from: 3,
          count: 1
        })
        expect(lost.ok).toBe(false)
        expect([
          'SessionOwnershipLostError',
          'SessionHandleClosedError'
        ]).toContain(lost.error!.name)
        const b = spawn()
        await b.ok('open', { session: 's5', name: 'w', access: 'write' })
        await b.ok('append', { session: 's5', name: 'w', from: 3, count: 1 })
        await b.ok('close', { name: 'w' })
        // The log is free again, but the old handle does not revive.
        const again = await a.call('append', {
          session: 's5',
          name: 'w',
          from: 4,
          count: 1
        })
        expect(again.ok).toBe(false)
        expect(again.error!.name).toBe(lost.error!.name)
        expect(await stored(tenantA, 's5')).toEqual([1, 2, 3])
      })
    })

    describe.skipIf(!container)(
      'S5 on disk: crash and restart of PostgreSQL',
      () => {
        it('keeps the acknowledged prefix across SIGKILL of the postmaster, and the old handle stays dead', async () => {
          const a = spawn()
          await a.ok('create', { session: 's5c', name: 'w' })
          await a.ok('append', { session: 's5c', name: 'w', from: 1, count: 4 })
          await a.ok('flush', { name: 'w' }) // ACK
          execFileSync('docker', ['kill', '--signal', 'KILL', container!])
          execFileSync('docker', ['start', container!])
          // Crash recovery is explicitly measured, not bounded by the 5s operation budget.
          const started = Date.now()
          let fresh: Client | undefined
          await waitFor(async () => {
            const probe = new Client({ connectionString: url })
            probe.on('error', () => undefined)
            try {
              await probe.connect()
              await probe.query('SELECT 1')
              probe.on('error', () => undefined)
              fresh = probe
              return true
            } catch {
              await probe.end().catch(() => undefined)
              return false
            }
          }, 60_000)
          const recoveryMs = Date.now() - started
          console.log(`PAR-S01 crash recovery observed in ${recoveryMs}ms`)
          await admin.end().catch(() => undefined)
          admin = fresh!
          expect(await stored(tenantA, 's5c')).toEqual([1, 2, 3, 4])
          expect((await holderPids('s5c')).length).toBe(0)
          const dead = await a.call('append', {
            session: 's5c',
            name: 'w',
            from: 5,
            count: 1
          })
          expect(dead.ok).toBe(false)
          const b = spawn()
          await b.ok('open', { session: 's5c', name: 'w', access: 'write' })
          expect((await b.ok('read', { name: 'w' })).events).toEqual(
            eventsOf('s5c', tenantA, 4)
          )
          await b.ok('append', { session: 's5c', name: 'w', from: 5, count: 1 })
          expect(await stored(tenantA, 's5c')).toEqual([1, 2, 3, 4, 5])
          await b.ok('close', { name: 'w' })
          expect(sessionEventInputDigest).toBeTypeOf('function')
        }, 120_000)
      }
    )
  }
)
