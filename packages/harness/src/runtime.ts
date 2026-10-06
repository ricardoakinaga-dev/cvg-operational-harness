import type {
  ApprovalEngine,
  AuditSink,
  HarnessRuntime,
  ModelGateway,
  Orchestrator,
  PolicyEngine,
  RuntimeInput,
  RuntimeResult,
  TelemetrySink,
  ToolRegistry
} from '@cvg/harness-contracts'
import { createKernelRuntime } from './kernel/profile.ts'
import type { KernelRuntime } from './kernel/kernel-runtime.ts'
import type { EffectLedger, KernelLog, PauseSwitch } from './kernel/types.ts'

export { ALL_AGENT_TOOLS, agentExposesTool } from './kernel/kernel-runtime.ts'

export interface HarnessRuntimeOptions {
  readonly orchestrator: Orchestrator
  readonly modelGateway: ModelGateway
  readonly policy: PolicyEngine
  readonly approvals: ApprovalEngine
  readonly tools: ToolRegistry
  readonly capabilityFingerprint?: string
  readonly audit: AuditSink
  readonly telemetry: TelemetrySink
  /** Kernel controls; in-memory defaults when omitted. */
  readonly pause?: PauseSwitch
  readonly log?: KernelLog
  readonly effects?: EffectLedger
}

/**
 * Single-pass profile, now a thin facade over the plugin kernel (SPEC 0181,
 * decision D-0181-3). Governance runs as kernel control plugins; this class
 * only keeps the public name and constructor while consumers migrate.
 */
export class SinglePassGovernedRuntime implements HarnessRuntime {
  readonly #kernel: KernelRuntime

  public constructor(options: HarnessRuntimeOptions) {
    this.#kernel = createKernelRuntime({
      ...options,
      eventName: 'harness.single_pass'
    })
  }

  public execute(input: RuntimeInput): Promise<RuntimeResult> {
    return this.#kernel.execute(input)
  }
}
