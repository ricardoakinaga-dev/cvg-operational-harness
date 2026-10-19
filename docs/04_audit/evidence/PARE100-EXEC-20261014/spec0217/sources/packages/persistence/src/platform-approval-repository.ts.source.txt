import {
  CorrelationIdSchema,
  createDomainId,
  DomainIdSchema,
  sanitizeAuditEvidencePayload
} from '@cvg/shared'
import {
  AgentIdSchema,
  AgentVersionIdSchema,
  TraceIdSchema,
  TenantIdSchema,
  createCapabilityInputHash,
  type CapabilityApprovalAuthority,
  type CapabilityApprovalIssueInput,
  type CapabilityApprovalRecord,
  type CapabilityApprovalVerificationInput,
  type CapabilityApprovalStatus,
  type AgentId,
  type AgentVersionId,
  type TenantId
} from '@cvg/platform'
import type { PostgresTransactionClient } from './postgres.ts'

interface CapabilityApprovalRow {
  id: string
  tenant_id: TenantId
  agent_id: AgentId
  version_id: AgentVersionId
  tool_name: string
  input_hash: string
  actor_id: string
  nonce: string
  issuer: string
  expires_at: Date
  issued_at: Date
  status: CapabilityApprovalStatus
  consumed_at: Date | null
  revoked_at: Date | null
}

export interface PostgresCapabilityApprovalRepositoryOptions {
  now?: () => Date
}

const approvalColumns = `
  id, tenant_id, agent_id, version_id, tool_name, input_hash,
  actor_id, nonce, issuer, expires_at, issued_at, status,
  consumed_at, revoked_at`

export class PostgresCapabilityApprovalRepository implements CapabilityApprovalAuthority {
  private readonly now: () => Date

  constructor(
    private readonly client: PostgresTransactionClient,
    options: PostgresCapabilityApprovalRepositoryOptions = {}
  ) {
    this.now = options.now ?? (() => new Date())
  }

