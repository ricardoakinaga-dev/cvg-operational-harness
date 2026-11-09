import {
  auditEvidenceGovernance,
  createCorrelationId,
  DomainError,
  ok,
  sanitizeAuditEvidencePayload
} from '@cvg/shared'
import {
  type AuditEventType,
  type AuditEvidenceFilters,
  type AuditEvidenceQuery,
  API_CREATION_KEY_PATTERN,
  type PageInfo
} from '@cvg/persistence'
import { z } from 'zod'
import {
  classifyPaginationOffset,
  PAGINATION_OFFSET_ERROR_MESSAGE
} from './pagination-boundary.ts'
import { classifyAuditFilterValue } from './audit-filter-duplicate-boundary.ts'

/**
 * SPEC 0257 §2: the single `Idempotency-Key` header. Occurrences are counted in
 * the raw headers (case-insensitive); duplicates, commas, spaces, a missing
 * header or a value outside 8-200 `[A-Za-z0-9._:-]` are `validation_failed`.
 */
export function readCreationKey(rawHeaders: readonly string[]): string {
  const values: string[] = []
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === 'idempotency-key') {
      values.push(rawHeaders[index + 1] ?? '')
    }
  }
  const [value] = values
  if (
    values.length !== 1 ||
    value === undefined ||
    !API_CREATION_KEY_PATTERN.test(value)
  ) {
    throw new DomainError(
      'validation_failed',
      'A single valid Idempotency-Key header is required'
    )
  }
  return value
}

export function statusCodeForError(code: string): number {
  if (code === 'unauthorized') return 401
  if (code === 'forbidden') return 403
  if (code === 'conflict') return 409
  if (code === 'rate_limited') return 429
  if (code === 'payload_too_large') return 413
  if (code === 'unsupported_media_type') return 415
  if (code === 'not_found') return 404
  if (code === 'request_uri_too_long') return 414
  if (code === 'configuration_error') return 503
  if (code === 'internal_error') return 500
  return 400
}

export function sanitizeAuditEvidencePage(page: {
  items: Array<{ payload: unknown }>
  pageInfo: unknown
}) {
  const redactedFields = new Set<string>()
  const items = page.items.map((event) => {
    const sanitized = sanitizeAuditEvidencePayload(event.payload)
    sanitized.redactedFields.forEach((field) => redactedFields.add(field))
    return { ...event, payload: sanitized.payload }
  })

  return {
    page: { ...page, items },
    governance: {
      ...auditEvidenceGovernance,
      payload: {
        ...auditEvidenceGovernance.payload,
        redactedFields: Array.from(redactedFields)
      }
    }
  }
}

/**
 * SPEC0250 §3.4 — `limit`/`offset` reuse the conversation bounds; `status`
 * is one comma-separated list of distinct values of the resource enum.
 * Repeated parameters arrive as arrays and are rejected.
 */
export function parseStatusPageQuery<S extends string>(
  query: unknown,
  allowed: readonly S[]
): { limit: number; offset: number; statuses?: S[] } {
  const pagination = parsePagination(query)
  if (!pagination) {
    throw new DomainError(
      'invalid_pagination',
      `limit must be between 1 and 100 and ${PAGINATION_OFFSET_ERROR_MESSAGE}`
    )
  }
  const raw = (query as { status?: unknown } | undefined)?.status
  if (raw === undefined) return pagination
  const values = typeof raw === 'string' ? raw.split(',') : null
  if (
    !values ||
    new Set(values).size !== values.length ||
    values.some((value) => !(allowed as readonly string[]).includes(value))
  ) {
    throw new DomainError(
      'validation_failed',
      `status must be a comma-separated list of distinct values among ${allowed.join(', ')}`
    )
  }
  return { ...pagination, statuses: values as S[] }
}

export function okPage<T>(
  page: { items: T[]; pageInfo: PageInfo },
  correlationId: ReturnType<typeof createCorrelationId>
) {
  const envelope = ok(page.items, correlationId)
  return { ...envelope, meta: { ...envelope.meta, pageInfo: page.pageInfo } }
}

export function parsePagination(
  query: unknown
): { limit: number; offset: number } | null {
  const params = query as { limit?: unknown; offset?: unknown }
  const limit = params.limit === undefined ? 25 : Number(params.limit)
  const rawOffset = params.offset === undefined ? 0 : params.offset
  const offsetFailure = classifyPaginationOffset(rawOffset)

  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || offsetFailure) {
    return null
  }

  const offset = Number(rawOffset)
  return { limit, offset }
}

export function parseTraceLimit(query: unknown): number {
  const parsed = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(25)
    })
    .strict()
    .safeParse(query)
  if (!parsed.success) {
    throw new DomainError(
      'invalid_pagination',
      'limit must be between 1 and 100'
    )
  }
  return parsed.data.limit
}

export const auditEventTypes: AuditEventType[] = [
  'tool_call',
  'safety_event',
  'integration_event',
  'policy_decision',
  'approval_decision',
  'handoff'
]

export function parseAuditEvidenceQuery(query: unknown): {
  query: AuditEvidenceQuery
  filters: AuditEvidenceFilters
} {
  const pagination = parsePagination(query)
  if (!pagination) {
    throw new DomainError(
      'invalid_pagination',
      `limit must be between 1 and 100 and ${PAGINATION_OFFSET_ERROR_MESSAGE}`
    )
  }
  const params = query as Record<string, unknown>
  const filters: AuditEvidenceFilters = {}
  const sessionId = parseOptionalAuditFilter(params.sessionId)
  const correlationId = parseOptionalAuditFilter(params.correlationId)
  const actorId = parseOptionalAuditFilter(params.actorId)
  const type = parseOptionalAuditFilter(params.type)

  if (sessionId) filters.sessionId = sessionId
  if (correlationId) filters.correlationId = correlationId
  if (actorId) filters.actorId = actorId
  if (type) {
    if (!auditEventTypes.includes(type as AuditEventType)) {
      throw new DomainError('validation_failed', 'Audit event type is invalid')
    }
    filters.type = type as AuditEventType
  }

  return { query: { ...pagination, ...filters }, filters }
}

export function parseOptionalAuditFilter(value: unknown): string | undefined {
  if (value === undefined) return undefined
  const duplicateFailure = classifyAuditFilterValue(value)
  if (duplicateFailure) {
    throw new DomainError(duplicateFailure.code, duplicateFailure.message)
  }
  if (typeof value !== 'string') {
    throw new DomainError(
      'validation_failed',
      'Audit evidence filters must be strings'
    )
  }
  const trimmed = value.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > 120 ||
    !/^[A-Za-z0-9._:-]+$/.test(trimmed)
  ) {
    throw new DomainError(
      'validation_failed',
      'Audit evidence filter is invalid'
    )
  }
  return trimmed
}

export function readIdempotencyKey(headers: Record<string, unknown>): string {
  const raw = headers['idempotency-key'] ?? headers['x-idempotency-key']
  const candidate = Array.isArray(raw) ? raw[0] : raw
  const parsed = z
    .string()
    .trim()
    .min(8)
    .max(200)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .safeParse(candidate)
  if (!parsed.success) {
    throw new DomainError(
      'validation_failed',
      'Idempotency-Key is required and invalid'
    )
  }
  return parsed.data
}
