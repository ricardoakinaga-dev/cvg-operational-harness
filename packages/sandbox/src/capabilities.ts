import { execFileSync, spawnSync } from 'node:child_process'
import { isAbsolute } from 'node:path'
import { release } from 'node:os'
import type { SandboxMode } from '@cvg/harness-contracts'

/**
 * What this platform can actually contain (SPEC 0196 §2/§3). Detection runs
 * once per host; gates receive the result (injectable in tests) and never
 * probe the platform themselves.
 */
export interface SandboxCapabilities {
  readonly bubblewrap: boolean
  /**
   * SPEC 0288 (T-1): true only when the Landlock helper confirmed, by syscall,
   * an ABI at or above LANDLOCK_MIN_ABI. Never inferred from the kernel release.
   */
  readonly landlock: boolean
  /** ABI reported by the helper's probe, when one ran. */
  readonly landlockAbi?: number
  /** Highest mode fully supported here; never a downgrade of a asked mode. */
  readonly mode: SandboxMode | 'unsupported'
  /** Modes supported only with a documented limitation (fail-visible). */
  readonly partial: readonly SandboxMode[]
  readonly reason?: string
}

/** Injectable probe so tests never depend on the host they run on. */
export interface SandboxProbe {
  probeBubblewrap(): boolean
  /** Kept for compatibility; a boolean alone never makes `landlock` true (SPEC 0288). */
  probeLandlock(): boolean
  /** SPEC 0288: the ABI the Landlock helper read from the kernel, if any. */
  probeLandlockAbi?(): number | undefined
}

/** SPEC 0288 D-B: rename/link (REFER) and truncate must be enforceable. */
export const LANDLOCK_MIN_ABI = 3

const LANDLOCK_MIN_KERNEL = [5, 13] as const

/**
 * Best-effort kernel gate for the Landlock ABI (>= 5.13). Node cannot issue
 * the `landlock_create_ruleset` probe syscall without a native addon, so the
 * release string is the honest signal available; enforcement never depends on
 * Landlock alone (bwrap namespaces and the workspace allowlist do the work).
 */
function kernelSupportsLandlock(): boolean {
  const parsed = /^(\d+)\.(\d+)/.exec(release())
  if (!parsed) return false
  const major = Number(parsed[1])
  const minor = Number(parsed[2])
  if (Number.isNaN(major) || Number.isNaN(minor)) return false
  const [minMajor, minMinor] = LANDLOCK_MIN_KERNEL
  return major > minMajor || (major === minMajor && minor >= minMinor)
}

/**
 * Host probe: bubblewrap must both exist and successfully close a namespace
 * (a mere `--version` would not prove user/mount namespaces work here).
 */
/**
 * SPEC 0288: asks the native helper for the ABI (`--probe`). The helper path is
 * host composition, absolute, and nothing else reaches the child (no env).
 */
export function probeLandlockAbiWith(helper: string): number | undefined {
  if (!isAbsolute(helper)) return undefined
  try {
    const result = spawnSync(helper, ['--probe', '--status-fd', '3'], {
      stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
      timeout: 5000,
      env: {},
      cwd: '/'
    })
    if (result.status !== 0) return undefined
    const raw = result.output[3]?.toString('utf8') ?? ''
    const abi = (JSON.parse(raw) as { abi?: unknown }).abi
    return typeof abi === 'number' && Number.isSafeInteger(abi) && abi >= 1
      ? abi
      : undefined
  } catch {
    return undefined
  }
}

/** Host probe with the Landlock helper the composition installed (SPEC 0288). */
export function createHostProbe(
  options: { readonly landlockHelper?: string } = {}
): SandboxProbe {
  const helper = options.landlockHelper
  return {
    probeBubblewrap: () => hostProbe.probeBubblewrap(),
    probeLandlock: () => kernelSupportsLandlock(),
    probeLandlockAbi: () =>
      helper === undefined ? undefined : probeLandlockAbiWith(helper)
  }
}

export const hostProbe: SandboxProbe = {
  probeBubblewrap(): boolean {
    try {
      execFileSync(
        'bwrap',
        ['--ro-bind', '/', '/', '--unshare-net', '/bin/true'],
        // The probe has no payload: only PATH (to find bwrap) is passed on, never the host's other variables.
        {
          stdio: 'ignore',
          timeout: 5000,
          env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
          cwd: '/'
        }
      )
      return true
    } catch {
      return false
    }
  },
  probeLandlock(): boolean {
    return kernelSupportsLandlock()
  }
}

/**
 * Resolves platform containment once (SPEC 0196 §2). A probe that throws is
 * treated as "not available" — never as permission to run contained work.
 */
export function detectSandboxCapabilities(
  probe: SandboxProbe = hostProbe
): SandboxCapabilities {
  let bubblewrap = false
  let landlockAbi: number | undefined
  try {
    bubblewrap = probe.probeBubblewrap()
  } catch {
    bubblewrap = false
  }
  try {
    const abi = probe.probeLandlockAbi?.()
    landlockAbi =
      typeof abi === 'number' && Number.isSafeInteger(abi) && abi >= 1
        ? abi
        : undefined
  } catch {
    landlockAbi = undefined
  }
  // SPEC 0288 T-1: only a helper-confirmed ABI at or above the floor counts.
  const landlock = landlockAbi !== undefined && landlockAbi >= LANDLOCK_MIN_ABI

  const partial: SandboxMode[] = []
  const reasons: string[] = []
  if (!bubblewrap) {
    reasons.push('bubblewrap ausente; PROCESS indisponível')
  }
  if (!landlock) {
    // Without the kernel LSM the fs modes lean solely on the allowlist.
    partial.push('IN_PROCESS')
    reasons.push('Landlock indisponível; fs sem defesa de kernel adicional')
  }

  const mode: SandboxMode | 'unsupported' = bubblewrap ? 'PROCESS' : 'WORKSPACE'

  return {
    bubblewrap,
    landlock,
    ...(landlockAbi !== undefined ? { landlockAbi } : {}),
    mode,
    partial,
    ...(reasons.length > 0 ? { reason: reasons.join('; ') } : {})
  }
}
