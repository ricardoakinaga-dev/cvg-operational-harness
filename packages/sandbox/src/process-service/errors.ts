import type { ProcessAdmissionReason } from './containment.ts'

export type ProcessServiceErrorCode =
  | 'invalid_request'
  | 'invalid_env'
  | 'invalid_limits'
  | 'service_closed'
  | 'service_busy'
  | 'unavailable'
  | 'admission_refused'

/** Legacy errors precede launch. Future native admission may first clean a launcher.
 * Messages never carry host paths or supplied values.
 */
export class ProcessServiceError extends Error {
  constructor(
    readonly code: ProcessServiceErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ProcessServiceError'
  }
}

export class ProcessAdmissionError extends ProcessServiceError {
  constructor(readonly reason: ProcessAdmissionReason) {
    super('admission_refused', 'process profile admission refused')
    this.name = 'ProcessAdmissionError'
  }
}
