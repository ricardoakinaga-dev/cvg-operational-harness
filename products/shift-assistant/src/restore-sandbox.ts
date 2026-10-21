import { ShiftAssistant, noteCode } from './assistant.ts'
import { copyVolume, type RestoreCheck } from './backup.ts'
import { samePhone, type InboundMessage, type Member } from './domain.ts'
import { ShiftStore } from './store.ts'
import { HELP_TEXT } from './commands.ts'
import { TransportError } from './transport-limits.ts'
import type { WhatsAppClient } from './whatsapp.ts'

/**
 * Transport sandbox of the restore proof (SPEC 0179 section 10): after the
 * restored volume matched under hold, a copy of it runs the real assistant
 * with the hold released and every dependency stubbed in-process. It proves
 * a command, a confirmation and the next eligible reminders, and that no
 * reminder already accepted or uncertain is sent again. No channel, Whisper
 * or model is contacted; the organizer answers `policy_denied` (NO_MODEL).
 * The restored volume itself is never written.
 */

export interface SandboxOptions {
  restoredDir: string
  /** New, empty directory for the sandbox copy. */
  sandboxDir: string
  /** Synthetic team configuration, separate from the backup. */
  members: Member[]
  /** Sandbox time (default: now). */
  at?: Date
}

type SendKind = 'help' | 'confirm' | 'reminder' | 'other'

export interface SandboxReport {
  schemaVersion: 1
  kind: 'shift-assistant-restore-sandbox'
  verdict: 'PASS' | 'FAIL'
  checks: RestoreCheck[]
  helpReplies: number
  confirmedTasks: number[]
  remindedTasks: number[]
  uncertainTasks: number[]
  resentAfterSecondTick: number
  /** Content-free: destination class and kind only. */
  sends: Array<{ to: 'member' | 'outside'; kind: SendKind }>
}

const REMINDER = /^⏰ Lembrete #(\d+):/

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

  const copy = await copyVolume(options.restoredDir, options.sandboxDir)
  if (!check('sandbox copy verified', copy.ok, copy.detail)) return report()

  const now = options.at ?? new Date()
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
      async organize() {
        throw Object.assign(new Error('policy_denied'), {
          code: 'policy_denied'
        })
      }
    },
    clock: () => now
  })
  const isMember = (phone: string) =>
    options.members.some((member) => samePhone(member.phone, phone))
  let sequence = 0
  const say = async (member: Member, text: string) => {
    sequence += 1
    const message: InboundMessage = {
      provider: 'waha',
      messageId: `restore-sandbox-${sequence}`,
      fromPhone: member.phone,
      kind: 'text',
      text,
      receivedAt: now.toISOString()
    }
    const accepted = assistant.receive(message)
    await assistant.idle()
    return accepted
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

  // Confirmation of a draft by its author activates exactly its tasks.
  const draft = store
    .projection()
    .notes.filter((note) => !note.confirmed && !note.supersededBy)
    .map((entry) => store.note(entry.id)!)
    .find(
      (note) =>
        (note.blockingIssues?.length ?? 0) === 0 &&
        options.members.some((member) =>
          samePhone(member.phone, note.authorPhone)
        ) &&
        store.tasksOfNote(note.id).some((task) => task.status === 'draft')
    )
  let confirmedTasks: number[] = []
  if (draft) {
    const author = options.members.find((member) =>
      samePhone(member.phone, draft.authorPhone)
    )!
    const drafts = store
      .tasksOfNote(draft.id)
      .filter((task) => task.status === 'draft')
      .map((task) => task.number)
    const before = sent.length
    await say(author, `ok nota ${noteCode(draft)}`)
    confirmedTasks = drafts.filter(
      (number) => store.task(number)?.status === 'open'
    )
    check(
      'confirmation activates the draft tasks',
      store.note(draft.id)?.confirmed === true &&
        confirmedTasks.length === drafts.length &&
        sent.slice(before).length === 1,
      `${confirmedTasks.length}/${drafts.length}`
    )
  } else {
    check(
      'confirmation activates the draft tasks',
      true,
      'no draft in the volume'
    )
  }

  // Expected reminders, computed independently from the projection.
  const at = now.getTime()
  const uncertainTasks: number[] = []
  const expected = new Set<number>()
  for (const task of store.openTasks()) {
    if (task.reminderUncertain || task.reminderSendFailed) {
      uncertainTasks.push(task.number)
      continue
    }
    const note = task.noteId === undefined ? undefined : store.note(task.noteId)
    if (task.noteId !== undefined && (!note?.confirmed || note.supersededBy)) {
      continue
    }
    if (
      Date.parse(task.dueAt) <= at &&
      task.reminderInFlight === undefined &&
      task.remindedCount < 4 &&
      (!task.lastRemindedAt ||
        at - Date.parse(task.lastRemindedAt) >= 30 * 60_000) &&
      (!task.reminderRetryAt || Date.parse(task.reminderRetryAt) <= at) &&
      isMember(task.ownerPhone)
    ) {
      expected.add(task.number)
    }
  }

  const firstTick = sent.length
  await assistant.tick()
  await assistant.idle()
  const reminded = sent
    .slice(firstTick)
    .map((entry) => REMINDER.exec(entry.text)?.[1])
    .filter((number): number is string => number !== undefined)
    .map(Number)
  check(
    'reminders only for the eligible tasks, once each',
    reminded.length === expected.size &&
      reminded.every((number) => expected.has(number)),
    `${reminded.length} sent, ${expected.size} eligible`
  )
  check(
    'no reminder for uncertain or failed sends',
    reminded.every((number) => !uncertainTasks.includes(number)),
    `${uncertainTasks.length} held`
  )
  const secondTick = sent.length
  await assistant.tick()
  await assistant.idle()
  const resent = sent
    .slice(secondTick)
    .filter((entry) => REMINDER.test(entry.text)).length
  check('no resend on a second tick', resent === 0)
  check(
    'no send outside the team',
    sent.every((entry) => isMember(entry.phone))
  )
  assistant.beginStop()

  return report({
    helpReplies,
    confirmedTasks,
    remindedTasks: reminded,
    uncertainTasks,
    resentAfterSecondTick: resent,
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
