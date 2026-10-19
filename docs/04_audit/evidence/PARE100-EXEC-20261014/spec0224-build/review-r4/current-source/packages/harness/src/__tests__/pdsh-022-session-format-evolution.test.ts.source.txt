import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  canonicalizeJson,
  type SessionEvent,
  type SessionJson
} from '@cvg/harness-contracts'
import {
  SessionFormatMigrationError,
  createSessionFormatRegistry,
  sessionEventFingerprint,
  sessionFormatDefinitionV1,
  type SessionFormatDefinition,
  type SessionFormatEvent,
  type SessionFormatStep
} from '../session/index.ts'

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex')
const v2Fingerprint = (type: string) => digest(`session-format-v2:${type}`)
const v3Fingerprint = (type: string) => digest(`session-format-v3:${type}`)

function v1Event(
  type: 'message/user' | 'message/assistant' = 'message/user'
): SessionEvent {
  return {
    formatVersion: 1,
    eventId: 'event-1',
    tenantId: 'tenant-synthetic',
    sessionId: 'session-synthetic',
    sequence: 1,
    type,
    schemaFingerprint: sessionEventFingerprint(type),
    timestamp: '2026-10-12T00:00:00.000Z',
    correlationId: 'corr-synthetic',
    traceId: 'trace-synthetic',
    payload: { text: 'synthetic' }
  }
}

function clonePayload(payload: SessionJson): SessionJson {
  return JSON.parse(canonicalizeJson(payload)) as SessionJson
}

function v2Definition(
  over: Partial<SessionFormatDefinition> = {}
): SessionFormatDefinition {
  return {
    version: 2,
    fingerprint: v2Fingerprint,
    validate: (event) => {
      if (!event || typeof event !== 'object' || Array.isArray(event)) {
        throw new Error('v2: event must be an object')
      }
      const record = event as Record<string, unknown>
      if (record.formatVersion !== 2) throw new Error('v2: formatVersion')
      if (
        typeof record.eventId !== 'string' ||
        typeof record.tenantId !== 'string' ||
        typeof record.sessionId !== 'string'
      ) {
        throw new Error('v2: identity')
      }
      if (
        typeof record.sequence !== 'number' ||
        !Number.isSafeInteger(record.sequence)
      ) {
        throw new Error('v2: sequence')
      }
      if (typeof record.type !== 'string') throw new Error('v2: type')
      if (record.schemaFingerprint !== v2Fingerprint(record.type)) {
        throw new Error('v2: fingerprint')
      }
      const payload = record.payload
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('v2: payload')
      }
      if (
        record.type === 'message/user' ||
        record.type === 'message/assistant'
      ) {
        const body = payload as Record<string, unknown>
        if (typeof body.content !== 'string') throw new Error('v2: content')
        if ('text' in body) throw new Error('v2: legacy text')
      }
      return { ...(record as unknown as SessionFormatEvent) }
    },
    ...over
  }
}

function v3Definition(): SessionFormatDefinition {
  return {
    version: 3,
    fingerprint: v3Fingerprint,
    validate: (event) => {
      const record = event as Record<string, unknown>
      if (!record || record.formatVersion !== 3)
        throw new Error('v3: formatVersion')
      if (typeof record.type !== 'string') throw new Error('v3: type')
      if (record.schemaFingerprint !== v3Fingerprint(record.type)) {
        throw new Error('v3: fingerprint')
      }
      if (record.type === 'message/user') {
        const payload = record.payload as Record<string, unknown>
        if (typeof payload.content !== 'string') throw new Error('v3: content')
      }
      return { ...(record as unknown as SessionFormatEvent) }
    }
  }
}

const stepV1V2: SessionFormatStep = {
  from: 1,
  to: 2,
  transform: (event) => {
    if (event.type === 'message/user' || event.type === 'message/assistant') {
      return { content: (event.payload as { text: string }).text }
    }
    return clonePayload(event.payload)
  }
}

const stepV2V3: SessionFormatStep = {
  from: 2,
  to: 3,
  transform: (event) => clonePayload(event.payload)
}

function freezeDeep(value: unknown, seen: Set<object> = new Set()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value as object)) freezeDeep(child, seen)
  return Object.freeze(value)
}

function migrationCode(fn: () => unknown): string | undefined {
  try {
    fn()
    return undefined
  } catch (error) {
    return error instanceof SessionFormatMigrationError
      ? error.code
      : `unexpected:${String(error)}`
  }
}

