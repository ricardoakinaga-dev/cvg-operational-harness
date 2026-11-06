import { createHash } from 'node:crypto'
import {
  assertRealCapabilityOpen,
  RealCapabilityBlockedError,
  type RealCapabilityGuard
} from '@cvg/shared'
import { z } from 'zod'
import type { KnowledgeBinding } from './contracts.ts'
import {
  TenantIdSchema,
  type AgentId,
  type AgentVersionId,
  type TenantId
} from './ids.ts'

/**
 * SPEC 0317 G3/G4. Institutional knowledge has server authority only: a
 * resolver composed by the host answers for tenant, approval and provenance,
 * and every failure below ends in handoff, never in an invented answer.
 */
export const ApprovedKnowledgeResolutionSchema = z
  .object({
    tenantId: TenantIdSchema,
    version: z.string().trim().min(1).max(120),
    answer: z.string().trim().min(1).max(4000),
    source: z.string().trim().min(1).max(200),
    provenance: z
      .object({
        recordId: z.string().trim().min(1).max(200),
        status: z.enum(['approved', 'draft', 'revoked']),
        approvedAt: z.coerce.date(),
        validUntil: z.coerce.date().nullable(),
        excerptSha256: z.string().regex(/^[0-9a-f]{64}$/)
      })
      .strict()
  })
  .strict()
export type ApprovedKnowledgeResolution = z.infer<
  typeof ApprovedKnowledgeResolutionSchema
>

export interface ApprovedKnowledgeResolverInput {
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  question: string
  /** Bindings the agent version may answer from. */
  bindings: readonly KnowledgeBinding[]
  /** Aborted when the deadline expires; real adapters must honour it. */
  signal: AbortSignal
}

export type ApprovedKnowledgeResolver = (
  input: ApprovedKnowledgeResolverInput
) =>
  | ApprovedKnowledgeResolution
  | null
  | undefined
  | Promise<ApprovedKnowledgeResolution | null | undefined>

export const KNOWLEDGE_BLOCK_REASONS = [
  'resolver_not_composed',
  'real_rag_blocked',
  'resolver_failed',
  'resolver_timeout',
  'resolver_invalid_response',
  'tenant_mismatch',
  'source_not_current',
  'provenance_mismatch',
  'binding_mismatch'
] as const
export type KnowledgeBlockReason = (typeof KNOWLEDGE_BLOCK_REASONS)[number]

export const KNOWLEDGE_RESOLVER_TIMEOUT_MS = 2_000

type ResolverClassification =
  | { kind: 'synthetic' }
  | { kind: 'real'; guard: RealCapabilityGuard }

const composedResolvers = new WeakMap<object, ResolverClassification>()

/** Fixtures are classified here, by the composition, and only under test. */
export function composeSyntheticKnowledgeResolver(
  resolve: ApprovedKnowledgeResolver
): ApprovedKnowledgeResolver {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Synthetic knowledge fixtures require NODE_ENV=test')
  }
  const resolver: ApprovedKnowledgeResolver = (input) => resolve(input)
  composedResolvers.set(resolver, { kind: 'synthetic' })
  return resolver
}

/** A closed or absent guard refuses the composition before any I/O exists. */
export function composeRealKnowledgeResolver(input: {
  guard: RealCapabilityGuard
  resolve: ApprovedKnowledgeResolver
}): ApprovedKnowledgeResolver {
  assertRealCapabilityOpen(input.guard, 'rag')
  const resolver: ApprovedKnowledgeResolver = (request) =>
    input.resolve(request)
  composedResolvers.set(resolver, { kind: 'real', guard: input.guard })
  return resolver
}

/**
 * Bootstrap check. With the process guard, a real resolver also needs this
 * process to have the flag on, whatever guard it was composed with.
 */
export function assertComposedKnowledgeResolver(
  resolver: unknown,
  processGuard?: RealCapabilityGuard
): void {
  const classification =
    typeof resolver === 'function' ? composedResolvers.get(resolver) : undefined
  if (!classification) {
    throw new Error(
      'Approved knowledge resolver must be classified by the composition'
    )
  }
  if (classification.kind !== 'real') return
  assertRealCapabilityOpen(classification.guard, 'rag')
  if (processGuard?.reason === 'flag_disabled') {
    throw new RealCapabilityBlockedError('rag', 'flag_disabled')
  }
}

