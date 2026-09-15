import type {
  ApprovalEngine,
  ApprovalId,
  ApprovalExecutionHandle,
  ApprovalExecutionRequest,
  AuditSink,
  HarnessRuntime,
  ModelGateway,
  Orchestrator,
  PolicyEngine,
  RuntimeInput,
  RuntimeResult,
  TelemetryEvent,
  TelemetrySink,
  ToolDefinition,
  ToolDescriptor,
  ToolRegistry,
  ToolResult
} from '@cvg/harness-contracts'

export interface HarnessRuntimeOptions {
  readonly orchestrator: Orchestrator
  readonly modelGateway: ModelGateway
  readonly policy: PolicyEngine
  readonly approvals: ApprovalEngine
  readonly tools: ToolRegistry
  readonly capabilityFingerprint?: string
  readonly audit: AuditSink
  readonly telemetry: TelemetrySink
}

interface ResultValues {
  readonly response: string
  readonly stopReason: RuntimeResult['stopReason']
  readonly approvalId?: RuntimeResult['approvalId']
  readonly modelCalls: number
  readonly toolCalls: number
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly costUsd?: number
  readonly toolResult?: ToolResult
}

interface ExecutionMetadata {
  policy: string | null
  approval: ApprovalId | null
  tool: string | null
  provider: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  toolDurationMs: number
}

