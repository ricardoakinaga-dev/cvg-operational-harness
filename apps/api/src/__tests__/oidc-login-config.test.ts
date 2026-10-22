// @vitest-environment node
/**
 * SPEC0254 O1 — the OIDC login configuration is validated without I/O and
 * refuses the boot before any pool, listener or poller. Every case runs
 * through `buildServerFromEnv` and `buildApiWithProductionSessions`; the
 * database URLs point to an unreachable port, so a refusal that reached the
 * network would surface as a connection error instead of the configuration
 * message asserted here.
 */
import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApiWithProductionSessions } from '../production-bootstrap.ts'
import { buildServerFromEnv } from '../server.ts'
import {
  syntheticClientMaterial,
  syntheticGroupMatrix,
  syntheticOidcEnv,
  SYNTHETIC_MFA_POLICY,
  SYNTHETIC_TENANT_A
} from './support/synthetic-oidc-issuer.ts'

const ISSUER = 'https://idp.synthetic.test'
const CONSOLE = 'https://console.synthetic.test'
const REDIRECT = 'https://api.synthetic.test/v1/auth/oidc/callback'
const material = syntheticClientMaterial()
const rateKeyRing = JSON.stringify({
  budgetSecret: randomBytes(32).toString('base64url'),
  current: {
    keyId: 'synthetic-rate',
    secret: randomBytes(32).toString('base64url')
  }
})
const unreachable = (role: string) =>
  `postgresql://${role}:synthetic@127.0.0.1:1/cvg_synthetic`

const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  CVG_IDENTITY_MODE: 'trusted',
  API_PERSISTENCE_MODE: 'postgres',
  POSTGRES_RLS_ENFORCEMENT: 'true',
  POSTGRES_AUTO_MIGRATE: 'false',
  POSTGRES_SCHEMA: 'cvg_synthetic_data',
  DATABASE_URL: unreachable('cvg_runtime'),
  DATABASE_MIGRATION_URL: unreachable('cvg_migration'),
  CVG_OPERATOR_SESSION_DATABASE_URL: unreachable('cvg_session'),
  CVG_OPERATOR_AUTH_SCHEMA: 'cvg_synthetic_auth',
  CVG_OPERATOR_SESSION_ROLE: 'cvg_session',
  CVG_RATE_LIMIT_KEYRING: rateKeyRing,
  API_ALLOWED_ORIGINS: CONSOLE,
  ...syntheticOidcEnv({
    issuer: ISSUER,
    clientSecret: material.clientSecret,
    pendingCookieKey: material.pendingCookieKey,
    redirectUri: REDIRECT,
    consoleOrigin: CONSOLE
  })
}

/** Production-valid surroundings, so parseEnv/production rules are not the cause. */
const productionEnv: NodeJS.ProcessEnv = {
  ...validEnv,
  NODE_ENV: 'production',
  DATABASE_MIGRATION_URL: undefined,
  API_REQUIRE_HTTPS: 'true',
  OUTBOX_DURABLE_INBOUND: 'true',
  INBOUND_TENANT_ID: SYNTHETIC_TENANT_A,
  INBOUND_AGENT_ID: 'agent_0254aaaa-0000-4000-8000-0000000000a1',
  WEBHOOK_SIGNING_SECRET: randomBytes(32).toString('base64url')
}

const developmentEnv: NodeJS.ProcessEnv = {
  ...validEnv,
  NODE_ENV: 'development',
  WEBHOOK_SIGNING_SECRET: randomBytes(32).toString('base64url')
}

function matrix(patch: Record<string, unknown>) {
  return JSON.stringify({ ...syntheticGroupMatrix(), ...patch })
}

function entries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    group: `synthetic-group-${index}`,
    tenantId: SYNTHETIC_TENANT_A,
    role: 'Operator',
    active: true
  }))
}

const firstEntry = syntheticGroupMatrix().entries[0]!

type Case = [string, NodeJS.ProcessEnv, RegExp]

