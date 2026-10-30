/**
 * SPEC 0262 slice 1 on PostgreSQL: the authorization decision and the creation
 * write share one transaction (R01-R04 for task creation). The policy here is
 * the minimal one the unit needs (active principal + ACTIVE grant of the
 * session's case); the full route policy is the API's and runs on the same
 * snapshot. Counts come from an independent owner connection. Ad-hoc runs
 * without TEST_DATABASE_URL skip; API_CREATION_PG_REQUIRED=1 makes it a failure.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TenantId } from '@cvg/platform'
import {
  CaseAuthorityError,
  PostgresCaseAuthority,
  ensureCoreConversationRootInTransaction,
  runPostgresMigrations,
  tenantRuntimeGrantPrivileges,
  TENANT_SCHEMA_TABLES,
  withTenantContext,
  type CaseReadSnapshot
} from '@cvg/persistence'
import { PostgresJourneyRepository } from '../legacy-composition.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (process.env.API_CREATION_PG_REQUIRED === '1' && !testDatabaseUrl) {
  throw new Error(
    'API_CREATION_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to skip'
  )
}
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip
const tenant = 'tenant_00000000-0000-4000-8000-0000000262a1' as TenantId
const operatorId = 'operator.unit.synthetic'
const supervisor = {
  operatorId: 'supervisor.unit',
  role: 'Supervisor'
} as const
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describeWithPostgres(
  'SPEC 0262 journey task authorization unit on PostgreSQL',
  { timeout: 180_000 },
  () => {
    const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
    const schema = `cvg_case_unit_${suffix}`
    const role = `cvg_case_unit_rt_${suffix}`
    const password = `pw-${randomBytes(12).toString('hex')}`
    let admin: Client
    let ownerPool: Pool
    let runtimePool: Pool
    let authority: PostgresCaseAuthority
    let sessionId = ''
    let caseId = ''
    let grantRevision = 0

    beforeAll(async () => {
      admin = new Client({ connectionString: testDatabaseUrl })
      await admin.connect()
      await runPostgresMigrations(admin, { schemaName: schema })
      ownerPool = new Pool({
        connectionString: testDatabaseUrl,
        max: 2,
        options: `-c search_path=${schema}`
      })
      await admin.query(
        `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`
      )
      await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
      for (const table of TENANT_SCHEMA_TABLES) {
        await admin.query(
          `GRANT ${tenantRuntimeGrantPrivileges(table)} ON ${schema}."${table}" TO ${role}`
        )
      }
      const url = new URL(testDatabaseUrl as string)
      url.username = role
      url.password = password
      runtimePool = new Pool({
        connectionString: url.toString(),
        max: 8,
        options: `-c search_path=${schema}`
      })
      // R03 kills a backend on purpose: the pool reports it on idle clients.
      runtimePool.on('error', () => undefined)
      authority = new PostgresCaseAuthority(runtimePool)
      const conversationId = `conv_${randomUUID()}`
      sessionId = `sess_${randomUUID()}`
      await withTenantContext(ownerPool, tenant, async (client) => {
        await client.query(
          `INSERT INTO conversations
             (tenant_id, id, channel, sender_ref, sender_ref_hash, status, correlation_id, created_at, updated_at)
           VALUES ($1, $2, 'web', 'unit', $3, 'active', $4, now(), now())`,
          [tenant, conversationId, 'e'.repeat(64), `corr_${randomUUID()}`]
        )
        await client.query(
          `INSERT INTO sessions
             (tenant_id, id, conversation_id, status, takeover_state, created_at, updated_at)
           VALUES ($1, $2, $3, 'active', 'BOT_ACTIVE', now(), now())`,
          [tenant, sessionId, conversationId]
        )
        caseId =
          (await ensureCoreConversationRootInTransaction(
            client,
            tenant,
            conversationId,
            new Date()
          )) ?? ''
      })
      for (const [id, principalRole] of [
        [operatorId, 'Operator'],
        [supervisor.operatorId, 'Supervisor']
      ] as const) {
        await authority.applyVerifiedPrincipalState({
          tenantId: tenant,
          operatorId: id,
          role: principalRole,
          active: true,
          expectedRevision: 0,
          authorityVersion: 'synthetic-authority-v1',
          proofRef: `synthetic-proof:${id}`,
          identitySource: 'synthetic_fixture'
        })
      }
    }, 180_000)

    afterAll(async () => {
      await runtimePool?.end().catch(() => undefined)
      await ownerPool?.end().catch(() => undefined)
      await admin
        ?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        .catch(() => undefined)
      await admin?.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined)
      await admin?.end().catch(() => undefined)
    })

    const writeAssignment = async (status: 'ACTIVE' | 'REVOKED') => {
      const stored = await admin.query(
        `SELECT revision FROM ${schema}.case_assignments WHERE tenant_id = $1 AND case_id = $2 AND operator_id = $3`,
        [tenant, caseId, operatorId]
      )
      grantRevision = stored.rows[0] ? Number(stored.rows[0].revision) : 0
      await authority.putAssignment({
        tenantId: tenant,
        caseId,
        operatorId,
        status,
        expectedRevision: grantRevision,
        actor: supervisor,
        correlationId: `corr_${randomUUID()}`,
        actorPrincipal: { required: false, authorityVersion: null }
      })
      grantRevision += 1
    }

    /** The unit's policy: active principal + ACTIVE grant of the session's case. */
    const policy = async (snapshot: CaseReadSnapshot) => {
      const principal = await snapshot.principal(operatorId)
      const located = await snapshot.coreSessionCase(sessionId)
      if (
        !principal?.active ||
        !located?.caseId ||
        !(await snapshot.hasActiveGrant(located.caseId, operatorId))
      ) {
        throw new CaseAuthorityError('case_not_found', 'Case not found')
      }
    }

    const journeys = () => new PostgresJourneyRepository(runtimePool as never)

    const journeyInput = (key: string) =>
      ({
        tenantId: tenant,
        sessionId,
        title: 'Revisar caso',
        description: 'Descrição sintética',
        priority: 'medium',
        idempotencyKey: key,
        auditContext: {
          actorType: 'Operator',
          actorId: operatorId,
          correlationId: `corr_${randomUUID()}`
        }
      }) as never

    const journeyTasks = async (key: string) =>
      (
        await admin.query(
          `SELECT count(*)::int AS n FROM ${schema}.tasks WHERE tenant_id = $1 AND idempotency_key = $2 AND source = 'journey-r3'`,
          [tenant, key]
        )
      ).rows[0].n as number

    /** The journey task through the authority unit, as the API composes it. */
    const createJourney = (key: string, afterPolicy?: () => Promise<void>) =>
      authority.runAuthorizedMutation(tenant, {
        operatorId,
        authorize: async (snapshot) => {
          await policy(snapshot)
          await afterPolicy?.()
        },
        write: (unit) =>
          journeys().createJourneyTask(
            journeyInput(key),
            unit.authorizeOnClient
              ? { authorize: unit.authorizeOnClient }
              : undefined
          )
      })

    it('journey task: a granted operator creates it; a revoked grant denies with zero tasks and zero audit', async () => {
      await writeAssignment('ACTIVE')
      const key = `journey-key-${randomBytes(6).toString('hex')}`
      const created = await createJourney(key)
      expect(created.source).toBe('journey-r3')
      expect(await journeyTasks(key)).toBe(1)
      await writeAssignment('REVOKED')
      const denied = `journey-key-${randomBytes(6).toString('hex')}`
      await expect(createJourney(denied)).rejects.toMatchObject({
        code: 'case_not_found'
      })
      expect(await journeyTasks(denied)).toBe(0)
      const audits = await admin.query(
        `SELECT count(*)::int AS n FROM ${schema}.audit_events WHERE tenant_id = $1 AND type = 'journey_task_created' AND payload::text LIKE $2`,
        [tenant, `%${denied}%`]
      )
      expect(audits.rows[0].n).toBe(0)
    })

    it('journey task: a revocation issued while the policy is deciding waits for the unit', async () => {
      await writeAssignment('ACTIVE')
      const key = `journey-key-${randomBytes(6).toString('hex')}`
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      let decided!: () => void
      const policyRead = new Promise<void>((resolve) => {
        decided = resolve
      })
      const unit = createJourney(key, async () => {
        decided()
        await gate
      })
      await policyRead
      let revoked = false
      const revocation = writeAssignment('REVOKED').then(() => {
        revoked = true
      })
      await sleep(300)
      expect(revoked).toBe(false)
      release()
      expect((await unit).source).toBe('journey-r3')
      await revocation
      expect(revoked).toBe(true)
      expect(await journeyTasks(key)).toBe(1)
    })
  }
)
