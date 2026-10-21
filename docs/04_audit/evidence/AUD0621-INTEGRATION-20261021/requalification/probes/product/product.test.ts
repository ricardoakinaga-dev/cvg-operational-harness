// @vitest-environment node
// Critic re-probes for AUD-0621 product findings (F07, F08, F09, F10, F11,
// F18, F21 product, F24) against candidate 97d436a6. Synthetic data only.
// Each probe records observations before asserting the FIXED behaviour; a
// failing assertion here means the defect still reproduces.
import { it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { ShiftAssistant } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/products/shift-assistant/src/assistant.ts'
import { ShiftStore } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/products/shift-assistant/src/store.ts'
import { WahaClient } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/products/shift-assistant/src/whatsapp.ts'
import { WhisperTranscriber } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/products/shift-assistant/src/transcriber.ts'
import { allowlistedFetch } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/products/shift-assistant/src/egress.ts'
import { buildShiftServer } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/products/shift-assistant/src/server.ts'
import { buildOrganizerGateway, ModelOrganizer } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/products/shift-assistant/src/organizer.ts'
import { composeShiftApp } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/products/shift-assistant/src/compose.ts'
import { loadShiftConfig } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/products/shift-assistant/src/config.ts'

// Lead (AUD0621-INTEGRATION-20261021): the synthetic webhook secret of the
// product tests (products/shift-assistant/src/__tests__/transport-control-health.test.ts:25),
// joined at runtime so this evidence copy does not trip the generic-api-key rule.
const SYNTHETIC_WEBHOOK_SECRET = ['segredo', 'sintetico', 'de', 'teste', '123456'].join('-')

const out = '/mnt/dados/cvg-work/aud0621-int-runtime/critic/out/product'
const tmp = '/mnt/dados/cvg-work/aud0621-int-runtime/critic/tmp'
const records: any[] = []
function record(name: string, data: any) {
  records.push({ name, ...data })
  writeFileSync(out + '/product-probes.json', JSON.stringify(records, null, 2) + '\n')
}
const servers: Server[] = []
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections()
    await new Promise<void>((r) => s.close(() => r()))
  }
})
async function serve(handler: (req: any, res: any) => void): Promise<string> {
  const s = createServer(handler)
  servers.push(s)
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`
}

const A = '5511900000001', B = '5511900000002', G = '5511900000009'
const member = (phone: string, manager = false) => ({ phone, name: 'synthetic', manager })
const WAHA = 'http://waha.local:3000'
const homonyms = {
  pacientes: [
    { nome: 'Rex', id: '101', leito: '1', exames_pedidos: [], condutas: [] },
    { nome: 'Rex', id: '202', leito: '2', exames_pedidos: [], condutas: [] }
  ],
  pendencias: [{ paciente: 'Rex', descricao: 'Revisar nota sintética', quando: '2026-10-20T09:00:00-03:00' }],
  duvidas: []
}
const single = (n: number) => ({
  pacientes: [{ nome: 'Thor', id: '303', leito: '3', exames_pedidos: [], condutas: [] }],
  pendencias: [
    { paciente: 'Thor', descricao: `Ligar para tutor sintético ${n}`, quando: '2026-10-20T09:00:00-03:00' },
    { paciente: 'Thor', descricao: `Revisar exame sintético ${n}`, quando: '2026-10-20T09:00:00-03:00' }
  ],
  duvidas: []
})

function product(opts: any = {}) {
  let now = opts.start ?? new Date('2026-10-20T12:00:00Z')
  const sent: any[] = []
  const fetchImpl = async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/sendText')) {
      const body = JSON.parse(String(init?.body))
      const entry = { to: body.chatId.split('@')[0], text: body.text }
      sent.push(entry)
      const custom = await opts.onSend?.(entry, init)
      return custom ?? new Response('{}', { status: 201 })
    }
    return new Response('not found', { status: 404 })
  }
  const whatsapp = new WahaClient({ baseUrl: WAHA, apiKey: 'k', session: 'default', fetch: allowlistedFetch([WAHA], fetchImpl) })
  const store = opts.store ?? new ShiftStore(opts.dataDir)
  let organizerCalls = 0
  const assistant = new ShiftAssistant({
    store,
    members: opts.members ?? [member(A), member(B), member(G, true)],
    whatsapp,
    transcriber: { transcribe: async () => 'transcrição sintética' },
    organizer: { organize: async (text: string) => { organizerCalls++; return opts.organize ? opts.organize(text, organizerCalls) : homonyms } },
    clock: () => now,
    ...(opts.extra ?? {})
  })
  const msg = (id: string, text: string, from = A) => ({ provider: 'waha' as const, messageId: id, fromPhone: from, kind: 'text' as const, text, receivedAt: now.toISOString() })
  const say = async (id: string, text: string, from = A) => { const r = assistant.admit(msg(id, text, from)); await assistant.idle(); return r }
  return { assistant, store, sent, say, msg, organizerCalls: () => organizerCalls, advance: (ms: number) => { now = new Date(now.getTime() + ms) }, now: () => now }
}

// (a) F09 + F08: homonyms, then "ok"
it('F09/F08: homonym pending is not bound by list order and "ok" cannot activate it', async () => {
  const p = product()
  await p.say('note', 'Rex 101 leito 1 e Rex 202 leito 2; revisar nota')
  const draftTasks = p.store.tasksOfNote(p.store.lastActiveNote(A)!.id)
  const before = { open: p.store.openTasks().length, draftPatientIds: draftTasks.map((t: any) => t.patientId ?? null), status: draftTasks.map((t: any) => t.status) }
  p.sent.length = 0
  await p.say('ok1', 'ok')
  const afterOk = { confirmed: p.store.lastActiveNote(A)?.confirmed, open: p.store.openTasks().length, reply: p.sent.map((s) => s.text).join('\n').slice(0, 300) }
  p.advance(24 * 3600_000)
  const reminders = await p.assistant.tick()
  record('homonym-confirm', { before, afterOk, reminders })
  expect(before.draftPatientIds).not.toContain('101')
  expect(before.open).toBe(0)
  expect(afterOk.confirmed).toBe(false)
  expect(afterOk.open).toBe(0)
  expect(reminders).toBe(0)
})

it('F09: remembered homonyms (confirmed earlier) are not completed by name', async () => {
  let n = 0
  const p = product({ organize: async () => {
    n++
    if (n === 1) return { pacientes: [{ nome: 'Rex', id: '101', leito: '1', exames_pedidos: [], condutas: [] }], pendencias: [], duvidas: [] }
    if (n === 2) return { pacientes: [{ nome: 'Rex', id: '202', leito: '2', exames_pedidos: [], condutas: [] }], pendencias: [], duvidas: [] }
    return { pacientes: [{ nome: 'Rex', exames_pedidos: [], condutas: [] }], pendencias: [{ paciente: 'Rex', descricao: 'Checar Rex', quando: null }], duvidas: [] }
  } })
  await p.say('n1', 'Rex 101 leito 1'); await p.say('ok1', 'ok')
  await p.say('n2', 'Rex 202 leito 2'); await p.say('ok2', 'ok')
  await p.say('n3', 'Rex: checar')
  const note = p.store.lastActiveNote(A)!
  const tasks = p.store.tasksOfNote(note.id)
  await p.say('ok3', 'ok')
  record('homonym-memory', { patients: note.organized?.pacientes, blocking: note.blockingIssues, taskPatientIds: tasks.map((t: any) => t.patientId ?? null), confirmed: p.store.note(note.id)?.confirmed })
  expect(tasks.map((t: any) => t.patientId ?? null)).toEqual([null])
  expect(p.store.note(note.id)?.confirmed).toBe(false)
})

// (b) F10: revoked member
it('F10: recomposed without A, a confirmed task of A sends nothing to A', async () => {
  const p = product({ organize: async () => single(1) })
  await p.say('note', 'Thor 303 leito 3')
  await p.say('ok', 'ok')
  const open = p.store.openTasks().length
  const q = product({ store: p.store, members: [member(B), member(G, true)], start: new Date('2026-10-21T12:00:00Z') })
  const reminders = await q.assistant.tick()
  // A message from A stored before revocation is not processed for A
  q.assistant.resumePending()
  await q.assistant.idle()
  const admitAfterRevocation = q.assistant.admit(q.msg('late', 'ok'))
  record('revoked-member-confirmed', { open, reminders, sentTo: q.sent.map((s) => s.to), admitAfterRevocation })
  expect(open).toBe(2)
  expect(q.sent.filter((s) => s.to === A)).toHaveLength(0)
  expect(admitAfterRevocation).toBe('ignored')
})

// (c) F11: overlapping ticks and pause during tick, with confirmed tasks
it('F11: two overlapping ticks on a slow channel send at most once per task', async () => {
  let release: any; const blocked = new Promise<void>((r) => { release = r })
  let sends = 0
  const p = product({ organize: async () => ({ ...single(1), pendencias: [single(1).pendencias[0]] }) })
  await p.say('note', 'Thor 303'); await p.say('ok', 'ok')
  const q = product({ store: p.store, start: new Date('2026-10-21T12:00:00Z'), onSend: async () => { sends++; await blocked } })
  const first = q.assistant.tick(); await Promise.resolve(); await Promise.resolve()
  const second = q.assistant.tick(); await Promise.resolve()
  // a second assistant instance over the SAME store object (two schedulers in one process)
  const r = product({ store: p.store, start: new Date('2026-10-21T12:00:00Z'), onSend: async () => { sends++; await blocked } })
  const third = r.assistant.tick()
  await new Promise((res) => setTimeout(res, 20))
  release()
  const results = await Promise.all([first, second, third])
  record('overlapping-ticks-confirmed', { sends, results, task: p.store.openTasks()[0] })
  expect(sends).toBe(1)
})

it('F11: pause recorded during the first reminder stops the second (store.append and manager command)', async () => {
  for (const mode of ['append', 'command'] as const) {
    const p = product({ organize: async () => single(1) })
    await p.say('note', 'Thor 303'); await p.say('ok', 'ok')
    let sends = 0
    let q: any
    q = product({ store: p.store, start: new Date('2026-10-21T12:00:00Z'), onSend: async () => {
      sends++
      if (sends === 1) {
        if (mode === 'append') p.store.append({ type: 'paused', at: new Date().toISOString(), by: G })
        else q.assistant.admit(q.msg('pause-' + mode, 'pausar assistente', G))
      }
    } })
    const reminders = await q.assistant.tick()
    await q.assistant.idle()
    const reminderSends = q.sent.filter((s: any) => s.text.startsWith('⏰')).length
    record('pause-during-tick-confirmed-' + mode, { reminders, reminderSends, paused: p.store.paused, open: p.store.openTasks().length })
    expect(p.store.openTasks().length).toBe(2)
    expect(reminderSends).toBe(1)
    expect(p.store.paused).toBe(true)
  }
})

it('F11: crash after reservation and before outcome never resends after restart', async () => {
  const dir = mkdtempSync(join(tmp, 'f11-crash-'))
  const p = product({ dataDir: dir, organize: async () => ({ ...single(1), pendencias: [single(1).pendencias[0]] }) })
  await p.say('note', 'Thor 303'); await p.say('ok', 'ok')
  // simulate the reservation line written and the process dying before task_reminded
  const task = p.store.openTasks()[0]
  p.store.reserveReminder(task.number, task.remindedCount + 1, new Date().toISOString())
  const restarted = product({ store: new ShiftStore(dir), start: new Date('2026-10-21T12:00:00Z') })
  const reminders = await restarted.assistant.tick()
  const t = restarted.store.task(task.number)
  record('crash-after-reservation', { reminders, uncertain: t?.reminderUncertain, inFlight: t?.reminderInFlight, health: restarted.assistant.health().attention })
  expect(reminders).toBe(0)
  expect(t?.reminderUncertain).toBe(true)
})

// (d) F07: failure, restart, retry
it('F07: organizer failure keeps the message eligible across restart and it is processed later', async () => {
  const dir = mkdtempSync(join(tmp, 'f07-'))
  const p = product({ dataDir: dir, organize: async () => { throw Object.assign(new Error('synthetic dependency failure'), { name: 'Error' }) } })
  const admitted = await p.say('m1', 'Thor 303 leito 3; ligar tutor')
  const retry1 = p.store.retryState('m1')
  const pending1 = p.store.unprocessedMessages().length
  const dupe = p.assistant.admit(p.msg('m1', 'Thor 303 leito 3; ligar tutor'))
  // restart with a healthy organizer, before the retry is due
  const q = product({ store: new ShiftStore(dir), start: new Date('2026-10-20T12:00:10Z'), organize: async () => single(9) })
  q.assistant.resumePending(); await q.assistant.idle()
  const beforeDue = { pending: q.store.unprocessedMessages().length, calls: q.organizerCalls() }
  q.advance(60_000)
  await q.assistant.tick(); await q.assistant.idle()
  const afterDue = { pending: q.store.unprocessedMessages().length, calls: q.organizerCalls(), note: !!q.store.lastActiveNote(A)?.organized, drafts: q.store.tasksOfNote(q.store.lastActiveNote(A)!.id).map((t: any) => t.status) }
  record('failed-message-retry-restart', { admitted, retry1, pending1, dupe, beforeDue, afterDue })
  expect(retry1?.attempt).toBe(1)
  expect(pending1).toBe(1)
  expect(beforeDue.calls).toBe(0)
  expect(afterDue.pending).toBe(0)
  expect(afterDue.calls).toBe(1)
  expect(afterDue.note).toBe(true)
})

it('F07: the retry budget is finite (5 attempts) and ends in a raw note, not an infinite loop', async () => {
  const p = product({ organize: async () => { throw new Error('synthetic transient') } })
  await p.say('m1', 'Thor 303; ligar tutor')
  const attempts: any[] = []
  for (let i = 0; i < 8; i++) {
    attempts.push(p.store.retryState('m1')?.attempt ?? null)
    p.advance(2 * 3600_000)
    await p.assistant.tick(); await p.assistant.idle()
  }
  const note = p.store.lastActiveNote(A)
  record('retry-budget', { attempts, organizerCalls: p.organizerCalls(), pending: p.store.unprocessedMessages().length, rawNote: note?.rawText, organized: note?.organized ?? null, authorNotices: p.sent.filter((s) => s.text.includes('vou tentar de novo')).length })
  expect(p.organizerCalls()).toBe(5)
  expect(p.store.unprocessedMessages()).toHaveLength(0)
  expect(note?.organized).toBeUndefined()
})

// (e) F18: truncated tail
it('F18: truncated tail keeps the prefix, preserves the tail and accepts new commits across restarts', () => {
  const dir = mkdtempSync(join(tmp, 'f18-'))
  const at = '2026-10-20T12:00:00.000Z'
  writeFileSync(dir + '/events.jsonl', JSON.stringify({ type: 'paused', at, by: A }) + '\n')
  appendFileSync(dir + '/events.jsonl', '{"type":"resu')
  let error = ''
  let s1: any
  try { s1 = new ShiftStore(dir) } catch (e) { error = String(e) }
  const recoveryDirs = existsSync(dir + '/recovery') ? readdirSync(dir + '/recovery') : []
  const tail = recoveryDirs.length ? readFileSync(join(dir, 'recovery', recoveryDirs[0], 'tail.bin'), 'utf8') : null
  const prefixPausedBeforeAppend = s1?.paused
  s1?.append({ type: 'resumed', at, by: A })
  let s2: any; let error2 = ''
  try { s2 = new ShiftStore(dir) } catch (e) { error2 = String(e) }
  const manifest = existsSync(dir + '/journal.json') ? JSON.parse(readFileSync(dir + '/journal.json', 'utf8')) : null
  const original = readFileSync(dir + '/events.jsonl', 'utf8')
  // third restart: still stable, no new recovery
  let error3 = ''
  try { new ShiftStore(dir) } catch (e) { error3 = String(e) }
  const recoveryDirs3 = readdirSync(dir + '/recovery')
  record('jsonl-tail-recovery', { error, prefixPausedBeforeAppend, tail, error2, pausedAfterRestart: s2?.paused, manifest, originalUntouched: original.endsWith('{"type":"resu'), error3, recoveryCount: recoveryDirs3.length })
  expect(error).toBe('')
  expect(prefixPausedBeforeAppend).toBe(true)
  expect(tail).toBe('{"type":"resu')
  expect(error2).toBe('')
  expect(s2?.paused).toBe(false)
  expect(original.endsWith('{"type":"resu')).toBe(true)
  expect(recoveryDirs3.length).toBe(1)
})

// (f) F24: organizer through the public gateway with a spy provider
it('F24: organizer gateway denies CLINICAL before any provider call (local and external profiles)', async () => {
  const out24: any = {}
  for (const location of ['local', 'external'] as const) {
    let calls = 0
    const provider: any = {
      id: 'spy', location,
      async execute() { calls++; return { text: '{}', usage: { inputTokens: 1, outputTokens: 1 }, providerId: 'spy', model: 'm', externalCall: location === 'external' } },
      async generate() { calls++; throw new Error('must not be called') },
      async complete() { calls++; throw new Error('must not be called') }
    }
    const organizer = new ModelOrganizer(buildOrganizerGateway({ provider, model: 'm', location, timeoutMs: 1000 }), { profile: location === 'local' ? 'local' : 'balanced', timeoutMs: 1000 })
    let code = ''
    try { await organizer.organize('Rex 101 vomitou 2 vezes', new Date()) } catch (e: any) { code = e?.code ?? String(e) }
    out24[location] = { calls, code }
  }
  record('organizer-no-model-spy', out24)
  expect(out24.local).toEqual({ calls: 0, code: 'policy_denied' })
  expect(out24.external).toEqual({ calls: 0, code: 'policy_denied' })
})

it('F24: real composition (local LLM over http, audio path) makes zero model requests', async () => {
  let llmCalls = 0
  const llmUrl = await serve((req, res) => { llmCalls++; req.resume(); res.writeHead(500); res.end() })
  const sent: any[] = []
  const wahaUrl = await serve((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      if (req.url?.startsWith('/api/sendText')) { sent.push(JSON.parse(Buffer.concat(chunks).toString())); res.writeHead(201); res.end('{}'); return }
      if (req.url?.startsWith('/api/files/')) { res.writeHead(200, { 'content-type': 'audio/ogg' }); res.end(Buffer.from([1, 2, 3])); return }
      res.writeHead(404); res.end()
    })
  })
  const whisperUrl = await serve((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ text: 'Rex 101 leito 1 vomitou duas vezes, revisar às 22h' })) }) })
  const config = loadShiftConfig({
    SHIFT_PROVIDER: 'waha', SHIFT_MEMBERS: `${A}=Dra Ana;${G}=Gestor*`, SHIFT_WEBHOOK_SECRET: SYNTHETIC_WEBHOOK_SECRET,
    SHIFT_DATA_DIR: mkdtempSync(join(tmp, 'f24-')), SHIFT_PORT: '0', SHIFT_HOST: '127.0.0.1', SHIFT_TICK_SECONDS: '3600',
    WAHA_URL: wahaUrl, WAHA_API_KEY: 'k', WHISPER_URL: whisperUrl,
    LLM_BASE_URL: llmUrl, LLM_MODEL: 'synthetic', LLM_LOCATION: 'local'
  })
  const app = composeShiftApp(config)
  const port = await app.start()
  try {
    const r = await fetch(`http://127.0.0.1:${port}/webhooks/waha`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cvg-webhook-secret': SYNTHETIC_WEBHOOK_SECRET }, body: JSON.stringify({ event: 'message', payload: { id: 'a1', from: `${A}@c.us`, fromMe: false, body: '', hasMedia: true, media: { mimetype: 'audio/ogg', url: `${wahaUrl}/api/files/a1.ogg` } } }) })
    const accepted = await r.json()
    await app.assistant.idle()
    const note = app.store.lastActiveNote(A)
    record('compose-no-model-audio', { accepted, llmCalls, rawText: note?.rawText, organized: note?.organized ?? null, tasks: app.store.tasksOfNote(note?.id ?? '').length, reply: String(sent.at(-1)?.text ?? '').slice(0, 160) })
    expect(llmCalls).toBe(0)
    expect(note?.organized).toBeUndefined()
  } finally {
    await app.stop()
  }
})

