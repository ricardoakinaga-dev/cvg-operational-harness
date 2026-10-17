import { createCvgDifferentialSdk } from './cvg-reply.ts'
import {
  validateFailureCase,
  makeFailure,
  snapshotFailure,
  type FailureSnapshot
} from './failure-case.mjs'

export async function runCvgModelFailure(input: unknown) {
  const fixture = validateFailureCase(input)
  let modelBodies = 0
  const adapterErrors: FailureSnapshot[] = []
  const requests: unknown[] = []
  const sdk = createCvgDifferentialSdk({
    complete: async ({ signal, ...request }) => {
      if (++modelBodies > 1) throw new Error('unexpected model call')
      requests.push({
        request,
        signalProvided: signal !== undefined,
        signalAborted: signal?.aborted ?? false
      })
      const error = makeFailure(fixture)
      adapterErrors.push(snapshotFailure(error))
      throw error
    }
  })
  const sessionId = `pare100-${fixture.id}`
  await sdk.openSession(sessionId)
  const turn = await sdk.sendTurn(sessionId, fixture.message)
  const events = await sdk.readEvents(sessionId)
  return {
    version: 1,
    fixtureId: fixture.id,
    native: { turn, events, modelBodies, requests, adapterErrors },
    observationStatus: 'NATIVE_FAILURE_MEASUREMENT_NOT_PARITY'
  }
}
