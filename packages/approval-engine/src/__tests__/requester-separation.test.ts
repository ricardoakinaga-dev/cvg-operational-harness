/** SPEC 0317 G1: requester contract of the engine and of the decision predicate. */
import { describe, expect, it } from 'vitest'
import {
  ApprovalEngine,
  ApprovalError,
  assertRequesterDecision,
  computeRequesterBinding,
  type ApprovalRecord,
  type ApprovalRequester,
  type ApprovalRequestInput
} from '../index.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000e19'
const requester: ApprovalRequester = {
  kind: 'human',
  id: 'human.a',
  tenantId
}

function request(
  overrides: Partial<ApprovalRequestInput> = {}
): ApprovalRequestInput {
  return {
    tenantId,
    operatorId: 'agent.synthetic',
    agentId: 'agent.synthetic',
    agentVersion: 'v1',
    action: 'tool.execute',
    resource: { type: 'tool', id: 'synthetic.tool' },
    payload: { synthetic: true },
    policyVersion: 'policy-v1',
    correlationId: 'correlation_requester_synthetic',
    executionRef: 'exec_synthetic',
    requestedBy: requester,
    ...overrides
  }
}

function pending(overrides: Partial<ApprovalRequestInput> = {}) {
  const engine = new ApprovalEngine()
  const record = engine.request(request(overrides))
  engine.submit(tenantId, record.approvalId, 'agent.synthetic')
  return { engine, record }
}

function code(run: () => unknown): string | undefined {
  try {
    run()
    return undefined
  } catch (error) {
    return error instanceof ApprovalError ? error.code : 'unexpected'
  }
}

describe('ApprovalEngine requester', () => {
  it('denies the requester, whose id differs from the legacy operatorId', () => {
    const { engine, record } = pending()
    expect(record.operatorId).toBe('agent.synthetic')
    expect(
      code(() =>
        engine.approve(tenantId, record.approvalId, { approverId: 'human.a' })
      )
    ).toBe('self_approval_denied')
    expect(engine.get(tenantId, record.approvalId).status).toBe('PENDING')
    expect(
      engine.approve(tenantId, record.approvalId, { approverId: 'human.b' })
        .status
    ).toBe('APPROVED')
  })

  it('keeps refusing the legacy operatorId, and rejection stays available', () => {
    const legacy = pending()
    expect(
      code(() =>
        legacy.engine.approve(tenantId, legacy.record.approvalId, {
          approverId: 'agent.synthetic'
        })
      )
    ).toBe('self_approval_denied')
    const { engine, record } = pending()
    expect(
      engine.reject(tenantId, record.approvalId, { approverId: 'human.a' })
        .status
    ).toBe('REJECTED')
  })

  it('offers no option that disables the rule', () => {
    const { record } = pending()
    const engine = new ApprovalEngine({
      allowSelfApproval: true
    } as ConstructorParameters<typeof ApprovalEngine>[0])
    const own = engine.request(request())
    engine.submit(tenantId, own.approvalId, 'agent.synthetic')
    expect(record.requestedBy).toEqual(requester)
    expect(
      code(() =>
        engine.approve(tenantId, own.approvalId, { approverId: 'human.a' })
      )
    ).toBe('self_approval_denied')
    expect(
      code(() =>
        engine.approve(tenantId, own.approvalId, {
          approverId: 'agent.synthetic'
        })
      )
    ).toBe('self_approval_denied')
  })

  it('refuses a requester from another tenant and a malformed one', () => {
    const engine = new ApprovalEngine()
    expect(
      code(() =>
        engine.request(
          request({ requestedBy: { ...requester, tenantId: 'tenant_other' } })
        )
      )
    ).toBe('invalid_request')
    expect(
      code(() =>
        engine.request(
          request({
            requestedBy: { kind: 'agent', id: 'x', tenantId } as never
          })
        )
      )
    ).toBe('invalid_request')
  })

  it('records no requester or binding when the origin is unknown', () => {
    const { requestedBy: _ignored, ...input } = request()
    void _ignored
    const record = new ApprovalEngine().request(input)
    expect(record).not.toHaveProperty('requestedBy')
    expect(record).not.toHaveProperty('requesterBinding')
  })
})

