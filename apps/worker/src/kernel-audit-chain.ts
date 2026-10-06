import {
  verifyAuditChainRecords,
  type AuditChainVerification,
  type AuditLedgerRecord
} from '@cvg/observability'
import type { TenantId } from '@cvg/platform'
import { withTenantContext, type PostgresPoolLike } from '@cvg/persistence'

/**
 * PROD-0373 (barra 0373, condição 8) — re-verifies the governed kernel's
 * hash-chained audit from `audit_events` (the `kernelAudit` rows the worker
 * persists per turn), e.g. after a backup is restored. Each ledger is checked
 * from sequence 1: linkage, contiguity, every event hash and, by default,
 * every stored payload against its hash (AUD-0601 F06).
 */

export interface KernelAuditLedgerVerification extends AuditChainVerification {
  readonly ledgerId: string
}

export interface KernelAuditChainReport {
  readonly valid: boolean
  /** Anchored ledgers that are missing, shorter/longer or end elsewhere. */
  readonly anchorMismatches?: readonly string[]
  readonly ledgers: readonly KernelAuditLedgerVerification[]
  readonly events: number
  readonly payloadMismatches: number
}

const HASH_PREFIX = 'sha256-'

function unprefixed(value: unknown): string {
  return typeof value === 'string' && value.startsWith(HASH_PREFIX)
    ? value.slice(HASH_PREFIX.length)
    : String(value)
}

interface KernelAuditRow {
  readonly correlation_id: string
  readonly payload: {
    readonly tenantId?: string
    readonly kernelAudit?: {
      readonly ledgerId: string
      readonly sequence: number
      readonly eventId: string
      readonly eventType: string
      readonly actor: string
      readonly timestamp: string
      readonly previousHash: string
      readonly payloadHash: string
      readonly eventHash: string
      readonly payload: unknown
    }
  }
}

export interface KernelAuditVerificationOptions {
  /**
   * `strict` (default): a stored payload that does not match its hash
   * invalidates the chain. The worker hashes payloads already sanitized, so
   * a mismatch is tampering, not redaction. `report` only counts mismatches,
   * for chains written before payloads were sanitized ahead of the hash.
   */
  readonly payloads?: 'strict' | 'report'
  /**
   * Known heads kept outside the database (e.g. at backup time). Each
   * anchored ledger must still have that many events and that head hash, so
   * a truncated tail or a missing ledger is detected.
   */
  readonly anchors?: Readonly<
    Record<string, { readonly events: number; readonly headHash: string }>
  >
}

/** Groups persisted kernel audit rows into chains and verifies each one. */
export function verifyKernelAuditRows(
  rows: readonly KernelAuditRow[],
  options: KernelAuditVerificationOptions = {}
): KernelAuditChainReport {
  const byLedger = new Map<string, AuditLedgerRecord[]>()
  for (const row of rows) {
    const audit = row.payload.kernelAudit
    if (!audit) continue
    const record: AuditLedgerRecord = {
      sequence: Number(audit.sequence),
      previousHash: unprefixed(audit.previousHash),
      payloadHash: unprefixed(audit.payloadHash),
      eventHash: unprefixed(audit.eventHash),
      eventId: audit.eventId,
      type: audit.eventType,
      actor: audit.actor,
      tenantId: String(row.payload.tenantId),
      correlationId: row.correlation_id,
      timestamp: audit.timestamp,
      ...(audit.payload === null ? {} : { payload: audit.payload })
    }
    const chain = byLedger.get(audit.ledgerId) ?? []
    chain.push(record)
    byLedger.set(audit.ledgerId, chain)
  }
  const ledgers = [...byLedger.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([ledgerId, records]) => ({
      ledgerId,
      ...verifyAuditChainRecords(
        records.sort((left, right) => left.sequence - right.sequence),
        { payloads: options.payloads ?? 'strict' }
      )
    }))
  const anchorFailures = Object.entries(options.anchors ?? {}).filter(
    ([ledgerId, anchor]) => {
      const ledger = ledgers.find(
        (candidate) => candidate.ledgerId === ledgerId
      )
      return (
        !ledger ||
        ledger.events !== anchor.events ||
        ledger.headHash !== anchor.headHash
      )
    }
  )
  return {
    valid:
      ledgers.length > 0 &&
      ledgers.every((ledger) => ledger.valid) &&
      anchorFailures.length === 0,
    ...(anchorFailures.length > 0
      ? { anchorMismatches: anchorFailures.map(([ledgerId]) => ledgerId) }
      : {}),
    ledgers,
    events: ledgers.reduce((sum, ledger) => sum + ledger.events, 0),
    payloadMismatches: ledgers.reduce(
      (sum, ledger) => sum + ledger.payloadMismatches,
      0
    )
  }
}

/** Reads and verifies every kernel audit chain of one tenant. */
export async function verifyPersistedKernelAudit(
  pool: PostgresPoolLike,
  tenantId: TenantId,
  options: KernelAuditVerificationOptions = {}
): Promise<KernelAuditChainReport> {
  const result = await withTenantContext(pool, tenantId, (client) =>
    client.query<KernelAuditRow>(
      `SELECT correlation_id, payload
         FROM audit_events
        WHERE tenant_id = $1 AND payload ? 'kernelAudit'`,
      [tenantId]
    )
  )
  return verifyKernelAuditRows(result.rows, options)
}
