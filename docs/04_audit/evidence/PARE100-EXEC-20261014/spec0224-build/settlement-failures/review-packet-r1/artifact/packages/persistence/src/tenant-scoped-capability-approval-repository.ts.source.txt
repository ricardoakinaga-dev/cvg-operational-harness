import {
  TenantIdSchema,
  type CapabilityApprovalAuthority,
  type CapabilityApprovalIssueInput,
  type CapabilityApprovalRecord,
  type CapabilityApprovalVerificationInput,
  type TenantId
} from '@cvg/platform'
import {
  PostgresCapabilityApprovalRepository,
  type PostgresCapabilityApprovalRepositoryOptions
} from './platform-approval-repository.ts'
import {
  withTenantContext,
  type PostgresPoolLike
} from './tenant-scoped-postgres.ts'

/**
 * Binds every approval operation to a checked-out tenant connection. In
 * particular, verifyAndConsume runs its whole transaction on that one
 * connection, so a pool cannot split BEGIN/SELECT/UPDATE/COMMIT.
 */
export class TenantScopedPostgresCapabilityApprovalRepository implements CapabilityApprovalAuthority {
  constructor(
    private readonly pool: PostgresPoolLike,
    private readonly options: PostgresCapabilityApprovalRepositoryOptions = {}
  ) {}

  issue(
    input: CapabilityApprovalIssueInput
  ): Promise<CapabilityApprovalRecord> {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    return withTenantContext(this.pool, tenantId, (client) =>
      new PostgresCapabilityApprovalRepository(client, this.options).issue(
        input
      )
    )
  }

  verifyAndConsume(
    input: CapabilityApprovalVerificationInput
  ): Promise<CapabilityApprovalRecord | null> {
    const tenantId = TenantIdSchema.safeParse(input.tenantId)
    if (!tenantId.success) return Promise.resolve(null)
    return withTenantContext(this.pool, tenantId.data, (client) =>
      new PostgresCapabilityApprovalRepository(
        client,
        this.options
      ).verifyAndConsume(input)
    )
  }

  revoke(
    approvalId: string,
    issuer: string,
    tenantId?: TenantId
  ): Promise<boolean> {
    if (!tenantId || !TenantIdSchema.safeParse(tenantId).success) {
      return Promise.resolve(false)
    }
    return withTenantContext(this.pool, tenantId, (client) =>
      new PostgresCapabilityApprovalRepository(client, this.options).revoke(
        approvalId,
        issuer,
        tenantId
      )
    )
  }

  get(
    approvalId: string,
    tenantId?: TenantId
  ): Promise<CapabilityApprovalRecord | null> {
    if (!tenantId || !TenantIdSchema.safeParse(tenantId).success) {
      return Promise.resolve(null)
    }
    return withTenantContext(this.pool, tenantId, (client) =>
      new PostgresCapabilityApprovalRepository(client, this.options).get(
        approvalId,
        tenantId
      )
    )
  }
}
