import { DomainError, redactSensitiveText } from '@cvg/shared'
import {
  AgentConfigSchema,
  AgentCreateInputSchema,
  KnowledgeSourceCreateInputSchema,
  KnowledgeSourceStatusSchema,
  ReleaseCandidateCreateInputSchema,
  ReleaseCandidateStatusSchema,
  PluginCatalogCreateInputSchema,
  PluginCatalogStatusSchema,
  TestLabCaseSchema,
  TestSuiteCloneInputSchema,
  TestSuiteCreateInputSchema,
  TenantScopeSchema,
  type AgentConfig,
  type AgentCreateInput,
  type AgentRecord,
  type AgentVersionRecord,
  type AgentVersionStatus,
  type KnowledgeSourceCreateInput,
  type KnowledgeSourceRecord,
  type KnowledgeSourceStatus,
  type ReleaseCandidateCreateInput,
  type ReleaseCandidateRecord,
  type ReleaseCandidateStatus,
  type PluginCatalogCreateInput,
  type PluginCatalogRecord,
  type PluginCatalogStatus,
  type PluginManifest,
  type TenantScope,
  type TestRunTrace,
  type TestLabCase,
  type TestSuiteCloneInput,
  type TestSuiteCreateInput,
  type TestSuiteRecord,
  type TestSuiteRunRecord
} from './contracts.ts'
import { assertPromptProfileIntegrity } from './prompt-profile.ts'
import {
  assertReleaseCandidateEvidenceIntegrity,
  assertReleaseCandidateIndependentValidator,
  assertReleaseCandidatePublishAuthority,
  computeReleaseCandidateEvidenceDigest
} from './release-candidate.ts'
import {
  sanitizeTestSuiteRunTraces,
  sanitizeTraceForPersistence
} from './trace-governance.ts'
import {
  createAgentId,
  createAgentVersionId,
  createKnowledgeSourceId,
  createReleaseCandidateId,
  createPluginCatalogId,
  createTestSuiteId,
  AgentIdSchema,
  KnowledgeSourceIdSchema,
  ReleaseCandidateIdSchema,
  PluginCatalogIdSchema,
  TestSuiteRunIdSchema,
  type AgentId,
  type AgentVersionId,
  type KnowledgeSourceId,
  type ReleaseCandidateId,
  type TestSuiteId,
  type PluginCatalogId
} from './ids.ts'

