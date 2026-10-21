/**
 * SPEC0176 §7 — explicit allowlist projections. No DTO here is built by
 * spreading a persisted record: a new persisted field never reaches a client
 * until it is added to one of these functions.
 */
import { redactSensitiveText, sanitizeAuditEvidencePayload } from '@cvg/shared'
import type {
  AuditEventRecord,
  ConversationPage,
  MessageRecord,
  SessionRecord
} from '@cvg/persistence'
import type { ExecutionRecord, ExecutionState } from '@cvg/harness'

export function projectConversationPage(page: ConversationPage) {
  return {
    items: page.items.map((item) => ({
      id: item.id,
      channel: item.channel,
      status: item.status,
      senderRef: redactSensitiveText(item.senderRef),
      openSessionId: item.openSessionId,
      lastMessageBody:
        item.lastMessageBody === null
          ? null
          : redactSensitiveText(item.lastMessageBody),
      lastMessageAt: item.lastMessageAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    })),
    pageInfo: {
      limit: page.pageInfo.limit,
      offset: page.pageInfo.offset,
      total: page.pageInfo.total,
      hasNextPage: page.pageInfo.hasNextPage
    }
  }
}

export function projectTimeline(timeline: {
  messages: MessageRecord[]
  sessions: SessionRecord[]
}) {
  return {
    messages: timeline.messages.map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      direction: message.direction,
      body: redactSensitiveText(message.body),
      ...(message.runtimeStatus !== undefined
        ? { runtimeStatus: message.runtimeStatus }
        : {}),
      createdAt: message.createdAt
    })),
    sessions: timeline.sessions.map((session) => ({
      id: session.id,
      conversationId: session.conversationId,
      status: session.status,
      takeoverState: session.takeoverState,
      ...(session.agentId !== undefined ? { agentId: session.agentId } : {}),
      ...(session.agentVersionId !== undefined
        ? { agentVersionId: session.agentVersionId }
        : {}),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }))
  }
}

export function projectAuditLimited(events: AuditEventRecord[]) {
  return events.map((event) => ({
    id: event.id,
    type: event.type,
    actorType: event.actorType,
    policyVersion: event.policyVersion,
    createdAt: event.createdAt
  }))
}

export function projectAuditFull(events: AuditEventRecord[]) {
  return events.map((event) => ({
    id: event.id,
    ...(event.tenantId !== undefined ? { tenantId: event.tenantId } : {}),
    type: event.type,
    actorType: event.actorType,
    actorId: event.actorId,
    correlationId: event.correlationId,
    policyVersion: event.policyVersion,
    payload: sanitizeAuditEvidencePayload(event.payload).payload,
    createdAt: event.createdAt
  }))
}

export type PublicExecutionErrorCode =
  | 'execution_cancelled'
  | 'execution_denied'
  | 'execution_needs_review'
  | 'execution_budget_exhausted'
  | 'execution_conflict'
  | 'execution_failed'

export const EXECUTION_ERROR_MESSAGES: Readonly<
  Record<PublicExecutionErrorCode, string>
> = {
  execution_cancelled: 'Execução cancelada.',
  execution_denied: 'Execução recusada pelas regras de segurança.',
  execution_needs_review: 'A execução requer revisão humana.',
  execution_budget_exhausted: 'A execução atingiu um limite operacional.',
  execution_conflict: 'A execução encontrou um conflito de estado.',
  execution_failed: 'Não foi possível concluir a execução.'
}

export const UNKNOWN_EFFECT_MESSAGE =
  'Resultado incerto; é necessária revisão humana.'
export const HANDOFF_PRESENTATION =
  'Atendimento encaminhado para revisão humana.'

const BUDGET_CODES = [
  'max_steps',
  'max_cost',
  'max_duration',
  'max_tokens',
  'max_model_calls',
  'max_tool_calls',
  'max_replans',
  'max_knowledge_calls',
  'max_verification_calls'
] as const

/** Exact persisted failure pairs; anything else is `execution_failed`. */
const FAILURE_CODES: ReadonlyMap<string, PublicExecutionErrorCode> = new Map([
  ['CANCELLED/cancelled', 'execution_cancelled'],
  ['CANCELLED/cancelled_by_operator', 'execution_cancelled'],
  ['POLICY_DENIED/policy_denied', 'execution_denied'],
  ['POLICY_DENIED/approval_rejected', 'execution_denied'],
  ['SEMANTIC_TERMINAL/unsafe_request', 'execution_denied'],
  ['SEMANTIC_TERMINAL/insufficient_evidence', 'execution_needs_review'],
  ['SEMANTIC_TERMINAL/verification_failed', 'execution_needs_review'],
  ['SEMANTIC_TERMINAL/loop_detected', 'execution_needs_review'],
  ['SEMANTIC_TERMINAL/approval_missing', 'execution_needs_review'],
  ...BUDGET_CODES.map(
    (code) =>
      [
        `SEMANTIC_TERMINAL/${code}`,
        'execution_budget_exhausted'
      ] as const satisfies readonly [string, PublicExecutionErrorCode]
  ),
  ['SEMANTIC_TERMINAL/state_conflict', 'execution_conflict'],
  ['TECHNICAL_RETRYABLE/model_failure', 'execution_failed'],
  ['TECHNICAL_RETRYABLE/internal_failure', 'execution_failed'],
  ['TECHNICAL_RETRYABLE/tool_failure', 'execution_failed']
])

