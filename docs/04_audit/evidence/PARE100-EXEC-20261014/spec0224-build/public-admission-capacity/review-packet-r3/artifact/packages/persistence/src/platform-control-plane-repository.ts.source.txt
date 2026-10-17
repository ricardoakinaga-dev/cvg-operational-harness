import { DomainError, redactSensitiveText } from '@cvg/shared'
import {
  AgentConfigSchema,
  assertPromptProfileIntegrity,
  AgentCreateInputSchema,
  AgentIdSchema,
  AgentVersionIdSchema,
  AgentVersionStatusSchema,
  KnowledgeSourceCreateInputSchema,
  KnowledgeSourceIdSchema,
  KnowledgeSourceStatusSchema,
  ReleaseCandidateCreateInputSchema,
  ReleaseCandidateIdSchema,
  ReleaseCandidateStatusSchema,
  PluginCatalogCreateInputSchema,
  PluginCatalogIdSchema,
  PluginCatalogStatusSchema,
  PluginManifestSchema,
  createTestSuiteId,
  TestLabCaseSchema,
  TestSuiteCloneInputSchema,
  TestSuiteCreateInputSchema,
  TestSuiteIdSchema,
  TestSuiteRunIdSchema,
  TenantScopeSchema,
  TenantIdSchema,
  assertReleaseCandidateEvidenceIntegrity,
  assertReleaseCandidateIndependentValidator,
  assertReleaseCandidatePublishAuthority,
  createAgentId,
  createAgentVersionId,
  createKnowledgeSourceId,
  createPluginCatalogId,
  createReleaseCandidateId,
  computeReleaseCandidateEvidenceDigest,
  parseReleaseCandidateGateResults,
  sanitizeTestSuiteRunTraces,
  sanitizeTraceForPersistence,
  type AgentConfig,
  type AgentCreateInput,
  type AgentId,
  type AgentRecord,
  type AgentVersionId,
  type AgentVersionRecord,
  type AgentVersionStatus,
  type ControlPlaneStore,
  type KnowledgeSourceCreateInput,
  type KnowledgeSourceId,
  type KnowledgeSourceRecord,
  type KnowledgeSourceStatus,
  type ReleaseCandidateCreateInput,
  type ReleaseCandidateId,
  type ReleaseCandidateRecord,
  type ReleaseCandidateStatus,
  type PluginCatalogCreateInput,
  type PluginCatalogId,
  type PluginCatalogRecord,
  type PluginCatalogStatus,
  type PluginManifest,
  type TenantScope,
  type TestRunTrace,
  type TestLabCase,
  type TestSuiteCloneInput,
  type TestSuiteCreateInput,
  type TestSuiteId,
  type TestSuiteRecord,
  type TestSuiteRunRecord
} from '@cvg/platform'
import type { PostgresQueryable } from './postgres.ts'

export class PostgresControlPlaneRepository implements ControlPlaneStore {
  constructor(private readonly client: PostgresQueryable) {}

  async createAgent(
    rawScope: TenantScope,
    rawInput: AgentCreateInput
  ): Promise<AgentRecord> {
    const scope = parseScope(rawScope)
    const input = AgentCreateInputSchema.parse(rawInput)
    const now = new Date()
    const agent: AgentRecord = {
      tenantId: scope.tenantId,
      id: createAgentId(),
      slug: input.slug,
      name: input.name,
      description: input.description,
      activeVersionId: null,
      createdAt: now,
      updatedAt: now
    }
    await this.client.query(
      `INSERT INTO platform_agents
       (tenant_id, id, slug, name, description, active_version_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        agent.tenantId,
        agent.id,
        agent.slug,
        agent.name,
        agent.description,
        agent.activeVersionId,
        agent.createdAt,
        agent.updatedAt
      ]
    )
    return cloneAgent(agent)
  }

  async getAgent(
    rawScope: TenantScope,
    rawAgentId: AgentId
  ): Promise<AgentRecord | null> {
    const scope = parseScope(rawScope)
    const agentId = AgentIdSchema.parse(rawAgentId)
    const result = await this.client.query<AgentRow>(
      `SELECT tenant_id, id, slug, name, description, active_version_id, created_at, updated_at
       FROM platform_agents
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [scope.tenantId, agentId]
    )
    const row = result.rows[0]
    return row ? mapAgent(row) : null
  }

  async listAgents(rawScope: TenantScope): Promise<AgentRecord[]> {
    const scope = parseScope(rawScope)
    const result = await this.client.query<AgentRow>(
      `SELECT tenant_id, id, slug, name, description, active_version_id, created_at, updated_at
       FROM platform_agents
       WHERE tenant_id = $1
       ORDER BY created_at ASC, id ASC`,
      [scope.tenantId]
    )
    return result.rows.map(mapAgent)
  }

