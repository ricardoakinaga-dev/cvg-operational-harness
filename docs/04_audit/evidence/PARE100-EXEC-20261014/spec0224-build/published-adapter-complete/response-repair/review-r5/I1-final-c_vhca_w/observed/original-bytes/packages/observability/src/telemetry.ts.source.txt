import type { TraceContext, TraceIdGenerator } from './trace-context.ts'
import { cryptoIdGenerator } from './trace-context.ts'
import { redactAttributeValue, redactFields } from './redaction.ts'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type AttributeValue = string | number | boolean
export type Attributes = Record<string, AttributeValue>

export interface RecordedSpan {
  name: string
  traceId: string
  spanId: string
  parentSpanId?: string
  correlationId: string
  startedAt: string
  endedAt: string
  durationMs: number
  status: 'ok' | 'error'
  errorCode?: string
  attributes: Attributes
}

export interface RecordedMetric {
  name: string
  value: number
  attributes: Attributes
  timestamp: string
}

export interface RecordedLog {
  level: LogLevel
  message: string
  fields: Record<string, unknown>
  timestamp: string
}

export interface ActiveSpan {
  readonly name: string
  readonly traceId: string
  readonly spanId: string
  readonly context: TraceContext
  setAttribute(key: string, value: AttributeValue): ActiveSpan
  child(name: string, attributes?: Attributes): ActiveSpan
  end(status?: 'ok' | 'error', errorCode?: string): void
}

export interface Telemetry {
  startSpan(
    name: string,
    attributes?: Attributes,
    parent?: TraceContext
  ): ActiveSpan
  recordMetric(name: string, value: number, attributes?: Attributes): void
  log(level: LogLevel, message: string, fields?: Record<string, unknown>): void
  spans(): RecordedSpan[]
  metrics(): RecordedMetric[]
  logs(): RecordedLog[]
}

export const METRIC_ATTRIBUTE_ALLOWLIST: readonly string[] = [
  'operation',
  'channel',
  'provider',
  'model',
  'profile',
  'status',
  'decision',
  'capability',
  'agentProfile',
  'risk',
  'outcome'
]

export class MetricAttributeError extends Error {
  readonly key: string

  constructor(key: string) {
    super(
      `Metric attribute ${key} is not allowlisted to avoid high cardinality`
    )
    this.name = 'MetricAttributeError'
    this.key = key
  }
}

export interface TelemetryOptions {
  clock?: () => Date
  idGenerator?: TraceIdGenerator
  onSpan?: (span: RecordedSpan) => void
  onMetric?: (metric: RecordedMetric) => void
  onLog?: (log: RecordedLog) => void
  maxSpans?: number
  maxMetrics?: number
  maxLogs?: number
}

/**
 * Deterministic in-process telemetry. Used by tests, evals and by engines that
 * run without an OpenTelemetry runtime; the OTel adapter lives in otel.ts.
 */
export class InMemoryTelemetry implements Telemetry {
  readonly #clock: () => Date
  readonly #ids: TraceIdGenerator
  readonly #spans: RecordedSpan[] = []
  readonly #metrics: RecordedMetric[] = []
  readonly #logs: RecordedLog[] = []
  readonly #onSpan?: (span: RecordedSpan) => void
  readonly #onMetric?: (metric: RecordedMetric) => void
  readonly #onLog?: (log: RecordedLog) => void
  readonly #maxSpans: number
  readonly #maxMetrics: number
  readonly #maxLogs: number

  constructor(options: TelemetryOptions = {}) {
    this.#clock = options.clock ?? (() => new Date())
    this.#ids = options.idGenerator ?? cryptoIdGenerator
    if (options.onSpan) this.#onSpan = options.onSpan
    if (options.onMetric) this.#onMetric = options.onMetric
    if (options.onLog) this.#onLog = options.onLog
    this.#maxSpans = options.maxSpans ?? 1_000
    this.#maxMetrics = options.maxMetrics ?? 5_000
    this.#maxLogs = options.maxLogs ?? 2_000
  }

  startSpan(
    name: string,
    attributes: Attributes = {},
    parent?: TraceContext
  ): ActiveSpan {
    return new InMemoryActiveSpan(this, {
      name,
      attributes,
      ...(parent !== undefined ? { parent } : {}),
      clock: this.#clock,
      ids: this.#ids,
      record: (span) => this.#recordSpan(span)
    })
  }

