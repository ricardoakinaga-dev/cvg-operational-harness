/** SPEC 0293 §3.1: distinct, safe errors; messages never carry content or locators. */
export class SpillError extends Error {
  readonly retryable: boolean
  constructor(message: string, options: { readonly retryable?: boolean } = {}) {
    super(message)
    this.name = new.target.name
    this.retryable = options.retryable ?? false
  }
}
/** Includes a wrong tenant or session: indistinguishable from absence (I4). */
export class SpillNotFound extends SpillError {}
export class SpillExpired extends SpillError {}
export class SpillTooLarge extends SpillError {}
export class SpillQuotaExceeded extends SpillError {}
export class SpillStorageUnavailable extends SpillError {
  constructor(message: string) {
    super(message, { retryable: true })
  }
}
/** The outcome of a write is unknown; a repeat is safe because `put` is idempotent (I6). */
export class SpillCommitUnknown extends SpillError {}
export class SpillPolicyError extends SpillError {}
