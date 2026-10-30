import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ShiftAssistant, type ShiftAssistantOptions } from '../../assistant.ts'
import { parseMembers, type Member, type Organized } from '../../domain.ts'
import { allowlistedFetch } from '../../egress.ts'
import { ShiftStore } from '../../store.ts'
import { WahaClient } from '../../whatsapp.ts'

// AUD-0621 regression support. Synthetic data only: fictitious phones,
// patients and tutors; no provider, channel or model is ever contacted.
export const ANA = '5511900000001'
export const BRUNO = '5511900000002'
export const GESTOR = '5511900000009'
export const MEMBERS = parseMembers(
  `${ANA}=Dra Ana;${BRUNO}=Dr Bruno;${GESTOR}=Gestor*`
)
export const WAHA = 'http://waha.local:3000'

export const THOR: Organized = {
  pacientes: [
    {
      nome: 'Thor',
      leito: '3',
      especie: 'canino',
      evolucao: 'Vomitou duas vezes',
      exames_pedidos: [],
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

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `shift-aud0621-${prefix}-`))
}

export function wahaPayload(
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

export interface SentText {
  to: string
  text: string
}

/**
 * WAHA client over an in-process fetch. `onSend` may delay or fail a send to
 * model a slow, hung or failing channel.
 */
export function fakeWaha(
  onSend?: (entry: SentText) => Promise<Response | void> | Response | void,
  onMedia?: () => Response | undefined
) {
  const sent: SentText[] = []
  const fetchImpl = async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/sendText')) {
      const body = JSON.parse(String(init?.body)) as {
        chatId: string
        text: string
      }
      const entry = { to: body.chatId.split('@')[0]!, text: body.text }
      sent.push(entry)
      const custom = await onSend?.(entry)
      return custom ?? new Response('{}', { status: 201 })
    }
    if (url.startsWith(`${WAHA}/api/files/`)) {
      const custom = onMedia?.()
      if (custom) return custom
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
    sent.filter((entry) => entry.to === phone).map((entry) => entry.text)
  return { client, sent, textsTo }
}

export interface SetupOptions {
  dataDir?: string
  store?: ShiftStore
  members?: Member[]
  organize?: (text: string) => Promise<Organized>
  transcribe?: () => Promise<string>
  onSend?: (entry: SentText) => Promise<Response | void> | Response | void
  /** Replaces the WAHA media download response (undefined keeps the default). */
  onMedia?: () => Response | undefined
  start?: Date
  extra?: Partial<ShiftAssistantOptions>
}

export function setup(options: SetupOptions = {}) {
  let now = options.start ?? new Date('2026-09-30T18:00:00.000Z') // 15:00 SP
  const clock = () => now
  const waha = fakeWaha(options.onSend, options.onMedia)
  const store = options.store ?? new ShiftStore(options.dataDir)
  const organizerCalls: string[] = []
  const assistant = new ShiftAssistant({
    store,
    members: options.members ?? MEMBERS,
    whatsapp: waha.client,
    transcriber: {
      transcribe: options.transcribe ?? (async () => 'transcrição sintética')
    },
    organizer: {
      organize: async (text) => {
        organizerCalls.push(text)
        return options.organize ? options.organize(text) : THOR
      }
    },
    clock,
    ...(options.extra ?? {})
  })
  const deliver = async (payload: unknown) => {
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
    deliver,
    now: () => now,
    advance(minutes: number) {
      now = new Date(now.getTime() + minutes * 60_000)
    }
  }
}