  recordMetric(name: string, value: number, attributes: Attributes = {}): void {
    for (const key of Object.keys(attributes)) {
      if (!METRIC_ATTRIBUTE_ALLOWLIST.includes(key)) {
        throw new MetricAttributeError(key)
      }
    }
    const metric: RecordedMetric = {
      name,
      value,
      attributes: sanitizeAttributes(attributes),
      timestamp: this.#clock().toISOString()
    }
    pushBounded(this.#metrics, metric, this.#maxMetrics)
    this.#onMetric?.(metric)
  }

  log(
    level: LogLevel,
    message: string,
    fields: Record<string, unknown> = {}
  ): void {
    const log: RecordedLog = {
      level,
      message: redactAttributeValue(message),
      fields: redactFields(fields),
      timestamp: this.#clock().toISOString()
    }
    pushBounded(this.#logs, log, this.#maxLogs)
    this.#onLog?.(log)
  }

  spans(): RecordedSpan[] {
    return [...this.#spans]
  }

  metrics(): RecordedMetric[] {
    return [...this.#metrics]
  }

  logs(): RecordedLog[] {
    return [...this.#logs]
  }

  #recordSpan(span: RecordedSpan): void {
    pushBounded(this.#spans, span, this.#maxSpans)
    this.#onSpan?.(span)
  }
}

class InMemoryActiveSpan implements ActiveSpan {
  readonly name: string
  readonly traceId: string
  readonly spanId: string
  readonly context: TraceContext
  readonly #telemetry: InMemoryTelemetry
  #attributes: Attributes
  #parentSpanId: string | undefined
  #clock: () => Date
  #ids: TraceIdGenerator
  #record: (span: RecordedSpan) => void
  #startedAt: Date
  #ended = false

  constructor(
    telemetry: InMemoryTelemetry,
    options: {
      name: string
      attributes: Attributes
      parent?: TraceContext
      clock: () => Date
      ids: TraceIdGenerator
      record: (span: RecordedSpan) => void
    }
  ) {
    this.#telemetry = telemetry
    this.name = options.name
    this.#clock = options.clock
    this.#ids = options.ids
    this.#record = options.record
    this.traceId = options.parent?.traceId ?? options.ids.traceId()
    this.spanId = options.ids.spanId()
    this.#parentSpanId = options.parent?.spanId
    this.#startedAt = options.clock()
    this.#attributes = sanitizeAttributes(options.attributes)
    this.context = {
      traceId: this.traceId,
      spanId: this.spanId,
      correlationId:
        options.parent?.correlationId ??
        attributeString(this.#attributes, 'correlationId') ??
        'corr_unknown_span',
      ...pickContextAttribute(
        'tenantId',
        options.parent?.tenantId,
        this.#attributes
      ),
      ...pickContextAttribute(
        'conversationId',
        options.parent?.conversationId,
        this.#attributes
      ),
      ...pickContextAttribute(
        'sessionId',
        options.parent?.sessionId,
        this.#attributes
      ),
      ...pickContextAttribute(
        'agentId',
        options.parent?.agentId,
        this.#attributes
      ),
      ...pickContextAttribute(
        'agentVersion',
        options.parent?.agentVersion,
        this.#attributes
      )
    }
  }

  setAttribute(key: string, value: AttributeValue): ActiveSpan {
    this.#attributes[key] = redactAttributeValue(String(value))
    return this
  }

  child(name: string, attributes: Attributes = {}): ActiveSpan {
    return this.#telemetry.startSpan(name, attributes, this.context)
  }

  end(status: 'ok' | 'error' = 'ok', errorCode?: string): void {
    if (this.#ended) return
    this.#ended = true
    const endedAt = this.#clock()
    const span: RecordedSpan = {
      name: this.name,
      traceId: this.traceId,
      spanId: this.spanId,
      ...(this.#parentSpanId !== undefined
        ? { parentSpanId: this.#parentSpanId }
        : {}),
      correlationId: this.context.correlationId,
      startedAt: this.#startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: Math.max(0, endedAt.getTime() - this.#startedAt.getTime()),
      status,
      ...(errorCode !== undefined ? { errorCode } : {}),
      attributes: this.#attributes
    }
    this.#record(span)
  }
}

function attributeString(
  attributes: Attributes,
  key: string
): string | undefined {
  const value = attributes[key]
  return typeof value === 'string' ? value : undefined
}

function pickContextAttribute(
  key: 'tenantId' | 'conversationId' | 'sessionId' | 'agentId' | 'agentVersion',
  parentValue: string | undefined,
  attributes: Attributes
): Partial<Record<typeof key, string>> {
  const value = parentValue ?? attributeString(attributes, key)
  return value !== undefined ? { [key]: value } : {}
}

function sanitizeAttributes(attributes: Attributes): Attributes {
  const result: Attributes = {}
  for (const [key, value] of Object.entries(attributes)) {
    result[key] = redactAttributeValue(String(value))
  }
  return result
}

function pushBounded<T>(target: T[], value: T, max: number): void {
  target.push(value)
  while (target.length > max) target.shift()
}

export async function withTelemetrySpan<T>(
  telemetry: Telemetry,
  name: string,
  attributes: Attributes,
  operation: (span: ActiveSpan) => Promise<T>
): Promise<T> {
  const span = telemetry.startSpan(name, attributes)
  try {
    const result = await operation(span)
    span.end('ok')
    return result
  } catch (error) {
    span.end(
      'error',
      error instanceof Error && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'error'
    )
    throw error
  }
}