// (g) F21 product: bounded reads, queue limit, health
it('F21: WAHA download oversize/hung, Whisper oversize/hung and send hung are cut by ceiling/deadline', async () => {
  const MiB = 1024 * 1024
  let bigServed = 0
  const base = await serve((req, res) => {
    if (req.url === '/big') {
      res.writeHead(200, { 'content-type': 'audio/ogg' })
      const chunk = Buffer.alloc(64 * 1024, 7)
      const pump = () => { while (bigServed < 64 * MiB) { bigServed += chunk.length; if (!res.write(chunk)) { res.once('drain', pump); return } } res.end() }
      res.on('close', () => undefined)
      pump(); return
    }
    if (req.url === '/hang') { res.writeHead(200, { 'content-type': 'audio/ogg' }); res.write(Buffer.alloc(10)); return }
    if (req.url?.startsWith('/v1/audio')) {
      req.resume()
      req.on('end', () => {
        if (req.headers['x-mode'] === 'hang') return
        res.writeHead(200, { 'content-type': 'application/json' }); res.write('{"text":"'); const pad = Buffer.alloc(512 * 1024, 97); res.write(pad)
      })
      return
    }
    if (req.url?.startsWith('/api/sendText')) { req.resume(); res.writeHead(201); res.write('{'); return }
    res.writeHead(404); res.end()
  })
  const waha = new WahaClient({ baseUrl: base, apiKey: 'k', session: 'default', fetch: allowlistedFetch([base]), mediaTimeoutMs: 400, sendTimeoutMs: 400, maxMediaBytes: 1 * MiB })
  const msg = (ref: string) => ({ provider: 'waha' as const, messageId: 'x', fromPhone: A, kind: 'audio' as const, text: '', mediaRef: `${base}${ref}`, mimetype: 'audio/ogg', receivedAt: new Date().toISOString() })
  const t0 = Date.now(); let big = ''
  try { await waha.downloadMedia(msg('/big')) } catch (e: any) { big = e.code }
  const bigMs = Date.now() - t0
  const t1 = Date.now(); let hang = ''
  try { await waha.downloadMedia(msg('/hang')) } catch (e: any) { hang = e.code }
  const hangMs = Date.now() - t1
  const whisper = new WhisperTranscriber({ baseUrl: base, model: 'w', language: 'pt', fetch: allowlistedFetch([base]), timeoutMs: 400 })
  const t2 = Date.now(); let wbig = ''
  try { await whisper.transcribe({ bytes: new Uint8Array([1, 2, 3]), mimetype: 'audio/ogg' }) } catch (e: any) { wbig = e.code }
  const wbigMs = Date.now() - t2
  const t3 = Date.now(); let send = ''; let outcome = ''
  try { await waha.sendText(A, 'oi') } catch (e: any) { send = e.code; outcome = e.outcome }
  const sendMs = Date.now() - t3
  record('transport-bounds', { big, bigMs, bigServedMiB: Math.round(bigServed / MiB), hang, hangMs, wbig, wbigMs, send, outcome, sendMs })
  expect(big).toBe('MEDIA_TOO_LARGE')
  expect(bigServed).toBeLessThan(16 * MiB)
  expect(hang).toBe('TRANSPORT_TIMEOUT')
  expect(hangMs).toBeLessThan(3000)
  expect(['BODY_TOO_LARGE', 'TRANSPORT_TIMEOUT']).toContain(wbig)
  expect(wbigMs).toBeLessThan(3000)
  expect(send).toBe('TRANSPORT_TIMEOUT')
  expect(outcome).toBe('uncertain')
})

