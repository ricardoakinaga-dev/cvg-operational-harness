import type { QueryResult, QueryResultRow } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  AgentConfigSchema,
  createValidatedControlledReleaseCandidate,
  createTestSuiteRunId,
  createTraceId,
  type AgentConfig,
  type AgentVersionStatus,
  type KnowledgeSourceStatus,
  type ReleaseCandidateStatus,
  type TestRunTrace,
  type TestSuiteRunRecord
} from '@cvg/platform'
import { PostgresControlPlaneRepository } from '../platform-control-plane-repository.ts'
import type { PostgresQueryable } from '../postgres.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000031'
const agentId = 'agent_00000000-0000-4000-8000-000000000031'
const versionId = 'agent_version_00000000-0000-4000-8000-000000000031'

describe('Postgres control plane repository', () => {
  it('uses tenant-scoped parameterized queries and stores trace JSON', async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = []
    const agentRow = {
      tenant_id: tenantId,
      id: agentId,
      slug: 'db-agent',
      name: 'DB Agent',
      description: 'Fictício',
      active_version_id: null,
      created_at: new Date('2026-08-23T10:00:00.000Z'),
      updated_at: new Date('2026-08-23T10:00:00.000Z')
    }
    const trace: TestRunTrace = {
      traceId: createTraceId(),
      tenantId,
      agentId,
      versionId,
      input: { message: 'teste fictício', historySize: 0 },
      intent: { name: 'unknown', confidence: 0.2 },
      risk: { level: 'low' as const, reason: 'controlled_low_risk_request' },
      policy: [],
      knowledge: { status: 'not_requested' },
      tools: [],
      handoff: {
        requested: true,
        reason: 'low_confidence_handoff',
        state: 'HANDOFF_REQUESTED'
      },
      response: { text: 'handoff', mode: 'handoff' },
      provider: {
        provider: 'fake',
        model: 'deterministic-v1',
        externalCall: false
      },
      configVersion: 'version',
      executionMode: 'TEST_LAB',
      createdAt: new Date('2026-08-23T10:00:00.000Z')
    }
    const versionRow = {
      tenant_id: tenantId,
      id: versionId,
      agent_id: agentId,
      version: 1,
      status: 'PUBLISHED' as const,
      config: createConfig(),
      created_by: 'admin.db',
      created_at: new Date('2026-08-23T10:00:00.000Z'),
      published_at: new Date('2026-08-23T10:00:00.000Z')
    }
    const result = <T extends QueryResultRow>(rows: T[]): QueryResult<T> => ({
      command: 'SELECT',
      fields: [],
      oid: 0,
      rowCount: rows.length,
      rows
    })
    const fakeClient = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ) {
        queries.push(values ? { text, values } : { text })
        if (text.includes('FROM platform_agents')) {
          return result([agentRow] as unknown as T[])
        }
        if (text.includes('FROM platform_test_runs')) {
          return result([{ trace }] as unknown as T[])
        }
        if (text.includes('FROM platform_agent_versions')) {
          return result([versionRow] as unknown as T[])
        }
        return result([] as unknown as T[])
      }
    }
    const repository = new PostgresControlPlaneRepository(fakeClient)

    await expect(
      repository.getAgent({ tenantId }, agentId)
    ).resolves.toMatchObject({
      id: agentId,
      tenantId
    })
    await expect(
      repository.recordTestRun({ tenantId }, trace)
    ).resolves.toEqual(trace)
    await expect(repository.listTestRuns({ tenantId })).resolves.toEqual([
      trace
    ])

    expect(
      queries.some(
        (query) =>
          query.text.includes('WHERE tenant_id = $1') &&
          query.values?.[0] === tenantId
      )
    ).toBe(true)
    expect(queries.some((query) => query.text.includes('$5::jsonb'))).toBe(true)

    const insertCount = queries.filter((query) =>
      query.text.includes('INSERT INTO platform_test_runs')
    ).length
    await expect(
      repository.recordTestRun({ tenantId }, {
        ...trace,
        provider: { ...trace.provider, externalCall: true }
      } as unknown as TestRunTrace)
    ).rejects.toMatchObject({ code: 'validation_failed' })
    expect(
      queries.filter((query) =>
        query.text.includes('INSERT INTO platform_test_runs')
      )
    ).toHaveLength(insertCount)
  })

  it('fails closed when a PostgreSQL trace row is corrupt', async () => {
    const trace: TestRunTrace = {
      traceId: createTraceId(),
      tenantId,
      agentId,
      versionId,
      input: { message: 'fixture', historySize: 0 },
      intent: { name: 'unknown', confidence: 0.2 },
      risk: { level: 'low' as const, reason: 'controlled_low_risk_request' },
      policy: [],
      knowledge: { status: 'not_requested' },
      tools: [],
      handoff: { requested: false, reason: null, state: 'BOT_ACTIVE' },
      response: { text: 'Resposta segura.', mode: 'answer' },
      provider: {
        provider: 'fake',
        model: 'deterministic-v1',
        externalCall: true
      } as never,
      configVersion: 'fixture-v1',
      executionMode: 'TEST_LAB',
      createdAt: new Date()
    }
    const client = {
      async query<T extends QueryResultRow = QueryResultRow>(text: string) {
        if (text.includes('FROM platform_test_runs')) {
          return resultRows<T>([{ trace }])
        }
        return resultRows<T>([])
      }
    } satisfies PostgresQueryable
    const repository = new PostgresControlPlaneRepository(client)

    await expect(repository.listTestRuns({ tenantId })).rejects.toMatchObject({
      code: 'validation_failed'
    })
  })

  it('fails closed when trace JSON disagrees with persisted row references', async () => {
    const trace: TestRunTrace = {
      traceId: createTraceId(),
      tenantId,
      agentId,
      versionId,
      input: { message: 'fixture', historySize: 0 },
      intent: { name: 'unknown', confidence: 0.2 },
      risk: { level: 'low' as const, reason: 'controlled_low_risk_request' },
      policy: [],
      knowledge: { status: 'not_requested' },
      tools: [],
      handoff: { requested: false, reason: null, state: 'BOT_ACTIVE' },
      response: { text: 'Resposta segura.', mode: 'answer' },
      provider: {
        provider: 'fake',
        model: 'deterministic-v1',
        externalCall: false
      },
      configVersion: 'fixture-v1',
      executionMode: 'TEST_LAB',
      createdAt: new Date('2026-08-23T10:00:00.000Z')
    }
    const client = {
      async query<T extends QueryResultRow = QueryResultRow>(text: string) {
        if (text.includes('FROM platform_test_runs')) {
          return resultRows<T>([
            {
              tenant_id: tenantId,
              trace_id: trace.traceId,
              agent_id: 'agent_00000000-0000-4000-8000-000000000032',
              version_id: trace.versionId,
              trace,
              created_at: trace.createdAt
            }
          ])
        }
        return resultRows<T>([])
      }
    } satisfies PostgresQueryable
    const repository = new PostgresControlPlaneRepository(client)

    await expect(repository.listTestRuns({ tenantId })).rejects.toMatchObject({
      code: 'validation_failed'
    })
  })

  it('persists the complete immutable agent/version lifecycle', async () => {
    const client = new StatefulPlatformClient()
    const repository = new PostgresControlPlaneRepository(client)
    const scope = { tenantId }

    const agent = await repository.createAgent(scope, {
      slug: 'lifecycle-agent',
      name: 'Lifecycle Agent',
      description: 'Controlled lifecycle'
    })
    expect(await repository.getAgent(scope, agent.id)).toMatchObject({
      id: agent.id,
      slug: 'lifecycle-agent'
    })
    expect(await repository.listAgents(scope)).toHaveLength(1)

    const draft = await repository.createVersion(
      scope,
      agent.id,
      createConfig(),
      'admin.lifecycle'
    )
    expect(draft.status).toBe('DRAFT')
    const invalidTemplateKey = AgentConfigSchema.parse({
      ...createConfig(),
      responseTemplates: { 'invalid key': 'Texto controlado.' }
    })
    await expect(
      repository.createVersion(
        scope,
        agent.id,
        invalidTemplateKey,
        'admin.lifecycle'
      )
    ).rejects.toMatchObject({ code: 'validation_failed' })
    const agentLockIndex = client.queries.findIndex(
      (query) =>
        query.includes('FROM platform_agents') && query.includes('FOR UPDATE')
    )
    const latestVersionIndex = client.queries.findIndex((query) =>
      query.includes('SELECT version')
    )
    expect(agentLockIndex).toBeGreaterThanOrEqual(0)
    expect(agentLockIndex).toBeLessThan(latestVersionIndex)
    expect((await repository.listVersions(scope, agent.id))[0]?.id).toBe(
      draft.id
    )
    await expect(
      repository.transitionVersion(scope, draft.id, 'APPROVED')
    ).rejects.toMatchObject({ code: 'invalid_action' })

    const testing = await repository.transitionVersion(
      scope,
      draft.id,
      'TESTING'
    )
    expect(testing.status).toBe('TESTING')
    expect(
      client.queries.some(
        (query) =>
          query.includes('UPDATE platform_agent_versions') &&
          query.includes('AND status = $4')
      )
    ).toBe(true)
    const approved = await repository.transitionVersion(
      scope,
      testing.id,
      'APPROVED'
    )
    const releaseCandidate = await createValidatedControlledReleaseCandidate(
      repository,
      tenantId,
      agent.id,
      approved.id,
      'admin.lifecycle'
    )
    const published = await repository.publishVersion(
      scope,
      approved.id,
      releaseCandidate.id
    )
    expect(published.status).toBe('PUBLISHED')
    expect(
      client.queries.some(
        (query) =>
          query.includes('FROM platform_agents') && query.includes('FOR UPDATE')
      )
    ).toBe(true)
    expect((await repository.resolvePublished(scope, agent.id))?.id).toBe(
      published.id
    )

    const transactionsBeforeRollback = client.queries.filter(
      (query) => query === 'BEGIN'
    ).length
    const rollback = await repository.rollback(
      scope,
      agent.id,
      published.id,
      'admin.lifecycle',
      releaseCandidate.id
    )
    const transactionsAfterRollback = client.queries.filter(
      (query) => query === 'BEGIN'
    ).length
    expect(transactionsAfterRollback - transactionsBeforeRollback).toBe(1)
    expect(rollback.status).toBe('PUBLISHED')
    expect(rollback.id).not.toBe(published.id)
    expect((await repository.listVersions(scope, agent.id)).length).toBe(2)
  })

  it('persists tenant-scoped knowledge metadata with guarded lifecycle', async () => {
    const client = new StatefulPlatformClient()
    const repository = new PostgresControlPlaneRepository(client)
    const scope = { tenantId }
    const draft = await repository.createKnowledgeSource(
      scope,
      {
        source: 'controlled://institutional-hours',
        version: 'v1',
        label: 'Horários fictícios',
        description: 'Metadata controlada sem conteúdo documental.'
      },
      'admin.knowledge'
    )
    expect(draft).toMatchObject({
      status: 'DRAFT',
      approvedBy: null,
      source: 'controlled://institutional-hours'
    })
    await expect(
      repository.createKnowledgeSource(
        scope,
        {
          source: 'controlled://institutional-hours',
          version: 'v1',
          label: 'Duplicada',
          description: ''
        },
        'admin.knowledge'
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })
    await expect(repository.listKnowledgeSources(scope)).resolves.toEqual([
      expect.objectContaining({ id: draft.id })
    ])
    await expect(
      repository.listKnowledgeSources({
        tenantId: 'tenant_00000000-0000-4000-8000-000000000099'
      })
    ).resolves.toEqual([])

    const approved = await repository.transitionKnowledgeSource(
      scope,
      draft.id,
      'APPROVED',
      'approver.knowledge',
      'DRAFT'
    )
    expect(approved).toMatchObject({
      status: 'APPROVED',
      approvedBy: 'approver.knowledge'
    })
    await expect(
      repository.transitionKnowledgeSource(
        scope,
        draft.id,
        'ARCHIVED',
        'admin.knowledge',
        'DRAFT'
      )
    ).rejects.toMatchObject({ code: 'conflict' })
    const archived = await repository.transitionKnowledgeSource(
      scope,
      draft.id,
      'ARCHIVED',
      'admin.knowledge',
      'APPROVED'
    )
    expect(archived.status).toBe('ARCHIVED')
    await expect(
      repository.transitionKnowledgeSource(
        scope,
        draft.id,
        'APPROVED',
        'admin.knowledge',
        'ARCHIVED'
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })
    await expect(
      repository.getKnowledgeSource(scope, draft.id)
    ).resolves.toMatchObject({
      status: 'ARCHIVED',
      label: 'Horários fictícios'
    })
  })

  it('rejects a stale status precondition inside the repository transaction', async () => {
    const client = new StatefulPlatformClient()
    const repository = new PostgresControlPlaneRepository(client)
    const scope = { tenantId }
    const agent = await repository.createAgent(scope, {
      slug: 'optimistic-repository-agent',
      name: 'Optimistic Repository Agent',
      description: 'Controlled conflict fixture'
    })
    const draft = await repository.createVersion(
      scope,
      agent.id,
      createConfig(),
      'admin.optimistic'
    )
    await repository.transitionVersion(scope, draft.id, 'TESTING', 'DRAFT')
    await expect(
      repository.transitionVersion(scope, draft.id, 'APPROVED', 'DRAFT')
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(repository.getVersion(scope, draft.id)).resolves.toMatchObject(
      {
        status: 'TESTING'
      }
    )
    expect(
      client.queries.filter((query) => query === 'ROLLBACK')
    ).not.toHaveLength(0)
  })

  it('fails closed for missing agents, invalid rollback targets, and cross-tenant traces', async () => {
    const client = new StatefulPlatformClient()
    const repository = new PostgresControlPlaneRepository(client)
    const scope = { tenantId }

    await expect(
      repository.createVersion(
        scope,
        agentId,
        createConfig(),
        'admin.lifecycle'
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })
    await expect(
      repository.rollback(
        scope,
        agentId,
        versionId,
        'admin.lifecycle',
        'release_candidate_00000000-0000-4000-8000-000000000399'
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })

    const trace: TestRunTrace = {
      traceId: createTraceId(),
      tenantId: 'tenant_00000000-0000-4000-8000-000000000099',
      agentId,
      versionId,
      input: { message: 'cross-tenant', historySize: 0 },
      intent: { name: 'unknown', confidence: 0.1 },
      risk: { level: 'low' as const, reason: 'controlled_low_risk_request' },
      policy: [],
      knowledge: { status: 'not_requested' },
      tools: [],
      handoff: { requested: false, reason: null, state: 'BOT_ACTIVE' },
      response: { text: 'blocked', mode: 'blocked' },
      provider: {
        provider: 'fake',
        model: 'deterministic-v1',
        externalCall: false
      },
      configVersion: 'version',
      executionMode: 'TEST_LAB',
      createdAt: new Date()
    }
    await expect(repository.recordTestRun(scope, trace)).rejects.toMatchObject({
      code: 'forbidden'
    })
  })

  it('persists immutable redacted suites and controlled run history', async () => {
    const client = new StatefulPlatformClient()
    const repository = new PostgresControlPlaneRepository(client)
    const scope = { tenantId }
    const agent = await repository.createAgent(scope, {
      slug: 'suite-repository-agent',
      name: 'Suite Repository Agent',
      description: 'Fictício'
    })
    const version = await repository.createVersion(
      scope,
      agent.id,
      createConfig(),
      'admin.suite'
    )
    const suite = await repository.createTestSuite(
      scope,
      {
        slug: 'repository-suite',
        name: 'Repository Suite',
        description: 'Fictícia',
        agentId: agent.id,
        versionId: version.id,
        cases: [
          {
            id: 'redacted-case',
            message: 'Email ana@example.com e +5511999999999',
            history: ['Contato joao@example.com'],
            expectedResponseMode: 'clarify',
            approvedKnowledge: {
              version: 'knowledge-v1',
              answer: 'Ligue +5511888888888',
              source: 'controlled://institutional'
            }
          }
        ]
      },
      'admin.suite'
    )
    expect(suite.cases[0]).toMatchObject({
      message: 'Email [redacted-email] e [redacted-phone]',
      history: ['Contato [redacted-email]'],
      approvedKnowledge: { answer: 'Ligue [redacted-phone]' }
    })

    const clone = await repository.cloneTestSuite(
      scope,
      suite.id,
      { name: 'Repository Suite v2' },
      'admin.suite'
    )
    expect(clone).toMatchObject({
      version: 2,
      previousSuiteId: suite.id,
      name: 'Repository Suite v2'
    })
    await expect(
      repository.getTestSuite(scope, suite.id)
    ).resolves.toMatchObject({
      version: 1,
      name: 'Repository Suite'
    })
    await expect(repository.listTestSuites(scope, agent.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: suite.id }),
        expect.objectContaining({ id: clone.id })
      ])
    )

    const trace: TestRunTrace = {
      traceId: createTraceId(),
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      input: { message: 'Email trace@example.com', historySize: 0 },
      intent: { name: 'unknown', confidence: 0.2 },
      risk: { level: 'low' as const, reason: 'controlled_low_risk_request' },
      policy: [],
      knowledge: { status: 'not_requested' },
      tools: [],
      handoff: { requested: false, reason: null, state: 'BOT_ACTIVE' },
      response: { text: 'Telefone +5511777777777', mode: 'clarify' },
      provider: {
        provider: 'fake',
        model: 'deterministic-v1',
        externalCall: false
      },
      configVersion: 'suite-repository',
      executionMode: 'TEST_LAB',
      createdAt: new Date()
    }
    const run: TestSuiteRunRecord = {
      id: createTestSuiteRunId(),
      tenantId,
      suiteId: clone.id,
      agentId: agent.id,
      variants: [
        {
          label: 'A',
          versionId: version.id,
          passed: true,
          results: [
            { caseId: 'redacted-case', passed: true, failures: [], trace }
          ]
        }
      ],
      passed: true,
      createdBy: 'admin.suite',
      createdAt: new Date()
    }
    const storedRun = await repository.recordTestSuiteRun(scope, run)
    expect(storedRun.variants[0]?.results[0]?.trace.response.text).toBe(
      'Telefone [redacted-phone]'
    )
    await expect(
      repository.listTestSuiteRuns(scope, clone.id)
    ).resolves.toMatchObject([
      {
        suiteId: clone.id,
        variants: [{ label: 'A', results: [{ caseId: 'redacted-case' }] }]
      }
    ])

    const externalTrace = {
      ...trace,
      provider: { ...trace.provider, externalCall: true }
    } as unknown as TestRunTrace
    await expect(
      repository.recordTestSuiteRun(scope, {
        ...run,
        id: createTestSuiteRunId(),
        variants: [
          {
            ...run.variants[0]!,
            results: [
              {
                ...run.variants[0]!.results[0]!,
                trace: externalTrace
              }
            ]
          }
        ]
      })
    ).rejects.toMatchObject({ code: 'validation_failed' })
    await expect(
      repository.listTestSuiteRuns(scope, clone.id)
    ).resolves.toHaveLength(1)
  })

  it('rejects suite collisions, invalid scope, and invalid run variants', async () => {
    const client = new StatefulPlatformClient()
    const repository = new PostgresControlPlaneRepository(client)
    const scope = { tenantId }
    const agent = await repository.createAgent(scope, {
      slug: 'suite-errors-agent',
      name: 'Suite Errors Agent',
      description: 'Fictício'
    })
    const version = await repository.createVersion(
      scope,
      agent.id,
      createConfig(),
      'admin.suite'
    )
    const input = {
      slug: 'suite-errors',
      name: 'Suite Errors',
      description: 'Fictícia',
      agentId: agent.id,
      versionId: version.id,
      cases: [
        {
          id: 'case',
          message: 'Olá',
          history: [],
          expectedResponseMode: 'clarify' as const
        }
      ]
    }
    const suite = await repository.createTestSuite(scope, input, 'admin.suite')
    await expect(
      repository.createTestSuite(scope, input, 'admin.suite')
    ).rejects.toMatchObject({ code: 'invalid_action' })
    await expect(
      repository.getTestSuite(
        { tenantId: 'tenant_00000000-0000-4000-0000-000000000099' },
        suite.id
      )
    ).resolves.toBeNull()
    await expect(
      repository.cloneTestSuite(
        scope,
        suite.id,
        {
          versionId: 'agent_version_00000000-0000-4000-8000-000000000099'
        },
        'admin.suite'
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })

    const baseRun = {
      id: createTestSuiteRunId(),
      tenantId,
      suiteId: suite.id,
      agentId: agent.id,
      passed: false,
      createdBy: 'admin.suite',
      createdAt: new Date()
    }
    await expect(
      repository.recordTestSuiteRun(scope, {
        ...baseRun,
        id: 'invalid-run-id',
        variants: []
      })
    ).rejects.toThrow()
    await expect(
      repository.recordTestSuiteRun(scope, {
        ...baseRun,
        variants: []
      })
    ).rejects.toMatchObject({ code: 'invalid_action' })
    await expect(
      repository.recordTestSuiteRun(scope, {
        ...baseRun,
        variants: [
          { label: 'A', versionId: version.id, passed: true, results: [] },
          { label: 'A', versionId: version.id, passed: true, results: [] }
        ]
      })
    ).rejects.toMatchObject({ code: 'invalid_action' })
    await expect(
      repository.recordTestSuiteRun(scope, {
        ...baseRun,
        variants: [
          {
            label: 'C' as 'A',
            versionId: version.id,
            passed: false,
            results: []
          }
        ]
      })
    ).rejects.toMatchObject({ code: 'invalid_action' })
    await expect(
      repository.listTestSuiteRuns(
        { tenantId: 'tenant_00000000-0000-4000-0000-000000000099' },
        suite.id
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })
  })
})

