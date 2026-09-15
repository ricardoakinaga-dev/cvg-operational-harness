import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonicalizeJson } from '@cvg/shared'
import {
  canonicalPayloadEquals,
  computeExecutionProposalHash,
  createExecutionProposal,
  DEFAULT_EXECUTION_PROPOSAL_TTL_MS,
  EXECUTION_PROPOSAL_SCHEMA_VERSION,
  ExecutionProposalError,
  isExecutionProposalExpired,
  verifyExecutionProposalHash,
  type ExecutionProposal,
  type ExecutionProposalHashInput
} from '../proposal.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000041'
const AGENT = 'agent_00000000-0000-4000-8000-000000000041'
const NOW = new Date('2026-09-13T12:00:00.000Z')

function proposalInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    operatorId: 'op_1',
    agentId: AGENT,
    agentVersion: 'v1',
    agentProfile: 'secretary' as const,
    capability: 'appointment.cancel' as const,
    action: 'appointment.cancel',
    resource: { type: 'appointment', id: 'apt_1' },
    dataClassification: 'INTERNAL' as const,
    policyVersion: 'policy-v1',
    payload: { text: 'APPROVED_PAYLOAD' },
    ...overrides
  }
}

function hashInput(
  overrides: Partial<ExecutionProposalHashInput> = {}
): ExecutionProposalHashInput {
  return {
    schemaVersion: EXECUTION_PROPOSAL_SCHEMA_VERSION,
    tenantId: TENANT,
    operatorId: 'op_1',
    agentId: AGENT,
    agentVersion: 'v1',
    agentProfile: 'secretary',
    capability: 'appointment.cancel',
    action: 'appointment.cancel',
    resource: { type: 'appointment', id: 'apt_1' },
    dataClassification: 'INTERNAL',
    payload: { text: 'APPROVED_PAYLOAD' },
    ...overrides
  }
}

describe('execution proposal failure modes', () => {
  it('rejects every invalid TTL with proposal_invalid_ttl', () => {
    for (const expiresAtMs of [0, -1, 1.5, Number.NaN]) {
      try {
        createExecutionProposal(proposalInput(), { now: NOW, expiresAtMs })
        throw new Error('expected proposal_invalid_ttl')
      } catch (error) {
        expect(error).toBeInstanceOf(ExecutionProposalError)
        expect((error as ExecutionProposalError).code).toBe(
          'proposal_invalid_ttl'
        )
        expect((error as ExecutionProposalError).name).toBe(
          'ExecutionProposalError'
        )
      }
    }
  })

  it('rejects a payload that canonical JSON cannot represent', () => {
    try {
      createExecutionProposal(proposalInput({ payload: 1n }), { now: NOW })
      throw new Error('expected proposal_payload_invalid')
    } catch (error) {
      expect(error).toBeInstanceOf(ExecutionProposalError)
      expect((error as ExecutionProposalError).code).toBe(
        'proposal_payload_invalid'
      )
    }
  })

  it('fails closed on non-canonicalizable comparisons and verification', () => {
    expect(canonicalPayloadEquals(1n, 1n)).toBe(false)
    expect(canonicalPayloadEquals({ a: 1 }, { a: 1 })).toBe(true)
    expect(canonicalPayloadEquals({ a: 1 }, { a: 2 })).toBe(false)

    const proposal = createExecutionProposal(
      proposalInput({ payload: { text: 'APPROVED_PAYLOAD' } }),
      { now: NOW }
    )
    const tampered = {
      ...proposal,
      payload: 1n
    } as unknown as ExecutionProposal
    expect(verifyExecutionProposalHash(tampered)).toBe(false)
  })

  it('treats an unparseable expiry as expired', () => {
    expect(isExecutionProposalExpired({ expiresAt: 'not-a-date' }, NOW)).toBe(
      true
    )
    expect(
      isExecutionProposalExpired({ expiresAt: NOW.toISOString() }, NOW)
    ).toBe(true)
    expect(
      isExecutionProposalExpired(
        { expiresAt: new Date(NOW.getTime() + 1).toISOString() },
        NOW
      )
    ).toBe(false)
  })
})

