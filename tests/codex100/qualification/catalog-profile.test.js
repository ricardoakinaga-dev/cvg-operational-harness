// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { QualificationError } from '../../claude100/qualification/errors.mjs'
import {
  validateCatalog,
  validateRequirementBindings
} from '../../claude100/qualification/schemas.mjs'
import { validateCodexCatalog } from './catalog-profile.mjs'

const baselineBytes = readFileSync(
  new URL('./catalog-baseline.v1.json', import.meta.url)
)
const baseline = JSON.parse(baselineBytes.toString('utf8'))
const functionalId = baseline.requirements.find(
  (row) => row.kind === 'FUNCTIONAL_PARITY'
).id
const controlId = baseline.requirements.find(
  (row) => row.kind === 'CVG_CONTROL'
).id

function family(id) {
  return {
    id,
    name: 'Synthetic family',
    owner: 'synthetic',
    source: 'synthetic',
    reuse: []
  }
}
function requirement(id, family, kind = 'FUNCTIONAL_PARITY') {
  return {
    id,
    family,
    kind,
    mandatory: true,
    owner: 'synthetic',
    sources: [{ path: 'synthetic' }],
    status: 'NOT_RUN',
    receipt: null
  }
}
function catalog() {
  return {
    schema_version: 1,
    catalog_id: 'CODEX-CAP-v1',
    revision: 'synthetic-r1',
    program: 'CODEX100',
    reference: {
      repository: baseline.repository,
      commit: baseline.source_commit
    },
    family_count: 22,
    functional_denominator: 487,
    mandatory_cvg_controls: 22,
    families: baseline.families.map(family),
    requirements: baseline.requirements.map((row) =>
      requirement(row.id, row.family, row.kind)
    )
  }
}
function add(value, row) {
  value.requirements.push(row)
  if (row.kind === 'FUNCTIONAL_PARITY') value.functional_denominator++
  else value.mandatory_cvg_controls++
}
function rejected(value) {
  let error
  try {
    validateCodexCatalog(value)
  } catch (caught) {
    error = caught
  }
  expect(error).toBeInstanceOf(QualificationError)
  expect(error.status).toBe('INVALID_INPUT')
}

