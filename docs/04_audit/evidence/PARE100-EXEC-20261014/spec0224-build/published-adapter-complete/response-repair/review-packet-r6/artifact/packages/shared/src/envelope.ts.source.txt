import type { CorrelationId } from './ids.ts'

export interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
  meta: { correlationId: CorrelationId }
}

export function ok<T>(data: T, correlationId: CorrelationId): ApiEnvelope<T> {
  return { success: true, data, error: null, meta: { correlationId } }
}

export function fail(
  code: string,
  message: string,
  correlationId: CorrelationId
): ApiEnvelope<never> {
  return {
    success: false,
    data: null,
    error: { code, message },
    meta: { correlationId }
  }
}
