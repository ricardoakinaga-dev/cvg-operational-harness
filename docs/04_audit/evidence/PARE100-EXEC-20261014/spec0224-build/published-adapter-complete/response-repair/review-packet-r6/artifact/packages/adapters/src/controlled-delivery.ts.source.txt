import { createDomainId, DomainError, redactSensitiveText } from '@cvg/shared'

export interface ControlledDeliveryInput {
  tenantId: string
  recipientRef: string
  body: string
  idempotencyKey: string
  correlationId: string
  takeoverActive?: boolean
}

export interface ControlledDeliveryResult {
  status: 'sent' | 'suppressed' | 'failed'
  tenantId: string
  idempotencyKey: string
  correlationId: string
  externalMessageId: string | null
  error: 'takeover_active' | 'provider_error' | null
  externalCall: false
}

export interface ControlledDeliveryAttempt {
  tenantId: string
  idempotencyKey: string
  attempt: number
  outcome: 'sent' | 'suppressed' | 'failed'
  error: ControlledDeliveryResult['error']
}

/** Local channel seam with journaled idempotency and explicit takeover suppression. */
export class ControlledDeliveryAdapter {
  private readonly journal = new Map<string, ControlledDeliveryResult>()
  private readonly attempts = new Map<string, number>()
  private readonly failures = new Map<string, number>()
  private readonly attemptRecords: ControlledDeliveryAttempt[] = []
  private failuresRemaining: number
  private sequence = 0

  constructor(failNext = false) {
    this.failuresRemaining = failNext ? 1 : 0
  }

  async send(
    input: ControlledDeliveryInput
  ): Promise<ControlledDeliveryResult> {
    const tenantId = boundedTenant(input.tenantId)
    const idempotencyKey = boundedKey(input.idempotencyKey)
    const correlationId = boundedCorrelation(input.correlationId)
    const recipientRef = boundedText(input.recipientRef)
    const body = boundedText(input.body)
    void recipientRef
    void redactSensitiveText(body)
    const journalKey = `${tenantId}:${idempotencyKey}`
    const existing = this.journal.get(journalKey)
    if (existing) return { ...existing }
    const attempts = (this.attempts.get(journalKey) ?? 0) + 1
    this.attempts.set(journalKey, attempts)
    if (input.takeoverActive === true) {
      const suppressed: ControlledDeliveryResult = {
        status: 'suppressed',
        tenantId,
        idempotencyKey,
        correlationId,
        externalMessageId: null,
        error: 'takeover_active',
        externalCall: false
      }
      this.journal.set(journalKey, suppressed)
      this.attemptRecords.push({
        tenantId,
        idempotencyKey,
        attempt: attempts,
        outcome: suppressed.status,
        error: suppressed.error
      })
      return { ...suppressed }
    }
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1
      this.failures.set(journalKey, (this.failures.get(journalKey) ?? 0) + 1)
      this.attemptRecords.push({
        tenantId,
        idempotencyKey,
        attempt: attempts,
        outcome: 'failed',
        error: 'provider_error'
      })
      return {
        status: 'failed',
        tenantId,
        idempotencyKey,
        correlationId,
        externalMessageId: null,
        error: 'provider_error',
        externalCall: false
      }
    }
    const sent: ControlledDeliveryResult = {
      status: 'sent',
      tenantId,
      idempotencyKey,
      correlationId,
      externalMessageId: `controlled_${++this.sequence}_${createDomainId('delivery').slice(-8)}`,
      error: null,
      externalCall: false
    }
    this.attemptRecords.push({
      tenantId,
      idempotencyKey,
      attempt: attempts,
      outcome: sent.status,
      error: sent.error
    })
    this.journal.set(journalKey, sent)
    return { ...sent }
  }

  count(tenantId: string): number {
    const normalized = boundedTenant(tenantId)
    return [...this.journal.values()].filter(
      (item) => item.tenantId === normalized && item.status === 'sent'
    ).length
  }

  attemptsFor(tenantId: string, idempotencyKey: string): number {
    const key = `${boundedTenant(tenantId)}:${boundedKey(idempotencyKey)}`
    return this.attempts.get(key) ?? 0
  }

  failuresFor(tenantId: string, idempotencyKey: string): number {
    const key = `${boundedTenant(tenantId)}:${boundedKey(idempotencyKey)}`
    return this.failures.get(key) ?? 0
  }

  attemptJournal(tenantId: string): ControlledDeliveryAttempt[] {
    const normalized = boundedTenant(tenantId)
    return this.attemptRecords
      .filter((record) => record.tenantId === normalized)
      .map((record) => ({ ...record }))
  }
}

function boundedTenant(raw: unknown): string {
  if (typeof raw !== 'string' || !/^tenant_[0-9a-f-]{36}$/.test(raw))
    throw new DomainError('validation_failed', 'Tenant scope is invalid')
  return raw
}

function boundedKey(raw: unknown): string {
  if (
    typeof raw !== 'string' ||
    raw.trim().length < 8 ||
    raw.trim().length > 200
  )
    throw new DomainError(
      'validation_failed',
      'Delivery idempotency key is invalid'
    )
  return raw.trim()
}

function boundedCorrelation(raw: unknown): string {
  if (typeof raw !== 'string' || !/^corr_[0-9a-f-]{36}$/.test(raw))
    throw new DomainError(
      'validation_failed',
      'Delivery correlation is invalid'
    )
  return raw
}

function boundedText(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 4_000)
    throw new DomainError('validation_failed', 'Delivery text is invalid')
  return raw.trim()
}
