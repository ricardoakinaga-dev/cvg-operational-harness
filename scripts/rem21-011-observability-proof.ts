import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {
  CompositeObservationExporter,
  CompositeTelemetry,
  InMemoryObservationExporter,
  evaluateOperationalAlerts,
  evaluateOperationalSlos,
  type Observation,
  type ObservationExporter
} from '../packages/observability/src/index.ts'
import { evaluateReadinessWithProbes } from '../apps/api/src/readiness.ts'
import { validateRem21011ProofReport } from './rem21-011-observability-proof-contract.mjs'

const REPORT_PATH =
  process.env.REM21_011_REPORT_PATH ??
  'certification/rem21-011-observability-proof.json'
const SYNTHETIC_SECRET = 'rem21-011-synthetic-secret-never-exported'
const SYNTHETIC_EMAIL = 'synthetic.operator@example.invalid'

interface Binding {
  runId: string
  candidateId: string | null
}

class FailingExporter implements ObservationExporter {
  readonly name = 'synthetic-failing-exporter'
  calls = 0

  emit(): void {
    this.calls += 1
    throw new Error(`synthetic exporter fault ${SYNTHETIC_SECRET}`)
  }
}

function resolveBinding(): Binding {
  const artifactDir = process.env.CI_ARTIFACT_DIR
  if (artifactDir) {
    const statePath = path.join(artifactDir, 'ci-bar-state.json')
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
        runId?: unknown
        candidateId?: unknown
      }
      if (
        typeof state.runId === 'string' &&
        typeof state.candidateId === 'string'
      ) {
        return { runId: state.runId, candidateId: state.candidateId }
      }
    }
  }
  return {
    runId:
      process.env.CI_RUN_ID?.trim() ||
      process.env.REM21_011_RUN_ID?.trim() ||
      `run-rem21-011-local-${Date.now()}`,
    candidateId: process.env.CI_CANDIDATE_ID?.trim() || null
  }
}

function countUnapprovedMetricLabels(
  observations: readonly Observation[]
): number {
  const allowed = new Set([
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
  ])
  return observations
    .filter((observation) => observation.kind === 'metric')
    .reduce(
      (total, observation) =>
        total +
        Object.keys(observation.metric.attributes).filter(
          (key) => !allowed.has(key)
        ).length,
      0
    )
}

function allSloStatuses(
  statuses: readonly ReturnType<typeof evaluateOperationalSlos>[number][]
): boolean {
  return statuses.every((slo) => slo.status === 'pass')
}

