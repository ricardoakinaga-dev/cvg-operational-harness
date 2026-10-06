import { describe, expect, it } from 'vitest'
import { HashChainedAuditLedger } from '@cvg/observability'
import { verifyKernelAuditRows } from '../kernel-audit-chain.ts'
import { SanitizedAuditLedger, auditHashRef } from '../kernel-composition.ts'

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

  it('rejects a stored payload that no longer matches its hash (AUD-0601 F06)', () => {
    const swapped = persistedRows()
    swapped[3]!.payload.kernelAudit.payload = { code: 'synthetic_executed' }
    expect(verifyKernelAuditRows(swapped)).toMatchObject({
      valid: false,
      payloadMismatches: 0
    })
    expect(verifyKernelAuditRows(swapped).ledgers[0]).toMatchObject({
      valid: false,
      brokenAt: 3,
      reason: 'payload_hash_mismatch'
    })
    // Legacy chains hashed before sanitization can only be counted.
    expect(
      verifyKernelAuditRows(swapped, { payloads: 'report' })
    ).toMatchObject({ valid: true, payloadMismatches: 1 })
  })

  it('detects a truncated tail or a missing ledger against external anchors', () => {
    const full = verifyKernelAuditRows(persistedRows())
    const anchors = {
      ledger_synthetic: {
        events: full.events,
        headHash: full.ledgers[0]!.headHash!
      }
    }
    expect(verifyKernelAuditRows(persistedRows(), { anchors }).valid).toBe(true)
    const truncated = persistedRows().slice(0, 3)
    expect(verifyKernelAuditRows(truncated).valid).toBe(true)
    expect(verifyKernelAuditRows(truncated, { anchors })).toMatchObject({
      valid: false,
      anchorMismatches: ['ledger_synthetic']
    })
    expect(
      verifyKernelAuditRows(persistedRows(), {
        anchors: { ...anchors, ledger_missing: anchors.ledger_synthetic }
      }).anchorMismatches
    ).toEqual(['ledger_missing'])
  })

  it('reports no evidence as invalid', () => {
    expect(verifyKernelAuditRows([]).valid).toBe(false)
  })

  it('hashes payloads already sanitized, so the stored payload verifies strictly', () => {
    const ledger = new SanitizedAuditLedger()
    const record = ledger.append({
      eventId: 'evt_synthetic_sanitized',
      type: 'model.requested',
      actor: 'op_synthetic',
      tenantId: TENANT,
      correlationId: CORRELATION,
      timestamp: '2026-10-06T12:00:00.000Z',
      payload: { note: 'contato synthetic@example.test' }
    })
    expect(JSON.stringify(record.payload)).not.toContain('@example.test')
    expect(ledger.verify().valid).toBe(true)
  })
})
