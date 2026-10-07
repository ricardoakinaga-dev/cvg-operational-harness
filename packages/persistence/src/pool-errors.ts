import type { Pool, PoolClient } from 'pg'

/**
 * pg emits `error` on a client whose connection dies, whether it is idle in
 * the pool or checked out by a request. pg-pool only listens while the client
 * is idle; a checked-out client without a listener turns a lost connection
 * into an uncaught exception and the process exits. The query in flight (or
 * the next one on that client) still rejects, and pg-pool destroys a client
 * released after the failure, so these listeners only keep the process alive:
 * callers keep failing closed through their own rejected promise.
 */
export function guardPostgresPoolErrors(
  pool: Pool,
  onError: (error: Error) => void = () => undefined
): Pool {
  const report = (error: Error): void => onError(error)
  pool.on('error', report)
  pool.on('connect', (client: PoolClient) => {
    client.on('error', report)
  })
  return pool
}
