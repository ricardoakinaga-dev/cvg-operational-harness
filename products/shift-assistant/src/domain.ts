import { z } from 'zod'

/** A registered team member. Only members can talk to the assistant. */
export interface Member {
  phone: string
  name: string
  manager: boolean
}

export type MessageKind = 'text' | 'audio' | 'image'

/** Provider-neutral inbound WhatsApp message. */
export interface InboundMessage {
  provider: 'waha' | 'evolution'
  messageId: string
  fromPhone: string
  kind: MessageKind
  text: string
  /** Opaque reference the provider client uses to download the media. */
  mediaRef?: string
  mimetype?: string
  receivedAt: string
}

export const OrganizedSchema = z.object({
  pacientes: z
    .array(
      z.object({
        nome: z.string().min(1).max(120),
        /** Patient ID in the HIS (ficha/prontuário), exactly as said. */
        id: z.string().max(40).nullish(),
        leito: z.string().max(40).nullish(),
        especie: z.string().max(60).nullish(),
        tutor: z.string().max(120).nullish(),
        motivo: z.string().max(1000).nullish(),
        evolucao: z.string().max(4000).nullish(),
        exames_pedidos: z.array(z.string().min(1).max(200)).max(30).default([]),
        condutas: z.array(z.string().min(1).max(500)).max(30).default([])
      })
    )
    .max(20)
    .default([]),
  pendencias: z
    .array(
      z.object({
        descricao: z.string().min(1).max(300),
        paciente: z.string().max(120).nullish(),
        quando: z.string().max(40).nullish()
      })
    )
    .max(20)
    .default([]),
  duvidas: z.array(z.string().min(1).max(300)).max(10).default([])
})

export type Organized = z.infer<typeof OrganizedSchema>

export interface Note {
  id: string
  messageId: string
  authorPhone: string
  createdAt: string
  kind: MessageKind
  rawText: string
  mediaFile?: string
  organized?: Organized
  /** Numbers in the organized output that do not appear in the raw text. */
  unverifiedNumbers: string[]
  /**
   * Identity or association problems the author must resolve with
   * "corrigir" before the note can be confirmed (SPEC 0179 section 4).
   */
  blockingIssues?: string[]
  confirmed: boolean
  supersededBy?: string
  /**
   * Position of this note in its correction chain (SPEC 0283 section 4);
   * absent in journals written before it, which read as revision 1.
   */
  revision?: number
  /** IDs completed from earlier confirmed notes, shown in the preview. */
  completedIds?: string[]
  /** Why a note without organized fields is only a raw document. */
  rawIntro?: 'policy_denied' | 'organize_failed'
}

export interface Task {
  number: number
  ownerPhone: string
  noteId?: string
  description: string
  patient?: string
  patientId?: string
  dueAt: string
  createdAt: string
  /**
   * `draft` until the author confirms the note: a draft is never listed,
   * reminded, completed or snoozed (SPEC 0179 section 3).
   */
  status: TaskStatus
  remindedCount: number
  lastRemindedAt?: string
  doneAt?: string
  /** Reminder slot whose send started and has no recorded outcome yet. */
  reminderInFlight?: number
  /**
   * A reminder send may or may not have reached the channel. No further
   * reminder of this window is sent; "adiar" opens a new window.
   */
  reminderUncertain?: boolean
  /**
   * Reminder attempts of this slot that provably never left the process
   * (`not_sent`), and when the next one may start. Five attempts in all,
   * then `reminderSendFailed` holds the window until "adiar" or "feito".
   */
  reminderNotSentAttempts?: number
  reminderRetryAt?: string
  reminderSendFailed?: boolean
}

export type TaskStatus = 'draft' | 'open' | 'done' | 'cancelled'

/**
 * Retry budget of SPEC 0179 section 6: delays after the 1st..4th failed
 * attempt; the 5th failed attempt is final. Inbox processing counts it per
 * message across stages (stricter than "per stage", so a failure that moves
 * between stages cannot retry forever); reminders refused before they left
 * the process count it per slot; the external monitor's alert queue counts
 * it per delivery.
 */
export const RETRY_DELAYS_MS: readonly number[] = [
  30_000, 120_000, 600_000, 1_800_000
]
/** Attempts in all, including the first. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1

/** Processing stages that call a dependency and can be retried. */
export type ProcessingStage = 'download' | 'transcribe' | 'organize' | 'reply'

/**
 * Receipt of one presentation of a note preview (SPEC 0283 section 3): the
 * outcome of every part the channel was asked to carry. `parts` after the
 * first failed one are `not_sent`. A note is confirmable by a bare "ok" only
 * after a receipt with every part `accepted` and `truncated` false.
 */
export interface PreviewPart {
  index: number
  bytes: number
  partSha256: string
  outcome: 'accepted' | 'not_sent' | 'uncertain'
}

