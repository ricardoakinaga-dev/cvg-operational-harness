// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { composeShiftApp } from '../compose.ts'
import { loadShiftConfig } from '../config.ts'
import { allowlistedFetch } from '../egress.ts'
import { sandboxOrganizer } from '../sandbox/services.ts'
import { ShiftStore } from '../store.ts'
import { DispatchError } from '../transport-limits.ts'
import { WahaClient, type WhatsAppClient } from '../whatsapp.ts'
import {
  ANA,
  GESTOR,
  setup,
  tempDir,
  THOR,
  WAHA,
  wahaPayload
} from './support/harness.ts'

// AUD0621-PRODUCT-PISO008 residuals of the product requalification critic,
// inside SPEC 0179/0180: Whisper only on a local or internal destination,
// organizer injection only for the synthetic organizer in tests, a bounded
// budget for reminders that were never sent (not_sent) and the readiness
// codes inbox_stalled and job_deadline_exceeded (SPEC 0179 sections 6 and
// 8.2-8.3). Synthetic data only.

const SECRET = 'segredo-sintetico-de-teste-123456'

function env(overrides: Record<string, string> = {}) {
  return {
    SHIFT_PROVIDER: 'waha',
    SHIFT_MEMBERS: `${ANA}=Dra Ana;${GESTOR}=Gestor*`,
    SHIFT_WEBHOOK_SECRET: SECRET,
    SHIFT_DATA_DIR: tempDir('residual'),
    SHIFT_PORT: '0',
    SHIFT_HOST: '127.0.0.1',
    WAHA_URL: 'http://waha.local:3000',
    WAHA_API_KEY: 'k',
    WHISPER_URL: 'http://whisper.local:8000',
    LLM_BASE_URL: 'http://127.0.0.1:9/v1',
    LLM_MODEL: 'sandbox',
    LLM_LOCATION: 'local',
    ...overrides
  }
}

