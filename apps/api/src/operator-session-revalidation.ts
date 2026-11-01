import type { CaseAuthorityPort } from '@cvg/persistence'
import {
  assertSessionBinding,
  SessionBindingError
} from './operator-session-binding.ts'
import type { CasePrincipalPolicy } from './case-authorization/case-routes.ts'
import type {
  OperatorSessionRecord,
  OperatorSessionStore
} from './operator-session.ts'

export interface OperatorSessionRevalidationDeps {
  readonly operatorSessionStore: Pick<OperatorSessionStore, 'get'>
  /** SPEC 0262 §3: where the bound principal revision is read (data plane). */
  readonly caseAuthority: Pick<CaseAuthorityPort, 'readSnapshot'>
  readonly principalPolicy: CasePrincipalPolicy
  /** Epoch ms; injectable so that expiry is testable without a clock. */
  readonly now?: () => number
}

/**
 * SPEC 0296 A10, slice 0. What the session hook decides for one cookie, as a function of the
 * session id alone:
 * - `valid`: the record is current and still binds the principal revision;
 * - `revoked`: no record, an expired one, or a stale principal revision (the cookie is dead);
 * - `unavailable`: the session store (`store`) or the principal source (`principal`) failed;
 *   never "still valid" and never "revoked".
 *
 * It reads the session store every time. It does not read, and cannot be given, the per-request
 * identity caches of the server composition: repeating a cached lookup inside a long-lived stream
 * would never see a revocation.
 */
export type OperatorSessionRevalidation =
  | { readonly status: 'valid'; readonly record: OperatorSessionRecord }
  | { readonly status: 'revoked' }
  | { readonly status: 'unavailable'; readonly source: 'store' | 'principal' }

export async function revalidateOperatorSession(
  deps: OperatorSessionRevalidationDeps,
  sessionId: string
): Promise<OperatorSessionRevalidation> {
  const now = deps.now ?? Date.now
  let record: OperatorSessionRecord | null
  try {
    record = await deps.operatorSessionStore.get(sessionId)
  } catch {
    return { status: 'unavailable', source: 'store' }
  }
  if (!record || record.expiresAt <= now()) return { status: 'revoked' }
  // SPEC 0262 §3: a stale binding retires the cookie; an outage keeps it. Neither ever falls back
  // to the session alone.
  try {
    await assertSessionBinding(deps.caseAuthority, deps.principalPolicy, record)
  } catch (error) {
    return error instanceof SessionBindingError && error.status === 401
      ? { status: 'revoked' }
      : { status: 'unavailable', source: 'principal' }
  }
  // the binding read takes time: the session may have expired meanwhile
  if (record.expiresAt <= now()) return { status: 'revoked' }
  return { status: 'valid', record }
}
