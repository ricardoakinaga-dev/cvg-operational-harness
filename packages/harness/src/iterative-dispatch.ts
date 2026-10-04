import type {
  ApprovalExecutionHandle,
  ApprovalExecutionRequest,
  ApprovalId,
  ClaimValidation,
  CompletionEvaluator,
  DecisionValidationResult,
  ExecutionCheckpoint,
  ExecutionStep,
  KnowledgeSearchResult,
  LoopDecision,
  Observation,
  StopReason,
  ToolResult
} from '@cvg/harness-contracts'
import {
  MAX_CHECKPOINT_OBSERVATIONS,
  validateLoopDecision
} from '@cvg/harness-contracts'
import {
  DEADLINE_EXCEEDED,
  bindCapabilityFingerprint,
  boundedPayload,
  errorMessage,
  mapEvaluationToStopReason,
  stringifySummary,
  type DispatchOutcome,
  type IterativeGovernedRuntimeOptions,
  type LoopRun
} from './iterative-runtime.ts'
import { agentExposesTool } from './runtime.ts'

/**
 * Explicit dependency surface for the extracted dispatch domain. The runtime
 * builds it from its own private members, so no visibility changes are needed
 * on the exported class and the public contract stays identical.
 */
export interface IterativeDispatchContext {
  readonly options: IterativeGovernedRuntimeOptions
  readonly maxObservationPayloadChars: number
  stop(
    stopReason: StopReason,
    response: string
  ): Extract<DispatchOutcome, { kind: 'stop' }>
  operationKey(run: LoopRun, stepNumber: number, toolId: string): string
  remainingDuration(run: LoopRun): number
  makeObservation(
    run: LoopRun,
    input: {
      stepId: string
      stepNumber: number
      type: Observation['type']
      source: Observation['source']
      trust: Observation['trust']
      payload: unknown
      summary: string
      provenance: Observation['provenance']
    }
  ): Observation
  checkAfterUsage(run: LoopRun): { reason: StopReason; response: string } | null
  allowedDecisionTypes(run: LoopRun): LoopDecision['decisionType'][]
  evaluatorFor(run: LoopRun): CompletionEvaluator
  validateClaims(run: LoopRun, responseText: string): ClaimValidation
  withDeadline<T>(
    operation: Promise<T>,
    remainingMs: number
  ): Promise<T | typeof DEADLINE_EXCEEDED>
  recordObservation(run: LoopRun, observation: Observation): Promise<void>
  recordStep(
    run: LoopRun,
    input: {
      stepNumber: number
      stepType: ExecutionStep['stepType']
      status: ExecutionStep['status']
      sideEffecting: boolean
      decisionType?: ExecutionStep['decisionType']
      reasonCode?: ExecutionStep['reasonCode']
      errorCode?: string
      observationRefs?: readonly string[]
    }
  ): Promise<void>
  persistCheckpoint(run: LoopRun): Promise<void>
  safeAudit(
    run: LoopRun,
    action: string,
    extras: { result: string; tool?: string | null }
  ): Promise<void>
  composeResponse(
    run: LoopRun,
    decision: LoopDecision
  ): Promise<
    { response: string } | { stopReason: StopReason; response: string }
  >
}

export function validateDecision(
  ctx: IterativeDispatchContext,
  run: LoopRun,
  decision: LoopDecision
): DecisionValidationResult {
  const allowed = ctx.allowedDecisionTypes(run)
  if (!allowed.includes(decision.decisionType)) {
    return {
      valid: false,
      errors: [
        `capability: decision ${decision.decisionType} is not available in this state`
      ]
    }
  }
  const validation = validateLoopDecision(decision)
  if (!validation.valid) return validation
  if (
    decision.decisionType === 'CALL_TOOL' ||
    decision.decisionType === 'REQUEST_APPROVAL'
  ) {
    if (!decision.toolId) {
      return {
        valid: false,
        errors: ['capability: tool selection requires a toolId']
      }
    }
    const tool = ctx.options.tools.resolve(
      decision.toolId,
      decision.toolVersion
    )
    if (!tool) {
      return {
        valid: false,
        errors: [`capability: tool "${decision.toolId}" is not in the catalog`]
      }
    }
    const profileTools = run.input.agent.tools
    if (!agentExposesTool(profileTools, tool.id)) {
      return {
        valid: false,
        errors: [
          `capability: tool "${tool.id}" is not exposed to this agent profile`
        ]
      }
    }
  }
  if (decision.decisionType === 'SEARCH_KNOWLEDGE' && !ctx.options.knowledge) {
    return {
      valid: false,
      errors: ['capability: no knowledge provider is configured']
    }
  }
  return { valid: true, errors: [] }
}

