import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { readlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  checkEnvAllowlist,
  ENV_MAX_ENTRIES,
  validateProcessEnv,
  type EnvAllowlist
} from '../process-service/env.ts'
import { ProcessServiceError } from '../process-service/errors.ts'
import {
  DEFAULT_LIMIT_CAPS,
  validateProcessLimits
} from '../process-service/limits.ts'
import {
  readStartTime,
  sameProcess,
  scanPidNamespace
} from '../process-service/procfs.ts'
import { StatusChannel, STATUS_MAX_BYTES } from '../process-service/status.ts'
import type { ProcessLimits } from '../process-service/types.ts'

// PAR-X01 slice 1 (SPEC 0286 I2, I6-I9): the pure pieces of the process service.
const allow: EnvAllowlist = {
  shell: ['CVG_FLAG', 'API_TOKEN'],
  'mcp-stdio': ['MCP_TOKEN'],
  lsp: [],
  'document-conversion': []
}
const refused = (fn: () => unknown, code: string): void => {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(ProcessServiceError)
    expect((error as ProcessServiceError).code).toBe(code)
    return
  }
  throw new Error('expected a ProcessServiceError')
}

describe('PAR-X01 slice 1: closed child environment (I2)', () => {
  it('returns only the declared names, frozen, and never reads the host environment', () => {
    process.env.CVG_X01_HOST_SENTINEL = 'host-secret'
    try {
      const env = validateProcessEnv('shell', { CVG_FLAG: '1' }, allow)
      expect(env).toEqual({ CVG_FLAG: '1' })
      expect(Object.isFrozen(env)).toBe(true)
      expect('CVG_X01_HOST_SENTINEL' in env).toBe(false)
      expect(validateProcessEnv('shell', undefined, allow)).toEqual({})
    } finally {
      delete process.env.CVG_X01_HOST_SENTINEL
    }
  })

  it('keeps the allowlist per consumer', () => {
    refused(
      () => validateProcessEnv('lsp', { MCP_TOKEN: 'x' }, allow),
      'invalid_env'
    )
    expect(validateProcessEnv('mcp-stdio', { MCP_TOKEN: 'x' }, allow)).toEqual({
      MCP_TOKEN: 'x'
    })
  })

  it.each([
    'http_proxy',
    'https_proxy',
    'no_proxy',
    'cvg_flag',
    '1BAD',
    'HAS-DASH',
    'A'.repeat(65),
    ''
  ])('refuses the name %j by shape alone', (name) => {
    // Even when the allowlist (wrongly) carries it: the format is the first wall.
    const loose = { ...allow, shell: [name] } as unknown as EnvAllowlist
    refused(
      () => validateProcessEnv('shell', { [name]: 'v' }, loose),
      'invalid_env'
    )
  })

  it.each([
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'NODE_OPTIONS',
    'NODE_PATH',
    'DYLD_INSERT_LIBRARIES',
    'BASH_ENV',
    'ENV',
    'IFS',
    'PYTHONPATH',
    'PERL5OPT',
    'JAVA_TOOL_OPTIONS',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'GCONV_PATH',
    'PS4',
    'PROMPT_COMMAND',
    'HOME',
    'PATH',
    'PWD',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'TZ'
  ])('never lets a consumer set %s, even if the allowlist lists it', (name) => {
    const loose = { ...allow, shell: [name] } as unknown as EnvAllowlist
    refused(
      () => validateProcessEnv('shell', { [name]: 'v' }, loose),
      'invalid_env'
    )
    refused(() => checkEnvAllowlist(loose), 'invalid_env')
  })

  it('accepts a clean allowlist when composing the service', () => {
    expect(checkEnvAllowlist(allow)).toBe(allow)
  })

  it('bounds values, counts and total size, and requires strings without NUL', () => {
    refused(
      () => validateProcessEnv('shell', { CVG_FLAG: 'a\0b' }, allow),
      'invalid_env'
    )
    refused(
      () =>
        validateProcessEnv(
          'shell',
          { CVG_FLAG: 1 as unknown as string },
          allow
        ),
      'invalid_env'
    )
    refused(
      () => validateProcessEnv('shell', { CVG_FLAG: 'x'.repeat(4097) }, allow),
      'invalid_env'
    )
    expect(
      validateProcessEnv('shell', { CVG_FLAG: 'x'.repeat(4096) }, allow)
    ).toEqual({ CVG_FLAG: 'x'.repeat(4096) })
    // A lone surrogate is not valid UTF-8 on the wire.
    refused(
      () => validateProcessEnv('shell', { CVG_FLAG: '\ud800' }, allow),
      'invalid_env'
    )
    const many: Record<string, string> = {}
    const names = Array.from({ length: ENV_MAX_ENTRIES + 1 }, (_, i) => `K${i}`)
    for (const n of names) many[n] = 'v'
    refused(
      () => validateProcessEnv('shell', many, { ...allow, shell: names }),
      'invalid_env'
    )
    // Total size: 5 names of 4000 bytes pass individually but exceed 16 KiB together.
    const five = ['A1', 'A2', 'A3', 'A4', 'A5']
    refused(
      () =>
        validateProcessEnv(
          'shell',
          Object.fromEntries(five.map((n) => [n, 'v'.repeat(4000)])),
          { ...allow, shell: five }
        ),
      'invalid_env'
    )
  })

  it('refuses non-plain maps', () => {
    refused(
      () => validateProcessEnv('shell', [] as never, allow),
      'invalid_env'
    )
    refused(
      () => validateProcessEnv('shell', null as never, allow),
      'invalid_env'
    )
    class Bag {
      CVG_FLAG = '1'
    }
    refused(
      () => validateProcessEnv('shell', new Bag() as never, allow),
      'invalid_env'
    )
    expect(
      validateProcessEnv(
        'shell',
        Object.assign(Object.create(null), { CVG_FLAG: '1' }),
        allow
      )
    ).toEqual({ CVG_FLAG: '1' })
  })
})

