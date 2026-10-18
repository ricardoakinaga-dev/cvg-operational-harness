// @vitest-environment node
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { trackPare217Process } from './fixtures/pare217-process-lifecycle.ts'

const executable = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
const ownedHomes = new Set<string>()
const ownedChildren: {
  child: ChildProcessWithoutNullStreams
  stop: () => Promise<unknown>
}[] = []

afterEach(async () => {
  const current = ownedChildren.splice(0)
  await Promise.allSettled(current.map((owned) => owned.stop()))
  for (const { child } of current) {
    expect(child.stdout.closed).toBe(true)
    expect(child.stderr.closed).toBe(true)
    expect(child.stdin.destroyed).toBe(true)
    if (child.pid) expect(() => process.kill(child.pid!, 0)).toThrow(/ESRCH/)
  }
  for (const home of ownedHomes) rmSync(home, { recursive: true, force: true })
  ownedHomes.clear()
})
const options = {
  label: 'synthetic PARE217 lifecycle',
  maxRuntimeMs: 5_000,
  exitTimeoutMs: 100,
  termGraceMs: 100,
  killGraceMs: 1_000
}
const scripts = {
  normal:
    'process.stderr.write("diagnostic\\n"); process.stdout.write("RESULT\\n")',
  timer: 'process.stdout.write("RESULT\\n"); setInterval(() => {}, 1000)',
  refuseTerm:
    'process.on("SIGTERM", () => { process.stderr.write("TERM refused\\n") }); process.stdout.write("RESULT\\n"); setInterval(() => {}, 1000)',
  failed:
    'process.stderr.write("synthetic setup failure\\n"); process.exitCode = 7'
} as const

function launch(
  script: keyof typeof scripts,
  overrides: Parameters<typeof trackPare217Process>[1] = {},
  cwd = process.cwd()
) {
  // Fixed executable and literal synthetic programs; no inherited environment,
  // shell, network, database or descendants. Output is bounded by construction.
  const home = mkdtempSync(join(tmpdir(), 'pare217-lifecycle-'))
  ownedHomes.add(home)
  const child = spawn(executable, ['-e', scripts[script]], {
    cwd,
    env: {
      LANG: 'C.UTF-8',
      HOME: home,
      TMPDIR: home,
      XDG_CONFIG_HOME: join(home, 'config'),
      XDG_DATA_HOME: join(home, 'data')
    },
    stdio: 'pipe'
  })
  const lifecycle = trackPare217Process(child, { ...options, ...overrides })
  ownedChildren.push({ child, stop: lifecycle.stop })
  let stdout = '',
    stderr = ''
  child.stdout.on('data', (data: Buffer) => {
    stdout += data.toString()
  })
  child.stderr.on('data', (data: Buffer) => {
    stderr += data.toString()
  })
  const result = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Synthetic RESULT readiness timed out')),
      2_000
    )
    child.stdout.on('data', () => {
      if (stdout.includes('RESULT\n')) {
        clearTimeout(timeout)
        resolve()
      }
    })
    void lifecycle.closed.then(
      () => {
        clearTimeout(timeout)
        if (!stdout.includes('RESULT\n'))
          reject(new Error('Closed before synthetic RESULT'))
      },
      (error: unknown) => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })
  void result.catch(() => {})
  return { child, ...lifecycle, result, output: () => ({ stdout, stderr }) }
}

function assertJoined(child: ChildProcessWithoutNullStreams) {
  expect(child.stdout.closed).toBe(true)
  expect(child.stderr.closed).toBe(true)
  expect(child.stdin.destroyed).toBe(true)
  if (child.pid) {
    // Signal zero only checks this owned PID after the confirmed join.
    expect(() => process.kill(child.pid!, 0)).toThrow(/ESRCH/)
  }
  console.log(
    JSON.stringify({
      pid: child.pid ?? null,
      code: child.exitCode,
      signal: child.signalCode,
      stdoutClosed: child.stdout.closed,
      stderrClosed: child.stderr.closed,
      joined: true
    })
  )
}

it('joins normal exit and stdio; finish/stop are idempotent after close', async () => {
  const f = launch('normal')
  try {
    await f.result
    const finishing = f.finish()
    expect(f.finish()).toBe(finishing)
    expect(await finishing).toEqual({ code: 0, signal: null })
    expect(await f.exited).toEqual({ code: 0, signal: null })
    expect(await f.closed).toEqual({ code: 0, signal: null })
    const stopping = f.stop()
    expect(f.stop()).toBe(stopping)
    expect(await stopping).toEqual({ code: 0, signal: null })
    expect(f.output()).toEqual({ stdout: 'RESULT\n', stderr: 'diagnostic\n' })
    assertJoined(f.child)
  } finally {
    await f.stop()
  }
})