export interface ControlPlaneStore {
  createAgent(scope: TenantScope, input: AgentCreateInput): Promise<AgentRecord>
  getAgent(scope: TenantScope, agentId: AgentId): Promise<AgentRecord | null>
  listAgents(scope: TenantScope): Promise<AgentRecord[]>
  createVersion(
    scope: TenantScope,
    agentId: AgentId,
    config: AgentConfig,
    createdBy: string
  ): Promise<AgentVersionRecord>
  getVersion(
    scope: TenantScope,
    versionId: AgentVersionId
  ): Promise<AgentVersionRecord | null>
  listVersions(
    scope: TenantScope,
    agentId: AgentId
  ): Promise<AgentVersionRecord[]>
  transitionVersion(
    scope: TenantScope,
    versionId: AgentVersionId,
    target: AgentVersionStatus,
    expectedStatus?: AgentVersionStatus
  ): Promise<AgentVersionRecord>
  publishVersion(
    scope: TenantScope,
    versionId: AgentVersionId,
    releaseCandidateId: ReleaseCandidateId,
    expectedStatus?: AgentVersionStatus
  ): Promise<AgentVersionRecord>
  rollback(
    scope: TenantScope,
    agentId: AgentId,
    versionId: AgentVersionId,
    createdBy: string,
    releaseCandidateId: ReleaseCandidateId,
    expectedStatus?: AgentVersionStatus
  ): Promise<AgentVersionRecord>
  resolvePublished(
    scope: TenantScope,
    agentId: AgentId
  ): Promise<AgentVersionRecord | null>
  createKnowledgeSource(
    scope: TenantScope,
    input: KnowledgeSourceCreateInput,
    createdBy: string
  ): Promise<KnowledgeSourceRecord>
  getKnowledgeSource(
    scope: TenantScope,
    sourceId: KnowledgeSourceId
  ): Promise<KnowledgeSourceRecord | null>
  listKnowledgeSources(scope: TenantScope): Promise<KnowledgeSourceRecord[]>
  transitionKnowledgeSource(
    scope: TenantScope,
    sourceId: KnowledgeSourceId,
    target: KnowledgeSourceStatus,
    actorId: string,
    expectedStatus?: KnowledgeSourceStatus
  ): Promise<KnowledgeSourceRecord>
  createReleaseCandidate(
    scope: TenantScope,
    input: ReleaseCandidateCreateInput,
    createdBy: string
  ): Promise<ReleaseCandidateRecord>
  getReleaseCandidate(
    scope: TenantScope,
    candidateId: ReleaseCandidateId
  ): Promise<ReleaseCandidateRecord | null>
  listReleaseCandidates(
    scope: TenantScope,
    agentId?: AgentId
  ): Promise<ReleaseCandidateRecord[]>
  transitionReleaseCandidate(
    scope: TenantScope,
    candidateId: ReleaseCandidateId,
    target: ReleaseCandidateStatus,
    actorId: string,
    expectedStatus?: ReleaseCandidateStatus
  ): Promise<ReleaseCandidateRecord>
  createPluginCatalogEntry(
    scope: TenantScope,
    input: PluginCatalogCreateInput,
    createdBy: string
  ): Promise<PluginCatalogRecord>
  getPluginCatalogEntry(
    scope: TenantScope,
    pluginId: PluginCatalogId
  ): Promise<PluginCatalogRecord | null>
  listPluginCatalogEntries(
    scope: TenantScope,
    name?: string
  ): Promise<PluginCatalogRecord[]>
  transitionPluginCatalogEntry(
    scope: TenantScope,
    pluginId: PluginCatalogId,
    target: PluginCatalogStatus,
    actorId: string,
    expectedStatus?: PluginCatalogStatus
  ): Promise<PluginCatalogRecord>
  resolveApprovedPlugin(
    scope: TenantScope,
    name: string,
    version?: string
  ): Promise<PluginManifest | null>
  recordTestRun(scope: TenantScope, trace: TestRunTrace): Promise<TestRunTrace>
  listTestRuns(scope: TenantScope, limit?: number): Promise<TestRunTrace[]>
  recordExecutionTrace(
    scope: TenantScope,
    trace: TestRunTrace
  ): Promise<TestRunTrace>
  listExecutionTraces(
    scope: TenantScope,
    limit?: number
  ): Promise<TestRunTrace[]>
  createTestSuite(
    scope: TenantScope,
    input: TestSuiteCreateInput,
    createdBy: string
  ): Promise<TestSuiteRecord>
  getTestSuite(
    scope: TenantScope,
    suiteId: TestSuiteId
  ): Promise<TestSuiteRecord | null>
  listTestSuites(
    scope: TenantScope,
    agentId?: AgentId
  ): Promise<TestSuiteRecord[]>
  cloneTestSuite(
    scope: TenantScope,
    suiteId: TestSuiteId,
    input: TestSuiteCloneInput,
    createdBy: string
  ): Promise<TestSuiteRecord>
  recordTestSuiteRun(
    scope: TenantScope,
    run: TestSuiteRunRecord
  ): Promise<TestSuiteRunRecord>
  listTestSuiteRuns(
    scope: TenantScope,
    suiteId: TestSuiteId,
    limit?: number
  ): Promise<TestSuiteRunRecord[]>
}

export class InMemoryControlPlaneStore implements ControlPlaneStore {
  private agents: AgentRecord[] = []
  private versions: AgentVersionRecord[] = []
  private testRuns: TestRunTrace[] = []
  private executionTraces: TestRunTrace[] = []
  private testSuites: TestSuiteRecord[] = []
  private testSuiteRuns: TestSuiteRunRecord[] = []
  private pluginCatalog: PluginCatalogRecord[] = []
  private knowledgeSources: KnowledgeSourceRecord[] = []
  private releaseCandidates: ReleaseCandidateRecord[] = []

