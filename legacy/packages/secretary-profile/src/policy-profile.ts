/**
 * LEGACY CONTENT — Esmeralda V2 (cvg-agent-secretary-v2) veterinary-hospital
 * secretary policy profile. It is product content, not harness mechanism, and
 * was moved here from @cvg/policy-engine by slice 2 of SPEC-LEGACY-002
 * (docs/02_spec/0136_legacy_secretary_profile_isolation.md). The data below is
 * byte-for-byte the former built-in catalog, grants and role ceilings.
 */
import {
  createPolicyProfile,
  type AgentProfileName,
  type Capability,
  type CapabilityDefinition,
  type CapabilityGrant,
  type RoleName
} from '@cvg/policy-engine'

export const SECRETARY_CAPABILITIES = [
  'schedule.read',
  'appointment.create',
  'appointment.modify',
  'appointment.confirm',
  'appointment.reschedule',
  'appointment.cancel',
  'conversation.read',
  'message.draft',
  'message.send',
  'patient.summary.read',
  'patient.record.read',
  'patient.record.write',
  'exam.read',
  'exam.release',
  'finance.read',
  'finance.write',
  'hospitalization.manage',
  'clinical.diagnose',
  'clinical.prescribe',
  'admin.policy.manage',
  'admin.agent.manage'
] as const

export type SecretaryCapability = (typeof SECRETARY_CAPABILITIES)[number]

export const SECRETARY_AGENT_PROFILES = [
  'secretary',
  'hospitalization',
  'clinical',
  'financial',
  'admin'
] as const

export type SecretaryAgentProfile = (typeof SECRETARY_AGENT_PROFILES)[number]

const CATALOG: Readonly<Record<Capability, CapabilityDefinition>> =
  Object.freeze({
    'schedule.read': {
      capability: 'schedule.read',
      category: 'schedule',
      risk: 'READ_ONLY',
      description: 'Read the synthetic/approved schedule'
    },
    'appointment.create': {
      capability: 'appointment.create',
      category: 'schedule',
      risk: 'MEDIUM_RISK_WRITE',
      description:
        'Create an appointment creation step/draft; real confirmation is a separate denied capability'
    },
    'appointment.modify': {
      capability: 'appointment.modify',
      category: 'schedule',
      risk: 'MEDIUM_RISK_WRITE',
      description: 'Modify an appointment draft only (never a real appointment)'
    },
    'appointment.confirm': {
      capability: 'appointment.confirm',
      category: 'schedule',
      risk: 'HIGH_RISK_WRITE',
      description:
        'Confirm a draft into a real appointment; no grant in the controlled scope'
    },
    'appointment.reschedule': {
      capability: 'appointment.reschedule',
      category: 'schedule',
      risk: 'HIGH_RISK_WRITE',
      description:
        'Change an existing real appointment; no grant in the controlled scope'
    },
    'appointment.cancel': {
      capability: 'appointment.cancel',
      category: 'schedule',
      risk: 'HIGH_RISK_WRITE',
      description: 'Cancel an appointment'
    },
    'conversation.read': {
      capability: 'conversation.read',
      category: 'conversation',
      risk: 'READ_ONLY',
      description: 'Read tenant-scoped conversations'
    },
    'message.draft': {
      capability: 'message.draft',
      category: 'conversation',
      risk: 'LOW_RISK_WRITE',
      description: 'Draft an outbound message without sending'
    },
    'message.send': {
      capability: 'message.send',
      category: 'conversation',
      risk: 'MEDIUM_RISK_WRITE',
      description: 'Send an outbound message through the channel gateway'
    },
    'patient.summary.read': {
      capability: 'patient.summary.read',
      category: 'patient',
      risk: 'READ_ONLY',
      description: 'Read a minimized patient summary'
    },
    'patient.record.read': {
      capability: 'patient.record.read',
      category: 'patient',
      risk: 'READ_ONLY',
      description: 'Read the patient record'
    },
    'patient.record.write': {
      capability: 'patient.record.write',
      category: 'patient',
      risk: 'HIGH_RISK_WRITE',
      description: 'Write to the patient record'
    },
    'exam.read': {
      capability: 'exam.read',
      category: 'exam',
      risk: 'READ_ONLY',
      description: 'Read exam metadata'
    },
    'exam.release': {
      capability: 'exam.release',
      category: 'exam',
      risk: 'HIGH_RISK_WRITE',
      description: 'Release an exam result'
    },
    'finance.read': {
      capability: 'finance.read',
      category: 'finance',
      risk: 'READ_ONLY',
      description: 'Read financial data'
    },
    'finance.write': {
      capability: 'finance.write',
      category: 'finance',
      risk: 'HIGH_RISK_WRITE',
      description: 'Perform a financial operation'
    },
    'hospitalization.manage': {
      capability: 'hospitalization.manage',
      category: 'hospitalization',
      risk: 'HIGH_RISK_WRITE',
      description: 'Manage hospitalization workflows'
    },
    'clinical.diagnose': {
      capability: 'clinical.diagnose',
      category: 'clinical',
      risk: 'HIGH_RISK_WRITE',
      description: 'Produce or alter a clinical diagnosis'
    },
    'clinical.prescribe': {
      capability: 'clinical.prescribe',
      category: 'clinical',
      risk: 'HIGH_RISK_WRITE',
      description: 'Prescribe or alter medication'
    },
    'admin.policy.manage': {
      capability: 'admin.policy.manage',
      category: 'admin',
      risk: 'ADMIN',
      description: 'Manage policies and approvals configuration'
    },
    'admin.agent.manage': {
      capability: 'admin.agent.manage',
      category: 'admin',
      risk: 'ADMIN',
      description: 'Deploy or promote agent versions'
    }
  })