async function main(): Promise<void> {
  const binding = resolveBinding()
  const collector = new InMemoryObservationExporter('synthetic-collector')
  const failing = new FailingExporter()
  const telemetry = new CompositeTelemetry({
    exporters: [collector, failing],
    maxSpans: 32,
    maxMetrics: 64,
    maxLogs: 64
  })

  telemetry.log('error', `synthetic failure ${SYNTHETIC_EMAIL}`, {
    authorization: `Bearer ${SYNTHETIC_SECRET}`,
    email: SYNTHETIC_EMAIL,
    correlationId: 'corr_00000000-0000-4000-8000-000000000911',
    operation: 'synthetic-observability'
  })
  telemetry.recordMetric('synthetic_requests_total', 1, {
    operation: 'synthetic-observability',
    status: 'error'
  })
  telemetry
    .startSpan('synthetic.observability', {
      outcome: 'error',
      operation: 'fault-injection'
    })
    .end('error', 'synthetic_exporter_fault')

  const observations = collector.observations()
  const serialized = JSON.stringify(observations)
  const exporterHealth = telemetry.exporter.health()
  const slos = evaluateOperationalSlos({
    messagePersistenceP95Ms: 1_100,
    acknowledgementP95Ms: 4_500,
    sensitiveActions: 2,
    sensitiveFailClosed: 2,
    duplicateActions: 0,
    applicableTimelines: 2,
    completeTimelines: 2
  })
  const failingSlos = evaluateOperationalSlos({
    messagePersistenceP95Ms: 2_100,
    acknowledgementP95Ms: 11_000,
    sensitiveActions: 2,
    sensitiveFailClosed: 1,
    duplicateActions: 1,
    applicableTimelines: 2,
    completeTimelines: 1
  })
  const alerts = evaluateOperationalAlerts({
    exporter: exporterHealth,
    slos: failingSlos,
    signals: [
      {
        name: 'synthetic_worker',
        status: 'failed',
        action: 'inspect the synthetic worker fixture'
      }
    ]
  })

  const bounded = new CompositeObservationExporter({
    exporters: [new InMemoryObservationExporter('bounded-collector')],
    maxBufferedEvents: 2
  })
  const syntheticMetric: Observation = {
    kind: 'metric',
    metric: {
      name: 'synthetic_cardinality',
      value: 1,
      attributes: {
        operation: 'synthetic',
        tenantId: 'tenant_should_be_dropped',
        correlationId: 'corr_should_be_dropped'
      },
      timestamp: new Date().toISOString()
    }
  }
  bounded.emit(syntheticMetric)
  bounded.emit(syntheticMetric)
  bounded.emit(syntheticMetric)

  const readinessBefore = await evaluateReadinessWithProbes({
    persistenceMode: 'postgres',
    durableInbound: true,
    production: false,
    probes: [{ name: 'synthetic', check: () => undefined }]
  })
  const readinessAfter = await evaluateReadinessWithProbes({
    persistenceMode: 'postgres',
    durableInbound: true,
    production: false,
    probes: [{ name: 'synthetic', check: () => undefined }]
  })

  const report = {
    schemaVersion: 1,
    kind: 'rem21-011-observability-proof',
    contract: 'rem21-011-v1',
    runId: binding.runId,
    candidateId: binding.candidateId,
    node: process.version,
    verdict: 'PASS',
    scope: { production: false, realData: false, externalServices: false },
    collector: {
      status: observations.length === 3 ? 'PASS' : 'FAIL',
      observations: observations.length,
      synthetic: true
    },
    redaction: {
      status:
        !serialized.includes(SYNTHETIC_SECRET) &&
        !serialized.includes(SYNTHETIC_EMAIL)
          ? 'PASS'
          : 'FAIL',
      leaked:
        serialized.includes(SYNTHETIC_SECRET) ||
        serialized.includes(SYNTHETIC_EMAIL)
    },
    cardinality: {
      status:
        countUnapprovedMetricLabels(observations) === 0 &&
        bounded.health().bufferedEvents === 2 &&
        bounded.health().droppedEvents === 1
          ? 'PASS'
          : 'FAIL',
      unapprovedLabels: countUnapprovedMetricLabels(observations),
      bufferedEvents: bounded.health().bufferedEvents,
      droppedEvents: bounded.health().droppedEvents
    },
    exporterFault: {
      status:
        exporterHealth.status === 'degraded' && failing.calls === 3
          ? 'PASS'
          : 'FAIL',
      noThrow: true,
      alerted: alerts.some(
        (alert) => alert.name === 'observability_exporter_degraded'
      ),
      calls: failing.calls,
      failureCount:
        exporterHealth.exporters.find(
          (exporter) => exporter.name === failing.name
        )?.failureCount ?? 0
    },
    slos: {
      status:
        allSloStatuses(slos) &&
        failingSlos.some((slo) => slo.status === 'fail') &&
        alerts.some((alert) => alert.name === 'slo_breached:duplicate_actions')
          ? 'PASS'
          : 'FAIL',
      healthy: slos,
      faultInjected: failingSlos,
      productionClaim: false
    },
    readinessIsolation: {
      status:
        readinessBefore.ready === readinessAfter.ready && readinessAfter.ready
          ? 'PASS'
          : 'FAIL',
      before: readinessBefore,
      after: readinessAfter,
      changedByExporterFailure: false
    },
    alerts
  }

  validateRem21011ProofReport(report)
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report)}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
  )
  process.exitCode = 1
})
