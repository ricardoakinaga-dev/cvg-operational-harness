import { createHash, randomUUID } from 'node:crypto'
import {
  CorrelationIdSchema,
  createDomainId,
  type CorrelationId
} from '@cvg/shared'
import {
  AgentIdSchema,
  AgentVersionIdSchema,
  TraceIdSchema,
  TenantIdSchema,
  type AgentId,
  type AgentVersionId,
  type TenantId,
  type TraceId
} from './ids.ts'

export type CapabilityApprovalStatus =
  | 'issued'
  | 'consumed'
  | 'revoked'
  | 'expired'

export interface CapabilityInputBinding {
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  toolName: string
  input: unknown
}

export interface CapabilityApprovalIssueInput extends CapabilityInputBinding {
  actorId: string
  issuer: string
  expiresAt: Date
  nonce?: string
}

/**
 * Optional durable evidence requested from an authority while consuming an
 * approval. Implementations that persist approvals can write this evidence
 * in the same transaction as the single-use state transition.
 */
export interface CapabilityApprovalConsumptionAudit {
  correlationId: CorrelationId
  policyVersion: string
  traceId?: TraceId
}

export interface CapabilityApprovalVerificationInput extends CapabilityInputBinding {
  approvalId: string
  actorId: string
  consumptionAudit?: CapabilityApprovalConsumptionAudit
}

export interface CapabilityApprovalRecord {
  id: string
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  toolName: string
  inputHash: string
  actorId: string
  nonce: string
  issuer: string
  expiresAt: Date
  issuedAt: Date
  status: CapabilityApprovalStatus
  consumedAt: Date | null
  revokedAt: Date | null
}

export interface CapabilityApprovalAuthority {
  issue(input: CapabilityApprovalIssueInput): Promise<CapabilityApprovalRecord>
  verifyAndConsume(
    input: CapabilityApprovalVerificationInput
  ): Promise<CapabilityApprovalRecord | null>
  /**
   * Tenant is intentionally required by implementations at runtime. The
   * optional type keeps the in-memory/test contract source-compatible, while
   * omission must fail closed rather than fall back to an unscoped lookup.
   */
  revoke(
    approvalId: string,
    issuer: string,
    tenantId?: TenantId
  ): Promise<boolean>
  get(
    approvalId: string,
    tenantId?: TenantId
  ): Promise<CapabilityApprovalRecord | null>
}

export function canonicalizeCapabilityInput(value: unknown): string {
  return canonicalize(value, new Set())
}

