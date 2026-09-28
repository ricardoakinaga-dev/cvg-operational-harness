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
      env: { ...process.env, NODE_ENV: 'test', CVG_WORKER_QUEUE_ADAPTER: '' },
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
const startupFailure = events.find(
  (event) => event.event === 'worker.startup_failed'
)
const safeOutput = !/stack|cause|sess_bootstrap|msg_bootstrap/i.test(
  result.output
)
const passed =
  result.code === 1 &&
  safeOutput &&
  startupFailure?.code === 'queue_adapter_missing' &&
  startupFailure?.message === 'Worker queue adapter is not configured'

if (!passed) {
  process.stderr.write('worker_startup_smoke_failed\n')
  process.exitCode = 1
} else {
  process.stdout.write(
    JSON.stringify({
      event: 'worker.startup_smoke_passed',
      code: startupFailure.code
    }) + '\n'
  )
}
