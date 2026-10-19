import { describe, expect, it } from 'vitest'
import {
  canonicalJson,
  createSuiteManifest,
  fixedClock,
  jsonDigest,
  normalizeLog,
  RecordingAudit,
  RecordingTelemetry,
  replayJsonClone,
  sequenceIds,
  type NormalizationRule
} from './index.js'

const instant = '2026-10-17T12:00:00.000Z'
const rules: NormalizationRule[] = [
  { field: 'eventId', mode: 'id', namespace: 'event' },
  { field: 'correlationId', mode: 'id', namespace: 'correlation' },
  { field: 'traceId', mode: 'id', namespace: 'trace' },
  { field: 'occurredAt', mode: 'timestamp', value: instant }
]
const corpus = () => [
  {
    eventId: 'a',
    correlationId: 'shared',
    traceId: 'a',
    occurredAt: instant,
    type: 'tool/result',
    tenantId: 'tenant_synthetic',
    payload: {
      eventId: 'payload-ID-must-stay',
      occurredAt: 'payload-time-must-stay',
      input: { message: 'synthetic' },
      output: { answer: 'answer' },
      error: null,
      operationKey: 'operation_synthetic',
      approval: 'DENIED',
      effect: 'NOT_STARTED',
      stopReason: 'POLICY_DENIED',
      counters: {
        toolCalls: 0,
        modelCalls: 1,
        steps: 1,
        tokens: 7,
        costUsd: 0.1
      }
    }
  },
  {
    eventId: 'b',
    correlationId: 'shared',
    traceId: 'b',
    occurredAt: instant,
    type: 'turn/end',
    tenantId: 'tenant_synthetic',
    payload: { response: 'done' }
  },
  {
    eventId: 'a',
    correlationId: 'other',
    traceId: 'b',
    occurredAt: instant,
    type: 'message/assistant',
    tenantId: 'tenant_synthetic',
    payload: { response: 'done' }
  }
]

