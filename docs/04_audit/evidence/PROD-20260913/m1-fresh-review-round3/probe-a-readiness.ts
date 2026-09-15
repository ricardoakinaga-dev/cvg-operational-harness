import { buildServer } from '/home/ricardo/cvg-agent-secretary-v2/apps/api/src/server.ts'

interface Result {
  case: string
  status: number
  elapsedMs: number
  connected: number
  destroyed: number
  releasedClean: number
  queried: number
  liveStatus: number
  checks?: unknown
}

const out: Result[] = []

async function caseTimeoutDestroysPendingQuery(): Promise<void> {
  let destroyed = 0
  let releasedClean = 0
  let rejectQuery: (e: Error) => void = () => undefined
  const pool = {
    connect: async () => ({
      query: () =>
        new Promise((_resolve, reject) => {
          rejectQuery = reject
        }),
      release: (error?: Error) => {
        if (error) {
          destroyed += 1
          rejectQuery(new Error('Connection terminated'))
        } else {
          releasedClean += 1
        }
      }
    })
  }
  const app = buildServer({
    persistence: { kind: 'postgres-pool', pool: pool as never },
    durableInbound: true
  })
  try {
    const start = Date.now()
    const res = await app.inject({ method: 'GET', url: '/ready' })
    const live = await app.inject({ method: 'GET', url: '/live' })
    out.push({
      case: 'timeout destroys pending query (release(error) rejects it)',
      status: res.statusCode,
      elapsedMs: Date.now() - start,
      connected: 1,
      destroyed,
      releasedClean,
      queried: 1,
      liveStatus: live.statusCode,
      checks: (res.json() as { data: unknown }).data
    })
  } finally {
    await app.close()
  }
}

async function caseLateSuccessAfterDestroy(): Promise<void> {
  let connected = 0
  let destroyed = 0
  let releasedClean = 0
  let resolveQuery: () => void = () => undefined
  const pool = {
    connect: async () => {
      connected += 1
      return {
        query: () =>
          new Promise<void>((resolve) => {
            resolveQuery = resolve
          }),
        release: (error?: Error) => {
          if (error) destroyed += 1
          else releasedClean += 1
        }
      }
    }
  }
  const app = buildServer({
    persistence: { kind: 'postgres-pool', pool: pool as never },
    durableInbound: true
  })
  try {
    const res = await app.inject({ method: 'GET', url: '/ready' })
    resolveQuery()
    await new Promise((r) => setImmediate(r))
    const res2 = await app.inject({ method: 'GET', url: '/ready' })
    const live = await app.inject({ method: 'GET', url: '/live' })
    out.push({
      case: 'late query success after deadline is ignored; no double destroy; probe recovers next round',
      status: res.statusCode,
      elapsedMs: -1,
      connected,
      destroyed,
      releasedClean,
      queried: 2,
      liveStatus: live.statusCode,
      checks: { secondReadyStatus: res2.statusCode }
    })
  } finally {
    await app.close()
  }
}

async function caseBlockedAdmission(): Promise<void> {
  let connected = 0
  let destroyed = 0
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
    const first = await app.inject({ method: 'GET', url: '/ready' })
    const start = Date.now()
    const rest: number[] = []
    for (let i = 0; i < 5; i += 1) {
      rest.push((await app.inject({ method: 'GET', url: '/ready' })).statusCode)
    }
    const blockedElapsed = Date.now() - start
    let queried = 0
    resolveConnect({
      query: async () => {
        queried += 1
      },
      release: (error?: Error) => {
        if (error) destroyed += 1
      }
    })
    await new Promise((r) => setImmediate(r))
    out.push({
      case: 'blocked acquisition: connect() invoked once for 6 probes; late client destroyed once, never queried',
      status: first.statusCode,
      elapsedMs: blockedElapsed,
      connected,
      destroyed,
      releasedClean: 0,
      queried,
      liveStatus: -1,
      checks: { followupStatuses: rest }
    })
  } finally {
    await app.close()
  }
}

async function caseConcurrentProbes(): Promise<void> {
  let connected = 0
  const pool = {
    connect: () => {
      connected += 1
      return new Promise(() => undefined)
    }
  }
  const app = buildServer({
    persistence: { kind: 'postgres-pool', pool: pool as never },
    durableInbound: true
  })
  try {
    const [a, b] = await Promise.all([
      app.inject({ method: 'GET', url: '/ready' }),
      app.inject({ method: 'GET', url: '/ready' })
    ])
    out.push({
      case: 'two concurrent probes admit one acquisition',
      status: a.statusCode,
      elapsedMs: -1,
      connected,
      destroyed: 0,
      releasedClean: 0,
      queried: 0,
      liveStatus: b.statusCode
    })
  } finally {
    await app.close()
  }
}

async function main(): Promise<void> {
  const keepAlive = setInterval(() => undefined, 1000)
  try {
    await caseTimeoutDestroysPendingQuery()
    await caseLateSuccessAfterDestroy()
    await caseBlockedAdmission()
    await caseConcurrentProbes()
    console.log(JSON.stringify(out, null, 1))
  } finally {
    clearInterval(keepAlive)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
