import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  AgentConfigSchema,
  createValidatedControlledReleaseCandidate,
  createTestSuiteRunId,
  createTraceId,
  type PluginManifest,
  type ReleaseCandidateGateResult
} from '@cvg/platform'
import {
  PostgresControlPlaneRepository,
  runPostgresMigrations
} from '../index.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const tenantId = 'tenant_00000000-0000-4000-8000-000000000041'

function config() {
  return AgentConfigSchema.parse({
    persona: { name: 'Postgres Agent', role: 'assistant', tone: 'calm' },
    greeting: 'Resposta controlada.',
    promptBlocks: [],
    responseTemplates: { unknown: 'Handoff controlado.' },
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 128,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/fake'
    },
    policies: {
      version: 'policy-pg-v1',
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
}

function pluginManifest(): PluginManifest {
  return {
    name: 'controlled.catalog',
    version: '1.0.0',
    capabilities: ['catalog.read'],
    permissions: ['catalog:read'],
    tools: [
      {
        name: 'catalog.read',
        permission: 'catalog:read',
        risk: 'low',
        requiresApproval: false
      }
    ],
    hooks: [],
    dependencies: [],
    configSchemaVersion: 'v1'
  }
}

describe('Postgres platform control plane smoke', () => {
  const itWithPostgres = testDatabaseUrl ? it : it.skip

  itWithPostgres(
    'persists an immutable published version and a tenant-scoped trace',
    async () => {
      const client = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_platform_${Date.now()}`
      await client.connect()
      try {
        await runPostgresMigrations(client, { schemaName })
        const repository = new PostgresControlPlaneRepository(client)
        const agent = await repository.createAgent(
          { tenantId },
          {
            slug: 'postgres-agent',
            name: 'Postgres Agent',
            description: 'Fictício'
          }
        )
        const draft = await repository.createVersion(
          { tenantId },
          agent.id,
          config(),
          'admin.postgres'
        )
        await repository.transitionVersion(
          { tenantId },
          draft.id,
          'TESTING',
          'DRAFT'
        )
        await repository.transitionVersion(
          { tenantId },
          draft.id,
          'APPROVED',
          'TESTING'
        )
        const releaseCandidate =
          await createValidatedControlledReleaseCandidate(
            repository,
            tenantId,
            agent.id,
            draft.id,
            'admin.postgres'
          )
        const published = await repository.publishVersion(
          { tenantId },
          draft.id,
          releaseCandidate.id,
          'APPROVED'
        )
        await expect(
          repository.publishVersion(
            { tenantId },
            draft.id,
            releaseCandidate.id,
            'APPROVED'
          )
        ).rejects.toMatchObject({ code: 'conflict' })
        const trace = {
          traceId: createTraceId(),
          tenantId,
          agentId: agent.id,
          versionId: published.id,
          input: { message: 'email ana@example.com', historySize: 0 },
          intent: { name: 'unknown', confidence: 0.2 },
          risk: {
            level: 'low' as const,
            reason: 'controlled_low_risk_request'
          },
          policy: [],
          knowledge: { status: 'not_requested' as const },
          tools: [],
          handoff: {
            requested: true,
            reason: 'low_confidence_handoff',
            state: 'HANDOFF_REQUESTED' as const
          },
          response: {
            text: 'Telefone +5511999999999',
            mode: 'handoff' as const
          },
          provider: {
            provider: 'fake',
            model: 'deterministic-v1',
            externalCall: false as const
          },
          configVersion: 'postgres',
          executionMode: 'TEST_LAB' as const,
          createdAt: new Date()
        }
        await repository.recordTestRun({ tenantId }, trace)

        const freshRepository = new PostgresControlPlaneRepository(client)
        await expect(
          freshRepository.resolvePublished({ tenantId }, agent.id)
        ).resolves.toMatchObject({ id: published.id, status: 'PUBLISHED' })
        await expect(
          freshRepository.listTestRuns({ tenantId })
        ).resolves.toMatchObject([
          {
            traceId: trace.traceId,
            input: { message: 'email [redacted-email]' },
            response: { text: 'Telefone [redacted-phone]' }
          }
        ])
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await client.end()
      }
    }
  )

  itWithPostgres(
    'persists versioned suites and redacted A/B run metadata under tenant RLS',
    async () => {
      const client = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_suite_${Date.now()}`
      await client.connect()
      try {
        await runPostgresMigrations(client, { schemaName })
        await client.query(`SET search_path TO ${schemaName}`)
        await client.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
          tenantId
        ])
        const repository = new PostgresControlPlaneRepository(client)
        const agent = await repository.createAgent(
          { tenantId },
          {
            slug: 'suite-postgres-agent',
            name: 'Suite Postgres Agent',
            description: 'Fictício'
          }
        )
        const version = await repository.createVersion(
          { tenantId },
          agent.id,
          config(),
          'admin.postgres'
        )
        const suite = await repository.createTestSuite(
          { tenantId },
          {
            slug: 'postgres-suite',
            name: 'Postgres Suite',
            description: 'Fictícia',
            agentId: agent.id,
            versionId: version.id,
            cases: [
              {
                id: 'case-one',
                message: 'Olá',
                history: [],
                expectedResponseMode: 'clarify'
              }
            ]
          },
          'admin.postgres'
        )
        const clone = await repository.cloneTestSuite(
          { tenantId },
          suite.id,
          {
            cases: [
              {
                id: 'case-two',
                message: 'Oi',
                history: [],
                expectedResponseMode: 'clarify'
              }
            ]
          },
          'admin.postgres'
        )
        await repository.recordTestSuiteRun(
          { tenantId },
          {
            id: createTestSuiteRunId(),
            tenantId,
            suiteId: clone.id,
            agentId: agent.id,
            variants: [
              { label: 'A', versionId: version.id, passed: true, results: [] },
              { label: 'B', versionId: version.id, passed: true, results: [] }
            ],
            passed: true,
            createdBy: 'admin.postgres',
            createdAt: new Date()
          }
        )

        await expect(repository.listTestSuites({ tenantId })).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: clone.id,
              version: 2,
              previousSuiteId: suite.id
            })
          ])
        )
        await expect(
          repository.listTestSuiteRuns({ tenantId }, clone.id)
        ).resolves.toMatchObject([
          { suiteId: clone.id, variants: [{ label: 'A' }, { label: 'B' }] }
        ])
        await expect(
          repository.listTestSuites({
            tenantId: 'tenant_00000000-0000-4000-0000-000000000042'
          })
        ).resolves.toEqual([])
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await client.end()
      }
    }
  )

  itWithPostgres(
    'persists tenant-scoped plugin metadata with immutable identity and guarded status',
    async () => {
      const client = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_plugin_catalog_${Date.now()}`
      await client.connect()
      try {
        await runPostgresMigrations(client, { schemaName })
        await client.query(`SET search_path TO ${schemaName}`)
        await client.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
          tenantId
        ])
        const repository = new PostgresControlPlaneRepository(client)
        const draft = await repository.createPluginCatalogEntry(
          { tenantId },
          { manifest: pluginManifest() },
          'admin.postgres'
        )

        await expect(
          repository.createPluginCatalogEntry(
            { tenantId },
            { manifest: pluginManifest() },
            'admin.postgres'
          )
        ).rejects.toMatchObject({ code: 'invalid_action' })
        await expect(
          repository.listPluginCatalogEntries({
            tenantId: 'tenant_00000000-0000-4000-8000-000000000042'
          })
        ).resolves.toEqual([])

        const approved = await repository.transitionPluginCatalogEntry(
          { tenantId },
          draft.id,
          'APPROVED',
          'approver.postgres',
          'DRAFT'
        )
        expect(approved).toMatchObject({
          status: 'APPROVED',
          approvedBy: 'approver.postgres'
        })
        await expect(
          repository.transitionPluginCatalogEntry(
            { tenantId },
            draft.id,
            'ARCHIVED',
            'admin.postgres',
            'DRAFT'
          )
        ).rejects.toMatchObject({ code: 'conflict' })
        await expect(
          repository.getPluginCatalogEntry({ tenantId }, draft.id)
        ).resolves.toMatchObject({
          manifest: pluginManifest(),
          status: 'APPROVED'
        })
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await client.end()
      }
    }
  )

  itWithPostgres(
    'persists tenant-scoped knowledge source metadata without content or lifecycle bypass',
    async () => {
      const client = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_knowledge_catalog_${Date.now()}`
      await client.connect()
      try {
        await runPostgresMigrations(client, { schemaName })
        await client.query(`SET search_path TO ${schemaName}`)
        await client.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
          tenantId
        ])
        const repository = new PostgresControlPlaneRepository(client)
        const draft = await repository.createKnowledgeSource(
          { tenantId },
          {
            source: 'controlled://institutional-hours',
            version: 'v1',
            label: 'Horários fictícios',
            description: 'Metadata controlada sem conteúdo documental.'
          },
          'admin.postgres'
        )

        await expect(
          repository.createKnowledgeSource(
            { tenantId },
            {
              source: 'controlled://institutional-hours',
              version: 'v1',
              label: 'Duplicada',
              description: ''
            },
            'admin.postgres'
          )
        ).rejects.toMatchObject({ code: 'invalid_action' })
        await expect(
          repository.listKnowledgeSources({
            tenantId: 'tenant_00000000-0000-4000-8000-000000000042'
          })
        ).resolves.toEqual([])

        const approved = await repository.transitionKnowledgeSource(
          { tenantId },
          draft.id,
          'APPROVED',
          'approver.postgres',
          'DRAFT'
        )
        expect(approved).toMatchObject({
          status: 'APPROVED',
          approvedBy: 'approver.postgres',
          source: 'controlled://institutional-hours',
          version: 'v1'
        })
        await expect(
          repository.transitionKnowledgeSource(
            { tenantId },
            draft.id,
            'ARCHIVED',
            'admin.postgres',
            'DRAFT'
          )
        ).rejects.toMatchObject({ code: 'conflict' })
        await expect(
          repository.transitionKnowledgeSource(
            { tenantId },
            draft.id,
            'APPROVED',
            'admin.postgres',
            'APPROVED'
          )
        ).rejects.toMatchObject({ code: 'invalid_action' })
        await expect(
          repository.getKnowledgeSource({ tenantId }, draft.id)
        ).resolves.toMatchObject({
          status: 'APPROVED',
          label: 'Horários fictícios',
          description: 'Metadata controlada sem conteúdo documental.'
        })
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await client.end()
      }
    }
  )

  itWithPostgres(
    'persists a validated release-candidate evidence ledger without mutating the version',
    async () => {
      const client = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_release_candidate_${Date.now()}`
      await client.connect()
      try {
        await runPostgresMigrations(client, { schemaName })
        await client.query(`SET search_path TO ${schemaName}`)
        await client.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
          tenantId
        ])
        const repository = new PostgresControlPlaneRepository(client)
        const agent = await repository.createAgent(
          { tenantId },
          {
            slug: 'release-candidate-postgres-agent',
            name: 'Release Candidate Postgres Agent',
            description: 'Fictício'
          }
        )
        const version = await repository.createVersion(
          { tenantId },
          agent.id,
          config(),
          'admin.postgres'
        )
        const gateResults: ReleaseCandidateGateResult[] = [
          {
            key: 'safety_preflight',
            status: 'PASS',
            evidenceRef: 'controlled://evidence/safety-preflight-v1'
          },
          {
            key: 'test_lab_regression',
            status: 'PASS',
            evidenceRef: 'controlled://evidence/test-lab-regression-v1'
          },
          {
            key: 'snapshot_integrity',
            status: 'PASS',
            evidenceRef: 'controlled://evidence/snapshot-integrity-v1'
          },
          {
            key: 'external_boundary',
            status: 'PASS',
            evidenceRef: 'controlled://evidence/external-boundary-v1'
          }
        ]
        const candidate = await repository.createReleaseCandidate(
          { tenantId },
          { agentId: agent.id, versionId: version.id, gateResults },
          'admin.postgres'
        )
        const validated = await repository.transitionReleaseCandidate(
          { tenantId },
          candidate.id,
          'VALIDATED',
          'approver.postgres',
          'DRAFT'
        )
        expect(validated).toMatchObject({
          status: 'VALIDATED',
          validatedBy: 'approver.postgres'
        })
        await expect(
          client.query(
            `UPDATE platform_release_candidates
             SET validated_by = created_by
             WHERE tenant_id = $1 AND id = $2`,
            [tenantId, candidate.id]
          )
        ).rejects.toThrow()
        await expect(
          repository.getVersion({ tenantId }, version.id)
        ).resolves.toMatchObject({ status: 'DRAFT' })
        await expect(
          repository.listReleaseCandidates({
            tenantId: 'tenant_00000000-0000-0000-0000-000000000042'
          })
        ).resolves.toEqual([])
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await client.end()
      }
    }
  )
})
