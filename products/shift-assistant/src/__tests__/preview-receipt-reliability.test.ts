// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Organized } from '../domain.ts'
import {
  ANA,
  setup,
  type SetupOptions,
  THOR,
  wahaPayload
} from './support/harness.ts'

// AUD0625 F13 (SPEC 0283, over SPEC 0179 sections 3-4): a confirmation must
// be bound to a preview whose every part the channel accepted, and the values
// of the draft must belong to the patient, field and unit of the source.
// Synthetic data only; no provider, channel or model is contacted.
//
// Slice 1 (receipt and token) is in force. `red` still marks the association
// fidelity defects of slice 2: `it.fails` passes while the defect is present
// and turns red when it is fixed, so the fix must drop the marker. With
// F13_RAW=1 the same bodies run as plain tests and print the failing assertion.
const red = process.env.F13_RAW === '1' ? it : it.fails

const PARTS_LIMIT = 32 * 1024

function longOrganized(patients: number, fill: string): Organized {
  return {
    pacientes: Array.from({ length: patients }, (_, index) => ({
      nome: `Paciente${index + 1}`,
      id: String(1000 + index),
      leito: String(index + 1),
      evolucao: fill.repeat(4000),
      exames_pedidos: [],
      condutas: Array.from({ length: 5 }, () => fill.repeat(500))
    })),
    pendencias: [],
    duvidas: []
  }
}

const SWAP_DOSES: Organized = {
  pacientes: [
    {
      nome: 'Alfa',
      id: '301',
      leito: '1',
      exames_pedidos: [],
      condutas: ['dipirona 2 mg']
    },
    {
      nome: 'Beta',
      id: '302',
      leito: '2',
      exames_pedidos: [],
      condutas: ['dipirona 1 mg']
    }
  ],
  pendencias: [],
  duvidas: []
}

const SOURCE_DOSES =
  'Alfa ID 301 leito 1 dipirona 1 mg. Beta ID 302 leito 2 dipirona 2 mg.'

async function draftThenOk(options: SetupOptions, source: string) {
  const env = setup(options)
  await env.deliver(wahaPayload('m1', ANA, source))
  // The store hands out live objects: snapshot the draft before "ok".
  const found = env.store.lastActiveNote(ANA)
  const draft = found ? structuredClone(found) : undefined
  await env.deliver(wahaPayload('ok1', ANA, 'ok'))
  return { env, draft, after: env.store.lastActiveNote(ANA) }
}

describe('F13 controls: what already holds on the current code', () => {
  it('confirms a draft whose preview the channel accepted', async () => {
    const { env, draft, after } = await draftThenOk({}, 'Thor leito 3')
    expect(draft?.confirmed).toBe(false)
    expect(after?.confirmed).toBe(true)
    expect(env.store.openTasks(ANA)).toHaveLength(1)
  })

  it('confirms an association faithful to the source', async () => {
    const faithful: Organized = {
      ...SWAP_DOSES,
      pacientes: [
        { ...SWAP_DOSES.pacientes[0]!, condutas: ['dipirona 1 mg'] },
        { ...SWAP_DOSES.pacientes[1]!, condutas: ['dipirona 2 mg'] }
      ]
    }
    const { after } = await draftThenOk(
      { organize: async () => faithful },
      SOURCE_DOSES
    )
    expect(after?.confirmed).toBe(true)
  })

  it('records the refused preview send, so the failure is observable', async () => {
    const env = setup({
      onSend: () => new Response('unavailable', { status: 503 })
    })
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    expect(env.waha.textsTo(ANA)).toHaveLength(1) // attempted, refused
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(false)
  })
})

