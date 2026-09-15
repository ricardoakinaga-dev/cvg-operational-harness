import { describe, expect, it, vi } from 'vitest'
import {
  PlatformEventBus,
  PluginManifestSchema,
  type PlatformEventEnvelope,
  type PluginHookHandler,
  type PluginManifest
} from '../index.ts'
import type { TenantId } from '../ids.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000211' as TenantId
const tenantB = 'tenant_00000000-0000-4000-8000-000000000212' as TenantId
const eventName = 'policy.input.after' as const

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return PluginManifestSchema.parse({
    name: 'observer.hardening',
    version: '1.0.0',
    capabilities: [],
    permissions: [],
    tools: [],
    hooks: [eventName],
    dependencies: [],
    configSchemaVersion: '1',
    ...overrides
  })
}

function plugin(
  name: string,
  version: string,
  hooks: Record<string, PluginHookHandler>,
  hooksDeclared: string[] = [eventName]
) {
  return {
    manifest: manifest({ name, version, hooks: hooksDeclared }),
    handlers: {},
    hooks
  }
}

describe('event bus registration validation', () => {
  it('rejects malformed manifests before creating subscriptions', () => {
    expect(() =>
      new PlatformEventBus().registerPlugin({
        tenantId: tenantA,
        plugin: {
          manifest: { name: '' } as unknown as PluginManifest,
          handlers: {}
        }
      })
    ).toThrow(/manifest is invalid/)

    expect(() =>
      new PlatformEventBus().registerPlugin({
        tenantId: tenantA,
        plugin: {
          manifest: manifest(),
          handlers: {}
        }
      })
    ).toThrow(/requires a handler/)
  })

  it('rejects non-callable hook handlers and duplicate subscriptions', () => {
    expect(() =>
      new PlatformEventBus().registerPlugin({
        tenantId: tenantA,
        plugin: plugin('observer.hardening', '1.0.0', {
          [eventName]: 'not-a-function' as unknown as PluginHookHandler
        })
      })
    ).toThrow(/requires a handler/)

    const bus = new PlatformEventBus().registerPlugin({
      tenantId: tenantA,
      plugin: plugin('observer.hardening', '1.0.0', {
        [eventName]: () => undefined
      })
    })
    expect(() =>
      bus.registerPlugin({
        tenantId: tenantA,
        plugin: plugin('observer.hardening', '1.0.0', {
          [eventName]: () => undefined
        })
      })
    ).toThrow(/already registered/)
    expect(bus.listSubscriptions()).toHaveLength(1)
  })

  it('allows the same plugin identity in another tenant', () => {
    const bus = new PlatformEventBus()
      .registerPlugin({
        tenantId: tenantA,
        plugin: plugin('observer.hardening', '1.0.0', {
          [eventName]: () => undefined
        })
      })
      .registerPlugin({
        tenantId: tenantB,
        plugin: plugin('observer.hardening', '1.0.0', {
          [eventName]: () => undefined
        })
      })

    expect(bus.listSubscriptions()).toHaveLength(2)
  })
})

describe('event bus subscription ordering', () => {
  it('sorts subscriptions by tenant, plugin, version and event deterministically', () => {
    const eventA = 'message.received' as const
    const bus = new PlatformEventBus()
      .registerPlugin({
        tenantId: tenantB,
        plugin: plugin('a.plugin', '1.0.0', { [eventA]: () => undefined }, [
          eventA
        ])
      })
      .registerPlugin({
        tenantId: tenantA,
        plugin: plugin('b.plugin', '1.0.0', {
          [eventName]: () => undefined
        })
      })
      .registerPlugin({
        tenantId: tenantA,
        plugin: plugin('a.plugin', '2.0.0', {
          [eventName]: () => undefined
        })
      })
      .registerPlugin({
        tenantId: tenantA,
        plugin: plugin('a.plugin', '1.0.0', { [eventA]: () => undefined }, [
          eventA
        ])
      })

    expect(bus.listSubscriptions()).toEqual([
      {
        tenantId: tenantA,
        plugin: 'a.plugin',
        version: '1.0.0',
        eventName: eventA
      },
      { tenantId: tenantA, plugin: 'a.plugin', version: '2.0.0', eventName },
      { tenantId: tenantA, plugin: 'b.plugin', version: '1.0.0', eventName },
      {
        tenantId: tenantB,
        plugin: 'a.plugin',
        version: '1.0.0',
        eventName: eventA
      }
    ])
  })
})

describe('event bus emit validation', () => {
  it('rejects invalid scope ids and execution modes before delivery', async () => {
    const handler = vi.fn<PluginHookHandler>(() => undefined)
    const bus = new PlatformEventBus().registerPlugin({
      tenantId: tenantA,
      plugin: plugin('observer.hardening', '1.0.0', { [eventName]: handler })
    })

    await expect(
      bus.emit({
        name: eventName,
        tenantId: tenantA,
        versionId: 'agent_version-invalid' as never
      })
    ).rejects.toMatchObject({ code: 'validation_failed' })

    await expect(
      bus.emit({
        name: eventName,
        tenantId: tenantA,
        executionMode: 'unsupported' as never
      })
    ).rejects.toMatchObject({ code: 'validation_failed' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('wraps primitive payloads and preserves scope metadata', async () => {
    const observed: PlatformEventEnvelope[] = []
    const bus = new PlatformEventBus().registerPlugin({
      tenantId: tenantA,
      plugin: plugin('observer.hardening', '1.0.0', {
        [eventName]: (event) => {
          observed.push(event)
        }
      })
    })

    const primitiveResult = await bus.emit({
      name: eventName,
      tenantId: tenantA,
      payload: 'texto livre'
    })
    expect(primitiveResult.event.payload).toEqual({ value: 'texto livre' })

    const defaultResult = await bus.emit({ name: eventName, tenantId: tenantA })
    expect(defaultResult.event.payload).toEqual({})

    const scopedResult = await bus.emit({
      name: eventName,
      tenantId: tenantA,
      agentId: 'agent_00000000-0000-4000-8000-000000000211' as never,
      versionId: 'agent_version_00000000-0000-4000-8000-000000000211' as never,
      executionMode: 'TEST_LAB',
      payload: { safe: true }
    })
    expect(scopedResult.event).toMatchObject({
      agentId: 'agent_00000000-0000-4000-8000-000000000211',
      versionId: 'agent_version_00000000-0000-4000-8000-000000000211',
      executionMode: 'TEST_LAB'
    })
    expect(observed).toHaveLength(3)
  })

  it('sanitizes non-Error hook failures and swallows audit observer failures', async () => {
    const audits: string[] = []
    const bus = new PlatformEventBus({
      onAudit: () => {
        audits.push('observed')
        throw new Error('audit sink unavailable')
      }
    }).registerPlugin({
      tenantId: tenantA,
      plugin: plugin('observer.hardening', '1.0.0', {
        [eventName]: () => {
          throw 'opaque hook failure'
        }
      })
    })

    const result = await bus.emit({
      name: eventName,
      tenantId: tenantA,
      payload: { safe: true }
    })

    expect(result.deliveries).toEqual([
      expect.objectContaining({ status: 'failed', error: 'Plugin hook failed' })
    ])
    expect(audits).toEqual(['observed'])
  })
})
