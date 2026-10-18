// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  validateManifest,
  validateRule,
  validateCatalog,
  validateReceipt,
  validateCaptureIndex,
  validateAuthorityIndex,
  validateRequirementBindings
} from './schemas.mjs'

const load = (name) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`./fixtures/wire-v1/${name}`, import.meta.url)),
      'utf8'
    )
  )
const clone = (data) => structuredClone(data)
const failed = (fn, status = 'INVALID_INPUT') => {
  let error
  try {
    fn()
  } catch (caught) {
    error = caught
  }
  expect(error?.status).toBe(status)
}

describe('SPEC0229 closed evidence envelopes', () => {
  it('accepts the complete structural wire example without claiming its authenticity', () => {
    const manifest = load('manifest.json'),
      rule = load('rule.json'),
      catalog = load('catalog.json')
    expect(validateManifest(manifest)).toBe(manifest)
    expect(validateRule(rule)).toBe(rule)
    expect(validateCatalog(catalog)).toBe(catalog)
    validateReceipt(load('reference/receipt.json'))
    validateReceipt(load('cvg/receipt.json'))
    validateCaptureIndex(load('capture-index.json'))
    validateAuthorityIndex(load('authority-index.json'))
    validateRequirementBindings(manifest, rule, catalog)
    expect(catalog.requirements).toHaveLength(134)
    expect(
      catalog.requirements.filter(
        (x) => x.verification_class === 'FUNCTIONAL_PARITY'
      )
    ).toHaveLength(117)
  })

  it.each([
    [
      'unknown key',
      (m) => {
        m.approved = true
      }
    ],
    [
      'missing field',
      (m) => {
        delete m.fixtureSha256
      }
    ],
    [
      'duplicate requirement',
      (m) => {
        m.requirementIds.push(m.requirementIds[0])
      }
    ],
    [
      'identifier with shell text',
      (m) => {
        m.runId = '$(touch nope)'
      }
    ],
    [
      'bad digest',
      (m) => {
        m.fixtureSha256 = 'A'.repeat(64)
      }
    ],
    [
      'invalid calendar',
      (m) => {
        m.createdAt = '2026-02-30T00:00:00.000Z'
      }
    ],
    [
      'time zone not UTC',
      (m) => {
        m.createdAt = '2026-10-17T00:00:02+00:00'
      }
    ],
    [
      'reverse execution time',
      (m) => {
        m.cvg.execution.endedAt = '2026-10-16T00:00:00.000Z'
      }
    ],
    [
      'SUCCESS nonzero exit',
      (m) => {
        m.cvg.execution.exitCode = 1
      }
    ],
    [
      'product failure with null exit',
      (m) => {
        m.cvg.execution.outcomeKind = 'PRODUCT_FAILURE'
        m.cvg.execution.exitCode = null
      }
    ],
    [
      'timeout relabel',
      (m) => {
        m.reference.execution.timeout = true
      }
    ],
    [
      'wrong identity side',
      (m) => {
        m.cvg.identity = m.reference.identity
      }
    ],
    [
      'unknown identity field',
      (m) => {
        m.cvg.identity.account = 'foreign'
      }
    ],
    [
      'duplicate attestation',
      (m) => {
        m.captureAttestations[1] = m.captureAttestations[0]
      }
    ],
    [
      'duplicate artifact role',
      (m) => {
        m.reference.artifacts[1].role = 'RAW_INPUT'
      }
    ],
    [
      'duplicate artifact path',
      (m) => {
        m.reference.artifacts[1].path = m.reference.artifacts[0].path
      }
    ],
    [
      'traversal artifact path',
      (m) => {
        m.cvg.artifacts[0].path = '../outside'
      }
    ],
    [
      'absolute artifact path',
      (m) => {
        m.cvg.artifacts[0].path = '/tmp/outside'
      }
    ],
    [
      'unsorted artifact paths',
      (m) => {
        m.cvg.artifacts.reverse()
      }
    ],
    [
      'missing actual input',
      (m) => {
        m.cvg.artifacts.shift()
      }
    ],
    [
      'oversized declared artifact',
      (m) => {
        m.cvg.artifacts[0].bytes = 4 * 1024 * 1024 + 1
      }
    ]
  ])('rejects manifest: %s', (_, mutate) => {
    const manifest = load('manifest.json')
    mutate(manifest)
    failed(() => validateManifest(manifest))
  })

  it('allows an explicit missing reference for the later BLOCKED_REFERENCE decision', () => {
    const manifest = load('manifest.json')
    manifest.reference = null
    manifest.captureAttestations.shift()
    expect(validateManifest(manifest)).toBe(manifest)
  })
  it('keeps authenticated infra failure representable instead of relabeling it', () => {
    const manifest = load('manifest.json')
    manifest.cvg.execution = {
      ...manifest.cvg.execution,
      outcomeKind: 'INFRA_FAILURE',
      timeout: true,
      exitCode: null
    }
    expect(validateManifest(manifest)).toBe(manifest)
  })

  it.each([
    [
      'unknown clause',
      (r) => {
        r.grant = 'ALLOW'
      }
    ],
    [
      'fake expected reference',
      (r) => {
        r.expectedArtifact = {
          path: 'answer.json',
          sha256: 'a'.repeat(64),
          bytes: 1
        }
      }
    ],
    [
      'mixed class',
      (r) => {
        r.verificationClass = 'ALL'
      }
    ],
    [
      'unknown required role',
      (r) => {
        r.requiredRoles.push('AUTHORITY')
      }
    ],
    [
      'duplicate required role',
      (r) => {
        r.requiredRoles.push('RAW_INPUT')
      }
    ],
    [
      'missing required input',
      (r) => {
        r.requiredRoles = ['RAW_STDOUT']
      }
    ],
    [
      'unrequired projection',
      (r) => {
        r.projection.cvgRole = 'RAW_STATE'
      }
    ],
    [
      'invented predicate',
      (r) => {
        r.assertions[0].kind = 'EVAL'
      }
    ],
    [
      'extra assertion',
      (r) => {
        r.assertions.push({ kind: 'EQUAL_COMPLETE' })
      }
    ],
    [
      'infra as expected success',
      (r) => {
        r.expectedExecution.cvg.outcomeKind = 'INFRA_FAILURE'
      }
    ],
    [
      'failure expected with exit0',
      (r) => {
        r.expectedExecution.cvg.outcomeKind = 'PRODUCT_FAILURE'
      }
    ],
    [
      'byte normalization',
      (r) => {
        r.projection.kind = 'EXACT_BYTES'
        r.normalizationPolicy = [
          { field: 'eventId', mode: 'id', namespace: 'event' }
        ]
      }
    ]
  ])('rejects rule: %s', (_, mutate) => {
    const rule = load('rule.json')
    mutate(rule)
    failed(() => validateRule(rule))
  })
  it('reports unsupported versions and projection kinds explicitly', () => {
    const rule = load('rule.json')
    rule.version = 2
    failed(() => validateRule(rule), 'UNSUPPORTED_RULE')
    rule.version = 1
    rule.projection.kind = 'SEMANTIC_PARAPHRASE'
    failed(() => validateRule(rule), 'UNSUPPORTED_RULE')
  })
  it('requires approved expected bytes only for CVG controls, not a pretend Claude observation', () => {
    const rule = load('rule.json'),
      manifest = load('manifest.json'),
      catalog = load('catalog.json')
    rule.verificationClass = 'CVG_CONTROL'
    rule.requirementIds = ['CC100-03-10']
    manifest.requirementIds = [...rule.requirementIds]
    rule.projection.referenceRole = null
    rule.expectedExecution.reference = null
    rule.expectedArtifact = {
      path: 'approved-control.json',
      sha256: 'a'.repeat(64),
      bytes: 3
    }
    validateRule(rule)
    failed(() => validateRequirementBindings(manifest, rule, catalog))
    manifest.reference = null
    manifest.captureAttestations.shift()
    validateManifest(manifest)
    validateRequirementBindings(manifest, rule, catalog)
    delete rule.expectedArtifact
    failed(() => validateRule(rule))
  })

  it.each([
    [
      'drop obligation',
      (c) => {
        c.requirements.pop()
      }
    ],
    [
      'duplicate obligation',
      (c) => {
        c.requirements[1].id = c.requirements[0].id
      }
    ],
    [
      'reduce denominator',
      (c) => {
        c.denominator--
      }
    ],
    [
      'hide CVG control',
      (c) => {
        c.requirements.find(
          (r) => r.verification_class === 'CVG_CONTROL'
        ).required = false
      }
    ],
    [
      'reclassify control',
      (c) => {
        c.requirements.find(
          (r) => r.verification_class === 'CVG_CONTROL'
        ).verification_class = 'FUNCTIONAL_PARITY'
      }
    ],
    [
      'wrong family',
      (c) => {
        c.requirements[0].family_id = 'CC18-16'
      }
    ],
    [
      'missing family item',
      (c) => {
        c.families[0].requirements.pop()
      }
    ],
    [
      'extra catalog grant',
      (c) => {
        c.approval = 'APPROVED'
      }
    ],
    [
      'unknown requirement control',
      (c) => {
        c.requirements[0].pass = true
      }
    ]
  ])('rejects catalog: %s', (_, mutate) => {
    const catalog = load('catalog.json')
    mutate(catalog)
    failed(() => validateCatalog(catalog))
  })
  it('rejects unknown requirements, mixed classes, and wrong scenario bindings', () => {
    const m = load('manifest.json'),
      r = load('rule.json'),
      c = load('catalog.json')
    m.requirementIds = r.requirementIds = ['CC100-99-99']
    failed(() => validateRequirementBindings(m, r, c))
    m.requirementIds = r.requirementIds = ['CC100-03-10']
    failed(() => validateRequirementBindings(m, r, c))
    m.requirementIds = ['CC100-07-01']
    r.requirementIds = [...m.requirementIds]
    m.scenarioId = 'other'
    failed(() => validateRequirementBindings(m, r, c))
  })
  it('rejects ambiguous, oversized and self-asserted capture/authority indices', () => {
    const ci = load('capture-index.json')
    ci.entries.push(clone(ci.entries[0]))
    failed(() => validateCaptureIndex(ci))
    const ai = load('authority-index.json')
    ai.entries[0].approved = true
    failed(() => validateAuthorityIndex(ai))
    const tooMany = load('capture-index.json')
    tooMany.entries = Array.from({ length: 33 }, (_, i) => ({
      ...tooMany.entries[0],
      captureId: `c${i}`,
      runId: `r${i}`
    }))
    failed(() => validateCaptureIndex(tooMany))
    const receipt = load('reference/receipt.json')
    receipt.authority = 'PASS'
    failed(() => validateReceipt(receipt))
  })
})
