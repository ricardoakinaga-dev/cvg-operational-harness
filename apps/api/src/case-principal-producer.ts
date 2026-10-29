/**
 * SPEC0254 §4.5 — the verified producer of `case_principals`.
 *
 * The only caller of `applyVerifiedPrincipalState` outside fixtures. It is
 * never an HTTP route, never reads a request body and is never called by the
 * assignment registry. It runs in the OIDC callback, after the ID token and
 * the claims were verified and BEFORE the session is created (I2). Under the
 * same matrix version a login can only remove access (P4); access is granted
 * only on the first registration or with a higher matrix version (P5).
 */
import {
  CaseAuthorityError,
  type CaseAuthorityPort,
  type CasePrincipalRecord
} from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import {
  parseOidcAuthorityVersion,
  type OidcMatrixRole
} from './oidc-config.ts'
import type { OidcLoginReasonCode } from './oidc-identity.ts'

export class PrincipalProducerError extends Error {
  constructor(
    readonly status: 401 | 503,
    readonly reasonCode: OidcLoginReasonCode
  ) {
    super('Operator principal could not be made current')
    this.name = 'PrincipalProducerError'
  }
}

export interface ProduceVerifiedPrincipalInput {
  readonly tenantId: TenantId | string
  readonly operatorId: string
  readonly role: OidcMatrixRole
  /** Whether the matched matrix entry is active. */
  readonly entryActive: boolean
  /** Current `oidc-v<N>-<D>`. */
  readonly authorityVersion: string
  readonly proofRef: string
}

type Decision =
  | { readonly kind: 'none' }
  | { readonly kind: 'refuse'; readonly reasonCode: OidcLoginReasonCode }
  | {
      readonly kind: 'write'
      readonly role: OidcMatrixRole
      readonly active: boolean
      /** Row 4: the write deactivates and the login is still refused. */
      readonly refuseWith?: OidcLoginReasonCode
    }

/** §4.5 table, read top to bottom; the first matching row wins. */
function decide(
  principal: CasePrincipalRecord | null,
  input: ProduceVerifiedPrincipalInput,
  current: { readonly n: number; readonly digest: string }
): Decision {
  if (!principal) {
    return input.entryActive
      ? { kind: 'write', role: input.role, active: true } // row 1
      : { kind: 'refuse', reasonCode: 'inactive_group' } // row 2
  }
  const stored = parseOidcAuthorityVersion(principal.authorityVersion)
  const storedN = stored?.n ?? 0
  if (
    storedN > current.n ||
    (storedN === current.n && stored?.digest !== current.digest)
  ) {
    return { kind: 'refuse', reasonCode: 'principal_version_ahead' } // row 3
  }
  if (!input.entryActive) {
    return principal.active
      ? {
          kind: 'write',
          role: principal.role,
          active: false,
          refuseWith: 'inactive_group'
        } // row 4
      : { kind: 'refuse', reasonCode: 'inactive_group' } // row 5
  }
  if (!principal.active && storedN === current.n) {
    return { kind: 'refuse', reasonCode: 'principal_inactive' } // row 6
  }
  if (storedN < current.n || principal.identitySource !== 'verified_adapter') {
    return { kind: 'write', role: input.role, active: true } // row 7
  }
  if (principal.active && principal.role === input.role) {
    return { kind: 'none' } // row 8
  }
  return { kind: 'refuse', reasonCode: 'principal_drift' } // row 9
}

/**
 * Returns the principal record that is current after the production (SPEC
 * 0262 §3): the one read on a `none` decision, the confirmed one on a write.
 */
export async function produceVerifiedPrincipal(
  authority: Pick<
    CaseAuthorityPort,
    'readSnapshot' | 'applyVerifiedPrincipalState'
  >,
  input: ProduceVerifiedPrincipalInput
): Promise<CasePrincipalRecord> {
  const current = parseOidcAuthorityVersion(input.authorityVersion)
  if (!current) throw new Error('OIDC authority version is invalid')
  const tenantId = input.tenantId as TenantId
  // One re-read after a lost CAS; a second conflict is an outage (503).
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let principal: CasePrincipalRecord | null
    try {
      principal = await authority.readSnapshot(tenantId, (snapshot) =>
        snapshot.principal(input.operatorId)
      )
    } catch {
      throw new PrincipalProducerError(503, 'principal_unavailable')
    }
    const decision = decide(principal, input, current)
    if (decision.kind === 'none') {
      // `none` only exists for a present, active principal (row 8).
      return principal as CasePrincipalRecord
    }
    if (decision.kind === 'refuse') {
      throw new PrincipalProducerError(401, decision.reasonCode)
    }
    let written: CasePrincipalRecord
    try {
      written = await authority.applyVerifiedPrincipalState({
        tenantId,
        operatorId: input.operatorId,
        role: decision.role,
        active: decision.active,
        expectedRevision: principal?.revision ?? 0,
        authorityVersion: input.authorityVersion,
        proofRef: input.proofRef,
        identitySource: 'verified_adapter'
      })
    } catch (error) {
      if (
        error instanceof CaseAuthorityError &&
        error.code === 'principal_conflict'
      ) {
        continue
      }
      throw new PrincipalProducerError(503, 'principal_unavailable')
    }
    if (decision.refuseWith) {
      throw new PrincipalProducerError(401, decision.refuseWith)
    }
    return written
  }
  throw new PrincipalProducerError(503, 'principal_conflict')
}
