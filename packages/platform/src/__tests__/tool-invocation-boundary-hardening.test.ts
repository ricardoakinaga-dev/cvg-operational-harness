import { describe, expect, it } from 'vitest'
import {
  blockedResult,
  createSafeExecutionInput,
  isPlainRecord,
  normalizePluginHandlerResult,
  parseToolInput
} from '../tool-invocation-boundary.ts'
import type {
  PluginToolInputValidator,
  PluginToolOutputValidator
} from '../plugin-gateway.ts'

const passthrough: PluginToolInputValidator = {
  safeParse: (value: unknown) => ({ success: true as const, data: value })
}
const passthroughOutput: PluginToolOutputValidator = {
  safeParse: (value: unknown) => ({ success: true as const, data: value })
}
const rejectAll: PluginToolInputValidator = {
  safeParse: () => ({ success: false as const })
}
const throwingValidator: PluginToolInputValidator = {
  safeParse: () => {
    throw new Error('validator failure')
  }
}
const throwingOutput: PluginToolOutputValidator = {
  safeParse: () => {
    throw new Error('output failure')
  }
}

describe('bounded tool input parsing', () => {
  it('accepts and clones plain records, rejecting malformed validator results', () => {
    const source = { value: 'controlled', nested: { count: 1 } }
    const parsed = parseToolInput(passthrough, source)

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual(source)
      expect(parsed.data).not.toBe(source)
    }
    expect(parseToolInput(rejectAll, source)).toEqual({ success: false })
    expect(parseToolInput(throwingValidator, source)).toEqual({
      success: false
    })
    expect(parseToolInput({ safeParse: () => null } as never, source)).toEqual({
      success: false
    })
    expect(
      parseToolInput({ safeParse: () => ({ success: false }) } as never, source)
    ).toEqual({ success: false })
    expect(
      parseToolInput(
        { safeParse: () => ({ success: true, data: 'not-a-record' }) } as never,
        source
      )
    ).toEqual({ success: false })
  })

  it('fails closed for hostile keys, oversized strings and total size', () => {
    expect(
      parseToolInput(passthrough, JSON.parse('{"__proto__":{"bad":true}}'))
    ).toEqual({ success: false })
    expect(parseToolInput(passthrough, { value: 'x'.repeat(4001) })).toEqual({
      success: false
    })
    expect(
      parseToolInput(passthrough, [
        'a'.repeat(4000),
        'b'.repeat(4000),
        'c'.repeat(4000),
        'd'.repeat(4000),
        'e'.repeat(4000)
      ])
    ).toEqual({ success: false })
  })

  it('fails closed for depth, node, array and key budgets', () => {
    let deep: Record<string, unknown> = { value: 'leaf' }
    for (let index = 0; index < 10; index += 1) {
      deep = { child: deep }
    }
    expect(parseToolInput(passthrough, deep)).toEqual({ success: false })

    const wide = Array.from({ length: 64 }, () =>
      Array.from({ length: 64 }, () => 0)
    )
    expect(parseToolInput(passthrough, wide)).toEqual({ success: false })

    expect(
      parseToolInput(
        passthrough,
        Array.from({ length: 65 }, () => 0)
      )
    ).toEqual({ success: false })

    expect(
      parseToolInput(
        passthrough,
        Object.fromEntries(
          Array.from({ length: 65 }, (_value, index) => [`k${index}`, 1])
        )
      )
    ).toEqual({ success: false })
  })

  it('fails closed for non-finite, unsupported, cyclic and non-plain values', () => {
    expect(
      parseToolInput(passthrough, { value: Number.POSITIVE_INFINITY })
    ).toEqual({ success: false })
    expect(parseToolInput(passthrough, { value: () => undefined })).toEqual({
      success: false
    })
    expect(parseToolInput(passthrough, { value: Symbol('x') })).toEqual({
      success: false
    })
    expect(parseToolInput(passthrough, new Date())).toEqual({
      success: false
    })
    const cyclic: Record<string, unknown> = { value: 'x' }
    cyclic.self = cyclic
    expect(parseToolInput(passthrough, cyclic)).toEqual({ success: false })
  })
})