export function applyResume(
  ctx: IterativeDispatchContext,
  run: LoopRun,
  checkpoint: ExecutionCheckpoint | null
): Extract<DispatchOutcome, { kind: 'stop' }> | null {
  const resume = run.input.resume
  if (!resume) return null
  if (!checkpoint) {
    return {
      kind: 'stop',
      stopReason: 'STATE_CONFLICT',
      response: 'Resume input arrived without a durable checkpoint.'
    }
  }
  if (resume.kind === 'approval') {
    if (run.state.pendingQuestion) {
      // Wrong-kind resume: the execution is paused for an answer, not for an
      // approval. Never let this open the loop with a question unresolved.
      return {
        kind: 'stop',
        stopReason: 'STATE_CONFLICT',
        response: 'Approval resume arrived while a user question is pending.',
        preserveCheckpoint: true
      }
    }
    if (!run.state.pendingApprovalId) {
      if (run.state.stopReason === 'APPROVAL_REQUIRED') {
        return {
          kind: 'stop',
          stopReason: 'STATE_CONFLICT',
          response: 'The paused approval binding is missing.',
          preserveCheckpoint: true
        }
      }
      // The approval was already consumed and the checkpoint cleared the
      // binding; a retry of the same attempt is a safe no-op.
      return null
    }
    if (run.state.pendingApprovalId !== resume.approvalId) {
      return {
        kind: 'stop',
        stopReason: 'STATE_CONFLICT',
        response: 'Approval does not match the paused execution binding.',
        preserveCheckpoint: true
      }
    }
    return null
  }
  if (run.state.pendingApprovalId) {
    return {
      kind: 'stop',
      stopReason: 'STATE_CONFLICT',
      response: 'User input arrived while an approval is pending.',
      preserveCheckpoint: true
    }
  }
  if (!run.state.pendingQuestion) {
    const alreadyResolved = Object.values(run.state.resolvedInputs).includes(
      resume.message
    )
    if (alreadyResolved) return null
    return {
      kind: 'stop',
      stopReason: 'STATE_CONFLICT',
      response: 'User input arrived without a pending question.',
      preserveCheckpoint: true
    }
  }
  const stepNumber = Math.max(1, run.state.stepNumber)
  const observation = ctx.makeObservation(run, {
    stepId: `step_${run.executionId}_${stepNumber}_user_input`,
    stepNumber,
    type: 'USER_MESSAGE',
    source: 'USER',
    trust: 'UNTRUSTED',
    payload: { message: resume.message },
    summary: 'User answered the pending question.',
    provenance: { sourceId: 'user' }
  })
  run.observations = [...run.observations, observation].slice(
    -MAX_CHECKPOINT_OBSERVATIONS
  )
  const pendingQuestion = run.state.pendingQuestion
  run.state = {
    ...run.state,
    pendingQuestion: undefined,
    openQuestions: run.state.openQuestions.filter(
      (question) => question !== pendingQuestion.promptIntent
    ),
    resolvedInputs: {
      ...run.state.resolvedInputs,
      [`answer_${stepNumber}`]: resume.message
    }
  }
  return null
}

