import { buildServer } from '/home/ricardo/cvg-agent-secretary-v2/apps/api/src/server.ts'
async function main() {
  let rejectQuery: any
  let destroyed = 0
  const pool = {
    connect: async () => ({
      query: () =>
        new Promise((_, reject) => {
          rejectQuery = reject
        }),
      release: (err?: Error) => {
        if (err) {
          destroyed++
          rejectQuery(new Error('Connection terminated'))
        }
      }
    })
  }
  const app = buildServer({
    persistence: { kind: 'postgres-pool', pool: pool as never },
    durableInbound: true
  })
  const keepAlive = setInterval(() => {}, 1000)
  const start = Date.now()
  const res = await app.inject({ method: 'GET', url: '/ready' })
  console.log(
    JSON.stringify({
      case: 'release-timeout-rejects-query',
      status: res.statusCode,
      elapsed: Date.now() - start,
      destroyed,
      body: res.json()
    })
  )
  await app.close()
  clearInterval(keepAlive)
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