describe('SPEC0230 TK02–04 — explicit log projection', () => {
  it('defaults to complete identity, keeps raw/policy and never aliases input', () => {
    const input = corpus()
    const original = replayJsonClone(input)
    const result = normalizeLog(input)
    expect(input).toEqual(original)
    expect(result.projection).toEqual(original)
    expect(result.raw).toEqual(original)
    expect(result.projection).not.toBe(result.raw)
    expect(result.policy).toEqual([])
    input[0]!.payload.output!.answer = 'changed later'
    input.pop()
    expect(result.projection).toEqual(original)
    expect(result.raw).toEqual(original)
    expect(Object.isFrozen(result.projection)).toBe(true)
  })

  it('rewrites only enumerated metadata, preserving equality/distinction by namespace', () => {
    const input = corpus()
    input[1]!.eventId = 'id:event:1' // cannot collide with an already mapped input
    const original = replayJsonClone(input)
    const policy = replayJsonClone(rules)
    const result = normalizeLog(input, policy)
    const projection = result.projection as Record<string, unknown>[]
    expect(projection.map((event) => event.eventId)).toEqual([
      'id:event:1',
      'id:event:2',
      'id:event:1'
    ])
    expect(projection.map((event) => event.correlationId)).toEqual([
      'id:correlation:1',
      'id:correlation:1',
      'id:correlation:2'
    ])
    expect(projection.map((event) => event.traceId)).toEqual([
      'id:trace:1',
      'id:trace:2',
      'id:trace:2'
    ])
    for (let i = 0; i < input.length; i++) {
      expect(projection[i]!.payload).toEqual(input[i]!.payload)
      expect(projection[i]!.tenantId).toEqual(input[i]!.tenantId)
      expect(projection[i]!.type).toEqual(input[i]!.type)
    }
    expect(input).toEqual(original)
    policy.pop()
    expect(result.policy).toEqual(rules)
    expect(result.policyDigest).toBe(jsonDigest(rules))
    expect(result.projectionDigest).toBe(jsonDigest(result.projection))
  })

  it('uses one bijection across fields explicitly assigned the same namespace', () => {
    const result = normalizeLog(corpus(), [
      { field: 'eventId', mode: 'id', namespace: 'shared' },
      { field: 'traceId', mode: 'id', namespace: 'shared' }
    ])
    const projected = result.projection as Record<string, unknown>[]
    expect(projected[0]!.eventId).toBe(projected[0]!.traceId)
    expect(projected[1]!.eventId).toBe(projected[1]!.traceId)
    expect(projected[0]!.eventId).not.toBe(projected[1]!.eventId)
  })

  it('permits explicit timestamp replacement, leaves absent fields absent', () => {
    const input = [
      {
        occurredAt: '2026-10-16T00:00:00.000Z',
        payload: { occurredAt: 'keep' }
      },
      { type: 'no-metadata' }
    ]
    const rule: NormalizationRule = {
      field: 'occurredAt',
      mode: 'timestamp',
      value: instant
    }
    const result = normalizeLog(input, [rule])
    expect(result.projection).toEqual([
      { occurredAt: instant, payload: { occurredAt: 'keep' } },
      { type: 'no-metadata' }
    ])
    expect(result.raw).toEqual(input)
    expect(normalizeLog(input).projectionDigest).not.toBe(
      result.projectionDigest
    )
    expect(normalizeLog(input).policyDigest).not.toBe(result.policyDigest)
  })

  it.each([
    ['payload.eventId'],
    ['tenantId'],
    ['payload'],
    ['error'],
    ['effect'],
    ['approval'],
    ['stopReason'],
    ['toolCalls'],
    ['costUsd'],
    ['*'],
    ['/eventId/'],
    ['metadata.eventId']
  ])('rejects unauthorized field/path %s', (field) => {
    expect(() =>
      normalizeLog(corpus(), [
        { field, mode: 'id', namespace: 'event' }
      ] as NormalizationRule[])
    ).toThrow()
  })

  it.each(
    [
      [{ field: 'eventId', mode: 'id', namespace: 'event', unknown: true }],
      [{ field: 'eventId', mode: 'drop', namespace: 'event' }],
      [{ field: 'eventId', mode: 'timestamp', value: instant }],
      [{ field: 'occurredAt', mode: 'id', namespace: 'time' }],
      [{ field: 'eventId', mode: 'id' }],
      [{ field: 'eventId', mode: 'id', namespace: '' }],
      [{ field: 'occurredAt', mode: 'timestamp', value: 'not-time' }],
      [rules[0], rules[0]],
      [rules[0], { field: 'eventId', mode: 'id', namespace: 'different' }],
      [null],
      null,
      { rules: [] }
    ].map((policy) => [policy])
  )('rejects invalid/conflicting policy %#', (policy) => {
    expect(() =>
      normalizeLog(corpus(), policy as NormalizationRule[])
    ).toThrow()
  })

  it.each([null, '', 123, {}, []])(
    'rejects malformed selected IDs %#',
    (eventId) => {
      expect(() => normalizeLog([{ eventId }], [rules[0]!])).toThrow()
    }
  )

  it('rejects malformed selected time and non-event log entries', () => {
    expect(() =>
      normalizeLog([{ occurredAt: 'yesterday' }], [rules[3]!])
    ).toThrow()
    for (const invalid of [{}, null, [null], [[]], ['event']])
      expect(() => normalizeLog(invalid)).toThrow()
  })

  const mutations: [string, (events: ReturnType<typeof corpus>) => void][] = [
    [
      'order',
      (events) => {
        events.reverse()
      }
    ],
    [
      'count',
      (events) => {
        events.pop()
      }
    ],
    [
      'tenant',
      (events) => {
        events[0]!.tenantId = 'other'
      }
    ],
    [
      'type',
      (events) => {
        events[0]!.type = 'tool/call'
      }
    ],
    [
      'input',
      (events) => {
        events[0]!.payload.input!.message = 'altered'
      }
    ],
    [
      'output',
      (events) => {
        events[0]!.payload.output!.answer = 'altered'
      }
    ],
    [
      'error',
      (events) => {
        Object.assign(events[0]!.payload, { error: 'failure' })
      }
    ],
    [
      'operation',
      (events) => {
        events[0]!.payload.operationKey = 'other'
      }
    ],
    [
      'approval',
      (events) => {
        events[0]!.payload.approval = 'APPROVED'
      }
    ],
    [
      'effect',
      (events) => {
        events[0]!.payload.effect = 'CONFIRMED'
      }
    ],
    [
      'stopReason',
      (events) => {
        events[0]!.payload.stopReason = 'COMPLETED'
      }
    ],
    ...['toolCalls', 'modelCalls', 'steps', 'tokens', 'costUsd'].map(
      (field): [string, (events: ReturnType<typeof corpus>) => void] => [
        field,
        (events) => {
          Object.assign(events[0]!.payload.counters!, { [field]: 999 })
        }
      ]
    ),
    [
      'ID distinction',
      (events) => {
        events[1]!.eventId = events[0]!.eventId
      }
    ],
    [
      'ID equality',
      (events) => {
        events[2]!.eventId = 'new'
      }
    ]
  ]
  it.each(mutations)('keeps changed %s distinguishable', (_label, mutate) => {
    const input = corpus()
    const before = replayJsonClone(input)
    const good = normalizeLog(input, rules)
    const badInput = replayJsonClone(input)
    mutate(badInput)
    const bad = normalizeLog(badInput, rules)
    expect(bad.projection).not.toEqual(good.projection)
    expect(bad.projectionDigest).not.toBe(good.projectionDigest)
    expect(input).toEqual(before)
    expect(good.raw).toEqual(before)
  })
})

