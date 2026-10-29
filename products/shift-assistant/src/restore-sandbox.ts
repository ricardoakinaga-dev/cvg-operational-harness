import { randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { ShiftAssistant } from './assistant.ts'
import { previewToken } from './preview-receipt.ts'
import {
  copyVolume,
  insideOrEqual,
  resolvedPath,
  selfAndAncestors,
  sha256,
  type RestoreCheck
} from './backup.ts'
import {
  samePhone,
  type InboundMessage,
  type Member,
  type Note
} from './domain.ts'
import { ShiftStore } from './store.ts'
import { HELP_TEXT } from './commands.ts'
import { TransportError } from './transport-limits.ts'
import type { WhatsAppClient } from './whatsapp.ts'

/**
 * Transport sandbox of the restore proof (SPEC 0179 section 10): after the
 * restored volume matched under hold, a copy of it runs the real assistant
 * with the hold released and every dependency stubbed in-process. A copy
 * restored paused is resumed through the manager control lane. It proves a
 * command per member, a confirmation (of a restored draft or, when there is
 * none, of a synthetic draft made on the copy) and the next eligible
 * reminders, and that no reminder already accepted or uncertain is sent
 * again; every check must be exercised to pass. No channel, Whisper or model
 * is contacted: restored notes get `policy_denied` (NO_MODEL) and only the
 * sandbox's own synthetic note is organized, in process. The sandbox never
 * runs in the restored volume, the source volume or any path inside or above
 * them (real paths, symlinks resolved), so neither is ever written. Drafts
 * are chosen by identity: the restored draft with the smallest note id, and
 * the synthetic note by the message id the sandbox sent.
 */

export interface SandboxOptions {
  restoredDir: string
  /** New, empty directory for the sandbox copy. */
  sandboxDir: string
  /** Synthetic team configuration, separate from the backup. */
  members: Member[]
  /** Sandbox time (default: now). */
  at?: Date
  /** The backup's `sourceRealpathSha256`: the sandbox refuses to run inside it. */
  sourceRealpathSha256?: string
}

type SendKind = 'help' | 'confirm' | 'reminder' | 'other'

export interface SandboxReport {
  schemaVersion: 1
  kind: 'shift-assistant-restore-sandbox'
  verdict: 'PASS' | 'FAIL'
  checks: RestoreCheck[]
  /** True when the restored volume was paused and the copy was resumed. */
  resumedInSandbox: boolean
  /** Whether the confirmed draft came from the backup or was made here. */
  draftSource: 'restored' | 'generated_in_sandbox'
  /** `synthetic_due_draft` when nothing restored was due for the tick. */
  reminderSource: 'volume' | 'synthetic_due_draft'
  helpReplies: number
  confirmedTasks: number[]
  remindedTasks: number[]
  uncertainTasks: number[]
  resentAfterSecondTick: number
  /** Note confirmed for the confirmation check (a UUID, content-free). */
  confirmedNoteId?: string
  /** Note the sandbox created itself, when it had to. */
  syntheticNoteId?: string
  /** Content-free: destination class and kind only. */
  sends: Array<{ to: 'member' | 'outside'; kind: SendKind }>
}

const REMINDER = /^⏰ Lembrete #(\d+):/
const PLACE = 'sandbox outside the source and restored volumes'

/**
 * Oracle of one reminder round: exactly the independently computed eligible
 * set, once each, none held (uncertain or failed), nothing resent by a second
 * tick. A round with nothing eligible and nothing sent proves nothing and
 * fails.
 */
export function evaluateReminderRound(round: {
  expected: readonly number[]
  reminded: readonly number[]
  resent: number
  held: readonly number[]
}): RestoreCheck[] {
  const expected = new Set(round.expected)
  const { reminded } = round
  return [
    {
      name: 'reminders only for the eligible tasks, once each',
      pass:
        reminded.length > 0 &&
        reminded.length === expected.size &&
        new Set(reminded).size === reminded.length &&
        reminded.every((number) => expected.has(number)),
      detail: `${reminded.length} sent, ${expected.size} eligible`
    },
    {
      name: 'no reminder for uncertain or failed sends',
      pass: reminded.every((number) => !round.held.includes(number)),
      detail: `${round.held.length} held`
    },
    {
      name: 'no resend on a second tick',
      pass: reminded.length > 0 && round.resent === 0,
      detail: `${round.resent} resent`
    }
  ]
}

/** Why `sandboxDir` may not be used, or undefined when it is separate. */
function placementProblem(options: SandboxOptions): string | undefined {
  const sandbox = resolvedPath(options.sandboxDir)
  if (existsSync(options.restoredDir)) {
    const restored = realpathSync(options.restoredDir)
    if (insideOrEqual(sandbox, restored) || insideOrEqual(restored, sandbox)) {
      return 'restored volume, inside it or above it'
    }
  }
  // The source path is known only by its hash: the sandbox and each of its
  // ancestors are compared with it. A sandbox above the source cannot be
  // empty, and copyVolume only accepts a new or empty directory.
  if (
    options.sourceRealpathSha256 !== undefined &&
    selfAndAncestors(sandbox).some(
      (path) => sha256(path) === options.sourceRealpathSha256
    )
  ) {
    return 'source volume or inside it'
  }
  return undefined
}
const SANDBOX_NOTE = 'nota sintética da sandbox de restore'
const SANDBOX_PATIENT = 'Paciente sintético da sandbox'

export async function sandboxCheck(
  options: SandboxOptions
): Promise<SandboxReport> {
  const checks: RestoreCheck[] = []
  const check = (name: string, pass: boolean, detail?: string) => {
    checks.push({ name, pass, ...(detail ? { detail } : {}) })
    return pass
  }
  const report = (extra: Partial<SandboxReport> = {}): SandboxReport => ({
    schemaVersion: 1,
    kind: 'shift-assistant-restore-sandbox',
    resumedInSandbox: false,
    draftSource: 'restored',
    reminderSource: 'volume',
    helpReplies: 0,
    confirmedTasks: [],
    remindedTasks: [],
    uncertainTasks: [],
    resentAfterSecondTick: 0,
    sends: [],
    ...extra,
    verdict:
      checks.length > 0 && checks.every((entry) => entry.pass)
        ? 'PASS'
        : 'FAIL',
    checks
  })

  const problem = placementProblem(options)
  if (!check(PLACE, problem === undefined, problem)) return report()
  const copy = await copyVolume(options.restoredDir, options.sandboxDir)
  if (!check('sandbox copy verified', copy.ok, copy.detail)) return report()
  if (
    !check(
      'synthetic team configured',
      options.members.length > 0,
      `${options.members.length} member(s)`
    )
  ) {
    return report()
  }

  const at = options.at ?? new Date()
  let now = at
  const sent: Array<{ phone: string; text: string }> = []
  const channel: WhatsAppClient = {
    provider: 'waha',
    parseWebhook: () => undefined,
    async sendText(phone, text) {
      sent.push({ phone, text })
    },
    async downloadMedia() {
      throw new TransportError('MEDIA_INVALID', false)
    }
  }
  const store = new ShiftStore(options.sandboxDir)
  const assistant = new ShiftAssistant({
    store,
    members: options.members,
    whatsapp: channel,
    transcriber: {
      async transcribe() {
        throw new TransportError('TRANSPORT_NETWORK', false)
      }
    },
    organizer: {
      // Only the sandbox's own synthetic note is organized, in process and
      // without any model; restored notes get policy_denied (NO_MODEL).
      async organize(text) {
        if (text !== SANDBOX_NOTE) {
          throw Object.assign(new Error('policy_denied'), {
            code: 'policy_denied'
          })
        }
        return {
          pacientes: [
            { nome: SANDBOX_PATIENT, exames_pedidos: [], condutas: [] }
          ],
          pendencias: [
            {
              descricao: 'Pendência sintética da sandbox de restore',
              paciente: SANDBOX_PATIENT,
              quando: new Date(now.getTime() + 60_000).toISOString()
            }
          ],
          duvidas: []
        }
      }
    },
    clock: () => now
  })
  const isMember = (phone: string) =>
    options.members.some((member) => samePhone(member.phone, phone))
  let sequence = 0
  const run = randomUUID()
  /** Delivers `text` from `member`; returns the message id it used. */
  const say = async (member: Member, text: string) => {
    sequence += 1
    const messageId = `restore-sandbox-${run}-${sequence}`
    const message: InboundMessage = {
      provider: 'waha',
      messageId,
      fromPhone: member.phone,
      kind: 'text',
      text,
      receivedAt: now.toISOString()
    }
    assistant.receive(message)
    await assistant.idle()
    return messageId
  }

  // A volume backed up after "pausar assistente" restores paused: release
  // it on the copy through the manager control lane, as the runbook does.
  let resumedInSandbox = false
  if (store.paused) {
    const manager = options.members.find((member) => member.manager)
    if (manager) {
      await say(manager, 'retomar assistente')
      resumedInSandbox = !store.paused
    }
    if (
      !check(
        'operation resumed on the sandbox copy',
        resumedInSandbox,
        manager ? 'manager resume' : 'no manager in the synthetic team'
      )
    ) {
      return report({ resumedInSandbox })
    }
  }

  // A command per member: exactly one help reply each.
  let helpReplies = 0
  for (const member of options.members) {
    const before = sent.length
    await say(member, 'ajuda')
    const replies = sent
      .slice(before)
      .filter((entry) => samePhone(entry.phone, member.phone))
    if (replies.length === 1 && replies[0]!.text === HELP_TEXT) helpReplies += 1
  }
  check(
    'command answered once per member',
    helpReplies === options.members.length,
    `${helpReplies}/${options.members.length}`
  )

  // Confirmation of a draft by its author activates exactly its tasks. A
  // restored draft is preferred; without one, the sandbox creates its own
  // synthetic draft on the copy so the confirmation is always exercised.
  const confirmable = (note: Note) =>
    !note.confirmed &&
    !note.supersededBy &&
    (note.blockingIssues?.length ?? 0) === 0 &&
    isMember(note.authorPhone) &&
    store.tasksOfNote(note.id).some((task) => task.status === 'draft')
  /** The restored draft with the smallest note id: identity, not order. */
  const findDraft = () =>
    store
      .projection()
      .notes.map((entry) => store.note(entry.id)!)
      .filter(confirmable)
      .sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0
      )[0]
  const syntheticAuthor =
    options.members.find((member) => !member.manager) ?? options.members[0]!
  /** Confirms `note` by its author; returns the tasks it activated. */
  const confirm = async (note: Note) => {
    const author = options.members.find((member) =>
      samePhone(member.phone, note.authorPhone)
    )!
    const drafts = store
      .tasksOfNote(note.id)
      .filter((task) => task.status === 'draft')
      .map((task) => task.number)
    const before = sent.length
    await say(
      author,
      `ok nota ${previewToken(note, store.tasksOfNote(note.id))}`
    )
    const activated = drafts.filter(
      (number) => store.task(number)?.status === 'open'
    )
    const ok =
      store.note(note.id)?.confirmed === true &&
      drafts.length > 0 &&
      activated.length === drafts.length &&
      sent.slice(before).length === 1
    return { ok, activated, drafts: drafts.length }
  }
  /**
   * A synthetic draft due one minute from the sandbox clock: the note made
   * from the message the sandbox just sent, found by that message id.
   */
  let syntheticNoteId: string | undefined
  const syntheticDraft = async (): Promise<Note | undefined> => {
    const messageId = await say(syntheticAuthor, SANDBOX_NOTE)
    const made = store
      .projection()
      .notes.map((entry) => store.note(entry.id)!)
      .find((note) => note.messageId === messageId)
    const ok = made !== undefined && confirmable(made)
    check(
      'synthetic draft created',
      ok,
      ok ? undefined : 'the sandbox note did not become a draft'
    )
    if (ok) syntheticNoteId = made.id
    return ok ? made : undefined
  }

  let draft = findDraft()
  let draftSource: SandboxReport['draftSource'] = 'restored'
  if (!draft) {
    draftSource = 'generated_in_sandbox'
    draft = await syntheticDraft()
  }
  const confirmedTasks: number[] = []
  const confirmedNoteId = draft?.id
  if (draft) {
    const result = await confirm(draft)
    confirmedTasks.push(...result.activated)
    check(
      'confirmation activates the draft tasks',
      result.ok,
      `${draftSource}: ${result.activated.length}/${result.drafts}`
    )
  } else {
    check(
      'confirmation activates the draft tasks',
      false,
      'no draft to confirm'
    )
  }

  // Expected reminders, computed independently from the store before the
  // tick, two minutes after the sandbox time. When nothing restored is due
  // then (a restored draft due later, every task reminded recently), a
  // synthetic draft due in a minute is confirmed so the reminder path is
  // always exercised.
  const uncertainTasks: number[] = []
  const expectedAt = (tickAt: number) => {
    uncertainTasks.length = 0
    const expected = new Set<number>()
    for (const task of store.openTasks()) {
      if (task.reminderUncertain || task.reminderSendFailed) {
        uncertainTasks.push(task.number)
        continue
      }
      const note =
        task.noteId === undefined ? undefined : store.note(task.noteId)
      if (
        task.noteId !== undefined &&
        (!note?.confirmed || note.supersededBy)
      ) {
        continue
      }
      if (
        Date.parse(task.dueAt) <= tickAt &&
        task.reminderInFlight === undefined &&
        task.remindedCount < 4 &&
        (!task.lastRemindedAt ||
          tickAt - Date.parse(task.lastRemindedAt) >= 30 * 60_000) &&
        (!task.reminderRetryAt || Date.parse(task.reminderRetryAt) <= tickAt) &&
        isMember(task.ownerPhone)
      ) {
        expected.add(task.number)
      }
    }
    return expected
  }
  now = new Date(now.getTime() + 2 * 60_000)
  let expected = expectedAt(now.getTime())
  let reminderSource: SandboxReport['reminderSource'] = 'volume'
  if (expected.size === 0) {
    reminderSource = 'synthetic_due_draft'
    const extra = await syntheticDraft()
    if (extra) {
      const result = await confirm(extra)
      confirmedTasks.push(...result.activated)
      check(
        'synthetic draft confirmed for the reminder round',
        result.ok,
        `${result.activated.length}/${result.drafts}`
      )
    }
    now = new Date(now.getTime() + 2 * 60_000)
    expected = expectedAt(now.getTime())
  }

  const firstTick = sent.length
  await assistant.tick()
  await assistant.idle()
  const reminded = sent
    .slice(firstTick)
    .map((entry) => REMINDER.exec(entry.text)?.[1])
    .filter((number): number is string => number !== undefined)
    .map(Number)
  const secondTick = sent.length
  await assistant.tick()
  await assistant.idle()
  const resent = sent
    .slice(secondTick)
    .filter((entry) => REMINDER.test(entry.text)).length
  checks.push(
    ...evaluateReminderRound({
      expected: [...expected],
      reminded,
      resent,
      held: uncertainTasks
    })
  )
  check(
    'no send outside the team',
    sent.every((entry) => isMember(entry.phone))
  )
  assistant.beginStop()

  return report({
    resumedInSandbox,
    draftSource,
    reminderSource,
    helpReplies,
    confirmedTasks,
    remindedTasks: reminded,
    uncertainTasks,
    resentAfterSecondTick: resent,
    ...(confirmedNoteId ? { confirmedNoteId } : {}),
    ...(syntheticNoteId ? { syntheticNoteId } : {}),
    sends: sent.map((entry) => ({
      to: isMember(entry.phone) ? 'member' : 'outside',
      kind: REMINDER.test(entry.text)
        ? 'reminder'
        : entry.text === HELP_TEXT
          ? 'help'
          : /confirmad|ativad/i.test(entry.text)
            ? 'confirm'
            : 'other'
    }))
  })
}
