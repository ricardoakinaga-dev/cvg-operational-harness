import {
  DataClassificationSchema,
  RoleSchema,
  type DataClassification
} from '@cvg/shared'
import { z } from 'zod'
import {
  CAPABILITY_CATALOG,
  CapabilitySchema,
  actionMatchesCapability,
  capabilityResourceScope,
  capabilityRisk,
  type Capability
} from './capabilities.ts'
import {
  AGENT_PROFILE_GRANTS,
  AgentProfileNameSchema,
  grantFor,
  roleAllowsCapability,
  type AgentProfileName,
  type GrantLevel
} from './grants.ts'
import {
  ENGINE_POLICY_ID,
  ENGINE_POLICY_VERSION,
  type PolicyDocument,
  type PolicyEffect,
  type PolicyRule
} from './documents.ts'

export const PolicyDecisionValueSchema = z.enum([
  'ALLOW',
  'DENY',
  'REQUIRE_APPROVAL'
])

export type PolicyDecisionValue = z.infer<typeof PolicyDecisionValueSchema>

export const PolicyEvaluationInputSchema = z
  .object({
    tenantId: z.string().min(1).max(120),
    operatorId: z.string().min(1).max(120),
    operatorRole: RoleSchema,
    agentId: z.string().min(1).max(120),
    agentProfile: AgentProfileNameSchema,
    capability: CapabilitySchema,
    action: z.string().min(1).max(120),
    correlationId: z.string().min(8).max(120),
    resource: z
      .object({
        type: z.string().min(1).max(120),
        id: z.string().min(1).max(160).optional(),
        tenantId: z.string().min(1).max(120).optional()
      })
      .strict()
      .optional(),
    context: z
      .object({
        dataClassification: DataClassificationSchema.optional(),
        emergency: z.boolean().optional(),
        medicalOperator: z.boolean().optional()
      })
      .strict()
      .optional()
  })
  .strict()

export type PolicyEvaluationInput = z.input<typeof PolicyEvaluationInputSchema>
export type NormalizedPolicyEvaluationInput = z.output<
  typeof PolicyEvaluationInputSchema
>

export interface PolicyDecision {
  decision: PolicyDecisionValue
  reason: string
  policyId: string
  policyVersion: string
  correlationId: string
  capability: Capability
  risk: ReturnType<typeof capabilityRisk>
  evaluatedAt: string
}

const CLASSIFICATION_RANK: Record<DataClassification, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  CLINICAL: 3,
  FINANCIAL: 4,
  CREDENTIAL: 5
}

const EFFECT_PRECEDENCE: Record<PolicyEffect, number> = {
  ALLOW: 1,
  REQUIRE_APPROVAL: 2,
  DENY: 3
}

export interface PolicyEngineOptions {
  documents?: PolicyDocument[]
  clock?: () => Date
}

/**
 * Deterministic authorization engine. The model has no seat at this table:
 * decisions come exclusively from capability grants, operator role ceilings
 * and versioned policy documents. Missing context or missing tenants deny.
 */
export class PolicyEngine {
  readonly #documents: PolicyDocument[]
  readonly #clock: () => Date

  constructor(options: PolicyEngineOptions = {}) {
    this.#documents = options.documents ?? []
    this.#clock = options.clock ?? (() => new Date())
  }

  evaluate(input: PolicyEvaluationInput): PolicyDecision {
    const parsed = PolicyEvaluationInputSchema.safeParse(input)
    if (!parsed.success) {
      return this.#deny(
        'insufficient_context',
        'Policy evaluation received incomplete or invalid context',
        undefined,
        {
          correlationId: safeCorrelation(input),
          capability: safeCapability(input),
          profile: safeProfile(input)
        }
      )
    }
    const request = parsed.data
    const risk = capabilityRisk(request.capability)
    const at = this.#clock()

