/**
 * Compatibility surface of SPEC-LEGACY-002 slice 1: legacy secretary grants
 * and role ceilings exposed under their former names. Slice 2 moves them to
 * legacy/packages; new code uses a PolicyProfile directly.
 */
import type {
  AgentProfileName,
  Capability,
  CapabilityGrant,
  RoleName
} from './profile.ts'
import {
  SECRETARY_POLICY_PROFILE,
  type SecretaryAgentProfile
} from './secretary-profile.ts'

export {
  GrantLevelSchema,
  RoleNameSchema,
  riskRequiresApproval,
  type AgentProfileName,
  type CapabilityGrant,
  type GrantLevel,
  type RoleName
} from './profile.ts'

export const AgentProfileNameSchema =
  SECRETARY_POLICY_PROFILE.agentProfileSchema
export const AGENT_PROFILE_GRANTS =
  SECRETARY_POLICY_PROFILE.agentProfileGrants as Readonly<
    Record<SecretaryAgentProfile, readonly CapabilityGrant[]>
  >
export const OPERATOR_ROLE_CAPABILITIES =
  SECRETARY_POLICY_PROFILE.operatorRoleCapabilities
export const APPROVER_ROLES = SECRETARY_POLICY_PROFILE.approverRoles
export const CapabilityGrantSchema = SECRETARY_POLICY_PROFILE.grantSchema

export function grantFor(
  profile: AgentProfileName,
  capability: Capability
): CapabilityGrant | undefined {
  return SECRETARY_POLICY_PROFILE.grantFor(profile, capability)
}

export function roleAllowsCapability(
  role: RoleName,
  capability: Capability
): boolean {
  return SECRETARY_POLICY_PROFILE.roleAllows(role, capability)
}

export function canApproveCapability(
  role: RoleName,
  capability: Capability
): boolean {
  return SECRETARY_POLICY_PROFILE.canApprove(role, capability)
}
