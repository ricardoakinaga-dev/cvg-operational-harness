export type ProcessServiceErrorCode =
  | 'invalid_request'
  | 'invalid_env'
  | 'invalid_limits'
  | 'service_closed'
  | 'service_busy'
  | 'unavailable'

/** Raised before any slot is reserved or process created. Messages never carry values. */
export class ProcessServiceError extends Error {
  constructor(
    readonly code: ProcessServiceErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ProcessServiceError'
  }
}
