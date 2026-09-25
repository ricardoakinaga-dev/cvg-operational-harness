import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  REQUIRED_RISK_DOMAINS,
  manifestDigest,
  validateMutationManifest
} from '../scripts/lib/mutation-governance.mjs'

const root = path.resolve(import.meta.dirname, '..')
const manifestPath = path.join(root, 'scripts', 'mutation-manifest.json')

describe('REM21-013 mutation manifest governance', () => {
  it('declares every critical risk domain with bounded, hash-bound mutations', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    expect(validateMutationManifest(manifest, { root })).toMatchObject({
      mutationCount: expect.any(Number),
      manifestSha256: expect.stringMatching(/^[0-9a-f]{64}$/)
    })
    expect([
      ...new Set(manifest.mutations.map((mutation) => mutation.domain))
    ]).toEqual(expect.arrayContaining(REQUIRED_RISK_DOMAINS))
    expect(manifest.mutations.length).toBeGreaterThanOrEqual(10)
  })

  it('rejects altered selectors, source drift, invalid budgets and missing domains', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const alteredSelector = structuredClone(manifest)
    alteredSelector.mutations[0].from = alteredSelector.mutations[0].to
    expect(() => validateMutationManifest(alteredSelector, { root })).toThrow(
      /selector|replacement/i
    )

    const sourceDrift = structuredClone(manifest)
    sourceDrift.mutations[0].sourceSha256 = '0'.repeat(64)
    expect(() => validateMutationManifest(sourceDrift, { root })).toThrow(
      /source.*hash|drift/i
    )

    const invalidBudget = structuredClone(manifest)
    invalidBudget.mutations[0].budgetMs = 0
    expect(() => validateMutationManifest(invalidBudget, { root })).toThrow(
      /budget/i
    )

    const missingDomain = structuredClone(manifest)
    missingDomain.mutations = missingDomain.mutations.filter(
      (mutation) => mutation.domain !== REQUIRED_RISK_DOMAINS[0]
    )
    expect(() => validateMutationManifest(missingDomain, { root })).toThrow(
      /domain/i
    )
  })

  it('changes the manifest digest when the selected set changes', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const changed = structuredClone(manifest)
    changed.mutations[0].id = `${changed.mutations[0].id}-changed`
    expect(manifestDigest(changed)).not.toBe(manifestDigest(manifest))
  })
})
