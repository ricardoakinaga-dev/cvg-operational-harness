import { describe, expect, it } from 'vitest'
import type { OperatorIdentity } from '@cvg/shared'
import { InMemoryCaseAuthority, InMemoryDatabase } from '@cvg/persistence'
import { revalidateOperatorSession } from '../operator-session-revalidation.ts'
import type {
  OperatorSessionRecord,
  OperatorSessionStore
} from '../operator-session.ts'

// SPEC 0296 A10, slice 0: the session decision of the hook as a function of the session id alone.
const identity: OperatorIdentity = {
  operatorId: 'operator.synthetic.revalidation',
  role: 'Supervisor',
  tenantId: 'tenant_00000000-0000-4000-8000-000000000702'
}
const sessionId = 'opsess_synthetic_revalidation'
const VERSION = 'synthetic-authority-v1'
const POLICY = { identityMode: 'trusted' as const, authorityVersion: VERSION }
const NOW = 1_000_000

const record = (over: Partial<OperatorSessionRecord> = {}) => ({
  sessionId,
  identity,
  expiresAt: NOW + 60_000,
  principalRevision: 1,
  ...over
})

async function authority() {
  const a = new InMemoryCaseAuthority(new InMemoryDatabase())
  await a.applyVerifiedPrincipalState({
    tenantId: identity.tenantId as never,
    operatorId: identity.operatorId,
    role: 'Supervisor',
    active: true,
    expectedRevision: 0,
    authorityVersion: VERSION,
    proofRef: 'synthetic-proof',
    identitySource: 'synthetic_fixture'
  })
  return a
}
const store = (
  get: OperatorSessionStore['get']
): Pick<OperatorSessionStore, 'get'> => ({ get })

describe('PAR-A01 slice 0: revalidateOperatorSession', () => {
  it('a current record that binds the principal revision is valid and returns the record', async () => {
    const r = record()
    const out = await revalidateOperatorSession(
      {
        operatorSessionStore: store(async () => r),
        caseAuthority: await authority(),
        principalPolicy: POLICY,
        now: () => NOW
      },
      sessionId
    )
    expect(out).toEqual({ status: 'valid', record: r })
  })

  it('reads the store on every call: a record removed after a valid answer is revoked next time', async () => {
    let current: OperatorSessionRecord | null = record()
    const deps = {
      operatorSessionStore: store(async () => current),
      caseAuthority: await authority(),
      principalPolicy: POLICY,
      now: () => NOW
    }
    expect((await revalidateOperatorSession(deps, sessionId)).status).toBe(
      'valid'
    )
    current = null
    expect(await revalidateOperatorSession(deps, sessionId)).toEqual({
      status: 'revoked'
    })
  })

  it('asks the store for the id it was given', async () => {
    const asked: string[] = []
    await revalidateOperatorSession(
      {
        operatorSessionStore: store(async (id) => {
          asked.push(id)
          return null
        }),
        caseAuthority: await authority(),
        principalPolicy: POLICY
      },
      'opsess_other'
    )
    expect(asked).toEqual(['opsess_other'])
  })

  it('an expired record, including one that expires exactly now, is revoked', async () => {
    for (const expiresAt of [NOW - 1, NOW]) {
      expect(
        await revalidateOperatorSession(
          {
            operatorSessionStore: store(async () => record({ expiresAt })),
            caseAuthority: await authority(),
            principalPolicy: POLICY,
            now: () => NOW
          },
          sessionId
        )
      ).toEqual({ status: 'revoked' })
    }
  })

  it('a record that expires while the principal is being read is revoked', async () => {
    const clock = [NOW, NOW + 120_000]
    const out = await revalidateOperatorSession(
      {
        operatorSessionStore: store(async () => record()),
        caseAuthority: await authority(),
        principalPolicy: POLICY,
        now: () => clock.shift() ?? NOW + 120_000
      },
      sessionId
    )
    expect(out).toEqual({ status: 'revoked' })
  })

  it('a stale principal revision is revoked, never valid on the session alone', async () => {
    expect(
      await revalidateOperatorSession(
        {
          operatorSessionStore: store(async () =>
            record({ principalRevision: 99 })
          ),
          caseAuthority: await authority(),
          principalPolicy: POLICY,
          now: () => NOW
        },
        sessionId
      )
    ).toEqual({ status: 'revoked' })
  })

  it('a session store failure is unavailable (store), not revoked and not valid', async () => {
    expect(
      await revalidateOperatorSession(
        {
          operatorSessionStore: store(async () => {
            throw new Error('synthetic store outage')
          }),
          caseAuthority: await authority(),
          principalPolicy: POLICY,
          now: () => NOW
        },
        sessionId
      )
    ).toEqual({ status: 'unavailable', source: 'store' })
  })

  it('a principal outage and a missing authority version are unavailable (principal)', async () => {
    expect(
      await revalidateOperatorSession(
        {
          operatorSessionStore: store(async () => record()),
          caseAuthority: {
            readSnapshot: async () => {
              throw new Error('synthetic principal outage')
            }
          },
          principalPolicy: POLICY,
          now: () => NOW
        },
        sessionId
      )
    ).toEqual({ status: 'unavailable', source: 'principal' })
    expect(
      await revalidateOperatorSession(
        {
          operatorSessionStore: store(async () => record()),
          caseAuthority: await authority(),
          principalPolicy: { identityMode: 'trusted', authorityVersion: null },
          now: () => NOW
        },
        sessionId
      )
    ).toEqual({ status: 'unavailable', source: 'principal' })
  })

  it('uses the real clock when none is given', async () => {
    const out = await revalidateOperatorSession(
      {
        operatorSessionStore: store(async () =>
          record({ expiresAt: Date.now() + 60_000 })
        ),
        caseAuthority: await authority(),
        principalPolicy: POLICY
      },
      sessionId
    )
    expect(out.status).toBe('valid')
  })
})
