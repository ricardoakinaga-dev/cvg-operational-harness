import { describe, expect, it } from 'vitest'
import {
  createTraceId,
  sanitizePersistedTrace,
  sanitizeTestSuiteRunTraces,
  sanitizeTraceForPersistence,
  type TestRunTrace
} from '../index.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000421'
const agentId = 'agent_00000000-0000-4000-8000-000000000421'
const versionId = 'agent_version_00000000-0000-4000-8000-000000000421'

function trace(): TestRunTrace {
  const startedAt = new Date('2026-08-26T09:00:00.000Z')
  const completedAt = new Date('2026-08-26T09:00:01.000Z')
  return {
    traceId: createTraceId(),
    tenantId,
    agentId,
    versionId,
    input: { message: 'Email trace@example.com', historySize: 1 },
    intent: { name: 'unknown', confidence: 0.2 },
    risk: { level: 'low', reason: 'controlled_low_risk_request' },
    policy: [],
    knowledge: { status: 'not_requested' },
    tools: [],
    handoff: { requested: false, reason: null, state: 'BOT_ACTIVE' },
    response: { text: 'Resposta segura.', mode: 'answer' },
    outputPolicy: {
      decision: 'allowed',
      reason: 'output_allowed',
      mode: 'answer',
      redacted: false
    },
    provider: {
      provider: 'fake',
      model: 'deterministic-v1',
      externalCall: false
    },
    prompt: {
      version: 'prompt-v1',
      blockIds: ['safety']
    },
    configVersion: 'config-v1',
    executionMode: 'TEST_LAB',
    status: 'completed',
    startedAt,
    completedAt,
    latencyMs: 1000,
    tokenUsage: {
      prompt: 4,
      completion: 3,
      total: 7,
      estimated: true
    },
    spans: [{ name: 'model', status: 'completed', durationMs: 1 }],
    conversationId: 'conversation-controlled',
    sessionId: 'session-controlled',
    createdAt: completedAt
  }
}

