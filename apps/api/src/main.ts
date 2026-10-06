import { buildApiWithProductionSessions } from './production-bootstrap.ts'
import { createConfiguredOperatorIdentityResolver } from './operator-identity.ts'
import { serializeStartupFailure } from './startup-failure.ts'
import { createShutdownController, parseEnv } from '@cvg/shared'
import {
  CompositeTelemetry,
  JsonLineObservationExporter
} from '@cvg/observability'

async function start() {
  let app:
    | Awaited<ReturnType<typeof buildApiWithProductionSessions>>
    | undefined
  let startup: Promise<void> = Promise.resolve()
  const shutdown = createShutdownController({
    close: async () => {
      // A signal during preflight waits for partial startup cleanup. The
      // controller bounds this wait and startup never listens after a signal.
      await startup.catch(() => undefined)
      await app?.close()
    },
    exit: (code) => process.exit(code),
    log: (event) => {
      if (event.type !== 'shutdown.started') {
        console.error(
          JSON.stringify({ event: event.type, signal: event.signal })
        )
      }
    }
  })
  shutdown.install(process)
  startup = (async () => {
    parseEnv(process.env)
    const operatorIdentityResolver = createConfiguredOperatorIdentityResolver(
      process.env
    )
    if (process.env.NODE_ENV === 'production' && !operatorIdentityResolver) {
      throw new Error(
        'Production requires an injected operator identity resolver'
      )
    }
    const telemetry = new CompositeTelemetry({
      exporters: [new JsonLineObservationExporter({ name: 'api-json-lines' })]
    })
    app = await buildApiWithProductionSessions(
      process.env,
      operatorIdentityResolver
        ? { operatorIdentityResolver, telemetry }
        : { telemetry }
    )
    if (shutdown.isShuttingDown()) return
    const port = Number(process.env.PORT ?? 3000)
    await app.listen({ port, host: '0.0.0.0' })
  })()
  try {
    await startup
  } catch (error) {
    console.error(serializeStartupFailure(error))
    await shutdown.shutdown('SIGTERM', 1)
  }
}

start().catch((error) => {
  console.error(serializeStartupFailure(error))
  process.exit(1)
})
