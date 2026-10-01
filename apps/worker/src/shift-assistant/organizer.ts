import { createHash, randomUUID } from 'node:crypto'
import type { ModelProvider } from '@cvg/model-gateway'
import { OrganizedSchema, type Organized } from './domain.ts'

export interface Organizer {
  organize(text: string, now: Date): Promise<Organized>
}

export const ORGANIZER_PROMPT = `Você organiza anotações de plantão de um hospital veterinário.
Recebe a fala ou o texto de um plantonista e devolve SOMENTE um objeto JSON com:
{
  "pacientes": [{"nome": "...", "id": "...|null", "leito": "...|null", "especie": "...|null",
                 "tutor": "...|null", "motivo": "...|null",
                 "evolucao": "...|null", "exames_pedidos": ["..."], "condutas": ["..."]}],
  "pendencias": [{"descricao": "...", "paciente": "...|null", "quando": "AAAA-MM-DDTHH:MM:SS-03:00|null"}],
  "duvidas": ["..."]
}
Regras:
- Use apenas o que foi dito. Não invente diagnóstico, dose, valor, exame ou horário.
- Copie números, doses e valores exatamente como foram ditos.
- "motivo" só para paciente novo ou internação: o motivo da internação dito pelo plantonista.
- "tutor" só quando o nome do tutor foi dito.
- "id" é o número do paciente no HIS (ID, ficha ou prontuário); copie exatamente como foi dito e use null se não foi dito. Nunca invente ou deduza um ID.
- "pendencias" são coisas que o plantonista disse que ainda vai fazer ou que ficaram por fazer.
- "quando" só quando um horário foi dito; converta para data e hora completas usando o momento atual informado.
- Se o paciente ou algo importante estiver ambíguo, registre uma pergunta curta em "duvidas".
- Não dê conselho clínico.`

/**
 * Organizes text with an external model that has no tools: it can only
 * return JSON, which is validated here. The service decides what happens.
 */
export class ModelOrganizer implements Organizer {
  readonly #provider: ModelProvider
  readonly #model: string
  readonly #timeoutMs: number

  constructor(provider: ModelProvider, model: string, timeoutMs = 60_000) {
    this.#provider = provider
    this.#model = model
    this.#timeoutMs = timeoutMs
  }

  async organize(text: string, now: Date): Promise<Organized> {
    const result = await this.#provider.execute({
      requestId: randomUUID(),
      tenantId: 'cvg',
      correlationId: randomUUID(),
      model: this.#model,
      input: {
        system: ORGANIZER_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Momento atual: ${formatLocalIso(now)}\n\nAnotação:\n${text}`
          }
        ]
      },
      temperature: 0,
      maxTokens: 1500,
      promptSha256: createHash('sha256').update(ORGANIZER_PROMPT).digest('hex'),
      structuredSchemaName: 'shift_note',
      signal: AbortSignal.timeout(this.#timeoutMs),
      timeoutMs: this.#timeoutMs
    })
    return OrganizedSchema.parse(JSON.parse(stripFences(result.text)))
  }
}

function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
}

/** Brazil has had a fixed UTC-03:00 offset since 2019. */
export function formatLocalIso(date: Date): string {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000)
  return `${local.toISOString().slice(0, 19)}-03:00`
}

export function formatLocalTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(iso))
}

/**
 * Numbers in the organized output that never appear in the source text are
 * flagged for the vet to check (doses, values, beds).
 */
export function unverifiedNumbers(
  organized: Organized,
  source: string
): string[] {
  const sourceNumbers = new Set(numbersIn(source))
  const output = [
    ...organized.pacientes.flatMap((patient) => [
      patient.id ?? '',
      patient.leito ?? '',
      patient.motivo ?? '',
      patient.evolucao ?? '',
      ...patient.exames_pedidos,
      ...patient.condutas
    ]),
    ...organized.pendencias.map((task) => task.descricao)
  ].join(' ')
  return [...new Set(numbersIn(output))].filter(
    (value) => !sourceNumbers.has(value)
  )
}

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((value) =>
    value.replace(',', '.')
  )
}
