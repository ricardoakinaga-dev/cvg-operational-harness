// @vitest-environment node
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createProcessContainmentProfile,
  createProcessService,
  hostProbe,
  LANDLOCK_HELPER_DESTINATION,
  LANDLOCK_MIN_ABI,
  landlockRulesFor,
  type ProcessLaunchRequest
} from '../packages/sandbox/src/index.ts'
import { prepareProcessLaunch } from '../packages/sandbox/src/process-profile.ts'
import { reviewedNodeRuntimeFiles } from './helpers/aud0625-node-process-profile.ts'

/**
 * PAR-X02 / SPEC 0288 slice 3: the Landlock helper inside the X01 launch. The ruleset is derived
 * from the reviewed profile, the payload runs only after the helper proved it on its private
 * channel (XL04), and a write bubblewrap would allow outside the list is denied (XL03 through
 * the service). Synthetic paths only.
 */
const OWN_ROOT = process.env.CVG_AUD0625_FIXTURE_ROOT ?? process.cwd()
const SOURCE = resolve(
  __dirname,
  '../packages/sandbox/native/cvg-landlock-exec.c'
)
const cc = spawnSync('cc', ['--version'], { stdio: 'ignore' }).status === 0
const native = cc && hostProbe.probeBubblewrap()

let base: string
let workspace: string
let helper: string
let strictHelper: string

/** Static when the toolchain has a static libc, as the build stage does (D-A). */
function build(output: string, extra: readonly string[] = []): void {
  const flags = [
    '-O2',
    '-Wall',
    '-Wextra',
    '-Werror',
    ...extra,
    '-o',
    output,
    SOURCE
  ]
  const built =
    spawnSync('cc', ['-static', ...flags], { encoding: 'utf8' }).status === 0
      ? { status: 0, stderr: '' }
      : spawnSync('cc', flags, { encoding: 'utf8' })
  if (built.status !== 0)
    throw new Error(`helper did not compile: ${built.stderr}`)
  chmodSync(output, 0o755)
}

const profileWith = (landlockHelperPath?: string) =>
  createProcessContainmentProfile({
    workspaceRoot: workspace,
    bwrapPath: '/usr/bin/bwrap',
    runtimeFiles: reviewedNodeRuntimeFiles(),
    executablePaths: [process.execPath],
    ...(landlockHelperPath !== undefined ? { landlockHelperPath } : {})
  })
const handle = () => ({
  mode: 'PROCESS' as const,
  workspaceRoot: workspace,
  allowNetwork: false,
  allowSubprocess: true
})
const request = (
  js: string,
  profile = profileWith(helper)
): ProcessLaunchRequest => ({
  consumer: 'shell',
  profile,
  handle: handle(),
  argv: [process.execPath, '-e', js],
  mode: 'oneshot',
  limits: {
    startupMs: 10_000,
    lifetimeMs: 20_000,
    cleanupMs: 5_000,
    graceMs: 300,
    maxOutputBytes: 1024 * 1024,
    maxStdinBytes: 1024 * 1024
  }
})
/** Tries one write and prints the outcome; the payload never throws. */
const tryWrite = (path: string) =>
  `try{require('node:fs').writeFileSync(${JSON.stringify(path)},'x');process.stdout.write('wrote')}` +
  `catch(e){process.stdout.write(e.code)}`
/**
 * A helper that is NOT the reviewed one (review P2s on slice 3): it applies no ruleset and runs
 * the payload 1.5 s later, after a weak proof, after closing its channel, or saying nothing.
 */
function fakeHelper(mode: 'weak' | 'closed' | 'silent'): string {
  const path = join(base, `fake-helper-${mode}`)
  writeFileSync(
    path,
    [
      `#!${process.execPath}`,
      "const fs = require('node:fs')",
      "const { spawnSync } = require('node:child_process')",
      'const a = process.argv.slice(2)',
      "const f = Number(a[a.indexOf('--status-fd') + 1])",
      "const p = a.indexOf('--') + 1",
      mode === 'weak'
        ? "fs.writeSync(f, JSON.stringify({ applied: true, abi: 3, handledFs: 1, handledNet: 0, scoped: 0 }) + '\\n')"
        : '',
      mode === 'closed' ? 'fs.closeSync(f)' : '',
      'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500)',
      "spawnSync(a[p], a.slice(p + 1), { stdio: 'inherit' })",
      ''
    ].join('\n')
  )
  chmodSync(path, 0o755)
  return path
}

beforeAll(() => {
  if (OWN_ROOT === '/tmp' || OWN_ROOT.startsWith('/tmp/'))
    throw new Error('Use an owned fixture root outside the /tmp mount shadow')
  base = mkdtempSync(join(OWN_ROOT, 'x02s3-'))
  workspace = join(base, 'workspace')
  mkdirSync(workspace)
  helper = join(base, 'cvg-landlock-exec')
  strictHelper = join(base, 'cvg-landlock-exec-abi99')
  if (cc) {
    build(helper)
    build(strictHelper, ['-DMIN_ABI=99'])
  } else {
    writeFileSync(helper, '#!/bin/false\n')
    chmodSync(helper, 0o755)
  }
})
afterAll(() => rmSync(base, { recursive: true, force: true }))

