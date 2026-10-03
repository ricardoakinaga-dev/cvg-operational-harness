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
  confirmed: boolean
  supersededBy?: string
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
  status: 'open' | 'done' | 'cancelled'
  remindedCount: number
  lastRemindedAt?: string
  doneAt?: string
}

/** Append-only events: the event log is the document of record (D4). */
export type ShiftEvent =
  | { type: 'message_received'; at: string; message: InboundMessage }
  | { type: 'message_processed'; at: string; messageId: string }
  | { type: 'note_created'; at: string; note: Note }
  | { type: 'note_confirmed'; at: string; noteId: string }
  | { type: 'note_superseded'; at: string; noteId: string; by: string }
  | { type: 'task_created'; at: string; task: Task }
  | { type: 'task_done'; at: string; number: number }
  | { type: 'task_cancelled'; at: string; number: number }
  | { type: 'task_snoozed'; at: string; number: number; dueAt: string }
  | { type: 'task_reminded'; at: string; number: number }
  | { type: 'paused'; at: string; by: string }
  | { type: 'resumed'; at: string; by: string }

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