describe('PDSH-022 session format evolution (SPEC 0203)', () => {
  it('migrates a v1 event to the synthetic v2 and validates the derived view', () => {
    const source = v1Event()
    const before = canonicalizeJson(source)
    const registry = createSessionFormatRegistry({
      definitions: [sessionFormatDefinitionV1(), v2Definition()],
      steps: [stepV1V2]
    })
    const migrated = registry.migrate(source, 2)
    expect(migrated.formatVersion).toBe(2)
    expect(migrated.payload).toEqual({ content: 'synthetic' })
    expect(migrated.schemaFingerprint).toBe(v2Fingerprint('message/user'))
    expect(migrated.eventId).toBe('event-1')
    expect(migrated.sequence).toBe(1)
    expect(registry.versions).toEqual([1, 2])
    expect(canonicalizeJson(source)).toBe(before)
    expect(registry.migrate(source, 1)).toEqual(source)

    const turnStart: SessionEvent = {
      ...v1Event(),
      type: 'turn/start',
      schemaFingerprint: sessionEventFingerprint('turn/start'),
      payload: { correlationId: 'corr-synthetic' }
    }
    const passthrough = registry.migrate(turnStart, 2)
    expect(passthrough.payload).toEqual({ correlationId: 'corr-synthetic' })
  })

  it('is deterministic across runs and equivalent registries', () => {
    const build = () =>
      createSessionFormatRegistry({
        definitions: [sessionFormatDefinitionV1(), v2Definition()],
        steps: [stepV1V2]
      })
    const first = build().migrate(v1Event(), 2)
    const second = build().migrate(v1Event(), 2)
    expect(canonicalizeJson(second)).toBe(canonicalizeJson(first))
  })

  it('chains adjacent steps and equals the composed migration', () => {
    const registry = createSessionFormatRegistry({
      definitions: [
        sessionFormatDefinitionV1(),
        v2Definition(),
        v3Definition()
      ],
      steps: [stepV1V2, stepV2V3]
    })
    const direct = registry.migrate(v1Event(), 3)
    const staged = registry.migrate(registry.migrate(v1Event(), 2), 3)
    expect(canonicalizeJson(staged)).toBe(canonicalizeJson(direct))
    expect(direct.formatVersion).toBe(3)
    expect(direct.schemaFingerprint).toBe(v3Fingerprint('message/user'))
    expect(registry.versions).toEqual([1, 2, 3])
  })

  it('keeps a frozen source event byte-identical', () => {
    const source = freezeDeep(v1Event()) as SessionEvent
    const before = canonicalizeJson(source)
    const registry = createSessionFormatRegistry({
      definitions: [sessionFormatDefinitionV1(), v2Definition()],
      steps: [stepV1V2]
    })
    expect(() => registry.migrate(source, 2)).not.toThrow()
    expect(canonicalizeJson(source)).toBe(before)
  })

  it('rejects an invalid registry at boot', () => {
    const v1 = sessionFormatDefinitionV1()
    const v2 = v2Definition()
    const code = (input: Parameters<typeof createSessionFormatRegistry>[0]) =>
      migrationCode(() => createSessionFormatRegistry(input))
    expect(
      code({
        definitions: [v1, v2],
        steps: [{ from: 1, to: 3, transform: (event) => event.payload }]
      })
    ).toBe('format_registry_invalid')
    expect(code({ definitions: [v1, v2], steps: [stepV1V2, stepV1V2] })).toBe(
      'format_registry_invalid'
    )
    expect(
      code({
        definitions: [v1, v2],
        steps: [{ from: 4, to: 5, transform: (event) => event.payload }]
      })
    ).toBe('format_registry_invalid')
    expect(
      code({
        definitions: [v1, v2],
        steps: [{ from: 2, to: 3, transform: (event) => event.payload }]
      })
    ).toBe('format_registry_invalid')
    expect(code({ definitions: [v1, v1], steps: [] })).toBe(
      'format_registry_invalid'
    )
    expect(code({ definitions: [], steps: [] })).toBe('format_registry_invalid')
    expect(
      code({
        definitions: [v1, v2],
        steps: [{ from: 1, to: 2, transform: 'not-a-function' as never }]
      })
    ).toBe('format_registry_invalid')
  })

  it('rejects unknown, downgraded or missing-step migrations', () => {
    const registry = createSessionFormatRegistry({
      definitions: [sessionFormatDefinitionV1(), v2Definition()],
      steps: [stepV1V2]
    })
    expect(migrationCode(() => registry.migrate(v1Event(), 9))).toBe(
      'unknown_format_version'
    )
    expect(
      migrationCode(() =>
        registry.migrate({ ...v1Event(), formatVersion: 9 }, 2)
      )
    ).toBe('unknown_format_version')
    expect(
      migrationCode(() =>
        registry.migrate({ ...v1Event(), formatVersion: 2 }, 1)
      )
    ).toBe('downgrade_not_supported')

    const partial = createSessionFormatRegistry({
      definitions: [
        sessionFormatDefinitionV1(),
        v2Definition(),
        v3Definition()
      ],
      steps: [stepV2V3]
    })
    expect(migrationCode(() => partial.migrate(v1Event(), 3))).toBe(
      'missing_format_step'
    )
  })

  it('rejects a transform that mutates its frozen input', () => {
    const source = v1Event()
    const mutating: SessionFormatStep = {
      from: 1,
      to: 2,
      transform: (event) => {
        ;(event as { eventId: string }).eventId = 'mutated'
        return event.payload
      }
    }
    const registry = createSessionFormatRegistry({
      definitions: [sessionFormatDefinitionV1(), v2Definition()],
      steps: [mutating]
    })
    expect(migrationCode(() => registry.migrate(source, 2))).toBe(
      'invalid_step_output'
    )
    expect(source.eventId).toBe('event-1')
  })

  it('rejects a step output outside the target schema or fingerprint', () => {
    const source = v1Event()
    const wrongSchema: SessionFormatStep = {
      from: 1,
      to: 2,
      transform: (event) => clonePayload(event.payload)
    }
    const schemaRegistry = createSessionFormatRegistry({
      definitions: [sessionFormatDefinitionV1(), v2Definition()],
      steps: [wrongSchema]
    })
    expect(migrationCode(() => schemaRegistry.migrate(source, 2))).toBe(
      'invalid_step_output'
    )

    const wrongFingerprint = v2Definition({
      fingerprint: () => digest('wrong-v2-fingerprint')
    })
    const fingerprintRegistry = createSessionFormatRegistry({
      definitions: [sessionFormatDefinitionV1(), wrongFingerprint],
      steps: [stepV1V2]
    })
    expect(migrationCode(() => fingerprintRegistry.migrate(source, 2))).toBe(
      'invalid_step_output'
    )
  })
})