const RESOURCE_TYPES: Readonly<Record<Capability, readonly string[]>> =
  Object.freeze({
    'appointment.create': ['appointment', 'appointment_draft'],
    'appointment.modify': ['appointment_draft'],
    'appointment.confirm': ['appointment'],
    'appointment.reschedule': ['appointment'],
    'appointment.cancel': ['appointment']
  })
const ACTIONS: Readonly<Record<Capability, readonly string[]>> = Object.freeze({
  'schedule.read': ['schedule.read', 'read'],
  'appointment.create': ['appointment.create'],
  'appointment.modify': ['appointment.modify'],
  'appointment.confirm': ['appointment.confirm'],
  'appointment.reschedule': ['appointment.reschedule'],
  'appointment.cancel': ['appointment.cancel'],
  'conversation.read': ['conversation.read', 'read'],
  'message.draft': ['message.draft'],
  'message.send': ['message.send'],
  'patient.summary.read': ['patient.summary.read', 'read'],
  'patient.record.read': ['patient.record.read', 'read'],
  'patient.record.write': ['patient.record.write'],
  'exam.read': ['exam.read', 'read'],
  'exam.release': ['exam.release'],
  'finance.read': ['finance.read', 'read'],
  'finance.write': ['finance.write'],
  'hospitalization.manage': ['hospitalization.manage'],
  'clinical.diagnose': ['clinical.diagnose'],
  'clinical.prescribe': ['clinical.prescribe'],
  'admin.policy.manage': ['admin.policy.manage'],
  'admin.agent.manage': ['admin.agent.manage']
})
const READ_CAPABILITIES: Capability[] = [
  'schedule.read',
  'conversation.read',
  'patient.summary.read',
  'exam.read',
  'finance.read'
]

const SCHEDULING_CAPABILITIES: Capability[] = [
  'schedule.read',
  'appointment.create',
  'appointment.modify',
  'conversation.read',
  'message.draft',
  'message.send',
  'patient.summary.read'
]

const GRANTS_BY_PROFILE: Readonly<
  Record<AgentProfileName, readonly CapabilityGrant[]>
