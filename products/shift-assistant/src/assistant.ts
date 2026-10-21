import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import {
  HELP_TEXT,
  NEW_PATIENT_TEMPLATE,
  parseCommand,
  type Command
} from './commands.ts'
import type {
  InboundMessage,
  Member,
  Note,
  Organized,
  ProcessingStage,
  ShiftEvent,
  Task
} from './domain.ts'
import {
  MAX_ATTEMPTS,
  normalizePatientName,
  RETRY_DELAYS_MS,
  samePhone
} from './domain.ts'
import { evaluateHealth, type AssistantHealth } from './health.ts'
import {
  formatLocalTime,
  unverifiedNumbers,
  type Organizer
} from './organizer.ts'
import type { ShiftStore } from './store.ts'
import type { Transcriber } from './transcriber.ts'
import {
  DEFAULT_TIMEOUTS,
  DispatchError,
  splitForChannel,
  TransportError,
  untilAborted
} from './transport-limits.ts'
import type { WhatsAppClient } from './whatsapp.ts'

export interface ShiftLogger {
  info(event: string, fields?: Record<string, unknown>): void
  error(event: string, fields?: Record<string, unknown>): void
}

export interface ShiftAssistantOptions {
  store: ShiftStore
  members: readonly Member[]
  whatsapp: WhatsAppClient
  transcriber: Transcriber
  organizer: Organizer
  clock?: () => Date
  logger?: ShiftLogger
  /** Reminder for a task said without a time. */
  defaultDueMinutes?: number
  reminderIntervalMinutes?: number
  maxReminders?: number
  /** Whole-job deadline: download, Whisper and organisation (default 210 s). */
  jobTimeoutMs?: number
  /** Stored messages waiting for processing before ingress answers 503. */
  maxPendingMessages?: number
}

/** Outcome of admitting a webhook message. */
export type AdmitResult =
  | 'accepted'
  | 'duplicate'
  | 'ignored'
  | 'queue_full'
  | 'storage_unavailable'
  | 'stopping'

export type { AssistantHealth } from './health.ts'

const MINUTE = 60_000
/**
 * Not-sent reminder failures that no later attempt can fix: the text exceeds
 * the channel ceiling or the channel origin is outside the egress allowlist.
 */
const PERMANENT_NOT_SENT = new Set(['TEXT_TOO_LARGE', 'EGRESS_DENIED'])

type AbortCause = 'paused' | 'shutdown' | 'deadline'

interface Job {
  messageId: string
  startedAt: number
}

interface Failure {
  code: string
  /** True when another attempt cannot succeed (policy, size, format). */
  permanent: boolean
}

/**
 * Phase 1 of the Assistente de Plantão (SPEC 0177), with the reliability
 * contracts of SPEC 0179 that AUD-0621 required: every stored message stays
 * recoverable until its result is committed, drafts never act before the
 * author confirms them, reminders are reserved durably and revalidated before
 * each send, and pause and shutdown never wait on the network. Zero power by
 * construction: it reads WhatsApp messages from registered members, keeps
 * notes and tasks in its own journal and only sends text back to members.
 */
export class ShiftAssistant {
  readonly #store: ShiftStore
  readonly #members: readonly Member[]
  readonly #whatsapp: WhatsAppClient
  readonly #transcriber: Transcriber
  readonly #organizer: Organizer
  readonly #clock: () => Date
  readonly #logger: ShiftLogger
  readonly #defaultDueMinutes: number
  readonly #reminderIntervalMinutes: number
  readonly #maxReminders: number
  readonly #jobTimeoutMs: number
  readonly #maxPending: number
  #queue: Promise<void> = Promise.resolve()
  readonly #queued = new Set<string>()
  readonly #effects = new Set<Promise<unknown>>()
  #job: Job | undefined
  #ticking = false
  #stopping = false
  readonly #stop = new AbortController()
  #pause = new AbortController()
  #activeSince: number
  #scheduler: { intervalMs: number; since: number } | undefined
  #lastTickAt: number | undefined
  #lastProgressAt: number

