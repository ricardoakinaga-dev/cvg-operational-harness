import { randomUUID } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { TenantId } from '@cvg/platform'
import { InMemoryDatabase } from '../db.ts'
import { JourneyRepository } from '../journeys.ts'
import { ConversationRepository } from '../repositories/conversation-repository.ts'
import { AuditRepository } from '../repositories/audit-repository.ts'
import { PostgresJourneyRepository } from '../journeys-postgres.ts'
import { runPostgresMigrations } from '../postgres.ts'
import {
  withTenantTransaction,
  type PostgresPoolLike
} from '../tenant-scoped-postgres.ts'

const tenantId = `tenant_${randomUUID()}` as TenantId
const context = {
  actorType: 'Operator' as const,
  actorId: 'operator.synthetic',
  correlationId: `corr_${randomUUID()}`
}

describe('transaction cleanup verification', () => {
  it.each(['success', 'failure'] as const)(
    'destroys client on %s when cleanup verification is absent or dirty',
    async (path) => {
      for (const rows of [[], [{}], [{ tenant_id: tenantId }]]) {
        const release = vi.fn()
        const client = { query: vi.fn(async () => ({ rows })), release }
        const pool = {
          connect: async () => client
        } as unknown as PostgresPoolLike
        await expect(
          withTenantTransaction(pool, tenantId, async () => {
            if (path === 'failure') throw new Error('callback failure')
            return 'result'
          })
        ).rejects.toThrow(path === 'failure' ? 'callback failure' : 'cleanup')
        expect(release).toHaveBeenCalledExactlyOnceWith(expect.any(Error))
      }
    }
  )

  it.each(['success', 'failure'] as const)(
    'reuses verified clean client after %s',
    async (path) => {
      const release = vi.fn()
      const query = vi.fn(async (sql: string) => ({
        rows: sql.includes('current_setting') ? [{ tenant_id: null }] : []
      }))
      const pending = withTenantTransaction(
        {
          connect: async () => ({ query, release })
        } as unknown as PostgresPoolLike,
        tenantId,
        async () => {
          if (path === 'failure') throw new Error('callback failure')
          return 42
        }
      )
      if (path === 'failure')
        await expect(pending).rejects.toThrow('callback failure')
      else await expect(pending).resolves.toBe(42)
      expect(
        query.mock.calls.some((call) =>
          String(call[0]).includes('current_setting')
        )
      ).toBe(true)
      expect(release).toHaveBeenCalledExactlyOnceWith(undefined)
    }
  )
})

it('destroys a client whose first cleanup failed even if rollback cleanup recovers', async () => {
  let verifications = 0
  const release = vi.fn()
  const query = async (sql: string) => ({
    rows: sql.includes('current_setting')
      ? ++verifications === 1
        ? []
        : [{ tenant_id: null }]
      : []
  })
  await expect(
    withTenantTransaction(
      {
        connect: async () => ({ query, release })
      } as unknown as PostgresPoolLike,
      tenantId,
      async () => 42
    )
  ).rejects.toThrow('cleanup')
  expect(verifications).toBe(2)
  expect(release).toHaveBeenCalledExactlyOnceWith(expect.any(Error))
})