describe('PAR-X02 slice 3: profile and launch preparation', () => {
  it('a Landlock launch without a helper in the profile is refused before anything opens', () => {
    expect(() =>
      prepareProcessLaunch({
        profile: profileWith(),
        handle: handle(),
        argv: [process.execPath],
        statusFd: true,
        landlock: true
      })
    ).toThrow('process_profile_landlock_helper_required')
  })

  it('the helper is pinned in the profile digest, outside the workspace and executable', () => {
    expect(profileWith(helper).digest).not.toBe(profileWith().digest)
    const inside = join(workspace, 'helper')
    writeFileSync(inside, '#!/bin/false\n')
    chmodSync(inside, 0o755)
    expect(() => profileWith(inside)).toThrow(
      'process_profile_landlock_helper_inside_workspace'
    )
    const plain = join(base, 'not-executable')
    writeFileSync(plain, 'x')
    chmodSync(plain, 0o644)
    expect(() => profileWith(plain)).toThrow(
      'process_profile_landlock_helper_not_executable'
    )
    rmSync(inside)
  })

  it('wraps the payload in the helper with its two channels after the bubblewrap status pipe', () => {
    const prepared = prepareProcessLaunch({
      profile: profileWith(helper),
      handle: handle(),
      argv: [process.execPath, '-e', '1'],
      statusFd: true,
      landlock: true
    })
    try {
      const { args, fds, statusFdIndex, landlock } = prepared
      expect(statusFdIndex).toBe(3 + fds.length)
      expect(landlock).toMatchObject({
        statusFdIndex: 3 + fds.length + 1,
        rulesFdIndex: 3 + fds.length + 2
      })
      const bind = args.indexOf(LANDLOCK_HELPER_DESTINATION)
      expect(args[bind - 2]).toBe('--ro-bind-fd')
      const tail = args.slice(args.indexOf('--'))
      expect(tail).toEqual([
        '--',
        LANDLOCK_HELPER_DESTINATION,
        '--status-fd',
        String(landlock!.statusFdIndex),
        '--rules-fd',
        String(landlock!.rulesFdIndex),
        '--',
        process.execPath,
        '-e',
        '1'
      ])
    } finally {
      prepared.close()
    }
  })

  it('the ruleset is a closed list from the profile: runtime files read+execute, workspace and tmp', () => {
    const rules = landlockRulesFor(profileWith(helper)).trimEnd().split('\n')
    const byPath = new Map(
      rules.map((line) => [
        line.slice(line.indexOf(' ') + 1),
        line.split(' ')[0]
      ])
    )
    for (const file of reviewedNodeRuntimeFiles())
      expect(byPath.get(file.destination ?? file.source)).toBe('5')
    // Everything but execute: execution stays on the profile's reviewed files (§5.5).
    expect(byPath.get(workspace)).toBe('7ffe')
    expect(byPath.get('/tmp')).toBe('7ffe')
    expect(byPath.get('/dev/null')).toBe('4006')
    expect(byPath.has('/')).toBe(false)
    expect(byPath.has(dirname(workspace))).toBe(false)
    expect(byPath.has(LANDLOCK_HELPER_DESTINATION)).toBe(false)
  })

  it('a path the helper cannot express (a line break) is refused', () => {
    const odd = join(base, 'odd\nworkspace')
    mkdirSync(odd)
    const profile = createProcessContainmentProfile({
      workspaceRoot: odd,
      bwrapPath: '/usr/bin/bwrap',
      runtimeFiles: reviewedNodeRuntimeFiles(),
      executablePaths: [process.execPath],
      landlockHelperPath: helper
    })
    expect(() => landlockRulesFor(profile)).toThrow(
      'process_profile_invalid_path'
    )
  })
})

