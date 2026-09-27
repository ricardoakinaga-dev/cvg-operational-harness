import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import type { OperatorIdentity } from '@cvg/shared'
import { installOperatorSessionHook } from '../operator-session-hook.ts'
import type {
  OperatorSessionRecord,
  OperatorSessionStore
} from '../operator-session.ts'

const identity: OperatorIdentity = {
  operatorId: 'operator.synthetic.hook',
  role: 'Supervisor',
  tenantId: 'tenant_00000000-0000-4000-8000-000000000701'
}
const sessionId = 'opsess_synthetic_cookie_reload'
const record: OperatorSessionRecord = {
  sessionId,
  identity,
  expiresAt: Date.now() + 60_000
}

describe('operator session store outage boundary', () => {
  it('preserves a valid cookie during an outage and resumes after recovery', async () => {
    const app = Fastify()
    let unavailable = true
    const store: OperatorSessionStore = {
      async create() {
        return record
      },
      async get(id) {
        if (unavailable) throw new Error('synthetic database outage')
        return id === sessionId ? record : null
      },
      async revoke() {}
    }
    const sessionIdentityByHeaders = new WeakMap<
      object,
      OperatorIdentity | null
    >()
    installOperatorSessionHook({
      app,
      enforceHttps: true,
      operatorSessionStore: store,
      sessionIdentityByHeaders,
      sessionRecordByHeaders: new WeakMap(),
      sessionStoreFailureByHeaders: new WeakSet()
    })
    app.get('/protected', async (request) => ({
      identity: sessionIdentityByHeaders.get(request.headers)
    }))

    const cookie = `cvg_operator_session=${sessionId}`
    const outage = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie }
    })
    expect(outage.statusCode).toBe(503)
    expect(outage.headers['cache-control']).toBe('no-store')
    expect(outage.headers['set-cookie']).toBeUndefined()
    expect(outage.json()).toMatchObject({
      success: false,
      error: { code: 'configuration_error' }
    })

    unavailable = false
    const recovered = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie }
    })
    expect(recovered.statusCode).toBe(200)
    expect(recovered.json()).toEqual({ identity })
    await app.close()
  })
})
