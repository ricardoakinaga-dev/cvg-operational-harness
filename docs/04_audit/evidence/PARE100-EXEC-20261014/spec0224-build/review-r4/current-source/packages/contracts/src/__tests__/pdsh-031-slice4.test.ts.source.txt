import { describe, expect, it } from 'vitest'
import { isLoopDecision, validateLoopDecision } from '../execution-v2.ts'

function errorsFor(value: unknown): readonly string[] {
  const result = validateLoopDecision(value)
  expect(result.valid).toBe(false)
  return result.errors
}

describe('PDSH-031 fatia 4 — loop decision validator edges', () => {
  it('rejects non-objects and unsupported enumerations', () => {
    expect(validateLoopDecision('nope')).toEqual({
      valid: false,
      errors: ['decision must be an object']
    })
    expect(errorsFor({ decisionType: 'TELEPORT' })).toContain(
      'decisionType is not a supported decision'
    )
    expect(errorsFor({ decisionType: 'RESPOND' })).toContain(
      'reasonCode is not a supported reason code'
    )
  })

  it('rejects invalid optional string and array fields', () => {
    expect(errorsFor({ decisionType: 'RESPOND', toolId: 7 })).toContain(
      'toolId must be a non-empty string when present'
    )
    expect(errorsFor({ decisionType: 'RESPOND', toolVersion: ' ' })).toContain(
      'toolVersion must be a non-empty string when present'
    )
    expect(errorsFor({ decisionType: 'RESPOND', query: 7 })).toContain(
      'query must be a non-empty string when present'
    )
    expect(
      errorsFor({ decisionType: 'RESPOND', knowledgeCategories: 'nope' })
    ).toContain('knowledgeCategories must be a string array when present')
    expect(errorsFor({ decisionType: 'RESPOND', responseIntent: 7 })).toContain(
      'responseIntent must be a non-empty string when present'
    )
    expect(errorsFor({ decisionType: 'RESPOND', responseText: 7 })).toContain(
      'responseText must be a string when present'
    )
    expect(
      errorsFor({ decisionType: 'RESPOND', verificationTarget: 7 })
    ).toContain('verificationTarget must be a non-empty string when present')
  })

  it('rejects value decisions without a selection', () => {
    expect(errorsFor({ decisionType: 'CALL_TOOL' })).toContain(
      'CALL_TOOL requires a toolId'
    )
    expect(
      errorsFor({ decisionType: 'SEARCH_KNOWLEDGE', query: '   ' })
    ).toContain('SEARCH_KNOWLEDGE requires a query')
    expect(errorsFor({ decisionType: 'VERIFY' })).toContain(
      'VERIFY requires a verificationTarget'
    )
  })

  it('rejects every invalid ASK_USER request shape', () => {
    expect(errorsFor({ decisionType: 'ASK_USER' })).toContain(
      'ASK_USER requires a requestedInput object'
    )
    expect(
      errorsFor({
        decisionType: 'ASK_USER',
        requestedInput: { questionType: 'GUESS' }
      })
    ).toContain('requestedInput.questionType is invalid')
    expect(
      errorsFor({
        decisionType: 'ASK_USER',
        requestedInput: { questionType: 'CLARIFICATION', missingFields: 'x' }
      })
    ).toContain('requestedInput.missingFields must be a string array')
    expect(
      errorsFor({
        decisionType: 'ASK_USER',
        requestedInput: { questionType: 'CLARIFICATION', missingFields: [] }
      })
    ).toContain('requestedInput.promptIntent is required')
  })

  it('accepts valid decisions and narrows through the guard', () => {
    const valid = {
      decisionType: 'ASK_USER',
      reasonCode: 'MISSING_INFORMATION',
      requestedInput: {
        questionType: 'MISSING_FIELD',
        missingFields: ['resource'],
        promptIntent: 'Which resource?'
      }
    }
    expect(validateLoopDecision(valid)).toEqual({ valid: true, errors: [] })
    expect(isLoopDecision(valid)).toBe(true)
    expect(isLoopDecision(null)).toBe(false)
  })
})
