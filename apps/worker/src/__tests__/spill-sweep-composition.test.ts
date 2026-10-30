import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpillStorageUnavailable } from '@cvg/harness'
import type { PostgresPoolLike } from '@cvg/persistence'
import {
  DEFAULT_SPILL_SWEEP_INTERVAL_MS,
  SPILL_SWEEP_DATABASE_URL_ENV,
  SPILL_SWEEP_INTERVAL_ENV,
  SPILL_SWEEP_SCHEMA_ENV,
  SpillSweepConfigurationError,
  composeSpillSweep,
  createSpillSweepComposition,
  resolveSpillSweepConfig
} from '../spill-sweep-composition.ts'

/** PAR-C03 host wiring (SPEC 0293 D4): the spill expiry sweep of the worker. Synthetic data only. */

const URL_OK = 'postgres://cvg_spill_sweep_job:synthetic@127.0.0.1:5432/cvg'
const env = (over: Record<string, string | undefined> = {}) =>
  ({
    [SPILL_SWEEP_DATABASE_URL_ENV]: URL_OK,
    [SPILL_SWEEP_SCHEMA_ENV]: 'cvg_data',
    ...over
  }) as NodeJS.ProcessEnv

describe('resolveSpillSweepConfig', () => {
  it('is absent without any of the three variables, blank ones included', () => {
    expect(resolveSpillSweepConfig({})).toBeUndefined()
    expect(
      resolveSpillSweepConfig({
        [SPILL_SWEEP_DATABASE_URL_ENV]: '  ',
        [SPILL_SWEEP_SCHEMA_ENV]: '',
        [SPILL_SWEEP_INTERVAL_ENV]: ' '
      })
    ).toBeUndefined()
  })

  it('reads schema, login (in the URL) and interval, with a default interval', () => {
    expect(resolveSpillSweepConfig(env())).toEqual({
      databaseUrl: URL_OK,
      schemaName: 'cvg_data',
      intervalMs: DEFAULT_SPILL_SWEEP_INTERVAL_MS
    })
    expect(
      resolveSpillSweepConfig(env({ [SPILL_SWEEP_INTERVAL_ENV]: ' 60000 ' }))
        ?.intervalMs
    ).toBe(60_000)
    expect(
      resolveSpillSweepConfig(
        env({
          [SPILL_SWEEP_DATABASE_URL_ENV]: URL_OK.replace(
            'postgres:',
            'postgresql:'
          )
        })
      )
    ).toBeDefined()
  })

  it.each([
    ['schema without a URL', { [SPILL_SWEEP_DATABASE_URL_ENV]: undefined }],
    [
      'interval without a URL',
      {
        [SPILL_SWEEP_DATABASE_URL_ENV]: undefined,
        [SPILL_SWEEP_SCHEMA_ENV]: undefined,
        [SPILL_SWEEP_INTERVAL_ENV]: '5000'
      }
    ],
    ['URL without a schema', { [SPILL_SWEEP_SCHEMA_ENV]: undefined }],
    [
      'a schema that is not an identifier',
      { [SPILL_SWEEP_SCHEMA_ENV]: 'Bad Schema' }
    ],
    ['a quoted schema', { [SPILL_SWEEP_SCHEMA_ENV]: 'a"; drop' }],
    [
      'a URL that does not parse',
      { [SPILL_SWEEP_DATABASE_URL_ENV]: 'not a url' }
    ],
    ['another protocol', { [SPILL_SWEEP_DATABASE_URL_ENV]: 'http://u:p@h/db' }],
    [
      'a URL without the login role',
      { [SPILL_SWEEP_DATABASE_URL_ENV]: 'postgres://127.0.0.1:5432/cvg' }
    ],
    [
      'an interval that is not an integer',
      { [SPILL_SWEEP_INTERVAL_ENV]: '1.5' }
    ],
    ['a negative or textual interval', { [SPILL_SWEEP_INTERVAL_ENV]: '-5' }],
    ['an exponent interval', { [SPILL_SWEEP_INTERVAL_ENV]: '1e4' }],
    ['a hexadecimal interval', { [SPILL_SWEEP_INTERVAL_ENV]: '0x3e8' }],
    ['an interval below the floor', { [SPILL_SWEEP_INTERVAL_ENV]: '999' }],
    [
      'an interval above the ceiling',
      { [SPILL_SWEEP_INTERVAL_ENV]: '86400001' }
    ]
  ])('fails closed on %s', (_name, over) => {
    expect(() => resolveSpillSweepConfig(env(over))).toThrow(
      SpillSweepConfigurationError
    )
  })

  it('accepts the interval limits', () => {
    for (const ms of ['1000', '86400000'])
      expect(
        resolveSpillSweepConfig(env({ [SPILL_SWEEP_INTERVAL_ENV]: ms }))
          ?.intervalMs
      ).toBe(Number(ms))
  })
})

