export const auditEvidenceGovernance = {
  retention: {
    policyId: 'controlled-construction-audit-retention-v1',
    mode: 'controlled_construction',
    defaultRetentionDays: 30,
    auditEvidenceRetentionDays: 180,
    approvedForRealData: false,
    humanSignoffRequired: true
  },
  payload: {
    mode: 'minimized',
    rawPayloadReturned: false
  },
  export: {
    externalDispatch: false,
    externalExportRequiresApproval: true
  }
} as const

export interface SanitizedAuditEvidencePayload {
  payload: unknown
  redactedFields: string[]
}

export const REDACTED_OUTBOX_ERROR = '[redacted-outbox-error]'

/**
 * Durable error columns are operational metadata, never an error-message
 * transport. Preserve only a bounded machine code when one is explicitly
 * supplied; arbitrary Error messages are replaced with a fixed marker.
 */
export function sanitizeOutboxError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[a-z][a-z0-9_]{0,63}$/.test(error.code)
  ) {
    return `outbox_error:${error.code}`
  }
  return REDACTED_OUTBOX_ERROR
}

const sensitivePayloadKeys = new Set([
  'authorization',
  'body',
  'clinicalnote',
  'clinicalnotes',
  'diagnosis',
  'email',
  'externalmessageid',
  'address',
  'cpf',
  'cnpj',
  'document',
  'documentid',
  'dateofbirth',
  'birthdate',
  'medicalrecord',
  'password',
  'patientname',
  'phone',
  'prescription',
  'rg',
  'secret',
  'senderref',
  'symptoms',
  'taxid',
  'token'
])

const sensitivePayloadFragments = [
  'address',
  'authorization',
  'birthdate',
  'body',
  'clinicalnote',
  'cnpj',
  'cpf',
  'dateofbirth',
  'diagnosis',
  'document',
  'email',
  'externalmessageid',
  'medicalrecord',
  'patientname',
  'password',
  'phone',
  'prescription',
  'taxid',
  'secret',
  'senderref',
  'symptom',
  'token'
]

const outboxFieldRedactions = new Map<string, string>([
  ['address', '[redacted-address]'],
  ['cnpj', '[redacted-cnpj]'],
  ['cpf', '[redacted-cpf]'],
  ['dateofbirth', '[redacted-birth-date]'],
  ['diagnosis', '[redacted-diagnosis]'],
  ['document', '[redacted-document]'],
  ['documentid', '[redacted-document]'],
  ['email', '[redacted-email]'],
  ['medicalrecord', '[redacted-medical-record]'],
  ['name', '[redacted-name]'],
  ['patientname', '[redacted-name]'],
  ['phone', '[redacted-phone]'],
  ['prescription', '[redacted-prescription]'],
  ['symptoms', '[redacted-symptoms]']
])

const outboxSecretFragments = [
  'accesskey',
  'accesstoken',
  'apikey',
  'authorization',
  'clientsecret',
  'credential',
  'password',
  'privatekey',
  'secret',
  'token'
]

const outboxSafeStringKeys = new Set([
  'agentid',
  'agentversionid',
  'channel',
  'conversationid',
  'correlationid',
  'eventid',
  'eventtype',
  'inboundmessageid',
  'messageid',
  'policy',
  'sessionid',
  'tenantid',
  'type'
])

const outboxOpaqueTextKeys = new Set([
  'content',
  'description',
  'error',
  'message',
  'prompt',
  'query',
  'reason',
  'response',
  'summary',
  'text'
])

export function sanitizeAuditEvidencePayload(
  payload: unknown
): SanitizedAuditEvidencePayload {
  const result = sanitizeValue(payload, '')
  return {
    payload: result.value,
    redactedFields: result.redactedFields
  }
}

/**
 * Sanitizes durable queue envelopes while preserving their shape for a
 * controlled consumer. Audit evidence intentionally drops sensitive fields;
 * an outbox envelope instead keeps stable keys as explicit placeholders so a
 * worker can correlate the event by id without persisting raw inbound content.
 */
