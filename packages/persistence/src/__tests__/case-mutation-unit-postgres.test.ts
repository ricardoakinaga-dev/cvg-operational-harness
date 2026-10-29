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
  PostgresApiCreation,
  PostgresAuthorizedWrites,
  PostgresCaseAuthority,
  ensureCoreConversationRootInTransaction,
  runPostgresMigrations,
  tenantRuntimeGrantPrivileges,
  TENANT_SCHEMA_TABLES,
  withTenantContext,
  type CaseReadSnapshot,
  type CreateTaskWithAuditCommand,
  type PostgresPoolClient
} from '../index.ts'

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
  'SPEC 0262 authorization unit on PostgreSQL',
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

    const command = (key: string): CreateTaskWithAuditCommand => ({
      actor: { actorType: 'Operator', actorId: operatorId },
      correlationId: `corr_${randomUUID()}`,
      task: {
        sessionId,
        title: 'Revisar caso',
        description: 'Descrição sintética',
        priority: 'medium',
        source: 'console',
        idempotencyKey: key
      }
    })

    const taskCount = async (key: string) =>
      (
        await admin.query(
          `SELECT count(*)::int AS n FROM ${schema}.tasks WHERE tenant_id = $1 AND idempotency_key = $2`,
          [tenant, key]
        )
      ).rows[0].n as number

    /** Creation through the authority unit, as the API composes it. */
    const create = (
      key: string,
      hooks: ConstructorParameters<typeof PostgresApiCreation>[1] = {},
      afterPolicy?: () => Promise<void>
    ) => {
      const creation = new PostgresApiCreation(runtimePool, hooks)
      return authority.runAuthorizedMutation(tenant, {
        operatorId,
        authorize: async (snapshot) => {
          await policy(snapshot)
          await afterPolicy?.()
        },
        write: (unit) =>
          creation.createTaskWithAudit(
            command(key),
            tenant,
            unit.authorizeOnClient
              ? { authorize: unit.authorizeOnClient }
              : undefined
          )
      })
    }

    it('R01: a valid grant confirms; a grant revoked before the unit denies with zero writes', async () => {
      await writeAssignment('ACTIVE')
      const key = `unit-key-${randomBytes(6).toString('hex')}`
      expect((await create(key)).outcome).toBe('created')
      expect(await taskCount(key)).toBe(1)
      await writeAssignment('REVOKED')
      const denied = `unit-key-${randomBytes(6).toString('hex')}`
      await expect(create(denied)).rejects.toMatchObject({
        code: 'case_not_found'
      })
      expect(await taskCount(denied)).toBe(0)
    })

    it('R04: a replay after the revocation is denied before any replay starts', async () => {
      await writeAssignment('ACTIVE')
      const key = `unit-key-${randomBytes(6).toString('hex')}`
      const first = await create(key)
      expect(first.outcome).toBe('created')
      await writeAssignment('REVOKED')
      await expect(create(key)).rejects.toMatchObject({
        code: 'case_not_found'
      })
      expect(await taskCount(key)).toBe(1)
    })

    it('R02 (write first): a revocation issued while the unit holds the grant waits for the commit', async () => {
      await writeAssignment('ACTIVE')
      const key = `unit-key-${randomBytes(6).toString('hex')}`
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      let reached!: () => void
      const atCommit = new Promise<void>((resolve) => {
        reached = resolve
      })
      const unit = create(key, {
        beforeCommit: async () => {
          reached()
          await gate
        }
      })
      await atCommit
      let revoked = false
      const revocation = writeAssignment('REVOKED').then(() => {
        revoked = true
      })
      await sleep(300)
      // The unit still holds the grant lock: the revocation has not applied.
      expect(revoked).toBe(false)
      release()
      expect((await unit).outcome).toBe('created')
      await revocation
      expect(revoked).toBe(true)
      expect(await taskCount(key)).toBe(1)
    })

    it('R02 (revocation first): a revocation that commits before the lock denies the unit, which waited for it', async () => {
      await writeAssignment('ACTIVE')
      const key = `unit-key-${randomBytes(6).toString('hex')}`
      const revoker = new Client({
        connectionString: testDatabaseUrl,
        options: `-c search_path=${schema}`
      })
      await revoker.connect()
      try {
        await revoker.query('BEGIN')
        await revoker.query(`SELECT set_config('cvg.tenant_id', $1, true)`, [
          tenant
        ])
        await revoker.query(
          `UPDATE case_assignments
              SET status = 'REVOKED', revision = revision + 1,
                  changed_by = 'supervisor.unit', changed_at = now()
            WHERE tenant_id = $1 AND case_id = $2 AND operator_id = $3`,
          [tenant, caseId, operatorId]
        )
        // The unit starts while the revocation is uncommitted: it queues on the lock.
        const outcome = create(key).then(
          () => 'created',
          (error: { code?: string }) => error.code ?? 'error'
        )
        await sleep(300)
        await revoker.query('COMMIT')
        expect(await outcome).toBe('case_not_found')
        grantRevision += 1
        expect(await taskCount(key)).toBe(0)
      } finally {
        await revoker.end().catch(() => undefined)
      }
    })

    it('R03: the owning connection dying after the grant was read commits nothing and lets no other writer in', async () => {
      await writeAssignment('ACTIVE')
      const key = `unit-key-${randomBytes(6).toString('hex')}`
      await expect(
        create(key, {
          afterAuthorize: async (client: PostgresPoolClient) => {
            const pid = (
              await client.query<{ pid: number }>(
                'SELECT pg_backend_pid() AS pid'
              )
            ).rows[0]!.pid
            await admin.query('SELECT pg_terminate_backend($1)', [pid])
            await sleep(100)
            await client.query('SELECT 1')
          }
        })
      ).rejects.toThrow()
      expect(await taskCount(key)).toBe(0)
      // Nothing was left half done: the same operation completes normally.
      expect((await create(key)).outcome).toBe('created')
      expect(await taskCount(key)).toBe(1)
    })

    it('R02 (principal, write first): a principal change issued while the unit holds the principal waits for the commit', async () => {
      await writeAssignment('ACTIVE')
      const key = `unit-key-${randomBytes(6).toString('hex')}`
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      let reached!: () => void
      const atCommit = new Promise<void>((resolve) => {
        reached = resolve
      })
      const unit = create(key, {
        beforeCommit: async () => {
          reached()
          await gate
        }
      })
      await atCommit
      const current = await admin.query(
        `SELECT revision, active FROM ${schema}.case_principals WHERE tenant_id = $1 AND operator_id = $2`,
        [tenant, operatorId]
      )
      let changed = false
      const change = authority
        .applyVerifiedPrincipalState({
          tenantId: tenant,
          operatorId,
          role: 'Operator',
          active: !current.rows[0].active,
          expectedRevision: Number(current.rows[0].revision),
          authorityVersion: 'synthetic-authority-v1',
          proofRef: `synthetic-proof:${operatorId}`,
          identitySource: 'synthetic_fixture'
        })
        .then(() => {
          changed = true
        })
      await sleep(300)
      expect(changed).toBe(false)
      release()
      expect((await unit).outcome).toBe('created')
      await change
      expect(changed).toBe(true)
      expect(await taskCount(key)).toBe(1)
      // Restore the principal for the next case.
      const after = await admin.query(
        `SELECT revision, active FROM ${schema}.case_principals WHERE tenant_id = $1 AND operator_id = $2`,
        [tenant, operatorId]
      )
      if (!after.rows[0].active) {
        await authority.applyVerifiedPrincipalState({
          tenantId: tenant,
          operatorId,
          role: 'Operator',
          active: true,
          expectedRevision: Number(after.rows[0].revision),
          authorityVersion: 'synthetic-authority-v1',
          proofRef: `synthetic-proof:${operatorId}`,
          identitySource: 'synthetic_fixture'
        })
      }
    })

    it('the policy reads after both FOR SHARE locks: a revocation issued while the policy is deciding waits for the unit', async () => {
      await writeAssignment('ACTIVE')
      const key = `unit-key-${randomBytes(6).toString('hex')}`
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      let decided!: () => void
      const policyRead = new Promise<void>((resolve) => {
        decided = resolve
      })
      const unit = create(key, {}, async () => {
        decided()
        await gate
      })
      await policyRead
      let revoked = false
      const revocation = writeAssignment('REVOKED').then(() => {
        revoked = true
      })
      await sleep(300)
      // Policy ran before the locks => the revocation would have applied here.
      expect(revoked).toBe(false)
      release()
      expect((await unit).outcome).toBe('created')
      await revocation
      expect(revoked).toBe(true)
      expect(await taskCount(key)).toBe(1)
    })

    /** Status transition through the authority unit, as the API composes it. */
    const transition = (
      taskId: string,
      hooks: ConstructorParameters<typeof PostgresAuthorizedWrites>[1] = {}
    ) =>
      authority.runAuthorizedMutation(tenant, {
        operatorId,
        authorize: policy,
        write: (unit) =>
          new PostgresAuthorizedWrites(runtimePool, hooks).transitionTaskStatus(
            {
              taskId,
              status: 'in_progress',
              actorType: 'Operator',
              actorId: operatorId,
              correlationId: `corr_${randomUUID()}`
            },
            tenant,
            unit.authorizeOnClient
              ? { authorize: unit.authorizeOnClient }
              : undefined
          )
      })

    const taskStatus = async (taskId: string) =>
      (
        await admin.query(
          `SELECT status FROM ${schema}.tasks WHERE tenant_id = $1 AND id = $2`,
          [tenant, taskId]
        )
      ).rows[0].status as string

    it('task.status: a revoked grant denies the transition with the status and audit unchanged', async () => {
      await writeAssignment('ACTIVE')
      const created = await create(`unit-key-${randomBytes(6).toString('hex')}`)
      const taskId = created.resource.id
      await writeAssignment('REVOKED')
      await expect(transition(taskId)).rejects.toMatchObject({
        code: 'case_not_found'
      })
      expect(await taskStatus(taskId)).toBe('open')
      await writeAssignment('ACTIVE')
      expect((await transition(taskId)).status).toBe('in_progress')
      expect(await taskStatus(taskId)).toBe('in_progress')
    })

    it('task.status: a revocation issued while the transition holds the grant waits for the commit', async () => {
      await writeAssignment('ACTIVE')
      const created = await create(`unit-key-${randomBytes(6).toString('hex')}`)
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      let reached!: () => void
      const atCommit = new Promise<void>((resolve) => {
        reached = resolve
      })
      const unit = transition(created.resource.id, {
        beforeCommit: async () => {
          reached()
          await gate
        }
      })
      await atCommit
      let revoked = false
      const revocation = writeAssignment('REVOKED').then(() => {
        revoked = true
      })
      await sleep(300)
      expect(revoked).toBe(false)
      release()
      expect((await unit).status).toBe('in_progress')
      await revocation
      expect(revoked).toBe(true)
    })

    it('approval.decide: a revoked grant denies the decision; a granted one decides once', async () => {
      await writeAssignment('ACTIVE')
      const approvalId = `approval_${randomUUID()}`
      const creation = new PostgresApiCreation(runtimePool)
      await creation.createApprovalWithAudit(
        {
          actor: { actorType: 'Operator', actorId: operatorId },
          correlationId: `corr_${randomUUID()}`,
          idempotencyKey: `unit-key-${randomBytes(6).toString('hex')}`,
          request: {
            id: approvalId,
            sessionId,
            proposedAction: 'audit_evidence_export_review',
            summary: 'Resumo sintético',
            riskLevel: 'medium',
            status: 'pending',
            decidedBy: null,
            decidedAt: null,
            createdAt: new Date('2026-10-28T12:00:00Z')
          }
        },
        tenant
      )
      const decide = () =>
        authority.runAuthorizedMutation(tenant, {
          operatorId,
          authorize: policy,
          write: (unit) =>
            new PostgresAuthorizedWrites(runtimePool).decideAttendanceApproval(
              {
                approvalRequestId: approvalId,
                decision: 'approved',
                operatorId,
                role: 'Approver',
                correlationId: `corr_${randomUUID()}`
              },
              tenant,
              unit.authorizeOnClient
                ? { authorize: unit.authorizeOnClient }
                : undefined
            )
        })
      const statusOf = async () =>
        (
          await admin.query(
            `SELECT status FROM ${schema}.approval_requests WHERE tenant_id = $1 AND id = $2`,
            [tenant, approvalId]
          )
        ).rows[0].status as string
      await writeAssignment('REVOKED')
      await expect(decide()).rejects.toMatchObject({ code: 'case_not_found' })
      expect(await statusOf()).toBe('pending')
      await writeAssignment('ACTIVE')
      expect((await decide()).status).toBe('approved')
      expect(await statusOf()).toBe('approved')
    })

    it('a principal deactivated before the unit is denied with zero writes', async () => {
      await writeAssignment('ACTIVE')
      const current = await admin.query(
        `SELECT revision FROM ${schema}.case_principals WHERE tenant_id = $1 AND operator_id = $2`,
        [tenant, operatorId]
      )
      await authority.applyVerifiedPrincipalState({
        tenantId: tenant,
        operatorId,
        role: 'Operator',
        active: false,
        expectedRevision: Number(current.rows[0].revision),
        authorityVersion: 'synthetic-authority-v1',
        proofRef: `synthetic-proof:${operatorId}`,
        identitySource: 'synthetic_fixture'
      })
      const key = `unit-key-${randomBytes(6).toString('hex')}`
      await expect(create(key)).rejects.toMatchObject({
        code: 'case_not_found'
      })
      expect(await taskCount(key)).toBe(0)
    })
  }
)