export function createCapabilityInputHash(
  input: CapabilityInputBinding
): string {
  const canonical = canonicalizeCapabilityInput({
    tenantId: input.tenantId,
    agentId: input.agentId,
    versionId: input.versionId,
    toolName: input.toolName,
    input: input.input
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export class InMemoryCapabilityApprovalAuthority implements CapabilityApprovalAuthority {
  private readonly records = new Map<string, CapabilityApprovalRecord>()

  constructor(private readonly now: () => Date = () => new Date()) {}

  async issue(
    input: CapabilityApprovalIssueInput
  ): Promise<CapabilityApprovalRecord> {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    const agentId = AgentIdSchema.parse(input.agentId)
    const versionId = AgentVersionIdSchema.parse(input.versionId)
    const expiresAt = copyDate(input.expiresAt, 'Approval expiry')
    const issuedAt = copyDate(this.now(), 'Approval issue time')
    if (expiresAt.getTime() <= issuedAt.getTime()) {
      throw new Error('Approval expiry must be in the future')
    }
    if (
      !input.toolName.trim() ||
      !input.actorId.trim() ||
      !input.issuer.trim()
    ) {
      throw new Error('Approval binding fields are required')
    }
    if (input.actorId.trim() === input.issuer.trim()) {
      throw new Error('Approval issuer and executor must be different')
    }
    const nonce = input.nonce?.trim() || `nonce_${randomUUID()}`
    if (
      Array.from(this.records.values()).some((record) => record.nonce === nonce)
    ) {
      throw new Error('Approval nonce already exists')
    }
    const record: CapabilityApprovalRecord = {
      id: createDomainId('approval'),
      tenantId,
      agentId,
      versionId,
      toolName: input.toolName,
      inputHash: createCapabilityInputHash({
        tenantId,
        agentId,
        versionId,
        toolName: input.toolName,
        input: input.input
      }),
      actorId: input.actorId,
      nonce,
      issuer: input.issuer,
      expiresAt,
      issuedAt,
      status: 'issued',
      consumedAt: null,
      revokedAt: null
    }
    this.records.set(record.id, record)
    return cloneRecord(record)
  }

  async verifyAndConsume(
    input: CapabilityApprovalVerificationInput
  ): Promise<CapabilityApprovalRecord | null> {
    if (!isValidConsumptionAudit(input.consumptionAudit)) return null
    const current = this.records.get(input.approvalId)
    if (!current || current.status !== 'issued') return null
    const now = copyDate(this.now(), 'Approval verification time')
    if (current.expiresAt.getTime() <= now.getTime()) {
      const expired = { ...current, status: 'expired' as const }
      this.records.set(current.id, expired)
      return null
    }
    if (
      current.tenantId !== input.tenantId ||
      current.agentId !== input.agentId ||
      current.versionId !== input.versionId ||
      current.toolName !== input.toolName ||
      current.actorId !== input.actorId
    ) {
      return null
    }
    let inputHash: string
    try {
      inputHash = createCapabilityInputHash(input)
    } catch {
      return null
    }
    if (inputHash !== current.inputHash) return null

    const consumed = {
      ...current,
      status: 'consumed' as const,
      consumedAt: now
    }
    this.records.set(current.id, consumed)
    return cloneRecord(consumed)
  }

  async revoke(
    approvalId: string,
    issuer: string,
    tenantId?: TenantId
  ): Promise<boolean> {
    if (!tenantId || !TenantIdSchema.safeParse(tenantId).success) return false
    const current = this.records.get(approvalId)
    if (
      !current ||
      current.tenantId !== tenantId ||
      current.status !== 'issued' ||
      current.issuer !== issuer
    ) {
      return false
    }
    const revoked = {
      ...current,
      status: 'revoked' as const,
      revokedAt: copyDate(this.now(), 'Approval revocation time')
    }
    this.records.set(approvalId, revoked)
    return true
  }

  async get(
    approvalId: string,
    tenantId?: TenantId
  ): Promise<CapabilityApprovalRecord | null> {
    if (!tenantId || !TenantIdSchema.safeParse(tenantId).success) return null
    const record = this.records.get(approvalId)
    return record && record.tenantId === tenantId ? cloneRecord(record) : null
  }
}

function isValidConsumptionAudit(
  audit: CapabilityApprovalVerificationInput['consumptionAudit']
): boolean {
  return (
    audit === undefined ||
    (CorrelationIdSchema.safeParse(audit.correlationId).success &&
      (audit.traceId === undefined ||
        TraceIdSchema.safeParse(audit.traceId).success) &&
      typeof audit.policyVersion === 'string' &&
      audit.policyVersion.trim().length > 0)
  )
}

function canonicalize(value: unknown, seen: Set<object>): string {
  if (value === null) return 'null'
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Capability input is not finite')
    return JSON.stringify(value)
  }
  if (typeof value !== 'object' || value === undefined) {
    throw new Error('Capability input is not JSON serializable')
  }
  if (seen.has(value)) throw new Error('Capability input contains a cycle')
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalize(item, seen)).join(',')}]`
    }
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)
    )
    return `{${entries
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${canonicalize(item, seen)}`
      )
      .join(',')}}`
  } finally {
    seen.delete(value)
  }
}

function copyDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${label} must be a valid date`)
  }
  return new Date(value.getTime())
}

function cloneRecord(
  record: CapabilityApprovalRecord
): CapabilityApprovalRecord {
  return {
    ...record,
    expiresAt: new Date(record.expiresAt),
    issuedAt: new Date(record.issuedAt),
    consumedAt: record.consumedAt ? new Date(record.consumedAt) : null,
    revokedAt: record.revokedAt ? new Date(record.revokedAt) : null
  }
}
