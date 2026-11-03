import { describe, expect, it } from 'vitest'
import {
  KernelBootError,
  KernelHost,
  bootKernelHostWithReport,
  disposeKernelHostWithReport,
  type NativeCleanupCoordinator
} from '../kernel/host.ts'
import type { KernelContext, KernelPlugin } from '../kernel/types.ts'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('managed native prerequisites through existing KernelHost API', () => {
  it('concurrent dispose observers cannot advance past a still-live disposer', async () => {
    const started = deferred()
    const finish = deferred()
    const trace: string[] = []
    const host = await KernelHost.boot(
      [
        {
          name: 'synthetic.resources',
          kind: 'capability',
          apply(ctx) {
            ctx.effect(async () => {
              trace.push('D1')
            })
            ctx.effect(async () => {
              trace.push('D2:start')
              started.resolve()
              await finish.promise
              trace.push('D2:end')
            })
          }
        }
      ],
      []
    )
    const first = host.dispose()
    await started.promise
    const second = host.dispose()
    await Promise.resolve()
    const beforeSettlement = [...trace]
    // Always release the synthetic barrier, including on known-bad baseline.
    finish.resolve()
    await Promise.all([first, second])
    expect(beforeSettlement).toEqual(['D2:start'])
    expect(trace).toEqual(['D2:start', 'D2:end', 'D1'])
  })

  it('preserves legacy void disposal after a settled failure and never repeats callbacks', async () => {
    const trace: string[] = []
    const host = await KernelHost.boot(
      [
        {
          name: 'synthetic.throwing.cleanup',
          kind: 'capability',
          apply(ctx) {
            ctx.effect(async () => {
              trace.push('D1')
            })
            ctx.effect(async () => {
              trace.push('D2')
              throw new Error('synthetic settled error')
            })
          }
        }
      ],
      []
    )
    await expect(host.dispose()).resolves.toBeUndefined()
    await expect(host.dispose()).resolves.toBeUndefined()
    expect(trace).toEqual(['D2', 'D1'])
  })
})

const settle = () => new Promise<void>((done) => setImmediate(done))
const resources = (trace: string[]): KernelPlugin => ({
  name: 'synthetic.native.resources',
  kind: 'capability',
  apply(ctx) {
    ctx.effect(async () => {
      trace.push('D1')
    })
    ctx.effect(async () => {
      trace.push('D2')
    })
  }
})
const plainCoordinator: NativeCleanupCoordinator = {
  async runItem(disposer) {
    try {
      await disposer()
      return { status: 'SETTLED', failures: [] }
    } catch (cause) {
      return { status: 'SETTLED', failures: [cause] }
    }
  }
}

