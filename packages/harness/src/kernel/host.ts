import {
  CONTROL_SERVICES,
  type Disposer,
  type HookMap,
  type HookPoint,
  type KernelContext,
  type KernelPlugin,
  type PluginKind,
  type ServiceKey,
  type Services,
  type ToolGuard
} from './types.ts'

export class KernelBootError extends Error {
  public constructor(
    public readonly code:
      | 'duplicate_plugin'
      | 'missing_service'
      | 'dependency_cycle'
      | 'duplicate_service'
      | 'control_service_from_capability'
      | 'guard_from_capability'
      | 'undeclared_service'
      | 'host_sealed'
      | 'plugin_apply_failed',
    message: string
  ) {
    super(message)
    this.name = 'KernelBootError'
  }
}

export interface Listener<P extends HookPoint> {
  readonly kind: PluginKind
  readonly plugin: string
  readonly fn: HookMap[P]
}

type ListenerTable = { [P in HookPoint]: Listener<P>[] }

const isControlService = (key: ServiceKey): boolean =>
  (CONTROL_SERVICES as readonly ServiceKey[]).includes(key)

/**
 * Plugin host (SPEC 0181 §2). Plugins find each other by service key, load in
 * dependency order and register reversible effects. After boot the host is
 * sealed: no plugin, agent or configuration can add, remove or reorder a
 * registration while turns run (I2).
 */