describe('Whisper is reachable only on a local or internal destination', () => {
  it('accepts loopback, private addresses and internal service names', () => {
    for (const url of [
      'http://whisper:8080',
      'http://whisper.local:8000',
      'http://whisper.internal:9000',
      'http://127.0.0.1:9000',
      'http://10.254.177.5:9000',
      'http://172.16.0.4:9000',
      'http://192.168.1.20:9000',
      'http://[::1]:9000',
      'http://[fd00::5]:9000',
      'https://whisper.lan/v1'
    ]) {
      expect(() => loadShiftConfig(env({ WHISPER_URL: url }))).not.toThrow()
    }
  })

  it('refuses public, metadata, credentialed and non-HTTP destinations without echoing them', () => {
    for (const url of [
      'https://api.openai.com/v1',
      'http://whisper.example.com:9000',
      'http://8.8.8.8:9000',
      'http://169.254.169.254/latest',
      'http://0.0.0.0:9000',
      'http://[2606:4700:4700::1111]/',
      'http://[fe80::1]/',
      'http://user:senha@whisper:8080',
      'ftp://whisper/'
    ]) {
      let message = ''
      try {
        loadShiftConfig(env({ WHISPER_URL: url }))
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      expect(message, url).toMatch(/WHISPER_URL/)
      expect(message).not.toContain(new URL(url).hostname.replace(/[[\]]/g, ''))
      expect(message).not.toContain('senha')
    }
  })
})

describe('organizer injection is test-only and synthetic-only', () => {
  const previous = process.env.NODE_ENV
  afterEach(() => {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  })

  it('refuses an arbitrary organizer even in tests', () => {
    expect(() =>
      composeShiftApp(loadShiftConfig(env()), {
        organizer: { organize: async () => THOR }
      })
    ).toThrow(/organizer/)
  })

  it('refuses the synthetic organizer outside the test environment', () => {
    process.env.NODE_ENV = 'production'
    expect(() =>
      composeShiftApp(loadShiftConfig(env()), { organizer: sandboxOrganizer })
    ).toThrow(/organizer/)
    delete process.env.NODE_ENV
    expect(() =>
      composeShiftApp(loadShiftConfig(env()), { organizer: sandboxOrganizer })
    ).toThrow(/organizer/)
  })

  it('accepts the synthetic organizer under the test runner', () => {
    process.env.NODE_ENV = 'test'
    const app = composeShiftApp(loadShiftConfig(env()), {
      organizer: sandboxOrganizer
    })
    expect(app.assistant).toBeDefined()
  })
})

const DUE = new Date('2026-09-30T19:05:00.000Z') // after the 16:00 due time

async function confirmedTask(dataDir: string) {
  const first = setup({ dataDir })
  await first.deliver(wahaPayload('m1', ANA, 'Thor leito 3 ligar tutor'))
  await first.deliver(wahaPayload('ok1', ANA, 'ok'))
  expect(first.store.openTasks(ANA)).toHaveLength(1)
  return first.store.openTasks(ANA)[0]!.number
}

/** WAHA client whose sends are counted; reminders fail with `failure`. */
function countingChannel(failure: () => Error) {
  const base = new WahaClient({
    baseUrl: WAHA,
    apiKey: 'waha-key',
    session: 'default',
    fetch: allowlistedFetch(
      [WAHA],
      async () => new Response('{}', { status: 201 })
    )
  })
  const attempts: string[] = []
  let clock = () => new Date(0)
  const client: WhatsAppClient = {
    provider: 'waha',
    parseWebhook: (payload, receivedAt) =>
      base.parseWebhook(payload, receivedAt),
    downloadMedia: (message, signal) => base.downloadMedia(message, signal),
    async sendText(phone, text, signal) {
      if (!text.includes('⏰ Lembrete')) {
        return base.sendText(phone, text, signal)
      }
      attempts.push(clock().toISOString())
      throw failure()
    }
  }
  return {
    client,
    attempts,
    useClock(next: () => Date) {
      clock = next
    }
  }
}

function journalTypes(dataDir: string): Array<Record<string, unknown>> {
  return readFileSync(join(dataDir, 'events.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .flatMap((record) =>
      record.type === 'transaction'
        ? (record.events as Array<Record<string, unknown>>)
        : [record]
    )
}

describe('a reminder that was never sent has a bounded budget', () => {
  it('stops after one attempt when the channel is denied by egress (permanent)', async () => {
    const dataDir = tempDir('not-sent-permanent')
    const number = await confirmedTask(dataDir)
    // The channel origin is outside the allowlist: nothing leaves the
    // process (not_sent), and no later attempt can succeed.
    const denied = new WahaClient({
      baseUrl: WAHA,
      apiKey: 'waha-key',
      session: 'default',
      fetch: allowlistedFetch(['http://outro.local:3000'])
    })
    let calls = 0
    const counting: WhatsAppClient = {
      provider: 'waha',
      parseWebhook: (p, r) => denied.parseWebhook(p, r),
      downloadMedia: (m, s) => denied.downloadMedia(m, s),
      sendText: (phone, text, signal) => {
        if (text.includes('⏰ Lembrete')) calls += 1
        return denied.sendText(phone, text, signal)
      }
    }
    let now = DUE
    const second = setup({
      store: new ShiftStore(dataDir),
      start: DUE,
      extra: { whatsapp: counting, clock: () => now }
    })
    for (let minute = 0; minute < 180; minute += 1) {
      now = new Date(DUE.getTime() + minute * 60_000)
      await second.assistant.tick()
    }
    expect(calls).toBe(1)
    const health = second.assistant.health()
    expect(health.ready).toBe(true)
    expect(health.attention).toContain('reminder_send_failed')
    const failed = journalTypes(dataDir).filter(
      (event) => event.type === 'reminder_dispatch_failed'
    )
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({
      number,
      outcome: 'not_sent',
      code: 'EGRESS_DENIED',
      final: true
    })

    // A restart keeps the decision: still no new attempt.
    const restarted = setup({
      store: new ShiftStore(dataDir),
      start: now,
      extra: { whatsapp: counting }
    })
    await restarted.assistant.tick()
    expect(calls).toBe(1)
    expect(restarted.assistant.health().attention).toContain(
      'reminder_send_failed'
    )
    expect(restarted.store.task(number)?.reminderSendFailed).toBe(true)

    // "adiar" opens a new window with a fresh budget: one more attempt.
    await restarted.deliver(wahaPayload('a1', ANA, `adiar ${number} 30`))
    expect(restarted.store.task(number)?.reminderSendFailed).toBeUndefined()
    now = new Date(now.getTime() + 3 * 3600_000)
    const later = setup({
      store: restarted.store,
      start: now,
      extra: { whatsapp: counting, clock: () => now }
    })
    await later.assistant.tick()
    await later.assistant.tick()
    expect(calls).toBe(2)
  })

  it('retries a send refused before acceptance at 30 s, 2, 10 and 30 min, five attempts in all, across a restart', async () => {
    const dataDir = tempDir('not-sent-budget')
    await confirmedTask(dataDir)
    const channel = countingChannel(
      () =>
        new DispatchError('TRANSPORT_HTTP_STATUS', 'not_sent', { status: 429 })
    )
    let now = DUE
    const clock = () => now
    channel.useClock(clock)
    let current = setup({
      store: new ShiftStore(dataDir),
      start: DUE,
      extra: { whatsapp: channel.client, clock }
    })
    for (let second = 0; second <= 3 * 3600; second += 10) {
      now = new Date(DUE.getTime() + second * 1000)
      if (second === 900) {
        // Restart in the middle of the budget.
        current = setup({
          store: new ShiftStore(dataDir),
          start: now,
          extra: { whatsapp: channel.client, clock }
        })
      }
      await current.assistant.tick()
    }
    const offsets = channel.attempts.map(
      (at) => (Date.parse(at) - DUE.getTime()) / 1000
    )
    expect(offsets).toEqual([0, 30, 150, 750, 2550])
    expect(current.assistant.health().attention).toContain(
      'reminder_send_failed'
    )
  })
})

describe('readiness codes for a stuck inbox and an overdue job', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports inbox_stalled after 240 s without progress, job_deadline_exceeded after deadline + 30 s', async () => {
    let now = new Date('2026-10-01T17:00:00.000Z')
    const realNow = performance.now.bind(performance)
    let monotonicOffset = 0
    vi.spyOn(performance, 'now').mockImplementation(
      () => realNow() + monotonicOffset
    )
    let release: () => void = () => undefined
    const env = setup({
      start: now,
      // The organizer of the first message never answers on its own.
      organize: (text) =>
        text.includes('preso')
          ? new Promise((resolve) => {
              release = () => resolve(THOR)
            })
          : Promise.resolve(THOR),
      extra: { clock: () => now }
    })
    env.assistant.schedulerStarted(60_000)
    const message = (id: string, body: string) =>
      env.waha.client.parseWebhook(
        wahaPayload(id, ANA, body),
        now.toISOString()
      )!
    expect(env.assistant.receive(message('m1', 'Thor preso'))).toBe(true)
    expect(env.assistant.receive(message('m2', 'Thor leito 3'))).toBe(true)
    // Let the first job start (and record its progress) at t0.
    await new Promise((resolve) => setImmediate(resolve))
    const advance = async (seconds: number) => {
      for (let step = 0; step < seconds; step += 10) {
        now = new Date(now.getTime() + 10_000)
        monotonicOffset += 10_000
        await env.assistant.tick() // keeps the scheduler fresh
      }
    }

    await advance(230)
    expect(env.assistant.health().reasonCodes).toEqual([])
    await advance(20) // 250 s: more than 210 + 30 s with no progress
    const stuck = env.assistant.health()
    expect(stuck.ready).toBe(false)
    expect(stuck.reasonCodes).toContain('inbox_stalled')
    expect(stuck.reasonCodes).toContain('job_deadline_exceeded')
    expect(stuck.reasonCodes).not.toContain('scheduler_stale')

    // Progress clears both.
    release()
    await env.assistant.idle()
    const moving = env.assistant.health()
    expect(moving.reasonCodes).toEqual([])
    expect(env.store.unprocessedMessages()).toHaveLength(0)
  })

  it('does not report a paused inbox, a future retry or a fresh backlog as stalled', async () => {
    let now = new Date('2026-10-01T17:00:00.000Z')
    const store = new ShiftStore()
    const at = now.toISOString()
    store.commit([
      {
        type: 'message_received',
        at,
        message: {
          provider: 'waha',
          messageId: 'r1',
          fromPhone: ANA,
          kind: 'text',
          text: 'Thor leito 3',
          receivedAt: at
        }
      },
      {
        type: 'message_retry_scheduled',
        at,
        messageId: 'r1',
        stage: 'organize',
        attempt: 1,
        nextAttemptAt: new Date(now.getTime() + 600_000).toISOString(),
        code: 'DEPENDENCY_FAILED'
      }
    ])
    const start = now.getTime()
    const env = setup({ store, start: now, extra: { clock: () => now } })
    env.assistant.schedulerStarted(60_000)
    now = new Date(start + 250_000)
    await env.assistant.tick()
    // Retry 10 min ahead: waiting for it is not a stall.
    expect(env.assistant.health().reasonCodes).toEqual([])
    // Eligible at +600 s and woken by a scheduler round (60 s here): late
    // only after 600 + 240 + 60 s. No tick runs in between on purpose.
    now = new Date(start + 600_000 + 290_000)
    expect(env.assistant.health().reasonCodes).not.toContain('inbox_stalled')
    now = new Date(start + 600_000 + 310_000)
    expect(env.assistant.health().reasonCodes).toContain('inbox_stalled')

    // Paused: a waiting inbox is intentional, never a stall.
    const paused = new ShiftStore()
    paused.commit([
      { type: 'message_received', at, message: store.message('r1')! },
      { type: 'paused', at, by: GESTOR }
    ])
    const idle = setup({
      store: paused,
      start: now,
      extra: { clock: () => now }
    })
    now = new Date(start + 3600_000)
    expect(idle.assistant.health().reasonCodes).not.toContain('inbox_stalled')
    expect(idle.assistant.health().mode).toBe('paused')
  })
})
