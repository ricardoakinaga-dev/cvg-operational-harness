import { describe, expect, it, vi } from 'vitest'
import type { QueryResult, QueryResultRow } from 'pg'
import {
  FencedRenewalStoppedError,
  type FencedRenewalControl
} from '../outbox.ts'
import {
  queryRenewal,
  runFencedRenewalTransaction,
  withTenantTransaction,
  type PostgresPoolClient,
  type PostgresPoolLike
} from '../tenant-scoped-postgres.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000217'
function fixture() {
  const controller = new AbortController()
  const control: FencedRenewalControl = {
    signal: controller.signal,
    assertActive: vi.fn()
  }
  const statements: string[] = []
  const releases: (Error | undefined)[] = []
  let hook:
    | ((sql: string, values?: unknown[]) => Promise<void> | void)
    | undefined
  let tenant: unknown = ''
  const client: PostgresPoolClient = {
    async query<T extends QueryResultRow>(
      sql: string,
      values?: unknown[]
    ): Promise<QueryResult<T>> {
      statements.push(sql)
      await hook?.(sql, values)
      if (sql.includes('set_config')) tenant = values?.[1]
      const rows = sql.includes('NULLIF(current_setting')
        ? [{ tenant_id: tenant || null }]
        : []
      return {
        rows,
        rowCount: rows.length,
        command: 'SELECT',
        fields: [],
        oid: 0
      } as unknown as QueryResult<T>
    },
    release(error) {
      releases.push(error)
    }
  }
  const pool: PostgresPoolLike = { connect: vi.fn(async () => client) }
  return {
    controller,
    control,
    statements,
    releases,
    client,
    pool,
    onQuery(fn: typeof hook) {
      hook = fn
    }
  }
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (error) {
    return error
  }
  throw new Error('Expected rejection')
}