describe('execution proposal digest matrix', () => {
  it('uses the wall clock when no options are provided', () => {
    const before = Date.now()
    const proposal = createExecutionProposal(proposalInput())
    const after = Date.now()
    const createdAt = Date.parse(proposal.createdAt)

    expect(createdAt).toBeGreaterThanOrEqual(before)
    expect(createdAt).toBeLessThanOrEqual(after)
    expect(Date.parse(proposal.expiresAt) - createdAt).toBe(
      DEFAULT_EXECUTION_PROPOSAL_TTL_MS
    )
    expect(verifyExecutionProposalHash(proposal)).toBe(true)
  })

  it('defaults the TTL to fifteen minutes and exposes the schema version', () => {
    const proposal = createExecutionProposal(proposalInput(), { now: NOW })
    expect(proposal.schemaVersion).toBe(EXECUTION_PROPOSAL_SCHEMA_VERSION)
    expect(
      Date.parse(proposal.expiresAt) - Date.parse(proposal.createdAt)
    ).toBe(DEFAULT_EXECUTION_PROPOSAL_TTL_MS)
    expect(proposal.proposalId).toMatch(/^prop_/)
  })

  it('applies an explicit TTL and omits absent optional fields', () => {
    const proposal = createExecutionProposal(
      proposalInput({
        resource: { type: 'appointment' },
        promptVersion: undefined
      }),
      { now: NOW, expiresAtMs: 1_000 }
    )

    expect(
      Date.parse(proposal.expiresAt) - Date.parse(proposal.createdAt)
    ).toBe(1_000)
    expect(proposal.resource).toEqual({ type: 'appointment' })
    expect(proposal.promptVersion).toBeUndefined()
    expect(
      Object.prototype.hasOwnProperty.call(proposal, 'promptVersion')
    ).toBe(false)
  })

  it('copies resource tenant scoping when provided', () => {
    const proposal = createExecutionProposal(
      proposalInput({
        resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT },
        promptVersion: '1.0.0'
      }),
      { now: NOW }
    )

    expect(proposal.resource).toEqual({
      type: 'appointment',
      id: 'apt_1',
      tenantId: TENANT
    })
    expect(proposal.promptVersion).toBe('1.0.0')
  })

  it('changes the digest when any bound field changes', () => {
    const base = createExecutionProposal(proposalInput(), { now: NOW })
    const variants: ExecutionProposalHashInput[] = [
      hashInput({ tenantId: 'tenant_other' }),
      hashInput({ operatorId: 'op_2' }),
      hashInput({ agentId: 'agent_other' }),
      hashInput({ agentVersion: 'v2' }),
      hashInput({ agentProfile: 'clinical' }),
      hashInput({ capability: 'appointment.create' }),
      hashInput({ action: 'appointment.reschedule' }),
      hashInput({ resource: { type: 'appointment', id: 'apt_2' } }),
      hashInput({ resource: { type: 'appointment_draft', id: 'apt_1' } }),
      hashInput({ dataClassification: 'CLINICAL' }),
      hashInput({ payload: { text: 'MUTATED_PAYLOAD' } })
    ]

    for (const variant of variants) {
      expect(computeExecutionProposalHash(variant)).not.toBe(base.proposalHash)
    }
    expect(
      computeExecutionProposalHash(
        hashInput({ resource: { type: 'appointment', id: 'apt_1' } })
      )
    ).toBe(base.proposalHash)
  })

  it('matches an independent canonical digest recomputation', () => {
    const proposal = createExecutionProposal(proposalInput(), { now: NOW })
    const expected = createHash('sha256')
      .update(
        canonicalizeJson({
          schemaVersion: EXECUTION_PROPOSAL_SCHEMA_VERSION,
          tenantId: TENANT,
          operatorId: 'op_1',
          agentId: AGENT,
          agentVersion: 'v1',
          agentProfile: 'secretary',
          capability: 'appointment.cancel',
          action: 'appointment.cancel',
          resource: { type: 'appointment', id: 'apt_1' },
          dataClassification: 'INTERNAL',
          payload: { text: 'APPROVED_PAYLOAD' }
        }),
        'utf8'
      )
      .digest('hex')

    expect(proposal.proposalHash).toBe(expected)
    expect(verifyExecutionProposalHash(proposal)).toBe(true)
  })
})
