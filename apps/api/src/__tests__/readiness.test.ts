import { describe, expect, it } from 'vitest'
import { evaluateReadiness, evaluateReadinessWithProbes } from '../readiness.ts'
import { buildServer } from '../server.ts'

interface Envelope {
  success: boolean
  data: {
    ready: boolean
    checks: Array<{ name: string; status: string; detail: string }>
  }
}

describe('readiness probe', () => {
  it('is ready for production only with durable PostgreSQL configuration', () => {
    const result = evaluateReadiness({
      persistenceMode: 'postgres',
      durableInbound: true,
      production: true
    })
    expect(result.ready).toBe(true)
    expect(result.checks.every((check) => check.status === 'ok')).toBe(true)
  })

  it('fails closed in production with memory persistence or inline inbound', () => {
    expect(
      evaluateReadiness({
        persistenceMode: 'memory',
        durableInbound: true,
        production: true
      }).ready
    ).toBe(false)
    expect(
      evaluateReadiness({
        persistenceMode: 'postgres',
        durableInbound: false,
        production: true
      }).ready
    ).toBe(false)
  })

  it('marks non-production memory mode as degraded but ready', () => {
    const result = evaluateReadiness({
      persistenceMode: 'memory',
      durableInbound: false,
      production: false
    })
    expect(result.ready).toBe(true)
    expect(
      result.checks.filter((check) => check.status === 'degraded')
    ).toHaveLength(2)
  })

  it('fails and sanitizes a probe that rejects', async () => {
    const result = await evaluateReadinessWithProbes({
      persistenceMode: 'postgres-pool',
      durableInbound: true,
      production: true,
      probes: [
        {
          name: 'consumer',
          check: async () => {
            throw new Error('connection string postgres://secret@host/db')
          }
        }
      ]
    })
    expect(result.ready).toBe(false)
    const failed = result.checks.find((check) => check.name === 'consumer')
    expect(failed?.status).toBe('failed')
    expect(failed?.detail).not.toContain('secret')
  })

  it('fails a probe that does not settle within its bound', async () => {
    const result = await evaluateReadinessWithProbes({
      persistenceMode: 'postgres-pool',
      durableInbound: true,
      production: true,
      probes: [
        {
          name: 'consumer',
          timeoutMs: 10,
          check: () => new Promise<void>(() => undefined)
        }
      ]
    })
    expect(result.ready).toBe(false)
    expect(
      result.checks.find((check) => check.name === 'consumer')?.status
    ).toBe('failed')
  })

  it('probes the database and keeps live up when the client fails', async () => {
    let queries = 0
    const client = {
      query: async () => {
        queries += 1
        throw new Error('synthetic database unavailable')
      }
    }
    const app = buildServer({
      persistence: { kind: 'postgres', client: client as never },
      durableInbound: true
    })
    try {
      const ready = await app.inject({ method: 'GET', url: '/ready' })
      expect(ready.statusCode).toBe(503)
      const payload = ready.json() as Envelope
      expect(payload.data.ready).toBe(false)
      expect(
        payload.data.checks.find((check) => check.name === 'database')?.status
      ).toBe('failed')
      expect(queries).toBeGreaterThan(0)

      const live = await app.inject({ method: 'GET', url: '/live' })
      expect(live.statusCode).toBe(200)
    } finally {
      await app.close()
    }
  })

  it('returns every pooled probe connection and destroys failed ones', async () => {
    let connected = 0
    let released = 0
    let destroyed = 0
    const pool = {
      connect: async () => {
        connected += 1
        return {
          query: async () => {
            throw new Error('synthetic pool failure')
          },
          release: (error?: Error) => {
            released += 1
            if (error) destroyed += 1
          }
        }
      }
    }
    const app = buildServer({
      persistence: { kind: 'postgres-pool', pool: pool as never },
      durableInbound: true
    })
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const ready = await app.inject({ method: 'GET', url: '/ready' })
        expect(ready.statusCode).toBe(503)
      }
      expect(connected).toBe(3)
      expect(released).toBe(3)
      expect(destroyed).toBe(3)
    } finally {
      await app.close()
    }
  })

  it('fails readiness when the injected consumer probe is stopped', async () => {
    const app = buildServer({
      readinessProbes: [
        {
          name: 'consumer',
          check: async () => {
            throw new Error('consumer heartbeat is stale')
          }
        }
      ]
    })
    try {
      const ready = await app.inject({ method: 'GET', url: '/ready' })
      expect(ready.statusCode).toBe(503)
      expect(
        (ready.json() as Envelope).data.checks.find(
          (check) => check.name === 'consumer'
        )?.status
      ).toBe('failed')
      const live = await app.inject({ method: 'GET', url: '/live' })
      expect(live.statusCode).toBe(200)
    } finally {
      await app.close()
    }
  })
  it('returns 503 when destruction rejects the timed out query', async () => {
    let destroyed = 0
    let rejectQuery: (error: Error) => void = () => undefined
    const pool = {
      connect: async () => ({
        query: () =>
          new Promise((_resolve, reject) => {
            rejectQuery = reject
          }),
        release: (error?: Error) => {
          if (error) {
            destroyed += 1
            rejectQuery(error)
          }
        }
      })
    }
    const app = buildServer({
      persistence: { kind: 'postgres-pool', pool: pool as never },
      durableInbound: true
    })
    try {
      const ready = await app.inject({ method: 'GET', url: '/ready' })
      expect(ready.statusCode).toBe(503)
      expect(destroyed).toBe(1)
      expect(
        (await app.inject({ method: 'GET', url: '/live' })).statusCode
      ).toBe(200)
    } finally {
      await app.close()
    }
  })

  it('bounds pending pool admission and destroys a late client exactly once', async () => {
    let connected = 0
    let released = 0
    let queried = 0
    let resolveConnect: (client: unknown) => void = () => undefined
    const pool = {
      connect: () => {
        connected += 1
        return new Promise((resolve) => {
          resolveConnect = resolve
        })
      }
    }
    const app = buildServer({
      persistence: { kind: 'postgres-pool', pool: pool as never },
      durableInbound: true
    })
    try {
      expect(
        (await app.inject({ method: 'GET', url: '/ready' })).statusCode
      ).toBe(503)
      for (let i = 0; i < 4; i += 1) {
        expect(
          (await app.inject({ method: 'GET', url: '/ready' })).statusCode
        ).toBe(503)
      }
      expect(connected).toBe(1)
      resolveConnect({
        query: async () => {
          queried += 1
        },
        release: (error?: Error) => {
          expect(error).toBeInstanceOf(Error)
          released += 1
        }
      })
      await new Promise((resolve) => setImmediate(resolve))
      expect(released).toBe(1)
      expect(queried).toBe(0)
    } finally {
      await app.close()
    }
  })

  it('ignores late query success and recovers after the outstanding operation settles', async () => {
    let released = 0
    let connected = 0
    let resolveQuery: () => void = () => undefined
    const pool = {
      connect: async () => {
        connected += 1
        const first = connected === 1
        return {
          query: () =>
            first
              ? new Promise<void>((resolve) => {
                  resolveQuery = resolve
                })
              : Promise.resolve(),
          release: () => {
            released += 1
          }
        }
      }
    }
    const app = buildServer({
      persistence: { kind: 'postgres-pool', pool: pool as never },
      durableInbound: true
    })
    try {
      expect(
        (await app.inject({ method: 'GET', url: '/ready' })).statusCode
      ).toBe(503)
      expect(
        (await app.inject({ method: 'GET', url: '/ready' })).statusCode
      ).toBe(503)
      expect(connected).toBe(1)
      resolveQuery()
      await new Promise((resolve) => setImmediate(resolve))
      expect(released).toBe(1)
      expect(
        (await app.inject({ method: 'GET', url: '/ready' })).statusCode
      ).toBe(200)
      expect(released).toBe(2)
    } finally {
      await app.close()
    }
  })
})
