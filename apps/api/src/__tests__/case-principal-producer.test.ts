// @vitest-environment node
/**
 * SPEC0254 O6 (memory) — the verified principal producer, one test per row
 * of the §4.5 table, the CAS retry and `hasPrincipalVersionMismatch`.
 */
import {
  CaseAuthorityError,
  InMemoryCaseAuthority,
  InMemoryDatabase
} from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import { describe, expect, it, vi } from 'vitest'
import {
  PrincipalProducerError,
  produceVerifiedPrincipal
} from '../case-principal-producer.ts'
import {
  SYNTHETIC_TENANT_A,
  SYNTHETIC_TENANT_B
} from './support/synthetic-oidc-issuer.ts'

const TENANT = SYNTHETIC_TENANT_A as TenantId
const OTHER = SYNTHETIC_TENANT_B as TenantId
const OPERATOR = `oidc_${'1'.repeat(64)}`
const D_A = 'a'.repeat(64)
const D_B = 'b'.repeat(64)
const v = (n: number, digest = D_A) => `oidc-v${n}-${digest}`
const PROOF = `oidc-login:${'c'.repeat(64)}`

type Role = 'Operator' | 'Approver' | 'Supervisor' | 'Admin'

function fixture() {
  const db = new InMemoryDatabase()
  const authority = new InMemoryCaseAuthority(db)
  const audits = () =>
    db.state.auditEvents.filter(
      (event) =>
        (event.payload as { event?: string }).event === 'case_principal_changed'
    )
  const read = (operatorId = OPERATOR, tenantId = TENANT) =>
    authority.readSnapshot(tenantId, (s) => s.principal(operatorId))
  const seed = (input: {
    role: Role
    active: boolean
    authorityVersion: string
    identitySource?: 'verified_adapter' | 'synthetic_fixture'
    operatorId?: string
    tenantId?: TenantId
  }) =>
    authority.applyVerifiedPrincipalState({
      tenantId: input.tenantId ?? TENANT,
      operatorId: input.operatorId ?? OPERATOR,
      role: input.role,
      active: input.active,
      expectedRevision: 0,
      authorityVersion: input.authorityVersion,
      proofRef: 'synthetic-seed-proof',
      identitySource: input.identitySource ?? 'verified_adapter'
    })
  const produce = (input: {
    role: Role
    entryActive: boolean
    authorityVersion: string
  }) =>
    produceVerifiedPrincipal(authority, {
      tenantId: TENANT,
      operatorId: OPERATOR,
      role: input.role,
      entryActive: input.entryActive,
      authorityVersion: input.authorityVersion,
      proofRef: PROOF
    })
  return { db, authority, audits, read, seed, produce }
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(PrincipalProducerError)
    const failure = error as PrincipalProducerError
    return { status: failure.status, reasonCode: failure.reasonCode }
  }
  throw new Error('expected a producer refusal')
}

