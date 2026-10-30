import { describe, expect, it } from 'vitest'
import { ApprovalEngine, ApprovalError } from '../engine.ts'
import { InMemoryApprovalStore } from '../store.ts'

// SPEC 0291 slice 1 (I1): the origin of an approval request is recorded with it and never
// changes. Written RED first; the markers come off with the implementation.
const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const base = {
  tenantId: TENANT,
  operatorId: 'op_1',
  agentId: 'agent_00000000-0000-4000-8000-000000000001',
  agentVersion: 'v1',
  action: 'record.cancel',
  resource: { type: 'record', id: 'apt_1' },
  payload: { text: 'x' },
  policyVersion: 'policy_v1',
  correlationId: 'corr_00000000-0000-4000-8000-000000000001'
}
const engine = () => {
  const store = new InMemoryApprovalStore()
  return { store, engine: new ApprovalEngine({ store }) }
}

describe('SPEC 0291 slice 1: approval origin in the engine and the in-memory store', () => {
  it('control: a request without origin keeps working and has none', () => {
    const { engine: e } = engine()
    expect((e.request(base) as { origin?: unknown }).origin).toBeUndefined()
  })

  it.fails(
    'records the origin of the request, with and without a session',
    () => {
      const { engine: e } = engine()
      const withSession = e.request({
        ...base,
        origin: { conversationId: 'conv_A', sessionId: 'sess_A' }
      } as never)
      expect((withSession as { origin?: unknown }).origin).toEqual({
        conversationId: 'conv_A',
        sessionId: 'sess_A'
      })
      const conversationOnly = e.request({
        ...base,
        origin: { conversationId: 'conv_A' }
      } as never)
      expect((conversationOnly as { origin?: unknown }).origin).toEqual({
        conversationId: 'conv_A'
      })
    }
  )

  it.fails('refuses a malformed origin at the schema', () => {
    const { engine: e } = engine()
    expect(() =>
      e.request({ ...base, origin: { conversationId: 'c' } } as never)
    ).not.toThrow()
    for (const origin of [
      {},
      { conversationId: '' },
      { conversationId: 'c'.repeat(201) },
      { conversationId: 'c', sessionId: '' },
      { conversationId: 'c', extra: 1 },
      'conv_A'
    ])
      expect(() => e.request({ ...base, origin } as never)).toThrow(
        ApprovalError
      )
  })

  it.fails(
    'the origin cannot be changed by a store update, in any status',
    () => {
      const { store, engine: e } = engine()
      const record = e.request({
        ...base,
        origin: { conversationId: 'conv_A', sessionId: 'sess_A' }
      } as never)
      expect(() =>
        store.update(TENANT, record.approvalId, 'REQUESTED', (current) => ({
          ...current,
          origin: { conversationId: 'conv_B' }
        }))
      ).toThrow(/origin is immutable/)
      expect(() =>
        store.update(TENANT, record.approvalId, 'REQUESTED', (current) => {
          const { origin: _origin, ...rest } = current as unknown as Record<
            string,
            unknown
          >
          void _origin
          return rest as unknown as typeof current
        })
      ).toThrow(/origin is immutable/)
      expect(
        (store.get(TENANT, record.approvalId) as { origin?: unknown }).origin
      ).toEqual({
        conversationId: 'conv_A',
        sessionId: 'sess_A'
      })
    }
  )

  it('control: an update that leaves the origin alone still goes through', () => {
    const { store, engine: e } = engine()
    const record = e.request(base)
    const next = store.update(TENANT, record.approvalId, 'REQUESTED', (c) => ({
      ...c,
      decisionReason: 'ok'
    }))
    expect(next?.decisionReason).toBe('ok')
  })
})