  async createVersion(
    rawScope: TenantScope,
    rawAgentId: AgentId,
    rawConfig: AgentConfig,
    createdBy: string
  ): Promise<AgentVersionRecord> {
    const scope = parseScope(rawScope)
    const agentId = AgentIdSchema.parse(rawAgentId)
    const config = AgentConfigSchema.parse(rawConfig)
    assertPromptProfileIntegrity(config)
    const agent = await this.getAgent(scope, agentId)
    if (!agent) throw new DomainError('invalid_action', 'Agent not found')
    const actor = validateActor(createdBy)
    const id = createAgentVersionId()
    const now = new Date()

    await this.client.query('BEGIN')
    try {
      const lockedAgent = await this.client.query<{ id: string }>(
        `SELECT id
         FROM platform_agents
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         FOR UPDATE`,
        [scope.tenantId, agentId]
      )
      if (!lockedAgent.rows[0]) {
        throw new DomainError('invalid_action', 'Agent not found')
      }
      const latest = await this.client.query<{ version: number }>(
        `SELECT version
         FROM platform_agent_versions
         WHERE tenant_id = $1 AND agent_id = $2
         ORDER BY version DESC
         LIMIT 1
         FOR UPDATE`,
        [scope.tenantId, agentId]
      )
      const versionNumber = Number(latest.rows[0]?.version ?? 0) + 1
      const version: AgentVersionRecord = {
        tenantId: scope.tenantId,
        id,
        agentId,
        version: versionNumber,
        status: 'DRAFT',
        config: structuredClone(config),
        createdBy: actor,
        createdAt: now,
        publishedAt: null
      }
      await this.client.query(
        `INSERT INTO platform_agent_versions
         (tenant_id, id, agent_id, version, status, config, created_by, created_at, published_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
        [
          version.tenantId,
          version.id,
          version.agentId,
          version.version,
          version.status,
          JSON.stringify(version.config),
          version.createdBy,
          version.createdAt,
          version.publishedAt
        ]
      )
      await this.client.query('COMMIT')
      return cloneVersion(version)
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async getVersion(
    rawScope: TenantScope,
    rawVersionId: AgentVersionId
  ): Promise<AgentVersionRecord | null> {
    const scope = parseScope(rawScope)
    const versionId = AgentVersionIdSchema.parse(rawVersionId)
    const result = await this.client.query<AgentVersionRow>(
      `SELECT tenant_id, id, agent_id, version, status, config, created_by, created_at, published_at
       FROM platform_agent_versions
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [scope.tenantId, versionId]
    )
    const row = result.rows[0]
    return row ? mapVersion(row) : null
  }

  async listVersions(
    rawScope: TenantScope,
    rawAgentId: AgentId
  ): Promise<AgentVersionRecord[]> {
    const scope = parseScope(rawScope)
    const agentId = AgentIdSchema.parse(rawAgentId)
    const agent = await this.getAgent(scope, agentId)
    if (!agent) throw new DomainError('invalid_action', 'Agent not found')
    const result = await this.client.query<AgentVersionRow>(
      `SELECT tenant_id, id, agent_id, version, status, config, created_by, created_at, published_at
       FROM platform_agent_versions
       WHERE tenant_id = $1 AND agent_id = $2
       ORDER BY version DESC`,
      [scope.tenantId, agentId]
    )
    return result.rows.map(mapVersion)
  }

  async transitionVersion(
    rawScope: TenantScope,
    rawVersionId: AgentVersionId,
    rawTarget: AgentVersionStatus,
    rawExpectedStatus?: AgentVersionStatus
  ): Promise<AgentVersionRecord> {
    const scope = parseScope(rawScope)
    const versionId = AgentVersionIdSchema.parse(rawVersionId)
    const target = AgentVersionStatusSchema.parse(rawTarget)
    const expectedStatus = rawExpectedStatus
      ? AgentVersionStatusSchema.parse(rawExpectedStatus)
      : undefined
    await this.client.query('BEGIN')
    try {
      const currentResult = await this.client.query<AgentVersionRow>(
        `SELECT tenant_id, id, agent_id, version, status, config, created_by, created_at, published_at
         FROM platform_agent_versions
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1`,
        [scope.tenantId, versionId]
      )
      const currentRow = currentResult.rows[0]
      if (!currentRow) {
        throw new DomainError('invalid_action', 'Agent version not found')
      }
      const current = mapVersion(currentRow)
      assertExpectedStatus(current.status, expectedStatus)
      if (!canTransition(current.status, target)) {
        throw new DomainError(
          'invalid_action',
          `Version cannot transition from ${current.status} to ${target}`
        )
      }
      const result = await this.client.query<AgentVersionRow>(
        `UPDATE platform_agent_versions
         SET status = $3
         WHERE tenant_id = $1 AND id = $2 AND status = $4
         RETURNING tenant_id, id, agent_id, version, status, config, created_by, created_at, published_at`,
        [scope.tenantId, versionId, target, current.status]
      )
      const row = result.rows[0]
      if (!row) {
        throw new DomainError(
          'invalid_action',
          'Version changed before transition could be committed'
        )
      }
      await this.client.query('COMMIT')
      return mapVersion(row)
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async publishVersion(
    rawScope: TenantScope,
    rawVersionId: AgentVersionId,
    rawReleaseCandidateId: ReleaseCandidateId,
    rawExpectedStatus?: AgentVersionStatus
  ): Promise<AgentVersionRecord> {
    const scope = parseScope(rawScope)
    const versionId = AgentVersionIdSchema.parse(rawVersionId)
    const expectedStatus = rawExpectedStatus
      ? AgentVersionStatusSchema.parse(rawExpectedStatus)
      : undefined
    await this.client.query('BEGIN')
    try {
      const versionIdentity = await this.client.query<{ agent_id: string }>(
        `SELECT agent_id
         FROM platform_agent_versions
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         FOR UPDATE`,
        [scope.tenantId, versionId]
      )
      const agentId = versionIdentity.rows[0]?.agent_id
      const lockedAgent = agentId
        ? await this.client.query<{ id: string }>(
            `SELECT id
             FROM platform_agents
             WHERE tenant_id = $1 AND id = $2
             LIMIT 1
             FOR UPDATE`,
            [scope.tenantId, agentId]
          )
        : null
      if (!lockedAgent?.rows[0]) {
        throw new DomainError('invalid_action', 'Agent version not found')
      }
      const currentResult = await this.client.query<AgentVersionRow>(
        `SELECT tenant_id, id, agent_id, version, status, config, created_by, created_at, published_at
         FROM platform_agent_versions
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         FOR UPDATE`,
        [scope.tenantId, versionId]
      )
      const currentRow = currentResult.rows[0]
      if (!currentRow) {
        throw new DomainError('invalid_action', 'Agent version not found')
      }
      const current = mapVersion(currentRow)
      await this.requireReleaseCandidateAuthority(
        scope,
        rawReleaseCandidateId,
        current.agentId,
        current.id
      )
      assertExpectedStatus(current.status, expectedStatus)
      if (current.status !== 'APPROVED') {
        throw new DomainError(
          'invalid_action',
          'Only an approved version can be published'
        )
      }
      const now = new Date()
      await this.client.query(
        `UPDATE platform_agent_versions
         SET status = 'ARCHIVED'
         WHERE tenant_id = $1 AND agent_id = $2 AND status = 'PUBLISHED' AND id <> $3`,
        [scope.tenantId, current.agentId, versionId]
      )
      await this.client.query(
        `UPDATE platform_agent_versions
         SET status = 'PUBLISHED', published_at = $3
         WHERE tenant_id = $1 AND id = $2`,
        [scope.tenantId, versionId, now]
      )
      await this.client.query(
        `UPDATE platform_agents
         SET active_version_id = $3, updated_at = $4
         WHERE tenant_id = $1 AND id = $2`,
        [scope.tenantId, current.agentId, versionId, now]
      )
      await this.client.query('COMMIT')
      return {
        ...current,
        status: 'PUBLISHED',
        publishedAt: now,
        config: structuredClone(current.config)
      }
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async rollback(
    rawScope: TenantScope,
    rawAgentId: AgentId,
    rawVersionId: AgentVersionId,
    createdBy: string,
    rawReleaseCandidateId: ReleaseCandidateId,
    rawExpectedStatus?: AgentVersionStatus
  ): Promise<AgentVersionRecord> {
    const scope = parseScope(rawScope)
    const agentId = AgentIdSchema.parse(rawAgentId)
    const versionId = AgentVersionIdSchema.parse(rawVersionId)
    const actor = validateActor(createdBy)
    const expectedStatus = rawExpectedStatus
      ? AgentVersionStatusSchema.parse(rawExpectedStatus)
      : undefined
    await this.client.query('BEGIN')
    try {
      const lockedAgentResult = await this.client.query<AgentRow>(
        `SELECT tenant_id, id, slug, name, description, active_version_id, created_at, updated_at
         FROM platform_agents
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         FOR UPDATE`,
        [scope.tenantId, agentId]
      )
      if (!lockedAgentResult.rows[0]) {
        throw new DomainError('invalid_action', 'Agent not found')
      }
      const targetResult = await this.client.query<AgentVersionRow>(
        `SELECT tenant_id, id, agent_id, version, status, config, created_by, created_at, published_at
         FROM platform_agent_versions
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         FOR UPDATE`,
        [scope.tenantId, versionId]
      )
      const targetRow = targetResult.rows[0]
      if (!targetRow) {
        throw new DomainError(
          'invalid_action',
          'Version does not belong to agent'
        )
      }
      const target = mapVersion(targetRow)
      assertExpectedStatus(target.status, expectedStatus)
      if (target.agentId !== agentId) {
        throw new DomainError(
          'invalid_action',
          'Version does not belong to agent'
        )
      }
      if (target.status === 'DRAFT' || target.status === 'TESTING') {
        throw new DomainError(
          'invalid_action',
          'Only reviewed versions can rollback'
        )
      }
      await this.requireReleaseCandidateAuthority(
        scope,
        rawReleaseCandidateId,
        agentId,
        target.id
      )
      const latest = await this.client.query<{ version: number }>(
        `SELECT version
         FROM platform_agent_versions
         WHERE tenant_id = $1 AND agent_id = $2
         ORDER BY version DESC
         LIMIT 1`,
        [scope.tenantId, agentId]
      )
      const now = new Date()
      const draft: AgentVersionRecord = {
        tenantId: scope.tenantId,
        id: createAgentVersionId(),
        agentId,
        version: Number(latest.rows[0]?.version ?? 0) + 1,
        status: 'DRAFT',
        config: structuredClone(target.config),
        createdBy: actor,
        createdAt: now,
        publishedAt: null
      }
      await this.client.query(
        `INSERT INTO platform_agent_versions
         (tenant_id, id, agent_id, version, status, config, created_by, created_at, published_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
        [
          draft.tenantId,
          draft.id,
          draft.agentId,
          draft.version,
          draft.status,
          JSON.stringify(draft.config),
          draft.createdBy,
          draft.createdAt,
          draft.publishedAt
        ]
      )
      const testingResult = await this.client.query<AgentVersionRow>(
        `UPDATE platform_agent_versions
         SET status = $3
         WHERE tenant_id = $1 AND id = $2 AND status = $4
         RETURNING tenant_id, id, agent_id, version, status, config, created_by, created_at, published_at`,
        [scope.tenantId, draft.id, 'TESTING', 'DRAFT']
      )
      if (!testingResult.rows[0]) {
        throw new DomainError(
          'invalid_action',
          'Rollback draft transition failed'
        )
      }
      const approvedResult = await this.client.query<AgentVersionRow>(
        `UPDATE platform_agent_versions
         SET status = $3
         WHERE tenant_id = $1 AND id = $2 AND status = $4
         RETURNING tenant_id, id, agent_id, version, status, config, created_by, created_at, published_at`,
        [scope.tenantId, draft.id, 'APPROVED', 'TESTING']
      )
      const approvedRow = approvedResult.rows[0]
      if (!approvedRow) {
        throw new DomainError(
          'invalid_action',
          'Rollback approval transition failed'
        )
      }
      const approved = mapVersion(approvedRow)
      await this.client.query(
        `UPDATE platform_agent_versions
         SET status = 'ARCHIVED'
         WHERE tenant_id = $1 AND agent_id = $2 AND status = 'PUBLISHED' AND id <> $3`,
        [scope.tenantId, agentId, approved.id]
      )
      await this.client.query(
        `UPDATE platform_agent_versions
         SET status = 'PUBLISHED', published_at = $3
         WHERE tenant_id = $1 AND id = $2`,
        [scope.tenantId, approved.id, now]
      )
      await this.client.query(
        `UPDATE platform_agents
         SET active_version_id = $3, updated_at = $4
         WHERE tenant_id = $1 AND id = $2`,
        [scope.tenantId, agentId, approved.id, now]
      )
      await this.client.query('COMMIT')
      return {
        ...approved,
        status: 'PUBLISHED',
        publishedAt: now,
        config: structuredClone(approved.config)
      }
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  private async requireReleaseCandidateAuthority(
    scope: TenantScope,
    rawCandidateId: ReleaseCandidateId,
    agentId: AgentId,
    versionId: AgentVersionId
  ): Promise<ReleaseCandidateRecord> {
    const candidateId = parseRequiredReleaseCandidateId(rawCandidateId)
    const result = await this.client.query<ReleaseCandidateRow>(
      `SELECT tenant_id, id, agent_id, version_id, evidence_digest,
              gate_results, status, created_by, validated_by, created_at,
              updated_at, validated_at
       FROM platform_release_candidates
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1
       FOR UPDATE`,
      [scope.tenantId, candidateId]
    )
    const row = result.rows[0]
    if (!row) {
      throw new DomainError(
        'invalid_action',
        'Validated release candidate evidence is required'
      )
    }
    return assertReleaseCandidatePublishAuthority({
      candidate: mapReleaseCandidate(row),
      tenantId: scope.tenantId,
      agentId,
      versionId
    })
  }

  async resolvePublished(
    rawScope: TenantScope,
    rawAgentId: AgentId
  ): Promise<AgentVersionRecord | null> {
    const scope = parseScope(rawScope)
    const agentId = AgentIdSchema.parse(rawAgentId)
    const agent = await this.getAgent(scope, agentId)
    if (!agent?.activeVersionId) return null
    const version = await this.getVersion(scope, agent.activeVersionId)
    return version?.status === 'PUBLISHED' ? version : null
  }

  async createKnowledgeSource(
    rawScope: TenantScope,
    rawInput: KnowledgeSourceCreateInput,
    createdBy: string
  ): Promise<KnowledgeSourceRecord> {
    const scope = parseScope(rawScope)
    const input = KnowledgeSourceCreateInputSchema.parse(rawInput)
    const actor = validateActor(createdBy)
    const existing = await this.client.query<{ id: string }>(
      `SELECT id
       FROM platform_knowledge_sources
       WHERE tenant_id = $1 AND source = $2 AND version = $3
       LIMIT 1`,
      [scope.tenantId, input.source, input.version]
    )
    if (existing.rows[0]) {
      throw new DomainError(
        'invalid_action',
        'Knowledge source/version already exists'
      )
    }
    const now = new Date()
    const entry: KnowledgeSourceRecord = {
      tenantId: scope.tenantId,
      id: createKnowledgeSourceId(),
      source: input.source,
      version: input.version,
      label: input.label,
      description: input.description,
      status: 'DRAFT',
      createdBy: actor,
      approvedBy: null,
      createdAt: now,
      updatedAt: now
    }
    try {
      await this.client.query(
        `INSERT INTO platform_knowledge_sources
         (tenant_id, id, source, version, label, description, status,
          created_by, approved_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          entry.tenantId,
          entry.id,
          entry.source,
          entry.version,
          entry.label,
          entry.description,
          entry.status,
          entry.createdBy,
          entry.approvedBy,
          entry.createdAt,
          entry.updatedAt
        ]
      )
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError(
          'invalid_action',
          'Knowledge source/version already exists'
        )
      }
      throw error
    }
    return cloneKnowledgeSourceRecord(entry)
  }

  async getKnowledgeSource(
    rawScope: TenantScope,
    rawSourceId: KnowledgeSourceId
  ): Promise<KnowledgeSourceRecord | null> {
    const scope = parseScope(rawScope)
    const sourceId = KnowledgeSourceIdSchema.parse(rawSourceId)
    const result = await this.client.query<KnowledgeSourceRow>(
      `SELECT tenant_id, id, source, version, label, description, status,
              created_by, approved_by, created_at, updated_at
       FROM platform_knowledge_sources
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [scope.tenantId, sourceId]
    )
    const row = result.rows[0]
    return row ? mapKnowledgeSource(row) : null
  }

  async listKnowledgeSources(
    rawScope: TenantScope
  ): Promise<KnowledgeSourceRecord[]> {
    const scope = parseScope(rawScope)
    const result = await this.client.query<KnowledgeSourceRow>(
      `SELECT tenant_id, id, source, version, label, description, status,
              created_by, approved_by, created_at, updated_at
       FROM platform_knowledge_sources
       WHERE tenant_id = $1
       ORDER BY updated_at DESC, id DESC`,
      [scope.tenantId]
    )
    return result.rows.map(mapKnowledgeSource)
  }

  async transitionKnowledgeSource(
    rawScope: TenantScope,
    rawSourceId: KnowledgeSourceId,
    rawTarget: KnowledgeSourceStatus,
    actorId: string,
    rawExpectedStatus?: KnowledgeSourceStatus
  ): Promise<KnowledgeSourceRecord> {
    const scope = parseScope(rawScope)
    const sourceId = KnowledgeSourceIdSchema.parse(rawSourceId)
    const target = KnowledgeSourceStatusSchema.parse(rawTarget)
    const expectedStatus = rawExpectedStatus
      ? KnowledgeSourceStatusSchema.parse(rawExpectedStatus)
      : undefined
    const actor = validateActor(actorId)
    await this.client.query('BEGIN')
    try {
      const currentResult = await this.client.query<KnowledgeSourceRow>(
        `SELECT tenant_id, id, source, version, label, description, status,
                created_by, approved_by, created_at, updated_at
         FROM platform_knowledge_sources
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         FOR UPDATE`,
        [scope.tenantId, sourceId]
      )
      const currentRow = currentResult.rows[0]
      if (!currentRow) {
        throw new DomainError('invalid_action', 'Knowledge source not found')
      }
      const current = mapKnowledgeSource(currentRow)
      assertKnowledgeSourceExpectedStatus(current.status, expectedStatus)
      if (!canTransitionKnowledgeSource(current.status, target)) {
        throw new DomainError(
          'invalid_action',
          `Knowledge source cannot transition from ${current.status} to ${target}`
        )
      }
      const approvedBy = target === 'APPROVED' ? actor : current.approvedBy
      const now = new Date()
      const updatedResult = await this.client.query<KnowledgeSourceRow>(
        `UPDATE platform_knowledge_sources
         SET status = $3, approved_by = $4, updated_at = $5
         WHERE tenant_id = $1 AND id = $2 AND status = $6
         RETURNING tenant_id, id, source, version, label, description, status,
                   created_by, approved_by, created_at, updated_at`,
        [scope.tenantId, sourceId, target, approvedBy, now, current.status]
      )
      const updatedRow = updatedResult.rows[0]
      if (!updatedRow) {
        throw new DomainError(
          'conflict',
          'Knowledge source changed before transition could be committed'
        )
      }
      await this.client.query('COMMIT')
      return mapKnowledgeSource(updatedRow)
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async createReleaseCandidate(
    rawScope: TenantScope,
    rawInput: ReleaseCandidateCreateInput,
    createdBy: string
  ): Promise<ReleaseCandidateRecord> {
    const scope = parseScope(rawScope)
    const input = ReleaseCandidateCreateInputSchema.parse(rawInput)
    const agent = await this.getAgent(scope, input.agentId)
    if (!agent) throw new DomainError('invalid_action', 'Agent not found')
    const version = await this.getVersion(scope, input.versionId)
    if (!version || version.agentId !== agent.id) {
      throw new DomainError(
        'invalid_action',
        'Version does not belong to agent'
      )
    }
    const actor = validateActor(createdBy)
    const gateResults = input.gateResults.map((gate) => ({ ...gate }))
    const evidenceDigest = computeReleaseCandidateEvidenceDigest({
      tenantId: scope.tenantId,
      agentId: input.agentId,
      versionId: input.versionId,
      gateResults
    })
    const existing = await this.client.query<{ id: string }>(
      `SELECT id
       FROM platform_release_candidates
       WHERE tenant_id = $1 AND agent_id = $2 AND version_id = $3
         AND evidence_digest = $4
       LIMIT 1`,
      [scope.tenantId, input.agentId, input.versionId, evidenceDigest]
    )
    if (existing.rows[0]) {
      throw new DomainError(
        'invalid_action',
        'Release candidate evidence already exists'
      )
    }
    const now = new Date()
    const candidate: ReleaseCandidateRecord = {
      tenantId: scope.tenantId,
      id: createReleaseCandidateId(),
      agentId: input.agentId,
      versionId: input.versionId,
      evidenceDigest,
      gateResults,
      status: 'DRAFT',
      createdBy: actor,
      validatedBy: null,
      createdAt: now,
      updatedAt: now,
      validatedAt: null
    }
    try {
      await this.client.query(
        `INSERT INTO platform_release_candidates
         (tenant_id, id, agent_id, version_id, evidence_digest, gate_results,
          status, created_by, validated_by, created_at, updated_at, validated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)`,
        [
          candidate.tenantId,
          candidate.id,
          candidate.agentId,
          candidate.versionId,
          candidate.evidenceDigest,
          JSON.stringify(candidate.gateResults),
          candidate.status,
          candidate.createdBy,
          candidate.validatedBy,
          candidate.createdAt,
          candidate.updatedAt,
          candidate.validatedAt
        ]
      )
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError(
          'invalid_action',
          'Release candidate evidence already exists'
        )
      }
      throw error
    }
    return cloneReleaseCandidateRecord(candidate)
  }

  async getReleaseCandidate(
    rawScope: TenantScope,
    rawCandidateId: ReleaseCandidateId
  ): Promise<ReleaseCandidateRecord | null> {
    const scope = parseScope(rawScope)
    const candidateId = ReleaseCandidateIdSchema.parse(rawCandidateId)
    const result = await this.client.query<ReleaseCandidateRow>(
      `SELECT tenant_id, id, agent_id, version_id, evidence_digest,
              gate_results, status, created_by, validated_by, created_at,
              updated_at, validated_at
       FROM platform_release_candidates
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [scope.tenantId, candidateId]
    )
    const row = result.rows[0]
    return row ? mapReleaseCandidate(row) : null
  }

  async listReleaseCandidates(
    rawScope: TenantScope,
    rawAgentId?: AgentId
  ): Promise<ReleaseCandidateRecord[]> {
    const scope = parseScope(rawScope)
    const agentId = rawAgentId ? AgentIdSchema.parse(rawAgentId) : undefined
    const result = await this.client.query<ReleaseCandidateRow>(
      `SELECT tenant_id, id, agent_id, version_id, evidence_digest,
              gate_results, status, created_by, validated_by, created_at,
              updated_at, validated_at
       FROM platform_release_candidates
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR agent_id = $2)
       ORDER BY updated_at DESC, id DESC`,
      [scope.tenantId, agentId ?? null]
    )
    return result.rows.map(mapReleaseCandidate)
  }

  async transitionReleaseCandidate(
    rawScope: TenantScope,
    rawCandidateId: ReleaseCandidateId,
    rawTarget: ReleaseCandidateStatus,
    actorId: string,
    rawExpectedStatus?: ReleaseCandidateStatus
  ): Promise<ReleaseCandidateRecord> {
    const scope = parseScope(rawScope)
    const candidateId = ReleaseCandidateIdSchema.parse(rawCandidateId)
    const target = ReleaseCandidateStatusSchema.parse(rawTarget)
    const expectedStatus = rawExpectedStatus
      ? ReleaseCandidateStatusSchema.parse(rawExpectedStatus)
      : undefined
    const actor = validateActor(actorId)
    await this.client.query('BEGIN')
    try {
      const currentResult = await this.client.query<ReleaseCandidateRow>(
        `SELECT tenant_id, id, agent_id, version_id, evidence_digest,
                gate_results, status, created_by, validated_by, created_at,
                updated_at, validated_at
         FROM platform_release_candidates
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         FOR UPDATE`,
        [scope.tenantId, candidateId]
      )
      const currentRow = currentResult.rows[0]
      if (!currentRow) {
        throw new DomainError('invalid_action', 'Release candidate not found')
      }
      const current = mapReleaseCandidate(currentRow)
      assertReleaseCandidateExpectedStatus(current.status, expectedStatus)
      if (!canTransitionReleaseCandidate(current.status, target)) {
        throw new DomainError(
          'invalid_action',
          `Release candidate cannot transition from ${current.status} to ${target}`
        )
      }
      if (target === 'VALIDATED') {
        assertReleaseCandidateIndependentValidator(current, actor)
        assertReleaseCandidateEvidenceIntegrity(current)
      }
      const now = new Date()
      const validatedBy = target === 'VALIDATED' ? actor : current.validatedBy
      const validatedAt = target === 'VALIDATED' ? now : current.validatedAt
      const updatedResult = await this.client.query<ReleaseCandidateRow>(
        `UPDATE platform_release_candidates
         SET status = $3, validated_by = $4, validated_at = $5, updated_at = $6
         WHERE tenant_id = $1 AND id = $2 AND status = $7
         RETURNING tenant_id, id, agent_id, version_id, evidence_digest,
                   gate_results, status, created_by, validated_by, created_at,
                   updated_at, validated_at`,
        [
          scope.tenantId,
          candidateId,
          target,
          validatedBy,
          validatedAt,
          now,
          current.status
        ]
      )
      const updatedRow = updatedResult.rows[0]
      if (!updatedRow) {
        throw new DomainError(
          'conflict',
          'Release candidate changed before transition could be committed'
        )
      }
      await this.client.query('COMMIT')
      return mapReleaseCandidate(updatedRow)
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async createPluginCatalogEntry(
    rawScope: TenantScope,
    rawInput: PluginCatalogCreateInput,
    createdBy: string
  ): Promise<PluginCatalogRecord> {
    const scope = parseScope(rawScope)
    const input = PluginCatalogCreateInputSchema.parse(rawInput)
    const actor = validateActor(createdBy)
    const existing = await this.client.query<{ id: string }>(
      `SELECT id
       FROM platform_plugin_catalog
       WHERE tenant_id = $1 AND name = $2 AND version = $3
       LIMIT 1`,
      [scope.tenantId, input.manifest.name, input.manifest.version]
    )
    if (existing.rows[0]) {
      throw new DomainError(
        'invalid_action',
        'Plugin manifest name/version already exists'
      )
    }
    const now = new Date()
    const entry: PluginCatalogRecord = {
      tenantId: scope.tenantId,
      id: createPluginCatalogId(),
      manifest: structuredClone(input.manifest),
      status: 'DRAFT',
      createdBy: actor,
      approvedBy: null,
      createdAt: now,
      updatedAt: now
    }
    try {
      await this.client.query(
        `INSERT INTO platform_plugin_catalog
         (tenant_id, id, name, version, manifest, status, created_by,
          approved_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)`,
        [
          entry.tenantId,
          entry.id,
          entry.manifest.name,
          entry.manifest.version,
          JSON.stringify(entry.manifest),
          entry.status,
          entry.createdBy,
          entry.approvedBy,
          entry.createdAt,
          entry.updatedAt
        ]
      )
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError(
          'invalid_action',
          'Plugin manifest name/version already exists'
        )
      }
      throw error
    }
    return clonePluginCatalogRecord(entry)
  }

  async getPluginCatalogEntry(
    rawScope: TenantScope,
    rawPluginId: PluginCatalogId
  ): Promise<PluginCatalogRecord | null> {
    const scope = parseScope(rawScope)
    const pluginId = PluginCatalogIdSchema.parse(rawPluginId)
    const result = await this.client.query<PluginCatalogRow>(
      `SELECT tenant_id, id, name, version, manifest, status, created_by,
              approved_by, created_at, updated_at
       FROM platform_plugin_catalog
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [scope.tenantId, pluginId]
    )
    const row = result.rows[0]
    return row ? mapPluginCatalog(row) : null
  }

  async listPluginCatalogEntries(
    rawScope: TenantScope,
    rawName?: string
  ): Promise<PluginCatalogRecord[]> {
    const scope = parseScope(rawScope)
    const name = rawName?.trim()
    if (name !== undefined && name.length === 0) {
      throw new DomainError('validation_failed', 'Plugin name is invalid')
    }
    const result = await this.client.query<PluginCatalogRow>(
      `SELECT tenant_id, id, name, version, manifest, status, created_by,
              approved_by, created_at, updated_at
       FROM platform_plugin_catalog
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR name = $2)
       ORDER BY updated_at DESC, id DESC`,
      [scope.tenantId, name ?? null]
    )
    return result.rows.map(mapPluginCatalog)
  }

  async transitionPluginCatalogEntry(
    rawScope: TenantScope,
    rawPluginId: PluginCatalogId,
    rawTarget: PluginCatalogStatus,
    actorId: string,
    rawExpectedStatus?: PluginCatalogStatus
  ): Promise<PluginCatalogRecord> {
    const scope = parseScope(rawScope)
    const pluginId = PluginCatalogIdSchema.parse(rawPluginId)
    const target = PluginCatalogStatusSchema.parse(rawTarget)
    const expectedStatus = rawExpectedStatus
      ? PluginCatalogStatusSchema.parse(rawExpectedStatus)
      : undefined
    const actor = validateActor(actorId)
    await this.client.query('BEGIN')
    try {
      const currentResult = await this.client.query<PluginCatalogRow>(
        `SELECT tenant_id, id, name, version, manifest, status, created_by,
                approved_by, created_at, updated_at
         FROM platform_plugin_catalog
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         FOR UPDATE`,
        [scope.tenantId, pluginId]
      )
      const currentRow = currentResult.rows[0]
      if (!currentRow) {
        throw new DomainError(
          'invalid_action',
          'Plugin catalog entry not found'
        )
      }
      const current = mapPluginCatalog(currentRow)
      assertPluginCatalogExpectedStatus(current.status, expectedStatus)
      if (!canTransitionPluginCatalog(current.status, target)) {
        throw new DomainError(
          'invalid_action',
          `Plugin catalog entry cannot transition from ${current.status} to ${target}`
        )
      }
      const approvedBy = target === 'APPROVED' ? actor : current.approvedBy
      const now = new Date()
      const updatedResult = await this.client.query<PluginCatalogRow>(
        `UPDATE platform_plugin_catalog
         SET status = $3, approved_by = $4, updated_at = $5
         WHERE tenant_id = $1 AND id = $2 AND status = $6
         RETURNING tenant_id, id, name, version, manifest, status, created_by,
                   approved_by, created_at, updated_at`,
        [scope.tenantId, pluginId, target, approvedBy, now, current.status]
      )
      const updatedRow = updatedResult.rows[0]
      if (!updatedRow) {
        throw new DomainError(
          'conflict',
          'Plugin catalog entry changed before transition could be committed'
        )
      }
      await this.client.query('COMMIT')
      return mapPluginCatalog(updatedRow)
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async resolveApprovedPlugin(
    rawScope: TenantScope,
    name: string,
    version?: string
  ): Promise<PluginManifest | null> {
    const entries = await this.listPluginCatalogEntries(rawScope, name)
    const approved = entries
      .filter(
        (entry) =>
          entry.status === 'APPROVED' &&
          (version === undefined || entry.manifest.version === version)
      )
      .sort((left, right) =>
        comparePluginVersions(right.manifest.version, left.manifest.version)
      )[0]
    return approved ? structuredClone(approved.manifest) : null
  }

  async recordTestRun(
    rawScope: TenantScope,
    trace: TestRunTrace
  ): Promise<TestRunTrace> {
    const scope = parseScope(rawScope)
    const sanitizedTrace = sanitizeTraceForPersistence(trace)
    if (sanitizedTrace.tenantId !== scope.tenantId) {
      throw new DomainError('forbidden', 'Trace tenant does not match scope')
    }
    await this.assertTraceReferences(scope, sanitizedTrace)
    const storedTrace = cloneTrace(sanitizedTrace)
    await this.client.query(
      `INSERT INTO platform_test_runs
       (tenant_id, trace_id, agent_id, version_id, trace, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        sanitizedTrace.tenantId,
        sanitizedTrace.traceId,
        sanitizedTrace.agentId,
        sanitizedTrace.versionId,
        JSON.stringify(storedTrace),
        storedTrace.createdAt
      ]
    )
    return cloneTrace(storedTrace)
  }

  async listTestRuns(
    rawScope: TenantScope,
    limit = 50
  ): Promise<TestRunTrace[]> {
    const scope = parseScope(rawScope)
    const result = await this.client.query<PersistedTraceRow>(
      `SELECT tenant_id, trace_id, agent_id, version_id, trace, created_at
       FROM platform_test_runs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [scope.tenantId, normalizeTraceLimit(limit)]
    )
    return result.rows.map((row) =>
      cloneTrace(
        assertReadTraceTenant(scope.tenantId, row.trace, {
          tenantId: row.tenant_id,
          traceId: row.trace_id,
          agentId: row.agent_id,
          versionId: row.version_id,
          createdAt: row.created_at
        })
      )
    )
  }

  async recordExecutionTrace(
    rawScope: TenantScope,
    trace: TestRunTrace
  ): Promise<TestRunTrace> {
    const scope = parseScope(rawScope)
    const sanitizedTrace = sanitizeTraceForPersistence(trace)
    if (sanitizedTrace.tenantId !== scope.tenantId) {
      throw new DomainError('forbidden', 'Trace tenant does not match scope')
    }
    await this.assertTraceReferences(scope, sanitizedTrace)
    const storedTrace = cloneTrace(sanitizedTrace)
    await this.client.query(
      `INSERT INTO platform_execution_traces
       (tenant_id, trace_id, agent_id, version_id, trace, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        sanitizedTrace.tenantId,
        sanitizedTrace.traceId,
        sanitizedTrace.agentId,
        sanitizedTrace.versionId,
        JSON.stringify(storedTrace),
        storedTrace.createdAt
      ]
    )
    return cloneTrace(storedTrace)
  }

  async listExecutionTraces(
    rawScope: TenantScope,
    limit = 50
  ): Promise<TestRunTrace[]> {
    const scope = parseScope(rawScope)
    const result = await this.client.query<PersistedTraceRow>(
      `SELECT tenant_id, trace_id, agent_id, version_id, trace, created_at
       FROM platform_execution_traces
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [scope.tenantId, normalizeTraceLimit(limit)]
    )
    return result.rows.map((row) =>
      cloneTrace(
        assertReadTraceTenant(scope.tenantId, row.trace, {
          tenantId: row.tenant_id,
          traceId: row.trace_id,
          agentId: row.agent_id,
          versionId: row.version_id,
          createdAt: row.created_at
        })
      )
    )
  }

  async createTestSuite(
    rawScope: TenantScope,
    rawInput: TestSuiteCreateInput,
    createdBy: string
  ): Promise<TestSuiteRecord> {
    const scope = parseScope(rawScope)
    const input = TestSuiteCreateInputSchema.parse(rawInput)
    const agent = await this.getAgent(scope, input.agentId)
    const version = await this.getVersion(scope, input.versionId)
    if (!agent || !version || version.agentId !== agent.id) {
      throw new DomainError(
        'invalid_action',
        'Test suite agent/version is invalid'
      )
    }
    const existing = await this.client.query<{ id: string }>(
      `SELECT id FROM platform_test_suites
       WHERE tenant_id = $1 AND slug = $2
       LIMIT 1`,
      [scope.tenantId, input.slug]
    )
    if (existing.rows[0]) {
      throw new DomainError('invalid_action', 'Test suite slug already exists')
    }
    const now = new Date()
    const suite: TestSuiteRecord = {
      tenantId: scope.tenantId,
      id: createTestSuiteId(),
      slug: input.slug,
      name: input.name,
      description: input.description,
      agentId: agent.id,
      versionId: version.id,
      version: 1,
      cases: input.cases.map(sanitizeTestCase),
      previousSuiteId: null,
      createdBy: validateActor(createdBy),
      createdAt: now,
      updatedAt: now
    }
    await this.client.query(
      `INSERT INTO platform_test_suites
       (tenant_id, id, slug, name, description, agent_id, version_id, version,
        cases, previous_suite_id, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)`,
      [
        suite.tenantId,
        suite.id,
        suite.slug,
        suite.name,
        suite.description,
        suite.agentId,
        suite.versionId,
        suite.version,
        JSON.stringify(suite.cases),
        suite.previousSuiteId,
        suite.createdBy,
        suite.createdAt,
        suite.updatedAt
      ]
    )
    return cloneTestSuite(suite)
  }

  async getTestSuite(
    rawScope: TenantScope,
    rawSuiteId: TestSuiteId
  ): Promise<TestSuiteRecord | null> {
    const scope = parseScope(rawScope)
    const suiteId = TestSuiteIdSchema.parse(rawSuiteId)
    const result = await this.client.query<TestSuiteRow>(
      `SELECT tenant_id, id, slug, name, description, agent_id, version_id,
              version, cases, previous_suite_id, created_by, created_at, updated_at
       FROM platform_test_suites
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [scope.tenantId, suiteId]
    )
    const row = result.rows[0]
    return row ? mapTestSuite(row) : null
  }

  async listTestSuites(
    rawScope: TenantScope,
    rawAgentId?: AgentId
  ): Promise<TestSuiteRecord[]> {
    const scope = parseScope(rawScope)
    const agentId = rawAgentId ? AgentIdSchema.parse(rawAgentId) : undefined
    if (agentId && !(await this.getAgent(scope, agentId))) {
      throw new DomainError('invalid_action', 'Agent not found')
    }
    const result = await this.client.query<TestSuiteRow>(
      `SELECT tenant_id, id, slug, name, description, agent_id, version_id,
              version, cases, previous_suite_id, created_by, created_at, updated_at
       FROM platform_test_suites
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR agent_id = $2)
       ORDER BY updated_at DESC, id DESC`,
      [scope.tenantId, agentId ?? null]
    )
    return result.rows.map(mapTestSuite)
  }

  async cloneTestSuite(
    rawScope: TenantScope,
    rawSuiteId: TestSuiteId,
    rawInput: TestSuiteCloneInput,
    createdBy: string
  ): Promise<TestSuiteRecord> {
    const scope = parseScope(rawScope)
    const suiteId = TestSuiteIdSchema.parse(rawSuiteId)
    const input = TestSuiteCloneInputSchema.parse(rawInput)
    const source = await this.getTestSuite(scope, suiteId)
    if (!source) throw new DomainError('invalid_action', 'Test suite not found')
    const versionId = input.versionId ?? source.versionId
    const version = await this.getVersion(scope, versionId)
    if (!version || version.agentId !== source.agentId) {
      throw new DomainError('invalid_action', 'Test suite version is invalid')
    }
    const latest = await this.client.query<{ version: number }>(
      `SELECT version FROM platform_test_suites
       WHERE tenant_id = $1 AND slug = $2
       ORDER BY version DESC LIMIT 1`,
      [scope.tenantId, source.slug]
    )
    const now = new Date()
    const clone: TestSuiteRecord = {
      ...source,
      id: createTestSuiteId(),
      name: input.name ?? source.name,
      description: input.description ?? source.description,
      versionId,
      version: Number(latest.rows[0]?.version ?? source.version) + 1,
      cases: (input.cases ?? source.cases).map(sanitizeTestCase),
      previousSuiteId: source.id,
      createdBy: validateActor(createdBy),
      createdAt: now,
      updatedAt: now
    }
    await this.client.query(
      `INSERT INTO platform_test_suites
       (tenant_id, id, slug, name, description, agent_id, version_id, version,
        cases, previous_suite_id, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)`,
      [
        clone.tenantId,
        clone.id,
        clone.slug,
        clone.name,
        clone.description,
        clone.agentId,
        clone.versionId,
        clone.version,
        JSON.stringify(clone.cases),
        clone.previousSuiteId,
        clone.createdBy,
        clone.createdAt,
        clone.updatedAt
      ]
    )
    return cloneTestSuite(clone)
  }

  async recordTestSuiteRun(
    rawScope: TenantScope,
    rawRun: TestSuiteRunRecord
  ): Promise<TestSuiteRunRecord> {
    const scope = parseScope(rawScope)
    const run = cloneTestSuiteRun(sanitizeTestSuiteRunTraces(rawRun))
    TestSuiteRunIdSchema.parse(run.id)
    if (run.tenantId !== scope.tenantId) {
      throw new DomainError(
        'forbidden',
        'Suite run tenant does not match scope'
      )
    }
    const suite = await this.getTestSuite(scope, run.suiteId)
    if (!suite || suite.agentId !== run.agentId) {
      throw new DomainError('invalid_action', 'Test suite run scope is invalid')
    }
    const variantsPassed = run.variants.every((variant) => variant.passed)
    if (
      run.variants.length < 1 ||
      run.variants.length > 2 ||
      new Set(run.variants.map((variant) => variant.label)).size !==
        run.variants.length ||
      run.variants.some(
        (variant) => variant.label !== 'A' && variant.label !== 'B'
      ) ||
      run.passed !== variantsPassed
    ) {
      throw new DomainError(
        'invalid_action',
        'Test suite run variants are invalid'
      )
    }
    for (const variant of run.variants) {
      const version = await this.getVersion(scope, variant.versionId)
      if (!version || version.agentId !== run.agentId) {
        throw new DomainError(
          'invalid_action',
          'Test suite run version is invalid'
        )
      }
      for (const result of variant.results) {
        if (
          result.trace.tenantId !== scope.tenantId ||
          result.trace.agentId !== run.agentId ||
          result.trace.versionId !== variant.versionId
        ) {
          throw new DomainError(
            'invalid_action',
            'Suite trace scope is invalid'
          )
        }
        await this.assertTraceReferences(scope, result.trace)
      }
    }
    await this.client.query(
      `INSERT INTO platform_test_suite_runs
       (tenant_id, id, suite_id, agent_id, result, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        run.tenantId,
        run.id,
        run.suiteId,
        run.agentId,
        JSON.stringify({
          variants: run.variants,
          passed: run.passed
        }),
        run.createdBy,
        run.createdAt
      ]
    )
    return cloneTestSuiteRun(run)
  }

  async listTestSuiteRuns(
    rawScope: TenantScope,
    rawSuiteId: TestSuiteId,
    limit = 50
  ): Promise<TestSuiteRunRecord[]> {
    const scope = parseScope(rawScope)
    const suiteId = TestSuiteIdSchema.parse(rawSuiteId)
    const suite = await this.getTestSuite(scope, suiteId)
    if (!suite) throw new DomainError('invalid_action', 'Test suite not found')
    const result = await this.client.query<TestSuiteRunRow>(
      `SELECT tenant_id, id, suite_id, agent_id, result, created_by, created_at
       FROM platform_test_suite_runs
       WHERE tenant_id = $1 AND suite_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [scope.tenantId, suiteId, normalizeTraceLimit(limit)]
    )
    return result.rows.map((row) => mapTestSuiteRun(row, scope.tenantId))
  }

  private async assertTraceReferences(
    scope: TenantScope,
    trace: TestRunTrace
  ): Promise<void> {
    const agent = await this.getAgent(scope, trace.agentId)
    if (!agent) throw new DomainError('invalid_action', 'Trace agent not found')
    const version = await this.getVersion(scope, trace.versionId)
    if (!version) {
      throw new DomainError('invalid_action', 'Trace version not found')
    }
    if (version.agentId !== agent.id) {
      throw new DomainError(
        'invalid_action',
        'Trace agent and version do not belong together'
      )
    }
  }
}

interface AgentRow {
  tenant_id: string
  id: string
  slug: string
  name: string
  description: string
  active_version_id: string | null
  created_at: Date | string
  updated_at: Date | string
}

interface AgentVersionRow {
  tenant_id: string
  id: string
  agent_id: string
  version: number
  status: AgentVersionStatus
  config: AgentConfig
  created_by: string
  created_at: Date | string
  published_at: Date | string | null
}

interface TestSuiteRow {
  tenant_id: string
  id: string
  slug: string
  name: string
  description: string
  agent_id: string
  version_id: string
  version: number
  cases: unknown
  previous_suite_id: string | null
  created_by: string
  created_at: Date | string
  updated_at: Date | string
}

interface TestSuiteRunRow {
  tenant_id: string
  id: string
  suite_id: string
  agent_id: string
  result: { variants: TestSuiteRunRecord['variants']; passed: boolean }
  created_by: string
  created_at: Date | string
}

interface PersistedTraceRow {
  tenant_id?: unknown
  trace_id?: unknown
  agent_id?: unknown
  version_id?: unknown
  trace: unknown
  created_at?: unknown
}

interface PluginCatalogRow {
  tenant_id: string
  id: string
  name: string
  version: string
  manifest: unknown
  status: PluginCatalogStatus
  created_by: string
  approved_by: string | null
  created_at: Date | string
  updated_at: Date | string
}

interface KnowledgeSourceRow {
  tenant_id: string
  id: string
  source: string
  version: string
  label: string
  description: string
  status: KnowledgeSourceStatus
  created_by: string
  approved_by: string | null
  created_at: Date | string
  updated_at: Date | string
}

interface ReleaseCandidateRow {
  tenant_id: string
  id: string
  agent_id: string
  version_id: string
  evidence_digest: string
  gate_results: unknown
  status: ReleaseCandidateStatus
  created_by: string
  validated_by: string | null
  created_at: Date | string
  updated_at: Date | string
  validated_at: Date | string | null
}

function parseScope(scope: TenantScope): TenantScope {
  return TenantScopeSchema.parse(scope)
}

function parseRequiredReleaseCandidateId(
  rawCandidateId: ReleaseCandidateId
): ReleaseCandidateId {
  const parsed = ReleaseCandidateIdSchema.safeParse(rawCandidateId)
  if (!parsed.success) {
    throw new DomainError(
      'invalid_action',
      'Validated release candidate evidence is required'
    )
  }
  return parsed.data
}

function normalizeTraceLimit(limit: number): number {
  return Math.min(100, Math.max(1, Math.trunc(limit)))
}

function validateActor(actorId: string): string {
  const value = actorId.trim()
  if (!/^[A-Za-z0-9._:-]{3,80}$/.test(value)) {
    throw new DomainError('validation_failed', 'createdBy is invalid')
  }
  return value
}

function assertExpectedStatus(
  actual: AgentVersionStatus,
  expected?: AgentVersionStatus
): void {
  if (expected !== undefined && actual !== expected) {
    throw new DomainError(
      'conflict',
      `Agent version changed: expected ${expected}, observed ${actual}`
    )
  }
}

function canTransition(
  from: AgentVersionStatus,
  to: AgentVersionStatus
): boolean {
  const transitions: Record<AgentVersionStatus, AgentVersionStatus[]> = {
    DRAFT: ['TESTING', 'ARCHIVED'],
    TESTING: ['DRAFT', 'APPROVED', 'ARCHIVED'],
    APPROVED: ['TESTING', 'ARCHIVED'],
    PUBLISHED: ['ARCHIVED'],
    ARCHIVED: []
  }
  return transitions[from].includes(to)
}

function assertPluginCatalogExpectedStatus(
  actual: PluginCatalogStatus,
  expected?: PluginCatalogStatus
): void {
  if (expected !== undefined && actual !== expected) {
    throw new DomainError(
      'conflict',
      `Plugin catalog entry changed: expected ${expected}, observed ${actual}`
    )
  }
}

function assertKnowledgeSourceExpectedStatus(
  actual: KnowledgeSourceStatus,
  expected?: KnowledgeSourceStatus
): void {
  if (expected !== undefined && actual !== expected) {
    throw new DomainError(
      'conflict',
      `Knowledge source changed: expected ${expected}, observed ${actual}`
    )
  }
}

function assertReleaseCandidateExpectedStatus(
  actual: ReleaseCandidateStatus,
  expected?: ReleaseCandidateStatus
): void {
  if (expected !== undefined && actual !== expected) {
    throw new DomainError(
      'conflict',
      `Release candidate changed: expected ${expected}, observed ${actual}`
    )
  }
}

function canTransitionReleaseCandidate(
  from: ReleaseCandidateStatus,
  to: ReleaseCandidateStatus
): boolean {
  const transitions: Record<ReleaseCandidateStatus, ReleaseCandidateStatus[]> =
    {
      DRAFT: ['VALIDATED', 'REJECTED', 'ARCHIVED'],
      VALIDATED: ['ARCHIVED'],
      REJECTED: ['ARCHIVED'],
      ARCHIVED: []
    }
  return transitions[from].includes(to)
}

function canTransitionKnowledgeSource(
  from: KnowledgeSourceStatus,
  to: KnowledgeSourceStatus
): boolean {
  const transitions: Record<KnowledgeSourceStatus, KnowledgeSourceStatus[]> = {
    DRAFT: ['APPROVED', 'ARCHIVED'],
    APPROVED: ['ARCHIVED'],
    ARCHIVED: []
  }
  return transitions[from].includes(to)
}

function canTransitionPluginCatalog(
  from: PluginCatalogStatus,
  to: PluginCatalogStatus
): boolean {
  const transitions: Record<PluginCatalogStatus, PluginCatalogStatus[]> = {
    DRAFT: ['APPROVED', 'ARCHIVED'],
    APPROVED: ['ARCHIVED'],
    ARCHIVED: []
  }
  return transitions[from].includes(to)
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  )
}

function comparePluginVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number(part))
  const rightParts = right.split('.').map((part) => Number(part))
  if (leftParts.every(Number.isFinite) && rightParts.every(Number.isFinite)) {
    const length = Math.max(leftParts.length, rightParts.length)
    for (let index = 0; index < length; index += 1) {
      const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
      if (difference !== 0) return difference
    }
    return 0
  }
  return left.localeCompare(right)
}

function mapAgent(row: AgentRow): AgentRecord {
  return {
    tenantId: row.tenant_id as AgentRecord['tenantId'],
    id: row.id as AgentRecord['id'],
    slug: row.slug,
    name: row.name,
    description: row.description,
    activeVersionId: row.active_version_id as AgentRecord['activeVersionId'],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }
}

function mapVersion(row: AgentVersionRow): AgentVersionRecord {
  return {
    tenantId: row.tenant_id as AgentVersionRecord['tenantId'],
    id: row.id as AgentVersionRecord['id'],
    agentId: row.agent_id as AgentVersionRecord['agentId'],
    version: row.version,
    status: row.status,
    config: AgentConfigSchema.parse(row.config),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    publishedAt: row.published_at ? new Date(row.published_at) : null
  }
}

function mapTestSuite(row: TestSuiteRow): TestSuiteRecord {
  return cloneTestSuite({
    tenantId: row.tenant_id as TestSuiteRecord['tenantId'],
    id: TestSuiteIdSchema.parse(row.id),
    slug: row.slug,
    name: row.name,
    description: row.description,
    agentId: row.agent_id as TestSuiteRecord['agentId'],
    versionId: row.version_id as TestSuiteRecord['versionId'],
    version: row.version,
    cases: Array.isArray(row.cases)
      ? row.cases.map((testCase) => sanitizeTestCase(testCase as TestLabCase))
      : [],
    previousSuiteId: row.previous_suite_id
      ? TestSuiteIdSchema.parse(row.previous_suite_id)
      : null,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  })
}

function mapTestSuiteRun(
  row: TestSuiteRunRow,
  expectedTenantId: string
): TestSuiteRunRecord {
  const normalized = sanitizeTestSuiteRunTraces({
    tenantId: TenantIdSchema.parse(row.tenant_id),
    id: TestSuiteRunIdSchema.parse(row.id),
    suiteId: TestSuiteIdSchema.parse(row.suite_id),
    agentId: AgentIdSchema.parse(row.agent_id),
    variants: row.result?.variants,
    passed: row.result?.passed,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at)
  })
  const checked = {
    ...normalized,
    variants: normalized.variants.map((variant) => ({
      ...variant,
      results: variant.results.map((result) => ({
        ...result,
        trace: assertReadTraceTenant(expectedTenantId, result.trace)
      }))
    }))
  }
  if (
    checked.variants.length < 1 ||
    checked.variants.length > 2 ||
    checked.variants.some(
      (variant) =>
        (variant.label !== 'A' && variant.label !== 'B') ||
        !AgentVersionIdSchema.safeParse(variant.versionId).success
    ) ||
    new Set(checked.variants.map((variant) => variant.label)).size !==
      checked.variants.length ||
    checked.passed !== checked.variants.every((variant) => variant.passed)
  ) {
    throw new DomainError(
      'validation_failed',
      'Persisted test suite run shape is invalid'
    )
  }
  for (const variant of checked.variants) {
    for (const result of variant.results) {
      if (
        result.trace.agentId !== checked.agentId ||
        result.trace.versionId !== variant.versionId
      ) {
        throw new DomainError(
          'validation_failed',
          'Persisted suite trace scope is invalid'
        )
      }
    }
  }
  return cloneTestSuiteRun(checked)
}

