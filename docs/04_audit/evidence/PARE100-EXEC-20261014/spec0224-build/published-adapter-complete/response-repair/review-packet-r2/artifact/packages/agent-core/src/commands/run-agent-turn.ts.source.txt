import { createDomainId, RunAgentTurnSchema } from '@cvg/shared'
import { evaluatePolicy } from '@cvg/policy'

/**
 * @deprecated This is a synchronous facade over the legacy `evaluatePolicy`
 * (autonomy-level enum), not a governed turn. It is not on any production
 * path — the worker/API turn goes through `executePublishedAgent` (which
 * delegates to the platform's CONTROLLED_RUNTIME) or the operational-harness
 * kernel. Real turn execution lives in `@cvg/harness` (`kernel/pipeline.ts`).
 * Kept only for the legacy-enum regression test; scheduled for removal in
 * PDSH-003b (SPEC 0195).
 */
export function runAgentTurn(rawInput: unknown) {
  const input = RunAgentTurnSchema.parse(rawInput)
  const policy = evaluatePolicy({
    action: 'run_agent_turn',
    autonomyLevel: input.autonomyLevel
  })
  return {
    agentRunId: createDomainId('run'),
    nextState: policy.decision === 'handoff' ? 'waiting_human' : 'active',
    proposedActions:
      policy.decision === 'allowed' ? ['classify_intent'] : ['handoff'],
    policy
  }
}