    if (
      request.resource?.tenantId &&
      request.resource.tenantId !== request.tenantId
    ) {
      return this.#deny(
        'tenant_mismatch',
        'Resource belongs to a different tenant',
        undefined,
        {
          correlationId: request.correlationId,
          capability: request.capability,
          profile: request.agentProfile
        }
      )
    }

    const resourceScope = capabilityResourceScope(
      request.capability,
      request.resource
    )
    if (resourceScope.status === 'required') {
      return this.#deny(
        'resource_type_required',
        'Capability requires a resource with an explicit type',
        undefined,
        {
          correlationId: request.correlationId,
          capability: request.capability,
          profile: request.agentProfile
        }
      )
    }
    if (resourceScope.status === 'not_allowed') {
      return this.#deny(
        'resource_type_not_allowed',
        'Capability cannot act on this resource type in the controlled scope',
        undefined,
        {
          correlationId: request.correlationId,
          capability: request.capability,
          profile: request.agentProfile
        }
      )
    }

    if (!actionMatchesCapability(request.capability, request.action)) {
      return this.#deny(
        'action_capability_mismatch',
        'Action is not bound to the requested capability',
        undefined,
        {
          correlationId: request.correlationId,
          capability: request.capability,
          profile: request.agentProfile
        }
      )
    }

    const grant = grantFor(request.agentProfile, request.capability)
    if (!grant) {
      return this.#deny(
        'capability_not_granted',
        `Profile ${request.agentProfile} has no grant for ${request.capability}`,
        undefined,
        {
          correlationId: request.correlationId,
          capability: request.capability,
          profile: request.agentProfile
        }
      )
    }

    if (!roleAllowsCapability(request.operatorRole, request.capability)) {
      return this.#deny(
        'operator_role_denied',
        `Role ${request.operatorRole} cannot exercise ${request.capability}`,
        undefined,
        {
          correlationId: request.correlationId,
          capability: request.capability,
          profile: request.agentProfile
        }
      )
    }

    const matches = this.#matchingRules(request, at)
    const winner = matches[0]

    if (winner) {
      const source = winner.document
      const effect = winner.rule.effect
      if (effect === 'DENY') {
        return this.#decision('DENY', winner.rule.reason, source, request, risk)
      }
      if (effect === 'REQUIRE_APPROVAL') {
        return this.#decision(
          'REQUIRE_APPROVAL',
          winner.rule.reason,
          source,
          request,
          risk
        )
      }
      return this.#decision(
        grant.level === 'require_approval' ? 'REQUIRE_APPROVAL' : 'ALLOW',
        winner.rule.reason,
        source,
        request,
        risk
      )
    }

    return this.#fromGrant(
      request,
      grant.level,
      grant.requiresMedicalOperator === true
    )
  }

  #fromGrant(
    request: NormalizedPolicyEvaluationInput,
    level: GrantLevel,
    requiresMedicalOperator: boolean
  ): PolicyDecision {
    const risk = capabilityRisk(request.capability)
    const emergency = request.context?.emergency === true
    if (
      requiresMedicalOperator &&
      request.context?.medicalOperator !== true &&
      !emergency
    ) {
      return this.#decision(
        'REQUIRE_APPROVAL',
        'Capability requires a medical operator or explicit approval',
        undefined,
        request,
        risk
      )
    }
    if (level === 'require_approval') {
      return this.#decision(
        'REQUIRE_APPROVAL',
        'Capability grant requires human approval',
        undefined,
        request,
        risk
      )
    }
    if (risk === 'HIGH_RISK_WRITE' || risk === 'ADMIN') {
      return this.#decision(
        'REQUIRE_APPROVAL',
        'High-risk capability always requires human approval',
        undefined,
        request,
        risk
      )
    }
    return this.#decision(
      'ALLOW',
      'Capability granted by least-privilege profile',
      undefined,
      request,
      risk
    )
  }

  #matchingRules(
    request: NormalizedPolicyEvaluationInput,
    at: Date
  ): Array<{ rule: PolicyRule; document: PolicyDocument }> {
    const classification =
      request.context?.dataClassification !== undefined
        ? CLASSIFICATION_RANK[request.context.dataClassification]
        : 0
    const winners: Array<{ rule: PolicyRule; document: PolicyDocument }> = []
    for (const document of this.#documents) {
      if (
        document.tenantId !== undefined &&
        document.tenantId !== request.tenantId
      ) {
        continue
      }
      if (at.getTime() < Date.parse(document.effectiveFrom)) continue
      if (
        document.effectiveUntil &&
        at.getTime() > Date.parse(document.effectiveUntil)
      ) {
        continue
      }
      for (const rule of document.rules) {
        if (ruleAppliesTo(rule, request, classification)) {
          winners.push({ rule, document })
        }
      }
    }
    winners.sort((left, right) => {
      if (right.rule.priority !== left.rule.priority) {
        return right.rule.priority - left.rule.priority
      }
      return (
        EFFECT_PRECEDENCE[right.rule.effect] -
        EFFECT_PRECEDENCE[left.rule.effect]
      )
    })
    return winners
  }

  #decision(
    decision: PolicyDecisionValue,
    reason: string,
    source: PolicyDocument | undefined,
    request: NormalizedPolicyEvaluationInput,
    risk: ReturnType<typeof capabilityRisk>
  ): PolicyDecision {
    return {
      decision,
      reason,
      policyId: source?.policyId ?? ENGINE_POLICY_ID,
      policyVersion: source?.version ?? ENGINE_POLICY_VERSION,
      correlationId: request.correlationId,
      capability: request.capability,
      risk,
      evaluatedAt: this.#clock().toISOString()
    }
  }

  #deny(
    reason: string,
    _message: string,
    policyId: string | undefined,
    fallback: {
      correlationId: string
      capability: Capability
      profile: AgentProfileName
    }
  ): PolicyDecision {
    return {
      decision: 'DENY',
      reason,
      policyId: policyId ?? ENGINE_POLICY_ID,
      policyVersion: ENGINE_POLICY_VERSION,
      correlationId: fallback.correlationId,
      capability: fallback.capability,
      risk: CAPABILITY_CATALOG[fallback.capability]
        ? CAPABILITY_CATALOG[fallback.capability].risk
        : 'ADMIN',
      evaluatedAt: this.#clock().toISOString()
    }
  }

  listProfiles(): AgentProfileName[] {
    return Object.keys(AGENT_PROFILE_GRANTS) as AgentProfileName[]
  }
}