describe('SPEC0230 TK04–05 — strict JSON and canonical manifest', () => {
  const suite = () => ({
    formatVersion: 1,
    id: 'synthetic-suite',
    version: '1.0.0',
    synthetic: true,
    cases: [
      { id: 'a', family: 'conformance' },
      { id: 'b', family: 'sdk' }
    ]
  })

  it('canonicalizes object key order but retains arrays, case order and values', () => {
    expect(canonicalJson({ z: [2, 1], a: { y: true, x: null } })).toBe(
      '{"a":{"x":null,"y":true},"z":[2,1]}'
    )
    expect(jsonDigest({ b: 2, a: 1 })).toBe(jsonDigest({ a: 1, b: 2 }))
    expect(jsonDigest([1, 2])).not.toBe(jsonDigest([2, 1]))
    expect(jsonDigest({ n: 1 })).not.toBe(jsonDigest({ n: '1' }))
    expect(canonicalJson(Object.assign(Object.create(null), { safe: 1 }))).toBe(
      '{"safe":1}'
    )
    const shared = { safe: true }
    expect(canonicalJson({ a: shared, b: shared })).toBe(
      '{"a":{"safe":true},"b":{"safe":true}}'
    )
  })

  it('materializes a detached manifest with reproducible digest, no result grant', () => {
    const input = suite()
    const first = createSuiteManifest(input)
    const second = createSuiteManifest({
      cases: [
        { family: 'conformance', id: 'a' },
        { family: 'sdk', id: 'b' }
      ],
      synthetic: true,
      version: '1.0.0',
      id: input.id,
      formatVersion: 1
    })
    expect(first).toEqual(second)
    expect(first.digest).toMatch(/^[a-f0-9]{64}$/)
    expect(first.digest).toBe(jsonDigest(first.manifest))
    expect(
      createSuiteManifest({ ...suite(), cases: [...suite().cases].reverse() })
        .digest
    ).not.toBe(first.digest)
    expect(Object.keys(first).sort()).toEqual(['digest', 'manifest'])
    input.cases[0]!.id = 'changed'
    input.cases.pop()
    expect(first.manifest.cases).toEqual(suite().cases)
    expect(Object.isFrozen(first.manifest.cases[0])).toBe(true)
  })

  it.each([
    { formatVersion: 2 },
    { version: 'next' },
    { version: '01.0.0' },
    { version: 1 },
    { synthetic: false },
    { synthetic: 'true' },
    { id: '' },
    { id: '../escape' },
    { cases: [] },
    {
      cases: [
        { id: 'a', family: 'sdk' },
        { id: 'a', family: 'replay' }
      ]
    },
    { cases: [{ id: 'a', family: '' }] },
    { cases: [{ id: 'a', family: 'sdk', pass: true }] },
    { cases: [{ id: 'a', family: 'sdk', synthetic: false }] },
    { pass: true },
    { status: 'PASS' },
    { parity: 100 },
    { extra: null }
  ])('rejects invalid/unknown/result-bearing manifest %#', (change) => {
    expect(() => createSuiteManifest({ ...suite(), ...change })).toThrow()
  })

  it('requires each manifest and case field', () => {
    for (const field of Object.keys(suite())) {
      const incomplete: Record<string, unknown> = { ...suite() }
      delete incomplete[field]
      expect(() => createSuiteManifest(incomplete)).toThrow()
    }
    expect(() =>
      createSuiteManifest({ ...suite(), cases: [{ id: 'a' }] })
    ).toThrow()
    expect(() => createSuiteManifest({ ...suite(), cases: [null] })).toThrow()
  })

  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  const extended: number[] & { extra?: number } = [1]
  extended.extra = 2
  const nonenumerable = Object.defineProperty({}, 'hidden', { value: 1 })
  const symbol = { [Symbol('hidden')]: 1 }
  const invalidValues: unknown[] = [
    undefined,
    NaN,
    Infinity,
    -Infinity,
    1n,
    () => 1,
    Symbol('x'),
    { invalid: undefined },
    [undefined],
    new Array(2),
    extended,
    new Date(instant),
    new Map(),
    new Set(),
    /pattern/,
    new Number(1),
    cycle,
    nonenumerable,
    symbol,
    JSON.parse('{"__proto__":{"polluted":true}}'),
    { constructor: {} },
    { prototype: {} },
    { toJSON: () => ({}) }
  ]
  it.each(invalidValues.map((value, i) => [i, value] as const))(
    'rejects non-JSON/unsafe data %# at all strict boundaries',
    (_i, value) => {
      expect(() => canonicalJson(value)).toThrow()
      expect(() => jsonDigest(value)).toThrow()
      expect(() => normalizeLog([{ payload: value }])).toThrow()
      expect(() => createSuiteManifest({ ...suite(), extra: value })).toThrow()
    }
  )

  it('never invokes getters or toJSON while validating', () => {
    let reads = 0
    const accessor = Object.defineProperty({}, 'eventId', {
      enumerable: true,
      get() {
        reads++
        return 'unsafe'
      }
    })
    const toJSON = {
      toJSON() {
        reads++
        return {}
      }
    }
    expect(() => normalizeLog([accessor])).toThrow()
    expect(() => canonicalJson(toJSON)).toThrow()
    expect(reads).toBe(0)
  })

  it('keeps the original replay JSON stringify/parse semantics separate', () => {
    const input = {
      absent: undefined,
      date: new Date(instant),
      values: [undefined, NaN],
      nested: { ok: true }
    }
    const clone = replayJsonClone(input)
    expect(clone).toEqual(JSON.parse(JSON.stringify(input)))
    expect(clone).toEqual({
      date: instant,
      values: [null, null],
      nested: { ok: true }
    })
    expect(clone.nested).not.toBe(input.nested)
    expect(() => replayJsonClone(undefined)).toThrow()
    expect(() => replayJsonClone(1n)).toThrow()
    expect(() => replayJsonClone(cycle)).toThrow()
    expect(() => canonicalJson(input)).toThrow()
  })
})

