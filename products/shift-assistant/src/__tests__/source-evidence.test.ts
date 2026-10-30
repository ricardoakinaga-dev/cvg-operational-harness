// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Organized } from '../domain.ts'
import { checkAssociation, fold } from '../source-evidence.ts'
import { ANA, setup, wahaPayload } from './support/harness.ts'

// AUD0625 F13 slice 2 (SPEC 0283 section 5): values keep patient, field and
// unit. Synthetic data only.

function patient(
  nome: string,
  extra: Partial<Organized['pacientes'][number]> = {}
): Organized['pacientes'][number] {
  return { nome, exames_pedidos: [], condutas: [], ...extra }
}

function note(
  pacientes: Organized['pacientes'],
  pendencias: Organized['pendencias'] = []
): Organized {
  return { pacientes, pendencias, duvidas: [] }
}

const codes = (rawText: string, organized: Organized) =>
  checkAssociation(rawText, organized).map((issue) => issue.code)

describe('F13 slice 2: faithful associations pass', () => {
  it('accepts each value in the block of its own patient', () => {
    const source =
      'Alfa ID 301 dipirona 1 mg. Beta ID 302 dipirona 2 mg. Gama ID 303 dipirona 1 mg.'
    const organized = note([
      patient('Alfa', { id: '301', condutas: ['dipirona 1 mg'] }),
      patient('Beta', { id: '302', condutas: ['dipirona 2 mg'] }),
      patient('Gama', { id: '303', condutas: ['dipirona 1 mg'] })
    ])
    expect(codes(source, organized)).toEqual([])
  })

  it('accepts a measurement under its label, with or without a unit', () => {
    const source =
      'Thor ID 5 temperatura 38,5 graus e frequência cardíaca 120 bpm, peso 12 kg'
    const organized = note([
      patient('Thor', {
        id: '5',
        evolucao: 'Temperatura 38,5; FC 120 bpm; peso 12 kg'
      })
    ])
    expect(codes(source, organized)).toEqual([])
  })

  it('ignores numbers with neither unit nor measurement label (IDs, beds)', () => {
    const organized = note([patient('Thor', { id: '77', leito: '3' })])
    expect(codes('Thor ID 77 leito 3', organized)).toEqual([])
  })

  it('accepts a task of the only patient without a name', () => {
    const organized = note(
      [patient('Thor')],
      [{ descricao: 'Repetir glicemia às 16h', paciente: null }]
    )
    expect(codes('Thor, repetir glicemia às 16h', organized)).toEqual([])
  })

  it('folds case and accents without moving offsets', () => {
    const text = 'Ação ÉÇ Thor 5 MG'
    expect(fold(text)).toHaveLength(text.length)
    expect(
      codes(
        'THOR dipirona 5 MG',
        note([patient('thor', { condutas: ['dipirona 5 mg'] })])
      )
    ).toEqual([])
  })
})

describe('F13 slice 2: unfaithful associations are blocking issues', () => {
  it('flags a value that exists only in another patient block', () => {
    const organized = note([
      patient('Alfa', { id: '301', condutas: ['dipirona 2 mg'] }),
      patient('Beta', { id: '302', condutas: ['dipirona 1 mg'] })
    ])
    const issues = checkAssociation(
      'Alfa ID 301 dipirona 1 mg. Beta ID 302 dipirona 2 mg.',
      organized
    )
    expect(issues.map((issue) => issue.code)).toEqual([
      'VALUE_PATIENT_MISMATCH',
      'VALUE_PATIENT_MISMATCH'
    ])
    expect(issues[0]).toMatchObject({
      patient: 'Alfa',
      output: '2 mg',
      path: 'pacientes[0].condutas[0]'
    })
    expect(issues[0]!.source).toContain('2 mg')
    expect(issues[0]!.message).toContain('VALUE_PATIENT_MISMATCH')
  })

  it('flags a different unit for the same number', () => {
    const organized = note([patient('Thor', { condutas: ['soro 500 mg'] })])
    expect(codes('Thor soro 500 mL', organized)).toEqual([
      'VALUE_UNIT_MISMATCH'
    ])
  })

  it('flags a measurement moved to another field', () => {
    const organized = note([
      patient('Thor', {
        evolucao: 'Temperatura 120, frequência cardíaca 38,5'
      })
    ])
    expect(
      codes('Thor temperatura 38,5 e frequência cardíaca 120', organized)
    ).toEqual(['VALUE_FIELD_MISMATCH', 'VALUE_FIELD_MISMATCH'])
  })

  it('flags a value the source never says', () => {
    const organized = note([patient('Thor', { condutas: ['dipirona 25 mg'] })])
    expect(codes('Thor leito 3', organized)).toEqual(['UNSOURCED_VALUE'])
  })

  it('keeps the scale: 1,0 is not 1', () => {
    const organized = note([patient('Thor', { condutas: ['soro 1,0 ml'] })])
    expect(codes('Thor soro 1 ml', organized)).toEqual(['UNSOURCED_VALUE'])
  })

  it('does not convert units', () => {
    const organized = note([patient('Thor', { condutas: ['dipirona 0,5 g'] })])
    expect(codes('Thor dipirona 500 mg', organized)).toEqual([
      'UNSOURCED_VALUE'
    ])
  })

  it('blocks a value of a patient the source does not locate', () => {
    const organized = note([patient('Thor', { condutas: ['dipirona 5 mg'] })])
    expect(codes('dipirona 5 mg para o cachorro', organized)).toEqual([
      'SOURCE_ASSOCIATION_AMBIGUOUS'
    ])
  })

  it('blocks homonyms told apart by no ID', () => {
    const organized = note([
      patient('Rex', { condutas: ['dipirona 5 mg'] }),
      patient('Rex', { condutas: ['soro 20 ml'] })
    ])
    expect(codes('Rex dipirona 5 mg; Rex soro 20 ml', organized)).toEqual([
      'SOURCE_ASSOCIATION_AMBIGUOUS',
      'SOURCE_ASSOCIATION_AMBIGUOUS'
    ])
  })

  it('tells homonyms apart by ID', () => {
    const organized = note([
      patient('Rex', { id: '101', condutas: ['dipirona 5 mg'] }),
      patient('Rex', { id: '202', condutas: ['soro 20 ml'] })
    ])
    expect(
      codes('Rex ID 101 dipirona 5 mg; Rex ID 202 soro 20 ml', organized)
    ).toEqual([])
    const swapped = note([
      patient('Rex', { id: '101', condutas: ['soro 20 ml'] }),
      patient('Rex', { id: '202', condutas: ['dipirona 5 mg'] })
    ])
    expect(
      codes('Rex ID 101 dipirona 5 mg; Rex ID 202 soro 20 ml', swapped)
    ).toEqual(['VALUE_PATIENT_MISMATCH', 'VALUE_PATIENT_MISMATCH'])
  })

  it('does not let a task of no patient borrow a value from a patient block', () => {
    const organized = note(
      [patient('Alfa', { id: '1' }), patient('Beta', { id: '2' })],
      [{ descricao: 'Repetir exame em 6 h', paciente: null }]
    )
    expect(
      codes('Alfa ID 1 estável. Beta ID 2 repetir exame em 6 h', organized)
    ).toEqual(['SOURCE_ASSOCIATION_AMBIGUOUS'])
  })

  it('flags a task value moved to the wrong patient', () => {
    const organized = note(
      [patient('Alfa', { id: '1' }), patient('Beta', { id: '2' })],
      [{ descricao: 'Medir glicemia 90', paciente: 'Alfa' }]
    )
    expect(
      codes('Alfa ID 1 estável. Beta ID 2 glicemia 90', organized)
    ).toEqual(['VALUE_PATIENT_MISMATCH'])
  })
})

