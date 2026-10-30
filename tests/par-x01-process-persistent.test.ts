// @vitest-environment node
import { randomBytes } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  existsSync
} from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createProcessService,
  type ProcessChunk,
  type ProcessHandle,
  type ProcessLaunchRequest,
  type ProcessOutcome
} from '../packages/sandbox/src/index.ts'
import { reviewedNodeProfile } from './helpers/aud0625-node-process-profile.ts'

// PAR-X01 slice 4 (SPEC 0286 I4, I7, I8, I10, XP07-XP09): persistent mode and service disposal.
const OWN_ROOT = process.env.CVG_AUD0625_FIXTURE_ROOT ?? process.cwd()
let base: string
let workspace: string

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
const limits = (patch: Partial<ProcessLaunchRequest['limits']> = {}) => ({
  startupMs: 10_000,
  lifetimeMs: 30_000,
  cleanupMs: 5_000,
  graceMs: 300,
  maxOutputBytes: 64 * 1024,
  maxStdinBytes: 1024,
  ...patch
})
const request = (
  js: string,
  extra: Partial<ProcessLaunchRequest> = {},
  args: string[] = []
): ProcessLaunchRequest => ({
  consumer: 'mcp-stdio',
  profile: reviewedNodeProfile(workspace),
  handle: {
    mode: 'PROCESS',
    workspaceRoot: workspace,
    allowNetwork: false,
    allowSubprocess: true
  },
  argv: [process.execPath, '-e', js, ...args],
  mode: 'persistent',
  limits: limits(),
  ...extra
})
const mark = () => `CVG_X01_${randomBytes(6).toString('hex')}`
const echo =
  "let d='';process.stdin.on('data',c=>{d+=c;let i;while((i=d.indexOf('\\n'))>=0){process.stdout.write(d.slice(0,i).toUpperCase()+'\\n');d=d.slice(i+1)}}).on('end',()=>process.exit(0))"
const enc = (t: string) => new TextEncoder().encode(t)
const dec = (c: ProcessChunk) => new TextDecoder().decode(c.bytes)
async function next(
  handle: ProcessHandle
): Promise<IteratorResult<ProcessChunk>> {
  return handle.output![Symbol.asyncIterator]().next()
}
const clean = (o: ProcessOutcome) =>
  expect(o.cleanup).toEqual({
    state: 'clean',
    observed: 'proc-pidns',
    leftover: 0,
    unverified: 0
  })