function assertReadTraceTenant(
  expectedTenantId: string,
  rawTrace: unknown,
  rowReferences?: {
    tenantId?: unknown
    traceId?: unknown
    agentId?: unknown
    versionId?: unknown
    createdAt?: unknown
  }
): TestRunTrace {
  const trace = sanitizeTraceForPersistence(rawTrace)
  if (
    trace.tenantId !== expectedTenantId ||
    (rowReferences?.tenantId !== undefined &&
      rowReferences.tenantId !== trace.tenantId) ||
    (rowReferences?.traceId !== undefined &&
      rowReferences.traceId !== trace.traceId) ||
    (rowReferences?.agentId !== undefined &&
      rowReferences.agentId !== trace.agentId) ||
    (rowReferences?.versionId !== undefined &&
      rowReferences.versionId !== trace.versionId)
  ) {
    throw new DomainError(
      'validation_failed',
      'Persisted trace body does not match its row scope'
    )
  }
  if (rowReferences?.createdAt !== undefined) {
    const rowDate =
      rowReferences.createdAt instanceof Date
        ? rowReferences.createdAt
        : typeof rowReferences.createdAt === 'string'
          ? new Date(rowReferences.createdAt)
          : undefined
    if (
      !rowDate ||
      !Number.isFinite(rowDate.getTime()) ||
      rowDate.getTime() !== trace.createdAt.getTime()
    ) {
      throw new DomainError(
        'validation_failed',
        'Persisted trace timestamp does not match its row'
      )
    }
  }
  return trace
}

