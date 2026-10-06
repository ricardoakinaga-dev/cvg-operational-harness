import type {
  ClaimValidation,
  CompletionEvaluator,
  DecisionValidationResult,
  ExecutionCheckpoint,
  ExecutionStep,
  KnowledgeSearchResult,
  LoopDecision,
  Observation,
  StopReason
} from '@cvg/harness-contracts'
import {
  MAX_CHECKPOINT_OBSERVATIONS,
  validateLoopDecision
} from '@cvg/harness-contracts'
import {
  DEADLINE_EXCEEDED,
  boundedPayload,
  errorMessage,
  mapEvaluationToStopReason,
  stringifySummary,
  type DispatchOutcome,
  type IterativeGovernedRuntimeOptions,
  type LoopRun
} from './iterative-runtime.ts'
import { agentExposesTool } from './runtime.ts'
import type { KernelHost } from './kernel/host.ts'
import {
  CANCELLED_RESPONSE,
  runModelCall,
  runToolCall,
  unrecordedBlock
} from './kernel/pipeline.ts'
import type { KernelStop, ToolCallState, TurnState } from './kernel/types.ts'

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
  /** Kernel host and turn view for the shared governed pipelines. */
  kernel(run: LoopRun): KernelHost
  turn(run: LoopRun): TurnState
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

type StepRecord = Parameters<IterativeDispatchContext['recordStep']>[1] & {
  errorCode: string
}

/** The error code a step carries when a control blocked its call. */
function blockedErrorCode(gate: KernelStop): string {
  switch (gate.cause) {
    case 'policy_denied':
    case 'policy_handoff':
    case 'approval_denied':
      return gate.cause
    case 'policy_unsupported':
      return 'policy_outcome_invalid'
    default:
      return gate.stopReason === 'MAX_DURATION'
        ? 'deadline'
        : gate.stopReason === 'CANCELLED'
          ? 'cancelled'
          : 'not_started'
  }
}

/** The step recorded for a blocked call, by the control that decided. */
function blockedStepRecord(
  gate: KernelStop,
  stepNumber: number,
  reasonCode: ExecutionStep['reasonCode']
): StepRecord {
  const errorCode = blockedErrorCode(gate)
  switch (gate.cause) {
    case 'policy_denied':
    case 'policy_unsupported':
      return {
        stepNumber,
        stepType: 'POLICY',
        status: 'FAILED',
        sideEffecting: false,
        reasonCode: 'POLICY_REQUIRED',
        errorCode
      }
    case 'approval_denied':
      return {
        stepNumber,
        stepType: 'APPROVAL',
        status: 'FAILED',
        sideEffecting: false,
        reasonCode: 'POLICY_REQUIRED',
        errorCode
      }
    default:
      return {
        stepNumber,
        stepType: 'TOOL',
        status: 'FAILED',
        sideEffecting: true,
        reasonCode,
        errorCode
      }
  }
}

