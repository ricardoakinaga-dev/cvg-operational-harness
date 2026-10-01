import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import type { InboundMessage, Note, ShiftEvent, Task } from './domain.ts'

/**
 * State rebuilt from an append-only JSONL event log. The log is the document
 * of record (decision D4): nothing is rewritten or deleted here.
 */
export class ShiftStore {
  readonly #file: string | undefined
  readonly #mediaDir: string | undefined
  readonly #messages = new Map<string, InboundMessage>()
  readonly #processed = new Set<string>()
  readonly #notes = new Map<string, Note>()
  readonly #tasks = new Map<number, Task>()
  #paused = false

  /** `dataDir` undefined keeps everything in memory (tests). */
  constructor(dataDir?: string) {
    if (dataDir) {
      mkdirSync(dataDir, { recursive: true })
      this.#mediaDir = join(dataDir, 'media')
      mkdirSync(this.#mediaDir, { recursive: true })
      this.#file = join(dataDir, 'events.jsonl')
      if (existsSync(this.#file)) {
        for (const line of readFileSync(this.#file, 'utf8').split('\n')) {
          if (line.trim()) this.#apply(JSON.parse(line) as ShiftEvent)
        }
      }
    }
  }

  append(event: ShiftEvent): void {
    if (this.#file) appendFileSync(this.#file, `${JSON.stringify(event)}\n`)
    this.#apply(event)
  }

  /** Stores a media file next to the log; returns its file name. */
  saveMedia(name: string, bytes: Uint8Array): string {
    if (this.#mediaDir) writeFileSync(join(this.#mediaDir, name), bytes)
    return name
  }

  hasMessage(messageId: string): boolean {
    return this.#messages.has(messageId)
  }

  unprocessedMessages(): InboundMessage[] {
    return [...this.#messages.values()].filter(
      (message) => !this.#processed.has(message.messageId)
    )
  }

  note(id: string): Note | undefined {
    return this.#notes.get(id)
  }

  lastActiveNote(authorPhone: string): Note | undefined {
    return [...this.#notes.values()]
      .filter((note) => note.authorPhone === authorPhone && !note.supersededBy)
      .at(-1)
  }

  task(number: number): Task | undefined {
    return this.#tasks.get(number)
  }

  openTasks(ownerPhone?: string): Task[] {
    return [...this.#tasks.values()]
      .filter(
        (task) =>
          task.status === 'open' &&
          (ownerPhone === undefined || task.ownerPhone === ownerPhone)
      )
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
  }

  nextTaskNumber(): number {
    return this.#tasks.size + 1
  }

  get paused(): boolean {
    return this.#paused
  }

  #apply(event: ShiftEvent): void {
    switch (event.type) {
      case 'message_received':
        this.#messages.set(event.message.messageId, event.message)
        return
      case 'message_processed':
        this.#processed.add(event.messageId)
        return
      case 'note_created':
        this.#notes.set(event.note.id, { ...event.note })
        return
      case 'note_confirmed': {
        const note = this.#notes.get(event.noteId)
        if (note) note.confirmed = true
        return
      }
      case 'note_superseded': {
        const note = this.#notes.get(event.noteId)
        if (note) note.supersededBy = event.by
        return
      }
      case 'task_created':
        this.#tasks.set(event.task.number, { ...event.task })
        return
      case 'task_done':
        this.#updateTask(event.number, { status: 'done', doneAt: event.at })
        return
      case 'task_cancelled':
        this.#updateTask(event.number, { status: 'cancelled' })
        return
      case 'task_snoozed':
        this.#updateTask(event.number, {
          dueAt: event.dueAt,
          remindedCount: 0
        })
        return
      case 'task_reminded': {
        const task = this.#tasks.get(event.number)
        if (task) {
          task.remindedCount += 1
          task.lastRemindedAt = event.at
        }
        return
      }
      case 'paused':
        this.#paused = true
        return
      case 'resumed':
        this.#paused = false
        return
    }
  }

  #updateTask(number: number, patch: Partial<Task>): void {
    const task = this.#tasks.get(number)
    if (task) Object.assign(task, patch)
    if (task && patch.dueAt) delete task.lastRemindedAt
  }
}
