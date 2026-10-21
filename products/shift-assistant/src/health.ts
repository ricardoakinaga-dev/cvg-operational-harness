/**
 * Readiness and attention status of the shift assistant (SPEC 0179 sections
 * 8.3 and 10). `/health/live`, `/health/ready` and `/health` publish only
 * these stable codes and counters, never notes, patients, phones, text, URLs
 * or secrets. The external monitor (src/monitor.ts) maps exactly these codes;
 * anything else it receives is reported as `not_ready`, never echoed.
 */

/** Codes that make `/health/ready` answer 503. */
export const READINESS_REASON_CODES = [
  'storage_unavailable',
  'stopping',
  'backlog_full',
  'job_deadline_exceeded',
  'scheduler_stale',
  'inbox_stalled'
] as const
export type ReadinessReasonCode = (typeof READINESS_REASON_CODES)[number]

/** Operator attention that does not make the service unready. */
export const ATTENTION_CODES = [
  'review_required',
  'reminder_uncertain',
  'reminder_send_failed'
] as const
export type AttentionCode = (typeof ATTENTION_CODES)[number]

/** Slack added to every deadline before progress is declared missing. */
export const HEALTH_GRACE_MS = 30_000

export interface AssistantHealth {
  ready: boolean
  mode: 'running' | 'paused' | 'stopping'
  effectsEnabled: boolean
  /** Stable codes for readiness failures; empty when ready. */
  reasonCodes: ReadinessReasonCode[]
  /** Operator attention that does not make the service unready. */
  attention: AttentionCode[]
  pendingMessages: number
  retryingMessages: number
  reviewRequiredMessages: number
  openTasks: number
  uncertainReminders: number
  failedReminders: number
}

export interface PendingInput {
  receivedAt: string
  /** Present when the message waits for a scheduled retry. */
  nextAttemptAt?: string
}

export interface HealthInput {
  /** Wall clock (the assistant's clock), milliseconds. */
  now: number
  /** Monotonic clock, milliseconds (job deadlines). */
  monotonicNow: number
  paused: boolean
  stopping: boolean
  storageHealthy: boolean
  pending: readonly PendingInput[]
  maxPending: number
  jobTimeoutMs: number
  /** Monotonic start of the job in progress, if any. */
  jobStartedAt?: number
  scheduler?: { intervalMs: number; since: number }
  lastTickAt?: number
  lastProgressAt: number
  /** Last time processing was (re)enabled: start or resume. */
  activeSince: number
  reviewRequired: number
  uncertainReminders: number
  failedReminders: number
  openTasks: number
}

/**
 * Inbox without progress: an eligible message waited longer than the job
 * deadline plus the grace (210 s + 30 s by default) and no job started or
 * finished in that time. A retry is woken by the scheduler, so its wait also
 * allows one scheduler round; a healthy, moving backlog, a future retry or a
 * pause are not a stall.
 */
function inboxStalled(input: HealthInput): boolean {
  const base = input.jobTimeoutMs + HEALTH_GRACE_MS
  if (input.now - input.lastProgressAt <= base) return false
  const round = input.scheduler?.intervalMs ?? 0
  return input.pending.some((message) => {
    const retryAt =
      message.nextAttemptAt === undefined
        ? undefined
        : Date.parse(message.nextAttemptAt)
    const eligibleSince = Math.max(
      Date.parse(message.receivedAt),
      retryAt ?? 0,
      input.activeSince
    )
    const limit = retryAt === undefined ? base : base + round
    return input.now - eligibleSince > limit
  })
}

export function evaluateHealth(input: HealthInput): AssistantHealth {
  const reasons: ReadinessReasonCode[] = []
  const attention: AttentionCode[] = []
  if (!input.storageHealthy) reasons.push('storage_unavailable')
  if (input.stopping) reasons.push('stopping')
  if (input.pending.length >= input.maxPending) reasons.push('backlog_full')
  if (
    input.jobStartedAt !== undefined &&
    input.monotonicNow - input.jobStartedAt >
      input.jobTimeoutMs + HEALTH_GRACE_MS
  ) {
    reasons.push('job_deadline_exceeded')
  }
  if (input.scheduler) {
    const last = input.lastTickAt ?? input.scheduler.since
    if (input.now - last > 2 * input.scheduler.intervalMs + HEALTH_GRACE_MS) {
      reasons.push('scheduler_stale')
    }
  }
  if (!input.paused && inboxStalled(input)) reasons.push('inbox_stalled')
  if (input.reviewRequired > 0) attention.push('review_required')
  if (input.uncertainReminders > 0) attention.push('reminder_uncertain')
  if (input.failedReminders > 0) attention.push('reminder_send_failed')
  const ready = reasons.length === 0
  return {
    ready,
    mode: input.stopping ? 'stopping' : input.paused ? 'paused' : 'running',
    effectsEnabled: ready && !input.paused,
    reasonCodes: reasons,
    attention,
    pendingMessages: input.pending.length,
    retryingMessages: input.pending.filter(
      (message) => message.nextAttemptAt !== undefined
    ).length,
    reviewRequiredMessages: input.reviewRequired,
    openTasks: input.openTasks,
    uncertainReminders: input.uncertainReminders,
    failedReminders: input.failedReminders
  }
}
