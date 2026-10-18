import {
  CompositeTelemetry,
  type Observation,
  type ObservationExporter,
  type Telemetry
} from '@cvg/observability'

export type WorkerLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface WorkerTelemetry {
  log(
    event: string,
    fields?: Record<string, unknown>,
    level?: WorkerLogLevel
  ): void
  metric(
    name: string,
    value: number,
    attributes?: Record<string, string | number | boolean>
  ): void
}

export interface JsonWorkerTelemetryOptions {
  clock?: () => Date
  write?: (line: string) => void
}

/**
 * Structured JSON sink for the worker process. Log fields and metric
 * attributes pass through the centralized redaction before serialization;
 * payloads, bodies and identities are never recorded by convention, and the
 * redaction layer is the second line of defense.
 */
export function createJsonWorkerTelemetry(
  options: JsonWorkerTelemetryOptions = {}
): WorkerTelemetry {
  const clock = options.clock ?? (() => new Date())
  const write =
    options.write ?? ((line: string) => process.stdout.write(`${line}\n`))
  const telemetry = new CompositeTelemetry({
    clock,
    exporters: [new WorkerJsonObservationExporter(write)]
  })

  return {
    log(event, fields = {}, level = 'info') {
      telemetry.log(level, event, fields)
    },
    metric(name, value, attributes = {}) {
      telemetry.recordMetric(name, value, attributes)
    }
  }
}

class WorkerJsonObservationExporter implements ObservationExporter {
  readonly name = 'worker-json-lines'
  readonly #write: (line: string) => void

  constructor(write: (line: string) => void) {
    this.#write = write
  }

  emit(observation: Observation): void {
    if (observation.kind === 'log') {
      this.#write(
        JSON.stringify({
          event: observation.log.message,
          level: observation.log.level,
          timestamp: observation.log.timestamp,
          ...observation.log.fields
        })
      )
      return
    }
    if (observation.kind === 'metric') {
      this.#write(
        JSON.stringify({
          event: 'worker.metric',
          name: observation.metric.name,
          value: observation.metric.value,
          attributes: observation.metric.attributes,
          timestamp: observation.metric.timestamp
        })
      )
      return
    }
    this.#write(
      JSON.stringify({
        event: 'worker.span',
        name: observation.span.name,
        traceId: observation.span.traceId,
        spanId: observation.span.spanId,
        correlationId: observation.span.correlationId,
        status: observation.span.status,
        durationMs: observation.span.durationMs,
        timestamp: observation.span.endedAt
      })
    )
  }
}

/**
 * Adapter for `@cvg/observability` telemetry. Metric attribute names are
 * restricted by the caller to the allowlist shared with the runtime
 * (`status`, `outcome`, `operation`) to avoid high-cardinality sinks.
 */
export function createTelemetryWorkerSink(
  telemetry: Pick<Telemetry, 'log' | 'recordMetric'>
): WorkerTelemetry {
  return {
    log(event, fields = {}, level = 'info') {
      telemetry.log(level, event, fields)
    },
    metric(name, value, attributes = {}) {
      telemetry.recordMetric(name, value, attributes)
    }
  }
}
