import { describe, expect, it } from 'vitest'
import { KernelHost } from '../host.ts'
import type { KernelPlugin } from '../types.ts'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('KernelHost concurrent disposal', () => {
  it('makes every caller wait for sequential reverse-order cleanup', async () => {
    const events: string[] = []
    const newest = deferred()
    const oldest = deferred()
    const newestStarted = deferred()
    const oldestStarted = deferred()
    const plugin: KernelPlugin = {
      name: 'cleanup',
      kind: 'capability',
      apply(ctx) {
        ctx.effect(async () => {
          events.push('oldest:start')
          oldestStarted.resolve()
          await oldest.promise
          events.push('oldest:end')
        })
        ctx.effect(async () => {
          events.push('newest:start')
          newestStarted.resolve()
          await newest.promise
          events.push('newest:end')
        })
      }
    }
    const host = await KernelHost.boot([plugin], [])
    let completed = 0
    const first = host.dispose().then(() => {
      completed += 1
    })
    const second = host.dispose().then(() => {
      completed += 1
    })
    try {
      await newestStarted.promise
      await Promise.resolve()
      expect(events).toEqual(['newest:start'])
      expect(completed).toBe(0)
      newest.resolve()
      await oldestStarted.promise
      await Promise.resolve()
      expect(completed).toBe(0)
      oldest.resolve()
      await Promise.all([first, second])
      expect(events).toEqual([
        'newest:start',
        'newest:end',
        'oldest:start',
        'oldest:end'
      ])
      expect(completed).toBe(2)
    } finally {
      newest.resolve()
      oldest.resolve()
      await Promise.all([first, second])
    }
  })

  it.each(['throw', 'reject'] as const)(
    'keeps all callers waiting when a disposer fails by %s',
    async (failure) => {
      const events: string[] = []
      const oldest = deferred()
      const oldestStarted = deferred()
      const rejectNow = deferred()
      const host = await KernelHost.boot(
        [
          {
            name: 'failure-cleanup',
            kind: 'capability',
            apply(ctx) {
              ctx.effect(async () => {
                events.push('oldest:start')
                oldestStarted.resolve()
                await oldest.promise
                events.push('oldest:end')
              })
              ctx.effect(() => {
                events.push('newest:failure')
                if (failure === 'throw')
                  throw new Error('synthetic cleanup failure')
                return rejectNow.promise.then(() => {
                  throw new Error('synthetic cleanup failure')
                })
              })
            }
          }
        ],
        []
      )
      let completed = 0
      const first = host.dispose().then(() => {
        completed += 1
      })
      const second = host.dispose().then(() => {
        completed += 1
      })
      try {
        rejectNow.resolve()
        await oldestStarted.promise
        await Promise.resolve()
        expect(completed).toBe(0)
        oldest.resolve()
        await Promise.all([first, second])
        expect(events).toEqual(['newest:failure', 'oldest:start', 'oldest:end'])
        expect(completed).toBe(2)
      } finally {
        rejectNow.resolve()
        oldest.resolve()
        await Promise.all([first, second])
      }
    }
  )

  it('does not repeat callbacks after disposal has completed', async () => {
    let calls = 0
    const host = await KernelHost.boot(
      [
        {
          name: 'once',
          kind: 'capability',
          apply(ctx) {
            ctx.effect(() => {
              calls += 1
              return Promise.resolve()
            })
          }
        }
      ],
      []
    )
    await Promise.all([host.dispose(), host.dispose(), host.dispose()])
    await host.dispose()
    expect(calls).toBe(1)
  })

  it('does not start a second cleanup when a callback triggers disposal', async () => {
    const events: string[] = []
    const host: KernelHost = await KernelHost.boot(
      [
        {
          name: 'reentrant',
          kind: 'capability',
          apply(ctx) {
            ctx.effect(() => {
              events.push('oldest')
              return Promise.resolve()
            })
            ctx.effect(() => {
              events.push('newest:start')
              void host.dispose()
              events.push('newest:end')
              return Promise.resolve()
            })
          }
        }
      ],
      []
    )
    await host.dispose()
    expect(events).toEqual(['newest:start', 'newest:end', 'oldest'])
  })
})
