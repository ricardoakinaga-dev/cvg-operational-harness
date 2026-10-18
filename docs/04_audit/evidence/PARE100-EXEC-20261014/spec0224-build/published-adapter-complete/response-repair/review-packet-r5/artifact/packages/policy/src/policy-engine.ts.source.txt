import type { AutonomyLevel, PolicyDecision, RiskLevel } from '@cvg/shared'
import { containsSensitiveClinicalOrFinancialAction } from './safety/clinical-boundaries.ts'
import { POLICY_VERSION } from './policy-version.ts'

export interface PolicyInput {
  action: string
  autonomyLevel: AutonomyLevel
  riskLevel?: RiskLevel
  policyAvailable?: boolean
}

export interface PolicyResult {
  decision: PolicyDecision
  reason: string
  policyVersion: string
}

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  if (input.policyAvailable === false) {
    return {
      decision: 'blocked',
      reason: 'policy_unavailable_fail_closed',
      policyVersion: POLICY_VERSION
    }
  }
  if (containsSensitiveClinicalOrFinancialAction(input.action)) {
    return {
      decision: 'blocked',
      reason: 'sensitive_action_blocked',
      policyVersion: POLICY_VERSION
    }
  }
  if (input.riskLevel === 'high' || input.riskLevel === 'critical') {
    return {
      decision: 'handoff',
      reason: 'high_risk_requires_handoff',
      policyVersion: POLICY_VERSION
    }
  }
  if (
    input.action.includes('confirm_appointment') ||
    input.action.includes('cancel_appointment')
  ) {
    return {
      decision: 'requires_approval',
      reason: 'agenda_confirmation_draft_only',
      policyVersion: POLICY_VERSION
    }
  }
  return {
    decision: input.autonomyLevel === 'level_2_suggest' ? 'allowed' : 'handoff',
    reason: 'conservative_autonomy',
    policyVersion: POLICY_VERSION
  }
}
