import { describe, expect, it } from 'vitest'
import { parseEnv } from '../env.ts'

/**
 * ENGINE-PROD-FIX ENG-018: the neutral core does not require a model provider
 * secret, but a configured placeholder is still refused in production.
 */
const production = {
  NODE_ENV: 'production',
  CVG_IDENTITY_MODE: 'trusted',
  WEBHOOK_SIGNING_SECRET: 'test-production-webhook-signing-secret-32-chars',
  POSTGRES_RLS_ENFORCEMENT: 'true',
  INBOUND_TENANT_ID: 'tenant_00000000-0000-4000-8000-000000000001',
  INBOUND_AGENT_ID: 'agent_00000000-0000-4000-8000-000000000001',
  API_ALLOWED_ORIGINS: 'https://console.example.test',
  API_REQUIRE_HTTPS: 'true'
} as NodeJS.ProcessEnv

describe('production provider secret', () => {
  it('starts without a model provider secret', () => {
    expect(() => parseEnv(production)).not.toThrow()
  })

  it.each(['', '  ', 'replace_me', 'change-me', 'example-key'])(
    'refuses the placeholder %j when one is set',
    (value) => {
      expect(() => parseEnv({ ...production, OPENAI_API_KEY: value })).toThrow(
        /production provider secret/
      )
    }
  )
})
