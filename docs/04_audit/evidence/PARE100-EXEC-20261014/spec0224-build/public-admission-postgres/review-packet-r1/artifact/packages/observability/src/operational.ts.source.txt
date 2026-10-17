import {
  InMemoryTelemetry,
  METRIC_ATTRIBUTE_ALLOWLIST,
  type ActiveSpan,
  type Attributes,
  type RecordedLog,
  type RecordedMetric,
  type RecordedSpan,
  type Telemetry,
  type TelemetryOptions
} from './telemetry.ts'
import { redactAttributeValue, redactFields } from './redaction.ts'

export type Observation =
  | { kind: 'log'; log: RecordedLog }
  | { kind: 'metric'; metric: RecordedMetric }
  | { kind: 'span'; span: RecordedSpan }

export interface ObservationExporter {
  readonly name: string
  emit(observation: Observation): void
}

export type ExporterStatus = 'healthy' | 'degraded'

export interface ExporterHealth {
  name: string
  status: ExporterStatus
  failureCount: number
}

export interface CompositeExporterHealth {
  status: ExporterStatus
  exporters: readonly ExporterHealth[]
  bufferedEvents: number
  droppedEvents: number
}

export interface CompositeObservationExporterOptions {
  exporters?: readonly ObservationExporter[]
  maxBufferedEvents?: number
}

const DEFAULT_MAX_BUFFERED_EVENTS = 2_000
const MAX_BUFFERED_EVENTS = 10_000

/**
 * Fan-out exporter with a bounded local buffer. A sink is never allowed to
 * throw into the business or safety path; its failure is retained as an
 * operational signal for alerting and later diagnosis.
 */
export class CompositeObservationExporter {
  readonly #exporters: readonly ObservationExporter[]
  readonly #health = new Map<string, ExporterHealth>()
  readonly #buffer: Observation[] = []
  readonly #maxBufferedEvents: number
  #droppedEvents = 0

  constructor(options: CompositeObservationExporterOptions = {}) {
    const exporters = options.exporters ?? []
    const names = new Set<string>()
    for (const exporter of exporters) {
      const name = exporter.name.trim()
      if (!name) throw new Error('Observation exporter name is required')
      if (names.has(name)) {
        throw new Error(`Observation exporter name must be unique: ${name}`)
      }
      names.add(name)
    }
    const maxBufferedEvents =
      options.maxBufferedEvents ?? DEFAULT_MAX_BUFFERED_EVENTS
    if (
      !Number.isInteger(maxBufferedEvents) ||
      maxBufferedEvents < 1 ||
      maxBufferedEvents > MAX_BUFFERED_EVENTS
    ) {
      throw new Error(
        `maxBufferedEvents must be an integer between 1 and ${MAX_BUFFERED_EVENTS}`
      )
    }
    this.#exporters = exporters
    this.#maxBufferedEvents = maxBufferedEvents
    for (const exporter of exporters) {
      this.#health.set(exporter.name, {
        name: exporter.name,
        status: 'healthy',
        failureCount: 0
      })
    }
  }

  emit(observation: Observation): void {
    const safeObservation = sanitizeObservation(observation)
    this.#buffer.push(safeObservation)
    if (this.#buffer.length > this.#maxBufferedEvents) {
      this.#buffer.shift()
      this.#droppedEvents += 1
    }

    for (const exporter of this.#exporters) {
      try {
        exporter.emit(safeObservation)
      } catch {
        const current = this.#health.get(exporter.name)
        if (!current) continue
        this.#health.set(exporter.name, {
          ...current,
          status: 'degraded',
          failureCount: current.failureCount + 1
        })
      }
    }
  }

  health(): CompositeExporterHealth {
    const exporters = [...this.#health.values()].map((health) => ({
      ...health
    }))
    return {
      status: exporters.some((health) => health.status === 'degraded')
        ? 'degraded'
        : 'healthy',
      exporters,
      bufferedEvents: this.#buffer.length,
      droppedEvents: this.#droppedEvents
    }
  }

  bufferedEvents(): Observation[] {
    return this.#buffer.map((observation) => cloneObservation(observation))
  }
}

export interface CompositeTelemetryOptions extends Omit<
  TelemetryOptions,
  'onSpan' | 'onMetric' | 'onLog'
> {
  exporters?: readonly ObservationExporter[]
}

/** Telemetry facade that preserves local inspection while safely fan-outing. */
export class CompositeTelemetry implements Telemetry {
  readonly #local: InMemoryTelemetry
  readonly exporter: CompositeObservationExporter

