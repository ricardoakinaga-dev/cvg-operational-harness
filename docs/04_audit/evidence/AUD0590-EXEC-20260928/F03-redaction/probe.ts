import assert from 'node:assert/strict'
import {
  OpenTelemetryTelemetry,
} from '../../../../../packages/observability/src/otel.ts'
import { InMemoryTelemetry } from '../../../../../packages/observability/src/telemetry.ts'
import type {
  Counter,
  Meter,
  Span,
  Tracer,
} from '@opentelemetry/api'

const marker = 'AUD0590_SYNTHETIC_MARKER'
const sdkCalls: Array<{ operation: string; containsMarker: boolean }> = []

function captured(operation: string, arguments_: unknown): void {
  sdkCalls.push({
    operation,
    containsMarker: JSON.stringify(arguments_).includes(marker),
  })
}

let spanSequence = 0
function fakeSpan(): Span {
  spanSequence += 1
  return {
    spanContext: () => ({
      traceId: 'a'.repeat(32),
      spanId: spanSequence.toString(16).padStart(16, '0'),
      traceFlags: 1,
    }),
    setAttribute: (key, value) => {
      captured('setAttribute', { key, value })
      return true
    },
    setStatus: (status) => {
      captured('setStatus', status)
      return undefined
    },
    end: () => captured('end', null),
  } as unknown as Span
}

const tracer = {
  startSpan: (name: string, options: unknown, context: unknown) => {
    captured('startSpan', { name, options, context })
    return fakeSpan()
  },
} as unknown as Tracer

const counter = {
  add: (value: number, attributes: unknown) => {
    captured('counter.add', { value, attributes })
  },
} as unknown as Counter

const meter = {
  createCounter: () => counter,
  createHistogram: () => ({ record: () => undefined }),
} as unknown as Meter

const fallback = new InMemoryTelemetry()
const telemetry = new OpenTelemetryTelemetry({ tracer, meter, fallback })

const root = telemetry.startSpan('synthetic.root', {
  authorization: marker,
})
root.setAttribute('api_key', marker)
const child = root.child('synthetic.child', { password: marker })
root.end()
child.end()
telemetry.recordMetric('synthetic_requests_total', 1, { status: marker })

const leakingCalls = sdkCalls.filter((call) => call.containsMarker)
const localSpansContainingMarker = fallback
  .spans()
  .filter((span) => JSON.stringify(span.attributes).includes(marker)).length
const localMetricContainsMarker = fallback
  .metrics()
  .some((metric) => JSON.stringify(metric.attributes).includes(marker))

assert.equal(sdkCalls.length, 8)
assert.equal(leakingCalls.length, 4)
assert.deepEqual(
  leakingCalls.map((call) => call.operation),
  ['startSpan', 'setAttribute', 'startSpan', 'counter.add'],
)
assert.equal(localSpansContainingMarker, 2)
assert.equal(localMetricContainsMarker, true)

process.stdout.write(
  `${JSON.stringify(
    {
      scope: 'synthetic-local-only',
      realData: false,
      externalEffects: false,
      outboundCalls: sdkCalls.length,
      outboundCallsContainingMarker: leakingCalls.length,
      leakedOperations: leakingCalls.map((call) => call.operation),
      localSpansContainingMarker,
      localMetricContainsMarker,
    },
    null,
    2,
  )}\n`,
)