describe('PAR-X01 slice 4: persistent mode and disposal', () => {
  beforeAll(() => {
    if (OWN_ROOT === '/tmp' || OWN_ROOT.startsWith('/tmp/'))
      throw new Error('Use an owned fixture root outside the /tmp mount shadow')
    base = mkdtempSync(join(OWN_ROOT, 'x01s4-'))
    workspace = join(base, 'workspace')
    mkdirSync(workspace)
  })
  afterAll(() => rmSync(base, { recursive: true, force: true }))

  describe('stdin and output', () => {
    it('keeps stdin open for an exchange, then ends cleanly when the consumer ends it', async () => {
      const service = createProcessService({})
      const launched = await service.launch(request(echo))
      expect(launched.stdin).toBeDefined()
      expect(launched.output).toBeDefined()
      const iterator = launched.output![Symbol.asyncIterator]()
      await launched.stdin!.write(enc('abc\n'))
      expect(dec((await iterator.next()).value!)).toBe('ABC\n')
      await launched.stdin!.write(enc('second\n'))
      expect(dec((await iterator.next()).value!)).toBe('SECOND\n')
      await launched.stdin!.end()
      const outcome = await launched.wait()
      expect(outcome).toMatchObject({ cause: 'exit', exitCode: 0 })
      expect(outcome.stdout).toBeUndefined()
      clean(outcome)
      expect((await iterator.next()).done).toBe(true)
    }, 30_000)

    it('does not exist in oneshot mode', async () => {
      const service = createProcessService({})
      const launched = await service.launch(
        request('process.exit(0)', { mode: 'oneshot' })
      )
      expect(launched.stdin).toBeUndefined()
      expect(launched.output).toBeUndefined()
      await launched.wait()
    }, 30_000)

    it('refuses initial stdin for a persistent launch', async () => {
      await expect(
        createProcessService({}).launch(request(echo, { stdin: enc('x') }))
      ).rejects.toMatchObject({ code: 'invalid_request' })
    })

    it('bounds the bytes written over the whole launch and refuses writes after the end', async () => {
      const service = createProcessService({})
      const launched = await service.launch(
        request(echo, { limits: limits({ maxStdinBytes: 8 }) })
      )
      await launched.stdin!.write(enc('12345'))
      await expect(launched.stdin!.write(enc('67890'))).rejects.toMatchObject({
        code: 'invalid_request'
      })
      await expect(launched.stdin!.write('x' as never)).rejects.toMatchObject({
        code: 'invalid_request'
      })
      // The refused write did not kill the launch.
      await launched.stdin!.write(enc('\n'))
      expect(dec((await next(launched)).value!)).toBe('12345\n')
      await launched.stdin!.end()
      await launched.stdin!.end()
      await expect(launched.stdin!.write(enc('x'))).rejects.toMatchObject({
        code: 'invalid_request'
      })
      clean(await launched.wait())
    }, 30_000)
  })

  describe('lifetime, stop and the tree', () => {
    it('stop ends a server that is waiting on stdin, with the tree proven gone', async () => {
      const marker = mark()
      const service = createProcessService({})
      const launched = await service.launch(
        request(
          `const {spawn}=require('node:child_process');spawn(process.execPath,['-e','setInterval(()=>{},1000)','${marker}'],{detached:true,stdio:'ignore'}).unref();process.stdin.resume()`,
          {},
          [marker]
        )
      )
      expect(await until(() => members(marker).length >= 2, 8000)).toBe(true)
      const outcome = await launched.stop()
      expect(outcome.cause).toBe('cancelled')
      clean(outcome)
      expect(members(marker)).toEqual([])
    }, 30_000)

    it('a chatty payload does not renew the lifetime', async () => {
      const service = createProcessService({})
      const started = Date.now()
      const launched = await service.launch(
        request("setInterval(()=>process.stdout.write('tick\\n'),50)", {
          limits: limits({ lifetimeMs: 1500, maxOutputBytes: 1024 * 1024 })
        })
      )
      const iterator = launched.output![Symbol.asyncIterator]()
      void (async () => {
        for (;;) if ((await iterator.next()).done) return
      })()
      const outcome = await launched.wait()
      expect(outcome.cause).toBe('timeout')
      expect(Date.now() - started).toBeLessThan(8000)
      clean(outcome)
    }, 30_000)

    it('keeps writes from renewing it either', async () => {
      const service = createProcessService({})
      const launched = await service.launch(
        request(echo, {
          limits: limits({ lifetimeMs: 1200, maxStdinBytes: 4096 })
        })
      )
      const pump = setInterval(() => {
        void launched.stdin!.write(enc('k\n')).catch(() => undefined)
      }, 100)
      const outcome = await launched.wait()
      clearInterval(pump)
      expect(outcome.cause).toBe('timeout')
    }, 30_000)
  })

  describe('output backpressure (XP08)', () => {
    const flood = (progress: string) =>
      `const fs=require('node:fs');const buf=Buffer.alloc(16384,97);let total=0;` +
      `const go=()=>{while(process.stdout.write(buf)){total+=buf.length}total+=buf.length;process.stdout.once('drain',go)};go();` +
      // Atomic replace: a reader never sees the truncated, empty file (it read 0 mid-write under load).
      `setInterval(()=>{fs.writeFileSync(${JSON.stringify(progress + '.tmp')},String(total));fs.renameSync(${JSON.stringify(progress + '.tmp')},${JSON.stringify(progress)})},50)`
    const written = (file: string): number =>
      existsSync(file) ? Number(readFileSync(file, 'utf8') || '0') : 0

    it('holds a payload back when nobody reads, and lets it go on when the reader returns', async () => {
      const progress = join(
        workspace,
        `progress-${randomBytes(4).toString('hex')}`
      )
      const service = createProcessService({})
      const launched = await service.launch(
        request(flood(progress), {
          limits: limits({ maxOutputBytes: 64 * 1024 })
        })
      )
      await until(() => written(progress) > 0, 8000)
      await new Promise((r) => setTimeout(r, 1000))
      const first = written(progress)
      await new Promise((r) => setTimeout(r, 1000))
      const second = written(progress)
      // Stalled well below what an unbounded buffer would have taken in two seconds.
      expect(second).toBe(first)
      expect(second).toBeLessThan(4 * 1024 * 1024)
      // A reader drains: the payload moves again.
      const iterator = launched.output![Symbol.asyncIterator]()
      let read = 0
      const drain = (async () => {
        for (;;) {
          const r = await iterator.next()
          if (r.done) return
          read += r.value.bytes.length
          if (read > second + 1024 * 1024) return
        }
      })()
      await drain
      expect(await until(() => written(progress) > second, 5000)).toBe(true)
      const outcome = await launched.stop()
      expect(outcome.cause).toBe('cancelled')
      clean(outcome)
    }, 40_000)

    it('stops cleanly while the output is held back (the held stream does not hang the cleanup)', async () => {
      const progress = join(
        workspace,
        `progress-${randomBytes(4).toString('hex')}`
      )
      const launched = await createProcessService({}).launch(
        request(flood(progress), {
          limits: limits({ maxOutputBytes: 32 * 1024 })
        })
      )
      await until(() => written(progress) > 0, 8000)
      await new Promise((r) => setTimeout(r, 600))
      const started = Date.now()
      const outcome = await launched.stop()
      expect(Date.now() - started).toBeLessThan(4000)
      clean(outcome)
    }, 30_000)

    it('a consumer that leaves does not make the service buffer the rest', async () => {
      const progress = join(
        workspace,
        `progress-${randomBytes(4).toString('hex')}`
      )
      const launched = await createProcessService({}).launch(
        request(flood(progress), {
          limits: limits({ maxOutputBytes: 32 * 1024 })
        })
      )
      const iterator = launched.output![Symbol.asyncIterator]()
      await iterator.next()
      await iterator.return!()
      await new Promise((r) => setTimeout(r, 500))
      const before = written(progress)
      await new Promise((r) => setTimeout(r, 500))
      // Discarded as it comes: the payload keeps running instead of being held back.
      expect(written(progress)).toBeGreaterThan(before)
      clean(await launched.stop())
    }, 30_000)
  })

  describe('Codex review 21601: F2-F4', () => {
    const silent = 'setInterval(()=>{},1000)'
    it('F2: the drop opt-out is refused for every consumer but the shell oneshot, before anything runs', async () => {
      const service = createProcessService({})
      const flood64k = "process.stdout.write('a'.repeat(65536))"
      for (const [consumer, mode] of [
        ['document-conversion', 'oneshot'],
        ['mcp-stdio', 'persistent'],
        ['lsp', 'oneshot'],
        ['shell', 'persistent']
      ] as const)
        await expect(
          service.launch(
            request(flood64k, {
              consumer,
              mode,
              outputOverflow: 'drop',
              limits: limits({ maxOutputBytes: 4 })
            })
          )
        ).rejects.toMatchObject({ code: 'invalid_request' })
      // The legacy shell compatibility path keeps working.
      const shell = await service.launch(
        request(flood64k, {
          consumer: 'shell',
          mode: 'oneshot',
          outputOverflow: 'drop',
          limits: limits({ maxOutputBytes: 4 })
        })
      )
      const outcome = await shell.wait()
      expect(outcome.cause).toBe('exit')
      expect(outcome.truncated).toBe(true)
    }, 30_000)

    it('F3: the output queue has a hard ceiling, a block larger than it is delivered in pieces and nothing is lost', async () => {
      const launched = await createProcessService({}).launch(
        request(
          `process.stdout.write('a'.repeat(65536));setTimeout(()=>{},1500)`,
          { limits: limits({ maxOutputBytes: 4 }) }
        )
      )
      // Nobody reads while the producer writes its block.
      await new Promise((r) => setTimeout(r, 400))
      const iterator = launched.output![Symbol.asyncIterator]()
      let total = 0
      let largest = 0
      while (total < 65536) {
        const r = await iterator.next()
        if (r.done) break
        largest = Math.max(largest, r.value.bytes.length)
        total += r.value.bytes.length
      }
      expect(largest).toBeLessThanOrEqual(4)
      expect(total).toBe(65536)
      clean(await launched.stop())
    }, 60_000)

    it('F3 (decision): a persistent payload that outproduces a stalled reader is held back until its lifetime ends; it is never truncated and never reports output_limit', async () => {
      const launched = await createProcessService({}).launch(
        request("for(;;){process.stdout.write('a'.repeat(1024))}", {
          limits: limits({ maxOutputBytes: 4, lifetimeMs: 600 })
        })
      )
      const outcome = await launched.wait()
      expect(outcome.cause).toBe('timeout')
      expect(outcome.truncated).toBe(false)
      clean(outcome)
    }, 30_000)

    it('F4: after return() the iterator is terminal: a later next() and a pending next() resolve done at once', async () => {
      const launched = await createProcessService({}).launch(request(silent))
      const iterator = launched.output![Symbol.asyncIterator]()
      const pending = iterator.next()
      await iterator.return!()
      const resolved = (p: Promise<IteratorResult<ProcessChunk>>) =>
        Promise.race([
          p,
          new Promise<'pending'>((r) => setTimeout(() => r('pending'), 150))
        ])
      expect(await resolved(pending)).toMatchObject({ done: true })
      expect(await resolved(iterator.next())).toMatchObject({ done: true })
      clean(await launched.stop())
    }, 30_000)
  })

  describe('disposal (I10)', () => {
    it('stops every live launch with cause dispose and reports them', async () => {
      const service = createProcessService({})
      const marker = mark()
      const server = await service.launch(
        request(
          `const {spawn}=require('node:child_process');spawn(process.execPath,['-e','setInterval(()=>{},1000)','${marker}'],{detached:true,stdio:'ignore'}).unref();process.stdin.resume()`,
          {},
          [marker]
        )
      )
      const job = await service.launch(
        request('setInterval(()=>{},1000)', {
          mode: 'oneshot',
          consumer: 'shell'
        })
      )
      expect(await until(() => members(marker).length >= 2, 8000)).toBe(true)
      const report = await service.dispose()
      expect(report).toEqual({ stopped: 2, clean: 2, cleanupFailed: 0 })
      expect((await server.wait()).cause).toBe('dispose')
      expect((await job.wait()).cause).toBe('dispose')
      expect(members(marker)).toEqual([])
      // Closed for good, and a second dispose is the same answer.
      await expect(service.launch(request(echo))).rejects.toMatchObject({
        code: 'service_closed'
      })
      expect(await service.dispose()).toBe(report)
    }, 40_000)

    it('an empty service disposes to an empty report', async () => {
      expect(await createProcessService({}).dispose()).toEqual({
        stopped: 0,
        clean: 0,
        cleanupFailed: 0
      })
    })

    it('counts a launch that ended on its own before disposal as not live', async () => {
      const service = createProcessService({})
      const done = await service.launch(
        request('process.exit(0)', { mode: 'oneshot' })
      )
      await done.wait()
      expect(await service.dispose()).toEqual({
        stopped: 0,
        clean: 0,
        cleanupFailed: 0
      })
    }, 30_000)

    it('reports cleanup_failed launches separately', async () => {
      const service = createProcessService({
        observe: () => ({ members: [4_194_303], unverified: 0 })
      })
      await service.launch(
        request('setInterval(()=>{},1000)', {
          mode: 'oneshot',
          limits: limits({ cleanupMs: 300, graceMs: 100 })
        })
      )
      expect(await service.dispose()).toEqual({
        stopped: 1,
        clean: 0,
        cleanupFailed: 1
      })
    }, 30_000)

    it('dispose and stop on the same launch share one cleanup and one outcome', async () => {
      const service = createProcessService({})
      const launched = await service.launch(request(echo))
      const [fromStop, report] = await Promise.all([
        launched.stop(),
        service.dispose()
      ])
      expect(await launched.wait()).toBe(fromStop)
      expect(fromStop.cause).toBe('cancelled')
      expect(report.stopped).toBe(1)
    }, 30_000)
  })
})