export async function dispatchTool(
  ctx: IterativeDispatchContext,
  run: LoopRun,
  decision: LoopDecision,
  stepNumber: number,
  forceApproval: boolean
): Promise<DispatchOutcome> {
  if (run.usage.toolCalls + 1 > run.input.budget.maxToolCalls) {
    return ctx.stop(
      'MAX_TOOL_CALLS',
      'Tool-call budget exhausted before the tool could run.'
    )
  }
  const tool = ctx.options.tools.resolve(
    decision.toolId as string,
    decision.toolVersion
  )
  if (!tool) {
    return ctx.stop(
      'STATE_CONFLICT',
      `Tool "${decision.toolId}" is unavailable.`
    )
  }
  const operationKey = ctx.operationKey(run, stepNumber, tool.id)
  const invocation = {
    toolId: tool.id,
    ...(tool.version ? { toolVersion: tool.version } : {}),
    input: decision.toolInput ?? {},
    operationKey
  }
  const remaining = ctx.remainingDuration(run)
  if (remaining <= 0) {
    return ctx.stop(
      'MAX_DURATION',
      'Duration budget exhausted before tool execution.'
    )
  }

  let policyDecision
  try {
    const policyOrDeadline = await ctx.withDeadline(
      ctx.options.policy.evaluate({
        tenantId: run.input.tenantId,
        agentId: run.input.agent.id,
        action: 'tool.execute',
        tool,
        invocation,
        correlationId: run.input.correlationId
      }),
      remaining
    )
    if (policyOrDeadline === DEADLINE_EXCEEDED) {
      return ctx.stop(
        'MAX_DURATION',
        'Duration budget exhausted during policy evaluation.'
      )
    }
    policyDecision = policyOrDeadline
  } catch (error) {
    return ctx.stop(
      'POLICY_DENIED',
      `Policy evaluation failed: ${errorMessage(error)}.`
    )
  }
  if (
    policyDecision.outcome !== 'ALLOW' &&
    policyDecision.outcome !== 'DENY' &&
    policyDecision.outcome !== 'REQUIRE_APPROVAL' &&
    policyDecision.outcome !== 'HANDOFF'
  ) {
    await ctx.recordObservation(
      run,
      ctx.makeObservation(run, {
        stepId: `step_${run.executionId}_${stepNumber}_tool`,
        stepNumber,
        type: 'POLICY_DECISION',
        source: 'POLICY',
        trust: 'TRUSTED',
        payload: { outcome: 'UNSUPPORTED' },
        summary: 'Policy returned an unsupported outcome.',
        provenance: { sourceId: 'policy-engine' }
      })
    )
    await ctx.recordStep(run, {
      stepNumber,
      stepType: 'POLICY',
      status: 'FAILED',
      sideEffecting: false,
      reasonCode: 'POLICY_REQUIRED',
      errorCode: 'policy_outcome_invalid'
    })
    return ctx.stop(
      'INSUFFICIENT_EVIDENCE',
      'Policy returned an unsupported decision.'
    )
  }

  await ctx.recordObservation(
    run,
    ctx.makeObservation(run, {
      stepId: `step_${run.executionId}_${stepNumber}_tool`,
      stepNumber,
      type: 'POLICY_DECISION',
      source: 'POLICY',
      trust: 'TRUSTED',
      payload: {
        outcome: policyDecision.outcome,
        policyVersion: policyDecision.policyVersion
      },
      summary: `Policy outcome ${policyDecision.outcome}.`,
      provenance: { sourceId: 'policy-engine' }
    })
  )

  if (policyDecision.outcome === 'DENY') {
    await ctx.recordStep(run, {
      stepNumber,
      stepType: 'POLICY',
      status: 'FAILED',
      sideEffecting: false,
      reasonCode: 'POLICY_REQUIRED',
      errorCode: 'policy_denied'
    })
    return ctx.stop('POLICY_DENIED', policyDecision.reason)
  }
  if (policyDecision.outcome === 'HANDOFF') {
    await ctx.recordStep(run, {
      stepNumber,
      stepType: 'HANDOFF',
      status: 'SUCCEEDED',
      sideEffecting: false,
      reasonCode: 'HANDOFF_REQUIRED'
    })
    return ctx.stop('HUMAN_TAKEOVER', policyDecision.reason)
  }

  const requiresApproval =
    forceApproval ||
    policyDecision.outcome === 'REQUIRE_APPROVAL' ||
    tool.requiresApproval
  let approvalId: ApprovalId | undefined
  let approvalExecutionRequest: ApprovalExecutionRequest | undefined
  let approvalExecution: ApprovalExecutionHandle | undefined

  if (requiresApproval) {
    const approvalRemaining = ctx.remainingDuration(run)
    if (approvalRemaining <= 0) {
      return ctx.stop(
        'MAX_DURATION',
        'Duration budget exhausted before approval evaluation.'
      )
    }
    let approval
    try {
      const approvalOrDeadline = await ctx.withDeadline(
        ctx.options.approvals.request({
          tenantId: run.input.tenantId,
          agentId: run.input.agent.id,
          operationKey,
          toolId: tool.id,
          summary: tool.description,
          correlationId: run.input.correlationId,
          executionRef: run.executionId,
          operatorId: run.input.agent.id,
          agentVersion: run.input.agent.version,
          action: 'tool.execute',
          resource: { type: 'tool', id: tool.id },
          payload: bindCapabilityFingerprint(
            invocation.input,
            ctx.options.capabilityFingerprint
          ),
          policyVersion: policyDecision.policyVersion
        }),
        approvalRemaining
      )
      if (approvalOrDeadline === DEADLINE_EXCEEDED) {
        return ctx.stop(
          'MAX_DURATION',
          'Duration budget exhausted during approval evaluation.'
        )
      }
      approval = approvalOrDeadline
    } catch (error) {
      return ctx.stop(
        'APPROVAL_REQUIRED',
        `Approval could not be evaluated: ${errorMessage(error)}.`
      )
    }
    if (approval.status === 'PENDING') {
      return {
        kind: 'pause',
        pausedKind: 'APPROVAL_REQUIRED',
        decision,
        ...(approval.approvalId ? { approvalId: approval.approvalId } : {}),
        pauseStepNumber: stepNumber
      }
    }
    if (approval.status === 'DENIED') {
      await ctx.recordStep(run, {
        stepNumber,
        stepType: 'APPROVAL',
        status: 'FAILED',
        sideEffecting: false,
        reasonCode: 'POLICY_REQUIRED',
        errorCode: 'approval_denied'
      })
      return ctx.stop('POLICY_DENIED', approval.reason)
    }
    if (!approval.approvalId) {
      return ctx.stop(
        'INSUFFICIENT_EVIDENCE',
        'Approved execution has no approval identifier.'
      )
    }
    approvalId = approval.approvalId
    if (
      run.state.pendingApprovalId &&
      run.state.pendingApprovalId !== approvalId
    ) {
      return ctx.stop(
        'STATE_CONFLICT',
        'Approval identity changed while resuming the execution.'
      )
    }
    approvalExecutionRequest = {
      tenantId: run.input.tenantId,
      approvalId,
      agentId: run.input.agent.id,
      agentVersion: run.input.agent.version,
      action: 'tool.execute',
      resource: { type: 'tool', id: tool.id },
      payload: bindCapabilityFingerprint(
        invocation.input,
        ctx.options.capabilityFingerprint
      ),
      policyVersion: policyDecision.policyVersion,
      operationKey,
      executionRef: run.executionId
    }
    if (!ctx.options.approvals.execution) {
      // Without the execution port an approval cannot be consumed once, so
      // the same approval could authorize the effect again (ENG-002).
      return ctx.stop(
        'INSUFFICIENT_EVIDENCE',
        'Approved execution requires a single-use approval execution port.'
      )
    }
  }

  // Budget accounting is committed with the in-flight decision so a crash
  // cannot replay the same step against an unconsumed counter.
  run.usage.toolCalls += 1
  run.state = {
    ...run.state,
    pendingDecision: decision,
    pendingStepNumber: stepNumber,
    ...(approvalId ? { pendingApprovalId: approvalId } : {})
  }
  await ctx.persistCheckpoint(run)
  await ctx.recordStep(run, {
    stepNumber,
    stepType: 'TOOL',
    status: 'RUNNING',
    sideEffecting: true,
    reasonCode: decision.reasonCode
  })

  if (approvalExecutionRequest && ctx.options.approvals.execution) {
    const beginRemaining = ctx.remainingDuration(run)
    if (beginRemaining <= 0) {
      return ctx.stop(
        'MAX_DURATION',
        'Duration budget exhausted before approval execution.'
      )
    }
    try {
      const handleOrDeadline = await ctx.withDeadline(
        ctx.options.approvals.execution.begin(approvalExecutionRequest),
        beginRemaining
      )
      if (handleOrDeadline === DEADLINE_EXCEEDED) {
        return ctx.stop(
          'MAX_DURATION',
          'Approval execution reservation timed out.'
        )
      }
      approvalExecution = handleOrDeadline
    } catch (error) {
      return ctx.stop(
        'STATE_CONFLICT',
        `Approval could not be consumed safely: ${errorMessage(error)}.`
      )
    }
  }

  const abortController = new AbortController()
  let toolResult: ToolResult
  let toolThrew = false
  try {
    const toolRemaining = ctx.remainingDuration(run)
    if (toolRemaining <= 0) {
      if (
        approvalExecution &&
        approvalExecutionRequest &&
        ctx.options.approvals.execution
      ) {
        // The tool never started, so the reservation is released as a certain
        // failure instead of leaving the approval held.
        await ctx.options.approvals.execution
          .fail({
            request: approvalExecutionRequest,
            reservationId: approvalExecution.reservationId,
            evidenceRef: `${run.executionId}:tool_not_started`
          })
          .catch(() => undefined)
      }
      await ctx.recordStep(run, {
        stepNumber,
        stepType: 'TOOL',
        status: 'FAILED',
        sideEffecting: true,
        reasonCode: decision.reasonCode,
        errorCode: 'deadline'
      })
      return ctx.stop(
        'MAX_DURATION',
        'Duration budget exhausted before tool execution.'
      )
    }
    const resultOrDeadline = await ctx.withDeadline(
      tool.execute(invocation.input, {
        tenantId: run.input.tenantId,
        agentId: run.input.agent.id,
        correlationId: run.input.correlationId,
        traceId: run.input.traceId,
        operationKey,
        signal: abortController.signal
      }),
      toolRemaining
    )
    if (resultOrDeadline === DEADLINE_EXCEEDED) {
      abortController.abort()
      if (
        approvalExecution &&
        approvalExecutionRequest &&
        ctx.options.approvals.execution
      ) {
        await ctx.options.approvals.execution
          .uncertain({
            request: approvalExecutionRequest,
            reservationId: approvalExecution.reservationId,
            reason:
              'Tool exceeded its deadline after approval execution started.',
            evidenceRef: `${run.executionId}:tool_deadline`
          })
          .catch(() => undefined)
      }
      await ctx.recordStep(run, {
        stepNumber,
        stepType: 'TOOL',
        status: 'FAILED',
        sideEffecting: true,
        reasonCode: decision.reasonCode,
        errorCode: approvalExecution ? 'unknown_effect' : 'deadline'
      })
      return ctx.stop(
        approvalExecution ? 'TOOL_FAILURE' : 'MAX_DURATION',
        approvalExecution
          ? 'unknown_effect: duration budget exhausted during tool execution.'
          : 'Duration budget exhausted during tool execution.'
      )
    }
    toolResult = resultOrDeadline
  } catch (error) {
    toolThrew = true
    toolResult = { status: 'FAILED', error: errorMessage(error) }
  }

  if (toolResult.status !== 'SUCCEEDED') {
    if (
      approvalExecution &&
      approvalExecutionRequest &&
      ctx.options.approvals.execution
    ) {
      const port = ctx.options.approvals.execution
      if (toolThrew) {
        await port
          .uncertain({
            request: approvalExecutionRequest,
            reservationId: approvalExecution.reservationId,
            reason: `Tool executor threw after approval execution started: ${toolResult.error ?? 'unknown failure'}`,
            evidenceRef: `${run.executionId}:tool_uncertain`
          })
          .catch(() => undefined)
      } else {
        await port
          .fail({
            request: approvalExecutionRequest,
            reservationId: approvalExecution.reservationId,
            evidenceRef: `${run.executionId}:tool_failed`
          })
          .catch(() => undefined)
      }
    }
    const unknownEffect =
      toolThrew || toolResult.error?.startsWith('unknown_effect:') === true
    await ctx.recordObservation(
      run,
      ctx.makeObservation(run, {
        stepId: `step_${run.executionId}_${stepNumber}_tool`,
        stepNumber,
        type: 'TOOL_RESULT',
        source: 'TOOL',
        trust: 'UNTRUSTED',
        payload: {
          status: unknownEffect ? 'REJECTED' : toolResult.status,
          error: toolResult.error ?? 'tool execution failed'
        },
        summary: unknownEffect
          ? 'Tool outcome is uncertain and requires reconciliation.'
          : 'Tool execution failed.',
        provenance: {
          sourceId: tool.id,
          ...(tool.version ? { sourceVersion: tool.version } : {}),
          operationKey,
          ...(unknownEffect ? { effectRef: operationKey } : {})
        }
      })
    )
    await ctx.recordStep(run, {
      stepNumber,
      stepType: 'TOOL',
      status: 'FAILED',
      sideEffecting: true,
      reasonCode: decision.reasonCode,
      errorCode: unknownEffect ? 'unknown_effect' : 'tool_failed'
    })
    return ctx.stop(
      'TOOL_FAILURE',
      unknownEffect
        ? `unknown_effect: ${toolResult.error ?? 'Tool execution outcome is uncertain.'}`
        : (toolResult.error ?? 'Tool execution failed.')
    )
  }

  if (
    approvalExecution &&
    approvalExecutionRequest &&
    ctx.options.approvals.execution
  ) {
    try {
      await ctx.options.approvals.execution.complete({
        request: approvalExecutionRequest,
        reservationId: approvalExecution.reservationId,
        evidenceRef: `${run.executionId}:tool_confirmed`
      })
    } catch (error) {
      await ctx.recordObservation(
        run,
        ctx.makeObservation(run, {
          stepId: `step_${run.executionId}_${stepNumber}_tool`,
          stepNumber,
          type: 'TOOL_RESULT',
          source: 'TOOL',
          trust: 'UNTRUSTED',
          payload: {
            status: 'REJECTED',
            error: 'approval_confirmation_failed'
          },
          summary: 'Approval confirmation failed after the effect.',
          provenance: {
            sourceId: tool.id,
            operationKey,
            effectRef: operationKey
          }
        })
      )
      await ctx.recordStep(run, {
        stepNumber,
        stepType: 'TOOL',
        status: 'FAILED',
        sideEffecting: true,
        reasonCode: decision.reasonCode,
        errorCode: 'unknown_effect'
      })
      return ctx.stop(
        'TOOL_FAILURE',
        `unknown_effect: approval confirmation failed: ${errorMessage(error)}.`
      )
    }
  }

  const observation = ctx.makeObservation(run, {
    stepId: `step_${run.executionId}_${stepNumber}_tool`,
    stepNumber,
    type: 'TOOL_RESULT',
    source: 'TOOL',
    trust: 'UNTRUSTED',
    payload: {
      status: 'SUCCEEDED',
      sideEffect: tool.sideEffect,
      output: boundedPayload(toolResult.output, ctx.maxObservationPayloadChars)
    },
    summary: stringifySummary(
      toolResult.output,
      'Tool completed successfully.'
    ),
    provenance: {
      sourceId: tool.id,
      ...(tool.version ? { sourceVersion: tool.version } : {}),
      operationKey,
      effectRef: operationKey
    }
  })
  await ctx.recordObservation(run, observation)
  run.lastToolObservation = observation
  run.state = { ...run.state, pendingApprovalId: undefined }
  await ctx.recordStep(run, {
    stepNumber,
    stepType: 'TOOL',
    status: 'SUCCEEDED',
    sideEffecting: true,
    reasonCode: decision.reasonCode,
    observationRefs: [observation.observationId]
  })
  return { kind: 'continue' }
}

