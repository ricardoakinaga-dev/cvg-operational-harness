import { describe, expect, it } from 'vitest'
import {
  HashChainedAuditLedger,
  type AuditLedgerRecord
} from '@cvg/observability'
import {
  createKernelAuditTrail,
  type KernelAuditBatchStore
} from '../kernel-composition.ts'

// SPEC0249 AC13 (AUD-0621 F19): the per-ledger cursor only advances after a
// committed batch, an ambiguous commit is reconciled from the persisted
// sequence without duplicates, and rotation never drops a pending ledger.
const TENANT = 'tenant_00000000-0000-4000-8000-000000000249'

type FailureMode = 'none' | 'before-commit' | 'after-commit'

function memoryStore() {
  const rows = new Map<string, number[]>()
  const failures: FailureMode[] = []
  let inserts = 0
  const store: KernelAuditBatchStore = {
    async insert(ledgerId, records) {
      inserts += 1
      const mode = failures.shift() ?? 'none'
      if (mode === 'before-commit') throw new Error('synthetic batch fault')
      const ledger = rows.get(ledgerId) ?? []
      ledger.push(...records.map((record) => record.sequence))
      rows.set(ledgerId, ledger)
      if (mode === 'after-commit') throw new Error('synthetic lost commit')
    },
    async persistedThrough(ledgerId) {
      const ledger = rows.get(ledgerId) ?? []
      return ledger.length === 0 ? 0 : Math.max(...ledger)
    }
  }
  return {
    store,
    rows,
    fail(mode: FailureMode) {
      failures.push(mode)
    },
    inserts: () => inserts
  }
}

function append(ledger: HashChainedAuditLedger, count: number): void {
  for (let index = 0; index < count; index += 1) {
    ledger.append({
      eventId: `evt_${ledger.size() + 1}`,
      type: 'runtime.synthetic',
      actor: 'kernel-runtime',
      tenantId: TENANT,
      correlationId: 'corr_00000000-0000-4000-8000-000000000249',
      timestamp: '2026-10-20T12:00:00.000Z'
    })
  }
}

function sequences(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index + 1)
}

let ledgerCounter = 0
function trailFor(
  store: KernelAuditBatchStore,
  options: { rotateAt?: number; batchSize?: number } = {}
) {
  return createKernelAuditTrail(store, {
    createLedger: () => new HashChainedAuditLedger(),
    createLedgerId: () => `ledger-${(ledgerCounter += 1)}`,
    ...options
  })
}

describe('SPEC0249 kernel audit trail', () => {
  it('keeps the cursor on a failed batch and resends exactly the missing suffix', async () => {
    const memory = memoryStore()
    const trail = trailFor(memory.store, { batchSize: 2 })
    const turn = trail.begin()
    append(turn.ledger, 3)
    trail.end(turn)
    memory.fail('before-commit')
    await expect(trail.flush()).rejects.toThrow('synthetic batch fault')
    expect(memory.rows.get(turn.ledgerId)).toBeUndefined()

    const next = trail.begin()
    append(next.ledger, 2)
    trail.end(next)
    await trail.flush()
    expect(memory.rows.get(turn.ledgerId)).toEqual(sequences(5))
    // batches of at most two records: 1-2, 3-4, 5 (plus the failed attempt)
    expect(memory.inserts()).toBe(4)
  })

  it('reconciles an ambiguous commit from the persisted sequence without duplicates', async () => {
    const memory = memoryStore()
    const trail = trailFor(memory.store)
    const turn = trail.begin()
    append(turn.ledger, 3)
    trail.end(turn)
    memory.fail('after-commit')
    await expect(trail.flush()).rejects.toThrow('synthetic lost commit')
    expect(memory.rows.get(turn.ledgerId)).toEqual(sequences(3))

    const next = trail.begin()
    append(next.ledger, 1)
    trail.end(next)
    await trail.flush()
    expect(memory.rows.get(turn.ledgerId)).toEqual(sequences(4))
  })

  it('fails closed when the persisted ledger went backwards', async () => {
    const memory = memoryStore()
    const trail = trailFor(memory.store)
    const turn = trail.begin()
    append(turn.ledger, 2)
    trail.end(turn)
    await trail.flush()
    append(turn.ledger, 1)
    memory.fail('before-commit')
    await expect(trail.flush()).rejects.toThrow('synthetic batch fault')
    memory.rows.set(turn.ledgerId, [1])
    await expect(trail.flush()).rejects.toThrow(/diverged/)
  })

  it('serializes concurrent flushes so every record is written once', async () => {
    const memory = memoryStore()
    const trail = trailFor(memory.store, { batchSize: 1 })
    const first = trail.begin()
    append(first.ledger, 3)
    trail.end(first)
    await Promise.all([trail.flush(), trail.flush(), trail.flush()])
    expect(memory.rows.get(first.ledgerId)).toEqual(sequences(3))
    expect(memory.inserts()).toBe(3)
  })

  it('keeps a rotated ledger until it is persisted and no turn is active on it', async () => {
    const memory = memoryStore()
    const trail = trailFor(memory.store, { rotateAt: 2 })
    const longTurn = trail.begin()
    append(longTurn.ledger, 2)
    const shortTurn = trail.begin()
    expect(shortTurn.ledgerId).not.toBe(longTurn.ledgerId)
    expect(trail.current()).toBe(shortTurn.ledger)
    append(shortTurn.ledger, 1)
    trail.end(shortTurn)
    await trail.flush()
    expect(trail.pendingLedgers()).toBe(2)

    append(longTurn.ledger, 1)
    trail.end(longTurn)
    await trail.flush()
    expect(trail.pendingLedgers()).toBe(1)
    expect(memory.rows.get(longTurn.ledgerId)).toEqual(sequences(3))
    expect(memory.rows.get(shortTurn.ledgerId)).toEqual(sequences(1))
  })

  it('persists in record order across ledgers', async () => {
    const memory = memoryStore()
    const order: string[] = []
    const store: KernelAuditBatchStore = {
      insert: async (ledgerId, records: readonly AuditLedgerRecord[]) => {
        order.push(`${ledgerId}:${records.map((r) => r.sequence).join(',')}`)
        await memory.store.insert(ledgerId, records)
      },
      persistedThrough: memory.store.persistedThrough
    }
    const ordered = createKernelAuditTrail(store, {
      createLedger: () => new HashChainedAuditLedger(),
      createLedgerId: () => `ordered-${(ledgerCounter += 1)}`,
      rotateAt: 1
    })
    const a = ordered.begin()
    append(a.ledger, 1)
    const b = ordered.begin()
    append(b.ledger, 1)
    ordered.end(a)
    ordered.end(b)
    await ordered.flush()
    expect(order).toEqual([`${a.ledgerId}:1`, `${b.ledgerId}:1`])
    expect(ordered.pendingLedgers()).toBe(1)
  })
})