describe.skipIf(!native)(
  'PAR-X02 slice 3: Landlock under the process service',
  () => {
    const plain = createProcessService({ maxConcurrent: 2 })
    const landlocked = createProcessService({
      maxConcurrent: 2,
      requireLandlock: true
    })

    it('XL03: a write bubblewrap allows outside the list is denied only under the helper', async () => {
      const outside = join(dirname(workspace), 'x02-outside')
      const without = await (
        await plain.launch(request(tryWrite(outside)))
      ).wait()
      expect(without).toMatchObject({
        cause: 'exit',
        exitCode: 0,
        stdout: 'wrote'
      })
      expect(without.landlock).toEqual({ applied: false })

      const under = await (
        await landlocked.launch(request(tryWrite(outside)))
      ).wait()
      expect(under).toMatchObject({
        cause: 'exit',
        exitCode: 0,
        stdout: 'EACCES'
      })
      expect(under.landlock).toMatchObject({ applied: true })
      if (under.landlock.applied)
        expect(under.landlock.abi).toBeGreaterThanOrEqual(LANDLOCK_MIN_ABI)
    }, 60_000)

    it('the workspace and the launch tmp stay writable under the helper', async () => {
      const target = join(workspace, 'x02-inside')
      const outcome = await (
        await landlocked.launch(
          request(
            `${tryWrite(target)};require('node:fs').writeFileSync('/tmp/t','y')`
          )
        )
      ).wait()
      expect(outcome).toMatchObject({
        cause: 'exit',
        exitCode: 0,
        stdout: 'wrote'
      })
      expect(existsSync(target)).toBe(true)
    }, 60_000)

    it.skipIf(!cc)(
      'a binary copied into the workspace or the launch tmp never executes under the helper (review F01)',
      async () => {
        // The static helper is a small ELF outside the profile's executable paths. The host puts
        // a copy in the workspace (the only host path the sandbox sees); the payload copies it on
        // to the launch tmp and tries both.
        const copied = join(workspace, 'x02-copied-elf')
        const js =
          `const fs=require('node:fs'),{spawnSync}=require('node:child_process');` +
          `const run=(p)=>{const r=spawnSync(p,['x']);return r.error?r.error.code:'ran'};` +
          `fs.copyFileSync(${JSON.stringify(copied)},'/tmp/elf');fs.chmodSync('/tmp/elf',0o755);` +
          `process.stdout.write(run(${JSON.stringify(copied)})+','+run('/tmp/elf'))`
        const place = () => {
          copyFileSync(helper, copied)
          chmodSync(copied, 0o755)
        }
        place()
        const under = await (await landlocked.launch(request(js))).wait()
        expect(under).toMatchObject({
          cause: 'exit',
          exitCode: 0,
          stdout: 'EACCES,EACCES'
        })
        place()
        const without = await (await plain.launch(request(js))).wait()
        expect(without).toMatchObject({ cause: 'exit', stdout: 'ran,ran' })
        rmSync(copied, { force: true })
      },
      60_000
    )

    it.skipIf(!cc)(
      'XL04: the reviewed helper that cannot prove the ruleset never runs the payload: spawn_failed',
      async () => {
        const sentinel = join(workspace, 'x02-sentinel')
        const outcome = await (
          await landlocked.launch(
            request(tryWrite(sentinel), profileWith(strictHelper))
          )
        ).wait()
        expect(outcome.cause).toBe('spawn_failed')
        expect(outcome.exitCode).toBeNull()
        expect(outcome.landlock).toEqual({
          applied: false,
          error: 'abi_too_low'
        })
        expect(outcome.secondaryErrors).toContain('landlock_abi_too_low')
        expect(existsSync(sentinel)).toBe(false)
      },
      60_000
    )

    it('a Landlock service with a helper-less profile launches nothing', async () => {
      const outcome = await (
        await landlocked.launch(request('1', profileWith()))
      ).wait()
      expect(outcome.cause).toBe('spawn_failed')
      expect(outcome.secondaryErrors).toEqual([
        'process_profile_landlock_helper_required'
      ])
      expect(outcome.landlock).toEqual({ applied: false })
    })

    // Fake helpers (review F02): the service bounds an unproven launch by tearing it down at once
    // or at the startup deadline. That is all it can promise; the payload here waits 1.5 s, and a
    // fake that executes the payload immediately could act before teardown. Only the reviewed
    // helper, pinned by digest in a host-qualified profile, guarantees that nothing ran.
    it('a proof that does not handle the ruleset rights is refused at once, before the delayed payload', async () => {
      const sentinel = join(workspace, 'x02-weak')
      const outcome = await (
        await landlocked.launch(
          request(tryWrite(sentinel), profileWith(fakeHelper('weak')))
        )
      ).wait()
      expect(outcome.cause).toBe('spawn_failed')
      expect(outcome.landlock).toEqual({
        applied: false,
        error: 'rights_not_handled'
      })
      expect(outcome.secondaryErrors).toContain('landlock_rights_not_handled')
      expect(existsSync(sentinel)).toBe(false)
    }, 60_000)

    for (const mode of ['closed', 'silent'] as const)
      it(`a helper that ${mode === 'closed' ? 'closes its channel without' : 'never writes'} a proof is torn down by the startup deadline, before the delayed payload`, async () => {
        const sentinel = join(workspace, `x02-${mode}`)
        const outcome = await (
          await landlocked.launch({
            ...request(tryWrite(sentinel), profileWith(fakeHelper(mode))),
            limits: { ...request('1').limits, startupMs: 800 }
          })
        ).wait()
        expect(outcome.cause).toBe(
          mode === 'closed' ? 'spawn_failed' : 'startup_timeout'
        )
        expect(outcome.exitCode).toBeNull()
        expect(outcome.landlock).toEqual({
          applied: false,
          error: 'status_missing'
        })
        expect(existsSync(sentinel)).toBe(false)
      }, 60_000)

    afterAll(async () => {
      await plain.dispose()
      await landlocked.dispose()
    })
  }
)
