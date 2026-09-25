import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getWorkerStartupFailure } from '../apps/worker/src/worker.ts'
import { parseHomologConfig } from '../apps/worker/src/homolog-worker.ts'
import { parseContinuousWorkerSettings } from '../apps/worker/src/continuous-worker.ts'
import {
  parsePhase3RuntimeProfile,
  parsePhase3Scenario
} from '../apps/worker/src/phase3-synthetic-agent.ts'
import { parseEnv } from '@cvg/shared'

const examplePath = resolve(process.cwd(), '.env.example')

function readExampleEnv(): Record<string, string> {
  const values: Record<string, string> = {}
  for (const line of readFileSync(examplePath, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line)
    if (match) values[match[1]!] = match[2]!
  }
  return values
}

const requiredRuntimeKeys = [
  'NODE_ENV',
  'PORT',
  'CVG_API_PORT',
  'API_PERSISTENCE_MODE',
  'DATABASE_URL',
  'DATABASE_MIGRATION_URL',
  'INBOUND_TENANT_ID',
  'INBOUND_AGENT_ID',
  'WEBHOOK_SIGNING_SECRET',
  'API_ALLOWED_ORIGINS',
  'API_REQUIRE_HTTPS',
  'API_TRUSTED_PROXY_ADDRESSES',
  'API_TRUSTED_PROXY_HOPS',
  'POSTGRES_AUTO_MIGRATE',
  'POSTGRES_SCHEMA',
  'POSTGRES_RLS_ENFORCEMENT',
  'OUTBOX_DURABLE_INBOUND',
  'CVG_IDENTITY_MODE',
  'CVG_OPERATOR_IDENTITY_KEYRING',
  'CVG_RATE_LIMIT_KEYRING',
  'CVG_WORKER_QUEUE_ADAPTER',
  'CVG_WORKER_RUNTIME',
  'CVG_WORKER_RUN_MODE',
  'CVG_WORKER_CONTROLLED_MODE',
  'CVG_WORKER_CONTROLLED_SMOKE',
  'CVG_WORKER_TENANT_ID',
  'CVG_WORKER_AGENT_ID',
  'CVG_WORKER_ID',
  'CVG_WORKER_MAX_EVENTS',
  'CVG_WORKER_CONCURRENCY',
  'CVG_WORKER_MAX_ATTEMPTS',
  'CVG_WORKER_IDLE_WAIT_MS',
  'CVG_WORKER_POLL_INTERVAL_MS',
  'CVG_WORKER_IDLE_MAX_BACKOFF_MS',
  'CVG_WORKER_ERROR_BACKOFF_MS',
  'CVG_WORKER_ERROR_MAX_BACKOFF_MS',
  'CVG_WORKER_LEASE_MS',
  'CVG_WORKER_DRAIN_MS',
  'CVG_WORKER_SUMMARY_INTERVAL_MS',
  'CVG_WORKER_RUNTIME_PROFILE',
  'CVG_WORKER_ITERATIVE_SCENARIO',
  'CVG_WORKER_SYNTHETIC_EFFECT',
  'PHASE2_FAULT_POINT',
  'CVG_HOMOLOG_SYNTHETIC_ONLY',
  'CVG_HOMOLOG_SWEEP_INTERVAL_MS',
  'CVG_HOMOLOG_HEALTH_INTERVAL_MS',
  'VITE_CVG_WEB_IDENTITY_MODE',
  'VITE_CVG_CONTROLLED_TEST',
  'OPENAI_API_KEY',
  'ENABLE_REAL_CHANNELS',
  'ENABLE_REAL_RAG',
  'ENABLE_REAL_PAYMENTS',
  'ENABLE_REAL_MEDICAL_RECORDS'
] as const

