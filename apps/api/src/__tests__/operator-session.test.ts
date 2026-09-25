import { describe, expect, it, vi } from 'vitest'
import type { OperatorIdentity } from '@cvg/shared'
import { buildServer } from '../server.ts'
import {
  createTrustedOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '../operator-identity.ts'
import {
  createInMemoryOperatorSessionStore,
  type OperatorSessionRecord,
  parseOperatorSessionCookie,
  type OperatorSessionStore
} from '../operator-session.ts'

const now = 1_800_000_000_000
const key = 'rem21-005-synthetic-signing-secret-abcdefghijkl'
const identity = {
  operatorId: 'operator.rem21.session',
  role: 'Supervisor' as const,
  tenantId: 'tenant_00000000-0000-4000-8000-000000000505'
}

function localSessionStore(): OperatorSessionStore {
  const records = new Map<string, OperatorSessionRecord>()
  return {
    async create(input: {
      identity: OperatorIdentity
      expiresAt: number
    }): Promise<OperatorSessionRecord> {
      const record: OperatorSessionRecord = {
        sessionId: 'session_rem21_005_synthetic',
        identity: input.identity,
        expiresAt: input.expiresAt
      }
      records.set(record.sessionId, record)
      return record
    },
    async get(sessionId: string): Promise<OperatorSessionRecord | null> {
      return records.get(sessionId) ?? null
    },
    async revoke(sessionId: string): Promise<void> {
      records.delete(sessionId)
    }
  }
}

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
}