export class KernelHost {
  readonly #services = new Map<ServiceKey, { owner: string; value: unknown }>()
  readonly #listeners: ListenerTable = {
    'turn/before-step': [],
    'model/before-call': [],
    'tool/pre-execute': [],
    'tool/execute': [],
    'tool/post-execute': [],
    'turn/end': []
  }
  readonly #guards: { plugin: string; fn: ToolGuard }[] = []
  readonly #disposers: Disposer[] = []
  #sealed = false

  private constructor() {}

  /**
   * Boots a profile. Fails closed: a missing required service, a cycle, a
   * control service offered by a capability or a throwing `apply` aborts the
   * boot and unwinds everything already registered.
   */
  public static async boot(
    plugins: readonly KernelPlugin[],
    required: readonly ServiceKey[]
  ): Promise<KernelHost> {
    const host = new KernelHost()
    try {
      for (const plugin of KernelHost.order(plugins)) {
        await host.#apply(plugin)
      }
      for (const key of required) {
        if (!host.#services.has(key)) {
          throw new KernelBootError(
            'missing_service',
            `Required service "${key}" is not provided by the profile.`
          )
        }
      }
    } catch (error) {
      await host.dispose()
      if (error instanceof KernelBootError) throw error
      throw new KernelBootError(
        'plugin_apply_failed',
        error instanceof Error ? error.message : 'plugin apply failed'
      )
    }
    host.#sealed = true
    return host
  }

  public get<K extends ServiceKey>(key: K): Services[K] {
    const entry = this.#services.get(key)
    if (!entry) {
      throw new KernelBootError(
        'missing_service',
        `Service "${key}" is not available.`
      )
    }
    return entry.value as Services[K]
  }

  public has(key: ServiceKey): boolean {
    return this.#services.has(key)
  }

  /** Controls first, then capabilities; registration order inside each. */
  public listeners<P extends HookPoint>(point: P): readonly Listener<P>[] {
    const table = this.#listeners[point] as Listener<P>[]
    return [
      ...table.filter((entry) => entry.kind === 'control'),
      ...table.filter((entry) => entry.kind === 'capability')
    ]
  }

  public guards(): readonly ToolGuard[] {
    return this.#guards.map((entry) => entry.fn)
  }

  /** Unwinds registrations in reverse order and waits for each to finish. */
  public async dispose(): Promise<void> {
    while (this.#disposers.length > 0) {
      const dispose = this.#disposers.pop()
      try {
        await dispose?.()
      } catch {
        // One failing disposer must not leave the remaining ones running.
      }
    }
  }

  static order(plugins: readonly KernelPlugin[]): KernelPlugin[] {
    const byName = new Map<string, KernelPlugin>()
    const provider = new Map<ServiceKey, string>()
    for (const plugin of plugins) {
      if (byName.has(plugin.name)) {
        throw new KernelBootError(
          'duplicate_plugin',
          `Plugin "${plugin.name}" is declared twice.`
        )
      }
      byName.set(plugin.name, plugin)
      for (const key of plugin.provides ?? []) {
        if (provider.has(key)) {
          throw new KernelBootError(
            'duplicate_service',
            `Service "${key}" is provided by "${provider.get(key)}" and "${plugin.name}".`
          )
        }
        provider.set(key, plugin.name)
      }
    }
    const ordered: KernelPlugin[] = []
    const state = new Map<string, 'visiting' | 'done'>()
    const visit = (plugin: KernelPlugin): void => {
      const current = state.get(plugin.name)
      if (current === 'done') return
      if (current === 'visiting') {
        throw new KernelBootError(
          'dependency_cycle',
          `Plugin "${plugin.name}" is part of a dependency cycle.`
        )
      }
      state.set(plugin.name, 'visiting')
      for (const key of plugin.requires ?? []) {
        const owner = provider.get(key)
        if (!owner) {
          throw new KernelBootError(
            'missing_service',
            `Plugin "${plugin.name}" requires "${key}", which no plugin provides.`
          )
        }
        const dependency = byName.get(owner)
        if (dependency) visit(dependency)
      }
      state.set(plugin.name, 'done')
      ordered.push(plugin)
    }
    plugins.forEach(visit)
    return ordered
  }

  async #apply(plugin: KernelPlugin): Promise<void> {
    const declared = new Set(plugin.provides ?? [])
    const context: KernelContext = {
      provide: (key, service) => {
        this.#assertOpen()
        if (!declared.has(key)) {
          throw new KernelBootError(
            'undeclared_service',
            `Plugin "${plugin.name}" provides "${key}" without declaring it.`
          )
        }
        if (plugin.kind === 'capability' && isControlService(key)) {
          throw new KernelBootError(
            'control_service_from_capability',
            `Capability "${plugin.name}" cannot provide control service "${key}".`
          )
        }
        this.#services.set(key, { owner: plugin.name, value: service })
        const dispose: Disposer = async () => {
          if (this.#services.get(key)?.owner === plugin.name) {
            this.#services.delete(key)
          }
        }
        this.#disposers.push(dispose)
        return dispose
      },
      get: (key) => this.get(key),
      on: (point, listener) => {
        this.#assertOpen()
        const table = this.#listeners[point] as Listener<typeof point>[]
        const entry: Listener<typeof point> = {
          kind: plugin.kind,
          plugin: plugin.name,
          fn: listener
        }
        table.push(entry)
        const dispose: Disposer = async () => {
          const index = table.indexOf(entry)
          if (index >= 0) table.splice(index, 1)
        }
        this.#disposers.push(dispose)
        return dispose
      },
      guard: (guard) => {
        this.#assertOpen()
        if (plugin.kind !== 'control') {
          throw new KernelBootError(
            'guard_from_capability',
            `Capability "${plugin.name}" cannot register a guard.`
          )
        }
        const entry = { plugin: plugin.name, fn: guard }
        this.#guards.push(entry)
        const dispose: Disposer = async () => {
          const index = this.#guards.indexOf(entry)
          if (index >= 0) this.#guards.splice(index, 1)
        }
        this.#disposers.push(dispose)
        return dispose
      },
      effect: (dispose) => {
        this.#assertOpen()
        this.#disposers.push(dispose)
      }
    }
    await plugin.apply(context)
    for (const key of declared) {
      if (!this.#services.has(key)) {
        throw new KernelBootError(
          'missing_service',
          `Plugin "${plugin.name}" declared "${key}" but did not provide it.`
        )
      }
    }
  }

  #assertOpen(): void {
    if (this.#sealed) {
      throw new KernelBootError(
        'host_sealed',
        'The kernel is sealed; registrations are only allowed during boot.'
      )
    }
  }
}
