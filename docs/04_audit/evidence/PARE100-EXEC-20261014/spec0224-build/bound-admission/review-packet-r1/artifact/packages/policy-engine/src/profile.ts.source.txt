import { z } from 'zod'
import { DataClassificationSchema, RoleSchema } from '@cvg/shared'

/**
 * SPEC-LEGACY-002 — the policy engine owns the mechanism; a product supplies
 * the content (capability catalog, agent profiles, grants and role ceilings)
 * as a PolicyProfile. Every set is closed per profile: a capability or agent
 * profile the profile does not declare fails schema validation, exactly as a
 * value outside the former built-in enums did.
 */

export const CapabilityNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/)
export type Capability = string

export const AgentProfileIdSchema = z.string().regex(/^[a-z][a-z0-9_-]*$/)
export type AgentProfileName = string

export const ToolRiskLevelSchema = z.enum([
  'READ_ONLY',
  'LOW_RISK_WRITE',
  'MEDIUM_RISK_WRITE',
  'HIGH_RISK_WRITE',
  'ADMIN'
])
export type ToolRiskLevel = z.infer<typeof ToolRiskLevelSchema>

export const GrantLevelSchema = z.enum(['allow', 'require_approval'])
export type GrantLevel = z.infer<typeof GrantLevelSchema>

export const RoleNameSchema = RoleSchema
export type RoleName = z.infer<typeof RoleNameSchema>

export interface CapabilityDefinition {
  capability: Capability
  category: string
  risk: ToolRiskLevel
  description: string
}

export interface CapabilityGrant {
  capability: Capability
  level: GrantLevel
  limitedFields?: boolean
  requiresMedicalOperator?: boolean
}

export type ResourceTypeScope =
  | { status: 'not_scoped' }
  | { status: 'required' }
  | { status: 'not_allowed' }
  | { status: 'allowed' }

export interface PolicyProfileInput {
  /** Stable identifier of the product profile, for diagnostics. */
  id: string
  catalog: Readonly<Record<Capability, CapabilityDefinition>>
  /**
   * Explicit action identifiers per capability. Closed and exhaustive: every
   * catalog capability declares its actions.
   */
  actions: Readonly<Record<Capability, readonly string[]>>
  /** Resource-type applicability for effect capabilities. */
  resourceTypes?: Readonly<Record<Capability, readonly string[]>>
  /** Capability ceiling per agent profile. Absence is DENY. */
  agentProfileGrants: Readonly<
    Record<AgentProfileName, readonly CapabilityGrant[]>
  >
  /** Operator role ceiling. */
  operatorRoleCapabilities: Readonly<Record<RoleName, readonly Capability[]>>
  approverRoles: readonly RoleName[]
  /**
   * Capability reported on a DENY for input that could not be parsed. It must
   * belong to the catalog.
   */
  invalidCapabilityFallback: Capability
}

export interface PolicyProfile {
  readonly id: string
  readonly catalog: Readonly<Record<Capability, CapabilityDefinition>>
  readonly actions: Readonly<Record<Capability, readonly string[]>>
  readonly resourceTypes: Readonly<Record<Capability, readonly string[]>>
  readonly agentProfileGrants: Readonly<
    Record<AgentProfileName, readonly CapabilityGrant[]>
  >
  readonly operatorRoleCapabilities: Readonly<
    Record<RoleName, readonly Capability[]>
  >
  readonly approverRoles: readonly RoleName[]
  readonly invalidCapabilityFallback: Capability
  /** Closed schema over the catalog capability names. */
  readonly capabilitySchema: ClosedSchema
  /** Closed schema over the declared agent profile names. */
  readonly agentProfileSchema: ClosedSchema
  readonly grantSchema: ReturnType<typeof createGrantSchema>
  readonly policyRuleSchema: ReturnType<typeof createPolicyRuleSchema>
  readonly policyDocumentSchema: ReturnType<typeof createPolicyDocumentSchema>
  readonly evaluationInputSchema: ReturnType<typeof createEvaluationInputSchema>
  agentProfileNames(): AgentProfileName[]
  risk(capability: Capability): ToolRiskLevel
  isHighRisk(capability: Capability): boolean
  resourceScope(
    capability: Capability,
    resource: { type?: string } | undefined
  ): ResourceTypeScope
  actionMatches(capability: Capability, action: string): boolean
  grantFor(
    profile: AgentProfileName,
    capability: Capability
  ): CapabilityGrant | undefined
  roleAllows(role: RoleName, capability: Capability): boolean
  canApprove(role: RoleName, capability: Capability): boolean
}

export class PolicyProfileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PolicyProfileError'
  }
}

export function riskRequiresApproval(risk: ToolRiskLevel): boolean {
  return risk === 'HIGH_RISK_WRITE' || risk === 'ADMIN'
}

type ClosedSchema = z.ZodEnum<Record<string, string>>

function closedSchema(values: readonly string[], label: string): ClosedSchema {
  if (values.length === 0) {
    throw new PolicyProfileError(`${label} must not be empty`)
  }
  return z.enum(values as [string, ...string[]])
}

function createGrantSchema(capabilitySchema: ClosedSchema) {
  return z.object({
    capability: capabilitySchema,
    level: GrantLevelSchema,
    limitedFields: z.boolean().optional(),
    requiresMedicalOperator: z.boolean().optional()
  })
}

