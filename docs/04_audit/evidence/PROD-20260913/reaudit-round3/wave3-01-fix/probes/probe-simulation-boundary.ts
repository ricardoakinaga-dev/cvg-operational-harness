/**
 * Boundary probe: simulation mode + replay-protected resolver on the
 * double-resolving admin route. The memoization is intentionally trusted-only,
 * so this documents the pre-existing shape outside the fix's claimed scope.
 */
import { join } from 'node:path'

interface Envelope {
  success: boolean
  error: { code: string; message: string } | null
}

async function main() {
  const root = process.env.PROBE_ROOT
  if (!root) throw new Error('PROBE_ROOT is required')

  const { buildServer } = await import(join(root, 'apps/api/src/server.ts'))
  const {
    TRUSTED_OPERATOR_TOKEN_HEADER,
    createLocalIdentityKeyRing,
    createTrustedOperatorIdentityResolver,
    createTrustedOperatorIdentityToken
  } = await import(join(root, 'apps/api/src/operator-identity.ts'))

  const now = 1_700_000_000_000
  const key = {
    keyId: 'kid_wave3_sim',
    secret: 'wave3-sim-secret-abcdefghijklmnopqrst'
  }
  const tenantA = 'tenant_00000000-0000-4000-8000-0000000009a1'
  const keyRing = createLocalIdentityKeyRing({ current: key })
  const resolver = createTrustedOperatorIdentityResolver({
    keyRing,
    now: () => now
  })
  const token = createTrustedOperatorIdentityToken(
    {
      operatorId: 'operator.wave3.simulation',
      role: 'Supervisor',
      tenantId: tenantA
    },
    key,
    () => now
  )

  const app = buildServer({
    identityMode: 'simulation',
    operatorIdentityResolver: resolver
  })
  const response = await app.inject({
    method: 'POST',
    url: '/v1/admin/capability-approvals/approval_00000000-0000-4000-8000-0000000009f1/revoke',
    headers: {
      [TRUSTED_OPERATOR_TOKEN_HEADER]: token,
      'x-tenant-id': tenantA
    }
  })
  const body = response.json() as Envelope
  console.log(
    JSON.stringify({
      simulationModeWithReplayProtectedResolver: {
        status: response.statusCode,
        code: body.error?.code ?? null,
        note: 'outside the fix scope (memo is trusted-only); recorded for completeness'
      }
    })
  )
  await app.close()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