  constructor(options: ShiftAssistantOptions) {
    this.#store = options.store
    this.#members = options.members
    this.#whatsapp = options.whatsapp
    this.#transcriber = options.transcriber
    this.#organizer = options.organizer
    this.#clock = options.clock ?? (() => new Date())
    this.#logger = options.logger ?? { info() {}, error() {} }
    this.#defaultDueMinutes = options.defaultDueMinutes ?? 120
    this.#reminderIntervalMinutes = options.reminderIntervalMinutes ?? 30
    this.#maxReminders = options.maxReminders ?? 4
    this.#jobTimeoutMs = options.jobTimeoutMs ?? DEFAULT_TIMEOUTS.jobMs
    this.#maxPending = options.maxPendingMessages ?? 1000
    this.#activeSince = this.#clock().getTime()
    this.#lastProgressAt = this.#activeSince
    if (this.#store.paused) this.#pause.abort(new Error('paused'))
  }

  member(phone: string): Member | undefined {
    return this.#members.find((member) => samePhone(member.phone, phone))
  }

  /**
   * Records the message before any processing (idempotent by message id) and
   * queues it. Returns false when the message is not accepted.
   */
  receive(message: InboundMessage): boolean {
    return this.admit(message) === 'accepted'
  }

  /**
   * Admission with its reason. Manager pause/resume commands run in a
   * synchronous control lane: they are committed before this returns and
   * never wait behind content jobs, the network or the backlog limit.
   */
  admit(message: InboundMessage): AdmitResult {
    if (this.#stopping) return 'stopping'
    const member = this.member(message.fromPhone)
    if (!member) {
      this.#logger.info('shift.message.ignored_unknown_sender', {
        provider: message.provider,
        kind: message.kind
      })
      return 'ignored'
    }
    if (this.#store.hasMessage(message.messageId)) return 'duplicate'
    if (!this.#store.storageHealthy) return 'storage_unavailable'
    const stored: InboundMessage = { ...message, fromPhone: member.phone }
    const command =
      message.kind === 'text' ? parseCommand(message.text) : undefined
    if (command?.type === 'pause' || command?.type === 'resume') {
      return this.#control(stored, member, command.type)
    }
    if (this.#store.unprocessedMessages().length >= this.#maxPending) {
      return 'queue_full'
    }
    if (
      !this.#commit([
        { type: 'message_received', at: this.#now(), message: stored }
      ])
    ) {
      return 'storage_unavailable'
    }
    this.#enqueue(message.messageId)
    return 'accepted'
  }

  /** Re-queues stored messages that were not processed (restart, resume). */
  resumePending(): number {
    const pending = this.#store.unprocessedMessages()
    for (const message of pending) this.#enqueue(message.messageId)
    return pending.length
  }

  /**
   * Resolves when everything queued so far, including replies already
   * started, has settled. Never rejects; future retries are not awaited.
   */
  async idle(): Promise<void> {
    for (;;) {
      const queue = this.#queue
      await queue
      await Promise.allSettled([...this.#effects])
      if (queue === this.#queue && this.#effects.size === 0) return
    }
  }

  /** Called by the scheduler that drives `tick`, for readiness. */
  schedulerStarted(intervalMs: number): void {
    this.#scheduler = { intervalMs, since: this.#clock().getTime() }
  }

  /** Stops admission and effects and aborts in-flight work. Idempotent. */
  beginStop(): void {
    if (this.#stopping) return
    this.#stopping = true
    this.#stop.abort(new Error('shutdown'))
  }

  /** Waits for in-flight work up to `timeoutMs`; true when it all settled. */
  async drain(timeoutMs: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const expired = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs)
    })
    try {
      return await Promise.race([this.idle().then(() => true), expired])
    } finally {
      clearTimeout(timer)
    }
  }

  /** Readiness and attention from progress, storage and backlog (health.ts). */
  health(): AssistantHealth {
    return evaluateHealth({
      now: this.#clock().getTime(),
      monotonicNow: performance.now(),
      paused: this.#store.paused,
      stopping: this.#stopping,
      storageHealthy: this.#store.storageHealthy,
      pending: this.#store.unprocessedMessages().map((message) => {
        const retry = this.#store.retryState(message.messageId)
        return {
          receivedAt: message.receivedAt,
          ...(retry ? { nextAttemptAt: retry.nextAttemptAt } : {})
        }
      }),
      maxPending: this.#maxPending,
      jobTimeoutMs: this.#jobTimeoutMs,
      ...(this.#job ? { jobStartedAt: this.#job.startedAt } : {}),
      ...(this.#scheduler ? { scheduler: { ...this.#scheduler } } : {}),
      ...(this.#lastTickAt !== undefined
        ? { lastTickAt: this.#lastTickAt }
        : {}),
      lastProgressAt: this.#lastProgressAt,
      activeSince: this.#activeSince,
      reviewRequired: this.#store.reviewRequiredMessages().length,
      uncertainReminders: this.#store.uncertainReminders().length,
      failedReminders: this.#store.failedReminders().length,
      openTasks: this.#store.openTasks().length
    })
  }

  /**
   * Sends due reminders of confirmed tasks to current members. One tick runs
   * at a time; each send is durably reserved and revalidated (pause,
   * shutdown, storage, task, note, recipient) with no yield before it
   * starts, so a pause recorded mid-tick stops the next reminder.
   */
  async tick(): Promise<number> {
    if (this.#ticking || this.#stopping) return 0
    this.#ticking = true
    this.#lastTickAt = this.#clock().getTime()
    try {
      if (this.#store.paused) return 0
      this.#enqueueDueRetries()
      let sent = 0
      for (const candidate of this.#store.openTasks()) {
        if (this.#stopping || this.#store.paused) break
        if (!this.#store.storageHealthy) break
        const task = this.#store.task(candidate.number)
        if (!task || !this.#reminderDue(task)) continue
        const owner = this.member(task.ownerPhone)
        if (!owner) {
          this.#logger.info('shift.reminder.recipient_not_member', {
            task: task.number
          })
          continue
        }
        const slot = task.remindedCount + 1
        let reserved: boolean
        try {
          reserved = this.#store.reserveReminder(task.number, slot, this.#now())
        } catch {
          this.#storageFailure('reminder_reserve')
          break
        }
        if (!reserved) continue
        const sending = this.#whatsapp.sendText(
          owner.phone,
          `⏰ Lembrete #${task.number}: ${describeTask(task)}\nResponda "feito ${task.number}" ou "adiar ${task.number} 30".`,
          AbortSignal.any([this.#pause.signal, this.#stop.signal])
        )
        try {
          await sending
          this.#commit([
            {
              type: 'task_reminded',
              at: this.#now(),
              number: task.number,
              slot
            }
          ])
          sent += 1
        } catch (error) {
          const outcome =
            error instanceof DispatchError ? error.outcome : 'uncertain'
          const code = errorCode(error)
          const budget =
            outcome === 'not_sent' ? this.#notSentBudget(task, code) : {}
          this.#commit([
            {
              type: 'reminder_dispatch_failed',
              at: this.#now(),
              number: task.number,
              slot,
              outcome,
              code,
              ...budget
            }
          ])
          this.#logger.error('shift.reminder.failed', {
            task: task.number,
            outcome,
            code,
            ...('final' in budget ? { final: budget.final } : {})
          })
        }
      }
      return sent
    } finally {
      this.#ticking = false
    }
  }

  /**
   * Budget of a reminder that provably never left the process (SPEC 0179
   * section 6): five attempts in all at the inbox delays, at once final for
   * a permanent cause. An abort by pause or shutdown before the send is not
   * an attempt.
   */
  #notSentBudget(
    task: Task,
    code: string
  ): { attempt: number; nextAttemptAt?: string; final: boolean } {
    const previous = task.reminderNotSentAttempts ?? 0
    if (code === 'TRANSPORT_ABORTED') return { attempt: previous, final: false }
    const attempt = previous + 1
    if (PERMANENT_NOT_SENT.has(code) || attempt >= MAX_ATTEMPTS) {
      return { attempt, final: true }
    }
    return {
      attempt,
      nextAttemptAt: new Date(
        this.#clock().getTime() + RETRY_DELAYS_MS[attempt - 1]!
      ).toISOString(),
      final: false
    }
  }

