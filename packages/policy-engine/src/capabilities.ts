import { z } from 'zod'

export const CapabilitySchema = z.enum([
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
])

export type Capability = z.infer<typeof CapabilitySchema>

export const ToolRiskLevelSchema = z.enum([
  'READ_ONLY',
  'LOW_RISK_WRITE',
  'MEDIUM_RISK_WRITE',
  'HIGH_RISK_WRITE',
  'ADMIN'
])

export type ToolRiskLevel = z.infer<typeof ToolRiskLevelSchema>

export const CapabilityCategorySchema = z.enum([
  'schedule',
  'conversation',
  'patient',
  'exam',
  'finance',
  'clinical',
  'hospitalization',
  'admin'
])

export type CapabilityCategory = z.infer<typeof CapabilityCategorySchema>

export interface CapabilityDefinition {
  capability: Capability
  category: CapabilityCategory
  risk: ToolRiskLevel
  description: string
}

export const CAPABILITY_CATALOG: Readonly<
  Record<Capability, CapabilityDefinition>
> = Object.freeze({
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

/**
 * Resource-type applicability for effect capabilities. A capability present in
 * this map can only act on the listed resource types; an absent or incompatible
 * resource fails closed before grants and policy documents are consulted.
 */
export const CAPABILITY_RESOURCE_TYPES: Readonly<
  Partial<Record<Capability, readonly string[]>>
> = Object.freeze({
  'appointment.create': ['appointment', 'appointment_draft'],
  'appointment.modify': ['appointment_draft'],
  'appointment.confirm': ['appointment'],
  'appointment.reschedule': ['appointment'],
  'appointment.cancel': ['appointment']
})

export type ResourceTypeScope =
  | { status: 'not_scoped' }
  | { status: 'required' }
  | { status: 'not_allowed' }
  | { status: 'allowed' }

export function capabilityResourceScope(
  capability: Capability,
  resource: { type?: string } | undefined
): ResourceTypeScope {
  const allowed = CAPABILITY_RESOURCE_TYPES[capability]
  if (!allowed) return { status: 'not_scoped' }
  if (!resource || typeof resource.type !== 'string') {
    return { status: 'required' }
  }
  return allowed.includes(resource.type)
    ? { status: 'allowed' }
    : { status: 'not_allowed' }
}

/**
 * Explicit action identifiers accepted per capability. The map is closed and
 * exhaustive: every capability declares its actions, and the only tolerated
 * difference from the canonical capability name is a declared alias (for
 * example the generic `read` action of read-only capabilities). A declared
 * sensitive action (confirm/reschedule/cancel) can never be smuggled through a
 * draft or read capability.
 */
export const CAPABILITY_ACTIONS: Readonly<
  Record<Capability, readonly string[]>
> = Object.freeze({
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

export function actionMatchesCapability(
  capability: Capability,
  action: string
): boolean {
  return CAPABILITY_ACTIONS[capability].includes(action)
}

export function capabilityRisk(capability: Capability): ToolRiskLevel {
  return CAPABILITY_CATALOG[capability].risk
}

export function isHighRiskCapability(capability: Capability): boolean {
  const risk = capabilityRisk(capability)
  return risk === 'HIGH_RISK_WRITE' || risk === 'ADMIN'
}
