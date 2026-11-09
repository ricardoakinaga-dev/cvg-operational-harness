import { redactSensitiveText } from '@cvg/shared'
import {
  matchesKernelActionEvidence,
  type KernelActionBinding
} from './kernel-action-evidence.ts'
import {
  MEDICATION_VOCABULARY,
  assessConversationSafety
} from './safety-assessment.ts'

/*
 * SPEC 0317 G2. The patterns below are a complementary defense: they do not
 * cover arbitrary paraphrase, context, irony, negation, other languages or new
 * encodings, and a pass here is no semantic guarantee. What holds is the
 * fallback: sensitive content or unknown risk leaves as a controlled template.
 */

export const CONTROLLED_OUTPUT_MAX_CHARS = 4000 as const

export const CONTROLLED_SAFE_OUTPUTS = Object.freeze({
  handoff: 'Vou encaminhar sua solicitação para a equipe responsável.',
  blocked: 'Essa ação permanece bloqueada pelas políticas de segurança.',
  clarify: 'Pode esclarecer um pouco mais sua solicitação?',
  medicationRefusal:
    'Não posso orientar o uso de medicamentos. Procure um médico-veterinário para avaliação.'
} as const)

export type ControlledOutputMode = 'answer' | 'clarify' | 'handoff' | 'blocked'

export type ControlledOutputRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type ControlledOutputDecision = 'allowed' | 'rewritten'

export type ControlledOutputReason =
  | 'output_allowed'
  | 'output_redacted'
  | 'unsafe_output_rejected'
  | 'invalid_output'
  | 'output_too_large'

export interface ControlledOutputInput {
  text: unknown
  mode: unknown
  /** The server assessment. A client or model label must never reach it. */
  riskLevel: unknown
  /** Kernel evidence for a claim that a permitted action was concluded. */
  completion?: { evidence: unknown; expected: KernelActionBinding }
}

export interface ControlledOutputResult {
  decision: ControlledOutputDecision
  reason: ControlledOutputReason
  mode: ControlledOutputMode
  text: string
  redacted: boolean
}

const riskRank: Readonly<Record<ControlledOutputRiskLevel, number>> =
  Object.freeze({ low: 0, medium: 1, high: 2, critical: 3 })

const outputModes = new Set<ControlledOutputMode>([
  'answer',
  'clarify',
  'handoff',
  'blocked'
])

const appointmentActionPattern =
  '(?:agend\\w*|marc(?:a|as|am|o|ou|ar|ara|arei|aram|aremos|amos|ando|ada|adas|ado|ados|agem|agens)|marqu(?:e|ei|em|ar|ada|ado)|desmarc\\w*|desmarqu\\w*|confirm\\w*|reserv\\w*|cancel\\w*|reagend\\w*|remarc\\w*|remarqu\\w*|book\\w*|schedul\\w*|reschedul\\w*)'
const appointmentTargetPattern =
  '(?:consulta(?:s)?|agendamento(?:s)?|appointment(?:s)?|horario(?:s)?|agenda(?:s)?|visita(?:s)?|retorno(?:s)?|vaga(?:s)?|encaixe(?:s)?|atendimento(?:s)?|exame(?:s)?|cirurgia(?:s)?|reserva(?:s)?|slot(?:s)?|booking(?:s)?|visit(?:s)?)'
const doseAmountPattern =
  '(?:\\d+(?:[.,]\\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|doze|meio|meia|metade|one|two|three|half)'
const doseTimePattern =
  '(?:manha|tarde|noite|jejum|refeicao|refeicoes|vezes|morning|evening|night|daily)'

function near(left: string, right: string): RegExp[] {
  return [
    new RegExp(`\\b${left}\\b[\\s\\S]{0,100}\\b${right}\\b`, 'i'),
    new RegExp(`\\b${right}\\b[\\s\\S]{0,100}\\b${left}\\b`, 'i')
  ]
}

