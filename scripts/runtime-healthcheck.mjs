#!/usr/bin/env node
// Container healthcheck shared by the API and the worker (one image, two
// commands; AUD-0601 F04). The worker answers through the liveness file its
// heartbeat touches; the API through GET /live. Exit 0 healthy, 1 unhealthy.
import fs from 'node:fs'
import process from 'node:process'

const isWorker = Boolean(process.env.CVG_WORKER_RUN_MODE?.trim())

async function main() {
  if (isWorker) {
    const file =
      process.env.CVG_WORKER_LIVENESS_FILE?.trim() || '/tmp/cvg-worker.alive'
    const maxAgeMs = Number(process.env.CVG_WORKER_LIVENESS_MAX_AGE_MS ?? 60000)
    const age = Date.now() - fs.statSync(file).mtimeMs
    return age >= 0 && age <= maxAgeMs
  }
  const port = process.env.PORT || 3000
  const response = await fetch(`http://127.0.0.1:${port}/live`, {
    signal: AbortSignal.timeout(2500)
  })
  return response.ok
}

main()
  .then((healthy) => process.exit(healthy ? 0 : 1))
  .catch(() => process.exit(1))