  async createAgent(
    rawScope: TenantScope,
    rawInput: AgentCreateInput
  ): Promise<AgentRecord> {
    const scope = parseScope(rawScope)
    const input = AgentCreateInputSchema.parse(rawInput)
    if (
      this.agents.some(
        (agent) =>
          agent.tenantId === scope.tenantId && agent.slug === input.slug
      )
    ) {
      throw new DomainError('invalid_action', 'Agent slug already exists')
    }

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
    this.agents = [...this.agents, agent]
    return cloneAgent(agent)
  }

  async getAgent(
    rawScope: TenantScope,
    agentId: AgentId
  ): Promise<AgentRecord | null> {
    const scope = parseScope(rawScope)
    const agent = this.agents.find(
      (candidate) =>
        candidate.tenantId === scope.tenantId && candidate.id === agentId
    )
    return agent ? cloneAgent(agent) : null
  }

  async listAgents(rawScope: TenantScope): Promise<AgentRecord[]> {
    const scope = parseScope(rawScope)
    return this.agents
      .filter((agent) => agent.tenantId === scope.tenantId)
      .map(cloneAgent)
  }

  async createVersion(
    rawScope: TenantScope,
    agentId: AgentId,
    rawConfig: AgentConfig,
    createdBy: string
  ): Promise<AgentVersionRecord> {
    const scope = parseScope(rawScope)
    const agent = this.requireAgent(scope, agentId)
    const config = AgentConfigSchema.parse(rawConfig)
    assertPromptProfileIntegrity(config)
    const versionNumber =
      Math.max(
        0,
        ...this.versions
          .filter((version) => version.tenantId === scope.tenantId)
          .filter((version) => version.agentId === agent.id)
          .map((version) => version.version)
      ) + 1
    const version: AgentVersionRecord = {
      tenantId: scope.tenantId,
      id: createAgentVersionId(),
      agentId: agent.id,
      version: versionNumber,
      status: 'DRAFT',
      config: cloneConfig(config),
      createdBy: validateActor(createdBy),
      createdAt: new Date(),
      publishedAt: null
    }
    this.versions = [...this.versions, version]
    return cloneVersion(version)
  }

  async getVersion(
    rawScope: TenantScope,
    versionId: AgentVersionId
  ): Promise<AgentVersionRecord | null> {
    const scope = parseScope(rawScope)
    const version = this.versions.find(
      (candidate) =>
        candidate.tenantId === scope.tenantId && candidate.id === versionId
    )
    return version ? cloneVersion(version) : null
  }

  async listVersions(
    rawScope: TenantScope,
    agentId: AgentId
  ): Promise<AgentVersionRecord[]> {
    const scope = parseScope(rawScope)
    this.requireAgent(scope, agentId)
    return this.versions
      .filter(
        (version) =>
          version.tenantId === scope.tenantId && version.agentId === agentId
      )
      .sort((left, right) => right.version - left.version)
      .map(cloneVersion)
  }

  async transitionVersion(
    rawScope: TenantScope,
    versionId: AgentVersionId,
    target: AgentVersionStatus,
    expectedStatus?: AgentVersionStatus
  ): Promise<AgentVersionRecord> {
    const scope = parseScope(rawScope)
    const current = this.requireVersion(scope, versionId)
    assertExpectedStatus(current.status, expectedStatus)
    if (!canTransition(current.status, target)) {
      throw new DomainError(
        'invalid_action',
        `Version cannot transition from ${current.status} to ${target}`
      )
    }
    const updated: AgentVersionRecord = { ...current, status: target }
    this.versions = this.versions.map((version) =>
      version.id === versionId ? updated : version
    )
    return cloneVersion(updated)
  }

  async publishVersion(
    rawScope: TenantScope,
    versionId: AgentVersionId,
    rawReleaseCandidateId: ReleaseCandidateId,
    expectedStatus?: AgentVersionStatus
  ): Promise<AgentVersionRecord> {
    const scope = parseScope(rawScope)
    const current = this.requireVersion(scope, versionId)
    this.requireReleaseCandidateAuthority(
      scope,
      rawReleaseCandidateId,
      current.agentId,
      current.id
    )
    return this.publishApprovedVersion(scope, versionId, expectedStatus)
  }