const unsafeOutputPatterns = Object.freeze([
  /\bdiagnostic(?:o|a|ar|ada|ado|os|as)?\b/i,
  /\bdiagnos(?:is|es)\b/i,
  /\bprescri(?:cao|coes)\b/i,
  /\bprescrit[oa]s?\b/i,
  /\bprescrev(?:er|a|e|o|am|em)?\b/i,
  /\bprescrib(?:e|ed|ing)?\b/i,
  /\b(?:dose|doses|dosagem)\b/i,
  /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|ug|ml|g|kg|ui|%)\b/i,
  new RegExp(`\\b${MEDICATION_VOCABULARY}\\b`, 'i'),
  /\b(?:tratamento(?:s)?|treatment(?:s)?)\b/i,
  /\b(?:prontuario(?:s)?|medical\s+record(?:s)?)\b/i,

  // Ingestion: dosage forms, frequency and instructions without a number.
  /\b(?:comprimido(?:s)?|capsula(?:s)?|pilula(?:s)?|dragea(?:s)?|ampola(?:s)?|sache(?:s)?|supositorio(?:s)?|injecao|injecoes|injetavel|xarope(?:s)?|pomada(?:s)?|gota(?:s)?|gotinha(?:s)?|tablet(?:s)?|pill(?:s)?|capsule(?:s)?|syrup(?:s)?)\b/i,
  /\bcolher(?:es|zinha|zinhas)?\s+de\s+(?:sopa|cha|cafe|sobremesa)\b/i,
  new RegExp(
    `\\ba\\s+cada\\s+${doseAmountPattern}\\s*(?:h|hs|hora|horas)\\b`,
    'i'
  ),
  /\bde\s+(\S+)\s+em\s+\1\s*(?:h|hs|hora|horas)\b/i,
  /\b\d{1,2}\s*\/\s*\d{1,2}\s*(?:h|hs|hora|horas)\b/i,
  new RegExp(
    `\\b${doseAmountPattern}\\s*(?:x|vez|vezes)\\s*(?:ao|por|a|no|na|/)\\s*(?:dia|semana)\\b`,
    'i'
  ),
  new RegExp(
    `\\b${doseAmountPattern}\\s+(?:pela|por|ao|a|de)\\s+(?:manha|tarde|noite|dia)\\b`,
    'i'
  ),
  /\bem\s+jejum\b/i,
  /\b(?:antes|depois|apos|durante)\s+(?:d[aeo]s?\s+)?(?:refeicao|refeicoes|cafe\s+da\s+manha|almoco|jantar)\b/i,
  /\b(?:de|pela)\s+manha\s+e\s+(?:a|de)\s+noite\b/i,
  /\bevery\s+\w+\s+hours?\b/i,
  /\b(?:once|twice|thrice|(?:two|three|\d+)\s+times)\s+(?:a|per)\s+day\b/i,
  /\b(?:once|twice)\s+daily\b/i,
  /\b(?:ingira|ingiram|ingerir|ingerindo|engula|engulam|engolir|mastigue|mastiguem|mastigar|medique|medicar|medicad[oa]s?|administre|administrem|administrar|administrando|pingue|pinguem|pingar|swallow|ingest|administer)\b/i,
  /\b(?:tome|tomem)\b(?!\s+(?:cuidado|nota|ciencia|conhecimento|providencias?)\b)/i,
  /\b(?:deve|devem|precisa|precisam|pode|podem|tem\s+que|recomendo|sugiro)\s+(?:tomar|ingerir)\b/i,
  new RegExp(
    `\\b(?:toma|tomar|tomando|tomara|take|takes|taking)\\b[^.!?\\n]{0,40}\\b(?:${doseAmountPattern}|${doseTimePattern}|dia|dias)\\b`,
    'i'
  ),
  new RegExp(
    `\\b(?:dar|dando|ofereca|oferecam|oferecer|oferecendo|use|usem|usar|usando|aplique|apliquem|aplicar|aplicando|give|apply)\\b[^.!?\\n]{0,40}\\b${doseTimePattern}\\b`,
    'i'
  ),
  /\bde\s+(?:\S+\s+){1,3}(?:ao|a|para\s+o|para\s+a|pro|pra)\s+(?:(?:seu|sua)\s+)?(?:animal|pet|cao|cachorro|cadela|gato|gata|filhote|bichinho|paciente)\b/i,

  // Agenda: any verb tense, with or without the appointment word.
  ...near(appointmentActionPattern, appointmentTargetPattern),
  ...near('garant\\w*', '(?:horario(?:s)?|vaga(?:s)?)'),
  /\b(?:confirmad[oa]s?|agendad[oa]s?|marcad[oa]s?|reagendad[oa]s?|remarcad[oa]s?|desmarcad[oa]s?|cancelad[oa]s?|canceled|cancelled|confirmed|scheduled|rescheduled|booked)\b/i,
  /\b(?:confirmei|confirmamos|confirmaremos|agendei|agendamos|agendaremos|marquei|marcamos|marcaremos|reservei|reservamos|reagendei|reagendamos|remarquei|remarcamos|cancelei|cancelamos)\b/i,
  /\besper(?:o|amos)\b[^.!?\n]{0,40}\b(?:amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|dia\s+\d+|\d{1,2}\s*h)\b/i,

  // Money: nouns, imperatives and any tense of paying.
  /\b(?:pagamento(?:s)?|cobranca(?:s)?|payment(?:s)?|charge(?:s)?)\b/i,
  /\b(?:pix|boleto(?:s)?|fatura(?:s)?|cartao\s+de\s+(?:credito|debito)|transferencia\s+bancaria|debito\s+automatico|divida(?:s)?|reembolso(?:s)?|estorno(?:s)?|invoice(?:s)?|wire\s+transfer|refund(?:s)?)\b/i,
  /\b(?:pag(?:a|as|am|o|os|ar|ara|arei|aram|aremos|amos|ando|ou|ue|uem|uei)|pay|pays|paying|paid|quit(?:ar|e|em|ando|ado|ada|ou)|deposit(?:e|em|ar|ando|ado|ada|ou|o|a)|deposit|parcel(?:e|em|ar|ado|ada|amento|amentos))\b/i,
  /\btransf(?:ira|iram|erir|erindo|ere)\b[^.!?\n]{0,60}(?:\b(?:valor|dinheiro|reais|quantia|saldo|conta)\b|r\$)/i
])

