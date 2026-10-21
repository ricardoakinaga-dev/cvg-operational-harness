import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import {
  normalizePatientId,
  normalizePatientName,
  SHIFT_EVENT_TYPES,
  type InboundMessage,
  type KnownPatient,
  type Note,
  type ProcessingStage,
  type ShiftEvent,
  type Task
} from './domain.ts'

export type ShiftJournalErrorCode =
  | 'JOURNAL_CORRUPT'
  | 'JOURNAL_RECOVERY_FAILED'
  | 'STORAGE_UNAVAILABLE'

/** Content-free journal failure: segment and line, never event data. */
export class ShiftJournalError extends Error {
  readonly code: ShiftJournalErrorCode

  constructor(code: ShiftJournalErrorCode, detail: string) {
    super(`${code}: ${detail}`)
    this.name = 'ShiftJournalError'
    this.code = code
  }
}

/** Several events committed as one journal line: all or none on replay. */
interface TransactionRecord {
  type: 'transaction'
  at: string
  events: ShiftEvent[]
}

type JournalRecord = ShiftEvent | TransactionRecord

interface Segment {
  file: string
  /** Sealed segments are replayed only up to this many bytes. */
  prefixBytes?: number
  prefixSha256?: string
  originalSha256?: string
  recovery?: string
}

interface Manifest {
  version: 1
  segments: Segment[]
}

export interface RetryState {
  stage: ProcessingStage
  attempt: number
  nextAttemptAt: string
}

const MANIFEST = 'journal.json'
const LEGACY = 'events.jsonl'
const LF = 0x0a

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Writes every byte, then syncs: a short write never passes for a commit. */
function writeAllSync(fd: number, bytes: Uint8Array): void {
  let offset = 0
  while (offset < bytes.byteLength) {
    offset += writeSync(fd, bytes, offset, bytes.byteLength - offset)
  }
  fsyncSync(fd)
}

function appendDurably(path: string, bytes: Uint8Array): void {
  const fd = openSync(path, 'a', 0o600)
  try {
    writeAllSync(fd, bytes)
  } finally {
    closeSync(fd)
  }
}

function createDurably(path: string, bytes: Uint8Array): void {
  const fd = openSync(path, 'wx', 0o600)
  try {
    writeAllSync(fd, bytes)
  } finally {
    closeSync(fd)
  }
}

