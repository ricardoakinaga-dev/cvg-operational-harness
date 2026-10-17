import type { FailureCase, FailureSnapshot } from './failure-case.mjs'
export interface FailureMeasurement {
  status: 'MEASURED_NATIVE_FAILURE_CONTRACTS'
  fullParity: 'NOT_VERIFIED'
  commonObservedFacts: {
    modelCalls: number
    toolCalls: number
    persistedAssistantMessages: number
  }
  injectedError: FailureSnapshot
  nativeFields: Record<string, { reference: unknown; cvg: unknown }>
  differences: string[]
  limits: string[]
}
export function measureModelFailureContracts(
  reference: unknown,
  cvg: unknown,
  fixture: FailureCase
): FailureMeasurement