describe('SPEC0231 QK01 — CodeX baseline and additive catalog', () => {
  it('preserves the exact reviewed baseline bytes and 509 bindings', () => {
    expect(createHash('sha256').update(baselineBytes).digest('hex')).toBe(
      '33087dcbf76007ef251a2115b6da31a3d0a0bf0681a41ec9d22c44e49f888ea2'
    )
    expect(baseline.requirements).toHaveLength(509)
    expect(baseline.families).toHaveLength(22)
  })

  it('accepts 487 functional rows and 22 transverse controls without adding a family or mutating input', () => {
    const value = catalog(),
      before = structuredClone(value)
    const view = validateCodexCatalog(value)
    expect(value).toEqual(before)
    expect(view).toEqual({
      requirements: value.requirements.map((row) => ({
        id: row.id,
        verification_class: row.kind
      }))
    })
    expect(view).not.toBe(value)
    expect(view.requirements[0]).not.toBe(value.requirements[0])
    expect(
      view.requirements.filter(
        (row) => row.verification_class === 'FUNCTIONAL_PARITY'
      )
    ).toHaveLength(487)
    expect(
      value.requirements.filter((row) => row.family === 'CROSS_CUTTING')
    ).toHaveLength(22)
    expect(value.families.some((row) => row.id === 'CROSS_CUTTING')).toBe(false)
    view.requirements[0].id = 'PRIVATE-VIEW-ONLY'
    expect(value).toEqual(before)
  })

  it('feeds the existing binding validator with functional and control classes intact', () => {
    const view = validateCodexCatalog(catalog())
    for (const [id, verificationClass] of [
      [functionalId, 'FUNCTIONAL_PARITY'],
      [controlId, 'CVG_CONTROL']
    ]) {
      const manifest = {
        scenarioId: 'synthetic',
        requirementIds: [id],
        reference: null
      }
      const rule = { ...manifest, verificationClass }
      expect(() =>
        validateRequirementBindings(manifest, rule, view)
      ).not.toThrow()
      expect(() =>
        validateRequirementBindings(
          manifest,
          {
            ...rule,
            verificationClass:
              verificationClass === 'CVG_CONTROL'
                ? 'FUNCTIONAL_PARITY'
                : 'CVG_CONTROL'
          },
          view
        )
      ).toThrow(QualificationError)
    }
  })

  it('accepts reconciled new functional rows, families, and controls in declared and reserved groups', () => {
    const value = catalog()
    value.families.push(family('CDX-23'))
    value.family_count++
    add(value, requirement('SYNTHETIC-FUNCTION', 'CDX-23'))
    add(value, requirement('SYNTHETIC-CONTROL', 'CDX-01', 'CVG_CONTROL'))
    add(
      value,
      requirement('SYNTHETIC-CROSS-CONTROL', 'CROSS_CUTTING', 'CVG_CONTROL')
    )
    expect(validateCodexCatalog(value).requirements).toHaveLength(512)
    expect(value.functional_denominator).toBe(488)
    expect(value.mandatory_cvg_controls).toBe(24)
    expect(
      value.requirements.every(
        (row) => row.status === 'NOT_RUN' && row.receipt === null
      )
    ).toBe(true)
  })

  it('accepts the 1024 requirement cap', () => {
    const value = catalog()
    for (let i = 509; i < 1024; i++)
      add(value, requirement(`SYNTHETIC-${i}`, 'CROSS_CUTTING', 'CVG_CONTROL'))
    expect(validateCodexCatalog(value).requirements).toHaveLength(1024)
  })

  it('accepts metadata, descriptive strings, string or array reuse, and reordered rows', () => {
    const value = catalog()
    Object.assign(value, {
      status: 'PASS_CURRENT',
      scope_closure: '',
      scope: 'synthetic',
      omission_policy: '',
      literal_metric: '',
      governed_metric: '',
      completion: '',
      qualification_not_started: '',
      surface_inventory_count: 999,
      numerator_pass_current: 999,
      full_codex_parity_claim: true,
      revision_log: [{ arbitrary: ['data', null, 1] }],
      execution: { arbitrary: false }
    })
    value.reference.extra = { synthetic: true }
    value.families[0].reuse = 'synthetic reuse'
    const row = value.requirements[0]
    Object.assign(row, {
      title: 'x'.repeat(2048),
      reference_validation: '',
      cvg_validation: '',
      equivalence: '',
      acceptance: '',
      oracle: '',
      variants: '',
      introduced_in_revision: '',
      receipt: { status: 'PASS_CURRENT', opaque: [1, null] }
    })
    row.sources = [{ arbitrary: { value: 1 } }, {}]
    value.requirements.reverse()
    value.families.reverse()
    const view = validateCodexCatalog(value)
    expect(Object.keys(view)).toEqual(['requirements'])
    expect(
      view.requirements.every(
        (binding) => Object.keys(binding).join(',') === 'id,verification_class'
      )
    ).toBe(true)
  })

  it('accepts UTF8 revision and owner at the 128 byte boundary', () => {
    const value = catalog()
    value.revision = 'é'.repeat(64)
    value.requirements[0].owner = 'é'.repeat(64)
    expect(() => validateCodexCatalog(value)).not.toThrow()
  })
})

describe('SPEC0231 QK02 — baseline scope cannot be rebalanced away', () => {
  it.each([
    [
      'remove a binding',
      (value) => {
        value.requirements.shift()
        value.functional_denominator--
      }
    ],
    [
      'replace functional ID while preserving counts',
      (value) => {
        value.requirements.find((row) => row.id === functionalId).id =
          'SYNTHETIC-REPLACEMENT'
      }
    ],
    [
      'replace control ID while preserving counts',
      (value) => {
        value.requirements.find((row) => row.id === controlId).id =
          'SYNTHETIC-CONTROL-REPLACEMENT'
      }
    ],
    [
      'swap classes with unchanged totals',
      (value) => {
        const func = value.requirements.find((row) => row.id === functionalId)
        const ctrl = value.requirements.find((row) => row.id === controlId)
        func.kind = 'CVG_CONTROL'
        ctrl.kind = 'FUNCTIONAL_PARITY'
        ctrl.family = func.family
      }
    ],
    [
      'move functional binding to another declared family',
      (value) => {
        value.requirements.find((row) => row.id === functionalId).family =
          'CDX-02'
      }
    ],
    [
      'move baseline control into a declared family',
      (value) => {
        value.requirements.find((row) => row.id === controlId).family = 'CDX-01'
      }
    ],
    [
      'replace baseline family and move all its rows',
      (value) => {
        value.families[0].id = 'SYNTHETIC-REPLACEMENT'
        value.requirements
          .filter((row) => row.family === 'CDX-01')
          .forEach((row) => {
            row.family = 'SYNTHETIC-REPLACEMENT'
          })
      }
    ],
    [
      'make original binding optional',
      (value) => {
        value.requirements[0].mandatory = false
      }
    ],
    [
      'use truthy mandatory',
      (value) => {
        value.requirements[0].mandatory = 'true'
      }
    ],
    [
      'make additive binding optional',
      (value) => {
        add(value, {
          ...requirement('SYNTHETIC-OPTIONAL', 'CDX-01'),
          mandatory: false
        })
      }
    ]
  ])('rejects %s', (_name, mutate) => {
    const value = catalog()
    mutate(value)
    rejected(value)
  })
})

