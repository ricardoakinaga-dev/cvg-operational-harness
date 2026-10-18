// @vitest-environment node
import ts from 'typescript'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import {
  COMPLETE_NODE,
  completeReadiness,
  completeArgv,
  completeChildConfig,
  completeCollector,
  completeProfiles,
  startCompleteChild,
  assignedService,
  observeCompleteChild,
  privateEnvironment,
  ownedPath,
  privateBytes,
  assignedResource,
  inspectCompleteResource,
  stopCompleteChildren,
  cleanupCompleteChildren,
  withCompleteCleanup,
  completeCleanupError,
  collectCompleteDiagnostics,
  projectCompleteDiagnostic
} from './fixtures/complete-process-support.ts'

const virtual = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  dirs: new Set<string>(),
  sockets: new Set<string>()
}))
vi.mock('node:fs/promises', async (original) => {
  const native = await original<typeof import('node:fs/promises')>()
  const stat = (directory = false, socket = false, size = 0) => ({
    uid: process.getuid!(),
    mode: directory ? 0o40700 : 0o100600,
    size,
    isFile: () => !directory && !socket,
    isDirectory: () => directory,
    isSocket: () => socket,
    isSymbolicLink: () => false
  })
  return {
    ...native,
    rm: vi.fn(native.rm),
    lstat: vi.fn(async (path: string) =>
      virtual.files.has(path)
        ? stat(false, false, virtual.files.get(path)!.length)
        : virtual.dirs.has(path)
          ? stat(true)
          : virtual.sockets.has(path)
            ? stat(false, true)
            : native.lstat(path)
    ),
    realpath: vi.fn(async (path: string) =>
      virtual.files.has(path) ||
      virtual.dirs.has(path) ||
      virtual.sockets.has(path)
        ? path
        : native.realpath(path)
    ),
    open: vi.fn(async (path: string, ...args: unknown[]) => {
      if (!virtual.files.has(path))
        return Reflect.apply(native.open, native, [path, ...args])
      const bytes = virtual.files.get(path)!
      return {
        stat: async () => stat(false, false, bytes.length),
        close: async () => {},
        readFile: async () => bytes,
        read: async (buffer: Buffer) => {
          bytes.copy(buffer)
          return { bytesRead: bytes.length, buffer }
        }
      }
    }),
    mkdtemp: vi.fn(async (prefix: string) =>
      native.mkdtemp(
        prefix.startsWith(
          '/tmp/cvg-pare100-exec-20261014-6az3hlay/spec0224-build/'
        )
          ? join(tmpdir(), 'mock-inspect-')
          : prefix
      )
    )
  }
})
vi.mock('node:child_process', async (original) => {
  const native = await original<typeof import('node:child_process')>()
  return { ...native, execFile: vi.fn(), spawn: vi.fn(native.spawn) }
})
const homes: string[] = []
const children: ReturnType<typeof observeCompleteChild>[] = []
afterEach(async () => {
  await Promise.allSettled(children.splice(0).map((c) => c.stop()))
  for (const home of homes.splice(0))
    await fs.rm(home, { recursive: true, force: true })
  virtual.files.clear()
  virtual.dirs.clear()
  virtual.sockets.clear()
  vi.clearAllMocks()
})
async function scratch() {
  const root = await fs.mkdtemp(join(tmpdir(), 'complete-support-'))
  homes.push(root)
  return root
}
const scripts = {
  normal:
    'process.stdout.write(Buffer.from([0,240,159,153,130])); process.stderr.write("diagnostic")',
  exact:
    'process.stdout.write(Buffer.alloc(1048576,120)); process.stderr.write(Buffer.alloc(1048576,121))',
  stdoutOverflow:
    'process.stdout.write("READY PASS\\n"); process.stdout.write(Buffer.alloc(1048576,120)); setInterval(()=>{},1000)',
  stderrOverflow:
    'process.stderr.write(Buffer.alloc(1048577,120)); setInterval(()=>{},1000)',
  readyTimer: 'process.stdout.write("READY\\n"); setInterval(()=>{},1000)',
  refuse:
    'process.on("SIGTERM",()=>process.stderr.write("refused")); process.stdout.write("READY\\n"); setInterval(()=>{},1000)',
  failed: 'process.stdout.write("PASS\\n"); process.exitCode=7'
} as const
async function launch(program: keyof typeof scripts, options = {}) {
  const root = await scratch(),
    { home, env } = await privateEnvironment(root)
  const proc = spawn(COMPLETE_NODE, ['-e', scripts[program]], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const owned = observeCompleteChild(proc, home, {
    maxRuntimeMs: 5000,
    exitTimeoutMs: 100,
    termGraceMs: 100,
    killGraceMs: 1000,
    ...options
  })
  children.push(owned)
  return { ...owned, home }
}
async function ready(proc: ChildProcess) {
  await new Promise<void>((yes) => proc.stdout!.once('data', () => yes()))
}
it('S01/S02: private allowlist has no ambient Node, provider, PG, npm or Docker fields', async () => {
  const root = await scratch(),
    { home, env } = await privateEnvironment(root)
  const hostileParent = {
    NODE_OPTIONS: '--require forbidden',
    NODE_PATH: 'untrusted',
    PGPASSWORD: 'synthetic',
    OPENAI_API_KEY: 'synthetic',
    DOCKER_CONTEXT: 'peer'
  }
  const unsafe = { ...hostileParent }
  expect(unsafe.NODE_OPTIONS).toBeDefined() // original spread's discriminating red control, never executed
  for (const key of Object.keys(hostileParent)) expect(env[key]).toBeUndefined()
  expect(Object.keys(env).sort()).toEqual(
    [
      'PATH',
      'HOME',
      'TMPDIR',
      'TMP',
      'TEMP',
      'XDG_CONFIG_HOME',
      'XDG_CACHE_HOME',
      'XDG_DATA_HOME',
      'XDG_STATE_HOME',
      'LANG',
      'TZ',
      'NODE_ENV',
      'CI'
    ].sort()
  )
  for (const key of [
    'HOME',
    'TMPDIR',
    'TMP',
    'TEMP',
    'XDG_CONFIG_HOME',
    'XDG_CACHE_HOME',
    'XDG_DATA_HOME',
    'XDG_STATE_HOME'
  ]) {
    expect(env[key]).toMatch(new RegExp('^' + home))
    expect((await fs.stat(env[key]!)).mode & 0o777).toBe(0o700)
  }
})
it('S01: complete successful raw bytes, close/PID absence and HOME deletion', async () => {
  const c = await launch('normal')
  expect(await c.done).toEqual({ code: 0, signal: null })
  expect(c.output.bytes('stdout')).toEqual(Buffer.from([0, 240, 159, 153, 130]))
  expect(c.output.bytes('stderr').toString()).toBe('diagnostic')
  expect(c.proc.stdout!.closed).toBe(true)
  expect(() => process.kill(c.proc.pid!, 0)).toThrow(/ESRCH/)
  await expect(fs.stat(c.home)).rejects.toMatchObject({ code: 'ENOENT' })
  await c.stop()
})
it('S03: finite roles and native loader difference, unknown role/profile reject before launch', () => {
  for (const profile of Object.keys(
    completeProfiles
  ) as (keyof typeof completeProfiles)[]) {
    for (const role of completeProfiles[profile].roles) {
      const argv = completeArgv(profile, role, '/owned/config', '/physical/W')
      expect(argv.at(-1)).toBe(completeProfiles[profile].target)
      expect(argv.includes('--configLoader')).toBe(
        profile === 'bound-admission'
      )
    }
    expect(() => completeArgv(profile, 'unknown', '/c', '/w')).toThrow(/role/)
  }
  expect(() =>
    completeArgv('unknown' as 'store-restart', 'writer', '/c', '/w')
  ).toThrow()
  const config = completeChildConfig('store-restart', '/w', '/s')
  const data = JSON.parse(config.slice('export default '.length))
  expect(data.test).toEqual({
    environment: 'node',
    pool: 'threads',
    maxWorkers: 1,
    fileParallelism: false,
    include: [completeProfiles['store-restart'].target]
  })
})
it('S04: owned physical regular files accept; prefix/traversal/file and ancestor symlinks/modes reject', async () => {
  const root = await scratch(),
    file = join(root, 'input.json')
  await fs.writeFile(file, '{}', { mode: 0o600 })
  expect((await privateBytes(root, file)).toString()).toBe('{}')
  await expect(ownedPath(root, file, 'file', true)).rejects.toThrow(/exists/)
  await expect(ownedPath(root, root + '-peer/file', 'file')).rejects.toThrow(
    /outside/
  )
  await expect(ownedPath(root, root + '/../file', 'file')).rejects.toThrow(
    /outside/
  )
  const link = join(root, 'link')
  await fs.symlink(file, link)
  await expect(privateBytes(root, link)).rejects.toThrow(/Symlink/)
  const dir = join(root, 'dir')
  await fs.mkdir(dir, { mode: 0o700 })
  await fs.symlink(dir, join(root, 'alias'))
  await fs.writeFile(join(dir, 'x'), '{}', { mode: 0o600 })
  await expect(privateBytes(root, join(root, 'alias/x'))).rejects.toThrow(
    /Symlink/
  )
  await fs.chmod(file, 0o644)
  await expect(privateBytes(root, file)).rejects.toThrow(/mode/)
  await fs.chmod(file, 0o600)
  await fs.writeFile(file, Buffer.alloc(1048577))
  await expect(privateBytes(root, file)).rejects.toThrow(/bounds/)
})
it('S05: exact stdout/stderr/combined limits succeed using real harmless Node writes', async () => {
  const c = await launch('exact')
  expect(await c.done).toEqual({ code: 0, signal: null })
  expect(c.output.bytes('stdout').length).toBe(1048576)
  expect(c.output.bytes('stderr').length).toBe(1048576)
})
it.each(['stdoutOverflow', 'stderrOverflow'] as const)(
  'S05/S06: %s latches, joins and rejects apparent READY/PASS prefix',
  async (program) => {
    const c = await launch(program)
    await expect(c.done).rejects.toThrow(/OUTPUT_LIMIT/)
    expect(() => c.output.bytes('stdout')).toThrow(/partial/)
    expect(c.proc.stdout!.closed).toBe(true)
    await expect(fs.stat(c.home)).rejects.toMatchObject({ code: 'ENOENT' })
  }
)
it('S07: split UTF8/NUL/markers preserve exact bytes; original per-chunk decoding is lossy', () => {
  const bytes = Buffer.from('READY\u0000🙂FINISHED'),
    limits: Error[] = []
  const c = completeCollector((e) => limits.push(e))
  let old = ''
  for (const byte of bytes) {
    const part = Buffer.from([byte])
    c.push('stdout', part)
    old += part.toString()
  }
  expect(c.bytes('stdout')).toEqual(bytes)
  expect(old).not.toBe(bytes.toString())
  expect(limits).toEqual([])
  c.push('stderr', Buffer.alloc(1048576))
  c.push('stdout', Buffer.alloc(1048576 - bytes.length))
  expect(c.bytes('stdout').length).toBe(1048576)
  c.push('stderr', Buffer.alloc(1))
  expect(limits).toHaveLength(1)
  expect(() => c.bytes('stdout')).toThrow(/OUTPUT_LIMIT/)
})
it('S08/S10: READY does not clear independent watchdog even if parent abandons done', async () => {
  const c = await launch('readyTimer', { maxRuntimeMs: 200 })
  await ready(c.proc)
  await new Promise((yes) => c.proc.once('close', yes))
  await expect(c.done).rejects.toThrow(/maxRuntimeMs/)
  expect(() => process.kill(c.proc.pid!, 0)).toThrow(/ESRCH/)
})
it('S09: intentional SIGKILL remains exact; normal nonzero remains observable', async () => {
  const c = await launch('readyTimer')
  await ready(c.proc)
  expect(c.proc.kill('SIGKILL')).toBe(true)
  expect(await c.done).toEqual({ code: null, signal: 'SIGKILL' })
  const failed = await launch('failed')
  expect(await failed.done).toEqual({ code: 7, signal: null })
})
it('S09/S10: TERM refusal escalates and concurrent stop/done join without losing bytes', async () => {
  const c = await launch('refuse')
  await ready(c.proc)
  const results = await Promise.all([c.stop(), c.stop(), c.done])
  expect(results).toEqual(Array(3).fill({ code: null, signal: 'SIGKILL' }))
  expect(c.output.bytes('stderr').toString()).toContain('refused')
})
it('S09: asynchronous ENOENT preserves original cause and joins before removing HOME', async () => {
  const root = await scratch(),
    { home, env } = await privateEnvironment(root)
  // Exact allowed executable, deliberately absent cwd: no arbitrary executable seam.
  const proc = spawn(COMPLETE_NODE, ['-e', scripts.normal], {
    cwd: join(root, 'absent'),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const c = observeCompleteChild(proc, home, {
    maxRuntimeMs: 1000,
    termGraceMs: 100,
    killGraceMs: 100,
    exitTimeoutMs: 100
  })
  children.push(c)
  await expect(c.done).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(fs.stat(home)).rejects.toMatchObject({ code: 'ENOENT' })
})
function fakeChild() {
  const child = new EventEmitter() as ChildProcess
  Object.assign(child, {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true)
  })
  return child
}
it('S11/S14: exit without close fails boundedly, preserves HOME and primary plus join error', async () => {
  const root = await scratch(),
    { home } = await privateEnvironment(root),
    proc = fakeChild()
  const c = observeCompleteChild(proc, home, {
    maxRuntimeMs: 100,
    exitTimeoutMs: 30,
    termGraceMs: 30,
    killGraceMs: 30
  })
  proc.emit('exit', 0, null)
  c.fail(new Error('synthetic observer failure'))
  await expect(c.done).rejects.toMatchObject({
    cause: { message: 'synthetic observer failure' }
  })
  expect((await fs.stat(home)).isDirectory()).toBe(true)
  proc.emit('close', 0, null) // no real descendants; finish fixture without claiming joined result
})
it('S14: join-all attempts every child, retains primary and blocks subsequent DB cleanup', async () => {
  const calls: string[] = [],
    primary = new Error('assertion failed')
  await expect(
    stopCompleteChildren(
      [
        {
          stop: async () => {
            calls.push('one')
            throw new Error('join')
          }
        },
        {
          stop: async () => {
            calls.push('two')
          }
        }
      ],
      primary
    )
  ).rejects.toMatchObject({
    cause: primary,
    errors: [primary, expect.any(Error)]
  })
  expect(calls.sort()).toEqual(['one', 'two'])
})

it('S14: a failure arriving during HOME disposal rejects both terminal observers', async () => {
  const root = await scratch(),
    { home } = await privateEnvironment(root)
  const proc = fakeChild()
  const owned = observeCompleteChild(proc, home, {
    maxRuntimeMs: 1000,
    exitTimeoutMs: 50,
    termGraceMs: 20,
    killGraceMs: 20
  })
  let enter!: () => void, release!: () => void
  const entered = new Promise<void>((yes) => {
    enter = yes
  })
  const pending = new Promise<void>((yes) => {
    release = yes
  })
  const nativeRm = vi.mocked(fs.rm).getMockImplementation()!
  vi.mocked(fs.rm).mockImplementationOnce(async (path, options) => {
    expect(path).toBe(home)
    enter()
    await pending
    return nativeRm(path, options)
  })
  proc.emit('exit', 0, null)
  proc.emit('close', 0, null)
  await entered
  const primary = new Error('late observer failure')
  owned.fail(primary)
  release()
  await expect(owned.done).rejects.toBe(primary)
  await expect(owned.finish()).rejects.toBe(primary)
})

it('S14: confirmed close cancels public readiness deadline while HOME disposal is pending', async () => {
  vi.useFakeTimers()
  let release: (() => void) | undefined
  try {
    const root = await scratch(),
      { home } = await privateEnvironment(root)
    const proc = fakeChild()
    const owned = observeCompleteChild(proc, home, {
      maxRuntimeMs: 75000,
      exitTimeoutMs: 5000,
      termGraceMs: 1000,
      killGraceMs: 2000
    })
    const readiness = completeReadiness(owned, 'public-restart')
    proc.stdout!.emit('data', Buffer.from('PUBLIC224_READY'))
    expect(await readiness).toBe('ready')
    await vi.advanceTimersByTimeAsync(44999)
    let enter!: () => void
    const entered = new Promise<void>((yes) => {
      enter = yes
    })
    const pending = new Promise<void>((yes) => {
      release = yes
    })
    const nativeRm = vi.mocked(fs.rm).getMockImplementation()!
    vi.mocked(fs.rm).mockImplementationOnce(async (path, options) => {
      enter()
      await pending
      return nativeRm(path, options)
    })
    proc.emit('exit', 0, null)
    proc.emit('close', 0, null)
    await entered
    await vi.advanceTimersByTimeAsync(1)
    release!()
    expect(await owned.done).toEqual({ code: 0, signal: null })
    expect(await owned.finish()).toEqual({ code: 0, signal: null })
  } finally {
    release?.()
    vi.useRealTimers()
  }
})

it('S14: a public child still open at readiness expiry fails and joins', async () => {
  vi.useFakeTimers()
  try {
    const root = await scratch(),
      { home } = await privateEnvironment(root),
      proc = fakeChild()
    proc.kill = (() => {
      queueMicrotask(() => {
        proc.emit('exit', null, 'SIGTERM')
        proc.emit('close', null, 'SIGTERM')
      })
      return true
    }) as typeof proc.kill
    const owned = observeCompleteChild(proc, home, {
      maxRuntimeMs: 75000,
      exitTimeoutMs: 5000,
      termGraceMs: 1000,
      killGraceMs: 2000
    })
    const readiness = completeReadiness(owned, 'public-restart')
    proc.stdout!.emit('data', Buffer.from('PUBLIC224_READY'))
    expect(await readiness).toBe('ready')
    await vi.advanceTimersByTimeAsync(45000)
    await expect(owned.done).rejects.toThrow('Child readiness timeout')
    await expect(fs.stat(home)).rejects.toMatchObject({ code: 'ENOENT' })
  } finally {
    vi.useRealTimers()
  }
})

it('S14: successful join and every cleanup finish successfully', async () => {
  const events: string[] = []
  await cleanupCompleteChildren(
    [
      {
        stop: async () => {
          events.push('joined')
        }
      }
    ],
    [
      async () => {
        events.push('db')
      },
      async () => {
        events.push('pool')
      }
    ]
  )
  expect(events).toEqual(['joined', 'db', 'pool'])
})

it.each([new Error('primary assertion'), undefined])(
  'S14: primary %s and both cleanup errors survive with pool close attempted',
  async (error) => {
    const dbError = new Error('DB cleanup failed'),
      poolError = new Error('pool close failed'),
      events: string[] = []
    await expect(
      cleanupCompleteChildren(
        [
          {
            stop: async () => {
              events.push('joined')
            }
          }
        ],
        [
          async () => {
            events.push('db')
            throw dbError
          },
          async () => {
            events.push('pool')
            throw poolError
          }
        ],
        { error }
      )
    ).rejects.toMatchObject({
      cause: error,
      errors: [error, dbError, poolError]
    })
    expect(events).toEqual(['joined', 'db', 'pool'])
  }
)

it('S14: failed join preserves primary and forbids all resource cleanup', async () => {
  const primary = new Error('primary'),
    joinError = new Error('join'),
    events: string[] = []
  await expect(
    cleanupCompleteChildren(
      [
        {
          stop: async () => {
            throw joinError
          }
        }
      ],
      [
        async () => {
          events.push('db')
        },
        async () => {
          events.push('pool')
        }
      ],
      { error: primary }
    )
  ).rejects.toMatchObject({ cause: primary })
  expect(events).toEqual([])
})

// The assigned SPEC0224 runtime is entirely virtual in these unit tests:
// physicalPath walks every ancestor, so each directory from the claimed root
// up to the PARE100 runtime directory is a mocked private directory. The
// tests never depend on that /tmp directory existing on the host.
const PARE224_RUNTIME = '/tmp/cvg-pare100-exec-20261014-6az3hlay'
function assignment() {
  const root =
      '/tmp/cvg-pare100-exec-20261014-6az3hlay/spec0224-build/public-admission-postgres/builder-r1',
    resource = join(root, 'resource.json')
  const claimId = `PARE100-EXEC:BUILD-TEST-RESOURCE-HARDENING-0224:capacity:${root}`
  const r = {
    synthetic: true,
    exclusiveClaim: claimId,
    containerId: 'a'.repeat(64),
    containerName: '/cvg-pare100-224-pg',
    imageId: 'sha256:' + 'b'.repeat(64),
    schemaName: 'pare224_synthetic_r1',
    roleName: 'pare224_synthetic_r1_service',
    test_database_url:
      'postgresql://pare224:synthetic@127.0.0.1:54321/pare224_synthetic',
    hostPort: { HostIp: '127.0.0.1', HostPort: '54321' }
  }
  const bytes = Buffer.from(JSON.stringify(r)),
    docker = Buffer.from('mock executable bytes')
  const claim = {
    task: 'PARE100-EXEC:BUILD-TEST-RESOURCE-HARDENING-0224',
    kind: 'capacity',
    claimId,
    root,
    resource,
    resourceSHA256: createHash('sha256').update(bytes).digest('hex'),
    cwd: join(import.meta.dirname, '../../../..'),
    evidence: join(root, 'evidence'),
    containerId: r.containerId,
    containerName: r.containerName,
    imageId: r.imageId,
    port: '54321',
    database: 'pare224_synthetic',
    user: 'pare224',
    schema: r.schemaName,
    role: r.roleName,
    docker: '/usr/bin/docker',
    dockerSHA256: createHash('sha256').update(docker).digest('hex'),
    dockerHost: 'unix://' + join(root, 'docker.sock')
  }
  virtual.files.set(resource, bytes)
  virtual.files.set(
    join(root, 'complete-process-claim.json'),
    Buffer.from(JSON.stringify(claim))
  )
  virtual.files.set('/usr/bin/docker', docker)
  virtual.sockets.add(join(root, 'docker.sock'))
  for (let dir = root; dir.startsWith(PARE224_RUNTIME); dir = dirname(dir))
    virtual.dirs.add(dir)
  virtual.dirs.add(claim.evidence)
  return { root, resource, r, claim }
}
it('S13: exact mocked claim accepts; descriptor/claim mismatches reject before Docker spawn', async () => {
  const a = assignment()
  expect(
    (await assignedResource('capacity', a.resource, a.root)).resource
  ).toEqual(a.r)
  for (const mutation of [
    { synthetic: false },
    { exclusiveClaim: 'peer' },
    { containerId: 'c'.repeat(64) },
    { hostPort: { HostIp: '0.0.0.0', HostPort: '54321' } },
    { schemaName: 'peer' },
    { roleName: 'peer' },
    { imageId: 'sha256:' + 'c'.repeat(64) },
    {
      test_database_url:
        'postgresql://pare224:synthetic@localhost:54321/pare224_synthetic'
    },
    {
      test_database_url: 'postgresql://pare224:synthetic@127.0.0.1:54321/peer'
    },
    {
      test_database_url:
        'postgresql://peer:synthetic@127.0.0.1:54321/pare224_synthetic'
    }
  ]) {
    const bytes = Buffer.from(JSON.stringify({ ...a.r, ...mutation }))
    virtual.files.set(a.resource, bytes)
    virtual.files.set(
      join(a.root, 'complete-process-claim.json'),
      Buffer.from(
        JSON.stringify({
          ...a.claim,
          resourceSHA256: createHash('sha256').update(bytes).digest('hex')
        })
      )
    )
    await expect(
      assignedResource('capacity', a.resource, a.root)
    ).rejects.toThrow(/identity/)
  }
  expect(execFile).not.toHaveBeenCalled()
})
it.each([
  'good-object',
  'good-array',
  'timeout',
  'maxBuffer',
  'malformed',
  'prefix',
  'wrong-shape',
  'wrong-id',
  'nonzero',
  'no-callback'
] as const)(
  'S12: mocked native inspect %s with finite options and closed join',
  async (mode) => {
    const a = assignment()
    vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
      const [executable, argv, options, callback] = args as [
        string,
        string[],
        {
          timeout: number
          maxBuffer: number
          killSignal: string
          encoding: string
          env: NodeJS.ProcessEnv
        },
        (e: Error | null, b: Buffer) => void
      ]
      expect(executable).toBe('/usr/bin/docker')
      expect(argv).toEqual(
        mode === 'good-array'
          ? ['inspect', a.r.containerId]
          : ['inspect', '--format', '{{json .}}', a.r.containerId]
      )
      expect(options).toMatchObject({
        timeout: 5000,
        maxBuffer: 1048576,
        killSignal: 'SIGKILL',
        encoding: 'buffer',
        cwd: a.root
      })
      expect(options.env.NODE_OPTIONS).toBeUndefined()
      expect(options.env.DOCKER_HOST).toBe(a.claim.dockerHost)
      const child = fakeChild()
      queueMicrotask(() => {
        const object = {
          Id: a.r.containerId,
          Name: a.r.containerName,
          Image: a.r.imageId
        }
        const text =
          mode === 'good-array'
            ? JSON.stringify([object])
            : mode === 'malformed'
              ? '{'
              : mode === 'prefix'
                ? JSON.stringify(object) + 'garbage'
                : mode === 'wrong-shape'
                  ? JSON.stringify([object])
                  : mode === 'wrong-id'
                    ? JSON.stringify({ ...object, Id: 'peer' })
                    : JSON.stringify(object)
        child.emit('exit', mode === 'nonzero' ? 7 : 0, null)
        child.emit('close', mode === 'nonzero' ? 7 : 0, null)
        if (mode === 'no-callback') return
        callback(
          mode === 'timeout'
            ? Object.assign(new Error('native timeout'), { code: 'ETIMEDOUT' })
            : mode === 'maxBuffer'
              ? Object.assign(new Error('native maxBuffer'), {
                  code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
                })
              : null,
          Buffer.from(text)
        )
      })
      return child as ReturnType<typeof execFile>
    })
    const result = inspectCompleteResource(
      'capacity',
      a.resource,
      a.root,
      mode === 'good-array' ? 'array' : 'object'
    )
    if (mode.startsWith('good')) expect(JSON.parse(await result)).toBeTruthy()
    else await expect(result).rejects.toThrow()
    expect(execFile).toHaveBeenCalledTimes(1)
  }
)

