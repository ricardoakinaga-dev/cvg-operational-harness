import { createHash } from 'node:crypto'
import type { Note, PreviewPresentedEvent, Task } from './domain.ts'

// SPEC 0283 sections 3-4: the token of a revision names the note, its position
// in the correction chain and a hash of its canonical content, and a note is
// confirmable by a bare "ok" only after a presentation whose every part the
// channel accepted. Pure functions; the journal and the channel stay outside.

/** Short note code shown in the draft header (first 8 hex of the note id). */
export function noteCode(note: Note): string {
  return note.id.replace(/-/g, '').slice(0, 8)
}

export function noteRevision(note: Note): number {
  return note.revision ?? 1
}

/**
 * SHA-256 of the canonical content a draft proposes: the source text, the
 * organized fields, the warnings and every proposed task. Changing any of it
 * changes the token, so a token can never confirm other content than the
 * content it was shown with.
 */
export function previewContentSha256(note: Note, tasks: Task[]): string {
  const canonical = JSON.stringify({
    v: 1,
    rawText: note.rawText,
    organized: note.organized ?? null,
    unverifiedNumbers: note.unverifiedNumbers,
    blockingIssues: note.blockingIssues ?? [],
    completedIds: note.completedIds ?? [],
    tasks: [...tasks]
      .sort((a, b) => a.number - b.number)
      .map((task) => [
        task.number,
        task.description,
        task.patient ?? null,
        task.patientId ?? null,
        task.dueAt
      ])
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/** `<note code>-r<revision>-<8 hex of the content hash>`. */
export function previewToken(note: Note, tasks: Task[]): string {
  return `${noteCode(note)}-r${noteRevision(note)}-${previewContentSha256(note, tasks).slice(0, 8)}`
}

export type PreviewIneligibility =
  | 'preview_not_delivered'
  | 'preview_partial'
  | 'preview_uncertain'
  | 'preview_truncated'

export interface PreviewState {
  /** Presentations recorded for the note (bounded by the retry budget). */
  attempts: number
  /** Some presentation reached the author in full; never undone. */
  complete: boolean
  /** Instant of the last recorded presentation. */
  lastAt?: string
  /** The last presentation, when there is one. */
  last?: PreviewPresentedEvent
}

export type PreviewEligibility =
  | { ok: true }
  | { ok: false; cause: PreviewIneligibility; echoable: boolean }

/**
 * Whether the author may confirm. `echoable` marks the one state in which the
 * full token typed back proves the preview was seen: the last part, which
 * carries the token, has an uncertain outcome and nothing was left unsent.
 */
export function previewEligibility(
  state: PreviewState | undefined
): PreviewEligibility {
  if (state?.complete) return { ok: true }
  const last = state?.last
  if (!last) {
    return { ok: false, cause: 'preview_not_delivered', echoable: false }
  }
  if (last.truncated) {
    return { ok: false, cause: 'preview_truncated', echoable: false }
  }
  const outcomes = last.parts.map((part) => part.outcome)
  const unsent = outcomes.includes('not_sent')
  const accepted = outcomes.includes('accepted')
  if (unsent) {
    return {
      ok: false,
      cause: accepted ? 'preview_partial' : 'preview_not_delivered',
      echoable: false
    }
  }
  return { ok: false, cause: 'preview_uncertain', echoable: true }
}

export function isCompletePresentation(event: PreviewPresentedEvent): boolean {
  return (
    !event.truncated &&
    event.parts.length > 0 &&
    event.parts.every((part) => part.outcome === 'accepted')
  )
}

const CAUSE_TEXT: Record<PreviewIneligibility, string> = {
  preview_not_delivered:
    'o rascunho ainda não chegou até você; vou reenviá-lo automaticamente',
  preview_partial:
    'só uma parte do rascunho chegou até você; vou reenviá-lo automaticamente',
  preview_uncertain:
    'não tenho certeza de que o rascunho chegou até você; vou reenviá-lo, ou responda com "ok nota <código completo>" se você o viu',
  preview_truncated:
    'a nota é grande demais para eu mostrar inteira; divida-a em notas menores ou mande "corrigir <texto>"'
}

export function notEligibleReply(cause: PreviewIneligibility): string {
  return `⛔ Não posso confirmar ainda: ${CAUSE_TEXT[cause]}. (CONFIRMATION_NOT_ELIGIBLE: ${cause})`
}
