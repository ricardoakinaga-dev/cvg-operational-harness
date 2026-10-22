// SPEC0251 §8: same composition as playwright.rem21-014.config.ts (dev API,
// NODE_ENV=test, CVG_IDENTITY_MODE=trusted, synthetic keyring, memory) —
// what do the task/approval queues answer to a trusted Supervisor session?
import { buildApiWithProductionSessions } from '/mnt/dados/cvg-work/cvg-d9ef-casescope-20261021/apps/api/src/production-bootstrap.ts'
import { createConfiguredOperatorIdentityResolver } from '/mnt/dados/cvg-work/cvg-d9ef-casescope-20261021/apps/api/src/operator-identity.ts'
import { createTrustedOperatorIdentityToken } from '/mnt/dados/cvg-work/cvg-d9ef-casescope-20261021/apps/api/src/operator-identity.ts'

const secret = ['rem21', '014', 'e2e', 'synthetic', 'key', '2026', '09', '22', 'abcdefghijklmnop'].join('-') // synthetic E2E key from playwright.rem21-014.config.ts
const env = {
  NODE_ENV: 'test',
  API_PERSISTENCE_MODE: 'memory',
  CVG_IDENTITY_MODE: 'trusted',
  CVG_OPERATOR_IDENTITY_KEYRING: JSON.stringify({ current: { keyId: 'rem21-014-e2e', secret } })
}
const resolver = createConfiguredOperatorIdentityResolver(env as never)
const app = await buildApiWithProductionSessions(env as never, { operatorIdentityResolver: resolver } as never)
const out: Record<string, unknown> = {}
for (const role of ['Operator', 'Approver', 'Supervisor', 'Admin'] as const) {
  const token = createTrustedOperatorIdentityToken(
    { operatorId: `${role.toLowerCase()}.rem21.probe`, role, tenantId: 'tenant_00000000-0000-4000-8000-000000000001' },
    { keyId: 'rem21-014-e2e', secret } as never, Date.now, 120
  )
  const login = await app.inject({ method: 'GET', url: '/v1/session', headers: { 'x-cvg-operator-token': token } })
  const cookie = String(login.headers['set-cookie']).split(';')[0]
  const row: Record<string, unknown> = { login: `${login.statusCode} ${login.body.slice(0, 160)}` }
  for (const url of ['/v1/tasks?status=open,in_progress&limit=25&offset=0', '/v1/approvals?status=pending&limit=25&offset=0', '/v1/conversations?limit=25&offset=0']) {
    const r = await app.inject({ method: 'GET', url, headers: { cookie } })
    row[url.split('?')[0]] = `${r.statusCode} ${r.json().error?.code ?? 'ok'}`
  }
  out[role] = row
}
await app.close()
console.log(JSON.stringify(out, null, 2))
