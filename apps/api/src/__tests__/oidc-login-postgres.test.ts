// @vitest-environment node
/**
 * SPEC0254 O9 and the PostgreSQL part of O6. Composition through
 * `buildApiWithProductionSessions` → `buildServerFromEnv` with the §7
 * environment (NODE_ENV=test, RLS, migration credential, dedicated session
 * role) and the synthetic IdP over the in-memory transport.
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention); a required
 * gate sets OIDC0254_PG_REQUIRED=1 and a missing database fails instead.
 */
import type { InjectOptions, LightMyRequestResponse } from 'fastify'
import { CompositeTelemetry } from '@cvg/observability'
import type { TenantId } from '@cvg/platform'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  PrincipalProducerError,
  produceVerifiedPrincipal
} from '../case-principal-producer.ts'
import { buildApiWithProductionSessions } from '../production-bootstrap.ts'
import type { buildServer } from '../server.ts'
import {
  createOidcPostgresFixture,
  type OidcPostgresFixture
} from './support/oidc-postgres-fixture.ts'
import {
  cookiePair,
  expectedOperatorId,
  findLeaks,
  setCookies,
  SyntheticOidcIssuer,
  syntheticClientMaterial,
  syntheticGroupMatrix,
  syntheticOidcEnv,
  SYNTHETIC_TENANT_A,
  SYNTHETIC_TENANT_B,
  type SyntheticUser
} from './support/synthetic-oidc-issuer.ts'

const databaseUrl = process.env.TEST_DATABASE_URL
if (process.env.OIDC0254_PG_REQUIRED === '1' && !databaseUrl) {
  throw new Error('OIDC0254_PG_REQUIRED=1 requires TEST_DATABASE_URL')
}
const describePg = databaseUrl ? describe : describe.skip

const ISSUER = 'https://idp.synthetic.test'
const CONSOLE = 'https://console.synthetic.test'
const REDIRECT = 'https://api.synthetic.test/v1/auth/oidc/callback'
const CLIENT = 'cvg-synthetic-console'
const material = syntheticClientMaterial()

type App = ReturnType<typeof buildServer>
type Inject = LightMyRequestResponse

function newIssuer() {
  return new SyntheticOidcIssuer({
    issuer: ISSUER,
    clientId: CLIENT,
    clientSecret: material.clientSecret,
    redirectUri: REDIRECT,
    groupsClaim: 'synthetic_groups'
  })
}

function environment(
  fixture: OidcPostgresFixture,
  matrix: unknown = syntheticGroupMatrix()
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    CVG_IDENTITY_MODE: 'trusted',
    API_ALLOWED_ORIGINS: CONSOLE,
    ...fixture.env,
    ...syntheticOidcEnv({
      issuer: ISSUER,
      clientId: CLIENT,
      clientSecret: material.clientSecret,
      pendingCookieKey: material.pendingCookieKey,
      redirectUri: REDIRECT,
      consoleOrigin: CONSOLE,
      matrix
    })
  }
}

interface Opened {
  app: App
  telemetry: CompositeTelemetry
  texts: string[]
  inject: (options: InjectOptions) => Promise<Inject>
}

async function open(
  fixture: OidcPostgresFixture,
  idp: SyntheticOidcIssuer,
  matrix?: unknown
): Promise<Opened> {
  const telemetry = new CompositeTelemetry()
  const app = (await buildApiWithProductionSessions(
    environment(fixture, matrix),
    { oidcTransport: idp.fetch, telemetry } as never
  )) as unknown as App
  const texts: string[] = []
  return {
    app,
    telemetry,
    texts,
    inject: async (options) => {
      const response = await app.inject(options)
      const opts = options as { method?: string; url?: unknown }
      texts.push(JSON.stringify(response.headers))
      if (
        !(
          opts.method === 'POST' &&
          opts.url === '/v1/auth/oidc/start' &&
          response.statusCode === 200
        )
      ) {
        texts.push(response.body)
      }
      return response
    }
  }
}

