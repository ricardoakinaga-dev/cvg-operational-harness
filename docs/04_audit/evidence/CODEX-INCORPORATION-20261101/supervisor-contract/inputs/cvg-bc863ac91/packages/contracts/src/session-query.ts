import type { SessionEvent } from './session-events.ts'

/** SPEC 0295 §3: listing and tracing of sessions. Read-only, tenant from the composition. */
export const SESSION_QUERY_DEFAULT_LIMIT = 50
export const SESSION_QUERY_MAX_LIMIT = 100
/** Candidates examined per page, before the filter (SPEC 0295 §4.3). */
export const SESSION_QUERY_EXAMINE_CAP = 1000
export const SESSION_QUERY_CURSOR_MAX_CHARS = 512

export interface SessionListFilter {
  readonly parentSession?: string
  readonly origin?: 'subagent'
  readonly agentPreset?: string
  readonly isSeeded?: boolean
  /** Epoch ms, inclusive (`createdAt >= createdAfter`). */
  readonly createdAfter?: number
  /** Epoch ms, exclusive (`createdAt < createdBefore`). */
  readonly createdBefore?: number
}

export interface SessionSummary {
  readonly sessionId: string
  readonly createdAt: number
  readonly isSeeded: boolean
  readonly parentSession?: string
  readonly origin?: 'subagent'
  readonly agentPreset?: string
  readonly inheritedEventCount: number
}

export interface SessionListInput {
  readonly filter?: SessionListFilter
  readonly cursor?: string
  readonly limit?: number
  readonly signal?: AbortSignal
}

export interface SessionListPage {
  readonly items: readonly SessionSummary[]
  /** `null` = the end; otherwise the position after the last candidate examined. */
  readonly nextCursor: string | null
  /** Candidates examined in this window, 0..SESSION_QUERY_EXAMINE_CAP. */
  readonly examined: number
  /** Of those, streams without adopted metadata, left out (only this tenant's). */
  readonly skippedUnadopted: number
}

/** One candidate of the directory window: a position key and the summary, `null` if unadopted. */
export interface SessionDirectoryRow {
  readonly key: number
  readonly summary: SessionSummary | null
}

/**
 * Where sessions are listed from. `window` returns at most `size` rows whose key is below
 * `before` (all rows when absent), in descending key order, BEFORE any filter (SPEC 0295 §4.3).
 */
export interface SessionDirectory {
  window(input: {
    readonly before?: number
    readonly size: number
    readonly signal?: AbortSignal
  }): Promise<readonly SessionDirectoryRow[]>
}

export type TraceRoot =
  | { readonly kind: 'approval'; readonly id: string }
  | { readonly kind: 'operationKey'; readonly id: string }

export type TraceGapReason =
  | 'approval_not_found'
  | 'ambiguous_approval'
  | 'candidates_capped'
  | 'effect_absent'
  | 'execution_ref_mismatch'
  | 'origin_unbound'
  | 'event_not_found'
  | 'multiple_event_candidates'
  | 'tool_result_ambiguous'
  | 'source_conflict'
  | 'source_unavailable'
  | 'budget_exhausted'

export type TraceBudgetKind =
  | 'sessions'
  | 'events'
  | 'bytes'
  | 'calls'
  | 'deadline'
  | 'links'

export interface TraceGap {
  readonly reason: TraceGapReason
  readonly subject?: { readonly kind: string; readonly id: string }
}

export type TraceLink =
  | {
      readonly kind: 'approval'
      readonly approvalId: string
      readonly status: string
      readonly executionRef?: string
      readonly originSessionId?: string
    }
  | {
      readonly kind: 'effect'
      readonly operationKey: string
      readonly state: string
      readonly executionRef?: string
    }
  | {
      readonly kind: 'event'
      readonly sessionId: string
      readonly sequence: number
      readonly eventId: string
      readonly type: SessionEvent['type']
      readonly correlationId: string
      readonly toolId?: string
      readonly outcome?: string
      readonly inherited: boolean
    }

export interface SessionTrace {
  readonly root: TraceRoot
  readonly links: readonly TraceLink[]
  readonly gaps: readonly TraceGap[]
  /** Some budget was reached: the trace is a prefix of what the sources hold. */
  readonly truncated: boolean
  /** ISO instant of the read of each source consulted (not an atomic snapshot). */
  readonly observed: {
    readonly approval?: string
    readonly effect?: string
    readonly events?: string
  }
}

export interface SessionTraceInput {
  readonly approvalId?: string
  readonly operationKey?: string
  readonly signal?: AbortSignal
}

export interface SessionQuery {
  list(input?: SessionListInput): Promise<SessionListPage>
  trace(input: SessionTraceInput): Promise<SessionTrace>
}

/** What the trace reads of an approval: references and status, never the proposal. */
export interface TraceApproval {
  readonly approvalId: string
  readonly operationKey?: string
  readonly executionRef?: string
  readonly status: string
  readonly originSessionId?: string
}

export interface ApprovalReadPort {
  get(
    tenantId: string,
    approvalId: string,
    signal?: AbortSignal
  ): Promise<TraceApproval | undefined>
  /** Candidates for one key, oldest first; `limit` bounds them (SPEC 0295 §5.1). */
  listByOperationKey(
    tenantId: string,
    operationKey: string,
    limit: number,
    signal?: AbortSignal
  ): Promise<readonly TraceApproval[]>
}

export interface TraceEffect {
  readonly operationKey: string
  readonly state: string
  readonly executionRef?: string
}

export interface EffectJournalReadPort {
  get(
    tenantId: string,
    operationKey: string,
    signal?: AbortSignal
  ): Promise<TraceEffect | undefined>
}

export type SessionQueryErrorCode =
  | 'invalid_params'
  | 'invalid_cursor'
  | 'not_found'
  | 'unavailable'
  | 'unsupported'
