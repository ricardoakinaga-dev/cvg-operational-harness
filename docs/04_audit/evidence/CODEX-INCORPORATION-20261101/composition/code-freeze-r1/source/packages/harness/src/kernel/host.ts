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

/** Internal wiring contracts. They are deliberately absent from public barrels. */
export type NativeCleanupItemResult =
  | { readonly status: 'SETTLED'; readonly failures: readonly unknown[] }
  | { readonly status: 'UNCERTAIN'; readonly cause: unknown }

export interface NativeCleanupCoordinator {
  runItem(disposer: Disposer): Promise<NativeCleanupItemResult>
}

export interface NativeCleanupReport {
  readonly status: 'DISPOSED' | 'FAILED'
  readonly failures: readonly {
    readonly item: number
    readonly cause: unknown
  }[]
}

export type NativeBootReport =
  | { readonly ok: true; readonly host: KernelHost }
  | {
      readonly ok: false
      readonly primary: KernelBootError
      readonly cleanup: NativeCleanupReport
    }

const legacyCleanup: NativeCleanupCoordinator = {
  async runItem(disposer) {
    try {
      await disposer()
      return { status: 'SETTLED', failures: [] }
    } catch (cause) {
      return { status: 'SETTLED', failures: [cause] }
    }
  }
}

// Reports detach failure data; arbitrary thrown objects/functions never become
// resource handles in a terminal report. The future owner emits fixed codes.
function cleanupCause(cause: unknown): unknown {
  try {
    if (cause instanceof Error) {
      const message = Object.getOwnPropertyDescriptor(cause, 'message')
      return Object.freeze({
        kind: 'error',
        ...(message && 'value' in message && typeof message.value === 'string'
          ? { message: message.value }
          : {})
      })
    }
    if (
      cause === null ||
      ['string', 'number', 'boolean', 'undefined', 'bigint'].includes(
        typeof cause
      )
    )
      return cause
  } catch {
    // Inspection failure is presentation loss, not uncertain liveness of the
    // disposer/subtree that already settled. Never trap the cleanup join here.
  }
  return Object.freeze({ kind: 'opaque_failure' })
}

let internalBoot!: (
  plugins: readonly KernelPlugin[],
  required: readonly ServiceKey[],
  coordinator: NativeCleanupCoordinator
) => Promise<NativeBootReport>
let internalCleanup!: (host: KernelHost) => Promise<NativeCleanupReport>

/** Trusted module wiring only; package exports do not expose this entrypoint. */
export const bootKernelHostWithReport = (
  plugins: readonly KernelPlugin[],
  required: readonly ServiceKey[],
  coordinator: NativeCleanupCoordinator
): Promise<NativeBootReport> => internalBoot(plugins, required, coordinator)

