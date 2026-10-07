import { EventEmitter } from 'node:events'
import { Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { guardPostgresPoolErrors } from '../index.ts'

// Minimal client for the real pg-pool: connects at once and loses its
// connection on demand, the way pg emits `error` when the socket dies.
class FakeClient extends EventEmitter {
  _queryable = true
  _ending = false
  connect(callback: (error?: Error) => void): void {
    setImmediate(() => callback())
  }
  query(): Promise<{ rows: unknown[] }> {
    return this._queryable
      ? Promise.resolve({ rows: [] })
      : Promise.reject(new Error('Client is not queryable'))
  }
  end(callback?: () => void): void {
    this._ending = true
    setImmediate(() => callback?.())
  }
  lose(error: Error): void {
    this._queryable = false
    this.emit('error', error)
  }
}

const poolWithFakeClients = () => new Pool({ Client: FakeClient as never })

describe('guardPostgresPoolErrors', () => {
  it('reproduces the crash: an unguarded checked-out client throws on loss', async () => {
    const pool = poolWithFakeClients()
    const client = (await pool.connect()) as unknown as FakeClient
    expect(() => client.lose(new Error('terminated'))).toThrow('terminated')
    ;(client as unknown as { release(error: Error): void }).release(
      new Error('terminated')
    )
    await pool.end()
  })

  it('keeps a checked-out client loss handled and discards the client', async () => {
    const onError = vi.fn()
    const pool = guardPostgresPoolErrors(poolWithFakeClients(), onError)
    const checkedOut = await pool.connect()
    const client = checkedOut as unknown as FakeClient
    const lost = new Error(
      'terminating connection due to administrator command'
    )
    expect(() => client.lose(lost)).not.toThrow()
    expect(onError).toHaveBeenCalledWith(lost)
    await expect(checkedOut.query('SELECT 1')).rejects.toThrow('not queryable')
    checkedOut.release(true)
    expect(pool.totalCount).toBe(0)
    const fresh = await pool.connect()
    expect(fresh).not.toBe(checkedOut)
    await expect(fresh.query('SELECT 1')).resolves.toEqual({ rows: [] })
    fresh.release()
    await pool.end()
  })

  it('discards a lost client even when it is released without an error', async () => {
    const pool = guardPostgresPoolErrors(poolWithFakeClients())
    const checkedOut = await pool.connect()
    ;(checkedOut as unknown as FakeClient).lose(new Error('socket closed'))
    checkedOut.release()
    expect(pool.totalCount).toBe(0)
    await pool.end()
  })

  it('keeps an idle client loss handled through the pool error event', async () => {
    const onError = vi.fn()
    const pool = guardPostgresPoolErrors(poolWithFakeClients(), onError)
    const checkedOut = await pool.connect()
    checkedOut.release()
    expect(pool.idleCount).toBe(1)
    const lost = new Error('idle connection reset')
    expect(() => (checkedOut as unknown as FakeClient).lose(lost)).not.toThrow()
    expect(onError).toHaveBeenCalledWith(lost)
    expect(pool.totalCount).toBe(0)
    await pool.end()
  })
})
