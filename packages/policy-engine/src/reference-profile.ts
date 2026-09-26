/**
 * Neutral reference PolicyProfile of the harness (SPEC-LEGACY-002, slice 3).
 * It mirrors the structure of the legacy product profile one-to-one, with
 * the same risk levels, grants and role ceilings under product-neutral names,
 * so harness tests and the synthetic worker kernel exercise the policy
 * mechanism without legacy vocabulary. It is an example, not a product.
 */
import {
  createPolicyProfile,
  type AgentProfileName,
  type Capability,
  type CapabilityDefinition,
  type CapabilityGrant,
  type RoleName
} from './profile.ts'

export const REFERENCE_CAPABILITIES = [
  'resource.read',
  'record.create',
  'record.update',
  'record.confirm',
  'record.reschedule',
  'record.cancel',
  'conversation.read',
  'message.draft',
  'message.send',
  'subject.summary.read',
  'subject.record.read',
  'subject.record.write',
  'restricted.data.read',
  'restricted.data.release',
  'restricted.finance.read',
  'restricted.finance.write',
  'restricted.workflow.manage',
  'restricted.assessment.issue',
  'restricted.directive.issue',
  'admin.policy.manage',
  'admin.agent.manage'
] as const

export type ReferenceCapability = (typeof REFERENCE_CAPABILITIES)[number]

export const REFERENCE_AGENT_PROFILES = [
  'assistant',
  'operations',
  'specialist',
  'finance',
  'admin'
] as const

export type ReferenceAgentProfile = (typeof REFERENCE_AGENT_PROFILES)[number]

