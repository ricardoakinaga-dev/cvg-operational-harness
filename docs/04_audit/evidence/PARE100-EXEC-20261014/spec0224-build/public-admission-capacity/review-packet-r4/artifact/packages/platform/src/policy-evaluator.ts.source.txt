import type {
  AgentConfig,
  PlatformDecision,
  PlatformPolicyResult
} from './contracts.ts'

export interface PlatformPolicyInput {
  action: string
  confidence: number
  config: AgentConfig
  policyAvailable?: boolean
  clarificationCount?: number
  riskLevel?: 'low' | 'medium' | 'high' | 'critical'
}

const hardBlockedPatterns = [
  /diagn[oó]stic/i,
  /prescrev|prescri/i,
  /rem[eé]dio/i,
  /tratamento/i,
  /medica[cç][aã]o/i,
  /medication|medicamento|dipirona|ibuprofeno|paracetamol|antibi[oó]tico/i,
  /prontu[aá]rio/i,
  /cobran[cç]a|pagamento/i,
  /confirm_appointment|cancel_appointment|reschedule_appointment/i,
  /real_(channel|rag|provider)|send_external/i
]

export function evaluatePlatformPolicy(
  input: PlatformPolicyInput
): PlatformPolicyResult {
  if (input.policyAvailable === false) {
    return result(
      'blocked',
      'organization',
      'policy_unavailable_fail_closed',
      input.config.policies.version
    )
  }

  if (hardBlockedPatterns.some((pattern) => pattern.test(input.action))) {
    return result(
      'blocked',
      'hard_safety',
      'hard_safety_action_blocked',
      'hard-safety-v1'
    )
  }

  if (input.riskLevel === 'high' || input.riskLevel === 'critical') {
    return result(
      'handoff',
      'hard_safety',
      'high_risk_requires_handoff',
      'hard-safety-v1'
    )
  }

  if (input.config.policies.blockedActions.includes(input.action)) {
    return result(
      'blocked',
      'organization',
      'action_blocked_by_published_policy',
      input.config.policies.version
    )
  }

  if (
    input.config.policies.enabledActions.length > 0 &&
    !input.config.policies.enabledActions.includes(input.action)
  ) {
    return result(
      'blocked',
      'organization',
      'action_not_enabled',
      input.config.policies.version
    )
  }

  if (input.config.policies.approvalActions.includes(input.action)) {
    return result(
      'requires_approval',
      'organization',
      'approval_required_by_published_policy',
      input.config.policies.version
    )
  }

  const clarifyThreshold =
    input.config.policies.clarifyThreshold ??
    input.config.policies.minConfidence
  const handoffThreshold = input.config.policies.handoffThreshold ?? 0
  if (input.confidence < handoffThreshold) {
    return result(
      'handoff',
      'agent_behavior',
      'low_confidence_handoff_threshold',
      input.config.policies.version
    )
  }

  if (input.confidence < clarifyThreshold) {
    const count = input.clarificationCount ?? 0
    const decision: PlatformDecision =
      input.config.policies.lowConfidence === 'clarify' &&
      count < input.config.policies.maxClarifications
        ? 'clarify'
        : 'handoff'
    return result(
      decision,
      'agent_behavior',
      decision === 'clarify'
        ? 'low_confidence_clarification'
        : 'low_confidence_handoff',
      input.config.policies.version
    )
  }

  return result(
    'allowed',
    'agent_behavior',
    'action_allowed',
    input.config.policies.version
  )
}

function result(
  decision: PlatformDecision,
  layer: PlatformPolicyResult['layer'],
  reason: string,
  policyVersion: string
): PlatformPolicyResult {
  return { decision, layer, reason, policyVersion }
}