function ruleAppliesTo(
  rule: PolicyRule,
  request: NormalizedPolicyEvaluationInput,
  classificationRank: number
): boolean {
  if (rule.capabilities && !rule.capabilities.includes(request.capability)) {
    return false
  }
  if (
    rule.agentProfiles &&
    !rule.agentProfiles.includes(request.agentProfile)
  ) {
    return false
  }
  if (rule.roles && !rule.roles.includes(request.operatorRole)) {
    return false
  }
  if (rule.actions && !rule.actions.includes(request.action)) {
    return false
  }
  if (
    rule.resourceTypes &&
    (!request.resource || !rule.resourceTypes.includes(request.resource.type))
  ) {
    return false
  }
  if (rule.classificationAtLeast) {
    const minimum = CLASSIFICATION_RANK[rule.classificationAtLeast]
    if (classificationRank < minimum) return false
  }
  return true
}

function safeCorrelation(input: unknown): string {
  if (input && typeof input === 'object') {
    const value = (input as { correlationId?: unknown }).correlationId
    if (typeof value === 'string' && value.length >= 8) return value
  }
  return 'corr_unknown'
}

function safeCapability(input: unknown): Capability {
  if (input && typeof input === 'object') {
    const value = (input as { capability?: unknown }).capability
    const parsed = CapabilitySchema.safeParse(value)
    if (parsed.success) return parsed.data
  }
  return 'admin.policy.manage'
}

function safeProfile(input: unknown): AgentProfileName {
  if (input && typeof input === 'object') {
    const value = (input as { agentProfile?: unknown }).agentProfile
    const parsed = AgentProfileNameSchema.safeParse(value)
    if (parsed.success) return parsed.data
  }
  return 'secretary'
}