const CATALOG: Readonly<Record<Capability, CapabilityDefinition>> =
  Object.freeze({
    'resource.read': {
      capability: 'resource.read',
      category: 'record',
      risk: 'READ_ONLY',
      description: 'Read an approved resource listing'
    },
    'record.create': {
      capability: 'record.create',
      category: 'record',
      risk: 'MEDIUM_RISK_WRITE',
      description:
        'Create a record draft; confirmation is a separate capability'
    },
    'record.update': {
      capability: 'record.update',
      category: 'record',
      risk: 'MEDIUM_RISK_WRITE',
      description: 'Update a record draft only (never a confirmed record)'
    },
    'record.confirm': {
      capability: 'record.confirm',
      category: 'record',
      risk: 'HIGH_RISK_WRITE',
      description:
        'Confirm a draft into a real record; no grant in the reference scope'
    },
    'record.reschedule': {
      capability: 'record.reschedule',
      category: 'record',
      risk: 'HIGH_RISK_WRITE',
      description:
        'Change an existing real record; no grant in the reference scope'
    },
    'record.cancel': {
      capability: 'record.cancel',
      category: 'record',
      risk: 'HIGH_RISK_WRITE',
      description: 'Cancel a record'
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
    'subject.summary.read': {
      capability: 'subject.summary.read',
      category: 'subject',
      risk: 'READ_ONLY',
      description: 'Read a minimized subject summary'
    },
    'subject.record.read': {
      capability: 'subject.record.read',
      category: 'subject',
      risk: 'READ_ONLY',
      description: 'Read the subject record'
    },
    'subject.record.write': {
      capability: 'subject.record.write',
      category: 'subject',
      risk: 'HIGH_RISK_WRITE',
      description: 'Write to the subject record'
    },
    'restricted.data.read': {
      capability: 'restricted.data.read',
      category: 'restricted',
      risk: 'READ_ONLY',
      description: 'Read restricted data metadata'
    },
    'restricted.data.release': {
      capability: 'restricted.data.release',
      category: 'restricted',
      risk: 'HIGH_RISK_WRITE',
      description: 'Release restricted data'
    },
    'restricted.finance.read': {
      capability: 'restricted.finance.read',
      category: 'restricted',
      risk: 'READ_ONLY',
      description: 'Read financial data'
    },
    'restricted.finance.write': {
      capability: 'restricted.finance.write',
      category: 'restricted',
      risk: 'HIGH_RISK_WRITE',
      description: 'Perform a financial operation'
    },
    'restricted.workflow.manage': {
      capability: 'restricted.workflow.manage',
      category: 'operations',
      risk: 'HIGH_RISK_WRITE',
      description: 'Manage a restricted workflow'
    },
    'restricted.assessment.issue': {
      capability: 'restricted.assessment.issue',
      category: 'specialist',
      risk: 'HIGH_RISK_WRITE',
      description: 'Issue or alter a restricted professional assessment'
    },
    'restricted.directive.issue': {
      capability: 'restricted.directive.issue',
      category: 'specialist',
      risk: 'HIGH_RISK_WRITE',
      description: 'Issue or alter a restricted professional directive'
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
    'record.create': ['record', 'record_draft'],
    'record.update': ['record_draft'],
    'record.confirm': ['record'],
    'record.reschedule': ['record'],
    'record.cancel': ['record']
  })
const ACTIONS: Readonly<Record<Capability, readonly string[]>> = Object.freeze({
  'resource.read': ['resource.read', 'read'],
  'record.create': ['record.create'],
  'record.update': ['record.update'],
  'record.confirm': ['record.confirm'],
  'record.reschedule': ['record.reschedule'],
  'record.cancel': ['record.cancel'],
  'conversation.read': ['conversation.read', 'read'],
  'message.draft': ['message.draft'],
  'message.send': ['message.send'],
  'subject.summary.read': ['subject.summary.read', 'read'],
  'subject.record.read': ['subject.record.read', 'read'],
  'subject.record.write': ['subject.record.write'],
  'restricted.data.read': ['restricted.data.read', 'read'],
  'restricted.data.release': ['restricted.data.release'],
  'restricted.finance.read': ['restricted.finance.read', 'read'],
  'restricted.finance.write': ['restricted.finance.write'],
  'restricted.workflow.manage': ['restricted.workflow.manage'],
  'restricted.assessment.issue': ['restricted.assessment.issue'],
  'restricted.directive.issue': ['restricted.directive.issue'],
  'admin.policy.manage': ['admin.policy.manage'],
  'admin.agent.manage': ['admin.agent.manage']
})
const READ_CAPABILITIES: Capability[] = [
  'resource.read',
  'conversation.read',
  'subject.summary.read',
  'restricted.data.read',
  'restricted.finance.read'
]

const RECORD_CAPABILITIES: Capability[] = [
  'resource.read',
  'record.create',
  'record.update',
  'conversation.read',
  'message.draft',
  'message.send',
  'subject.summary.read'
]

const AGENT_PROFILE_GRANTS: Readonly<
  Record<AgentProfileName, readonly CapabilityGrant[]>
> = {
  assistant: [
    { capability: 'resource.read', level: 'allow' },
    { capability: 'record.create', level: 'allow' },
    { capability: 'record.update', level: 'allow' },
    { capability: 'record.cancel', level: 'require_approval' },
    { capability: 'conversation.read', level: 'allow' },
    { capability: 'message.draft', level: 'allow' },
    { capability: 'message.send', level: 'allow' },
    { capability: 'subject.summary.read', level: 'allow', limitedFields: true }
  ],
  operations: [
    { capability: 'resource.read', level: 'allow' },
    { capability: 'conversation.read', level: 'allow' },
    { capability: 'message.draft', level: 'allow' },
    { capability: 'message.send', level: 'allow' },
    { capability: 'subject.summary.read', level: 'allow' },
    { capability: 'subject.record.read', level: 'allow' },
    { capability: 'restricted.workflow.manage', level: 'require_approval' }
  ],
  specialist: [
    { capability: 'conversation.read', level: 'allow' },
    { capability: 'subject.summary.read', level: 'allow' },
    { capability: 'subject.record.read', level: 'allow' },
    { capability: 'restricted.data.read', level: 'allow' },
    { capability: 'subject.record.write', level: 'require_approval' },
    { capability: 'restricted.data.release', level: 'require_approval' },
    { capability: 'restricted.assessment.issue', level: 'require_approval' },
    {
      capability: 'restricted.directive.issue',
      level: 'require_approval',
      requiresMedicalOperator: true
    }
  ],
  finance: [
    { capability: 'restricted.finance.read', level: 'allow' },
    { capability: 'restricted.finance.write', level: 'require_approval' }
  ],
  admin: [
    { capability: 'admin.policy.manage', level: 'require_approval' },
    { capability: 'admin.agent.manage', level: 'require_approval' },
    { capability: 'conversation.read', level: 'allow' },
    { capability: 'restricted.finance.read', level: 'allow' }
  ]
}

const OPERATOR_ROLE_CAPABILITIES: Readonly<
  Record<RoleName, readonly Capability[]>
> = {
  Operator: [...RECORD_CAPABILITIES, ...READ_CAPABILITIES],
  Approver: [
    ...RECORD_CAPABILITIES,
    ...READ_CAPABILITIES,
    'restricted.data.release',
    'restricted.finance.write',
    'record.cancel',
    'subject.record.write'
  ],
  Supervisor: (Object.keys(CATALOG) as Capability[]).filter(
    (capability) => !capability.startsWith('admin.')
  ),
  Admin: Object.keys(CATALOG) as Capability[],
  System: Object.keys(CATALOG) as Capability[]
}

const APPROVER_ROLES: readonly RoleName[] = [
  'Approver',
  'Supervisor',
  'Admin',
  'System'
]

export const REFERENCE_POLICY_PROFILE = createPolicyProfile({
  id: 'harness.reference',
  catalog: CATALOG,
  actions: ACTIONS,
  resourceTypes: RESOURCE_TYPES,
  agentProfileGrants: AGENT_PROFILE_GRANTS,
  operatorRoleCapabilities: OPERATOR_ROLE_CAPABILITIES,
  approverRoles: APPROVER_ROLES,
  invalidCapabilityFallback: 'admin.policy.manage'
})