  constructor(options: CompositeTelemetryOptions = {}) {
    this.exporter = new CompositeObservationExporter(
      options.exporters !== undefined ? { exporters: options.exporters } : {}
    )
    const localOptions: TelemetryOptions = {
      onSpan: (span) => this.exporter.emit({ kind: 'span', span }),
      onMetric: (metric) => this.exporter.emit({ kind: 'metric', metric }),
      onLog: (log) => this.exporter.emit({ kind: 'log', log })
    }
    if (options.clock !== undefined) localOptions.clock = options.clock
    if (options.idGenerator !== undefined)
      localOptions.idGenerator = options.idGenerator
    if (options.maxSpans !== undefined) localOptions.maxSpans = options.maxSpans
    if (options.maxMetrics !== undefined)
      localOptions.maxMetrics = options.maxMetrics
    if (options.maxLogs !== undefined) localOptions.maxLogs = options.maxLogs
    this.#local = new InMemoryTelemetry(localOptions)
  }

  startSpan(
    name: string,
    attributes: Attributes = {},
    parent?: import('./trace-context.ts').TraceContext
  ): ActiveSpan {
    return this.#local.startSpan(name, attributes, parent)
  }

  recordMetric(name: string, value: number, attributes: Attributes = {}): void {
    this.#local.recordMetric(name, value, attributes)
  }

  log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    fields: Record<string, unknown> = {}
  ): void {
    this.#local.log(level, message, fields)
  }

  spans(): RecordedSpan[] {
    return this.#local.spans()
  }

  metrics(): RecordedMetric[] {
    return this.#local.metrics()
  }

  logs(): RecordedLog[] {
    return this.#local.logs()
  }
}

export interface InMemoryObservationExporterOptions {
  maxObservations?: number
}

/** Deterministic synthetic collector used by local proof and tests. */
export class InMemoryObservationExporter implements ObservationExporter {
  readonly name: string
  readonly #maxObservations: number
  readonly #observations: Observation[] = []

  constructor(
    name = 'synthetic-collector',
    options: InMemoryObservationExporterOptions = {}
  ) {
    if (!name.trim()) throw new Error('Synthetic collector name is required')
    const maxObservations = options.maxObservations ?? 2_000
    if (!Number.isInteger(maxObservations) || maxObservations < 1) {
      throw new Error('maxObservations must be a positive integer')
    }
    this.name = name
    this.#maxObservations = maxObservations
  }

  emit(observation: Observation): void {
    this.#observations.push(cloneObservation(observation))
    while (this.#observations.length > this.#maxObservations)
      this.#observations.shift()
  }

  observations(): Observation[] {
    return this.#observations.map((observation) =>
      cloneObservation(observation)
    )
  }
}

export interface JsonLineObservationExporterOptions {
  name?: string
  write?: (line: string) => void
}

/** JSON-lines sink for a controlled process entrypoint. */
export class JsonLineObservationExporter implements ObservationExporter {
  readonly name: string
  readonly #write: (line: string) => void

  constructor(options: JsonLineObservationExporterOptions = {}) {
    this.name = options.name ?? 'json-lines'
    this.#write = options.write ?? ((line) => process.stdout.write(`${line}\n`))
  }

  emit(observation: Observation): void {
    this.#write(JSON.stringify(observation))
  }
}

export const OPERATIONAL_SLO_TARGETS = {
  messagePersistenceP95Ms: 2_000,
  acknowledgementP95Ms: 10_000,
  sensitiveFailClosedRatio: 1,
  duplicateActions: 0,
  investigationCoverageRatio: 1
} as const

export interface OperationalSloInput {
  messagePersistenceP95Ms: number | null
  acknowledgementP95Ms: number | null
  sensitiveActions: number
  sensitiveFailClosed: number
  duplicateActions: number
  applicableTimelines: number
  completeTimelines: number
}

export type SloStatus = 'pass' | 'fail' | 'not_measured'

export interface OperationalSloEvaluation {
  id:
    | 'message_persistence_p95'
    | 'acknowledgement_p95'
    | 'sensitive_fail_closed'
    | 'duplicate_actions'
    | 'investigation_coverage'
  status: SloStatus
  observed: number | null
  target: number
  detail: string
}

export function evaluateOperationalSlos(
  input: OperationalSloInput
): OperationalSloEvaluation[] {
  validateSloInput(input)
  return [
    evaluateBoundedLatency(
      'message_persistence_p95',
      input.messagePersistenceP95Ms,
      OPERATIONAL_SLO_TARGETS.messagePersistenceP95Ms,
      'message persistence p95'
    ),
    evaluateBoundedLatency(
      'acknowledgement_p95',
      input.acknowledgementP95Ms,
      OPERATIONAL_SLO_TARGETS.acknowledgementP95Ms,
      'acknowledgement p95'
    ),
    evaluateRatio(
      'sensitive_fail_closed',
      input.sensitiveActions,
      input.sensitiveFailClosed,
      OPERATIONAL_SLO_TARGETS.sensitiveFailClosedRatio,
      'sensitive actions fail-closed'
    ),
    {
      id: 'duplicate_actions',
      status: input.duplicateActions === 0 ? 'pass' : 'fail',
      observed: input.duplicateActions,
      target: OPERATIONAL_SLO_TARGETS.duplicateActions,
      detail:
        input.duplicateActions === 0
          ? 'no duplicate action observed'
          : `${input.duplicateActions} duplicate action(s) observed`
    },
    evaluateRatio(
      'investigation_coverage',
      input.applicableTimelines,
      input.completeTimelines,
      OPERATIONAL_SLO_TARGETS.investigationCoverageRatio,
      'investigation timeline coverage'
    )
  ]
}

