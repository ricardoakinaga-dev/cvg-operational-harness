import { describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'
import {
  TRUSTED_OPERATOR_TOKEN_HEADER,
  createLocalIdentityKeyRing,
  createTrustedOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '../operator-identity.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-0000000009a1'
const tenantB = 'tenant_00000000-0000-4000-8000-0000000009a2'

const simulationHeaders = {
  'x-operator-id': 'operator.simulation',
  'x-operator-role': 'Operator',
  'x-tenant-id': tenantA
}

const taskPayload = {
  sessionId: 'sess_00000000-0000-4000-8000-0000000009a1',
  title: 'Tarefa fictícia de identidade',
  description: 'Não deve ser criada sem identidade confiável',
  priority: 'medium',
  source: 'identity-trusted-resolver',
  idempotencyKey: 'identity-trusted-resolver-task'
}

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
}

describe('trusted identity mode', () => {
  it('does not fall back to simulation headers when no trusted resolver is configured', async () => {
    const app = buildServer({ identityMode: 'trusted' })
    const read = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: simulationHeaders
    })
    const mutation = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: simulationHeaders,
      payload: taskPayload
    })
    await app.close()

    expect(read.statusCode).toBe(401)
    expect((read.json() as Envelope<never>).error?.code).toBe('unauthorized')
    expect(mutation.statusCode).toBe(401)
    expect((mutation.json() as Envelope<never>).error?.code).toBe(
      'unauthorized'
    )
  })

  it('rejects spoofed role and tenant headers instead of trusting the simulation claims', async () => {
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: () => ({
        operatorId: 'trusted.operator',
        role: 'Operator',
        tenantId: tenantA
      })
    })
    const promoted = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: {
        'x-operator-id': 'attacker.simulation',
        'x-operator-role': 'Admin',
        'x-tenant-id': tenantA
      }
    })
    const crossTenant = await app.inject({
      method: 'GET',
      url: '/v1/journeys/owner-drafts',
      headers: { ...simulationHeaders, 'x-tenant-id': tenantB }
    })
    await app.close()

    expect(promoted.statusCode).toBe(403)
    expect((promoted.json() as Envelope<never>).error?.code).toBe('forbidden')
    expect(crossTenant.statusCode).toBe(403)
    expect((crossTenant.json() as Envelope<never>).error?.code).toBe(
      'forbidden'
    )
  })

  it('authorizes only through the trusted resolver and ignores simulation-only headers', async () => {
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: (headers) => {
        if (headers['x-cvg-operator-token'] !== 'trusted-synthetic-token') {
          throw new Error('Untrusted operator identity')
        }
        return {
          operatorId: 'trusted.operator',
          role: 'Supervisor',
          tenantId: tenantA
        }
      }
    })
    const denied = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: simulationHeaders
    })
    const allowed = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: {
        'x-cvg-operator-token': 'trusted-synthetic-token',
        'x-operator-id': 'attacker.simulation',
        'x-operator-role': 'Admin',
        'x-tenant-id': tenantA
      }
    })
    await app.close()

    expect(denied.statusCode).toBe(401)
    expect(allowed.statusCode).toBe(200)
    expect((allowed.json() as Envelope<unknown[]>).success).toBe(true)
  })

  it('rejects a trusted resolver identity that is not tenant-bound', async () => {
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: () => ({
        operatorId: 'trusted.operator',
        role: 'Supervisor'
      })
    })
    const response = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: simulationHeaders
    })
    await app.close()

    expect(response.statusCode).toBe(401)
    expect((response.json() as Envelope<never>).error?.code).toBe(
      'unauthorized'
    )
  })

  it('requires an identity for mutations in trusted mode even when the legacy flag is off', async () => {
    const app = buildServer({
      identityMode: 'trusted',
      requireAuthenticatedMutations: false,
      operatorIdentityResolver: (headers) => {
        if (headers['x-cvg-operator-token'] !== 'trusted-synthetic-token') {
          throw new Error('Untrusted operator identity')
        }
        return {
          operatorId: 'trusted.operator',
          role: 'Operator',
          tenantId: tenantA
        }
      }
    })
    const anonymous = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: taskPayload
    })
    const authenticated = await app.inject({
      method: 'POST',
      url: '/v1/journeys/owner-drafts',
      headers: { 'x-cvg-operator-token': 'trusted-synthetic-token' },
      payload: {
        phone: '+5511999900009',
        idempotencyKey: 'identity-trusted-auth-owner'
      }
    })
    await app.close()

    expect(anonymous.statusCode).toBe(401)
    expect((anonymous.json() as Envelope<never>).error?.code).toBe(
      'unauthorized'
    )
    expect(authenticated.statusCode).toBe(200)
  })

  it('keeps the explicit simulation mode working for the controlled UI flow', async () => {
    const app = buildServer({ identityMode: 'simulation' })
    const response = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: simulationHeaders
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect((response.json() as Envelope<unknown[]>).success).toBe(true)
  })

  it('serves a double-resolving admin route with a replay-protected resolver and still rejects cross-request replay', async () => {
    const now = 1_700_000_000_000
    const key = {
      keyId: 'kid_wave3_admin',
      secret: 'wave3-admin-secret-abcdefghijklmnopqrstuvwx'
    }
    const keyRing = createLocalIdentityKeyRing({ current: key })
    const resolver = createTrustedOperatorIdentityResolver({
      keyRing,
      now: () => now
    })
    const token = createTrustedOperatorIdentityToken(
      {
        operatorId: 'operator.wave3.supervisor',
        role: 'Supervisor',
        tenantId: tenantA
      },
      key,
      () => now
    )
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: resolver
    })
    try {
      const first = await app.inject({
        method: 'POST',
        url: '/v1/admin/capability-approvals/approval_00000000-0000-4000-8000-0000000009f1/revoke',
        headers: {
          [TRUSTED_OPERATOR_TOKEN_HEADER]: token,
          'x-tenant-id': tenantA
        }
      })
      expect(first.statusCode).toBe(400)
      expect((first.json() as Envelope<never>).error?.code).toBe(
        'invalid_action'
      )

      const replay = await app.inject({
        method: 'POST',
        url: '/v1/admin/capability-approvals/approval_00000000-0000-4000-8000-0000000009f1/revoke',
        headers: {
          [TRUSTED_OPERATOR_TOKEN_HEADER]: token,
          'x-tenant-id': tenantA
        }
      })
      expect(replay.statusCode).toBe(401)
      expect((replay.json() as Envelope<never>).error?.code).toBe(
        'unauthorized'
      )
    } finally {
      await app.close()
    }
  })
})
