import { describe, expect, it } from 'vitest'
import { KernelBootError, KernelHost } from '../host.ts'
import { InMemoryKernelLog, InMemoryPauseSwitch } from '../controls.ts'
import type { KernelPlugin } from '../types.ts'

/** KPLG-003: plugin host lifecycle (SPEC 0181 §2). */

function provider(
  name: string,
  key: 'log' | 'pause',
  events: string[],
  requires: KernelPlugin['requires'] = []
): KernelPlugin {
  return {
    name,
    kind: 'control',
    provides: [key],
    requires,
    apply(ctx) {
      events.push(`apply:${name}`)
      ctx.provide(
        key,
        key === 'log' ? new InMemoryKernelLog() : new InMemoryPauseSwitch()
      )
      ctx.effect(async () => {
        events.push(`dispose:${name}`)
      })
    }
  }
}

describe('KernelHost', () => {
  it('loads plugins in dependency order regardless of declaration order', async () => {
    const events: string[] = []
    await KernelHost.boot(
      [
        provider('needs-log', 'pause', events, ['log']),
        provider('log', 'log', events)
      ],
      ['log', 'pause']
    )
    expect(events).toEqual(['apply:log', 'apply:needs-log'])
  })

  it('rejects a dependency cycle', () => {
    expect(() =>
      KernelHost.order([
        provider('a', 'log', [], ['pause']),
        provider('b', 'pause', [], ['log'])
      ])
    ).toThrow(expect.objectContaining({ code: 'dependency_cycle' }))
  })

  it('rejects two providers of the same service', () => {
    expect(() =>
      KernelHost.order([provider('a', 'log', []), provider('b', 'log', [])])
    ).toThrow(expect.objectContaining({ code: 'duplicate_service' }))
  })

  it('rejects a requirement nobody provides', () => {
    expect(() =>
      KernelHost.order([provider('a', 'log', [], ['pause'])])
    ).toThrow(expect.objectContaining({ code: 'missing_service' }))
  })

  it('rejects providing a service that was not declared', async () => {
    const plugin: KernelPlugin = {
      name: 'undeclared',
      kind: 'control',
      apply: (ctx) => void ctx.provide('log', new InMemoryKernelLog())
    }
    await expect(KernelHost.boot([plugin], [])).rejects.toMatchObject({
      code: 'undeclared_service'
    })
  })

  it('disposes registrations in reverse order', async () => {
    const events: string[] = []
    const host = await KernelHost.boot(
      [
        provider('log', 'log', events),
        provider('pause', 'pause', events, ['log'])
      ],
      []
    )
    await host.dispose()
    expect(events.filter((event) => event.startsWith('dispose'))).toEqual([
      'dispose:pause',
      'dispose:log'
    ])
    expect(host.has('log')).toBe(false)
  })

  it('unwinds what was registered when a later plugin fails to apply', async () => {
    const events: string[] = []
    const failing: KernelPlugin = {
      name: 'failing',
      kind: 'control',
      requires: ['log'],
      apply() {
        throw new Error('apply exploded')
      }
    }
    const boot = KernelHost.boot([provider('log', 'log', events), failing], [])
    await expect(boot).rejects.toBeInstanceOf(KernelBootError)
    await expect(boot).rejects.toMatchObject({ code: 'plugin_apply_failed' })
    expect(events).toEqual(['apply:log', 'dispose:log'])
  })

  it('orders control listeners before capability listeners', async () => {
    const order: string[] = []
    const capability: KernelPlugin = {
      name: 'capability.first',
      kind: 'capability',
      apply: (ctx) =>
        void ctx.on('turn/before-step', async (_turn, next) => {
          order.push('capability')
          return next()
        })
    }
    const control: KernelPlugin = {
      name: 'control.second',
      kind: 'control',
      apply: (ctx) =>
        void ctx.on('turn/before-step', async (_turn, next) => {
          order.push('control')
          return next()
        })
    }
    const host = await KernelHost.boot([capability, control], [])
    expect(
      host.listeners('turn/before-step').map((entry) => entry.plugin)
    ).toEqual(['control.second', 'capability.first'])
  })
})
