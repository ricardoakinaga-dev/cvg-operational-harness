import { randomBytes } from 'node:crypto'
import { Client, Pool, type PoolClient } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  AgentConfigSchema,
  type CapabilityApprovalIssueInput,
  type CapabilityApprovalVerificationInput
} from '@cvg/platform'
import {
  PostgresCapabilityApprovalRepository,
  TenantScopedPostgresCapabilityApprovalRepository,
  runPostgresMigrations
} from '../index.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const tenantA = 'tenant_00000000-0000-4000-8000-000000000131' as const
const tenantB = 'tenant_00000000-0000-4000-8000-000000000132' as const
const agentId = 'agent_00000000-0000-4000-8000-000000000131' as const
const versionId = 'agent_version_00000000-0000-4000-8000-000000000131' as const
const rlsAgentId = 'agent_00000000-0000-4000-8000-000000000133' as const
const rlsVersionId =
  'agent_version_00000000-0000-4000-8000-000000000133' as const

function issueInput(
  overrides: Partial<CapabilityApprovalIssueInput> = {}
): CapabilityApprovalIssueInput {
  return {
    tenantId: tenantA,
    agentId,
    versionId,
    toolName: 'find_available_slots',
    input: { requestedDate: '2026-09-01', practitioner: 'fixture' },
    actorId: 'operator.fixture',
    issuer: 'approver.fixture',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides
  }
}

function verificationInput(
  approvalId: string,
  overrides: Partial<CapabilityApprovalVerificationInput> = {}
): CapabilityApprovalVerificationInput {
  return {
    approvalId,
    tenantId: tenantA,
    agentId,
    versionId,
    toolName: 'find_available_slots',
    input: { practitioner: 'fixture', requestedDate: '2026-09-01' },
    actorId: 'operator.fixture',
    ...overrides
  }
}