function createConfig(): AgentConfig {
  return AgentConfigSchema.parse({
    persona: { name: 'Lifecycle', role: 'assistant', tone: 'calm' },
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
      version: 'policy-pg-test-v1',
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

interface StatefulAgentRow {
  tenant_id: string
  id: string
  slug: string
  name: string
  description: string
  active_version_id: string | null
  created_at: Date
  updated_at: Date
}

interface StatefulVersionRow {
  tenant_id: string
  id: string
  agent_id: string
  version: number
  status: AgentVersionStatus
  config: AgentConfig
  created_by: string
  created_at: Date
  published_at: Date | null
}

interface StatefulSuiteRow {
  tenant_id: string
  id: string
  slug: string
  name: string
  description: string
  agent_id: string
  version_id: string
  version: number
  cases: unknown[]
  previous_suite_id: string | null
  created_by: string
  created_at: Date
  updated_at: Date
}

interface StatefulRunRow {
  tenant_id: string
  id: string
  suite_id: string
  agent_id: string
  result: { variants: unknown[]; passed: boolean }
  created_by: string
  created_at: Date
}

interface StatefulKnowledgeSourceRow {
  tenant_id: string
  id: string
  source: string
  version: string
  label: string
  description: string
  status: KnowledgeSourceStatus
  created_by: string
  approved_by: string | null
  created_at: Date
  updated_at: Date
}

interface StatefulReleaseCandidateRow {
  tenant_id: string
  id: string
  agent_id: string
  version_id: string
  evidence_digest: string
  gate_results: unknown
  status: ReleaseCandidateStatus
  created_by: string
  validated_by: string | null
  created_at: Date
  updated_at: Date
  validated_at: Date | null
}

class StatefulPlatformClient implements PostgresQueryable {
  readonly queries: string[] = []
  private readonly agents: StatefulAgentRow[] = []
  private readonly versions: StatefulVersionRow[] = []
  private readonly traces: TestRunTrace[] = []
  private readonly suites: StatefulSuiteRow[] = []
  private readonly runs: StatefulRunRow[] = []
  private readonly knowledgeSources: StatefulKnowledgeSourceRow[] = []
  private readonly releaseCandidates: StatefulReleaseCandidateRow[] = []

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[] = []
  ): Promise<QueryResult<T>> {
    this.queries.push(text)
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return resultRows<T>([])

    if (text.includes('INSERT INTO platform_agents')) {
      this.agents.push({
        tenant_id: String(values[0]),
        id: String(values[1]),
        slug: String(values[2]),
        name: String(values[3]),
        description: String(values[4]),
        active_version_id: (values[5] as string | null) ?? null,
        created_at: values[6] as Date,
        updated_at: values[7] as Date
      })
      return resultRows<T>([])
    }

    if (text.includes('INSERT INTO platform_agent_versions')) {
      this.versions.push({
        tenant_id: String(values[0]),
        id: String(values[1]),
        agent_id: String(values[2]),
        version: Number(values[3]),
        status: values[4] as AgentVersionStatus,
        config: JSON.parse(String(values[5])) as AgentConfig,
        created_by: String(values[6]),
        created_at: values[7] as Date,
        published_at: (values[8] as Date | null) ?? null
      })
      return resultRows<T>([])
    }

    if (text.includes('INSERT INTO platform_test_runs')) {
      this.traces.push(JSON.parse(String(values[4])) as TestRunTrace)
      return resultRows<T>([])
    }

    if (text.includes('INSERT INTO platform_test_suites')) {
      this.suites.push({
        tenant_id: String(values[0]),
        id: String(values[1]),
        slug: String(values[2]),
        name: String(values[3]),
        description: String(values[4]),
        agent_id: String(values[5]),
        version_id: String(values[6]),
        version: Number(values[7]),
        cases: JSON.parse(String(values[8])) as unknown[],
        previous_suite_id: (values[9] as string | null) ?? null,
        created_by: String(values[10]),
        created_at: values[11] as Date,
        updated_at: values[12] as Date
      })
      return resultRows<T>([])
    }

    if (text.includes('INSERT INTO platform_test_suite_runs')) {
      this.runs.push({
        tenant_id: String(values[0]),
        id: String(values[1]),
        suite_id: String(values[2]),
        agent_id: String(values[3]),
        result: JSON.parse(String(values[4])) as StatefulRunRow['result'],
        created_by: String(values[5]),
        created_at: values[6] as Date
      })
      return resultRows<T>([])
    }

    if (text.includes('INSERT INTO platform_knowledge_sources')) {
      this.knowledgeSources.push({
        tenant_id: String(values[0]),
        id: String(values[1]),
        source: String(values[2]),
        version: String(values[3]),
        label: String(values[4]),
        description: String(values[5]),
        status: values[6] as KnowledgeSourceStatus,
        created_by: String(values[7]),
        approved_by: (values[8] as string | null) ?? null,
        created_at: values[9] as Date,
        updated_at: values[10] as Date
      })
      return resultRows<T>([])
    }

    if (text.includes('INSERT INTO platform_release_candidates')) {
      this.releaseCandidates.push({
        tenant_id: String(values[0]),
        id: String(values[1]),
        agent_id: String(values[2]),
        version_id: String(values[3]),
        evidence_digest: String(values[4]),
        gate_results: JSON.parse(String(values[5])),
        status: values[6] as ReleaseCandidateStatus,
        created_by: String(values[7]),
        validated_by: (values[8] as string | null) ?? null,
        created_at: values[9] as Date,
        updated_at: values[10] as Date,
        validated_at: (values[11] as Date | null) ?? null
      })
      return resultRows<T>([])
    }

    if (
      text.includes('SELECT version') &&
      text.includes('FROM platform_test_suites')
    ) {
      const latest = this.suites
        .filter(
          (suite) =>
            suite.tenant_id === String(values[0]) &&
            suite.slug === String(values[1])
        )
        .sort((left, right) => right.version - left.version)[0]
      return resultRows<T>(latest ? [{ version: latest.version }] : [])
    }

    if (text.includes('SELECT id FROM platform_test_suites')) {
      const rows = this.suites
        .filter(
          (suite) =>
            suite.tenant_id === String(values[0]) &&
            suite.slug === String(values[1])
        )
        .map((suite) => ({ id: suite.id }))
      return resultRows<T>(rows)
    }

    if (text.includes('FROM platform_test_suites')) {
      const rows = this.suites.filter((suite) => {
        if (suite.tenant_id !== String(values[0])) return false
        if (text.includes('AND id = $2')) return suite.id === String(values[1])
        return values[1] === null || suite.agent_id === String(values[1])
      })
      return resultRows<T>(rows)
    }

    if (text.includes('FROM platform_test_suite_runs')) {
      const rows = this.runs
        .filter(
          (run) =>
            run.tenant_id === String(values[0]) &&
            run.suite_id === String(values[1])
        )
        .map((run) => ({ ...run }))
      return resultRows<T>(rows)
    }

    if (text.includes('FROM platform_knowledge_sources')) {
      const rows = this.knowledgeSources.filter((source) => {
        if (source.tenant_id !== String(values[0])) return false
        if (text.includes('AND id = $2')) return source.id === String(values[1])
        return true
      })
      return resultRows<T>(rows)
    }

    if (text.includes('FROM platform_release_candidates')) {
      const rows = this.releaseCandidates.filter((candidate) => {
        if (candidate.tenant_id !== String(values[0])) return false
        if (text.includes('AND id = $2')) {
          return candidate.id === String(values[1])
        }
        return values[1] === null || candidate.agent_id === String(values[1])
      })
      return resultRows<T>(rows)
    }

    if (text.includes('UPDATE platform_release_candidates')) {
      const candidate = this.releaseCandidates.find(
        (entry) =>
          entry.tenant_id === String(values[0]) &&
          entry.id === String(values[1]) &&
          entry.status === (values[6] as ReleaseCandidateStatus)
      )
      if (!candidate) return resultRows<T>([])
      candidate.status = values[2] as ReleaseCandidateStatus
      candidate.validated_by = (values[3] as string | null) ?? null
      candidate.validated_at = (values[4] as Date | null) ?? null
      candidate.updated_at = values[5] as Date
      return resultRows<T>([candidate])
    }

    if (text.includes('SELECT version')) {
      const latest = this.versions
        .filter(
          (version) =>
            version.tenant_id === String(values[0]) &&
            version.agent_id === String(values[1])
        )
        .sort((left, right) => right.version - left.version)[0]
      return resultRows<T>(latest ? [{ version: latest.version }] : [])
    }

    if (text.includes('FROM platform_agents')) {
      const rows = text.includes('AND id = $2')
        ? this.agents.filter(
            (agent) =>
              agent.tenant_id === String(values[0]) &&
              agent.id === String(values[1])
          )
        : this.agents.filter((agent) => agent.tenant_id === String(values[0]))
      return resultRows<T>(rows)
    }

    if (text.includes('FROM platform_agent_versions')) {
      const rows = text.includes('AND id = $2')
        ? this.versions.filter(
            (version) =>
              version.tenant_id === String(values[0]) &&
              version.id === String(values[1])
          )
        : this.versions
            .filter(
              (version) =>
                version.tenant_id === String(values[0]) &&
                version.agent_id === String(values[1])
            )
            .sort((left, right) => right.version - left.version)
      return resultRows<T>(rows)
    }

    if (text.includes('UPDATE platform_knowledge_sources')) {
      const source = this.knowledgeSources.find(
        (candidate) =>
          candidate.tenant_id === String(values[0]) &&
          candidate.id === String(values[1]) &&
          candidate.status === (values[5] as KnowledgeSourceStatus)
      )
      if (!source) return resultRows<T>([])
      source.status = values[2] as KnowledgeSourceStatus
      source.approved_by = (values[3] as string | null) ?? null
      source.updated_at = values[4] as Date
      return resultRows<T>([source])
    }

    if (text.includes('SET status = $3')) {
      const version = this.versions.find(
        (candidate) =>
          candidate.tenant_id === String(values[0]) &&
          candidate.id === String(values[1])
      )
      if (!version) return resultRows<T>([])
      version.status = values[2] as AgentVersionStatus
      return resultRows<T>([version])
    }

    if (text.includes("SET status = 'ARCHIVED'")) {
      this.versions.forEach((version) => {
        if (
          version.tenant_id === String(values[0]) &&
          version.agent_id === String(values[1]) &&
          version.status === 'PUBLISHED' &&
          version.id !== String(values[2])
        ) {
          version.status = 'ARCHIVED'
        }
      })
      return resultRows<T>([])
    }

    if (text.includes("SET status = 'PUBLISHED'")) {
      const version = this.versions.find(
        (candidate) =>
          candidate.tenant_id === String(values[0]) &&
          candidate.id === String(values[1])
      )
      if (version) {
        version.status = 'PUBLISHED'
        version.published_at = values[2] as Date
      }
      return resultRows<T>([])
    }

    if (text.includes('SET active_version_id')) {
      const agent = this.agents.find(
        (candidate) =>
          candidate.tenant_id === String(values[0]) &&
          candidate.id === String(values[1])
      )
      if (agent) {
        agent.active_version_id = String(values[2])
        agent.updated_at = values[3] as Date
      }
      return resultRows<T>([])
    }

    if (text.includes('FROM platform_test_runs')) {
      const rows = this.traces
        .filter((trace) => trace.tenantId === String(values[0]))
        .map((trace) => ({ trace }))
      return resultRows<T>(rows)
    }

    return resultRows<T>([])
  }
}

function resultRows<T extends QueryResultRow>(
  rows: QueryResultRow[]
): QueryResult<T> {
  return {
    command: 'SELECT',
    fields: [],
    oid: 0,
    rowCount: rows.length,
    rows: rows as T[]
  }
}