describe('SPEC0231 QK03 — closed schema, families, counts, and input types', () => {
  it.each([
    [
      'duplicate family',
      (value) => {
        value.families.push({ ...value.families[0] })
        value.family_count++
      }
    ],
    [
      'duplicate requirement',
      (value) => {
        add(value, { ...value.requirements[0] })
      }
    ],
    [
      'unknown functional family',
      (value) => {
        add(value, requirement('SYNTHETIC-ORPHAN', 'UNKNOWN'))
      }
    ],
    [
      'empty declared family',
      (value) => {
        value.families.push(family('CDX-23'))
        value.family_count++
      }
    ],
    [
      'functional in CROSS_CUTTING',
      (value) => {
        add(value, requirement('SYNTHETIC-BAD-FUNCTION', 'CROSS_CUTTING'))
      }
    ],
    [
      'control in unknown group',
      (value) => {
        add(
          value,
          requirement('SYNTHETIC-BAD-CONTROL', 'UNKNOWN', 'CVG_CONTROL')
        )
      }
    ],
    [
      'CROSS_CUTTING declared as family',
      (value) => {
        value.families.push(family('CROSS_CUTTING'))
        value.family_count++
      }
    ],
    [
      'wrong family count',
      (value) => {
        value.family_count++
      }
    ],
    [
      'wrong functional count',
      (value) => {
        value.functional_denominator++
      }
    ],
    [
      'wrong control count',
      (value) => {
        value.mandatory_cvg_controls++
      }
    ],
    [
      'compensated class counts',
      (value) => {
        value.functional_denominator--
        value.mandatory_cvg_controls++
      }
    ],
    [
      'string count',
      (value) => {
        value.family_count = '22'
      }
    ],
    [
      'fractional count',
      (value) => {
        value.functional_denominator = 487.5
      }
    ],
    [
      'unsafe count',
      (value) => {
        value.mandatory_cvg_controls = 9007199254740992
      }
    ],
    [
      'unknown catalog field',
      (value) => {
        value.validator = 'anything'
      }
    ],
    [
      'unknown family field',
      (value) => {
        value.families[0].extra = true
      }
    ],
    [
      'unknown requirement field',
      (value) => {
        value.requirements[0].verification_class = 'FUNCTIONAL_PARITY'
      }
    ],
    [
      'wrong version',
      (value) => {
        value.schema_version = 2
      }
    ],
    [
      'string version',
      (value) => {
        value.schema_version = '1'
      }
    ],
    [
      'wrong catalog id',
      (value) => {
        value.catalog_id = 'CLAUDE-CAP-v1'
      }
    ],
    [
      'wrong program',
      (value) => {
        value.program = 'CLAUDE100'
      }
    ],
    [
      'wrong source commit',
      (value) => {
        value.reference.commit = '0'.repeat(40)
      }
    ],
    [
      'wrong source repository',
      (value) => {
        value.reference.repository = 'https://example.invalid/codex'
      }
    ],
    [
      'null reference',
      (value) => {
        value.reference = null
      }
    ],
    [
      'array reference',
      (value) => {
        value.reference = []
      }
    ],
    [
      'empty revision',
      (value) => {
        value.revision = ''
      }
    ],
    [
      'overlong UTF8 revision',
      (value) => {
        value.revision = 'é'.repeat(65)
      }
    ],
    [
      'nonstring owner',
      (value) => {
        value.requirements[0].owner = {}
      }
    ],
    [
      'empty owner',
      (value) => {
        value.requirements[0].owner = ''
      }
    ],
    [
      'overlong UTF8 owner',
      (value) => {
        value.requirements[0].owner = 'é'.repeat(65)
      }
    ],
    [
      'overlong requirement ID',
      (value) => {
        value.requirements[0].id = 'a'.repeat(129)
      }
    ],
    [
      'nonASCII requirement ID',
      (value) => {
        value.requirements[0].id = 'função'
      }
    ],
    [
      'invalid family identifier',
      (value) => {
        value.families[0].id = 'not an id'
      }
    ],
    [
      'invalid row family identifier',
      (value) => {
        value.requirements[0].family = 'bad/group'
      }
    ],
    [
      'unknown kind',
      (value) => {
        value.requirements[0].kind = 'UNKNOWN'
      }
    ],
    [
      'sources as string',
      (value) => {
        value.requirements[0].sources = 'synthetic'
      }
    ],
    [
      'empty sources',
      (value) => {
        value.requirements[0].sources = []
      }
    ],
    [
      'source as string',
      (value) => {
        value.requirements[0].sources = ['synthetic']
      }
    ],
    [
      'source as null',
      (value) => {
        value.requirements[0].sources = [null]
      }
    ],
    [
      'source as array',
      (value) => {
        value.requirements[0].sources = [[]]
      }
    ],
    [
      'nonstring status',
      (value) => {
        value.requirements[0].status = false
      }
    ],
    [
      'nonstring catalog description',
      (value) => {
        value.scope = {}
      }
    ],
    [
      'nonstring optional description',
      (value) => {
        value.requirements[0].title = []
      }
    ],
    [
      'nonstring family name',
      (value) => {
        value.families[0].name = 1
      }
    ],
    [
      'nonstring family owner',
      (value) => {
        value.families[0].owner = []
      }
    ],
    [
      'nonstring family source',
      (value) => {
        value.families[0].source = {}
      }
    ],
    [
      'nonstring reuse entry',
      (value) => {
        value.families[0].reuse = [false]
      }
    ],
    [
      'invalid reuse type',
      (value) => {
        value.families[0].reuse = null
      }
    ],
    [
      'requirements not array',
      (value) => {
        value.requirements = {}
      }
    ],
    [
      'families not array',
      (value) => {
        value.families = {}
      }
    ],
    [
      '1025 requirements',
      (value) => {
        for (let i = 509; i < 1025; i++)
          add(value, requirement(`EXTRA-${i}`, 'CDX-01'))
      }
    ],
    [
      '1025 families',
      (value) => {
        for (let i = 22; i < 1025; i++)
          value.families.push(family(`EXTRA-${i}`))
        value.family_count = 1025
      }
    ]
  ])('rejects %s as INVALID_INPUT', (_name, mutate) => {
    const value = catalog()
    mutate(value)
    rejected(value)
  })

  it.each([
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
  ])('requires catalog.%s', (field) => {
    const value = catalog()
    delete value[field]
    rejected(value)
  })
  it.each(['id'])('requires family.%s', (field) => {
    const value = catalog()
    delete value.families[0][field]
    rejected(value)
  })
  it('accepts families containing only the mandatory id, with metadata optional', () => {
    const value = catalog()
    value.families = value.families.map(({ id }) => ({ id }))
    expect(validateCodexCatalog(value).requirements).toHaveLength(509)
  })
  it.each([
    'id',
    'family',
    'kind',
    'mandatory',
    'owner',
    'sources',
    'status',
    'receipt'
  ])('requires requirement.%s', (field) => {
    const value = catalog()
    delete value.requirements[0][field]
    rejected(value)
  })
  it.each([null, [], 'CODEX-CAP-v1', 1])(
    'rejects nonobject catalog %j',
    rejected
  )

  it('keeps the Claude and CodeX catalog profiles distinct', () => {
    const claude = JSON.parse(
      readFileSync(
        new URL(
          '../../claude100/qualification/fixtures/wire-v1/catalog.json',
          import.meta.url
        ),
        'utf8'
      )
    )
    expect(validateCatalog(claude)).toBe(claude)
    rejected(claude)
    expect(() => validateCatalog(catalog())).toThrow(QualificationError)
  })
})