  #reminderDue(task: Task): boolean {
    const now = this.#clock().getTime()
    if (task.status !== 'open') return false
    if (Date.parse(task.dueAt) > now) return false
    if (task.remindedCount >= this.#maxReminders) return false
    if (task.reminderUncertain || task.reminderInFlight !== undefined) {
      return false
    }
    if (task.reminderSendFailed) return false
    if (task.reminderRetryAt && Date.parse(task.reminderRetryAt) > now) {
      return false
    }
    if (
      task.lastRemindedAt &&
      now - Date.parse(task.lastRemindedAt) <
        this.#reminderIntervalMinutes * MINUTE
    ) {
      return false
    }
    if (task.noteId !== undefined) {
      const note = this.#store.note(task.noteId)
      if (!note || !note.confirmed || note.supersededBy) return false
    }
    return true
  }

  #control(
    message: InboundMessage,
    member: Member,
    type: 'pause' | 'resume'
  ): AdmitResult {
    const at = this.#now()
    const events: ShiftEvent[] = [{ type: 'message_received', at, message }]
    let reply: string
    if (!member.manager) {
      reply = 'Só o gestor pode pausar ou retomar o assistente.'
    } else if (type === 'pause') {
      if (!this.#store.paused)
        events.push({ type: 'paused', at, by: member.phone })
      reply =
        '⏸️ Assistente pausado. As mensagens continuam guardadas; nenhum lembrete será enviado até "retomar assistente".'
    } else {
      if (this.#store.paused)
        events.push({ type: 'resumed', at, by: member.phone })
      reply =
        '▶️ Assistente retomado. Mensagens recebidas durante a pausa serão processadas agora.'
    }
    events.push({ type: 'message_processed', at, messageId: message.messageId })
    if (!this.#commit(events)) return 'storage_unavailable'
    if (member.manager && type === 'pause') {
      // Nothing new starts after the commit; work in flight is aborted and
      // stays recoverable.
      this.#pause.abort(new Error('paused'))
    } else if (member.manager && this.#pause.signal.aborted) {
      this.#pause = new AbortController()
      this.#activeSince = this.#clock().getTime()
      this.resumePending()
    }
    // The control receipt is the only effect allowed while paused: one
    // attempt with the send deadline, outside the content queue.
    this.#track(this.#reply(member, reply, { control: member.manager }))
    return 'accepted'
  }

  #enqueue(messageId: string): void {
    if (this.#queued.has(messageId)) return
    this.#queued.add(messageId)
    this.#queue = this.#queue
      .then(() => this.#runJob(messageId))
      .catch((error: unknown) => {
        this.#logger.error('shift.job.failed', { code: errorCode(error) })
      })
      .finally(() => {
        this.#queued.delete(messageId)
      })
  }

  #enqueueDueRetries(): void {
    const now = this.#clock().getTime()
    for (const message of this.#store.unprocessedMessages()) {
      const retry = this.#store.retryState(message.messageId)
      if (!retry || Date.parse(retry.nextAttemptAt) <= now) {
        this.#enqueue(message.messageId)
      }
    }
  }

  async #runJob(messageId: string): Promise<void> {
    if (this.#stopping || this.#store.paused || !this.#store.storageHealthy) {
      return
    }
    const message = this.#store.message(messageId)
    if (
      !message ||
      !this.#store
        .unprocessedMessages()
        .some((candidate) => candidate.messageId === messageId)
    ) {
      return
    }
    const member = this.member(message.fromPhone)
    if (!member) {
      // A revoked member's stored message is kept for review; nothing is
      // processed or sent on its behalf.
      this.#commit([
        {
          type: 'message_review_required',
          at: this.#now(),
          messageId,
          reason: 'member_revoked'
        }
      ])
      return
    }
    const retry = this.#store.retryState(messageId)
    if (retry && Date.parse(retry.nextAttemptAt) > this.#clock().getTime()) {
      return
    }

    const deadline = AbortSignal.timeout(this.#jobTimeoutMs)
    const pause = this.#pause.signal
    const signal = AbortSignal.any([deadline, pause, this.#stop.signal])
    const cause = (): AbortCause | undefined =>
      this.#stop.signal.aborted
        ? 'shutdown'
        : pause.aborted
          ? 'paused'
          : deadline.aborted
            ? 'deadline'
            : undefined
    this.#job = { messageId, startedAt: performance.now() }
    this.#lastProgressAt = this.#clock().getTime()
    const stage: { current: ProcessingStage } = { current: 'organize' }
    try {
      const command =
        message.kind === 'text' ? parseCommand(message.text) : undefined
      let outcome: { events: ShiftEvent[]; reply?: string }
      try {
        outcome =
          command && command.type !== 'correct'
            ? this.#runCommand(command, member, messageId)
            : await this.#prepareNote(message, member, signal, stage, command)
      } catch (error) {
        const why = cause()
        if (why === 'paused' || why === 'shutdown') {
          // Not a failure: the stage resumes after the pause or restart.
          this.#logger.info('shift.job.interrupted', { cause: why })
          return
        }
        outcome = this.#failure(message, member, stage.current, error, why)
      }
      const events = [
        ...outcome.events,
        ...(outcome.events.some(
          (event) =>
            event.type === 'message_retry_scheduled' ||
            event.type === 'message_review_required'
        )
          ? []
          : [
              {
                type: 'message_processed' as const,
                at: this.#now(),
                messageId
              }
            ])
      ]
      if (!this.#commit(events)) return
      this.#job = undefined
      this.#lastProgressAt = this.#clock().getTime()
      if (outcome.reply) await this.#reply(member, outcome.reply)
    } finally {
      this.#job = undefined
    }
  }

  /** Maps a failed stage to a retry, a final raw note or human review. */
  #failure(
    message: InboundMessage,
    member: Member,
    stage: ProcessingStage,
    error: unknown,
    why: AbortCause | undefined
  ): { events: ShiftEvent[]; reply?: string } {
    const failure = classify(error, why === 'deadline')
    const previous = this.#store.retryState(message.messageId)
    // One budget per message, whatever stage failed: a failure that moves
    // between stages can never retry (or notify the author) forever.
    const attempt = previous ? previous.attempt + 1 : 1
    const final = failure.permanent || attempt >= MAX_ATTEMPTS
    this.#logger.error('shift.message.failed', {
      kind: message.kind,
      stage,
      attempt,
      code: failure.code,
      final
    })
    if (!final) {
      const delay = RETRY_DELAYS_MS[attempt - 1]!
      return {
        events: [
          {
            type: 'message_retry_scheduled',
            at: this.#now(),
            messageId: message.messageId,
            stage,
            attempt,
            nextAttemptAt: new Date(
              this.#clock().getTime() + delay
            ).toISOString(),
            code: failure.code
          }
        ],
        ...(attempt === 1
          ? {
              reply:
                'Não consegui processar esta mensagem agora. Ela ficou guardada e vou tentar de novo automaticamente; se for urgente, registre direto no HIS.'
            }
          : {})
      }
    }
    if (stage === 'organize') {
      // The source is kept as a raw note, without tasks.
      const text = this.#sourceText(message)
      if (text !== undefined) {
        return this.#rawNote(message, member, text, failure.code)
      }
    }
    return {
      events: [
        {
          type: 'message_review_required',
          at: this.#now(),
          messageId: message.messageId,
          reason: `${stage}:${failure.code}`
        }
      ],
      reply:
        'Não consegui processar esta mensagem. Ela ficou guardada para revisão; registre direto no HIS.'
    }
  }

  /** Text of a message already transcribed is not kept between attempts. */
  #sourceText(message: InboundMessage): string | undefined {
    if (message.kind !== 'text') return undefined
    const command = parseCommand(message.text)
    return command?.type === 'correct' ? command.text : message.text.trim()
  }

  #runCommand(
    command: Command,
    member: Member,
    messageId: string
  ): { events: ShiftEvent[]; reply?: string } {
    const at = this.#now()
    switch (command.type) {
      case 'help':
        return { events: [], reply: HELP_TEXT }
      case 'template':
        return { events: [], reply: NEW_PATIENT_TEMPLATE }
      case 'list':
        return { events: [], reply: this.#listTasks(member) }
      case 'done': {
        const task = this.#ownTask(command.number, member)
        if (!task)
          return {
            events: [],
            reply: `Não encontrei a pendência ${command.number} aberta para você.`
          }
        return {
          events: [{ type: 'task_done', at, number: task.number }],
          reply: `✅ Pendência ${task.number} concluída. Lembre de registrar no HIS se ainda não registrou.`
        }
      }
      case 'snooze': {
        const task = this.#ownTask(command.number, member)
        if (!task)
          return {
            events: [],
            reply: `Não encontrei a pendência ${command.number} aberta para você.`
          }
        // Snoozing never brings a task forward: count from the later of
        // now and the time already set.
        const base = Math.max(this.#clock().getTime(), Date.parse(task.dueAt))
        const dueAt = new Date(base + command.minutes * MINUTE).toISOString()
        return {
          events: [{ type: 'task_snoozed', at, number: task.number, dueAt }],
          reply: `⏳ Pendência ${task.number} adiada para ${formatLocalTime(dueAt)}.`
        }
      }
      case 'confirm':
        return this.#confirm(member, command.code, messageId)
      case 'pause':
      case 'resume':
        // Handled by the control lane; kept for stored legacy messages.
        return {
          events: [],
          reply: member.manager
            ? 'Comando registrado.'
            : 'Só o gestor pode pausar ou retomar o assistente.'
        }
      case 'correct':
        return { events: [] } // handled by #prepareNote
    }
  }

  /**
   * Confirms exactly one of the author's own drafts and activates its draft
   * tasks in the same journal line (SPEC 0179 section 3). With more than one
   * draft the author must name it; notes with unresolved identity or
   * association issues cannot be confirmed.
   */
  #confirm(
    member: Member,
    code: string | undefined,
    messageId: string
  ): { events: ShiftEvent[]; reply: string } {
    const drafts = this.#store.unconfirmedNotes(member.phone)
    let target: Note | undefined
    // A bare "ok" never lands on an older draft while another note of the
    // same author is still being processed or waiting for a retry.
    const notePending = this.#store
      .unprocessedMessages()
      .some(
        (other) =>
          other.messageId !== messageId &&
          other.fromPhone === member.phone &&
          (other.kind !== 'text' ||
            !parseCommand(other.text) ||
            parseCommand(other.text)?.type === 'correct')
      )
    if (!code && notePending) {
      return {
        events: [],
        reply:
          'Ainda estou processando outra mensagem sua. Espere o rascunho dela chegar e responda "ok nota <código>" com o código do rascunho que quer confirmar.'
      }
    }
    if (code) {
      const matches = drafts.filter((note) => noteCode(note) === code)
      if (matches.length !== 1) {
        return {
          events: [],
          reply: `Não encontrei um rascunho seu aguardando confirmação com o código ${code}.`
        }
      }
      target = matches[0]
    } else if (drafts.length === 0) {
      return {
        events: [],
        reply: this.#store.lastActiveNote(member.phone)?.confirmed
          ? 'Sua última nota já está confirmada.'
          : 'Não há nota sua para confirmar.'
      }
    } else if (drafts.length > 1) {
      return {
        events: [],
        reply: [
          `Você tem ${drafts.length} rascunhos aguardando confirmação. Responda com o comando do rascunho certo:`,
          ...drafts.map(
            (note) => `• ok nota ${noteCode(note)} — ${preview(note.rawText)}`
          )
        ].join('\n')
      }
    } else {
      target = drafts[0]
    }
    if (!target) return { events: [], reply: 'Não há nota sua para confirmar.' }
    if (target.blockingIssues && target.blockingIssues.length > 0) {
      return {
        events: [],
        reply: [
          '⛔ Não posso confirmar esta nota:',
          ...target.blockingIssues.map((issue) => `• ${issue}`),
          'Mande "corrigir <texto>" com o paciente e o ID certos.'
        ].join('\n')
      }
    }
    const activated = this.#store
      .tasksOfNote(target.id)
      .filter((task) => task.status === 'draft')
      .map((task) => task.number)
    return {
      events: [
        {
          type: 'note_confirmed',
          at: this.#now(),
          noteId: target.id,
          by: member.phone,
          activated
        }
      ],
      reply:
        activated.length > 0
          ? `👍 Nota confirmada. Pendências ativadas: ${activated.map((number) => `#${number}`).join(', ')}.`
          : '👍 Nota confirmada.'
    }
  }

  /**
   * Downloads, transcribes and organizes a note (or a correction) and returns
   * the single transaction that records it with its draft tasks.
   */
  async #prepareNote(
    message: InboundMessage,
    member: Member,
    signal: AbortSignal,
    stage: { current: ProcessingStage },
    command: Command | undefined
  ): Promise<{ events: ShiftEvent[]; reply?: string }> {
    let rawText =
      command?.type === 'correct' ? command.text : message.text.trim()
    let mediaFile: string | undefined

    if (message.kind !== 'text') {
      stage.current = 'download'
      const media = await untilAborted(
        this.#whatsapp.downloadMedia(message, signal),
        signal
      )
      mediaFile = this.#store.saveMedia(
        `${message.provider}:${message.messageId}`,
        extensionFor(media.mimetype),
        media.bytes
      )
      if (message.kind === 'audio') {
        stage.current = 'transcribe'
        rawText = await untilAborted(
          this.#transcriber.transcribe(media, signal),
          signal
        )
      }
    }

    const noteId = randomUUID()
    if (!rawText) {
      return {
        events: [
          {
            type: 'note_created',
            at: this.#now(),
            note: this.#note(noteId, message, member, '', mediaFile)
          }
        ],
        reply:
          '📎 Guardei o arquivo na sua nota. Mande um áudio ou texto dizendo do que se trata.'
      }
    }

    stage.current = 'organize'
    let organized: Organized
    try {
      organized = await untilAborted(
        this.#organizer.organize(rawText, this.#clock(), signal),
        signal
      )
    } catch (error) {
      if (isPolicyDenied(error)) {
        // NO_MODEL: clinical content never reaches a model. The note is kept
        // as a raw document, without tasks.
        this.#logger.info('shift.organizer.policy_denied', {})
        return this.#rawNote(
          message,
          member,
          rawText,
          'policy_denied',
          mediaFile
        )
      }
      throw error
    }

    // Numbers are checked against what was said before any ID is completed
    // from earlier notes, so only model-invented values are flagged.
    const unverified = unverifiedNumbers(organized, rawText)
    const resolved = this.#resolvePatientIds(organized)
    const tasks: Task[] = []
    const issues = [...resolved.blocking]
    let nextNumber = this.#store.nextTaskNumber()
    for (const pending of resolved.organized.pendencias) {
      const binding = bindPatient(pending, resolved.organized)
      if (binding.issue) issues.push(binding.issue)
      tasks.push(
        this.#draftTask(member, noteId, pending, binding.id, nextNumber)
      )
      nextNumber += 1
    }
    const note = this.#note(
      noteId,
      message,
      member,
      rawText,
      mediaFile,
      resolved.organized,
      unverified,
      issues
    )
    const at = this.#now()
    const events: ShiftEvent[] = [
      { type: 'note_created', at, note },
      ...tasks.map((task) => ({ type: 'task_created' as const, at, task })),
      ...this.#replacementEvents(command, member, noteId)
    ]
    const reply = formatNoteReply(
      note,
      resolved.organized,
      tasks,
      resolved.completed
    )
    return {
      events,
      reply:
        command?.type === 'correct'
          ? `✏️ Nota anterior substituída.\n\n${reply}`
          : reply
    }
  }

  #rawNote(
    message: InboundMessage,
    member: Member,
    rawText: string,
    code: string,
    mediaFile?: string
  ): { events: ShiftEvent[]; reply: string } {
    const command =
      message.kind === 'text' ? parseCommand(message.text) : undefined
    const noteId = randomUUID()
    const note = this.#note(noteId, message, member, rawText, mediaFile)
    const at = this.#now()
    const intro =
      code === 'policy_denied'
        ? '📝 Guardei sua nota como documento, sem organização automática: anotações clínicas não são enviadas a modelo de IA.'
        : '📝 Guardei sua nota, mas não consegui organizá-la.'
    const reply = `${intro} Texto recebido:\n\n${rawText}\n\nResponda "ok" para confirmar o registro (código ${noteCode(note)}) ou "corrigir <texto>" para refazer.`
    return {
      events: [
        { type: 'note_created', at, note },
        ...this.#replacementEvents(command, member, noteId)
      ],
      reply:
        command?.type === 'correct'
          ? `✏️ Nota anterior substituída.\n\n${reply}`
          : reply
    }
  }

  /**
   * A correction supersedes the author's last active note and cancels its
   * draft and open tasks in the same line; the new revision is a draft that
   * needs its own confirmation.
   */
  #replacementEvents(
    command: Command | undefined,
    member: Member,
    noteId: string
  ): ShiftEvent[] {
    if (command?.type !== 'correct') return []
    const previous = this.#store.lastActiveNote(member.phone)
    if (!previous) return []
    const at = this.#now()
    return [
      { type: 'note_superseded', at, noteId: previous.id, by: noteId },
      ...this.#store
        .tasksOfNote(previous.id)
        .filter((task) => task.status === 'draft' || task.status === 'open')
        .map((task) => ({
          type: 'task_cancelled' as const,
          at,
          number: task.number
        }))
    ]
  }

  #note(
    id: string,
    message: InboundMessage,
    member: Member,
    rawText: string,
    mediaFile?: string,
    organized?: Organized,
    unverified: string[] = [],
    blockingIssues: string[] = []
  ): Note {
    return {
      id,
      messageId: message.messageId,
      authorPhone: member.phone,
      createdAt: this.#now(),
      kind: message.kind,
      rawText,
      ...(mediaFile ? { mediaFile } : {}),
      ...(organized ? { organized } : {}),
      unverifiedNumbers: unverified,
      ...(blockingIssues.length > 0 ? { blockingIssues } : {}),
      confirmed: false
    }
  }

  /**
   * Fills a missing patient ID from confirmed notes only when exactly one
   * known patient matches the name (and the bed, when said); otherwise asks.
   * More than one candidate blocks confirmation until corrected.
   */
  #resolvePatientIds(organized: Organized): {
    organized: Organized
    completed: string[]
    blocking: string[]
  } {
    const completed: string[] = []
    const questions: string[] = []
    const blocking: string[] = []
    const repeated = new Set<string>()
    const seen = new Set<string>()
    for (const patient of organized.pacientes) {
      const name = normalizePatientName(patient.nome)
      if (seen.has(name)) repeated.add(name)
      seen.add(name)
    }
    const pacientes = organized.pacientes.map((patient) => {
      if (patient.id) return patient
      if (repeated.has(normalizePatientName(patient.nome))) {
        // Two patients with the same name in one note: memory cannot tell
        // which is which, so neither gets a remembered ID.
        const issue = `Há mais de um paciente chamado ${patient.nome} nesta nota; diga o ID de cada um.`
        if (!blocking.includes(issue)) {
          blocking.push(issue)
          questions.push(
            `Qual é o ID de cada ${patient.nome}? Mande "corrigir" com o texto e os IDs.`
          )
        }
        return patient
      }
      const known = this.#store.knownPatients(patient.nome)
      const byBed = patient.leito
        ? known.filter((candidate) => candidate.bed === patient.leito)
        : []
      const match =
        byBed.length === 1
          ? byBed[0]
          : !patient.leito && known.length === 1
            ? known[0]
            : undefined
      if (match) {
        completed.push(
          `ID ${match.id} do ${patient.nome} veio de uma nota anterior${match.bed ? ` (leito ${match.bed})` : ''}; confira.`
        )
        return { ...patient, id: match.id }
      }
      if (known.length > 1) {
        const question = `Há mais de um ${patient.nome}: ${known
          .map(
            (candidate) =>
              `ID ${candidate.id}${candidate.bed ? ` (leito ${candidate.bed})` : ''}`
          )
          .join(', ')}. Qual deles? Mande "corrigir" com o texto e o ID.`
        questions.push(question)
        blocking.push(`Há mais de um ${patient.nome}; diga qual pelo ID.`)
      } else {
        questions.push(
          `Qual é o ID do ${patient.nome}? Mande "corrigir" com o texto e o ID.`
        )
      }
      return patient
    })
    return {
      organized: {
        ...organized,
        pacientes,
        duvidas: [...organized.duvidas, ...questions]
      },
      completed,
      blocking
    }
  }

  #draftTask(
    member: Member,
    noteId: string,
    pending: Organized['pendencias'][number],
    patientId: string | undefined,
    number: number
  ): Task {
    const now = this.#clock()
    const said = pending.quando ? Date.parse(pending.quando) : Number.NaN
    // A time in the past or unparseable falls back to the default delay,
    // counted from when the draft was prepared.
    const dueAt =
      Number.isFinite(said) && said > now.getTime() - MINUTE
        ? new Date(said).toISOString()
        : new Date(
            now.getTime() + this.#defaultDueMinutes * MINUTE
          ).toISOString()
    return {
      number,
      ownerPhone: member.phone,
      noteId,
      description: pending.descricao,
      ...(pending.paciente ? { patient: pending.paciente } : {}),
      ...(patientId ? { patientId } : {}),
      dueAt,
      createdAt: now.toISOString(),
      status: 'draft',
      remindedCount: 0
    }
  }

  #listTasks(member: Member): string {
    const tasks = this.#store.openTasks(member.phone)
    if (tasks.length === 0) return '🎉 Você não tem pendências abertas.'
    return [
      `Suas pendências abertas (${tasks.length}):`,
      ...tasks.map((task) => `#${task.number} — ${describeTask(task)}`)
    ].join('\n')
  }

  #ownTask(number: number, member: Member): Task | undefined {
    const task = this.#store.task(number)
    return task && task.status === 'open' && task.ownerPhone === member.phone
      ? task
      : undefined
  }

  /**
   * Sends a reply in bounded parts after its result was committed. Content
   * replies are suppressed once a pause or shutdown is recorded; a failed
   * send is logged with its outcome and never retried blindly.
   */
  async #reply(
    member: Member,
    text: string,
    options: { control?: boolean } = {}
  ): Promise<void> {
    const signals = options.control
      ? [this.#stop.signal]
      : [this.#pause.signal, this.#stop.signal]
    for (const part of splitForChannel(text)) {
      if (signals.some((signal) => signal.aborted)) {
        this.#logger.info('shift.reply.suppressed', {})
        return
      }
      if (!this.member(member.phone)) return
      try {
        await this.#whatsapp.sendText(
          member.phone,
          part,
          AbortSignal.any(signals)
        )
      } catch (error) {
        this.#logger.error('shift.reply.failed', {
          outcome: error instanceof DispatchError ? error.outcome : 'uncertain',
          code: errorCode(error)
        })
        return
      }
    }
  }

  #track(effect: Promise<unknown>): void {
    const tracked = effect.catch(() => undefined)
    this.#effects.add(tracked)
    void tracked.finally(() => this.#effects.delete(tracked))
  }

  /** Commits or marks storage unavailable; never throws. */
  #commit(events: ShiftEvent[]): boolean {
    try {
      this.#store.commit(events)
      return true
    } catch {
      this.#storageFailure('commit')
      return false
    }
  }

  #storageFailure(where: string): void {
    this.#logger.error('shift.storage.unavailable', { where })
  }

  #now(): string {
    return this.#clock().toISOString()
  }
}

