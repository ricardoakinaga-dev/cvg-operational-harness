import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('chaos: PostgreSQL resilience', () => {
  it('CHAOS-04 temporary disconnect: pool recovers after backend termination', async () => {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })
    // A terminated backend emits an error on the idle/checked-out socket; the
    // pool reports it as an error event. Queries still reject explicitly.
    pool.on('error', () => {})
    const holder = await pool.connect()
    holder.on('error', () => {})
    let holderReleased = false
    const releaseHolder = () => {
      if (holderReleased) return
      holderReleased = true
      try {
        holder.release(true)
      } catch {
        // pg-pool already removed the client whose backend was terminated.
      }
    }
    try {
      await holder.query('BEGIN')
      await holder.query('SELECT 1')
      const pidResult = await holder.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid'
      )
      const pid = pidResult.rows[0]?.pid ?? 0
      const admin = new Client({ connectionString: TEST_DATABASE_URL })
      await admin.connect()
      const terminated = await admin.query<{ terminated: boolean }>(
        'SELECT pg_terminate_backend($1) AS terminated',
        [pid]
      )
      await admin.end()
      expect(terminated.rows[0]?.terminated).toBe(true)
      await expect(holder.query('SELECT 1')).rejects.toThrow()
      releaseHolder()
      const recovered = await pool.query<{ ok: number }>('SELECT 1 AS ok')
      expect(recovered.rows[0]?.ok).toBe(1)
    } finally {
      releaseHolder()
      await pool.end()
    }
  })

  it('CHAOS-05 mass termination: connections are re-established cleanly', async () => {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 3 })
    pool.on('error', () => {})
    try {
      await Promise.all([pool.query('SELECT 1'), pool.query('SELECT 1')])
      const admin = new Client({ connectionString: TEST_DATABASE_URL })
      await admin.connect()
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()'
      )
      await admin.end()
      const recovered = await pool.query<{ answer: number }>(
        'SELECT 42 AS answer'
      )
      expect(recovered.rows[0]?.answer).toBe(42)
    } finally {
      await pool.end()
    }
  })
})
