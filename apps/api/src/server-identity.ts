import {
  DomainError,
  parseOperatorIdentity,
  roleHasPermission,
  type IdentityMode,
  type OperatorIdentity,
  type OperatorIdentityResolver
} from '@cvg/shared'
import {
  TenantIdSchema,
  type CapabilityApproval,
  type CapabilityApprovalRecord,
  type TenantId
} from '@cvg/platform'
import { z } from 'zod'
import { type OperatorSessionStore } from './operator-session.ts'
import { type OidcLoginConfig } from './oidc-config.ts'
import { type CaseAuthorityPort } from '@cvg/persistence'
import { BuildServerOptions } from './server-options.ts'
import { CONTROLLED_TENANT_ID } from './server-capability.ts'
import { RuntimePersistence } from './server-persistence.ts'

export function resolveDataPlaneTenant(
  headers: Record<string, unknown>,
  identity: OperatorIdentity
): TenantId {
  const rawHeader = headers['x-tenant-id']
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  const parsedHeader = TenantIdSchema.safeParse(candidate)
  if (
    identity.tenantId &&
    parsedHeader.success &&
    identity.tenantId !== parsedHeader.data
  ) {
    throw new DomainError(
      'forbidden',
      'Operator identity cannot access this tenant scope'
    )
  }
  if (process.env.NODE_ENV !== 'test' && !identity.tenantId) {
    throw new DomainError(
      'unauthorized',
      'Trusted operator tenant scope is required in production'
    )
  }
  return (
    identity.tenantId ??
    (parsedHeader.success ? parsedHeader.data : CONTROLLED_TENANT_ID)
  )
}

export function resolveOptionalRequestTenant(
  headers: Record<string, unknown>
): TenantId {
  const rawHeader = headers['x-tenant-id']
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  const parsed = TenantIdSchema.safeParse(candidate)
  if (process.env.NODE_ENV !== 'test' && !parsed.success) {
    throw new DomainError(
      'unauthorized',
      'Trusted tenant scope is required for this mutation'
    )
  }
  return parsed.success ? parsed.data : CONTROLLED_TENANT_ID
}

export function requireOperatorIdentity(
  headers: Record<string, unknown>,
  permission: string,
  resolver?: OperatorIdentityResolver
): OperatorIdentity {
  try {
    const identity = resolveOperatorIdentity(headers, resolver)
    if (!roleHasPermission(identity.role, permission)) {
      throw new DomainError('forbidden', `Role cannot perform ${permission}`)
    }
    return identity
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError(
      'unauthorized',
      'Valid operator identity headers are required'
    )
  }
}

export function requireAnyOperatorPermission(
  headers: Record<string, unknown>,
  permissions: string[],
  resolver?: OperatorIdentityResolver
): OperatorIdentity {
  try {
    const identity = resolveOperatorIdentity(headers, resolver)
    if (
      !permissions.some((permission) =>
        roleHasPermission(identity.role, permission)
      )
    ) {
      throw new DomainError('forbidden', 'Role cannot access this resource')
    }
    return identity
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError(
      'unauthorized',
      'Valid operator identity headers are required'
    )
  }
}

export function requirePlatformScope(
  headers: Record<string, unknown>,
  permission: string,
  resolver?: OperatorIdentityResolver
): { tenantId: z.infer<typeof TenantIdSchema> } {
  const identity = requireOperatorIdentity(headers, permission, resolver)
  const rawTenant = Array.isArray(headers['x-tenant-id'])
    ? headers['x-tenant-id'][0]
    : headers['x-tenant-id']
  const tenant = TenantIdSchema.safeParse(rawTenant)
  const scopedTenant = tenant.success
    ? tenant.data
    : identity.tenantId
      ? TenantIdSchema.parse(identity.tenantId)
      : null
  if (!scopedTenant) {
    throw new DomainError(
      'unauthorized',
      'Valid tenant scope headers are required'
    )
  }
  if (identity.tenantId && identity.tenantId !== scopedTenant) {
    throw new DomainError(
      'forbidden',
      'Operator identity cannot access this tenant scope'
    )
  }
  if (process.env.NODE_ENV !== 'test' && !identity.tenantId) {
    throw new DomainError(
      'unauthorized',
      'Trusted operator tenant scope is required in production'
    )
  }
  return { tenantId: scopedTenant }
}

export function capabilityApprovalReference(
  record: CapabilityApprovalRecord
): CapabilityApproval {
  return {
    id: record.id,
    tenantId: record.tenantId,
    agentId: record.agentId,
    versionId: record.versionId,
    toolName: record.toolName,
    actorId: record.actorId,
    expiresAt: new Date(record.expiresAt.getTime())
  }
}

export function resolveOperatorIdentity(
  headers: Record<string, unknown>,
  resolver?: OperatorIdentityResolver
): OperatorIdentity {
  if (resolver) return resolver(headers)
  if (process.env.NODE_ENV !== 'test') {
    throw new DomainError(
      'unauthorized',
      'A trusted operator identity resolver is required in production'
    )
  }
  return parseOperatorIdentity(headers)
}

