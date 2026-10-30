// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- IPC replies from the synthetic child are untyped JSON */
import { fork, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runSessionEventMigrations } from '../packages/persistence/src/session-events.ts'
import {
  createPgPhysicalSessionPool,
  createPostgresSessionPersistence,
  verifySessionFork
} from '../packages/persistence/src/session-persistence.ts'

// PAR-S04 slice 2: FP05 across really distinct processes (SPEC 0287 §7). The fork is killed inside
// its open transaction, behind an observable barrier; waiting is on pg_stat_activity and IPC
// replies, never a sleep.
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_S01_PG_REQUIRED === '1')
  throw new Error('PAR-S04 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(6).toString('hex')
const schema = `pars04p_${suffix}`
const role = `pars04p_role_${suffix}`
const password = 'pars04-synthetic-only'
const tenant = 'tenant-synthetic-A'
const OPERATION_MS = 5_000
const CHILD_MS = 120_000
const childScript = join(process.cwd(), 'tests', 'support', 'par-s01-child.ts')

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
  constructor(connectionString: string) {
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
  /** Sends a request and resolves to the reply; `wait:false` returns the promise without a deadline. */
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
  async kill(): Promise<void> {
    this.#proc.kill('SIGKILL')
    await this.#exited
  }
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
const spawn = (): Child => {
  const c = new Child(roleUrl)
  children.push(c)
  return c
}
const rows = async (id: string) =>
  (
    await admin.query(
      `SELECT sequence FROM ${schema}.session_events WHERE tenant_id=$1 AND session_id=$2 ORDER BY sequence`,
      [tenant, id]
    )
  ).rows.map((r) => Number(r.sequence))
const streams = async (id: string) =>
  (
    await admin.query(
      `SELECT 1 FROM ${schema}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
      [tenant, id]
    )
  ).rowCount
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

describe.skipIf(!url)('PAR-S04 slice 2: fork across processes', () => {
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
    await admin.query(`GRANT SELECT ON ${schema}.schema_migrations TO ${role}`)
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

  const inProcess = () =>
    createPostgresSessionPersistence(
      createPgPhysicalSessionPool({ connectionString: roleUrl }),
      readPool,
      {
        tenantId: tenant,
        schemaName: schema,
        maxOpenWriters: 4,
        acquireTimeoutMs: 3000
      }
    ).then((r) => r.service)

  it('a fork killed inside its transaction, after earlier events were inserted, leaves no child and the same id forks whole afterwards', async () => {
    const owner = spawn()
    await owner.ok('seedTurns', { session: 'kf-src', name: 'src', turns: 3 })
    const gateKey = 7_770_404
    await admin.query(
      `CREATE FUNCTION ${schema}.test_gate() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN IF NEW.session_id = 'kf-child' AND NEW.sequence = 6 THEN PERFORM pg_advisory_xact_lock(${gateKey}); END IF; RETURN NEW; END $$`
    )
    await admin.query(
      `CREATE TRIGGER zz_test_gate BEFORE INSERT ON ${schema}.session_events
         FOR EACH ROW EXECUTE FUNCTION ${schema}.test_gate()`
    )
    const gate = new Client({ connectionString: url })
    await gate.connect()
    const forker = spawn()
    try {
      await gate.query('SELECT pg_advisory_lock($1)', [gateKey])
      // The source stays open in `owner`: forking does not need, and does not take, its lock.
      const inflight = forker
        .call('fork', { source: 'kf-src', session: 'kf-child', name: 'c' })
        .catch(() => undefined)
      await waitFor(
        async () =>
          (
            await admin.query(
              `SELECT 1 FROM pg_stat_activity
                WHERE usename=$1 AND wait_event_type='Lock' AND wait_event='advisory' AND xact_start IS NOT NULL`,
              [role]
            )
          ).rowCount! > 0
      )
      await forker.kill()
      await gate.query('SELECT pg_advisory_unlock($1)', [gateKey])
      await inflight
      await waitFor(
        async () =>
          (
            await admin.query(
              `SELECT 1 FROM pg_stat_activity WHERE usename=$1 AND xact_start IS NOT NULL AND state <> 'idle' AND pid <> pg_backend_pid()`,
              [role]
            )
          ).rowCount === 0
      )
    } finally {
      await gate.end()
      await admin.query(`DROP TRIGGER zz_test_gate ON ${schema}.session_events`)
      await admin.query(`DROP FUNCTION ${schema}.test_gate()`)
    }
    expect(await streams('kf-child')).toBe(0)
    expect(await rows('kf-child')).toEqual([])
    // Positive: the same id is usable, and the source never lost its owner.
    const again = spawn()
    expect(
      await again.ok('fork', {
        source: 'kf-src',
        session: 'kf-child',
        name: 'c'
      })
    ).toEqual({ cut: 12 })
    expect(await rows('kf-child')).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1)
    )
    expect(
      await verifySessionFork(await inProcess(), 'kf-child', 'kf-src')
    ).toEqual([])
    expect((await holderPids('kf-src')).length).toBe(1)
    await owner.ok('close', { name: 'src' })
  })

  it('a completed fork survives the death of its process: the lock frees and a new owner opens exactly it', async () => {
    const owner = spawn()
    await owner.ok('seedTurns', { session: 'kf2-src', name: 'src', turns: 2 })
    const forker = spawn()
    expect(
      await forker.ok('fork', {
        source: 'kf2-src',
        session: 'kf2-child',
        name: 'c'
      })
    ).toEqual({ cut: 8 })
    expect((await holderPids('kf2-child')).length).toBe(1)
    await forker.kill()
    await waitFor(async () => (await holderPids('kf2-child')).length === 0)
    // Reconcile by the original id, as a caller that lost the ACK would.
    const next = spawn()
    await next.ok('open', { session: 'kf2-child', access: 'write', name: 'c' })
    expect(
      (await next.ok('readFresh', { session: 'kf2-child' })).events
    ).toHaveLength(8)
    expect(
      await verifySessionFork(await inProcess(), 'kf2-child', 'kf2-src')
    ).toEqual([])
    await next.ok('close', { name: 'c' })
    await owner.kill()
  })

  it('FP08: a live owner in another process is AlreadyOwned; after its kill a new handle reads the exact prefix, writes nothing and finds the open turn', async () => {
    const owner = spawn()
    expect(
      await owner.ok('seedTurns', {
        session: 'kr-src',
        name: 'src',
        turns: 2,
        crashed: true
      })
    ).toEqual({ events: 11 })
    const svc = await inProcess()
    await expect(svc.resumeSession('kr-src')).rejects.toMatchObject({
      name: 'SessionAlreadyOwnedError'
    })
    await owner.kill()
    await waitFor(async () => (await holderPids('kr-src')).length === 0)
    const before = await rows('kr-src')
    const { handle, analysis } = await svc.resumeSession('kr-src')
    expect((await handle.read(0)).events).toHaveLength(11)
    expect(analysis.inheritableThrough).toBe(8)
    expect(analysis.openTurn).toMatchObject({
      correlationId: 'tc',
      uncertainEffects: ['op-tc']
    })
    expect(await rows('kr-src')).toEqual(before)
    // The interrupted turn does not cross a fork either.
    const child = await svc.fork('kr-src', {
      version: 1,
      id: 'kr-child',
      createdAt: 1_700_000_000_000,
      isSeeded: false
    })
    expect(child.inheritedEventCount).toBe(8)
    expect(await verifySessionFork(svc, 'kr-child', 'kr-src')).toEqual([])
    await child.close()
    await handle.close()
  })
})