async function login(
  target: Opened,
  idp: SyntheticOidcIssuer,
  user: SyntheticUser,
  cookie?: string
): Promise<Inject & { session?: string }> {
  const start = await target.inject({
    method: 'POST',
    url: '/v1/auth/oidc/start',
    headers: { origin: CONSOLE, ...(cookie ? { cookie } : {}) }
  })
  expect(start.statusCode).toBe(200)
  const pending = cookiePair(
    setCookies(start.headers['set-cookie']).find((value) =>
      value.startsWith('cvg_oidc_pending=')
    )!
  )
  const authorized = await idp.login(start.json().data.authorizationUrl, user)
  expect(authorized.status).toBe(302)
  const callback = new URL(authorized.location!)
  const response = await target.inject({
    method: 'GET',
    url: `${callback.pathname}${callback.search}`,
    headers: { cookie: pending }
  })
  const session = setCookies(response.headers['set-cookie']).find(
    (value) =>
      value.startsWith('cvg_operator_session=opsess_') &&
      !value.includes('Max-Age=0')
  )
  return Object.assign(
    response,
    session ? { session: cookiePair(session) } : {}
  )
}

/** SPEC0259 §4.5: a refused login lands on the console, never JSON. */
function expectRefusedLanding(response: Inject) {
  expect(response.statusCode).toBe(303)
  expect(response.headers.location).toBe(`${CONSOLE}/#cvg-login=negado`)
  expect(response.body).toBe('')
}

async function seedConversation(
  target: Opened,
  tenantId: string,
  marker: string
) {
  const response = await target.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    headers: { 'x-tenant-id': tenantId },
    payload: {
      externalMessageId: `oidc0254-${marker}-${Math.random()}`,
      senderRef: `+55119${Math.floor(Math.random() * 10_000_000)}`,
      body: `Synthetic ${marker}`,
      receivedAt: '2026-10-22T12:00:00.000Z'
    }
  })
  expect(response.statusCode).toBe(200)
  return response.json().data as { conversationId: string }
}