it('bounds RESULT with an active timer and rejects only after TERM cleanup', async () => {
  const f = launch('timer')
  try {
    await f.result
    const start = performance.now()
    const finishing = f.finish()
    expect(f.finish()).toBe(finishing)
    await expect(finishing).rejects.toThrow(
      /exitTimeoutMs 100ms exceeded after RESULT/
    )
    expect(performance.now() - start).toBeLessThan(2_000)
    expect(await f.exited).toEqual({ code: null, signal: 'SIGTERM' })
    expect(await f.stop()).toEqual({ code: null, signal: 'SIGTERM' })
    assertJoined(f.child)
  } finally {
    await f.stop()
  }
})

it('escalates TERM refusal to KILL and confirms process and stdio close', async () => {
  const f = launch('refuseTerm')
  try {
    await f.result
    await expect(f.finish()).rejects.toThrow(/exitTimeoutMs 100ms exceeded/)
    const stopping = f.stop()
    expect(f.stop()).toBe(stopping)
    expect(await stopping).toEqual({ code: null, signal: 'SIGKILL' })
    await expect(f.finish()).rejects.toThrow(/exitTimeoutMs 100ms exceeded/)
    expect(await f.closed).toEqual({ code: null, signal: 'SIGKILL' })
    expect(f.output().stderr).toBe('TERM refused\n')
    assertJoined(f.child)
  } finally {
    await f.stop()
  }
})

it('shares one cleanup when finish and repeated stop calls overlap', async () => {
  const f = launch('refuseTerm', { exitTimeoutMs: 1_000 })
  try {
    await f.result
    const finishing = f.finish()
    const stopping = f.stop()
    expect(f.stop()).toBe(stopping)
    expect(f.finish()).toBe(finishing)
    expect(await Promise.all([finishing, stopping])).toEqual([
      { code: null, signal: 'SIGKILL' },
      { code: null, signal: 'SIGKILL' }
    ])
    expect(f.output().stderr).toBe('TERM refused\n')
    assertJoined(f.child)
  } finally {
    await f.stop()
  }
})

it('watchdog interrupts a finish whose exit deadline is longer than maxRuntimeMs', async () => {
  const f = launch('timer', { maxRuntimeMs: 700, exitTimeoutMs: 3_000 })
  try {
    await f.result
    const start = performance.now()
    await expect(f.finish()).rejects.toThrow(/maxRuntimeMs 700ms exceeded/)
    expect(performance.now() - start).toBeLessThan(2_000)
    assertJoined(f.child)
  } finally {
    await f.stop()
  }
})

it('watchdog joins an abandoned parent without finish/stop, even on TERM refusal', async () => {
  const f = launch('refuseTerm', { maxRuntimeMs: 700 })
  try {
    await f.result
    // Observations only, as if the parent test had already timed out.
    expect(await f.closed).toEqual({ code: null, signal: 'SIGKILL' })
    await expect(f.finish()).rejects.toThrow(/maxRuntimeMs 700ms exceeded/)
    assertJoined(f.child)
  } finally {
    await f.stop()
  }
})

it('preserves the asynchronous spawn error and close without an exit event', async () => {
  const f = launch(
    'normal',
    {},
    `${process.cwd()}/apps/worker/src/__tests__/fixtures/pare217-nonexistent-cwd`
  )
  const originalError = new Promise<Error>((resolve) =>
    f.child.once('error', resolve)
  )
  try {
    const error = await originalError
    expect(error).toMatchObject({ code: 'ENOENT' })
    await expect(f.exited).rejects.toBe(error)
    await expect(f.closed).rejects.toBe(error)
    await expect(f.finish()).rejects.toBe(error)
    const stopping = f.stop()
    expect(f.stop()).toBe(stopping)
    await expect(stopping).rejects.toBe(error)
    assertJoined(f.child)
  } finally {
    await f.stop().catch(() => {})
  }
})

it('preserves parent setup failure while finally stops and joins the child', async () => {
  const f = launch('timer')
  const setupError = new Error('original synthetic parent setup failure')
  const parent = async () => {
    try {
      await f.result
      throw setupError
    } finally {
      await f.stop()
    }
  }
  await expect(parent()).rejects.toBe(setupError)
  expect(await f.closed).toEqual({ code: null, signal: 'SIGTERM' })
  assertJoined(f.child)
})

it('rejects invalid deadlines clearly and cleans up the already spawned child', async () => {
  const f = launch('timer', { maxRuntimeMs: Infinity })
  try {
    await expect(f.finish()).rejects.toThrow(/invalid maxRuntimeMs/)
    await f.closed
    assertJoined(f.child)
  } finally {
    await f.stop()
  }
})

it('retains native nonzero setup exit and stderr for parent assertions', async () => {
  const f = launch('failed')
  try {
    expect(await f.finish()).toEqual({ code: 7, signal: null })
    expect(f.output().stderr).toBe('synthetic setup failure\n')
    assertJoined(f.child)
  } finally {
    await f.stop()
  }
})
