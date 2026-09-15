import { buildServerFromEnv } from './server.ts'
import { createConfiguredOperatorIdentityResolver } from './operator-identity.ts'
import { serializeStartupFailure } from './startup-failure.ts'
import { createShutdownController, parseEnv } from '@cvg/shared'

async function start() {
  parseEnv(process.env)
  const operatorIdentityResolver = createConfiguredOperatorIdentityResolver(
    process.env
  )
  const app = await buildServerFromEnv(
    process.env,
    operatorIdentityResolver ? { operatorIdentityResolver } : {}
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
  await app.listen({ port, host: '0.0.0.0' })
}

start().catch((error) => {
  console.error(serializeStartupFailure(error))
  process.exit(1)
})
