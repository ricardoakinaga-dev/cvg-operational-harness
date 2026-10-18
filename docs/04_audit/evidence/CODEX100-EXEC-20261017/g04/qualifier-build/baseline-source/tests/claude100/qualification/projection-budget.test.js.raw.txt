// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  assertProjectionBudget,
  MAX_PROJECTION_BYTES
} from './projection-budget.mjs'

describe('generated-resource accounting without producing a normalized value', () => {
  it('bounds numeric expansion before canonicalization, without serializing the document', () => {
    expect(assertProjectionBudget(1000001, [], [])).toBe(6000006)
    expect(4400001).toBeLessThan(6000006)
  })
  it('bounds the supplied amplification recipe before any output string allocation', () => {
    const input = Array.from({ length: 20000 }, () => ({ eventId: 'a' }))
    const policy = [
      { field: 'eventId', mode: 'id', namespace: 'n'.repeat(40000) }
    ]
    expect(() => assertProjectionBudget(320001, input, policy)).toThrow(
      expect.objectContaining({ status: 'INFRA_FAILURE' })
    )
    expect(input[0].eventId).toBe('a')
  })
  it('admits the approved namespace ID length without changing protected values', () => {
    const input = Array.from({ length: 20000 }, () => ({
      eventId: 'a',
      payload: { eventId: 'protected' },
      tenant: 'synthetic'
    }))
    const policy = [
      { field: 'eventId', mode: 'id', namespace: 'n'.repeat(128) }
    ]
    const estimate = assertProjectionBudget(1500001, input, policy)
    expect(estimate).toBeLessThan(MAX_PROJECTION_BYTES)
    expect(input[0]).toEqual({
      eventId: 'a',
      payload: { eventId: 'protected' },
      tenant: 'synthetic'
    })
  })
  it('has an exact local resource boundary and fails honestly above it', () => {
    expect(
      assertProjectionBudget(Math.floor(MAX_PROJECTION_BYTES / 6), [], [])
    ).toBeLessThanOrEqual(MAX_PROJECTION_BYTES)
    expect(() =>
      assertProjectionBudget(Math.floor(MAX_PROJECTION_BYTES / 6) + 1, [], [])
    ).toThrow(expect.objectContaining({ status: 'INFRA_FAILURE' }))
  })
})
