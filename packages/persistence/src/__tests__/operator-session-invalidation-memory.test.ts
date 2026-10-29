/**
 * SPEC 0262 §6.1 / R14 (port, memory): the invalidation bumps ONLY the
 * principal revision, audits target/before/after/operator/proof digest, and
 * never creates, repeats or edits identity attributes. Synthetic data only.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { TenantId } from '@cvg/platform'
import {
  CaseAuthorityError,
  InMemoryCaseAuthority,
  InMemoryDatabase,
  type InvalidateOperatorSessionsInput
} from '../index.ts'

const tenant = 'tenant_00000000-0000-4000-8000-000000000262' as TenantId
const operatorId = 'operator.invalidate.synthetic'
const proofDigest = createHash('sha256').update('synthetic-proof').digest('hex')

async function seeded() {
  const db = new InMemoryDatabase()
  const authority = new InMemoryCaseAuthority(db)
  await authority.applyVerifiedPrincipalState({
    tenantId: tenant,
    operatorId,
    role: 'Supervisor',
    active: true,
    expectedRevision: 0,
    authorityVersion: 'synthetic-authority-v1',
    proofRef: 'synthetic-proof:seed',
    identitySource: 'verified_adapter'
  })
  const input = (
    overrides: Partial<InvalidateOperatorSessionsInput> = {}
  ): InvalidateOperatorSessionsInput => ({
    tenantId: tenant,
    operatorId,
    expectedRevision: 1,
    approvalRef: 'approval-ref-synthetic-0001',
    proofDigest,
    localOperator: 'local.admin',
    ...overrides
  })
  const principal = () =>
    authority.readSnapshot(tenant, (snapshot) => snapshot.principal(operatorId))
  return { db, authority, input, principal }
}

describe('SPEC 0262 §6.1 operator session invalidation (memory)', () => {
  it('moves only the revision and keeps every identity attribute', async () => {
    const { authority, input, principal } = await seeded()
    const before = await principal()
    const after = await authority.invalidateOperatorSessions(input())
    expect(after.revision).toBe(2)
    expect({ ...after, revision: 0, updatedAt: '' }).toEqual({
      ...before!,
      revision: 0,
      updatedAt: ''
    })
    expect((await principal())?.revision).toBe(2)
  })

  it('audits target, before/after, local operator and digests, never the raw reference', async () => {
    const { db, authority, input } = await seeded()
    await authority.invalidateOperatorSessions(input())
    const events = db.state.auditEvents.filter(
      (event) => event.payload?.event === 'operator_sessions_invalidated'
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'policy_decision',
      actorType: 'System',
      payload: {
        tenantId: tenant,
        subjectOperatorId: operatorId,
        previousRevision: 1,
        revision: 2,
        proofDigest,
        localOperator: 'local.admin'
      }
    })
    expect(JSON.stringify(events[0])).not.toContain('approval-ref-synthetic')
  })

  it('a stale revision or an absent principal fails and creates nothing', async () => {
    const { authority, input, principal, db } = await seeded()
    await authority.invalidateOperatorSessions(input())
    const audits = db.state.auditEvents.length
    // The same decision cannot repeat: its revision is old now.
    await expect(
      authority.invalidateOperatorSessions(input())
    ).rejects.toMatchObject({ code: 'principal_conflict' })
    await expect(
      authority.invalidateOperatorSessions(
        input({ operatorId: 'operator.absent.synthetic' })
      )
    ).rejects.toBeInstanceOf(CaseAuthorityError)
    expect((await principal())?.revision).toBe(2)
    expect(db.state.auditEvents.length).toBe(audits)
  })

  it('refuses malformed input before touching anything', async () => {
    const { authority, input } = await seeded()
    for (const bad of [
      input({ expectedRevision: 0 }),
      input({ proofDigest: 'not-a-digest' }),
      input({ approvalRef: 'short' }),
      input({ localOperator: 'x' }),
      input({ operatorId: '../escape' })
    ]) {
      await expect(
        authority.invalidateOperatorSessions(bad)
      ).rejects.toMatchObject({ code: 'validation_failed' })
    }
  })
})