export async function dispatchKnowledge(
  ctx: IterativeDispatchContext,
  run: LoopRun,
  decision: LoopDecision,
  stepNumber: number
): Promise<DispatchOutcome> {
  const knowledgeLimit =
    run.input.budget.maxKnowledgeCalls ?? run.input.budget.maxSteps
  if (run.usage.knowledgeCalls + 1 > knowledgeLimit) {
    return ctx.stop('MAX_KNOWLEDGE_CALLS', 'Knowledge-call budget exhausted.')
  }
  const remaining = ctx.remainingDuration(run)
  if (remaining <= 0) {
    return ctx.stop(
      'MAX_DURATION',
      'Duration budget exhausted before knowledge search.'
    )
  }
  const provider = ctx.options.knowledge
  if (!provider) {
    return ctx.stop('STATE_CONFLICT', 'No knowledge provider is configured.')
  }
  const query = decision.query as string
  run.usage.knowledgeCalls += 1
  await ctx.persistCheckpoint(run)
  let result: KnowledgeSearchResult
  try {
    const searchOrDeadline = await ctx.withDeadline(
      provider.search({
        query,
        ...(decision.knowledgeCategories
          ? { categories: decision.knowledgeCategories }
          : {}),
        context: run.input.context,
        correlationId: run.input.correlationId
      }),
      remaining
    )
    if (searchOrDeadline === DEADLINE_EXCEEDED) {
      return ctx.stop(
        'MAX_DURATION',
        'Duration budget exhausted during knowledge search.'
      )
    }
    result = searchOrDeadline
  } catch (error) {
    await ctx.recordStep(run, {
      stepNumber,
      stepType: 'KNOWLEDGE',
      status: 'FAILED',
      sideEffecting: false,
      reasonCode: decision.reasonCode,
      errorCode: 'knowledge_failure'
    })
    return ctx.stop(
      'INSUFFICIENT_EVIDENCE',
      `Knowledge search failed: ${errorMessage(error)}.`
    )
  }
  const observation = ctx.makeObservation(run, {
    stepId: `step_${run.executionId}_${stepNumber}_knowledge`,
    stepNumber,
    type: 'KNOWLEDGE_RESULT',
    source: 'KNOWLEDGE',
    trust: 'UNTRUSTED',
    payload: {
      query,
      items: boundedPayload(result.items, ctx.maxObservationPayloadChars)
    },
    summary: `Knowledge search returned ${result.items.length} item(s) for "${query}".`,
    provenance: {
      sourceId: 'knowledge-provider',
      ...(result.provenance[0]?.sourceVersion
        ? { sourceVersion: result.provenance[0].sourceVersion }
        : {})
    }
  })
  await ctx.recordObservation(run, observation)
  await ctx.recordStep(run, {
    stepNumber,
    stepType: 'KNOWLEDGE',
    status: 'SUCCEEDED',
    sideEffecting: false,
    reasonCode: decision.reasonCode,
    observationRefs: [observation.observationId]
  })

  if (ctx.options.sufficiencyEvaluator) {
    const sufficiency = await ctx.options.sufficiencyEvaluator.evaluate({
      query,
      requestedCategories: decision.knowledgeCategories ?? [],
      observations: run.observations.filter(
        (entry) => entry.type === 'KNOWLEDGE_RESULT'
      )
    })
    run.lastSufficiency = sufficiency.level
    await ctx.recordObservation(
      run,
      ctx.makeObservation(run, {
        stepId: `step_${run.executionId}_${stepNumber}_knowledge`,
        stepNumber,
        type: 'SUFFICIENCY',
        source: 'SYSTEM',
        trust: 'TRUSTED',
        payload: sufficiency,
        summary: `Evidence sufficiency is ${sufficiency.level}.`,
        provenance: { sourceId: 'sufficiency-evaluator' }
      })
    )
  }
  return { kind: 'continue' }
}

