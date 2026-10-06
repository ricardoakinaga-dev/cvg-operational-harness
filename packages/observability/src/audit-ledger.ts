import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalizeJson } from '@cvg/shared'

export const GENESIS_HASH = '0'.repeat(64)

export const AuditLedgerEntrySchema = z
  .object({
    eventId: z.string().min(1).max(200),
    type: z.string().min(1).max(160),
    actor: z.string().min(1).max(200),
    tenantId: z.string().min(1).max(120),
    correlationId: z.string().min(8).max(120),
    timestamp: z.string().datetime(),
    payload: z.unknown().optional()
  })
  .strict()

export type AuditLedgerEntry = z.output<typeof AuditLedgerEntrySchema>
export type AuditLedgerEntryInput = z.input<typeof AuditLedgerEntrySchema>

export interface AuditLedgerRecord extends AuditLedgerEntry {
  sequence: number
  previousHash: string
  payloadHash: string
  eventHash: string
}

export interface AuditLedgerVerification {
  valid: boolean
  brokenAt?: number
  reason?: string
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function computePayloadHash(payload: unknown): string {
  return sha256(canonicalizeJson(payload ?? null))
}

function computeEventHash(
  record: Omit<AuditLedgerRecord, 'eventHash'>
): string {
  return sha256(
    canonicalizeJson({
      sequence: record.sequence,
      previousHash: record.previousHash,
      payloadHash: record.payloadHash,
      eventId: record.eventId,
      type: record.type,
      actor: record.actor,
      tenantId: record.tenantId,
      correlationId: record.correlationId,
      timestamp: record.timestamp
    })
  )
}

/**
 * Append-only hash-chained audit ledger. Each event binds the previous event
 * hash, its own payload hash and its metadata, so silent tampering breaks the
 * chain and is detectable. This is integrity, not blockchain.
 */
export class HashChainedAuditLedger {
  readonly #records: AuditLedgerRecord[] = []

  append(entry: AuditLedgerEntryInput): AuditLedgerRecord {
    const parsed = AuditLedgerEntrySchema.parse(entry)
    const previous = this.#records[this.#records.length - 1]
    const base: Omit<AuditLedgerRecord, 'eventHash'> = {
      ...parsed,
      sequence: (previous?.sequence ?? 0) + 1,
      previousHash: previous?.eventHash ?? GENESIS_HASH,
      payloadHash: computePayloadHash(parsed.payload)
    }
    const record: AuditLedgerRecord = {
      ...base,
      eventHash: computeEventHash(base)
    }
    this.#records.push(record)
    return record
  }

  /**
   * Returns the internal records for inspection/verification. References are
   * exposed so adversarial tests can prove tampering is detected; callers must
   * not mutate them in production paths.
   */
  records(): AuditLedgerRecord[] {
    return [...this.#records]
  }

  head(): AuditLedgerRecord | undefined {
    const head = this.#records[this.#records.length - 1]
    return head ? { ...head } : undefined
  }

  size(): number {
    return this.#records.length
  }

  verify(): AuditLedgerVerification {
    const { valid, brokenAt, reason } = verifyAuditChainRecords(this.#records)
    return {
      valid,
      ...(brokenAt !== undefined ? { brokenAt } : {}),
      ...(reason !== undefined ? { reason } : {})
    }
  }
}

export interface AuditChainVerificationOptions {
  /**
   * `strict` (default): a payload that does not match its hash breaks the
   * chain. `report`: payload mismatches are counted instead, for chains read
   * back from storage whose payloads went through redaction; the linkage and
   * every event hash (which binds the payload hash) are still enforced.
   */
  readonly payloads?: 'strict' | 'report'
}

export interface AuditChainVerification extends AuditLedgerVerification {
  readonly events: number
  readonly payloadMismatches: number
  readonly headHash?: string
}

/**
 * Verifies a chain given as records, from sequence 1 and the genesis hash:
 * contiguous sequences, previous-hash linkage, payload hashes and event
 * hashes. Used for the in-memory ledger and for chains restored from storage
 * (barra 0373, condição 8).
 */
export function verifyAuditChainRecords(
  records: readonly AuditLedgerRecord[],
  options: AuditChainVerificationOptions = {}
): AuditChainVerification {
  const strict = (options.payloads ?? 'strict') === 'strict'
  let previousHash = GENESIS_HASH
  let payloadMismatches = 0
  const broken = (index: number, reason: string): AuditChainVerification => ({
    valid: false,
    brokenAt: index,
    reason,
    events: records.length,
    payloadMismatches
  })
  for (const [index, record] of records.entries()) {
    if (record.sequence !== index + 1) return broken(index, 'sequence_mismatch')
    if (record.previousHash !== previousHash) {
      return broken(index, 'previous_hash_mismatch')
    }
    if (record.payloadHash !== computePayloadHash(record.payload)) {
      if (strict) return broken(index, 'payload_hash_mismatch')
      payloadMismatches += 1
    }
    const recomputed = computeEventHash({
      sequence: record.sequence,
      previousHash: record.previousHash,
      payloadHash: record.payloadHash,
      eventId: record.eventId,
      type: record.type,
      actor: record.actor,
      tenantId: record.tenantId,
      correlationId: record.correlationId,
      timestamp: record.timestamp
    })
    if (record.eventHash !== recomputed) {
      return broken(index, 'event_hash_mismatch')
    }
    previousHash = record.eventHash
  }
  return {
    valid: true,
    events: records.length,
    payloadMismatches,
    ...(records.length > 0 ? { headHash: previousHash } : {})
  }
}
