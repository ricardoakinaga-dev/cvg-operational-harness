import { createHash } from 'node:crypto'
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolRegistry,
  ToolResult
} from '@cvg/harness-contracts'

export type EffectJournalState =
  | 'RESERVED'
  | 'EFFECT_STARTED'
  | 'CONFIRMED'
  | 'FAILED'
  | 'UNCERTAIN'

export interface EffectJournalRecord {
  readonly tenantId: string
  readonly operationKey: string
  readonly proposalHash: string
  readonly state: EffectJournalState
  readonly attemptId: string
  readonly result?: unknown
  readonly error?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface EffectJournal {
  reserve(input: {
    tenantId: string
    operationKey: string
    proposalHash: string
    attemptId: string
  }): Promise<EffectJournalRecord>
  markStarted(input: {
    tenantId: string
    operationKey: string
    attemptId: string
  }): Promise<EffectJournalRecord>
  confirm(input: {
    tenantId: string
    operationKey: string
    attemptId: string
    result: unknown
  }): Promise<EffectJournalRecord>
  fail(input: {
    tenantId: string
    operationKey: string
    attemptId: string
    error: string
  }): Promise<EffectJournalRecord>
  markUncertain(input: {
    tenantId: string
    operationKey: string
    attemptId: string
    reason: string
  }): Promise<EffectJournalRecord>
  get(
    tenantId: string,
    operationKey: string
  ): Promise<EffectJournalRecord | null>
}

export class EffectJournalError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'EffectJournalError'
  }
}

function key(tenantId: string, operationKey: string): string {
  return `${tenantId}\u0000${operationKey}`
}

function now(): string {
  return new Date().toISOString()
}

function bounded(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EffectJournalError(`${label} is required`)
  }
  if (value.length > 500) throw new EffectJournalError(`${label} is too long`)
  return value.trim()
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

/** Process-local journal for synthetic crash/replay proofs. */
export class InMemoryEffectJournal implements EffectJournal {
  private readonly records = new Map<string, EffectJournalRecord>()

  public async reserve(input: {
    tenantId: string
    operationKey: string
    proposalHash: string
    attemptId: string
  }): Promise<EffectJournalRecord> {
    const tenantId = bounded(input.tenantId, 'tenantId')
    const operationKey = bounded(input.operationKey, 'operationKey')
    const proposalHash = bounded(input.proposalHash, 'proposalHash')
    const attemptId = bounded(input.attemptId, 'attemptId')
    const identity = key(tenantId, operationKey)
    const existing = this.records.get(identity)
    if (existing) {
      if (existing.proposalHash !== proposalHash) {
        throw new EffectJournalError(
          'Operation key is bound to a different proposal'
        )
      }
      if (existing.state === 'FAILED') {
        const timestamp = now()
        const retried: EffectJournalRecord = {
          tenantId: existing.tenantId,
          operationKey: existing.operationKey,
          proposalHash: existing.proposalHash,
          state: 'RESERVED',
          attemptId,
          createdAt: existing.createdAt,
          updatedAt: timestamp
        }
        this.records.set(identity, retried)
        return clone(retried)
      }
      return clone(existing)
    }
    const timestamp = now()
    const record: EffectJournalRecord = {
      tenantId,
      operationKey,
      proposalHash,
      state: 'RESERVED',
      attemptId,
      createdAt: timestamp,
      updatedAt: timestamp
    }
    this.records.set(identity, record)
    return clone(record)
  }

  public markStarted(input: {
    tenantId: string
    operationKey: string
    attemptId: string
  }): Promise<EffectJournalRecord> {
    return this.transition(input, 'EFFECT_STARTED')
  }

  public confirm(input: {
    tenantId: string
    operationKey: string
    attemptId: string
    result: unknown
  }): Promise<EffectJournalRecord> {
    return this.transition(input, 'CONFIRMED', { result: clone(input.result) })
  }

  public fail(input: {
    tenantId: string
    operationKey: string
    attemptId: string
    error: string
  }): Promise<EffectJournalRecord> {
    return this.transition(input, 'FAILED', {
      error: bounded(input.error, 'error')
    })
  }

  public markUncertain(input: {
    tenantId: string
    operationKey: string
    attemptId: string
    reason: string
  }): Promise<EffectJournalRecord> {
    return this.transition(input, 'UNCERTAIN', {
      error: bounded(input.reason, 'reason')
    })
  }

  public async get(
    tenantId: string,
    operationKey: string
  ): Promise<EffectJournalRecord | null> {
    const record = this.records.get(key(tenantId, operationKey))
    return record ? clone(record) : null
  }

