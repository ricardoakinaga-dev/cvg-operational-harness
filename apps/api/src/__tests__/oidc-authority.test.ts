// @vitest-environment node
/**
 * SPEC0254 O2 — discovery refusals (byte-exact issuer, endpoint origin,
 * required capabilities, outage and timeout) and the ordered authority
 * version `oidc-v<N>-<D>` (P5).
 */
import { describe, expect, it } from 'vitest'
import { discoverOidcOperatorAuthority } from '../oidc-authority.ts'
import { parseOperatorLoginConfig } from '../oidc-config.ts'
import {
  SyntheticOidcIssuer,
  syntheticClientMaterial,
  syntheticGroupMatrix,
  syntheticOidcEnv,
  SYNTHETIC_MFA_POLICY,
  SYNTHETIC_TENANT_B
} from './support/synthetic-oidc-issuer.ts'

const ISSUER = 'https://idp.synthetic.test'
const CONSOLE = 'https://console.synthetic.test'
const REDIRECT = 'https://api.synthetic.test/v1/auth/oidc/callback'
const CLIENT = 'cvg-synthetic-console'
const material = syntheticClientMaterial()

function environment(patch: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    CVG_IDENTITY_MODE: 'trusted',
    API_PERSISTENCE_MODE: 'postgres',
    POSTGRES_RLS_ENFORCEMENT: 'true',
    DATABASE_URL: 'postgresql://cvg_runtime:synthetic@127.0.0.1:1/db',
    DATABASE_MIGRATION_URL:
      'postgresql://cvg_migration:synthetic@127.0.0.1:1/db',
    CVG_OPERATOR_SESSION_DATABASE_URL:
      'postgresql://cvg_session:synthetic@127.0.0.1:1/db',
    CVG_OPERATOR_AUTH_SCHEMA: 'cvg_synthetic_auth',
    CVG_OPERATOR_SESSION_ROLE: 'cvg_session',
    API_ALLOWED_ORIGINS: `${CONSOLE},https://other-console.synthetic.test`,
    ...syntheticOidcEnv({
      issuer: ISSUER,
      clientId: CLIENT,
      clientSecret: material.clientSecret,
      pendingCookieKey: material.pendingCookieKey,
      redirectUri: REDIRECT,
      consoleOrigin: CONSOLE
    }),
    ...patch
  }
}

function config(patch: NodeJS.ProcessEnv = {}) {
  const parsed = parseOperatorLoginConfig(environment(patch))
  if (!parsed) throw new Error('expected an OIDC configuration')
  return parsed
}

function issuer() {
  return new SyntheticOidcIssuer({
    issuer: ISSUER,
    clientId: CLIENT,
    clientSecret: material.clientSecret,
    redirectUri: REDIRECT,
    groupsClaim: 'synthetic_groups'
  })
}

async function discoveryError(
  controls: SyntheticOidcIssuer['controls']
): Promise<string> {
  const idp = issuer()
  idp.controls = controls
  try {
    await discoverOidcOperatorAuthority(config(), { transport: idp.fetch })
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return 'discovery accepted'
}

describe('SPEC0254 O2 — OIDC discovery', () => {
  it('accepts the synthetic issuer with the exact metadata', async () => {
    const idp = issuer()
    const authority = await discoverOidcOperatorAuthority(config(), {
      transport: idp.fetch
    })
    expect(authority.issuer).toBe(ISSUER)
    expect(idp.calls.discovery).toBe(1)
    expect(idp.calls.jwks).toBe(0)
  })

  it.each([
    ['another issuer', { issuer: 'https://other.synthetic.test' }],
    [
      'issuer with an upper-case host',
      { issuer: 'https://IDP.synthetic.test' }
    ],
    ['issuer with :443', { issuer: 'https://idp.synthetic.test:443' }],
    ['issuer with a trailing slash', { issuer: 'https://idp.synthetic.test/' }],
    [
      'authorization endpoint on another origin',
      { authorization_endpoint: 'https://evil.synthetic.test/authorize' }
    ],
    [
      'token endpoint over http:',
      { token_endpoint: 'http://idp.synthetic.test/token' }
    ],
    [
      'JWKS on another origin',
      { jwks_uri: 'https://idp.synthetic.test:8443/jwks' }
    ],
    ['JWKS absent', { jwks_uri: undefined }],
    ['no code response type', { response_types_supported: ['id_token'] }],
    ['response types absent', { response_types_supported: undefined }],
    ['no S256', { code_challenge_methods_supported: ['plain'] }],
    ['PKCE methods absent', { code_challenge_methods_supported: undefined }],
    [
      'no client_secret_basic',
      { token_endpoint_auth_methods_supported: ['client_secret_post'] }
    ],
    [
      'token auth methods absent',
      { token_endpoint_auth_methods_supported: undefined }
    ],
    ['no RS256', { id_token_signing_alg_values_supported: ['ES256'] }],
    [
      'signing algorithms absent',
      { id_token_signing_alg_values_supported: undefined }
    ]
  ])('refuses %s', async (_name, metadata) => {
    const message = await discoveryError({ metadata })
    expect(message).toMatch(/OIDC discovery/)
    expect(message).not.toContain(material.clientSecret)
  })

  it('refuses an unreachable IdP', async () => {
    const message = await discoveryError({ down: true })
    expect(message).toMatch(/OIDC discovery/)
  })

  it('refuses a slow IdP after the 5 s discovery timeout', async () => {
    const started = Date.now()
    const message = await discoveryError({ discoveryDelayMs: 8_000 })
    expect(message).toMatch(/OIDC discovery/)
    expect(Date.now() - started).toBeGreaterThanOrEqual(4_500)
    expect(Date.now() - started).toBeLessThan(7_500)
  }, 30_000)

  it('refuses an injected transport outside NODE_ENV=test', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    try {
      await expect(
        discoverOidcOperatorAuthority(config(), { transport: issuer().fetch })
      ).rejects.toThrow(/transport/)
    } finally {
      process.env.NODE_ENV = previous
    }
  })
})

