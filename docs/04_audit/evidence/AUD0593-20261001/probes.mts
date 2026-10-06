import { mkdtempSync, appendFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ShiftAssistant } from './snapshot/apps/worker/src/shift-assistant/assistant.ts'
import { ShiftStore } from './snapshot/apps/worker/src/shift-assistant/store.ts'
import { buildShiftServer } from './snapshot/apps/worker/src/shift-assistant/server.ts'
import { unverifiedNumbers } from './snapshot/apps/worker/src/shift-assistant/organizer.ts'
import type { InboundMessage, Organized } from './snapshot/apps/worker/src/shift-assistant/domain.ts'
import type { WhatsAppClient } from './snapshot/apps/worker/src/shift-assistant/whatsapp.ts'

const base = '/tmp/cvg-aud0593-20261001'
const phone = '5511900000001'
const manager = '5511900000009'
const now = '2026-10-01T17:00:00.000Z'
const results: Record<string, unknown>[] = []
const organized: Organized = {
  pacientes: [{ nome: 'Paciente Sintético', id: '10001', leito: '3', evolucao: 'Observação sintética', exames_pedidos: [], condutas: [] }],
  pendencias: [{ descricao: 'Rever anotação sintética', paciente: 'Paciente Sintético', quando: '2026-10-01T17:01:00.000Z' }],
  duvidas: []
}
function inbound(id: string, text = 'Paciente Sintético ID 10001 leito 3. Vou rever anotação às 14:01.', from = phone): InboundMessage {
  return { provider: 'waha', messageId: id, fromPhone: from, kind: 'text', text, receivedAt: now }
}
function setup(options: { transcribeFails?: boolean; send?: (to: string, text: string) => Promise<void>; output?: Organized } = {}) {
  const dir = mkdtempSync(join(base, 'tmp/probe-'))
  const store = new ShiftStore(dir)
  const sent: { to: string; text: string }[] = []
  let clock = new Date(now)
  const whatsapp: WhatsAppClient = {
    provider: 'waha', parseWebhook: () => undefined,
    async sendText(to, text) {
      if (options.send) await options.send(to, text)
      sent.push({ to, text })
    },
    async downloadMedia() { return { bytes: new Uint8Array([1, 2, 3]), mimetype: 'audio/ogg' } }
  }
  const assistant = new ShiftAssistant({
    store, members: [{ phone, name: 'Pessoa Sintética', manager: false }, { phone: manager, name: 'Gestor Sintético', manager: true }],
    whatsapp,
    transcriber: { async transcribe() { if (options.transcribeFails) throw new Error('synthetic transcription outage'); return 'Texto sintético' } },
    organizer: { async organize() { return structuredClone(options.output ?? organized) } },
    clock: () => clock
  })
  return { dir, store, assistant, whatsapp, sent, advance() { clock = new Date('2026-10-01T17:03:00.000Z') } }
}

// Invariant: a human confirmation precedes reminders generated from an AI draft.
{
  const h = setup()
  h.assistant.receive(inbound('confirmation'))
  await h.assistant.idle()
  const confirmed = h.store.lastActiveNote(phone)?.confirmed
  h.advance()
  const reminders = await h.assistant.tick()
  results.push({ id: 'P01', invariant: 'No reminders before human confirmation', outcome: confirmed === false && reminders > 0 ? 'VIOLATED' : 'NOT_REPRODUCED', confirmed, openTasks: h.store.openTasks().length, reminders })
}

// Invariant: transient transcription failure remains eligible for recovery.
{
  const h = setup({ transcribeFails: true })
  const message = { ...inbound('audio-failure', ''), kind: 'audio' as const, mediaRef: 'synthetic-media' }
  h.assistant.receive(message)
  await h.assistant.idle()
  const reopened = new ShiftStore(h.dir)
  results.push({ id: 'P02', invariant: 'Failed audio can be retried after restart', outcome: reopened.unprocessedMessages().length === 0 && !reopened.lastActiveNote(phone) ? 'VIOLATED' : 'NOT_REPRODUCED', pendingAfterRestart: reopened.unprocessedMessages().length, hasNote: Boolean(reopened.lastActiveNote(phone)), duplicateAccepted: h.assistant.receive(message), mediaFiles: readdirSync(join(h.dir, 'media')).length })
}

// Invariant: delivery failure retains a pending delivery/recoverable message.
{
  const h = setup({ send: async () => { throw new Error('synthetic WhatsApp outage') } })
  h.assistant.receive(inbound('delivery-failure'))
  await h.assistant.idle()
  const reopened = new ShiftStore(h.dir)
  results.push({ id: 'P03', invariant: 'Undelivered note is retried on restart', outcome: reopened.unprocessedMessages().length === 0 && h.sent.length === 0 ? 'VIOLATED' : 'NOT_REPRODUCED', successfulSends: h.sent.length, pendingAfterRestart: reopened.unprocessedMessages().length, notePersisted: Boolean(reopened.lastActiveNote(phone)), tasksPersisted: reopened.openTasks().length })
}

