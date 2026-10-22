// HOSPITAL-SERVER-0393 sizing load: signed synthetic webhooks through the TLS
// proxy (same path the tunnel uses). Synthetic data only.
import { createHmac, randomBytes } from 'node:crypto'
import fs from 'node:fs'

const [envFile, countArg, concArg, label] = process.argv.slice(2)
const env = Object.fromEntries(
  fs.readFileSync(envFile, 'utf8').split('\n')
    .map((l) => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^'(.*)'$/, '$1')])
)
const secret = env.WEBHOOK_SIGNING_SECRET
const count = Number(countArg)
const concurrency = Number(concArg)
const run = randomBytes(3).toString('hex')
const url = 'https://localhost:4457/v1/webhooks/channels/web/messages'
const statuses = {}
const latencies = []
let next = 0
async function one(i) {
  const eventId = `sizing_${run}_${i}`
  const cvgTurn = {
    capability: 'record.update',
    action: 'record.update',
    resource: { type: 'record_draft', id: `draft_sizing_${run}_${i}` },
    dataClassification: 'INTERNAL',
    operatorId: 'op_synthetic_sizing',
    operatorRole: 'Operator',
    agentVersion: 'synthetic-v1',
    agentProfile: 'assistant',
    modelProfile: 'fast',
    message: `synthetic sizing draft update ${i}`,
    idempotencyKey: `sizing-${run}-${i}`
  }
  const body = {
    body: JSON.stringify({ cvgTurn }),
    externalMessageId: eventId,
    receivedAt: new Date().toISOString(),
    senderRef: 'synthetic_sizing_sender'
  }
  const rawBody = JSON.stringify(body)
  const ts = Math.floor(Date.now() / 1000)
  const sig = `sha256=${createHmac('sha256', secret).update(`${eventId}.${ts}.web.${rawBody}`).digest('hex')}`
  const started = performance.now()
  const res = await fetch(url, {
    method: 'POST',
    body: rawBody,
    headers: {
      'content-type': 'application/json',
      'x-cvg-webhook-id': eventId,
      'x-cvg-webhook-timestamp': String(ts),
      'x-cvg-webhook-signature': sig
    }
  })
  await res.arrayBuffer()
  latencies.push(performance.now() - started)
  statuses[res.status] = (statuses[res.status] ?? 0) + 1
}
const t0 = performance.now()
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < count) { const i = next++; try { await one(i) } catch (e) { statuses.error = (statuses.error ?? 0) + 1 } }
}))
const wall = performance.now() - t0
latencies.sort((a, b) => a - b)
const p = (f) => Math.round((latencies[Math.min(latencies.length - 1, Math.ceil(f * latencies.length) - 1)] ?? 0) * 10) / 10
console.log(JSON.stringify({ label, run, count, concurrency, wallMs: Math.round(wall), requestsPerSecond: Math.round((count / (wall / 1000)) * 10) / 10, statuses, latencyMs: { p50: p(0.5), p95: p(0.95), p99: p(0.99), max: p(1) } }))