function profileAssignment(profile: 'store-restart' | 'bound-admission') {
  const a = assignment()
  const claimId = `PARE100-EXEC:BUILD-TEST-RESOURCE-HARDENING-0224:${profile}:${a.root}`
  const resource = { ...a.r, exclusiveClaim: claimId }
  const bytes = Buffer.from(JSON.stringify(resource))
  const config = join(a.root, 'child.config.mjs')
  const configBytes = Buffer.from(
    completeChildConfig(profile, a.claim.cwd, a.root)
  )
  const claim = {
    ...a.claim,
    kind: profile,
    claimId,
    config,
    configSHA256: createHash('sha256').update(configBytes).digest('hex'),
    resourceSHA256: createHash('sha256').update(bytes).digest('hex'),
    service: join(a.root, 'service.json')
  }
  virtual.files.set(a.resource, bytes)
  virtual.files.set(config, configBytes)
  virtual.files.set(
    join(a.root, 'complete-process-claim.json'),
    Buffer.from(JSON.stringify(claim))
  )
  return { ...a, claim, config, configBytes }
}
it('S03: exact sealed config accepts; hash, pool, environment, include and executable-code tampering reject', async () => {
  const a = profileAssignment('store-restart')
  expect(
    (await assignedResource('store-restart', a.resource, a.root)).claim.config
  ).toBe(a.config)
  const path = join(a.root, 'complete-process-claim.json')
  for (const altered of [
    a.configBytes.toString().replace('threads', 'forks'),
    a.configBytes.toString().replace('node', 'jsdom'),
    a.configBytes
      .toString()
      .replace(completeProfiles['store-restart'].target, 'peer.test.ts'),
    a.configBytes.toString() + 'process.exit(0)',
    a.configBytes.toString().replace('"maxWorkers":1', '"maxWorkers":100')
  ]) {
    const bytes = Buffer.from(altered)
    virtual.files.set(a.config, bytes)
    virtual.files.set(
      path,
      Buffer.from(
        JSON.stringify({
          ...a.claim,
          configSHA256: createHash('sha256').update(bytes).digest('hex')
        })
      )
    )
    await expect(
      assignedResource('store-restart', a.resource, a.root)
    ).rejects.toThrow(/static config/)
  }
  virtual.files.set(a.config, a.configBytes)
  virtual.files.set(
    path,
    Buffer.from(JSON.stringify({ ...a.claim, configSHA256: '0'.repeat(64) }))
  )
  await expect(
    assignedResource('store-restart', a.resource, a.root)
  ).rejects.toThrow(/static config/)
})
it('S03/S02: exact finite launch uses sealed paths and allowlisted profile env; mocked child never runs app', async () => {
  const a = profileAssignment('store-restart'),
    dir = join(a.claim.evidence, 'run'),
    input = join(dir, 'input.json')
  virtual.dirs.add(dir)
  virtual.files.set(input, Buffer.from('{}'))
  vi.mocked(spawn).mockImplementationOnce((...args: unknown[]) => {
    const [executable, argv, options] = args as [
      string,
      string[],
      { env: NodeJS.ProcessEnv; cwd: string }
    ]
    expect(executable).toBe(COMPLETE_NODE)
    expect(argv).toEqual(
      completeArgv('store-restart', 'writer', a.config, a.claim.cwd)
    )
    expect(options.cwd).toBe(a.claim.cwd)
    expect(options.env).toMatchObject({
      SPEC0224_PG_REQUIRED: '1',
      SPEC0224_PG_RESOURCE: a.resource,
      SPEC0224_PG_CHILD_ROLE: 'writer',
      SPEC0224_PG_CHILD_INPUT: input,
      SPEC0224_PG_CHILD_DIR: dir
    })
    expect(
      Object.keys(options.env).filter((key) => !key.startsWith('SPEC0224_'))
    ).not.toContain('NODE_OPTIONS')
    const child = fakeChild()
    setImmediate(() => {
      child.stdout!.emit('data', Buffer.from('PG224_READY'))
      child.emit('exit', 0, null)
      child.emit('close', 0, null)
    })
    return child as ReturnType<typeof spawn>
  })
  const c = await startCompleteChild({
    profile: 'store-restart',
    role: 'writer',
    resource: a.resource,
    config: a.config,
    input,
    dir,
    root: a.root
  })
  expect(await c.done).toEqual({ code: 0, signal: null })
  expect(c.output.bytes('stdout').toString()).toBe('PG224_READY')
  const calls = vi.mocked(spawn).mock.calls.length
  await expect(
    startCompleteChild({
      profile: 'store-restart',
      role: 'unknown',
      resource: a.resource,
      config: a.config,
      input,
      dir,
      root: a.root
    })
  ).rejects.toThrow(/role/)
  await expect(
    startCompleteChild({
      profile: 'store-restart',
      role: 'reader',
      resource: a.resource,
      config: input,
      input,
      dir,
      root: a.root
    })
  ).rejects.toThrow(/Unsealed/)
  expect(vi.mocked(spawn).mock.calls.length).toBe(calls)
})
it('S13: exact bound service options accept; prefixes, extra options, host/port/database/user reject', async () => {
  const a = profileAssignment('bound-admission')
  const service = {
    host: '127.0.0.1',
    port: 54321,
    database: a.claim.database,
    user: a.claim.role,
    password: 'synthetic',
    options: `-c search_path=${a.claim.schema} -c statement_timeout=10000 -c lock_timeout=3000`
  }
  virtual.files.set(a.claim.service, Buffer.from(JSON.stringify(service)))
  const accepted = await assignedService(
    a.resource,
    a.root,
    a.claim.service,
    a.claim.evidence
  )
  expect(accepted.connection).toEqual(service)
  // The consumer receives this checked snapshot even if the file later changes.
  virtual.files.set(
    a.claim.service,
    Buffer.from(JSON.stringify({ ...service, connectionString: 'unchecked' }))
  )
  expect(accepted.connection).toEqual(service)
  expect(Object.keys(accepted.connection!).sort()).toEqual(
    Object.keys(service).sort()
  )
  for (const mutation of [
    { options: service.options + ' -c search_path=public' },
    { options: `-c search_path=${a.claim.schema}` },
    { host: 'localhost' },
    { port: 54322 },
    { database: 'peer' },
    { user: 'peer' },
    {
      connectionString: 'postgresql://peer:synthetic@192.0.2.1:54322/peer'
    },
    {
      connectionString:
        'postgresql://pare224:synthetic@127.0.0.1:54321/pare224_synthetic'
    },
    { ssl: { rejectUnauthorized: false } },
    { application_name: 'unchecked' },
    { stream: {} }
  ]) {
    virtual.files.set(
      a.claim.service,
      Buffer.from(JSON.stringify({ ...service, ...mutation }))
    )
    await expect(
      assignedService(a.resource, a.root, a.claim.service, a.claim.evidence)
    ).rejects.toThrow(/connection/)
  }
})
it('S09: intended result starts exit deadline even when child leaves an active timer', async () => {
  const c = await launch('readyTimer')
  await ready(c.proc)
  await expect(c.finish()).rejects.toThrow(/exitTimeoutMs/)
  expect(c.proc.stdout!.closed).toBe(true)
  await expect(fs.stat(c.home)).rejects.toMatchObject({ code: 'ENOENT' })
})
it.each(['store-restart', 'public-restart'] as const)(
  'S07/S08: %s preserves split readiness marker and original readiness lifetime',
  async (profile) => {
    const root = await scratch(),
      { home } = await privateEnvironment(root),
      proc = fakeChild()
    vi.useFakeTimers()
    try {
      vi.mocked(proc.kill).mockImplementation(() => {
        queueMicrotask(() => {
          proc.emit('exit', null, 'SIGTERM')
          proc.emit('close', null, 'SIGTERM')
        })
        return true
      })
      const c = observeCompleteChild(proc, home, {
        maxRuntimeMs: completeProfiles[profile].maxRuntimeMs,
        exitTimeoutMs: 5000,
        termGraceMs: 1000,
        killGraceMs: 2000
      })
      const status = completeReadiness(c, profile)
      for (const byte of Buffer.from(
        profile === 'store-restart' ? 'PG224_READY' : 'PUBLIC224_READY'
      ))
        proc.stdout!.emit('data', Buffer.from([byte]))
      expect(await status).toBe('ready')
      if (profile === 'store-restart') {
        await vi.advanceTimersByTimeAsync(20000)
        expect(proc.kill).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(5000)
        await expect(c.done).rejects.toThrow(/maxRuntimeMs/)
      } else {
        await vi.advanceTimersByTimeAsync(45000)
        await expect(c.done).rejects.toThrow(/readiness timeout/)
      }
      expect(proc.kill).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  }
)

it.each(['store-restart', 'public-restart'] as const)(
  'S08: %s without READY fails at the original readiness deadline',
  async (profile) => {
    const root = await scratch(),
      { home } = await privateEnvironment(root),
      proc = fakeChild()
    vi.useFakeTimers()
    try {
      vi.mocked(proc.kill).mockImplementation(() => {
        queueMicrotask(() => {
          proc.emit('exit', null, 'SIGTERM')
          proc.emit('close', null, 'SIGTERM')
        })
        return true
      })
      const c = observeCompleteChild(proc, home, {
        maxRuntimeMs: completeProfiles[profile].maxRuntimeMs,
        exitTimeoutMs: 5000,
        termGraceMs: 1000,
        killGraceMs: 2000
      })
      const status = completeReadiness(c, profile)
      await vi.advanceTimersByTimeAsync(
        completeProfiles[profile].readinessMs - 1
      )
      expect(proc.kill).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      if (profile === 'store-restart')
        await expect(status).rejects.toThrow(/readiness timeout/)
      else expect(await status).toBe('timeout')
      await expect(c.done).rejects.toThrow(/readiness timeout/)
    } finally {
      vi.useRealTimers()
    }
  }
)

// Recovery controls execute actual private consumer scopes with finite I/O replacements.
async function cleanupConsumerSource(name: string) {
  const native =
    await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const text = await native.readFile(new URL(name, import.meta.url), 'utf8')
  return ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true)
}
function cleanupSourceFunction(source: ts.SourceFile, name: string) {
  const node = source.statements.find(
    (n): n is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(n) && n.name?.text === name
  )
  if (!node) throw new Error('Missing real consumer function: ' + name)
  return node.getText(source)
}
function compileCleanupScope(code: string, names: string[], values: unknown[]) {
  const output = ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None
    }
  }).outputText
  const bindings: Record<string, unknown> = {
    collectCompleteDiagnostics,
    projectCompleteDiagnostic
  }
  names.forEach((name, index) => {
    bindings[name] = values[index]
  })
  return new Function('exports', ...Object.keys(bindings), output)(
    {},
    ...Object.values(bindings)
  )
}
function cleanupGraphContains(
  error: unknown,
  target: unknown,
  seen = new Set<unknown>()
): boolean {
  if (Object.is(error, target)) return true
  if (!error || typeof error !== 'object' || seen.has(error)) return false
  seen.add(error)
  return (
    ('cause' in error && cleanupGraphContains(error.cause, target, seen)) ||
    (error instanceof AggregateError &&
      error.errors.some((e) => cleanupGraphContains(e, target, seen)))
  )
}
async function cleanupOutcome(action: () => unknown) {
  try {
    return { ok: true as const, value: await action() }
  } catch (error) {
    return { ok: false as const, error }
  }
}
it.each([undefined, null, false, 0, '', new Error('primary')])(
  'retains exact primary %s through all safe cleanup failures',
  async (primary) => {
    const one = new Error('first cleanup'),
      two = new Error('second cleanup')
    const order: number[] = []
    const result = await cleanupOutcome(() =>
      withCompleteCleanup(() => {
        throw primary
      }, [
        () => {
          order.push(1)
          throw one
        },
        async () => {
          order.push(2)
          throw two
        }
      ])
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('Unexpected cleanup success')
    expect((result.error as AggregateError).cause).toBe(primary)
    for (const error of [primary, one, two])
      expect(cleanupGraphContains(result.error, error)).toBe(true)
    expect(order).toEqual([1, 2])
  }
)
it('retains return values and singular error identity without closing transferred owners', async () => {
  const value = {},
    primary = new Error('singular'),
    close = vi.fn()
  expect(await withCompleteCleanup(() => value, [close])).toBe(value)
  expect(close).toHaveBeenCalledTimes(1)
  const failure = await cleanupOutcome(() =>
    withCompleteCleanup(() => {
      throw primary
    }, [])
  )
  expect(failure).toEqual({ ok: false, error: primary })
  expect(completeCleanupError([])).toBeUndefined()
  expect(completeCleanupError([undefined])).toEqual({ error: undefined })
})
it('observes every stop even when an earlier stop throws synchronously; no DB after failed join', async () => {
  const primary = false,
    join = new Error('sync stop'),
    seen = vi.fn(),
    db = vi.fn()
  const result = await cleanupOutcome(() =>
    cleanupCompleteChildren(
      [
        {
          stop: () => {
            throw join
          }
        },
        {
          stop: async () => {
            seen()
          }
        }
      ],
      [db],
      { error: primary }
    )
  )
  expect(seen).toHaveBeenCalledTimes(1)
  expect(db).not.toHaveBeenCalled()
  if (result.ok) throw new Error('Unconfirmed join accepted')
  expect(cleanupGraphContains(result.error, primary)).toBe(true)
  expect(cleanupGraphContains(result.error, join)).toBe(true)
})
it.each([
  'complete-bound-admission-postgres.integration.ts',
  'complete-tool-process-restart.test.ts',
  'complete-tool-public-restart.test.ts',
  'complete-admission-capacity-postgres.integration.ts',
  'complete-settlement-public-postgres.integration.ts',
  'fixtures/complete-process-support.ts'
])('real resource wrappers in %s preserve all four outcomes', async (name) => {
  const source = await cleanupConsumerSource(name)
  const calls: ts.CallExpression[] = []
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(source) === 'withCompleteCleanup' &&
      node.arguments.length === 2 &&
      /^\[\s*\(\) => (?:pool|db|reader|handle|executable)\??\.(?:end|close)\(\)/.test(
        node.arguments[1]!.getText(source)
      )
    )
      calls.push(node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  expect(calls.length).toBeGreaterThan(0)
  const printer = ts.createPrinter()
  for (const call of calls)
    for (const bodyFails of [false, true])
      for (const closeFails of [false, true]) {
        const primary = new Error('body'),
          secondary = new Error('end'),
          closes: string[] = []
        const body = ts.createSourceFile(
          'stub.ts',
          'async () => body()',
          ts.ScriptTarget.Latest,
          true
        ).statements[0] as ts.ExpressionStatement
        const expression = ts.factory.updateCallExpression(
          call,
          call.expression,
          call.typeArguments,
          [body.expression, call.arguments[1]!]
        )
        const text = printer.printNode(
          ts.EmitHint.Expression,
          expression,
          source
        )
        const pool = {
          end: () => {
            closes.push('end')
            if (closeFails) throw secondary
          },
          close: () => {
            closes.push('close')
            if (closeFails) throw secondary
          }
        }
        const result = await cleanupOutcome(() =>
          compileCleanupScope(
            'return ' + text,
            [
              'withCompleteCleanup',
              'body',
              'pool',
              'db',
              'reader',
              'handle',
              'executable',
              'admin'
            ],
            [
              withCompleteCleanup,
              () => {
                if (bodyFails) throw primary
                return 17
              },
              pool,
              pool,
              pool,
              pool,
              pool,
              pool
            ]
          )
        )
        expect(closes.length).toBeGreaterThan(0)
        expect(result.ok).toBe(!bodyFails && !closeFails)
        if (!result.ok) {
          if (bodyFails)
            expect(cleanupGraphContains(result.error, primary)).toBe(true)
          if (closeFails)
            expect(cleanupGraphContains(result.error, secondary)).toBe(true)
        } else expect(result.value).toBe(17)
      }
})
it.each([
  'complete-tool-process-restart.test.ts',
  'complete-tool-public-restart.test.ts'
])('real connect in %s closes failed construction only', async (name) => {
  const source = await cleanupConsumerSource(name),
    code = cleanupSourceFunction(source, 'connect')
  for (const constructFails of [false, true]) {
    const primary = new Error('constructor'),
      secondary = new Error('pool end'),
      closes = vi.fn(() => {
        throw secondary
      })
    class Pool {
      end = closes
    }
    class Store {
      constructor() {
        if (constructFails) throw primary
      }
    }
    const assigned = {
      claim: { config: 'fixed' },
      resource: {
        synthetic: true,
        exclusiveClaim: 'owned',
        schemaName: 'pare224_runtime',
        containerId:
          '0f148bb34b78385de5c7d70bd0f807658918e13295c6645a0daedf4680d2681c',
        test_database_url: 'postgres://synthetic@127.0.0.1/synthetic'
      }
    }
    const result = await cleanupOutcome(() =>
      compileCleanupScope(
        code + '; return connect();',
        [
          'assignedResource',
          'process',
          'role',
          'resourcePath',
          'Pool',
          'PostgresExecutionStepStore',
          'PostgresOperationalEffectJournal',
          'cleanupCompleteChildren'
        ],
        [
          async () => assigned,
          {
            env: {
              SPEC0224_PG_CHILD_CONFIG: 'fixed',
              SPEC0224_PUBLIC_CHILD_CONFIG: 'fixed'
            }
          },
          undefined,
          'fixed',
          Pool,
          Store,
          Store,
          cleanupCompleteChildren
        ]
      )
    )
    expect(closes).toHaveBeenCalledTimes(constructFails ? 1 : 0)
    expect(result.ok).toBe(!constructFails)
    if (!result.ok) {
      expect(cleanupGraphContains(result.error, primary)).toBe(true)
      expect(cleanupGraphContains(result.error, secondary)).toBe(true)
    }
  }
})
it.each(['sync', 'promise', 'callback'])(
  'real SQL diagnostic in %s form retains native errors and callback delivery',
  async (mode) => {
    const source = await cleanupConsumerSource(
        'complete-settlement-public-postgres.integration.ts'
      ),
      code = cleanupSourceFunction(source, 'instrumentSql')
    const primary = new Error('SQL'),
      diagnostic = new Error('wire'),
      end = new Error('end')
    let delivered: unknown,
      count = 0
    const client = {
      query: (...args: unknown[]): unknown => {
        if (mode === 'sync') throw primary
        if (mode === 'promise') return Promise.reject(primary)
        ;(args.at(-1) as (error: unknown) => void)(primary)
        return 'native-handle'
      }
    }
    compileCleanupScope(
      code + '; instrumentSql(client,"synthetic");',
      [
        'client',
        'appendFileSync',
        'join',
        'output',
        'tagged',
        'sqlSequence',
        'sqlScope',
        'errorInfo',
        'completeCleanupError'
      ],
      [
        client,
        (_path: unknown, bytes: string) => {
          if (JSON.parse(bytes).type !== 'SQL-entry') throw diagnostic
        },
        join,
        '/synthetic',
        (_k: unknown, v: unknown) => v,
        0,
        'case',
        (e: unknown) => ({ error: String(e) }),
        completeCleanupError
      ]
    )
    const result = await cleanupOutcome(() =>
      withCompleteCleanup(async () => {
        const handle = await client.query(
          'SELECT synthetic',
          ...(mode === 'callback'
            ? [
                (error: unknown) => {
                  count++
                  delivered = error
                }
              ]
            : [])
        )
        if (mode === 'callback') {
          expect(handle).toBe('native-handle')
          throw delivered
        }
      }, [
        () => {
          throw end
        }
      ])
    )
    if (result.ok) throw new Error('SQL/diagnostic errors hidden')
    for (const error of [primary, diagnostic, end])
      expect(cleanupGraphContains(result.error, error)).toBe(true)
    expect(count).toBe(mode === 'callback' ? 1 : 0)
  }
)
async function realSettlementBoundary() {
  const source = await cleanupConsumerSource(
    'complete-settlement-public-postgres.integration.ts'
  )
  const quiesce = cleanupSourceFunction(source, 'quiesceAttempts'),
    caseRun = cleanupSourceFunction(source, 'caseRun')
  let after: ts.Expression | undefined
  function visit(n: ts.Node) {
    if (ts.isCallExpression(n) && n.expression.getText(source) === 'afterAll')
      after = n.arguments[0]
    ts.forEachChild(n, visit)
  }
  visit(source)
  if (!after) throw new Error('Missing actual afterAll')
  const events: string[] = [],
    summaries: unknown[] = [],
    ownedAttempts = new Set<unknown>()
  const api = compileCleanupScope(
    `let settlementBarrierFailure; const caseIndex=[]; ${quiesce}; ${caseRun}; return {caseRun, afterAll:${after.getText(source)}, ownedAttempts};`,
    [
      'completeCleanupError',
      'cleanupCompleteChildren',
      'withCompleteCleanup',
      'sqlScope',
      'output',
      'join',
      'mkdir',
      'snapshot',
      'pool',
      'admin',
      'tenantB',
      'save',
      'savedFiles',
      'errorInfo',
      'ownedAttempts'
    ],
    [
      completeCleanupError,
      cleanupCompleteChildren,
      withCompleteCleanup,
      'case',
      '/synthetic',
      join,
      async () => {},
      async () => {
        events.push('snapshot')
        return {}
      },
      {
        end: async () => {
          events.push('pool.end')
        }
      },
      {
        end: async () => {
          events.push('admin.end')
        }
      },
      'tenantB',
      async (path: string, value: unknown) => {
        if (path.endsWith('case-summary-index.json')) summaries.push(value)
      },
      [],
      (e: unknown) => ({ error: String(e) }),
      ownedAttempts
    ]
  )
  return {
    api: api as {
      caseRun: (
        id: string,
        body: (attempts: unknown[]) => Promise<void>
      ) => Promise<void>
      afterAll: () => Promise<void>
      ownedAttempts: Set<unknown>
    },
    events,
    summaries
  }
}
it('real caseRun and hook wait for every delayed runtime before finish, snapshot or end', async () => {
  const { api, events, summaries } = await realSettlementBoundary()
  let release!: () => void
  const late = new Promise<void>((yes) => {
    release = yes
  })
  const attempt = (runResult: Promise<unknown>) => ({
    release: { resolve() {} },
    runResult,
    joinDelivery: async () => {},
    finish: async () => {
      events.push('finish')
    },
    dir: '/synthetic/a',
    prepared: { dir: '/synthetic', input: {} },
    events: [],
    calls: 0,
    measurements: 0
  })
  const a = attempt(Promise.resolve()),
    b = attempt(late)
  const result = cleanupOutcome(() =>
    api.caseRun('finite', async (attempts) => {
      attempts.push(a, b)
      api.ownedAttempts.add(a)
      api.ownedAttempts.add(b)
      throw false
    })
  )
  await new Promise((yes) => setTimeout(yes, 0))
  // Two before snapshots belong to setup, before any attempts exist.
  expect(events).toEqual(['snapshot', 'snapshot'])
  release()
  const observed = await result
  expect(observed).toEqual({ ok: false, error: false })
  expect(events).toEqual([
    'snapshot',
    'snapshot',
    'finish',
    'finish',
    'snapshot',
    'snapshot'
  ])
  expect((summaries[0] as { containment: string }).containment).toBe('FAIL')
  await api.afterAll()
  expect(events.slice(-2)).toEqual(['pool.end', 'admin.end'])
})
it('real failed settlement barrier retains falsy primary, observes others, and forbids hook ends', async () => {
  const { api, events } = await realSettlementBoundary(),
    joinError = new Error('join'),
    seen = vi.fn()
  const attempt = (stop: () => Promise<void>) => ({
    release: { resolve() {} },
    runResult: Promise.resolve(),
    joinDelivery: stop,
    finish: async () => {
      events.push('finish')
    }
  })
  const a = attempt(async () => {
      throw joinError
    }),
    b = attempt(async () => {
      seen()
    })
  const result = await cleanupOutcome(() =>
    api.caseRun('finite', async (attempts) => {
      attempts.push(a, b)
      api.ownedAttempts.add(a)
      api.ownedAttempts.add(b)
      throw undefined
    })
  )
  if (result.ok) throw new Error('Failed barrier accepted')
  expect(cleanupGraphContains(result.error, undefined)).toBe(true)
  expect(cleanupGraphContains(result.error, joinError)).toBe(true)
  expect(seen).toHaveBeenCalledTimes(1)
  const hook = await cleanupOutcome(() => api.afterAll())
  expect(hook.ok).toBe(false)
  const subsequent = await cleanupOutcome(() =>
    api.caseRun('after-unconfirmed-join', async () => {})
  )
  expect(subsequent.ok).toBe(false)
  expect(events).toEqual(['snapshot', 'snapshot'])
  expect(seen).toHaveBeenCalledTimes(2)
})

it('real HOME acquisition preserves creation/removal failures and transfers success', async () => {
  const source = await cleanupConsumerSource(
    'fixtures/complete-process-support.ts'
  )
  const code = cleanupSourceFunction(source, 'privateEnvironment')
  for (const createFails of [false, true])
    for (const removeFails of [false, true]) {
      const primary = new Error('mkdir'),
        secondary = new Error('rm'),
        rm = vi.fn(async () => {
          if (removeFails) throw secondary
        })
      const result = await cleanupOutcome(() =>
        compileCleanupScope(
          code + '; return privateEnvironment("/synthetic");',
          [
            'physicalPath',
            'mkdtemp',
            'mkdir',
            'rm',
            'join',
            'cleanupCompleteChildren'
          ],
          [
            async () => {},
            async () => '/synthetic/home',
            async () => {
              if (createFails) throw primary
            },
            rm,
            join,
            cleanupCompleteChildren
          ]
        )
      )
      expect(rm).toHaveBeenCalledTimes(createFails ? 1 : 0)
      expect(result.ok).toBe(!createFails)
      if (!result.ok) {
        expect(cleanupGraphContains(result.error, primary)).toBe(true)
        if (removeFails)
          expect(cleanupGraphContains(result.error, secondary)).toBe(true)
      }
    }
})
it.each([
  'complete-tool-public-restart.test.ts',
  'complete-bound-admission-postgres.integration.ts'
])(
  'real diagnostic catches in %s retain primary and all safe saves',
  async (name) => {
    const source = await cleanupConsumerSource(name),
      catches: ts.CatchClause[] = []
    function visit(n: ts.Node) {
      if (
        ts.isCatchClause(n) &&
        n.block.getText(source).includes('cleanupCompleteChildren') &&
        /\btrace\b|error\.json/.test(n.block.getText(source))
      )
        catches.push(n)
      ts.forEachChild(n, visit)
    }
    visit(source)
    expect(catches.length).toBeGreaterThan(0)
    for (const clause of catches) {
      const primary = new Error('native'),
        diagnostic = new Error('diagnostic'),
        end = new Error('end'),
        seen: string[] = []
      const result = await cleanupOutcome(() =>
        compileCleanupScope(
          'return withCompleteCleanup(async()=>{ try {throw primary} ' +
            clause.getText(source) +
            ' }, [()=>{throw end}]);',
          [
            'withCompleteCleanup',
            'cleanupCompleteChildren',
            'primary',
            'end',
            'trace',
            'save',
            'join',
            'dir',
            'childRole',
            'errorInfo',
            'args',
            'events',
            'calls',
            'measurements',
            'journalTrace',
            'method'
          ],
          [
            withCompleteCleanup,
            cleanupCompleteChildren,
            primary,
            end,
            async () => {
              seen.push('trace')
              throw diagnostic
            },
            async () => {
              seen.push('save')
              throw diagnostic
            },
            join,
            '/synthetic',
            'writer',
            (e: unknown) => ({ error: String(e) }),
            { dir: '/synthetic' },
            [],
            [],
            [],
            [],
            'get'
          ]
        )
      )
      if (result.ok) throw new Error('Diagnostic swallowed native error')
      for (const error of [primary, diagnostic, end])
        expect(cleanupGraphContains(result.error, error)).toBe(true)
      expect(seen.length).toBeGreaterThan(0)
      if (
        clause.getText(source).includes('[\n          trace,') ||
        /\[\s*trace,/.test(clause.getText(source))
      )
        expect(seen).toEqual(['trace', 'save'])
    }
  }
)
it('real createAttempt registration tail transfers every attempt to hook ownership', async () => {
  const source = await cleanupConsumerSource(
    'complete-settlement-public-postgres.integration.ts'
  )
  const fn = source.statements.find(
    (n): n is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(n) && n.name?.text === 'createAttempt'
  )!
  const tail = fn
    .body!.statements.slice(-2)
    .map((n) => n.getText(source))
    .join('\n')
  const ownedAttempts = new Set(),
    attempt = { synthetic: true }
  const returned = compileCleanupScope(
    tail,
    ['ownedAttempts', 'attempt'],
    [ownedAttempts, attempt]
  )
  expect(returned).toBe(attempt)
  expect(ownedAttempts.has(attempt)).toBe(true)
})

function realDiagnosticInfo(
  source: ts.SourceFile
): (error: unknown) => unknown {
  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'errorInfo'
    )
      return compileCleanupScope(
        statement.getText(source) + ';return errorInfo;',
        [],
        []
      )
    if (ts.isVariableStatement(statement)) {
      const declaration = statement.declarationList.declarations.find(
        (d) => d.name.getText(source) === 'errorInfo'
      )
      if (declaration)
        return compileCleanupScope(
          'const ' + declaration.getText(source) + ';return errorInfo;',
          [],
          []
        )
    }
  }
  throw new Error('Real diagnostic projection missing')
}
function diagnosticVector(kind: 'normal' | 'opaque' | 'accessor') {
  const diagnostic = new Error('projection failure')
  let count = 0
  let primary: unknown
  if (kind === 'normal') primary = new Error('native-normal')
  else if (kind === 'opaque') {
    primary = Object.create(null)
    Object.defineProperty(primary, Symbol.toPrimitive, {
      value: () => {
        count++
        throw diagnostic
      }
    })
  } else {
    primary = new Error('native-accessor')
    Object.defineProperty(primary, 'message', {
      get() {
        count++
        throw diagnostic
      }
    })
  }
  return { primary, diagnostic, count: () => count }
}
it.each([undefined, null, false, 0, ''])(
  'diagnostic facades retain falsy primary %s and every independent failure',
  async (primary) => {
    const first = new Error('construct'),
      second = new Error('emit'),
      order: number[] = []
    const failure = collectCompleteDiagnostics(primary, [
      () => {
        order.push(1)
        throw first
      },
      () => {
        order.push(2)
        throw second
      }
    ])
    for (const error of [primary, first, second])
      expect(cleanupGraphContains(failure.error, error)).toBe(true)
    expect(order).toEqual([1, 2])
    expect(projectCompleteDiagnostic(primary, () => 17)).toBe(17)
    const projected = await cleanupOutcome(() =>
      projectCompleteDiagnostic(primary, () => {
        throw first
      })
    )
    if (projected.ok) throw new Error('Projection failure hidden')
    expect(cleanupGraphContains(projected.error, primary)).toBe(true)
    expect(cleanupGraphContains(projected.error, first)).toBe(true)
  }
)
it.each([
  'complete-admission-capacity-postgres.integration.ts',
  'complete-bound-admission-postgres.integration.ts',
  'complete-settlement-public-postgres.integration.ts'
])(
  'real rethrow scopes in %s own the real projection before it can fail',
  async (name) => {
    const source = await cleanupConsumerSource(name),
      projection = realDiagnosticInfo(source),
      blocks: Array<{ block: ts.Block; label: string }> = []
    const labels = name.includes('capacity')
      ? ['journal-error', 'native-CAS-error']
      : name.includes('bound')
        ? ['CAS-error']
        : [
            'CAS-error',
            'model.complete-error',
            'native-reserve-error',
            'native-settle-error',
            'hybrid-error',
            'runtime-error'
          ]
    function visit(n: ts.Node) {
      if (
        ts.isBlock(n) &&
        (ts.isCatchClause(n.parent) || ts.isArrowFunction(n.parent)) &&
        n.getText(source).includes('errorInfo(')
      ) {
        const last = n.statements.at(-1)
        if (last && ts.isThrowStatement(last)) {
          const found = new Set<string>()
          function marker(node: ts.Node) {
            if (ts.isStringLiteralLike(node) && labels.includes(node.text))
              found.add(node.text)
            ts.forEachChild(node, marker)
          }
          marker(n)
          if (found.size === 1) blocks.push({ block: n, label: [...found][0]! })
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(source)
    expect(blocks.map((row) => row.label).sort()).toEqual([...labels].sort())
    for (const { block, label } of blocks)
      for (const kind of ['normal', 'opaque', 'accessor'] as const) {
        const vector = diagnosticVector(kind),
          events: unknown[] = [],
          writes: unknown[] = [],
          journalTrace: unknown[] = []
        const parent = block.parent
        const code = ts.isCatchClause(parent)
          ? 'return (async()=>{try{throw primary} ' +
            parent.getText(source) +
            '})();'
          : 'return (' + parent.getText(source) + ')(primary);'
        const result = await cleanupOutcome(() =>
          compileCleanupScope(
            code,
            [
              'primary',
              'errorInfo',
              'event',
              'writes',
              'journalTrace',
              'entry',
              'method',
              'args',
              'input',
              'injected',
              'target',
              'fault'
            ],
            [
              vector.primary,
              projection,
              (...args: unknown[]) => {
                events.push(args)
                return events.length
              },
              writes,
              journalTrace,
              1,
              'confirm',
              [],
              { expected: null },
              false,
              false,
              'NATIVE'
            ]
          )
        )
        if (result.ok) throw new Error('Native rejection was swallowed')
        expect(cleanupGraphContains(result.error, vector.primary)).toBe(true)
        if (kind === 'normal') expect(result.error).toBe(vector.primary)
        else {
          expect(cleanupGraphContains(result.error, vector.diagnostic)).toBe(
            true
          )
          let calls = 0
          function count(n: ts.Node) {
            if (
              ts.isCallExpression(n) &&
              n.expression.getText(source) === 'errorInfo'
            )
              calls++
            ts.forEachChild(n, count)
          }
          count(block)
          expect(calls).toBe(label === 'native-CAS-error' ? 2 : 1)
          expect(vector.count()).toBe(calls)
        }
      }
  }
)
it('real public journal catch attempts trace after its projection fails and retains all causes', async () => {
  const source = await cleanupConsumerSource(
      'complete-tool-public-restart.test.ts'
    ),
    projection = realDiagnosticInfo(source)
  let selected: ts.CatchClause | undefined
  function visit(n: ts.Node) {
    if (
      ts.isCatchClause(n) &&
      n.block.getText(source).includes('journalTrace.push') &&
      n.block.getText(source).includes('cleanupCompleteChildren')
    )
      selected = n
    ts.forEachChild(n, visit)
  }
  visit(source)
  if (!selected) throw new Error('Missing public journal diagnostic scope')
  const catchCode = selected.getText(source)
  const vector = diagnosticVector('opaque'),
    traceFailure = new Error('trace'),
    trace = vi.fn(async () => {
      throw traceFailure
    }),
    journalTrace: unknown[] = []
  const result = await cleanupOutcome(() =>
    compileCleanupScope(
      'return (async()=>{try{throw primary} ' + catchCode + '})();',
      [
        'primary',
        'errorInfo',
        'cleanupCompleteChildren',
        'journalTrace',
        'trace',
        'method',
        'args'
      ],
      [
        vector.primary,
        projection,
        cleanupCompleteChildren,
        journalTrace,
        trace,
        'confirm',
        []
      ]
    )
  )
  if (result.ok) throw new Error('Public catch falsely succeeded')
  for (const error of [vector.primary, vector.diagnostic, traceFailure])
    expect(cleanupGraphContains(result.error, error)).toBe(true)
  expect(trace).toHaveBeenCalledTimes(1)
  expect(journalTrace).toEqual([])
})
it.each(['finish', 'probe'])(
  'real expected rejection %s stays an observation until projection itself fails',
  async (scope) => {
    const source = await cleanupConsumerSource(
        'complete-settlement-public-postgres.integration.ts'
      ),
      projection = realDiagnosticInfo(source)
    let handler: ts.ArrowFunction | ts.CatchClause | undefined
    function visit(n: ts.Node) {
      if (
        scope === 'finish' &&
        ts.isArrowFunction(n) &&
        n.parameters.some(
          (parameter) => parameter.name.getText(source) === 'error'
        ) &&
        n.body.getText(source).includes('errorInfo(error)') &&
        n.body.getText(source).includes('result: null')
      )
        handler = n
      if (
        scope === 'probe' &&
        ts.isCatchClause(n) &&
        n.block.getText(source).includes('errorInfo(caught)') &&
        n.block.getText(source).includes('native-probe-error')
      )
        handler = n
      ts.forEachChild(n, visit)
    }
    visit(source)
    if (!handler) throw new Error('Missing actual expected-error handler')
    for (const kind of ['normal', 'opaque', 'accessor'] as const) {
      const vector = diagnosticVector(kind),
        event = vi.fn()
      const code = ts.isArrowFunction(handler)
        ? 'return (' + handler.getText(source) + ')(primary);'
        : 'let error;try{throw primary} ' +
          handler.getText(source) +
          ';return error;'
      const result = await cleanupOutcome(() =>
        compileCleanupScope(
          code,
          ['primary', 'errorInfo', 'a', 'entry'],
          [vector.primary, projection, { event }, 1]
        )
      )
      if (kind === 'normal') {
        expect(result.ok).toBe(true)
        if (!result.ok) throw result.error
        const value = result.value as {
          error?: { message?: unknown }
          message?: unknown
        }
        expect(scope === 'finish' ? value.error?.message : value.message).toBe(
          'native-normal'
        )
      } else {
        if (result.ok)
          throw new Error('Expected-rejection projection failed silently')
        expect(cleanupGraphContains(result.error, vector.primary)).toBe(true)
        expect(cleanupGraphContains(result.error, vector.diagnostic)).toBe(true)
      }
    }
  }
)
async function actualCapacityDiagnosticBoundary(
  source: ts.SourceFile,
  body: () => unknown,
  observerFailures: unknown[] = []
) {
  let selected: ts.TryStatement | undefined
  function visit(n: ts.Node) {
    if (
      ts.isTryStatement(n) &&
      n.finallyBlock?.getText(source).includes('observation.countsAtFinally')
    )
      selected = n
    ts.forEachChild(n, visit)
  }
  visit(source)
  if (
    !selected ||
    !selected.catchClause ||
    !selected.finallyBlock ||
    !ts.isBlock(selected.parent)
  )
    throw new Error('Missing actual capacity finally')
  const declarations = selected.parent.statements.filter(
    (n) =>
      ts.isVariableStatement(n) &&
      n.declarationList.declarations.some((d) =>
        ['primary', 'checkError'].includes(d.name.getText(source))
      )
  )
  expect(declarations).toHaveLength(2)
  const code =
    'return (async()=>{' +
    declarations.map((n) => n.getText(source)).join('\n') +
    ';try{await body()} ' +
    selected.catchClause.getText(source) +
    ' finally ' +
    selected.finallyBlock.getText(source) +
    '})();'
  const observation: Record<string, unknown> = {
      verdict: 'IMPLEMENTED_SCOPED_EXECUTION_ONLY'
    },
    saved: string[] = [],
    traces: unknown[] = []
  const result = await cleanupOutcome(() =>
    compileCleanupScope(
      code,
      [
        'body',
        'observerFailures',
        'cleanupCompleteChildren',
        'completeCleanupError',
        'errorInfo',
        'observation',
        'bodies',
        'completeEntries',
        'calls',
        'measurements',
        'events',
        'writes',
        'observerErrors',
        'responses',
        'audit',
        'telemetry',
        'traces',
        'caseName',
        'save',
        'join',
        'dir',
        'physicalRecords',
        'journalTrace'
      ],
      [
        body,
        observerFailures,
        cleanupCompleteChildren,
        completeCleanupError,
        realDiagnosticInfo(source),
        observation,
        0,
        0,
        [],
        [],
        [],
        [],
        [],
        [],
        { events: [] },
        { events: [] },
        traces,
        'finite',
        async (path: string) => {
          saved.push(path)
        },
        join,
        '/synthetic',
        [],
        []
      ]
    )
  )
  return { result, observation, saved, traces }
}
it('real capacity catch and finally retain D1 and D2 rather than only the later projection error', async () => {
  const source = await cleanupConsumerSource(
      'complete-admission-capacity-postgres.integration.ts'
    ),
    primary = Object.create(null),
    first = new Error('D1 catch'),
    second = new Error('D2 finally')
  let count = 0
  Object.defineProperty(primary, Symbol.toPrimitive, {
    value: () => {
      throw count++ === 0 ? first : second
    }
  })
  const { result, saved } = await actualCapacityDiagnosticBoundary(
    source,
    () => {
      throw primary
    }
  )
  if (result.ok) throw new Error('Capacity failure hidden')
  for (const error of [primary, first, second])
    expect(cleanupGraphContains(result.error, error)).toBe(true)
  expect(count).toBe(2)
  expect(saved.map((path) => path.split('/').at(-1))).toEqual([
    'observed.json',
    'physical-checkpoints.json',
    'native-journal-trace.json'
  ])
})
it.each(['success', 'observer-projection-failure'])(
  'real CAS observer preserves native return and case verdict for %s',
  async (mode) => {
    const source = await cleanupConsumerSource(
      'complete-admission-capacity-postgres.integration.ts'
    )
    let selected: ts.ArrowFunction | undefined
    function visit(n: ts.Node) {
      if (
        ts.isBinaryExpression(n) &&
        n.left.getText(source) === 'store.compareAndSwapCheckpoint' &&
        ts.isArrowFunction(n.right)
      )
        selected = n.right
      ts.forEachChild(n, visit)
    }
    visit(source)
    if (!selected) throw new Error('Missing actual CAS observation wrapper')
    const vector = diagnosticVector('opaque'),
      observerFailures: unknown[] = [],
      observerErrors: unknown[] = [],
      native = { status: 'APPLIED', token: { checkpointId: 'c', digest: 'd' } },
      input = {
        tenantId: 'synthetic',
        executionId: 'case',
        expected: null,
        next: { checkpointId: 'c', digest: 'd', state: {} }
      }
    const returned = await compileCleanupScope(
      'return (' + selected.getText(source) + ')(input);',
      [
        'input',
        'cas',
        'store',
        'event',
        'writes',
        'observerErrors',
        'observerFailures',
        'errorInfo',
        'snapshot',
        'expect'
      ],
      [
        input,
        async () => native,
        {
          loadCheckpoint: async () => {
            if (mode === 'observer-projection-failure') throw vector.primary
            return { checkpointId: 'c', digest: 'd' }
          }
        },
        () => 1,
        [],
        observerErrors,
        observerFailures,
        realDiagnosticInfo(source),
        () => ({}),
        expect
      ]
    )
    expect(returned).toBe(native)
    const { result, observation, saved } =
      await actualCapacityDiagnosticBoundary(source, () => {}, observerFailures)
    if (mode === 'success') {
      expect(observerFailures).toEqual([])
      expect(result.ok).toBe(true)
      expect(observation.verdict).toBe('IMPLEMENTED_SCOPED_EXECUTION_ONLY')
    } else {
      expect(observerErrors).toEqual([])
      expect(observerFailures).toHaveLength(1)
      if (result.ok) throw new Error('Observer failure produced a passing case')
      expect(cleanupGraphContains(result.error, vector.primary)).toBe(true)
      expect(cleanupGraphContains(result.error, vector.diagnostic)).toBe(true)
      expect(observation.verdict).toBe('UNPROVEN_FAILURE')
    }
    expect(saved).toHaveLength(3)
  }
)

it.each([
  'complete-bound-admission-postgres.integration.ts',
  'complete-tool-public-restart.test.ts'
])(
  'real pre-existing lazy diagnostic catch in %s also owns the real projection',
  async (name) => {
    const source = await cleanupConsumerSource(name),
      projection = realDiagnosticInfo(source)
    let selected: ts.CatchClause | undefined
    function visit(n: ts.Node) {
      if (
        ts.isCatchClause(n) &&
        n.block.getText(source).includes('cleanupCompleteChildren') &&
        n.block.getText(source).includes('error.json')
      )
        selected = n
      ts.forEachChild(n, visit)
    }
    visit(source)
    if (!selected) throw new Error('Missing lazy diagnostic catch')
    const catchCode = selected.getText(source)
    const vector = diagnosticVector('opaque'),
      trace = vi.fn(async () => {}),
      save = vi.fn(async () => {})
    const result = await cleanupOutcome(() =>
      compileCleanupScope(
        'return (async()=>{try{throw primary} ' + catchCode + '})();',
        [
          'primary',
          'errorInfo',
          'cleanupCompleteChildren',
          'trace',
          'save',
          'join',
          'dir',
          'childRole',
          'args',
          'events',
          'calls',
          'measurements'
        ],
        [
          vector.primary,
          projection,
          cleanupCompleteChildren,
          trace,
          save,
          join,
          '/synthetic',
          'reader',
          { dir: '/synthetic' },
          [],
          [],
          []
        ]
      )
    )
    if (result.ok) throw new Error('Lazy diagnostic catch lost its failure')
    expect(cleanupGraphContains(result.error, vector.primary)).toBe(true)
    expect(cleanupGraphContains(result.error, vector.diagnostic)).toBe(true)
    expect(save).not.toHaveBeenCalled()
    expect(trace).toHaveBeenCalledTimes(name.includes('public') ? 1 : 0)
  }
)
it.each(['finish', 'summary'])(
  'real settlement caseRun lazy %s callback retains opaque primary on projection failure',
  async (mode) => {
    const source = await cleanupConsumerSource(
        'complete-settlement-public-postgres.integration.ts'
      ),
      projection = realDiagnosticInfo(source),
      vector = diagnosticVector('opaque')
    const code =
      'let settlementBarrierFailure;const caseIndex=[];' +
      cleanupSourceFunction(source, 'quiesceAttempts') +
      ';' +
      cleanupSourceFunction(source, 'caseRun') +
      ';return caseRun;'
    const run = compileCleanupScope(
      code,
      [
        'completeCleanupError',
        'cleanupCompleteChildren',
        'sqlScope',
        'output',
        'join',
        'mkdir',
        'snapshot',
        'pool',
        'tenantB',
        'save',
        'savedFiles',
        'errorInfo'
      ],
      [
        completeCleanupError,
        cleanupCompleteChildren,
        'finite',
        '/synthetic',
        join,
        async () => {},
        async () => ({}),
        {},
        'tenantB',
        async () => {},
        [],
        projection
      ]
    ) as (
      id: string,
      body: (attempts: unknown[]) => Promise<void>
    ) => Promise<void>
    const attempt = {
      release: { resolve() {} },
      runResult: Promise.resolve(),
      joinDelivery: async () => {},
      finish: async () => {
        throw vector.primary
      },
      dir: '/synthetic/a',
      prepared: {
        dir: '/synthetic/a',
        input: { tenantId: 'synthetic', executionId: 'e' }
      },
      events: [],
      calls: 0,
      measurements: 0
    }
    const result = await cleanupOutcome(() =>
      run('finite', async (attempts) => {
        if (mode === 'finish') attempts.push(attempt)
        else throw vector.primary
      })
    )
    if (result.ok)
      throw new Error('Opaque settlement diagnostic failure passed')
    expect(cleanupGraphContains(result.error, vector.primary)).toBe(true)
    expect(cleanupGraphContains(result.error, vector.diagnostic)).toBe(true)
  }
)
