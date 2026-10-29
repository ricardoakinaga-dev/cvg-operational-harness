import type { Organized } from './domain.ts'

// SPEC 0283 section 5 (SPEC 0179 section 4, minimal slice): every value of the
// organized output that carries a unit or a measurement label must have a
// counterpart in the source with the same number, the same unit, the same
// field label and the same patient block. Deterministic, no model, no
// conversion and no inference: a source outside this grammar blocks and asks
// for "corrigir" with an explicit label or ID (DECISÃO 0283-D).

export type AssociationIssueCode =
  | 'VALUE_PATIENT_MISMATCH'
  | 'VALUE_FIELD_MISMATCH'
  | 'VALUE_UNIT_MISMATCH'
  | 'UNSOURCED_VALUE'
  | 'SOURCE_ASSOCIATION_AMBIGUOUS'

export interface AssociationIssue {
  code: AssociationIssueCode
  /** Where the value sits in the organized output. */
  path: string
  patient?: string
  /** The value as the output writes it. */
  output: string
  /** The source excerpt that holds the same number elsewhere, when any. */
  source?: string
  message: string
}

/** Closed unit list, longest first; compared literally after folding. */
const UNITS = [
  'mg/kg',
  'mg/ml',
  'ml/kg',
  'ml/h',
  'ui/kg',
  'mmhg',
  '°c',
  'mcg',
  'vezes',
  'bpm',
  'rpm',
  'min',
  'mg',
  'ml',
  'kg',
  'ui',
  'g',
  'l',
  'h',
  '%'
]
/** Every RegExp metacharacter of a literal, backslash included (CodeQL #37). */
function escapeRegExp(literal: string): string {
  return literal.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&')
}
const UNIT_AFTER = new RegExp(
  `^\\s*(${UNITS.map(escapeRegExp).join('|')})(?![\\p{L}\\d])`,
  'u'
)
/** Measurement labels: the field a bare number belongs to. */
const LABELS: Array<[string, RegExp]> = [
  ['temperatura', /temperatura/],
  ['frequencia cardiaca', /frequencia cardiaca|\bfc\b/],
  ['frequencia respiratoria', /frequencia respiratoria|\bfr\b/],
  ['peso', /\bpeso\b/],
  ['glicemia', /glicemia/]
]
const NUMBER = /\d+(?:[.,]\d+)?/g
const LABEL_REACH = 28

interface Occurrence {
  /** Number with the decimal point normalized and the scale preserved. */
  num: string
  unit: string | null
  label: string | null
  index: number
  end: number
}

/**
 * Lowercase without accents, one output unit per input unit, so an index in
 * the folded text is an index in the original.
 */
export function fold(text: string): string {
  let out = ''
  for (const char of text) {
    const folded = char.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    out += folded.length === char.length ? folded : char.toLowerCase()
  }
  return out.length === text.length ? out : text.toLowerCase()
}

function occurrences(folded: string): Occurrence[] {
  const found: Occurrence[] = []
  for (const match of folded.matchAll(NUMBER)) {
    const index = match.index
    const end = index + match[0].length
    const unit = UNIT_AFTER.exec(folded.slice(end))?.[1] ?? null
    // Label: the nearest one to the left, within reach, in the same clause.
    const left = folded.slice(Math.max(0, index - LABEL_REACH), index)
    const clause = left.slice(
      Math.max(
        left.lastIndexOf('.'),
        left.lastIndexOf(';'),
        left.lastIndexOf('\n')
      ) + 1
    )
    let label: string | null = null
    let at = -1
    for (const [name, pattern] of LABELS) {
      const hits = [...clause.matchAll(new RegExp(pattern.source, 'g'))]
      const hit = hits.at(-1)
      // No other number may sit between the label and this number.
      if (
        hit &&
        hit.index > at &&
        !/\d/.test(clause.slice(hit.index + hit[0].length))
      ) {
        label = name
        at = hit.index
      }
    }
    if (unit === null && label === null) continue
    found.push({
      num: match[0].replace(',', '.'),
      unit,
      label,
      index,
      end:
        end + (unit ? (UNIT_AFTER.exec(folded.slice(end))?.[0].length ?? 0) : 0)
    })
  }
  return found
}

interface Anchor {
  at: number
  patient: number
}

function wordAt(folded: string, word: string): number[] {
  if (word.length === 0) return []
  const hits: number[] = []
  let from = 0
  for (;;) {
    const at = folded.indexOf(word, from)
    if (at < 0) return hits
    const before = folded[at - 1]
    const after = folded[at + word.length]
    if (
      !(before && /[\p{L}\d]/u.test(before)) &&
      !(after && /[\p{L}\d]/u.test(after))
    ) {
      hits.push(at)
    }
    from = at + 1
  }
}

/** Patient index of each source offset (null before the first anchor). */
function blocks(folded: string, organized: Organized) {
  const names = organized.pacientes.map((patient) => fold(patient.nome.trim()))
  const ambiguousName = names.map(
    (name) => names.filter((other) => other === name).length > 1
  )
  const anchors: Anchor[] = []
  organized.pacientes.forEach((patient, index) => {
    if (!ambiguousName[index]) {
      for (const at of wordAt(folded, names[index]!))
        anchors.push({ at, patient: index })
    }
    const id = patient.id ? fold(patient.id.trim()) : ''
    if (id.length >= 2) {
      for (const at of wordAt(folded, id)) anchors.push({ at, patient: index })
    }
  })
  anchors.sort((a, b) => a.at - b.at)
  const anchored = new Set(anchors.map((anchor) => anchor.patient))
  const owner = (offset: number): number | null => {
    let current: number | null = null
    for (const anchor of anchors) {
      if (anchor.at <= offset) current = anchor.patient
      else break
    }
    return current
  }
  return { owner, anchored }
}

