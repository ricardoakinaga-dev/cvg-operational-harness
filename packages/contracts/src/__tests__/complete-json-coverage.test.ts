import { describe, expect, it } from 'vitest'
import {
  canonicalizeCompleteJson,
  CompleteJsonError
} from '../complete-json.ts'

/**
 * Wave 4 integration: the per-file 100% coverage gate for packages/contracts.
 * complete-json.ts is the SPEC 0224 donor file ported byte for byte (receipt
 * human-decisions-17), and so is its own test; these cases close the remaining
 * lines and branches with behaviour, not with ignore comments.
 */
const code = (fn: () => unknown): string | undefined => {
  try {
    fn()
    return undefined
  } catch (error) {
    expect(error).toBeInstanceOf(CompleteJsonError)
    return (error as CompleteJsonError).code
  }
}

describe('canonicalizeCompleteJson: limits', () => {
  it('refuses a negative, fractional or unsafe limit', () => {
    for (const limits of [
      { maxBytes: -1 },
      { maxDepth: 1.5 },
      { maxNodes: Number.MAX_SAFE_INTEGER + 1 },
      { maxBytes: Number.NaN }
    ])
      expect(code(() => canonicalizeCompleteJson(1, limits))).toBe(
        'RESULT_COMPLEXITY'
      )
  })

  it('a scalar past the byte limit is too large', () => {
    expect(code(() => canonicalizeCompleteJson(true, { maxBytes: 3 }))).toBe(
      'RESULT_TOO_LARGE'
    )
    expect(canonicalizeCompleteJson(false, { maxBytes: 5 })).toBe('false')
    expect(code(() => canonicalizeCompleteJson(null, { maxBytes: 3 }))).toBe(
      'RESULT_TOO_LARGE'
    )
  })

  it('a string whose escapes overflow mid-scan is too large', () => {
    // 3 control characters escape to 6 bytes each: 2 + 18 > 10.
    expect(
      code(() =>
        canonicalizeCompleteJson('\u0001\u0002\u0003', { maxBytes: 10 })
      )
    ).toBe('RESULT_TOO_LARGE')
    // A long string is refused before scanning (UTF-16 lower bound).
    expect(
      code(() => canonicalizeCompleteJson('x'.repeat(20), { maxBytes: 10 }))
    ).toBe('RESULT_TOO_LARGE')
  })

  it('depth and node limits', () => {
    expect(code(() => canonicalizeCompleteJson([[[1]]], { maxDepth: 2 }))).toBe(
      'RESULT_COMPLEXITY'
    )
    expect(
      code(() => canonicalizeCompleteJson([1, 2, 3], { maxNodes: 2 }))
    ).toBe('RESULT_COMPLEXITY')
    expect(
      code(() =>
        canonicalizeCompleteJson({ a: 1, b: 2, c: 3 }, { maxNodes: 2 })
      )
    ).toBe('RESULT_COMPLEXITY')
    expect(code(() => canonicalizeCompleteJson(1, { maxNodes: 0 }))).toBe(
      'RESULT_COMPLEXITY'
    )
  })
})

describe('canonicalizeCompleteJson: strings', () => {
  it('escapes quotes, backslash and the short control escapes like JSON.stringify', () => {
    const text = '"\\\b\t\n\f\r'
    expect(canonicalizeCompleteJson(text)).toBe(JSON.stringify(text))
  })

  it('counts 1, 2, 3 and 4 UTF-8 bytes and other control characters', () => {
    const text = 'aé€😀\u0007'
    expect(canonicalizeCompleteJson(text)).toBe(JSON.stringify(text))
  })

  it('refuses a lone high or low surrogate', () => {
    expect(code(() => canonicalizeCompleteJson('\ud800x'))).toBe('INVALID_JSON')
    expect(code(() => canonicalizeCompleteJson('\ud800'))).toBe('INVALID_JSON')
    expect(code(() => canonicalizeCompleteJson('\udc00'))).toBe('INVALID_JSON')
  })
})

describe('canonicalizeCompleteJson: values', () => {
  it('canonical numbers, null and sorted object keys', () => {
    expect(canonicalizeCompleteJson({ b: [1.5, null, true], a: 'x' })).toBe(
      '{"a":"x","b":[1.5,null,true]}'
    )
  })

  it('refuses non-finite numbers, negative zero and non-JSON types', () => {
    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -0,
      undefined,
      () => 1,
      Symbol('s'),
      1n
    ])
      expect(code(() => canonicalizeCompleteJson(value))).toBe('INVALID_JSON')
  })

  it('accepts a null-prototype object and refuses exotic prototypes', () => {
    const bare = Object.create(null) as Record<string, unknown>
    bare.k = 1
    expect(canonicalizeCompleteJson(bare)).toBe('{"k":1}')
    expect(code(() => canonicalizeCompleteJson(new Date(0)))).toBe(
      'INVALID_JSON'
    )
    const arrayLike = [1]
    Object.setPrototypeOf(arrayLike, Object.prototype)
    expect(code(() => canonicalizeCompleteJson(arrayLike))).toBe('INVALID_JSON')
  })

  it('refuses cycles but accepts the same object twice in sibling positions', () => {
    const shared = { v: 1 }
    expect(canonicalizeCompleteJson([shared, shared])).toBe('[{"v":1},{"v":1}]')
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(code(() => canonicalizeCompleteJson(loop))).toBe('INVALID_JSON')
  })

  it('refuses symbol keys, sparse arrays, extra array properties and accessors', () => {
    expect(code(() => canonicalizeCompleteJson({ [Symbol('k')]: 1 }))).toBe(
      'INVALID_JSON'
    )
    // eslint-disable-next-line no-sparse-arrays
    expect(code(() => canonicalizeCompleteJson([1, , 3]))).toBe('INVALID_JSON')
    const extra = [1] as unknown as Record<string, unknown>
    extra.x = 2
    expect(code(() => canonicalizeCompleteJson(extra))).toBe('INVALID_JSON')
    const accessor = Object.defineProperty({}, 'g', {
      get: () => 1,
      enumerable: true
    })
    expect(code(() => canonicalizeCompleteJson(accessor))).toBe('INVALID_JSON')
  })

  it('an array longer than the remaining node budget is refused before reading it', () => {
    expect(
      code(() =>
        canonicalizeCompleteJson(new Array(5).fill(0), { maxNodes: 3 })
      )
    ).toBe('RESULT_COMPLEXITY')
  })
})