export async function dispatchRespond(
  ctx: IterativeDispatchContext,
  run: LoopRun,
  decision: LoopDecision,
  stepNumber: number
): Promise<DispatchOutcome> {
  let response = decision.responseText?.trim() ?? ''
  if (!response && decision.responseIntent?.trim()) {
    const composed = await ctx.composeResponse(run, decision)
    if ('stopReason' in composed) {
      return ctx.stop(composed.stopReason, composed.response)
    }
    response = composed.response
  }
  if (!response) {
    return ctx.stop(
      'INSUFFICIENT_EVIDENCE',
      'The orchestrator attempted to respond without content.'
    )
  }
  run.responseText = response

  const implicitVerification = ctx.validateClaims(run, response)
  if (!implicitVerification.valid) {
    const limit =
      run.input.budget.maxVerificationCalls ?? run.input.budget.maxSteps
    if (run.usage.verificationCalls + 1 > limit) {
      await ctx.recordStep(run, {
        stepNumber,
        stepType: 'RESPOND',
        status: 'FAILED',
        sideEffecting: false,
        reasonCode: decision.reasonCode,
        errorCode: 'verification_failed'
      })
      return ctx.stop(
        'VERIFICATION_FAILED',
        `Response claims are not supported by evidence: ${implicitVerification.unsupportedClaims.join('; ')}`
      )
    }
    run.usage.verificationCalls += 1
    await ctx.persistCheckpoint(run)
    await ctx.recordObservation(
      run,
      ctx.makeObservation(run, {
        stepId: `step_${run.executionId}_${stepNumber}_respond`,
        stepNumber,
        type: 'VERIFICATION',
        source: 'SYSTEM',
        trust: 'TRUSTED',
        payload: {
          target: 'response-claims',
          valid: false,
          unsupportedClaims: implicitVerification.unsupportedClaims
        },
        summary: 'Response contains claims without evidence references.',
        provenance: { sourceId: 'runtime-verifier' }
      })
    )
    await ctx.recordStep(run, {
      stepNumber,
      stepType: 'RESPOND',
      status: 'FAILED',
      sideEffecting: false,
      reasonCode: decision.reasonCode,
      errorCode: 'verification_failed'
    })
    run.state = {
      ...run.state,
      lastEvaluation: {
        outcome: 'INCOMPLETE',
        reasonCode: 'VERIFICATION_FAILED',
        deterministic: true,
        detail: 'The response must be revised with grounded claims.'
      }
    }
    run.lastEvaluation = run.state.lastEvaluation ?? null
    run.skipEvaluationOnce = true
    return { kind: 'continue' }
  }

  await ctx.recordStep(run, {
    stepNumber,
    stepType: 'RESPOND',
    status: 'SUCCEEDED',
    sideEffecting: false,
    reasonCode: decision.reasonCode
  })
  return { kind: 'continue' }
}

