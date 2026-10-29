import { execFileSync } from 'node:child_process'
import { release } from 'node:os'
import type { SandboxMode } from '@cvg/harness-contracts'

/**
 * What this platform can actually contain (SPEC 0196 §2/§3). Detection runs
 * once per host; gates receive the result (injectable in tests) and never
 * probe the platform themselves.
 */
export interface SandboxCapabilities {
  readonly bubblewrap: boolean
  readonly landlock: boolean
  /** Highest mode fully supported here; never a downgrade of a asked mode. */
  readonly mode: SandboxMode | 'unsupported'
  /** Modes supported only with a documented limitation (fail-visible). */
  readonly partial: readonly SandboxMode[]
  readonly reason?: string
}

/** Injectable probe so tests never depend on the host they run on. */
export interface SandboxProbe {
  probeBubblewrap(): boolean
  probeLandlock(): boolean
}

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
export const hostProbe: SandboxProbe = {
  probeBubblewrap(): boolean {
    try {
      execFileSync(
        'bwrap',
        ['--ro-bind', '/', '/', '--unshare-net', '/bin/true'],
        // The probe has no payload: it gets an empty environment, never the host's.
        { stdio: 'ignore', timeout: 5000, env: {}, cwd: '/' }
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
  let landlock = false
  try {
    bubblewrap = probe.probeBubblewrap()
  } catch {
    bubblewrap = false
  }
  try {
    landlock = probe.probeLandlock()
  } catch {
    landlock = false
  }

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
    mode,
    partial,
    ...(reasons.length > 0 ? { reason: reasons.join('; ') } : {})
  }
}
