import {
  SpanStatusCode,
  context as otelContext,
  trace as otelTrace,
  type Attributes as OtelAttributes,
  type Counter,
  type Histogram,
  type Meter,
  type Span,
  type Tracer
} from '@opentelemetry/api'
import {
  InMemoryTelemetry,
  type ActiveSpan,
  type Attributes,
  type LogLevel,
  type RecordedLog,
  type RecordedMetric,
  type RecordedSpan,
  type Telemetry
} from './telemetry.ts'

export interface OpenTelemetryOptions {
  tracer: Tracer
  meter?: Meter
  /** Local bounded buffer used for logs and inspection. */
  fallback?: Telemetry
}

/**
 * Real OpenTelemetry adapter. Spans are exported through the configured
 * TracerProvider; metrics through the configured MeterProvider. Local bounded
 * buffers are kept for diagnostics and tests.
 */
export class OpenTelemetryTelemetry implements Telemetry {
  readonly #tracer: Tracer
  readonly #meter?: Meter
  readonly #fallback: Telemetry
  readonly #instruments = new Map<string, Counter | Histogram>()

  constructor(options: OpenTelemetryOptions) {
    this.#tracer = options.tracer
    if (options.meter) this.#meter = options.meter
    this.#fallback = options.fallback ?? new InMemoryTelemetry()
  }

  startSpan(
    name: string,
    attributes: Attributes = {},
    parent?: import('./trace-context.ts').TraceContext
  ): ActiveSpan {
    const otelAttributes = toOtelAttributes(attributes)
    if (parent?.correlationId) {
      otelAttributes.correlationId = parent.correlationId
    }
    const otelSpan = this.#tracer.startSpan(name, {
      attributes: otelAttributes
    })
    return new OtelActiveSpan(this, name, otelSpan, attributes, this.#tracer)
  }

  recordMetric(name: string, value: number, attributes: Attributes = {}): void {
    this.#fallback.recordMetric(name, value, attributes)
    if (!this.#meter) return
    const instrument = this.#instrument(name)
    if (name.endsWith('_total') || name.endsWith('_count')) {
      ;(instrument as Counter).add(value, toOtelAttributes(attributes))
    } else {
      ;(instrument as Histogram).record(value, toOtelAttributes(attributes))
    }
  }

  log(
    level: LogLevel,
    message: string,
    fields?: Record<string, unknown>
  ): void {
    this.#fallback.log(level, message, fields)
  }

  spans(): RecordedSpan[] {
    return this.#fallback.spans()
  }

  metrics(): RecordedMetric[] {
    return this.#fallback.metrics()
  }

  logs(): RecordedLog[] {
    return this.#fallback.logs()
  }

  recordLocalSpan(span: RecordedSpan): void {
    this.#fallback
      .startSpan(span.name, span.attributes, {
        traceId: span.traceId,
        spanId: span.spanId,
        correlationId: span.correlationId
      })
      .end(span.status, span.errorCode)
  }

  #instrument(name: string): Counter | Histogram {
    const existing = this.#instruments.get(name)
    if (existing) return existing
    const instrument =
      name.endsWith('_total') || name.endsWith('_count')
        ? this.#meter!.createCounter(name)
        : this.#meter!.createHistogram(name)
    this.#instruments.set(name, instrument)
    return instrument
  }
}

class OtelActiveSpan implements ActiveSpan {
  readonly name: string
  readonly traceId: string
  readonly spanId: string
  readonly context: import('./trace-context.ts').TraceContext
  readonly #telemetry: OpenTelemetryTelemetry
  readonly #span: Span
  readonly #tracer: Tracer
  #attributes: Attributes
  #ended = false

  constructor(
    telemetry: OpenTelemetryTelemetry,
    name: string,
    span: Span,
    attributes: Attributes,
    tracer: Tracer
  ) {
    this.#telemetry = telemetry
    this.#span = span
    this.#tracer = tracer
    this.name = name
    const spanContext = span.spanContext()
    this.traceId = spanContext.traceId
    this.spanId = spanContext.spanId
    const correlationId =
      typeof attributes.correlationId === 'string'
        ? attributes.correlationId
        : 'corr_unknown_span'
    this.context = {
      traceId: this.traceId,
      spanId: this.spanId,
      correlationId
    }
    this.#attributes = { ...attributes }
  }

  setAttribute(key: string, value: string | number | boolean): ActiveSpan {
    this.#attributes[key] = value
    this.#span.setAttribute(key, value)
    return this
  }

  child(name: string, attributes: Attributes = {}): ActiveSpan {
    const parentContext = otelTrace.setSpan(otelContext.active(), this.#span)
    const childSpan = this.#tracer.startSpan(
      name,
      { attributes: toOtelAttributes(attributes) },
      parentContext
    )
    return new OtelActiveSpan(
      this.#telemetry,
      name,
      childSpan,
      attributes,
      this.#tracer
    )
  }

  end(status: 'ok' | 'error' = 'ok', errorCode?: string): void {
    if (this.#ended) return
    this.#ended = true
    if (status === 'error') {
      this.#span.setStatus({
        code: SpanStatusCode.ERROR,
        ...(errorCode !== undefined ? { message: errorCode } : {})
      })
    } else {
      this.#span.setStatus({ code: SpanStatusCode.OK })
    }
    this.#span.end()
    this.#telemetry.recordLocalSpan({
      name: this.name,
      traceId: this.traceId,
      spanId: this.spanId,
      correlationId: this.context.correlationId,
      startedAt: new Date(0).toISOString(),
      endedAt: new Date(0).toISOString(),
      durationMs: 0,
      status,
      ...(errorCode !== undefined ? { errorCode } : {}),
      attributes: this.#attributes
    })
  }
}

function toOtelAttributes(attributes: Attributes): OtelAttributes {
  const result: OtelAttributes = {}
  for (const [key, value] of Object.entries(attributes)) {
    result[key] = value
  }
  return result
}
