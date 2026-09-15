/**
 * Confirm the double-resolution defect also occurs through the exact
 * production composition mechanism (env key ring factory), not only static
 * secrets. Synthetic key only.
 */
import { buildServer } from '/home/ricardo/cvg-agent-secretary-v2/apps/api/src/server.ts'
import {
  createConfiguredOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '/home/ricardo/cvg-agent-secretary-v2/apps/api/src/operator-identity.ts'

const SECRET = 'factory-probe-secret-0123456789abcdefghij'
const tenant = 'tenant_00000000-0000-4000-8000-0000000009d1'
const results: Record<string, unknown> = {}

async function main(): Promise<void> {
  const resolver = createConfiguredOperatorIdentityResolver({
    NODE_ENV: 'test',
    CVG_IDENTITY_MODE: 'trusted',
    CVG_OPERATOR_IDENTITY_KEYRING: JSON.stringify({
      current: { keyId: 'kid_factory_2026', secret: SECRET }
    })
  })
  if (!resolver) throw new Error('resolver missing')
  const app = buildServer({
    identityMode: 'trusted',
    operatorIdentityResolver: resolver
  })
  const token = createTrustedOperatorIdentityToken(
    { operatorId: 'critic.factory', role: 'Supervisor', tenantId: tenant },
    { keyId: 'kid_factory_2026', secret: SECRET }
  )
  const revoke = await app.inject({
    method: 'POST',
    url: '/v1/admin/capability-approvals/approval_00000000-0000-4000-8000-0000000009f1/revoke',
    headers: { 'x-cvg-operator-token': token, 'x-tenant-id': tenant }
  })
  results.factoryKeyRingDoubleResolve = {
    status: revoke.statusCode,
    body: revoke.json()
  }
  await app.close()
  console.log(JSON.stringify(results, null, 1))
}

main().catch((error) => {
  console.log(JSON.stringify({ probe_error: String(error) }))
  process.exit(1)
})