  private async publishApprovedVersion(
    scope: TenantScope,
    versionId: AgentVersionId,
    expectedStatus?: AgentVersionStatus
  ): Promise<AgentVersionRecord> {
    const current = this.requireVersion(scope, versionId)
    assertExpectedStatus(current.status, expectedStatus)
    if (current.status !== 'APPROVED') {
      throw new DomainError(
        'invalid_action',
        'Only an approved version can be published'
      )
    }
    const agent = this.requireAgent(scope, current.agentId)
    const now = new Date()
    const published: AgentVersionRecord = {
      ...current,
      status: 'PUBLISHED',
      publishedAt: now
    }
    this.versions = this.versions.map((version) => {
      if (version.id === versionId) return published
      if (
        version.agentId === current.agentId &&
        version.tenantId === scope.tenantId &&
        version.status === 'PUBLISHED'
      ) {
        return { ...version, status: 'ARCHIVED' as const }
      }
      return version
    })
    this.agents = this.agents.map((candidate) =>
      candidate.id === agent.id
        ? { ...candidate, activeVersionId: published.id, updatedAt: now }
        : candidate
    )
    return cloneVersion(published)
  }

  async rollback(
    rawScope: TenantScope,
    agentId: AgentId,
    versionId: AgentVersionId,
    createdBy: string,
    rawReleaseCandidateId: ReleaseCandidateId,
    expectedStatus?: AgentVersionStatus
  ): Promise<AgentVersionRecord> {
    const scope = parseScope(rawScope)
    const target = this.requireVersion(scope, versionId)
    this.requireReleaseCandidateAuthority(
      scope,
      rawReleaseCandidateId,
      agentId,
      target.id
    )
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
    const draft = await this.createVersion(
      scope,
      agentId,
      target.config,
      createdBy
    )
    const testing = await this.transitionVersion(scope, draft.id, 'TESTING')
    const approved = await this.transitionVersion(scope, testing.id, 'APPROVED')
    return this.publishApprovedVersion(scope, approved.id)
  }

  async resolvePublished(
    rawScope: TenantScope,
    agentId: AgentId
  ): Promise<AgentVersionRecord | null> {
    const scope = parseScope(rawScope)
    const agent = this.requireAgent(scope, agentId)
    if (!agent.activeVersionId) return null
    const version = this.versions.find(
      (candidate) =>
        candidate.tenantId === scope.tenantId &&
        candidate.id === agent.activeVersionId &&
        candidate.status === 'PUBLISHED'
    )
    return version ? cloneVersion(version) : null
  }

  async createKnowledgeSource(
    rawScope: TenantScope,
    rawInput: KnowledgeSourceCreateInput,
    createdBy: string
  ): Promise<KnowledgeSourceRecord> {
    const scope = parseScope(rawScope)
    const input = KnowledgeSourceCreateInputSchema.parse(rawInput)
    if (
      this.knowledgeSources.some(
        (entry) =>
          entry.tenantId === scope.tenantId &&
          entry.source === input.source &&
          entry.version === input.version
      )
    ) {
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
      createdBy: validateActor(createdBy),
      approvedBy: null,
      createdAt: now,
      updatedAt: now
    }
    this.knowledgeSources = [...this.knowledgeSources, entry]
    return cloneKnowledgeSourceRecord(entry)
  }

  async getKnowledgeSource(
    rawScope: TenantScope,
    rawSourceId: KnowledgeSourceId
  ): Promise<KnowledgeSourceRecord | null> {
    const scope = parseScope(rawScope)
    const sourceId = KnowledgeSourceIdSchema.parse(rawSourceId)
    const entry = this.knowledgeSources.find(
      (candidate) =>
        candidate.tenantId === scope.tenantId && candidate.id === sourceId
    )
    return entry ? cloneKnowledgeSourceRecord(entry) : null
  }

