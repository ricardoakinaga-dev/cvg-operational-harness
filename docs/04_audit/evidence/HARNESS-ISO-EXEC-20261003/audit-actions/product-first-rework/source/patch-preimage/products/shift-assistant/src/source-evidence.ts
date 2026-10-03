import {
  type OrganizedV2,
  type SourceEvidence,
  type PatientBinding,
  type ValidationIssue,
  type NoteV2,
  normalizePatientId,
  ModelEvidenceSchema
} from './domain.ts'

const digits = [
  'zero',
  'um',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove'
]
const integers = new Map<string, string>()
const small = [
  ...digits,
  'dez',
  'onze',
  'doze',
  'treze',
  'quatorze',
  'quinze',
  'dezesseis',
  'dezessete',
  'dezoito',
  'dezenove'
]
const tens = [
  '',
  '',
  'vinte',
  'trinta',
  'quarenta',
  'cinquenta',
  'sessenta',
  'setenta',
  'oitenta',
  'noventa'
]
const hundreds = [
  '',
  'cento',
  'duzentos',
  'trezentos',
  'quatrocentos',
  'quinhentos',
  'seiscentos',
  'setecentos',
  'oitocentos',
  'novecentos'
]
function spell(n: number): string {
  if (n < 20) return small[n]!
  if (n < 100)
    return tens[Math.floor(n / 10)]! + (n % 10 ? ' e ' + spell(n % 10) : '')
  if (n === 100) return 'cem'
  return (
    hundreds[Math.floor(n / 100)]! + (n % 100 ? ' e ' + spell(n % 100) : '')
  )
}
for (let n = 0; n < 1000; n++) {
  const word = spell(n)
  integers.set(word, String(n))
  for (const v of [
    word.replace(/\bum\b/g, 'uma'),
    word.replace(/\bdois\b/g, 'duas'),
    word.replace(/quatorze/g, 'catorze')
  ])
    integers.set(v, String(n))
}
const digitWords = new Map(digits.map((w, n) => [w, String(n)]))
digitWords.set('uma', '1')
digitWords.set('duas', '2')
function integer(s: string): string | undefined {
  return /^(?:0|[1-9]\d{0,2})$/.test(s) ? s : integers.get(s)
}
export function numeralValue(literal: string): string | undefined {
  const s = literal.toLocaleLowerCase('pt-BR').trim().replace(/ +/g, ' ')
  const clock = /^(.+) horas?(?: e (.+) minutos?)?$/.exec(s)
  if (clock) {
    const h = integer(clock[1]!)
    const m = clock[2] ? integer(clock[2]) : '0'
    if (h !== undefined && m !== undefined && +h < 24 && +m < 60)
      return h.padStart(2, '0') + ':' + m.padStart(2, '0')
    return undefined
  }
  if (/^\d{2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':').map(Number)
    return h! < 24 && m! < 60 ? s : undefined
  }
  const decimal = s.split(' vírgula ')
  if (decimal.length === 2) {
    const whole = integer(decimal[0]!)
    const frac = decimal[1]!.split(' ').map((w) => digitWords.get(w))
    if (
      whole !== undefined &&
      frac.length >= 1 &&
      frac.length <= 3 &&
      frac.every((x) => x !== undefined)
    )
      return whole + ',' + frac.join('')
    return undefined
  }
  const numeric = /^(0|[1-9]\d{0,2}),(\d{1,3})$/.exec(s)
  if (numeric) return s
  return integer(s)
}
export interface SourceBlock {
  patientRef: string | null
  start: number
  end: number
  patientName?: string
  idLiteral?: string
}
export function locateQuote(
  raw: string,
  blocks: readonly SourceBlock[],
  payload: unknown
) {
  const parsed = ModelEvidenceSchema.safeParse(payload)
  if (!parsed.success)
    return {
      candidateRanges: [],
      serviceEvidence: null,
      issue: 'SOURCE_QUOTE_MISSING'
    }
  const e = parsed.data
  const assigned = blocks.filter((b) => b.patientRef === e.patientRef)
  if (!e.quote)
    return {
      candidateRanges: [],
      serviceEvidence: null,
      issue: 'SOURCE_QUOTE_MISSING'
    }
  if (assigned.length !== 1)
    return {
      candidateRanges: [],
      serviceEvidence: null,
      issue: 'SOURCE_ASSOCIATION_AMBIGUOUS'
    }
  const block = assigned[0]!
  const candidateRanges: { start: number; end: number }[] = []
  let at = raw.indexOf(e.quote, block.start)
  while (at >= 0 && at + e.quote.length <= block.end) {
    candidateRanges.push({ start: at, end: at + e.quote.length })
    at = raw.indexOf(e.quote, at + 1)
  }
  if (candidateRanges.length !== 1)
    return {
      candidateRanges,
      serviceEvidence: null,
      issue: candidateRanges.length
        ? 'SOURCE_ASSOCIATION_AMBIGUOUS'
        : 'SOURCE_QUOTE_NOT_FOUND'
    }
  return {
    candidateRanges,
    serviceEvidence: { ...e, ...candidateRanges[0]! },
    issue: null
  }
}
interface ValueTuple {
  patientBlock: string
  field: string
  valueLiteral: string | null
  unitLiteral: string | null
  quote?: string
}
export function compareSourceValue(
  raw: string,
  blocks: readonly SourceBlock[],
  source: ValueTuple,
  output: ValueTuple
) {
  const displayLiteral = source.valueLiteral ?? source.quote ?? ''
  const reject = (issue: string) => ({
    outcome: 'REJECT',
    comparisonValue: null,
    displayLiteral,
    issue,
    canonicalPatientMerge: false
  })
  if (source.patientBlock !== output.patientBlock)
    return reject('VALUE_PATIENT_MISMATCH')
  if (
    source.field !== output.field ||
    (source.field === 'duration' && output.valueLiteral?.includes(':'))
  )
    return reject('VALUE_FIELD_MISMATCH')
  if (source.unitLiteral !== output.unitLiteral)
    return reject('VALUE_UNIT_MISMATCH')
  if (source.valueLiteral === null || output.valueLiteral === null)
    return reject('UNSOURCED_VALUE')
  const block = blocks.find((b) => b.patientRef === source.patientBlock)
  if (
    !block ||
    !source.quote ||
    !raw.slice(block.start, block.end).includes(source.quote) ||
    !source.quote.includes(source.valueLiteral)
  )
    return reject('SOURCE_ASSOCIATION_AMBIGUOUS')
  const a = numeralValue(source.valueLiteral),
    b = numeralValue(output.valueLiteral)
  if (a === undefined || b === undefined) {
    if (source.valueLiteral === output.valueLiteral)
      return {
        outcome: 'EQUIVALENT',
        comparisonValue: source.valueLiteral,
        displayLiteral,
        issue: null,
        canonicalPatientMerge: false
      }
    return reject('SOURCE_ASSOCIATION_AMBIGUOUS')
  }
  if (a !== b) {
    const others = blocks
      .filter((p) => p.patientRef !== source.patientBlock)
      .map((p) => numericText(raw.slice(p.start, p.end)))
      .join(' ')
    if (others.includes('⟦' + b + '⟧')) return reject('VALUE_PATIENT_MISMATCH')
    if (
      source.field === 'currentValue' &&
      /a anotação anterior dizia/i.test(raw.slice(block.start, block.end))
    ) {
      const historical =
        raw
          .slice(block.start, block.end)
          .split(/a anotação anterior dizia/i)[1]
          ?.split(/[.;]/)[0] ?? ''
      if (numericText(historical).includes('⟦' + b + '⟧'))
        return reject('VALUE_FIELD_MISMATCH')
    }
    return reject('UNSOURCED_VALUE')
  }
  return {
    outcome: 'EQUIVALENT',
    comparisonValue: a,
    displayLiteral,
    issue: null,
    canonicalPatientMerge: false
  }
}
// Longest finite grammar match; only numeric representations change, never units or free prose.
const numberWords = [
  ...new Set(
    [...integers.keys()]
      .flatMap((w) => w.split(' '))
      .concat(digits, ['vírgula', 'hora', 'horas', 'minuto', 'minutos'])
  )
].sort((a, b) => b.length - a.length)
const numericPattern = new RegExp(
  '(?<![\\p{L}\\p{N}])(?:\\d{2}:\\d{2}|\\d+(?:[,.]\\d+)?|(?:' +
    numberWords.join('|') +
    ')(?: (?:' +
    numberWords.join('|') +
    '))*)(?![\\p{L}\\p{N}])',
  'gu'
)
export function numericText(text: string): string {
  return text.replace(numericPattern, (word) => {
    const v = numeralValue(word)
    return v === undefined ? word : '⟦' + v + '⟧'
  })
}
export function buildSourceBlocks(
  raw: string,
  organization: OrganizedV2
): SourceBlock[] {
  const anchors = [
    ...raw.matchAll(/(?:\b[Nn]ovo paciente:|\b[Pp]aciente)\s+([^,.;\n]+)[,.;]/g)
  ]
  const ranges = anchors.map((a, index) => {
    const start = a.index!,
      end = anchors[index + 1]?.index ?? raw.length
    const ids = [
      ...raw
        .slice(start, end)
        .split(/\.\s|\.$|\n/)[0]!
        .matchAll(
          /(?:\bID|\bid|\bficha|\bprontuário)\s+([^,;\n]+?)(?=\.\s|\.$|[,;\n]|$)/g
        )
    ].map((m) => m[1]!.trim())
    return { name: a[1]!.trim(), start, end, ids }
  })
  const blocks: SourceBlock[] = []
  for (const patient of organization.pacientes) {
    const matching = ranges.filter(
      (r) =>
        r.name === patient.nome &&
        (!patient.id ||
          r.ids.some(
            (literal) =>
              literal === patient.id ||
              (numeralValue(literal) !== undefined &&
                numeralValue(literal) === numeralValue(patient.id!))
          ))
    )
    if (matching.length === 1) {
      const r = matching[0]!
      const uniqueIds = [...new Set(r.ids)]
      if (patient.id && uniqueIds.length !== 1) continue
      blocks.push({
        patientRef: patient.localRef,
        patientName: patient.nome,
        start: r.start,
        end: r.end,
        ...(uniqueIds.length === 1 ? { idLiteral: uniqueIds[0]! } : {})
      })
    }
  }
  if (anchors.length) {
    const first = anchors[0]!.index!
    if (
      first > 0 &&
      /(?:[Pp]endência geral:|[Gg]eral:)/.test(raw.slice(0, first))
    )
      blocks.push({ patientRef: null, start: 0, end: first })
  } else if (/^(?:Pendência geral:|Geral:)/.test(raw))
    blocks.push({ patientRef: null, start: 0, end: raw.length })
  return blocks
}
export function validateOrganization(
  raw: string,
  o: OrganizedV2,
  history: readonly NoteV2[] = [],
  elaboratedAt?: string
): {
  evidence: SourceEvidence[]
  bindings: PatientBinding[]
  issues: ValidationIssue[]
} {
  const blocks = buildSourceBlocks(raw, o)
  const evidence: SourceEvidence[] = []
  const bindings: PatientBinding[] = []
  const issues: ValidationIssue[] = []
  const issue = (
    code: string,
    path: string,
    ref: string | null,
    value: string,
    range: SourceEvidence | null = null
  ) =>
    issues.push({
      code,
      path,
      patientRef: ref,
      sourceRange: range ? { start: range.start, end: range.end } : null,
      outputValue: value,
      severity: 'blocking'
    })
  const verify = (
    path: string,
    ref: string | null,
    value: string,
    context?: RegExp
  ) => {
    const es = o.evidence.filter((e) => e.path === path && e.patientRef === ref)
    if (es.length !== 1) {
      issue('SOURCE_QUOTE_MISSING', path, ref, value)
      return
    }
    const located = locateQuote(raw, blocks, es[0])
    if (!located.serviceEvidence) {
      issue(located.issue!, path, ref, value)
      return
    }
    const ev = located.serviceEvidence
    evidence.push(ev)
    const marker = context?.exec(ev.quote)
    if (context && !marker) {
      issue('VALUE_FIELD_MISMATCH', path, ref, value, ev)
      return
    }
    let local = marker ? ev.quote.slice(marker.index) : ev.quote
    if (context) {
      // A quote covering several fields does not grant values from later fields.
      const boundary =
        /(?:Motivo:|Evolução:|Evolucao:|Exames:|Condutas:|Pendência:|Pendencia:|Tutor:)/i.exec(
          local.slice(1)
        )
      if (boundary) local = local.slice(0, boundary.index + 1)
    }
    if (!numericText(local).includes(numericText(value)))
      issue('UNSOURCED_VALUE', path, ref, value, ev)
  }
  for (const p of o.pacientes) {
    const prefix = 'pacientes.' + p.localRef + '.'
    const block = blocks.find((b) => b.patientRef === p.localRef)
    let inherited: PatientBinding | undefined
    if (!p.id && block) {
      const candidates = history
        .filter((n) => n.state === 'confirmed' && !n.replacementPending)
        .flatMap((n) =>
          n.bindings
            .filter(
              (b) =>
                b.name === p.nome &&
                b.provenance !== 'unresolved' &&
                b.confirmedBy &&
                b.idLiteral &&
                (!p.leito || p.leito === b.bed)
            )
            .map((b) => ({
              ...b,
              evidenceRefs: [
                'history:' + n.id + ':' + n.revision + ':' + n.organizedSha256
              ]
            }))
        )
      const unique = [
        ...new Map(
          candidates.map((b) => [JSON.stringify([b.idLiteral, b.bed]), b])
        ).values()
      ]
      if (unique.length === 1) inherited = unique[0]
    }
    if (!block || (!p.id && !inherited)) {
      issue('UNSOURCED_ID', prefix + 'id', p.localRef, p.id ?? '')
    }
    verify(prefix + 'nome', p.localRef, p.nome)
    if (p.id)
      verify(prefix + 'id', p.localRef, p.id, /(?:ID|id|ficha|prontuário)\s/)
    for (const field of [
      'leito',
      'especie',
      'tutor',
      'motivo',
      'evolucao'
    ] as const)
      if (p[field])
        verify(
          prefix + field,
          p.localRef,
          p[field]!,
          field === 'leito'
            ? /leito\s/
            : field === 'motivo'
              ? /motivo:/i
              : field === 'evolucao'
                ? /(?:evolução:|evolucao:|Temperatura anotada|Frequência cardíaca|Frequência respiratória|Peso|glicemia|Volume anotado|O valor fornecido agora)/i
                : undefined
        )
    for (const [i, v] of p.exames_pedidos.entries())
      verify(
        prefix + 'exames_pedidos.' + i,
        p.localRef,
        v,
        /(?:exames:|pedi|solicitar)/i
      )
    for (const [i, v] of p.condutas.entries())
      verify(prefix + 'condutas.' + i, p.localRef, v, /(?:condutas:|recebeu)/i)
    bindings.push({
      localRef: p.localRef,
      name: p.nome,
      ...(p.id
        ? {
            idLiteral: block?.idLiteral ?? p.id,
            normalizedId: normalizePatientId(block?.idLiteral ?? p.id)
          }
        : inherited?.idLiteral
          ? {
              idLiteral: inherited.idLiteral,
              normalizedId: normalizePatientId(inherited.idLiteral)
            }
          : {}),
      ...(p.leito ? { bed: p.leito } : {}),
      provenance:
        p.id && block
          ? 'source_explicit'
          : inherited
            ? 'confirmed_history_candidate'
            : 'unresolved',
      evidenceRefs: [
        ...evidence
          .filter((e) => e.patientRef === p.localRef)
          .map((e) => e.path),
        ...(inherited?.evidenceRefs ?? [])
      ]
    })
  }
  for (const t of o.pendencias) {
    const prefix = 'pendencias.' + t.localRef + '.'
    const b = bindings.find((p) => p.localRef === t.pacienteRef)
    if (
      t.pacienteRef &&
      (!b ||
        b.provenance === 'unresolved' ||
        (t.pacienteId &&
          t.pacienteId !== b.idLiteral &&
          !(
            numeralValue(t.pacienteId) !== undefined &&
            numeralValue(t.pacienteId) === numeralValue(b.idLiteral ?? '')
          )))
    )
      issue(
        'VALUE_PATIENT_MISMATCH',
        prefix + 'pacienteRef',
        t.pacienteRef,
        t.pacienteId ?? ''
      )
    verify(
      prefix + 'descricao',
      t.pacienteRef,
      t.descricao,
      /(?:pendência:|pendencia:|vou|promessa|prometeu|pendência geral:|geral:)/i
    )
    const ids = [
      ...t.descricao.matchAll(/(?:ID|ficha|prontuário)\s+([^,.;\s]+)/g)
    ].map((m) => m[1])
    if (ids.some((id) => id !== b?.idLiteral))
      issue(
        'VALUE_PATIENT_MISMATCH',
        prefix + 'descricao',
        t.pacienteRef,
        t.descricao
      )
    if (t.quando) {
      const e = o.evidence.find((e) => e.path === prefix + 'quando')
      const clock = t.quando.match(/T(\d{2}:\d{2})/)
      const baseDay = elaboratedAt
        ? new Date(Date.parse(elaboratedAt) - 10800000)
            .toISOString()
            .slice(0, 10)
        : undefined
      if (
        baseDay &&
        (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00-03:00$/.test(t.quando) ||
          t.quando.slice(0, 10) !== baseDay)
      )
        issue('UNSOURCED_VALUE', prefix + 'quando', t.pacienteRef, t.quando)
      if (!clock || !e || !/(?:às|as)\s/.test(e.quote))
        issue('UNSOURCED_VALUE', prefix + 'quando', t.pacienteRef, t.quando)
      else verify(prefix + 'quando', t.pacienteRef, clock[1]!)
    }
  }
  // Extras cannot assert unrelated provenance. Ref/field must correspond to a concrete scalar checked above.
  for (const e of o.evidence)
    if (
      !evidence.some((v) => v.path === e.path) &&
      !issues.some((i) => i.path === e.path)
    )
      issue('SOURCE_ASSOCIATION_AMBIGUOUS', e.path, e.patientRef, e.quote)
  for (const b of bindings)
    if (
      bindings.some(
        (other) =>
          other.localRef !== b.localRef &&
          other.normalizedId === b.normalizedId &&
          other.idLiteral !== b.idLiteral
      )
    )
      issue(
        'SOURCE_ASSOCIATION_AMBIGUOUS',
        'pacientes.' + b.localRef + '.id',
        b.localRef,
        b.idLiteral ?? ''
      )
  return { evidence, bindings, issues }
}
