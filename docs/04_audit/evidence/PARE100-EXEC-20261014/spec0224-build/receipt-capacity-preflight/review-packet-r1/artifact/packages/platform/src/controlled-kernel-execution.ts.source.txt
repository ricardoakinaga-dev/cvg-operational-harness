import {
  createCorrelationId,
  redactSensitiveText,
  CorrelationIdSchema
} from '@cvg/shared'
import {
  createOperationalHarness,
  composeCapabilities,
  InMemoryEffectJournal,
  InMemoryExecutionStepStore
} from '@cvg/harness'
import { STOP_REASONS } from '@cvg/harness-contracts'
import type {
  RuntimeInput,
  BudgetUsage,
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
  prepareCapabilityCommand,
  rehydratePreparedCapabilityCommand
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
import { createPromptProfileSnapshot } from './prompt-profile.ts'
import {
  controlledInventory,
  controlledDigest,
  controlledCanonicalJson,
  ControlledContinuationRuntime,
  validateControlledSnapshot,
  type ControlledKernelHostContext,
  type ControlledPublishedSnapshot,
  type ControlledPublishedPrepared,
  type ControlledSerializedAttempt
} from './controlled-kernel-continuation.ts'

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
  ports: ControlledKernelCompositionPorts = createLocalControlledPorts(),
  host?: ControlledKernelHostContext
) {
  const { input, config, version, timing } = prepared
  const durable = host ? new ControlledContinuationRuntime(host) : undefined
  const attempts: ControlledAttempt[] = []
  const evidence = new InvocationEvidenceState(
    attempts,
    ports.pause,
    input.tenantId,
    durable
  )
  const guarded = guardedPorts(ports, evidence, input.onToolAudit)
  const emit: ControlledKernelInput['emit'] = async (name, payload) => {
    if (!durable) return prepared.emit(name, payload)
    // A planner callback remains inside its already ACKed intent; never nest phases.
    if (durable.activePhase && !durable.fault && !durable.closed)
      return prepared.emit(name, payload)
    await evidence.io(
      `callback.platform.${name}`,
      () => prepared.emit(name, payload),
      evidence.closed,
      { name, payload: JSON.parse(JSON.stringify(payload)) }
    )
  }
  const core = gatewayCore(input.capabilityGateway)
  const inventory = controlledInventory(config, input.capabilityGateway)
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
  const correlationId = host?.identity.correlationId ?? createCorrelationId()
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
  const sealPostOutputPlan = () => {
    if (!output) throw new Error('controlled_output_missing')

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
          true,
          host
            ? CorrelationIdSchema.parse(host.identity.correlationId)
            : undefined
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
  const plannerCore: IterativeOrchestrator = {
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
        if (host) throw new Error('controlled_durable_plan_missing')
        sealPostOutputPlan()
      }
      if (scopeRejected) return stopDecision()
      const index = context.stepNumber - 2
      const a = attempts[index]
      if (a) {
        if (index > 0 && !attempts[index - 1]?.resultAcknowledged)
          throw new Error('controlled_previous_unsettled')
        await emit('tool.before', {
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
  const planner: IterativeOrchestrator = {
    decide: async (request) => {
      if (durable) {
        await evidence.refreshPause()
        if (evidence.paused || evidence.controller.signal.aborted) {
          evidence.close()
          throw new Error('controlled_planner_veto')
        }
        return evidence.io('planner.decide', () => plannerCore.decide(request))
      }
      return plannerCore.decide(request)
    }
  }
  const evaluatorCore: CompletionEvaluator = {
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
  const evaluator: CompletionEvaluator = {
    evaluate: async (request) =>
      durable
        ? durable.evaluate(() => evaluatorCore.evaluate(request))
        : evaluatorCore.evaluate(request)
  }
  const composeHarness = () =>
    createOperationalHarness({
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
          if (durable) await evidence.refreshPause()
          if (
            durable &&
            (evidence.paused || evidence.controller.signal.aborted)
          ) {
            evidence.close()
            throw new Error('controlled_model_veto')
          }
          const context = request.context.values
          if (
            context.transformVersion !== 'controlled-model-v1' ||
            typeof context.promptWithHistory !== 'string' ||
            typeof context.fallbackText !== 'string' ||
            providerInvoked
          )
            throw new Error('controlled_model_binding_invalid')
          await emit('model.before', {
            provider: prepared.provider.name,
            model: config.model.model,
            promptLength: context.promptWithHistory.length
          })
          providerInvoked = true
          let raw: unknown
          try {
            const call = () =>
              timing.measureAsync('model', () =>
                prepared.provider.complete({
                  prompt: context.promptWithHistory as string,
                  fallbackText: context.fallbackText as string
                })
              )
            raw = durable
              ? await durable.run(
                  'model.request',
                  {
                    prompt: context.promptWithHistory,
                    fallbackText: context.fallbackText,
                    model: config.model.model,
                    fingerprint
                  },
                  call
                )
              : await call()
          } catch {
            await emit('model.error', {
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
          await emit('model.after', {
            provider: prepared.provider.name,
            model: config.model.model,
            externalCall: false,
            responseLength: typeof text === 'string' ? text.length : 0
          })
          await emit('policy.output.before', {
            mode: prepared.response.mode,
            riskLevel: prepared.risk.level,
            responseLength: typeof text === 'string' ? text.length : 0
          })
          const guardOutput = () =>
            timing.measure('response', () =>
              enforceControlledOutput({
                text,
                mode: prepared.response.mode,
                riskLevel: prepared.risk.level
              })
            )
          const guardedOutput = durable
            ? await durable.run(
                'policy.output',
                {
                  text:
                    typeof text === 'string' ? redactSensitiveText(text) : null,
                  mode: prepared.response.mode,
                  riskLevel: prepared.risk.level
                },
                guardOutput
              )
            : guardOutput()
          output = guardedOutput
          evidence.outputAllowsTools =
            guardedOutput.decision !== 'rewritten' &&
            prepared.risk.level !== 'high' &&
            prepared.risk.level !== 'critical'
          await emit('policy.output.after', {
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
  const now = host ? '1970-01-01T00:00:00.000Z' : new Date().toISOString()
  const runtimeInput: RuntimeInput = {
    ...(host
      ? {
          executionId: host.identity.executionId,
          capabilityFingerprint: fingerprint
        }
      : {}),
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
    conversationId: (host?.identity.conversationId ??
      input.context?.conversationId ??
      `${input.traceId}:conversation`) as ConversationId,
    sessionId: (host?.identity.sessionId ??
      input.context?.sessionId ??
      `${input.traceId}:session`) as SessionId,
    userMessage: redactSensitiveText(input.message),
    runtimeProfile: 'iterative',
    signal: evidence.controller.signal,
    context: {
      values: {
        transformVersion: 'controlled-model-v1',
        promptWithHistory: redactSensitiveText(prepared.promptWithHistory),
        fallbackText: redactSensitiveText(prepared.response.text),
        ...(host
          ? {
              adapterVersion: 'controlled-published-v1',
              requestDigest: host.identity.requestDigest,
              executionId: host.identity.executionId,
              tenantId: input.tenantId,
              traceId: input.traceId,
              capabilityFingerprint: fingerprint,
              configDigest: controlledDigest(config),
              promptChecksum: createPromptProfileSnapshot(version).checksum,
              modelProfile: {
                provider: prepared.provider.name,
                model: config.model.model,
                temperature: config.model.temperature,
                maxTokens: config.model.maxTokens,
                timeoutMs: config.model.timeoutMs,
                retries: 0
              },
              policyVersion: config.policies.version
            }
          : {})
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
  let latestSnapshot: ControlledPublishedSnapshot | null = null
  let latestBudgetUsage: BudgetUsage | undefined
  const serializeAttempts = (): ControlledSerializedAttempt[] => {
    const serialized = attempts.map((a) => {
      const { command, permit, ...data } = a
      void permit
      const { config: commandConfig, ...execution } = command.execution
      void commandConfig
      return {
        ...data,
        command: {
          execution,
          canonical: command.canonical,
          inputHash: command.inputHash,
          correlationId: command.correlationId,
          descriptorFingerprint: controlledDigest(
            reviewedDescriptor(command.resolved)
          ),
          ...(command.output ? { output: command.output } : {})
        }
      }
    })
    // No aliases to live receipt arrays or commands can alter an acknowledged seal.
    return JSON.parse(controlledCanonicalJson(serialized))
  }
  const durationTotals = () =>
    Object.fromEntries(
      Object.entries(timing.snapshot()).map(([key, value]) => [
        key,
        value +
          (host?.state.snapshot?.durationTotals?.[
            key as keyof ControlledPublishedSnapshot['durationTotals']
          ] ?? 0)
      ])
    )
  let result: RuntimeResult | undefined
  const abortHost = () => evidence.controller.abort()
  try {
    if (host && durable) {
      if (host.signal.aborted) throw new Error('controlled_attempt_cancelled')
      host.lifecycle.assertActive()
      const preparedState: ControlledPublishedPrepared = {
        schema: 'controlled-published-prepared-v1',
        requestDigest: host.identity.requestDigest,
        fingerprint,
        message: redactSensitiveText(input.message),
        history: input.history.map(redactSensitiveText),
        promptWithHistory: redactSensitiveText(prepared.promptWithHistory),
        intent: prepared.intent,
        policy: prepared.policy,
        risk: prepared.risk,
        response: prepared.response,
        sourceIds: [],
        configDigest: controlledDigest(config)
      }
      const { signal: ignoredSignal, ...serialRuntime } = runtimeInput
      void ignoredSignal
      controlledCanonicalJson(preparedState)
      controlledCanonicalJson(serialRuntime)
      const started = await durable.bounded(
        () =>
          host.continuation.startPrepared(
            host.identity,
            preparedState,
            serialRuntime
          ),
        false,
        config.model.timeoutMs
      )
      if (
        started.preparedDigest !== controlledDigest(preparedState) ||
        !Number.isFinite(Date.parse(started.startedAt)) ||
        !Number.isFinite(Date.parse(started.expiresAt)) ||
        Date.parse(started.expiresAt) - Date.parse(started.startedAt) !==
          config.model.timeoutMs ||
        (host.expiresAt !== null && host.expiresAt !== started.expiresAt)
      )
        throw new Error('controlled_prepared_binding')
      durable.preparedDigest = started.preparedDigest
      durable.expiresAt = Date.parse(started.expiresAt)
      evidence.expiresAt = durable.expiresAt
      durable.assertDispatch()
      if (host.signal.aborted) evidence.controller.abort()
      host.signal.addEventListener('abort', abortHost, { once: true })
      if (host.state.snapshot) {
        const saved = validateControlledSnapshot(
          host.state.snapshot,
          host,
          fingerprint,
          durable.preparedDigest
        )
        const allowsTools =
          saved.output?.decision !== 'rewritten' &&
          prepared.risk.level !== 'high' &&
          prepared.risk.level !== 'critical'
        if (
          saved.outputAllowsTools !== allowsTools ||
          (saved.planOutcome === 'suppressed' &&
            (allowsTools || saved.names.length || saved.attempts.length)) ||
          (saved.planOutcome === 'ready' && saved.scopeRejected) ||
          (saved.planOutcome === 'rejected' && !saved.scopeRejected)
        )
          throw new Error('controlled_rehydrate_output_guard')
        if (!core) throw new Error('controlled_rehydrate_core')
        for (const a of saved.attempts) {
          const command = rehydratePreparedCapabilityCommand(
            a.command,
            config,
            core
          )
          if (
            !command ||
            (saved.safePoint === 'S2' &&
              (command.execution.requireApproval === true ||
                command.resolved.tool.requiresApproval ||
                command.execution.policy.decision === 'requires_approval') &&
              (!a.approvalRequired ||
                !a.approvalConsumed ||
                !a.approvalReceipt)) ||
            command.execution.tenantId !== input.tenantId ||
            command.execution.agentId !== input.agentId ||
            command.execution.versionId !== input.versionId ||
            command.execution.traceId !== input.traceId ||
            command.correlationId !== host.identity.correlationId ||
            (command.execution.requireApproval === true) !==
              (input.requireCapabilityApproval === true) ||
            command.execution.dryRun !== (input.executionMode === 'TEST_LAB') ||
            canonicalizeCapabilityInput(command.execution.policy) !==
              canonicalizeCapabilityInput(prepared.policy) ||
            command.canonical !==
              canonicalizeCapabilityInput({
                message: redactSensitiveText(input.message)
              }) ||
            canonicalizeCapabilityInput(command.execution.actor) !==
              canonicalizeCapabilityInput(input.actor) ||
            command.execution.toolName !== saved.names[0] ||
            (a.approvalConsumed &&
              (!a.approvalReceipt ||
                a.approvalReceipt.inputHash !== command.inputHash))
          )
            throw new Error('controlled_rehydrate_command')
          attempts.push({ ...a, command })
        }
        output = saved.output ?? undefined
        providerInvoked = saved.providerInvoked
        names = saved.names
        planSealed = saved.planSealed
        scopeRejected = saved.scopeRejected
        expectedStep = saved.expectedStep
        evidence.outputAllowsTools = saved.outputAllowsTools
        latestSnapshot = saved
        latestBudgetUsage = { ...saved.budgetUsage }
      }
      const save = guarded.stepStore.saveCheckpoint
      const load = guarded.stepStore.loadCheckpoint
      guarded.stepStore.loadCheckpoint = async (tenant, execution) => {
        const checkpoint = await load(tenant, execution)
        if (checkpoint?.digest !== host.state.checkpoint?.digest) {
          evidence.fail('checkpoint.binding')
          throw new Error('controlled_checkpoint_drift')
        }
        return checkpoint
      }
      guarded.stepStore.saveCheckpoint = async (checkpoint) => {
        latestBudgetUsage = { ...checkpoint.budgetUsage }
        if (checkpoint.state.stopReason !== undefined) return save(checkpoint)
        try {
          const s1 = checkpoint.stepNumber === 1 && !planSealed
          const s2 =
            checkpoint.stepNumber === 2 &&
            attempts.length === 1 &&
            attempts.every(
              (a) =>
                a.resultAcknowledged &&
                a.logAcknowledged &&
                a.callbackAcknowledged
            )
          if (!s1 && !s2) return save(checkpoint)
          if (s1) {
            if (
              !providerInvoked ||
              !output ||
              checkpoint.state.stepNumber !== 1 ||
              checkpoint.state.pendingDecision ||
              checkpoint.budgetUsage.modelCalls !== 1
            )
              throw new Error('controlled_s1_invalid')
            await durable.run(
              'plan.seal',
              { outputDigest: controlledDigest(output), fingerprint },
              () => sealPostOutputPlan()
            )
          }
          const commands = serializeAttempts()
          const snapshot: ControlledPublishedSnapshot = {
            schema: 'controlled-published-state-v1',
            adapterVersion: 'controlled-published-v1',
            requestDigest: host.identity.requestDigest,
            fingerprint,
            executionId: host.identity.executionId,
            tenantId: input.tenantId,
            traceId: input.traceId!,
            preparedDigest: durable.preparedDigest,
            expiresAt: new Date(durable.expiresAt).toISOString(),
            output: output ?? null,
            outputDigest: controlledDigest(output ?? null),
            providerInvoked,
            outputAllowsTools: evidence.outputAllowsTools,
            names,
            planSealed,
            planOutcome: scopeRejected
              ? 'rejected'
              : evidence.outputAllowsTools
                ? 'ready'
                : 'suppressed',
            planDigest: '',
            expectedStep: checkpoint.stepNumber + 1,
            nextPlannerStep: checkpoint.stepNumber + 1,
            finalIssued,
            scopeRejected,
            attempts: commands,
            fault: evidence.fault,
            dispatchClosed: evidence.closed,
            stop: null,
            budgetUsage: checkpoint.budgetUsage,
            safePoint: s1 ? 'S1' : 'S2',
            durationTotals: durationTotals()
          }
          snapshot.planDigest = controlledDigest({
            names,
            attempts: commands.map((a) => a.command),
            outcome: snapshot.planOutcome
          })
          controlledCanonicalJson(snapshot)
          if (evidence.fault || durable.fault || evidence.closed)
            throw new Error('controlled_seal_closed')
          durable.assertDispatch()
          const seal = await durable.bounded(() =>
            host.continuation.saveResumePoint(
              host.identity,
              snapshot,
              checkpoint,
              durable.seal.sequence,
              durable.seal.stateRevision
            )
          )
          durable.assertDispatch()
          if (
            !seal.sealId ||
            seal.stateRevision <= durable.seal.stateRevision ||
            seal.sequence <= durable.seal.sequence ||
            !/^sha256-[a-f0-9]{64}$/.test(seal.hash)
          )
            throw new Error('controlled_seal_ack')
          durable.seal = seal
          latestSnapshot = snapshot
        } catch {
          evidence.fail('resume.seal')
          await durable.poison('resume.seal')
          throw new Error('controlled_resume_seal_unavailable')
        }
      }
    }
    const harness = composeHarness()
    result = await harness.execute(runtimeInput)
  } catch {
    if (durable) {
      evidence.fail('runtime')
      await durable.poison('runtime')
    }
    /* Invalid/throwing kernels project INTERNAL_FAILURE after preparation. */
  } finally {
    evidence.close()
    if (host) host.signal.removeEventListener('abort', abortHost)
    if (durable) await durable.join()
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
  let tools = projectControlledTools(names, attempts, stop)
  try {
    for (const tool of tools) await emit('tool.after', { ...tool })
  } catch {
    evidence.fail('callback.platform.tool.after')
    stop = 'INSUFFICIENT_EVIDENCE'
    tools = projectControlledTools(names, attempts, stop)
  }
  // This is a closure projection, never a new resume seal. safePoint retains
  // the last ACKed S1/S2 anchor; final flags/receipts/usage describe this attempt.
  let finalSnapshot: ControlledPublishedSnapshot | null = null
  if (latestSnapshot) {
    const commands = serializeAttempts()
    const usage = { ...(latestBudgetUsage ?? latestSnapshot.budgetUsage) }
    if (result)
      Object.assign(usage, {
        steps: result.steps,
        modelCalls: result.modelCalls,
        toolCalls: result.toolCalls,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsd: result.usage.costUsd
      })
    finalSnapshot = {
      ...latestSnapshot,
      finalIssued,
      dispatchClosed: evidence.closed,
      stop,
      fault: evidence.fault,
      expectedStep,
      nextPlannerStep: expectedStep,
      attempts: commands,
      budgetUsage: usage,
      durationTotals: durationTotals(),
      planDigest: controlledDigest({
        names,
        attempts: commands.map((a) => a.command),
        outcome: latestSnapshot.planOutcome
      })
    }
    controlledCanonicalJson(finalSnapshot)
  }
  return {
    stop,
    rawStop,
    output,
    tools,
    providerInvoked,
    result,
    attempts,
    evidence,
    durable,
    snapshot: finalSnapshot,
    response:
      stop === 'COMPLETED' && output
        ? { mode: output.mode, text: output.text }
        : { mode: 'handoff' as const, text: CONTROLLED_SAFE_OUTPUTS.handoff }
  }
}
