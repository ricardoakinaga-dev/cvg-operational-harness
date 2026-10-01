// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ModelProvider } from '@cvg/model-gateway'
import { describe, expect, it } from 'vitest'
import { ShiftAssistant } from '../assistant.ts'
import { parseCommand } from '../commands.ts'
import { loadShiftConfig } from '../config.ts'
import {
  parseMembers,
  samePhone,
  type InboundMessage,
  type Organized
} from '../domain.ts'
import { allowlistedFetch, EgressDeniedError } from '../egress.ts'
import { ModelOrganizer, unverifiedNumbers } from '../organizer.ts'
import { buildShiftServer } from '../server.ts'
import { ShiftStore } from '../store.ts'
import { WhisperTranscriber } from '../transcriber.ts'
import { EvolutionClient, WahaClient } from '../whatsapp.ts'

// Synthetic data only: fictitious phones, patients and tutors.
const ANA = '5511900000001'
const BRUNO = '5511900000002'
const GESTOR = '5511900000009'
const STRANGER = '5511900000077'
const MEMBERS = parseMembers(
  `${ANA}=Dra Ana;${BRUNO}=Dr Bruno;${GESTOR}=Gestor*`
)
const WAHA = 'http://waha.local:3000'
const SECRET = 'segredo-sintetico-de-teste-123456'

interface Sent {
  url: string
  body: Record<string, unknown>
}

function fakeWaha() {
  const sent: Sent[] = []
  const fetchImpl = async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/sendText')) {
      sent.push({ url, body: JSON.parse(String(init?.body)) })
      return new Response('{}', { status: 201 })
    }
    if (url.startsWith(`${WAHA}/api/files/`)) {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/ogg' }
      })
    }
    return new Response('not found', { status: 404 })
  }
  const client = new WahaClient({
    baseUrl: WAHA,
    apiKey: 'waha-key',
    session: 'default',
    fetch: allowlistedFetch([WAHA], fetchImpl)
  })
  const textsTo = (phone: string) =>
    sent
      .filter((entry) => entry.body.chatId === `${phone}@c.us`)
      .map((entry) => String(entry.body.text))
  return { client, sent, textsTo }
}

function wahaPayload(
  id: string,
  from: string,
  body: string,
  extra: Record<string, unknown> = {}
) {
  return {
    event: 'message',
    session: 'default',
    payload: { id, from: `${from}@c.us`, fromMe: false, body, ...extra }
  }
}

const THOR: Organized = {
  pacientes: [
    {
      nome: 'Thor',
      leito: '3',
      especie: 'canino',
      evolucao: 'Vomitou 2 vezes, piora clínica',
      exames_pedidos: ['hemograma', 'bioquímico'],
      condutas: []
    }
  ],
  pendencias: [
    {
      descricao: 'Ligar para o tutor',
      paciente: 'Thor',
      quando: '2026-09-30T16:00:00-03:00'
    }
  ],
  duvidas: []
}

function setup(
  options: {
    organized?: Organized | Error
    dataDir?: string
    transcript?: string
  } = {}
) {
  let now = new Date('2026-09-30T18:00:00.000Z') // 15:00 in São Paulo
  const clock = () => now
  const waha = fakeWaha()
  const store = new ShiftStore(options.dataDir)
  const organizerCalls: string[] = []
  const assistant = new ShiftAssistant({
    store,
    members: MEMBERS,
    whatsapp: waha.client,
    transcriber: {
      transcribe: async () => options.transcript ?? 'transcrição sintética'
    },
    organizer: {
      organize: async (text) => {
        organizerCalls.push(text)
        if (options.organized instanceof Error) throw options.organized
        return options.organized ?? THOR
      }
    },
    clock
  })
  const receive = async (payload: unknown) => {
    const message = waha.client.parseWebhook(payload, now.toISOString())
    const accepted = message ? assistant.receive(message) : false
    await assistant.idle()
    return accepted
  }
  return {
    assistant,
    store,
    waha,
    organizerCalls,
    receive,
    advance: (minutes: number) => {
      now = new Date(now.getTime() + minutes * 60_000)
    }
  }
}

