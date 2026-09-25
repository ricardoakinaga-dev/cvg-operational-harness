import { describe, expect, it } from 'vitest'
import {
  CompositeObservationExporter,
  CompositeTelemetry,
  InMemoryObservationExporter,
  evaluateOperationalAlerts,
  evaluateOperationalSlos,
  type ObservationExporter
} from '../operational.ts'

const CORRELATION = 'corr_00000000-0000-4000-8000-000000000911'

function failingExporter(): ObservationExporter {
  return {
    name: 'synthetic-broken-sink',
    emit: () => {
      throw new Error('token=synthetic-secret-must-not-escape')
    }
  }
}

describe('REM21-011 operational observability', () => {
  it('fans out safely, redacts and records exporter degradation', () => {
    const collector = new InMemoryObservationExporter()
    const telemetry = new CompositeTelemetry({
      exporters: [collector, failingExporter()],
      clock: () => new Date('2026-09-22T00:00:00.000Z')
    })

    expect(() => {
      telemetry.log('error', 'token for paciente@example.com', {
        authorization: 'Bearer synthetic-secret',
        cpf: '529.982.247-25',
        correlationId: CORRELATION
      })
      telemetry.recordMetric('synthetic_requests_total', 1, {
        operation: 'synthetic',
        status: 'error'
      })
      telemetry
        .startSpan('synthetic.operation', { outcome: 'error' })
        .end('error')
    }).not.toThrow()

    const observations = collector.observations()
    const serialized = JSON.stringify(observations)
    expect(serialized).not.toContain('paciente@example.com')
    expect(serialized).not.toContain('synthetic-secret')
    expect(serialized).not.toContain('529.982.247-25')
    expect(observations).toHaveLength(3)
    expect(
      observations.find((observation) => observation.kind === 'metric')
    ).toMatchObject({
      kind: 'metric',
      metric: { attributes: { operation: 'synthetic', status: 'error' } }
    })
    expect(telemetry.exporter.health()).toMatchObject({
      status: 'degraded',
      exporters: [
        { name: 'synthetic-collector', status: 'healthy', failureCount: 0 },
        {
          name: 'synthetic-broken-sink',
          status: 'degraded',
          failureCount: 3
        }
      ]
    })
  })

  it('drops unapproved metric labels and bounds the local exporter buffer', () => {
    const collector = new InMemoryObservationExporter()
    const exporter = new CompositeObservationExporter({
      exporters: [collector],
      maxBufferedEvents: 2
    })
    const metric = {
      name: 'synthetic_metric',
      value: 1,
      attributes: {
        operation: 'synthetic',
        tenantId: 'tenant-secret-like',
        correlationId: CORRELATION
      },
      timestamp: '2026-09-22T00:00:00.000Z'
    }
    exporter.emit({ kind: 'metric', metric })
    exporter.emit({
      kind: 'log',
      log: {
        level: 'info',
        message: 'synthetic.one',
        fields: {},
        timestamp: metric.timestamp
      }
    })
    exporter.emit({
      kind: 'log',
      log: {
        level: 'info',
        message: 'synthetic.two',
        fields: {},
        timestamp: metric.timestamp
      }
    })

    expect(exporter.health()).toMatchObject({
      bufferedEvents: 2,
      droppedEvents: 1
    })
    expect(collector.observations()[0]).toMatchObject({
      kind: 'metric',
      metric: { attributes: { operation: 'synthetic' } }
    })
    expect(
      (collector.observations()[0] as { metric: { attributes: object } }).metric
        .attributes
    ).not.toHaveProperty('tenantId')
  })

  it('evaluates local SLOs and actionable alerts without readiness coupling', () => {
    const healthy = evaluateOperationalSlos({
      messagePersistenceP95Ms: 1_200,
      acknowledgementP95Ms: 4_000,
      sensitiveActions: 2,
      sensitiveFailClosed: 2,
      duplicateActions: 0,
      applicableTimelines: 2,
      completeTimelines: 2
    })
    expect(healthy.every((slo) => slo.status === 'pass')).toBe(true)

    const failing = evaluateOperationalSlos({
      messagePersistenceP95Ms: 2_001,
      acknowledgementP95Ms: 10_001,
      sensitiveActions: 2,
      sensitiveFailClosed: 1,
      duplicateActions: 1,
      applicableTimelines: 2,
      completeTimelines: 1
    })
    const alerts = evaluateOperationalAlerts({
      exporter: {
        status: 'degraded',
        exporters: [],
        bufferedEvents: 1,
        droppedEvents: 0
      },
      slos: failing,
      signals: [
        {
          name: 'worker_queue',
          status: 'failed',
          action: 'inspect the synthetic worker queue'
        }
      ]
    })
    expect(alerts.map((alert) => alert.name)).toEqual(
      expect.arrayContaining([
        'observability_exporter_degraded',
        'slo_breached:message_persistence_p95',
        'slo_breached:acknowledgement_p95',
        'slo_breached:sensitive_fail_closed',
        'slo_breached:duplicate_actions',
        'slo_breached:investigation_coverage',
        'operational_signal:worker_queue'
      ])
    )
  })
})
