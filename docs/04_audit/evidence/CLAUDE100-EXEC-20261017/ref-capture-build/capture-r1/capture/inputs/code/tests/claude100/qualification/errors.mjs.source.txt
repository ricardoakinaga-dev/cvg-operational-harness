export const QUALIFICATION_STATUSES = Object.freeze([
  'MATCH_REQUIRES_REVIEW',
  'MISMATCH',
  'INVALID_INPUT',
  'UNTRUSTED_CAPTURE',
  'BLOCKED_REFERENCE',
  'BLOCKED_CVG_SPEC',
  'UNSUPPORTED_RULE',
  'INFRA_FAILURE'
])

export class QualificationError extends Error {
  constructor(status, message, options) {
    super(message, options)
    this.name = 'QualificationError'
    this.status = status
  }
}
