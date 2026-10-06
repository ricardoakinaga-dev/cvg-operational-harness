import type {
  ApprovalEngine,
  AuditSink,
  ModelGateway,
  Orchestrator,
  PolicyEngine,
  TelemetrySink,
  ToolRegistry
} from '@cvg/harness-contracts'
import {
  approvalsControl,
  auditControl,
  budgetControl,
  effectsControl,
  logControl,
  modelCapability,
  pauseControl,
  plannerCapability,
  policyControl,
  telemetryCapability,
  toolsCapability
} from './controls.ts'
import { KernelRuntime } from './kernel-runtime.ts'
import type {
  EffectLedger,
  KernelLog,
  KernelPlugin,
  PauseSwitch
} from './types.ts'

export interface StandardKernelOptions {
  readonly orchestrator: Orchestrator
  readonly modelGateway: ModelGateway
  readonly policy: PolicyEngine
  readonly approvals: ApprovalEngine
  readonly tools: ToolRegistry
  readonly capabilityFingerprint?: string
  readonly audit: AuditSink
  readonly telemetry: TelemetrySink
  readonly pause?: PauseSwitch
  readonly log?: KernelLog
  readonly effects?: EffectLedger
  /** Audit action and telemetry event name; defaults to `harness.kernel`. */
  readonly eventName?: string
  /** Extra plugins mounted after the standard profile. */
  readonly plugins?: readonly KernelPlugin[]
}

/**
 * The standard profile: every control the kernel requires (I1), in a fixed
 * order, followed by the capabilities of the single-turn loop.
 */
export function standardKernelPlugins(
  options: StandardKernelOptions
): KernelPlugin[] {
  const eventName = options.eventName ?? 'harness.kernel'
  return [
    budgetControl(),
    pauseControl(options.pause),
    logControl(options.log),
    effectsControl(options.effects),
    policyControl(options.policy),
    approvalsControl(
      options.approvals,
      options.capabilityFingerprint
        ? { capabilityFingerprint: options.capabilityFingerprint }
        : {}
    ),
    auditControl(options.audit, { action: eventName }),
    plannerCapability(options.orchestrator),
    modelCapability(options.modelGateway),
    toolsCapability(options.tools),
    telemetryCapability(options.telemetry, { name: eventName }),
    ...(options.plugins ?? [])
  ]
}

/** Kernel runtime with the standard profile, booted on first use. */
export function createKernelRuntime(
  options: StandardKernelOptions
): KernelRuntime {
  return KernelRuntime.lazy(standardKernelPlugins(options))
}