function stringifyOutput(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasValidBoundaryInput(input: RuntimeInput): boolean {
  const identityValues = [
    input.agent?.id,
    input.agent?.version,
    input.tenantId,
    input.conversationId,
    input.sessionId,
    input.correlationId,
    input.traceId
  ]
  const budgetValues = [
    input.budget?.maxSteps,
    input.budget?.maxModelCalls,
    input.budget?.maxToolCalls,
    input.budget?.maxDurationMs,
    input.budget?.maxCostUsd,
    input.budget?.maxTokens
  ]

  return (
    identityValues.every(isNonEmptyString) &&
    budgetValues.every(
      (value) =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0
    )
  )
}

const DEADLINE_EXCEEDED = Symbol('harness-deadline-exceeded')

function describeTool(tool: ToolDefinition): ToolDescriptor {
  const { execute, ...descriptor } = tool
  void execute
  return descriptor
}

function bindCapabilityFingerprint(
  payload: unknown,
  capabilityFingerprint: string | undefined
): unknown {
  return capabilityFingerprint
    ? { capabilityFingerprint, input: payload }
    : payload
}

/**
 * The Phase 0/1 runtime preserves the current single-pass behavior while
 * making governance and provider boundaries explicit. It does not implement
 * a loop, planner, autonomous retry, or multi-agent execution.
 */
export class SinglePassGovernedRuntime implements HarnessRuntime {
  public constructor(private readonly options: HarnessRuntimeOptions) {}

  public async execute(input: RuntimeInput): Promise<RuntimeResult> {
    const startedAt = Date.now()
    const metadata: ExecutionMetadata = {
      policy: null,
      approval: null,
      tool: null,
      provider: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      toolDurationMs: 0
    }

    if (!hasValidBoundaryInput(input)) {
      return this.finish(
        input,
        this.result({
          response: 'Runtime identity or execution budget is invalid.',
          stopReason: 'UNSAFE_REQUEST',
          modelCalls: 0,
          toolCalls: 0
        }),
        metadata,
        startedAt
      )
    }

    if (input.budget.maxSteps < 1) {
      return this.finish(
        input,
        this.result({
          response: 'Execution budget exhausted before the first step.',
          stopReason: 'MAX_STEPS',
          modelCalls: 0,
          toolCalls: 0
        }),
        metadata,
        startedAt
      )
    }

    if (input.budget.maxDurationMs < 1) {
      return this.finish(
        input,
        this.result({
          response: 'Execution duration budget is not available.',
          stopReason: 'MAX_DURATION',
          modelCalls: 0,
          toolCalls: 0
        }),
        metadata,
        startedAt
      )
    }

    try {
      const remainingMs = this.remainingMs(input, startedAt)
      if (remainingMs <= 0) {
        return this.finish(
          input,
          this.result({
            response: 'Duration budget exhausted before planning.',
            stopReason: 'MAX_DURATION',
            modelCalls: 0,
            toolCalls: 0
          }),
          metadata,
          startedAt
        )
      }

      const decisionOrDeadline = await this.withDeadline(
        this.options.orchestrator.decideNextStep({
          runtime: input,
          availableTools: this.availableTools(input),
          step: 1
        }),
        remainingMs
      )

      if (decisionOrDeadline === DEADLINE_EXCEEDED) {
        return this.finish(
          input,
          this.result({
            response: 'Duration budget exhausted while planning.',
            stopReason: 'MAX_DURATION',
            modelCalls: 0,
            toolCalls: 0
          }),
          metadata,
          startedAt
        )
      }

      const decision = decisionOrDeadline

      switch (decision.action) {
        case 'RESPOND':
          return this.respond(input, decision.response, metadata, startedAt)
        case 'CALL_TOOL':
          return this.callTool(
            input,
            decision.toolInvocation,
            metadata,
            startedAt
          )
        case 'ASK_USER':
          return this.finish(
            input,
            this.result({
              response:
                decision.response ??
                decision.reason ??
                'More information is required.',
              stopReason: 'NEEDS_USER_INPUT',
              modelCalls: 0,
              toolCalls: 0
            }),
            metadata,
            startedAt
          )
        case 'REQUEST_APPROVAL':
          return this.finish(
            input,
            this.result({
              response:
                decision.response ??
                decision.reason ??
                'Approval is required before continuing.',
              stopReason: 'APPROVAL_REQUIRED',
              modelCalls: 0,
              toolCalls: 0
            }),
            metadata,
            startedAt
          )
        case 'HANDOFF':
          return this.finish(
            input,
            this.result({
              response:
                decision.response ??
                decision.reason ??
                'Human takeover is required.',
              stopReason: 'HUMAN_TAKEOVER',
              modelCalls: 0,
              toolCalls: 0
            }),
            metadata,
            startedAt
          )
        case 'STOP':
          return this.finish(
            input,
            this.result({
              response:
                decision.response ?? decision.reason ?? 'Execution stopped.',
              stopReason: 'INSUFFICIENT_EVIDENCE',
              modelCalls: 0,
              toolCalls: 0
            }),
            metadata,
            startedAt
          )
        case 'RETRIEVE':
        case 'VERIFY':
          return this.finish(
            input,
            this.result({
              response:
                'This single-pass compatibility runtime does not execute retrieval or verification steps.',
              stopReason: 'INSUFFICIENT_EVIDENCE',
              modelCalls: 0,
              toolCalls: 0
            }),
            metadata,
            startedAt
          )
      }
    } catch (error) {
      return this.finish(
        input,
        this.result({
          response: `Execution could not be planned: ${errorMessage(error)}.`,
          stopReason: 'INSUFFICIENT_EVIDENCE',
          modelCalls: 0,
          toolCalls: 0
        }),
        metadata,
        startedAt
      )
    }
  }

  private async respond(
    input: RuntimeInput,
    response: string | undefined,
    metadata: ExecutionMetadata,
    startedAt: number
  ): Promise<RuntimeResult> {
    if (response?.trim()) {
      return this.finish(
        input,
        this.result({
          response,
          stopReason: 'COMPLETED',
          modelCalls: 0,
          toolCalls: 0
        }),
        metadata,
        startedAt
      )
    }

    if (input.budget.maxModelCalls < 1) {
      return this.finish(
        input,
        this.result({
          response:
            'Model-call budget exhausted before a response was generated.',
          stopReason: 'MAX_MODEL_CALLS',
          modelCalls: 0,
          toolCalls: 0
        }),
        metadata,
        startedAt
      )
    }

    try {
      const remainingMs = this.remainingMs(input, startedAt)
      if (remainingMs <= 0) {
        return this.finish(
          input,
          this.result({
            response: 'Duration budget exhausted before model execution.',
            stopReason: 'MAX_DURATION',
            modelCalls: 0,
            toolCalls: 0
          }),
          metadata,
          startedAt
        )
      }

      const modelResultOrDeadline = await this.withDeadline(
        this.options.modelGateway.complete({
          messages: [
            {
              role: 'system',
              content: `${input.agent.objective}\n${input.agent.instructions.join('\n')}`
            },
            { role: 'user', content: input.userMessage }
          ],
          context: input.context,
          budget: input.budget,
          correlationId: input.correlationId
        }),
        remainingMs
      )

      if (modelResultOrDeadline === DEADLINE_EXCEEDED) {
        return this.finish(
          input,
          this.result({
            response: 'Duration budget exhausted during model execution.',
            stopReason: 'MAX_DURATION',
            modelCalls: 1,
            toolCalls: 0
          }),
          metadata,
          startedAt
        )
      }

      const modelResult = modelResultOrDeadline

      metadata.provider = modelResult.provider
      metadata.inputTokens = modelResult.inputTokens
      metadata.outputTokens = modelResult.outputTokens
      metadata.costUsd = modelResult.costUsd

      if (
        modelResult.inputTokens + modelResult.outputTokens >
        input.budget.maxTokens
      ) {
        return this.finish(
          input,
          this.result({
            response:
              'Token budget exhausted before a response could be completed.',
            stopReason: 'MAX_TOKENS',
            modelCalls: 1,
            toolCalls: 0,
            inputTokens: modelResult.inputTokens,
            outputTokens: modelResult.outputTokens,
            costUsd: modelResult.costUsd
          }),
          metadata,
          startedAt
        )
      }

      if (modelResult.costUsd > input.budget.maxCostUsd) {
        return this.finish(
          input,
          this.result({
            response:
              'Cost budget exhausted before a response could be completed.',
            stopReason: 'MAX_COST',
            modelCalls: 1,
            toolCalls: 0,
            inputTokens: modelResult.inputTokens,
            outputTokens: modelResult.outputTokens,
            costUsd: modelResult.costUsd
          }),
          metadata,
          startedAt
        )
      }

      if (Date.now() - startedAt > input.budget.maxDurationMs) {
        return this.finish(
          input,
          this.result({
            response:
              'Duration budget exhausted before a response could be completed.',
            stopReason: 'MAX_DURATION',
            modelCalls: 1,
            toolCalls: 0,
            inputTokens: modelResult.inputTokens,
            outputTokens: modelResult.outputTokens,
            costUsd: modelResult.costUsd
          }),
          metadata,
          startedAt
        )
      }

      return this.finish(
        input,
        this.result({
          response: modelResult.text,
          stopReason: 'COMPLETED',
          modelCalls: 1,
          toolCalls: 0,
          inputTokens: modelResult.inputTokens,
          outputTokens: modelResult.outputTokens,
          costUsd: modelResult.costUsd
        }),
        metadata,
        startedAt
      )
    } catch (error) {
      return this.finish(
        input,
        this.result({
          response: `Model execution failed: ${errorMessage(error)}.`,
          stopReason: 'MODEL_FAILURE',
          modelCalls: 1,
          toolCalls: 0
        }),
        metadata,
        startedAt
      )
    }
  }

  private async callTool(
    input: RuntimeInput,
    requestedInvocation: RuntimeInput['requestedTool'] | undefined,
    metadata: ExecutionMetadata,
    startedAt: number
  ): Promise<RuntimeResult> {
    const invocation = requestedInvocation ?? input.requestedTool
    let approvalExecutionRequest: ApprovalExecutionRequest | undefined
    let approvalExecution: ApprovalExecutionHandle | undefined

    if (!invocation) {
      return this.finish(
        input,
        this.result({
          response: 'No tool invocation was supplied.',
          stopReason: 'TOOL_FAILURE',
          modelCalls: 0,
          toolCalls: 0
        }),
        metadata,
        startedAt
      )
    }

    if (input.budget.maxToolCalls < 1) {
      return this.finish(
        input,
        this.result({
          response: 'Tool-call budget exhausted before the tool could run.',
          stopReason: 'MAX_TOOL_CALLS',
          modelCalls: 0,
          toolCalls: 0
        }),
        metadata,
        startedAt
      )
    }

    const tool = this.options.tools.resolve(
      invocation.toolId,
      invocation.toolVersion
    )
    metadata.tool = invocation.toolId

    if (!tool) {
      return this.finish(
        input,
        this.result({
          response: `Tool "${invocation.toolId}" is unavailable.`,
          stopReason: 'TOOL_FAILURE',
          modelCalls: 0,
          toolCalls: 1
        }),
        metadata,
        startedAt
      )
    }

    if (input.agent.tools.length > 0 && !input.agent.tools.includes(tool.id)) {
      return this.finish(
        input,
        this.result({
          response: `Tool "${tool.id}" is not exposed to this agent profile.`,
          stopReason: 'POLICY_DENIED',
          modelCalls: 0,
          toolCalls: 0
        }),
        metadata,
        startedAt
      )
    }

    let policyDecision
    try {
      const remainingMs = this.remainingMs(input, startedAt)
      if (remainingMs <= 0) {
        return this.finish(
          input,
          this.result({
            response: 'Duration budget exhausted before policy evaluation.',
            stopReason: 'MAX_DURATION',
            modelCalls: 0,
            toolCalls: 0
          }),
          metadata,
          startedAt
        )
      }

      const policyDecisionOrDeadline = await this.withDeadline(
        this.options.policy.evaluate({
          tenantId: input.tenantId,
          agentId: input.agent.id,
          action: 'tool.execute',
          tool,
          invocation,
          correlationId: input.correlationId
        }),
        remainingMs
      )

      if (policyDecisionOrDeadline === DEADLINE_EXCEEDED) {
        return this.finish(
          input,
          this.result({
            response: 'Duration budget exhausted during policy evaluation.',
            stopReason: 'MAX_DURATION',
            modelCalls: 0,
            toolCalls: 0
          }),
          metadata,
          startedAt
        )
      }

      policyDecision = policyDecisionOrDeadline
      metadata.policy = policyDecision.outcome

      if (
        policyDecision.outcome !== 'ALLOW' &&
        policyDecision.outcome !== 'DENY' &&
        policyDecision.outcome !== 'REQUIRE_APPROVAL' &&
        policyDecision.outcome !== 'HANDOFF'
      ) {
        return this.finish(
          input,
          this.result({
            response: 'Policy returned an unsupported decision.',
            stopReason: 'INSUFFICIENT_EVIDENCE',
            modelCalls: 0,
            toolCalls: 0
          }),
          metadata,
          startedAt
        )
      }
    } catch (error) {
      return this.finish(
        input,
        this.result({
          response: `Policy evaluation failed: ${errorMessage(error)}.`,
          stopReason: 'INSUFFICIENT_EVIDENCE',
          modelCalls: 0,
          toolCalls: 0
        }),
        metadata,
        startedAt
      )
    }

    if (policyDecision.outcome === 'DENY') {
      return this.finish(
        input,
        this.result({
          response: policyDecision.reason,
          stopReason: 'POLICY_DENIED',
          modelCalls: 0,
          toolCalls: 0
        }),
        metadata,
        startedAt
      )
    }

    if (policyDecision.outcome === 'HANDOFF') {
      return this.finish(
        input,
        this.result({
          response: policyDecision.reason,
          stopReason: 'HUMAN_TAKEOVER',
          modelCalls: 0,
          toolCalls: 0
        }),
        metadata,
        startedAt
      )
    }

    if (
      policyDecision.outcome === 'REQUIRE_APPROVAL' ||
      tool.requiresApproval
    ) {
      try {
        const remainingMs = this.remainingMs(input, startedAt)
        if (remainingMs <= 0) {
          return this.finish(
            input,
            this.result({
              response: 'Duration budget exhausted before approval evaluation.',
              stopReason: 'MAX_DURATION',
              modelCalls: 0,
              toolCalls: 0
            }),
            metadata,
            startedAt
          )
        }

        const approvalOrDeadline = await this.withDeadline(
          this.options.approvals.request({
            tenantId: input.tenantId,
            agentId: input.agent.id,
            operationKey: invocation.operationKey,
            toolId: tool.id,
            summary: tool.description,
            correlationId: input.correlationId,
            executionRef: input.executionId ?? input.correlationId,
            operatorId: input.agent.id,
            agentVersion: input.agent.version,
            action: 'tool.execute',
            resource: { type: 'tool', id: tool.id },
            payload: bindCapabilityFingerprint(
              invocation.input,
              this.options.capabilityFingerprint
            ),
            policyVersion: policyDecision.policyVersion
          }),
          remainingMs
        )

        if (approvalOrDeadline === DEADLINE_EXCEEDED) {
          return this.finish(
            input,
            this.result({
              response: 'Duration budget exhausted during approval evaluation.',
              stopReason: 'MAX_DURATION',
              modelCalls: 0,
              toolCalls: 0
            }),
            metadata,
            startedAt
          )
        }

        const approval = approvalOrDeadline

        if (
          approval.status !== 'APPROVED' &&
          approval.status !== 'DENIED' &&
          approval.status !== 'PENDING'
        ) {
          return this.finish(
            input,
            this.result({
              response: 'Approval returned an unsupported decision.',
              stopReason: 'INSUFFICIENT_EVIDENCE',
              modelCalls: 0,
              toolCalls: 0
            }),
            metadata,
            startedAt
          )
        }

        if (approval.status === 'PENDING') {
          return this.finish(
            input,
            this.result({
              response: approval.reason,
              stopReason: 'APPROVAL_REQUIRED',
              ...(approval.approvalId
                ? { approvalId: approval.approvalId }
                : {}),
              modelCalls: 0,
              toolCalls: 0
            }),
            metadata,
            startedAt
          )
        }

        if (approval.status === 'DENIED') {
          return this.finish(
            input,
            this.result({
              response: approval.reason,
              stopReason: 'POLICY_DENIED',
              ...(approval.approvalId
                ? { approvalId: approval.approvalId }
                : {}),
              modelCalls: 0,
              toolCalls: 0
            }),
            metadata,
            startedAt
          )
        }

        if (!approval.approvalId) {
          return this.finish(
            input,
            this.result({
              response: 'Approved execution has no approval identifier.',
              stopReason: 'INSUFFICIENT_EVIDENCE',
              modelCalls: 0,
              toolCalls: 0
            }),
            metadata,
            startedAt
          )
        }

        metadata.approval = approval.approvalId ?? null
        approvalExecutionRequest = {
          tenantId: input.tenantId,
          approvalId: approval.approvalId,
          agentId: input.agent.id,
          agentVersion: input.agent.version,
          action: 'tool.execute',
          resource: { type: 'tool', id: tool.id },
          payload: bindCapabilityFingerprint(
            invocation.input,
            this.options.capabilityFingerprint
          ),
          policyVersion: policyDecision.policyVersion,
          operationKey: invocation.operationKey,
          executionRef: input.executionId ?? input.correlationId
        }
      } catch (error) {
        return this.finish(
          input,
          this.result({
            response: `Approval evaluation failed: ${errorMessage(error)}.`,
            stopReason: 'INSUFFICIENT_EVIDENCE',
            modelCalls: 0,
            toolCalls: 0
          }),
          metadata,
          startedAt
        )
      }
    }

    const approvalExecutionPort = this.options.approvals.execution
    if (approvalExecutionRequest && approvalExecutionPort) {
      const remainingMs = this.remainingMs(input, startedAt)
      if (remainingMs <= 0) {
        return this.finish(
          input,
          this.result({
            response: 'Duration budget exhausted before approval execution.',
            stopReason: 'MAX_DURATION',
            approvalId: approvalExecutionRequest.approvalId,
            modelCalls: 0,
            toolCalls: 0
          }),
          metadata,
          startedAt
        )
      }
      try {
        const executionOrDeadline = await this.withDeadline(
          approvalExecutionPort.begin(approvalExecutionRequest),
          remainingMs
        )
        if (executionOrDeadline === DEADLINE_EXCEEDED) {
          return this.finish(
            input,
            this.result({
              response: 'Approval execution reservation timed out.',
              stopReason: 'INSUFFICIENT_EVIDENCE',
              approvalId: approvalExecutionRequest.approvalId,
              modelCalls: 0,
              toolCalls: 0
            }),
            metadata,
            startedAt
          )
        }
        approvalExecution = executionOrDeadline
      } catch (error) {
        return this.finish(
          input,
          this.result({
            response: `Approval could not be consumed safely: ${errorMessage(error)}.`,
            stopReason: 'INSUFFICIENT_EVIDENCE',
            approvalId: approvalExecutionRequest.approvalId,
            modelCalls: 0,
            toolCalls: 0
          }),
          metadata,
          startedAt
        )
      }
    }

    const toolStartedAt = Date.now()
    const toolAbortController = new AbortController()
    let toolResult: ToolResult
    let toolThrew = false
    try {
      const remainingMs = this.remainingMs(input, startedAt)
      if (remainingMs <= 0) {
        return this.finish(
          input,
          this.result({
            response: 'Duration budget exhausted before tool execution.',
            stopReason: 'MAX_DURATION',
            modelCalls: 0,
            toolCalls: 0
          }),
          metadata,
          startedAt
        )
      }

      const toolResultOrDeadline = await this.withDeadline(
        tool.execute(invocation.input, {
          tenantId: input.tenantId,
          agentId: input.agent.id,
          correlationId: input.correlationId,
          traceId: input.traceId,
          operationKey: invocation.operationKey,
          signal: toolAbortController.signal
        }),
        remainingMs
      )

      if (toolResultOrDeadline === DEADLINE_EXCEEDED) {
        toolAbortController.abort()
        metadata.toolDurationMs = Date.now() - toolStartedAt
        if (
          approvalExecution &&
          approvalExecutionRequest &&
          approvalExecutionPort
        ) {
          await approvalExecutionPort
            .uncertain({
              request: approvalExecutionRequest,
              reservationId: approvalExecution.reservationId,
              reason:
                'Tool execution exceeded its deadline after approval execution started.',
              evidenceRef: `${approvalExecutionRequest.executionRef}:tool_deadline`
            })
            .catch(() => undefined)
        }
        return this.finish(
          input,
          this.result({
            response: approvalExecution
              ? 'unknown_effect: duration budget exhausted during tool execution.'
              : 'Duration budget exhausted during tool execution.',
            stopReason: approvalExecution ? 'TOOL_FAILURE' : 'MAX_DURATION',
            ...(approvalExecutionRequest
              ? { approvalId: approvalExecutionRequest.approvalId }
              : {}),
            modelCalls: 0,
            toolCalls: 1
          }),
          metadata,
          startedAt
        )
      }

      toolResult = toolResultOrDeadline
    } catch (error) {
      toolThrew = true
      toolResult = {
        status: 'FAILED',
        error: errorMessage(error)
      }
    }
    metadata.toolDurationMs = Date.now() - toolStartedAt

    if (toolResult.status !== 'SUCCEEDED') {
      if (
        approvalExecution &&
        approvalExecutionRequest &&
        approvalExecutionPort
      ) {
        if (toolThrew) {
          await approvalExecutionPort
            .uncertain({
              request: approvalExecutionRequest,
              reservationId: approvalExecution.reservationId,
              reason: `Tool executor threw after approval execution started: ${toolResult.error ?? 'unknown failure'}`,
              evidenceRef: `${approvalExecutionRequest.executionRef}:tool_uncertain`
            })
            .catch(() => undefined)
        } else {
          await approvalExecutionPort
            .fail({
              request: approvalExecutionRequest,
              reservationId: approvalExecution.reservationId,
              evidenceRef: `${approvalExecutionRequest.executionRef}:tool_failed`
            })
            .catch(() => undefined)
        }
      }
      return this.finish(
        input,
        this.result({
          response:
            toolThrew && approvalExecution
              ? `unknown_effect: ${toolResult.error ?? 'Tool execution outcome is uncertain.'}`
              : (toolResult.error ?? 'Tool execution failed.'),
          stopReason: 'TOOL_FAILURE',
          ...(approvalExecutionRequest
            ? { approvalId: approvalExecutionRequest.approvalId }
            : {}),
          modelCalls: 0,
          toolCalls: 1,
          toolResult
        }),
        metadata,
        startedAt
      )
    }

    if (
      approvalExecution &&
      approvalExecutionRequest &&
      approvalExecutionPort
    ) {
      try {
        await approvalExecutionPort.complete({
          request: approvalExecutionRequest,
          reservationId: approvalExecution.reservationId,
          evidenceRef: `${approvalExecutionRequest.executionRef}:tool_confirmed`
        })
      } catch (error) {
        return this.finish(
          input,
          this.result({
            response: `unknown_effect: approval confirmation failed: ${errorMessage(error)}.`,
            stopReason: 'TOOL_FAILURE',
            approvalId: approvalExecutionRequest.approvalId,
            modelCalls: 0,
            toolCalls: 1,
            toolResult
          }),
          metadata,
          startedAt
        )
      }
    }

    if (Date.now() - startedAt > input.budget.maxDurationMs) {
      return this.finish(
        input,
        this.result({
          response: 'Duration budget exhausted after tool execution.',
          stopReason: 'MAX_DURATION',
          modelCalls: 0,
          toolCalls: 1,
          toolResult
        }),
        metadata,
        startedAt
      )
    }

    return this.finish(
      input,
      this.result({
        response: stringifyOutput(
          toolResult.output ?? 'Tool completed successfully.'
        ),
        stopReason: 'COMPLETED',
        ...(metadata.approval ? { approvalId: metadata.approval } : {}),
        modelCalls: 0,
        toolCalls: 1,
        toolResult
      }),
      metadata,
      startedAt
    )
  }

  private remainingMs(input: RuntimeInput, startedAt: number): number {
    return input.budget.maxDurationMs - (Date.now() - startedAt)
  }

  private availableTools(input: RuntimeInput): readonly ToolDescriptor[] {
    const allowed = input.agent.tools
    return this.options.tools
      .list()
      .filter((tool) => allowed.length === 0 || allowed.includes(tool.id))
      .map(describeTool)
  }

  private async withDeadline<T>(
    operation: Promise<T>,
    remainingMs: number
  ): Promise<T | typeof DEADLINE_EXCEEDED> {
    if (remainingMs <= 0) {
      return DEADLINE_EXCEEDED
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<typeof DEADLINE_EXCEEDED>((resolve) => {
      timer = setTimeout(() => resolve(DEADLINE_EXCEEDED), remainingMs)
    })

    try {
      return await Promise.race([operation, deadline])
    } finally {
      if (timer) {
        clearTimeout(timer)
      }
    }
  }

  private result(values: ResultValues): RuntimeResult {
    return {
      response: values.response,
      stopReason: values.stopReason,
      ...(values.approvalId !== undefined
        ? { approvalId: values.approvalId }
        : {}),
      steps: 1,
      modelCalls: values.modelCalls,
      toolCalls: values.toolCalls,
      usage: {
        inputTokens: values.inputTokens ?? 0,
        outputTokens: values.outputTokens ?? 0,
        costUsd: values.costUsd ?? 0
      },
      ...(values.toolResult ? { toolResult: values.toolResult } : {})
    }
  }

  private async finish(
    input: RuntimeInput,
    result: RuntimeResult,
    metadata: ExecutionMetadata,
    startedAt: number
  ): Promise<RuntimeResult> {
    let finalResult = result
    try {
      const remainingMs = this.remainingMs(input, startedAt)
      if (remainingMs <= 0) {
        throw new Error('audit deadline exceeded')
      }

      const auditResult = await this.withDeadline(
        this.options.audit.append({
          actor: input.agent.id,
          agent: input.agent.id,
          tenant: input.tenantId,
          action: 'harness.single_pass',
          policy: metadata.policy,
          approval: metadata.approval,
          tool: metadata.tool,
          result: result.stopReason,
          timestamp: new Date().toISOString(),
          traceId: input.traceId,
          correlationId: input.correlationId
        }),
        remainingMs
      )

      if (auditResult === DEADLINE_EXCEEDED) {
        throw new Error('audit deadline exceeded')
      }
    } catch {
      finalResult = {
        ...result,
        response:
          'Execution could not be completed because audit recording failed.',
        stopReason: 'INSUFFICIENT_EVIDENCE'
      }
    }

    const telemetry: TelemetryEvent = {
      name: 'harness.single_pass',
      latencyMs: Date.now() - startedAt,
      errors: finalResult.stopReason === 'COMPLETED' ? 0 : 1,
      costUsd: finalResult.usage.costUsd,
      inputTokens: finalResult.usage.inputTokens,
      outputTokens: finalResult.usage.outputTokens,
      provider: metadata.provider,
      toolDurationMs: metadata.toolDurationMs,
      steps: finalResult.steps,
      traceId: input.traceId,
      correlationId: input.correlationId
    }

    try {
      this.options.telemetry.record(telemetry)
    } catch {
      // Observability must not turn a governed result into an unhandled error.
    }

    return finalResult
  }
}
