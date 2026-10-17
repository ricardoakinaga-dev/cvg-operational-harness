import {
  createDomainId,
  DomainError,
  redactSensitiveText,
  sanitizeAuditEvidencePayload
} from '@cvg/shared'
import { TenantIdSchema, type TenantId } from './ids.ts'

export const RETENTION_KINDS = [
  'trace',
  'metric',
  'integration',
  'audit'
] as const

export type RetentionKind = (typeof RETENTION_KINDS)[number]

export interface RetentionRecord {
  tenantId: TenantId
  id: string
  kind: RetentionKind
  createdAt: Date
  expiresAt: Date
  metadata: Record<string, string>
}

export interface RetentionCounters {
  appended: number
  purged: number
  preservedAudit: number
}

export interface RetentionAggregate {
  tenantId: TenantId
  totalRecords: number
  activeRecords: number
  expiredRecords: number
  byKind: Record<RetentionKind, number>
  counters: RetentionCounters
}

export interface RetentionPurgeResult {
  purgedIds: string[]
  preservedAuditIds: string[]
  remaining: number
}

/** Bounded local retention ledger. Audit rows are never purged by this helper. */
export class RetentionLedger {
  private readonly records: RetentionRecord[] = []
  private readonly counterByTenant = new Map<TenantId, RetentionCounters>()
  private readonly clock: () => Date

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock
  }

  append(input: {
    tenantId: TenantId
    kind: RetentionKind
    expiresAt: Date
    metadata?: Record<string, string>
  }): RetentionRecord {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    const kind = parseKind(input.kind)
    const expiresAt = new Date(input.expiresAt)
    const createdAt = this.now()
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= createdAt.getTime()
    ) {
      throw new DomainError('validation_failed', 'Retention expiry is invalid')
    }
    const metadata = sanitizeMetadata(input.metadata)
    const record: RetentionRecord = {
      tenantId,
      id: createDomainId('retention'),
      kind,
      createdAt,
      expiresAt,
      metadata
    }
    this.records.push(record)
    this.counterFor(tenantId).appended += 1
    return cloneRecord(record)
  }

  purge(rawTenantId: TenantId): RetentionPurgeResult {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const now = this.now()
    const purgedIds: string[] = []
    const preservedAuditIds: string[] = []
    const remaining: RetentionRecord[] = []
    for (const record of this.records) {
      if (
        record.tenantId !== tenantId ||
        record.expiresAt.getTime() > now.getTime()
      ) {
        remaining.push(record)
        continue
      }
      if (record.kind === 'audit') {
        preservedAuditIds.push(record.id)
        remaining.push(record)
        this.counterFor(tenantId).preservedAudit += 1
      } else {
        purgedIds.push(record.id)
        this.counterFor(tenantId).purged += 1
      }
    }
    this.records.splice(0, this.records.length, ...remaining)
    return { purgedIds, preservedAuditIds, remaining: remaining.length }
  }

  list(rawTenantId: TenantId): RetentionRecord[] {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return this.records
      .filter((record) => record.tenantId === tenantId)
      .map(cloneRecord)
  }

  /** Returns bounded operational counts without retaining or exposing payloads. */
  aggregate(rawTenantId: TenantId): RetentionAggregate {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const now = this.now()
    const byKind = emptyKindCounters()
    let activeRecords = 0
    let expiredRecords = 0
    for (const record of this.records) {
      if (record.tenantId !== tenantId) continue
      byKind[record.kind] += 1
      if (record.expiresAt.getTime() > now.getTime()) {
        activeRecords += 1
      } else {
        expiredRecords += 1
      }
    }
    return {
      tenantId,
      totalRecords: activeRecords + expiredRecords,
      activeRecords,
      expiredRecords,
      byKind,
      counters: this.counters(tenantId)
    }
  }

  counters(rawTenantId: TenantId): RetentionCounters {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    return { ...this.counterFor(tenantId) }
  }

  private now(): Date {
    const value = new Date(this.clock())
    if (!Number.isFinite(value.getTime()))
      throw new DomainError('validation_failed', 'Retention clock is invalid')
    return value
  }

  private counterFor(tenantId: TenantId): RetentionCounters {
    const existing = this.counterByTenant.get(tenantId)
    if (existing) return existing
    const counters = { appended: 0, purged: 0, preservedAudit: 0 }
    this.counterByTenant.set(tenantId, counters)
    return counters
  }
}

function cloneRecord(record: RetentionRecord): RetentionRecord {
  return {
    ...record,
    metadata: sanitizeMetadata(record.metadata),
    createdAt: new Date(record.createdAt),
    expiresAt: new Date(record.expiresAt)
  }
}

function parseKind(rawKind: RetentionKind): RetentionKind {
  if ((RETENTION_KINDS as readonly string[]).includes(rawKind)) return rawKind
  throw new DomainError('validation_failed', 'Retention kind is invalid')
}

function sanitizeMetadata(
  rawMetadata: Record<string, string> | undefined
): Record<string, string> {
  const boundedEntries = Object.entries(rawMetadata ?? {})
    .slice(0, 12)
    .map(([key, value]) => {
      if (
        !/^[a-zA-Z0-9_.-]{1,60}$/.test(key) ||
        typeof value !== 'string' ||
        value.length > 120
      ) {
        throw new DomainError(
          'validation_failed',
          'Retention metadata is invalid'
        )
      }
      return [key, value] as const
    })
  const sanitized = sanitizeAuditEvidencePayload(
    Object.fromEntries(boundedEntries)
  ).payload
  if (typeof sanitized !== 'object' || sanitized === null) return {}
  return Object.fromEntries(
    Object.entries(sanitized)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [
        key,
        redactSensitiveText(String(value)).slice(0, 120)
      ])
  )
}

function emptyKindCounters(): Record<RetentionKind, number> {
  return { trace: 0, metric: 0, integration: 0, audit: 0 }
}
