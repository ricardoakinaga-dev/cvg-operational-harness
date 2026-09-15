import { spawn } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildServerFromEnv } from '../server.ts'
import {
  OPERATOR_IDENTITY_KEYRING_ENV,
  createConfiguredOperatorIdentityResolver,
  createTrustedOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '../operator-identity.ts'

const SECRET = 'composition-wiring-synthetic-secret-0001-abcdef'
const NOW_MS = 1_700_000_000_000
const NOW_SECONDS = Math.floor(NOW_MS / 1000)
const tenantId = 'tenant_00000000-0000-4000-8000-0000000009b1'
const identity = {
  operatorId: 'operator.wiring',
  role: 'Supervisor' as const,
  tenantId
}
const simulationHeaders = {
  'x-operator-id': 'attacker.simulation',
  'x-operator-role': 'Admin',
  'x-tenant-id': tenantId
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function sign(encodedClaims: string, secret = SECRET): string {
  return createHmac('sha256', secret)
    .update(encodedClaims, 'utf8')
    .digest('base64url')
}

function signedToken(claims: unknown, secret = SECRET): string {
  const encodedClaims = encode(claims)
  return `${encodedClaims}.${sign(encodedClaims, secret)}`
}

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
}

describe('identity composition wiring', () => {
  it('passes the injected trusted resolver to the built server', async () => {
    const now = () => NOW_MS
    const app = await buildServerFromEnv(
      { NODE_ENV: 'test', API_PERSISTENCE_MODE: 'memory' },
      {
        identityMode: 'trusted',
        operatorIdentityResolver: createTrustedOperatorIdentityResolver({
          secret: SECRET,
          now
        })
      }
    )
    const token = createTrustedOperatorIdentityToken(identity, SECRET, now)
    const denied = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: simulationHeaders
    })
    const allowed = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: {
        ...simulationHeaders,
        'x-cvg-operator-token': token
      }
    })
    await app.close()

    expect(denied.statusCode).toBe(401)
    expect(allowed.statusCode).toBe(200)
    expect((allowed.json() as Envelope<unknown[]>).success).toBe(true)
  })

  it('rejects wrong-audience, expired and replayed tokens over HTTP', async () => {
    const now = () => NOW_MS
    const app = await buildServerFromEnv(
      { NODE_ENV: 'test', API_PERSISTENCE_MODE: 'memory' },
      {
        identityMode: 'trusted',
        operatorIdentityResolver: createTrustedOperatorIdentityResolver({
          secret: SECRET,
          now
        })
      }
    )
    const validClaims = {
      ...identity,
      aud: 'cvg-api',
      iat: NOW_SECONDS,
      exp: NOW_SECONDS + 300,
      jti: 'jti_00000000-0000-4000-8000-0000000009b1'
    }
    const wrongAudience = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: {
        'x-cvg-operator-token': signedToken({
          ...validClaims,
          aud: 'other-api',
          jti: 'jti_00000000-0000-4000-8000-0000000009b2'
        })
      }
    })
    const expired = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: {
        'x-cvg-operator-token': signedToken({
          ...validClaims,
          iat: NOW_SECONDS - 400,
          exp: NOW_SECONDS - 100,
          jti: 'jti_00000000-0000-4000-8000-0000000009b3'
        })
      }
    })
    const replayedToken = createTrustedOperatorIdentityToken(
      identity,
      SECRET,
      now
    )
    const first = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: { 'x-cvg-operator-token': replayedToken }
    })
    const replay = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: { 'x-cvg-operator-token': replayedToken }
    })
    await app.close()

    expect(wrongAudience.statusCode).toBe(401)
    expect(expired.statusCode).toBe(401)
    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(401)
    expect((replay.json() as Envelope<never>).error?.code).toBe('unauthorized')
  })

  it('rejects unknown identity modes and simulation mode in production startup', async () => {
    await expect(
      buildServerFromEnv({
        NODE_ENV: 'test',
        API_PERSISTENCE_MODE: 'memory',
        CVG_IDENTITY_MODE: 'trusted-resolver'
      })
    ).rejects.toThrow(/CVG_IDENTITY_MODE/)

    await expect(
      buildServerFromEnv({
        NODE_ENV: 'production',
        API_PERSISTENCE_MODE: 'memory',
        CVG_IDENTITY_MODE: 'simulation'
      })
    ).rejects.toThrow(/simulation is forbidden/)
  })

  it('fails production startup without an injected trusted resolver', async () => {
    const fakeDatabaseUrl = 'postgres://fixture:fixture@127.0.0.1:1/fixture'
    await expect(
      buildServerFromEnv(
        {
          NODE_ENV: 'production',
          API_PERSISTENCE_MODE: 'postgres',
          DATABASE_URL: fakeDatabaseUrl,
          POSTGRES_RLS_ENFORCEMENT: 'true',
          OUTBOX_DURABLE_INBOUND: 'true',
          INBOUND_TENANT_ID: tenantId,
          INBOUND_AGENT_ID: 'agent_00000000-0000-4000-8000-0000000009b1'
        },
        {
          inboundTenantResolver: () => tenantId
        }
      )
    ).rejects.toThrow(/operator identity resolver/)
  })

  it('builds a trusted resolver from the runtime key-ring environment', () => {
    const keyRingEnv = {
      NODE_ENV: 'test',
      CVG_IDENTITY_MODE: 'trusted',
      CVG_OPERATOR_IDENTITY_KEYRING: JSON.stringify({
        current: { keyId: 'kid_controlled_2026', secret: SECRET },
        previous: [],
        revokedKeyIds: [],
        rotationWindowSeconds: 600
      })
    }
    const resolver = createConfiguredOperatorIdentityResolver(keyRingEnv)
    if (!resolver) throw new Error('Expected a configured resolver')
    const token = createTrustedOperatorIdentityToken(identity, {
      keyId: 'kid_controlled_2026',
      secret: SECRET
    })

    expect(
      resolver({
        'x-cvg-operator-token': token,
        'x-operator-id': 'attacker.simulation',
        'x-operator-role': 'Admin'
      })
    ).toEqual(identity)
  })

  it('never builds a resolver in simulation mode or without key material', () => {
    expect(
      createConfiguredOperatorIdentityResolver({
        NODE_ENV: 'test',
        CVG_IDENTITY_MODE: 'simulation',
        CVG_OPERATOR_IDENTITY_KEYRING: JSON.stringify({
          current: { keyId: 'kid_controlled_2026', secret: SECRET }
        })
      })
    ).toBeUndefined()
    expect(
      createConfiguredOperatorIdentityResolver({
        NODE_ENV: 'test',
        CVG_IDENTITY_MODE: 'trusted'
      })
    ).toBeUndefined()
    expect(
      createConfiguredOperatorIdentityResolver({
        NODE_ENV: 'test'
      })
    ).toBeUndefined()
  })

  it('rejects an invalid runtime key ring without leaking its content', () => {
    let message = ''
    try {
      createConfiguredOperatorIdentityResolver({
        NODE_ENV: 'test',
        CVG_IDENTITY_MODE: 'trusted',
        CVG_OPERATOR_IDENTITY_KEYRING: `{not-json:${SECRET}}`
      })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message).toMatch(/CVG_OPERATOR_IDENTITY_KEYRING/)
    expect(message).not.toContain(SECRET)
  })

  it('fails the real entrypoint closed in production without a configured resolver', async () => {
    const entrypointEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      OPENAI_API_KEY: 'synthetic-provider-key-not-real',
      WEBHOOK_SIGNING_SECRET: 'synthetic-webhook-signing-secret-0123456789',
      POSTGRES_RLS_ENFORCEMENT: 'true',
      INBOUND_TENANT_ID: tenantId,
      INBOUND_AGENT_ID: 'agent_00000000-0000-4000-8000-0000000009b1',
      API_ALLOWED_ORIGINS: 'https://console.example.test',
      API_REQUIRE_HTTPS: 'true',
      API_PERSISTENCE_MODE: 'postgres',
      DATABASE_URL: 'postgres://fixture:fixture@127.0.0.1:1/fixture',
      OUTBOX_DURABLE_INBOUND: 'true',
      CVG_IDENTITY_MODE: 'trusted'
    }
    delete entrypointEnv[OPERATOR_IDENTITY_KEYRING_ENV]
    const result = await runApiEntrypoint(entrypointEnv)

    expect(result.code).toBe(1)
    expect(result.output).toContain('operator identity resolver')
    expect(result.output).not.toContain(SECRET)
  }, 30_000)
})

function runApiEntrypoint(
  env: NodeJS.ProcessEnv
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      join(process.cwd(), 'node_modules/.bin/tsx'),
      ['apps/api/src/main.ts'],
      {
        cwd: process.cwd(),
        env
      }
    )
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += String(chunk)
    })
    child.once('error', reject)
    child.once('close', (code) => resolve({ code, output }))
  })
}
