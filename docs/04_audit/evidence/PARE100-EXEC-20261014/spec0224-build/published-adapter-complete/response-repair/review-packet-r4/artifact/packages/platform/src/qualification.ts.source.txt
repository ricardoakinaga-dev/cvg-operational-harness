import { DomainError } from '@cvg/shared'

export interface ControlledQualificationInput {
  persistenceLatenciesMs: number[]
  responseLatenciesMs: number[]
  lostMessages: number
  duplicateEffects: number
  gates: Record<string, boolean>
  targets?: { persistenceP95Ms?: number; responseP95Ms?: number }
  conditions?: string
}

export interface ControlledQualificationResult {
  status: 'QUALIFIED_CONTROLLED' | 'NO_GO'
  metrics: {
    persistenceP95Ms: number
    responseP95Ms: number
    persistenceSampleCount: number
    responseSampleCount: number
    lostMessages: number
    duplicateEffects: number
  }
  failedGates: string[]
  productionBoundary: 'NO-GO'
  conditions: string
}

/** Converts measured local evidence into a conservative, auditable verdict. */
export function runControlledQualification(
  input: ControlledQualificationInput
): ControlledQualificationResult {
  validateSamples(input.persistenceLatenciesMs, 'persistenceLatenciesMs')
  validateSamples(input.responseLatenciesMs, 'responseLatenciesMs')
  validateCounter(input.lostMessages, 'lostMessages')
  validateCounter(input.duplicateEffects, 'duplicateEffects')
  const gateNames = Object.keys(input.gates)
  if (gateNames.length === 0) {
    throw new DomainError(
      'validation_failed',
      'At least one named qualification gate is required'
    )
  }
  for (const [name, passed] of Object.entries(input.gates)) {
    if (
      !/^[a-z][a-z0-9_.:-]{1,80}$/.test(name) ||
      typeof passed !== 'boolean'
    ) {
      throw new DomainError(
        'validation_failed',
        'Qualification gates are invalid'
      )
    }
  }
  const persistenceP95Ms = percentile(input.persistenceLatenciesMs, 0.95)
  const responseP95Ms = percentile(input.responseLatenciesMs, 0.95)
  const persistenceTarget = boundedTarget(
    input.targets?.persistenceP95Ms ?? 2_000,
    2_000,
    'persistenceP95Ms'
  )
  const responseTarget = boundedTarget(
    input.targets?.responseP95Ms ?? 10_000,
    10_000,
    'responseP95Ms'
  )
  const failedGates = Object.entries(input.gates)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name)
  if (persistenceP95Ms > persistenceTarget) failedGates.push('persistence_p95')
  if (responseP95Ms > responseTarget) failedGates.push('response_p95')
  if (input.lostMessages !== 0) failedGates.push('zero_loss')
  if (input.duplicateEffects !== 0) failedGates.push('zero_duplicate_effect')
  return {
    status: failedGates.length === 0 ? 'QUALIFIED_CONTROLLED' : 'NO_GO',
    metrics: {
      persistenceP95Ms,
      responseP95Ms,
      persistenceSampleCount: input.persistenceLatenciesMs.length,
      responseSampleCount: input.responseLatenciesMs.length,
      lostMessages: input.lostMessages,
      duplicateEffects: input.duplicateEffects
    },
    failedGates: [...new Set(failedGates)],
    productionBoundary: 'NO-GO',
    conditions:
      input.conditions?.trim() ||
      'Fixtures sintéticas; perfil, duração e ambiente devem ser registrados antes da decisão.'
  }
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * ratio) - 1
  )
  return sorted[index]!
}

function validateSamples(values: number[], field: string): void {
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.length > 100_000
  ) {
    throw new DomainError(
      'validation_failed',
      `${field} must contain 1-100000 samples`
    )
  }
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new DomainError(
      'validation_failed',
      `${field} contains an invalid sample`
    )
  }
}

function validateCounter(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(
      'validation_failed',
      `${field} must be a non-negative integer`
    )
  }
}

function boundedTarget(value: number, maximum: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > maximum) {
    throw new DomainError(
      'validation_failed',
      `${field} must be between 1 and ${maximum}ms`
    )
  }
  return value
}