describe('computeRequesterBinding', () => {
  function bound(): ApprovalRecord {
    return pending().record
  }

  it('is versioned and recomputes from the record', () => {
    const record = bound()
    expect(record.requesterBinding).toMatch(/^v1:[0-9a-f]{64}$/)
    expect(computeRequesterBinding({ ...record, requestedBy: requester })).toBe(
      record.requesterBinding
    )
  })

  it.each([
    ['payloadHash', { payloadHash: 'f'.repeat(64) }],
    ['policyVersion', { policyVersion: 'policy-v2' }],
    ['agentVersion', { agentVersion: 'v2' }],
    ['executionRef', { executionRef: 'exec_other' }],
    ['proposalHash', { proposalHash: 'a'.repeat(64) }],
    ['proposalId', { proposalId: 'proposal_other' }]
  ])('changes when %s changes', (_field, change) => {
    const record = bound()
    expect(
      computeRequesterBinding({
        ...record,
        ...change,
        requestedBy: requester
      })
    ).not.toBe(record.requesterBinding)
  })

  it('changes with the principal', () => {
    const record = bound()
    expect(
      computeRequesterBinding({
        ...record,
        requestedBy: { ...requester, id: 'human.b' }
      })
    ).not.toBe(record.requesterBinding)
  })
})

describe('assertRequesterDecision', () => {
  const verdict = (
    approval: ApprovalRecord,
    submittedBy: Parameters<typeof assertRequesterDecision>[0]['submittedBy'],
    decision: 'APPROVED' | 'REJECTED',
    actorId: string
  ) =>
    code(() =>
      assertRequesterDecision({
        submittedBy,
        approval,
        verdict: decision,
        actorId
      })
    )

  it('allows another human and denies the requester', () => {
    const { record } = pending()
    expect(verdict(record, requester, 'APPROVED', 'human.b')).toBeUndefined()
    expect(verdict(record, requester, 'APPROVED', 'human.a')).toBe(
      'self_approval_denied'
    )
    expect(verdict(record, requester, 'REJECTED', 'human.a')).toBeUndefined()
  })

  it('unknown origin approves nothing but can be rejected', () => {
    const { record } = pending()
    const { requestedBy: _r, requesterBinding: _b, ...legacy } = record
    void _r
    void _b
    expect(verdict(legacy, requester, 'APPROVED', 'human.b')).toBe(
      'requester_unknown'
    )
    expect(verdict(record, { kind: 'unknown' }, 'APPROVED', 'human.b')).toBe(
      'requester_unknown'
    )
    expect(
      verdict(legacy, { kind: 'unknown' }, 'REJECTED', 'human.b')
    ).toBeUndefined()
  })

  it.each([
    ['another id', { ...requester, id: 'human.c' }],
    ['another kind', { ...requester, kind: 'system' as const }],
    ['another tenant', { ...requester, tenantId: 'tenant_other' }]
  ])('records that disagree on %s are not found', (_label, submittedBy) => {
    const { record } = pending()
    for (const decision of ['APPROVED', 'REJECTED'] as const) {
      expect(verdict(record, submittedBy, decision, 'human.b')).toBe(
        'not_found'
      )
    }
  })

  it('a binding that no longer recomputes is not found', () => {
    const { record } = pending()
    expect(
      verdict(
        { ...record, payloadHash: 'f'.repeat(64) },
        requester,
        'APPROVED',
        'human.b'
      )
    ).toBe('not_found')
    expect(
      verdict(
        { ...record, requesterBinding: `v1:${'0'.repeat(64)}` },
        requester,
        'APPROVED',
        'human.b'
      )
    ).toBe('not_found')
  })
})
