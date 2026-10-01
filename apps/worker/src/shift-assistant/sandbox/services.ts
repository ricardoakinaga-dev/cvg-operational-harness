import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * Loopback stand-ins for WAHA, Evolution, Whisper and an OpenAI-compatible
 * model. They speak the real HTTP contracts so the assistant runs end to end
 * with its production adapters. Synthetic data only; never used in production.
 */
export interface SentMessage {
  provider: 'waha' | 'evolution'
  to: string
  text: string
}

export interface SandboxServices {
  wahaUrl: string
  evolutionUrl: string
  whisperUrl: string
  llmUrl: string
  sent: SentMessage[]
  /** Audio bytes → transcript returned by the fake Whisper. */
  transcripts: Map<string, string>
  /** Media served by the fake WAHA at `${wahaUrl}/api/files/<name>`. */
  media: Map<string, Uint8Array>
  llmCalls: number
  close(): Promise<void>
}

async function body(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function json(status: number, value: unknown) {
  return { status, body: JSON.stringify(value) }
}

export async function startSandboxServices(): Promise<SandboxServices> {
  const state = {
    sent: [] as SentMessage[],
    transcripts: new Map<string, string>(),
    media: new Map<string, Uint8Array>(),
    llmCalls: 0
  }

  const waha = createServer((request, response) => {
    void (async () => {
      const raw = await body(request)
      const url = new URL(request.url ?? '/', 'http://x')
      if (request.headers['x-api-key'] !== 'sandbox-waha-key') {
        response.writeHead(401).end()
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/sendText') {
        const payload = JSON.parse(raw.toString('utf8')) as {
          chatId: string
          text: string
        }
        state.sent.push({
          provider: 'waha',
          to: payload.chatId.split('@')[0]!,
          text: payload.text
        })
        response
          .writeHead(201, { 'content-type': 'application/json' })
          .end('{}')
        return
      }
      const file = state.media.get(url.pathname.replace('/api/files/', ''))
      if (request.method === 'GET' && file) {
        response.writeHead(200, { 'content-type': 'audio/ogg' }).end(file)
        return
      }
      response.writeHead(404).end()
    })()
  })

  const evolution = createServer((request, response) => {
    void (async () => {
      const raw = await body(request)
      const url = new URL(request.url ?? '/', 'http://x')
      if (request.headers.apikey !== 'sandbox-evolution-key') {
        response.writeHead(401).end()
        return
      }
      if (
        request.method === 'POST' &&
        url.pathname.startsWith('/message/sendText/')
      ) {
        const payload = JSON.parse(raw.toString('utf8')) as {
          number: string
          text: string
        }
        state.sent.push({
          provider: 'evolution',
          to: payload.number,
          text: payload.text
        })
        response
          .writeHead(201, { 'content-type': 'application/json' })
          .end('{}')
        return
      }
      if (url.pathname.startsWith('/chat/getBase64FromMediaMessage/')) {
        const payload = JSON.parse(raw.toString('utf8')) as {
          message: { key: { id: string } }
        }
        const file = state.media.get(payload.message.key.id)
        const reply = file
          ? json(200, {
              base64: Buffer.from(file).toString('base64'),
              mimetype: 'audio/ogg'
            })
          : json(404, {})
        response
          .writeHead(reply.status, { 'content-type': 'application/json' })
          .end(reply.body)
        return
      }
      response.writeHead(404).end()
    })()
  })

  const whisper = createServer((request, response) => {
    void (async () => {
      if (
        request.method !== 'POST' ||
        request.url !== '/v1/audio/transcriptions'
      ) {
        response.writeHead(404).end()
        return
      }
      const form = await new Request('http://x', {
        method: 'POST',
        headers: { 'content-type': request.headers['content-type'] ?? '' },
        body: new Uint8Array(await body(request))
      }).formData()
      const file = form.get('file')
      const bytes =
        file instanceof Blob
          ? Buffer.from(await file.arrayBuffer()).toString('hex')
          : ''
      const text = state.transcripts.get(bytes) ?? ''
      response
        .writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ text }))
    })()
  })

  const llm = createServer((request, response) => {
    void (async () => {
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
        response.writeHead(404).end()
        return
      }
      state.llmCalls += 1
      const payload = JSON.parse((await body(request)).toString('utf8')) as {
        messages: Array<{ role: string; content: string }>
      }
      const user = payload.messages.at(-1)?.content ?? ''
      const organized = sandboxOrganize(user)
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          choices: [
            {
              message: { content: JSON.stringify(organized) },
              finish_reason: 'stop'
            }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10 }
        })
      )
    })()
  })

  const [wahaUrl, evolutionUrl, whisperUrl, llmUrl] = await Promise.all([
    listen(waha),
    listen(evolution),
    listen(whisper),
    listen(llm)
  ])

  return {
    wahaUrl,
    evolutionUrl,
    whisperUrl,
    llmUrl: `${llmUrl}/v1`,
    sent: state.sent,
    transcripts: state.transcripts,
    media: state.media,
    get llmCalls() {
      return state.llmCalls
    },
    async close() {
      await Promise.all(
        [waha, evolution, whisper, llm].map(
          (server) =>
            new Promise<void>((resolve) => server.close(() => resolve()))
        )
      )
    }
  }
}

/**
 * A tiny rule-based stand-in for the model, enough for the demo phrases:
 * "<Nome> do leito <n> ...", "pedi <exames>", "<verbo> ... às <h>h".
 */
export function sandboxOrganize(message: string) {
  const note = message.split('Anotação:\n').at(-1) ?? message
  const now =
    /Momento atual: (\d{4}-\d{2}-\d{2})/.exec(message)?.[1] ?? '2026-10-01'
  const patient = /([A-ZÁÉÍÓÚ][a-záéíóúãõç]+) do leito (\d+)/.exec(note)
  const exams = /pedi ([^,.]+)/.exec(note)?.[1]
  const promise = /(vou [^,.]+?) (?:às|as) (\d{1,2})h/.exec(note)
  const evolution = note
    .replace(/,? ?pedi [^,.]+/, '')
    .replace(/,? ?vou [^,.]+/, '')
    .replace(/^[^,]+do leito \d+,? ?/, '')
    .trim()
  return {
    pacientes: patient
      ? [
          {
            nome: patient[1],
            leito: patient[2],
            especie: null,
            evolucao: evolution || null,
            exames_pedidos: exams
              ? exams.split(/ e |, /).map((exam) => exam.trim())
              : [],
            condutas: []
          }
        ]
      : [],
    pendencias: promise
      ? [
          {
            descricao: promise[1]!
              .replace(/^vou /, '')
              .replace(/^./, (c) => c.toUpperCase()),
            paciente: patient?.[1] ?? null,
            quando: `${now}T${promise[2]!.padStart(2, '0')}:00:00-03:00`
          }
        ]
      : [],
    duvidas: patient ? [] : ['Qual paciente?']
  }
}
