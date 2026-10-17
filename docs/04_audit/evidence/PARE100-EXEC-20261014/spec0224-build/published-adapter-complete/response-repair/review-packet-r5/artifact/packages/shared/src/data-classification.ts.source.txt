import { z } from 'zod'

/**
 * Data classification and handling policy.
 *
 * Technical support for LGPD-aligned governance: purpose limitation,
 * minimization, retention and transmission rules per class. This is not a
 * legal compliance claim.
 */
export const DataClassificationSchema = z.enum([
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'CLINICAL',
  'FINANCIAL',
  'CREDENTIAL'
])

export type DataClassification = z.infer<typeof DataClassificationSchema>

export const LlmTransmissionSchema = z.enum([
  'EXTERNAL_MODEL_ALLOWED',
  'LOCAL_ONLY',
  'NO_MODEL'
])

export type LlmTransmission = z.infer<typeof LlmTransmissionSchema>

export const HandlingActionSchema = z.enum([
  'allow',
  'redact',
  'require_approval',
  'forbid'
])

export type HandlingAction = z.infer<typeof HandlingActionSchema>

export interface DataHandlingRule {
  classification: DataClassification
  logging: HandlingAction
  telemetry: HandlingAction
  rag: HandlingAction
  export: HandlingAction
  backup: HandlingAction
  llmTransmission: LlmTransmission
  retentionDays: number
  requiresAccessAudit: boolean
}

export const DATA_HANDLING_POLICY: Readonly<
  Record<DataClassification, DataHandlingRule>
> = Object.freeze({
  PUBLIC: {
    classification: 'PUBLIC',
    logging: 'allow',
    telemetry: 'allow',
    rag: 'allow',
    export: 'allow',
    backup: 'allow',
    llmTransmission: 'EXTERNAL_MODEL_ALLOWED',
    retentionDays: 365,
    requiresAccessAudit: false
  },
  INTERNAL: {
    classification: 'INTERNAL',
    logging: 'allow',
    telemetry: 'allow',
    rag: 'require_approval',
    export: 'require_approval',
    backup: 'allow',
    llmTransmission: 'EXTERNAL_MODEL_ALLOWED',
    retentionDays: 365,
    requiresAccessAudit: false
  },
  CONFIDENTIAL: {
    classification: 'CONFIDENTIAL',
    logging: 'redact',
    telemetry: 'redact',
    rag: 'require_approval',
    export: 'require_approval',
    backup: 'allow',
    llmTransmission: 'LOCAL_ONLY',
    retentionDays: 180,
    requiresAccessAudit: true
  },
  CLINICAL: {
    classification: 'CLINICAL',
    logging: 'forbid',
    telemetry: 'forbid',
    rag: 'require_approval',
    export: 'require_approval',
    backup: 'allow',
    llmTransmission: 'NO_MODEL',
    retentionDays: 730,
    requiresAccessAudit: true
  },
  FINANCIAL: {
    classification: 'FINANCIAL',
    logging: 'redact',
    telemetry: 'forbid',
    rag: 'forbid',
    export: 'require_approval',
    backup: 'allow',
    llmTransmission: 'NO_MODEL',
    retentionDays: 1825,
    requiresAccessAudit: true
  },
  CREDENTIAL: {
    classification: 'CREDENTIAL',
    logging: 'forbid',
    telemetry: 'forbid',
    rag: 'forbid',
    export: 'forbid',
    backup: 'forbid',
    llmTransmission: 'NO_MODEL',
    retentionDays: 0,
    requiresAccessAudit: true
  }
})

export function handlingRuleFor(
  classification: DataClassification
): DataHandlingRule {
  return DATA_HANDLING_POLICY[classification]
}

export function mayTransmitToExternalModel(
  classification: DataClassification
): boolean {
  return (
    handlingRuleFor(classification).llmTransmission === 'EXTERNAL_MODEL_ALLOWED'
  )
}

export function mayTransmitToLocalModel(
  classification: DataClassification
): boolean {
  const transmission = handlingRuleFor(classification).llmTransmission
  return (
    transmission === 'EXTERNAL_MODEL_ALLOWED' || transmission === 'LOCAL_ONLY'
  )
}

export function mayTransmitToModel(
  classification: DataClassification,
  modelLocation: 'external' | 'local'
): boolean {
  return modelLocation === 'external'
    ? mayTransmitToExternalModel(classification)
    : mayTransmitToLocalModel(classification)
}

export function requiresRedaction(classification: DataClassification): boolean {
  return handlingRuleFor(classification).logging !== 'allow'
}

export function retentionDaysFor(classification: DataClassification): number {
  return handlingRuleFor(classification).retentionDays
}

/**
 * Highest-risk class in a set; used to select the strictest handling rule when
 * data of multiple classes flows through one operation.
 */
export function strictestClassification(
  classifications: readonly DataClassification[]
): DataClassification {
  const order: DataClassification[] = [
    'PUBLIC',
    'INTERNAL',
    'CONFIDENTIAL',
    'CLINICAL',
    'FINANCIAL',
    'CREDENTIAL'
  ]
  let selected: DataClassification = 'PUBLIC'
  for (const classification of classifications) {
    if (order.indexOf(classification) > order.indexOf(selected)) {
      selected = classification
    }
  }
  return selected
}
