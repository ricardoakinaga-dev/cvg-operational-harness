import { realpathSync, existsSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type {
  SandboxEvaluationInput,
  SandboxGate,
  SandboxGateOutcome,
  SandboxHandle,
  SandboxMode
} from '@cvg/harness-contracts'
import type { SandboxCapabilities } from './capabilities.ts'

export interface SandboxJournalEntry {
  readonly toolId: string
  readonly mode: SandboxMode
  readonly outcome: SandboxGateOutcome['kind']
  readonly reason?: string
}

export interface LocalSandboxGateOptions {
  readonly capabilities: SandboxCapabilities
  /** Absolute tenant-workspace base; validated by realpath on every grant. */
  readonly workspaceBase?: string
  /** Refuse fs modes when the kernel LSM cannot back them (defense in depth). */
  readonly requireLandlock?: boolean
  /** Modes this composition always denies, regardless of platform. */
  readonly denyModes?: readonly SandboxMode[]
  /** Caller hook: return a reason to deny this evaluation (policy, not platform). */
  readonly deny?: (input: SandboxEvaluationInput) => string | undefined
  /** Decision audit; a throwing journal fails the evaluation closed. */
  readonly journal?: (entry: SandboxJournalEntry) => void
}

const unavailable = (reason: string): SandboxGateOutcome => ({
  kind: 'unavailable',
  reason
})

/**
 * Local implementation of the `SandboxGate` port (SPEC 0195) using the
 * platform capabilities of SPEC 0196. Every failure path returns
 * `denied`/`unavailable` — never `allowed` — so the seam's fail-closed
 * enforcement in `kernel/pipeline.ts` holds.
 */
export function createLocalSandboxGate(
  options: LocalSandboxGateOptions
): SandboxGate {
  const { capabilities } = options

  const resolveWorkspaceRoot = (): string | undefined => {
    const base = options.workspaceBase
    if (base === undefined) return undefined
    if (
      !isAbsolute(base) ||
      !existsSync(base) ||
      !statSync(base).isDirectory()
    ) {
      throw new Error(`workspace base inválida: ${base}`)
    }
    return realpathSync(base)
  }

  const grant = (
    input: SandboxEvaluationInput,
    mode: SandboxMode,
    handle: Omit<SandboxHandle, 'mode'>,
    reason?: string
  ): SandboxGateOutcome => {
    const outcome: SandboxGateOutcome = {
      kind: 'allowed',
      mode,
      handle: { mode, ...handle }
    }
    record(input, outcome, reason)
    return outcome
  }

  const record = (
    input: SandboxEvaluationInput,
    outcome: SandboxGateOutcome,
    reason?: string
  ): void => {
    if (!options.journal) return
    options.journal({
      toolId: input.descriptor.id,
      mode: input.policy?.requiredMode ?? input.descriptor.sandbox ?? 'NONE',
      outcome: outcome.kind,
      ...(reason !== undefined
        ? { reason }
        : outcome.kind !== 'allowed'
          ? { reason: outcome.reason }
          : {})
    })
  }

  const evaluate = async (
    input: SandboxEvaluationInput
  ): Promise<SandboxGateOutcome> => {
    const mode: SandboxMode =
      input.policy?.requiredMode ?? input.descriptor.sandbox ?? 'NONE'
    try {
      const denyReason = options.deny?.(input)
      if (denyReason !== undefined) {
        const outcome: SandboxGateOutcome = {
          kind: 'denied',
          reason: denyReason
        }
        record(input, outcome)
        return outcome
      }
      if (options.denyModes?.includes(mode)) {
        const outcome: SandboxGateOutcome = {
          kind: 'denied',
          reason: `modo ${mode} negado por composição`
        }
        record(input, outcome)
        return outcome
      }

      const base = resolveWorkspaceRoot()
      const timeoutMs = input.policy?.timeoutMs

      switch (mode) {
        case 'NONE': {
          return grant(
            input,
            'NONE',
            { allowNetwork: false, allowSubprocess: false },
            'capability pura; sem contenção requerida'
          )
        }
        case 'IN_PROCESS': {
          if (capabilities.mode === 'unsupported') {
            return fail(
              input,
              unavailable('partial: IN_PROCESS (host sem contenção)')
            )
          }
          // SPEC 0288 D-D: Landlock is per process and irreversible; it can
          // never be applied to a tool running inside the harness.
          if (options.requireLandlock) {
            return fail(
              input,
              unavailable(
                'partial: IN_PROCESS (Landlock ausente: não se aplica a ferramenta em processo)'
              )
            )
          }
          return grant(
            input,
            'IN_PROCESS',
            {
              allowNetwork: false,
              allowSubprocess: false,
              ...(timeoutMs !== undefined ? { deadlineMs: timeoutMs } : {})
            },
            // SPEC 0288 XL07: in-process tools never run under Landlock.
            'Landlock não se aplica em processo; allowlist do canal é a defesa'
          )
        }
        case 'WORKSPACE': {
          if (capabilities.mode === 'unsupported') {
            return fail(
              input,
              unavailable('partial: WORKSPACE (host sem contenção)')
            )
          }
          if (base === undefined) {
            return fail(
              input,
              unavailable(
                'partial: WORKSPACE (sem base de workspace configurada)'
              )
            )
          }
          if (options.requireLandlock) {
            return fail(
              input,
              unavailable(
                'partial: WORKSPACE (Landlock ausente: não se aplica a ferramenta em processo)'
              )
            )
          }
          return grant(
            input,
            'WORKSPACE',
            {
              workspaceRoot: base,
              allowNetwork: false,
              allowSubprocess: false,
              ...(timeoutMs !== undefined ? { deadlineMs: timeoutMs } : {})
            },
            'Landlock não se aplica em processo; allowlist verificável do workspace é a defesa'
          )
        }
        case 'PROCESS': {
          if (capabilities.mode === 'unsupported') {
            return fail(
              input,
              unavailable('partial: PROCESS (host sem contenção)')
            )
          }
          if (!capabilities.bubblewrap) {
            return fail(
              input,
              unavailable('partial: PROCESS (bubblewrap ausente)')
            )
          }
          // SPEC 0288: in PROCESS the helper applies the ruleset; without a
          // helper-confirmed ABI at or above the floor, a required Landlock is
          // refused rather than promised.
          if (options.requireLandlock && !capabilities.landlock) {
            return fail(
              input,
              unavailable('partial: PROCESS (Landlock ausente)')
            )
          }
          return grant(input, 'PROCESS', {
            ...(base !== undefined ? { workspaceRoot: base } : {}),
            allowNetwork: false,
            allowSubprocess: true,
            ...(timeoutMs !== undefined ? { deadlineMs: timeoutMs } : {})
          })
        }
        case 'EGRESS': {
          // Out of scope for this package (PDSH-016): never allowed here.
          return fail(
            input,
            unavailable(
              'partial: EGRESS (não suportado por este gate; PDSH-016)'
            )
          )
        }
        default: {
          return fail(
            input,
            unavailable(`modo de sandbox desconhecido: ${String(mode)}`)
          )
        }
      }
    } catch (error) {
      return fail(
        input,
        unavailable(
          `gate local falhou: ${error instanceof Error ? error.message : 'erro desconhecido'}`
        )
      )
    }
  }

  const fail = (
    input: SandboxEvaluationInput,
    outcome: SandboxGateOutcome
  ): SandboxGateOutcome => {
    try {
      record(input, outcome)
    } catch {
      // A journal that throws must not surface as `allowed`; the outcome
      // below is already fail-closed, so swallow only the audit fault here.
      return {
        kind: 'unavailable',
        reason: 'journal de sandbox falhou durante o registro de recusa'
      }
    }
    return outcome
  }

  return { evaluate }
}