describe('SPEC0217 guarded renewal transaction', () => {
  it('preserves the unbound transaction sequence and return value', async () => {
    const f = fixture()
    expect(
      await withTenantTransaction(f.pool, tenantId, async (client) => {
        await client.query('SYNTHETIC OPERATION')
        return 217
      })
    ).toBe(217)
    expect(f.statements).toEqual([
      'BEGIN',
      'SELECT set_config($1, $2, false)',
      'SYNTHETIC OPERATION',
      'SELECT set_config($1, $2, false)',
      "SELECT NULLIF(current_setting($1, true), '') AS tenant_id",
      'COMMIT'
    ])
    expect(f.releases).toEqual([undefined])
  })

  it('owns one checkout/transaction, applies local timeouts, clears tenant before commit', async () => {
    const f = fixture()
    await runFencedRenewalTransaction(
      f.pool,
      tenantId,
      f.control,
      async (client) => {
        expect(client).toBe(f.client)
        await queryRenewal(client, 'SYNTHETIC UPDATE', [], f.control)
      }
    )
    expect(f.pool.connect).toHaveBeenCalledTimes(1)
    expect(f.statements.filter((x) => x === 'BEGIN')).toHaveLength(1)
    expect(f.statements).toContain("SET LOCAL lock_timeout = '500ms'")
    expect(f.statements).toContain("SET LOCAL statement_timeout = '1000ms'")
    expect(f.statements.at(-2)).toContain('NULLIF(current_setting')
    expect(f.statements.at(-1)).toBe('COMMIT')
    expect(f.releases).toEqual([undefined])
  })

  it('does not check out when already stopped', async () => {
    const f = fixture()
    f.controller.abort()
    const error = await rejection(
      runFencedRenewalTransaction(f.pool, tenantId, f.control, vi.fn())
    )
    expect(error).toBeInstanceOf(FencedRenewalStoppedError)
    expect(error).toMatchObject({
      signal: f.control.signal,
      cleanupConfirmed: true
    })
    expect(f.pool.connect).not.toHaveBeenCalled()
  })

  it('releases a late checkout without BEGIN', async () => {
    const f = fixture()
    f.pool.connect = vi.fn(async () => {
      f.controller.abort()
      return f.client
    })
    const error = await rejection(
      runFencedRenewalTransaction(f.pool, tenantId, f.control, vi.fn())
    )
    expect(error).toMatchObject({
      signal: f.control.signal,
      cleanupConfirmed: true
    })
    expect(f.statements).toEqual([])
    expect(f.releases).toEqual([undefined])
  })

  it.each([
    'BEGIN',
    "SET LOCAL lock_timeout = '500ms'",
    "SET LOCAL statement_timeout = '1000ms'",
    'SYNTHETIC UPDATE'
  ])('joins rollback and cleanup after stop during %s', async (target) => {
    const f = fixture()
    f.onQuery((sql) => {
      if (sql === target) f.controller.abort()
    })
    const error = await rejection(
      runFencedRenewalTransaction(
        f.pool,
        tenantId,
        f.control,
        async (client) => {
          await queryRenewal(client, 'SYNTHETIC UPDATE', undefined, f.control)
        }
      )
    )
    expect(error).toMatchObject({
      signal: f.control.signal,
      cleanupConfirmed: true
    })
    expect(f.statements).toContain('ROLLBACK')
    expect(f.statements).not.toContain('COMMIT')
    expect(f.releases).toEqual([undefined])
  })

  it.each(['clear', 'verify'])(
    'vetoes commit after tenant cleanup stops at %s',
    async (target) => {
      const f = fixture()
      f.onQuery((sql, values) => {
        if (
          (target === 'clear' &&
            sql.includes('set_config') &&
            values?.[1] === '') ||
          (target === 'verify' && sql.includes('NULLIF(current_setting'))
        )
          f.controller.abort()
      })
      const error = await rejection(
        runFencedRenewalTransaction(f.pool, tenantId, f.control, async () => 1)
      )
      expect(error).toMatchObject({
        signal: f.control.signal,
        cleanupConfirmed: true
      })
      expect(f.statements).not.toContain('COMMIT')
      expect(f.statements).toContain('ROLLBACK')
      expect(f.releases).toEqual([undefined])
    }
  )

  it('checks generation invalidation even without an aborted signal', async () => {
    const f = fixture()
    f.onQuery((sql) => {
      if (sql.includes('NULLIF(current_setting'))
        f.control.assertActive = () => {
          throw new Error('old generation')
        }
    })
    const error = await rejection(
      runFencedRenewalTransaction(f.pool, tenantId, f.control, async () => 1)
    )
    expect(error).toMatchObject({
      signal: f.control.signal,
      cleanupConfirmed: true
    })
    expect(f.controller.signal.aborted).toBe(false)
    expect(f.statements).not.toContain('COMMIT')
  })

  it.each(['SYNTHETIC UPDATE', 'COMMIT'])(
    'preserves SQL failure racing stop at %s',
    async (target) => {
      const f = fixture()
      const sqlError = new Error('synthetic SQL failure')
      f.onQuery((sql) => {
        if (sql === target) {
          f.controller.abort()
          throw sqlError
        }
      })
      const error = await rejection(
        runFencedRenewalTransaction(f.pool, tenantId, f.control, (client) =>
          queryRenewal(client, 'SYNTHETIC UPDATE', undefined, f.control)
        )
      )
      expect(error).toBe(sqlError)
      expect(error).not.toBeInstanceOf(FencedRenewalStoppedError)
      expect(f.statements).toContain('ROLLBACK')
    }
  )

  it('does not call a late successful COMMIT an expected stop', async () => {
    const f = fixture()
    f.onQuery((sql) => {
      if (sql === 'COMMIT') f.controller.abort()
    })
    const error = await rejection(
      runFencedRenewalTransaction(f.pool, tenantId, f.control, async () => 1)
    )
    expect(error).not.toBeInstanceOf(FencedRenewalStoppedError)
    expect(String(error)).toContain('during COMMIT')
  })

  it.each(['ROLLBACK', 'cleanup'])(
    'destroys client and reports %s failure rather than expected stop',
    async (target) => {
      const f = fixture()
      const failure = new Error(`synthetic ${target} failure`)
      let stopped = false
      f.onQuery((sql, values) => {
        if (sql === 'SYNTHETIC UPDATE') {
          f.controller.abort()
          stopped = true
        }
        if (
          stopped &&
          (sql === target ||
            (target === 'cleanup' &&
              sql.includes('set_config') &&
              values?.[1] === ''))
        )
          throw failure
      })
      const error = await rejection(
        runFencedRenewalTransaction(f.pool, tenantId, f.control, (client) =>
          queryRenewal(client, 'SYNTHETIC UPDATE', undefined, f.control)
        )
      )
      expect(error).toBe(failure)
      expect(f.releases).toEqual([failure])
    }
  )

  it('joins the actual query and rollback before returning stop', async () => {
    const f = fixture()
    let unblock!: () => void
    let started!: () => void
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const barrier = new Promise<void>((resolve) => {
      unblock = resolve
    })
    f.onQuery(async (sql) => {
      if (sql === 'SYNTHETIC UPDATE') {
        started()
        await barrier
      }
    })
    let settled = false
    const run = rejection(
      runFencedRenewalTransaction(f.pool, tenantId, f.control, (client) =>
        queryRenewal(client, 'SYNTHETIC UPDATE', undefined, f.control)
      )
    ).then((x) => {
      settled = true
      return x
    })
    await entered
    f.controller.abort()
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(f.releases).toEqual([])
    unblock()
    expect(await run).toMatchObject({ cleanupConfirmed: true })
    expect(f.releases).toEqual([undefined])
  })

  it('does not certify a same-signal stopped error thrown by SQL as its own guard stop', async () => {
    const f = fixture()
    const foreign = new FencedRenewalStoppedError(f.control.signal)
    f.onQuery((sql) => {
      if (sql === 'SYNTHETIC UPDATE') {
        f.controller.abort()
        throw foreign
      }
    })
    const error = await rejection(
      runFencedRenewalTransaction(f.pool, tenantId, f.control, (client) =>
        queryRenewal(client, 'SYNTHETIC UPDATE', undefined, f.control)
      )
    )
    expect(error).toBe(foreign)
    expect(foreign.cleanupConfirmed).toBe(false)
  })

  it('does not pass AbortSignal or invented query options to pg.query', async () => {
    const f = fixture()
    const query = vi.spyOn(f.client, 'query')
    await queryRenewal(f.client, 'SYNTHETIC UPDATE', ['synthetic'], f.control)
    expect(query).toHaveBeenCalledExactlyOnceWith('SYNTHETIC UPDATE', [
      'synthetic'
    ])
  })
})
