import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
  ChannelEffectIdentity,
  OutboundResult
} from '@cvg/channel-gateway'
import { readPostgresMigrationSql, runPostgresMigrations } from '../postgres.ts'
import { PostgresChannelEffectJournal } from '../channel-effect-journal-postgres.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const itWithPostgres = testDatabaseUrl ? it : it.skip
const tenant = 'tenant_00000000-0000-4000-8000-000000000221'
const otherTenant = 'tenant_00000000-0000-4000-8000-000000000222'
const sharedHashVersion = 'shared-rfc8785-subset-v1'
const payloadHash = 'a'.repeat(64)

let operationCounter = 0

function uniqueIdentity(): ChannelEffectIdentity {
  operationCounter += 1
  return {
    tenantId: tenant,
    channel: 'whatsapp',
    operationKind: 'outbound_message',
    idempotencyKey: `channel-effect-${operationCounter}-${randomBytes(3).toString('hex')}`
  }
}

function result(externalId = 'provider-message-1'): OutboundResult {
  return {
    externalId,
    channel: 'whatsapp',
    accepted: true,
    sentAt: '2026-09-12T12:00:00.000Z'
  }
}

async function connectScoped(
  schema: string,
  tenantId: string
): Promise<Client> {
  const client = new Client({ connectionString: testDatabaseUrl })
  await client.connect()
  await client.query(`SET search_path TO ${schema}`)
  await client.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
    tenantId
  ])
  return client
}