export interface PreviewPresentedEvent {
  type: 'preview_presented'
  at: string
  noteId: string
  revision: number
  /** Hash of the canonical content of the revision (the token's hash). */
  contentSha256: string
  parts: PreviewPart[]
  /** The preview exceeded the part limit and was cut with a notice. */
  truncated: boolean
}

/** Append-only events: the event log is the document of record (D4). */
export type ShiftEvent =
  | { type: 'message_received'; at: string; message: InboundMessage }
  | { type: 'message_processed'; at: string; messageId: string }
  | { type: 'note_created'; at: string; note: Note }
  | {
      type: 'note_confirmed'
      at: string
      noteId: string
      /** Member who confirmed; absent in journals written before AUD-0621. */
      by?: string
      /** Draft tasks activated by this confirmation, in the same line. */
      activated?: number[]
    }
  | { type: 'note_superseded'; at: string; noteId: string; by: string }
  | PreviewPresentedEvent
  | { type: 'task_created'; at: string; task: Task }
  | { type: 'task_done'; at: string; number: number }
  | { type: 'task_cancelled'; at: string; number: number }
  | { type: 'task_snoozed'; at: string; number: number; dueAt: string }
  | { type: 'task_reminded'; at: string; number: number; slot?: number }
  | { type: 'paused'; at: string; by: string }
  | { type: 'resumed'; at: string; by: string }
  | {
      type: 'message_retry_scheduled'
      at: string
      messageId: string
      stage: ProcessingStage
      attempt: number
      nextAttemptAt: string
      code: string
    }
  | {
      type: 'message_review_required'
      at: string
      messageId: string
      reason: string
    }
  | {
      type: 'reminder_dispatch_started'
      at: string
      number: number
      slot: number
    }
  | {
      type: 'reminder_dispatch_failed'
      at: string
      number: number
      slot: number
      outcome: 'not_sent' | 'uncertain'
      code: string
      /** `not_sent` only: attempt number of this slot (absent in old journals). */
      attempt?: number
      /** `not_sent` only: earliest next attempt; absent when final. */
      nextAttemptAt?: string
      /** `not_sent` only: no automatic attempt follows (permanent or budget spent). */
      final?: boolean
    }
  | {
      type: 'recovery_recorded'
      at: string
      segment: string
      originalSha256: string
      prefixBytes: number
      tailBytes: number
      tailSha256: string
      recoveryDir: string
    }

export const SHIFT_EVENT_TYPES: ReadonlySet<ShiftEvent['type']> = new Set<
  ShiftEvent['type']
>([
  'message_received',
  'message_processed',
  'note_created',
  'note_confirmed',
  'note_superseded',
  'preview_presented',
  'task_created',
  'task_done',
  'task_cancelled',
  'task_snoozed',
  'task_reminded',
  'paused',
  'resumed',
  'message_retry_scheduled',
  'message_review_required',
  'reminder_dispatch_started',
  'reminder_dispatch_failed',
  'recovery_recorded'
])

/** Digits only; WhatsApp JIDs such as 5511999990000@c.us become 5511999990000. */
export function normalizePhone(value: string): string {
  return value.split('@')[0]!.replace(/\D/g, '')
}

/**
 * Brazilian mobile numbers may reach WhatsApp with or without the ninth digit
 * after the area code. Treat both spellings of the same number as equal.
 */
export function samePhone(left: string, right: string): boolean {
  const a = normalizePhone(left)
  const b = normalizePhone(right)
  if (a === b) return true
  return withoutBrazilianNinthDigit(a) === withoutBrazilianNinthDigit(b)
}

function withoutBrazilianNinthDigit(phone: string): string {
  if (phone.startsWith('55') && phone.length === 13 && phone[4] === '9') {
    return phone.slice(0, 4) + phone.slice(5)
  }
  return phone
}

/** `5511999990000=Dra Ana;5511988880000=Dr Bruno*` — a trailing `*` marks the manager. */
export function parseMembers(value: string): Member[] {
  const members: Member[] = []
  for (const entry of value.split(';')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const [rawPhone, rawName = ''] = trimmed.split('=')
    const phone = normalizePhone(rawPhone ?? '')
    if (phone.length < 10) {
      throw new Error(`Invalid member phone in SHIFT_MEMBERS: ${rawPhone}`)
    }
    const manager = rawName.trim().endsWith('*')
    const name = rawName.trim().replace(/\*$/, '').trim() || phone
    members.push({ phone, name, manager })
  }
  return members
}

/** Patient IDs compare without spaces, punctuation or case. */
export function normalizePatientId(value: string): string {
  return value.replace(/[^0-9a-z]/gi, '').toUpperCase()
}

/** Names compare without accents, case or surrounding spaces. */
export function normalizePatientName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export interface KnownPatient {
  id: string
  name: string
  bed?: string
  lastSeen: string
}
