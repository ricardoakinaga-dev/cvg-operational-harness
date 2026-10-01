import { randomUUID } from 'node:crypto'
import { HELP_TEXT, parseCommand, type Command } from './commands.ts'
import type { InboundMessage, Member, Note, Organized, Task } from './domain.ts'
import { samePhone } from './domain.ts'
import {
  formatLocalTime,
  unverifiedNumbers,
  type Organizer
} from './organizer.ts'
import type { ShiftStore } from './store.ts'
import type { Transcriber } from './transcriber.ts'
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
}

const MINUTE = 60_000

/**
 * Phase 1 of the Assistente de Plantão (SPEC 0177). Zero power by
 * construction: it reads WhatsApp messages from registered members, keeps
 * notes and tasks in its own log and only sends text back to members.
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
  #queue: Promise<void> = Promise.resolve()

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
  }

  member(phone: string): Member | undefined {
    return this.#members.find((member) => samePhone(member.phone, phone))
  }

  /**
   * Records the message before any processing (idempotent by message id) and
   * queues it. Returns false when the message is ignored.
   */
  receive(message: InboundMessage): boolean {
    const member = this.member(message.fromPhone)
    if (!member) {
      this.#logger.info('shift.message.ignored_unknown_sender', {
        provider: message.provider,
        kind: message.kind
      })
      return false
    }
    if (this.#store.hasMessage(message.messageId)) return false
    this.#store.append({
      type: 'message_received',
      at: this.#now(),
      message: { ...message, fromPhone: member.phone }
    })
    this.#enqueue(message.messageId)
    return true
  }

  /** Re-queues messages that were stored but not processed (restart). */
  resumePending(): number {
    const pending = this.#store.unprocessedMessages()
    for (const message of pending) this.#enqueue(message.messageId)
    return pending.length
  }

  /** Resolves when everything queued so far has been processed. */
  idle(): Promise<void> {
    return this.#queue
  }

  /** Sends due reminders. Called periodically by the scheduler. */
  async tick(): Promise<number> {
    if (this.#store.paused) return 0
    const now = this.#clock().getTime()
    let sent = 0
    for (const task of this.#store.openTasks()) {
      if (Date.parse(task.dueAt) > now) continue
      if (task.remindedCount >= this.#maxReminders) continue
      if (
        task.lastRemindedAt &&
        now - Date.parse(task.lastRemindedAt) <
          this.#reminderIntervalMinutes * MINUTE
      ) {
        continue
      }
      try {
        await this.#whatsapp.sendText(
          task.ownerPhone,
          `⏰ Lembrete #${task.number}: ${describeTask(task)}\nResponda "feito ${task.number}" ou "adiar ${task.number} 30".`
        )
        this.#store.append({
          type: 'task_reminded',
          at: this.#now(),
          number: task.number
        })
        sent += 1
      } catch (error) {
        this.#logger.error('shift.reminder.failed', {
          task: task.number,
          error: errorName(error)
        })
      }
    }
    return sent
  }

  #enqueue(messageId: string): void {
    this.#queue = this.#queue.then(() => this.#process(messageId))
  }

  async #process(messageId: string): Promise<void> {
    const message = this.#store
      .unprocessedMessages()
      .find((candidate) => candidate.messageId === messageId)
    if (!message) return
    const member = this.member(message.fromPhone)!
    const command =
      message.kind === 'text' ? parseCommand(message.text) : undefined

    // A paused assistant keeps storing messages (documents) and only obeys
    // the manager's resume command.
    if (this.#store.paused && command?.type !== 'resume') return

    try {
      const reply = command
        ? this.#runCommand(command, member)
        : await this.#createNote(message, member)
      if (command?.type === 'correct') {
        await this.#send(
          member,
          await this.#correct(command.text, message, member)
        )
      } else if (reply) {
        await this.#send(member, reply)
      }
    } catch (error) {
      this.#logger.error('shift.message.failed', {
        kind: message.kind,
        error: errorName(error)
      })
      await this.#send(
        member,
        'Não consegui processar esta mensagem agora. Ela ficou guardada; tente de novo em alguns minutos ou registre direto no HIS.'
      ).catch(() => undefined)
    }
    this.#store.append({
      type: 'message_processed',
      at: this.#now(),
      messageId
    })
    if (command?.type === 'resume') this.resumePending()
  }

  #runCommand(command: Command, member: Member): string | undefined {
    switch (command.type) {
      case 'help':
        return HELP_TEXT
      case 'list':
        return this.#listTasks(member)
      case 'done': {
        const task = this.#ownTask(command.number, member)
        if (!task)
          return `Não encontrei a pendência ${command.number} aberta para você.`
        this.#store.append({
          type: 'task_done',
          at: this.#now(),
          number: task.number
        })
        return `✅ Pendência ${task.number} concluída. Lembre de registrar no HIS se ainda não registrou.`
      }
      case 'snooze': {
        const task = this.#ownTask(command.number, member)
        if (!task)
          return `Não encontrei a pendência ${command.number} aberta para você.`
        const dueAt = new Date(
          this.#clock().getTime() + command.minutes * MINUTE
        ).toISOString()
        this.#store.append({
          type: 'task_snoozed',
          at: this.#now(),
          number: task.number,
          dueAt
        })
        return `⏳ Pendência ${task.number} adiada para ${formatLocalTime(dueAt)}.`
      }
      case 'confirm': {
        const note = this.#store.lastActiveNote(member.phone)
        if (!note) return 'Não há nota sua para confirmar.'
        if (!note.confirmed) {
          this.#store.append({
            type: 'note_confirmed',
            at: this.#now(),
            noteId: note.id
          })
        }
        return '👍 Nota confirmada.'
      }
      case 'pause':
      case 'resume':
        return this.#pauseOrResume(command.type, member)
      case 'correct':
        return undefined // handled asynchronously by #correct
    }
  }

  #pauseOrResume(type: 'pause' | 'resume', member: Member): string {
    if (!member.manager)
      return 'Só o gestor pode pausar ou retomar o assistente.'
    if (type === 'pause') {
      this.#store.append({ type: 'paused', at: this.#now(), by: member.phone })
      return '⏸️ Assistente pausado. As mensagens continuam guardadas; nenhum lembrete será enviado até "retomar assistente".'
    }
    this.#store.append({ type: 'resumed', at: this.#now(), by: member.phone })
    return '▶️ Assistente retomado. Mensagens recebidas durante a pausa serão processadas agora.'
  }

  async #correct(
    text: string,
    message: InboundMessage,
    member: Member
  ): Promise<string> {
    const previous = this.#store.lastActiveNote(member.phone)
    const reply = await this.#createNote(
      { ...message, text, kind: 'text' },
      member
    )
    const created = this.#store.lastActiveNote(member.phone)
    if (previous && created && previous.id !== created.id) {
      this.#store.append({
        type: 'note_superseded',
        at: this.#now(),
        noteId: previous.id,
        by: created.id
      })
      for (const task of this.#store.openTasks(member.phone)) {
        if (task.noteId === previous.id) {
          this.#store.append({
            type: 'task_cancelled',
            at: this.#now(),
            number: task.number
          })
        }
      }
    }
    return `✏️ Nota anterior substituída.\n\n${reply}`
  }

  async #createNote(message: InboundMessage, member: Member): Promise<string> {
    const noteId = randomUUID()
    let rawText = message.text.trim()
    let mediaFile: string | undefined

    if (message.kind !== 'text') {
      const media = await this.#whatsapp.downloadMedia(message)
      mediaFile = this.#store.saveMedia(
        `${noteId}.${extensionFor(media.mimetype)}`,
        media.bytes
      )
      if (message.kind === 'audio') {
        rawText = await this.#transcriber.transcribe(media)
      }
    }

    if (!rawText) {
      this.#store.append({
        type: 'note_created',
        at: this.#now(),
        note: this.#note(noteId, message, member, '', mediaFile)
      })
      return '📎 Guardei o arquivo na sua nota. Mande um áudio ou texto dizendo do que se trata.'
    }

    let organized: Organized | undefined
    try {
      organized = await this.#organizer.organize(rawText, this.#clock())
    } catch (error) {
      this.#logger.error('shift.organizer.failed', { error: errorName(error) })
    }

    const note = this.#note(
      noteId,
      message,
      member,
      rawText,
      mediaFile,
      organized
    )
    this.#store.append({ type: 'note_created', at: this.#now(), note })
    if (!organized) {
      return `📝 Guardei sua nota, mas não consegui organizá-la agora. Texto recebido:\n\n${rawText}`
    }

    const tasks = organized.pendencias.map((pending) =>
      this.#createTask(member, noteId, pending)
    )
    return formatNoteReply(note, organized, tasks)
  }

  #note(
    id: string,
    message: InboundMessage,
    member: Member,
    rawText: string,
    mediaFile?: string,
    organized?: Organized
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
      unverifiedNumbers: organized ? unverifiedNumbers(organized, rawText) : [],
      confirmed: false
    }
  }

  #createTask(
    member: Member,
    noteId: string,
    pending: Organized['pendencias'][number]
  ): Task {
    const now = this.#clock()
    const said = pending.quando ? Date.parse(pending.quando) : Number.NaN
    // A time in the past or unparseable falls back to the default delay.
    const dueAt =
      Number.isFinite(said) && said > now.getTime() - MINUTE
        ? new Date(said).toISOString()
        : new Date(
            now.getTime() + this.#defaultDueMinutes * MINUTE
          ).toISOString()
    const task: Task = {
      number: this.#store.nextTaskNumber(),
      ownerPhone: member.phone,
      noteId,
      description: pending.descricao,
      ...(pending.paciente ? { patient: pending.paciente } : {}),
      dueAt,
      createdAt: now.toISOString(),
      status: 'open',
      remindedCount: 0
    }
    this.#store.append({ type: 'task_created', at: this.#now(), task })
    return task
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

  async #send(member: Member, text: string): Promise<void> {
    await this.#whatsapp.sendText(member.phone, text)
  }

  #now(): string {
    return this.#clock().toISOString()
  }
}

function describeTask(task: Task): string {
  const patient = task.patient ? ` (${task.patient})` : ''
  return `${task.description}${patient} — ${formatLocalTime(task.dueAt)}`
}

/** Deterministic, paste-ready text for the HIS, built only from the fields. */
export function formatNoteReply(
  note: Note,
  organized: Organized,
  tasks: Task[]
): string {
  const blocks: string[] = []
  for (const patient of organized.pacientes) {
    const header = [
      patient.nome,
      patient.especie,
      patient.leito ? `leito ${patient.leito}` : undefined
    ]
      .filter(Boolean)
      .join(' · ')
    const lines = [`🐾 ${header}`, '— Texto para colar no HIS —']
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
        '📌 Pendências criadas:',
        ...tasks.map((task) => `#${task.number} — ${describeTask(task)}`)
      ].join('\n')
    )
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
  if (blocks.length === 0) blocks.push(`📝 Nota guardada:\n${note.rawText}`)
  blocks.push(
    'Responda "ok" para confirmar ou "corrigir <texto>" para refazer.'
  )
  return blocks.join('\n\n')
}

function extensionFor(mimetype: string): string {
  const base = mimetype.split(';')[0]!.trim()
  const known: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  }
  return known[base] ?? 'bin'
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown'
}