function mapPluginCatalog(row: PluginCatalogRow): PluginCatalogRecord {
  return clonePluginCatalogRecord({
    tenantId: row.tenant_id as PluginCatalogRecord['tenantId'],
    id: PluginCatalogIdSchema.parse(row.id),
    manifest: PluginManifestSchema.parse(row.manifest),
    status: PluginCatalogStatusSchema.parse(row.status),
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  })
}

function mapKnowledgeSource(row: KnowledgeSourceRow): KnowledgeSourceRecord {
  return cloneKnowledgeSourceRecord({
    tenantId: row.tenant_id as KnowledgeSourceRecord['tenantId'],
    id: KnowledgeSourceIdSchema.parse(row.id),
    source: row.source,
    version: row.version,
    label: row.label,
    description: row.description,
    status: KnowledgeSourceStatusSchema.parse(row.status),
    createdBy: row.created_by,
    approvedBy: row.approved_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  })
}

function mapReleaseCandidate(row: ReleaseCandidateRow): ReleaseCandidateRecord {
  return cloneReleaseCandidateRecord({
    tenantId: row.tenant_id as ReleaseCandidateRecord['tenantId'],
    id: ReleaseCandidateIdSchema.parse(row.id),
    agentId: row.agent_id as ReleaseCandidateRecord['agentId'],
    versionId: row.version_id as ReleaseCandidateRecord['versionId'],
    evidenceDigest: row.evidence_digest,
    gateResults: parseReleaseCandidateGateResults(row.gate_results),
    status: ReleaseCandidateStatusSchema.parse(row.status),
    createdBy: row.created_by,
    validatedBy: row.validated_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    validatedAt: row.validated_at ? new Date(row.validated_at) : null
  })
}