describe('internal native cleanup/report seam (fixture coordinator, not real owner proof)', () => {
  for (const causeKind of ['revokedProxy', 'descriptorTrap'] as const) {
    for (const profile of ['legacy', 'managed'] as const) {
      it(`R1-F01 settles opaque ${causeKind} rejection under ${profile} cleanup`, async () => {
        const revoked = Proxy.revocable({}, {})
        revoked.revoke()
        const cause =
          causeKind === 'revokedProxy'
            ? revoked.proxy
            : new Proxy(new Error('synthetic opaque error'), {
                getOwnPropertyDescriptor() {
                  throw new Error('synthetic presentation failure')
                }
              })
        const trace: string[] = []
        const plugins: KernelPlugin[] = [
          {
            name: 'synthetic.opaque.cleanup',
            kind: 'capability',
            apply(ctx) {
              ctx.effect(async () => {
                trace.push('D1')
              })
              ctx.effect(async () => {
                trace.push('D2')
                throw cause
              })
            }
          }
        ]
        const boot =
          profile === 'legacy'
            ? { ok: true as const, host: await KernelHost.boot(plugins, []) }
            : await bootKernelHostWithReport(plugins, [], plainCoordinator)
        if (!boot.ok) throw boot.primary
        const report = disposeKernelHostWithReport(boot.host)
        const legacyJoin = boot.host.dispose()
        const observed = await Promise.race([
          report.then((value) => ({ status: 'DONE' as const, value })),
          settle().then(() => ({ status: 'PENDING' as const }))
        ])
        expect(observed.status).toBe('DONE')
        if (observed.status !== 'DONE') return
        await legacyJoin
        expect(trace).toEqual(['D2', 'D1'])
        expect(observed.value).toEqual({
          status: 'FAILED',
          failures: [{ item: 1, cause: { kind: 'opaque_failure' } }]
        })
        expect(Object.isFrozen(observed.value.failures[0]?.cause)).toBe(true)
      })
    }
  }

  it('R1-F01 returns the original primary after rollback of an opaque settled rejection', async () => {
    const revoked = Proxy.revocable({}, {})
    revoked.revoke()
    const trace: string[] = []
    const primary = new KernelBootError(
      'plugin_apply_failed',
      'synthetic primary'
    )
    const job = bootKernelHostWithReport(
      [
        {
          name: 'synthetic.opaque.rollback',
          kind: 'capability',
          apply(ctx) {
            ctx.effect(async () => {
              trace.push('D1')
            })
            ctx.effect(async () => {
              trace.push('D2')
              throw revoked.proxy
            })
            throw primary
          }
        }
      ],
      [],
      plainCoordinator
    )
    const observed = await Promise.race([
      job.then((value) => ({ status: 'DONE' as const, value })),
      settle().then(() => ({ status: 'PENDING' as const }))
    ])
    expect(observed.status).toBe('DONE')
    if (observed.status !== 'DONE') return
    expect(observed.value.ok).toBe(false)
    if (observed.value.ok) return
    expect(observed.value.primary).toBe(primary)
    expect(observed.value.cleanup.status).toBe('FAILED')
    expect(trace).toEqual(['D2', 'D1'])
  })

  it('does not lose a late resource registered during boot rollback', async () => {
    const trace: string[] = []
    let context!: KernelContext
    let lateRegistered = false
    const primary = new KernelBootError(
      'plugin_apply_failed',
      'synthetic late resource'
    )
    const result = await bootKernelHostWithReport(
      [
        {
          name: 'synthetic.late.rollback',
          kind: 'capability',
          apply(ctx) {
            context = ctx
            ctx.effect(async () => {
              trace.push('D1')
            })
            ctx.effect(async () => {
              trace.push('D2')
            })
            throw primary
          }
        }
      ],
      [],
      {
        async runItem(disposer) {
          await disposer()
          if (!lateRegistered) {
            lateRegistered = true
            context.effect(async () => {
              trace.push('D3:late')
            })
          }
          return { status: 'SETTLED', failures: [] }
        }
      }
    )
    if (result.ok) throw new Error('expected boot failure')
    expect(result.primary).toBe(primary)
    expect(result.cleanup.status).toBe('DISPOSED')
    expect(trace).toEqual(['D2', 'D3:late', 'D1'])
  })

  it('cannot skip rollback through an error message accessor', async () => {
    let disposed = 0
    let getterCalls = 0
    const error = new Error('synthetic')
    Object.defineProperty(error, 'message', {
      get() {
        getterCalls++
        throw new Error('synthetic accessor trap')
      }
    })
    const result = await bootKernelHostWithReport(
      [
        {
          name: 'synthetic.error.presentation',
          kind: 'capability',
          apply(ctx) {
            ctx.effect(async () => {
              disposed++
            })
            throw error
          }
        }
      ],
      [],
      plainCoordinator
    )
    if (result.ok) throw new Error('expected boot failure')
    expect(result.primary.code).toBe('plugin_apply_failed')
    expect(result.cleanup.status).toBe('DISPOSED')
    expect(disposed).toBe(1)
    expect(getterCalls).toBe(0)
  })

  it('shares one report and gates D1 on the completed D2 child subtree', async () => {
    const trace: string[] = []
    const childStarted = deferred()
    const childDone = deferred()
    let items = 0
    const result = await bootKernelHostWithReport([resources(trace)], [], {
      async runItem(disposer) {
        await disposer()
        if (items++ === 0) {
          trace.push('Q:start')
          childStarted.resolve()
          await childDone.promise
          trace.push('Q:end')
        }
        return { status: 'SETTLED', failures: [] }
      }
    })
    if (!result.ok) throw result.primary
    const first = disposeKernelHostWithReport(result.host)
    expect(disposeKernelHostWithReport(result.host)).toBe(first)
    await childStarted.promise
    const legacyObserver = result.host.dispose()
    await settle()
    const beforeChild = [...trace]
    childDone.resolve()
    const report = await first
    await legacyObserver
    expect(beforeChild).toEqual(['D2', 'Q:start'])
    expect(trace).toEqual(['D2', 'Q:start', 'Q:end', 'D1'])
    expect(report).toEqual({ status: 'DISPOSED', failures: [] })
    expect(Object.isFrozen(report)).toBe(true)
    expect(Object.isFrozen(report.failures)).toBe(true)
    expect(items).toBe(2)
  })

  it('reports settled child failure even when the disposer itself succeeded', async () => {
    const trace: string[] = []
    const childFailure = new Error('synthetic child failure')
    let items = 0
    const result = await bootKernelHostWithReport([resources(trace)], [], {
      async runItem(disposer) {
        await disposer()
        return {
          status: 'SETTLED',
          failures: items++ === 0 ? [childFailure] : []
        }
      }
    })
    if (!result.ok) throw result.primary
    const report = await disposeKernelHostWithReport(result.host)
    childFailure.message = 'mutated after report'
    expect(report).toEqual({
      status: 'FAILED',
      failures: [
        {
          item: 1,
          cause: { kind: 'error', message: 'synthetic child failure' }
        }
      ]
    })
    expect(Object.isFrozen(report.failures[0])).toBe(true)
    expect(Object.isFrozen(report.failures[0]?.cause)).toBe(true)
    expect(trace).toEqual(['D2', 'D1'])
  })

  it('keeps primary identity and separate rollback reports across reused boot errors', async () => {
    const primary = new KernelBootError(
      'plugin_apply_failed',
      'synthetic primary'
    )
    const boot = (id: string) =>
      bootKernelHostWithReport(
        [
          {
            name: 'synthetic.failed.boot',
            kind: 'capability',
            apply(ctx) {
              ctx.effect(async () => {
                throw new Error(id)
              })
              throw primary
            }
          }
        ],
        [],
        plainCoordinator
      )
    const [a, b] = await Promise.all([boot('cleanup A'), boot('cleanup B')])
    if (a.ok || b.ok) throw new Error('expected failed boots')
    expect(a.primary).toBe(primary)
    expect(b.primary).toBe(primary)
    expect(a.cleanup).not.toBe(b.cleanup)
    expect(a.cleanup).toEqual({
      status: 'FAILED',
      failures: [{ item: 0, cause: { kind: 'error', message: 'cleanup A' } }]
    })
    expect(b.cleanup.failures[0]?.cause).toEqual({
      kind: 'error',
      message: 'cleanup B'
    })
    await expect(
      KernelHost.boot(
        [
          {
            name: 'synthetic.legacy.failed.boot',
            kind: 'capability',
            apply() {
              throw primary
            }
          }
        ],
        []
      )
    ).rejects.toBe(primary)
  })

  it('owns the original disposer once even if its coordinator requests it twice', async () => {
    const trace: string[] = []
    const result = await bootKernelHostWithReport([resources(trace)], [], {
      async runItem(disposer) {
        const a = disposer()
        const b = disposer()
        expect(a).toBe(b)
        await Promise.all([a, b])
        return { status: 'SETTLED', failures: [] }
      }
    })
    if (!result.ok) throw result.primary
    await expect(
      disposeKernelHostWithReport(result.host)
    ).resolves.toMatchObject({ status: 'DISPOSED' })
    expect(trace).toEqual(['D2', 'D1'])
  })

  for (const mode of [
    'uncertain',
    'throw',
    'invalid',
    'not_invoked',
    'original_pending',
    'hang'
  ] as const) {
    it(`retains the item and dependent resource without terminal success: ${mode}`, async () => {
      const trace: string[] = []
      const pending = deferred()
      let originalStarted = false
      const result = await bootKernelHostWithReport(
        [
          {
            name: 'synthetic.uncertain.cleanup',
            kind: 'capability',
            apply(ctx) {
              ctx.effect(async () => {
                trace.push('D1')
              })
              ctx.effect(async () => {
                originalStarted = true
                trace.push('D2')
                if (mode === 'original_pending') await pending.promise
              })
            }
          }
        ],
        [],
        {
          async runItem(disposer) {
            if (mode === 'not_invoked')
              return { status: 'SETTLED', failures: [] }
            if (mode === 'original_pending') {
              void disposer()
              return { status: 'SETTLED', failures: [] }
            }
            await disposer()
            if (mode === 'throw') throw new Error('synthetic coordinator error')
            if (mode === 'invalid')
              return { status: 'SETTLED', failures: null } as never
            if (mode === 'hang') await pending.promise
            return { status: 'UNCERTAIN', cause: 'synthetic unknown subtree' }
          }
        }
      )
      if (!result.ok) throw result.primary
      const report = disposeKernelHostWithReport(result.host)
      const observed = await Promise.race([
        report.then(() => 'TERMINAL'),
        settle().then(() => 'PENDING')
      ])
      const beforeRelease = [...trace]
      pending.resolve()
      await settle()
      expect(observed).toBe('PENDING')
      expect(beforeRelease).toEqual(mode === 'not_invoked' ? [] : ['D2'])
      expect(trace).not.toContain('D1')
      expect(originalStarted).toBe(mode !== 'not_invoked')
      expect(disposeKernelHostWithReport(result.host)).toBe(report)
    })
  }
})