// Text cannot prove an action happened: only kernel evidence can.
const completionClaimPatterns = Object.freeze([
  /\b(?:foi|foram|esta|estao|ficou|ficaram|sera|serao|ja)\s+(?:\w+\s+){0,2}(?:enviad|registrad|concluid|processad|realizad|efetuad|executad|atualizad|salv|alterad|criad|aprovad|autorizad|liberad|finalizad)\w*\b/i,
  /\b(?:enviei|enviamos|registrei|registramos|conclui|concluimos|processei|processamos|realizei|efetuei|efetuamos|executei|executamos|atualizei|atualizamos|salvei|salvamos|alterei|alteramos|criei|aprovei|aprovamos|finalizei|finalizamos)\b/i,
  /\b(?:com\s+sucesso|successfully)\b/i,
  /\b(?:has|have|was|were)\s+(?:\w+\s+)?(?:sent|completed|processed|registered|updated|approved|executed)\b/i
])

const confusableCharacters: Readonly<Record<string, string>> = Object.freeze({
  А: 'A',
  а: 'a',
  В: 'B',
  в: 'b',
  С: 'C',
  с: 'c',
  Е: 'E',
  е: 'e',
  Н: 'H',
  н: 'h',
  І: 'I',
  і: 'i',
  Ј: 'J',
  ј: 'j',
  К: 'K',
  к: 'k',
  М: 'M',
  м: 'm',
  О: 'O',
  о: 'o',
  Р: 'P',
  р: 'p',
  Т: 'T',
  т: 't',
  Х: 'X',
  х: 'x',
  У: 'Y',
  у: 'y',
  Α: 'A',
  α: 'a',
  Β: 'B',
  β: 'b',
  Ε: 'E',
  ε: 'e',
  Ι: 'I',
  ι: 'i',
  Κ: 'K',
  κ: 'k',
  Μ: 'M',
  μ: 'm',
  Ν: 'N',
  ν: 'n',
  Ο: 'O',
  ο: 'o',
  Ρ: 'P',
  ρ: 'p',
  Τ: 'T',
  τ: 't',
  Χ: 'X',
  χ: 'x',
  Ϲ: 'C',
  ϲ: 'c',
  ı: 'i',
  ɑ: 'a',
  ɡ: 'g',
  ɩ: 'i',
  ʀ: 'r',
  ʋ: 'v',
  ᴄ: 'C',
  ᴅ: 'D',
  ᴇ: 'E',
  ᴍ: 'M',
  ᴏ: 'O',
  ᴘ: 'P',
  ᴛ: 'T',
  ᴜ: 'U',
  ᴠ: 'V',
  ᴡ: 'W',
  ᴢ: 'Z'
})

