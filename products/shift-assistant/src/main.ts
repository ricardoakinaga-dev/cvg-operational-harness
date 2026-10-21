import type { ShiftLogger } from './assistant.ts'
import { composeShiftApp } from './compose.ts'
import { loadShiftConfig } from './config.ts'

const logger: ShiftLogger = {
  info: (event, fields) =>
    console.log(JSON.stringify({ level: 'info', event, ...fields })),
  error: (event, fields) =>
    console.error(JSON.stringify({ level: 'error', event, ...fields }))
}

async function start(): Promise<void> {
  const config = loadShiftConfig(process.env)
  const app = composeShiftApp(config, { logger })
  const pending = app.store.unprocessedMessages().length
  const port = await app.start()

  // Bounded by SHIFT_SHUTDOWN_TIMEOUT_MS; an expired budget is not a clean
  // exit, so the supervisor sees a non-zero code.
  const stop = async () => {
    const result = await app.stop().catch(() => ({ clean: false }))
    logger.info('shift.stopped', { clean: result.clean })
    process.exit(result.clean ? 0 : 1)
  }
  process.once('SIGTERM', () => void stop())
  process.once('SIGINT', () => void stop())

  logger.info('shift.started', {
    provider: config.env.SHIFT_PROVIDER,
    port,
    members: config.members.length,
    resumedMessages: pending,
    paused: app.store.paused
  })
}

start().catch((error: unknown) => {
  logger.error('shift.start.failed', {
    message: error instanceof Error ? error.message : 'unknown'
  })
  process.exit(1)
})
