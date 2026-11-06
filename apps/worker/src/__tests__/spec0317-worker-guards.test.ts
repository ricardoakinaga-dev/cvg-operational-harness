import {
  AgentConfigSchema,
  composeSyntheticKnowledgeResolver,
  createControlledAgentConfig,
  createSyntheticKnowledgeResolver,
  createValidatedControlledReleaseCandidate,
  InMemoryControlPlaneStore,
  TenantIdSchema,
  type ApprovedKnowledgeResolver
} from '@cvg/platform'
import { describe, expect, it, vi } from 'vitest'
import { getWorkerStartupFailure, processAgentTurnJob } from '../worker.ts'

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000318'
)
const source = 'controlled://worker-spec0317'

async function published(store: InMemoryControlPlaneStore) {
  const agent = await store.createAgent(
    { tenantId },
    { slug: 'worker-0317', name: 'Worker 0317', description: 'Fixture' }
  )
  const draft = await store.createVersion(
    { tenantId },
    agent.id,
    AgentConfigSchema.parse({
      ...createControlledAgentConfig(),
      knowledge: [
        { source, version: 'v1', enabled: true, requiresApprovedSource: true }
      ]
    }),
    'worker.spec0317'
  )
  const testing = await store.transitionVersion(
    { tenantId },
    draft.id,
    'TESTING'
  )
  const approved = await store.transitionVersion(
    { tenantId },
    testing.id,
    'APPROVED'
  )
  const candidate = await createValidatedControlledReleaseCandidate(
    store,
    tenantId,
    agent.id,
    approved.id,
    'worker.spec0317'
  )
  const version = await store.publishVersion(
    { tenantId },
    approved.id,
    candidate.id
  )
  return { agentId: agent.id, versionId: version.id }
}

function job(target: Awaited<ReturnType<typeof published>>) {
  return {
    tenantId,
    agentId: target.agentId,
    versionId: target.versionId,
    message: 'Qual o horário de funcionamento?',
    history: []
  }
}

describe('SPEC 0317 worker guards', () => {
  it.each([
    ['ENABLE_REAL_PAYMENTS', 'true'],
    ['ENABLE_REAL_MEDICAL_RECORDS', 'true'],
    ['ENABLE_REAL_PAYMENTS', 'yes'],
    ['ENABLE_REAL_CHANNELS', 'yes'],
    ['ENABLE_REAL_RAG', '1']
  ])('refuses to start with %s=%s', (flag, value) => {
    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'controlled-memory',
        [flag]: value
      })
    ).toMatchObject({ code: 'real_capability_config_invalid' })
  })

  it('starts the same worker with the flags off', () => {
    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'unknown',
        ENABLE_REAL_PAYMENTS: 'false',
        ENABLE_REAL_MEDICAL_RECORDS: 'false'
      })?.code
    ).not.toBe('real_capability_config_invalid')
  })

  it('hands off after a restart that lost the resolver', async () => {
    const platform = new InMemoryControlPlaneStore()
    const target = await published(platform)
    const beforeRestart = await processAgentTurnJob(job(target), {
      platform,
      resolveApprovedKnowledge: createSyntheticKnowledgeResolver({
        answer: 'Horário fictício.'
      })
    })
    expect(beforeRestart.trace?.knowledge.status).toBe('answered')

    const afterRestart = await processAgentTurnJob(job(target), { platform })
    expect(afterRestart.trace).toMatchObject({
      knowledge: { status: 'approved_source_missing' },
      response: { mode: 'handoff' }
    })
    expect(JSON.stringify(afterRestart)).not.toContain('Horário fictício')
  })

  it('does not call an unclassified resolver handed to the worker', async () => {
    const platform = new InMemoryControlPlaneStore()
    const target = await published(platform)
    const resolve = vi.fn()
    const result = await processAgentTurnJob(job(target), {
      platform,
      resolveApprovedKnowledge: resolve as unknown as ApprovedKnowledgeResolver
    })
    expect(resolve).not.toHaveBeenCalled()
    expect(result.trace?.knowledge).toEqual({
      status: 'approved_source_missing',
      reason: 'resolver_not_composed'
    })
  })

  it('hands off when the resolver fails during a job', async () => {
    const platform = new InMemoryControlPlaneStore()
    const target = await published(platform)
    const result = await processAgentTurnJob(job(target), {
      platform,
      resolveApprovedKnowledge: composeSyntheticKnowledgeResolver(() => {
        throw new Error('rag offline')
      })
    })
    expect(result.trace?.knowledge).toEqual({
      status: 'approved_source_missing',
      reason: 'resolver_failed'
    })
  })
})
