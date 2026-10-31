import { Client } from 'pg'
import type { QueryResult, QueryResultRow } from 'pg'

/**
 * SPEC 0221 §6: a writer owns one PHYSICAL PostgreSQL session until close. This port is
 * deliberately narrow: no transparent reconnect, no backend swap, no transaction pooling.
 */
export interface PhysicalSessionLease {
  /** Backend process id of the physical session, issued by the trusted adapter. */
  readonly backendPid: number
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>>
  /** Called at most once when the physical session ends or errors. */
  onLost(listener: (error: Error) => void): void
  /** Graceful end; the caller has already unlocked and verified. Idempotent. */
  release(): Promise<void>
  /** Hard end: the session lock goes with the server session. Idempotent. */
  destroy(): Promise<void>
}
export interface PostgresPhysicalSessionPool {
  /**
   * Resolves a lease that no one else holds. A lease that arrives after `timeoutMs` or an
   * abort is the adapter's responsibility and is destroyed by it, never leaked.
   */
  acquire(options: {
    readonly timeoutMs: number
    readonly signal?: AbortSignal
  }): Promise<PhysicalSessionLease>
}

class ClientLease implements PhysicalSessionLease {
  readonly #client: Client
  readonly #listeners: Array<(error: Error) => void> = []
  #lost: Error | undefined
  #ended: Promise<void> | undefined
  constructor(
    client: Client,
    readonly backendPid: number
  ) {
    this.#client = client
    const lose = (error: Error): void => {
      if (this.#lost) return
      this.#lost = error
      for (const listener of this.#listeners.splice(0)) listener(error)
    }
    client.on('error', lose)
    client.on('end', () => lose(new Error('Session connection ended')))
  }
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>> {
    return this.#client.query<T>(text, values)
  }
  onLost(listener: (error: Error) => void): void {
    if (this.#lost) queueMicrotask(() => listener(this.#lost as Error))
    else this.#listeners.push(listener)
  }
  release(): Promise<void> {
    this.#ended ??= this.#client.end().catch(() => undefined)
    return this.#ended
  }
  destroy(): Promise<void> {
    if (!this.#ended) {
      // end() waits for the server; a hard stream destroy does not.
      const stream = (
        this.#client as unknown as {
          connection?: { stream?: { destroy(): void } }
        }
      ).connection?.stream
      this.#ended = (async () => {
        try {
          stream?.destroy()
        } catch {
          /* already gone */
        }
        await this.#client.end().catch(() => undefined)
      })()
    }
    return this.#ended
  }
}

/** Dedicated `pg.Client` per lease: two simultaneous leases never share a backend. */
export function createPgPhysicalSessionPool(options: {
  readonly connectionString: string
}): PostgresPhysicalSessionPool {
  return {
    async acquire({ timeoutMs, signal }) {
      if (signal?.aborted) throw abortError()
      const client = new Client({
        connectionString: options.connectionString,
        // Our own timer governs the deadline, so a lease that lands late is still ours to destroy.
        connectionTimeoutMillis: timeoutMs + 5_000
      })
      const connecting = (async (): Promise<PhysicalSessionLease> => {
        await client.connect()
        const pid = await client.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid'
        )
        return new ClientLease(client, Number(pid.rows[0]?.pid))
      })()
      let timer: NodeJS.Timeout | undefined
      let onAbort: (() => void) | undefined
      const cancelled = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Physical session acquisition timed out')),
          timeoutMs
        )
        onAbort = () => reject(abortError())
        signal?.addEventListener('abort', onAbort, { once: true })
      })
      try {
        return await Promise.race([connecting, cancelled])
      } catch (error) {
        // The adapter keeps responsibility for a late lease: destroy it when it lands.
        void connecting.then(
          (lease) => lease.destroy(),
          () => client.end().catch(() => undefined)
        )
        throw error
      } finally {
        clearTimeout(timer)
        if (onAbort) signal?.removeEventListener('abort', onAbort)
      }
    }
  }
}
export function abortError(): Error {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}
