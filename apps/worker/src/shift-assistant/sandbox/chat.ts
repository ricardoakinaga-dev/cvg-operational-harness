import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { composeShiftApp } from '../compose.ts'
import { loadShiftConfig } from '../config.ts'
import { startSandboxServices } from './services.ts'

/**
 * Interactive test of the assistant in the terminal: type as if you were on
 * WhatsApp. Uses the real assistant with loopback stand-ins for WhatsApp and
 * Whisper. The model is a simple offline stand-in unless LLM_BASE_URL,
 * LLM_API_KEY and LLM_MODEL are set, in which case the real model is used.
 *
 *   npx tsx apps/worker/src/shift-assistant/sandbox/chat.ts
 *
 * Fictitious data only: do not type real patient or tutor data in tests.
 */
const ME = '5511900000001'
const MANAGER = '5511900000009'
const SECRET = 'segredo-sintetico-do-modo-conversa'

const HELP = `
Digite como se fosse no WhatsApp. Exemplos:
  novo paciente            → mostra o modelo para internação nova
  Novo paciente: Rex, canino, leito 4, tutor João Silva. Motivo: atropelamento. Evolução: consciente, com dor. Pedi raio-x e hemograma. Vou reavaliar a dor às 22h.
  Thor do leito 3 vomitou duas vezes, pedi hemograma, vou ligar pro tutor às 16h
  pendências | feito 1 | adiar 1 30 | ok | corrigir <texto> | ajuda

Comandos do teste (começam com /):
  /audio <o que você falaria>   simula um áudio (passa pela transcrição)
  /foto <legenda>               simula uma foto com legenda
  /avancar 2h | /avancar 30     avança o relógio e dispara os lembretes vencidos
  /gestor <mensagem>            envia como gestor (ex.: /gestor pausar assistente)
  /hora                         mostra a hora simulada
  /sair                         encerra
`

async function main(): Promise<void> {
  const services = await startSandboxServices()
  const realModel = Boolean(
    process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL
  )
  const dataDir = mkdtempSync(join(tmpdir(), 'cvg-shift-chat-'))
  let now = new Date()
  const config = loadShiftConfig({
    SHIFT_PROVIDER: 'waha',
    SHIFT_MEMBERS: `${ME}=Você (teste);${MANAGER}=Gestor (teste)*`,
    SHIFT_WEBHOOK_SECRET: SECRET,
    SHIFT_DATA_DIR: dataDir,
    SHIFT_PORT: '0',
    SHIFT_HOST: '127.0.0.1',
    SHIFT_TICK_SECONDS: '3600',
    WAHA_URL: services.wahaUrl,
    WAHA_API_KEY: 'sandbox-waha-key',
    WHISPER_URL: services.whisperUrl,
    ...(realModel
      ? {
          LLM_BASE_URL: process.env.LLM_BASE_URL,
          LLM_API_KEY: process.env.LLM_API_KEY,
          LLM_MODEL: process.env.LLM_MODEL,
          LLM_LOCATION: 'external'
        }
      : {
          LLM_BASE_URL: services.llmUrl,
          LLM_MODEL: 'sandbox',
          LLM_LOCATION: 'local'
        })
  })
  const app = composeShiftApp(config, { clock: () => now })
  const port = await app.start()
  let shown = 0
  let counter = 0

  const flush = () => {
    for (const message of services.sent.slice(shown)) {
      const who = message.to === MANAGER ? '🤖 → Gestor' : '🤖 Assistente'
      console.log(`\n${who}:\n${indent(message.text)}\n`)
    }
    shown = services.sent.length
  }

  const send = async (from: string, payload: Record<string, unknown>) => {
    counter += 1
    await fetch(`http://127.0.0.1:${port}/webhooks/waha`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cvg-webhook-secret': SECRET
      },
      body: JSON.stringify({
        event: 'message',
        payload: {
          id: `chat-${counter}`,
          from: `${from}@c.us`,
          fromMe: false,
          body: '',
          ...payload
        }
      })
    })
    await app.assistant.idle()
    flush()
  }

  const media = (kind: 'audio' | 'image', content: string) => {
    const name = `chat-${counter + 1}.${kind === 'audio' ? 'oga' : 'jpg'}`
    const bytes = new TextEncoder().encode(`${name}:${content}`)
    services.media.set(name, bytes)
    if (kind === 'audio') {
      services.transcripts.set(Buffer.from(bytes).toString('hex'), content)
    }
    return {
      body: kind === 'image' ? content : '',
      hasMedia: true,
      media: {
        url: `${services.wahaUrl}/api/files/${name}`,
        mimetype: kind === 'audio' ? 'audio/ogg' : 'image/jpeg'
      }
    }
  }

  console.log('=== Assistente de Plantão — modo conversa (dados fictícios) ===')
  console.log(
    realModel
      ? `Modelo: real (${process.env.LLM_MODEL}).`
      : 'Modelo: simulado (entende o modelo "novo paciente" e frases como "Thor do leito 3 ..."). Para usar o modelo real, defina LLM_BASE_URL, LLM_API_KEY e LLM_MODEL.'
  )
  console.log(HELP)

  const handle = async (line: string): Promise<void> => {
    if (!line) return
    if (line === '/ajuda-teste' || line === '/help') {
      console.log(HELP)
    } else if (line === '/hora') {
      console.log(
        `Hora simulada: ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
      )
    } else if (line.startsWith('/audio ')) {
      await send(ME, media('audio', line.slice(7).trim()))
    } else if (line.startsWith('/foto')) {
      await send(ME, media('image', line.slice(5).trim()))
    } else if (line.startsWith('/gestor ')) {
      await send(MANAGER, { body: line.slice(8).trim() })
    } else if (line.startsWith('/avancar')) {
      const match = /^\/avancar\s+(\d+)\s*(h|min|m)?$/i.exec(line)
      if (!match) {
        console.log('Use: /avancar 2h ou /avancar 30')
        return
      }
      const minutes =
        Number(match[1]) * (match[2]?.toLowerCase() === 'h' ? 60 : 1)
      now = new Date(now.getTime() + minutes * 60_000)
      const sent = await app.assistant.tick()
      console.log(
        `⏩ Relógio: ${now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })} — ${sent} lembrete(s) enviados`
      )
      flush()
    } else if (line.startsWith('/')) {
      console.log('Comando de teste desconhecido. Digite /ajuda-teste.')
    } else {
      await send(ME, { body: line })
    }
  }

  const input = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY === true
  })
  input.setPrompt('👩‍⚕️ Você: ')
  // Lines are queued as they arrive and handled in order, so pasted or piped
  // text is not lost while a previous message is still being processed.
  const queue: string[] = []
  let closed = false
  let wake: (() => void) | undefined
  input.on('line', (line) => {
    queue.push(line)
    wake?.()
  })
  input.on('close', () => {
    closed = true
    wake?.()
  })
  input.prompt()
  try {
    for (;;) {
      const raw = queue.shift()
      if (raw === undefined) {
        if (closed) break
        await new Promise<void>((resolve) => (wake = resolve))
        continue
      }
      const line = raw.trim()
      if (!process.stdin.isTTY && line) console.log(line)
      if (line === '/sair') break
      await handle(line)
      if (!closed) input.prompt()
    }
  } finally {
    input.close()
    console.log(`\nRegistro desta conversa: ${dataDir}/events.jsonl`)
    await app.stop()
    await services.close()
  }
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `   ${line}`)
    .join('\n')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
