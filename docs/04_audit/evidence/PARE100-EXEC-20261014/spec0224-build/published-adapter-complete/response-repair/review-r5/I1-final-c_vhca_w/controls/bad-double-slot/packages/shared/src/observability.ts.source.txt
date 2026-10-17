import { createCorrelationId, type CorrelationId } from './ids.ts'

export interface Correlated {
  correlationId: CorrelationId
}

export function withCorrelation<T extends object>(
  value: T,
  correlationId: CorrelationId = createCorrelationId()
): T & Correlated {
  return { ...value, correlationId }
}