/** Known stop reasons persisted without a failure (legacy/defensive). */
const STOP_CODES: ReadonlyMap<string, PublicExecutionErrorCode> = new Map([
  ['CANCELLED', 'execution_cancelled'],
  ['POLICY_DENIED', 'execution_denied'],
  ['UNSAFE_REQUEST', 'execution_denied'],
  ['INSUFFICIENT_EVIDENCE', 'execution_needs_review'],
  ['VERIFICATION_FAILED', 'execution_needs_review'],
  ['LOOP_DETECTED', 'execution_needs_review'],
  ...BUDGET_CODES.map(
    (code) =>
      [
        code.toUpperCase(),
        'execution_budget_exhausted'
      ] as const satisfies readonly [string, PublicExecutionErrorCode]
  ),
  ['STATE_CONFLICT', 'execution_conflict'],
  ['MODEL_FAILURE', 'execution_failed'],
  ['INTERNAL_FAILURE', 'execution_failed'],
  ['TOOL_FAILURE', 'execution_failed']
])

const PENDING_STATES: ReadonlySet<ExecutionState> = new Set([
  'RECEIVED',
  'QUEUED',
  'CLAIMED',
  'RUNNING'
])

const PRESENTATION_STATE: Readonly<Record<string, ExecutionState>> = {
  COMPLETED: 'SUCCEEDED',
  NEEDS_USER_INPUT: 'WAITING_USER',
  APPROVAL_REQUIRED: 'WAITING_APPROVAL'
}

export interface ExecutionPresentation {
  readonly response: string | null
  readonly errorSummary: {
    readonly code: PublicExecutionErrorCode
    readonly message: string
  } | null
}

function summary(code: PublicExecutionErrorCode): ExecutionPresentation {
  return {
    response: null,
    errorSummary: { code, message: EXECUTION_ERROR_MESSAGES[code] }
  }
}

const NOTHING: ExecutionPresentation = { response: null, errorSummary: null }

/**
 * SPEC0176 §7 closed classification. Failure is evaluated before the stop
 * reason, UNKNOWN_EFFECT wins over everything and only the exact handoff pair
 * gets a static presentation. Presentation content is released only for a
 * producer proven to write user-facing text:
 *  - COMPLETED without `toolResult` (model answer or static text). The
 *    single-pass tool path writes the raw tool output into `response` and
 *    always sets `toolResult`, so that branch stays null.
 *  - NEEDS_USER_INPUT / APPROVAL_REQUIRED pass orchestrator intent/reason
 *    fields through unchanged; no producer proof exists, so null.
 */
export function classifyExecutionPresentation(
  record: Pick<ExecutionRecord, 'state' | 'result' | 'failure' | 'approvalId'>
): ExecutionPresentation {
  const { state, result, failure } = record
  if (failure?.kind === 'UNKNOWN_EFFECT') {
    return {
      response: null,
      errorSummary: {
        code: 'execution_needs_review',
        message: UNKNOWN_EFFECT_MESSAGE
      }
    }
  }
  if (
    state === 'FAILED_TERMINAL' &&
    failure?.kind === 'SEMANTIC_TERMINAL' &&
    failure.code === 'human_takeover' &&
    result?.stopReason === 'HUMAN_TAKEOVER'
  ) {
    return { response: HANDOFF_PRESENTATION, errorSummary: null }
  }
  if (PENDING_STATES.has(state)) return NOTHING
  if (failure) {
    const coherent =
      failure.kind === 'CANCELLED'
        ? state === 'CANCELLED'
        : state === 'FAILED_TERMINAL' || state === 'FAILED_RETRYABLE'
    const code = coherent
      ? FAILURE_CODES.get(`${failure.kind}/${failure.code}`)
      : undefined
    return summary(code ?? 'execution_failed')
  }
  if (state === 'CANCELLED') return summary('execution_cancelled')
  if (!result) {
    return state === 'WAITING_USER' || state === 'WAITING_APPROVAL'
      ? NOTHING
      : summary('execution_failed')
  }
  const expectedState = PRESENTATION_STATE[result.stopReason]
  if (expectedState) {
    if (expectedState !== state) return summary('execution_failed')
    if (result.stopReason === 'APPROVAL_REQUIRED' && !record.approvalId) {
      return summary('execution_needs_review')
    }
    if (result.stopReason === 'COMPLETED' && result.toolResult === undefined) {
      return {
        response: redactSensitiveText(result.response),
        errorSummary: null
      }
    }
    return NOTHING
  }
  return summary(STOP_CODES.get(result.stopReason) ?? 'execution_failed')
}

export function projectExecution(record: ExecutionRecord) {
  const presentation = classifyExecutionPresentation(record)
  return {
    viewVersion: 2 as const,
    id: record.id,
    state: record.state,
    attempt: record.attempt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
    response: presentation.response,
    errorSummary: presentation.errorSummary
  }
}

/** Mutation-only acknowledgment for an actor who cannot read the case. */
export function acknowledgeExecution(record: ExecutionRecord) {
  return { id: record.id, state: record.state }
}