describe('WhatsApp payload parsing', () => {
  it('reads WAHA direct text and audio, ignoring groups and own messages', () => {
    const { client } = fakeWaha()
    const at = '2026-09-30T18:00:00.000Z'
    expect(client.parseWebhook(wahaPayload('m1', ANA, 'oi'), at)).toMatchObject(
      {
        messageId: 'm1',
        fromPhone: ANA,
        kind: 'text',
        text: 'oi'
      }
    )
    const audio = client.parseWebhook(
      wahaPayload('m2', ANA, '', {
        hasMedia: true,
        media: {
          url: `${WAHA}/api/files/m2.oga`,
          mimetype: 'audio/ogg; codecs=opus'
        }
      }),
      at
    )
    expect(audio).toMatchObject({
      kind: 'audio',
      mediaRef: `${WAHA}/api/files/m2.oga`
    })
    expect(
      client.parseWebhook(
        {
          event: 'message',
          payload: { id: 'g', from: '123-456@g.us', body: 'x' }
        },
        at
      )
    ).toBeUndefined()
    expect(
      client.parseWebhook(wahaPayload('m3', ANA, 'x', { fromMe: true }), at)
    ).toBeUndefined()
    expect(client.parseWebhook({ event: 'session.status' }, at)).toBeUndefined()
  })

  it('reads Evolution text, extended text and inline audio', () => {
    const client = new EvolutionClient({
      baseUrl: 'http://evolution.local:8080',
      apiKey: 'k',
      instance: 'cvg',
      fetch: async () => new Response('{}')
    })
    const at = '2026-09-30T18:00:00.000Z'
    const base = (
      message: Record<string, unknown>,
      jid = `${ANA}@s.whatsapp.net`
    ) => ({
      event: 'messages.upsert',
      instance: 'cvg',
      data: { key: { id: 'e1', remoteJid: jid, fromMe: false }, message }
    })
    expect(
      client.parseWebhook(base({ conversation: 'olá' }), at)
    ).toMatchObject({
      kind: 'text',
      text: 'olá',
      fromPhone: ANA
    })
    expect(
      client.parseWebhook(base({ extendedTextMessage: { text: 'longo' } }), at)
    ).toMatchObject({ text: 'longo' })
    expect(
      client.parseWebhook(
        base({ audioMessage: { mimetype: 'audio/ogg' }, base64: 'AQID' }),
        at
      )
    ).toMatchObject({ kind: 'audio', mediaRef: 'base64:AQID' })
    expect(
      client.parseWebhook(base({ conversation: 'x' }, '1203@g.us'), at)
    ).toBeUndefined()
  })
})

describe('commands', () => {
  it.each([
    ['pendências', { type: 'list' }],
    ['Minhas pendencias?', { type: 'list' }],
    ['feito 3', { type: 'done', number: 3 }],
    ['ok #12', { type: 'done', number: 12 }],
    ['adiar 3 30', { type: 'snooze', number: 3, minutes: 30 }],
    ['adiar 3 1h', { type: 'snooze', number: 3, minutes: 60 }],
    ['OK', { type: 'confirm' }],
    ['corrigir Thor leito 4', { type: 'correct', text: 'Thor leito 4' }],
    ['Pausar assistente', { type: 'pause' }]
  ])('parses %s', (text, expected) => {
    expect(parseCommand(text)).toEqual(expected)
  })

  it('treats ordinary sentences as notes', () => {
    expect(parseCommand('ok, o Thor melhorou')).toBeUndefined()
    expect(parseCommand('feito o curativo do Bob')).toBeUndefined()
    expect(parseCommand('adiar 3 9999')).toBeUndefined()
  })
})

