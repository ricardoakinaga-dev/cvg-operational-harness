/**
 * Compatibility surface of SPEC-LEGACY-002 slice 1. These names keep their
 * former meaning, but the values now come from the legacy secretary
 * PolicyProfile instead of a built-in enum. Slice 2 moves them, with the
 * profile, to legacy/packages; new code uses a PolicyProfile directly.
 */
import type { Capability, ResourceTypeScope, ToolRiskLevel } from './profile.ts'
import type { CapabilityDefinition } from './profile.ts'
import {
  SECRETARY_POLICY_PROFILE,
  type SecretaryCapability
} from './secretary-profile.ts'

export {
  ToolRiskLevelSchema,
  type Capability,
  type CapabilityDefinition,
  type ResourceTypeScope,
  type ToolRiskLevel
} from './profile.ts'

export const CapabilitySchema = SECRETARY_POLICY_PROFILE.capabilitySchema
export const CAPABILITY_CATALOG = SECRETARY_POLICY_PROFILE.catalog as Readonly<
  Record<SecretaryCapability, CapabilityDefinition>
>
export const CAPABILITY_RESOURCE_TYPES = SECRETARY_POLICY_PROFILE.resourceTypes
export const CAPABILITY_ACTIONS = SECRETARY_POLICY_PROFILE.actions as Readonly<
  Record<SecretaryCapability, readonly string[]>
>

export function capabilityResourceScope(
  capability: Capability,
  resource: { type?: string } | undefined
): ResourceTypeScope {
  return SECRETARY_POLICY_PROFILE.resourceScope(capability, resource)
}

export function actionMatchesCapability(
  capability: Capability,
  action: string
): boolean {
  return SECRETARY_POLICY_PROFILE.actionMatches(capability, action)
}

export function capabilityRisk(capability: Capability): ToolRiskLevel {
  return SECRETARY_POLICY_PROFILE.risk(capability)
}

export function isHighRiskCapability(capability: Capability): boolean {
  return SECRETARY_POLICY_PROFILE.isHighRisk(capability)
}