function syncDirectory(path: string): void {
  const fd = openSync(path, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * State rebuilt from an append-only JSONL journal. The journal is the
 * document of record (decision D4): nothing is rewritten, truncated or
 * deleted here.
 *
 * Each commit is one line written in full and synced before the projection
 * changes (SPEC 0179 sections 2.1 and 5). A final line without its newline
 * never committed: replay keeps the valid prefix, preserves a verified copy
 * of the original bytes and the isolated tail under `recovery/`, seals the
 * segment without touching it and continues in a successor listed in
 * `journal.json`. A delimited line that is not JSON or not a known event,
 * an incomplete line inside the history or a sealed prefix that changed
 * fails closed (AUD-0621 F18). Field-level schema validation of each event
 * is part of the journal V2 contract and is not performed here.
 */
export class ShiftStore {
  readonly #dir: string | undefined
  readonly #mediaDir: string | undefined
  #active: string | undefined
  #storageFailed = false
  readonly #messages = new Map<string, InboundMessage>()
  readonly #processed = new Set<string>()
  readonly #review = new Map<string, string>()
  readonly #retry = new Map<string, RetryState>()
  readonly #notes = new Map<string, Note>()
  readonly #tasks = new Map<number, Task>()
  #paused = false

  /** `dataDir` undefined keeps everything in memory (tests). */
  constructor(dataDir?: string) {
    if (!dataDir) return
    this.#dir = dataDir
    mkdirSync(dataDir, { recursive: true })
    this.#mediaDir = join(dataDir, 'media')
    mkdirSync(this.#mediaDir, { recursive: true })
    const manifest = this.#readManifest()
    manifest.segments.forEach((segment, index) =>
      this.#replay(manifest, segment, index === manifest.segments.length - 1)
    )
    this.#active ??= join(dataDir, manifest.segments.at(-1)!.file)
    // A send that started and never recorded its outcome may have reached
    // the channel: never resend it blindly.
    for (const task of this.#tasks.values()) {
      if (task.reminderInFlight !== undefined) {
        delete task.reminderInFlight
        task.reminderUncertain = true
      }
    }
  }

  append(event: ShiftEvent): void {
    this.commit([event])
  }

  /**
   * Commits `events` as one durable line and only then applies them. Throws
   * `STORAGE_UNAVAILABLE` (and stays unavailable until a restart replays the
   * journal) when the write or sync fails.
   */
  commit(events: ShiftEvent[]): void {
    if (events.length === 0) return
    const record: JournalRecord =
      events.length === 1
        ? events[0]!
        : { type: 'transaction', at: events[0]!.at, events }
    if (this.#active) {
      if (this.#storageFailed) {
        throw new ShiftJournalError(
          'STORAGE_UNAVAILABLE',
          'journal not writable'
        )
      }
      try {
        appendDurably(
          this.#active,
          Buffer.from(`${JSON.stringify(record)}\n`, 'utf8')
        )
      } catch {
        this.#storageFailed = true
        throw new ShiftJournalError(
          'STORAGE_UNAVAILABLE',
          'journal not writable'
        )
      }
    }
    for (const event of events) this.#apply(event)
  }

  get storageHealthy(): boolean {
    return !this.#storageFailed
  }

  /**
   * Stores a media file next to the journal; returns its file name. The name
   * derives from the message, so a retry reuses the same document; bytes that
   * differ are kept separately, never overwritten.
   */
  saveMedia(key: string, extension: string, bytes: Uint8Array): string {
    const base = sha256(key).slice(0, 32)
    let name = `${base}.${extension}`
    if (!this.#mediaDir) return name
    const path = join(this.#mediaDir, name)
    if (existsSync(path)) {
      if (sha256(readFileSync(path)) === sha256(bytes)) return name
      name = `${base}-${sha256(bytes).slice(0, 12)}.${extension}`
      if (existsSync(join(this.#mediaDir, name))) return name
    }
    try {
      createDurably(join(this.#mediaDir, name), bytes)
      syncDirectory(this.#mediaDir)
    } catch {
      this.#storageFailed = true
      throw new ShiftJournalError('STORAGE_UNAVAILABLE', 'media not writable')
    }
    return name
  }

  hasMessage(messageId: string): boolean {
    return this.#messages.has(messageId)
  }

  message(messageId: string): InboundMessage | undefined {
    return this.#messages.get(messageId)
  }

  /** Stored messages still waiting for processing (including retry waits). */
  unprocessedMessages(): InboundMessage[] {
    return [...this.#messages.values()].filter(
      (message) =>
        !this.#processed.has(message.messageId) &&
        !this.#review.has(message.messageId)
    )
  }

  /** Messages kept for human review; never processed automatically. */
  reviewRequiredMessages(): InboundMessage[] {
    return [...this.#messages.values()].filter((message) =>
      this.#review.has(message.messageId)
    )
  }

  retryState(messageId: string): RetryState | undefined {
    const state = this.#retry.get(messageId)
    return state ? { ...state } : undefined
  }

  note(id: string): Note | undefined {
    return this.#notes.get(id)
  }

  lastActiveNote(authorPhone: string): Note | undefined {
    return [...this.#notes.values()]
      .filter((note) => note.authorPhone === authorPhone && !note.supersededBy)
      .at(-1)
  }

  /** The author's active notes still waiting for "ok", oldest first. */
  unconfirmedNotes(authorPhone: string): Note[] {
    return [...this.#notes.values()].filter(
      (note) =>
        note.authorPhone === authorPhone &&
        !note.supersededBy &&
        !note.confirmed
    )
  }

  /**
   * Patients with an ID seen in confirmed, active notes, most recent first.
   * Drafts, superseded notes and IDs flagged as never said are not memory
   * (SPEC 0179 section 4). Phase 1 has no HIS access, so this is the
   * assistant's only memory of who is who.
   */
  knownPatients(name: string): KnownPatient[] {
    const wanted = normalizePatientName(name)
    const byId = new Map<string, KnownPatient>()
    for (const note of this.#notes.values()) {
      if (note.supersededBy || !note.confirmed) continue
      for (const patient of note.organized?.pacientes ?? []) {
        if (!patient.id || normalizePatientName(patient.nome) !== wanted)
          continue
        const id = patient.id
        if (note.unverifiedNumbers.some((value) => id.includes(value))) continue
        byId.set(normalizePatientId(id), {
          id,
          name: patient.nome,
          ...(patient.leito ? { bed: patient.leito } : {}),
          lastSeen: note.createdAt
        })
      }
    }
    return [...byId.values()].sort((a, b) =>
      b.lastSeen.localeCompare(a.lastSeen)
    )
  }

  task(number: number): Task | undefined {
    return this.#tasks.get(number)
  }

  tasksOfNote(noteId: string): Task[] {
    return [...this.#tasks.values()].filter((task) => task.noteId === noteId)
  }

  /** Active tasks only: drafts wait for confirmation. */
  openTasks(ownerPhone?: string): Task[] {
    return [...this.#tasks.values()]
      .filter(
        (task) =>
          task.status === 'open' &&
          (ownerPhone === undefined || task.ownerPhone === ownerPhone)
      )
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt))
  }

  /** Reminders whose delivery is unknown; they wait for "adiar"/"feito". */
  uncertainReminders(): Task[] {
    return [...this.#tasks.values()].filter(
      (task) => task.status === 'open' && task.reminderUncertain === true
    )
  }

  /** Never reused, even after a restart or with gaps in the history. */
  nextTaskNumber(): number {
    let max = 0
    for (const number of this.#tasks.keys()) max = Math.max(max, number)
    return max + 1
  }

  /**
   * Durably reserves reminder `slot` of an open task before its send starts.
   * Returns false when another reservation, an uncertain send or the slot
   * count already holds the window, so concurrent ticks send once.
   */
  reserveReminder(number: number, slot: number, at: string): boolean {
    const task = this.#tasks.get(number)
    if (
      !task ||
      task.status !== 'open' ||
      task.reminderInFlight !== undefined ||
      task.reminderUncertain === true ||
      task.remindedCount + 1 !== slot
    ) {
      return false
    }
    this.append({ type: 'reminder_dispatch_started', at, number, slot })
    return true
  }

  get paused(): boolean {
    return this.#paused
  }

  #readManifest(): Manifest {
    const path = join(this.#dir!, MANIFEST)
    if (!existsSync(path)) return { version: 1, segments: [{ file: LEGACY }] }
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      throw new ShiftJournalError('JOURNAL_CORRUPT', 'manifest unreadable')
    }
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.segments) ||
      parsed.segments.length === 0 ||
      !parsed.segments.every(
        (segment) =>
          isRecord(segment) &&
          typeof segment.file === 'string' &&
          /^events(?:-\d{4})?\.jsonl$/.test(segment.file)
      )
    ) {
      throw new ShiftJournalError('JOURNAL_CORRUPT', 'manifest invalid')
    }
    return parsed as unknown as Manifest
  }

  #replay(manifest: Manifest, segment: Segment, last: boolean): void {
    const path = join(this.#dir!, segment.file)
    if (!existsSync(path)) {
      if (last && manifest.segments.length === 1) return // new volume
      throw new ShiftJournalError('JOURNAL_CORRUPT', `${segment.file} missing`)
    }
    const bytes = readFileSync(path)
    const sealed = segment.prefixBytes !== undefined
    if (sealed) {
      const prefix = bytes.subarray(0, segment.prefixBytes)
      if (
        prefix.byteLength !== segment.prefixBytes ||
        sha256(prefix) !== segment.prefixSha256
      ) {
        throw new ShiftJournalError(
          'JOURNAL_CORRUPT',
          `${segment.file} prefix hash mismatch`
        )
      }
    }
    const view = sealed ? bytes.subarray(0, segment.prefixBytes) : bytes
    const end = view.lastIndexOf(LF) + 1
    this.#replayLines(view.subarray(0, end), segment.file)
    const tail = view.subarray(end)
    if (tail.byteLength === 0) return
    if (sealed || !last) {
      throw new ShiftJournalError(
        'JOURNAL_CORRUPT',
        `${segment.file} incomplete line inside the history`
      )
    }
    this.#isolateTail(manifest, segment, bytes, end)
  }

  #replayLines(bytes: Uint8Array, file: string): void {
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new ShiftJournalError('JOURNAL_CORRUPT', `${file} invalid UTF-8`)
    }
    const lines = text.split('\n')
    lines.pop() // after the final newline
    lines.forEach((line, index) => {
      if (!line.trim()) return
      let record: unknown
      try {
        record = JSON.parse(line)
      } catch {
        throw new ShiftJournalError(
          'JOURNAL_CORRUPT',
          `${file} line ${index + 1} is not JSON`
        )
      }
      for (const event of this.#eventsOf(record, file, index + 1)) {
        this.#apply(event)
      }
    })
  }

  #eventsOf(record: unknown, file: string, line: number): ShiftEvent[] {
    const invalid = () =>
      new ShiftJournalError('JOURNAL_CORRUPT', `${file} line ${line} invalid`)
    if (!isRecord(record) || typeof record.type !== 'string') throw invalid()
    if (record.type === 'transaction') {
      if (!Array.isArray(record.events) || record.events.length === 0) {
        throw invalid()
      }
      return record.events.map((event) => {
        if (
          !isRecord(event) ||
          !SHIFT_EVENT_TYPES.has(event.type as ShiftEvent['type'])
        ) {
          throw invalid()
        }
        return event as unknown as ShiftEvent
      })
    }
    if (!SHIFT_EVENT_TYPES.has(record.type as ShiftEvent['type'])) {
      throw invalid()
    }
    return [record as unknown as ShiftEvent]
  }

  /**
   * Preserves the uncommitted tail of `segment` and continues in a successor
   * segment. Every copy is verified and synced before the manifest changes;
   * any failure keeps the volume as it was and refuses to start.
   */
  #isolateTail(
    manifest: Manifest,
    segment: Segment,
    original: Buffer,
    prefixBytes: number
  ): void {
    const dir = this.#dir!
    const id = randomUUID()
    const recovery = join('recovery', id)
    const originalSha256 = sha256(original)
    const tail = original.subarray(prefixBytes)
    try {
      mkdirSync(join(dir, recovery), { recursive: true, mode: 0o700 })
      const copy = join(dir, recovery, `original-${originalSha256}.jsonl`)
      createDurably(copy, original)
      if (sha256(readFileSync(copy)) !== originalSha256) {
        throw new Error('copy hash mismatch')
      }
      createDurably(join(dir, recovery, 'tail.bin'), tail)
      createDurably(
        join(dir, recovery, 'tail.json'),
        Buffer.from(
          `${JSON.stringify(
            {
              segment: segment.file,
              offset: prefixBytes,
              length: tail.byteLength,
              sha256: sha256(tail),
              originalSha256,
              reason: 'final line without newline is not a commit'
            },
            null,
            2
          )}\n`
        )
      )
      syncDirectory(join(dir, recovery))
      syncDirectory(join(dir, 'recovery'))
      const successor = `events-${String(manifest.segments.length).padStart(4, '0')}.jsonl`
      const successorPath = join(dir, successor)
      // A crash after creating the successor and before the manifest rename
      // leaves it empty and unlisted: reuse it, never anything with content.
      if (!existsSync(successorPath)) {
        createDurably(successorPath, new Uint8Array())
      } else if (readFileSync(successorPath).byteLength !== 0) {
        throw new Error('unlisted successor has content')
      }
      const next: Manifest = {
        version: 1,
        segments: [
          ...manifest.segments.slice(0, -1),
          {
            file: segment.file,
            prefixBytes,
            prefixSha256: sha256(original.subarray(0, prefixBytes)),
            originalSha256,
            recovery
          },
          { file: successor }
        ]
      }
      const temporary = join(dir, `${MANIFEST}.${id}.tmp`)
      createDurably(
        temporary,
        Buffer.from(`${JSON.stringify(next, null, 2)}\n`)
      )
      renameSync(temporary, join(dir, MANIFEST))
      syncDirectory(dirname(temporary))
      this.#active = join(dir, successor)
    } catch {
      throw new ShiftJournalError(
        'JOURNAL_RECOVERY_FAILED',
        `${segment.file} tail could not be preserved`
      )
    }
    this.append({
      type: 'recovery_recorded',
      at: new Date().toISOString(),
      segment: segment.file,
      originalSha256,
      prefixBytes,
      tailBytes: tail.byteLength,
      tailSha256: sha256(tail),
      recoveryDir: recovery
    })
  }

  #apply(event: ShiftEvent): void {
    switch (event.type) {
      case 'message_received':
        this.#messages.set(event.message.messageId, event.message)
        return
      case 'message_processed':
        this.#processed.add(event.messageId)
        this.#retry.delete(event.messageId)
        return
      case 'message_retry_scheduled':
        this.#retry.set(event.messageId, {
          stage: event.stage,
          attempt: event.attempt,
          nextAttemptAt: event.nextAttemptAt
        })
        return
      case 'message_review_required':
        this.#review.set(event.messageId, event.reason)
        this.#retry.delete(event.messageId)
        return
      case 'note_created':
        this.#notes.set(event.note.id, { ...event.note })
        return
      case 'note_confirmed': {
        const note = this.#notes.get(event.noteId)
        if (note) note.confirmed = true
        for (const task of this.#tasks.values()) {
          if (
            task.noteId === event.noteId &&
            task.status === 'draft' &&
            (!event.activated || event.activated.includes(task.number))
          ) {
            task.status = 'open'
          }
        }
        return
      }
      case 'note_superseded': {
        const note = this.#notes.get(event.noteId)
        if (note) note.supersededBy = event.by
        return
      }
      case 'task_created': {
        const task = { ...event.task }
        // Journals written before AUD-0621 stored tasks as open next to an
        // unconfirmed note: they project as inactive drafts.
        if (
          task.status === 'open' &&
          task.noteId !== undefined &&
          this.#notes.get(task.noteId)?.confirmed !== true
        ) {
          task.status = 'draft'
        }
        this.#tasks.set(task.number, task)
        return
      }
      case 'task_done':
        this.#updateTask(event.number, { status: 'done', doneAt: event.at })
        return
      case 'task_cancelled':
        this.#updateTask(event.number, { status: 'cancelled' })
        return
      case 'task_snoozed': {
        this.#updateTask(event.number, {
          dueAt: event.dueAt,
          remindedCount: 0
        })
        const task = this.#tasks.get(event.number)
        if (task) {
          delete task.reminderUncertain
          delete task.reminderInFlight
        }
        return
      }
      case 'reminder_dispatch_started': {
        const task = this.#tasks.get(event.number)
        if (task) task.reminderInFlight = event.slot
        return
      }
      case 'reminder_dispatch_failed': {
        const task = this.#tasks.get(event.number)
        if (!task) return
        delete task.reminderInFlight
        if (event.outcome === 'uncertain') task.reminderUncertain = true
        return
      }
      case 'task_reminded': {
        const task = this.#tasks.get(event.number)
        if (task) {
          task.remindedCount += 1
          task.lastRemindedAt = event.at
          delete task.reminderInFlight
        }
        return
      }
      case 'paused':
        this.#paused = true
        return
      case 'resumed':
        this.#paused = false
        return
      case 'recovery_recorded':
        return
    }
  }

  #updateTask(number: number, patch: Partial<Task>): void {
    const task = this.#tasks.get(number)
    if (task) Object.assign(task, patch)
    if (task && patch.dueAt) delete task.lastRemindedAt
  }
}
