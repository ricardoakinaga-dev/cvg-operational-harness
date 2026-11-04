import { createCorrelationId, redactSensitiveText } from '@cvg/shared'
import {
  createOperationalHarness,
  composeCapabilities,
  InMemoryEffectJournal,
  InMemoryExecutionStepStore
} from '@cvg/harness'
import { STOP_REASONS } from '@cvg/harness-contracts'
import type {
  RuntimeInput,
  RuntimeResult,
  StopReason,
  IterativeOrchestrator,
  CompletionEvaluator,
  AgentId,
  AgentVersion,
  TenantId,
  TraceId,
  CorrelationId,
  ConversationId,
  SessionId
} from '@cvg/harness-contracts'
import type {
  AgentConfig,
  AgentVersionRecord,
  TestRunTrace
} from './contracts.ts'
import type {
  ControlledAgentExecutionInput,
  ControlledTraceTiming
} from './test-lab.ts'
import type { ModelProvider } from './model-provider.ts'
import {
  CONTROLLED_SAFE_OUTPUTS,
  enforceControlledOutput
} from './output-policy.ts'
import {
  gatewayCore,
  reviewedDescriptor,
  prepareCapabilityCommand
} from './plugin-execution-core.ts'
import {
  InvocationEvidenceState,
  guardedPorts,
  controlledPolicy,
  controlledApprovals,
  controlledRegistration,
  type ControlledKernelCompositionPorts
} from './controlled-kernel-adapters.ts'
import {
  projectControlledTools,
  type ControlledAttempt
} from './controlled-execution-plan.ts'
import { canonicalizeCapabilityInput } from './approval-authority.ts'

export function createLocalControlledPorts(): ControlledKernelCompositionPorts {
  const audit: unknown[] = []
  const log: unknown[] = []
  const effects: unknown[] = []
  return {
    effectJournal: new InMemoryEffectJournal(),
    stepStore: new InMemoryExecutionStepStore(),
    audit: {
      append: async (event) => {
        audit.push(structuredClone(event))
      }
    },
    telemetry: { record: () => undefined },
    log: {
      append: (event) => {
        log.push(structuredClone(event))
      }
    },
    effects: {
      started: (ref) => {
        effects.push({ ...ref, phase: 'started' })
      },
      finished: (ref, outcome) => {
        effects.push({ ...ref, outcome, phase: 'finished' })
      }
    },
    pause: { isPaused: () => false }
  }
}
export interface ControlledKernelInput {
  input: ControlledAgentExecutionInput
  version: AgentVersionRecord
  config: AgentConfig
  intent: string
  policy: TestRunTrace['policy'][number]
  risk: NonNullable<TestRunTrace['risk']>
  response: TestRunTrace['response']
  promptWithHistory: string
  sourceIds: readonly string[]
  provider: ModelProvider
  timing: ControlledTraceTiming
  emit: (
    name:
      | 'model.before'
      | 'model.after'
      | 'model.error'
      | 'policy.output.before'
      | 'policy.output.after'
      | 'tool.before'
      | 'tool.after'
      | 'tool.error',
    payload: Record<string, unknown>
  ) => Promise<void>
}