function cloneAgent(agent: AgentRecord): AgentRecord {
  return {
    ...agent,
    createdAt: new Date(agent.createdAt),
    updatedAt: new Date(agent.updatedAt)
  }
}

function cloneVersion(version: AgentVersionRecord): AgentVersionRecord {
  return {
    ...version,
    config: structuredClone(version.config),
    createdAt: new Date(version.createdAt),
    publishedAt: version.publishedAt ? new Date(version.publishedAt) : null
  }
}

function cloneTrace(trace: TestRunTrace): TestRunTrace {
  return {
    ...trace,
    input: {
      ...trace.input,
      message: redactSensitiveText(trace.input.message)
    },
    intent: { ...trace.intent },
    ...(trace.risk ? { risk: { ...trace.risk } } : {}),
    policy: trace.policy.map((item) => ({ ...item })),
    knowledge: { ...trace.knowledge },
    tools: trace.tools.map((tool) => ({ ...tool })),
    ...(trace.toolResults
      ? {
          toolResults: trace.toolResults.map((result) => ({
            ...result,
            output: result.output ? { ...result.output } : null
          }))
        }
      : {}),
    handoff: { ...trace.handoff },
    response: {
      text: redactSensitiveText(trace.response.text),
      mode: trace.response.mode
    },
    ...(trace.outputPolicy
      ? {
          outputPolicy: {
            decision: trace.outputPolicy.decision,
            reason: trace.outputPolicy.reason,
            mode: trace.outputPolicy.mode,
            redacted: trace.outputPolicy.redacted
          }
        }
      : {}),
    provider: { ...trace.provider },
    ...(trace.prompt
      ? { prompt: { ...trace.prompt, blockIds: [...trace.prompt.blockIds] } }
      : {}),
    ...(trace.status ? { status: trace.status } : {}),
    ...(trace.startedAt ? { startedAt: new Date(trace.startedAt) } : {}),
    ...(trace.completedAt ? { completedAt: new Date(trace.completedAt) } : {}),
    ...(trace.latencyMs !== undefined ? { latencyMs: trace.latencyMs } : {}),
    ...(trace.tokenUsage ? { tokenUsage: { ...trace.tokenUsage } } : {}),
    ...(trace.spans ? { spans: trace.spans.map((span) => ({ ...span })) } : {}),
    createdAt: new Date(trace.createdAt)
  }
}

