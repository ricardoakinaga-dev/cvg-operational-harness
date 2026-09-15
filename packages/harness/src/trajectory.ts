import {
  EMPTY_BUDGET_USAGE,
  type ExecutionStepStore,
  type ExecutionTrajectory
} from '@cvg/harness-contracts'

/**
 * Safe, structured trajectory export. It contains decision/observation
 * metadata only: never chain-of-thought, payloads or user content.
 */
export async function readExecutionTrajectory(
  store: ExecutionStepStore,
  tenantId: string,
  executionId: string
): Promise<ExecutionTrajectory | null> {
  const [checkpoint, steps] = await Promise.all([
    store.loadCheckpoint(tenantId, executionId),
    store.listSteps(tenantId, executionId)
  ])
  if (!checkpoint && steps.length === 0) return null
  return {
    executionId,
    runtimeProfile: checkpoint?.runtimeProfile ?? 'iterative',
    runtimeVersion: checkpoint?.runtimeVersion ?? 'unknown',
    orchestratorVersion: checkpoint?.orchestratorVersion ?? 'unknown',
    steps: steps.map((step) => ({
      stepNumber: step.stepNumber,
      stepType: step.stepType,
      status: step.status,
      ...(step.decisionType ? { decisionType: step.decisionType } : {}),
      ...(step.reasonCode ? { reasonCode: step.reasonCode } : {})
    })),
    stopReason: checkpoint?.state.stopReason ?? 'INSUFFICIENT_EVIDENCE',
    budgetUsage: checkpoint?.budgetUsage ?? EMPTY_BUDGET_USAGE
  }
}
