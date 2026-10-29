import { spawn, spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdtempSync, openSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * SPEC 0288 slice 1 (PAR-X02): the native helper, compiled from the repository source and
 * exercised on the real kernel. XL01 probe, XL03 denial outside the rules, XL05 malformed rules
 * refused before execve, XL06 the payload inherits neither private fd. Synthetic paths only.
 */
const SOURCE = resolve(__dirname, '../../native/cvg-landlock-exec.c')
const cc = spawnSync('cc', ['--version'], { stdio: 'ignore' }).status === 0
const kernelAbi = (): number => {
  // Asked to the kernel by the helper itself in XL01; here only to skip on hosts without it.
  return existsSync('/sys/kernel/security/lsm') ? 1 : 0
}

const R = (1 << 0) | (1 << 2) | (1 << 3) // execute, read file, read dir
const RW =
  (1 << 1) |
  (1 << 2) |
  (1 << 3) |
  (1 << 4) |
  (1 << 5) |
  (1 << 7) |
  (1 << 8) |
  (1 << 14)
const hex = (n: number) => n.toString(16)

let dir: string
let helper: string
let workspace: string
let outside: string

interface Run {
  status: string
  stdout: string
  stderr: string
  code: number | null
}

function run(args: string[], rules?: string): Promise<Run> {
  return new Promise((done, reject) => {
    const child = spawn(helper, args, {
      stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
      env: { PATH: '/usr/bin:/bin' }
    })
    let status = ''
    let stdout = ''
    let stderr = ''
    ;(child.stdio[3] as NodeJS.ReadableStream).on('data', (d) => (status += d))
    child.stdout!.on('data', (d) => (stdout += d))
    child.stderr!.on('data', (d) => (stderr += d))
    const rulesPipe = child.stdio[4] as NodeJS.WritableStream
    rulesPipe.on('error', () => undefined)
    rulesPipe.end(rules ?? '')
    child.on('error', reject)
    child.on('close', (code) => done({ status, stdout, stderr, code }))
  })
}

const baseRules = () =>
  ['/usr', '/lib', '/lib64', '/bin', '/etc']
    .filter((p) => existsSync(p))
    .map((p) => `${hex(R)} ${p}`)
    .concat(`${hex(RW)} ${workspace}`, `${hex(RW)} /dev/null`)
    .join('\n') + '\n'

const applyArgs = (payload: string[]) => [
  '--status-fd',
  '3',
  '--rules-fd',
  '4',
  '--',
  ...payload
]

describe.skipIf(!cc || !kernelAbi())(
  'PAR-X02 native helper (SPEC 0288 slice 1)',
  () => {
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'cvg-x02-'))
      helper = join(dir, 'cvg-landlock-exec')
      const built = spawnSync(
        'cc',
        ['-O2', '-Wall', '-Wextra', '-Werror', '-o', helper, SOURCE],
        { encoding: 'utf8' }
      )
      if (built.status !== 0)
        throw new Error(`helper did not compile: ${built.stderr}`)
      workspace = mkdtempSync(join(dir, 'ws-'))
      outside = mkdtempSync(join(dir, 'out-'))
    })
    afterAll(() => rmSync(dir, { recursive: true, force: true }))

    it('XL01: the probe asks the kernel for the ABI, not the release string', async () => {
      const r = await run(['--probe', '--status-fd', '3'])
      const status = JSON.parse(r.status) as { abi: number }
      expect(Number.isSafeInteger(status.abi)).toBe(true)
      expect(status.abi).toBeGreaterThanOrEqual(3)
      expect(r.code).toBe(0)
    })

    it('XL03: inside the rules the payload writes; outside it is denied by Landlock', async () => {
      const inside = await run(
        applyArgs([
          '/bin/sh',
          '-c',
          `echo ok > ${workspace}/f && cat ${workspace}/f`
        ]),
        baseRules()
      )
      expect(JSON.parse(inside.status)).toMatchObject({ applied: true })
      expect(inside.stdout).toBe('ok\n')
      const denied = await run(
        applyArgs(['/bin/sh', '-c', `echo x > ${outside}/f`]),
        baseRules()
      )
      expect(JSON.parse(denied.status)).toMatchObject({ applied: true })
      expect(denied.code).not.toBe(0)
      expect(denied.stderr).toMatch(/Permission denied/)
      expect(existsSync(join(outside, 'f'))).toBe(false)
      // Control: the same write without the helper succeeds, so the denial is Landlock's.
      expect(
        spawnSync('/bin/sh', ['-c', `echo x > ${outside}/control`]).status
      ).toBe(0)
    })

    it('XL05: malformed rules are refused before execve and the payload never runs', async () => {
      const sentinel = join(workspace, 'must-not-exist')
      const payload = ['/bin/sh', '-c', `echo ran > ${sentinel}`]
      const cases: Array<[string, string]> = [
        ['', 'rules_empty'],
        [`${hex(RW)} ${workspace}`, 'rules_unterminated'],
        [`${hex(RW)} relative/path\n`, 'rule_path_not_absolute'],
        [`${hex(RW)} ${workspace}/../escape\n`, 'rule_path_not_absolute'],
        [`${hex(RW)} ${workspace}/..\n`, 'rule_path_not_absolute'],
        [`zz ${workspace}\n`, 'rule_mask_malformed'],
        [`${(2 ** 40).toString(16)} ${workspace}\n`, 'rule_mask_unknown_right'],
        [`${hex(RW)} /no/such/path/x02\n`, 'rule_path_unavailable'],
        [`${hex(RW)}\n`, 'rule_malformed'],
        [`${hex(R)} /usr\n`.repeat(257), 'rules_too_many']
      ]
      for (const [rules, error] of cases) {
        const r = await run(applyArgs(payload), rules)
        expect(JSON.parse(r.status)).toMatchObject({ applied: false, error })
        expect(r.code).toBe(125)
        expect(existsSync(sentinel)).toBe(false)
      }
      const big = await run(applyArgs(payload), 'x'.repeat(70_000))
      expect(JSON.parse(big.status)).toMatchObject({
        applied: false,
        error: 'rules_too_large'
      })
    })

    it('XL05: a relative payload path is refused', async () => {
      const r = await run(applyArgs(['sh', '-c', 'true']), baseRules())
      expect(JSON.parse(r.status)).toMatchObject({
        applied: false,
        error: 'usage'
      })
    })

    it('XL01: below the minimum ABI the helper refuses and never runs the payload', async () => {
      const strict = join(dir, 'cvg-landlock-exec-abi99')
      const built = spawnSync(
        'cc',
        [
          '-O2',
          '-Wall',
          '-Wextra',
          '-Werror',
          '-DMIN_ABI=99',
          '-o',
          strict,
          SOURCE
        ],
        { encoding: 'utf8' }
      )
      expect(built.status).toBe(0)
      const sentinel = join(workspace, 'abi-sentinel')
      const saved = helper
      helper = strict
      try {
        const r = await run(
          applyArgs(['/bin/sh', '-c', `echo ran > ${sentinel}`]),
          baseRules()
        )
        expect(JSON.parse(r.status)).toMatchObject({
          applied: false,
          error: 'abi_too_low'
        })
        expect(existsSync(sentinel)).toBe(false)
      } finally {
        helper = saved
      }
    })

    it('XL06: the payload inherits neither the status nor the rules descriptor', async () => {
      const r = await run(
        applyArgs([
          '/bin/sh',
          '-c',
          '(echo leak >&3) 2>/dev/null && echo fd3; (cat <&4) 2>/dev/null && echo fd4; echo done'
        ]),
        baseRules()
      )
      expect(JSON.parse(r.status)).toMatchObject({ applied: true })
      expect(r.stdout).toBe('done\n')
    })

    it('denies TCP connect when the ABI handles the network', async () => {
      const probe = JSON.parse(
        (await run(['--probe', '--status-fd', '3'])).status
      )
      if (probe.abi < 4) return
      const r = await run(
        applyArgs([
          '/usr/bin/env',
          'python3',
          '-I',
          '-c',
          "import socket,sys\ns=socket.socket()\ntry:\n s.connect(('127.0.0.1',9))\nexcept PermissionError:\n sys.exit(7)\nexcept OSError:\n sys.exit(0)"
        ]),
        baseRules()
      )
      if (!existsSync('/usr/bin/python3')) return
      expect(r.code).toBe(7)
    })

    /** Spawns the helper with a caller-chosen fd 3, to test a broken status channel. */
    function runWithStatusFd(
      fd3: number | 'ignore',
      args: string[],
      rules: string
    ): Promise<{ code: number | null; stdout: string }> {
      return new Promise((done, reject) => {
        const child = spawn(helper, args, {
          stdio: ['ignore', 'pipe', 'ignore', fd3, 'pipe'],
          env: { PATH: '/usr/bin:/bin' }
        })
        let stdout = ''
        child.stdout!.on('data', (d) => (stdout += d))
        const rulesPipe = child.stdio[4] as NodeJS.WritableStream
        rulesPipe.on('error', () => undefined)
        rulesPipe.end(rules)
        child.on('error', reject)
        child.on('close', (code) => done({ code, stdout }))
      })
    }

    it('review P2: a status channel that cannot be written stops before the payload', async () => {
      const sentinel = join(workspace, 'status-sentinel')
      const payload = ['/bin/sh', '-c', `echo ran > ${sentinel}`]
      // (a) status fd not open at all
      const closed = await runWithStatusFd(
        'ignore',
        ['--status-fd', '9', '--rules-fd', '4', '--', ...payload],
        baseRules()
      )
      expect(closed.code).toBe(125)
      // (b) status fd open read-only
      const readOnly = openSync('/dev/null', 'r')
      try {
        const ro = await runWithStatusFd(
          readOnly,
          applyArgs(payload),
          baseRules()
        )
        expect(ro.code).toBe(125)
      } finally {
        closeSync(readOnly)
      }
      // (c) the same descriptor for status and rules
      const alias = await run(
        ['--status-fd', '4', '--rules-fd', '4', '--', ...payload],
        baseRules()
      )
      expect(alias.code).toBe(125)
      expect(existsSync(sentinel)).toBe(false)
      // (d) a writable channel whose write fails (ENOSPC): no proof, no payload
      const full = openSync('/dev/full', 'w')
      try {
        const nospace = await runWithStatusFd(
          full,
          applyArgs(payload),
          baseRules()
        )
        expect(nospace.code).toBe(125)
      } finally {
        closeSync(full)
      }
      expect(existsSync(sentinel)).toBe(false)
      // healthy control: the same payload runs when the channel works
      const healthy = await run(applyArgs(payload), baseRules())
      expect(JSON.parse(healthy.status)).toMatchObject({ applied: true })
      expect(existsSync(sentinel)).toBe(true)
    })

    const python = existsSync('/usr/bin/python3')
    const pyArgs = (code: string, ...extra: string[]) =>
      applyArgs(['/usr/bin/python3', '-I', '-c', code, ...extra])

    it.skipIf(!python)(
      'review P3: TCP bind is denied when the ABI handles the network',
      async () => {
        const probe = JSON.parse(
          (await run(['--probe', '--status-fd', '3'])).status
        )
        if (probe.abi < 4) return
        const r = await run(
          pyArgs(
            "import socket,sys\ns=socket.socket()\ntry:\n s.bind(('127.0.0.1',0))\nexcept PermissionError:\n sys.exit(7)\nsys.exit(0)"
          ),
          baseRules()
        )
        expect(r.code).toBe(7)
      }
    )

    it.skipIf(!python)(
      'review P3: a signal to a process outside the domain is denied (ABI ≥ 6)',
      async () => {
        const probe = JSON.parse(
          (await run(['--probe', '--status-fd', '3'])).status
        )
        if (probe.abi < 6) return
        const target = spawn('/bin/sleep', ['30'], { stdio: 'ignore' })
        try {
          const r = await run(
            pyArgs(
              'import os,signal,sys\ntry:\n os.kill(int(sys.argv[1]), signal.SIGUSR1)\nexcept PermissionError:\n sys.exit(7)\nsys.exit(0)',
              String(target.pid)
            ),
            baseRules()
          )
          expect(r.code).toBe(7)
          // control: the target is still alive (SIGUSR1 would have killed sleep)
          expect(target.exitCode).toBeNull()
        } finally {
          target.kill('SIGKILL')
        }
      }
    )

    it.skipIf(!python)(
      'review P3: an abstract UNIX socket outside the domain is unreachable (ABI ≥ 6)',
      async () => {
        const probe = JSON.parse(
          (await run(['--probe', '--status-fd', '3'])).status
        )
        if (probe.abi < 6) return
        const name = `cvg-x02-${process.pid}-${Date.now()}`
        const server: Server = createServer((c) => c.end())
        await new Promise<void>((ok) =>
          server.listen({ path: `\0${name}` }, ok)
        )
        try {
          const r = await run(
            pyArgs(
              'import socket,sys\ns=socket.socket(socket.AF_UNIX)\ntry:\n s.connect("\\0"+sys.argv[1])\nexcept PermissionError:\n sys.exit(7)\nsys.exit(0)',
              name
            ),
            baseRules()
          )
          expect(r.code).toBe(7)
        } finally {
          await new Promise<void>((ok) => server.close(() => ok()))
        }
      }
    )
  }
)