describe('channel effect journal PostgreSQL adapter', () => {
  it('ships the additive channel effect journal migration', async () => {
    const migration = await readPostgresMigrationSql(
      '0012_channel_effect_journal'
    )

    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS channel_effect_journal'
    )
    expect(migration).toContain(
      'PRIMARY KEY (tenant_id, channel, operation_kind, idempotency_key)'
    )
    expect(migration).toContain("DEFAULT 'legacy-local-v1'")
    expect(migration).toContain('payload_hash text NOT NULL')
    expect(migration).toContain('lease_owner text')
    expect(migration).toContain('lease_expires_at timestamptz')
    expect(migration).toContain('revision bigint NOT NULL DEFAULT 1')
    expect(migration).toContain('PENDING')
    expect(migration).toContain('SENDING')
    expect(migration).toContain('CONFIRMED')
    expect(migration).toContain('EXPIRED')
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
    expect(migration).toContain("current_setting('cvg.tenant_id', true)")
  })

  describe('with a disposable PostgreSQL schema', () => {
    const schema = `cvg_channel_eff_${Date.now()}_${randomBytes(3).toString('hex')}`
    let admin: Client
    let first: Client
    let second: Client

    beforeAll(async () => {
      if (!testDatabaseUrl) return
      admin = new Client({ connectionString: testDatabaseUrl })
      await admin.connect()
      await runPostgresMigrations(admin, { schemaName: schema })
      first = await connectScoped(schema, tenant)
      second = await connectScoped(schema, tenant)
    })

    afterAll(async () => {
      if (!testDatabaseUrl) return
      await first?.end().catch(() => undefined)
      await second?.end().catch(() => undefined)
      await admin
        ?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        .catch(() => undefined)
      await admin?.end().catch(() => undefined)
    })

    itWithPostgres(
      'applies 0012 with forced RLS and the legacy hash default',
      async () => {
        const rls = await admin.query<{
          relrowsecurity: boolean
          relforcerowsecurity: boolean
        }>(
          `SELECT c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class AS c
           INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
           WHERE n.nspname = current_schema()
             AND c.relname = 'channel_effect_journal'`
        )
        expect(rls.rows[0]).toEqual({
          relrowsecurity: true,
          relforcerowsecurity: true
        })
        const defaultVersion = await admin.query<{ column_default: string }>(
          `SELECT column_default FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name = 'channel_effect_journal'
             AND column_name = 'hash_version'`
        )
        expect(defaultVersion.rows[0]?.column_default).toContain(
          'legacy-local-v1'
        )
      }
    )

    itWithPostgres(
      'reserves, sends, confirms and replays the result',
      async () => {
        const identity = uniqueIdentity()
        const journal = new PostgresChannelEffectJournal(first)
        const leaseOwner = 'host:1:instance-a'

        const reservation = await journal.reserve({
          identity,
          payloadHash,
          hashVersion: sharedHashVersion,
          leaseOwner,
          leaseMs: 30_000
        })
        expect(reservation).toMatchObject({
          outcome: 'reserved',
          record: { state: 'PENDING', attempt: 1, leaseOwner }
        })

        const claimed = await journal.claimSend(identity, leaseOwner)
        expect(claimed).toMatchObject({ state: 'SENDING', attempt: 1 })

        const committed = await journal.complete(identity, leaseOwner, result())
        expect(committed).toBe('committed')
        await expect(journal.find(identity)).resolves.toMatchObject({
          state: 'CONFIRMED',
          result: result(),
          leaseOwner: null,
          leaseExpiresAtMs: null
        })

        const replayed = await journal.reserve({
          identity,
          payloadHash,
          hashVersion: sharedHashVersion,
          leaseOwner: 'host:2:instance-b',
          leaseMs: 30_000
        })
        expect(replayed).toMatchObject({
          outcome: 'replay',
          record: { state: 'CONFIRMED', result: result() }
        })
      }
    )

    itWithPostgres(
      'reserves atomically under two concurrent clients',
      async () => {
        const identity = uniqueIdentity()
        const firstJournal = new PostgresChannelEffectJournal(first)
        const secondJournal = new PostgresChannelEffectJournal(second)

        const outcomes = await Promise.all([
          firstJournal.reserve({
            identity,
            payloadHash,
            hashVersion: sharedHashVersion,
            leaseOwner: 'host:1:instance-a',
            leaseMs: 30_000
          }),
          secondJournal.reserve({
            identity,
            payloadHash,
            hashVersion: sharedHashVersion,
            leaseOwner: 'host:2:instance-b',
            leaseMs: 30_000
          })
        ])

        expect(outcomes.map((outcome) => outcome.outcome).sort()).toEqual([
          'in_flight',
          'reserved'
        ])
        const stored = await admin.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM channel_effect_journal
           WHERE idempotency_key = $1`,
          [identity.idempotencyKey]
        )
        expect(stored.rows[0]?.count).toBe('1')
      }
    )

    itWithPostgres(
      'returns conflict for the same key with a different payload hash',
      async () => {
        const identity = uniqueIdentity()
        const journal = new PostgresChannelEffectJournal(first)
        await journal.reserve({
          identity,
          payloadHash,
          hashVersion: sharedHashVersion,
          leaseOwner: 'host:1:instance-a',
          leaseMs: 30_000
        })

        await expect(
          journal.reserve({
            identity,
            payloadHash: 'b'.repeat(64),
            hashVersion: sharedHashVersion,
            leaseOwner: 'host:2:instance-b',
            leaseMs: 30_000
          })
        ).resolves.toMatchObject({
          outcome: 'conflict',
          record: { payloadHash, revision: 1 }
        })
      }
    )

    itWithPostgres(
      'takes over an expired PENDING lease and fences the stale worker',
      async () => {
        const identity = uniqueIdentity()
        const journal = new PostgresChannelEffectJournal(first)
        const staleOwner = 'host:1:stale'
        await journal.reserve({
          identity,
          payloadHash,
          hashVersion: sharedHashVersion,
          leaseOwner: staleOwner,
          leaseMs: 5
        })
        await new Promise((resolve) => setTimeout(resolve, 25))

        const takeover = await journal.reserve({
          identity,
          payloadHash,
          hashVersion: sharedHashVersion,
          leaseOwner: 'host:2:fresh',
          leaseMs: 30_000
        })
        expect(takeover).toMatchObject({
          outcome: 'reserved',
          record: { state: 'PENDING', attempt: 2, leaseOwner: 'host:2:fresh' }
        })

        await expect(
          journal.claimSend(identity, staleOwner)
        ).rejects.toMatchObject({ code: 'lease_lost' })
        await expect(
          journal.complete(identity, staleOwner, result())
        ).resolves.toBe('lease_lost')
        await expect(journal.find(identity)).resolves.toMatchObject({
          state: 'PENDING',
          attempt: 2,
          revision: 2
        })
      }
    )

    itWithPostgres(
      'marks an expired SENDING lease uncertain and never resends by itself',
      async () => {
        const identity = uniqueIdentity()
        let nowMs = Date.now()
        const journal = new PostgresChannelEffectJournal(first, {
          clock: () => nowMs
        })
        const leaseOwner = 'host:1:instance-a'
        await journal.reserve({
          identity,
          payloadHash,
          hashVersion: sharedHashVersion,
          leaseOwner,
          leaseMs: 5
        })
        await journal.claimSend(identity, leaseOwner)
        nowMs += 25

        const reservation = await journal.reserve({
          identity,
          payloadHash,
          hashVersion: sharedHashVersion,
          leaseOwner: 'host:2:instance-b',
          leaseMs: 30_000
        })
        expect(reservation).toMatchObject({
          outcome: 'uncertain',
          record: { state: 'UNCERTAIN' }
        })
        await expect(
          journal.claimSend(identity, 'host:2:instance-b')
        ).rejects.toMatchObject({ code: 'lease_lost' })
      }
    )

    itWithPostgres(
      'releases a retryable failure back to PENDING for a same-key retry',
      async () => {
        const identity = uniqueIdentity()
        const journal = new PostgresChannelEffectJournal(first)
        const leaseOwner = 'host:1:instance-a'
        await journal.reserve({
          identity,
          payloadHash,
          hashVersion: sharedHashVersion,
          leaseOwner,
          leaseMs: 30_000
        })
        await journal.claimSend(identity, leaseOwner)

        await expect(
          journal.release(identity, leaseOwner, 'send_failed')
        ).resolves.toBe('committed')
        const retry = await journal.reserve({
          identity,
          payloadHash,
          hashVersion: sharedHashVersion,
          leaseOwner: 'host:2:instance-b',
          leaseMs: 30_000
        })
        expect(retry).toMatchObject({
          outcome: 'reserved',
          record: { state: 'PENDING', attempt: 2, errorCode: null }
        })
      }
    )

    itWithPostgres(
      'resolves UNCERTAIN only through explicit reconciliation',
      async () => {
        const identity = uniqueIdentity()
        const journal = new PostgresChannelEffectJournal(first)
        const leaseOwner = 'host:1:instance-a'
        await journal.reserve({
          identity,
          payloadHash,
          hashVersion: sharedHashVersion,
          leaseOwner,
          leaseMs: 30_000
        })
        await journal.claimSend(identity, leaseOwner)
        await expect(
          journal.markUncertain(identity, leaseOwner, 'send_failed')
        ).resolves.toBe('committed')

        await expect(
          journal.resolveUncertain(
            identity,
            {
              kind: 'confirmed',
              result: result('provider-message-reconciled')
            },
            {
              actorId: 'operator:test-reconciler',
              reason: 'synthetic reconciliation'
            }
          )
        ).resolves.toMatchObject({
          state: 'CONFIRMED',
          result: result('provider-message-reconciled')
        })
        await expect(
          journal.resolveUncertain(
            identity,
            { kind: 'not_effected' },
            {
              actorId: 'operator:test-reconciler',
              reason: 'synthetic reconciliation'
            }
          )
        ).rejects.toMatchObject({ code: 'reconciliation_required' })
      }
    )

    itWithPostgres(
      'rejects reconciliation without a valid actor and never mutates the row',
      async () => {
        const identity = uniqueIdentity()
        const journal = new PostgresChannelEffectJournal(first)
        const leaseOwner = 'host:1:instance-a'
        await journal.reserve({
          identity,
          payloadHash,
          hashVersion: sharedHashVersion,
          leaseOwner,
          leaseMs: 30_000
        })
        await journal.claimSend(identity, leaseOwner)
        await expect(
          journal.markUncertain(identity, leaseOwner, 'send_failed')
        ).resolves.toBe('committed')
        const before = await journal.find(identity)
        expect(before).toMatchObject({ state: 'UNCERTAIN' })

        const invalidActors: unknown[] = [
          undefined,
          { reason: 'checked' },
          { actorId: '', reason: 'checked' },
          { actorId: '   ', reason: 'checked' },
          { actorId: 'operator:reconciler', reason: '' },
          { actorId: 'operator:reconciler', reason: '\t\n' }
        ]
        for (const actor of invalidActors) {
          await expect(
            journal.resolveUncertain(
              identity,
              { kind: 'not_effected' },
              actor as never
            )
          ).rejects.toMatchObject({
            code: 'reconciliation_required',
            retryable: false
          })
        }

        await expect(journal.find(identity)).resolves.toMatchObject({
          state: 'UNCERTAIN',
          revision: before?.revision,
          result: null,
          errorCode: 'send_failed'
        })

        await expect(
          journal.resolveUncertain(
            identity,
            { kind: 'confirmed', result: result('provider-message-actor') },
            { actorId: 'operator:reconciler', reason: 'provider query done' }
          )
        ).resolves.toMatchObject({
          state: 'CONFIRMED',
          result: result('provider-message-actor')
        })

        const terminal = await journal.find(identity)
        await expect(
          journal.resolveUncertain(
            identity,
            { kind: 'not_effected' },
            { actorId: 'operator:reconciler', reason: 'repeat resolution' }
          )
        ).rejects.toMatchObject({ code: 'reconciliation_required' })
        await expect(journal.find(identity)).resolves.toMatchObject({
          state: 'CONFIRMED',
          revision: terminal?.revision
        })

        const reopenIdentity = uniqueIdentity()
        await journal.reserve({
          identity: reopenIdentity,
          payloadHash,
          hashVersion: sharedHashVersion,
          leaseOwner,
          leaseMs: 30_000
        })
        await journal.claimSend(reopenIdentity, leaseOwner)
        await expect(
          journal.markUncertain(reopenIdentity, leaseOwner, 'send_failed')
        ).resolves.toBe('committed')
        await expect(
          journal.resolveUncertain(
            reopenIdentity,
            { kind: 'not_effected' },
            { actorId: 'operator:reconciler', reason: 'provider query done' }
          )
        ).resolves.toMatchObject({ state: 'PENDING', errorCode: null })
        const reopened = await journal.find(reopenIdentity)
        await expect(
          journal.resolveUncertain(
            reopenIdentity,
            { kind: 'not_effected' },
            { actorId: 'operator:reconciler', reason: 'repeat resolution' }
          )
        ).rejects.toMatchObject({ code: 'reconciliation_required' })
        await expect(journal.find(reopenIdentity)).resolves.toMatchObject({
          state: 'PENDING',
          revision: reopened?.revision
        })
      }
    )

    itWithPostgres(
      'fails closed for invalid or malformed hash versions',
      async () => {
        const identity = uniqueIdentity()
        const journal = new PostgresChannelEffectJournal(first)

        await expect(
          journal.reserve({
            identity,
            payloadHash,
            hashVersion: 'not-a-version',
            leaseOwner: 'host:1:instance-a',
            leaseMs: 30_000
          })
        ).resolves.toEqual({ outcome: 'version_mismatch' })

        await first.query(
          `INSERT INTO channel_effect_journal
             (tenant_id, channel, operation_kind, idempotency_key,
              payload_hash, hash_version, state, attempt, revision)
           VALUES ($1, $2, $3, $4, $5, 'malformed-version', 'PENDING', 0, 1)`,
          [
            identity.tenantId,
            identity.channel,
            identity.operationKind,
            identity.idempotencyKey,
            payloadHash
          ]
        )

        await expect(
          journal.reserve({
            identity,
            payloadHash,
            hashVersion: sharedHashVersion,
            leaseOwner: 'host:2:instance-b',
            leaseMs: 30_000
          })
        ).resolves.toEqual({ outcome: 'version_mismatch' })
        await expect(
          journal.claimSend(identity, 'host:1:instance-a')
        ).rejects.toMatchObject({ code: 'hash_algorithm_mismatch' })
        await expect(
          journal.complete(identity, 'host:1:instance-a', result())
        ).rejects.toMatchObject({ code: 'hash_algorithm_mismatch' })
      }
    )

    itWithPostgres(
      'isolates cross-tenant rows with a non-BYPASSRLS role',
      async () => {
        const roleName = `cvg_chan_role_${Date.now()}_${randomBytes(3).toString('hex')}`
        const password = randomBytes(18).toString('hex')
        const roleUrl = new URL(testDatabaseUrl as string)
        roleUrl.username = roleName
        roleUrl.password = password
        const identity = uniqueIdentity()
        let roleCreated = false
        let roleA: Client | undefined
        let roleB: Client | undefined

        try {
          await admin.query(
            `CREATE ROLE ${roleName} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`
          )
          roleCreated = true
          await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${roleName}`)
          await admin.query(
            `GRANT SELECT, INSERT, UPDATE, DELETE ON ${schema}.channel_effect_journal TO ${roleName}`
          )

          roleA = new Client({ connectionString: roleUrl.toString() })
          await roleA.connect()
          await roleA.query(`SET search_path TO ${schema}`)
          await roleA.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
            tenant
          ])
          const journalA = new PostgresChannelEffectJournal(roleA)
          await expect(
            journalA.reserve({
              identity,
              payloadHash,
              hashVersion: sharedHashVersion,
              leaseOwner: 'host:1:instance-a',
              leaseMs: 30_000
            })
          ).resolves.toMatchObject({ outcome: 'reserved' })

          roleB = new Client({ connectionString: roleUrl.toString() })
          await roleB.connect()
          await roleB.query(`SET search_path TO ${schema}`)
          await roleB.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
            otherTenant
          ])
          const journalB = new PostgresChannelEffectJournal(roleB)
          await expect(journalB.find(identity)).resolves.toBeUndefined()
          const visible = await roleB.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM channel_effect_journal`
          )
          expect(visible.rows[0]?.count).toBe('0')
          await expect(
            journalB.reserve({
              identity,
              payloadHash,
              hashVersion: sharedHashVersion,
              leaseOwner: 'host:2:instance-b',
              leaseMs: 30_000
            })
          ).rejects.toThrow()
        } finally {
          await roleA?.end().catch(() => undefined)
          await roleB?.end().catch(() => undefined)
          if (roleCreated) {
            await admin
              .query(`DROP ROLE IF EXISTS ${roleName}`)
              .catch(() => undefined)
          }
        }
      }
    )
  })
})
