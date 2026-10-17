import { createHash } from 'node:crypto'
import { canonicalizeJson, createDomainId } from '@cvg/shared'
import type { DataClassification } from '@cvg/shared'
import type { AgentProfileName, Capability } from '@cvg/policy-engine'

export const EXECUTION_PROPOSAL_SCHEMA_VERSION = 'aaa-proposal-v1' as const
export const DEFAULT_EXECUTION_PROPOSAL_TTL_MS = 15 * 60 * 1000

export type ExecutionProposalErrorCode =
  | 'proposal_invalid_ttl'
  | 'proposal_payload_invalid'

export class ExecutionProposalError extends Error {
  readonly code: ExecutionProposalErrorCode

  constructor(code: ExecutionProposalErrorCode, message: string) {
    super(message)
    this.name = 'ExecutionProposalError'
    this.code = code
  }
}

export interface ExecutionProposalResource {
  type: string
  id?: string
  tenantId?: string
}

export interface ExecutionProposalHashInput {
  schemaVersion: typeof EXECUTION_PROPOSAL_SCHEMA_VERSION
  tenantId: string
  operatorId: string
  agentId: string
  agentVersion: string
  agentProfile: AgentProfileName
  capability: Capability
  action: string
  resource: { type: string; id?: string | undefined }
  dataClassification: DataClassification
  payload: unknown
}

export interface ExecutionProposal {
  proposalId: string
  schemaVersion: typeof EXECUTION_PROPOSAL_SCHEMA_VERSION
  proposalHash: string
  tenantId: string
  operatorId: string
  agentId: string
  agentVersion: string
  agentProfile: AgentProfileName
  capability: Capability
  action: string
  resource: ExecutionProposalResource
  dataClassification: DataClassification
  policyVersion: string
  promptVersion?: string
  payload: unknown
  createdAt: string
  expiresAt: string
}

export interface CreateExecutionProposalInput {
  tenantId: string
  operatorId: string
  agentId: string
  agentVersion: string
  agentProfile: AgentProfileName
  capability: Capability
  action: string
  resource: ExecutionProposalResource
  dataClassification: DataClassification
  policyVersion: string
  promptVersion?: string
  payload: unknown
}

export interface CreateExecutionProposalOptions {
  now?: Date
  expiresAtMs?: number
}

/**
 * Section 2 normative digest: SHA-256 over the canonical JSON of the final
 * proposal identity plus the frozen payload. Draft fields (proposalId,
 * policyVersion, promptVersion, timestamps) are intentionally excluded.
 */
export function computeExecutionProposalHash(
  input: ExecutionProposalHashInput
): string {
  const resource: { type: string; id?: string } = { type: input.resource.type }
  if (input.resource.id !== undefined) resource.id = input.resource.id
  const canonical = canonicalizeJson({
    schemaVersion: input.schemaVersion,
    tenantId: input.tenantId,
    operatorId: input.operatorId,
    agentId: input.agentId,
    agentVersion: input.agentVersion,
    agentProfile: input.agentProfile,
    capability: input.capability,
    action: input.action,
    resource,
    dataClassification: input.dataClassification,
    payload: input.payload
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Builds the immutable ExecutionProposal once, in the request turn, from the
 * validated model structured output. The payload is deep-cloned through
 * canonical JSON and deep-frozen: later mutations of the source object cannot
 * alter what the approval binds.
 */
export function createExecutionProposal(
  input: CreateExecutionProposalInput,
  options: CreateExecutionProposalOptions = {}
): ExecutionProposal {
  const now = options.now ?? new Date()
  const expiresAtMs = options.expiresAtMs ?? DEFAULT_EXECUTION_PROPOSAL_TTL_MS
  if (!Number.isInteger(expiresAtMs) || expiresAtMs <= 0) {
    throw new ExecutionProposalError(
      'proposal_invalid_ttl',
      'Execution proposal TTL must be a positive integer of milliseconds'
    )
  }

  let payload: unknown
  try {
    payload = JSON.parse(canonicalizeJson(input.payload)) as unknown
  } catch (error) {
    throw new ExecutionProposalError(
      'proposal_payload_invalid',
      `Execution proposal payload is not canonicalizable: ${
        error instanceof Error ? error.message : 'unknown error'
      }`
    )
  }

  const resource: ExecutionProposalResource = { type: input.resource.type }
  if (input.resource.id !== undefined) resource.id = input.resource.id
  if (input.resource.tenantId !== undefined)
    resource.tenantId = input.resource.tenantId

  const proposal: ExecutionProposal = {
    proposalId: createDomainId('prop'),
    schemaVersion: EXECUTION_PROPOSAL_SCHEMA_VERSION,
    proposalHash: computeExecutionProposalHash({
      schemaVersion: EXECUTION_PROPOSAL_SCHEMA_VERSION,
      tenantId: input.tenantId,
      operatorId: input.operatorId,
      agentId: input.agentId,
      agentVersion: input.agentVersion,
      agentProfile: input.agentProfile,
      capability: input.capability,
      action: input.action,
      resource,
      dataClassification: input.dataClassification,
      payload
    }),
    tenantId: input.tenantId,
    operatorId: input.operatorId,
    agentId: input.agentId,
    agentVersion: input.agentVersion,
    agentProfile: input.agentProfile,
    capability: input.capability,
    action: input.action,
    resource,
    dataClassification: input.dataClassification,
    policyVersion: input.policyVersion,
    ...(input.promptVersion !== undefined
      ? { promptVersion: input.promptVersion }
      : {}),
    payload,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + expiresAtMs).toISOString()
  }
  return deepFreeze(proposal)
}

export function verifyExecutionProposalHash(
  proposal: ExecutionProposal
): boolean {
  try {
    return (
      computeExecutionProposalHash({
        schemaVersion: proposal.schemaVersion,
        tenantId: proposal.tenantId,
        operatorId: proposal.operatorId,
        agentId: proposal.agentId,
        agentVersion: proposal.agentVersion,
        agentProfile: proposal.agentProfile,
        capability: proposal.capability,
        action: proposal.action,
        resource: proposal.resource,
        dataClassification: proposal.dataClassification,
        payload: proposal.payload
      }) === proposal.proposalHash
    )
  } catch {
    return false
  }
}

export function isExecutionProposalExpired(
  proposal: Pick<ExecutionProposal, 'expiresAt'>,
  now: Date = new Date()
): boolean {
  const expiresAt = Date.parse(proposal.expiresAt)
  if (Number.isNaN(expiresAt)) return true
  return expiresAt <= now.getTime()
}

/**
 * Canonical equality used to compare an execution request payload against the
 * frozen proposal payload. Non-canonicalizable values fail closed.
 */
export function canonicalPayloadEquals(left: unknown, right: unknown): boolean {
  try {
    return canonicalizeJson(left) === canonicalizeJson(right)
  } catch {
    return false
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  Object.freeze(value)
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}