  async issue(
    rawInput: CapabilityApprovalIssueInput
  ): Promise<CapabilityApprovalRecord> {
    const input = normalizeIssueInput(rawInput, this.now)
    const id = createDomainId('approval')
    const inputHash = createCapabilityInputHash(input)
    try {
      const result = await this.client.query<CapabilityApprovalRow>(
        `INSERT INTO platform_capability_approvals
           (id, tenant_id, agent_id, version_id, tool_name, input_hash,
            actor_id, nonce, issuer, expires_at, issued_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'issued')
         RETURNING ${approvalColumns}`,
        [
          id,
          input.tenantId,
          input.agentId,
          input.versionId,
          input.toolName,
          inputHash,
          input.actorId,
          input.nonce,
          input.issuer,
          input.expiresAt,
          input.issuedAt
        ]
      )
      const row = result.rows[0]
      if (!row) throw new Error('Capability approval was not persisted')
      return mapApproval(row)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error('Approval nonce already exists')
      }
      throw error
    }
  }

  async verifyAndConsume(
    rawInput: CapabilityApprovalVerificationInput
  ): Promise<CapabilityApprovalRecord | null> {
    const input = normalizeVerificationInput(rawInput)
    if (!input) return null

    await this.client.query('BEGIN')
    try {
      const result = await this.client.query<CapabilityApprovalRow>(
        `SELECT ${approvalColumns}
         FROM platform_capability_approvals
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [input.tenantId, input.approvalId]
      )
      const current = result.rows[0]
      if (!current || current.status !== 'issued') {
        await this.client.query('COMMIT')
        return null
      }

      const now = copyDate(this.now(), 'Approval verification time')
      if (new Date(current.expires_at).getTime() <= now.getTime()) {
        await this.client.query(
          `UPDATE platform_capability_approvals
           SET status = 'expired'
           WHERE tenant_id = $1 AND id = $2 AND status = 'issued'`,
          [input.tenantId, input.approvalId]
        )
        await this.client.query('COMMIT')
        return null
      }

      let inputHash: string
      try {
        inputHash = createCapabilityInputHash({
          tenantId: input.tenantId,
          agentId: input.agentId,
          versionId: input.versionId,
          toolName: input.toolName,
          input: input.input
        })
      } catch {
        await this.client.query('COMMIT')
        return null
      }

      if (
        current.agent_id !== input.agentId ||
        current.version_id !== input.versionId ||
        current.tool_name !== input.toolName ||
        current.actor_id !== input.actorId ||
        current.input_hash !== inputHash
      ) {
        await this.client.query('COMMIT')
        return null
      }

      const consumed = await this.client.query<CapabilityApprovalRow>(
        `UPDATE platform_capability_approvals
         SET status = 'consumed', consumed_at = $3
         WHERE tenant_id = $1 AND id = $2 AND status = 'issued'
         RETURNING ${approvalColumns}`,
        [input.tenantId, input.approvalId, now]
      )
      const row = consumed.rows[0]
      if (!row) {
        await this.client.query('COMMIT')
        return null
      }
      if (input.consumptionAudit) {
        const payload = sanitizeAuditEvidencePayload({
          tenantId: input.tenantId,
          event: 'capability_approval_consumed',
          approvalId: row.id,
          agentId: row.agent_id,
          versionId: row.version_id,
          toolName: row.tool_name,
          actorId: row.actor_id,
          ...(input.consumptionAudit.traceId !== undefined
            ? { traceId: input.consumptionAudit.traceId }
            : {})
        }).payload
        await this.client.query(
          `INSERT INTO audit_events
             (tenant_id, id, type, actor_type, actor_id, correlation_id,
              policy_version, payload, created_at)
           VALUES ($1, $2, 'approval_decision', 'System',
                   'capability-approval-authority', $3, $4, $5::jsonb, $6)`,
          [
            input.tenantId,
            createDomainId('audit'),
            input.consumptionAudit.correlationId,
            input.consumptionAudit.policyVersion,
            JSON.stringify(payload),
            now
          ]
        )
      }
      await this.client.query('COMMIT')
      return mapApproval(row)
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async revoke(
    approvalId: string,
    issuer: string,
    tenantId?: TenantId
  ): Promise<boolean> {
    if (
      !DomainIdSchema.safeParse(approvalId).success ||
      typeof issuer !== 'string' ||
      !issuer.trim() ||
      !tenantId ||
      !TenantIdSchema.safeParse(tenantId).success
    ) {
      return false
    }
    const now = copyDate(this.now(), 'Approval revocation time')
    const result = await this.client.query<{ id: string }>(
      `UPDATE platform_capability_approvals
       SET status = 'revoked', revoked_at = $2
       WHERE id = $1 AND tenant_id = $4 AND issuer = $3 AND status = 'issued'
       RETURNING id`,
      [approvalId, now, issuer, tenantId]
    )
    return result.rows.length > 0
  }

  async get(
    approvalId: string,
    tenantId?: TenantId
  ): Promise<CapabilityApprovalRecord | null> {
    if (
      !DomainIdSchema.safeParse(approvalId).success ||
      !tenantId ||
      !TenantIdSchema.safeParse(tenantId).success
    ) {
      return null
    }
    const result = await this.client.query<CapabilityApprovalRow>(
      `SELECT ${approvalColumns}
       FROM platform_capability_approvals
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [tenantId, approvalId]
    )
    const row = result.rows[0]
    return row ? mapApproval(row) : null
  }
}

