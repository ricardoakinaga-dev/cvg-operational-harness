import { describe, expect, it } from 'vitest'
import { withoutTrailingSlashes } from '../url.ts'

describe('withoutTrailingSlashes (AUD-0599, CodeQL js/polynomial-redos)', () => {
  it('drops only trailing slashes', () => {
    expect(withoutTrailingSlashes('https://api.example.com/v1///')).toBe(
      'https://api.example.com/v1'
    )
    expect(withoutTrailingSlashes('https://api.example.com/v1')).toBe(
      'https://api.example.com/v1'
    )
    expect(withoutTrailingSlashes('///')).toBe('')
    expect(withoutTrailingSlashes('')).toBe('')
  })

  it('runs in linear time on long runs of slashes', () => {
    const started = performance.now()
    expect(withoutTrailingSlashes(`${'/'.repeat(200_000)}x`)).toBe(
      `${'/'.repeat(200_000)}x`
    )
    expect(performance.now() - started).toBeLessThan(1_000)
  })
})