it('F21: bounded queue answers queue_full and /health turns 503 when stopping or stalled', async () => {
  let release: any; const hung = new Promise<any>((r) => { release = r })
  const p = product({ organize: async () => hung, extra: { maxPendingMessages: 2, jobTimeoutMs: 100_000 } })
  const r1 = p.assistant.admit(p.msg('q1', 'nota 1'))
  const r2 = p.assistant.admit(p.msg('q2', 'nota 2'))
  const r3 = p.assistant.admit(p.msg('q3', 'nota 3'))
  const control = p.assistant.admit(p.msg('qp', 'pausar assistente', G))
  const server = buildShiftServer({ assistant: p.assistant, store: p.store, whatsapp: { provider: 'waha', parseWebhook: (x: any) => x, sendText: async () => {}, downloadMedia: async () => ({ bytes: new Uint8Array(), mimetype: 'audio/ogg' }) } as any, webhookSecret: SYNTHETIC_WEBHOOK_SECRET })
  servers.push(server)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const readyBefore = (await fetch(url + '/health/ready')).status
  p.assistant.beginStop()
  const readyStopping = await fetch(url + '/health/ready')
  const health = await fetch(url + '/health')
  release({ pacientes: [], pendencias: [], duvidas: [] })
  const drained = await p.assistant.drain(2000)
  record('queue-health', { r1, r2, r3, control, readyBefore, readyStopping: readyStopping.status, readyBody: await readyStopping.json(), health: health.status, drained, paused: p.store.paused })
  expect(r3).toBe('queue_full')
  expect(control).toBe('accepted')
  expect(p.store.paused).toBe(true)
  expect(readyStopping.status).toBe(503)
  expect(health.status).toBe(503)
})