export async function dispatchTool(
  ctx: IterativeDispatchContext,
  run: LoopRun,
  decision: LoopDecision,
  stepNumber: number,
  forceApproval: boolean
): Promise<DispatchOutcome> {
  // A resumed in-flight step was already counted when it reached dispatch.
  const alreadyCounted =
    run.inFlightCounted && run.state.pendingStepNumber === stepNumber
  if (
    !alreadyCounted &&
    run.usage.toolCalls + 1 > run.input.budget.maxToolCalls
  ) {
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
  if (ctx.remainingDuration(run) <= 0) {
    return ctx.stop(
      'MAX_DURATION',
      'Duration budget exhausted before tool execution.'
    )
  }

  const stepId = `step_${run.executionId}_${stepNumber}_tool`
  // A resumed step already holds this step number as a tool step (waiting for
  // approval or in flight), and the dispatch checkpoint opens it as RUNNING;
  // a control that then blocks the call closes that same step instead of
  // recording a second one under the same number, or leaving it open while
  // the checkpoint ends (AUD-0599 F02).
  let stepOpen = run.state.pendingStepNumber === stepNumber
  // Opened as RUNNING by this invocation's dispatch checkpoint.
  let openedHere = false
  // An operator pause proves that nothing ran and nothing stays reserved: the
  // step waits for the resume instead of looking in flight, so a later
  // terminal stop can close it as not executed (AUD-0600 F02).
  const parkForResume = async (): Promise<void> => {
    if (!openedHere) return
    await ctx.recordStep(run, {
      stepNumber,
      stepType: 'TOOL',
      status: 'WAITING',
      sideEffecting: true,
      reasonCode: decision.reasonCode
    })
  }
  const recordDenial = (record: StepRecord): Promise<void> =>
    ctx.recordStep(
      run,
      stepOpen
        ? {
            stepNumber,
            stepType: 'TOOL',
            status: 'FAILED',
            sideEffecting: true,
            reasonCode: decision.reasonCode,
            errorCode: record.errorCode
          }
        : record
    )
  const call: ToolCallState = {
    turn: ctx.turn(run),
    tool,
    invocation,
    needsApproval: forceApproval,
    executionRef: run.executionId
  }
  let policyRecorded = false
  const recordPolicy = async (): Promise<void> => {
    if (policyRecorded || !call.policyDecision) return
    policyRecorded = true
    await ctx.recordObservation(
      run,
      ctx.makeObservation(run, {
        stepId,
        stepNumber,
        type: 'POLICY_DECISION',
        source: 'POLICY',
        trust: 'TRUSTED',
        payload: {
          outcome: call.policyDecision.outcome,
          policyVersion: call.policyDecision.policyVersion
        },
        summary: `Policy outcome ${call.policyDecision.outcome}.`,
        provenance: { sourceId: 'policy-engine' }
      })
    )
  }

  // Policy, approval, guards (pause) and cancellation run in the kernel
  // pipeline (SPEC 0181); this loop only adds its checkpoint and its steps.
  const pipeline = await runToolCall(ctx.kernel(run), call, {
    beforeDispatch: async () => {
      await recordPolicy()
      const approvalId = call.grant?.approvalId
      if (
        approvalId &&
        run.state.pendingApprovalId &&
        run.state.pendingApprovalId !== approvalId
      ) {
        return {
          kind: 'stop',
          stopReason: 'STATE_CONFLICT',
          response: 'Approval identity changed while resuming the execution.'
        }
      }
      // Budget accounting is committed with the in-flight decision so a crash
      // cannot replay the same step against an unconsumed counter; the
      // approval is only reserved after this checkpoint.
      if (!alreadyCounted) run.usage.toolCalls += 1
      run.inFlightCounted = false
      // The step is in flight from here: a stop reason left by an earlier
      // approval wait would hide that this call is already counted when the
      // execution resumes (AUD-0598 R02).
      run.state = {
        ...run.state,
        pendingDecision: decision,
        pendingStepNumber: stepNumber,
        ...(approvalId ? { pendingApprovalId: approvalId } : {}),
        stopReason: undefined
      }
      await ctx.persistCheckpoint(run)
      await ctx.recordStep(run, {
        stepNumber,
        stepType: 'TOOL',
        status: 'RUNNING',
        sideEffecting: true,
        reasonCode: decision.reasonCode
      })
      stepOpen = true
      openedHere = true
      return undefined
    }
  })

  const recordUnsupported = (): Promise<void> =>
    ctx.recordObservation(
      run,
      ctx.makeObservation(run, {
        stepId,
        stepNumber,
        type: 'POLICY_DECISION',
        source: 'POLICY',
        trust: 'TRUSTED',
        payload: { outcome: 'UNSUPPORTED' },
        summary: 'Policy returned an unsupported outcome.',
        provenance: { sourceId: 'policy-engine' }
      })
    )

  if (pipeline.kind === 'stopped') {
    const gate = pipeline.gate
    const blockedStep = (decided: KernelStop): Promise<void> =>
      recordDenial(blockedStepRecord(decided, stepNumber, decision.reasonCode))
    if (pipeline.blocked) {
      // The closing record was lost: this is neither a clean pause, handoff
      // nor denial, although nothing ran. The step is still closed for the
      // control's own decision, and the turn ends on the missing evidence
      // with that decision in its response (AUD-0599 F02).
      const blocked = pipeline.blocked
      if (blocked.cause === 'policy_unsupported') await recordUnsupported()
      else await recordPolicy()
      await blockedStep(blocked)
      return ctx.stop(gate.stopReason, gate.response)
    }
    if (gate.cause === 'operator_paused') {
      // Nothing ran and nothing is reserved: keep the step resumable (F03).
      await parkForResume()
      return {
        ...ctx.stop(gate.stopReason, gate.response),
        preserveCheckpoint: true
      }
    }
    if (gate.cause === 'policy_unsupported') {
      await recordUnsupported()
      await blockedStep(gate)
      return ctx.stop(gate.stopReason, gate.response)
    }
    await recordPolicy()
    switch (gate.cause) {
      case 'policy_handoff':
        if (stepOpen) {
          await blockedStep(gate)
          break
        }
        await ctx.recordStep(run, {
          stepNumber,
          stepType: 'HANDOFF',
          status: 'SUCCEEDED',
          sideEffecting: false,
          reasonCode: 'HANDOFF_REQUIRED'
        })
        break
      case 'approval_pending':
        return {
          kind: 'pause',
          pausedKind: 'APPROVAL_REQUIRED',
          decision,
          ...(gate.approvalId ? { approvalId: gate.approvalId } : {}),
          pauseStepNumber: stepNumber
        }
      case 'policy_denied':
      case 'approval_denied':
        await blockedStep(gate)
        break
      default:
        // Any other block (a guard, cancellation, a conflicting resume) ends
        // the run, so a step it left open is closed with it.
        if (stepOpen) await blockedStep(gate)
        break
    }
    return ctx.stop(gate.stopReason, gate.response)
  }

  const outcome = pipeline.outcome
  const reserved = call.approval !== undefined
  const failStep = (errorCode: string) =>
    ctx.recordStep(run, {
      stepNumber,
      stepType: 'TOOL',
      status: 'FAILED',
      sideEffecting: true,
      reasonCode: decision.reasonCode,
      errorCode
    })

  switch (outcome.kind) {
    case 'not_started': {
      const gate = outcome.gate
      if (pipeline.logFailure) {
        // The closing record was lost: this is neither a clean pause nor a
        // clean denial, although nothing ran (AUD-0598 R04, AUD-0599 F02).
        await failStep(blockedErrorCode(gate))
        const lost = unrecordedBlock(pipeline.logFailure, gate)
        return ctx.stop(lost.stopReason, lost.response)
      }
      if (gate.cause === 'operator_paused') {
        // The reservation was released as certain; the step resumes later.
        await parkForResume()
        return {
          ...ctx.stop(gate.stopReason, gate.response),
          preserveCheckpoint: true
        }
      }
      await failStep(blockedErrorCode(gate))
      return ctx.stop(gate.stopReason, gate.response)
    }
    case 'deadline':
      await failStep(reserved ? 'unknown_effect' : 'deadline')
      return ctx.stop(
        reserved ? 'TOOL_FAILURE' : 'MAX_DURATION',
        reserved
          ? 'unknown_effect: duration budget exhausted during tool execution.'
          : 'Duration budget exhausted during tool execution.'
      )
    case 'cancelled':
      await failStep(reserved ? 'unknown_effect' : 'cancelled')
      return ctx.stop(
        reserved ? 'TOOL_FAILURE' : 'CANCELLED',
        reserved ? `unknown_effect: ${CANCELLED_RESPONSE}` : CANCELLED_RESPONSE
      )
    case 'threw':
    case 'failed': {
      const toolError =
        outcome.kind === 'threw' ? outcome.error : outcome.result.error
      const unknownEffect =
        outcome.kind === 'threw' ||
        toolError?.startsWith('unknown_effect:') === true
      await ctx.recordObservation(
        run,
        ctx.makeObservation(run, {
          stepId,
          stepNumber,
          type: 'TOOL_RESULT',
          source: 'TOOL',
          trust: 'UNTRUSTED',
          payload: {
            status: unknownEffect
              ? 'REJECTED'
              : outcome.kind === 'failed'
                ? outcome.result.status
                : 'FAILED',
            error: toolError ?? 'tool execution failed'
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
      await failStep(unknownEffect ? 'unknown_effect' : 'tool_failed')
      return ctx.stop(
        'TOOL_FAILURE',
        unknownEffect
          ? `unknown_effect: ${toolError ?? 'Tool execution outcome is uncertain.'}`
          : (toolError ?? 'Tool execution failed.')
      )
    }
    case 'confirm_failed':
      await ctx.recordObservation(
        run,
        ctx.makeObservation(run, {
          stepId,
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
      await failStep('unknown_effect')
      return ctx.stop(
        'TOOL_FAILURE',
        `unknown_effect: approval confirmation failed: ${outcome.error}.`
      )
    case 'succeeded': {
      const observation = ctx.makeObservation(run, {
        stepId,
        stepNumber,
        type: 'TOOL_RESULT',
        source: 'TOOL',
        trust: 'UNTRUSTED',
        payload: {
          status: 'SUCCEEDED',
          sideEffect: tool.sideEffect,
          output: boundedPayload(
            outcome.result.output,
            ctx.maxObservationPayloadChars
          )
        },
        summary: stringifySummary(
          outcome.result.output,
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
      if (pipeline.logFailure) {
        // F04: the effect is recorded as done (no replay), but the run stops
        // terminally instead of continuing on an unlogged result.
        return ctx.stop('INSUFFICIENT_EVIDENCE', pipeline.logFailure.response)
      }
      return { kind: 'continue' }
    }
  }
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
  const outcome = await runModelCall(ctx.kernel(run), ctx.turn(run), {
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
  })
  switch (outcome.kind) {
    case 'stopped':
      return {
        stopReason: outcome.gate.stopReason,
        response: outcome.gate.response
      }
    case 'deadline':
      return {
        stopReason: 'MAX_DURATION',
        response: 'Duration budget exhausted during response composition.'
      }
    case 'cancelled':
      return { stopReason: 'CANCELLED', response: CANCELLED_RESPONSE }
    case 'failed':
      return {
        stopReason: 'MODEL_FAILURE',
        response: `Response composition failed: ${outcome.error}.`
      }
    case 'unrecorded':
      // F04: the call happened; count it, but never treat it as an answer.
      run.usage.modelCalls += 1
      run.usage.inputTokens += outcome.result.inputTokens
      run.usage.outputTokens += outcome.result.outputTokens
      run.usage.costUsd += outcome.result.costUsd
      return {
        stopReason: outcome.gate.stopReason,
        response: outcome.gate.response
      }
    case 'completed': {
      const model = outcome.result
      run.usage.modelCalls += 1
      run.usage.inputTokens += model.inputTokens
      run.usage.outputTokens += model.outputTokens
      run.usage.costUsd += model.costUsd
      const afterUsage = ctx.checkAfterUsage(run)
      if (afterUsage) {
        return { stopReason: afterUsage.reason, response: afterUsage.response }
      }
      return { response: model.text }
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