function fakePool(options: {
  privileges?: Record<string, unknown>
  purged?: number
  failPurge?: boolean
  noConnect?: boolean
}) {
  const statements: string[] = []
  const good = {
    member: true,
    read_expiry: true,
    read_identity: true,
    read_content: false,
    can_delete: true,
    can_insert: false,
    can_update: false,
    can_truncate: false,
    can_alter_shape: false,
    powerful: false
  }
  let ended = 0
  const pool = {
    connect: async () => {
      if (options.noConnect) throw new Error('down')
      return {
        query: async (text: string) => {
          statements.push(text)
          if (text.includes('has_column_privilege'))
            return { rows: [{ ...good, ...(options.privileges ?? {}) }] }
          if (text.startsWith('DELETE')) {
            if (options.failPurge) throw new Error('boom')
            return { rows: [], rowCount: options.purged ?? 0 }
          }
          return { rows: [] }
        },
        release: () => undefined
      }
    }
  } as unknown as PostgresPoolLike
  return {
    statements,
    ended: () => ended,
    factory: () => ({
      pool,
      end: async () => {
        ended += 1
      }
    })
  }
}

const silent = { log: () => undefined, metric: () => undefined }
const telemetry = () => {
  const logs: { event: string; fields?: Record<string, unknown> }[] = []
  const metrics: { name: string; value: number }[] = []
  return {
    logs,
    metrics,
    sink: {
      log: (event: string, fields?: Record<string, unknown>) => {
        logs.push({ event, ...(fields ? { fields } : {}) })
      },
      metric: (name: string, value: number) => {
        metrics.push({ name, value })
      }
    }
  }
}

describe('composeSpillSweep', () => {
  it('without configuration there is no port, no pool and no metric', () => {
    let pools = 0
    const t = telemetry()
    expect(
      composeSpillSweep(
        {},
        {
          telemetry: t.sink,
          createPool: () => {
            pools += 1
            return fakePool({}).factory()
          }
        }
      )
    ).toBeUndefined()
    expect(pools).toBe(0)
    expect(t.metrics).toEqual([])
  })

  it('an invalid configuration throws before any pool is created', () => {
    let pools = 0
    expect(() =>
      composeSpillSweep(env({ [SPILL_SWEEP_SCHEMA_ENV]: 'No-Good' }), {
        createPool: () => {
          pools += 1
          return fakePool({}).factory()
        }
      })
    ).toThrow(SpillSweepConfigurationError)
    expect(pools).toBe(0)
  })

  it('a valid configuration composes with the configured pool', () => {
    const fake = fakePool({})
    const composed = composeSpillSweep(env(), { createPool: fake.factory })
    expect(composed?.config.schemaName).toBe('cvg_data')
    expect(composed?.composition.sweeps).toBeDefined()
  })
})

