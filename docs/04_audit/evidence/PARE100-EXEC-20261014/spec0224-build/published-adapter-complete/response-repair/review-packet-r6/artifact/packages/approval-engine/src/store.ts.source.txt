import type { ApprovalRecord, ApprovalStatus } from './contracts.ts'

export interface ApprovalQuery {
  tenantId: string
  status?: ApprovalStatus
  limit?: number
}

export interface ApprovalStore {
  insert(record: ApprovalRecord): void
  get(tenantId: string, approvalId: string): ApprovalRecord | undefined
  /** Compare-and-set transition; returns the updated record or undefined. */
  update(
    tenantId: string,
    approvalId: string,
    expectedStatus: ApprovalStatus,
    update: (current: ApprovalRecord) => ApprovalRecord
  ): ApprovalRecord | undefined
  list(query: ApprovalQuery): ApprovalRecord[]
  listExpiringBefore(
    nowIso: string,
    statuses: readonly ApprovalStatus[]
  ): ApprovalRecord[]
}

export class InMemoryApprovalStore implements ApprovalStore {
  readonly #records = new Map<string, ApprovalRecord>()

  #key(tenantId: string, approvalId: string): string {
    return `${tenantId}:${approvalId}`
  }

  insert(record: ApprovalRecord): void {
    this.#records.set(this.#key(record.tenantId, record.approvalId), record)
  }

  get(tenantId: string, approvalId: string): ApprovalRecord | undefined {
    return this.#records.get(this.#key(tenantId, approvalId))
  }

  update(
    tenantId: string,
    approvalId: string,
    expectedStatus: ApprovalStatus,
    update: (current: ApprovalRecord) => ApprovalRecord
  ): ApprovalRecord | undefined {
    const key = this.#key(tenantId, approvalId)
    const current = this.#records.get(key)
    if (!current || current.status !== expectedStatus) return undefined
    const next = update(current)
    this.#records.set(key, next)
    return next
  }

  list(query: ApprovalQuery): ApprovalRecord[] {
    const records = [...this.#records.values()].filter(
      (record) =>
        record.tenantId === query.tenantId &&
        (query.status === undefined || record.status === query.status)
    )
    return records.slice(0, query.limit ?? records.length)
  }

  listExpiringBefore(
    nowIso: string,
    statuses: readonly ApprovalStatus[]
  ): ApprovalRecord[] {
    return [...this.#records.values()].filter(
      (record) =>
        statuses.includes(record.status) &&
        Date.parse(record.expiresAt) < Date.parse(nowIso)
    )
  }
}
