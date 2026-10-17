import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const uuid = '[0-9a-f-]{36}'

export const TenantIdSchema = z.string().regex(new RegExp(`^tenant_${uuid}$`))
export const AgentIdSchema = z.string().regex(new RegExp(`^agent_${uuid}$`))
export const AgentVersionIdSchema = z
  .string()
  .regex(new RegExp(`^agent_version_${uuid}$`))
export const TraceIdSchema = z.string().regex(new RegExp(`^trace_${uuid}$`))
export const TestSuiteIdSchema = z
  .string()
  .regex(new RegExp(`^test_suite_${uuid}$`))
export const TestSuiteRunIdSchema = z
  .string()
  .regex(new RegExp(`^test_suite_run_${uuid}$`))
export const PluginCatalogIdSchema = z
  .string()
  .regex(new RegExp(`^plugin_catalog_${uuid}$`))
export const KnowledgeSourceIdSchema = z
  .string()
  .regex(new RegExp(`^knowledge_source_${uuid}$`))
export const ReleaseCandidateIdSchema = z
  .string()
  .regex(new RegExp(`^release_candidate_${uuid}$`))

export type TenantId = z.infer<typeof TenantIdSchema>
export type AgentId = z.infer<typeof AgentIdSchema>
export type AgentVersionId = z.infer<typeof AgentVersionIdSchema>
export type TraceId = z.infer<typeof TraceIdSchema>
export type TestSuiteId = z.infer<typeof TestSuiteIdSchema>
export type TestSuiteRunId = z.infer<typeof TestSuiteRunIdSchema>
export type PluginCatalogId = z.infer<typeof PluginCatalogIdSchema>
export type KnowledgeSourceId = z.infer<typeof KnowledgeSourceIdSchema>
export type ReleaseCandidateId = z.infer<typeof ReleaseCandidateIdSchema>

export function createTenantId(): TenantId {
  return `tenant_${randomUUID()}`
}

export function createAgentId(): AgentId {
  return `agent_${randomUUID()}`
}

export function createAgentVersionId(): AgentVersionId {
  return `agent_version_${randomUUID()}`
}

export function createTraceId(): TraceId {
  return `trace_${randomUUID()}`
}

export function createTestSuiteId(): TestSuiteId {
  return `test_suite_${randomUUID()}`
}

export function createTestSuiteRunId(): TestSuiteRunId {
  return `test_suite_run_${randomUUID()}`
}

export function createPluginCatalogId(): PluginCatalogId {
  return `plugin_catalog_${randomUUID()}`
}

export function createKnowledgeSourceId(): KnowledgeSourceId {
  return `knowledge_source_${randomUUID()}`
}

export function createReleaseCandidateId(): ReleaseCandidateId {
  return `release_candidate_${randomUUID()}`
}