describe('controlled trace provenance boundary', () => {
  it('projects only allowlisted fields and redacts text again', () => {
    const polluted = {
      ...trace(),
      secret: 'should-never-survive',
      input: {
        ...trace().input,
        rawPayload: 'private payload'
      },
      provider: {
        ...trace().provider,
        apiKey: 'should-never-survive'
      }
    } as unknown as TestRunTrace

    const sanitized = sanitizeTraceForPersistence(polluted)

    expect(sanitized.input).toEqual({
      message: 'Email [redacted-email]',
      historySize: 1
    })
    expect(sanitized).not.toHaveProperty('secret')
    expect(sanitized.input).not.toHaveProperty('rawPayload')
    expect(sanitized.provider).toEqual({
      provider: 'fake',
      model: 'deterministic-v1',
      externalCall: false
    })

    const toolTrace = sanitizeTraceForPersistence({
      ...trace(),
      tools: [{ name: 'fixture_tool', status: 'succeeded' }],
      toolResults: [
        {
          name: 'fixture_tool',
          status: 'succeeded',
          output: { redacted: true, raw: 'private payload' }
        }
      ]
    } as unknown as TestRunTrace)
    expect(toolTrace.toolResults).toEqual([
      { name: 'fixture_tool', status: 'succeeded', output: { redacted: true } }
    ])
  })

  it.each([
    [
      'an external call',
      { provider: 'fake', model: 'deterministic-v1', externalCall: true }
    ],
    [
      'an unsupported provider',
      { provider: 'openrouter', model: 'external', externalCall: false }
    ],
    [
      'an unsupported model',
      { provider: 'fake', model: 'fixture', externalCall: false }
    ]
  ])('rejects %s declared by a trace', (_label, provider) => {
    expect(() =>
      sanitizeTraceForPersistence({
        ...trace(),
        provider
      } as unknown as TestRunTrace)
    ).toThrowError(expect.objectContaining({ code: 'validation_failed' }))
  })

  it('rejects malformed bounded fields instead of persisting them', () => {
    expect(() =>
      sanitizeTraceForPersistence({
        ...trace(),
        intent: { name: 'unknown', confidence: Number.NaN },
        spans: [{ name: 'not-a-span', status: 'completed', durationMs: 0 }]
      } as unknown as TestRunTrace)
    ).toThrowError(expect.objectContaining({ code: 'validation_failed' }))
  })

  it('canonicalizes serialized dates and rejects inconsistent output metadata', () => {
    const serialized = JSON.parse(JSON.stringify(trace())) as unknown
    const sanitized = sanitizeTraceForPersistence(serialized as TestRunTrace)

    expect(sanitized.createdAt).toBeInstanceOf(Date)
    expect(sanitized.startedAt).toBeInstanceOf(Date)
    expect(sanitized.completedAt).toBeInstanceOf(Date)

    expect(() =>
      sanitizeTraceForPersistence({
        ...trace(),
        outputPolicy: {
          decision: 'allowed',
          reason: 'unsafe_output_rejected',
          mode: 'answer',
          redacted: false
        }
      } as unknown as TestRunTrace)
    ).toThrowError(expect.objectContaining({ code: 'validation_failed' }))
  })

  it('rejects inconsistent handoff/tool containers without throwing a raw TypeError', () => {
    expect(() =>
      sanitizeTraceForPersistence({
        ...trace(),
        handoff: { requested: true, reason: null, state: 'HANDOFF_REQUESTED' }
      } as unknown as TestRunTrace)
    ).toThrowError(expect.objectContaining({ code: 'validation_failed' }))

    expect(() =>
      sanitizeTraceForPersistence({
        ...trace(),
        tools: [{ name: 'fixture_tool', status: 'succeeded' }],
        toolResults: []
      } as unknown as TestRunTrace)
    ).toThrowError(expect.objectContaining({ code: 'validation_failed' }))

    expect(() =>
      sanitizeTestSuiteRunTraces({
        ...trace(),
        variants: [{ label: 'A', results: null }],
        passed: true,
        createdBy: 'fixture'
      })
    ).toThrowError(expect.objectContaining({ code: 'validation_failed' }))
  })

  it.each([
    ['partial timing metadata', { startedAt: undefined }],
    [
      'inverted timing metadata',
      {
        startedAt: new Date('2026-08-26T09:00:02.000Z'),
        completedAt: new Date('2026-08-26T09:00:01.000Z'),
        latencyMs: 1000
      }
    ],
    ['incompatible latency', { latencyMs: 999 }],
    [
      'out-of-order spans',
      {
        spans: [
          { name: 'model', status: 'completed', durationMs: 1 },
          { name: 'intent', status: 'completed', durationMs: 1 }
        ]
      }
    ],
    [
      'span duration overflow',
      {
        spans: [
          { name: 'model', status: 'completed', durationMs: 600 },
          { name: 'response', status: 'completed', durationMs: 401 }
        ]
      }
    ],
    [
      'derived policy status drift',
      {
        policy: [
          {
            decision: 'blocked',
            layer: 'hard_safety',
            reason: 'controlled_block',
            policyVersion: 'policy-v1'
          }
        ],
        spans: [{ name: 'policy', status: 'completed', durationMs: 1 }]
      }
    ]
  ])('rejects %s in trace telemetry', (_label, changes) => {
    expect(() =>
      sanitizeTraceForPersistence({
        ...trace(),
        ...changes
      } as unknown as TestRunTrace)
    ).toThrowError(expect.objectContaining({ code: 'validation_failed' }))
  })

  it('preserves traces without optional temporal telemetry', () => {
    const { startedAt, completedAt, latencyMs, tokenUsage, spans, ...legacy } =
      trace()

    expect(
      sanitizeTraceForPersistence(legacy as unknown as TestRunTrace)
    ).toMatchObject({
      traceId: legacy.traceId,
      createdAt: legacy.createdAt
    })
    expect(startedAt).toBeInstanceOf(Date)
    expect(completedAt).toBeInstanceOf(Date)
    expect(latencyMs).toBe(1000)
    expect(tokenUsage).toBeDefined()
    expect(spans).toHaveLength(1)
  })

  describe('traces stored before a stricter output policy', () => {
    const unsafe = 'tome 2 comprimidos de amoxicilina a cada 8 horas'
    const stored = (changes: Record<string, unknown>) =>
      ({ ...trace(), ...changes }) as unknown as TestRunTrace

    it('refuses the text on write but reads it back as the template', () => {
      const legacy = stored({ response: { text: unsafe, mode: 'answer' } })

      expect(() => sanitizeTraceForPersistence(legacy)).toThrowError(
        expect.objectContaining({ code: 'validation_failed' })
      )
      const read = sanitizePersistedTrace(legacy)
      expect(JSON.stringify(read)).not.toContain('amoxicilina')
      expect(read.outputPolicy).toMatchObject({
        decision: 'rewritten',
        reason: 'unsafe_output_rejected'
      })
      expect(read.traceId).toBe(legacy.traceId)
    })

    it('reads a trace without a risk label, failing closed on its text', () => {
      const { risk, ...legacy } = trace()

      expect(risk).toBeDefined()
      expect(() =>
        sanitizeTraceForPersistence(legacy as unknown as TestRunTrace)
      ).toThrowError(expect.objectContaining({ code: 'validation_failed' }))
      expect(
        sanitizePersistedTrace(legacy as unknown as TestRunTrace).response.text
      ).not.toBe(legacy.response.text)
    })

    it('stays stable when a read trace is read again', () => {
      const once = sanitizePersistedTrace(
        stored({ response: { text: unsafe, mode: 'answer' } })
      )

      expect(sanitizePersistedTrace(once).response).toEqual(once.response)
    })

    it('still throws on a structural defect', () => {
      expect(() =>
        sanitizePersistedTrace(stored({ tenantId: '' }))
      ).toThrowError(expect.objectContaining({ code: 'validation_failed' }))
      expect(() =>
        sanitizePersistedTrace(
          stored({
            handoff: { requested: true, reason: null, state: 'BOT_ACTIVE' }
          })
        )
      ).toThrowError(expect.objectContaining({ code: 'validation_failed' }))
    })

    it('reads a stored suite run through the same rule', () => {
      const createdAt = new Date('2026-08-26T09:00:02.000Z')
      const run = {
        tenantId,
        id: 'run',
        suiteId: 'suite',
        agentId,
        passed: true,
        createdBy: 'admin',
        createdAt,
        variants: [
          {
            label: 'A',
            versionId,
            passed: true,
            results: [
              {
                caseId: 'case',
                passed: true,
                failures: [],
                trace: stored({ response: { text: unsafe, mode: 'answer' } })
              }
            ]
          }
        ]
      }

      expect(() => sanitizeTestSuiteRunTraces(run)).toThrowError(
        expect.objectContaining({ code: 'validation_failed' })
      )
      expect(
        JSON.stringify(sanitizeTestSuiteRunTraces(run, sanitizePersistedTrace))
      ).not.toContain('amoxicilina')
    })
  })
})
