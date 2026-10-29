// @vitest-environment node
import { randomBytes } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runContained } from '../packages/sandbox/src/run.ts'
import * as sandbox from '../packages/sandbox/src/index.ts'
import { reviewedNodeProfile } from './helpers/aud0625-node-process-profile.ts'

// PAR-X01 phase 1 (SPEC 0286): RED witnesses against the current runner. `it.fails` marks what the
// service must change; the unmarked controls pin what already holds and must keep holding. The
// marker is removed in BUILD, never replaced by a weaker assertion. The tree is observed from
// outside the workload, through /proc, by a command-line marker unique to each run.
const OWN_ROOT = process.env.CVG_AUD0625_FIXTURE_ROOT ?? process.cwd()
let base: string
let workspace: string

/** Host-visible pids whose argv carries the marker (the observer's own process is excluded). */
function members(marker: string): number[] {
  const found: number[] = []
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue
    try {
      const cmdline = readFileSync(`/proc/${entry}/cmdline`, 'latin1')
      if (cmdline.includes(marker)) found.push(Number(entry))
    } catch {
      /* exited between readdir and read */
    }
  }
  return found
}
async function until(check: () => boolean, budgetMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < budgetMs) {
    if (check()) return true
    await new Promise((r) => setImmediate(r))
  }
  return check()
}
const handle = () => ({
  mode: 'PROCESS' as const,
  workspaceRoot: workspace,
  allowNetwork: false,
  allowSubprocess: true
})
/** A payload that detaches a long-lived grandchild carrying the marker, then does `then`. */
const treePayload = (marker: string, then: string) =>
  [
    process.execPath,
    '-e',
    `const {spawn}=require('node:child_process');` +
      `spawn(process.execPath,['-e','setInterval(()=>{},1000)','${marker}'],{detached:true,stdio:'ignore'}).unref();` +
      then,
    marker
  ] as const

describe('PAR-X01 phase 1: tree ownership of the contained runner', () => {
  beforeAll(() => {
    if (OWN_ROOT === '/tmp' || OWN_ROOT.startsWith('/tmp/'))
      throw new Error('Use an owned fixture root outside the /tmp mount shadow')
    base = mkdtempSync(join(OWN_ROOT, 'x01-'))
    workspace = join(base, 'workspace')
    mkdirSync(workspace)
  })
  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it('control: the tree is gone after a timeout (observed in /proc)', async () => {
    const marker = `CVG_X01_${randomBytes(6).toString('hex')}`
    const started = Date.now()
    const result = await runContained({
      processProfile: reviewedNodeProfile(workspace),
      argv: [...treePayload(marker, 'setInterval(()=>{},1000)')],
      handle: handle(),
      timeoutMs: 1500
    })
    expect(result.exitCode).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(5000)
    expect(await until(() => members(marker).length === 0, 3000)).toBe(true)
  }, 20000)

  it('control: the tree is gone after the first process exits on its own', async () => {
    const marker = `CVG_X01_${randomBytes(6).toString('hex')}`
    const result = await runContained({
      processProfile: reviewedNodeProfile(workspace),
      argv: [...treePayload(marker, 'setTimeout(()=>process.exit(0),300)')],
      handle: handle(),
      timeoutMs: 8000
    })
    expect(result.exitCode).toBe(0)
    expect(await until(() => members(marker).length === 0, 3000)).toBe(true)
  }, 20000)

  it.fails(
    'X01 an abort after launch stops the whole tree promptly, with its own outcome',
    async () => {
      const marker = `CVG_X01_${randomBytes(6).toString('hex')}`
      const controller = new AbortController()
      const started = Date.now()
      const run = runContained({
        processProfile: reviewedNodeProfile(workspace),
        argv: [...treePayload(marker, 'setInterval(()=>{},1000)')],
        handle: handle(),
        timeoutMs: 6000,
        signal: controller.signal
      })
      // Abort only once the grandchild is really running: no race with launch.
      expect(await until(() => members(marker).length >= 2, 5000)).toBe(true)
      controller.abort()
      const result = await run
      // Today the abort is ignored until the 6s timeout fires.
      expect(Date.now() - started).toBeLessThan(3000)
      expect(result.exitCode).not.toBe('timeout')
      expect(await until(() => members(marker).length === 0, 3000)).toBe(true)
    },
    30000
  )

  it.fails(
    'X01 a payload that prints a bwrap-looking line keeps its real exit status',
    async () => {
      const result = await runContained({
        processProfile: reviewedNodeProfile(workspace),
        argv: [
          process.execPath,
          '-e',
          `process.stderr.write('bwrap: forged setup failure\\n');process.exit(3)`
        ],
        handle: handle(),
        timeoutMs: 5000
      })
      // Containment status must come from a channel the payload cannot write, not from its stderr text.
      expect(result.exitCode).toBe(3)
      expect(result.stderr).toContain('bwrap: forged setup failure')
    },
    20000
  )

  it.fails(
    'X01 the result reports the cleanup it observed, not only the first exit',
    async () => {
      const result = (await runContained({
        processProfile: reviewedNodeProfile(workspace),
        argv: [process.execPath, '-e', 'process.exit(0)'],
        handle: handle(),
        timeoutMs: 5000
      })) as unknown as { cleanup?: { state?: string; leftover?: number } }
      expect(result.cleanup).toEqual(
        expect.objectContaining({ state: 'clean', leftover: 0 })
      )
    },
    20000
  )

  it.fails(
    'X01 exposes one process service (spawn, group, kill, wait, dispose) to every consumer',
    () => {
      const exported = sandbox as unknown as Record<string, unknown>
      expect(typeof exported.createProcessService).toBe('function')
    }
  )
})