function describeTask(task: Task): string {
  const label = [
    task.patient,
    task.patientId ? `ID ${task.patientId}` : undefined
  ]
    .filter(Boolean)
    .join(' · ')
  const patient = label ? ` (${label})` : ''
  return `${task.description}${patient} — ${formatLocalTime(task.dueAt)}`
}

/**
 * The patient a task refers to, never chosen by list order: a named patient
 * binds only when exactly one patient of the note carries that name, and a
 * task without a name binds only when the note has a single patient.
 */
function bindPatient(
  pending: Organized['pendencias'][number],
  organized: Organized
): { id?: string; issue?: string } {
  const patients = organized.pacientes
  if (!pending.paciente) {
    const only = patients.length === 1 ? patients[0] : undefined
    return only?.id ? { id: only.id.trim() } : {}
  }
  const wanted = normalizePatientName(pending.paciente)
  const named = patients.filter(
    (patient) => normalizePatientName(patient.nome) === wanted
  )
  if (named.length > 1) {
    const ids = named
      .map((patient) => (patient.id ? `ID ${patient.id}` : 'sem ID'))
      .join(', ')
    return {
      issue: `A pendência "${pending.descricao}" cita ${pending.paciente}, mas há mais de um paciente chamado ${pending.paciente} nesta nota (${ids}).`
    }
  }
  const id = named[0]?.id
  return id ? { id: id.trim() } : {}
}

