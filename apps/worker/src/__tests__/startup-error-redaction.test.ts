import { spawn } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import { redactStartupErrorMessage } from '../startup-error.ts'

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000911'
)

const SYNTHETIC_SECRET = 'AKIA1234567890ABCDEF'
const SYNTHETIC_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.payload.signature'
const SYNTHETIC_PASSWORD = 's3nh4-XYZ-9876'
const SYNTHETIC_EMAIL = 'ana.silva@hospital.example.br'
const SYNTHETIC_CPF = '123.456.789-09'
const SYNTHETIC_PHONE = '+55 11 98765-4321'

const SYNTHETIC_STARTUP_MESSAGE = [
  'startup aborted',
  `api_key=${SYNTHETIC_SECRET}`,
  `authorization: Bearer ${SYNTHETIC_TOKEN}`,
  `postgres://cvg_app:${SYNTHETIC_PASSWORD}@10.0.0.7:5432/cvg refused`,
  `contact ${SYNTHETIC_EMAIL}`,
  `cpf ${SYNTHETIC_CPF}`,
  `telefone ${SYNTHETIC_PHONE}`
].join('; ')

function parseJsonLines(output: string): Array<Record<string, unknown>> {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as unknown
        return parsed && typeof parsed === 'object'
          ? [parsed as Record<string, unknown>]
          : []
      } catch {
        return []
      }
    })
}

describe('worker startup error redaction', () => {
  it('emits no secret, token, credential URL or PII through the entrypoint boundary', () => {
    const message = redactStartupErrorMessage(
      new Error(SYNTHETIC_STARTUP_MESSAGE),
      'Worker failed'
    )
    const line = JSON.stringify({
      event: 'worker.operational_harness_failed',
      code: 'operational_harness_failed',
      message
    })

    expect(line).not.toContain(SYNTHETIC_SECRET)
    expect(line).not.toContain(SYNTHETIC_TOKEN)
    expect(line).not.toContain(SYNTHETIC_PASSWORD)
    expect(line).not.toContain('cvg_app')
    expect(line).not.toContain(SYNTHETIC_EMAIL)
    expect(line).not.toContain(SYNTHETIC_CPF)
    expect(line).not.toContain(SYNTHETIC_PHONE)
    expect(line).not.toMatch(/:\/\/[^"\s]*:[^"\s]*@/)

    expect(JSON.parse(line)).toMatchObject({
      event: 'worker.operational_harness_failed',
      code: 'operational_harness_failed'
    })
    expect(message).toContain('[redacted-credentials]')
    expect(message).toContain('[redacted-secret]')
    expect(message).toContain('[redacted-email]')
    expect(message).toContain('[redacted-cpf]')
    expect(message).toContain('10.0.0.7:5432/cvg')
  })

  it('keeps the literal fallback when the caught value is not an Error', () => {
    expect(redactStartupErrorMessage('Unexpected failure', 'fallback')).toBe(
      'Unexpected failure'
    )
    expect(redactStartupErrorMessage(undefined, 'fallback')).toBe('fallback')
    expect(redactStartupErrorMessage(42, 'fallback')).toBe('fallback')
    expect(
      redactStartupErrorMessage({ message: 'not-an-error' }, 'fallback')
    ).toBe('fallback')
  })

  it('truncates oversized messages without touching event or code fields', () => {
    const message = redactStartupErrorMessage(
      new Error(`startup failed ${'a'.repeat(900)}`),
      'fallback'
    )
    expect(message.length).toBe(500 + '[truncated]'.length)
    expect(message.endsWith('[truncated]')).toBe(true)
  })

  it('exits non-zero with the original event and code when a real entrypoint run fails', async () => {
    const child = spawn(
      path.resolve('node_modules/.bin/tsx'),
      ['apps/worker/src/main.ts'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: `postgres://synthetic:${SYNTHETIC_PASSWORD}@127.0.0.1:1/cvg`,
          PGCONNECT_TIMEOUT: '1',
          POSTGRES_RLS_ENFORCEMENT: 'true',
          CVG_WORKER_CONTROLLED_MODE: 'true',
          CVG_WORKER_TENANT_ID: tenantId,
          CVG_WORKER_RUNTIME: 'operational-harness-homolog',
          CVG_HOMOLOG_SYNTHETIC_ONLY: 'true',
          CVG_WORKER_MAX_EVENTS: '1',
          CVG_WORKER_IDLE_WAIT_MS: '10',
          CVG_WORKER_POLL_INTERVAL_MS: '1'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
    let output = ''
    child.stdout?.on('data', (chunk) => {
      output += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      output += String(chunk)
    })
    const exit = await new Promise<{ code: number | null }>(
      (resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code) => resolve({ code }))
      }
    )

    expect(exit.code).toBe(1)
    const events = parseJsonLines(output)
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'worker.homolog_failed',
        code: 'homolog_worker_failed'
      })
    )
    expect(output).not.toContain(SYNTHETIC_PASSWORD)
    expect(output).not.toMatch(/:\/\/[^"\s]*:[^"\s]*@/)
  }, 20_000)
})