describe('PostgreSQL capability approval authority', () => {
  const itWithPostgres = testDatabaseUrl ? it : it.skip

  itWithPostgres(
    'persists bindings and consumes approvals atomically exactly once',
    async () => {
      const schemaName = `cvg_approval_${Date.now()}_${randomBytes(3).toString('hex')}`
      const firstPool = new Pool({ connectionString: testDatabaseUrl })
      const secondPool = new Pool({ connectionString: testDatabaseUrl })
      const firstClient = await firstPool.connect()
      const secondClient = await secondPool.connect()
      const now = new Date()

      try {
        await runPostgresMigrations(firstClient, { schemaName })
        await secondClient.query(`SET search_path TO ${schemaName}`)
        await firstClient.query(
          `INSERT INTO platform_agents
           (tenant_id, id, slug, name, description)
         VALUES ($1, $2, 'approval-fixture', 'Approval Fixture', 'Fictício')`,
          [tenantA, agentId]
        )
        await firstClient.query(
          `INSERT INTO platform_agent_versions
           (tenant_id, id, agent_id, version, status, config, created_by)
         VALUES ($1, $2, $3, 1, 'APPROVED', $4::jsonb, 'fixture')`,
          [
            tenantA,
            versionId,
            agentId,
            JSON.stringify(
              AgentConfigSchema.parse({
                persona: { name: 'Fixture', role: 'secretary', tone: 'calm' },
                greeting: 'Fixture',
                promptBlocks: [],
                responseTemplates: {},
                model: {
                  provider: 'fake',
                  model: 'fixture',
                  temperature: 0,
                  maxTokens: 64,
                  timeoutMs: 1000,
                  retries: 0,
                  secretRef: 'secret://controlled/approval-pg'
                },
                policies: {
                  version: 'approval-pg-v1',
                  minConfidence: 0.7,
                  lowConfidence: 'handoff',
                  maxClarifications: 1,
                  enabledActions: ['respond'],
                  approvalActions: [],
                  blockedActions: []
                },
                plugins: [],
                knowledge: [],
                handoff: {
                  lowConfidenceDestination: 'controlled-reception',
                  destinations: ['controlled-reception'],
                  maxClarifications: 1
                }
              })
            )
          ]
        )

        const repository = new PostgresCapabilityApprovalRepository(
          firstClient,
          {
            now: () => now
          }
        )
        const secondRepository = new PostgresCapabilityApprovalRepository(
          secondClient,
          { now: () => now }
        )
        const issued = await repository.issue(
          issueInput({ nonce: 'nonce_atomic_fixture' })
        )

        expect(issued).toMatchObject({
          tenantId: tenantA,
          agentId,
          versionId,
          toolName: 'find_available_slots',
          actorId: 'operator.fixture',
          issuer: 'approver.fixture',
          status: 'issued',
          consumedAt: null,
          revokedAt: null
        })
        expect(issued.inputHash).toMatch(/^[0-9a-f]{64}$/)

        const [first, second] = await Promise.all([
          repository.verifyAndConsume(
            verificationInput(issued.id, {
              consumptionAudit: {
                correlationId: 'corr_00000000-0000-4000-8000-000000000134',
                policyVersion: 'approval-pg-test-v1'
              }
            })
          ),
          secondRepository.verifyAndConsume(
            verificationInput(issued.id, {
              consumptionAudit: {
                correlationId: 'corr_00000000-0000-4000-8000-000000000135',
                policyVersion: 'approval-pg-test-v1'
              }
            })
          )
        ])
        expect([first, second].filter(Boolean)).toHaveLength(1)
        const consumptionAudit = await firstClient.query<{
          event: string
          approval_id: string
          tenant_id: string
        }>(
          `SELECT tenant_id, payload->>'event' AS event,
                  payload->>'approvalId' AS approval_id
           FROM audit_events
           WHERE type = 'approval_decision'
             AND payload->>'event' = 'capability_approval_consumed'
             AND payload->>'approvalId' = $1`,
          [issued.id]
        )
        expect(consumptionAudit.rows).toEqual([
          {
            tenant_id: tenantA,
            event: 'capability_approval_consumed',
            approval_id: issued.id
          }
        ])
        expect(await repository.get(issued.id, tenantA)).toMatchObject({
          id: issued.id,
          status: 'consumed'
        })
        await expect(
          repository.verifyAndConsume(verificationInput(issued.id))
        ).resolves.toBeNull()

        const substitution = await repository.issue(
          issueInput({ nonce: 'nonce_substitution_fixture' })
        )
        await expect(
          repository.verifyAndConsume(
            verificationInput(substitution.id, {
              input: { requestedDate: '2026-09-02', practitioner: 'fixture' }
            })
          )
        ).resolves.toBeNull()
        await expect(
          repository.get(substitution.id, tenantA)
        ).resolves.toMatchObject({ status: 'issued' })

        const crossTenant = await repository.verifyAndConsume(
          verificationInput(substitution.id, { tenantId: tenantB })
        )
        expect(crossTenant).toBeNull()

        await expect(
          repository.issue(issueInput({ nonce: 'nonce_substitution_fixture' }))
        ).rejects.toThrow()

        now.setTime(Date.now())
        const expiring = await repository.issue(
          issueInput({
            nonce: 'nonce_expiring_fixture',
            expiresAt: new Date(now.getTime() + 100)
          })
        )
        await new Promise((resolve) => setTimeout(resolve, 150))
        now.setTime(Date.now())
        await expect(
          repository.verifyAndConsume(verificationInput(expiring.id))
        ).resolves.toBeNull()
        await expect(
          repository.get(expiring.id, tenantA)
        ).resolves.toMatchObject({
          status: 'expired'
        })

        now.setTime(Date.now())
        const revocable = await repository.issue(
          issueInput({ nonce: 'nonce_revocable_fixture' })
        )
        await expect(
          firstClient.query(
            `UPDATE platform_capability_approvals
             SET status = 'expired'
             WHERE id = $1`,
            [revocable.id]
          )
        ).rejects.toThrow('cannot expire')
        await expect(
          repository.revoke(revocable.id, 'other.issuer', tenantA)
        ).resolves.toBe(false)
        await expect(
          repository.revoke(revocable.id, 'approver.fixture', tenantA)
        ).resolves.toBe(true)
        await expect(
          repository.verifyAndConsume(verificationInput(revocable.id))
        ).resolves.toBeNull()

        let scopedConnections = 0
        const scoped = new TenantScopedPostgresCapabilityApprovalRepository(
          {
            connect: async () => {
              scopedConnections += 1
              return {
                query: secondClient.query.bind(secondClient),
                release: () => undefined
              }
            }
          },
          { now: () => now }
        )
        const scopedIssued = await scoped.issue(
          issueInput({ nonce: 'nonce_tenant_scoped_fixture' })
        )
        await expect(
          scoped.get(scopedIssued.id, tenantA)
        ).resolves.toMatchObject({
          status: 'issued'
        })
        await expect(scoped.get(scopedIssued.id, tenantB)).resolves.toBeNull()
        await expect(
          scoped.verifyAndConsume(verificationInput(scopedIssued.id))
        ).resolves.toMatchObject({ status: 'consumed' })
        const beforeInvalid = scopedConnections
        await expect(scoped.get(scopedIssued.id)).resolves.toBeNull()
        await expect(
          scoped.revoke(scopedIssued.id, 'approver.fixture')
        ).resolves.toBe(false)
        expect(scopedConnections).toBe(beforeInvalid)
      } finally {
        await firstClient.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        secondClient.release()
        firstClient.release()
        await secondPool.end()
        await firstPool.end()
      }
    }
  )

  itWithPostgres(
    'enforces tenant visibility for the durable approval table under FORCE RLS',
    async () => {
      const schemaName = `cvg_approval_rls_${Date.now()}_${randomBytes(3).toString('hex')}`
      const roleName = `cvg_approval_runtime_${Date.now()}_${randomBytes(3).toString('hex')}`
      const password = randomBytes(18).toString('hex')
      const admin = new Client({ connectionString: testDatabaseUrl })
      const runtimeUrl = new URL(testDatabaseUrl as string)
      runtimeUrl.username = roleName
      runtimeUrl.password = password
      const runtimePool = new Pool({ connectionString: runtimeUrl.toString() })
      let runtime: PoolClient | null = null
      const now = new Date()

      await admin.connect()
      try {
        await runPostgresMigrations(admin, { schemaName })
        await admin.query(
          `INSERT INTO platform_agents
             (tenant_id, id, slug, name, description)
           VALUES ($1, $2, 'approval-rls-fixture', 'Approval RLS Fixture', 'Fictício')`,
          [tenantA, rlsAgentId]
        )
        await admin.query(
          `INSERT INTO platform_agent_versions
             (tenant_id, id, agent_id, version, status, config, created_by)
           VALUES ($1, $2, $3, 1, 'APPROVED', '{}'::jsonb, 'fixture')`,
          [tenantA, rlsVersionId, rlsAgentId]
        )
        await admin.query(
          `CREATE ROLE ${roleName} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`
        )
        await admin.query(`GRANT USAGE ON SCHEMA ${schemaName} TO ${roleName}`)
        await admin.query(
          `GRANT SELECT ON ${schemaName}.platform_agent_versions TO ${roleName}`
        )
        await admin.query(
          `GRANT SELECT, INSERT, UPDATE ON ${schemaName}.platform_capability_approvals TO ${roleName}`
        )
        await admin.query(
          `ALTER ROLE ${roleName} SET search_path TO ${schemaName}`
        )

        runtime = await runtimePool.connect()
        await runtime.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
          tenantA
        ])
        const repository = new PostgresCapabilityApprovalRepository(runtime, {
          now: () => now
        })
        const approval = await repository.issue(
          issueInput({
            agentId: rlsAgentId,
            versionId: rlsVersionId,
            nonce: 'nonce_rls_fixture'
          })
        )
        await expect(
          runtime.query(
            `UPDATE platform_capability_approvals
             SET input_hash = repeat('a', 64)
             WHERE id = $1`,
            [approval.id]
          )
        ).rejects.toThrow('immutable')
        await expect(
          repository.get(approval.id, tenantA)
        ).resolves.toMatchObject({
          id: approval.id
        })
        await runtime.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
          tenantB
        ])
        await expect(repository.get(approval.id, tenantB)).resolves.toBeNull()
        await expect(
          repository.verifyAndConsume(
            verificationInput(approval.id, {
              tenantId: tenantB,
              agentId: rlsAgentId,
              versionId: rlsVersionId
            })
          )
        ).resolves.toBeNull()
      } finally {
        runtime?.release()
        await runtimePool.end().catch(() => undefined)
        await admin.query(`DROP OWNED BY ${roleName}`).catch(() => undefined)
        await admin.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await admin.query(`DROP ROLE IF EXISTS ${roleName}`)
        await admin.end()
      }
    }
  )
})
