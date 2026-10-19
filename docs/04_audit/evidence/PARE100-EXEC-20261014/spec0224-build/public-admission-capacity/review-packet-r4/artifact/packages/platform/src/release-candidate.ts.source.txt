import { createHash } from 'node:crypto'
import { DomainError } from '@cvg/shared'
import {
  ReleaseCandidateGateResultSchema,
  type ReleaseCandidateRecord
} from './contracts.ts'
import type { ReleaseCandidateGateResult } from './contracts.ts'
import type { ReleaseCandidateGateKey } from './contracts.ts'
import type { TenantId, AgentId, AgentVersionId } from './ids.ts'

const gateOrder: ReleaseCandidateGateKey[] = [
  'safety_preflight',
  'test_lab_regression',
  'snapshot_integrity',
  'external_boundary'
]

export function computeReleaseCandidateEvidenceDigest(input: {
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  gateResults: readonly ReleaseCandidateGateResult[]
}): string {
  const gates = input.gateResults
    .map((gate) => ReleaseCandidateGateResultSchema.parse(gate))
    .sort(
      (left, right) =>
        gateOrder.indexOf(left.key) - gateOrder.indexOf(right.key)
    )
  const canonical = JSON.stringify({
    tenantId: input.tenantId,
    agentId: input.agentId,
    versionId: input.versionId,
    gateResults: gates
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

export function hasAllReleaseCandidateGatesPassed(
  gateResults: readonly ReleaseCandidateGateResult[]
): boolean {
  const keys = new Set(gateResults.map((gate) => gate.key))
  return (
    gateResults.length === gateOrder.length &&
    keys.size === gateOrder.length &&
    gateOrder.every((key) => keys.has(key)) &&
    gateResults.every((gate) => gate.status === 'PASS')
  )
}

export function parseReleaseCandidateGateResults(
  rawGateResults: unknown
): ReleaseCandidateGateResult[] {
  const parsed =
    ReleaseCandidateGateResultSchema.array().safeParse(rawGateResults)
  if (!parsed.success) {
    throw new DomainError(
      'invalid_action',
      'Release candidate evidence is invalid or tampered'
    )
  }
  return parsed.data
}

export function assertReleaseCandidateEvidenceIntegrity(
  candidate: ReleaseCandidateRecord
): void {
  try {
    const gateResults = parseReleaseCandidateGateResults(candidate.gateResults)
    if (!hasAllReleaseCandidateGatesPassed(gateResults)) {
      throw new Error('gate failure')
    }
    const digest = computeReleaseCandidateEvidenceDigest({
      tenantId: candidate.tenantId,
      agentId: candidate.agentId,
      versionId: candidate.versionId,
      gateResults
    })
    if (digest !== candidate.evidenceDigest) {
      throw new Error('digest mismatch')
    }
  } catch {
    throw new DomainError(
      'invalid_action',
      'Release candidate evidence is invalid or tampered'
    )
  }
}

export function assertReleaseCandidateIndependentValidator(
  candidate: ReleaseCandidateRecord,
  validatorId: string
): void {
  if (candidate.createdBy === validatorId) {
    throw new DomainError(
      'invalid_action',
      'Release candidate requires an independent validator'
    )
  }
}

export function assertReleaseCandidatePublishAuthority(input: {
  candidate: ReleaseCandidateRecord | null
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
}): ReleaseCandidateRecord {
  const candidate = input.candidate
  if (!candidate) {
    throw new DomainError(
      'invalid_action',
      'Validated release candidate evidence is required'
    )
  }
  if (candidate.status !== 'VALIDATED') {
    throw new DomainError(
      'invalid_action',
      'Release candidate must be VALIDATED before publication'
    )
  }
  if (
    candidate.tenantId !== input.tenantId ||
    candidate.agentId !== input.agentId ||
    candidate.versionId !== input.versionId
  ) {
    throw new DomainError(
      'invalid_action',
      'Release candidate is not bound to the requested version'
    )
  }
  if (!candidate.validatedBy || !candidate.validatedAt) {
    throw new DomainError(
      'invalid_action',
      'Release candidate validation metadata is incomplete'
    )
  }

  assertReleaseCandidateIndependentValidator(candidate, candidate.validatedBy)
  assertReleaseCandidateEvidenceIntegrity(candidate)
  return candidate
}
