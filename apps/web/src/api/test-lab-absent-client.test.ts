import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, type OperatorIdentity } from './client.ts'

const identity: OperatorIdentity & { tenantId: string } = {
  operatorId: 'admin.lab',
  role: 'Admin',
  tenantId: 'tenant_00000000-0000-0000-0000-000000000317'
}

const agentId = 'agent_00000000-0000-4000-8000-000000000317'

function failure(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    json: () =>
      Promise.resolve({
        success: false,
        data: null,
        error: { code: 'request_failed', message: 'Request failed' }
      })
  } as Response)
}

afterEach(() => vi.restoreAllMocks())

describe('SPEC 0317 G3 console outside the test profile', () => {
  it('shows empty lab lists instead of failing the panel on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => failure(404))
    await expect(apiClient.listPlatformTestRuns(identity)).resolves.toEqual([])
    await expect(
      apiClient.listPlatformTestSuites(identity, agentId)
    ).resolves.toEqual([])
  })

  it('keeps every other failure visible', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => failure(403))
    await expect(
      apiClient.listPlatformTestRuns(identity)
    ).rejects.toMatchObject({ status: 403 })
  })
})