it('F24: real composition with an external HTTPS LLM keeps the note raw via policy_denied (no retry path)', async () => {
  const sent: any[] = []
  const wahaUrl = await serve((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      if (req.url?.startsWith('/api/sendText')) { sent.push(JSON.parse(Buffer.concat(chunks).toString())); res.writeHead(201); res.end('{}'); return }
      res.writeHead(404); res.end()
    })
  })
  const config = loadShiftConfig({
    SHIFT_PROVIDER: 'waha', SHIFT_MEMBERS: `${A}=Dra Ana;${G}=Gestor*`, SHIFT_WEBHOOK_SECRET: SYNTHETIC_WEBHOOK_SECRET,
    SHIFT_DATA_DIR: mkdtempSync(join(tmp, 'f24e-')), SHIFT_PORT: '0', SHIFT_HOST: '127.0.0.1', SHIFT_TICK_SECONDS: '3600',
    WAHA_URL: wahaUrl, WAHA_API_KEY: 'k', WHISPER_URL: 'http://127.0.0.1:9',
    LLM_BASE_URL: 'https://llm.invalid', LLM_MODEL: 'synthetic', LLM_LOCATION: 'external', LLM_API_KEY: 'synthetic-key'
  })
  const app = composeShiftApp(config)
  const port = await app.start()
  try {
    await fetch(`http://127.0.0.1:${port}/webhooks/waha`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-cvg-webhook-secret': SYNTHETIC_WEBHOOK_SECRET }, body: JSON.stringify({ event: 'message', payload: { id: 't1', from: `${A}@c.us`, fromMe: false, body: 'Rex 101 leito 1 vomitou; revisar 22h' } }) })
    await app.assistant.idle()
    const note = app.store.lastActiveNote(A)
    const reply = String(sent.at(-1)?.text ?? '')
    record('compose-no-model-external', { retry: app.store.retryState('t1') ?? null, organized: note?.organized ?? null, policyReply: reply.includes('sem organização automática') })
    expect(app.store.retryState('t1')).toBeUndefined()
    expect(note?.organized).toBeUndefined()
    expect(reply).toContain('sem organização automática')
  } finally {
    await app.stop()
  }
})