export const disposeKernelHostWithReport = (
  host: KernelHost
): Promise<NativeCleanupReport> => internalCleanup(host)

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
    'model/overflow': [],
    'tool/pre-execute': [],
    'tool/execute': [],
    'tool/post-execute': [],
    'turn/end': []
  }
  readonly #guards: { plugin: string; fn: ToolGuard }[] = []
  readonly #disposers: {
    readonly ordinal: number
    readonly dispose: Disposer
  }[] = []
  #nextDisposer = 0
  #sealed = false
  #cleanup: Promise<NativeCleanupReport> | undefined
  readonly #cleanupCoordinator: NativeCleanupCoordinator

  private constructor(coordinator: NativeCleanupCoordinator) {
    this.#cleanupCoordinator = coordinator
  }

  static {
    internalBoot = (plugins, required, coordinator) =>
      KernelHost.#boot(plugins, required, coordinator)
    internalCleanup = (host) => host.#joinCleanup()
  }

  /**
   * Boots a profile. Fails closed: a missing required service, a cycle, a
   * control service offered by a capability or a throwing `apply` aborts the
   * boot and unwinds everything already registered.
   */
  public static async boot(
    plugins: readonly KernelPlugin[],
    required: readonly ServiceKey[]
  ): Promise<KernelHost> {
    const result = await KernelHost.#boot(plugins, required, legacyCleanup)
    if (result.ok) return result.host
    throw result.primary
  }

  static async #boot(
    plugins: readonly KernelPlugin[],
    required: readonly ServiceKey[],
    coordinator: NativeCleanupCoordinator
  ): Promise<NativeBootReport> {
    const host = new KernelHost(coordinator)
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
      let primary = new KernelBootError(
        'plugin_apply_failed',
        'plugin apply failed'
      )
      // Error presentation must not skip rollback by throwing from a getter.
      try {
        if (error instanceof KernelBootError) primary = error
        else if (error instanceof Error) {
          const message = Object.getOwnPropertyDescriptor(error, 'message')
          if (
            message &&
            'value' in message &&
            typeof message.value === 'string'
          ) {
            primary = new KernelBootError('plugin_apply_failed', message.value)
          }
        }
      } catch {
        // Opaque thrown values retain the fixed primary; cleanup still runs.
      }
      const cleanup = await host.#joinCleanup()
      return Object.freeze({ ok: false, primary, cleanup })
    }
    host.#sealed = true
    return Object.freeze({ ok: true, host })
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
    await this.#joinCleanup()
  }

  #joinCleanup(): Promise<NativeCleanupReport> {
    // Store before any callback can run or reenter through another observer.
    this.#cleanup ??= Promise.resolve().then(() => this.#unwind())
    return this.#cleanup
  }

  async #unwind(): Promise<NativeCleanupReport> {
    const failures: { readonly item: number; readonly cause: unknown }[] = []
    while (this.#disposers.length > 0) {
      const position = this.#disposers.length - 1
      const { ordinal: item, dispose } = this.#disposers[position]!
      let original: Promise<void> | undefined
      let settled = false
      let rejected = false
      let originalFailure: unknown
      const invokeOnce = (): Promise<void> => {
        original ??= Promise.resolve()
          .then(() => dispose())
          .then(
            () => {
              settled = true
            },
            (cause: unknown) => {
              settled = true
              rejected = true
              originalFailure = cause
              throw cause
            }
          )
        // A broken coordinator may stop observing; the original stays owned.
        void original.catch(() => {})
        return original
      }
      try {
        const result = await this.#cleanupCoordinator.runItem(invokeOnce)
        if (
          !original ||
          !settled ||
          !result ||
          result.status !== 'SETTLED' ||
          !Array.isArray(result.failures)
        ) {
          // The stack still owns the exact item. No retry, pop, or terminal
          // report is justified by unknown coordinator/descendant settlement.
          await new Promise<never>(() => {})
          continue
        }
        const causes = [...result.failures]
        if (rejected && !causes.includes(originalFailure))
          causes.push(originalFailure)
        for (const cause of causes)
          failures.push(Object.freeze({ item, cause: cleanupCause(cause) }))
      } catch {
        // A coordinator rejection is not proof that its subtree settled.
        await new Promise<never>(() => {})
        continue
      }
      // A pending acquire may register a late resource while this item's
      // subtree is joining. Remove only this settled frame; unwind the late
      // frames before earlier dependencies, without repeating this callback.
      this.#disposers.splice(position, 1)
    }
    return Object.freeze({
      status: failures.length ? 'FAILED' : 'DISPOSED',
      failures: Object.freeze(failures)
    })
  }

  #registerDisposer(dispose: Disposer): void {
    this.#disposers.push({ ordinal: this.#nextDisposer++, dispose })
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
        visit(byName.get(owner) as KernelPlugin)
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
          this.#services.delete(key)
        }
        this.#registerDisposer(dispose)
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
        this.#registerDisposer(dispose)
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
        this.#registerDisposer(dispose)
        return dispose
      },
      effect: (dispose) => {
        this.#assertOpen()
        this.#registerDisposer(dispose)
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
