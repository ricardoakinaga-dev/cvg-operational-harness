import type { ModelGatewayRequest } from './contracts.ts'

export type BudgetScope = 'request' | 'session' | 'tenant' | 'agent' | 'day'

export interface CostBudgetLimits {
  request?: number
  session?: number
  tenant?: number
  agent?: number
  day?: number
}

export interface CostBudgetStore {
  consumed(scopeKey: string): number
  consume(scopeKey: string, amountUsd: number): void
}

export class InMemoryCostBudgetStore implements CostBudgetStore {
  readonly #consumed = new Map<string, number>()

  consumed(scopeKey: string): number {
    return this.#consumed.get(scopeKey) ?? 0
  }

  consume(scopeKey: string, amountUsd: number): void {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return
    this.#consumed.set(scopeKey, this.consumed(scopeKey) + amountUsd)
  }
}

export function budgetScopeKeys(
  request: Pick<
    ModelGatewayRequest,
    'requestId' | 'tenantId' | 'sessionId' | 'agentId'
  >,
  now: Date
): Record<BudgetScope, string | null> {
  const day = now.toISOString().slice(0, 10)
  return {
    request: `request:${request.requestId}`,
    session: request.sessionId
      ? `session:${request.tenantId}:${request.sessionId}`
      : null,
    tenant: `tenant:${request.tenantId}`,
    agent: request.agentId
      ? `agent:${request.tenantId}:${request.agentId}`
      : null,
    day: `day:${request.tenantId}:${day}`
  }
}

export interface BudgetAuthorizationInput {
  request: Pick<
    ModelGatewayRequest,
    'requestId' | 'tenantId' | 'sessionId' | 'agentId'
  >
  estimatedCostUsd: number
  limits: CostBudgetLimits
  store: CostBudgetStore
  now: Date
}

export interface BudgetAuthorization {
  allowed: boolean
  deniedScope?: BudgetScope
  deniedKey?: string
  spentUsd?: number
  limitUsd?: number
  reservedKeys: string[]
}

/**
 * Two-phase guard: authorize every configured scope before reserving the
 * estimate, so a rejected call never partially consumes budget. Settlement is
 * conservative: overruns always charge the difference, refunds never happen.
 */
export class BudgetGuard {
  readonly #store: CostBudgetStore
  readonly #limits: CostBudgetLimits
  readonly #clock: () => Date

  constructor(options: {
    store: CostBudgetStore
    limits: CostBudgetLimits
    clock?: () => Date
  }) {
    this.#store = options.store
    this.#limits = options.limits
    this.#clock = options.clock ?? (() => new Date())
  }

  authorize(input: {
    request: Pick<
      ModelGatewayRequest,
      'requestId' | 'tenantId' | 'sessionId' | 'agentId'
    >
    estimatedCostUsd: number
  }): BudgetAuthorization {
    const keys = budgetScopeKeys(input.request, this.#clock())
    const estimate = Number.isFinite(input.estimatedCostUsd)
      ? Math.max(0, input.estimatedCostUsd)
      : 0
    const scopes: BudgetScope[] = [
      'request',
      'session',
      'tenant',
      'agent',
      'day'
    ]

    for (const scope of scopes) {
      const limit = this.#limits[scope]
      const key = keys[scope]
      if (limit === undefined || key === null) continue
      const spent = this.#store.consumed(key)
      if (spent + estimate > limit) {
        return {
          allowed: false,
          deniedScope: scope,
          deniedKey: key,
          spentUsd: spent,
          limitUsd: limit,
          reservedKeys: []
        }
      }
    }

    const reservedKeys: string[] = []
    for (const scope of scopes) {
      const key = keys[scope]
      if (key === null) continue
      if (this.#limits[scope] === undefined) continue
      this.#store.consume(key, estimate)
      reservedKeys.push(key)
    }

    return { allowed: true, reservedKeys }
  }

  settle(input: {
    reservedKeys: readonly string[]
    estimatedCostUsd: number
    actualCostUsd: number
  }): void {
    const delta = input.actualCostUsd - input.estimatedCostUsd
    if (!Number.isFinite(delta) || delta <= 0) return
    for (const key of input.reservedKeys) {
      this.#store.consume(key, delta)
    }
  }
}