function createPolicyRuleSchema(
  capabilitySchema: ClosedSchema,
  agentProfileSchema: ClosedSchema
) {
  return z
    .object({
      id: z.string().min(1).max(120),
      effect: z.enum(['ALLOW', 'DENY', 'REQUIRE_APPROVAL']),
      priority: z.number().int().min(-100).max(100).default(0),
      capabilities: z.array(capabilitySchema).min(1).optional(),
      agentProfiles: z.array(agentProfileSchema).min(1).optional(),
      roles: z.array(RoleNameSchema).min(1).optional(),
      actions: z.array(z.string().min(1).max(120)).min(1).optional(),
      resourceTypes: z.array(z.string().min(1).max(120)).min(1).optional(),
      /** Rule applies when the request classification rank is >= this value. */
      classificationAtLeast: DataClassificationSchema.optional(),
      reason: z.string().min(1).max(240)
    })
    .strict()
}

function createPolicyDocumentSchema(
  ruleSchema: ReturnType<typeof createPolicyRuleSchema>
) {
  return z
    .object({
      policyId: z.string().min(1).max(120),
      version: z.string().min(1).max(60),
      tenantId: z.string().min(1).max(120).optional(),
      effectiveFrom: z.string().datetime(),
      effectiveUntil: z.string().datetime().optional(),
      rules: z.array(ruleSchema).min(1)
    })
    .strict()
}

function createEvaluationInputSchema(
  capabilitySchema: ClosedSchema,
  agentProfileSchema: ClosedSchema
) {
  return z
    .object({
      tenantId: z.string().min(1).max(120),
      operatorId: z.string().min(1).max(120),
      operatorRole: RoleSchema,
      agentId: z.string().min(1).max(120),
      agentProfile: agentProfileSchema,
      capability: capabilitySchema,
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
}

/**
 * Validates a product profile and derives its closed schemas and lookups.
 * Every reference (grants, role ceilings, actions, resource types, fallback)
 * must point at a declared capability; otherwise the profile is rejected.
 */
export function createPolicyProfile(input: PolicyProfileInput): PolicyProfile {
  const capabilityNames = Object.keys(input.catalog)
  for (const name of capabilityNames) {
    if (!CapabilityNameSchema.safeParse(name).success) {
      throw new PolicyProfileError(`Invalid capability name: ${name}`)
    }
    const definition = input.catalog[name]
    if (!definition || definition.capability !== name) {
      throw new PolicyProfileError(`Catalog entry ${name} is inconsistent`)
    }
    if (!input.actions[name] || input.actions[name].length === 0) {
      throw new PolicyProfileError(`Capability ${name} declares no action`)
    }
  }
  const known = new Set(capabilityNames)
  const requireKnown = (capability: string, where: string): void => {
    if (!known.has(capability)) {
      throw new PolicyProfileError(`${where} references unknown ${capability}`)
    }
  }
  for (const name of Object.keys(input.actions)) requireKnown(name, 'actions')
  for (const name of Object.keys(input.resourceTypes ?? {})) {
    requireKnown(name, 'resourceTypes')
  }
  const profileNames = Object.keys(input.agentProfileGrants)
  for (const name of profileNames) {
    if (!AgentProfileIdSchema.safeParse(name).success) {
      throw new PolicyProfileError(`Invalid agent profile name: ${name}`)
    }
    for (const grant of input.agentProfileGrants[name] ?? []) {
      requireKnown(grant.capability, `profile ${name}`)
    }
  }
  for (const [role, capabilities] of Object.entries(
    input.operatorRoleCapabilities
  )) {
    for (const capability of capabilities) {
      requireKnown(capability, `role ${role}`)
    }
  }
  requireKnown(input.invalidCapabilityFallback, 'invalidCapabilityFallback')

  const capabilitySchema = closedSchema(capabilityNames, 'catalog')
  const agentProfileSchema = closedSchema(profileNames, 'agentProfileGrants')
  const policyRuleSchema = createPolicyRuleSchema(
    capabilitySchema,
    agentProfileSchema
  )
  const resourceTypes = Object.freeze({ ...(input.resourceTypes ?? {}) })

  const profile: PolicyProfile = {
    id: input.id,
    catalog: input.catalog,
    actions: input.actions,
    resourceTypes,
    agentProfileGrants: input.agentProfileGrants,
    operatorRoleCapabilities: input.operatorRoleCapabilities,
    approverRoles: input.approverRoles,
    invalidCapabilityFallback: input.invalidCapabilityFallback,
    capabilitySchema,
    agentProfileSchema,
    grantSchema: createGrantSchema(capabilitySchema),
    policyRuleSchema,
    policyDocumentSchema: createPolicyDocumentSchema(policyRuleSchema),
    evaluationInputSchema: createEvaluationInputSchema(
      capabilitySchema,
      agentProfileSchema
    ),
    agentProfileNames: () => [...profileNames],
    risk(capability) {
      const definition = input.catalog[capability]
      if (!definition) {
        throw new PolicyProfileError(`Unknown capability ${capability}`)
      }
      return definition.risk
    },
    isHighRisk(capability) {
      return riskRequiresApproval(profile.risk(capability))
    },
    resourceScope(capability, resource) {
      const allowed = resourceTypes[capability]
      if (!allowed) return { status: 'not_scoped' }
      if (!resource || typeof resource.type !== 'string') {
        return { status: 'required' }
      }
      return allowed.includes(resource.type)
        ? { status: 'allowed' }
        : { status: 'not_allowed' }
    },
    actionMatches(capability, action) {
      return input.actions[capability]?.includes(action) ?? false
    },
    grantFor(agentProfile, capability) {
      return input.agentProfileGrants[agentProfile]?.find(
        (grant) => grant.capability === capability
      )
    },
    roleAllows(role, capability) {
      return input.operatorRoleCapabilities[role]?.includes(capability) ?? false
    },
    canApprove(role, capability) {
      if (!input.approverRoles.includes(role)) return false
      if (role === 'Operator') return false
      return profile.roleAllows(role, capability)
    }
  }
  return Object.freeze(profile)
}