export async function composeResponse(
  ctx: IterativeDispatchContext,
  run: LoopRun,
  decision: LoopDecision
): Promise<
  { response: string } | { stopReason: StopReason; response: string }
> {
  if (run.usage.modelCalls + 1 > run.input.budget.maxModelCalls) {
    return {
      stopReason: 'MAX_MODEL_CALLS',
      response: 'Model-call budget exhausted before the response was composed.'
    }
  }
  const remaining = ctx.remainingDuration(run)
  if (remaining <= 0) {
    return {
      stopReason: 'MAX_DURATION',
      response: 'Duration budget exhausted before the response was composed.'
    }
  }
  const modelAbortController = new AbortController()
  try {
    const modelOrDeadline = await ctx.withDeadline(
      ctx.options.modelGateway.complete({
        signal: modelAbortController.signal,
        messages: [
          {
            role: 'system',
            content: [
              'Compose the final user-facing answer.',
              'Use only the structured observations as facts.',
              'Never claim an external action succeeded without an effect observation.',
              `Response intent: ${decision.responseIntent ?? ''}`
            ].join(' ')
          },
          { role: 'user', content: run.input.userMessage }
        ],
        context: run.input.context,
        budget: run.input.budget,
        correlationId: run.input.correlationId,
        purpose: 'RESPONSE'
      }),
      remaining
    )
    if (modelOrDeadline === DEADLINE_EXCEEDED) {
      modelAbortController.abort()
      return {
        stopReason: 'MAX_DURATION',
        response: 'Duration budget exhausted during response composition.'
      }
    }
    run.usage.modelCalls += 1
    run.usage.inputTokens += modelOrDeadline.inputTokens
    run.usage.outputTokens += modelOrDeadline.outputTokens
    run.usage.costUsd += modelOrDeadline.costUsd
    const afterUsage = ctx.checkAfterUsage(run)
    if (afterUsage) {
      return { stopReason: afterUsage.reason, response: afterUsage.response }
    }
    return { response: modelOrDeadline.text }
  } catch (error) {
    return {
      stopReason: 'MODEL_FAILURE',
      response: `Response composition failed: ${errorMessage(error)}.`
    }
  }
}

