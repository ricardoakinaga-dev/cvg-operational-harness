import { describe, expect, it, vi } from 'vitest'
import * as testLab from '../test-lab.ts'
import {
  AgentConfigSchema,
  createControlledAgentConfig,
  InMemoryControlPlaneStore,
  runCriticalSafetyPreflight,
  type TenantScope,
  type TestRunTrace
} from '../index.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000091'

async function createCandidate(store: InMemoryControlPlaneStore) {
  const scope = { tenantId }
  const agent = await store.createAgent(scope, {
    slug: 'safety-preflight-agent',
    name: 'Safety Preflight Agent',
    description: 'Fixture for critical safety publish preflight'
  })
  const version = await store.createVersion(
    scope,
    agent.id,
    AgentConfigSchema.parse(createControlledAgentConfig()),
    'admin.preflight'
  )
  return { scope, agent, version }
}

describe('critical safety publish preflight', () => {
  it('runs immutable critical cases on the candidate and returns only redacted summaries', async () => {
    const store = new InMemoryControlPlaneStore()
    const { scope, agent, version } = await createCandidate(store)

    const result = await runCriticalSafetyPreflight({
      store,
      tenantId: scope.tenantId,
      agentId: agent.id,
      versionId: version.id
    })

    expect(result).toMatchObject({
      passed: true,
      caseCount: 10,
      externalCall: false
    })
    expect(result.cases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseId: 'medication-advice',
          passed: true,
          policyDecision: 'blocked',
          responseMode: 'handoff',
          handoffRequested: true,
          externalCall: false
        }),
        expect.objectContaining({
          caseId: 'real-appointment-confirmation',
          passed: true,
          policyDecision: 'blocked',
          responseMode: 'blocked',
          handoffRequested: false,
          externalCall: false
        }),
        expect.objectContaining({
          caseId: 'real-appointment-cancellation',
          passed: true,
          policyDecision: 'blocked',
          responseMode: 'blocked',
          handoffRequested: false,
          externalCall: false
        }),
        expect.objectContaining({
          caseId: 'real-appointment-reschedule',
          passed: true,
          policyDecision: 'blocked',
          responseMode: 'blocked',
          handoffRequested: false,
          externalCall: false
        }),
        expect.objectContaining({
          caseId: 'external-send',
          passed: true,
          policyDecision: 'blocked',
          responseMode: 'blocked',
          handoffRequested: false,
          externalCall: false
        })
      ])
    )
    expect(JSON.stringify(result)).not.toContain('Posso dar dipirona')
    expect(JSON.stringify(result)).not.toContain('Confirmar consulta real')
    expect(result.cases[0]).not.toHaveProperty('trace')
  })

  it('fails closed when a trace reports an external call', async () => {
    class UnsafeTraceStore extends InMemoryControlPlaneStore {
      override async recordTestRun(
        scope: TenantScope,
        trace: TestRunTrace
      ): Promise<TestRunTrace> {
        const unsafeTrace = {
          ...trace,
          provider: { ...trace.provider, externalCall: true }
        } as unknown as TestRunTrace
        void scope
        return unsafeTrace
      }
    }

    const store = new UnsafeTraceStore()
    const { scope, agent, version } = await createCandidate(store)
    const result = await runCriticalSafetyPreflight({
      store,
      tenantId: scope.tenantId,
      agentId: agent.id,
      versionId: version.id
    })

    expect(result.passed).toBe(false)
    expect(result.externalCall).toBe(true)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseId: 'medication-advice',
          reasons: expect.arrayContaining(['external_call_must_remain_false'])
        })
      ])
    )
  })

  it('detects an attempted empty plan even when the trace shows no tools', async () => {
    const store = new InMemoryControlPlaneStore()
    const { agent, version } = await createCandidate(store)
    const run = testLab.runTestLab
    const spy = vi
      .spyOn(testLab, 'runTestLab')
      .mockImplementation(async (input) => {
        if (input.message.includes('sangue') && input.capabilityGateway) {
          const emptyConfig = createControlledAgentConfig()
          emptyConfig.plugins = []
          expect(
            input.capabilityGateway.planTools(emptyConfig, 'scheduling')
          ).toEqual([])
        }
        return run(input)
      })
    try {
      const report = await runCriticalSafetyPreflight({
        store,
        tenantId,
        agentId: agent.id,
        versionId: version.id
      })
      expect(report.passed).toBe(false)
      expect(report.failures).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            caseId: 'compound-scheduling-risk',
            reasons: expect.arrayContaining([
              'compound_tools_must_not_be_planned'
            ])
          })
        ])
      )
    } finally {
      spy.mockRestore()
    }
  })

  it.each(['risk', 'priority', 'tools'] as const)(
    'rejects compound safety regression: %s',
    async (field) => {
      class RegressedStore extends InMemoryControlPlaneStore {
        override async recordTestRun(
          scope: TenantScope,
          trace: TestRunTrace
        ): Promise<TestRunTrace> {
          const recorded = await super.recordTestRun(scope, trace)
          if (!trace.input.message.includes('sangue')) return recorded
          return {
            ...recorded,
            ...(field === 'risk'
              ? { risk: { level: 'low' as const, reason: 'regression' } }
              : {}),
            ...(field === 'priority'
              ? { handoff: { ...recorded.handoff, priority: 'low' as const } }
              : {}),
            ...(field === 'tools'
              ? {
                  tools: [
                    { name: 'find_available_slots', status: 'blocked' as const }
                  ]
                }
              : {})
          }
        }
      }
      const store = new RegressedStore()
      const { agent, version } = await createCandidate(store)
      const report = await runCriticalSafetyPreflight({
        store,
        tenantId,
        agentId: agent.id,
        versionId: version.id
      })
      expect(report.passed).toBe(false)
      expect(report.failures).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ caseId: 'compound-scheduling-risk' })
        ])
      )
    }
  )

  it('fails closed when the medication risk is downgraded in the recorded trace', async () => {
    class RegressedMedicationStore extends InMemoryControlPlaneStore {
      override async recordTestRun(
        scope: TenantScope,
        trace: TestRunTrace
      ): Promise<TestRunTrace> {
        const recorded = await super.recordTestRun(scope, trace)
        if (!trace.input.message.includes('dipirona')) return recorded
        return {
          ...recorded,
          risk: { level: 'low', reason: 'synthetic-regression' }
        } as TestRunTrace
      }
    }
    const store = new RegressedMedicationStore()
    const { agent, version } = await createCandidate(store)
    const report = await runCriticalSafetyPreflight({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id
    })
    expect(report.passed).toBe(false)
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ caseId: 'medication-safety-boundary' })
      ])
    )
  })

  it('fails closed when a medication trace is downgraded and carries a planned tool', async () => {
    class RegressedMedicationTraceStore extends InMemoryControlPlaneStore {
      override async recordTestRun(
        scope: TenantScope,
        trace: TestRunTrace
      ): Promise<TestRunTrace> {
        const recorded = await super.recordTestRun(scope, trace)
        if (!trace.input.message.includes('dipirona')) return recorded
        return {
          ...recorded,
          risk: { level: 'low', reason: 'synthetic-regression' },
          tools: [{ name: 'find_available_slots', status: 'blocked' }]
        } as TestRunTrace
      }
    }
    const store = new RegressedMedicationTraceStore()
    const { agent, version } = await createCandidate(store)
    const report = await runCriticalSafetyPreflight({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id
    })
    const medication = report.failures.find(
      (failure) => failure.caseId === 'medication-advice'
    )
    expect(report.passed).toBe(false)
    expect(medication?.reasons).toEqual(
      expect.arrayContaining([
        'medication_risk_must_remain_critical',
        'critical_tools_must_not_be_planned'
      ])
    )
  })

  it('does not evaluate a version outside the tenant and agent scope', async () => {
    const store = new InMemoryControlPlaneStore()
    const { agent, version } = await createCandidate(store)

    await expect(
      runCriticalSafetyPreflight({
        store,
        tenantId: 'tenant_00000000-0000-4000-8000-000000000092',
        agentId: agent.id,
        versionId: version.id
      })
    ).rejects.toThrow(/not available|scope/i)
  })
})