// Simulate a process stopping mid-append, without changing any product file.
{
  const h = setup()
  h.assistant.receive(inbound('torn-log'))
  await h.assistant.idle()
  appendFileSync(join(h.dir, 'events.jsonl'), '{"type":"task_reminded"')
  let errorName: string | null = null
  try { new ShiftStore(h.dir) } catch (error) { errorName = error instanceof Error ? error.name : 'unknown' }
  results.push({ id: 'P04', invariant: 'Recover valid records when the last append is incomplete', outcome: errorName ? 'VIOLATED' : 'NOT_REPRODUCED', restartError: errorName, simulation: 'Incomplete final JSONL line, not an actual power-loss test' })
}

// A slow transport allows two timer callbacks to observe the same pending reminder.
{
  let release: (() => void) | undefined
  const pending = new Promise<void>((resolve) => { release = resolve })
  let attempts = 0
  const h = setup({ send: async (_to, text) => { if (text.startsWith('⏰')) { attempts++; await pending } } })
  h.assistant.receive(inbound('concurrent-reminder'))
  await h.assistant.idle()
  h.advance()
  const first = h.assistant.tick()
  const second = h.assistant.tick()
  release!()
  await Promise.all([first, second])
  results.push({ id: 'P05', invariant: 'Concurrent timer ticks do not duplicate a reminder', outcome: attempts === 2 ? 'VIOLATED' : 'NOT_REPRODUCED', attempts, recordedReminderCount: h.store.task(1)?.remindedCount })
}

// A queued pause cannot interrupt a pending WhatsApp send; health still returns 200.
{
  let release: (() => void) | undefined
  let started: (() => void) | undefined
  const pending = new Promise<void>((resolve) => { release = resolve })
  const sending = new Promise<void>((resolve) => { started = resolve })
  let calls = 0
  const h = setup({ send: async () => { if (++calls === 1) { started!(); await pending } } })
  h.assistant.receive(inbound('blocking-help', 'ajuda'))
  await sending
  h.assistant.receive(inbound('queued-pause', 'pausar assistente', manager))
  const server = buildShiftServer({ assistant: h.assistant, store: h.store, whatsapp: h.whatsapp, webhookSecret: 'synthetic-secret-at-least-24-characters' })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing loopback port')
  const response = await fetch(`http://127.0.0.1:${address.port}/health`)
  const body = await response.json()
  results.push({ id: 'P06', invariant: 'Pause and health reflect blocked message processing', outcome: !h.store.paused && response.status === 200 ? 'VIOLATED' : 'NOT_REPRODUCED', pausedWhileSendBlocked: h.store.paused, healthStatus: response.status, health: body, simulation: 'Controlled unresolved transport Promise; released before cleanup' })
  release!()
  await h.assistant.idle()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

// Numeric presence is not numeric binding: swapping already present values is invisible.
{
  const source = 'Paciente Alfa ID 10001 recebeu 1 mg. Paciente Beta ID 10002 recebeu 2 mg.'
  const swapped: Organized = { pacientes: [{ nome: 'Paciente Alfa', id: '10001', evolucao: 'Recebeu 2 mg', exames_pedidos: [], condutas: [] }, { nome: 'Paciente Beta', id: '10002', evolucao: 'Recebeu 1 mg', exames_pedidos: [], condutas: [] }], pendencias: [], duvidas: [] }
  const flags = unverifiedNumbers(swapped, source)
  results.push({ id: 'P07', invariant: 'Value swaps between patients are detected', outcome: flags.length === 0 ? 'VIOLATED' : 'NOT_REPRODUCED', flagged: flags, limitation: 'Injected valid structured output; does not estimate the real model error rate' })
}

// A previous unconfirmed, unverified patient ID can become apparently trusted memory.
{
  const first: Organized = { pacientes: [{ nome: 'Paciente Sintético', id: '99999', leito: '3', evolucao: 'Observação sintética', exames_pedidos: [], condutas: [] }], pendencias: [], duvidas: [] }
  const h = setup({ output: first })
  h.assistant.receive(inbound('untrusted-id', 'Paciente Sintético do leito 3 está em observação.'))
  await h.assistant.idle()
  const candidate = h.store.lastActiveNote(phone)
  const remembered = h.store.knownPatients('Paciente Sintético')
  results.push({ id: 'P08', invariant: 'Unverified and unconfirmed IDs are excluded from patient memory', outcome: remembered.some(p => p.id === '99999') ? 'VIOLATED' : 'NOT_REPRODUCED', confirmed: candidate?.confirmed, warnings: candidate?.unverifiedNumbers, rememberedIds: remembered.map(p => p.id) })
}

writeFileSync(join(base, 'evidence/probe-results.json'), JSON.stringify({ scope: 'Isolated synthetic inputs, original product code unchanged', results }, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
