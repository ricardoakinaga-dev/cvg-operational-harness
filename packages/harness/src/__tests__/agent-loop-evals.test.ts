import { describe, expect, it } from 'vitest'
import { LOOP_EVAL_DATASET, runLoopEvalSuite } from '../evals/loop-evals.ts'

describe('P3-EVAL — agent loop behavioural evals', () => {
  it('P3-EVAL-SUITE keeps the corpus bounded, unique and category-complete', () => {
    expect(LOOP_EVAL_DATASET.length).toBeGreaterThanOrEqual(8)
    const ids = new Set(LOOP_EVAL_DATASET.map((scenario) => scenario.id))
    expect(ids.size).toBe(LOOP_EVAL_DATASET.length)
    const categories = new Set(
      LOOP_EVAL_DATASET.map((scenario) => scenario.category)
    )
    for (const category of [
      'tool-selection',
      'ask-vs-act',
      'stop-vs-continue',
      'knowledge-refinement',
      'adversarial'
    ]) {
      expect(categories.has(category as never)).toBe(true)
    }
  })

  it('P3-EVAL-GOLDEN passes every trajectory and invariant scenario', async () => {
    const results = await runLoopEvalSuite()
    const failures = results.filter((result) => !result.pass)
    expect(
      failures.map((failure) => `${failure.id}: ${failure.failures.join('; ')}`)
    ).toEqual([])
    expect(results).toHaveLength(LOOP_EVAL_DATASET.length)
  })
})