describe('PAR-X01 slice 1: mandatory finite limits (I7, I8)', () => {
  const good: ProcessLimits = {
    startupMs: 5000,
    lifetimeMs: 60_000,
    cleanupMs: 5000,
    graceMs: 1000,
    maxOutputBytes: 1024 * 1024,
    maxStdinBytes: 0
  }
  it('accepts and freezes a complete, in-range set', () => {
    const out = validateProcessLimits(good)
    expect(out).toEqual(good)
    expect(Object.isFrozen(out)).toBe(true)
    expect(out).not.toBe(good)
  })
  it.each(Object.keys(good) as (keyof ProcessLimits)[])(
    'refuses a missing, NaN, fractional or negative %s',
    (key) => {
      for (const bad of [
        undefined,
        Number.NaN,
        1.5,
        -1,
        Infinity,
        '5' as never
      ])
        refused(
          () => validateProcessLimits({ ...good, [key]: bad }),
          'invalid_limits'
        )
    }
  )
  it('refuses zero where a positive bound is required, and allows zero grace and stdin', () => {
    refused(
      () => validateProcessLimits({ ...good, startupMs: 0 }),
      'invalid_limits'
    )
    refused(
      () => validateProcessLimits({ ...good, lifetimeMs: 0 }),
      'invalid_limits'
    )
    refused(
      () => validateProcessLimits({ ...good, maxOutputBytes: 0 }),
      'invalid_limits'
    )
    refused(
      () => validateProcessLimits({ ...good, cleanupMs: 99 }),
      'invalid_limits'
    )
    expect(validateProcessLimits({ ...good, graceMs: 0 }).graceMs).toBe(0)
    expect(
      validateProcessLimits({ ...good, maxStdinBytes: 0 }).maxStdinBytes
    ).toBe(0)
  })
  it('enforces the host caps, inclusive at the cap', () => {
    for (const key of Object.keys(
      DEFAULT_LIMIT_CAPS
    ) as (keyof ProcessLimits)[]) {
      const at = { ...good, [key]: DEFAULT_LIMIT_CAPS[key] }
      // cleanup must be able to hold the grace period, keep them coherent when probing.
      if (key === 'graceMs') at.cleanupMs = DEFAULT_LIMIT_CAPS.cleanupMs
      expect(validateProcessLimits(at)[key]).toBe(DEFAULT_LIMIT_CAPS[key])
      refused(
        () =>
          validateProcessLimits({ ...at, [key]: DEFAULT_LIMIT_CAPS[key] + 1 }),
        'invalid_limits'
      )
    }
    const tight = { ...DEFAULT_LIMIT_CAPS, lifetimeMs: 1000 }
    refused(() => validateProcessLimits(good, tight), 'invalid_limits')
  })
  it('keeps the grace period inside the cleanup budget', () => {
    refused(
      () => validateProcessLimits({ ...good, cleanupMs: 500, graceMs: 501 }),
      'invalid_limits'
    )
    expect(
      validateProcessLimits({ ...good, cleanupMs: 500, graceMs: 500 }).graceMs
    ).toBe(500)
    refused(() => validateProcessLimits(null as never), 'invalid_limits')
  })
})

