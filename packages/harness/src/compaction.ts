import { coreHook } from './kernel/hook-authority.ts'
import { createHash, randomUUID } from 'node:crypto'
import { canonicalizeJson } from '@cvg/harness-contracts'
import type { ModelMessage, SessionEventStore } from '@cvg/harness-contracts'
import type { KernelPlugin } from './kernel/types.ts'
import { stop } from './kernel/types.ts'

/**
 * PDSH-025 / SPEC 0206: deterministic context compaction before the model.
 * The estimator only decides the trigger; summaries are derived from the
 * dropped messages themselves, never from a model or provider.
 */

export const COMPACTION_STRATEGY_VERSION = 'harness-compaction-v1'
export const COMPACTION_KEEP_RECENT_DEFAULT = 4
export const COMPACTION_SUMMARY_MAX_CHARS_DEFAULT = 512

export interface CompactableMessage {
  readonly sequence: number
  readonly role: ModelMessage['role']
  readonly content: string
}

export interface ContextCompactionOptions {
  readonly maxInputTokens: number
  readonly keepRecentMessages?: number
  readonly summaryMaxChars?: number
}

export interface ContextCompactionResult {
  readonly compacted: boolean
  readonly strategyVersion: string
  readonly inputTokens: number
  readonly keptMessages: number
  readonly droppedMessages: number
  readonly throughSequence: number | null
  readonly sourceDigest: string | null
  readonly summary: string | null
  /** View to send: `[system summary, ...recent]` when compacted. */
  readonly messages: readonly CompactableMessage[]
}

/** Fixed heuristic (~4 chars per token); decides the trigger only. */
export function estimateContextTokens(
  messages: readonly { readonly content: string }[]
): number {
  let tokens = 0
  for (const message of messages) {
    tokens += Math.ceil(message.content.length / 4)
  }
  return tokens
}

function positiveInt(value: number, fallback: number): number {
  return Number.isSafeInteger(value) && value >= 1 ? value : fallback
}

export function compactConversation(
  messages: readonly CompactableMessage[],
  options: ContextCompactionOptions
): ContextCompactionResult {
  if (
    !Number.isSafeInteger(options.maxInputTokens) ||
    options.maxInputTokens < 1
  ) {
    throw new Error('compaction requires maxInputTokens >= 1')
  }
  const inputTokens = estimateContextTokens(messages)
  if (inputTokens <= options.maxInputTokens || messages.length < 2) {
    return {
      compacted: false,
      strategyVersion: COMPACTION_STRATEGY_VERSION,
      inputTokens,
      keptMessages: messages.length,
      droppedMessages: 0,
      throughSequence: null,
      sourceDigest: null,
      summary: null,
      messages: messages.map((message) => ({ ...message }))
    }
  }
  const keepRecent = positiveInt(
    options.keepRecentMessages ?? COMPACTION_KEEP_RECENT_DEFAULT,
    COMPACTION_KEEP_RECENT_DEFAULT
  )
  const summaryMaxChars = positiveInt(
    options.summaryMaxChars ?? COMPACTION_SUMMARY_MAX_CHARS_DEFAULT,
    COMPACTION_SUMMARY_MAX_CHARS_DEFAULT
  )
  const keepCount = Math.min(keepRecent, messages.length - 1)
  const dropped = messages.slice(0, messages.length - keepCount)
  const kept = messages.slice(messages.length - keepCount)
  const lastDropped = dropped[dropped.length - 1] as CompactableMessage
  const sourceDigest = createHash('sha256')
    .update(
      canonicalizeJson(
        dropped.map(({ sequence, role, content }) => ({
          sequence,
          role,
          content
        }))
      )
    )
    .digest('hex')
  const excerpts = dropped
    .map((message) => `${message.role}:${message.content.slice(0, 60)}`)
    .join(' | ')
  const full = `contexto compactado (${COMPACTION_STRATEGY_VERSION}): ${dropped.length} mensagem(ns) removida(s); digest ${sourceDigest.slice(0, 16)}; ${excerpts}`
  const summary =
    full.length > summaryMaxChars
      ? `${full.slice(0, summaryMaxChars - 1)}…`
      : full
  return {
    compacted: true,
    strategyVersion: COMPACTION_STRATEGY_VERSION,
    inputTokens,
    keptMessages: kept.length,
    droppedMessages: dropped.length,
    throughSequence: lastDropped.sequence,
    sourceDigest,
    summary,
    messages: [
      {
        sequence: lastDropped.sequence,
        role: 'system',
        content: `[contexto compactado] ${summary}`
      },
      ...kept.map((message) => ({ ...message }))
    ]
  }
}

export interface CompactionControlOptions extends ContextCompactionOptions {
  /**
   * Audit boundary: the host records `context/compacted` here (for example
   * with `createSessionCompactionRecorder`). A failing callback fails closed
   * before the model call.
   */
  readonly onCompacted?: (
    result: ContextCompactionResult
  ) => void | Promise<void>
}

export function createCompactionControl(
  options: CompactionControlOptions
): KernelPlugin {
  return {
    name: 'control.context-compaction',
    kind: 'control',
    apply(ctx) {
      ctx.on(
        'model/before-call',
        coreHook('model/before-call', async (call, next) => {
          const messages: CompactableMessage[] = call.request.messages.map(
            (message, index) => ({
              sequence: index + 1,
              role: message.role,
              content: message.content
            })
          )
          const result = compactConversation(messages, options)
          if (!result.compacted) return next()
          if (options.onCompacted) {
            try {
              await options.onCompacted(result)
            } catch {
              return stop(
                'INSUFFICIENT_EVIDENCE',
                'Context compaction could not be recorded; the model call was not started.'
              )
            }
          }
          // I6: the pipeline logs and sends the request after every control
          // adjusted it, so the compacted view is what leaves this point.
          ;(call.request as { messages: readonly ModelMessage[] }).messages =
            result.messages.map(({ role, content }) => ({
              role,
              content
            }))
          return next()
        })
      )
    }
  }
}

export interface SessionCompactionRecorderOptions {
  readonly store: SessionEventStore
  readonly tenantId: string
  readonly sessionId: string
  readonly correlationId: string
  readonly traceId: string
  readonly eventId?: () => string
  readonly clock?: () => Date
}

/** Appends the auditable `context/compacted` session event (PDSH-021). */
export function createSessionCompactionRecorder(
  options: SessionCompactionRecorderOptions
): (result: ContextCompactionResult) => Promise<void> {
  const newEventId = options.eventId ?? randomUUID
  const clock = options.clock ?? (() => new Date())
  return async (result) => {
    if (
      !result.compacted ||
      result.summary === null ||
      result.sourceDigest === null ||
      result.throughSequence === null
    ) {
      return
    }
    await options.store.append({
      tenantId: options.tenantId,
      sessionId: options.sessionId,
      formatVersion: 1,
      eventId: newEventId(),
      timestamp: clock().toISOString(),
      correlationId: options.correlationId,
      traceId: options.traceId,
      type: 'context/compacted',
      payload: {
        throughSequence: result.throughSequence,
        summary: result.summary,
        sourceDigest: result.sourceDigest,
        strategyVersion: result.strategyVersion
      }
    })
  }
}
