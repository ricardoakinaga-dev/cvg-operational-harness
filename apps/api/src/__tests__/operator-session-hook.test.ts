import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import type { OperatorIdentity } from '@cvg/shared'
import {
  InMemoryCaseAuthority,
  InMemoryDatabase,
  type CaseAuthorityPort
} from '@cvg/persistence'
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
  expiresAt: Date.now() + 60_000,
  principalRevision: 1
}
const AUTHORITY_VERSION = 'synthetic-authority-v1'
const POLICY = {
  identityMode: 'trusted' as const,
  authorityVersion: AUTHORITY_VERSION
}

async function principalAuthority(): Promise<InMemoryCaseAuthority> {
  const authority = new InMemoryCaseAuthority(new InMemoryDatabase())
  await authority.applyVerifiedPrincipalState({
    tenantId: identity.tenantId as never,
    operatorId: identity.operatorId,
    role: 'Supervisor',
    active: true,
    expectedRevision: 0,
    authorityVersion: AUTHORITY_VERSION,
    proofRef: 'synthetic-proof',
    identitySource: 'synthetic_fixture'
  })
  return authority
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
      cookiePolicy: { profile: 'legacy', secure: true },
      operatorSessionStore: store,
      caseAuthority: await principalAuthority(),
      principalPolicy: POLICY,
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

  async function boundApp(authority: Pick<CaseAuthorityPort, 'readSnapshot'>) {
    const app = Fastify()
    const store: OperatorSessionStore = {
      async create() {
        return record
      },
      async get(id) {
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
      cookiePolicy: { profile: 'legacy', secure: true },
      operatorSessionStore: store,
      caseAuthority: authority,
      principalPolicy: POLICY,
      sessionIdentityByHeaders,
      sessionRecordByHeaders: new WeakMap(),
      sessionStoreFailureByHeaders: new WeakSet()
    })
    app.get('/protected', async (request) => ({
      identity: sessionIdentityByHeaders.get(request.headers)
    }))
    return app
  }
  const cookie = `cvg_operator_session=${sessionId}`

  it('SPEC 0262 §3: the bound revision is current => 200', async () => {
    const app = await boundApp(await principalAuthority())
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie }
    })
    expect(response.statusCode).toBe(200)
    await app.close()
  })

  it('a revision that moved (role restored later) retires the old cookie with 401 and clears it (R08)', async () => {
    const authority = await principalAuthority()
    // Deactivate (revision 2) and restore (revision 3): the cookie issued
    // under revision 1 must not come back to life.
    for (const [active, expectedRevision] of [
      [false, 1],
      [true, 2]
    ] as const) {
      await authority.applyVerifiedPrincipalState({
        tenantId: identity.tenantId as never,
        operatorId: identity.operatorId,
        role: 'Supervisor',
        active,
        expectedRevision,
        authorityVersion: AUTHORITY_VERSION,
        proofRef: 'synthetic-proof',
        identitySource: 'synthetic_fixture'
      })
    }
    const app = await boundApp(authority)
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie }
    })
    expect(response.statusCode).toBe(401)
    expect(String(response.headers['set-cookie'])).toContain('Max-Age=0')
    await app.close()
  })

  it('an inactive principal is 401; a missing principal is 401', async () => {
    const authority = await principalAuthority()
    await authority.applyVerifiedPrincipalState({
      tenantId: identity.tenantId as never,
      operatorId: identity.operatorId,
      role: 'Supervisor',
      active: false,
      expectedRevision: 1,
      authorityVersion: AUTHORITY_VERSION,
      proofRef: 'synthetic-proof',
      identitySource: 'synthetic_fixture'
    })
    for (const target of [
      authority,
      new InMemoryCaseAuthority(new InMemoryDatabase())
    ]) {
      const app = await boundApp(target)
      const response = await app.inject({
        method: 'GET',
        url: '/protected',
        headers: { cookie }
      })
      expect(response.statusCode).toBe(401)
      await app.close()
    }
  })

  it('a principal outage is 503 and keeps the cookie (no fallback to the session alone)', async () => {
    const app = await boundApp({
      readSnapshot: async () => {
        throw new Error('synthetic principal outage')
      }
    })
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie }
    })
    expect(response.statusCode).toBe(503)
    expect(response.headers['set-cookie']).toBeUndefined()
    await app.close()
  })

  it('without the producer authority version every protected path is 503', async () => {
    const app = Fastify()
    const store: OperatorSessionStore = {
      async create() {
        return record
      },
      async get() {
        return record
      },
      async revoke() {}
    }
    installOperatorSessionHook({
      app,
      cookiePolicy: { profile: 'legacy', secure: true },
      operatorSessionStore: store,
      caseAuthority: await principalAuthority(),
      principalPolicy: { identityMode: 'trusted', authorityVersion: null },
      sessionIdentityByHeaders: new WeakMap(),
      sessionRecordByHeaders: new WeakMap(),
      sessionStoreFailureByHeaders: new WeakSet()
    })
    app.get('/protected', async () => ({ ok: true }))
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie }
    })
    expect(response.statusCode).toBe(503)
    await app.close()
  })

  it('SPEC 0262 §6.1/R14: the global invalidation retires every cookie bound to the old revision, and a fresh binding works', async () => {
    const authority = await principalAuthority()
    const app = await boundApp(authority)
    const ok = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie }
    })
    expect(ok.statusCode).toBe(200)
    await authority.invalidateOperatorSessions({
      tenantId: identity.tenantId as never,
      operatorId: identity.operatorId,
      expectedRevision: 1,
      approvalRef: 'approval-ref-synthetic-0001',
      proofDigest: 'a'.repeat(64),
      localOperator: 'local.admin'
    })
    const retired = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie }
    })
    expect(retired.statusCode).toBe(401)
    expect(String(retired.headers['set-cookie'])).toContain('Max-Age=0')
    await app.close()
  })
})