describe('journey task memory atomicity', () => {
  it('restores task and audit state when append fails, then retries once', () => {
    const db = new InMemoryDatabase()
    const seeded = new ConversationRepository(db).createWithSession({
      tenantId,
      channel: 'web',
      senderRef: 'synthetic',
      externalMessageId: 'synthetic-task-audit',
      body: 'synthetic'
    })
    const repo = new JourneyRepository(db)
    const input = {
      tenantId,
      sessionId: seeded.session.id,
      title: 'synthetic',
      description: 'synthetic',
      idempotencyKey: 'memory-rollback',
      auditContext: context
    }
    const beforeTasks = [...db.state.tasks]
    const beforeAudit = [...db.state.auditEvents]
    const append = vi
      .spyOn(AuditRepository.prototype, 'append')
      .mockImplementationOnce(() => {
        throw new Error('synthetic audit failure')
      })
    try {
      expect(() => repo.createJourneyTask(input)).toThrow(
        'synthetic audit failure'
      )
      expect(db.state.tasks).toEqual(beforeTasks)
      expect(db.state.auditEvents).toEqual(beforeAudit)
    } finally {
      append.mockRestore()
    }
    const task = repo.createJourneyTask(input)
    expect(repo.createJourneyTask(input).id).toBe(task.id)
    expect(db.state.tasks).toHaveLength(beforeTasks.length + 1)
    expect(db.state.auditEvents).toHaveLength(beforeAudit.length + 1)
  })
})

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'journey task atomicity PostgreSQL',
  () => {
    const schema = `task_atomic_${randomUUID().replaceAll('-', '')}`
    const sessionId = `sess_${randomUUID()}`
    const conversationId = `conv_${randomUUID()}`
    let admin: Client
    let pool: Pool
    beforeAll(async () => {
      admin = new Client({ connectionString: process.env.TEST_DATABASE_URL })
      await admin.connect()
      await runPostgresMigrations(admin, { schemaName: schema })
      pool = new Pool({
        connectionString: process.env.TEST_DATABASE_URL,
        max: 2,
        options: `-c search_path=${schema}`
      })
      await admin.query(
        `INSERT INTO conversations(tenant_id,id,channel,sender_ref,sender_ref_hash,status,correlation_id,created_at,updated_at) VALUES($1,$2,'web','synthetic','fff','active',$3,now(),now())`,
        [tenantId, conversationId, context.correlationId]
      )
      await admin.query(
        `INSERT INTO sessions(tenant_id,id,conversation_id,status,takeover_state,created_at,updated_at) VALUES($1,$2,$3,'active','BOT_ACTIVE',now(),now())`,
        [tenantId, sessionId, conversationId]
      )
    })
    afterAll(async () => {
      await pool?.end()
      await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin?.end()
    })
    const input = (key: string) => ({
      tenantId,
      sessionId,
      title: 'synthetic',
      description: 'synthetic',
      idempotencyKey: key,
      auditContext: context
    })
    it('rolls back task on rejected audit and retries with one trusted event', async () => {
      const repo = new PostgresJourneyRepository(pool)
      await admin.query(
        `CREATE FUNCTION reject_task_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$`
      )
      await admin.query(
        `CREATE TRIGGER reject_task_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_task_audit()`
      )
      try {
        await expect(repo.createJourneyTask(input('rollback'))).rejects.toThrow(
          'synthetic audit failure'
        )
        expect((await admin.query('SELECT id FROM tasks')).rows).toHaveLength(0)
        expect(
          (await admin.query('SELECT id FROM audit_events')).rows
        ).toHaveLength(0)
      } finally {
        await admin.query('DROP TRIGGER reject_task_audit ON audit_events')
      }
      const task = await repo.createJourneyTask(input('rollback'))
      expect((await repo.createJourneyTask(input('rollback'))).id).toBe(task.id)
      const events = (
        await admin.query(
          'SELECT actor_type,actor_id,correlation_id,payload FROM audit_events'
        )
      ).rows
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        actor_type: context.actorType,
        actor_id: context.actorId,
        correlation_id: context.correlationId,
        payload: {
          journey: 'journey_task_created',
          resourceId: task.id,
          conversationId,
          sessionId
        }
      })
    })
    it('concurrent same-key insert returns winner without aborted-transaction recovery', async () => {
      let arrivals = 0
      let unlock!: () => void
      const barrier = new Promise<void>((resolve) => {
        unlock = resolve
      })
      const wrapped = {
        connect: async () => {
          const client = await pool.connect()
          return {
            query: async (sql: string, args?: unknown[]) => {
              if (sql.trim().startsWith('INSERT INTO tasks')) {
                if (++arrivals === 2) unlock()
                await barrier
              }
              return client.query(sql, args)
            },
            release: (error?: Error) => client.release(error)
          }
        }
      } as unknown as PostgresPoolLike
      const repo = new PostgresJourneyRepository(wrapped)
      const results = await Promise.all([
        repo.createJourneyTask(input('race-task')),
        repo.createJourneyTask(input('race-task'))
      ])
      expect(results[0]!.id).toBe(results[1]!.id)
      expect(
        (
          await admin.query('SELECT id FROM tasks WHERE idempotency_key=$1', [
            'race-task'
          ])
        ).rows
      ).toHaveLength(1)
      expect(
        (
          await admin.query(
            "SELECT id FROM audit_events WHERE payload->>'resourceId'=$1",
            [results[0]!.id]
          )
        ).rows
      ).toHaveLength(1)
    })
  }
)
