/**
 * SPEC 0262 §3 — the cookie is bound to the `case_principals.revision` it was
 * issued under. The binding is read from the Auth record (never from the
 * client) and compared with the current principal on every request and before
 * any cookie is issued. The principal is read from the data plane, never
 * through the Auth role.
 */
import type { CaseAuthorityPort, CasePrincipalRecord } from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import type { OperatorIdentity } from '@cvg/shared'
import {
  principalIsCurrent,
  type CasePrincipalPolicy
} from './case-authorization/case-routes.ts'

/** 401: the principal or the binding is not current. 503: it cannot be read. */
export class SessionBindingError extends Error {
  constructor(readonly status: 401 | 503) {
    super(
      status === 401
        ? 'Operator session binding is not current'
        : 'Operator principal is unavailable'
    )
    this.name = 'SessionBindingError'
  }
}

type PrincipalReader = Pick<CaseAuthorityPort, 'readSnapshot'>

async function readPrincipal(
  authority: PrincipalReader,
  identity: OperatorIdentity
): Promise<CasePrincipalRecord | null> {
  if (!identity.tenantId) throw new SessionBindingError(401)
  try {
    return await authority.readSnapshot(identity.tenantId as TenantId, (s) =>
      s.principal(identity.operatorId)
    )
  } catch {
    throw new SessionBindingError(503)
  }
}

function currentPolicy(
  policy: CasePrincipalPolicy
): CasePrincipalPolicy & { authorityVersion: string } {
  // Without the producer's version the authority is not configured: every
  // protected path is a 503, never a session trusted on its own.
  if (policy.authorityVersion === null) throw new SessionBindingError(503)
  return { ...policy, authorityVersion: policy.authorityVersion }
}

/** The current principal for a session about to be created (401/503 otherwise). */
export async function readCurrentPrincipal(
  authority: PrincipalReader,
  policy: CasePrincipalPolicy,
  identity: OperatorIdentity
): Promise<CasePrincipalRecord> {
  const bound = currentPolicy(policy)
  const principal = await readPrincipal(authority, identity)
  if (!principalIsCurrent(principal, identity, bound)) {
    throw new SessionBindingError(401)
  }
  return principal
}

/** Throws {@link SessionBindingError} unless the session still binds the principal. */
export async function assertSessionBinding(
  authority: PrincipalReader,
  policy: CasePrincipalPolicy,
  session: {
    readonly identity: OperatorIdentity
    readonly principalRevision: number
  }
): Promise<void> {
  const principal = await readCurrentPrincipal(
    authority,
    policy,
    session.identity
  )
  if (principal.revision !== session.principalRevision) {
    throw new SessionBindingError(401)
  }
}
