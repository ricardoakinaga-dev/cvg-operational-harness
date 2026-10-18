export const CHAOS_SCENARIO_IDS = [
  'CHAOS-01',
  'CHAOS-02',
  'CHAOS-03',
  'CHAOS-04',
  'CHAOS-05',
  'CHAOS-06',
  'CHAOS-07',
  'CHAOS-08',
  'CHAOS-09',
  'CHAOS-10',
  'CHAOS-11',
  'CHAOS-12',
  'CHAOS-13',
  'CHAOS-14',
  'CHAOS-15',
  'CHAOS-16'
] as const

export type ChaosScenarioId = (typeof CHAOS_SCENARIO_IDS)[number]

export type ChaosStatus = 'PASS' | 'FAIL' | 'NOT_EXECUTED'

export interface ChaosRecord {
  id: ChaosScenarioId
  title: string
  status: ChaosStatus
  detail: string
}

export class ChaosLedger {
  readonly #records = new Map<ChaosScenarioId, ChaosRecord>()

  record(record: ChaosRecord): void {
    this.#records.set(record.id, record)
  }

  pass(id: ChaosScenarioId, title: string, detail: string): void {
    this.record({ id, title, status: 'PASS', detail })
  }

  fail(id: ChaosScenarioId, title: string, detail: string): void {
    this.record({ id, title, status: 'FAIL', detail })
  }

  notExecuted(id: ChaosScenarioId, title: string, detail: string): void {
    this.record({ id, title, status: 'NOT_EXECUTED', detail })
  }

  get(id: ChaosScenarioId): ChaosRecord | undefined {
    return this.#records.get(id)
  }

  all(): ChaosRecord[] {
    return CHAOS_SCENARIO_IDS.map(
      (id) =>
        this.#records.get(id) ?? {
          id,
          title: 'unregistered',
          status: 'NOT_EXECUTED' as const,
          detail: 'scenario did not report a result'
        }
    )
  }

  summary(): {
    executed: number
    passed: number
    failed: number
    notExecuted: number
  } {
    const records = this.all()
    return {
      executed: records.filter((record) => record.status !== 'NOT_EXECUTED')
        .length,
      passed: records.filter((record) => record.status === 'PASS').length,
      failed: records.filter((record) => record.status === 'FAIL').length,
      notExecuted: records.filter((record) => record.status === 'NOT_EXECUTED')
        .length
    }
  }
}

export interface FaultyFetchStep {
  status?: number
  body?: string
  error?: Error
}

/**
 * Deterministic fetch script for provider/channel outage scenarios. Each call
 * consumes one step; running past the end raises a connection error.
 */
export function sequenceFetch(
  steps: FaultyFetchStep[]
): (input: string, init?: RequestInit) => Promise<Response> {
  let index = 0
  return async () => {
    const step = steps[index]
    index += 1
    if (!step || step.error) {
      throw step?.error ?? new Error('fetch script exhausted')
    }
    return new Response(step.body ?? '{}', { status: step.status ?? 200 })
  }
}

export function abortableDelay(
  ms: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => resolve(), ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(abortError())
      },
      { once: true }
    )
  })
}

function abortError(): Error {
  const error = new Error('aborted')
  error.name = 'AbortError'
  return error
}
