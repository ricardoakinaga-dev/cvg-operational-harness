import { describe, expect, it } from 'vitest'
import {
  createJsonWorkerTelemetry,
  createTelemetryWorkerSink
} from '../worker-observability.ts'

describe('AAA-19 worker observability', () => {
  it('writes redacted structured logs and metrics as JSON lines', () => {
    const lines: string[] = []
    const telemetry = createJsonWorkerTelemetry({
      clock: () => new Date('2026-09-13T00:00:00.000Z'),
      write: (line) => lines.push(line)
    })

    telemetry.log('worker.outbox.processed', {
      eventId: 'outbox_observability_190',
      cpf: '529.982.247-25',
      status: 'processed'
    })
    telemetry.metric('worker.outbox.lag', 2, { status: 'pending' })

    expect(lines).toHaveLength(2)
    const log = JSON.parse(lines[0] as string) as Record<string, unknown>
    expect(log).toMatchObject({
      event: 'worker.outbox.processed',
      level: 'info',
      timestamp: '2026-09-13T00:00:00.000Z',
      eventId: 'outbox_observability_190',
      status: 'processed'
    })
    expect(log.cpf).toBe('[redacted]')
    expect(lines[0]).not.toContain('529.982.247-25')

    const metric = JSON.parse(lines[1] as string) as Record<string, unknown>
    expect(metric).toMatchObject({
      event: 'worker.metric',
      name: 'worker.outbox.lag',
      value: 2,
      attributes: { status: 'pending' },
      timestamp: '2026-09-13T00:00:00.000Z'
    })
  })

  it('defaults to info level and redacts sensitive free text', () => {
    const lines: string[] = []
    const telemetry = createJsonWorkerTelemetry({
      write: (line) => lines.push(line)
    })

    telemetry.log('worker.event_error', {
      error: 'contact paciente@example.com now'
    })

    const log = JSON.parse(lines[0] as string) as Record<string, unknown>
    expect(log.level).toBe('info')
    expect(String(log.error)).toContain('[redacted-email]')
    expect(lines[0]).not.toContain('paciente@example.com')
  })

  it('bridges to the @cvg/observability telemetry contract', () => {
    const logs: Array<{
      level: string
      message: string
      fields: Record<string, unknown>
    }> = []
    const metrics: Array<{
      name: string
      value: number
      attributes: Record<string, string | number | boolean>
    }> = []
    const sink = createTelemetryWorkerSink({
      log: (level, message, fields) =>
        logs.push({ level, message, fields: fields ?? {} }),
      recordMetric: (name, value, attributes) =>
        metrics.push({ name, value, attributes: attributes ?? {} })
    })

    sink.log('worker.started', { workerId: 'worker-190' }, 'warn')
    sink.metric('worker.outbox.processed', 1, {
      status: 'processed',
      operation: 'outbox'
    })

    expect(logs).toEqual([
      {
        level: 'warn',
        message: 'worker.started',
        fields: { workerId: 'worker-190' }
      }
    ])
    expect(metrics).toEqual([
      {
        name: 'worker.outbox.processed',
        value: 1,
        attributes: { status: 'processed', operation: 'outbox' }
      }
    ])
  })
})