interface Output {
  path: string
  text: string
  /** Index in `organized.pacientes`; null for a task of no patient. */
  patient: number | null | 'unbound'
}

function outputs(organized: Organized): Output[] {
  const list: Output[] = []
  organized.pacientes.forEach((patient, index) => {
    const base = `pacientes[${index}]`
    for (const field of ['motivo', 'evolucao'] as const) {
      if (patient[field]) {
        list.push({
          path: `${base}.${field}`,
          text: patient[field],
          patient: index
        })
      }
    }
    patient.exames_pedidos.forEach((text, i) =>
      list.push({ path: `${base}.exames_pedidos[${i}]`, text, patient: index })
    )
    patient.condutas.forEach((text, i) =>
      list.push({ path: `${base}.condutas[${i}]`, text, patient: index })
    )
  })
  const names = organized.pacientes.map((patient) => fold(patient.nome.trim()))
  organized.pendencias.forEach((task, i) => {
    let patient: Output['patient'] = null
    if (task.paciente) {
      const wanted = fold(task.paciente.trim())
      const hits = names.flatMap((name, index) =>
        name === wanted ? [index] : []
      )
      patient = hits.length === 1 ? hits[0]! : 'unbound'
    } else if (organized.pacientes.length === 1) {
      patient = 0
    }
    list.push({
      path: `pendencias[${i}].descricao`,
      text: task.descricao,
      patient
    })
  })
  return list
}

function excerpt(raw: string, from: number, to: number): string {
  return raw.slice(Math.max(0, from - 14), Math.min(raw.length, to + 14)).trim()
}

/** Association issues of `organized` against `rawText`; empty when faithful. */
export function checkAssociation(
  rawText: string,
  organized: Organized
): AssociationIssue[] {
  const folded = fold(rawText)
  const source = occurrences(folded)
  const { owner, anchored } = blocks(folded, organized)
  const issues: AssociationIssue[] = []
  for (const output of outputs(organized)) {
    const outputFolded = fold(output.text)
    for (const value of occurrences(outputFolded)) {
      const written = output.text.slice(value.index, value.end)
      const patientName =
        typeof output.patient === 'number'
          ? organized.pacientes[output.patient]!.nome
          : undefined
      const make = (
        code: AssociationIssueCode,
        message: string,
        at?: Occurrence
      ): AssociationIssue => ({
        code,
        path: output.path,
        ...(patientName ? { patient: patientName } : {}),
        output: written,
        ...(at ? { source: excerpt(rawText, at.index, at.end) } : {}),
        message: `${code}: "${written}" (${output.path}${patientName ? `, ${patientName}` : ''}) ${message}`
      })
      const sameNumber = source.filter((item) => item.num === value.num)
      if (sameNumber.length === 0) {
        issues.push(make('UNSOURCED_VALUE', 'não aparece no que você disse.'))
        continue
      }
      // The patient block this value must come from.
      let wanted: number | null | 'any'
      if (output.patient === 'unbound') {
        issues.push(
          make(
            'SOURCE_ASSOCIATION_AMBIGUOUS',
            'cita um paciente que não consigo identificar com certeza.'
          )
        )
        continue
      } else if (output.patient === null) {
        wanted = organized.pacientes.length === 0 ? 'any' : null
      } else if (!anchored.has(output.patient)) {
        issues.push(
          make(
            'SOURCE_ASSOCIATION_AMBIGUOUS',
            'é de um paciente que não consigo localizar no que você disse (cite o nome ou o ID dele junto do valor).'
          )
        )
        continue
      } else {
        wanted = output.patient
      }
      const inBlock =
        wanted === 'any'
          ? sameNumber
          : sameNumber.filter((item) => owner(item.index) === wanted)
      if (inBlock.length === 0) {
        issues.push(
          make(
            wanted === null && output.patient === null
              ? 'SOURCE_ASSOCIATION_AMBIGUOUS'
              : 'VALUE_PATIENT_MISMATCH',
            wanted === null && output.patient === null
              ? 'é de uma pendência sem paciente e só aparece junto de um paciente (diga a qual paciente ela se refere).'
              : 'só aparece, na fonte, junto de outro paciente.',
            sameNumber[0]
          )
        )
        continue
      }
      const unitOk = inBlock.filter(
        (item) => !(item.unit && value.unit) || item.unit === value.unit
      )
      if (unitOk.length === 0) {
        issues.push(
          make(
            'VALUE_UNIT_MISMATCH',
            `tem unidade diferente da fonte (${inBlock[0]!.unit}).`,
            inBlock[0]
          )
        )
        continue
      }
      const fieldOk = unitOk.filter(
        (item) => !(item.label && value.label) || item.label === value.label
      )
      if (fieldOk.length === 0) {
        issues.push(
          make(
            'VALUE_FIELD_MISMATCH',
            `está sob outro campo da fonte (${unitOk[0]!.label}).`,
            unitOk[0]
          )
        )
      }
    }
  }
  return issues
}
