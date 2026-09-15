export type PersistenceMode = 'memory' | 'postgres' | 'postgres-pool'

export interface ReadinessInput {
  persistenceMode: PersistenceMode
  durableInbound: boolean
  production: boolean
}

export interface ReadinessCheck {
  name: string
  status: 'ok' | 'degraded' | 'failed'
  detail: string
}

export interface ReadinessResult {
  ready: boolean
  checks: ReadinessCheck[]
}

/**
 * Bounded dependency probe. The check must settle quickly; a rejected or
 * timed-out probe fails readiness with a sanitized detail.
 */
export interface ReadinessProbe {
  name: string
  check: () => Promise<void> | void
  timeoutMs?: number
}

export interface ReadinessProbeInput extends ReadinessInput {
  probes?: readonly ReadinessProbe[]
}

export const DEFAULT_READINESS_PROBE_TIMEOUT_MS = 1_000

export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const checks: ReadinessCheck[] = [
    {
      name: 'process',
      status: 'ok',
      detail: 'process is responding'
    }
  ]

  if (input.persistenceMode === 'memory') {
    checks.push({
      name: 'persistence',
      status: input.production ? 'failed' : 'degraded',
      detail: 'in-memory persistence is not durable'
    })
  } else {
    checks.push({
      name: 'persistence',
      status: 'ok',
      detail: `${input.persistenceMode} persistence configured`
    })
  }

  if (input.durableInbound) {
    checks.push({
      name: 'durability',
      status: 'ok',
      detail: 'durable inbound processing configured'
    })
  } else {
    checks.push({
      name: 'durability',
      status: input.production ? 'failed' : 'degraded',
      detail: 'inline inbound processing is not durable'
    })
  }

  return {
    ready: checks.every((check) => check.status !== 'failed'),
    checks
  }
}

async function runProbe(probe: ReadinessProbe): Promise<ReadinessCheck> {
  const timeoutMs = probe.timeoutMs ?? DEFAULT_READINESS_PROBE_TIMEOUT_MS
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([
      Promise.resolve(probe.check()).then(() => undefined),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('readiness probe timeout')),
          timeoutMs
        )
        timer.unref?.()
      })
    ])
    return {
      name: probe.name,
      status: 'ok',
      detail: `${probe.name} probe succeeded`
    }
  } catch {
    return {
      name: probe.name,
      status: 'failed',
      detail: `${probe.name} probe failed`
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Evaluates static configuration plus bounded dependency probes. Probe
 * failures never leak connection strings, secrets or payloads in details.
 */
export async function evaluateReadinessWithProbes(
  input: ReadinessProbeInput
): Promise<ReadinessResult> {
  const base = evaluateReadiness(input)
  const probes = input.probes ?? []
  if (probes.length === 0) return base
  const probeChecks = await Promise.all(probes.map((probe) => runProbe(probe)))
  const checks = [...base.checks, ...probeChecks]
  return {
    ready: checks.every((check) => check.status !== 'failed'),
    checks
  }
}