export async function evaluate(
  ctx: IterativeDispatchContext,
  run: LoopRun,
  decision: LoopDecision
): Promise<Extract<DispatchOutcome, { kind: 'stop' }> | null> {
  const evaluation = await ctx.evaluatorFor(run).evaluate({
    goal: run.state.goal,
    state: { ...run.state, observations: run.observations },
    observations: run.observations,
    lastDecision: decision,
    ...(run.responseText ? { result: run.responseText } : {})
  })
  if (evaluation.usage) {
    run.usage.modelCalls += evaluation.usage.modelCalls
    run.usage.inputTokens += evaluation.usage.inputTokens
    run.usage.outputTokens += evaluation.usage.outputTokens
    run.usage.costUsd += evaluation.usage.costUsd
  }
  run.lastEvaluation = evaluation
  run.state = { ...run.state, lastEvaluation: evaluation }
  await ctx.safeAudit(run, 'evaluation.completed', {
    result: `${evaluation.outcome}:${evaluation.reasonCode}`
  })
  if (evaluation.usage) {
    const afterEvaluation = ctx.checkAfterUsage(run)
    if (afterEvaluation) {
      return ctx.stop(afterEvaluation.reason, afterEvaluation.response)
    }
  }

  if (evaluation.outcome === 'COMPLETE') {
    if (decision.decisionType === 'RESPOND') {
      return ctx.stop('COMPLETED', run.responseText ?? 'Execution completed.')
    }
    if (
      decision.decisionType === 'STOP' &&
      decision.reasonCode === 'USER_REQUESTED_STOP'
    ) {
      return ctx.stop('COMPLETED', 'Execution stopped at the user request.')
    }
    // Completion requires an explicit RESPOND step.
    return null
  }
  if (evaluation.outcome === 'FAILED') {
    return ctx.stop(
      mapEvaluationToStopReason(evaluation),
      run.responseText ??
        `Completion evaluation failed: ${evaluation.detail ?? evaluation.reasonCode}.`
    )
  }
  if (evaluation.outcome === 'INSUFFICIENT_EVIDENCE') {
    if (
      decision.decisionType === 'RESPOND' ||
      decision.decisionType === 'STOP'
    ) {
      return ctx.stop(
        'INSUFFICIENT_EVIDENCE',
        run.responseText ??
          'The available evidence is insufficient for a complete answer.'
      )
    }
  }
  // A finalising decision with incomplete evidence is terminal: the agent
  // tried to answer and the runtime will not let it keep improvising.
  if (
    evaluation.outcome === 'INCOMPLETE' &&
    evaluation.reasonCode === 'EVIDENCE_INCOMPLETE' &&
    (decision.decisionType === 'RESPOND' || decision.decisionType === 'STOP')
  ) {
    return ctx.stop(
      'INSUFFICIENT_EVIDENCE',
      'The available evidence is incomplete for a final answer.'
    )
  }
  return null
}

