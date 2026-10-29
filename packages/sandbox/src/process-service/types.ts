import type { SandboxHandle } from '@cvg/harness-contracts'
import type { ProcessContainmentProfile } from '../process-profile.ts'

/** SPEC 0286 §4. Consumers that may ask for a subprocess; each has its own env allowlist. */
export type ProcessConsumer =
  | 'shell'
  | 'mcp-stdio'
  | 'lsp'
  | 'document-conversion'
export const PROCESS_CONSUMERS: readonly ProcessConsumer[] = Object.freeze([
  'shell',
  'mcp-stdio',
  'lsp',
  'document-conversion'
])

export interface ProcessLimits {
  readonly startupMs: number
  readonly lifetimeMs: number
  readonly cleanupMs: number
  readonly graceMs: number
  readonly maxOutputBytes: number
  readonly maxStdinBytes: number
}

export interface ProcessLaunchRequest {
  readonly consumer: ProcessConsumer
  /** Reviewed host profile (F02); the service never builds one. */
  readonly profile: ProcessContainmentProfile
  /** Grant from the sandbox gate; must allow subprocesses and not the network. */
  readonly handle: SandboxHandle
  /** Pure argv; argv[0] must be in the profile's executable manifest. */
  readonly argv: readonly string[]
  readonly cwd?: string
  /** Closed map: only names the service allows for this consumer (SPEC 0286 I2). */
  readonly env?: Readonly<Record<string, string>>
  readonly mode: 'oneshot' | 'persistent'
  readonly stdin?: Uint8Array
  readonly limits: ProcessLimits
  /**
   * Past `maxOutputBytes`: `terminate` ends the launch with `output_limit` (SPEC 0286 I8, the
   * default); `drop` keeps the process and discards the excess, as the legacy shell runner did.
   */
  readonly outputOverflow?: 'terminate' | 'drop'
  readonly signal?: AbortSignal
}

export type ProcessCause =
  | 'exit'
  | 'signal'
  | 'timeout'
  | 'startup_timeout'
  | 'cancelled'
  | 'dispose'
  | 'output_limit'
  | 'spawn_failed'

export interface ProcessCleanup {
  readonly state: 'clean' | 'cleanup_failed'
  readonly observed: 'proc-pidns'
  /** Members still in the launch's PID namespace at the last scan. */
  readonly leftover: number
  /** Same-uid entries that could not be read; they prevent `clean`. */
  readonly unverified: number
}

export interface ProcessOutcome {
  readonly cause: ProcessCause
  readonly exitCode: number | null
  readonly signal: string | null
  readonly stdout?: string
  readonly stderr?: string
  readonly truncated: boolean
  readonly cleanup: ProcessCleanup
  readonly profile: 'namespace-observed'
  readonly ownerIndependent: false
  /** Cleanup and channel faults; they never replace `cause` (I3). */
  readonly secondaryErrors: readonly string[]
}

export interface ProcessServiceLimitsCaps {
  readonly startupMs: number
  readonly lifetimeMs: number
  readonly cleanupMs: number
  readonly graceMs: number
  readonly maxOutputBytes: number
  readonly maxStdinBytes: number
}

export interface ProcessHandle {
  readonly id: string
  /** Resolves once, after cleanup, with the single immutable outcome. */
  wait(): Promise<ProcessOutcome>
  /** Asks for the launch to end (cause `cancelled`); resolves with the same outcome as `wait`. */
  stop(reason?: string): Promise<ProcessOutcome>
}

export interface ProcessDisposeReport {
  readonly stopped: number
  readonly clean: number
  readonly cleanupFailed: number
}

export interface ProcessService {
  launch(request: ProcessLaunchRequest): Promise<ProcessHandle>
  dispose(): Promise<ProcessDisposeReport>
}