  async listKnowledgeSources(
    rawScope: TenantScope
  ): Promise<KnowledgeSourceRecord[]> {
    const scope = parseScope(rawScope)
    return this.knowledgeSources
      .filter((entry) => entry.tenantId === scope.tenantId)
      .sort(
        (left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          right.id.localeCompare(left.id)
      )
      .map(cloneKnowledgeSourceRecord)
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
    const current = this.knowledgeSources.find(
      (candidate) =>
        candidate.tenantId === scope.tenantId && candidate.id === sourceId
    )
    if (!current) {
      throw new DomainError('invalid_action', 'Knowledge source not found')
    }
    assertKnowledgeSourceExpectedStatus(current.status, expectedStatus)
    if (!canTransitionKnowledgeSource(current.status, target)) {
      throw new DomainError(
        'invalid_action',
        `Knowledge source cannot transition from ${current.status} to ${target}`
      )
    }
    const actor = validateActor(actorId)
    const updated: KnowledgeSourceRecord = {
      ...current,
      status: target,
      approvedBy: target === 'APPROVED' ? actor : current.approvedBy,
      updatedAt: new Date()
    }
    this.knowledgeSources = this.knowledgeSources.map((entry) =>
      entry.tenantId === scope.tenantId && entry.id === sourceId
        ? updated
        : entry
    )
    return cloneKnowledgeSourceRecord(updated)
  }

  async createReleaseCandidate(
    rawScope: TenantScope,
    rawInput: ReleaseCandidateCreateInput,
    createdBy: string
  ): Promise<ReleaseCandidateRecord> {
    const scope = parseScope(rawScope)
    const input = ReleaseCandidateCreateInputSchema.parse(rawInput)
    this.requireVersionForAgent(scope, input.agentId, input.versionId)
    const gateResults = input.gateResults.map((gate) => ({ ...gate }))
    const evidenceDigest = computeReleaseCandidateEvidenceDigest({
      tenantId: scope.tenantId,
      agentId: input.agentId,
      versionId: input.versionId,
      gateResults
    })
    if (
      this.releaseCandidates.some(
        (candidate) =>
          candidate.tenantId === scope.tenantId &&
          candidate.agentId === input.agentId &&
          candidate.versionId === input.versionId &&
          candidate.evidenceDigest === evidenceDigest
      )
    ) {
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
      createdBy: validateActor(createdBy),
      validatedBy: null,
      createdAt: now,
      updatedAt: now,
      validatedAt: null
    }
    this.releaseCandidates = [...this.releaseCandidates, candidate]
    return cloneReleaseCandidateRecord(candidate)
  }

  async getReleaseCandidate(
    rawScope: TenantScope,
    rawCandidateId: ReleaseCandidateId
  ): Promise<ReleaseCandidateRecord | null> {
    const scope = parseScope(rawScope)
    const candidateId = ReleaseCandidateIdSchema.parse(rawCandidateId)
    const candidate = this.releaseCandidates.find(
      (entry) => entry.tenantId === scope.tenantId && entry.id === candidateId
    )
    return candidate ? cloneReleaseCandidateRecord(candidate) : null
  }

  async listReleaseCandidates(
    rawScope: TenantScope,
    rawAgentId?: AgentId
  ): Promise<ReleaseCandidateRecord[]> {
    const scope = parseScope(rawScope)
    const agentId = rawAgentId ? AgentIdSchema.parse(rawAgentId) : undefined
    return this.releaseCandidates
      .filter(
        (candidate) =>
          candidate.tenantId === scope.tenantId &&
          (agentId === undefined || candidate.agentId === agentId)
      )
      .sort(
        (left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          right.id.localeCompare(left.id)
      )
      .map(cloneReleaseCandidateRecord)
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
    const current = this.releaseCandidates.find(
      (candidate) =>
        candidate.tenantId === scope.tenantId && candidate.id === candidateId
    )
    if (!current) {
      throw new DomainError('invalid_action', 'Release candidate not found')
    }
    assertReleaseCandidateExpectedStatus(current.status, expectedStatus)
    if (!canTransitionReleaseCandidate(current.status, target)) {
      throw new DomainError(
        'invalid_action',
        `Release candidate cannot transition from ${current.status} to ${target}`
      )
    }
    const actor = target === 'VALIDATED' ? validateActor(actorId) : null
    if (target === 'VALIDATED') {
      assertReleaseCandidateIndependentValidator(current, actor!)
      assertReleaseCandidateEvidenceIntegrity(current)
    }
    const now = new Date()
    const updated: ReleaseCandidateRecord = {
      ...current,
      status: target,
      validatedBy: target === 'VALIDATED' ? actor : current.validatedBy,
      validatedAt: target === 'VALIDATED' ? now : current.validatedAt,
      updatedAt: now
    }
    this.releaseCandidates = this.releaseCandidates.map((candidate) =>
      candidate.tenantId === scope.tenantId && candidate.id === candidateId
        ? updated
        : candidate
    )
    return cloneReleaseCandidateRecord(updated)
  }

  async createPluginCatalogEntry(
    rawScope: TenantScope,
    rawInput: PluginCatalogCreateInput,
    createdBy: string
  ): Promise<PluginCatalogRecord> {
    const scope = parseScope(rawScope)
    const input = PluginCatalogCreateInputSchema.parse(rawInput)
    if (
      this.pluginCatalog.some(
        (entry) =>
          entry.tenantId === scope.tenantId &&
          entry.manifest.name === input.manifest.name &&
          entry.manifest.version === input.manifest.version
      )
    ) {
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
      createdBy: validateActor(createdBy),
      approvedBy: null,
      createdAt: now,
      updatedAt: now
    }
    this.pluginCatalog = [...this.pluginCatalog, entry]
    return clonePluginCatalogRecord(entry)
  }

  async getPluginCatalogEntry(
    rawScope: TenantScope,
    rawPluginId: PluginCatalogId
  ): Promise<PluginCatalogRecord | null> {
    const scope = parseScope(rawScope)
    const pluginId = PluginCatalogIdSchema.parse(rawPluginId)
    const entry = this.pluginCatalog.find(
      (candidate) =>
        candidate.tenantId === scope.tenantId && candidate.id === pluginId
    )
    return entry ? clonePluginCatalogRecord(entry) : null
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
    return this.pluginCatalog
      .filter(
        (entry) =>
          entry.tenantId === scope.tenantId &&
          (name === undefined || entry.manifest.name === name)
      )
      .sort(
        (left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          right.id.localeCompare(left.id)
      )
      .map(clonePluginCatalogRecord)
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
    const current = this.pluginCatalog.find(
      (candidate) =>
        candidate.tenantId === scope.tenantId && candidate.id === pluginId
    )
    if (!current) {
      throw new DomainError('invalid_action', 'Plugin catalog entry not found')
    }
    assertPluginCatalogExpectedStatus(current.status, expectedStatus)
    if (!canTransitionPluginCatalog(current.status, target)) {
      throw new DomainError(
        'invalid_action',
        `Plugin catalog entry cannot transition from ${current.status} to ${target}`
      )
    }
    const actor = validateActor(actorId)
    const updated: PluginCatalogRecord = {
      ...current,
      status: target,
      approvedBy: target === 'APPROVED' ? actor : current.approvedBy,
      updatedAt: new Date()
    }
    this.pluginCatalog = this.pluginCatalog.map((entry) =>
      entry.tenantId === scope.tenantId && entry.id === pluginId
        ? updated
        : entry
    )
    return clonePluginCatalogRecord(updated)
  }

  async resolveApprovedPlugin(
    rawScope: TenantScope,
    rawName: string,
    version?: string
  ): Promise<PluginManifest | null> {
    const scope = parseScope(rawScope)
    const name = rawName.trim()
    if (!name) {
      throw new DomainError('validation_failed', 'Plugin name is invalid')
    }
    const entry = this.pluginCatalog
      .filter(
        (candidate) =>
          candidate.tenantId === scope.tenantId &&
          candidate.status === 'APPROVED' &&
          candidate.manifest.name === name &&
          (version === undefined || candidate.manifest.version === version)
      )
      .sort((left, right) =>
        comparePluginVersions(right.manifest.version, left.manifest.version)
      )[0]
    return entry ? structuredClone(entry.manifest) : null
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
    this.assertTraceReferences(scope, sanitizedTrace)
    const stored = cloneTrace(sanitizedTrace)
    this.testRuns = [...this.testRuns, stored]
    return cloneTrace(stored)
  }

  async listTestRuns(
    rawScope: TenantScope,
    limit = 50
  ): Promise<TestRunTrace[]> {
    const scope = parseScope(rawScope)
    return [...this.testRuns]
      .filter((trace) => trace.tenantId === scope.tenantId)
      .reverse()
      .slice(0, normalizeTraceLimit(limit))
      .map(cloneTrace)
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
    this.assertTraceReferences(scope, sanitizedTrace)
    const stored = cloneTrace(sanitizedTrace)
    this.executionTraces = [...this.executionTraces, stored]
    return cloneTrace(stored)
  }

  async listExecutionTraces(
    rawScope: TenantScope,
    limit = 50
  ): Promise<TestRunTrace[]> {
    const scope = parseScope(rawScope)
    return [...this.executionTraces]
      .filter((trace) => trace.tenantId === scope.tenantId)
      .reverse()
      .slice(0, normalizeTraceLimit(limit))
      .map(cloneTrace)
  }

  async createTestSuite(
    rawScope: TenantScope,
    rawInput: TestSuiteCreateInput,
    createdBy: string
  ): Promise<TestSuiteRecord> {
    const scope = parseScope(rawScope)
    const input = TestSuiteCreateInputSchema.parse(rawInput)
    const agent = this.requireAgent(scope, input.agentId)
    this.requireVersionForAgent(scope, input.agentId, input.versionId)
    if (
      this.testSuites.some(
        (suite) =>
          suite.tenantId === scope.tenantId && suite.slug === input.slug
      )
    ) {
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
      versionId: input.versionId,
      version: 1,
      cases: input.cases.map(sanitizeTestCase),
      previousSuiteId: null,
      createdBy: validateActor(createdBy),
      createdAt: now,
      updatedAt: now
    }
    this.testSuites = [...this.testSuites, suite]
    return cloneTestSuite(suite)
  }

  async getTestSuite(
    rawScope: TenantScope,
    suiteId: TestSuiteId
  ): Promise<TestSuiteRecord | null> {
    const scope = parseScope(rawScope)
    const suite = this.testSuites.find(
      (candidate) =>
        candidate.tenantId === scope.tenantId && candidate.id === suiteId
    )
    return suite ? cloneTestSuite(suite) : null
  }

  async listTestSuites(
    rawScope: TenantScope,
    agentId?: AgentId
  ): Promise<TestSuiteRecord[]> {
    const scope = parseScope(rawScope)
    if (agentId) this.requireAgent(scope, agentId)
    return this.testSuites
      .filter(
        (suite) =>
          suite.tenantId === scope.tenantId &&
          (agentId === undefined || suite.agentId === agentId)
      )
      .sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
      )
      .map(cloneTestSuite)
  }

  async cloneTestSuite(
    rawScope: TenantScope,
    suiteId: TestSuiteId,
    rawInput: TestSuiteCloneInput,
    createdBy: string
  ): Promise<TestSuiteRecord> {
    const scope = parseScope(rawScope)
    const input = TestSuiteCloneInputSchema.parse(rawInput)
    const source = this.requireTestSuite(scope, suiteId)
    const versionId = input.versionId ?? source.versionId
    this.requireVersionForAgent(scope, source.agentId, versionId)
    const now = new Date()
    const clone: TestSuiteRecord = {
      ...source,
      id: createTestSuiteId(),
      name: input.name ?? source.name,
      description: input.description ?? source.description,
      versionId,
      version:
        Math.max(
          0,
          ...this.testSuites
            .filter(
              (suite) =>
                suite.tenantId === scope.tenantId && suite.slug === source.slug
            )
            .map((suite) => suite.version)
        ) + 1,
      cases: (input.cases ?? source.cases).map(sanitizeTestCase),
      previousSuiteId: source.id,
      createdBy: validateActor(createdBy),
      createdAt: now,
      updatedAt: now
    }
    this.testSuites = [...this.testSuites, clone]
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
    const suite = this.requireTestSuite(scope, run.suiteId)
    const variantsPassed = run.variants.every((variant) => variant.passed)
    if (
      suite.agentId !== run.agentId ||
      run.variants.length < 1 ||
      run.variants.length > 2 ||
      run.variants.some(
        (variant) => variant.label !== 'A' && variant.label !== 'B'
      ) ||
      run.passed !== variantsPassed
    ) {
      throw new DomainError('invalid_action', 'Test suite run scope is invalid')
    }
    if (
      new Set(run.variants.map((variant) => variant.label)).size !==
      run.variants.length
    ) {
      throw new DomainError(
        'invalid_action',
        'Test suite run variants are duplicated'
      )
    }
    run.variants.forEach((variant) => {
      this.requireVersionForAgent(scope, run.agentId, variant.versionId)
      variant.results.forEach((result) => {
        this.assertTraceReferences(scope, result.trace)
        if (
          result.trace.agentId !== run.agentId ||
          result.trace.versionId !== variant.versionId
        ) {
          throw new DomainError(
            'invalid_action',
            'Suite trace scope is invalid'
          )
        }
      })
    })
    this.testSuiteRuns = [...this.testSuiteRuns, run]
    return cloneTestSuiteRun(run)
  }

  async listTestSuiteRuns(
    rawScope: TenantScope,
    suiteId: TestSuiteId,
    limit = 50
  ): Promise<TestSuiteRunRecord[]> {
    const scope = parseScope(rawScope)
    this.requireTestSuite(scope, suiteId)
    return this.testSuiteRuns
      .filter(
        (run) => run.tenantId === scope.tenantId && run.suiteId === suiteId
      )
      .reverse()
      .slice(0, normalizeTraceLimit(limit))
      .map(cloneTestSuiteRun)
  }

  private requireAgent(scope: TenantScope, agentId: AgentId): AgentRecord {
    const agent = this.agents.find((candidate) => candidate.id === agentId)
    if (!agent) throw new DomainError('invalid_action', 'Agent not found')
    if (agent.tenantId !== scope.tenantId) {
      throw new DomainError('forbidden', 'Agent is outside tenant scope')
    }
    return agent
  }

  private requireVersion(
    scope: TenantScope,
    versionId: AgentVersionId
  ): AgentVersionRecord {
    const version = this.versions.find(
      (candidate) => candidate.id === versionId
    )
    if (!version)
      throw new DomainError('invalid_action', 'Agent version not found')
    if (version.tenantId !== scope.tenantId) {
      throw new DomainError(
        'forbidden',
        'Agent version is outside tenant scope'
      )
    }
    return version
  }

  private requireVersionForAgent(
    scope: TenantScope,
    agentId: AgentId,
    versionId: AgentVersionId
  ): AgentVersionRecord {
    const version = this.requireVersion(scope, versionId)
    if (version.agentId !== agentId) {
      throw new DomainError(
        'invalid_action',
        'Version does not belong to agent'
      )
    }
    return version
  }

  private requireReleaseCandidateAuthority(
    scope: TenantScope,
    rawCandidateId: ReleaseCandidateId,
    agentId: AgentId,
    versionId: AgentVersionId
  ): ReleaseCandidateRecord {
    const candidateId = parseRequiredReleaseCandidateId(rawCandidateId)
    const candidate = this.releaseCandidates.find(
      (entry) => entry.tenantId === scope.tenantId && entry.id === candidateId
    )
    return assertReleaseCandidatePublishAuthority({
      candidate: candidate ? cloneReleaseCandidateRecord(candidate) : null,
      tenantId: scope.tenantId,
      agentId,
      versionId
    })
  }

  private requireTestSuite(
    scope: TenantScope,
    suiteId: TestSuiteId
  ): TestSuiteRecord {
    const suite = this.testSuites.find((candidate) => candidate.id === suiteId)
    if (!suite) throw new DomainError('invalid_action', 'Test suite not found')
    if (suite.tenantId !== scope.tenantId) {
      throw new DomainError('forbidden', 'Test suite is outside tenant scope')
    }
    return suite
  }

  private assertTraceReferences(scope: TenantScope, trace: TestRunTrace): void {
    const agent = this.requireAgent(scope, trace.agentId)
    const version = this.requireVersion(scope, trace.versionId)
    if (version.agentId !== agent.id) {
      throw new DomainError(
        'invalid_action',
        'Trace agent and version do not belong together'
      )
    }
  }
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

function cloneConfig(config: AgentConfig): AgentConfig {
  return structuredClone(config)
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
    config: cloneConfig(version.config),
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
    updatedAt: new Date(suite.updatedAt),
    previousSuiteId: suite.previousSuiteId
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