/** Internal test port: a fixture bound to what the agent version declares. */
export function createSyntheticKnowledgeResolver(
  fixture: {
    answer?: string
    source?: string
    version?: string
  } = {}
): ApprovedKnowledgeResolver {
  return composeSyntheticKnowledgeResolver((input) => {
    const binding = input.bindings.find(
      (candidate) => candidate.requiresApprovedSource
    )
    const source = fixture.source ?? binding?.source
    const version = fixture.version ?? binding?.version
    if (!source || !version) return null
    const answer = fixture.answer ?? 'Resposta institucional fictícia.'
    return {
      tenantId: input.tenantId,
      version,
      answer,
      source,
      provenance: {
        recordId: 'synthetic-knowledge-fixture',
        status: 'approved',
        approvedAt: new Date(0),
        validUntil: null,
        excerptSha256: knowledgeExcerptSha256(answer)
      }
    }
  })
}

export function knowledgeExcerptSha256(answer: string): string {
  return createHash('sha256').update(answer, 'utf8').digest('hex')
}

export type GovernedKnowledge =
  | { status: 'resolved'; knowledge: ApprovedKnowledgeResolution }
  | { status: 'missing' }
  | { status: 'blocked'; reason: KnowledgeBlockReason }

const TIMED_OUT = Symbol('knowledge-resolver-timeout')

export async function resolveGovernedKnowledge(input: {
  resolver: ApprovedKnowledgeResolver | undefined
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  question: string
  bindings: readonly KnowledgeBinding[]
  timeoutMs?: number
  now?: () => Date
}): Promise<GovernedKnowledge> {
  if (input.resolver === undefined) return { status: 'missing' }
  const classification = composedResolvers.get(input.resolver)
  if (!classification) {
    return { status: 'blocked', reason: 'resolver_not_composed' }
  }
  if (classification.kind === 'real') {
    try {
      assertRealCapabilityOpen(classification.guard, 'rag')
    } catch {
      return { status: 'blocked', reason: 'real_rag_blocked' }
    }
  }
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let raw: unknown
  try {
    raw = await Promise.race([
      Promise.resolve().then(() =>
        input.resolver!({
          tenantId: input.tenantId,
          agentId: input.agentId,
          versionId: input.versionId,
          question: input.question,
          bindings: input.bindings,
          signal: controller.signal
        })
      ),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(
          () => resolve(TIMED_OUT),
          input.timeoutMs ?? KNOWLEDGE_RESOLVER_TIMEOUT_MS
        )
      })
    ])
  } catch {
    return { status: 'blocked', reason: 'resolver_failed' }
  } finally {
    clearTimeout(timer)
  }
  if (raw === TIMED_OUT) {
    controller.abort()
    return { status: 'blocked', reason: 'resolver_timeout' }
  }
  if (raw === null || raw === undefined) return { status: 'missing' }
  const parsed = ApprovedKnowledgeResolutionSchema.safeParse(raw)
  if (!parsed.success) {
    return { status: 'blocked', reason: 'resolver_invalid_response' }
  }
  const knowledge = parsed.data
  if (knowledge.tenantId !== input.tenantId) {
    return { status: 'blocked', reason: 'tenant_mismatch' }
  }
  const now = (input.now ?? (() => new Date()))().getTime()
  const { provenance } = knowledge
  if (
    provenance.status !== 'approved' ||
    provenance.approvedAt.getTime() > now ||
    (provenance.validUntil !== null && provenance.validUntil.getTime() <= now)
  ) {
    return { status: 'blocked', reason: 'source_not_current' }
  }
  if (provenance.excerptSha256 !== knowledgeExcerptSha256(knowledge.answer)) {
    return { status: 'blocked', reason: 'provenance_mismatch' }
  }
  return { status: 'resolved', knowledge }
}
