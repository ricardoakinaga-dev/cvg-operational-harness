import { isDeepStrictEqual as equal } from 'node:util'

// Version-1 catalog fingerprints are per event type (contracts public catalog;
// harness/session/events.ts sessionEventFingerprint). This fixture freezes
// that existing protocol; it neither updates its schema nor recomputes goldens.
const fingerprints = {
  'message/user':
    '698b10ac7dad265e7741e1f3cb5f141b1075ec0d433e31e66432100f39d398a7',
  'turn/start':
    '87a9978378e95a399c015b0994dd6b195f75aa0cee565631c7ffc1e28f067e6b',
  'model/request':
    '175eb26e6ef99bd12a92c52ddf6fa573d97886cb14d3eacbf115f6671cf0694f',
  'turn/end': '01e3072ea573cdd68e51af5198f99c3da8b02193610fe4876255d6e2278f24df'
}

const requireFact = (value) => {
  if (!value) throw new Error('invalid native failure observation')
}
const keys = (value, expected) =>
  requireFact(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      equal(Object.keys(value).sort(), [...expected].sort())
  )
const timestamp = (value) =>
  requireFact(typeof value === 'string' && Number.isFinite(Date.parse(value)))
const referenceMessage = (message, role, text) => {
  keys(message, ['id', 'role', 'content', 'source'])
  requireFact(
    typeof message.id === 'string' &&
      message.id.length > 0 &&
      message.role === role
  )
  requireFact(equal(message.content, [{ type: 'text', text }]))
  requireFact(
    equal(message.source, {
      kind: role === 'system' ? 'system-prompt' : 'user'
    })
  )
}

// These are the two bounded test topologies, not a shared normalized event
// schema. Every native field remains in the raw measurement records.
export function assertNativeFailureSchemas(reference, cvg, fixture) {
  const r = reference.native,
    c = cvg.native,
    re = r.events,
    ce = c.events
  re.forEach((event, index) => {
    keys(event, [
      'type',
      'seq',
      'time',
      'data',
      ...([4, 5].includes(index) ? ['surfaceOp'] : [])
    ])
    if ([4, 5].includes(index)) requireFact(event.surfaceOp === 'append')
    requireFact(Number.isSafeInteger(event.time) && event.time >= 0)
  })
  keys(re[0].data, ['target', 'start', 'inserted'])
  requireFact(
    re[0].data.target === 'next-turn' &&
      re[0].data.start === 0 &&
      equal(re[0].data.inserted, [re[5].data])
  )
  requireFact(equal(re[1].data, { turn: 1 }))
  requireFact(
    equal(re[2].data, {
      target: 'next-turn',
      start: 0,
      removedCount: 1,
      inserted: []
    })
  )
  requireFact(equal(re[3].data, { turn: 1, step: 1 }))
  keys(re[4].data, ['turn', 'step', 'message'])
  requireFact(re[4].data.turn === 1 && re[4].data.step === 1)
  referenceMessage(
    re[4].data.message,
    'system',
    'You are an AI agent powered by DeepSeek Harness.'
  )
  referenceMessage(re[5].data, 'user', fixture.message)
  requireFact(re[5].data.id === `message-${fixture.id}`)
  requireFact(
    equal(r.messages, [re[4].data.message, re[5].data]) &&
      equal(r.requests, [r.messages])
  )
  requireFact(
    equal(re[6].data, {
      header: {
        config: {
          provider: 'pare100-synthetic',
          model: 'keyless-v1',
          maxTokens: 128
        }
      },
      reason: 'initial'
    })
  )
  requireFact(
    equal(re[7].data, { provider: 'pare100-synthetic', model: 'keyless-v1' })
  )
  keys(re[8].data, ['turn', 'step', 'stream'])
  requireFact(re[8].data.turn === 1 && re[8].data.step === 1)
  const frame = re[8].data.stream[0]
  keys(frame, ['type', 'time', 'chunk'])
  requireFact(
    frame.type === 'chunk' &&
      Number.isSafeInteger(frame.time) &&
      frame.time >= 0
  )
  requireFact(
    equal(frame.chunk, {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { message: fixture.failure.message, code: 'UNKNOWN' }
      }
    })
  )
  requireFact(equal(re[9].data, { turn: 1, step: 1 }))
  requireFact(
    equal(re[10].data, {
      turn: 1,
      reason: {
        kind: 'error',
        error: { message: fixture.failure.message, code: 'UNKNOWN' }
      }
    })
  )
  keys(r.liveErrors[0], ['turn', 'step', 'error'])

  keys(c.turn, [
    'stopReason',
    'response',
    'modelCalls',
    'toolCalls',
    'usage',
    'sessionId'
  ])
  const ids = new Set()
  ce.forEach((event) => {
    keys(event, [
      'correlationId',
      'eventId',
      'formatVersion',
      'payload',
      'schemaFingerprint',
      'sequence',
      'sessionId',
      'tenantId',
      'timestamp',
      'traceId',
      'type'
    ])
    requireFact(
      typeof event.eventId === 'string' &&
        /^[a-f0-9-]{36}$/.test(event.eventId) &&
        !ids.has(event.eventId)
    )
    ids.add(event.eventId)
    requireFact(
      event.formatVersion === 1 &&
        event.tenantId === 'pare100_synthetic' &&
        event.traceId === ce[0].traceId &&
        typeof event.traceId === 'string' &&
        event.traceId.length > 0
    )
    requireFact(event.schemaFingerprint === fingerprints[event.type])
    timestamp(event.timestamp)
  })
  requireFact(equal(ce[0].payload, { text: fixture.message }))
  requireFact(equal(ce[1].payload, { correlationId: ce[0].correlationId }))
  keys(ce[2].payload, ['correlationId', 'request'])
  requireFact(
    equal(ce[3].payload, {
      correlationId: ce[0].correlationId,
      stopReason: 'MODEL_FAILURE'
    })
  )
  const call = c.requests[0]
  keys(call, ['request', 'signalProvided', 'signalAborted'])
  requireFact(
    call.signalProvided === true &&
      call.signalAborted === false &&
      equal(call.request, ce[2].payload.request)
  )
  keys(call.request, ['messages', 'context', 'budget', 'correlationId'])
  requireFact(call.request.correlationId === ce[0].correlationId)
  requireFact(
    equal(call.request.messages, [
      {
        role: 'system',
        content: 'Answer the caller through the governed harness.\n'
      },
      { role: 'user', content: fixture.message }
    ])
  )
  keys(call.request.context, ['values', 'sourceIds', 'capturedAt'])
  requireFact(
    equal(call.request.context.values, {}) &&
      equal(call.request.context.sourceIds, [])
  )
  timestamp(call.request.context.capturedAt)
  requireFact(
    equal(call.request.budget, {
      maxSteps: 4,
      maxModelCalls: 2,
      maxToolCalls: 2,
      maxDurationMs: 30000,
      maxCostUsd: 1,
      maxTokens: 4000
    })
  )
}
