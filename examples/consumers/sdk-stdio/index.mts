import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSdkClient, createStdioSdkTransport } from '@cvg/sdk'

function waitForExit(
  child: ChildProcessWithoutNullStreams,
  ms: number
): Promise<boolean> {
  if (
    (child.exitCode !== null || child.signalCode !== null) &&
    child.stdin.closed &&
    child.stdout.closed &&
    child.stderr.closed
  )
    return Promise.resolve(true)
  return new Promise((resolve) => {
    const done = (exited: boolean) => {
      clearTimeout(timer)
      child.off('close', exit)
      resolve(exited)
    }
    const exit = () => done(true)
    const timer = setTimeout(() => done(false), ms)
    // close follows exit and the child's stdio handle closure.
    child.once('close', exit)
  })
}

/** Owns only this child; bounded drain, TERM and KILL, with confirmed exit. */
export async function shutdownSdkChild(
  child: ChildProcessWithoutNullStreams
): Promise<void> {
  child.stdin.end()
  if (!(await waitForExit(child, 1000))) {
    child.kill('SIGTERM')
    if (!(await waitForExit(child, 500))) {
      child.kill('SIGKILL')
      if (!(await waitForExit(child, 250)))
        throw new Error('SDK example child did not exit')
    }
  }
  child.stdin.destroy()
  child.stdout.destroy()
  child.stderr.destroy()
  if (
    (child.exitCode === null && child.signalCode === null) ||
    !child.stdin.closed ||
    !child.stdout.closed ||
    !child.stderr.closed
  )
    throw new Error('SDK example child shutdown was not confirmed')
}

export async function runSdkStdioExample() {
  const source = import.meta.url.endsWith('.mts')
  const home = mkdtempSync(join(tmpdir(), 'cvg-sdk-stdio-home-'))
  let child: ChildProcessWithoutNullStreams | undefined
  let transport: ReturnType<typeof createStdioSdkTransport> | undefined
  let stderr = ''
  let journey: Awaited<ReturnType<typeof collect>> | undefined
  async function collect(
    transport: ReturnType<typeof createStdioSdkTransport>
  ) {
    const client = createSdkClient(transport)
    const hello = await client.hello()
    const session = await client.openSession('stdio_session')
    const turn = await client.sendTurn('Olá 🌿', session.sessionId)
    const events = await client.readEvents(session.sessionId)
    return { hello, session, turn, events }
  }
  try {
    child = spawn(
      process.execPath,
      [
        ...(source ? ['--import', 'tsx'] : []),
        fileURLToPath(
          new URL(source ? './child.mts' : './child.mjs', import.meta.url)
        )
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: fileURLToPath(new URL('.', import.meta.url)),
        env: {
          PATH: process.env.PATH ?? '',
          NODE_ENV: 'test',
          HOME: home,
          XDG_CONFIG_HOME: home,
          TMPDIR: home
        }
      }
    )
    child.on('error', () => {})
    for (const stream of [child.stdin, child.stdout, child.stderr])
      stream.on('error', () => {})
    // Fixed host logs are consumed on stderr; stdout belongs exclusively to wire.
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4096)
        stderr += chunk.toString('utf8').slice(0, 4096 - stderr.length)
    })
    transport = createStdioSdkTransport({
      input: child.stdout,
      output: child.stdin,
      expectedTenantId: 'sdk_stdio_synthetic',
      requestTimeoutMs: 5000
    })
    journey = await collect(transport)
  } finally {
    try {
      await transport?.close()
    } finally {
      try {
        if (child) await shutdownSdkChild(child)
      } finally {
        // A failed termination keeps its private directory for reconciliation.
        if (!child || child.exitCode !== null || child.signalCode !== null)
          rmSync(home, { recursive: true, force: true })
      }
    }
  }
  return { ...journey!, stderr }
}
