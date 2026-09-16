// Fresh policy matrix spot-check on the frozen candidate (AAA-08 / P2-1).
// Claim: appointment.confirm and appointment.reschedule are denied in every
// profile/role; appointment.modify is allowed only for appointment_draft; a
// real appointment resource is denied for modify.
import {
  PolicyEngine,
  AGENT_PROFILE_GRANTS,
  OPERATOR_ROLE_CAPABILITIES
} from '@cvg/policy-engine'
import type { AgentProfileName, RoleName, Capability } from '@cvg/policy-engine'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const profiles = Object.keys(AGENT_PROFILE_GRANTS) as AgentProfileName[]
const roles = Object.keys(OPERATOR_ROLE_CAPABILITIES) as RoleName[]
const policy = new PolicyEngine()

interface Row {
  capability: Capability
  action: string
  profile: AgentProfileName
  role: RoleName
  resource?: { type: string; id?: string }
  decision: string
  reason: string
}

function evaluate(
  capability: Capability,
  action: string,
  profile: AgentProfileName,
  role: RoleName,
  resource?: { type: string; id?: string }
): Row {
  const decision = policy.evaluate({
    tenantId: TENANT,
    operatorId: 'op_1',
    operatorRole: role,
    agentId: 'agent_00000000-0000-4000-8000-000000000001',
    agentProfile: profile,
    capability,
    action,
    ...(resource !== undefined ? { resource } : {}),
    correlationId: 'corr_00000000-0000-4000-8000-0000000000aa',
    context: { dataClassification: 'INTERNAL' }
  })
  return {
    capability,
    action,
    profile,
    role,
    resource,
    decision: decision.decision,
    reason: decision.reason
  }
}

const failures: string[] = []

// 1) confirm/reschedule denied for every profile x role (real appointment).
const confirmRows: Row[] = []
const rescheduleRows: Row[] = []
for (const profile of profiles) {
  for (const role of roles) {
    confirmRows.push(
      evaluate('appointment.confirm', 'appointment.confirm', profile, role, {
        type: 'appointment',
        id: 'apt_1'
      })
    )
    rescheduleRows.push(
      evaluate(
        'appointment.reschedule',
        'appointment.reschedule',
        profile,
        role,
        { type: 'appointment', id: 'apt_1' }
      )
    )
  }
}
const confirmAllowed = confirmRows.filter((r) => r.decision === 'ALLOW')
const confirmApproval = confirmRows.filter(
  (r) => r.decision === 'REQUIRE_APPROVAL'
)
const rescheduleAllowed = rescheduleRows.filter((r) => r.decision === 'ALLOW')
const rescheduleApproval = rescheduleRows.filter(
  (r) => r.decision === 'REQUIRE_APPROVAL'
)
if (confirmAllowed.length > 0 || confirmApproval.length > 0) {
  failures.push(
    `appointment.confirm not denied somewhere: ${JSON.stringify(confirmAllowed.concat(confirmApproval))}`
  )
}
if (rescheduleAllowed.length > 0 || rescheduleApproval.length > 0) {
  failures.push(
    `appointment.reschedule not denied somewhere: ${JSON.stringify(rescheduleAllowed.concat(rescheduleApproval))}`
  )
}

// 2) modify on real appointment denied everywhere; on draft allowed for a
// granted profile+role (secretary/Supervisor, explicit positive control).
const modifyRealRows: Row[] = []
for (const profile of profiles) {
  for (const role of roles) {
    modifyRealRows.push(
      evaluate('appointment.modify', 'appointment.modify', profile, role, {
        type: 'appointment',
        id: 'apt_1'
      })
    )
  }
}
const modifyRealAllowed = modifyRealRows.filter((r) => r.decision === 'ALLOW')
if (modifyRealAllowed.length > 0) {
  failures.push(
    `appointment.modify on real appointment allowed: ${JSON.stringify(modifyRealAllowed)}`
  )
}
const modifyDraft = evaluate(
  'appointment.modify',
  'appointment.modify',
  'secretary',
  'Supervisor',
  { type: 'appointment_draft', id: 'drf_1' }
)
if (modifyDraft.decision !== 'ALLOW') {
  failures.push(
    `positive control failed: draft modify = ${modifyDraft.decision}/${modifyDraft.reason}`
  )
}
const modifyDraftConfirm = evaluate(
  'appointment.confirm',
  'appointment.confirm',
  'secretary',
  'Supervisor',
  { type: 'appointment_draft', id: 'drf_1' }
)
if (modifyDraftConfirm.decision !== 'DENY') {
  failures.push(
    `confirm on draft not denied: ${modifyDraftConfirm.decision}/${modifyDraftConfirm.reason}`
  )
}

// 3) cross-check profiles are exhaustive for the confirm capability.
const observedProfiles = new Set(confirmRows.map((r) => r.profile))
console.log(
  JSON.stringify({
    probe: 'policy-matrix-spotcheck',
    profiles,
    roles,
    combinationsConfirm: confirmRows.length,
    combinationsReschedule: rescheduleRows.length,
    combinationsModifyReal: modifyRealRows.length,
    confirmDenyReasons: [
      ...new Set(confirmRows.map((r) => `${r.decision}:${r.reason}`))
    ],
    rescheduleDenyReasons: [
      ...new Set(rescheduleRows.map((r) => `${r.decision}:${r.reason}`))
    ],
    modifyRealDenyReasons: [
      ...new Set(modifyRealRows.map((r) => `${r.decision}:${r.reason}`))
    ],
    modifyDraft,
    confirmOnDraft: modifyDraftConfirm,
    profilesObserved: [...observedProfiles].sort(),
    falsified: failures.length > 0,
    failures
  })
)
if (failures.length > 0) process.exitCode = 1