/**
 * SPEC0254 §4.8 — composition refusals, read from `process.env` (I3, I4, I6).
 * The OIDC login and an injected transport exist only with NODE_ENV=test in
 * this slice; the principal authority outside test exists only with the
 * login that produces its principals.
 */
export function assertOperatorLoginComposition(
  options: BuildServerOptions,
  identityMode: IdentityMode
): void {
  const controlledTest = process.env.NODE_ENV === 'test'
  if (options.oidcTransport !== undefined && !controlledTest) {
    throw new Error('oidcTransport is accepted only with NODE_ENV=test')
  }
  const login = options.operatorLogin
  if (!login) {
    if (options.casePrincipalAuthority && !controlledTest) {
      throw new Error(
        'casePrincipalAuthority requires the OIDC operator login outside NODE_ENV=test'
      )
    }
    return
  }
  if (!controlledTest) {
    throw new Error('OIDC login is not qualified for this environment')
  }
  if (identityMode !== 'trusted') {
    throw new Error('OIDC login requires the trusted identity mode')
  }
  if (!options.operatorSessionStore) {
    throw new Error('OIDC login requires an operator session store')
  }
  if (options.operatorIdentityResolver) {
    throw new Error(
      'OIDC login refuses an HMAC operatorIdentityResolver in the same composition'
    )
  }
  if (
    options.casePrincipalAuthority &&
    options.casePrincipalAuthority.authorityVersion !== login.authorityVersion
  ) {
    throw new Error(
      'casePrincipalAuthority must carry the OIDC login authority version'
    )
  }
}

/**
 * SPEC0254 §4.8 step 6 (P5): a principal recorded under the current matrix
 * version N with another digest means the matrix was edited without raising
 * N. Reads `case_principals` of each matrix tenant under its RLS context.
 */
export async function assertPrincipalVersionsCurrent(
  caseAuthority: CaseAuthorityPort,
  config: OidcLoginConfig
): Promise<void> {
  const prefix = `oidc-v${config.groupMatrix.version}-`
  const tenants = [
    ...new Set(config.groupMatrix.entries.map((entry) => entry.tenantId))
  ]
  for (const tenantId of tenants) {
    const mismatch = await caseAuthority.readSnapshot(tenantId, (snapshot) =>
      snapshot.hasPrincipalVersionMismatch(prefix, config.authorityVersion)
    )
    if (mismatch) {
      throw new Error(
        'OIDC group matrix changed without a higher version; raise the matrix version'
      )
    }
  }
}

/**
 * Trusted mode never falls back to simulation headers: without a resolver it
 * fails closed, and resolver identities must be tenant-bound so a
 * self-asserted tenant header can never widen scope. Simulation mode keeps the
 * controlled header flow, delegating to an injected resolver when present.
 */
export function createEffectiveOperatorIdentityResolver(
  identityMode: IdentityMode,
  resolver: OperatorIdentityResolver | undefined
): OperatorIdentityResolver | undefined {
  if (!resolver) {
    if (identityMode === 'trusted') {
      return () => {
        throw new DomainError(
          'unauthorized',
          'A trusted operator identity resolver is required in production'
        )
      }
    }
    return undefined
  }
  if (identityMode === 'simulation') return resolver
  /**
   * Trusted resolvers enforce replay protection per token. Some platform/admin
   * routes resolve the identity more than once for the same request, so the
   * effective resolver memoizes per headers object: a replay is rejected only
   * when the same token is presented in a different request.
   */
  const memo = new WeakMap<object, OperatorIdentity>()
  return (headers) => {
    const cached = memo.get(headers)
    if (cached) return cached
    const identity = resolver(headers)
    if (!identity.tenantId) {
      throw new DomainError(
        'unauthorized',
        'Trusted operator identity must be tenant-bound'
      )
    }
    memo.set(headers, identity)
    return identity
  }
}

export function createSessionAwareOperatorIdentityResolver(
  resolver: OperatorIdentityResolver | undefined,
  sessionStore: OperatorSessionStore | undefined,
  sessionIdentityByHeaders: WeakMap<object, OperatorIdentity | null>,
  requireSessionStore: boolean
): OperatorIdentityResolver | undefined {
  if (!resolver) return undefined
  if (requireSessionStore && !sessionStore) {
    return () => {
      throw new DomainError(
        'configuration_error',
        'Operator session store is required for trusted requests'
      )
    }
  }
  if (!sessionStore) return resolver
  return (headers) => {
    if (sessionIdentityByHeaders.has(headers)) {
      const identity = sessionIdentityByHeaders.get(headers)
      if (!identity) {
        throw new DomainError(
          'unauthorized',
          'Operator session is missing or expired'
        )
      }
      return identity
    }
    return resolver(headers)
  }
}

export async function appendPlatformAudit(
  audit: RuntimePersistence['audit'],
  identity: OperatorIdentity,
  correlationId: string,
  tenantId: TenantId,
  payload: Record<string, unknown>
): Promise<void> {
  await audit.append(
    {
      type: 'integration_event',
      actorType: identity.role,
      actorId: identity.operatorId,
      correlationId,
      policyVersion: 'platform-control-plane-v1',
      payload
    },
    tenantId
  )
}