export async function pause(
  ctx: IterativeDispatchContext,
  run: LoopRun,
  stepNumber: number,
  outcome: Extract<DispatchOutcome, { kind: 'pause' }>
): Promise<Extract<DispatchOutcome, { kind: 'stop' }>> {
  const decision = outcome.decision
  if (outcome.pausedKind === 'NEEDS_USER_INPUT') {
    const requested = decision?.requestedInput
    const promptIntent =
      requested?.promptIntent ??
      decision?.responseIntent ??
      'More information is required.'
    run.state = {
      ...run.state,
      stepNumber,
      pendingQuestion: requested ?? {
        questionType: 'CLARIFICATION',
        missingFields: [],
        promptIntent
      },
      openQuestions: [...run.state.openQuestions, promptIntent],
      stopReason: 'NEEDS_USER_INPUT'
    }
    run.stepNumber = stepNumber
    await ctx.recordStep(run, {
      stepNumber,
      stepType: 'USER_INPUT',
      status: 'WAITING',
      sideEffecting: false,
      reasonCode: decision?.reasonCode ?? 'MISSING_INFORMATION'
    })
    await ctx.persistCheckpoint(run)
    await ctx.safeAudit(run, 'runtime.paused', {
      result: 'NEEDS_USER_INPUT'
    })
    return {
      kind: 'stop',
      stopReason: 'NEEDS_USER_INPUT',
      response: promptIntent
    }
  }

  const pauseStepNumber = outcome.pauseStepNumber ?? stepNumber
  run.state = {
    ...run.state,
    stepNumber: pauseStepNumber,
    pendingDecision: decision ?? undefined,
    pendingStepNumber: pauseStepNumber,
    ...(outcome.approvalId ? { pendingApprovalId: outcome.approvalId } : {}),
    stopReason: 'APPROVAL_REQUIRED'
  }
  run.stepNumber = pauseStepNumber
  await ctx.recordStep(run, {
    stepNumber: pauseStepNumber,
    stepType: 'TOOL',
    status: 'WAITING',
    sideEffecting: true,
    reasonCode: 'POLICY_REQUIRED'
  })
  await ctx.persistCheckpoint(run)
  await ctx.safeAudit(run, 'runtime.paused', { result: 'APPROVAL_REQUIRED' })
  return {
    kind: 'stop',
    stopReason: 'APPROVAL_REQUIRED',
    ...(outcome.approvalId ? { approvalId: outcome.approvalId } : {}),
    response:
      decision?.responseIntent ?? 'Approval is required before continuing.'
  }
}