describe('handler result normalization', () => {
  it('rejects malformed results before they cross the boundary', () => {
    expect(normalizePluginHandlerResult(null, passthroughOutput)).toBeNull()
    expect(normalizePluginHandlerResult('text', passthroughOutput)).toBeNull()
    expect(
      normalizePluginHandlerResult({ status: 'unknown' }, passthroughOutput)
    ).toBeNull()
    expect(
      normalizePluginHandlerResult(
        { status: 'succeeded', data: { ok: true } },
        rejectAll as never
      )
    ).toBeNull()
    expect(
      normalizePluginHandlerResult(
        { status: 'succeeded', error: 42 },
        passthroughOutput
      )
    ).toBeNull()
    expect(
      normalizePluginHandlerResult(
        { status: 'succeeded', error: 'x'.repeat(241) },
        passthroughOutput
      )
    ).toBeNull()
    expect(
      normalizePluginHandlerResult(
        { status: 'succeeded', data: { ok: true } },
        throwingOutput
      )
    ).toBeNull()
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(
      normalizePluginHandlerResult(
        { status: 'succeeded', data: cyclic },
        passthroughOutput
      )
    ).toBeNull()
  })

  it('projects data through sanitization and normalizes handler errors', () => {
    const sanitized = normalizePluginHandlerResult(
      {
        status: 'succeeded',
        data: { ok: true, token: 'must-not-leak', email: 'ana@example.com' }
      },
      passthroughOutput
    )
    expect(sanitized).toEqual({ status: 'succeeded', data: { ok: true } })
    expect(JSON.stringify(sanitized)).not.toContain('must-not-leak')

    expect(
      normalizePluginHandlerResult(
        { status: 'failed', error: 'handler_failed_code' },
        passthroughOutput
      )
    ).toEqual({ status: 'failed', reason: 'handler_failed_code' })
    expect(
      normalizePluginHandlerResult(
        { status: 'failed', error: 'boom with spaces!' },
        passthroughOutput
      )
    ).toEqual({ status: 'failed', reason: 'tool_handler_failed' })
    expect(
      normalizePluginHandlerResult(
        { status: 'blocked', error: 'not allowed!' },
        passthroughOutput
      )
    ).toEqual({ status: 'blocked', reason: 'tool_handler_blocked' })
    expect(
      normalizePluginHandlerResult(
        { status: 'succeeded', error: 'ignored for success' },
        passthroughOutput
      )
    ).toEqual({ status: 'succeeded' })
  })
})

describe('plain record and safe input helpers', () => {
  it('accepts only plain object records and survives revoked proxies', () => {
    expect(isPlainRecord({})).toBe(true)
    expect(isPlainRecord(Object.create(null))).toBe(true)
    expect(isPlainRecord(null)).toBe(false)
    expect(isPlainRecord([])).toBe(false)
    expect(isPlainRecord('text')).toBe(false)
    expect(isPlainRecord(new Date())).toBe(false)

    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()
    expect(isPlainRecord(proxy)).toBe(false)
  })

  it('builds bounded execution input with optional fields only when supplied', () => {
    const minimal = createSafeExecutionInput({
      tenantId: 'tenant_00000000-0000-4000-8000-000000000431' as never,
      agentId: 'agent_00000000-0000-4000-8000-000000000431' as never,
      versionId: 'agent_version_00000000-0000-4000-8000-000000000431' as never,
      config: {} as never,
      toolName: 'read',
      actor: { id: 'operator.x', role: 'Operator', permissions: [] },
      policy: { decision: 'allowed', reason: 'controlled' },
      dryRun: true
    })

    expect(minimal).toMatchObject({
      toolName: 'read',
      input: {},
      dryRun: true
    })
    expect(minimal).not.toHaveProperty('traceId')
    expect(minimal).not.toHaveProperty('requireApproval')
    expect(minimal).not.toHaveProperty('approval')
    expect(minimal).not.toHaveProperty('onAudit')

    const onAudit = (): void => undefined
    const full = createSafeExecutionInput({
      tenantId: 'tenant_00000000-0000-4000-8000-000000000431' as never,
      agentId: 'agent_00000000-0000-4000-8000-000000000431' as never,
      versionId: 'agent_version_00000000-0000-4000-8000-000000000431' as never,
      traceId: 'trace_00000000-0000-4000-8000-000000000431' as never,
      config: {} as never,
      toolName: 'read',
      actor: {
        id: 'operator.x',
        role: 'Operator',
        permissions: ['fixture:read']
      },
      policy: { decision: 'requires_approval', reason: 'controlled' },
      dryRun: false,
      requireApproval: true,
      approval: {
        id: 'approval_00000000-0000-4000-8000-000000000431',
        tenantId: 'tenant_00000000-0000-4000-8000-000000000431' as never,
        agentId: 'agent_00000000-0000-4000-8000-000000000431' as never,
        versionId:
          'agent_version_00000000-0000-4000-8000-000000000431' as never,
        toolName: 'read',
        actorId: 'operator.x',
        expiresAt: new Date()
      },
      onAudit
    })

    expect(full).toMatchObject({ requireApproval: true, dryRun: false })
    expect(full.traceId).toBe('trace_00000000-0000-4000-8000-000000000431')
    expect(full.approval?.toolName).toBe('read')
    expect(full.onAudit).toBe(onAudit)
  })

  it('returns a blocked result envelope with the given correlation id', () => {
    const correlationId = 'corr_00000000-0000-4000-8000-000000000431' as never
    expect(blockedResult('tool_input_invalid', correlationId)).toEqual({
      status: 'blocked',
      reason: 'tool_input_invalid',
      correlationId
    })
  })
})
