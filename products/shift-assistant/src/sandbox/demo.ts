import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { composeShiftApp } from '../compose.ts'
import { loadShiftConfig } from '../config.ts'
import { startSandboxServices } from './services.ts'

/**
 * Demonstration with no configuration: the real assistant (same composition
 * as production) against loopback stand-ins for WhatsApp, Whisper and the
 * model. Fictitious patients and phones only.
 *
 *   npx tsx apps/worker/src/shift-assistant/sandbox/demo.ts
 */
const ANA = '5511900000001'
const SECRET = 'segredo-sintetico-da-demonstracao'

async function main(): Promise<void> {
  const services = await startSandboxServices()
  const dataDir = mkdtempSync(join(tmpdir(), 'cvg-shift-demo-'))
  let now = new Date()
  now.setUTCHours(17, 0, 0, 0) // 14:00 in São Paulo
  const config = loadShiftConfig({
    SHIFT_PROVIDER: 'waha',
    SHIFT_MEMBERS: `${ANA}=Dra Ana (fictícia);5511900000009=Gestor*`,
    SHIFT_WEBHOOK_SECRET: SECRET,
    SHIFT_DATA_DIR: dataDir,
    SHIFT_PORT: '0',
    SHIFT_HOST: '127.0.0.1',
    SHIFT_TICK_SECONDS: '3600',
    WAHA_URL: services.wahaUrl,
    WAHA_API_KEY: 'sandbox-waha-key',
    WHISPER_URL: services.whisperUrl,
    LLM_BASE_URL: services.llmUrl,
    LLM_MODEL: 'sandbox',
    LLM_LOCATION: 'local'
  })
  const app = composeShiftApp(config, { clock: () => now })
  const port = await app.start()
  let shown = 0

  const flush = () => {
    for (const message of services.sent.slice(shown)) {
      console.log(`\n🤖 Assistente:\n${indent(message.text)}`)
    }
    shown = services.sent.length
  }
  const say = async (label: string, payload: Record<string, unknown>) => {
    console.log(`\n👩‍⚕️ Dra Ana: ${label}`)
    await fetch(`http://127.0.0.1:${port}/webhooks/waha`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cvg-webhook-secret': SECRET
      },
      body: JSON.stringify({
        event: 'message',
        payload: { from: `${ANA}@c.us`, fromMe: false, ...payload }
      })
    })
    await app.assistant.idle()
    flush()
  }

  console.log('=== Assistente de Plantão — demonstração (dados fictícios) ===')
  const audio = new Uint8Array([1, 2, 3, 4])
  services.media.set('audio-1.oga', audio)
  services.transcripts.set(
    Buffer.from(audio).toString('hex'),
    'Thor do leito 3 vomitou duas vezes e está prostrado, pedi hemograma e bioquímico, vou ligar pro tutor às 16h'
  )
  await say('🎤 (áudio de 20 segundos no corredor)', {
    id: 'm1',
    body: '',
    hasMedia: true,
    media: {
      url: `${services.wahaUrl}/api/files/audio-1.oga`,
      mimetype: 'audio/ogg'
    }
  })
  await say('Mel do leito 5 comeu bem, vou reavaliar a ferida às 18h', {
    id: 'm2',
    body: 'Mel do leito 5 comeu bem, vou reavaliar a ferida às 18h'
  })
  await say('pendências', { id: 'm3', body: 'pendências' })

  console.log('\n… duas horas depois (16:00) …')
  now = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  await app.assistant.tick()
  flush()

  await say('feito 1', { id: 'm4', body: 'feito 1' })
  await say('adiar 2 30', { id: 'm5', body: 'adiar 2 30' })

  console.log(
    `\nRegistro de eventos (documento, decisão D4): ${dataDir}/events.jsonl`
  )
  await app.stop()
  await services.close()
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
