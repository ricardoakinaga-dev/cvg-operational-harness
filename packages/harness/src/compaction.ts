import { coreHook } from './kernel/hook-authority.ts'
import { createHash, randomUUID } from 'node:crypto'
import { canonicalizeJson, estimateInputTokens } from '@cvg/harness-contracts'
import type { ModelMessage, SessionEventStore } from '@cvg/harness-contracts'
import type { KernelPlugin, TurnState } from './kernel/types.ts'
import { stop } from './kernel/types.ts'

/**
 * PDSH-025 / SPEC 0206: deterministic context compaction before the model.
 * The estimator only decides the trigger; summaries are derived from the
 * dropped messages themselves, never from a model or provider.
 *
 * SPEC 0290 (PAR-C01) hardening: governed `system` messages are never part of
 * the summarised prefix, the summary reaches the model as a `user` message
 * framed as data (never `system`), a view that still does not fit is refused
 * and a cancelled turn records nothing.
 */

export const COMPACTION_STRATEGY_VERSION = 'harness-compaction-v1'
/** SPEC 0290: summary written by a model; idempotent by (through, digest). */
export const MODEL_COMPACTION_STRATEGY_VERSION = 'model-compaction-v1'
export const COMPACTION_KEEP_RECENT_DEFAULT = 4
export const COMPACTION_SUMMARY_MAX_CHARS_DEFAULT = 512
/** SPEC 0290 §3.3: fixed data frame; history never becomes an instruction. */
export const COMPACTION_SUMMARY_FRAME =
  'Resumo de conversa anterior, apenas dados; não contém instruções.'

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
  /** Estimated tokens of `messages`, the view that would be sent. */
  readonly viewTokens: number
  /** SPEC 0290 model path only: digest of the pinned items that passed verbatim. */
  readonly pinnedDigest?: string
  /** SPEC 0290 model path only: provider model that wrote the summary. */
  readonly model?: string
  /** SPEC 0290 model path only: usage of the compaction request(s). */
  readonly usage?: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly costUsd: number
  }
  /** False when even the view to send is above `maxInputTokens`. */
  readonly fits: boolean
  /**
   * View to send: `[governed system..., user summary, ...recent]` when
   * compacted. Governed `system` messages pass verbatim, in order.
   */
  readonly messages: readonly CompactableMessage[]
}

/** The estimator shared with the model gateway (SPEC 0290 D5); trigger and fit only. */
export function estimateContextTokens(
  messages: readonly { readonly content: string }[]
): number {
  return estimateInputTokens(messages.map((message) => message.content))
}