describe('SPEC0254 O6 — producer table (memory)', () => {
  it('row 1: creates an absent principal for an active entry', async () => {
    const f = fixture()
    await f.produce({
      role: 'Operator',
      entryActive: true,
      authorityVersion: v(3)
    })
    expect(await f.read()).toMatchObject({
      role: 'Operator',
      active: true,
      revision: 1,
      identitySource: 'verified_adapter',
      authorityVersion: v(3)
    })
    expect(f.audits()).toHaveLength(1)
  })

  it('row 2: refuses an absent principal for an inactive entry without writing', async () => {
    const f = fixture()
    expect(
      await refusal(
        f.produce({
          role: 'Operator',
          entryActive: false,
          authorityVersion: v(3)
        })
      )
    ).toEqual({ status: 401, reasonCode: 'inactive_group' })
    expect(await f.read()).toBeNull()
    expect(f.audits()).toHaveLength(0)
  })

  it.each([
    ['Np > N, active entry', v(4), true],
    ['Np > N, inactive entry', v(4), false],
    ['Np = N with another digest, active entry', v(3, D_B), true],
    ['Np = N with another digest, inactive entry', v(3, D_B), false]
  ])(
    'row 3: refuses %s without writing (rollback, P5)',
    async (_name, stored, entryActive) => {
      const f = fixture()
      await f.seed({
        role: 'Supervisor',
        active: true,
        authorityVersion: stored
      })
      expect(
        await refusal(
          f.produce({ role: 'Operator', entryActive, authorityVersion: v(3) })
        )
      ).toEqual({ status: 401, reasonCode: 'principal_version_ahead' })
      expect(await f.read()).toMatchObject({
        role: 'Supervisor',
        active: true,
        revision: 1,
        authorityVersion: stored
      })
      expect(f.audits()).toHaveLength(1)
    }
  )

  it('row 4: deactivates an active principal on an inactive entry and refuses (P4)', async () => {
    const f = fixture()
    await f.seed({ role: 'Approver', active: true, authorityVersion: v(3) })
    expect(
      await refusal(
        f.produce({
          role: 'Operator',
          entryActive: false,
          authorityVersion: v(3)
        })
      )
    ).toEqual({ status: 401, reasonCode: 'inactive_group' })
    expect(await f.read()).toMatchObject({
      role: 'Approver',
      active: false,
      revision: 2,
      identitySource: 'verified_adapter',
      authorityVersion: v(3)
    })
    expect(f.audits().at(-1)?.payload).toMatchObject({
      active: false,
      revision: 2
    })
  })

  it('row 5: refuses an inactive principal on an inactive entry without writing', async () => {
    const f = fixture()
    await f.seed({ role: 'Operator', active: false, authorityVersion: v(3) })
    expect(
      await refusal(
        f.produce({
          role: 'Operator',
          entryActive: false,
          authorityVersion: v(3)
        })
      )
    ).toEqual({ status: 401, reasonCode: 'inactive_group' })
    expect((await f.read())?.revision).toBe(1)
  })

  it('row 6: never reactivates an inactive principal under the same version', async () => {
    const f = fixture()
    await f.seed({ role: 'Operator', active: false, authorityVersion: v(3) })
    expect(
      await refusal(
        f.produce({
          role: 'Operator',
          entryActive: true,
          authorityVersion: v(3)
        })
      )
    ).toEqual({ status: 401, reasonCode: 'principal_inactive' })
    expect(await f.read()).toMatchObject({ active: false, revision: 1 })
    expect(f.audits()).toHaveLength(1)
  })

  it.each([
    [
      'a lower version (role change)',
      { role: 'Operator', active: true, authorityVersion: v(2) }
    ],
    [
      'a lower version (reactivation)',
      { role: 'Operator', active: false, authorityVersion: v(2) }
    ],
    [
      'a synthetic fixture principal',
      {
        role: 'Operator',
        active: true,
        authorityVersion: 'synthetic-authority-v1',
        identitySource: 'synthetic_fixture'
      }
    ],
    [
      'an unversioned verified principal',
      { role: 'Supervisor', active: true, authorityVersion: 'legacy-version' }
    ]
  ] as const)(
    'row 7: updates %s to the current version',
    async (_name, seed) => {
      const f = fixture()
      await f.seed(seed)
      await f.produce({
        role: 'Supervisor',
        entryActive: true,
        authorityVersion: v(3)
      })
      expect(await f.read()).toMatchObject({
        role: 'Supervisor',
        active: true,
        revision: 2,
        identitySource: 'verified_adapter',
        authorityVersion: v(3)
      })
      expect(f.audits()).toHaveLength(2)
    }
  )

  it('row 8: writes nothing for a current principal', async () => {
    const f = fixture()
    await f.seed({ role: 'Operator', active: true, authorityVersion: v(3) })
    await f.produce({
      role: 'Operator',
      entryActive: true,
      authorityVersion: v(3)
    })
    expect((await f.read())?.revision).toBe(1)
    expect(f.audits()).toHaveLength(1)
  })

  it('row 9: refuses a role drift under the same version without writing (P3)', async () => {
    const f = fixture()
    await f.seed({ role: 'Operator', active: true, authorityVersion: v(3) })
    expect(
      await refusal(
        f.produce({
          role: 'Supervisor',
          entryActive: true,
          authorityVersion: v(3)
        })
      )
    ).toEqual({ status: 401, reasonCode: 'principal_drift' })
    expect(await f.read()).toMatchObject({ role: 'Operator', revision: 1 })
  })
})

