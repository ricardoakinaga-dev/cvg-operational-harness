import { describe, expect, it, vi } from 'vitest'

const { runCriticalSafetyPreflight } = vi.hoisted(() => ({
  runCriticalSafetyPreflight: vi.fn()
}))

vi.mock('../critical-safety-preflight.ts', () => ({
  runCriticalSafetyPreflight
}))

import {
  createValidatedControlledReleaseCandidate,
  createControlledSecretaryConfig,
  ensureControlledSecretaryPreset
} from '../secretary-preset.ts'
import {
  InMemoryControlPlaneStore,
  type ControlPlaneStore
} from '../control-plane-store.ts'
import type { TenantId } from '../ids.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000451' as TenantId

function preflightReport(passed: boolean) {
  return {
    passed,
    caseCount: 10,
    externalCall: false,
    cases: [],
    failures: passed
      ? []
      : [{ caseId: 'fixture.case', reasons: ['fixture_failure'] }]
  }
}

describe('controlled secretary preset fail-closed branches', () => {
  it('does not publish when the safety preflight does not pass', async () => {
    runCriticalSafetyPreflight.mockResolvedValueOnce(preflightReport(false))
    const store = new InMemoryControlPlaneStore()

    await expect(
      ensureControlledSecretaryPreset(store, tenantId)
    ).rejects.toThrow(/safety preflight failed/)

    const agents = await store.listAgents({ tenantId })
    expect(agents).toHaveLength(1)
    expect(await store.resolvePublished({ tenantId }, agents[0]!.id)).toBeNull()
  })

  it('uses an independent validator for both creator identities', async () => {
    const store = new InMemoryControlPlaneStore()
    const scope = { tenantId }
    const agent = await store.createAgent(scope, {
      slug: 'release-fixture',
      name: 'Release Fixture',
      description: 'Synthetic release fixture'
    })

    const approverDraft = await store.createVersion(
      scope,
      agent.id,
      createControlledSecretaryConfig(),
      'approver.controlled'
    )
    const approverCandidate = await createValidatedControlledReleaseCandidate(
      store,
      tenantId,
      agent.id,
      approverDraft.id,
      'approver.controlled'
    )
    expect(approverCandidate.status).toBe('VALIDATED')
    expect(approverCandidate.validatedBy).toBe('admin.controlled')

    const otherDraft = await store.createVersion(
      scope,
      agent.id,
      createControlledSecretaryConfig(),
      'builder.coverage'
    )
    const otherCandidate = await createValidatedControlledReleaseCandidate(
      store,
      tenantId,
      agent.id,
      otherDraft.id,
      'builder.coverage'
    )
    expect(otherCandidate.status).toBe('VALIDATED')
    expect(otherCandidate.validatedBy).toBe('approver.controlled')
  })

  it('falls back to the created agent when the store hides the final read', async () => {
    runCriticalSafetyPreflight.mockResolvedValueOnce(preflightReport(true))
    const base = new InMemoryControlPlaneStore()
    const store = new Proxy(base, {
      get(target, property, receiver) {
        if (property === 'getAgent') return async () => null
        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      }
    }) as ControlPlaneStore

    const agent = await ensureControlledSecretaryPreset(store, tenantId)

    expect(agent).toMatchObject({
      slug: 'cvg-secretary',
      name: 'CVG Secretary',
      tenantId
    })
  })
})
