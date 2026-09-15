/**
 * Independent critical probe (wave3): trusted identity composition.
 * Writes only to stdout; no repo mutation.
 */
import { createHmac } from 'node:crypto'
import { buildServer } from '/home/ricardo/cvg-agent-secretary-v2/apps/api/src/server.ts'
import {
  createTrustedOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '/home/ricardo/cvg-agent-secretary-v2/apps/api/src/operator-identity.ts'

const SECRET = 'critic-wave3-synthetic-secret-0123456789abcdef'
const T0 = 1_700_000_000_000
const now = () => T0
const tenantA = 'tenant_00000000-0000-4000-8000-0000000009a1'
const tenantB = 'tenant_00000000-0000-4000-8000-0000000009a2'

const results: Record<string, unknown> = {}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}
function sign(encoded: string, secret: string): string {
  return createHmac('sha256', secret).update(encoded, 'utf8').digest('base64url')
}
function rawToken(claims: Record<string, unknown>, secret = SECRET): string {
  const encoded = encode(claims)
  return `${encoded}.${sign(encoded, secret)}`
}
function errOf(json: unknown): string | undefined {
  return (json as { error?: { code?: string } })?.error?.code
}

async function main(): Promise<void> {
  const resolver = createTrustedOperatorIdentityResolver({ secret: SECRET, now })
  const app = buildServer({
    identityMode: 'trusted',
    operatorIdentityResolver: resolver
  })

  // (a) spoofed role header cannot promote an Operator token to Admin
  const operatorToken = createTrustedOperatorIdentityToken(
    { operatorId: 'critic.operator', role: 'Operator', tenantId: tenantA },
    SECRET,
    now
  )
  const spoofAdmin = await app.inject({
    method: 'GET',
    url: '/v1/admin/agents',
    headers: {
      'x-cvg-operator-token': operatorToken,
      'x-operator-id': 'attacker.simulation',
      'x-operator-role': 'Admin',
      'x-tenant-id': tenantA
    }
  })
  results.spoofedAdminHeader = {
    status: spoofAdmin.statusCode,
    code: errOf(spoofAdmin.json())
  }

  // (a2) tenant header must not widen/cross scope of trusted identity
  const supervisorToken = createTrustedOperatorIdentityToken(
    { operatorId: 'critic.supervisor', role: 'Supervisor', tenantId: tenantA },
    SECRET,
    now
  )
  const crossTenant = await app.inject({
    method: 'GET',
    url: '/v1/journeys/owner-drafts',
    headers: { 'x-cvg-operator-token': supervisorToken, 'x-tenant-id': tenantB }
  })
  results.crossTenantHeader = {
    status: crossTenant.statusCode,
    code: errOf(crossTenant.json())
  }

  // (b) no token => 401, headers alone never authorize
  const noToken = await app.inject({
    method: 'GET',
    url: '/v1/tasks',
    headers: {
      'x-operator-id': 'attacker.simulation',
      'x-operator-role': 'Admin',
      'x-tenant-id': tenantA
    }
  })
  results.simulationHeadersAlone = {
    status: noToken.statusCode,
    code: errOf(noToken.json())
  }

  // (c) expired token
  const expiredToken = createTrustedOperatorIdentityToken(
    { operatorId: 'critic.expired', role: 'Supervisor', tenantId: tenantA },
    SECRET,
    () => T0 - 400_000,
    100
  )
  const expired = await app.inject({
    method: 'GET',
    url: '/v1/tasks',
    headers: { 'x-cvg-operator-token': expiredToken }
  })
  results.expiredToken = { status: expired.statusCode, code: errOf(expired.json()) }

  // (d) wrong audience
  const wrongAudience = await app.inject({
    method: 'GET',
    url: '/v1/tasks',
    headers: {
      'x-cvg-operator-token': rawToken({
        operatorId: 'critic.audience',
        role: 'Supervisor',
        tenantId: tenantA,
        aud: 'other-api',
        iat: Math.floor(T0 / 1000),
        exp: Math.floor(T0 / 1000) + 300,
        jti: 'jti_00000000-0000-4000-8000-0000000000d1'
      })
    }
  })
  results.wrongAudience = {
    status: wrongAudience.statusCode,
    code: errOf(wrongAudience.json())
  }

  // (e) forged signature
  const forged = await app.inject({
    method: 'GET',
    url: '/v1/tasks',
    headers: {
      'x-cvg-operator-token': rawToken(
        {
          operatorId: 'critic.forged',
          role: 'Supervisor',
          tenantId: tenantA,
          aud: 'cvg-api',
          iat: Math.floor(T0 / 1000),
          exp: Math.floor(T0 / 1000) + 300,
          jti: 'jti_00000000-0000-4000-8000-0000000000d2'
        },
        'wrong-secret-wrong-secret-wrong-secret'
      )
    }
  })
  results.forgedSignature = { status: forged.statusCode, code: errOf(forged.json()) }

  // (f) replay of the same token (single-resolution route)
  const replayToken = createTrustedOperatorIdentityToken(
    { operatorId: 'critic.replay', role: 'Supervisor', tenantId: tenantA },
    SECRET,
    now
  )
  const first = await app.inject({
    method: 'GET',
    url: '/v1/tasks',
    headers: { 'x-cvg-operator-token': replayToken }
  })
  const replay = await app.inject({
    method: 'GET',
    url: '/v1/tasks',
    headers: { 'x-cvg-operator-token': replayToken }
  })
  results.replay = {
    first: first.statusCode,
    replay: replay.statusCode,
    replayCode: errOf(replay.json())
  }

  // (g) DOUBLE-RESOLUTION check on a route that calls requirePlatformScope
  //     (which resolves) and then resolveOperatorIdentity again.
  const revokeToken = createTrustedOperatorIdentityToken(
    { operatorId: 'critic.supervisor', role: 'Supervisor', tenantId: tenantA },
    SECRET,
    now
  )
  const revoke = await app.inject({
    method: 'POST',
    url: '/v1/admin/capability-approvals/approval_00000000-0000-4000-8000-0000000009f1/revoke',
    headers: { 'x-cvg-operator-token': revokeToken, 'x-tenant-id': tenantA }
  })
  results.doubleResolveRevokeTrusted = {
    status: revoke.statusCode,
    body: revoke.json()
  }

  await app.close()

  // control: same route + same role in simulation mode (no resolver, headers)
  const simApp = buildServer({ identityMode: 'simulation' })
  const simControl = await simApp.inject({
    method: 'POST',
    url: '/v1/admin/capability-approvals/approval_00000000-0000-4000-8000-0000000009f1/revoke',
    headers: {
      'x-operator-id': 'critic.supervisor',
      'x-operator-role': 'Supervisor',
      'x-tenant-id': tenantA
    }
  })
  results.doubleResolveRevokeSimulationControl = {
    status: simControl.statusCode,
    body: simControl.json()
  }
  await simApp.close()

  console.log(JSON.stringify(results, null, 1))
}

main().catch((error) => {
  console.log(
    JSON.stringify({ probe_error: error instanceof Error ? error.stack : String(error) })
  )
  process.exit(1)
})
