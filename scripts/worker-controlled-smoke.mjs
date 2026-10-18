import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function parseJsonLines(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line)
        return parsed && typeof parsed === 'object' ? [parsed] : []
      } catch {
        return []
      }
    })
}

function runWorkerEntrypoint() {
  return new Promise((resolve) => {
    const child = spawn(npmCommand, ['run', 'dev:worker'], {
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        CVG_WORKER_QUEUE_ADAPTER: 'controlled-memory',
        CVG_WORKER_TENANT_ID: 'tenant_00000000-0000-4000-8000-000000000172',
        CVG_WORKER_CONTROLLED_SMOKE: 'true'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    const append = (chunk) => {
      output += String(chunk)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timeout = setTimeout(() => child.kill('SIGTERM'), 15000)
    child.once('error', (error) => {
      clearTimeout(timeout)
      resolve({ code: null, output, error })
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      resolve({ code, output })
    })
  })
}

const result = await runWorkerEntrypoint()
const events = parseJsonLines(result.output)
const smoke = events.find(
  (event) => event.event === 'worker.controlled_smoke_passed'
)
const safeOutput = !/stack|cause|sess_bootstrap|msg_bootstrap/i.test(
  result.output
)
const passed =
  result.code === 0 &&
  safeOutput &&
  smoke?.adapter === 'controlled-memory' &&
  smoke?.processed === 1 &&
  smoke?.durable === false &&
  smoke?.externalEffects === false

if (!passed) {
  process.stderr.write('worker_controlled_smoke_failed\n')
  process.exitCode = 1
} else {
  process.stdout.write(
    JSON.stringify({
      event: 'worker.controlled_smoke_verified',
      adapter: smoke.adapter,
      processed: smoke.processed
    }) + '\n'
  )
}
