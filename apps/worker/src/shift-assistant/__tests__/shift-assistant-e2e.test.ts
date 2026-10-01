// @vitest-environment node
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { composeShiftApp, type ShiftApp } from '../compose.ts'
import { loadShiftConfig } from '../config.ts'
import {
  startSandboxServices,
  type SandboxServices
} from '../sandbox/services.ts'

// End to end over real HTTP: production composition and adapters against
// loopback stand-ins for WhatsApp, Whisper and the model. Synthetic data only.
const ANA = '5511900000001'
const GESTOR = '5511900000009'
const SECRET = 'segredo-sintetico-de-teste-123456'

let services: SandboxServices | undefined
let app: ShiftApp | undefined

afterEach(async () => {
  await app?.stop()
  await services?.close()
  app = undefined
  services = undefined
})

async function boot(provider: 'waha' | 'evolution', clock: () => Date) {
  services = await startSandboxServices()
  const config = loadShiftConfig({
    SHIFT_PROVIDER: provider,
    SHIFT_MEMBERS: `${ANA}=Dra Ana;${GESTOR}=Gestor*`,
    SHIFT_WEBHOOK_SECRET: SECRET,
    SHIFT_DATA_DIR: mkdtempSync(join(tmpdir(), 'shift-e2e-')),
    SHIFT_PORT: '0',
    SHIFT_HOST: '127.0.0.1',
    SHIFT_TICK_SECONDS: '3600',
    WAHA_URL: services.wahaUrl,
    WAHA_API_KEY: 'sandbox-waha-key',
    EVOLUTION_URL: services.evolutionUrl,
    EVOLUTION_API_KEY: 'sandbox-evolution-key',
    EVOLUTION_INSTANCE: 'cvg',
    WHISPER_URL: services.whisperUrl,
    LLM_BASE_URL: services.llmUrl,
    LLM_MODEL: 'sandbox',
    LLM_LOCATION: 'local'
  })
  app = composeShiftApp(config, { clock })
  const port = await app.start()
  const webhook = async (payload: unknown) => {
    const response = await fetch(
      `http://127.0.0.1:${port}/webhooks/${provider}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cvg-webhook-secret': SECRET
        },
        body: JSON.stringify(payload)
      }
    )
    await app!.assistant.idle()
    return (await response.json()) as { accepted: boolean }
  }
  return { services, app, webhook }
}

describe('Assistente de Plantão end to end', () => {
  it('runs the WAHA flow: audio note, paste text, task, reminder and done', async () => {
    let now = new Date('2026-10-01T17:00:00.000Z') // 14:00 in São Paulo
    const { services, app, webhook } = await boot('waha', () => now)
    const audio = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1])
    services.media.set('a1.oga', audio)
    services.transcripts.set(
      Buffer.from(audio).toString('hex'),
      'Thor do leito 3 vomitou duas vezes, pedi hemograma e bioquímico, vou ligar pro tutor às 16h'
    )

    expect(
      await webhook({
        event: 'message',
        payload: {
          id: 'a1',
          from: `${ANA}@c.us`,
          fromMe: false,
          body: '',
          hasMedia: true,
          media: {
            url: `${services.wahaUrl}/api/files/a1.oga`,
            mimetype: 'audio/ogg'
          }
        }
      })
    ).toEqual({ accepted: true })

    const reply = services.sent.at(-1)!
    expect(reply.to).toBe(ANA)
    expect(reply.text).toContain('Thor · ID não informado · leito 3')
    expect(reply.text).toContain('Exames solicitados: hemograma; bioquímico')
    expect(reply.text).toContain('#1 — Ligar pro tutor (Thor)')
    expect(app.store.openTasks(ANA)).toHaveLength(1)

    now = new Date('2026-10-01T19:00:00.000Z') // 16:00 local
    expect(await app.assistant.tick()).toBe(1)
    expect(services.sent.at(-1)?.text).toContain('⏰ Lembrete #1')

    await webhook({
      event: 'message',
      payload: { id: 'c1', from: `${ANA}@c.us`, fromMe: false, body: 'feito 1' }
    })
    expect(services.sent.at(-1)?.text).toContain('Pendência 1 concluída')
    expect(app.store.openTasks(ANA)).toHaveLength(0)
  })

  it('runs the Evolution flow with media fetched by message id', async () => {
    const { services, app, webhook } = await boot(
      'evolution',
      () => new Date('2026-10-01T17:00:00.000Z')
    )
    const audio = new Uint8Array([9, 9, 9])
    services.media.set('e1', audio)
    services.transcripts.set(
      Buffer.from(audio).toString('hex'),
      'Bob do leito 2 estável, vou trocar o curativo às 18h'
    )
    await webhook({
      event: 'messages.upsert',
      instance: 'cvg',
      data: {
        key: { id: 'e1', remoteJid: `${ANA}@s.whatsapp.net`, fromMe: false },
        message: { audioMessage: { mimetype: 'audio/ogg' } }
      }
    })
    expect(services.sent.at(-1)).toMatchObject({
      provider: 'evolution',
      to: ANA
    })
    expect(services.sent.at(-1)?.text).toContain(
      'Bob · ID não informado · leito 2'
    )
    expect(app.store.openTasks(ANA).at(0)?.description).toBe(
      'Trocar o curativo'
    )
  })

  it('guides a new admission with the template and returns tutor and reason', async () => {
    const { services, app, webhook } = await boot(
      'waha',
      () => new Date('2026-10-01T17:00:00.000Z')
    )
    await webhook({
      event: 'message',
      payload: {
        id: 't1',
        from: `${ANA}@c.us`,
        fromMe: false,
        body: 'novo paciente'
      }
    })
    expect(services.sent.at(-1)?.text).toContain('Novo paciente: <nome>')
    expect(services.llmCalls).toBe(0)

    await webhook({
      event: 'message',
      payload: {
        id: 't2',
        from: `${ANA}@c.us`,
        fromMe: false,
        body: 'Novo paciente: Rex, ID 48213, canino, leito 4, tutor João Silva. Motivo: atropelamento. Evolução: consciente, com dor. Pedi raio-x e hemograma. Vou reavaliar a dor às 22h.'
      }
    })
    const reply = services.sent.at(-1)!.text
    expect(reply).toContain('Rex · ID 48213 · canino · leito 4')
    expect(reply).toContain('Tutor: João Silva')
    expect(reply).toContain('Motivo da internação: atropelamento')
    expect(reply).toContain('Evolução: consciente, com dor')
    expect(reply).toContain('Exames solicitados: raio-x; hemograma')
    expect(reply).toContain('#1 — Reavaliar a dor (Rex · ID 48213)')
    expect(app.store.openTasks(ANA).at(0)).toMatchObject({
      patientId: '48213',
      description: 'Reavaliar a dor',
      dueAt: '2026-10-02T01:00:00.000Z'
    })
  })

  it('tells two patients with the same name apart by ID and bed', async () => {
    const { services, app, webhook } = await boot(
      'waha',
      () => new Date('2026-10-01T17:00:00.000Z')
    )
    const say = async (id: string, body: string) => {
      await webhook({
        event: 'message',
        payload: { id, from: `${ANA}@c.us`, fromMe: false, body }
      })
      return services.sent.at(-1)!.text
    }
    await say(
      'r1',
      'Novo paciente: Rex, ID 111, canino, leito 4. Motivo: atropelamento.'
    )
    await say(
      'r2',
      'Novo paciente: Rex, ID 222, canino, leito 7. Motivo: vômito.'
    )

    const byBed = await say(
      'r3',
      'Rex do leito 4 comeu bem, vou medicar às 18h'
    )
    expect(byBed).toContain('Rex · ID 111 · leito 4')
    expect(byBed).toContain(
      '🔎 ID 111 do Rex veio de uma nota anterior (leito 4); confira.'
    )
    expect(app.store.openTasks(ANA).at(-1)).toMatchObject({ patientId: '111' })

    const ambiguous = await say('r4', 'paciente Rex comeu bem')
    expect(ambiguous).toContain('Rex · ID não informado')
    expect(ambiguous).toContain('Há mais de um Rex:')
    expect(ambiguous).toContain('ID 111 (leito 4)')
    expect(ambiguous).toContain('ID 222 (leito 7)')
  })

  it('asks for the ID of a patient it has never seen', async () => {
    const { services, webhook } = await boot(
      'waha',
      () => new Date('2026-10-01T17:00:00.000Z')
    )
    await webhook({
      event: 'message',
      payload: {
        id: 'n1',
        from: `${ANA}@c.us`,
        fromMe: false,
        body: 'Thor do leito 3 estável'
      }
    })
    expect(services.sent.at(-1)?.text).toContain('Qual é o ID do Thor?')
  })

  it('asks for the patient name when it cannot tell who the note is about', async () => {
    const { services, webhook } = await boot(
      'waha',
      () => new Date('2026-10-01T17:00:00.000Z')
    )
    await webhook({
      event: 'message',
      payload: {
        id: 'q1',
        from: `${ANA}@c.us`,
        fromMe: false,
        body: 'tudo tranquilo'
      }
    })
    expect(services.sent.at(-1)?.text).toContain('Qual é o nome do paciente?')
  })

  it('ignores strangers and keeps the model out of the loop for commands', async () => {
    const { services, webhook } = await boot(
      'waha',
      () => new Date('2026-10-01T17:00:00.000Z')
    )
    expect(
      await webhook({
        event: 'message',
        payload: {
          id: 'x',
          from: '5511912345678@c.us',
          fromMe: false,
          body: 'oi'
        }
      })
    ).toEqual({ accepted: false })
    await webhook({
      event: 'message',
      payload: { id: 'h', from: `${ANA}@c.us`, fromMe: false, body: 'ajuda' }
    })
    expect(services.sent.at(-1)?.text).toContain(
      'Assistente de Plantão — como usar'
    )
    expect(services.llmCalls).toBe(0)
  })
})