export function sanitizeOutboxPayload(
  payload: unknown
): SanitizedAuditEvidencePayload {
  const result = sanitizeOutboxValue(payload, '')
  return {
    payload: result.value,
    redactedFields: result.redactedFields
  }
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(
      /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s@]*)@/gi,
      '$1[redacted-credentials]@'
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[redacted-cpf]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[redacted-cnpj]')
    .replace(
      /\b(?:rua|r\.?|avenida|av\.?|alameda|travessa|tv\.?|rodovia)\s+[^,.;\n]+(?:,\s*\d+)?/gi,
      '[redacted-address]'
    )
    .replace(
      /\b(?:meu nome [eé]|me chamo|nome completo [eé])\s+[^,.;!?\n]+/gi,
      (match) => `${match.split(/\s+/).slice(0, 3).join(' ')} [redacted-name]`
    )
    .replace(
      /\b(?:nascido|nascida|data de nascimento)\s*(?:e|é|em|:)?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/gi,
      '[redacted-birth-date]'
    )
    .replace(
      /(?<![A-Za-z0-9_-])\+?\d[\d\s().-]{7,}\d(?![A-Za-z0-9_-])/g,
      (match) => {
        const uuidLike =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            match
          )
        return uuidLike ? match : '[redacted-phone]'
      }
    )
    .replace(
      /\b(?:authorization|api[_-]?key|access[_-]?token|client[_-]?secret|credential|password|private[_-]?key|token|secret)\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi,
      '[redacted-secret]'
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted-secret]')
}

function sanitizeValue(
  value: unknown,
  path: string
): { value: unknown; redactedFields: string[] } {
  if (Array.isArray(value)) {
    return value.reduce<{ value: unknown[]; redactedFields: string[] }>(
      (result, item, index) => {
        const sanitized = sanitizeValue(item, joinPath(path, String(index)))
        return {
          value: [...result.value, sanitized.value],
          redactedFields: [
            ...result.redactedFields,
            ...sanitized.redactedFields
          ]
        }
      },
      { value: [], redactedFields: [] }
    )
  }

  if (typeof value === 'string') {
    const sanitized = redactSensitiveText(value)
    return {
      value: sanitized,
      redactedFields: sanitized === value && path ? [] : path ? [path] : []
    }
  }

  if (typeof value !== 'object' || value === null) {
    return { value, redactedFields: [] }
  }

  return Object.entries(value).reduce<{
    value: Record<string, unknown>
    redactedFields: string[]
  }>(
    (result, [key, child]) => {
      const childPath = joinPath(path, key)
      if (isSensitivePayloadKey(key)) {
        return {
          value: result.value,
          redactedFields: [...result.redactedFields, childPath]
        }
      }

      const sanitized = sanitizeValue(child, childPath)
      return {
        value: { ...result.value, [key]: sanitized.value },
        redactedFields: [...result.redactedFields, ...sanitized.redactedFields]
      }
    },
    { value: {}, redactedFields: [] }
  )
}