describe('SPEC0254 O6 — CAS retry and failures', () => {
  it('re-reads once after a principal conflict and then succeeds', async () => {
    const f = fixture()
    const original = f.authority.applyVerifiedPrincipalState.bind(f.authority)
    const write = vi
      .spyOn(f.authority, 'applyVerifiedPrincipalState')
      .mockImplementationOnce(async (input) => {
        // A concurrent first login wins the race.
        await original(input)
        throw new CaseAuthorityError(
          'principal_conflict',
          'Principal revision is stale'
        )
      })
    await f.produce({
      role: 'Operator',
      entryActive: true,
      authorityVersion: v(3)
    })
    expect(write).toHaveBeenCalledTimes(1)
    expect((await f.read())?.revision).toBe(1)
  })

  it('answers 503 after two conflicts in a row', async () => {
    const f = fixture()
    vi.spyOn(f.authority, 'applyVerifiedPrincipalState').mockRejectedValue(
      new CaseAuthorityError(
        'principal_conflict',
        'Principal revision is stale'
      )
    )
    expect(
      await refusal(
        f.produce({
          role: 'Operator',
          entryActive: true,
          authorityVersion: v(3)
        })
      )
    ).toEqual({ status: 503, reasonCode: 'principal_conflict' })
  })

  it.each([
    ['write', 'applyVerifiedPrincipalState'],
    ['read', 'readSnapshot']
  ] as const)('answers 503 when the %s fails', async (_name, method) => {
    const f = fixture()
    vi.spyOn(f.authority, method).mockRejectedValue(
      new CaseAuthorityError('case_authority_unavailable', 'unavailable')
    )
    expect(
      await refusal(
        f.produce({
          role: 'Operator',
          entryActive: true,
          authorityVersion: v(3)
        })
      )
    ).toEqual({ status: 503, reasonCode: 'principal_unavailable' })
  })

  it('refuses a malformed current authority version', async () => {
    const f = fixture()
    await expect(
      f.produce({
        role: 'Operator',
        entryActive: true,
        authorityVersion: 'oidc-v0-x'
      })
    ).rejects.toThrow(/authority version/)
  })
})

describe('SPEC0254 O6 — hasPrincipalVersionMismatch (memory)', () => {
  it('finds principals of the same N with another digest, per tenant only', async () => {
    const f = fixture()
    await f.seed({ role: 'Operator', active: true, authorityVersion: v(3) })
    await f.seed({
      role: 'Operator',
      active: false,
      authorityVersion: v(30, D_B),
      operatorId: `oidc_${'2'.repeat(64)}`
    })
    await f.seed({
      role: 'Operator',
      active: true,
      authorityVersion: 'synthetic-authority-v1',
      identitySource: 'synthetic_fixture',
      operatorId: 'synthetic.fixture'
    })
    await f.seed({
      role: 'Operator',
      active: true,
      authorityVersion: v(3, D_B),
      tenantId: OTHER
    })
    const check = (tenantId: TenantId, prefix: string, current: string) =>
      f.authority.readSnapshot(tenantId, (s) =>
        s.hasPrincipalVersionMismatch(prefix, current)
      )
    expect(await check(TENANT, 'oidc-v3-', v(3))).toBe(false)
    expect(await check(TENANT, 'oidc-v3-', v(3, D_B))).toBe(true)
    expect(await check(TENANT, 'oidc-v30-', v(30, D_B))).toBe(false)
    expect(await check(TENANT, 'oidc-v30-', v(30))).toBe(true)
    expect(await check(TENANT, 'oidc-v4-', v(4))).toBe(false)
    // The adversary tenant's mismatch never leaks into tenant A.
    expect(await check(OTHER, 'oidc-v3-', v(3))).toBe(true)
    expect(await check(OTHER, 'oidc-v3-', v(3, D_B))).toBe(false)
  })
})