describe('createSpillSweepComposition', () => {
  afterEach(() => vi.useRealTimers())
  const config = {
    databaseUrl: URL_OK,
    schemaName: 'cvg_data',
    intervalMs: 5_000
  }

  it('verify passes for the provisioned privileges and runs on the configured schema', async () => {
    const fake = fakePool({})
    const composition = createSpillSweepComposition(config, {
      telemetry: silent,
      createPool: fake.factory
    })
    await composition.verify()
    expect(fake.statements.some((s) => s.includes('"cvg_data"'))).toBe(true)
    expect(fake.statements.some((s) => s.startsWith('DELETE'))).toBe(false)
  })

  it.each([
    ['content is readable', { read_content: true }],
    ['the login is not a member', { member: false }],
    ['it can insert', { can_insert: true }],
    ['it is a superuser or bypasses RLS', { powerful: true }]
  ])('verify refuses when %s', async (_name, privileges) => {
    const composition = createSpillSweepComposition(config, {
      telemetry: silent,
      createPool: fakePool({ privileges }).factory
    })
    await expect(composition.verify()).rejects.toBeInstanceOf(
      SpillStorageUnavailable
    )
  })

  it('verify refuses when the database is down', async () => {
    const composition = createSpillSweepComposition(config, {
      telemetry: silent,
      createPool: fakePool({ noConnect: true }).factory
    })
    await expect(composition.verify()).rejects.toBeInstanceOf(
      SpillStorageUnavailable
    )
  })

  it('sweeps on the interval, reports the purge count and stops cleanly', async () => {
    vi.useFakeTimers()
    const fake = fakePool({ purged: 3 })
    const t = telemetry()
    const composition = createSpillSweepComposition(config, {
      createPool: fake.factory,
      telemetry: t.sink
    })
    composition.sweeps.start()
    composition.sweeps.start()
    await vi.advanceTimersByTimeAsync(4_999)
    expect(t.metrics).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(t.metrics).toEqual([
      { name: 'worker_sweep_spill_purged_total', value: 3 }
    ])
    expect(vi.getTimerCount()).toBe(1)
    await composition.sweeps.stop()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(t.metrics).toHaveLength(1)
    expect(t.logs.map((l) => l.event)).toEqual([
      'worker.spill_sweep_started',
      'worker.spill_sweep_tick',
      'worker.spill_sweep_stopped'
    ])
    await composition.close()
    expect(fake.ended()).toBe(1)
  })

  it('a failing sweep is logged and counted, never thrown, and the next tick runs', async () => {
    vi.useFakeTimers()
    const t = telemetry()
    const composition = createSpillSweepComposition(config, {
      createPool: fakePool({ failPurge: true }).factory,
      telemetry: t.sink
    })
    composition.sweeps.start()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.metrics).toEqual([
      { name: 'worker_sweep_failures_total', value: 1 },
      { name: 'worker_sweep_failures_total', value: 1 }
    ])
    expect(
      t.logs.filter((l) => l.event === 'worker.spill_sweep_failed')
    ).toHaveLength(2)
    await composition.sweeps.stop()
  })

  it('stop without start is a no-op and an overlapping tick is not started twice', async () => {
    vi.useFakeTimers()
    let release: (() => void) | undefined
    const statements: string[] = []
    const pool = {
      connect: async () => ({
        query: async (text: string) => {
          statements.push(text)
          if (text.includes('has_column_privilege'))
            return {
              rows: [
                {
                  member: true,
                  read_expiry: true,
                  read_identity: true,
                  read_content: false,
                  can_delete: true,
                  can_insert: false,
                  can_update: false,
                  can_truncate: false,
                  can_alter_shape: false,
                  powerful: false
                }
              ]
            }
          if (text.startsWith('DELETE'))
            await new Promise<void>((resolve) => {
              release = resolve
            })
          return { rows: [], rowCount: 0 }
        },
        release: () => undefined
      })
    } as unknown as PostgresPoolLike
    const composition = createSpillSweepComposition(config, {
      telemetry: silent,
      createPool: () => ({ pool, end: async () => undefined })
    })
    await composition.sweeps.stop()
    composition.sweeps.start()
    await vi.advanceTimersByTimeAsync(15_000)
    expect(statements.filter((s) => s.startsWith('DELETE'))).toHaveLength(1)
    release?.()
    await composition.sweeps.stop()
  })
})
