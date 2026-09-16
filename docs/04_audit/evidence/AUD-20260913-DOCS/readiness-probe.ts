import { buildServer } from '/tmp/cvg-docs-audit-20260913-_uu7d641/candidate/apps/api/src/server.ts'
async function main() {
  let queries = 0
  const client = {
    query: async () => {
      queries++
      throw new Error('synthetic database unavailable')
    }
  }
  const app = await buildServer({
    persistence: { kind: 'postgres', client: client as any },
    durableInbound: true
  })
  try {
    for (const url of ['/ready', '/live']) {
      const r = await app.inject({ method: 'GET', url })
      console.log(
        JSON.stringify({ url, status: r.statusCode, body: r.json(), queries })
      )
    }
  } finally {
    await app.close()
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