describe('ShiftAssistant', () => {
  it('turns a text note into paste-ready text and a timed task', async () => {
    const env = setup()
    expect(
      await env.receive(
        wahaPayload(
          'm1',
          ANA,
          'Thor leito 3 vomitou 2 vezes, pedi hemograma, ligo pro tutor 16h'
        )
      )
    ).toBe(true)
    const [reply] = env.waha.textsTo(ANA)
    expect(reply).toContain('Thor · canino · leito 3')
    expect(reply).toContain('Evolução: Vomitou 2 vezes, piora clínica')
    expect(reply).toContain(
      'Exames solicitados: hemograma; bioquímico (lançar na comanda)'
    )
    expect(reply).toContain('#1 — Ligar para o tutor (Thor)')
    const [task] = env.store.openTasks(ANA)
    expect(task).toMatchObject({ number: 1, dueAt: '2026-09-30T19:00:00.000Z' })
  })

  it('flags numbers the model produced that were never said', () => {
    const organized: Organized = {
      ...THOR,
      pacientes: [{ ...THOR.pacientes[0]!, condutas: ['Dipirona 25 mg/kg'] }]
    }
    expect(
      unverifiedNumbers(organized, 'Thor leito 3 vomitou 2 vezes')
    ).toEqual(['25'])
  })

  it('ignores unknown senders and duplicate deliveries', async () => {
    const env = setup()
    expect(await env.receive(wahaPayload('x1', STRANGER, 'oi'))).toBe(false)
    expect(env.waha.sent).toHaveLength(0)
    expect(await env.receive(wahaPayload('m1', ANA, 'nota'))).toBe(true)
    expect(await env.receive(wahaPayload('m1', ANA, 'nota'))).toBe(false)
    expect(env.organizerCalls).toHaveLength(1)
  })

  it('accepts the Brazilian ninth-digit variant of a member phone', () => {
    expect(samePhone('5511900000001', '551100000001')).toBe(true)
    expect(samePhone('5511900000001', '5511900000002')).toBe(false)
  })

  it('transcribes audio and keeps the media file as a document', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'shift-audio-'))
    const env = setup({ dataDir, transcript: 'Thor leito 3 vomitou 2 vezes' })
    await env.receive(
      wahaPayload('a1', ANA, '', {
        hasMedia: true,
        media: { url: `${WAHA}/api/files/a1.oga`, mimetype: 'audio/ogg' }
      })
    )
    expect(env.organizerCalls).toEqual(['Thor leito 3 vomitou 2 vezes'])
    expect(readdirSync(join(dataDir, 'media'))).toHaveLength(1)
    expect(readFileSync(join(dataDir, 'events.jsonl'), 'utf8')).toContain(
      'note_created'
    )
  })

  it('keeps the raw text when the organizer fails', async () => {
    const env = setup({ organized: new Error('provider down') })
    await env.receive(wahaPayload('m1', ANA, 'Bob leito 2 estável'))
    expect(env.waha.textsTo(ANA).at(0)).toContain('não consegui organizá-la')
    expect(env.waha.textsTo(ANA).at(0)).toContain('Bob leito 2 estável')
  })

  it('lists, snoozes and completes only the member own tasks', async () => {
    const env = setup()
    await env.receive(wahaPayload('m1', ANA, 'nota com pendência'))
    await env.receive(wahaPayload('c1', BRUNO, 'feito 1'))
    expect(env.waha.textsTo(BRUNO).at(-1)).toContain(
      'Não encontrei a pendência 1'
    )
    await env.receive(wahaPayload('c2', ANA, 'pendências'))
    expect(env.waha.textsTo(ANA).at(-1)).toContain('#1 — Ligar para o tutor')
    await env.receive(wahaPayload('c3', ANA, 'adiar 1 30'))
    expect(env.store.task(1)?.dueAt).toBe('2026-09-30T18:30:00.000Z')
    await env.receive(wahaPayload('c4', ANA, 'feito 1'))
    expect(env.store.task(1)?.status).toBe('done')
  })

  it('reminds at the due time, repeats on an interval and stops after the limit', async () => {
    const env = setup()
    await env.receive(wahaPayload('m1', ANA, 'nota'))
    expect(await env.assistant.tick()).toBe(0) // due at 16:00 local, now 15:00
    env.advance(60)
    expect(await env.assistant.tick()).toBe(1)
    expect(env.waha.textsTo(ANA).at(-1)).toContain('⏰ Lembrete #1')
    env.advance(10)
    expect(await env.assistant.tick()).toBe(0)
    for (let i = 0; i < 5; i += 1) {
      env.advance(30)
      await env.assistant.tick()
    }
    expect(env.store.task(1)?.remindedCount).toBe(4)
  })

  it('processes messages stored before a crash and rebuilds tasks on restart', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'shift-restart-'))
    const first = new ShiftStore(dataDir)
    const message: InboundMessage = {
      provider: 'waha',
      messageId: 'pending-1',
      fromPhone: ANA,
      kind: 'text',
      text: 'Thor leito 3',
      receivedAt: '2026-09-30T18:00:00.000Z'
    }
    first.append({ type: 'message_received', at: message.receivedAt, message })

    const env = setup({ dataDir })
    expect(env.assistant.resumePending()).toBe(1)
    await env.assistant.idle()
    expect(env.waha.textsTo(ANA)).toHaveLength(1)

    const reopened = new ShiftStore(dataDir)
    expect(reopened.unprocessedMessages()).toHaveLength(0)
    expect(reopened.openTasks(ANA)).toHaveLength(1)
  })

  it('lets only the manager pause; paused messages are stored and processed on resume', async () => {
    const env = setup()
    await env.receive(wahaPayload('p0', ANA, 'pausar assistente'))
    expect(env.store.paused).toBe(false)
    await env.receive(wahaPayload('p1', GESTOR, 'pausar assistente'))
    expect(env.store.paused).toBe(true)
    await env.receive(wahaPayload('p2', ANA, 'nota durante a pausa'))
    expect(env.organizerCalls).toHaveLength(0)
    expect(await env.assistant.tick()).toBe(0)
    await env.receive(wahaPayload('p3', GESTOR, 'retomar assistente'))
    await env.assistant.idle()
    expect(env.organizerCalls).toEqual(['nota durante a pausa'])
  })

  it('corrects the last note, cancelling the tasks it created', async () => {
    const env = setup()
    await env.receive(wahaPayload('m1', ANA, 'Thor leito 3'))
    await env.receive(wahaPayload('m2', ANA, 'corrigir Thor leito 4'))
    expect(env.store.task(1)?.status).toBe('cancelled')
    expect(env.store.task(2)?.status).toBe('open')
    expect(env.waha.textsTo(ANA).at(-1)).toContain('Nota anterior substituída')
  })
})