/** Only internal synthetic tests can supply ports. No HTTP/config option is added. */
export async function executeControlledKernel(
  prepared: ControlledKernelInput,
  ports: ControlledKernelCompositionPorts = createLocalControlledPorts()
) {
  const { input, config, version, timing } = prepared
  const attempts: ControlledAttempt[] = []
  const evidence = new InvocationEvidenceState(
    attempts,
    ports.pause,
    input.tenantId
  )
  const guarded = guardedPorts(ports, evidence, input.onToolAudit)
  const core = gatewayCore(input.capabilityGateway)
  const inventory = config.plugins
    .flatMap((binding) =>
      !binding.enabled || !binding.version
        ? []
        : binding.allowedTools.flatMap((name) => {
            const resolved = core?.resolve(config, name)
            const descriptor = resolved && reviewedDescriptor(resolved)
            return descriptor ? [{ resolved, descriptor }] : []
          })
    )
    .filter(
      (item, index, all) =>
        all.findIndex(
          (other) =>
            other.descriptor.id === item.descriptor.id &&
            other.descriptor.version === item.descriptor.version
        ) === index
    )
  let scopeRejected = inventory.length > 128
  const catalog = scopeRejected ? [] : inventory
  let fingerprint = ''
  const composition = composeCapabilities(
    catalog.map(({ descriptor }) =>
      controlledRegistration(
        () =>
          attempts.find((a) => a.command.execution.toolName === descriptor.id),
        descriptor,
        evidence,
        () => fingerprint,
        (operation) => timing.measureAsync('tool', operation)
      )
    )
  )
  fingerprint = composition.fingerprint
  const correlationId = createCorrelationId()
  const agentVersion = `${version.id}:v${version.version}`
  let output: ReturnType<typeof enforceControlledOutput> | undefined
  let providerInvoked = false
  let names: string[] = []
  let planSealed = false
  let finalIssued = false
  let expectedStep = 1
  const stopDecision = () => ({
    decision: {
      decisionType: 'HANDOFF' as const,
      reasonCode: 'HANDOFF_REQUIRED' as const
    }
  })
  const planner: IterativeOrchestrator = {
    decide: async ({ context }) => {
      evidence.check()
      if (context.stepNumber !== expectedStep++)
        throw new Error('controlled_step_conflict')
      if (context.stepNumber === 1)
        return {
          decision: {
            decisionType: 'RESPOND',
            reasonCode: 'POLICY_REQUIRED',
            responseIntent: 'controlled_output_guard'
          }
        }
      if (!output) throw new Error('controlled_output_missing')
      if (!planSealed) {
        planSealed = true
        if (
          output.decision !== 'rewritten' &&
          prepared.risk.level !== 'high' &&
          prepared.risk.level !== 'critical'
        ) {
          if (input.capabilityGateway && !core) {
            scopeRejected = true
            return stopDecision()
          }
          const plans =
            input.capabilityGateway?.planTools(config, prepared.intent) ?? []
          names = plans.map((p) => p.toolName)
          const trusted = core?.catalog(config, prepared.intent) ?? []
          if (
            plans.length > 1 ||
            new Set(names).size !== names.length ||
            canonicalizeCapabilityInput(plans) !==
              canonicalizeCapabilityInput(trusted)
          )
            scopeRejected = true
          for (const plan of plans) {
            const r = core?.resolve(config, plan.toolName)
            if (
              !r ||
              r.plugin.manifest.name !== plan.plugin ||
              r.plugin.manifest.version !== plan.version ||
              !reviewedDescriptor(r) ||
              !catalog.some(
                (item) =>
                  item.descriptor.id === plan.toolName &&
                  item.descriptor.version === plan.version
              )
            )
              scopeRejected = true
          }
          if (scopeRejected) return stopDecision()
          for (const plan of plans) {
            if (!input.actor) {
              scopeRejected = true
              return stopDecision()
            }
            const resolved = core!.resolve(config, plan.toolName)!
            const command = prepareCapabilityCommand(
              {
                tenantId: input.tenantId,
                agentId: input.agentId,
                versionId: input.versionId,
                ...(input.traceId ? { traceId: input.traceId } : {}),
                config,
                toolName: plan.toolName,
                input: { message: redactSensitiveText(input.message) },
                actor: input.actor,
                policy: prepared.policy,
                dryRun: input.executionMode === 'TEST_LAB',
                ...(input.requireCapabilityApproval
                  ? { requireApproval: true }
                  : {})
              },
              resolved,
              true
            )
            if (!command) {
              scopeRejected = true
              return stopDecision()
            }
            attempts.push({
              command,
              phase: 'PENDING',
              closed: false,
              cause: null,
              policyAllowed: false,
              approvalRequired: false,
              approvalConsumed: false,
              resultAcknowledged: false,
              logAcknowledged: false,
              callbackAcknowledged: false,
              attempted: false,
              denied: false
            })
          }
        }
      }
      if (scopeRejected) return stopDecision()
      const index = context.stepNumber - 2
      const a = attempts[index]
      if (a) {
        if (index > 0 && !attempts[index - 1]?.resultAcknowledged)
          throw new Error('controlled_previous_unsettled')
        await prepared.emit('tool.before', {
          toolName: a.command.execution.toolName,
          dryRun: a.command.execution.dryRun
        })
        return {
          decision: {
            decisionType: 'CALL_TOOL',
            reasonCode: 'TOOL_REQUIRED',
            toolId: a.command.execution.toolName,
            toolVersion: a.command.resolved.plugin.manifest.version,
            toolInput: a.command.execution.input
          }
        }
      }
      if (
        context.stepNumber !== attempts.length + 2 ||
        attempts.some((a) => !a.resultAcknowledged)
      )
        throw new Error('controlled_final_unsettled')
      finalIssued = true
      return {
        decision: {
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseText: output.text,
          ...(attempts.length
            ? {
                selectedCapability:
                  attempts[attempts.length - 1]!.command.execution.toolName
              }
            : {})
        }
      }
    }
  }
  const evaluator: CompletionEvaluator = {
    evaluate: async ({ lastDecision }) => {
      evidence.check()
      const complete =
        finalIssued &&
        lastDecision?.decisionType === 'RESPOND' &&
        lastDecision.reasonCode === 'GOAL_SATISFIED' &&
        !!output &&
        attempts.every((a) => a.resultAcknowledged)
      return {
        outcome: complete ? 'COMPLETE' : 'INCOMPLETE',
        reasonCode: complete ? 'COMPLETION_CONFIRMED' : 'POLICY_REQUIRED',
        deterministic: true
      }
    }
  }
  const harness = createOperationalHarness({
    ...guarded,
    capabilities: composition.registry,
    defaultRuntimeProfile: 'iterative',
    iterativeOrchestrator: planner,
    completionEvaluator: evaluator,
    policy: controlledPolicy(evidence, core),
    approvals: controlledApprovals(
      evidence,
      core,
      () => fingerprint,
      agentVersion,
      correlationId,
      async (a) => {
        return (
          input.capabilityApproval ??
          (await input.resolveCapabilityApproval?.({
            tenantId: input.tenantId,
            agentId: input.agentId,
            versionId: input.versionId,
            toolName: a.command.execution.toolName,
            input: a.command.execution.input,
            actor: a.command.execution.actor
          })) ??
          undefined
        )
      }
    ),
    modelGateway: {
      complete: async (request) => {
        evidence.check()
        const context = request.context.values
        if (
          context.transformVersion !== 'controlled-model-v1' ||
          typeof context.promptWithHistory !== 'string' ||
          typeof context.fallbackText !== 'string' ||
          providerInvoked
        )
          throw new Error('controlled_model_binding_invalid')
        await prepared.emit('model.before', {
          provider: prepared.provider.name,
          model: config.model.model,
          promptLength: context.promptWithHistory.length
        })
        providerInvoked = true
        let raw: unknown
        try {
          raw = await timing.measureAsync('model', () =>
            prepared.provider.complete({
              prompt: context.promptWithHistory as string,
              fallbackText: context.fallbackText as string
            })
          )
        } catch {
          await prepared.emit('model.error', {
            provider: prepared.provider.name,
            model: config.model.model,
            reason: 'model_execution_failed'
          })
          throw new Error('controlled_model_failure')
        }
        evidence.check()
        const text =
          raw && typeof raw === 'object' && !Array.isArray(raw)
            ? (raw as { text?: unknown }).text
            : undefined
        await prepared.emit('model.after', {
          provider: prepared.provider.name,
          model: config.model.model,
          externalCall: false,
          responseLength: typeof text === 'string' ? text.length : 0
        })
        await prepared.emit('policy.output.before', {
          mode: prepared.response.mode,
          riskLevel: prepared.risk.level,
          responseLength: typeof text === 'string' ? text.length : 0
        })
        const guardedOutput = timing.measure('response', () =>
          enforceControlledOutput({
            text,
            mode: prepared.response.mode,
            riskLevel: prepared.risk.level
          })
        )
        output = guardedOutput
        evidence.outputAllowsTools =
          guardedOutput.decision !== 'rewritten' &&
          prepared.risk.level !== 'high' &&
          prepared.risk.level !== 'critical'
        await prepared.emit('policy.output.after', {
          ...guardedOutput,
          text: undefined,
          responseLength: guardedOutput.text.length
        })
        evidence.check()
        return {
          text: guardedOutput.text,
          provider: prepared.provider.name,
          model: config.model.model,
          inputTokens: Math.ceil(context.promptWithHistory.length / 4),
          outputTokens: Math.ceil(guardedOutput.text.length / 4),
          costUsd: 0
        }
      }
    }
  })
  const now = new Date().toISOString()
  const runtimeInput: RuntimeInput = {
    agent: {
      id: input.agentId as unknown as AgentId,
      version: agentVersion as AgentVersion,
      objective: 'Controlled configured response',
      instructions: [],
      skills: [],
      tools: catalog.map((x) => x.descriptor.id),
      policies: [config.policies.version]
    },
    tenantId: input.tenantId as unknown as TenantId,
    traceId: input.traceId as unknown as TraceId,
    correlationId: correlationId as unknown as CorrelationId,
    conversationId: (input.context?.conversationId ??
      `${input.traceId}:conversation`) as ConversationId,
    sessionId: (input.context?.sessionId ??
      `${input.traceId}:session`) as SessionId,
    userMessage: redactSensitiveText(input.message),
    runtimeProfile: 'iterative',
    signal: evidence.controller.signal,
    context: {
      values: {
        transformVersion: 'controlled-model-v1',
        promptWithHistory: redactSensitiveText(prepared.promptWithHistory),
        fallbackText: redactSensitiveText(prepared.response.text)
      },
      sourceIds: prepared.sourceIds,
      capturedAt: now
    },
    state: { version: 1, values: {}, updatedAt: now },
    budget: {
      maxSteps: catalog.length + 2,
      maxModelCalls: 1,
      maxToolCalls: catalog.length,
      maxDurationMs: config.model.timeoutMs,
      maxCostUsd: 0,
      maxTokens:
        Math.ceil(redactSensitiveText(prepared.promptWithHistory).length / 4) +
        1000,
      maxKnowledgeCalls: 0,
      maxReplans: 0,
      maxDecisionRepairs: 0,
      maxVerificationCalls: 2
    }
  }
  evidence.expiresAt = Date.now() + config.model.timeoutMs
  let result: RuntimeResult | undefined
  try {
    result = await harness.execute(runtimeInput)
  } catch {
    /* Invalid/throwing kernels project INTERNAL_FAILURE after preparation. */
  } finally {
    evidence.close()
  }
  const rawStop =
    result &&
    STOP_REASONS.includes(result.stopReason) &&
    typeof result.response === 'string' &&
    Number.isFinite(result.modelCalls) &&
    Number.isFinite(result.toolCalls) &&
    Number.isFinite(result.steps)
      ? result.stopReason
      : undefined
  let stop: StopReason = rawStop ?? 'INTERNAL_FAILURE'
  if (evidence.fault) stop = 'INSUFFICIENT_EVIDENCE'
  else if (scopeRejected) stop = 'UNSAFE_REQUEST'
  else {
    const admissionStop = attempts.find(
      (a) => a.cause && a.cause !== 'TERMINAL_BEFORE_ENTRY'
    )?.cause
    if (admissionStop && admissionStop !== 'TERMINAL_BEFORE_ENTRY')
      stop = admissionStop
    if (
      stop === 'COMPLETED' &&
      (!finalIssued || !output || attempts.some((a) => !a.resultAcknowledged))
    )
      stop = 'STATE_CONFLICT'
  }
  const tools = projectControlledTools(names, attempts, stop)
  for (const tool of tools) await prepared.emit('tool.after', { ...tool })
  return {
    stop,
    rawStop,
    output,
    tools,
    providerInvoked,
    result,
    attempts,
    evidence,
    response:
      stop === 'COMPLETED' && output
        ? { mode: output.mode, text: output.text }
        : { mode: 'handoff' as const, text: CONTROLLED_SAFE_OUTPUTS.handoff }
  }
}