function sanitizeOutboxValue(
  value: unknown,
  path: string
): { value: unknown; redactedFields: string[] } {
  if (Array.isArray(value)) {
    return value.reduce<{ value: unknown[]; redactedFields: string[] }>(
      (result, item, index) => {
        const sanitized = sanitizeOutboxValue(
          item,
          joinPath(path, String(index))
        )
        return {
          value: [...result.value, sanitized.value],
          redactedFields: [
            ...result.redactedFields,
            ...sanitized.redactedFields
          ]
        }
      },
      { value: [], redactedFields: [] }
    )
  }

  if (typeof value === 'string') {
    const key =
      path
        .split('.')
        .at(-1)
        ?.toLowerCase()
        .replace(/[^a-z0-9]/g, '') ?? ''
    const sanitized = isSafeOutboxString(key, value)
      ? value
      : '[redacted-outbox-text]'
    return {
      value: sanitized,
      redactedFields: sanitized === value && path ? [] : path ? [path] : []
    }
  }

  if (typeof value === 'number') {
    return {
      value: '[redacted-outbox-number]',
      redactedFields: path ? [path] : []
    }
  }

  if (typeof value !== 'object' || value === null) {
    return { value, redactedFields: [] }
  }

  return Object.entries(value).reduce<{
    value: Record<string, unknown>
    redactedFields: string[]
  }>(
    (result, [key, child]) => {
      const childPath = joinPath(path, key)
      const replacement = outboxReplacementForKey(key, child)
      if (replacement) {
        return {
          value: { ...result.value, [key]: replacement },
          redactedFields: [...result.redactedFields, childPath]
        }
      }

      const sanitized = sanitizeOutboxValue(child, childPath)
      return {
        value: { ...result.value, [key]: sanitized.value },
        redactedFields: [...result.redactedFields, ...sanitized.redactedFields]
      }
    },
    { value: {}, redactedFields: [] }
  )
}

function outboxReplacementForKey(key: string, value: unknown): string | null {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (outboxSecretFragments.some((fragment) => normalized.includes(fragment))) {
    return '[redacted-secret]'
  }
  if (normalized.includes('body')) {
    return '[redacted-outbox-body]'
  }
  if (normalized.includes('externalmessageid')) {
    return '[redacted-external-message-id]'
  }
  if (normalized.includes('senderref')) {
    return '[redacted-sender-ref]'
  }
  const direct = outboxFieldRedactions.get(normalized)
  if (direct) return direct
  if (outboxOpaqueTextKeys.has(normalized)) {
    return '[redacted-outbox-text]'
  }
  if (normalized.includes('address')) return '[redacted-address]'
  if (normalized.includes('birth')) return '[redacted-birth-date]'
  if (normalized.includes('email')) return '[redacted-email]'
  if (normalized.includes('name')) return '[redacted-name]'
  if (normalized.includes('phone')) return '[redacted-phone]'
  if (normalized.includes('senderref')) return '[redacted-sender-ref]'
  if (typeof value === 'string' && !isSafeOutboxString(normalized, value)) {
    return '[redacted-outbox-text]'
  }
  return null
}

function isSafeOutboxString(key: string, value: string): boolean {
  if (!outboxSafeStringKeys.has(key)) return false
  if (key === 'channel') return /^(?:internal|web|whatsapp)$/.test(value)
  if (key === 'policy') return /^outbox-r[0-9]{1,3}$/.test(value)
  if (key === 'type' || key === 'eventtype') {
    return /^[a-z][a-z0-9_.:-]{1,127}$/.test(value)
  }
  if (key === 'correlationid') return /^corr_[0-9a-f-]{36}$/.test(value)
  if (key === 'tenantid') return /^tenant_[0-9a-f-]{36}$/.test(value)
  if (key === 'agentid') return /^agent_[0-9a-f-]{36}$/.test(value)
  if (key === 'agentversionid') {
    return /^agent_version_[0-9a-f-]{36}$/.test(value)
  }
  if (key === 'conversationid') return /^conv_[0-9a-f-]{36}$/.test(value)
  if (key === 'sessionid') return /^sess_[0-9a-f-]{36}$/.test(value)
  if (key === 'inboundmessageid' || key === 'messageid') {
    return /^[a-z][a-z0-9]*_[0-9a-f-]{36}$/.test(value)
  }
  if (key === 'eventid') {
    return /^[a-z][a-z0-9]*_[0-9a-f-]{36}$/.test(value)
  }
  return false
}

function joinPath(parent: string, child: string): string {
  return parent ? `${parent}.${child}` : child
}

function isSensitivePayloadKey(key: string): boolean {
  const normalized = key.toLowerCase()
  return (
    sensitivePayloadKeys.has(normalized) ||
    sensitivePayloadFragments.some((fragment) => normalized.includes(fragment))
  )
}