const cases: Case[] = [
  // Partial configuration without the explicit mode.
  [
    'CVG_OIDC_ISSUER without mode',
    { ...validEnv, CVG_OPERATOR_LOGIN: undefined },
    /partial/
  ],
  [
    'CVG_OIDC_* with an empty mode',
    { ...validEnv, CVG_OPERATOR_LOGIN: '' },
    /partial/
  ],
  [
    'console origin alone',
    {
      NODE_ENV: 'test',
      API_PERSISTENCE_MODE: 'memory',
      CVG_OPERATOR_CONSOLE_ORIGIN: CONSOLE
    },
    /partial/
  ],
  [
    'a single CVG_OIDC_* variable alone',
    {
      NODE_ENV: 'test',
      API_PERSISTENCE_MODE: 'memory',
      CVG_OIDC_CLIENT_ID: 'cvg-synthetic-console'
    },
    /partial/
  ],
  [
    'unknown mode',
    { ...validEnv, CVG_OPERATOR_LOGIN: 'saml' },
    /CVG_OPERATOR_LOGIN/
  ],
  [
    'mode in other case',
    { ...validEnv, CVG_OPERATOR_LOGIN: 'OIDC' },
    /CVG_OPERATOR_LOGIN/
  ],
  // Environment.
  ['production', productionEnv, /not qualified for this environment/],
  ['development', developmentEnv, /not qualified for this environment/],
  // Identity, persistence, RLS, migration credential.
  [
    'identity mode absent',
    { ...validEnv, CVG_IDENTITY_MODE: undefined },
    /CVG_IDENTITY_MODE/
  ],
  [
    'simulation identity',
    { ...validEnv, CVG_IDENTITY_MODE: 'simulation' },
    /CVG_IDENTITY_MODE/
  ],
  [
    'memory persistence',
    { ...validEnv, API_PERSISTENCE_MODE: 'memory' },
    /API_PERSISTENCE_MODE/
  ],
  [
    'persistence absent (memory default)',
    { ...validEnv, API_PERSISTENCE_MODE: undefined },
    /API_PERSISTENCE_MODE/
  ],
  [
    'RLS disabled',
    { ...validEnv, POSTGRES_RLS_ENFORCEMENT: 'false' },
    /POSTGRES_RLS_ENFORCEMENT/
  ],
  [
    'RLS absent',
    { ...validEnv, POSTGRES_RLS_ENFORCEMENT: undefined },
    /POSTGRES_RLS_ENFORCEMENT/
  ],
  [
    'no migration credential',
    { ...validEnv, DATABASE_MIGRATION_URL: undefined },
    /DATABASE_MIGRATION_URL/
  ],
  [
    'migration role equal to runtime',
    { ...validEnv, DATABASE_MIGRATION_URL: unreachable('cvg_runtime') },
    /DATABASE_MIGRATION_URL/
  ],
  [
    'migration role equal to session role',
    { ...validEnv, DATABASE_MIGRATION_URL: unreachable('cvg_session') },
    /DATABASE_MIGRATION_URL/
  ],
  // HMAC and the local OIDC hypothesis are excluded.
  [
    'HMAC keyring present',
    {
      ...validEnv,
      CVG_OPERATOR_IDENTITY_KEYRING: JSON.stringify({
        current: { keyId: 'k', secret: randomBytes(32).toString('hex') }
      })
    },
    /CVG_OPERATOR_IDENTITY_KEYRING/
  ],
  [
    'local OIDC variables present',
    { ...validEnv, CVG_LOCAL_OIDC_ISSUER: 'http://127.0.0.1:8087/realms/x' },
    /CVG_LOCAL_OIDC_/
  ],
  // Durable session store variables.
  ...(
    [
      'CVG_OPERATOR_SESSION_DATABASE_URL',
      'CVG_OPERATOR_AUTH_SCHEMA',
      'CVG_OPERATOR_SESSION_ROLE'
    ] as const
  ).map(
    (name): Case => [
      `${name} absent (store absent)`,
      { ...validEnv, [name]: undefined },
      new RegExp(name)
    ]
  ),
  // Issuer.
  [
    'issuer absent',
    { ...validEnv, CVG_OIDC_ISSUER: undefined },
    /CVG_OIDC_ISSUER/
  ],
  [
    'issuer http:',
    { ...validEnv, CVG_OIDC_ISSUER: 'http://idp.synthetic.test' },
    /CVG_OIDC_ISSUER/
  ],
  [
    'issuer http: loopback',
    { ...validEnv, CVG_OIDC_ISSUER: 'http://127.0.0.1:8443' },
    /CVG_OIDC_ISSUER/
  ],
  [
    'issuer with user',
    { ...validEnv, CVG_OIDC_ISSUER: 'https://user:pw@idp.synthetic.test' },
    /CVG_OIDC_ISSUER/
  ],
  [
    'issuer with query',
    { ...validEnv, CVG_OIDC_ISSUER: 'https://idp.synthetic.test?x=1' },
    /CVG_OIDC_ISSUER/
  ],
  [
    'issuer with fragment',
    { ...validEnv, CVG_OIDC_ISSUER: 'https://idp.synthetic.test#x' },
    /CVG_OIDC_ISSUER/
  ],
  [
    'issuer not a URL',
    { ...validEnv, CVG_OIDC_ISSUER: 'idp' },
    /CVG_OIDC_ISSUER/
  ],
  // Client.
  [
    'client absent',
    { ...validEnv, CVG_OIDC_CLIENT_ID: undefined },
    /CVG_OIDC_CLIENT_ID/
  ],
  [
    'client with space',
    { ...validEnv, CVG_OIDC_CLIENT_ID: 'cvg console' },
    /CVG_OIDC_CLIENT_ID/
  ],
  [
    'client too long',
    { ...validEnv, CVG_OIDC_CLIENT_ID: 'c'.repeat(129) },
    /CVG_OIDC_CLIENT_ID/
  ],
  [
    'secret absent',
    { ...validEnv, CVG_OIDC_CLIENT_SECRET: undefined },
    /CVG_OIDC_CLIENT_SECRET/
  ],
  [
    'secret with 31 characters',
    {
      ...validEnv,
      CVG_OIDC_CLIENT_SECRET: randomBytes(24).toString('base64url').slice(0, 31)
    },
    /CVG_OIDC_CLIENT_SECRET/
  ],
  ...['replace_me', 'change-me', 'EXAMPLE'].map(
    (placeholder): Case => [
      `secret placeholder ${placeholder}`,
      {
        ...validEnv,
        CVG_OIDC_CLIENT_SECRET: `${placeholder}${randomBytes(24).toString('hex')}`
      },
      /CVG_OIDC_CLIENT_SECRET/
    ]
  ),
  // Redirect.
  [
    'redirect absent',
    { ...validEnv, CVG_OIDC_REDIRECT_URI: undefined },
    /CVG_OIDC_REDIRECT_URI/
  ],
  [
    'redirect with another path',
    {
      ...validEnv,
      CVG_OIDC_REDIRECT_URI: 'https://api.synthetic.test/v1/auth/callback'
    },
    /CVG_OIDC_REDIRECT_URI/
  ],
  [
    'redirect with trailing slash',
    { ...validEnv, CVG_OIDC_REDIRECT_URI: `${REDIRECT}/` },
    /CVG_OIDC_REDIRECT_URI/
  ],
  [
    'redirect with query',
    { ...validEnv, CVG_OIDC_REDIRECT_URI: `${REDIRECT}?next=/` },
    /CVG_OIDC_REDIRECT_URI/
  ],
  [
    'redirect with fragment',
    { ...validEnv, CVG_OIDC_REDIRECT_URI: `${REDIRECT}#x` },
    /CVG_OIDC_REDIRECT_URI/
  ],
  [
    'redirect with user',
    {
      ...validEnv,
      CVG_OIDC_REDIRECT_URI:
        'https://u@api.synthetic.test/v1/auth/oidc/callback'
    },
    /CVG_OIDC_REDIRECT_URI/
  ],
  [
    'redirect http: outside loopback',
    {
      ...validEnv,
      CVG_OIDC_REDIRECT_URI: 'http://api.synthetic.test/v1/auth/oidc/callback'
    },
    /CVG_OIDC_REDIRECT_URI/
  ],
  [
    'redirect relative',
    { ...validEnv, CVG_OIDC_REDIRECT_URI: '/v1/auth/oidc/callback' },
    /CVG_OIDC_REDIRECT_URI/
  ],
  // Console origin.
  [
    'console absent',
    { ...validEnv, CVG_OPERATOR_CONSOLE_ORIGIN: undefined },
    /CVG_OPERATOR_CONSOLE_ORIGIN/
  ],
  [
    'console outside the allowlist',
    {
      ...validEnv,
      CVG_OPERATOR_CONSOLE_ORIGIN: 'https://other.synthetic.test'
    },
    /CVG_OPERATOR_CONSOLE_ORIGIN/
  ],
  [
    'console equal to the issuer origin',
    {
      ...validEnv,
      CVG_OPERATOR_CONSOLE_ORIGIN: ISSUER,
      API_ALLOWED_ORIGINS: `${CONSOLE},${ISSUER}`
    },
    /CVG_OPERATOR_CONSOLE_ORIGIN/
  ],
  [
    'console with a path',
    { ...validEnv, CVG_OPERATOR_CONSOLE_ORIGIN: `${CONSOLE}/app` },
    /CVG_OPERATOR_CONSOLE_ORIGIN/
  ],
  // Pending cookie key.
  [
    'key absent',
    { ...validEnv, CVG_OIDC_PENDING_COOKIE_KEY: undefined },
    /CVG_OIDC_PENDING_COOKIE_KEY/
  ],
  [
    'key with 31 bytes',
    {
      ...validEnv,
      CVG_OIDC_PENDING_COOKIE_KEY: randomBytes(31).toString('base64url')
    },
    /CVG_OIDC_PENDING_COOKIE_KEY/
  ],
  [
    'key with 33 bytes',
    {
      ...validEnv,
      CVG_OIDC_PENDING_COOKIE_KEY: randomBytes(33).toString('base64url')
    },
    /CVG_OIDC_PENDING_COOKIE_KEY/
  ],
  [
    'key not canonical (padded base64)',
    {
      ...validEnv,
      CVG_OIDC_PENDING_COOKIE_KEY: randomBytes(32).toString('base64')
    },
    /CVG_OIDC_PENDING_COOKIE_KEY/
  ],
  // MFA policy.
  [
    'policy absent',
    { ...validEnv, CVG_OIDC_MFA_POLICY: undefined },
    /CVG_OIDC_MFA_POLICY/
  ],
  [
    'policy not JSON',
    { ...validEnv, CVG_OIDC_MFA_POLICY: '{version' },
    /CVG_OIDC_MFA_POLICY/
  ],
  [
    'policy with an extra key',
    {
      ...validEnv,
      CVG_OIDC_MFA_POLICY: JSON.stringify({ ...SYNTHETIC_MFA_POLICY, acr: 'x' })
    },
    /CVG_OIDC_MFA_POLICY/
  ],
  [
    'policy without amr',
    {
      ...validEnv,
      CVG_OIDC_MFA_POLICY: JSON.stringify({ version: 'v1', requiredAmr: [] })
    },
    /CVG_OIDC_MFA_POLICY/
  ],
  [
    'policy with duplicate amr',
    {
      ...validEnv,
      CVG_OIDC_MFA_POLICY: JSON.stringify({
        version: 'v1',
        requiredAmr: ['otp', 'otp']
      })
    },
    /CVG_OIDC_MFA_POLICY/
  ],
  [
    'policy with nine amr values',
    {
      ...validEnv,
      CVG_OIDC_MFA_POLICY: JSON.stringify({
        version: 'v1',
        requiredAmr: Array.from({ length: 9 }, (_, i) => `m${i}`)
      })
    },
    /CVG_OIDC_MFA_POLICY/
  ],
  [
    'policy with invalid amr',
    {
      ...validEnv,
      CVG_OIDC_MFA_POLICY: JSON.stringify({
        version: 'v1',
        requiredAmr: ['OTP']
      })
    },
    /CVG_OIDC_MFA_POLICY/
  ],
  [
    'policy with invalid version',
    {
      ...validEnv,
      CVG_OIDC_MFA_POLICY: JSON.stringify({
        version: 'v 1',
        requiredAmr: ['otp']
      })
    },
    /CVG_OIDC_MFA_POLICY/
  ],
  // Group matrix.
  [
    'matrix absent',
    { ...validEnv, CVG_OIDC_GROUP_MATRIX: undefined },
    /CVG_OIDC_GROUP_MATRIX/
  ],
  [
    'matrix not JSON',
    { ...validEnv, CVG_OIDC_GROUP_MATRIX: '[' },
    /CVG_OIDC_GROUP_MATRIX/
  ],
  [
    'matrix with an extra key',
    { ...validEnv, CVG_OIDC_GROUP_MATRIX: matrix({ issuer: ISSUER }) },
    /CVG_OIDC_GROUP_MATRIX/
  ],
  [
    'matrix with a repeated group',
    {
      ...validEnv,
      CVG_OIDC_GROUP_MATRIX: matrix({ entries: [firstEntry, firstEntry] })
    },
    /CVG_OIDC_GROUP_MATRIX/
  ],
  [
    'matrix with an invalid tenant',
    {
      ...validEnv,
      CVG_OIDC_GROUP_MATRIX: matrix({
        entries: [{ ...firstEntry, tenantId: 'tenant_x' }]
      })
    },
    /CVG_OIDC_GROUP_MATRIX/
  ],
  [
    'matrix with an invalid role',
    {
      ...validEnv,
      CVG_OIDC_GROUP_MATRIX: matrix({
        entries: [{ ...firstEntry, role: 'System' }]
      })
    },
    /CVG_OIDC_GROUP_MATRIX/
  ],
  [
    'matrix with a non-boolean active',
    {
      ...validEnv,
      CVG_OIDC_GROUP_MATRIX: matrix({
        entries: [{ ...firstEntry, active: 'true' }]
      })
    },
    /CVG_OIDC_GROUP_MATRIX/
  ],
  [
    'matrix entry with an extra key',
    {
      ...validEnv,
      CVG_OIDC_GROUP_MATRIX: matrix({
        entries: [{ ...firstEntry, scope: 'x' }]
      })
    },
    /CVG_OIDC_GROUP_MATRIX/
  ],
  [
    'matrix with an empty group',
    {
      ...validEnv,
      CVG_OIDC_GROUP_MATRIX: matrix({ entries: [{ ...firstEntry, group: '' }] })
    },
    /CVG_OIDC_GROUP_MATRIX/
  ],
  [
    'matrix with a 257-character group',
    {
      ...validEnv,
      CVG_OIDC_GROUP_MATRIX: matrix({
        entries: [{ ...firstEntry, group: 'g'.repeat(257) }]
      })
    },
    /CVG_OIDC_GROUP_MATRIX/
  ],
  [
    'matrix without entries',
    { ...validEnv, CVG_OIDC_GROUP_MATRIX: matrix({ entries: [] }) },
    /CVG_OIDC_GROUP_MATRIX/
  ],
  [
    'matrix with 257 entries',
    { ...validEnv, CVG_OIDC_GROUP_MATRIX: matrix({ entries: entries(257) }) },
    /CVG_OIDC_GROUP_MATRIX/
  ],
  ...[
    'iss',
    'sub',
    'aud',
    'exp',
    'iat',
    'nbf',
    'auth_time',
    'nonce',
    'acr',
    'amr',
    'azp',
    '__proto__',
    'constructor',
    'prototype',
    'bad claim',
    ''
  ].map(
    (claim): Case => [
      `matrix claim ${JSON.stringify(claim)}`,
      { ...validEnv, CVG_OIDC_GROUP_MATRIX: matrix({ claim }) },
      /CVG_OIDC_GROUP_MATRIX/
    ]
  ),
  ...([0, -1, 1.5, '3', 1_000_000_000, null] as unknown[]).map(
    (version): Case => [
      `matrix version ${JSON.stringify(version)}`,
      { ...validEnv, CVG_OIDC_GROUP_MATRIX: matrix({ version }) },
      /CVG_OIDC_GROUP_MATRIX/
    ]
  )
]