/** Short code shown in the preview and used by "ok nota <código>". */
/** Short code the author types in "ok nota <código>". */
export function noteCode(note: Note): string {
  return note.id.replace(/-/g, '').slice(0, 8)
}

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat || '(arquivo)'
}

/** Deterministic, paste-ready text for the HIS, built only from the fields. */
export function formatNoteReply(
  note: Note,
  organized: Organized,
  tasks: Task[],
  completedIds: string[] = []
): string {
  const blocks: string[] = [`📝 RASCUNHO ${noteCode(note)}`]
  for (const patient of organized.pacientes) {
    const header = [
      patient.nome,
      patient.id ? `ID ${patient.id}` : 'ID não informado',
      patient.especie,
      patient.leito ? `leito ${patient.leito}` : undefined
    ]
      .filter(Boolean)
      .join(' · ')
    const lines = [`🐾 ${header}`, '— Texto para colar no HIS —']
    if (patient.tutor) lines.push(`Tutor: ${patient.tutor}`)
    if (patient.motivo) lines.push(`Motivo da internação: ${patient.motivo}`)
    if (patient.evolucao) lines.push(`Evolução: ${patient.evolucao}`)
    if (patient.exames_pedidos.length > 0) {
      lines.push(
        `Exames solicitados: ${patient.exames_pedidos.join('; ')} (lançar na comanda)`
      )
    }
    if (patient.condutas.length > 0)
      lines.push(`Condutas: ${patient.condutas.join('; ')}`)
    blocks.push(lines.join('\n'))
  }
  if (tasks.length > 0) {
    blocks.push(
      [
        '📌 Pendências propostas, ainda sem lembrete:',
        ...tasks.map((task) => `#${task.number} — ${describeTask(task)}`)
      ].join('\n')
    )
  }
  if (completedIds.length > 0) {
    blocks.push(completedIds.map((line) => `🔎 ${line}`).join('\n'))
  }
  if (note.unverifiedNumbers.length > 0) {
    blocks.push(
      `⚠️ Confira estes valores, que não reconheci no que você disse: ${note.unverifiedNumbers.join(', ')}`
    )
  }
  if (organized.duvidas.length > 0) {
    blocks.push(
      [
        '❓ Dúvidas:',
        ...organized.duvidas.map((question) => `• ${question}`)
      ].join('\n')
    )
  }
  if (note.blockingIssues && note.blockingIssues.length > 0) {
    blocks.push(
      [
        '⛔ Antes de confirmar:',
        ...note.blockingIssues.map((issue) => `• ${issue}`),
        'Mande "corrigir <texto>" com o paciente e o ID certos.'
      ].join('\n')
    )
  } else {
    blocks.push(
      `Responda "ok" para confirmar e ativar as pendências (código ${noteCode(note)}) ou "corrigir <texto>" para refazer.`
    )
  }
  if (organized.pacientes.length === 0 && tasks.length === 0) {
    blocks.splice(1, 0, `Nota guardada:\n${note.rawText}`)
  }
  return blocks.join('\n\n')
}

function isPolicyDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'policy_denied'
  )
}

/** Stable failure class; content, URLs and stacks never leave this file. */
function classify(error: unknown, deadline: boolean): Failure {
  if (deadline) return { code: 'JOB_DEADLINE', permanent: false }
  if (error instanceof TransportError) {
    return { code: error.code, permanent: !error.retryable }
  }
  if (isPolicyDenied(error)) return { code: 'policy_denied', permanent: true }
  if (typeof error === 'object' && error !== null) {
    const gateway = error as { code?: unknown; retryable?: unknown }
    if (
      typeof gateway.code === 'string' &&
      typeof gateway.retryable === 'boolean'
    ) {
      return { code: gateway.code, permanent: !gateway.retryable }
    }
    const name = (error as { name?: unknown }).name
    // Invalid model JSON or schema: another attempt is not expected to help.
    if (name === 'ZodError' || name === 'SyntaxError') {
      return { code: 'MODEL_OUTPUT_INVALID', permanent: true }
    }
  }
  return { code: 'DEPENDENCY_FAILED', permanent: false }
}

function errorCode(error: unknown): string {
  if (error instanceof TransportError) return error.code
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(code)) {
      return code
    }
    const name = (error as { name?: unknown }).name
    if (typeof name === 'string') return name
  }
  return 'unknown'
}

function extensionFor(mimetype: string): string {
  const base = mimetype.split(';')[0]!.trim()
  const known: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  }
  return known[base] ?? 'bin'
}