describePg('SPEC0254 O9 — OIDC login with PostgreSQL in process', () => {
  let fixture: OidcPostgresFixture
  const idp = newIssuer()
  const apps: App[] = []

  beforeAll(async () => {
    fixture = await createOidcPostgresFixture(databaseUrl!)
  }, 120_000)

  afterAll(async () => {
    for (const app of apps) await app.close().catch(() => undefined)
    await fixture?.close()
  })

  it('authorizes by tenant, role and grant with verified principals', async () => {
    const target = await open(fixture, idp)
    apps.push(target.app)
    const supervisor = idp.addUser({ groups: ['synthetic-a-supervisor'] })
    const operator = idp.addUser({ groups: ['synthetic-a-operator'] })
    const approver = idp.addUser({ groups: ['synthetic-a-approver'] })
    const operatorB = idp.addUser({ groups: ['synthetic-b-operator'] })
    const sessions: Record<string, string> = {}
    for (const [name, user] of Object.entries({
      supervisor,
      operator,
      approver,
      operatorB
    })) {
      const response = await login(target, idp, user)
      expect(response.statusCode, name).toBe(303)
      sessions[name] = response.session!
    }
    const x = await seedConversation(target, SYNTHETIC_TENANT_A, 'X')
    const y = await seedConversation(target, SYNTHETIC_TENANT_A, 'Y')
    const z = await seedConversation(target, SYNTHETIC_TENANT_B, 'Z')
    const cases = await target.inject({
      method: 'GET',
      url: `/v1/cases?kind=core_conversation&resourceId=${x.conversationId}`,
      headers: { cookie: sessions.supervisor! }
    })
    expect(cases.statusCode).toBe(200)
    const caseX = cases.json().data.items[0].caseId as string
    const operatorId = expectedOperatorId(ISSUER, operator.sub)
    const grant = await target.inject({
      method: 'PUT',
      url: `/v1/cases/${caseX}/assignments/${operatorId}`,
      headers: { cookie: sessions.supervisor!, origin: CONSOLE },
      payload: { status: 'ACTIVE', expectedRevision: 0 }
    })
    expect(grant.statusCode).toBe(200)
    const read = (who: string, conversationId: string) =>
      target.inject({
        method: 'GET',
        url: `/v1/conversations/${conversationId}/timeline`,
        headers: { cookie: sessions[who]! }
      })
    expect((await read('operator', x.conversationId)).statusCode).toBe(200)
    expect((await read('operator', y.conversationId)).statusCode).toBe(404)
    expect((await read('approver', x.conversationId)).statusCode).toBe(404)
    expect((await read('supervisor', y.conversationId)).statusCode).toBe(200)
    expect((await read('operatorB', x.conversationId)).statusCode).toBe(404)
    expect((await read('operatorB', z.conversationId)).statusCode).toBe(404)

    const rows = await fixture.admin.query<{
      identity_source: string
      authority_version: string
      proof_digest: string
      revision: number
      role: string
    }>(
      `SELECT identity_source, authority_version, proof_digest, revision::int AS revision, role
         FROM ${fixture.data}.case_principals
        WHERE tenant_id = $1 AND operator_id = $2`,
      [SYNTHETIC_TENANT_A, operatorId]
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0]).toMatchObject({
      identity_source: 'verified_adapter',
      role: 'Operator',
      revision: 1
    })
    expect(rows.rows[0]!.authority_version).toMatch(/^oidc-v1-[0-9a-f]{64}$/)
    expect(rows.rows[0]!.proof_digest).toMatch(/^[0-9a-f]{64}$/)

    // Drift under the same N: refused without a write.
    ;(operator as { groups: unknown }).groups = ['synthetic-a-supervisor']
    expectRefusedLanding(await login(target, idp, operator))
    // Disabled entry (P4): deactivates, and the open session is cut on cases.
    ;(operator as { groups: unknown }).groups = ['synthetic-a-disabled']
    expectRefusedLanding(await login(target, idp, operator))
    const after = await fixture.admin.query<{
      active: boolean
      revision: number
    }>(
      `SELECT active, revision::int AS revision FROM ${fixture.data}.case_principals
        WHERE tenant_id = $1 AND operator_id = $2`,
      [SYNTHETIC_TENANT_A, operatorId]
    )
    expect(after.rows[0]).toEqual({ active: false, revision: 2 })
    expect((await read('operator', x.conversationId)).statusCode).toBe(401)

    const audits = await fixture.admin.query<{ payload: unknown }>(
      `SELECT payload FROM ${fixture.data}.audit_events
        WHERE payload->>'event' = 'case_principal_changed'`
    )
    const logs = target.telemetry.logs().map((log) => JSON.stringify(log))
    expect(
      findLeaks(
        [
          ...target.texts,
          ...logs,
          ...audits.rows.map((row) => JSON.stringify(row))
        ],
        idp.secrets
      )
    ).toEqual([])
  }, 60_000)

  it('creates one principal for two simultaneous first logins (O6, PG)', async () => {
    const target = await open(fixture, idp)
    apps.push(target.app)
    const user = idp.addUser({ groups: ['synthetic-a-approver'] })
    const flows = []
    for (let index = 0; index < 2; index += 1) {
      const start = await target.inject({
        method: 'POST',
        url: '/v1/auth/oidc/start',
        headers: { origin: CONSOLE }
      })
      const pending = cookiePair(
        setCookies(start.headers['set-cookie']).find((value) =>
          value.startsWith('cvg_oidc_pending=')
        )!
      )
      const authorized = await idp.login(
        start.json().data.authorizationUrl,
        user
      )
      const url = new URL(authorized.location!)
      flows.push({ path: `${url.pathname}${url.search}`, pending })
    }
    const sessionsBefore = await fixture.admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${fixture.auth}.operator_sessions`
    )
    const responses = await Promise.all(
      flows.map((flow) =>
        target.inject({
          method: 'GET',
          url: flow.path,
          headers: { cookie: flow.pending }
        })
      )
    )
    expect(responses.map((response) => response.statusCode)).toEqual([303, 303])
    const sessionsAfter = await fixture.admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${fixture.auth}.operator_sessions`
    )
    expect(sessionsAfter.rows[0]!.n - sessionsBefore.rows[0]!.n).toBe(2)
    const rows = await fixture.admin.query<{ revision: number }>(
      `SELECT revision::int AS revision FROM ${fixture.data}.case_principals
        WHERE tenant_id = $1 AND operator_id = $2`,
      [SYNTHETIC_TENANT_A, expectedOperatorId(ISSUER, user.sub)]
    )
    expect(rows.rows).toEqual([{ revision: 1 }])
  }, 60_000)

  it('applies every producer row on PostgreSQL (O6, PG)', async () => {
    const target = await open(fixture, idp)
    apps.push(target.app)
    const authority = target.app.caseAuthority
    const tenantId = SYNTHETIC_TENANT_A as TenantId
    const D = 'd'.repeat(64)
    const E = 'e'.repeat(64)
    const v = (n: number, digest = D) => `oidc-v${n}-${digest}`
    let counter = 0
    const operator = () => `oidc_pg_row_${(counter += 1)}`
    const read = (operatorId: string) =>
      authority.readSnapshot(tenantId, (s) => s.principal(operatorId))
    const seed = (
      operatorId: string,
      input: {
        role: 'Operator' | 'Supervisor'
        active: boolean
        authorityVersion: string
        identitySource?: 'verified_adapter' | 'synthetic_fixture'
      }
    ) =>
      authority.applyVerifiedPrincipalState({
        tenantId,
        operatorId,
        role: input.role,
        active: input.active,
        expectedRevision: 0,
        authorityVersion: input.authorityVersion,
        proofRef: 'synthetic-seed-proof',
        identitySource: input.identitySource ?? 'verified_adapter'
      })
    const produce = (
      operatorId: string,
      input: {
        role: 'Operator' | 'Supervisor'
        entryActive: boolean
        version: string
      }
    ) =>
      produceVerifiedPrincipal(authority, {
        tenantId,
        operatorId,
        role: input.role,
        entryActive: input.entryActive,
        authorityVersion: input.version,
        proofRef: `oidc-login:${'f'.repeat(64)}`
      })
    const reason = async (promise: Promise<unknown>) => {
      try {
        await promise
      } catch (error) {
        if (error instanceof PrincipalProducerError) return error.reasonCode
        throw error
      }
      return 'accepted'
    }
    const audits = async (operatorId: string) =>
      (
        await fixture.admin.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM ${fixture.data}.audit_events
            WHERE payload->>'event' = 'case_principal_changed'
              AND payload->>'subjectOperatorId' = $1`,
          [operatorId]
        )
      ).rows[0]!.n

    // Row 1 then row 8.
    const r1 = operator()
    await produce(r1, { role: 'Operator', entryActive: true, version: v(3) })
    await produce(r1, { role: 'Operator', entryActive: true, version: v(3) })
    expect(await read(r1)).toMatchObject({ revision: 1, active: true })
    expect(await audits(r1)).toBe(1)
    // Row 2.
    const r2 = operator()
    expect(
      await reason(
        produce(r2, { role: 'Operator', entryActive: false, version: v(3) })
      )
    ).toBe('inactive_group')
    expect(await read(r2)).toBeNull()
    // Row 3 (rollback and same N with another digest).
    for (const stored of [v(4), v(3, E)]) {
      const r3 = operator()
      await seed(r3, {
        role: 'Supervisor',
        active: true,
        authorityVersion: stored
      })
      expect(
        await reason(
          produce(r3, { role: 'Operator', entryActive: true, version: v(3) })
        )
      ).toBe('principal_version_ahead')
      expect(await read(r3)).toMatchObject({
        revision: 1,
        role: 'Supervisor',
        authorityVersion: stored
      })
    }
    // Row 4.
    const r4 = operator()
    await seed(r4, { role: 'Supervisor', active: true, authorityVersion: v(3) })
    expect(
      await reason(
        produce(r4, { role: 'Operator', entryActive: false, version: v(3) })
      )
    ).toBe('inactive_group')
    expect(await read(r4)).toMatchObject({
      revision: 2,
      active: false,
      role: 'Supervisor'
    })
    const deactivation = await fixture.admin.query<{
      payload: { active: boolean }
    }>(
      `SELECT payload FROM ${fixture.data}.audit_events
        WHERE payload->>'subjectOperatorId' = $1 ORDER BY created_at DESC LIMIT 1`,
      [r4]
    )
    expect(deactivation.rows[0]!.payload.active).toBe(false)
    // Row 5 and row 6.
    const r6 = operator()
    await seed(r6, { role: 'Operator', active: false, authorityVersion: v(3) })
    expect(
      await reason(
        produce(r6, { role: 'Operator', entryActive: false, version: v(3) })
      )
    ).toBe('inactive_group')
    expect(
      await reason(
        produce(r6, { role: 'Operator', entryActive: true, version: v(3) })
      )
    ).toBe('principal_inactive')
    expect((await read(r6))?.revision).toBe(1)
    // Row 7: reactivation and role update with a higher N; fixture upgrade.
    await produce(r6, { role: 'Supervisor', entryActive: true, version: v(4) })
    expect(await read(r6)).toMatchObject({
      revision: 2,
      active: true,
      role: 'Supervisor',
      authorityVersion: v(4)
    })
    const r7 = operator()
    await seed(r7, {
      role: 'Operator',
      active: true,
      authorityVersion: 'synthetic-authority-v1',
      identitySource: 'synthetic_fixture'
    })
    await produce(r7, { role: 'Operator', entryActive: true, version: v(3) })
    expect(await read(r7)).toMatchObject({
      revision: 2,
      identitySource: 'verified_adapter',
      authorityVersion: v(3)
    })
    // Row 9.
    const r9 = operator()
    await seed(r9, { role: 'Operator', active: true, authorityVersion: v(3) })
    expect(
      await reason(
        produce(r9, { role: 'Supervisor', entryActive: true, version: v(3) })
      )
    ).toBe('principal_drift')
    expect(await read(r9)).toMatchObject({ revision: 1, role: 'Operator' })
  }, 60_000)

  it('checks version mismatches per tenant under RLS (O6, PG)', async () => {
    const target = await open(fixture, idp)
    apps.push(target.app)
    const authority = target.app.caseAuthority
    const seed = (
      tenantId: string,
      operatorId: string,
      authorityVersion: string
    ) =>
      authority.applyVerifiedPrincipalState({
        tenantId: tenantId as TenantId,
        operatorId,
        role: 'Operator',
        active: true,
        expectedRevision: 0,
        authorityVersion,
        proofRef: 'synthetic-seed-proof',
        identitySource: 'verified_adapter'
      })
    const D = '7'.repeat(64)
    const E = '8'.repeat(64)
    await seed(SYNTHETIC_TENANT_A, 'oidc_pg_mismatch_a', `oidc-v77-${D}`)
    await seed(SYNTHETIC_TENANT_B, 'oidc_pg_mismatch_b', `oidc-v77-${E}`)
    const check = (tenantId: string, prefix: string, current: string) =>
      authority.readSnapshot(tenantId as TenantId, (s) =>
        s.hasPrincipalVersionMismatch(prefix, current)
      )
    expect(await check(SYNTHETIC_TENANT_A, 'oidc-v77-', `oidc-v77-${D}`)).toBe(
      false
    )
    expect(await check(SYNTHETIC_TENANT_A, 'oidc-v77-', `oidc-v77-${E}`)).toBe(
      true
    )
    expect(await check(SYNTHETIC_TENANT_B, 'oidc-v77-', `oidc-v77-${E}`)).toBe(
      false
    )
    expect(await check(SYNTHETIC_TENANT_A, 'oidc-v7-', `oidc-v7-${E}`)).toBe(
      false
    )
    expect(await check(SYNTHETIC_TENANT_A, 'oidc-v%-', `oidc-v%-${E}`)).toBe(
      false
    )
  }, 60_000)
})

describePg(
  'SPEC0254 O9 — ordered matrix version at boot and login (P5)',
  () => {
    let fixture: OidcPostgresFixture
    const idp = newIssuer()
    const apps: App[] = []

    beforeAll(async () => {
      fixture = await createOidcPostgresFixture(databaseUrl!)
    }, 120_000)

    afterAll(async () => {
      for (const app of apps) await app.close().catch(() => undefined)
      await fixture?.close()
    })

    it('refuses an edited matrix without a higher N, invalidates on a higher N and never rewrites on rollback', async () => {
      const base = syntheticGroupMatrix(3)
      const edited = {
        ...syntheticGroupMatrix(3),
        entries: [
          ...base.entries,
          {
            group: 'synthetic-a-extra',
            tenantId: SYNTHETIC_TENANT_A,
            role: 'Approver',
            active: true
          }
        ]
      }
      const user = idp.addUser({ groups: ['synthetic-a-operator'] })
      const operatorId = expectedOperatorId(ISSUER, user.sub)
      const v3 = await open(fixture, idp, base)
      apps.push(v3.app)
      const first = await login(v3, idp, user)
      expect(first.statusCode).toBe(303)
      const s3 = first.session!
      expect(
        (
          await v3.inject({
            method: 'GET',
            url: '/v1/conversations',
            headers: { cookie: s3 }
          })
        ).statusCode
      ).toBe(200)

      const editedBoot = await open(fixture, idp, edited).then(
        async (opened) => {
          await opened.app.close()
          return 'boot accepted the edited matrix'
        },
        (error: unknown) =>
          error instanceof Error ? error.message : String(error)
      )
      expect(editedBoot).toMatch(/matrix changed without a higher version/)

      const v4 = await open(fixture, idp, { ...edited, version: 4 })
      apps.push(v4.app)
      expect(
        (
          await v4.inject({
            method: 'GET',
            url: '/v1/conversations',
            headers: { cookie: s3 }
          })
        ).statusCode
      ).toBe(401)
      const second = await login(v4, idp, user)
      expect(second.statusCode).toBe(303)
      const principal4 = await v4.app.caseAuthority.readSnapshot(
        SYNTHETIC_TENANT_A as TenantId,
        (s) => s.principal(operatorId)
      )
      expect(principal4).toMatchObject({ revision: 2, active: true })
      expect(principal4!.authorityVersion).toMatch(/^oidc-v4-/)
      const s4 = second.session!

      const v2 = await open(fixture, idp, syntheticGroupMatrix(2))
      apps.push(v2.app)
      expectRefusedLanding(await login(v2, idp, user))
      const principal2 = await v2.app.caseAuthority.readSnapshot(
        SYNTHETIC_TENANT_A as TenantId,
        (s) => s.principal(operatorId)
      )
      expect(principal2).toEqual(principal4)
      expect(
        (
          await v2.inject({
            method: 'GET',
            url: '/v1/conversations',
            headers: { cookie: s4 }
          })
        ).statusCode
      ).toBe(401)
    }, 90_000)

    it('checks every tenant of the matrix at boot, not only the first', async () => {
      const v7 = await open(fixture, idp, syntheticGroupMatrix(7))
      apps.push(v7.app)
      // Only tenant B (the last tenant of the matrix) holds a principal of
      // N=7 with another digest.
      await v7.app.caseAuthority.applyVerifiedPrincipalState({
        tenantId: SYNTHETIC_TENANT_B as TenantId,
        operatorId: 'oidc_tenant_b_only',
        role: 'Operator',
        active: true,
        expectedRevision: 0,
        authorityVersion: `oidc-v7-${'c'.repeat(64)}`,
        proofRef: 'synthetic-seed-proof',
        identitySource: 'verified_adapter'
      })
      const reboot = await open(fixture, idp, syntheticGroupMatrix(7)).then(
        async (opened) => {
          await opened.app.close()
          return 'boot accepted the edited matrix'
        },
        (error: unknown) =>
          error instanceof Error ? error.message : String(error)
      )
      expect(reboot).toMatch(/matrix changed without a higher version/)
    }, 60_000)
  }
)
