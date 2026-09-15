import { describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import { DomainError, toSafeError } from '../errors.ts'
import {
  parseOperatorIdentity,
  requirePermission,
  roleHasPermission
} from '../auth.ts'
import {
  CANONICAL_JSON_MAX_NODES,
  canonicalizeJson,
  CanonicalJsonError
} from '../canonical.ts'
import { parseEnv, realWorldActionsDisabled } from '../env.ts'
import {
  assertSafeOutboundUrl,
  evaluateOutboundUrl,
  evaluateResolvedAddresses,
  isPrivateIpAddress
} from '../ssrf.ts'
import { createShutdownController, type ShutdownEvent } from '../lifecycle.ts'

describe('safe error mapping', () => {
  it('maps domain, zod and unknown failures without leaking details', () => {
    expect(toSafeError(new DomainError('conflict', 'conflict detail'))).toEqual(
      {
        code: 'conflict',
        message: 'conflict detail'
      }
    )
    expect(toSafeError(new ZodError([]))).toEqual({
      code: 'validation_failed',
      message: 'Input validation failed'
    })
    expect(toSafeError(new Error('raw detail'))).toEqual({
      code: 'internal_error',
      message: 'Unexpected internal error'
    })
  })
})

describe('role permissions and operator identity', () => {
  it('checks role permissions and fails closed on denied permissions', () => {
    expect(roleHasPermission('Operator', 'conversation:assume')).toBe(true)
    expect(roleHasPermission('Operator', 'approval:decide')).toBe(false)
    expect(requirePermission('Admin', 'policy:configure')).toBeUndefined()
    expect(() => requirePermission('Operator', 'approval:decide')).toThrow(
      /Operator cannot perform approval:decide/
    )
  })

  it('accepts array-shaped identity headers and omits an absent tenant', () => {
    const identity = parseOperatorIdentity({
      'x-operator-id': ['operator.coverage'],
      'x-operator-role': ['Supervisor'],
      'x-tenant-id': ['tenant_00000000-0000-4000-8000-000000000901']
    })
    expect(identity).toEqual({
      operatorId: 'operator.coverage',
      role: 'Supervisor',
      tenantId: 'tenant_00000000-0000-4000-8000-000000000901'
    })

    expect(
      parseOperatorIdentity({
        'x-operator-id': 'operator.coverage',
        'x-operator-role': 'Admin'
      })
    ).toEqual({ operatorId: 'operator.coverage', role: 'Admin' })
  })
})

describe('canonical JSON edge branches', () => {
  it('fails closed on top-level undefined and supports boolean false', () => {
    expect(canonicalizeJson(false)).toBe('false')
    expect(() => canonicalizeJson(undefined)).toThrow(CanonicalJsonError)
    expect(() => canonicalizeJson(undefined)).toThrow(/top-level undefined/)
  })

  it('fails closed when the node budget is exceeded', () => {
    const payload = Array.from(
      { length: CANONICAL_JSON_MAX_NODES + 1 },
      () => 0
    )
    expect(() => canonicalizeJson(payload)).toThrow(/node budget/)
  })
})

const productionEnv = {
  NODE_ENV: 'production' as const,
  OPENAI_API_KEY: 'configured-provider',
  WEBHOOK_SIGNING_SECRET: 'production-webhook-signing-secret-123456',
  POSTGRES_RLS_ENFORCEMENT: 'true' as const,
  INBOUND_TENANT_ID: 'tenant_00000000-0000-4000-8000-000000000001',
  INBOUND_AGENT_ID: 'agent_00000000-0000-4000-8000-000000000001',
  API_ALLOWED_ORIGINS: 'https://console.example.test',
  API_REQUIRE_HTTPS: 'true' as const
}

describe('production environment hardening branches', () => {
  it('rejects missing or weak production webhook secrets', () => {
    expect(() =>
      parseEnv({ ...productionEnv, WEBHOOK_SIGNING_SECRET: undefined })
    ).toThrow(/webhook signing secret/)
    expect(() =>
      parseEnv({ ...productionEnv, WEBHOOK_SIGNING_SECRET: 'short' })
    ).toThrow(/webhook signing secret/)
    expect(() =>
      parseEnv({ ...productionEnv, WEBHOOK_SIGNING_SECRET: 'replace-me' })
    ).toThrow(/webhook signing secret/)
  })

  it('rejects missing trusted inbound scope identifiers', () => {
    expect(() =>
      parseEnv({ ...productionEnv, INBOUND_TENANT_ID: undefined })
    ).toThrow(/INBOUND_TENANT_ID/)
    expect(() =>
      parseEnv({ ...productionEnv, INBOUND_AGENT_ID: undefined })
    ).toThrow(/INBOUND_AGENT_ID/)
  })

  it('keeps real-world actions disabled when no flag is enabled', () => {
    expect(realWorldActionsDisabled(parseEnv(productionEnv))).toBe(true)
    expect(
      realWorldActionsDisabled({
        ...parseEnv(productionEnv),
        ENABLE_REAL_RAG: true
      })
    ).toBe(false)
  })
})

describe('SSRF remaining range branches', () => {
  it('flags documentation, mapped and malformed private ranges', () => {
    expect(isPrivateIpAddress('192.0.0.8')).toBe(true)
    expect(isPrivateIpAddress('198.51.100.7')).toBe(true)
    expect(isPrivateIpAddress('203.0.113.9')).toBe(true)
    expect(isPrivateIpAddress('')).toBe(true)
    expect(isPrivateIpAddress('::ffff:not-an-ip')).toBe(true)
    expect(isPrivateIpAddress('64:ff9b::1')).toBe(true)
    expect(isPrivateIpAddress('999.1.1.1')).toBe(false)
    expect(isPrivateIpAddress('203.0.114.7')).toBe(false)
  })

  it('rejects blocked suffixes, empty allowlist entries and wildcard mismatches', () => {
    expect(evaluateOutboundUrl('https://api.local')).toMatchObject({
      allowed: false,
      reason: 'blocked_hostname_suffix'
    })
    expect(evaluateOutboundUrl('https://node.internal/x')).toMatchObject({
      allowed: false,
      reason: 'blocked_hostname_suffix'
    })
    expect(
      evaluateOutboundUrl('https://api.example.com', { allowedHosts: [''] })
        .allowed
    ).toBe(false)
    expect(
      evaluateOutboundUrl('https://example.com', {
        allowedHosts: ['*.example.com']
      }).allowed
    ).toBe(false)
  })

  it('returns the parsed URL for an allowlisted host and honors private DNS opt-in', () => {
    expect(
      assertSafeOutboundUrl('https://api.example.com/v1', {
        allowedHosts: ['api.example.com']
      }).href
    ).toBe('https://api.example.com/v1')
    expect(
      evaluateResolvedAddresses(['10.0.0.2'], { allowPrivateNetworks: true })
    ).toEqual({ allowed: true })
    expect(evaluateResolvedAddresses(['10.0.0.2']).allowed).toBe(false)
  })
})

type FakeSignalSource = {
  once(event: string, listener: () => void): unknown
  fire(event: 'SIGTERM' | 'SIGINT'): void
}

function fakeSignalSource(): FakeSignalSource {
  const listeners = new Map<string, () => void>()
  return {
    once(event, listener) {
      listeners.set(event, listener)
      return this
    },
    fire(event) {
      listeners.get(event)?.()
    }
  }
}

describe('shutdown controller late-settlement branches', () => {
  it('does not exit twice when close settles after the timeout fired', async () => {
    vi.useFakeTimers()
    try {
      let resolveClose: (() => void) | undefined
      const exit = vi.fn()
      const events: ShutdownEvent[] = []
      const controller = createShutdownController({
        close: () =>
          new Promise<void>((resolve) => {
            resolveClose = resolve
          }),
        flush: async () => undefined,
        exit,
        timeoutMs: 1_000,
        log: (event) => events.push(event)
      })

      expect(controller.isShuttingDown()).toBe(false)
      void controller.shutdown('SIGTERM')
      await vi.advanceTimersByTimeAsync(1_001)
      expect(exit).toHaveBeenCalledTimes(1)
      expect(controller.isShuttingDown()).toBe(true)

      resolveClose?.()
      await vi.advanceTimersByTimeAsync(0)
      expect(exit).toHaveBeenCalledTimes(1)
      expect(events.map((event) => event.type)).toEqual([
        'shutdown.started',
        'shutdown.timeout'
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('swallows a late close rejection after the timeout already exited', async () => {
    vi.useFakeTimers()
    try {
      let rejectClose: ((error: Error) => void) | undefined
      const exit = vi.fn()
      const events: ShutdownEvent[] = []
      const controller = createShutdownController({
        close: () =>
          new Promise<void>((_resolve, reject) => {
            rejectClose = reject
          }),
        exit,
        timeoutMs: 1_000,
        log: (event) => events.push(event)
      })

      void controller.shutdown('SIGINT')
      await vi.advanceTimersByTimeAsync(1_001)
      rejectClose?.(new Error('late close failure'))
      await vi.advanceTimersByTimeAsync(0)

      expect(exit).toHaveBeenCalledTimes(1)
      expect(events.map((event) => event.type)).toEqual([
        'shutdown.started',
        'shutdown.timeout'
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports unknown_error for a non-Error close rejection', async () => {
    const exit = vi.fn()
    const events: ShutdownEvent[] = []
    const controller = createShutdownController({
      close: () => {
        throw 'opaque failure'
      },
      exit,
      log: (event) => events.push(event)
    })

    await controller.shutdown('SIGTERM')

    expect(exit).toHaveBeenCalledWith(1)
    expect(events.at(-1)).toMatchObject({
      type: 'shutdown.failed',
      error: 'unknown_error'
    })
  })

  it('installs listeners for each configured signal and stays single-shot', async () => {
    const source = fakeSignalSource()
    const exit = vi.fn()
    const controller = createShutdownController({
      close: async () => undefined,
      exit,
      signals: ['SIGINT']
    })

    controller.install(source)
    source.fire('SIGINT')
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))
    expect(controller.isShuttingDown()).toBe(true)
  })
})
