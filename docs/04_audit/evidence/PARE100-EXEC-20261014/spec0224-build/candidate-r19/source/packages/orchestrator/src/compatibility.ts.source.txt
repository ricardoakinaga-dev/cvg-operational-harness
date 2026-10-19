import type {
  Orchestrator,
  OrchestratorDecision,
  OrchestratorInput
} from '@cvg/harness-contracts'

/**
 * Deterministic compatibility orchestrator. It chooses one action and never
 * executes tools, calls a model, or evaluates policy.
 */
export class SinglePassOrchestrator implements Orchestrator {
  async decideNextStep(
    input: OrchestratorInput
  ): Promise<OrchestratorDecision> {
    const requestedTool = input.runtime.requestedTool

    if (!requestedTool) {
      return { action: 'RESPOND' }
    }

    const tool = input.availableTools.find(
      (candidate) =>
        candidate.id === requestedTool.toolId &&
        (!requestedTool.toolVersion ||
          candidate.version === requestedTool.toolVersion)
    )

    if (!tool) {
      return {
        action: 'STOP',
        response: `Tool "${requestedTool.toolId}" is unavailable.`,
        reason: 'requested_tool_unavailable'
      }
    }

    return {
      action: 'CALL_TOOL',
      toolInvocation: requestedTool,
      reason: 'explicit_single_pass_request'
    }
  }
}

/** Small deterministic adapter useful for smoke tests and safe boot checks. */
export class NoopOrchestrator implements Orchestrator {
  async decideNextStep(): Promise<OrchestratorDecision> {
    return {
      action: 'RESPOND',
      response: 'Acknowledged.'
    }
  }
}
