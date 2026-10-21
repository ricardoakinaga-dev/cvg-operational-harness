// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseMembers } from '../domain.ts'
import { ShiftStore } from '../store.ts'
import {
  ANA,
  BRUNO,
  GESTOR,
  setup,
  tempDir,
  wahaPayload,
  type SentText
} from './support/harness.ts'

// AUD-0621 F10 (PISO-005/006) and F11 (PISO-005/006): reminders go only to
// current members, one reservation per task window, and a pause recognised
// mid-tick stops the next effect. SPEC 0179 sections 2.2 and 7.

const DUE = new Date('2026-09-30T19:05:00.000Z') // after the 16:00 due time

async function confirmedStore(dataDir?: string, tasks = 1) {
  const env = setup(dataDir ? { dataDir } : {})
  for (let index = 1; index <= tasks; index += 1) {
    await env.deliver(wahaPayload(`m${index}`, ANA, `Thor leito 3 #${index}`))
    await env.deliver(wahaPayload(`ok${index}`, ANA, 'ok'))
  }
  expect(env.store.openTasks(ANA)).toHaveLength(tasks)
  return env.store
}

function reminders(sent: SentText[]): SentText[] {
  return sent.filter((entry) => entry.text.includes('⏰ Lembrete'))
}

describe('F10: a revoked member receives nothing', () => {
  it('does not remind a member removed from the team', async () => {
    const store = await confirmedStore()
    const env = setup({
      store,
      start: DUE,
      members: parseMembers(`${BRUNO}=Dr Bruno;${GESTOR}=Gestor*`)
    })
    expect(await env.assistant.tick()).toBe(0)
    expect(env.waha.sent).toHaveLength(0)
    // Re-adding the member later restores the reminder.
    const back = setup({ store, start: DUE })
    expect(await back.assistant.tick()).toBe(1)
    expect(reminders(back.waha.sent).map((entry) => entry.to)).toEqual([ANA])
  })

  it('does not process or answer a stored message of a revoked member', async () => {
    // Stored before a restart that removed the sender from the team.
    const store = new ShiftStore()
    store.append({
      type: 'message_received',
      at: DUE.toISOString(),
      message: {
        provider: 'waha',
        messageId: 'm1',
        fromPhone: ANA,
        kind: 'text',
        text: 'Thor leito 3',
        receivedAt: DUE.toISOString()
      }
    })
    const revoked = setup({
      store,
      members: parseMembers(`${BRUNO}=Dr Bruno;${GESTOR}=Gestor*`)
    })
    revoked.assistant.resumePending()
    await revoked.assistant.idle()
    expect(revoked.waha.sent).toHaveLength(0)
    expect(revoked.organizerCalls).toHaveLength(0)
    expect(store.unprocessedMessages()).toHaveLength(0)
    expect(store.reviewRequiredMessages().map((m) => m.messageId)).toEqual([
      'm1'
    ])
  })
})

describe('F11: one reminder per window, and pause stops the next effect', () => {
  it('sends once when two ticks overlap on a slow channel', async () => {
    const store = await confirmedStore()
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const env = setup({
      store,
      start: DUE,
      onSend: async () => {
        await blocked
      }
    })
    const first = env.assistant.tick()
    await Promise.resolve()
    const second = env.assistant.tick()
    await new Promise((resolve) => setTimeout(resolve, 20))
    release()
    const results = await Promise.all([first, second])
    expect(reminders(env.waha.sent)).toHaveLength(1)
    expect(results.reduce((total, value) => total + value, 0)).toBe(1)
    expect(store.task(1)?.remindedCount).toBe(1)
    // Even a later tick inside the interval does not send again.
    expect(await env.assistant.tick()).toBe(0)
  })

  it('sends once even when two schedulers share the journal', async () => {
    const store = await confirmedStore()
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const onSend = async () => {
      await blocked
    }
    // No shared tick lock: only the durable reservation can stop the second.
    const first = setup({ store, start: DUE, onSend })
    const second = setup({ store, start: DUE, onSend })
    const ticks = [first.assistant.tick(), second.assistant.tick()]
    await new Promise((resolve) => setTimeout(resolve, 20))
    release()
    await Promise.all(ticks)
    expect(reminders([...first.waha.sent, ...second.waha.sent])).toHaveLength(1)
    expect(store.task(1)?.remindedCount).toBe(1)
  })

  it('stops the second reminder once a pause is recorded during the first', async () => {
    const store = await confirmedStore(undefined, 2)
    const env = setup({
      store,
      start: DUE,
      onSend: () => {
        if (!store.paused) {
          store.append({ type: 'paused', at: DUE.toISOString(), by: GESTOR })
        }
      }
    })
    await env.assistant.tick()
    expect(store.paused).toBe(true)
    expect(reminders(env.waha.sent)).toHaveLength(1)
  })

  it('never resends a reminder whose send was in flight at a crash', async () => {
    const dataDir = tempDir('crash')
    const store = await confirmedStore(dataDir)
    const env = setup({
      store,
      start: DUE,
      onSend: () => new Promise<void>(() => undefined) // process dies here
    })
    void env.assistant.tick()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(reminders(env.waha.sent)).toHaveLength(1)
    // A new process replays the journal while the old send never finished.
    const restarted = setup({
      dataDir,
      start: new Date(DUE.getTime() + 60 * 60_000)
    })
    expect(await restarted.assistant.tick()).toBe(0)
    expect(restarted.waha.sent).toHaveLength(0)
    expect(restarted.store.task(1)?.reminderUncertain).toBe(true)
  })

  it('records the reservation before sending, so a crash never resends blindly', async () => {
    const dataDir = tempDir('reservation')
    const store = await confirmedStore(dataDir)
    const env = setup({
      store,
      start: DUE,
      onSend: () => new Response('upstream', { status: 502 })
    })
    expect(await env.assistant.tick()).toBe(0)
    expect(reminders(env.waha.sent)).toHaveLength(1)
    // The channel may have accepted the 502'd send: never resend blindly.
    const reopened = setup({
      dataDir,
      start: new Date(DUE.getTime() + 60 * 60_000)
    })
    expect(await reopened.assistant.tick()).toBe(0)
    expect(reopened.waha.sent).toHaveLength(0)
    expect(reopened.store.task(1)?.reminderUncertain).toBe(true)
    // Snoozing opens a new window that can remind again.
    await reopened.deliver(wahaPayload('s1', ANA, 'adiar 1 30'))
    reopened.advance(31)
    expect(await reopened.assistant.tick()).toBe(1)
  })
})