function cloneTestSuite(suite: TestSuiteRecord): TestSuiteRecord {
  return {
    ...suite,
    cases: structuredClone(suite.cases),
    createdAt: new Date(suite.createdAt),
    updatedAt: new Date(suite.updatedAt)
  }
}

function sanitizeTestCase(rawCase: TestLabCase): TestLabCase {
  const testCase = TestLabCaseSchema.parse(rawCase)
  return {
    ...testCase,
    message: redactSensitiveText(testCase.message),
    history: testCase.history.map((item) => redactSensitiveText(item)),
    ...(testCase.approvedKnowledge
      ? {
          approvedKnowledge: {
            ...testCase.approvedKnowledge,
            answer: redactSensitiveText(testCase.approvedKnowledge.answer)
          }
        }
      : {})
  }
}

function cloneTestSuiteRun(run: TestSuiteRunRecord): TestSuiteRunRecord {
  return {
    ...run,
    variants: run.variants.map((variant) => ({
      ...variant,
      results: variant.results.map((result) => ({
        ...result,
        failures: [...result.failures],
        trace: cloneTrace(result.trace)
      }))
    })),
    createdAt: new Date(run.createdAt)
  }
}

function clonePluginCatalogRecord(
  entry: PluginCatalogRecord
): PluginCatalogRecord {
  return {
    ...entry,
    manifest: structuredClone(entry.manifest),
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.updatedAt)
  }
}

function cloneKnowledgeSourceRecord(
  entry: KnowledgeSourceRecord
): KnowledgeSourceRecord {
  return {
    ...entry,
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.updatedAt)
  }
}

function cloneReleaseCandidateRecord(
  candidate: ReleaseCandidateRecord
): ReleaseCandidateRecord {
  return {
    ...candidate,
    gateResults: candidate.gateResults.map((gate) => ({ ...gate })),
    createdAt: new Date(candidate.createdAt),
    updatedAt: new Date(candidate.updatedAt),
    validatedAt: candidate.validatedAt ? new Date(candidate.validatedAt) : null
  }
}