describe('SPEC0254 O2 — ordered authority version (P5)', () => {
  const baseline = config().authorityVersion

  it('carries the matrix version N and a 64-hex digest within 80 characters', () => {
    expect(baseline).toMatch(/^oidc-v1-[0-9a-f]{64}$/)
    expect(baseline.length).toBeLessThanOrEqual(80)
    const v42 = config({
      CVG_OIDC_GROUP_MATRIX: JSON.stringify(syntheticGroupMatrix(42))
    }).authorityVersion
    expect(v42).toMatch(/^oidc-v42-[0-9a-f]{64}$/)
    const max = config({
      CVG_OIDC_GROUP_MATRIX: JSON.stringify(syntheticGroupMatrix(999_999_999))
    }).authorityVersion
    expect(max).toMatch(/^oidc-v999999999-[0-9a-f]{64}$/)
    expect(max.length).toBeLessThanOrEqual(80)
  })

  it.each([
    ['issuer', { CVG_OIDC_ISSUER: 'https://idp2.synthetic.test' }],
    ['client', { CVG_OIDC_CLIENT_ID: 'cvg-synthetic-console-2' }],
    [
      'MFA policy version',
      {
        CVG_OIDC_MFA_POLICY: JSON.stringify({
          ...SYNTHETIC_MFA_POLICY,
          version: 'synthetic-mfa-v2'
        })
      }
    ],
    [
      'MFA policy values',
      {
        CVG_OIDC_MFA_POLICY: JSON.stringify({
          ...SYNTHETIC_MFA_POLICY,
          requiredAmr: ['pwd', 'otp', 'hwk']
        })
      }
    ],
    [
      'matrix entry',
      {
        CVG_OIDC_GROUP_MATRIX: JSON.stringify({
          ...syntheticGroupMatrix(),
          entries: [
            ...syntheticGroupMatrix().entries,
            {
              group: 'synthetic-b-approver',
              tenantId: SYNTHETIC_TENANT_B,
              role: 'Approver',
              active: true
            }
          ]
        })
      }
    ],
    [
      'matrix claim',
      {
        CVG_OIDC_GROUP_MATRIX: JSON.stringify({
          ...syntheticGroupMatrix(),
          claim: 'synthetic_roles'
        })
      }
    ]
  ])('changes with the %s (same N, other digest)', (_name, patch) => {
    const changed = config(patch).authorityVersion
    expect(changed).not.toBe(baseline)
    expect(changed.startsWith('oidc-v1-')).toBe(true)
  })

  it.each([
    [
      'client secret',
      { CVG_OIDC_CLIENT_SECRET: syntheticClientMaterial().clientSecret }
    ],
    [
      'redirect',
      {
        CVG_OIDC_REDIRECT_URI:
          'https://api2.synthetic.test/v1/auth/oidc/callback'
      }
    ],
    [
      'console',
      { CVG_OPERATOR_CONSOLE_ORIGIN: 'https://other-console.synthetic.test' }
    ],
    [
      'pending cookie key',
      {
        CVG_OIDC_PENDING_COOKIE_KEY: syntheticClientMaterial().pendingCookieKey
      }
    ],
    [
      'order of the matrix entries',
      {
        CVG_OIDC_GROUP_MATRIX: JSON.stringify({
          ...syntheticGroupMatrix(),
          entries: [...syntheticGroupMatrix().entries].reverse()
        })
      }
    ],
    [
      'order of the required amr values',
      {
        CVG_OIDC_MFA_POLICY: JSON.stringify({
          ...SYNTHETIC_MFA_POLICY,
          requiredAmr: [...SYNTHETIC_MFA_POLICY.requiredAmr].reverse()
        })
      }
    ]
  ])('does not change with the %s', (_name, patch) => {
    expect(config(patch).authorityVersion).toBe(baseline)
  })

  it('returns null without the OIDC mode', () => {
    expect(
      parseOperatorLoginConfig({
        NODE_ENV: 'test',
        API_PERSISTENCE_MODE: 'memory'
      })
    ).toBeNull()
  })
})