describe('REM21-018 environment baseline', () => {
  it('documents every active runtime/profile key with a safe value', () => {
    const env = readExampleEnv()
    for (const key of requiredRuntimeKeys) {
      expect(env[key], `${key} is missing from .env.example`).toBeDefined()
    }
    expect(env.CVG_WORKER_RUNTIME).toBe('')
    expect(env.CVG_WORKER_QUEUE_ADAPTER).toBe('')
    expect(env.CVG_OPERATOR_IDENTITY_KEYRING).toBe('')
    expect(env.CVG_RATE_LIMIT_KEYRING).toBe('')
  })

  it('contains placeholders only and no usable secret material', () => {
    const env = readExampleEnv()
    expect(env.OPENAI_API_KEY).toBe('replace_me')
    expect(env.WEBHOOK_SIGNING_SECRET).toMatch(/^replace_me/)
    expect(env.DATABASE_URL).toMatch(/^postgres:\/\/user:password@localhost/)
    expect(env.DATABASE_MIGRATION_URL).toMatch(
      /^postgres:\/\/migration_user:password@localhost/
    )
    expect(env.ENABLE_REAL_CHANNELS).toBe('false')
    expect(env.ENABLE_REAL_RAG).toBe('false')
    expect(env.ENABLE_REAL_PAYMENTS).toBe('false')
    expect(env.ENABLE_REAL_MEDICAL_RECORDS).toBe('false')
  })

  it('parses the safe API profile and rejects insecure identity mode', () => {
    const example = readExampleEnv()
    const parsed = parseEnv(example)
    expect(parsed).toMatchObject({
      CVG_IDENTITY_MODE: 'trusted',
      OUTBOX_DURABLE_INBOUND: false,
      PORT: 3000,
      CVG_API_PORT: 3100
    })

    const production = {
      ...example,
      NODE_ENV: 'production',
      OPENAI_API_KEY: 'synthetic-provider-placeholder',
      WEBHOOK_SIGNING_SECRET: 'synthetic-production-signing-secret-2026',
      POSTGRES_RLS_ENFORCEMENT: 'true',
      INBOUND_TENANT_ID: 'tenant_00000000-0000-4000-8000-000000000001',
      INBOUND_AGENT_ID: 'agent_00000000-0000-4000-8000-000000000001',
      API_ALLOWED_ORIGINS: 'https://console.example.test',
      API_REQUIRE_HTTPS: 'true',
      CVG_IDENTITY_MODE: 'simulation'
    }
    expect(() => parseEnv(production)).toThrow(/trusted operator identity/)
  })
})

describe('REM21-018 worker profile matrix', () => {
  const tenantId = 'tenant_00000000-0000-4000-8000-000000000001'

  it('accepts the controlled local worker and rejects its production profile', () => {
    const controlled = {
      NODE_ENV: 'development',
      CVG_WORKER_QUEUE_ADAPTER: 'controlled-memory',
      CVG_WORKER_TENANT_ID: tenantId,
      CVG_WORKER_CONTROLLED_MODE: 'true'
    }
    expect(getWorkerStartupFailure(controlled)).toBeNull()
    expect(
      getWorkerStartupFailure({ ...controlled, NODE_ENV: 'production' })
    ).toMatchObject({
      code: 'production_controlled_worker_forbidden'
    })
  })

  it('accepts valid continuous and homolog tuning, but requires homolog arming', () => {
    const example = readExampleEnv()
    expect(parseContinuousWorkerSettings(example)).toMatchObject({
      pollIntervalMs: 25,
      concurrency: 1,
      leaseMs: 30_000
    })
    const homolog = {
      ...example,
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://user:password@localhost:5432/cvg_test',
      POSTGRES_RLS_ENFORCEMENT: 'true',
      CVG_WORKER_CONTROLLED_MODE: 'true',
      CVG_HOMOLOG_SYNTHETIC_ONLY: 'true'
    }
    expect(parseHomologConfig(homolog).tenantId).toBe(tenantId)
    expect(() =>
      parseHomologConfig({ ...homolog, CVG_HOMOLOG_SYNTHETIC_ONLY: 'false' })
    ).toThrow(/CVG_HOMOLOG_SYNTHETIC_ONLY/)
  })

  it('keeps iterative profile and scenario parsing closed to known values', () => {
    expect(parsePhase3RuntimeProfile('iterative')).toBe('iterative')
    expect(parsePhase3Scenario('approval')).toBe('approval')
    expect(() => parsePhase3RuntimeProfile('unbounded')).toThrow(
      /CVG_WORKER_RUNTIME_PROFILE/
    )
    expect(() => parsePhase3Scenario('real-world')).toThrow(
      /CVG_WORKER_ITERATIVE_SCENARIO/
    )
  })
})
