import { describe, expect, it } from 'vitest'
import { buildServerFromEnv } from '../server.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000001'

function adminHeaders() {
  return {
    'x-operator-id': 'admin.bootstrap',
    'x-operator-role': 'Admin',
    'x-tenant-id': tenantId
  }
}

describe('controlled Secretary bootstrap', () => {
  it('seeds only development memory mode with the fictitious preset', async () => {
    const app = await buildServerFromEnv({
      NODE_ENV: 'development',
      API_PERSISTENCE_MODE: 'memory',
      CVG_IDENTITY_MODE: 'simulation',
      WEBHOOK_SIGNING_SECRET: 'development-only-controlled-secret-123456'
    })

    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: adminHeaders()
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'cvg-secretary',
          name: 'CVG Secretary'
        })
      ])
    )
  })

  it('does not seed test mode, preserving isolated fixtures and E2E setup', async () => {
    const app = await buildServerFromEnv({
      NODE_ENV: 'test',
      API_PERSISTENCE_MODE: 'memory'
    })

    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: adminHeaders()
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual([])
  })
})
