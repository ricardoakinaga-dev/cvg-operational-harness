import { describe, expect, it } from 'vitest'
import { runtimeLogLevel } from '../server.ts'

/** ENGINE-PROD-FIX ENG-018: client refusals do not page as server errors. */
describe('runtime log level', () => {
  it('logs successes as info', () => {
    expect(runtimeLogLevel({ status: 'ok' })).toBe('info')
  })

  it.each(['unauthorized', 'forbidden', 'validation_failed', 'rate_limited'])(
    'logs the client refusal %s as a warning',
    (errorCode) => {
      expect(runtimeLogLevel({ status: 'error', errorCode })).toBe('warn')
    }
  )

  it.each(['internal_error', 'configuration_error', undefined])(
    'keeps %s as an error',
    (errorCode) => {
      expect(
        runtimeLogLevel(
          errorCode === undefined
            ? { status: 'error' }
            : { status: 'error', errorCode }
        )
      ).toBe('error')
    }
  )
})