describe('cleanup failure data never changes settlement or skips owned dependencies', () => {
  async function failureReport(
    cause: unknown,
    coordinator: NativeCleanupCoordinator = plainCoordinator
  ) {
    const trace: string[] = []
    const boot = await bootKernelHostWithReport(
      [
        {
          name: 'synthetic.cleanup.presentation.boundary',
          kind: 'capability',
          apply(ctx) {
            ctx.effect(async () => {
              trace.push('D1')
            })
            ctx.effect(async () => {
              trace.push('D2')
              throw cause
            })
          }
        }
      ],
      [],
      coordinator
    )
    if (!boot.ok) throw boot.primary
    const report = await disposeKernelHostWithReport(boot.host)
    await boot.host.dispose()
    expect(trace).toEqual(['D2', 'D1'])
    expect(Object.isFrozen(report.failures)).toBe(true)
    return report
  }

  for (const [name, cause] of [
    ['null', null],
    ['undefined', undefined],
    ['string', 'synthetic primitive failure'],
    ['number', 17],
    ['boolean', false],
    ['bigint', 19n]
  ] as const) {
    it(`preserves settled primitive ${name} without losing the failure`, async () => {
      await expect(failureReport(cause)).resolves.toEqual({
        status: 'FAILED',
        failures: [{ item: 1, cause }]
      })
    })
  }

  it('never invokes a thrown callable or exposes it as a cleanup resource', async () => {
    let invocations = 0
    const cause = () => {
      invocations += 1
    }
    await expect(failureReport(cause)).resolves.toEqual({
      status: 'FAILED',
      failures: [{ item: 1, cause: { kind: 'opaque_failure' } }]
    })
    expect(invocations).toBe(0)
  })

  for (const [name, cause] of [
    ['symbol', Symbol('synthetic failure')],
    ['object', { syntheticResource: true }]
  ] as const) {
    it(`detaches opaque ${name} after the original rejection has settled`, async () => {
      await expect(failureReport(cause)).resolves.toEqual({
        status: 'FAILED',
        failures: [{ item: 1, cause: { kind: 'opaque_failure' } }]
      })
    })
  }

  for (const mode of ['missing', 'accessor', 'non_string'] as const) {
    it(`does not read an Error message with ${mode} presentation`, async () => {
      let reads = 0
      const cause = new Error('synthetic original message')
      if (mode === 'missing') delete (cause as Partial<Error>).message
      if (mode === 'non_string')
        Object.defineProperty(cause, 'message', { value: 23 })
      if (mode === 'accessor')
        Object.defineProperty(cause, 'message', {
          get() {
            reads += 1
            throw new Error('synthetic presentation accessor')
          }
        })
      await expect(failureReport(cause)).resolves.toEqual({
        status: 'FAILED',
        failures: [{ item: 1, cause: { kind: 'error' } }]
      })
      expect(reads).toBe(0)
    })
  }

  it('retains the original settled rejection if a coordinator omits it', async () => {
    const cause = new Error('synthetic omitted rejection')
    const coordinator: NativeCleanupCoordinator = {
      async runItem(disposer) {
        await disposer().catch(() => {})
        return { status: 'SETTLED', failures: [] }
      }
    }
    await expect(failureReport(cause, coordinator)).resolves.toEqual({
      status: 'FAILED',
      failures: [{ item: 1, cause: { kind: 'error', message: cause.message } }]
    })
  })

  for (const mode of [
    'primitive',
    'missing_message',
    'non_string_message',
    'accessor_message',
    'descriptor_trap'
  ] as const) {
    it(`keeps boot rollback and a fixed primary when presentation is ${mode}`, async () => {
      const trace: string[] = []
      let reads = 0
      const error = new Error('synthetic boot presentation')
      let cause: unknown = error
      if (mode === 'primitive') cause = 29
      if (mode === 'missing_message') delete (error as Partial<Error>).message
      if (mode === 'non_string_message')
        Object.defineProperty(error, 'message', { value: 31 })
      if (mode === 'accessor_message')
        Object.defineProperty(error, 'message', {
          get() {
            reads += 1
            throw new Error('synthetic unsafe primary accessor')
          }
        })
      if (mode === 'descriptor_trap')
        cause = new Proxy(error, {
          getOwnPropertyDescriptor() {
            reads += 1
            throw new Error('synthetic primary inspection failure')
          }
        })
      const result = await bootKernelHostWithReport(
        [
          {
            name: 'synthetic.boot.presentation.boundary',
            kind: 'capability',
            apply(ctx) {
              ctx.effect(async () => {
                trace.push('rollback')
              })
              throw cause
            }
          }
        ],
        [],
        plainCoordinator
      )
      expect(result.ok).toBe(false)
      if (result.ok)
        throw new Error('synthetic failing boot unexpectedly passed')
      expect(result.primary).toBeInstanceOf(KernelBootError)
      expect(result.primary.code).toBe('plugin_apply_failed')
      expect(result.primary.message).toBe('plugin apply failed')
      expect(result.cleanup).toEqual({ status: 'DISPOSED', failures: [] })
      expect(trace).toEqual(['rollback'])
      expect(reads).toBe(mode === 'descriptor_trap' ? 1 : 0)
    })
  }
})
