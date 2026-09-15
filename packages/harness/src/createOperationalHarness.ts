import { SinglePassOrchestrator } from '@cvg/harness-orchestrator'
import type {
  AgenticKnowledgeProvider,
  Claim,
  CompletionEvaluator,
  ContextEngine,
  ExecutionStepStore,
  IterativeOrchestrator,
  RuntimeInput,
  RuntimeProfile,
  RuntimeResult,
  SufficiencyEvaluator,
  CapabilityRegistry,
  ToolRegistry
} from '@cvg/harness-contracts'
import { createCapabilityToolRegistry } from './capability-boundary.ts'
import {
  createJournaledToolRegistry,
  type EffectJournal,
  type JournaledToolRegistryOptions
} from './effect-journal.ts'
import {
  SinglePassGovernedRuntime,
  type HarnessRuntimeOptions
} from './runtime.ts'
import { IterativeGovernedRuntime } from './iterative-runtime.ts'

export interface OperationalHarnessOptions extends Omit<
  HarnessRuntimeOptions,
  'orchestrator' | 'tools' | 'capabilityFingerprint'
> {
  readonly orchestrator?: HarnessRuntimeOptions['orchestrator']
  /**
   * Explicit capability composition. Its adapter is the only runtime-facing
   * registry for this path; callers cannot provide both registries.
   */
  readonly capabilities?: CapabilityRegistry
  /** Compatibility port retained for existing Phase 2/3 consumers. */
  readonly tools?: ToolRegistry
  /** Required for capability composition and optional for compatibility tools. */
  readonly effectJournal?: EffectJournal
  readonly effectJournalOptions?: JournaledToolRegistryOptions
  /**
   * Required to run the iterative profile. The runtime registry resolves the
   * requested profile here; the worker never selects a runtime class.
   */
  readonly iterativeOrchestrator?: IterativeOrchestrator
  readonly stepStore?: ExecutionStepStore
  readonly contextEngine?: ContextEngine
  readonly knowledge?: AgenticKnowledgeProvider
  readonly sufficiencyEvaluator?: SufficiencyEvaluator
  readonly completionEvaluator?: CompletionEvaluator
  readonly claimExtractor?: (response: string) => readonly Claim[]
  readonly defaultRuntimeProfile?: RuntimeProfile
  readonly clock?: () => Date
}

export interface OperationalHarness {
  readonly run: (input: RuntimeInput) => Promise<RuntimeResult>
  readonly execute: (input: RuntimeInput) => Promise<RuntimeResult>
  readonly resolveProfile: (input: RuntimeInput) => RuntimeProfile
  readonly capabilityFingerprint?: string
}

/**
 * Canonical public composition root for the neutral harness packages. Product
 * adapters provide the ports; this function only wires them together and
 * resolves the runtime profile through a registry-like selection.
 */
