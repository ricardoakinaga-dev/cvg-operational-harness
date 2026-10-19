/** Conservative lexical screening, not clinical inference. Legacy history has no
 * trustworthy roles or resolution markers; it may raise risk, never clear it. */
export interface SafetyAssessment {
  level: 'low' | 'high' | 'critical'
  reason: string
}

export function normalizeSafetyText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
}

const medication =
  /\b(?:dipirona|ibuprofeno|paracetamol|medicamento\w*|medicacao|remedio\w*|antibiotico\w*|medication|medicine|drug)\b/u
const symptoms =
  /\b(?:vomit\w*|sangue|sangra\w*|dor|dores|convuls\w*|desmai\w*)\b/gu

function assessText(value: string): SafetyAssessment['level'] {
  const text = normalizeSafetyText(value)
  // Medication remains a hard safety boundary even in ambiguous/negated prose.
  if (medication.test(text)) return 'critical'
  for (const clause of text.split(
    /[.!?;,:\n]|\b(?:mas|porem|contudo|entretanto)\b/u
  )) {
    for (const match of clause.matchAll(symptoms)) {
      const prefix = clause.slice(0, match.index)
      // Scope is deliberately local. A clear negator may cover a short
      // symptom phrase ("não está vomitando sangue"), while uncertainty,
      // double negation and a contrastive clause remain conservative.
      const denied = isExplicitlyDenied(prefix)
      const routineSample =
        match[0] === 'sangue' &&
        !/\b(?:fezes|vomit\w*|sangr\w*|dor|convuls\w*|desmai\w*)\b/u.test(
          clause
        ) &&
        (/(?:exame|exames|coleta|analise|analises)\s+de\s+$/u.test(prefix) ||
          /\bsangue\b[\s\S]{0,24}\b(?:para|de)\s+(?:exame|exames|coleta|analise|analises|rotina)\b/u.test(
            clause
          ))
      if (!denied && !routineSample) return 'high'
    }
  }
  return 'low'
}

function isExplicitlyDenied(prefix: string): boolean {
  const normalized = prefix.trim()
  if (/\bnao\s+(?:\w+\s+){0,4}(?:sem|nega|ausencia de)\b/u.test(normalized)) {
    return false
  }
  const negation = [
    ...normalized.matchAll(/\b(?:nao|sem|nem|nega|ausencia de)\b/gu)
  ]
  if (negation.length === 0) return false
  const lastNegator = negation.at(-1)
  if (!lastNegator || lastNegator.index === undefined) return false
  const after = normalized
    .slice(lastNegator.index + lastNegator[0].length)
    .trim()
  if (!after) return true
  // "não sei se", "não apenas" and similar forms do not assert absence.
  if (
    /^(?:sei|sabemos?|apenas|somente|acho|talvez|pode|podem)\b/u.test(after)
  ) {
    return false
  }
  // "não está sem dor" / "não nega dor" are double negatives.
  if (/^(?:\w+\s+){0,4}(?:sem|nega|ausencia de)\b/u.test(after)) {
    return false
  }
  // A negator does not cross a coordinating conjunction. This prevents a
  // negated symptom on the left side of a sentence from clearing an affirmed
  // symptom on the right (for example, "sem dor e com vomito"). A second
  // explicit negator ("e sem vomito"/"nem vomito") is handled because it is
  // selected as the last negator above.
  if (/\b(?:e|ou)\b/u.test(after)) return false
  // Keep the scope short so an unrelated affirmative clause is not hidden.
  return after.split(/\s+/u).length <= 5
}

export function assessConversationSafety(
  message: string,
  history: readonly string[]
): SafetyAssessment {
  const current = assessText(message)
  const previous = history.map(assessText)
  if (current === 'critical')
    return { level: current, reason: 'hard_safety_medication_request' }
  if (previous.includes('critical'))
    return { level: 'critical', reason: 'history_medication_risk' }
  if (current === 'high')
    return { level: current, reason: 'active_symptom_requires_handoff' }
  if (previous.includes('high'))
    return { level: 'high', reason: 'unresolved_history_symptom_risk' }
  return { level: 'low', reason: 'controlled_low_risk_request' }
}