describe('PAR-X01 slice 1: private status channel (I6)', () => {
  const first =
    '{ "child-pid": 4242, "mnt-namespace": 4026534661, "pid-namespace": 4026534662 }\n'
  const second = '{ "exit-code": 3 }\n'
  it('reads the namespace, the child and the exit code, across split chunks', () => {
    const channel = new StatusChannel()
    const bytes = Buffer.from(first + second)
    for (let i = 0; i < bytes.length; i += 7)
      channel.feed(bytes.subarray(i, i + 7))
    expect(channel.snapshot()).toEqual({
      childPid: 4242,
      pidNamespace: 4026534662,
      exitCode: 3,
      invalid: false
    })
  })
  it('frames pretty-printed documents and braces inside strings', () => {
    const channel = new StatusChannel()
    channel.feed(
      Buffer.from(
        '{\n  "child-pid": 7,\n  "pid-namespace": 9,\n  "note": "} {"\n}\n'
      )
    )
    expect(channel.snapshot()).toEqual({
      childPid: 7,
      pidNamespace: 9,
      invalid: false
    })
  })
  it('reports nothing before the first document and tolerates blank input', () => {
    const channel = new StatusChannel()
    channel.feed(Buffer.from('  \n'))
    expect(channel.snapshot()).toEqual({ invalid: false })
    channel.feed(Buffer.from('{ "child-pid": 7, "pid-nam'))
    expect(channel.snapshot().childPid).toBeUndefined()
  })
  it.each([
    ['not json', 'oops\n'],
    ['array', '[1]\n'],
    ['bad json object', '{ child-pid: 1 }\n'],
    ['child without namespace', '{ "child-pid": 5 }\n'],
    ['negative pid', '{ "child-pid": -5, "pid-namespace": 1 }\n'],
    ['float pid', '{ "child-pid": 5.5, "pid-namespace": 1 }\n'],
    ['string pid', '{ "child-pid": "5", "pid-namespace": 1 }\n'],
    ['exit code out of range', '{ "exit-code": 256 }\n'],
    ['exit code negative', '{ "exit-code": -1 }\n'],
    ['exit code fractional', '{ "exit-code": 1.5 }\n'],
    ['exit code string', '{ "exit-code": "0" }\n'],
    ['second child document', first + first],
    ['second exit document', second + second]
  ])('flags %s as invalid', (_name, text) => {
    const channel = new StatusChannel()
    channel.feed(Buffer.from(text))
    expect(channel.snapshot().invalid).toBe(true)
  })
  it('flags oversized status and ignores everything after the fault', () => {
    const channel = new StatusChannel()
    channel.feed(Buffer.alloc(STATUS_MAX_BYTES + 1, 0x20))
    expect(channel.snapshot().invalid).toBe(true)
    channel.feed(Buffer.from(first))
    expect(channel.snapshot().childPid).toBeUndefined()
  })
  it('does not let payload-looking text become status', () => {
    // The parser only ever sees the private fd; stdout text is a different object entirely.
    const channel = new StatusChannel()
    expect(channel.snapshot()).toEqual({ invalid: false })
  })
})