describe('server, egress and configuration', () => {
  it('rejects a wrong webhook secret and accepts a member message', async () => {
    const env = setup()
    const server = buildShiftServer({
      assistant: env.assistant,
      store: env.store,
      whatsapp: env.waha.client,
      webhookSecret: SECRET,
      maxBodyBytes: 4096
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const post = (
      path: string,
      body: unknown,
      headers: Record<string, string> = {}
    ) =>
      fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body)
      })
    try {
      const denied = await post(
        '/webhooks/waha',
        wahaPayload('s1', ANA, 'oi'),
        {
          'x-cvg-webhook-secret': 'errado'
        }
      )
      expect(denied.status).toBe(401)
      const accepted = await post(
        `/webhooks/waha?secret=${SECRET}`,
        wahaPayload('s2', ANA, 'oi')
      )
      expect(await accepted.json()).toEqual({ accepted: true })
      await env.assistant.idle()
      expect(
        (await post(`/webhooks/waha?secret=${SECRET}`, '{nope')).status
      ).toBe(400)
      expect(
        (await post(`/webhooks/waha?secret=${SECRET}`, 'x'.repeat(5000))).status
      ).toBe(413)
      expect(
        (await post(`/webhooks/evolution?secret=${SECRET}`, {})).status
      ).toBe(404)
      const health = await fetch(`${base}/health`)
      expect(await health.json()).toMatchObject({
        ok: true,
        provider: 'waha',
        paused: false
      })
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('refuses requests outside the configured origins and never follows redirects', async () => {
    const seen: RequestInit[] = []
    const guarded = allowlistedFetch([WAHA], async (_url, init) => {
      seen.push(init ?? {})
      return new Response('ok')
    })
    await expect(guarded('https://exfil.example/x')).rejects.toBeInstanceOf(
      EgressDeniedError
    )
    await guarded(`${WAHA}/api/sendText`, { method: 'POST' })
    expect(seen.at(0)?.redirect).toBe('manual')
  })

  it('fails closed on incomplete configuration', () => {
    expect(() => loadShiftConfig({ SHIFT_PROVIDER: 'waha' })).toThrow(
      'Invalid shift assistant configuration'
    )
    const config = loadShiftConfig({
      SHIFT_PROVIDER: 'waha',
      SHIFT_MEMBERS: `${ANA}=Dra Ana;${GESTOR}=Gestor*`,
      SHIFT_WEBHOOK_SECRET: SECRET,
      SHIFT_DATA_DIR: '/tmp/shift',
      WAHA_URL: WAHA,
      WAHA_API_KEY: 'k',
      WHISPER_URL: 'http://whisper.local:8000',
      LLM_BASE_URL: 'https://llm.example/v1',
      LLM_API_KEY: 'k',
      LLM_MODEL: 'modelo'
    })
    expect(config.members.at(1)).toEqual({
      phone: GESTOR,
      name: 'Gestor',
      manager: true
    })
  })
})

describe('adapters to Whisper and the model', () => {
  it('posts audio to the local Whisper transcription endpoint', async () => {
    const calls: string[] = []
    const transcriber = new WhisperTranscriber({
      baseUrl: 'http://whisper.local:8000/',
      model: 'large-v3',
      language: 'pt',
      fetch: async (url, init) => {
        calls.push(url)
        expect(init?.body).toBeInstanceOf(FormData)
        return Response.json({ text: ' Thor leito 3 ' })
      }
    })
    await expect(
      transcriber.transcribe({
        bytes: new Uint8Array([1]),
        mimetype: 'audio/ogg'
      })
    ).resolves.toBe('Thor leito 3')
    expect(calls).toEqual(['http://whisper.local:8000/v1/audio/transcriptions'])
  })

  it('validates the model JSON and rejects anything else', async () => {
    const reply = (text: string): ModelProvider =>
      ({
        id: 'fake',
        location: 'external',
        models: ['m'],
        execute: async () => ({
          text,
          usage: { inputTokens: 1, outputTokens: 1 },
          providerId: 'fake',
          model: 'm',
          externalCall: false
        })
      }) as unknown as ModelProvider
    const now = new Date('2026-09-30T18:00:00.000Z')
    const fenced = '```json\n' + JSON.stringify(THOR) + '\n```'
    await expect(
      new ModelOrganizer(reply(fenced), 'm').organize('x', now)
    ).resolves.toMatchObject({
      pacientes: [{ nome: 'Thor' }]
    })
    await expect(
      new ModelOrganizer(reply('{"pacientes": "nao"}'), 'm').organize('x', now)
    ).rejects.toThrow()
  })
})