> = {
  secretary: [
    { capability: 'schedule.read', level: 'allow' },
    { capability: 'appointment.create', level: 'allow' },
    { capability: 'appointment.modify', level: 'allow' },
    { capability: 'appointment.cancel', level: 'require_approval' },
    { capability: 'conversation.read', level: 'allow' },
    { capability: 'message.draft', level: 'allow' },
    { capability: 'message.send', level: 'allow' },
    { capability: 'patient.summary.read', level: 'allow', limitedFields: true }
  ],
  hospitalization: [
    { capability: 'schedule.read', level: 'allow' },
    { capability: 'conversation.read', level: 'allow' },
    { capability: 'message.draft', level: 'allow' },
    { capability: 'message.send', level: 'allow' },
    { capability: 'patient.summary.read', level: 'allow' },
    { capability: 'patient.record.read', level: 'allow' },
    { capability: 'hospitalization.manage', level: 'require_approval' }
  ],
  clinical: [
    { capability: 'conversation.read', level: 'allow' },
    { capability: 'patient.summary.read', level: 'allow' },
    { capability: 'patient.record.read', level: 'allow' },
    { capability: 'exam.read', level: 'allow' },
    { capability: 'patient.record.write', level: 'require_approval' },
    { capability: 'exam.release', level: 'require_approval' },
    { capability: 'clinical.diagnose', level: 'require_approval' },
    {
      capability: 'clinical.prescribe',
      level: 'require_approval',
      requiresMedicalOperator: true
    }
  ],
  financial: [
    { capability: 'finance.read', level: 'allow' },
    { capability: 'finance.write', level: 'require_approval' }
  ],
  admin: [
    { capability: 'admin.policy.manage', level: 'require_approval' },
    { capability: 'admin.agent.manage', level: 'require_approval' },
    { capability: 'conversation.read', level: 'allow' },
    { capability: 'finance.read', level: 'allow' }
  ]
}

const OPERATOR_ROLE_CAPABILITIES: Readonly<
  Record<RoleName, readonly Capability[]>
> = {
  Operator: [...SCHEDULING_CAPABILITIES, ...READ_CAPABILITIES],
  Approver: [
    ...SCHEDULING_CAPABILITIES,
    ...READ_CAPABILITIES,
    'exam.release',
    'finance.write',
    'appointment.cancel',
    'patient.record.write'
  ],
  Supervisor: (Object.keys(CATALOG) as Capability[]).filter(
    (capability) => !capability.startsWith('admin.')
  ),
  Admin: Object.keys(CATALOG) as Capability[],
  System: Object.keys(CATALOG) as Capability[]
}

const APPROVERS: readonly RoleName[] = [
  'Approver',
  'Supervisor',
  'Admin',
  'System'
]

export const SECRETARY_POLICY_PROFILE = createPolicyProfile({
  id: 'legacy.secretary',
  catalog: CATALOG,
  actions: ACTIONS,
  resourceTypes: RESOURCE_TYPES,
  agentProfileGrants: GRANTS_BY_PROFILE,
  operatorRoleCapabilities: OPERATOR_ROLE_CAPABILITIES,
  approverRoles: APPROVERS,
  invalidCapabilityFallback: 'admin.policy.manage'
})

/*
 * Former @cvg/policy-engine names, kept for the secretary content tests that
 * moved here with the profile.
 */
export const CapabilitySchema = SECRETARY_POLICY_PROFILE.capabilitySchema
export const AgentProfileNameSchema =
  SECRETARY_POLICY_PROFILE.agentProfileSchema
export const CAPABILITY_CATALOG = SECRETARY_POLICY_PROFILE.catalog as Readonly<
  Record<SecretaryCapability, CapabilityDefinition>
>
export const CAPABILITY_RESOURCE_TYPES = SECRETARY_POLICY_PROFILE.resourceTypes
export const AGENT_PROFILE_GRANTS =
  SECRETARY_POLICY_PROFILE.agentProfileGrants as Readonly<
    Record<SecretaryAgentProfile, readonly CapabilityGrant[]>
  >
export const APPROVER_ROLES = SECRETARY_POLICY_PROFILE.approverRoles

export function capabilityRisk(capability: Capability) {
  return SECRETARY_POLICY_PROFILE.risk(capability)
}

export function isHighRiskCapability(capability: Capability): boolean {
  return SECRETARY_POLICY_PROFILE.isHighRisk(capability)
}

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
