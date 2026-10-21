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
 * with the hold released and every dependency stubbed in-process. A copy
 * restored paused is resumed through the manager control lane. It proves a
 * command per member, a confirmation (of a restored draft or, when there is
 * none, of a synthetic draft made on the copy) and the next eligible
 * reminders, and that no reminder already accepted or uncertain is sent
 * again; every check must be exercised to pass. No channel, Whisper or model
 * is contacted: restored notes get `policy_denied` (NO_MODEL) and only the
 * sandbox's own synthetic note is organized, in process. The restored volume
 * itself is never written.
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
  /** True when the restored volume was paused and the copy was resumed. */
  resumedInSandbox: boolean
  /** Whether the confirmed draft came from the backup or was made here. */
  draftSource: 'restored' | 'generated_in_sandbox'
  helpReplies: number
  confirmedTasks: number[]
  remindedTasks: number[]
  uncertainTasks: number[]
  resentAfterSecondTick: number
  /** Content-free: destination class and kind only. */
  sends: Array<{ to: 'member' | 'outside'; kind: SendKind }>
}

const REMINDER = /^⏰ Lembrete #(\d+):/
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
              quando: new Date(at.getTime() + 60_000).toISOString()
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
  const findDraft = () =>
    store
      .projection()
      .notes.filter((note) => !note.confirmed && !note.supersededBy)
      .map((entry) => store.note(entry.id)!)
      .find(
        (note) =>
          (note.blockingIssues?.length ?? 0) === 0 &&
          isMember(note.authorPhone) &&
          store.tasksOfNote(note.id).some((task) => task.status === 'draft')
      )
  let draft = findDraft()
  let draftSource: SandboxReport['draftSource'] = 'restored'
  if (!draft) {
    draftSource = 'generated_in_sandbox'
    const author =
      options.members.find((member) => !member.manager) ?? options.members[0]!
    await say(author, SANDBOX_NOTE)
    draft = findDraft()
  }
  let confirmedTasks: number[] = []
  if (draft) {
    const target = draft
    const author = options.members.find((member) =>
      samePhone(member.phone, target.authorPhone)
    )!
    const drafts = store
      .tasksOfNote(target.id)
      .filter((task) => task.status === 'draft')
      .map((task) => task.number)
    const before = sent.length
    await say(author, `ok nota ${noteCode(target)}`)
    confirmedTasks = drafts.filter(
      (number) => store.task(number)?.status === 'open'
    )
    check(
      'confirmation activates the draft tasks',
      store.note(target.id)?.confirmed === true &&
        drafts.length > 0 &&
        confirmedTasks.length === drafts.length &&
        sent.slice(before).length === 1,
      `${draftSource}: ${confirmedTasks.length}/${drafts.length}`
    )
  } else {
    check(
      'confirmation activates the draft tasks',
      false,
      'no draft to confirm'
    )
  }

  // Two minutes later every confirmed task above is due. Expected reminders
  // are computed independently from the store before the tick.
  now = new Date(at.getTime() + 2 * 60_000)
  const tickAt = now.getTime()
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
    reminded.length > 0 &&
      reminded.length === expected.size &&
      new Set(reminded).size === reminded.length &&
      reminded.every((number) => expected.has(number)) &&
      confirmedTasks.every((number) => reminded.includes(number)),
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
  check(
    'no resend on a second tick',
    reminded.length > 0 && resent === 0,
    `${resent} resent`
  )
  check(
    'no send outside the team',
    sent.every((entry) => isMember(entry.phone))
  )
  assistant.beginStop()

  return report({
    resumedInSandbox,
    draftSource,
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