const sensitive = [
  material.clientSecret,
  material.pendingCookieKey,
  'synthetic-a-operator',
  'synthetic-a-supervisor'
]

async function refusal(
  build: () => Promise<{ close: () => Promise<unknown> }>
): Promise<string> {
  let app: { close: () => Promise<unknown> } | undefined
  try {
    app = await build()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  await app.close()
  return 'boot accepted the configuration'
}

describe('SPEC0254 O1 — OIDC login configuration refuses the boot without I/O', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each(cases)(
    'refuses %s in buildServerFromEnv and buildApiWithProductionSessions',
    async (_name, env, expected) => {
      for (const build of [
        () => buildServerFromEnv(env),
        () => buildApiWithProductionSessions(env)
      ]) {
        const message = await refusal(build)
        expect(message).toMatch(expected)
        for (const value of sensitive) expect(message).not.toContain(value)
      }
    }
  )

  it('refuses a valid OIDC configuration when the durable session store is absent', async () => {
    const message = await refusal(() => buildServerFromEnv(validEnv))
    expect(message).toMatch(/durable operator session and login state stores/)
    for (const value of sensitive) expect(message).not.toContain(value)
  })

  it('refuses an injected OIDC login without the OIDC configuration', async () => {
    const message = await refusal(() =>
      buildServerFromEnv({ NODE_ENV: 'test', API_PERSISTENCE_MODE: 'memory' }, {
        operatorLogin: {
          kind: 'oidc',
          authorityVersion: 'oidc-v1-'.padEnd(72, '0'),
          consoleOrigin: CONSOLE,
          authority: {} as never,
          stateStore: {} as never
        }
      } as never)
    )
    expect(message).toMatch(/CVG_OPERATOR_LOGIN=oidc/)
  })
})
