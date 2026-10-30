import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  REM21_014_PRINCIPALS,
  assertControlledTestProfile,
  buildRem21014TrustedTestApi
} from '../scripts/rem21-014-trusted-test-api.ts'
import { createTrustedOperatorIdentityToken } from '../apps/api/src/operator-identity.ts'

const key = {
  keyId: 'rem21-014-e2e',
  secret: 'rem21-014-e2e-synthetic-key-2026-09-22-abcdefghijklmnop'
}
const testEnv = {
  NODE_ENV: 'test',
  API_PERSISTENCE_MODE: 'memory',
  CVG_IDENTITY_MODE: 'trusted',
  CVG_OPERATOR_IDENTITY_KEYRING: JSON.stringify({ current: key })
}

function tokenFor(principal: (typeof REM21_014_PRINCIPALS)[number]) {
  return createTrustedOperatorIdentityToken(principal, key, Date.now, 120)
}

describe('rem21-014 trusted test API', () => {
  it.each([undefined, '', 'development', 'production', 'staging'])(
    'refuses to compose outside NODE_ENV=test (%s)',
    async (nodeEnv) => {
      const env = {
        ...testEnv,
        ...(nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv })
      }
      if (nodeEnv === undefined)
        delete (env as Record<string, unknown>).NODE_ENV
      expect(() => assertControlledTestProfile(env)).toThrow(/NODE_ENV=test/)
      await expect(buildRem21014TrustedTestApi(env)).rejects.toThrow(
        /NODE_ENV=test/
      )
    }
  )

  it('exits non-zero without listening when started with NODE_ENV=production', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        join(__dirname, '../scripts/rem21-014-trusted-test-api.ts')
      ],
      {
        env: { ...process.env, ...testEnv, NODE_ENV: 'production', PORT: '0' },
        encoding: 'utf8',
        timeout: 60_000
      }
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/NODE_ENV=test/)
  })

  it('serves a session only to provisioned principals, with HMAC tokens', async () => {
    const app = await buildRem21014TrustedTestApi(testEnv)
    try {
      for (const principal of REM21_014_PRINCIPALS) {
        const response = await app.inject({
          method: 'GET',
          url: '/v1/session',
          headers: { 'x-cvg-operator-token': tokenFor(principal) }
        })
        expect(response.statusCode, principal.operatorId).toBe(200)
      }
      const stranger = {
        ...REM21_014_PRINCIPALS[0]!,
        operatorId: 'operator.rem21.014.unprovisioned'
      }
      const denied = await app.inject({
        method: 'GET',
        url: '/v1/session',
        headers: { 'x-cvg-operator-token': tokenFor(stranger) }
      })
      expect(denied.statusCode).not.toBe(200)
    } finally {
      await app.close()
    }
  })
})
