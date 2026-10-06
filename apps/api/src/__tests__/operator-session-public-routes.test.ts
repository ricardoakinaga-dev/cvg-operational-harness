import { describe, expect, it } from 'vitest'
import { createTrustedOperatorIdentityResolver } from '../operator-identity.ts'
import { createInMemoryOperatorSessionStore } from '../operator-session.ts'
import { buildServer } from '../server.ts'

const probeCases = [
  { method: 'GET', path: '/health', expected: 200 },
  { method: 'HEAD', path: '/health', expected: 200 },
  { method: 'GET', path: '/health/metrics', expected: 404 },
  { method: 'HEAD', path: '/health/metrics', expected: 404 },
  { method: 'GET', path: '/live', expected: 200 },
  { method: 'HEAD', path: '/live', expected: 200 },
  { method: 'GET', path: '/ready', expected: 200 },
  { method: 'HEAD', path: '/ready', expected: 200 }
] as const

describe('trusted session isolation from public health probes', () => {
  it.each(probeCases)(
    '$method $path keeps its public response when a session cookie is unknown',
    async ({ method, path, expected }) => {
      const backingStore = createInMemoryOperatorSessionStore()
      let lookupCalls = 0
      const operatorSessionStore = {
        ...backingStore,
        async get(sessionId: string) {
          lookupCalls += 1
          return backingStore.get(sessionId)
        }
      }
      const app = buildServer({
        identityMode: 'trusted',
        operatorIdentityResolver: createTrustedOperatorIdentityResolver({
          secret: 'aud0589-session-probes-synthetic-signing-key'
        }),
        operatorSessionStore,
        requestMetricsEnabled: false
      })

      try {
        const withoutCookie = await app.inject({ method, url: path })
        const unknownCookie = await app.inject({
          method,
          url: path,
          headers: {
            cookie: 'cvg_operator_session=opsess_unknownsynthetic0001'
          }
        })

        expect(withoutCookie.statusCode).toBe(expected)
        expect(unknownCookie.statusCode).toBe(expected)
        expect(lookupCalls).toBe(0)
      } finally {
        await app.close()
      }
    }
  )
})