describe('REM21-005 trusted operator session API', () => {
  it('exchanges one signed bootstrap token for an opaque cookie session', async () => {
    const resolver = createTrustedOperatorIdentityResolver({
      secret: key,
      now: () => now
    })
    const token = createTrustedOperatorIdentityToken(
      identity,
      key,
      () => now,
      120
    )
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: resolver,
      operatorSessionStore: localSessionStore()
    } as never)

    const bootstrap = await app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { 'x-cvg-operator-token': token }
    })
    expect(bootstrap.statusCode).toBe(200)
    const body = bootstrap.json() as Envelope<{
      identity: typeof identity
      expiresAt: string
    }>
    expect(body.data?.identity).toEqual(identity)
    expect(body.data?.expiresAt).toBe('2027-01-15T08:02:00.000Z')
    expect(bootstrap.headers['cache-control']).toBe('no-store')
    const cookie = String(bootstrap.headers['set-cookie']).split(';', 1)[0]
    expect(cookie).toMatch(/^cvg_operator_session=/)
    expect(cookie).not.toContain(identity.operatorId)

    const replay = await app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { 'x-cvg-operator-token': token }
    })
    expect(replay.statusCode).toBe(401)

    const protectedRead = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: { cookie }
    })
    expect(protectedRead.statusCode).toBe(200)

    const logout = await app.inject({
      method: 'POST',
      url: '/v1/session/logout',
      headers: { cookie }
    })
    expect(logout.statusCode).toBe(200)

    const repeatedLogout = await app.inject({
      method: 'POST',
      url: '/v1/session/logout',
      headers: { cookie }
    })
    expect(repeatedLogout.statusCode).toBe(200)

    const afterLogout = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: { cookie }
    })
    expect(afterLogout.statusCode).toBe(401)
    await app.close()
  })

  it('rejects missing, tampered and expired bootstrap tokens without opening a session', async () => {
    const resolver = createTrustedOperatorIdentityResolver({
      secret: key,
      now: () => now
    })
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: resolver,
      operatorSessionStore: localSessionStore()
    })
    const validToken = createTrustedOperatorIdentityToken(
      identity,
      key,
      () => now,
      120
    )
    const tamperedToken = `${validToken.slice(0, -1)}${
      validToken.endsWith('a') ? 'b' : 'a'
    }`
    const expiredToken = createTrustedOperatorIdentityToken(
      identity,
      key,
      () => now - 200_000,
      120
    )

    for (const token of [null, tamperedToken, expiredToken]) {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/session',
        headers: token ? { 'x-cvg-operator-token': token } : {}
      })
      expect(response.statusCode).toBe(401)
      expect(String(response.headers['set-cookie'])).not.toContain('opsess_')
    }
    await app.close()
  })

  it('fails closed when trusted session storage is not composed', async () => {
    const resolver = createTrustedOperatorIdentityResolver({
      secret: key,
      now: () => now
    })
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: resolver
    })
    const response = await app.inject({
      method: 'GET',
      url: '/v1/session'
    })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'configuration_error' }
    })
    const token = createTrustedOperatorIdentityToken(
      identity,
      key,
      () => now,
      120
    )
    const protectedRead = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: { 'x-cvg-operator-token': token }
    })
    expect(protectedRead.statusCode).toBe(503)
    expect(protectedRead.json()).toMatchObject({
      success: false,
      error: { code: 'configuration_error' }
    })
    await app.close()
  })

  it('does not let an unknown cookie bypass distributed token replay protection', async () => {
    const resolver = createTrustedOperatorIdentityResolver({
      secret: key,
      now: () => now
    })
    const claim = vi.fn(async () => false)
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: resolver,
      operatorSessionStore: localSessionStore(),
      tokenReplayStore: { claim }
    })
    const token = createTrustedOperatorIdentityToken(
      identity,
      key,
      () => now,
      120
    )
    const response = await app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: {
        cookie: 'cvg_operator_session=opsess_unknown',
        'x-cvg-operator-token': token
      }
    })
    expect(response.statusCode).toBe(401)
    expect(claim).toHaveBeenCalledTimes(1)
    await app.close()
  })

  it('rotates an active session when a new trusted bootstrap token is presented', async () => {
    const resolver = createTrustedOperatorIdentityResolver({
      secret: key,
      now: () => now
    })
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: resolver,
      operatorSessionStore: createInMemoryOperatorSessionStore()
    })
    const firstToken = createTrustedOperatorIdentityToken(
      identity,
      key,
      () => now,
      120
    )
    const nextIdentity = {
      ...identity,
      operatorId: 'operator.rem21.session.next'
    }
    const nextToken = createTrustedOperatorIdentityToken(
      nextIdentity,
      key,
      () => now,
      120
    )
    const first = await app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { 'x-cvg-operator-token': firstToken }
    })
    const firstCookie = String(first.headers['set-cookie']).split(';', 1)[0]
    const rotated = await app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: {
        cookie: firstCookie,
        'x-cvg-operator-token': nextToken
      }
    })
    const rotatedCookie = String(rotated.headers['set-cookie']).split(';', 1)[0]
    expect(rotated.statusCode).toBe(200)
    expect(rotated.json().data.identity).toEqual(nextIdentity)
    expect(rotatedCookie).not.toBe(firstCookie)

    const oldSession = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: { cookie: firstCookie }
    })
    const newSession = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: { cookie: rotatedCookie }
    })
    expect(oldSession.statusCode).toBe(401)
    expect(newSession.statusCode).toBe(200)
    await app.close()
  })

  it('rejects duplicate session cookies instead of selecting an attacker-controlled value', () => {
    expect(
      parseOperatorSessionCookie(
        'cvg_operator_session=opsess_first;cvg_operator_session=opsess_second'
      )
    ).toBeNull()
  })

  it('keeps cookie identity authoritative over forged role and tenant headers', async () => {
    const tenantA = 'tenant_00000000-0000-4000-8000-000000000505'
    const tenantB = 'tenant_00000000-0000-4000-8000-000000000506'
    const adminIdentity = {
      operatorId: 'operator.rem21.admin',
      role: 'Admin' as const,
      tenantId: tenantA
    }
    const adminResolver = createTrustedOperatorIdentityResolver({
      secret: key,
      now: () => now
    })
    const adminApp = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: adminResolver,
      operatorSessionStore: localSessionStore()
    })
    const adminToken = createTrustedOperatorIdentityToken(
      adminIdentity,
      key,
      () => now,
      120
    )
    const adminBootstrap = await adminApp.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { 'x-cvg-operator-token': adminToken }
    })
    const adminCookie = String(adminBootstrap.headers['set-cookie']).split(
      ';',
      1
    )[0]
    const crossTenant = await adminApp.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: { cookie: adminCookie, 'x-tenant-id': tenantB }
    })
    expect(crossTenant.statusCode).toBe(403)
    await adminApp.close()

    const operatorResolver = createTrustedOperatorIdentityResolver({
      secret: key,
      now: () => now
    })
    const operatorApp = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: operatorResolver,
      operatorSessionStore: localSessionStore()
    })
    const operatorToken = createTrustedOperatorIdentityToken(
      {
        ...adminIdentity,
        operatorId: 'operator.rem21.operator',
        role: 'Operator'
      },
      key,
      () => now,
      120
    )
    const operatorBootstrap = await operatorApp.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { 'x-cvg-operator-token': operatorToken }
    })
    const operatorCookie = String(
      operatorBootstrap.headers['set-cookie']
    ).split(';', 1)[0]
    const forgedRole = await operatorApp.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: {
        cookie: operatorCookie,
        'x-operator-id': 'attacker.admin',
        'x-operator-role': 'Admin',
        'x-tenant-id': tenantA
      }
    })
    expect(forgedRole.statusCode).toBe(403)
    await operatorApp.close()
  })
})
