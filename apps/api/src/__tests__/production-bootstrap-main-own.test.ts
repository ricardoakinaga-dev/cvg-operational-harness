// @vitest-environment node
import { EventEmitter } from 'node:events'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance
} from 'vitest'

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  parse: vi.fn(),
  resolver: vi.fn()
}))
vi.mock('../production-bootstrap.ts', () => ({
  buildApiWithProductionSessions: mocks.build
}))
vi.mock('../operator-identity.ts', () => ({
  createConfiguredOperatorIdentityResolver: mocks.resolver
}))
vi.mock('@cvg/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@cvg/shared')>()),
  parseEnv: mocks.parse
}))

let signals: EventEmitter
let app: { listen: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }
let exit: MockInstance<typeof process.exit>

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  signals = new EventEmitter()
  const once = process.once.bind(process)
  vi.spyOn(process, 'once').mockImplementation((event, listener) => {
    if (event === 'SIGTERM' || event === 'SIGINT') {
      signals.once(event, listener)
      return process
    }
    return once(event, listener)
  })
  exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  app = {
    listen: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined)
  }
  mocks.build.mockResolvedValue(app)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function loadMain() {
  await import('../main.ts')
  await vi.dynamicImportSettled()
}

describe('own official main lifecycle', () => {
  it.each(['SIGTERM', 'SIGINT'])(
    'closes the composed app once on %s',
    async (signal) => {
      await loadMain()
      expect(app.listen).toHaveBeenCalledTimes(1)
      signals.emit(signal)
      signals.emit(signal === 'SIGTERM' ? 'SIGINT' : 'SIGTERM')
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))
      expect(app.close).toHaveBeenCalledTimes(1)
      expect(exit).toHaveBeenCalledTimes(1)
    }
  )

  it('waits for partial bootstrap then closes without listening after a signal', async () => {
    let complete!: (value: typeof app) => void
    mocks.build.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    await loadMain()
    signals.emit('SIGTERM')
    expect(exit).not.toHaveBeenCalled()
    complete(app)
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))
    expect(app.listen).not.toHaveBeenCalled()
    expect(app.close).toHaveBeenCalledTimes(1)
  })

  it('closes composed pools through app.close after listen failure', async () => {
    app.listen.mockRejectedValueOnce(new Error('listen failed'))
    await loadMain()
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1))
    expect(app.close).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('api.startup_failed')
    )
  })

  it('exits closed without listening when production composition rejects', async () => {
    mocks.build.mockRejectedValueOnce(
      new Error('Production operator-session bootstrap failed')
    )
    await loadMain()
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1))
    expect(app.listen).not.toHaveBeenCalled()
    expect(app.close).not.toHaveBeenCalled()
  })

  it('rejects bad baseline env before any composition', async () => {
    mocks.parse.mockImplementationOnce(() => {
      throw new Error('invalid env')
    })
    await loadMain()
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1))
    expect(mocks.build).not.toHaveBeenCalled()
  })

  it('bounds shutdown even when a startup dependency never settles', async () => {
    vi.useFakeTimers()
    mocks.build.mockImplementationOnce(() => new Promise(() => undefined))
    await loadMain()
    signals.emit('SIGTERM')
    await vi.advanceTimersByTimeAsync(15_000)
    expect(exit).toHaveBeenCalledExactlyOnceWith(1)
    expect(app.listen).not.toHaveBeenCalled()
  })
})
