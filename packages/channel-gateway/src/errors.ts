export const ChannelErrorCodes = {
  invalid_payload: 'invalid_payload',
  invalid_config: 'invalid_config',
  channel_disabled: 'channel_disabled',
  channel_unknown: 'channel_unknown',
  human_takeover_active: 'human_takeover_active',
  send_failed: 'send_failed',
  provider_rejected: 'provider_rejected',
  url_rejected: 'url_rejected',
  idempotency_key_reuse: 'idempotency_key_reuse',
  operation_in_progress: 'operation_in_progress',
  effect_uncertain: 'effect_uncertain',
  lease_lost: 'lease_lost',
  reconciliation_required: 'reconciliation_required',
  journal_unavailable: 'journal_unavailable',
  hash_algorithm_mismatch: 'hash_algorithm_mismatch'
} as const

export type ChannelErrorCode =
  (typeof ChannelErrorCodes)[keyof typeof ChannelErrorCodes]

export interface ChannelErrorOptions {
  /**
   * True when the send attempt may have reached the provider. The gateway
   * must treat such failures as uncertain: blind retries are forbidden.
   */
  effectUnknown?: boolean
}

export class ChannelError extends Error {
  readonly code: ChannelErrorCode
  readonly retryable: boolean
  readonly effectUnknown: boolean

  constructor(
    code: ChannelErrorCode,
    message: string,
    retryable = false,
    options: ChannelErrorOptions = {}
  ) {
    super(message)
    this.name = 'ChannelError'
    this.code = code
    this.retryable = retryable
    this.effectUnknown = options.effectUnknown ?? false
  }
}
