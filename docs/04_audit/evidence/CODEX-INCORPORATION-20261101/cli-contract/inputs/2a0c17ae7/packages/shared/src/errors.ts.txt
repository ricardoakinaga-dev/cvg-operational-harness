import { ZodError } from 'zod'

export const ErrorCodes = {
  duplicate_message: 'duplicate_message',
  invalid_channel: 'invalid_channel',
  invalid_pagination: 'invalid_pagination',
  empty_body: 'empty_body',
  session_not_found: 'session_not_found',
  policy_unavailable: 'policy_unavailable',
  workflow_failed: 'workflow_failed',
  tool_not_found: 'tool_not_found',
  validation_failed: 'validation_failed',
  action_requires_approval: 'action_requires_approval',
  invalid_action: 'invalid_action',
  conflict: 'conflict',
  unauthorized: 'unauthorized',
  missing_summary: 'missing_summary',
  approval_not_pending: 'approval_not_pending',
  operator_not_allowed: 'operator_not_allowed',
  invalid_priority: 'invalid_priority',
  missing_context: 'missing_context',
  insufficient_context: 'insufficient_context',
  forbidden: 'forbidden',
  rate_limited: 'rate_limited',
  secure_transport_required: 'secure_transport_required',
  unsupported_media_type: 'unsupported_media_type',
  payload_too_large: 'payload_too_large',
  not_found: 'not_found',
  request_uri_too_long: 'request_uri_too_long',
  configuration_error: 'configuration_error'
} as const

export type ErrorCode = keyof typeof ErrorCodes

export class DomainError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

export function toSafeError(error: unknown): { code: string; message: string } {
  if (error instanceof DomainError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof ZodError) {
    return { code: 'validation_failed', message: 'Input validation failed' }
  }
  return { code: 'internal_error', message: 'Unexpected internal error' }
}
