import { readFileSync } from 'node:fs'
import { QualificationError } from '../../claude100/qualification/errors.mjs'
import {
  object,
  text,
  id,
  integer,
  list,
  unique
} from '../../claude100/qualification/schemas.mjs'

const baseline = JSON.parse(
  readFileSync(new URL('./catalog-baseline.v1.json', import.meta.url), 'utf8')
)
const requiredCatalogFields = [
  'schema_version',
  'catalog_id',
  'revision',
  'program',
  'reference',
  'family_count',
  'functional_denominator',
  'mandatory_cvg_controls',
  'families',
  'requirements'
]
const catalogStrings = [
  'status',
  'scope_closure',
  'scope',
  'omission_policy',
  'literal_metric',
  'governed_metric',
  'completion',
  'qualification_not_started'
]
const catalogFields = [
  ...requiredCatalogFields,
  ...catalogStrings,
  'surface_inventory_count',
  'numerator_pass_current',
  'full_codex_parity_claim',
  'revision_log',
  'execution'
]
const requiredRowFields = [
  'id',
  'family',
  'kind',
  'mandatory',
  'owner',
  'sources',
  'status',
  'receipt'
]
const rowStrings = [
  'title',
  'reference_validation',
  'cvg_validation',
  'equivalence',
  'acceptance',
  'oracle',
  'variants',
  'introduced_in_revision'
]

function invalid(message) {
  throw new QualificationError('INVALID_INPUT', message)
}
function string(value) {
  if (typeof value !== 'string') invalid('Expected a descriptive string')
}
function metadataObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid('Expected a metadata object')
}
function optionalStrings(value, fields) {
  for (const field of fields) {
    if (Object.hasOwn(value, field)) string(value[field])
  }
}

// The engine supplies strictly parsed JSON. Progress metadata is data only;
// the returned view is private input to the shared requirement binding check.
export function validateCodexCatalog(value) {
  object(value, catalogFields, requiredCatalogFields)
  if (
    value.schema_version !== 1 ||
    value.catalog_id !== 'CODEX-CAP-v1' ||
    value.program !== 'CODEX100'
  )
    invalid('Unknown CodeX catalog profile')
  text(value.revision, 128)
  optionalStrings(value, catalogStrings)
  metadataObject(value.reference)
  if (
    value.reference.repository !== baseline.repository ||
    value.reference.commit !== baseline.source_commit
  )
    invalid('CodeX source reference differs from the reviewed baseline')

  list(value.families, { min: baseline.families.length, max: 1024 })
  const familyIds = []
  for (const family of value.families) {
    object(family, ['id', 'name', 'owner', 'source', 'reuse'], ['id'])
    id(family.id)
    if (family.id === 'CROSS_CUTTING')
      invalid('CROSS_CUTTING is reserved for control grouping')
    optionalStrings(family, ['name', 'owner', 'source'])
    if (Object.hasOwn(family, 'reuse')) {
      if (Array.isArray(family.reuse)) family.reuse.forEach(string)
      else string(family.reuse)
    }
    familyIds.push(family.id)
  }
  unique(familyIds)
  const families = new Set(familyIds)
  if (baseline.families.some((family) => !families.has(family)))
    invalid('Missing baseline family')
  integer(value.family_count, baseline.families.length, 1024)
  if (value.family_count !== families.size) invalid('Family count mismatch')

  list(value.requirements, { min: baseline.requirements.length, max: 1024 })
  const rows = new Map(),
    assigned = new Set()
  let functional = 0,
    controls = 0
  const requirements = []
  for (const row of value.requirements) {
    object(row, [...requiredRowFields, ...rowStrings], requiredRowFields)
    id(row.id)
    id(row.family)
    if (rows.has(row.id)) invalid('Duplicate requirement identifier')
    if (row.kind === 'FUNCTIONAL_PARITY') {
      if (!families.has(row.family)) invalid('Unknown functional family')
      functional++
    } else if (row.kind === 'CVG_CONTROL') {
      if (row.family !== 'CROSS_CUTTING' && !families.has(row.family))
        invalid('Unknown control family')
      controls++
    } else invalid('Unknown requirement class')
    if (row.mandatory !== true) invalid('Every CodeX requirement is mandatory')
    text(row.owner, 128)
    if (!Array.isArray(row.sources) || row.sources.length === 0)
      invalid('Requirement sources must be a nonempty metadata array')
    row.sources.forEach(metadataObject)
    string(row.status)
    optionalStrings(row, rowStrings)
    rows.set(row.id, row)
    assigned.add(row.family)
    requirements.push({ id: row.id, verification_class: row.kind })
  }
  for (const expected of baseline.requirements) {
    const row = rows.get(expected.id)
    if (!row || row.family !== expected.family || row.kind !== expected.kind)
      invalid('Missing or reclassified baseline requirement')
  }
  if (familyIds.some((family) => !assigned.has(family)))
    invalid('Declared family has no requirement')
  integer(value.functional_denominator, baseline.functional_minimum, 1024)
  integer(value.mandatory_cvg_controls, baseline.control_minimum, 1024)
  if (
    value.functional_denominator !== functional ||
    value.mandatory_cvg_controls !== controls ||
    functional + controls !== value.requirements.length
  )
    invalid('Requirement class counts mismatch')
  return { requirements }
}