export function createOperationalHarness(
  options: OperationalHarnessOptions
): OperationalHarness {
  const capabilityFingerprint = options.capabilities?.compositionFingerprint()
  if (options.capabilities && !options.effectJournal) {
    throw new Error(
      'Capability composition requires an explicit effect journal'
    )
  }
  const tools = resolveTools(options, capabilityFingerprint)
  const singlePass = new SinglePassGovernedRuntime({
    orchestrator: options.orchestrator ?? new SinglePassOrchestrator(),
    modelGateway: options.modelGateway,
    policy: options.policy,
    approvals: options.approvals,
    tools,
    ...(capabilityFingerprint ? { capabilityFingerprint } : {}),
    audit: options.audit,
    telemetry: options.telemetry
  })

  const iterative =
    options.iterativeOrchestrator && options.stepStore
      ? new IterativeGovernedRuntime({
          orchestrator: options.iterativeOrchestrator,
          modelGateway: options.modelGateway,
          policy: options.policy,
          approvals: options.approvals,
          tools,
          ...(capabilityFingerprint ? { capabilityFingerprint } : {}),
          audit: options.audit,
          telemetry: options.telemetry,
          stepStore: options.stepStore,
          ...(options.contextEngine
            ? { contextEngine: options.contextEngine }
            : {}),
          ...(options.knowledge ? { knowledge: options.knowledge } : {}),
          ...(options.sufficiencyEvaluator
            ? { sufficiencyEvaluator: options.sufficiencyEvaluator }
            : {}),
          ...(options.completionEvaluator
            ? { completionEvaluator: options.completionEvaluator }
            : {}),
          ...(options.claimExtractor
            ? { claimExtractor: options.claimExtractor }
            : {}),
          ...(options.clock ? { clock: options.clock } : {})
        })
      : undefined

  const resolveProfile = (input: RuntimeInput): RuntimeProfile =>
    input.runtimeProfile ?? options.defaultRuntimeProfile ?? 'single_pass'

  const execute = async (input: RuntimeInput): Promise<RuntimeResult> => {
    const governedInput = capabilityFingerprint
      ? { ...input, capabilityFingerprint }
      : input
    if (
      capabilityFingerprint &&
      input.executionId &&
      input.capabilityFingerprint === undefined
    ) {
      await safeAudit(options, input, 'runtime.stopped', 'STATE_CONFLICT')
      return {
        response:
          'Capability composition fingerprint is required for durable execution.',
        stopReason: 'STATE_CONFLICT',
        steps: 0,
        modelCalls: 0,
        toolCalls: 0,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
      }
    }
    if (
      capabilityFingerprint &&
      input.capabilityFingerprint !== undefined &&
      input.capabilityFingerprint !== capabilityFingerprint
    ) {
      await safeAudit(options, input, 'runtime.stopped', 'STATE_CONFLICT')
      return {
        response:
          'Capability composition fingerprint does not match the runtime.',
        stopReason: 'STATE_CONFLICT',
        steps: 0,
        modelCalls: 0,
        toolCalls: 0,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
      }
    }
    const profile = resolveProfile(governedInput)
    if (profile === 'iterative') {
      if (!iterative) {
        await safeAudit(
          options,
          governedInput,
          'runtime.stopped',
          'STATE_CONFLICT'
        )
        return {
          response:
            'The iterative runtime profile is not configured in this composition.',
          stopReason: 'STATE_CONFLICT',
          steps: 0,
          modelCalls: 0,
          toolCalls: 0,
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
        }
      }
      return iterative.execute(governedInput)
    }
    return singlePass.execute(governedInput)
  }

  return {
    run: (input) => execute(input),
    execute,
    resolveProfile,
    ...(options.capabilities
      ? { capabilityFingerprint: options.capabilities.compositionFingerprint() }
      : {})
  }
}

function resolveTools(
  options: OperationalHarnessOptions,
  capabilityFingerprint: string | undefined
): ToolRegistry {
  if (options.capabilities && options.tools) {
    throw new Error(
      'Operational harness composition accepts capabilities or tools, not both'
    )
  }
  const registry = options.capabilities
    ? createCapabilityToolRegistry(options.capabilities)
    : options.tools
  if (!registry) {
    throw new Error(
      'Operational harness composition requires an explicit capability or tool registry'
    )
  }
  if (!options.effectJournal) return registry
  return createJournaledToolRegistry(registry, options.effectJournal, {
    ...options.effectJournalOptions,
    ...(capabilityFingerprint
      ? { compositionFingerprint: capabilityFingerprint }
      : {})
  })
}

async function safeAudit(
  options: OperationalHarnessOptions,
  input: RuntimeInput,
  action: string,
  result: string
): Promise<void> {
  try {
    await options.audit.append({
      actor: input.agent.id,
      agent: input.agent.id,
      tenant: input.tenantId,
      action,
      policy: null,
      approval: null,
      tool: null,
      result,
      timestamp: new Date().toISOString(),
      traceId: input.traceId,
      correlationId: input.correlationId
    })
  } catch {
    // misconfiguration must still fail closed without an unhandled error
  }
}