describe('F13 preview receipt: no confirmation without a presented preview', () => {
  it('refuses "ok" when the channel refused the preview', async () => {
    const { env, draft, after } = await draftThenOk(
      { onSend: () => new Response('unavailable', { status: 503 }) },
      'Thor leito 3'
    )
    expect(env.waha.textsTo(ANA)).toHaveLength(2) // preview + the refusal reply
    expect(draft?.confirmed).toBe(false)
    expect(after?.confirmed).toBe(false)
    expect(env.store.openTasks(ANA)).toHaveLength(0)
  })

  it('refuses "ok" when the preview send outcome is uncertain', async () => {
    const { env, after } = await draftThenOk(
      {
        onSend: () => {
          throw new Error('connection reset after the request was written')
        }
      },
      'Thor leito 3'
    )
    expect(env.waha.sent.length).toBeGreaterThan(0)
    expect(after?.confirmed).toBe(false)
    expect(env.store.openTasks(ANA)).toHaveLength(0)
  })

  it('refuses "ok" when only the first part of a long preview arrived', async () => {
    let calls = 0
    const { env, after } = await draftThenOk(
      {
        organize: async () => longOrganized(10, 'a'),
        onSend: () => {
          calls += 1
          if (calls === 2) return new Response('unavailable', { status: 503 })
        }
      },
      'Dez pacientes sintéticos'
    )
    expect(env.waha.sent[0]!.text.length).toBeGreaterThan(0)
    expect(env.waha.sent.length).toBeGreaterThan(2) // part 1, part 2 (refused), ...
    expect(after?.confirmed).toBe(false)
  })

  it('refuses "ok" when the preview was cut by the part limit', async () => {
    const { env, after } = await draftThenOk(
      { organize: async () => longOrganized(20, 'b') },
      'Vinte pacientes sintéticos'
    )
    const sent = env.waha.textsTo(ANA).slice(0, 4).join('')
    expect(sent).toContain('texto longo; a nota completa ficou guardada')
    expect(sent.length).toBeGreaterThan(PARTS_LIMIT)
    expect(after?.confirmed).toBe(false)
  })

  it('shows the revision token (note, revision, content hash)', async () => {
    const env = setup()
    await env.deliver(wahaPayload('m1', ANA, 'Thor leito 3'))
    const preview = env.waha.textsTo(ANA).at(-1) ?? ''
    // SPEC 0179 section 3: <noteId curto>-r<revision>-<hash curto>.
    expect(preview).toMatch(/ok nota [0-9a-f]{8}-r1-[0-9a-f]{8}\b/)
  })
})

describe('F13 association fidelity: values keep patient, field and unit', () => {
  red(
    'blocks a dose swapped between two patients with the same numbers',
    async () => {
      const { env, draft, after } = await draftThenOk(
        { organize: async () => SWAP_DOSES },
        SOURCE_DOSES
      )
      // Both numbers (1 and 2) exist in the source, so the set check is silent.
      expect(draft?.unverifiedNumbers).toEqual([])
      expect(draft?.blockingIssues?.length ?? 0).toBeGreaterThan(0)
      expect(after?.confirmed).toBe(false)
      expect(env.store.openTasks(ANA)).toHaveLength(0)
    }
  )

  red('blocks a value whose unit differs from the source', async () => {
    const wrongUnit: Organized = {
      pacientes: [
        {
          nome: 'Thor',
          id: '401',
          leito: '3',
          exames_pedidos: [],
          condutas: ['soro 500 mg']
        }
      ],
      pendencias: [],
      duvidas: []
    }
    const { draft, after } = await draftThenOk(
      { organize: async () => wrongUnit },
      'Thor ID 401 leito 3 soro 500 mL'
    )
    expect(draft?.unverifiedNumbers).toEqual([])
    expect(draft?.blockingIssues?.length ?? 0).toBeGreaterThan(0)
    expect(after?.confirmed).toBe(false)
  })

  red('blocks two measurements assigned to each other fields', async () => {
    const swappedFields: Organized = {
      pacientes: [
        {
          ...THOR.pacientes[0]!,
          id: '402',
          evolucao: 'Temperatura 120, frequência cardíaca 38,5'
        }
      ],
      pendencias: [],
      duvidas: []
    }
    const { draft, after } = await draftThenOk(
      { organize: async () => swappedFields },
      'Thor ID 402 leito 3 temperatura 38,5 e frequência cardíaca 120'
    )
    expect(draft?.unverifiedNumbers).toEqual([])
    expect(draft?.blockingIssues?.length ?? 0).toBeGreaterThan(0)
    expect(after?.confirmed).toBe(false)
  })
})
