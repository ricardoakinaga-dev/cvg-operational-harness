import { buildServer } from '/home/ricardo/cvg-agent-secretary-v2/apps/api/src/server.ts'

async function main(): Promise<void> {
  const keepAlive = setInterval(() => undefined, 1000)
  const results: Record<string, unknown>[] = []
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  let live = 0
  const patchedSet: typeof setTimeout = ((
    ...args: Parameters<typeof setTimeout>
  ) => {
    live += 1
    return realSetTimeout(...args)
  }) as typeof setTimeout
  const patchedClear: typeof clearTimeout = ((
    timer: Parameters<typeof clearTimeout>[0]
  ) => {
    live -= 1
    return realClearTimeout(timer)
  }) as typeof clearTimeout
  globalThis.setTimeout = patchedSet
  globalThis.clearTimeout = patchedClear
  try {
    let rejectQuery: (e: Error) => void = () => undefined
    const secretError = () =>
      new Error(
        'connection string postgres://secret_user:secret_pw@db:5432/prod failed'
      )
    const pool = {
      connect: async () => ({
        query: () =>
          new Promise((_r, reject) => {
            rejectQuery = reject
          }),
        release: (error?: Error) => {
          if (error) rejectQuery(secretError())
        }
      })
    }
    const app = buildServer({
      persistence: { kind: 'postgres-pool', pool: pool as never },
      durableInbound: true
    })
    const before = live
    const res = await app.inject({ method: 'GET', url: '/ready' })
    const body = JSON.stringify(res.json())
    const after = live
    results.push({
      case: 'timers cleared + redaction',
      status: res.statusCode,
      liveTimersBefore: before,
      liveTimersAfter: after,
      leakedSecret: body.includes('secret_pw') || body.includes('postgres://'),
      detail: (
        res.json() as {
          data: { checks: Array<{ name: string; detail: string }> }
        }
      ).data.checks.find((c) => c.name === 'database')?.detail
    })
    await app.close()
  } finally {
    globalThis.setTimeout = realSetTimeout
    globalThis.clearTimeout = realClearTimeout
    clearInterval(keepAlive)
  }
  console.log(JSON.stringify(results, null, 1))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
