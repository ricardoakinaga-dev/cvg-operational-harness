/** SPEC0224: opt-in complete-tool-v1. Legacy protocols do not use these fields. */
import type {
  ModelRequest,
  ModelResult,
  SideEffect,
  StopReason
} from './contracts.ts'
import type {
  ExecutionCheckpoint,
  LoopDecision,
  ModelUsage
} from './execution-v2.ts'

export const COMPLETE_TOOL_RESULT_MAX_BYTES = 32_768
export const COMPLETE_TOOL_RESULT_MAX_DEPTH = 32
export const COMPLETE_TOOL_RESULT_MAX_NODES = 10_000
export const COMPLETE_CHECKPOINT_MAX_BYTES = 8_388_608
export const COMPLETE_DECISION_SYSTEM_MAX_UNITS = 16_000
export const COMPLETE_DECISION_USER_MAX_UNITS = 32_000
export const COMPLETE_DECISION_REQUEST_MAX_BYTES = 131_072
export const COMPLETE_DECISION_OUTPUT_TOKENS = 512

export interface CompleteToolContextConfiguration {
  readonly version: 1
}

export type CompleteJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CompleteJsonValue[]
  | { readonly [key: string]: CompleteJsonValue }

export interface CompleteJsonLimits {
  readonly maxBytes?: number
  readonly maxDepth?: number
  readonly maxNodes?: number
}

export type CompleteJsonErrorCode =
  | 'INVALID_JSON'
  | 'RESULT_TOO_LARGE'
  | 'RESULT_COMPLEXITY'

export type CompleteToolObservationPayload =
  | {
      readonly schemaVersion: 1
      readonly status: 'SUCCEEDED'
      readonly sideEffect: SideEffect
      readonly completion: 'COMPLETE'
      readonly resultAvailability: 'AVAILABLE'
      readonly output: CompleteJsonValue
      readonly outputBytes: number
      readonly outputSha256: string
    }
  | {
      readonly schemaVersion: 1
      readonly status: 'SUCCEEDED'
      readonly sideEffect: SideEffect
      readonly completion: 'UNAVAILABLE'
      readonly resultAvailability: 'UNAVAILABLE'
      readonly reason: CompleteJsonErrorCode
    }
  | {
      readonly schemaVersion: 1
      readonly status: 'FAILED' | 'REJECTED'
      readonly sideEffect: SideEffect
      readonly completion: 'NOT_APPLICABLE'
      readonly resultAvailability: 'UNAVAILABLE'
      readonly error: string
    }

export type DecisionModelRequestSnapshot = Omit<ModelRequest, 'signal'> & {
  readonly maxOutputTokens: typeof COMPLETE_DECISION_OUTPUT_TOKENS
}

/** Trusted adapter contract; qualification applies only to its paired model. */
export interface DecisionInputMeasurement {
  readonly counterId: string
  readonly counterVersion: string
  readonly provider: string
  readonly model: string
  readonly formattingVersion: string
  readonly inputUpperBoundTokens: number
  readonly contextWindowTokens: number
  readonly costUpperBoundUsd: number
}

export interface DecisionInputCounter {
  measure(
    request: DecisionModelRequestSnapshot
  ): DecisionInputMeasurement | Promise<DecisionInputMeasurement>
}

export interface DecisionAdmissionRecord {
  readonly admissionId: string
  readonly tenantId: string
  readonly executionId: string
  readonly stepNumber: number
  readonly attempt: number
  readonly purpose: 'ORCHESTRATION' | 'REPAIR'
  readonly requestSha256: string
  readonly measurement: DecisionInputMeasurement
  readonly reserved: ModelUsage
  readonly status: 'RESERVED' | 'SETTLED' | 'UNKNOWN'
  readonly actual?: ModelUsage
  /** Binds idempotent settlement to the full native result, including text. */
  readonly resultSha256?: string
  readonly unknownReason?: string
}

export interface CompleteToolContextState {
  readonly version: 1
  readonly deliveredThroughStep: number
  readonly pendingDecisionAdmission: string | null
  readonly decisionAdmissions: readonly DecisionAdmissionRecord[]
  /** Accepted decision and delivery cursor checkpointed before native dispatch. */
  readonly acceptedDecision?:
    | {
        readonly stepNumber: number
        readonly decision: LoopDecision
        readonly decisionAdmissionIds: readonly string[]
      }
    | undefined
}

/** contextItems is the single selected representation, including full results. */
export interface CompleteToolModelContext {
  readonly version: 1
  readonly requiredObservationIds: readonly string[]
  /** Native settled attempts already recorded for this same decision step. */
  readonly settledDecisionAdmissionIds?: readonly string[]
}

export interface DecisionAdmissionReserveInput {
  readonly request: DecisionModelRequestSnapshot
  readonly measurement: DecisionInputMeasurement
  readonly attempt: number
}

export type DecisionAdmissionSettlement =
  | {
      readonly kind: 'RESULT'
      readonly admissionId: string
      readonly requestSha256: string
      readonly result: ModelResult
    }
  | {
      readonly kind: 'UNKNOWN'
      readonly admissionId: string
      readonly requestSha256: string
      readonly reason: string
    }

export interface DecisionAdmissionPort {
  reserve(
    input: DecisionAdmissionReserveInput
  ): Promise<DecisionAdmissionRecord>
  settle(input: DecisionAdmissionSettlement): Promise<DecisionAdmissionRecord>
}

export interface CheckpointToken {
  readonly checkpointId: string
  readonly digest: string
}

export interface CheckpointCompareAndSwapInput {
  readonly tenantId: string
  readonly executionId: string
  readonly expected: CheckpointToken | null
  readonly next: ExecutionCheckpoint
}

export type CheckpointCompareAndSwapResult =
  | { readonly status: 'APPLIED'; readonly token: CheckpointToken }
  | { readonly status: 'CONFLICT'; readonly currentToken?: CheckpointToken }

export interface CompleteCheckpointStorageState {
  readonly storageCodec: 'cvg.checkpoint-state/2'
  readonly encoding: 'base64'
  readonly decodedBytes: number
  readonly decodedSha256: string
  readonly data: string
}

export type ToolResultContextErrorCode =
  | 'RESULT_UNAVAILABLE'
  | 'CONTEXT_OVERFLOW'
  | 'ADMISSION_UNAVAILABLE'
  | 'ADMISSION_BREACH'
  | 'DECISION_USAGE_UNKNOWN'
  | 'STATE_CONFLICT'
  | 'LEGACY_RESULT_UNKNOWN'

export class ToolResultContextError extends Error {
  public constructor(
    public readonly code: ToolResultContextErrorCode,
    message: string,
    public readonly stopReason: StopReason = 'INSUFFICIENT_EVIDENCE'
  ) {
    super(message)
    this.name = 'ToolResultContextError'
  }
}
