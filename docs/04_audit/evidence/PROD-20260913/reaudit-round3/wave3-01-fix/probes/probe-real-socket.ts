/**
 * Real-socket companion probe: same discrimination over a listening HTTP
 * server (not app.inject), to close the "inject-only" limitation.
 * First request: 400 invalid_action. Second request, same token, new TCP
 * request: 401 unauthorized.
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
    keyId: 'kid_wave3_socket',
    secret: 'wave3-socket-secret-abcdefghijklmnopqrst'
  }
  const tenantA = 'tenant_00000000-0000-4000-8000-0000000009a1'
  const keyRing = createLocalIdentityKeyRing({ current: key })
  const resolver = createTrustedOperatorIdentityResolver({
    keyRing,
    now: () => now
  })
  const token = createTrustedOperatorIdentityToken(
    {
      operatorId: 'operator.wave3.socket',
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
  await app.listen({ port: 0, host: '127.0.0.1' })
  const address = app.server.address()
  if (!address || typeof address === 'string') throw new Error('no address')
  const base = `http://127.0.0.1:${address.port}`
  const url = `${base}/v1/admin/capability-approvals/approval_00000000-0000-4000-8000-0000000009f1/revoke`
  const headers = {
    [TRUSTED_OPERATOR_TOKEN_HEADER]: token,
    'x-tenant-id': tenantA
  }

  const first = await fetch(url, { method: 'POST', headers })
  const firstBody = (await first.json()) as Envelope
  const second = await fetch(url, { method: 'POST', headers })
  const secondBody = (await second.json()) as Envelope

  console.log(
    JSON.stringify(
      {
        realSocket: {
          first: { status: first.status, code: firstBody.error?.code ?? null },
          second: {
            status: second.status,
            code: secondBody.error?.code ?? null
          },
          expected: { first: 400, second: 401 }
        }
      },
      null,
      2
    )
  )
  await app.close()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
