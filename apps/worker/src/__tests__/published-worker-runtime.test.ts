import {
  createControlledAgentConfig,
  CapabilityGateway,
  createValidatedControlledReleaseCandidate,
  InMemoryControlPlaneStore,
  TenantIdSchema,
  type AgentId,
  type ControlPlaneStore
} from '@cvg/platform'
import { describe, expect, it, vi } from 'vitest'
import { processAgentTurnJob } from '../jobs/process-agent-turn.ts'
import { getWorkerStartupFailure } from '../worker.ts'

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000133'
)

async function publishVersion(
  store: InMemoryControlPlaneStore,
  agentId: AgentId
) {
  const draft = await store.createVersion(
    { tenantId },
    agentId,
    createControlledAgentConfig(),
    'worker.test'
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
  const releaseCandidate = await createValidatedControlledReleaseCandidate(
    store,
    tenantId,
    agentId,
    approved.id,
    'worker.test'
  )
  return store.publishVersion({ tenantId }, approved.id, releaseCandidate.id)
}

describe('published worker runtime boundary', () => {
  it.each([
    {
      message: 'Quero consulta, meu cachorro está vomitando sangue.',
      history: []
    },
    {
      message: 'Quero consulta.',
      history: ['Meu cachorro está vomitando sangue.']
    }
  ])(
    'hands off compound/context risk before tools: $message',
    async (entry) => {
      const platform = new InMemoryControlPlaneStore()
      const agent = await platform.createAgent(
        { tenantId },
        {
          slug: 'worker-risk',
          name: 'Synthetic worker risk',
          description: 'Fixture'
        }
      )
      const published = await publishVersion(platform, agent.id)
      const planner = vi.spyOn(CapabilityGateway.prototype, 'planTools')
      const executor = vi.spyOn(CapabilityGateway.prototype, 'execute')
      try {
        const result = await processAgentTurnJob(
          {
            tenantId,
            agentId: agent.id,
            versionId: published.id,
            ...entry,
            conversationId: 'conversation_worker_risk',
            sessionId: 'session_worker_risk'
          },
          { platform }
        )
        expect(result).toMatchObject({
          status: 'completed',
          trace: {
            risk: { level: 'high' },
            handoff: { requested: true, priority: 'high' },
            tools: [],
            provider: { externalCall: false }
          }
        })
        expect(planner).not.toHaveBeenCalled()
        expect(executor).not.toHaveBeenCalled()
      } finally {
        planner.mockRestore()
        executor.mockRestore()
      }
    }
  )

  it('executes only a bounded pinned job through the published runtime', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await platform.createAgent(
      { tenantId },
      {
        slug: 'worker-runtime-agent',
        name: 'Worker Runtime Agent',
        description: 'Controlled worker fixture'
      }
    )
    const firstVersion = await publishVersion(platform, agent.id)
    await publishVersion(platform, agent.id)

    const result = await processAgentTurnJob(
      {
        tenantId,
        agentId: agent.id,
        versionId: firstVersion.id,
        message: 'Qual o endereço institucional?',
        history: [],
        conversationId: 'conversation_worker_fixture',
        sessionId: 'session_worker_fixture'
      },
      { platform }
    )

    expect(result).toMatchObject({
      status: 'completed',
      trace: {
        tenantId,
        agentId: agent.id,
        versionId: firstVersion.id,
        executionMode: 'CONTROLLED_RUNTIME',
        conversationId: 'conversation_worker_fixture',
        sessionId: 'session_worker_fixture',
        provider: { externalCall: false }
      }
    })
  })

  it('reuses the controlled model boundary for a pinned worker job', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await platform.createAgent(
      { tenantId },
      {
        slug: 'worker-model-boundary-agent',
        name: 'Worker Model Boundary Agent',
        description: 'Controlled worker model fixture'
      }
    )
    const published = await publishVersion(platform, agent.id)
    const invalidVersion = {
      ...published,
      config: {
        ...published.config,
        model: {
          ...published.config.model,
          fallbackProvider: 'fake'
        }
      }
    }
    const getVersion = vi.fn().mockResolvedValue(invalidVersion)
    const controlledPlatform = { getVersion } as unknown as ControlPlaneStore

    await expect(
      processAgentTurnJob(
        {
          tenantId,
          agentId: agent.id,
          versionId: published.id,
          message: 'Mensagem fictícia',
          history: []
        },
        { platform: controlledPlatform }
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })
    expect(getVersion).toHaveBeenCalledWith({ tenantId }, published.id)
  })

  it('rejects the legacy job shape before touching the published executor', async () => {
    const getVersion = vi.fn()
    const platform = { getVersion } as unknown as ControlPlaneStore

    await expect(
      processAgentTurnJob(
        { sessionId: 'sess_legacy', triggerMessageId: 'msg_legacy' },
        { platform }
      )
    ).rejects.toMatchObject({
      code: 'validation_failed',
      message: 'Worker runtime job is invalid'
    })
    expect(getVersion).not.toHaveBeenCalled()
  })

  it('rejects oversized or unknown job fields before touching the store', async () => {
    const getVersion = vi.fn()
    const platform = { getVersion } as unknown as ControlPlaneStore
    const job = {
      tenantId,
      agentId: 'agent_00000000-0000-4000-8000-000000000135',
      versionId: 'agent_version_00000000-0000-4000-8000-000000000135',
      message: 'a'.repeat(4001),
      history: [],
      unexpected: true
    }

    await expect(processAgentTurnJob(job, { platform })).rejects.toMatchObject({
      code: 'validation_failed',
      message: 'Worker runtime job is invalid'
    })
    expect(getVersion).not.toHaveBeenCalled()
  })

  it('rejects draft and cross-agent pinned versions without fallback', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await platform.createAgent(
      { tenantId },
      {
        slug: 'worker-status-agent',
        name: 'Worker Status Agent',
        description: 'Controlled worker fixture'
      }
    )
    const otherAgent = await platform.createAgent(
      { tenantId },
      {
        slug: 'worker-other-agent',
        name: 'Worker Other Agent',
        description: 'Controlled worker fixture'
      }
    )
    const draft = await platform.createVersion(
      { tenantId },
      agent.id,
      createControlledAgentConfig(),
      'worker.test'
    )
    const otherVersion = await publishVersion(platform, otherAgent.id)

    const baseJob = {
      tenantId,
      agentId: agent.id,
      message: 'Mensagem controlada',
      history: []
    }
    await expect(
      processAgentTurnJob({ ...baseJob, versionId: draft.id }, { platform })
    ).resolves.toEqual({
      status: 'not_configured',
      trace: null,
      reason: 'pinned_version_invalid'
    })
    await expect(
      processAgentTurnJob(
        { ...baseJob, versionId: otherVersion.id },
        { platform }
      )
    ).resolves.toEqual({
      status: 'not_configured',
      trace: null,
      reason: 'pinned_version_invalid'
    })
  })

  it('fails closed when the pinned version is unavailable', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await platform.createAgent(
      { tenantId },
      {
        slug: 'worker-unpublished-agent',
        name: 'Worker Unpublished Agent',
        description: 'Controlled worker fixture'
      }
    )

    const result = await processAgentTurnJob(
      {
        tenantId,
        agentId: agent.id,
        versionId: 'agent_version_00000000-0000-4000-8000-000000000999',
        message: 'Mensagem sem versão',
        history: []
      },
      { platform }
    )

    expect(result).toEqual({
      status: 'not_configured',
      trace: null,
      reason: 'pinned_version_missing'
    })
  })

  it('reports a safe startup failure until a queue adapter exists', () => {
    expect(getWorkerStartupFailure({})).toEqual({
      code: 'queue_adapter_missing',
      message: 'Worker queue adapter is not configured'
    })
    expect(
      getWorkerStartupFailure({ CVG_WORKER_QUEUE_ADAPTER: 'controlled' })
    ).toEqual({
      code: 'queue_adapter_unsupported',
      message: 'No controlled worker queue adapter is available'
    })
    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'controlled-memory'
      })
    ).toEqual({
      code: 'controlled_tenant_missing',
      message: 'Controlled worker tenant is not configured'
    })
    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'controlled-memory',
        CVG_WORKER_TENANT_ID: 'tenant_00000000-0000-4000-8000-000000000172'
      })
    ).toBeNull()
    expect(
      getWorkerStartupFailure({
        NODE_ENV: 'production',
        CVG_WORKER_QUEUE_ADAPTER: 'controlled-memory',
        CVG_WORKER_TENANT_ID: 'tenant_00000000-0000-4000-8000-000000000172'
      })
    ).toMatchObject({ code: 'production_controlled_worker_forbidden' })
    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled'
      })
    ).toEqual({
      code: 'postgres_database_missing',
      message: 'DATABASE_URL is required for the PostgreSQL worker'
    })
    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled',
        DATABASE_URL: 'postgres://fixture.invalid/cvg'
      })
    ).toEqual({
      code: 'controlled_tenant_missing',
      message: 'Controlled worker tenant is not configured'
    })
    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled',
        DATABASE_URL: 'postgres://fixture.invalid/cvg',
        CVG_WORKER_TENANT_ID: tenantId
      })
    ).toEqual({
      code: 'postgres_rls_required',
      message: 'PostgreSQL worker requires tenant RLS enforcement'
    })
    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled',
        DATABASE_URL: 'postgres://fixture.invalid/cvg',
        CVG_WORKER_TENANT_ID: tenantId,
        POSTGRES_RLS_ENFORCEMENT: 'true'
      })
    ).toEqual({
      code: 'controlled_mode_required',
      message: 'PostgreSQL worker requires explicit controlled mode'
    })
    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled',
        DATABASE_URL: 'postgres://fixture.invalid/cvg',
        CVG_WORKER_TENANT_ID: tenantId,
        POSTGRES_RLS_ENFORCEMENT: 'true',
        CVG_WORKER_CONTROLLED_MODE: 'true'
      })
    ).toBeNull()
    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'postgres',
        DATABASE_URL: 'postgres://fixture.invalid/cvg',
        CVG_WORKER_TENANT_ID: tenantId,
        POSTGRES_RLS_ENFORCEMENT: 'true',
        CVG_WORKER_CONTROLLED_MODE: 'true'
      })
    ).toBeNull()
    expect(
      getWorkerStartupFailure({
        NODE_ENV: 'production',
        CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled',
        DATABASE_URL: 'postgres://fixture.invalid/cvg',
        CVG_WORKER_TENANT_ID: tenantId,
        POSTGRES_RLS_ENFORCEMENT: 'true',
        CVG_WORKER_CONTROLLED_MODE: 'true'
      })
    ).toEqual({
      code: 'production_controlled_worker_forbidden',
      message:
        'Controlled PostgreSQL worker is disabled in production pending external gates'
    })
  })

  it('keeps the homologation profile explicitly armed and fail-closed', () => {
    const base = {
      NODE_ENV: 'test',
      CVG_WORKER_RUNTIME: 'operational-harness-homolog',
      CVG_WORKER_TENANT_ID: tenantId,
      DATABASE_URL: 'postgres://fixture.invalid/cvg',
      POSTGRES_RLS_ENFORCEMENT: 'true',
      CVG_WORKER_CONTROLLED_MODE: 'true'
    }
    expect(getWorkerStartupFailure(base)).toEqual({
      code: 'homolog_arming_required',
      message: 'Homologation worker requires CVG_HOMOLOG_SYNTHETIC_ONLY=true'
    })
    expect(
      getWorkerStartupFailure({ ...base, CVG_HOMOLOG_SYNTHETIC_ONLY: 'true' })
    ).toBeNull()
    expect(
      getWorkerStartupFailure({
        ...base,
        CVG_HOMOLOG_SYNTHETIC_ONLY: 'true',
        POSTGRES_RLS_ENFORCEMENT: 'false'
      })
    ).toMatchObject({ code: 'postgres_rls_required' })
    expect(
      getWorkerStartupFailure({
        ...base,
        NODE_ENV: 'production',
        CVG_HOMOLOG_SYNTHETIC_ONLY: 'true'
      })
    ).toMatchObject({ code: 'production_controlled_worker_forbidden' })
  })
})