function normalizeIssueInput(
  rawInput: CapabilityApprovalIssueInput,
  now: () => Date
): CapabilityApprovalIssueInput & {
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  issuedAt: Date
  nonce: string
} {
  const tenantId = TenantIdSchema.parse(rawInput.tenantId)
  const agentId = AgentIdSchema.parse(rawInput.agentId)
  const versionId = AgentVersionIdSchema.parse(rawInput.versionId)
  const issuedAt = copyDate(now(), 'Approval issue time')
  const expiresAt = copyDate(rawInput.expiresAt, 'Approval expiry')
  const toolName =
    typeof rawInput.toolName === 'string' ? rawInput.toolName.trim() : ''
  const actorId =
    typeof rawInput.actorId === 'string' ? rawInput.actorId.trim() : ''
  const issuer =
    typeof rawInput.issuer === 'string' ? rawInput.issuer.trim() : ''
  const nonce =
    typeof rawInput.nonce === 'string'
      ? rawInput.nonce.trim() || createDomainId('nonce')
      : createDomainId('nonce')
  if (!toolName || !actorId || !issuer || !nonce) {
    throw new Error('Approval binding fields are required')
  }
  if (actorId === issuer) {
    throw new Error('Approval issuer and executor must be different')
  }
  if (expiresAt.getTime() <= issuedAt.getTime()) {
    throw new Error('Approval expiry must be in the future')
  }
  return {
    ...rawInput,
    tenantId,
    agentId,
    versionId,
    toolName,
    actorId,
    issuer,
    nonce,
    expiresAt,
    issuedAt
  }
}

function normalizeVerificationInput(
  rawInput: CapabilityApprovalVerificationInput
):
  | (CapabilityApprovalVerificationInput & {
      tenantId: TenantId
      agentId: AgentId
      versionId: AgentVersionId
    })
  | null {
  const tenantId = TenantIdSchema.safeParse(rawInput.tenantId)
  const agentId = AgentIdSchema.safeParse(rawInput.agentId)
  const versionId = AgentVersionIdSchema.safeParse(rawInput.versionId)
  const consumptionAudit = rawInput.consumptionAudit
  const validConsumptionAudit =
    consumptionAudit === undefined ||
    (typeof consumptionAudit === 'object' &&
      consumptionAudit !== null &&
      CorrelationIdSchema.safeParse(consumptionAudit.correlationId).success &&
      typeof consumptionAudit.policyVersion === 'string' &&
      consumptionAudit.policyVersion.trim().length > 0 &&
      (consumptionAudit.traceId === undefined ||
        TraceIdSchema.safeParse(consumptionAudit.traceId).success))
  if (
    !tenantId.success ||
    !agentId.success ||
    !versionId.success ||
    !validConsumptionAudit ||
    !DomainIdSchema.safeParse(rawInput.approvalId).success ||
    typeof rawInput.toolName !== 'string' ||
    typeof rawInput.actorId !== 'string' ||
    !rawInput.toolName.trim() ||
    !rawInput.actorId.trim()
  ) {
    return null
  }
  return {
    ...rawInput,
    tenantId: tenantId.data,
    agentId: agentId.data,
    versionId: versionId.data,
    toolName: rawInput.toolName.trim(),
    actorId: rawInput.actorId.trim(),
    ...(consumptionAudit
      ? {
          consumptionAudit: {
            correlationId: CorrelationIdSchema.parse(
              consumptionAudit.correlationId
            ),
            policyVersion: consumptionAudit.policyVersion.trim(),
            ...(consumptionAudit.traceId !== undefined
              ? { traceId: TraceIdSchema.parse(consumptionAudit.traceId) }
              : {})
          }
        }
      : {})
  }
}

function mapApproval(row: CapabilityApprovalRow): CapabilityApprovalRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    agentId: row.agent_id,
    versionId: row.version_id,
    toolName: row.tool_name,
    inputHash: row.input_hash,
    actorId: row.actor_id,
    nonce: row.nonce,
    issuer: row.issuer,
    expiresAt: new Date(row.expires_at),
    issuedAt: new Date(row.issued_at),
    status: row.status,
    consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null
  }
}

function copyDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${label} must be a valid date`)
  }
  return new Date(value.getTime())
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  )
}
