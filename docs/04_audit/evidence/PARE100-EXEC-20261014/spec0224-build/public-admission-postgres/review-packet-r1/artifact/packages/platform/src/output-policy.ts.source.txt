import { redactSensitiveText } from '@cvg/shared'

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
  riskLevel: unknown
}

export interface ControlledOutputResult {
  decision: ControlledOutputDecision
  reason: ControlledOutputReason
  mode: ControlledOutputMode
  text: string
  redacted: boolean
}

const outputModes = new Set<ControlledOutputMode>([
  'answer',
  'clarify',
  'handoff',
  'blocked'
])

const appointmentActionPattern =
  '(?:agend(?:a|e|ar|ando|ada|ado|amento|amentos)|marc(?:a|e|ar|ando|ada|ado|agem|agens)|marqu(?:e|em|ar|ada|ado)|confirm(?:a|e|ar|ando|ada|ado|acao|acoes)|cancel(?:a|e|ar|ando|ada|ado|amento|amentos)|reagend(?:a|e|ar|ando|ada|ado|amento|amentos)|remarc(?:a|e|ar|ando|ada|ado|agem|agens)|remarqu(?:e|em|ar|ada|ado))'
const appointmentTargetPattern =
  '(?:consulta(?:s)?|agendamento(?:s)?|appointment(?:s)?)'

const unsafeOutputPatterns = Object.freeze([
  /\bdiagnostic(?:o|a|ar|ada|ado|os|as)?\b/i,
  /\bdiagnos(?:is|es)\b/i,
  /\bprescri(?:cao|coes)\b/i,
  /\bprescrit[oa]s?\b/i,
  /\bprescrev(?:er|a|e|o|am|em)?\b/i,
  /\bprescrib(?:e|ed|ing)?\b/i,
  /\b(?:dose|doses|dosagem)\b/i,
  /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|ug|ml|g|kg|ui|%)\b/i,
  /\b(?:medicamento(?:s)?|medicacao(?:es)?|remedio(?:s)?|dipirona|ibuprofeno|paracetamol|antibiotico(?:s)?|medicine(?:s)?|drug(?:s)?)\b/i,
  /\b(?:tratamento(?:s)?|treatment(?:s)?)\b/i,
  /\b(?:prontuario(?:s)?|medical\s+record(?:s)?)\b/i,
  new RegExp(
    `\\b${appointmentActionPattern}\\b[\\s\\S]{0,100}\\b${appointmentTargetPattern}\\b`,
    'i'
  ),
  new RegExp(
    `\\b${appointmentTargetPattern}\\b[\\s\\S]{0,100}\\b${appointmentActionPattern}\\b`,
    'i'
  ),
  /\b(?:pagamento(?:s)?|cobranca(?:s)?|payment(?:s)?|charge(?:s)?)\b/i
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
  const detectionInput = redactSensitiveText(inputText)
  const normalizedInput = normalizeOutputText(inputText).trim()
  const redactedText = redactSensitiveText(normalizedInput)
  const text = redactedText.trim()
  const redacted = redactedText !== normalizedInput
  if (text.length === 0) return rewritten('invalid_output', fallbackMode)
  if (text.length > CONTROLLED_OUTPUT_MAX_CHARS) {
    return rewritten('output_too_large', fallbackMode)
  }

  if (
    detectionTexts(detectionInput).some((candidate) =>
      unsafeOutputPatterns.some((pattern) => pattern.test(candidate))
    ) &&
    !isKernelOwnedSafeOutput(text)
  ) {
    return rewritten('unsafe_output_rejected', fallbackMode, redacted)
  }

  if (isHighRisk(input.riskLevel) && mode === 'answer') {
    return rewritten('unsafe_output_rejected', 'handoff', redacted)
  }

  return {
    decision: 'allowed',
    reason: redacted ? 'output_redacted' : 'output_allowed',
    mode,
    text,
    redacted
  }
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