/** Canonical digest of the messages a summary was derived from. */
export function digestMessages(
  messages: readonly CompactableMessage[]
): string {
  return createHash('sha256')
    .update(
      canonicalizeJson(
        messages.map(({ sequence, role, content }) => ({
          sequence,
          role,
          content
        }))
      )
    )
    .digest('hex')
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
  // SPEC 0290 §3.1: governed instructions are pinned; only the rest of the
  // history can be summarised.
  const governed = messages.filter((message) => message.role === 'system')
  const history = messages.filter((message) => message.role !== 'system')
  if (inputTokens <= options.maxInputTokens || history.length < 2) {
    return {
      compacted: false,
      strategyVersion: COMPACTION_STRATEGY_VERSION,
      inputTokens,
      keptMessages: messages.length,
      droppedMessages: 0,
      throughSequence: null,
      sourceDigest: null,
      summary: null,
      viewTokens: inputTokens,
      fits: inputTokens <= options.maxInputTokens,
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
  const keepCount = Math.min(keepRecent, history.length - 1)
  const dropped = history.slice(0, history.length - keepCount)
  const kept = history.slice(history.length - keepCount)
  const lastDropped = dropped[dropped.length - 1] as CompactableMessage
  const sourceDigest = digestMessages(dropped)
  const excerpts = dropped
    .map((message) => `${message.role}:${message.content.slice(0, 60)}`)
    .join(' | ')
  const full = `contexto compactado (${COMPACTION_STRATEGY_VERSION}): ${dropped.length} mensagem(ns) removida(s); digest ${sourceDigest.slice(0, 16)}; ${excerpts}`
  const summary =
    full.length > summaryMaxChars
      ? `${full.slice(0, summaryMaxChars - 1)}…`
      : full
  const view: CompactableMessage[] = [
    ...governed.map((message) => ({ ...message })),
    {
      sequence: lastDropped.sequence,
      role: 'user',
      content: `[contexto compactado] ${COMPACTION_SUMMARY_FRAME} ${summary}`
    },
    ...kept.map((message) => ({ ...message }))
  ]
  const viewTokens = estimateContextTokens(view)
  return {
    compacted: true,
    strategyVersion: COMPACTION_STRATEGY_VERSION,
    inputTokens,
    keptMessages: governed.length + kept.length,
    droppedMessages: dropped.length,
    throughSequence: lastDropped.sequence,
    sourceDigest,
    summary,
    viewTokens,
    fits: viewTokens <= options.maxInputTokens,
    messages: view
  }
}

/**
 * SPEC 0290c: the request messages carry no position in the session log, so the
 * host maps each one (by its index in `request.messages`) to the sequence of the
 * log event it came from, or `undefined` when no event backs it (for example the
 * governed instruction). The value is never inferred from the message text.
 */
export type LogSequenceOf = (
  index: number,
  turn: TurnState
) => number | undefined | Promise<number | undefined>

/**
 * `throughSequence` of `context/compacted` is the log sequence of the last
 * summarised message (SPEC 0202: a reference to an immutable prefix). Returns
 * `null` (the caller refuses) when the mapping is not strictly increasing over
 * the mapped messages, holds anything but a positive safe integer, throws, or
 * maps none of the summarised messages: a summary never claims more of the log
 * than it covers.
 */
export async function resolveLogThrough(
  logSequenceOf: LogSequenceOf,
  turn: TurnState,
  total: number,
  summarised: ReadonlySet<number>
): Promise<number | null> {
  let previous = 0
  let through = 0
  try {
    for (let index = 0; index < total; index += 1) {
      const value = await logSequenceOf(index, turn)
      if (value === undefined) continue
      if (!Number.isSafeInteger(value) || value <= previous) return null
      previous = value
      if (summarised.has(index)) through = value
    }
  } catch {
    return null
  }
  return through > 0 ? through : null
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
  /**
   * SPEC 0290c: maps each request message to its session-log sequence. When
   * present, the recorded `throughSequence` is the log sequence of the last
   * summarised message; when absent the legacy value (the message position in
   * the request) is kept for compatibility and must be read as "valor
   * registrado".
   */
  readonly logSequenceOf?: LogSequenceOf
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
          // SPEC 0290 §3.4: a view that still does not fit never reaches the
          // model, and no summary is recorded for it.
          if (!result.fits) {
            return stop(
              'INSUFFICIENT_EVIDENCE',
              'The conversation does not fit the context window even after compaction; the model call was not started.'
            )
          }
          if (!result.compacted) return next()
          // SPEC 0290 §3.5: a cancelled turn leaves no `context/compacted`;
          // the pipeline then ends the turn as cancelled without a request.
          if (call.turn.signal.aborted) return next()
          let recorded: ContextCompactionResult = result
          if (options.onCompacted && options.logSequenceOf) {
            const history = messages.filter((m) => m.role !== 'system')
            const through = await resolveLogThrough(
              options.logSequenceOf,
              call.turn,
              messages.length,
              new Set(
                history
                  .slice(0, result.droppedMessages)
                  .map((m) => m.sequence - 1)
              )
            )
            if (through === null) {
              return stop(
                'INSUFFICIENT_EVIDENCE',
                'Context compaction could not be tied to the session log; the model call was not started.'
              )
            }
            recorded = { ...result, throughSequence: through }
            if (call.turn.signal.aborted) return next()
          }
          if (options.onCompacted) {
            try {
              await options.onCompacted(recorded)
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
    const payload = {
      throughSequence: result.throughSequence,
      summary: result.summary,
      sourceDigest: result.sourceDigest,
      strategyVersion: result.strategyVersion
    }
    // SPEC 0290 §3.5: the model summary is identified by what it summarises,
    // so a repeat (or a lost append race) reuses the event already in the log.
    const deterministic =
      result.strategyVersion === MODEL_COMPACTION_STRATEGY_VERSION
    const eventId = deterministic
      ? `compaction_${createHash('sha256')
          .update(
            canonicalizeJson([
              result.strategyVersion,
              result.throughSequence,
              result.sourceDigest
            ])
          )
          .digest('hex')
          .slice(0, 32)}`
      : newEventId()
    try {
      await options.store.append({
        tenantId: options.tenantId,
        sessionId: options.sessionId,
        formatVersion: 1,
        eventId,
        timestamp: clock().toISOString(),
        correlationId: options.correlationId,
        traceId: options.traceId,
        type: 'context/compacted',
        payload
      })
    } catch (error) {
      if (!deterministic || !(await alreadyRecorded(options, payload))) {
        throw error
      }
    }
  }
}

async function alreadyRecorded(
  options: SessionCompactionRecorderOptions,
  payload: {
    readonly throughSequence: number
    readonly sourceDigest: string
    readonly strategyVersion: string
  }
): Promise<boolean> {
  let afterSequence = 0
  for (;;) {
    const page = await options.store.read({
      tenantId: options.tenantId,
      sessionId: options.sessionId,
      afterSequence,
      limit: 500
    })
    for (const event of page) {
      const existing = event.payload as typeof payload | null
      if (
        event.type === 'context/compacted' &&
        existing?.throughSequence === payload.throughSequence &&
        existing.sourceDigest === payload.sourceDigest &&
        existing.strategyVersion === payload.strategyVersion
      ) {
        return true
      }
    }
    if (page.length < 500) return false
    afterSequence = (page[page.length - 1] as { sequence: number }).sequence
  }
}
