import { describe, expect, it } from 'vitest'
import * as contracts from '@cvg/harness-contracts'
import * as shared from '../index.ts'

// SPEC 0290 D5 (PAR-C01): one token estimator for the harness trigger and the gateway pressure
// check. The gateway imports it from @cvg/shared, the harness from @cvg/harness-contracts; this
// package declares both, so the identity is proved here (it used to sit in the gateway test,
// which does not declare @cvg/harness-contracts).
describe('the shared token estimator is the contracts one', () => {
  it('re-exports the same function and constants, not a copy', () => {
    expect(shared.estimateInputTokens).toBe(contracts.estimateInputTokens)
    expect(shared.ESTIMATE_BYTES_PER_TOKEN).toBe(
      contracts.ESTIMATE_BYTES_PER_TOKEN
    )
    expect(shared.ESTIMATE_FRAMING_TOKENS).toBe(
      contracts.ESTIMATE_FRAMING_TOKENS
    )
  })
})