export function enforceControlledOutput(
  input: ControlledOutputInput
): ControlledOutputResult {
  const mode = normalizeMode(input.mode)
  const fallbackMode = safeFallbackMode(mode)

  if (!isOutputMode(input.mode)) {
    return rewritten('invalid_output', 'handoff')
  }
  if (!isRiskLevel(input.riskLevel)) {
    return rewritten('invalid_output', fallbackMode)
  }

  if (typeof input.text !== 'string' || input.text.trim().length === 0) {
    return rewritten('invalid_output', fallbackMode)
  }

  if (input.text.length > CONTROLLED_OUTPUT_MAX_CHARS) {
    return rewritten('output_too_large', fallbackMode)
  }

  const inputText = input.text.trim()
  const normalizedInput = normalizeOutputText(inputText).trim()
  const redactedText = redactSensitiveText(normalizedInput)
  const text = redactedText.trim()
  const redacted = redactedText !== normalizedInput
  if (text.length === 0) return rewritten('invalid_output', fallbackMode)
  if (text.length > CONTROLLED_OUTPUT_MAX_CHARS) {
    return rewritten('output_too_large', fallbackMode)
  }

  const kernelOwned = isKernelOwnedSafeOutput(text)
  // Raw text on purpose: redaction can swallow words next to a confusable.
  const candidates = detectionTexts(inputText)
  const matches = (patterns: readonly RegExp[]) =>
    candidates.some((candidate) =>
      patterns.some((pattern) => pattern.test(candidate))
    )

  if (!kernelOwned && matches(unsafeOutputPatterns)) {
    return rewritten('unsafe_output_rejected', fallbackMode, redacted)
  }

  if (
    !kernelOwned &&
    matches(completionClaimPatterns) &&
    !hasCompletionEvidence(input.completion)
  ) {
    return rewritten('unsafe_output_rejected', fallbackMode, redacted)
  }

  const risk = kernelOwned
    ? input.riskLevel
    : resolveEffectiveRisk(input.riskLevel, ...candidates)
  if (
    isHighRisk(risk) &&
    (!kernelOwned || mode === 'answer' || mode === 'clarify')
  ) {
    return rewritten('unsafe_output_rejected', fallbackMode, redacted)
  }

  return {
    decision: 'allowed',
    reason: redacted ? 'output_redacted' : 'output_allowed',
    mode,
    text,
    redacted
  }
}

/**
 * The strongest of the server label and what the server itself reads in the
 * given texts. These texts can only raise the label, and an unknown label
 * stays unknown so that the caller fails closed.
 */
export function resolveEffectiveRisk(
  serverLabel: unknown,
  ...assessedTexts: readonly string[]
): ControlledOutputRiskLevel | undefined {
  if (!isRiskLevel(serverLabel)) return undefined
  return assessedTexts.reduce<ControlledOutputRiskLevel>((risk, text) => {
    const assessed = assessConversationSafety(text, []).level
    return riskRank[assessed] > riskRank[risk] ? assessed : risk
  }, serverLabel)
}

function hasCompletionEvidence(
  completion: ControlledOutputInput['completion']
): boolean {
  return (
    completion !== undefined &&
    matchesKernelActionEvidence(completion.evidence, completion.expected)
  )
}

function normalizeMode(value: unknown): ControlledOutputMode {
  return isOutputMode(value) ? value : 'handoff'
}

function isOutputMode(value: unknown): value is ControlledOutputMode {
  return (
    typeof value === 'string' && outputModes.has(value as ControlledOutputMode)
  )
}

function isRiskLevel(value: unknown): value is ControlledOutputRiskLevel {
  return (
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'critical'
  )
}

function safeFallbackMode(mode: ControlledOutputMode): ControlledOutputMode {
  return mode === 'blocked' || mode === 'handoff' ? mode : 'handoff'
}

function rewritten(
  reason: Exclude<ControlledOutputReason, 'output_allowed' | 'output_redacted'>,
  mode: ControlledOutputMode,
  redacted = false
): ControlledOutputResult {
  return {
    decision: 'rewritten',
    reason,
    mode,
    text: fallbackText(mode),
    redacted
  }
}

function normalizeOutputText(text: string): string {
  return text.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu, ' ')
}

function detectionTexts(text: string): string[] {
  return ['', ' '].map((formatReplacement) =>
    text
      .normalize('NFKC')
      .replace(/\p{Cf}/gu, formatReplacement)
      .replace(/\p{Cc}/gu, ' ')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(
        /./gu,
        (character) => confusableCharacters[character] ?? character
      )
      .toLowerCase()
  )
}

function fallbackText(mode: ControlledOutputMode): string {
  switch (mode) {
    case 'blocked':
      return CONTROLLED_SAFE_OUTPUTS.blocked
    case 'clarify':
      return CONTROLLED_SAFE_OUTPUTS.clarify
    case 'handoff':
      return CONTROLLED_SAFE_OUTPUTS.handoff
    case 'answer':
      return CONTROLLED_SAFE_OUTPUTS.handoff
  }
}

function isHighRisk(value: unknown): boolean {
  return value === 'high' || value === 'critical'
}

function isKernelOwnedSafeOutput(text: string): boolean {
  return Object.values(CONTROLLED_SAFE_OUTPUTS).includes(
    text as (typeof CONTROLLED_SAFE_OUTPUTS)[keyof typeof CONTROLLED_SAFE_OUTPUTS]
  )
}
