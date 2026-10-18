import { isDeepStrictEqual } from 'node:util'

const FIELDS = [
  'text',
  'modelCalls',
  'toolCalls',
  'inputTokens',
  'outputTokens',
  'effects'
]
function validate(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== FIELDS.length ||
    FIELDS.some((field) => !Object.hasOwn(value, field)) ||
    typeof value.text !== 'string' ||
    ['modelCalls', 'toolCalls', 'inputTokens', 'outputTokens'].some(
      (field) => !Number.isSafeInteger(value[field]) || value[field] < 0
    ) ||
    !Array.isArray(value.effects)
  )
    throw new Error('invalid reply projection')
}
/** A bounded transport projection, with no normalization of payload or effects. */
export function compareReplyProjections(reference, cvg) {
  validate(reference)
  validate(cvg)
  const mismatches = FIELDS.filter(
    (field) => !isDeepStrictEqual(reference[field], cvg[field])
  )
  if (mismatches.length)
    throw new Error(`reply difference: ${mismatches.join(',')}`)
  return {
    status: 'MATCH_REPLY_PROJECTION',
    fields: [...FIELDS],
    fullParity: 'NOT_VERIFIED'
  }
}
