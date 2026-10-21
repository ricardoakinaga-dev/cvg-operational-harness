#!/usr/bin/env node
// Assistente de Plantão — external monitor (SPEC 0179 section 10, PISO-008).
// Runs as its own process, in production on another machine
// (deploy/monitor.example.yaml). From the repository root:
//   node --import tsx products/shift-assistant/scripts/shift-monitor.mjs
//   node --import tsx products/shift-assistant/scripts/shift-monitor.mjs status
// Configuration (environment; the token comes from a file, never argv):
//   SHIFT_MONITOR_LIVE_URL, SHIFT_MONITOR_READY_URL   assistant health URLs
//   SHIFT_MONITOR_RECEIVER_URL                        alert receiver base URL
//   SHIFT_MONITOR_RECEIVER_TOKEN_FILE                 receiver token (file)
//   SHIFT_MONITOR_STATE_FILE                          durable episodes/queue
//   SHIFT_MONITOR_CANDIDATE_DIGEST                    image/program digest
//   SHIFT_MONITOR_INSTANCE_ID                         opaque instance label
// Polls every 10 s with a 2 s timeout, alerts after two consecutive failures,
// resolves after two good probes, one update per minute per reason, durable
// delivery with five attempts (30 s, 2, 10, 30 min); a delivery that runs
// out of attempts is logged as shift.monitor.delivery_failed and listed by
// `status`, never reported as received. Logs are JSON lines without URLs,
// phones or payloads. SIGTERM/SIGINT stop it (exit 0). Exit 2 on bad config.

import { readFileSync } from 'node:fs'

const env = process.env
const log = (event, fields = {}) =>
  process.stdout.write(
    `${JSON.stringify({ event, at: new Date().toISOString(), ...fields })}\n`
  )

let monitor
try {
  monitor = await import('../src/monitor.ts')
} catch {
  process.stderr.write(
    'cannot load the product code: run from the repository root with node --import tsx\n'
  )
  process.exit(2)
}

const stateFile = env.SHIFT_MONITOR_STATE_FILE
if (process.argv[2] === 'status') {
  if (!stateFile) process.exit(2)
  const view = new monitor.AlertMonitor({
    stateFile,
    candidateDigest: 'status',
    instanceOpaqueId: 'status',
    deliver: async () => ({ ok: false, code: 'status_only' })
  })
  process.stdout.write(`${JSON.stringify(view.status(), null, 2)}\n`)
  process.exit(0)
}

const required = [
  'SHIFT_MONITOR_LIVE_URL',
  'SHIFT_MONITOR_READY_URL',
  'SHIFT_MONITOR_RECEIVER_URL',
  'SHIFT_MONITOR_RECEIVER_TOKEN_FILE',
  'SHIFT_MONITOR_STATE_FILE',
  'SHIFT_MONITOR_CANDIDATE_DIGEST',
  'SHIFT_MONITOR_INSTANCE_ID'
]
const missing = required.filter((name) => !env[name])
if (missing.length > 0) {
  process.stderr.write(`invalid monitor configuration: ${missing.join(', ')}\n`)
  process.exit(2)
}
let token
try {
  token = readFileSync(env.SHIFT_MONITOR_RECEIVER_TOKEN_FILE, 'utf8').trim()
} catch {
  process.stderr.write('invalid monitor configuration: token file unreadable\n')
  process.exit(2)
}
if (token.length < 24) {
  process.stderr.write('invalid monitor configuration: token too short\n')
  process.exit(2)
}

const alerts = new monitor.AlertMonitor({
  stateFile,
  candidateDigest: env.SHIFT_MONITOR_CANDIDATE_DIGEST,
  instanceOpaqueId: env.SHIFT_MONITOR_INSTANCE_ID,
  deliver: monitor.httpDeliver(env.SHIFT_MONITOR_RECEIVER_URL, token),
  logger: (event, fields) => log(event, fields)
})
const stop = new AbortController()
process.once('SIGTERM', () => stop.abort())
process.once('SIGINT', () => stop.abort())
log('shift.monitor.started', {
  intervalMs: monitor.MONITOR_DEFAULTS.intervalMs,
  timeoutMs: monitor.MONITOR_DEFAULTS.timeoutMs,
  pending: alerts.status().pending
})
await monitor.runMonitor({
  liveUrl: env.SHIFT_MONITOR_LIVE_URL,
  readyUrl: env.SHIFT_MONITOR_READY_URL,
  monitor: alerts,
  signal: stop.signal,
  onCycle: (observation) =>
    log('shift.monitor.cycle', {
      findings: observation.findings.map((finding) => finding.reasonCode),
      readyObserved: observation.readyObserved,
      pending: alerts.status().pending
    })
})
log('shift.monitor.stopped')
process.exit(0)