  private async transition(
    input: {
      tenantId: string
      operationKey: string
      attemptId: string
    },
    state: EffectJournalState,
    values: { result?: unknown; error?: string } = {}
  ): Promise<EffectJournalRecord> {
    const identity = key(input.tenantId, input.operationKey)
    const current = this.records.get(identity)
    if (!current) throw new EffectJournalError('Effect reservation is missing')
    if (current.attemptId !== input.attemptId) {
      throw new EffectJournalError('Effect attempt is fenced')
    }
    if (state === 'EFFECT_STARTED' && current.state !== 'RESERVED') {
      throw new EffectJournalError('Effect cannot start from its current state')
    }
    if (
      (state === 'CONFIRMED' || state === 'FAILED' || state === 'UNCERTAIN') &&
      current.state !== 'EFFECT_STARTED'
    ) {
      if (current.state === state) return clone(current)
      throw new EffectJournalError(
        'Effect outcome is not valid for its current state'
      )
    }
    const next: EffectJournalRecord = {
      ...current,
      state,
      ...(values.result !== undefined ? { result: values.result } : {}),
      ...(values.error !== undefined ? { error: values.error } : {}),
      updatedAt: now()
    }
    this.records.set(identity, next)
    return clone(next)
  }
}

export interface JournaledToolRegistryOptions {
  readonly crashAfterEffectBeforeConfirm?: boolean
  /** Binds effect replay to the exact capability composition. */
  readonly compositionFingerprint?: string
}

function proposalHash(
  tool: ToolDefinition,
  input: unknown,
  compositionFingerprint: string | undefined
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        schemaVersion: 'effect-proposal-v2',
        compositionFingerprint: compositionFingerprint ?? null,
        tool: {
          id: tool.id,
          version: tool.version,
          sideEffect: tool.sideEffect,
          idempotent: tool.idempotent,
          providerId:
            'providerId' in tool
              ? (tool as { providerId?: unknown }).providerId
              : undefined,
          providerVersion:
            'providerVersion' in tool
              ? (tool as { providerVersion?: unknown }).providerVersion
              : undefined
        },
        input
      })
    )
    .digest('hex')
}

/**
 * Wraps only the executor side of a registry. Descriptors remain unchanged,
 * policy and approval still run in the harness before this wrapper is called.
 */
export function createJournaledToolRegistry(
  registry: ToolRegistry,
  journal: EffectJournal,
  options: JournaledToolRegistryOptions = {}
): ToolRegistry {
  return {
    list: () => registry.list(),
    resolve: (toolId, version) => {
      const tool = registry.resolve(toolId, version)
      if (!tool) return undefined
      return journaledTool(tool, journal, options)
    }
  }
}

function journaledTool(
  tool: ToolDefinition,
  journal: EffectJournal,
  options: JournaledToolRegistryOptions
): ToolDefinition {
  const compositionFingerprint = options.compositionFingerprint
    ? bounded(options.compositionFingerprint, 'compositionFingerprint')
    : undefined
  return {
    ...tool,
    execute: async (
      input: unknown,
      context: ToolExecutionContext
    ): Promise<ToolResult> => {
      const operationKey = bounded(context.operationKey ?? '', 'operationKey')
      const attemptId = `attempt_${Date.now()}_${Math.random().toString(16).slice(2)}`
      const reservation = await journal.reserve({
        tenantId: context.tenantId,
        operationKey,
        proposalHash: proposalHash(tool, input, compositionFingerprint),
        attemptId
      })
      if (reservation.state === 'CONFIRMED') {
        return { status: 'SUCCEEDED', output: reservation.result }
      }
      if (
        reservation.state === 'UNCERTAIN' ||
        reservation.state === 'EFFECT_STARTED'
      ) {
        return {
          status: 'REJECTED',
          error:
            'unknown_effect: explicit reconciliation is required before retry'
        }
      }
      if (reservation.attemptId !== attemptId) {
        return {
          status: 'REJECTED',
          error:
            'unknown_effect: an existing reservation requires reconciliation'
        }
      }
      await journal.markStarted({
        tenantId: context.tenantId,
        operationKey,
        attemptId
      })
      try {
        const result = await tool.execute(input, context)
        if (
          options.crashAfterEffectBeforeConfirm &&
          result.status === 'SUCCEEDED'
        ) {
          await journal.markUncertain({
            tenantId: context.tenantId,
            operationKey,
            attemptId,
            reason: 'synthetic crash after effect before confirmation'
          })
          return {
            status: 'REJECTED',
            error:
              'unknown_effect: synthetic crash after effect before confirmation'
          }
        }
        if (result.status === 'SUCCEEDED') {
          await journal.confirm({
            tenantId: context.tenantId,
            operationKey,
            attemptId,
            result: result.output
          })
        } else {
          await journal.fail({
            tenantId: context.tenantId,
            operationKey,
            attemptId,
            error: result.error ?? 'tool failed'
          })
        }
        return result
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'tool execution failed'
        await journal.markUncertain({
          tenantId: context.tenantId,
          operationKey,
          attemptId,
          reason: `unknown effect after executor failure: ${message}`
        })
        return {
          status: 'REJECTED',
          error: 'unknown_effect: executor outcome is uncertain'
        }
      }
    }
  }
}