describe('F13 slice 2: grammar edges', () => {
  it('reads a decimal comma and a decimal point as the same number', () => {
    const organized = note([patient('Thor', { condutas: ['soro 2,5 ml'] })])
    expect(codes('Thor soro 2.5 ml', organized)).toEqual([])
  })

  it('does not take a compound unit for its first part', () => {
    const organized = note([
      patient('Thor', { condutas: ['dipirona 25 mg/kg'] })
    ])
    expect(codes('Thor dipirona 25 mg', organized)).toEqual([
      'VALUE_UNIT_MISMATCH'
    ])
    expect(codes('Thor dipirona 25 mg/kg', organized)).toEqual([])
  })

  it('anchors on whole words only', () => {
    const organized = note([
      patient('Alfa', { id: '2', condutas: ['dipirona 2 mg'] }),
      patient('Al', { id: '1', condutas: ['dipirona 1 mg'] })
    ])
    expect(
      codes('Alfa ID 2 dipirona 2 mg. Al ID 1 dipirona 1 mg.', organized)
    ).toEqual([])
  })

  it('does not hand a label to a number with another number in between', () => {
    const organized = note([patient('Thor', { evolucao: 'Temperatura 39' })])
    expect(codes('Thor temperatura 38,5 e 39', organized)).toEqual([
      'UNSOURCED_VALUE'
    ])
  })

  it('blocks a task that names a homonym without telling which', () => {
    const organized = note(
      [patient('Rex', { id: '101' }), patient('Rex', { id: '202' })],
      [{ descricao: 'Aplicar 5 mg', paciente: 'Rex' }]
    )
    expect(codes('Rex ID 101 e Rex ID 202, aplicar 5 mg', organized)).toEqual([
      'SOURCE_ASSOCIATION_AMBIGUOUS'
    ])
  })
})

describe('F13 slice 2: through the webhook', () => {
  const swapped: Organized = note([
    patient('Alfa', { id: '301', condutas: ['dipirona 2 mg'] }),
    patient('Beta', { id: '302', condutas: ['dipirona 1 mg'] })
  ])

  it('shows the issue in the preview and refuses "ok"', async () => {
    const env = setup({ organize: async () => swapped })
    await env.deliver(
      wahaPayload(
        'm1',
        ANA,
        'Alfa ID 301 dipirona 1 mg. Beta ID 302 dipirona 2 mg.'
      )
    )
    const preview = env.waha.textsTo(ANA).at(-1) ?? ''
    expect(preview).toContain('⛔ Antes de confirmar')
    expect(preview).toContain('VALUE_PATIENT_MISMATCH')
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(false)
    expect(env.waha.textsTo(ANA).at(-1)).toContain('Não posso confirmar')
  })

  it('confirms the corrected revision', async () => {
    let next: Organized = swapped
    const env = setup({ organize: async () => next })
    await env.deliver(
      wahaPayload(
        'm1',
        ANA,
        'Alfa ID 301 dipirona 1 mg. Beta ID 302 dipirona 2 mg.'
      )
    )
    next = note([
      patient('Alfa', { id: '301', condutas: ['dipirona 1 mg'] }),
      patient('Beta', { id: '302', condutas: ['dipirona 2 mg'] })
    ])
    await env.deliver(
      wahaPayload(
        'm2',
        ANA,
        'corrigir Alfa ID 301 dipirona 1 mg. Beta ID 302 dipirona 2 mg.'
      )
    )
    await env.deliver(wahaPayload('ok1', ANA, 'ok'))
    expect(env.store.lastActiveNote(ANA)?.confirmed).toBe(true)
  })
})
