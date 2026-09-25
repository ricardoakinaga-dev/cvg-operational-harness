#!/usr/bin/env node
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'

const root = process.cwd()
const forbiddenPaths = [
  'apps/api/src',
  'node_modules/typescript',
  'node_modules/vitest',
  'node_modules/tsx'
]

function assertRuntimeShape() {
  if (!fs.existsSync(path.join(root, 'apps/api/dist/main.js'))) {
    throw new Error('missing_compiled_api_entrypoint')
  }
  for (const relativePath of forbiddenPaths) {
    if (fs.existsSync(path.join(root, relativePath))) {
      throw new Error(`development_runtime_artifact:${relativePath}`)
    }
  }
  for (const group of ['apps', 'packages']) {
    const groupPath = path.join(root, group)
    for (const entry of fs.readdirSync(groupPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (fs.existsSync(path.join(groupPath, entry.name, 'src'))) {
        throw new Error(`source_present:${group}/${entry.name}/src`)
      }
    }
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

async function statusFor(port, route) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${route}`)
    return response.status
  } catch {
    return null
  }
}

function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 2000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

async function main() {
  assertRuntimeShape()
  const port = await getFreePort()
  const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      API_PERSISTENCE_MODE: 'memory',
      CVG_IDENTITY_MODE: 'trusted',
      API_TRUSTED_PROXY_HOPS: '0',
      OPENAI_API_KEY: 'controlled-image-smoke',
      WEBHOOK_SIGNING_SECRET: 'controlled-image-smoke-secret-0123456789',
      ENABLE_REAL_CHANNELS: 'false',
      ENABLE_REAL_RAG: 'false',
      ENABLE_REAL_PAYMENTS: 'false',
      ENABLE_REAL_MEDICAL_RECORDS: 'false',
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  let live = null
  let ready = null
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) break
    live = await statusFor(port, '/live')
    ready = await statusFor(port, '/ready')
    if (live === 200 && ready === 200) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  await stop(child)
  if (live !== 200 || ready !== 200) {
    throw new Error(
      `runtime_smoke_failed:live=${String(live)}:ready=${String(ready)}:output=${output.slice(-4000)}`
    )
  }
  process.stdout.write(
    `${JSON.stringify({ status: 'PASS', live, ready, sourceIncluded: false })}\n`
  )
}

try {
  await main()
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exitCode = 1
}
