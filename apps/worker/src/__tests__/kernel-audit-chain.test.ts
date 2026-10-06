import { describe, expect, it } from 'vitest'
import { HashChainedAuditLedger } from '@cvg/observability'
import { verifyKernelAuditRows } from '../kernel-audit-chain.ts'
import { auditHashRef } from '../kernel-composition.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000373'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000373'

/** The rows `persistKernelAudit` writes for one ledger. */
function persistedRows(events = 4) {
  const ledger = new HashChainedAuditLedger()
  for (let index = 1; index <= events; index += 1) {
    ledger.append({
      eventId: `evt_synthetic_${index}`,
      type: index === 1 ? 'policy.decided' : 'runtime.denied',
      actor: 'op_synthetic',
      tenantId: TENANT,
      correlationId: CORRELATION,
      timestamp: `2026-10-06T12:00:0${index}.000Z`,
      payload: { code: `synthetic_${index}` }
    })
  }
  return ledger.records().map((record) => ({
    correlation_id: record.correlationId,
    payload: {
      tenantId: TENANT,
      kernelAudit: {
        ledgerId: 'ledger_synthetic',
        sequence: record.sequence,
        eventId: record.eventId,
        eventType: record.type,
        actor: record.actor,
        timestamp: record.timestamp,
        previousHash: auditHashRef(record.previousHash),
        payloadHash: auditHashRef(record.payloadHash),
        eventHash: auditHashRef(record.eventHash),
        payload: record.payload ?? null
      }
    }
  }))
}

describe('kernel audit chain read back from storage (barra 0373, condição 8)', () => {
  it('accepts an intact chain, in any row order', () => {
    const report = verifyKernelAuditRows(persistedRows().reverse())
    expect(report).toMatchObject({
      valid: true,
      events: 4,
      payloadMismatches: 0
    })
    expect(report.ledgers[0]?.headHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('detects a rewritten event, a missing row and a forged payload hash', () => {
    const rewritten = persistedRows()
    rewritten[1]!.payload.kernelAudit.eventType = 'runtime.executed'
    expect(verifyKernelAuditRows(rewritten).ledgers[0]).toMatchObject({
      valid: false,
      brokenAt: 1,
      reason: 'event_hash_mismatch'
    })

    const missing = persistedRows().filter((_, index) => index !== 2)
    expect(verifyKernelAuditRows(missing).ledgers[0]?.reason).toBe(
      'sequence_mismatch'
    )

    const forged = persistedRows()
    forged[2]!.payload.kernelAudit.payloadHash = auditHashRef('f'.repeat(64))
    expect(verifyKernelAuditRows(forged).valid).toBe(false)
  })

  it('counts a payload changed after hashing (redaction) without breaking the linkage', () => {
    const redacted = persistedRows()
    redacted[3]!.payload.kernelAudit.payload = { code: '[redacted]' }
    expect(verifyKernelAuditRows(redacted)).toMatchObject({
      valid: true,
      payloadMismatches: 1
    })
  })

  it('reports no evidence as invalid', () => {
    expect(verifyKernelAuditRows([]).valid).toBe(false)
  })
})
