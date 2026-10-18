export type QualificationStatus =
  | 'MATCH_REQUIRES_REVIEW'
  | 'MISMATCH'
  | 'INVALID_INPUT'
  | 'UNTRUSTED_CAPTURE'
  | 'BLOCKED_REFERENCE'
  | 'BLOCKED_CVG_SPEC'
  | 'UNSUPPORTED_RULE'
  | 'INFRA_FAILURE'
export const QUALIFICATION_STATUSES: readonly QualificationStatus[]
export class QualificationError extends Error {
  readonly status: QualificationStatus
  constructor(
    status: QualificationStatus,
    message: string,
    options?: ErrorOptions
  )
}