export interface OperationalSignal {
  name: string
  status: 'ok' | 'degraded' | 'failed'
  action: string
}

export interface OperationalAlert {
  severity: 'warning' | 'critical'
  name: string
  detail: string
  action: string
}

export function evaluateOperationalAlerts(input: {
  exporter: CompositeExporterHealth
  slos: readonly OperationalSloEvaluation[]
  signals?: readonly OperationalSignal[]
}): OperationalAlert[] {
  const alerts: OperationalAlert[] = []
  if (input.exporter.status === 'degraded') {
    alerts.push({
      severity: 'warning',
      name: 'observability_exporter_degraded',
      detail: 'one or more observability exporters rejected an event',
      action: 'inspect exporter health and preserve the local bounded buffer'
    })
  }
  for (const slo of input.slos) {
    if (slo.status !== 'fail') continue
    alerts.push({
      severity: 'critical',
      name: `slo_breached:${slo.id}`,
      detail: slo.detail,
      action: `investigate the ${slo.id} budget before enabling broader operation`
    })
  }
  for (const signal of input.signals ?? []) {
    if (signal.status === 'ok') continue
    alerts.push({
      severity: signal.status === 'failed' ? 'critical' : 'warning',
      name: `operational_signal:${signal.name}`,
      detail: `${signal.name} reported ${signal.status}`,
      action: signal.action
    })
  }
  return alerts
}

function evaluateBoundedLatency(
  id: OperationalSloEvaluation['id'],
  observed: number | null,
  target: number,
  label: string
): OperationalSloEvaluation {
  return {
    id,
    status:
      observed === null ? 'not_measured' : observed <= target ? 'pass' : 'fail',
    observed,
    target,
    detail:
      observed === null
        ? `${label} was not measured`
        : `${label}=${observed}ms (target <= ${target}ms)`
  }
}

function evaluateRatio(
  id: OperationalSloEvaluation['id'],
  total: number,
  good: number,
  target: number,
  label: string
): OperationalSloEvaluation {
  const observed = total === 0 ? null : good / total
  return {
    id,
    status:
      observed === null ? 'not_measured' : observed >= target ? 'pass' : 'fail',
    observed,
    target,
    detail:
      observed === null
        ? `${label} had no applicable samples`
        : `${label}=${good}/${total} (target ${target * 100}%)`
  }
}

function validateSloInput(input: OperationalSloInput): void {
  for (const [key, value] of Object.entries(input)) {
    if (value === null) continue
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`SLO input ${key} must be a finite non-negative number`)
    }
  }
  if (input.sensitiveFailClosed > input.sensitiveActions) {
    throw new Error('sensitiveFailClosed cannot exceed sensitiveActions')
  }
  if (input.completeTimelines > input.applicableTimelines) {
    throw new Error('completeTimelines cannot exceed applicableTimelines')
  }
}

function sanitizeObservation(observation: Observation): Observation {
  if (observation.kind === 'metric') {
    const attributes: Attributes = {}
    for (const [key, value] of Object.entries(observation.metric.attributes)) {
      if (!(METRIC_ATTRIBUTE_ALLOWLIST as readonly string[]).includes(key))
        continue
      attributes[key] = redactAttributeValue(String(value))
    }
    return {
      kind: 'metric',
      metric: { ...observation.metric, attributes }
    }
  }
  if (observation.kind === 'log') {
    return {
      kind: 'log',
      log: {
        ...observation.log,
        message: redactAttributeValue(observation.log.message),
        fields: redactFields(observation.log.fields)
      }
    }
  }
  return {
    kind: 'span',
    span: {
      ...observation.span,
      correlationId: redactAttributeValue(observation.span.correlationId),
      ...(observation.span.errorCode !== undefined
        ? { errorCode: redactAttributeValue(observation.span.errorCode) }
        : {}),
      attributes: sanitizeAttributes(observation.span.attributes)
    }
  }
}

function sanitizeAttributes(attributes: Attributes): Attributes {
  const result: Attributes = {}
  for (const [key, value] of Object.entries(attributes)) {
    result[key] = redactAttributeValue(String(value))
  }
  return result
}

function cloneObservation(observation: Observation): Observation {
  if (observation.kind === 'metric') {
    return {
      kind: 'metric',
      metric: {
        ...observation.metric,
        attributes: { ...observation.metric.attributes }
      }
    }
  }
  if (observation.kind === 'log') {
    return {
      kind: 'log',
      log: { ...observation.log, fields: redactFields(observation.log.fields) }
    }
  }
  return {
    kind: 'span',
    span: {
      ...observation.span,
      attributes: { ...observation.span.attributes }
    }
  }
}
