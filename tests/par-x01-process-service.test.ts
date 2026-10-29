// @vitest-environment node
import { spawn as realSpawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  hostProbe,
  createProcessService,
  ProcessServiceError,
  type ProcessLaunchRequest,
  type ProcessOutcome
} from '../packages/sandbox/src/index.ts'
import { runContained } from '../packages/sandbox/src/run.ts'
import { chmodSync } from 'node:fs'
import { reviewedNodeProfile } from './helpers/aud0625-node-process-profile.ts'

// PAR-X01 slice 2 (SPEC 0286 I3-I6, I9): the engine on a real bubblewrap, observed from outside
// through /proc with a command-line marker unique to each run.
const OWN_ROOT = process.env.CVG_AUD0625_FIXTURE_ROOT ?? process.cwd()
let base: string
let workspace: string
const service = createProcessService({
  envAllowlist: { shell: ['CVG_FLAG'] },
  maxConcurrent: 6
})

function members(marker: string): number[] {
  const found: number[] = []
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue
    try {
      if (readFileSync(`/proc/${entry}/cmdline`, 'latin1').includes(marker))
        found.push(Number(entry))
    } catch {
      /* gone */
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
const limits = (patch: Partial<ProcessLaunchRequest['limits']> = {}) => ({
  startupMs: 10_000,
  lifetimeMs: 20_000,
  cleanupMs: 5_000,
  graceMs: 300,
  maxOutputBytes: 1024 * 1024,
  maxStdinBytes: 1024 * 1024,
  ...patch
})
const request = (
  js: string,
  extra: Partial<ProcessLaunchRequest> = {},
  args: string[] = []
): ProcessLaunchRequest => ({
  consumer: 'shell',
  profile: reviewedNodeProfile(workspace),
  handle: handle(),
  argv: [process.execPath, '-e', js, ...args],
  mode: 'oneshot',
  limits: limits(),
  ...extra
})
const tree = (marker: string, then: string, children = 1) =>
  `const {spawn}=require('node:child_process');` +
  `for(let i=0;i<${children};i++)spawn(process.execPath,['-e','setInterval(()=>{},1000)','${marker}'],{detached:true,stdio:'ignore'}).unref();` +
  then
const mark = () => `CVG_X01_${randomBytes(6).toString('hex')}`
const clean = (o: ProcessOutcome) =>
  expect(o.cleanup).toEqual({
    state: 'clean',
    observed: 'proc-pidns',
    leftover: 0,
    unverified: 0
  })

describe('PAR-X01 slice 2: process service engine', () => {
  beforeAll(() => {
    if (OWN_ROOT === '/tmp' || OWN_ROOT.startsWith('/tmp/'))
      throw new Error('Use an owned fixture root outside the /tmp mount shadow')
    base = mkdtempSync(join(OWN_ROOT, 'x01s2-'))
    workspace = join(base, 'workspace')
    mkdirSync(workspace)
  })
  afterAll(() => rmSync(base, { recursive: true, force: true }))

  describe('outcome from the private channel', () => {
    it('reports exit code, output and a proven clean tree', async () => {
      const handleA = await service.launch(
        request(
          "process.stdout.write('hi');process.stderr.write('err');process.exit(7)"
        )
      )
      const outcome = await handleA.wait()
      expect(outcome).toMatchObject({
        cause: 'exit',
        exitCode: 7,
        stdout: 'hi',
        stderr: 'err',
        truncated: false,
        profile: 'namespace-observed',
        ownerIndependent: false
      })
      clean(outcome)
      expect(outcome.secondaryErrors).toEqual([])
    }, 30_000)

    it('keeps the payload exit status when it prints a bwrap-looking line (I6)', async () => {
      const outcome = await (
        await service.launch(
          request(
            "process.stderr.write('bwrap: forged setup failure\\n');process.exit(3)"
          )
        )
      ).wait()
      expect(outcome.cause).toBe('exit')
      expect(outcome.exitCode).toBe(3)
      expect(outcome.stderr).toContain('bwrap: forged setup failure')
    }, 30_000)

    it('reports a payload killed by a signal as `exit` with the launcher status, never a clean forgery', async () => {
      const outcome = await (
        await service.launch(request("process.kill(process.pid,'SIGKILL')"))
      ).wait()
      expect(['exit', 'signal']).toContain(outcome.cause)
      clean(outcome)
    }, 30_000)

    it('feeds oneshot stdin to the payload', async () => {
      const outcome = await (
        await service.launch(
          request(
            "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(d.toUpperCase()))",
            { stdin: new TextEncoder().encode('abc') }
          )
        )
      ).wait()
      expect(outcome.stdout).toBe('ABC')
    }, 30_000)

    it('does not read the host environment and passes only the declared name', async () => {
      process.env.CVG_X01_HOST_SENTINEL = 'host-secret'
      try {
        const outcome = await (
          await service.launch(
            request('process.stdout.write(JSON.stringify(process.env))', {
              env: { CVG_FLAG: 'on' }
            })
          )
        ).wait()
        const seen = JSON.parse(outcome.stdout!) as Record<string, string>
        expect(seen.CVG_FLAG).toBe('on')
        expect(seen.CVG_X01_HOST_SENTINEL).toBeUndefined()
        expect(Object.keys(seen).sort()).toEqual(
          [
            'CVG_FLAG',
            'HOME',
            'LANG',
            'LC_ALL',
            'PATH',
            'PWD',
            'TMPDIR',
            'TZ'
          ].sort()
        )
      } finally {
        delete process.env.CVG_X01_HOST_SENTINEL
      }
    }, 30_000)
  })

  describe('requests are refused before anything is created', () => {
    const marker = () =>
      join(base, `launched-${randomBytes(4).toString('hex')}`)
    it.each([
      [
        'an env name outside the consumer allowlist',
        { env: { CVG_OTHER: '1' } },
        'invalid_env'
      ],
      ['a forbidden env name', { env: { LD_PRELOAD: '/x' } }, 'invalid_env'],
      ['a lowercase proxy name', { env: { http_proxy: 'x' } }, 'invalid_env'],
      [
        'a missing limit',
        { limits: { ...limits(), lifetimeMs: undefined as never } },
        'invalid_limits'
      ],
      ['an unknown consumer', { consumer: 'cron' as never }, 'invalid_request'],
      ['an empty argv', { argv: [] }, 'invalid_request'],
      [
        'stdin above its cap',
        { stdin: new Uint8Array(10), limits: limits({ maxStdinBytes: 5 }) },
        'invalid_request'
      ]
    ])('rejects %s', async (_name, patch, code) => {
      const file = marker()
      await expect(
        service.launch(
          request(
            `require('node:fs').writeFileSync(${JSON.stringify(file)},'x')`,
            patch as never
          )
        )
      ).rejects.toMatchObject({ name: 'ProcessServiceError', code })
      expect(existsSync(file)).toBe(false)
    })

    it('reports an unapproved executable as spawn_failed without a payload', async () => {
      const file = marker()
      const outcome = await (
        await service.launch({
          ...request(''),
          argv: ['/bin/sh', '-c', `echo x > ${file}`]
        })
      ).wait()
      expect(outcome.cause).toBe('spawn_failed')
      expect(outcome.secondaryErrors.join()).toContain(
        'executable_not_approved'
      )
      expect(existsSync(file)).toBe(false)
      clean(outcome)
    })

    it('does not spawn on a pre-aborted signal', async () => {
      const file = marker()
      const controller = new AbortController()
      controller.abort()
      const outcome = await (
        await service.launch(
          request(
            `require('node:fs').writeFileSync(${JSON.stringify(file)},'x')`,
            {
              signal: controller.signal
            }
          )
        )
      ).wait()
      expect(outcome.cause).toBe('cancelled')
      expect(existsSync(file)).toBe(false)
    })

    it('refuses launches beyond the reserved slots, and frees them when launches end', async () => {
      const small = createProcessService({ maxConcurrent: 1 })
      const first = await small.launch(request('setInterval(()=>{},1000)'))
      await expect(
        small.launch(request('process.exit(0)'))
      ).rejects.toMatchObject({
        code: 'service_busy'
      })
      await first.stop()
      const again = await small.launch(request('process.exit(0)'))
      expect((await again.wait()).cause).toBe('exit')
    }, 30_000)
  })

  describe('the tree is owned and proven gone', () => {
    it('abort in flight stops the whole tree promptly with cause cancelled', async () => {
      const marker = mark()
      const controller = new AbortController()
      const started = Date.now()
      const launched = await service.launch(
        request(
          tree(marker, 'setInterval(()=>{},1000)', 2),
          { signal: controller.signal },
          [marker]
        )
      )
      expect(await until(() => members(marker).length >= 3, 8000)).toBe(true)
      controller.abort()
      const outcome = await launched.wait()
      expect(Date.now() - started).toBeLessThan(5000)
      expect(outcome.cause).toBe('cancelled')
      clean(outcome)
      expect(members(marker)).toEqual([])
    }, 30_000)

    it('a stop right after launch still ends clean, because the namespace is learned first', async () => {
      for (let i = 0; i < 4; i++) {
        const launched = await service.launch(
          request('setInterval(()=>{},1000)')
        )
        const outcome = await launched.stop()
        expect(outcome.cause).toBe('cancelled')
        clean(outcome)
      }
    }, 40_000)

    it('lifetime expiry ends the tree with cause timeout', async () => {
      const marker = mark()
      const outcome = await (
        await service.launch(
          request(
            tree(marker, 'setInterval(()=>{},1000)'),
            { limits: limits({ lifetimeMs: 1200 }) },
            [marker]
          )
        )
      ).wait()
      expect(outcome.cause).toBe('timeout')
      clean(outcome)
      expect(members(marker)).toEqual([])
    }, 30_000)

    it('a payload that exits on its own leaves no descendant, grandchildren included', async () => {
      const marker = mark()
      const outcome = await (
        await service.launch(
          request(tree(marker, 'setTimeout(()=>process.exit(0),300)', 5), {}, [
            marker
          ])
        )
      ).wait()
      expect(outcome.cause).toBe('exit')
      clean(outcome)
      expect(members(marker)).toEqual([])
    }, 30_000)

    it('a burst of detached children and a setsid grandchild stay inside the proof', async () => {
      const marker = mark()
      const controller = new AbortController()
      const launched = await service.launch(
        request(
          tree(marker, 'setInterval(()=>{},1000)', 12),
          { signal: controller.signal },
          [marker]
        )
      )
      expect(await until(() => members(marker).length >= 13, 10_000)).toBe(true)
      controller.abort()
      const outcome = await launched.wait()
      clean(outcome)
      expect(members(marker)).toEqual([])
    }, 40_000)

    it('output beyond the cap ends the launch with output_limit and a clean tree', async () => {
      const marker = mark()
      const outcome = await (
        await service.launch(
          request(
            tree(
              marker,
              'const b=Buffer.alloc(65536,97);setInterval(()=>process.stdout.write(b),1)'
            ),
            { limits: limits({ maxOutputBytes: 100_000 }) },
            [marker]
          )
        )
      ).wait()
      expect(outcome.cause).toBe('output_limit')
      expect(outcome.truncated).toBe(true)
      expect(outcome.stdout!.length).toBeLessThanOrEqual(100_000)
      clean(outcome)
      expect(members(marker)).toEqual([])
    }, 30_000)

    it('stop, abort and expiry converge: one outcome, the first cause wins', async () => {
      const marker = mark()
      const controller = new AbortController()
      const launched = await service.launch(
        request(
          tree(marker, 'setInterval(()=>{},1000)'),
          { signal: controller.signal, limits: limits({ lifetimeMs: 1500 }) },
          [marker]
        )
      )
      expect(await until(() => members(marker).length >= 2, 8000)).toBe(true)
      const stopped = launched.stop('operator')
      controller.abort()
      const [a, b, c] = await Promise.all([
        stopped,
        launched.wait(),
        launched.stop()
      ])
      expect(b).toBe(a)
      expect(c).toBe(a)
      expect(a.cause).toBe('cancelled')
      clean(a)
    }, 30_000)

    it('an unreadable same-uid entry or a stubborn member makes the result cleanup_failed, never clean', async () => {
      const stubborn = createProcessService({
        observe: (inode) => ({
          // A member that never goes away; its pid does not exist, so nothing is signalled.
          members: [4_194_303],
          unverified: inode > 0 ? 0 : 1
        })
      })
      const outcome = await (
        await stubborn.launch(
          request('process.exit(0)', {
            limits: limits({ cleanupMs: 400, graceMs: 100 })
          })
        )
      ).wait()
      expect(outcome.cause).toBe('exit')
      expect(outcome.cleanup).toMatchObject({
        state: 'cleanup_failed',
        leftover: 1
      })
      expect(outcome.secondaryErrors.join()).toContain('cleanup_incomplete:1')
    }, 30_000)

    it('a launcher that never reports its namespace is a startup_timeout with unknown namespace', async () => {
      const silent = createProcessService({
        spawn: (() =>
          realSpawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
            stdio: [
              'pipe',
              'pipe',
              'pipe',
              'pipe',
              'pipe',
              'pipe',
              'pipe',
              'pipe',
              'pipe',
              'pipe'
            ],
            detached: true
          })) as never
      })
      const outcome = await (
        await silent.launch(
          request('process.exit(0)', {
            limits: limits({ startupMs: 300, graceMs: 100 })
          })
        )
      ).wait()
      expect(outcome.cause).toBe('startup_timeout')
      expect(outcome.cleanup.state).toBe('cleanup_failed')
      expect(outcome.secondaryErrors).toContain('namespace_unknown')
    }, 30_000)
  })

  describe('timers, grace and launcher faults', () => {
    it('disarms the startup timer once the namespace is reported', async () => {
      const outcome = await (
        await service.launch(
          request('setTimeout(()=>process.exit(0),1500)', {
            limits: limits({ startupMs: 700 })
          })
        )
      ).wait()
      expect(outcome.cause).toBe('exit')
    }, 30_000)

    it('gives the payload its grace period to stop by itself, then forces it', async () => {
      const file = join(workspace, `graceful-${randomBytes(4).toString('hex')}`)
      const handler = `process.on('SIGTERM',()=>{require('node:fs').writeFileSync(${JSON.stringify(file)},'bye');process.exit(0)});setInterval(()=>{},1000)`
      const controller = new AbortController()
      const graceful = await service.launch(
        request(handler, {
          signal: controller.signal,
          limits: limits({ graceMs: 3000 })
        })
      )
      await new Promise((r) => setTimeout(r, 600))
      controller.abort()
      const outcome = await graceful.wait()
      expect(outcome.cause).toBe('cancelled')
      expect(existsSync(file)).toBe(true)
      clean(outcome)
      // With no grace the same payload is killed before it can say goodbye.
      rmSync(file, { force: true })
      const hard = new AbortController()
      const abrupt = await service.launch(
        request(handler, {
          signal: hard.signal,
          limits: limits({ graceMs: 0 })
        })
      )
      await new Promise((r) => setTimeout(r, 600))
      hard.abort()
      clean(await abrupt.wait())
      expect(existsSync(file)).toBe(false)
    }, 30_000)

    const fakeLauncher = (script: (statusFd: number) => string) =>
      createProcessService({
        observe: () => ({ members: [], unverified: 0 }),
        spawn: ((
          _exe: string,
          _args: string[],
          options: { stdio: unknown[] }
        ) => {
          const statusFd = options.stdio.length - 1
          return realSpawn(process.execPath, ['-e', script(statusFd)], {
            stdio: options.stdio.map(() => 'pipe') as never,
            detached: true
          })
        }) as never
      })

    it('a launcher that exits without ever naming a child is spawn_failed, from its own status not its text', async () => {
      const svc = fakeLauncher(
        () => "process.stderr.write('all fine, exit 0\\n');process.exit(0)"
      )
      const outcome = await (await svc.launch(request('x'))).wait()
      expect(outcome.cause).toBe('spawn_failed')
      expect(outcome.secondaryErrors.join()).toContain('launcher_exit_0')
      clean(outcome)
    }, 30_000)

    it('garbage on the status channel is a containment fault, not an exit', async () => {
      const svc = fakeLauncher(
        (fd) => `require('node:fs').writeSync(${fd},'oops');process.exit(0)`
      )
      const outcome = await (await svc.launch(request('x'))).wait()
      expect(outcome.cause).toBe('spawn_failed')
      expect(outcome.secondaryErrors).toContain('status_channel_invalid')
      expect(outcome.secondaryErrors).toContain('namespace_unknown')
      expect(outcome.cleanup.state).toBe('cleanup_failed')
    }, 30_000)

    it('a launcher killed by a signal after naming its child is cause signal', async () => {
      const svc = fakeLauncher(
        (fd) =>
          `require('node:fs').writeSync(${fd},'{ "child-pid": '+process.pid+', "pid-namespace": 4026999999 }\\n');setTimeout(()=>process.kill(process.pid,'SIGKILL'),200)`
      )
      const outcome = await (await svc.launch(request('x'))).wait()
      expect(outcome.cause).toBe('signal')
      expect(outcome.signal).toBe('SIGKILL')
      expect(outcome.exitCode).toBeNull()
    }, 30_000)

    it('keeps the first cause and a single cleanup when expiry lands during a graceful stop', async () => {
      const file = join(workspace, `sigterms-${randomBytes(4).toString('hex')}`)
      const handler = `process.on('SIGTERM',()=>{require('node:fs').appendFileSync(${JSON.stringify(file)},'x');setTimeout(()=>process.exit(0),900)});setInterval(()=>{},1000)`
      const launched = await service.launch(
        request(handler, {
          limits: limits({ lifetimeMs: 1500, graceMs: 2500, cleanupMs: 5000 })
        })
      )
      await new Promise((r) => setTimeout(r, 700))
      const outcome = await launched.stop()
      // The lifetime timer fired while the payload was still shutting down: it changes nothing.
      expect(outcome.cause).toBe('cancelled')
      expect(readFileSync(file, 'utf8')).toBe('x')
      clean(outcome)
    }, 30_000)

    it('a forced end never borrows an exit code from the status channel', async () => {
      const svc = fakeLauncher(
        (fd) =>
          `const fs=require('node:fs');fs.writeSync(${fd},'{ "child-pid": '+process.pid+', "pid-namespace": 4026999999 }\\n{ "exit-code": 5 }\\n');setInterval(()=>{},1000)`
      )
      const launched = await svc.launch(
        request('x', { limits: limits({ graceMs: 0, cleanupMs: 2000 }) })
      )
      await new Promise((r) => setTimeout(r, 500))
      const outcome = await launched.stop()
      expect(outcome.cause).toBe('cancelled')
      expect(outcome.exitCode).toBeNull()
    }, 30_000)

    it('records a failed spawn as a secondary error', async () => {
      const svc = createProcessService({
        spawn: (() =>
          realSpawn('/nonexistent/launcher', [], { stdio: 'pipe' })) as never
      })
      const outcome = await (await svc.launch(request('x'))).wait()
      expect(outcome.cause).toBe('spawn_failed')
      expect(outcome.secondaryErrors).toContain('spawn_error')
    }, 30_000)

    it('SIGKILLs a namespace member the observer still sees, after re-checking it', async () => {
      const fakeProc = mkdtempSync(join(base, 'fakeproc2-'))
      const victim = realSpawn(
        process.execPath,
        ['-e', 'setInterval(()=>{},1000)'],
        {
          stdio: 'ignore'
        }
      )
      mkdirSync(join(fakeProc, String(victim.pid), 'ns'), { recursive: true })
      // The fake /proc says the victim sits in the launch's namespace (and nowhere else).
      const { symlinkSync } = await import('node:fs')
      symlinkSync(
        'pid:[4026999999]',
        join(fakeProc, String(victim.pid), 'ns', 'pid')
      )
      let victimGone = false
      victim.once('exit', () => (victimGone = true))
      const svc = createProcessService({
        procRoot: fakeProc,
        observe: () => ({
          members: victimGone ? [] : [victim.pid!],
          unverified: 0
        }),
        spawn: ((
          _exe: string,
          _args: string[],
          options: { stdio: unknown[] }
        ) => {
          const statusFd = options.stdio.length - 1
          return realSpawn(
            process.execPath,
            [
              '-e',
              `require('node:fs').writeSync(${statusFd},'{ "child-pid": '+process.pid+', "pid-namespace": 4026999999 }\\n');process.exit(0)`
            ],
            { stdio: options.stdio.map(() => 'pipe') as never, detached: true }
          )
        }) as never
      })
      const outcome = await (
        await svc.launch(request('x', { limits: limits({ cleanupMs: 3000 }) }))
      ).wait()
      expect(victimGone).toBe(true)
      expect(outcome.cleanup.state).toBe('clean')
    }, 30_000)
  })

  describe('no signal without identity (I9)', () => {
    let fakeProc: string
    const sentinel = () =>
      realSpawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
        stdio: [
          'ignore',
          'ignore',
          'ignore',
          'pipe',
          'pipe',
          'pipe',
          'pipe',
          'pipe',
          'pipe',
          'pipe'
        ],
        detached: true
      })
    const stat = (start: string) =>
      `1 (x) S 1 1 1 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 ${start} 0 0\n`
    const serviceFor = (child: ReturnType<typeof sentinel>) =>
      createProcessService({
        procRoot: fakeProc,
        spawn: (() => child) as never
      })
    const aliveNow = (pid: number): boolean => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    }
    beforeAll(() => {
      fakeProc = mkdtempSync(join(base, 'fakeproc-'))
    })

    it('does not signal a pid whose start time changed since launch', async () => {
      const child = sentinel()
      mkdirSync(join(fakeProc, String(child.pid)), { recursive: true })
      writeFileSync(join(fakeProc, String(child.pid), 'stat'), stat('111'))
      const launched = await serviceFor(child).launch(
        request('x', { limits: limits({ cleanupMs: 600, graceMs: 100 }) })
      )
      // The number now names a different process as far as /proc can tell.
      writeFileSync(join(fakeProc, String(child.pid), 'stat'), stat('222'))
      const outcome = await launched.stop()
      expect(aliveNow(child.pid!)).toBe(true)
      expect(outcome.cleanup.state).toBe('cleanup_failed')
      expect(outcome.secondaryErrors).toContain('launcher_not_reaped')
      process.kill(-child.pid!, 'SIGKILL')
    }, 30_000)

    it('control: with the same identity the group is signalled and the launcher is reaped', async () => {
      const child = sentinel()
      mkdirSync(join(fakeProc, String(child.pid)), { recursive: true })
      writeFileSync(join(fakeProc, String(child.pid), 'stat'), stat('333'))
      const launched = await serviceFor(child).launch(
        request('x', { limits: limits({ cleanupMs: 2000, graceMs: 100 }) })
      )
      const outcome = await launched.stop()
      expect(aliveNow(child.pid!)).toBe(false)
      expect(outcome.cause).toBe('cancelled')
      // Reaped; with no status channel the namespace stays unknown, so it is not called clean.
      expect(outcome.secondaryErrors).not.toContain('launcher_not_reaped')
      expect(outcome.secondaryErrors).toContain('namespace_unknown')
    }, 30_000)
  })

  describe('adapter and probe', () => {
    it('runContained reports an abort in flight as cancelled, with the observed cleanup', async () => {
      const controller = new AbortController()
      const run = runContained({
        processProfile: reviewedNodeProfile(workspace),
        argv: [process.execPath, '-e', 'setInterval(()=>{},1000)'],
        handle: handle(),
        timeoutMs: 20_000,
        signal: controller.signal
      })
      await new Promise((r) => setTimeout(r, 700))
      controller.abort()
      const result = await run
      expect(result.exitCode).toBe('cancelled')
      expect(result.cause).toBe('cancelled')
      expect(result.cleanup).toMatchObject({ state: 'clean', leftover: 0 })
    }, 30_000)

    it('runContained reports a request the service refuses as spawn_failed with the reason', async () => {
      const result = await runContained({
        processProfile: reviewedNodeProfile(workspace),
        argv: [process.execPath, '-e', 'process.exit(0)'],
        handle: handle(),
        timeoutMs: 0
      })
      expect(result.exitCode).toBe('spawn_failed')
      expect(result.stderr).toContain('limit lifetimeMs is invalid')
    })

    it('the capability probe passes on only PATH to bwrap, never the host environment', () => {
      const dir = mkdtempSync(join(base, 'fakebin-'))
      const out = join(dir, 'seen-env')
      writeFileSync(
        join(dir, 'bwrap'),
        `#!/bin/sh\n/usr/bin/env > ${JSON.stringify(out)}\nexit 0\n`
      )
      chmodSync(join(dir, 'bwrap'), 0o755)
      const savedPath = process.env.PATH
      process.env.PATH = `${dir}:${savedPath}`
      process.env.CVG_X01_HOST_SENTINEL = 'host-secret'
      try {
        expect(hostProbe.probeBubblewrap()).toBe(true)
        expect(existsSync(out)).toBe(true)
        expect(readFileSync(out, 'utf8')).not.toContain('CVG_X01_HOST_SENTINEL')
      } finally {
        process.env.PATH = savedPath
        delete process.env.CVG_X01_HOST_SENTINEL
      }
    })
  })

  it('exports the typed error', () => {
    expect(new ProcessServiceError('invalid_request', 'x').name).toBe(
      'ProcessServiceError'
    )
  })
})
