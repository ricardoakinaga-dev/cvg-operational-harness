/** Synthetic child host: only public CVG roots, no provider or external effect. */
import { createSdk, serveStdioSdk } from '@cvg/sdk'

let event = 0
const sdk = createSdk({
  tenantId: 'sdk_stdio_synthetic',
  modelGateway: {
    complete: async () => ({
      text: 'Resposta sintética stdio: olá 🌿.',
      provider: 'deterministic',
      model: 'keyless-v1',
      inputTokens: 3,
      outputTokens: 4,
      costUsd: 0
    })
  },
  policy: {
    evaluate: async () => ({
      outcome: 'ALLOW',
      reason: 'synthetic',
      policyVersion: 'v1'
    })
  },
  approvals: {
    request: async () => ({
      status: 'DENIED',
      reason: 'synthetic effects disabled'
    })
  },
  clock: () => new Date('2026-10-14T00:00:00.000Z'),
  newEventId: () => `stdio_event_${++event}`,
  newCorrelationId: () => 'stdio_correlation',
  newTraceId: () => 'stdio_trace'
})

// The host owns streams and keeps error listeners after adapter detachment.
process.stdin.on('error', () => {})
process.stdout.on('error', () => {})
process.stderr.on('error', () => {})
const serving = serveStdioSdk({
  input: process.stdin,
  output: process.stdout,
  server: sdk.server,
  onError: ({ kind, code }) => {
    process.stderr.write(`sdk-stdio:${kind}:${code}\n`)
  }
})
process.stderr.write('sdk-stdio-ready\n')
const terminate = () => {
  void serving.close()
}
process.on('SIGTERM', terminate)
await serving.closed
process.off('SIGTERM', terminate)
process.stdin.destroy()
process.stdout.end()
