import type {
  ExecutionCheckpoint,
  ExecutionStep,
  LoopDecision,
  Observation,
  ToolDefinition
} from '@cvg/harness-contracts'
import { ToolResultContextError } from '@cvg/harness-contracts'
import type { LoopRun } from './iterative-runtime.ts'
import {
  assertCompleteToolObservation,
  completeSnapshot,
  completeToolPayload,
  retainCompleteObservations
} from './complete-tool-results.ts'
import { decisionSignature } from './loop-detection.ts'

interface RecoveryCandidate {
  readonly step: ExecutionStep
  readonly pending: LoopDecision
  readonly tool: Pick<ToolDefinition, 'id' | 'version' | 'sideEffect'>
  readonly operationKey: string
}

const iso = (value: unknown): value is string =>
  typeof value === 'string' &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value

/** Internal, pure eligibility check. It never grants a dispatch or journal write. */
export function settledRecoveryCandidate(
  run: LoopRun,
  checkpoint: ExecutionCheckpoint,
  steps: readonly ExecutionStep[],
  tool: ToolDefinition | undefined
): RecoveryCandidate | null {
  const p = checkpoint.state.pendingStepNumber
  const pending = checkpoint.state.pendingDecision
  const context = checkpoint.state.toolResultContext
  const accepted = context?.acceptedDecision
  if (
    checkpoint.checkpointVersion !== 2 ||
    !Number.isSafeInteger(p) ||
    !p ||
    p !== checkpoint.state.stepNumber + 1 ||
    run.state.stopReason ||
    !pending ||
    !['CALL_TOOL', 'REQUEST_APPROVAL'].includes(pending.decisionType) ||
    !tool ||
    pending.toolId !== tool.id ||
    pending.toolVersion !== tool.version ||
    !context ||
    context.pendingDecisionAdmission !== null ||
    context.decisionAdmissions.some(
      (receipt) =>
        receipt.status === 'UNKNOWN' ||
        receipt.status === 'RESERVED' ||
        receipt.stepNumber > p!
    ) ||
    !accepted ||
    accepted.stepNumber !== p ||
    completeSnapshot(accepted.decision) !== completeSnapshot(pending) ||
    run.countedSteps.has(p)
  )
    return null
  const ids = accepted.decisionAdmissionIds
  const receipts = context.decisionAdmissions.filter(
    (receipt) => receipt.stepNumber === p
  )
  if (
    !Array.isArray(ids) ||
    new Set(ids).size !== ids.length ||
    ids.length !== receipts.length ||
    receipts.some(
      (receipt) =>
        receipt.status !== 'SETTLED' ||
        receipt.tenantId !== run.input.tenantId ||
        receipt.executionId !== run.executionId ||
        !['ORCHESTRATION', 'REPAIR'].includes(receipt.purpose) ||
        !ids.includes(receipt.admissionId)
    )
  )
    return null
  const matching = steps.filter(
    (step) =>
      step.tenantId === run.input.tenantId &&
      step.executionId === run.executionId &&
      step.stepNumber === p &&
      step.stepType === 'TOOL'
  )
  if (matching.length !== 1) return null
  const step = matching[0]!
  if (
    step.status !== 'SUCCEEDED' ||
    step.attempt !== 1 ||
    step.sideEffecting !== true ||
    step.stepId !== `step_${run.executionId}_${p}_tool` ||
    step.decisionType !== pending.decisionType ||
    step.reasonCode !== pending.reasonCode ||
    !iso(step.startedAt) ||
    !iso(step.completedAt) ||
    Date.parse(step.completedAt) < Date.parse(step.startedAt) ||
    !Array.isArray(step.observationRefs) ||
    step.observationRefs.length !== 1
  )
    return null
  const ref = step.observationRefs[0]
  if (
    typeof ref !== 'string' ||
    !ref.length ||
    ref.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(ref) ||
    run.observations.some(
      (o) =>
        o.observationId === ref ||
        (o.type === 'TOOL_RESULT' && o.stepNumber === p)
    )
  )
    return null
  return {
    step: { ...step, observationRefs: [ref] },
    pending: JSON.parse(completeSnapshot(pending)) as LoopDecision,
    tool: { id: tool.id, version: tool.version, sideEffect: tool.sideEffect },
    operationKey: `${run.executionId}:s${p}:${tool.id}`
  }
}

/** A checkpoint projection only; caller must commit its CAS before adopting it. */
export function stageSettledRecovery(
  run: LoopRun,
  candidate: RecoveryCandidate,
  output: unknown,
  maxSignatures: number
): LoopRun {
  const { step, pending, tool, operationKey } = candidate
  if (
    !Number.isSafeInteger(run.usage.steps) ||
    run.usage.steps < 0 ||
    !Number.isSafeInteger(run.usage.steps + 1) ||
    run.countedSteps.has(step.stepNumber)
  )
    throw new ToolResultContextError(
      'STATE_CONFLICT',
      'Recovery step counter is not trustworthy.',
      'STATE_CONFLICT'
    )
  const observation: Observation = {
    observationId: step.observationRefs[0]!,
    executionId: run.executionId,
    stepId: step.stepId,
    stepNumber: step.stepNumber,
    type: 'TOOL_RESULT',
    source: 'TOOL',
    trust: 'UNTRUSTED',
    payload: completeToolPayload(output, tool.sideEffect),
    summary: 'Tool result captured for governed context.',
    provenance: {
      sourceId: tool.id,
      sourceVersion: tool.version,
      operationKey,
      effectRef: operationKey
    },
    timestamp: step.completedAt!
  }
  assertCompleteToolObservation(observation)
  const observations = retainCompleteObservations([
    ...run.observations,
    observation
  ])
  return {
    ...run,
    observations,
    usage: { ...run.usage, steps: run.usage.steps + 1 },
    countedSteps: new Set([...run.countedSteps, step.stepNumber]),
    stepNumber: step.stepNumber,
    inFlightCounted: false,
    lastToolObservation: observation,
    lastDecision: null,
    state: {
      ...run.state,
      observations,
      stepNumber: step.stepNumber,
      pendingDecision: undefined,
      pendingStepNumber: undefined,
      pendingApprovalId: undefined,
      selectedCapability: tool.id,
      loopSignatures: [
        ...run.state.loopSignatures,
        decisionSignature(pending)
      ].slice(-maxSignatures),
      toolResultContext: {
        ...run.state.toolResultContext!,
        acceptedDecision: undefined
      }
    }
  }
}