describe('SPEC0230 TK06 — local recording and injected time/IDs', () => {
  it('retains conformance reference semantics and replay copy/timeline order', async () => {
    const timeline: string[] = []
    const input = { nested: { status: 'synthetic' } }
    const audit = new RecordingAudit<typeof input>()
    const telemetry = new RecordingTelemetry<typeof input>()
    await audit.append(input)
    telemetry.record(input)
    expect(audit.events[0]).toBe(input)
    expect(telemetry.events[0]).toBe(input)
    const copied = new RecordingAudit<typeof input>({
      copy: replayJsonClone,
      onAppend: () => {
        timeline.push(`append:${copied.events.length}`)
      }
    })
    const copiedTelemetry = new RecordingTelemetry<typeof input>({
      copy: replayJsonClone,
      onRecord: () => {
        timeline.push(`record:${copiedTelemetry.events.length}`)
      }
    })
    await copied.append(input)
    copiedTelemetry.record(input)
    input.nested.status = 'changed'
    expect(copied.events[0]).toEqual({ nested: { status: 'synthetic' } })
    expect(copiedTelemetry.events[0]).toEqual({
      nested: { status: 'synthetic' }
    })
    expect(timeline).toEqual(['append:1', 'record:1'])
    expect(new RecordingAudit().events).toEqual([])
  })

  it('propagates copy/hook failures, never records a failed copy', async () => {
    const failure = new Error('synthetic sink failure')
    const copy = () => {
      throw failure
    }
    const audit = new RecordingAudit({ copy })
    await expect(audit.append({} as never)).rejects.toBe(failure)
    expect(audit.events).toEqual([])
    const telemetry = new RecordingTelemetry({ copy })
    expect(() => telemetry.record({} as never)).toThrow(failure)
    expect(telemetry.events).toEqual([])
    const afterAppend = new RecordingAudit({ onAppend: copy })
    await expect(afterAppend.append({} as never)).rejects.toBe(failure)
    expect(afterAppend.events).toHaveLength(1)
  })

  it('keeps clocks and sequences local, independent and exhaustion-safe', () => {
    const dateNow = Date.now
    const fetch = globalThis.fetch
    const clock = fixedClock(instant)
    const a = clock()
    a.setUTCFullYear(1999)
    expect(clock().toISOString()).toBe(instant)
    const first = sequenceIds('event_')
    const second = sequenceIds('event_')
    expect([first(), first(), second()]).toEqual([
      'event_1',
      'event_2',
      'event_1'
    ])
    expect(sequenceIds('offset_', 9)()).toBe('offset_10')
    expect(() => sequenceIds('event_', Number.MAX_SAFE_INTEGER)()).toThrow()
    for (const invalid of ['', 'yesterday', '2026-02-30T00:00:00.000Z'])
      expect(() => fixedClock(invalid)).toThrow()
    for (const start of [-1, 1.5, Infinity])
      expect(() => sequenceIds('id_', start)).toThrow()
    expect(() => sequenceIds('')).toThrow()
    expect(Date.now).toBe(dateNow)
    expect(globalThis.fetch).toBe(fetch)
  })
})
