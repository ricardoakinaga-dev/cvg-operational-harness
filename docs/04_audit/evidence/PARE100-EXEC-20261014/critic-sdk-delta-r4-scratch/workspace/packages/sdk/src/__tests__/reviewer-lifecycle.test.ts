// Reviewer authored. Fault injection is confined to SDK factory/close seams;
// spawn always calls real Node with the example's unchanged executable/argv.
// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const observed = vi.hoisted(() => ({
  mode: 'normal', children: [] as any[], options: [] as any[],
  homes: [] as string[], modes: [] as number[], transports: [] as any[],
  transportOptions: [] as any[], closes: [] as boolean[]
}))
vi.mock('node:child_process', async (original) => {
  const real = await original<typeof import('node:child_process')>()
  return { ...real, spawn: (...args: any[]) => {
    const [executable, argv, options] = args
    observed.options.push({executable, argv, options})
    observed.homes.push(options.env.HOME)
    observed.modes.push(statSync(options.env.HOME).mode & 0o777)
    const child = (real.spawn as any)(...args)
    observed.children.push(child)
    child.once('close', () => observed.closes.push(true))
    return child
  }}
})
vi.mock('@cvg/sdk', async (original) => {
  const real = await original<typeof import('@cvg/sdk')>()
  return {...real, createStdioSdkTransport: (options: any) => {
    observed.transportOptions.push(options)
    if (observed.mode === 'setup-error') throw new Error('reviewer injected setup error')
    const transport = real.createStdioSdkTransport(options)
    observed.transports.push(transport)
    if (observed.mode === 'close-error')
      return {...transport, close: async () => { throw new Error('reviewer injected close error') }}
    return transport
  }}
})
import { runSdkStdioExample, shutdownSdkChild } from '../../../../examples/consumers/sdk-stdio/index.mts'

afterEach(async () => {
  for (const transport of observed.transports) await transport.close()
  for (const child of observed.children) await shutdownSdkChild(child)
  observed.mode = 'normal'
  for (const key of ['children','options','homes','modes','transports','transportOptions','closes'] as const) observed[key].length = 0
})
function confirmOwnership() {
  expect(observed.children).toHaveLength(1)
  const child = observed.children[0]
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  expect([child.stdin.closed,child.stdout.closed,child.stderr.closed]).toEqual([true,true,true])
  expect(observed.closes).toEqual([true])
  expect(observed.homes.every(home => !existsSync(home))).toBe(true)
  expect(observed.modes).toEqual([0o700])
  return child
}
it('actual public source journey fixes executable/sibling, minimal env/cwd, private HOME and returns final stderr after close', async () => {
  const previous = {...process.env}
  process.env.NODE_OPTIONS = '--cvg-reviewer-invalid-node-option'
  process.env.NODE_PATH = '/synthetic-untrusted-node-path'
  process.env.CVG_SYNTHETIC_SECRET = 'must-not-be-inherited'
  let journey
  try { journey = await runSdkStdioExample() }
  finally {
    for (const key of ['NODE_OPTIONS','NODE_PATH','CVG_SYNTHETIC_SECRET']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]
    }
  }
  confirmOwnership()
  const {executable,argv,options} = observed.options[0]
  expect(executable).toBe(process.execPath)
  expect(argv).toEqual(['--import','tsx',fileURLToPath(new URL('../../../../examples/consumers/sdk-stdio/child.mts',import.meta.url))])
  expect(options.cwd).toBe(fileURLToPath(new URL('../../../../examples/consumers/sdk-stdio/',import.meta.url)))
  expect(Object.keys(options.env).sort()).toEqual(['PATH','NODE_ENV','HOME','XDG_CONFIG_HOME','TMPDIR'].sort())
  expect(options.env.HOME).toBe(options.env.XDG_CONFIG_HOME)
  expect(options.env.HOME).toBe(options.env.TMPDIR)
  expect(options.stdio).toEqual(['pipe','pipe','pipe'])
  expect(observed.transportOptions[0].requestTimeoutMs).toBe(5000)
  expect(journey!.turn.stopReason).toBe('COMPLETED')
  expect(journey!.stderr).toBe('sdk-stdio-ready\nsdk-stdio:transport:-32083\n')
  expect(journey!.events).toHaveLength(6)
})
it('SDK setup failure still closes actual child/stdio and removes its private HOME', async () => {
  observed.mode = 'setup-error'
  await expect(runSdkStdioExample()).rejects.toThrow('reviewer injected setup error')
  confirmOwnership()
})
it('SDK close rejection before detach still closes actual child/stdio and removes its private HOME', async () => {
  observed.mode = 'close-error'
  await expect(runSdkStdioExample()).rejects.toThrow('reviewer injected close error')
  confirmOwnership()
  // Child EOF triggers the real adapter cleanup despite the rejected close seam.
  expect(observed.children[0].stdout.listenerCount('data')).toBe(0)
})
