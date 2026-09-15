/**
 * PROD-01 baseline probe — reproduces D13-04 (/ready answers 200 with a
 * persistence client whose query always fails, so the database is never
 * actually probed).
 *
 * Synthetic only: the client throws on every query.
 */
import { buildServer } from '../../../../../apps/api/src/server.ts'

async function main(): Promise<void> {
  let queries = 0
  const client = {
    query: async () => {
      queries += 1
      throw new Error('synthetic database unavailable')
    }
  }
  const app = await buildServer({
    persistence: { kind: 'postgres', client: client as never },
    durableInbound: true
  })
  try {
    const results: Array<Record<string, unknown>> = []
    for (const url of ['/ready', '/live']) {
      const response = await app.inject({ method: 'GET', url })
      results.push({
        url,
        status: response.statusCode,
        body: response.json()
      })
    }
    const ready = results.find((entry) => entry.url === '/ready')
    const live = results.find((entry) => entry.url === '/live')
    console.log(
      JSON.stringify(
        {
          probe: 'readiness',
          queries,
          results,
          verdict:
            queries >= 1 && ready?.status === 503 && live?.status === 200
              ? 'PASS_PROBED'
              : 'FAIL_NO_PROBE'
        },
        null,
        2
      )
    )
  } finally {
    await app.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
