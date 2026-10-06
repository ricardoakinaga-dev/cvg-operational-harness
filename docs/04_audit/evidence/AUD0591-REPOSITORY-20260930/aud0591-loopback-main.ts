import { buildServerFromEnv } from '../apps/api/src/server.ts'
import { createConfiguredOperatorIdentityResolver } from '../apps/api/src/operator-identity.ts'
import { serializeStartupFailure } from '../apps/api/src/startup-failure.ts'
import { createShutdownController, parseEnv } from '@cvg/shared'
import {
  CompositeTelemetry,
  JsonLineObservationExporter
} from '@cvg/observability'

async function start() {
  parseEnv(process.env)
  const operatorIdentityResolver = createConfiguredOperatorIdentityResolver(
    process.env
  )
  const telemetry = new CompositeTelemetry({
    exporters: [new JsonLineObservationExporter({ name: 'api-json-lines' })]
  })
  const app = await buildServerFromEnv(
    process.env,
    operatorIdentityResolver
      ? { operatorIdentityResolver, telemetry }
      : { telemetry }
  )
  const shutdown = createShutdownController({
    close: () => app.close(),
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
  const port = Number(process.env.PORT ?? 3000)
  await app.listen({ port, host: '127.0.0.1' })
}

start().catch((error) => {
  console.error(serializeStartupFailure(error))
  process.exit(1)
})