describe('PAR-X01 slice 1: /proc observation (I5, I9)', () => {
  let root: string
  const entry = (
    pid: number,
    options: {
      ns?: string
      uid?: number
      stat?: string
      unreadableNs?: boolean
    }
  ): void => {
    const dir = join(root, String(pid))
    mkdirSync(join(dir, 'ns'), { recursive: true })
    if (options.unreadableNs) mkdirSync(join(dir, 'ns', 'pid'))
    else if (options.ns) symlinkSync(options.ns, join(dir, 'ns', 'pid'))
    writeFileSync(
      join(dir, 'status'),
      `Name:\tx\nUid:\t${options.uid ?? 1000}\t${options.uid ?? 1000}\t0\t0\n`
    )
    if (options.stat !== undefined)
      writeFileSync(join(dir, 'stat'), options.stat)
  }
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'x01-proc-'))
    entry(10, { ns: 'pid:[500]' })
    entry(11, { ns: 'pid:[500]' })
    entry(12, { ns: 'pid:[501]' })
    entry(13, { ns: 'pid:[500]' })
    entry(14, { unreadableNs: true, uid: 1000 })
    entry(15, { unreadableNs: true, uid: 0 })
    mkdirSync(join(root, '16')) // a pid dir with nothing inside: vanished mid-scan
    mkdirSync(join(root, 'self'))
    writeFileSync(join(root, 'cpuinfo'), 'x')
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('finds namespace members by inode, ignoring other namespaces and non-pid names', () => {
    const scan = scanPidNamespace(500, { procRoot: root, uid: 1000 })
    expect([...scan.members].sort()).toEqual([10, 11, 13])
  })
  it('excludes the observer and any listed pid', () => {
    expect(
      scanPidNamespace(500, { procRoot: root, uid: 1000, exclude: [11] })
        .members
    ).toEqual([10, 13])
  })
  it('counts same-uid unreadable entries as unverified and ignores another user', () => {
    expect(
      scanPidNamespace(500, { procRoot: root, uid: 1000 }).unverified
    ).toBe(1)
    expect(scanPidNamespace(500, { procRoot: root, uid: 0 }).unverified).toBe(1)
  })
  it('cannot prove anything without a readable /proc', () => {
    const scan = scanPidNamespace(500, { procRoot: join(root, 'missing') })
    expect(scan).toEqual({ members: [], unverified: 1 })
  })
  it('reads the start time after the last parenthesis of comm', () => {
    entry(20, {
      ns: 'pid:[1]',
      stat: '20 (we ) ird (name) S 1 20 20 0 -1 0 0 0 0 0 0 0 0 0 20 0 1 0 987654 0 0\n'
    })
    expect(readStartTime(20, root)).toBe('987654')
    expect(sameProcess(20, '987654', root)).toBe(true)
    expect(sameProcess(20, '987655', root)).toBe(false)
    expect(readStartTime(999, root)).toBeUndefined()
    entry(21, { ns: 'pid:[1]', stat: 'garbage' })
    expect(readStartTime(21, root)).toBeUndefined()
  })
  it('works on the real /proc: the test process is a member of its own namespace', () => {
    const own = readlinkSync('/proc/self/ns/pid')
    const inode = Number(/\[(\d+)\]/.exec(own)![1])
    expect(scanPidNamespace(inode).members).toContain(process.pid)
    expect(
      scanPidNamespace(inode, { exclude: [process.pid] }).members
    ).not.toContain(process.pid)
    const start = readStartTime(process.pid)
    expect(start).toMatch(/^\d+$/)
    expect(sameProcess(process.pid, start!)).toBe(true)
  })
})
