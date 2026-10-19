import { describe, expect, it } from 'vitest'
import vitestConfig from '../vitest.config.mts'
import referenceConfig from '../vitest.reference.config.mts'
import nativeConfig from '../vitest.boundary-native.config.mts'
import { globSync } from 'tinyglobby'

describe('vitest workspace hermeticity', () => {
  it('resolves every @cvg alias inside the current workspace', () => {
    const aliases = (
      vitestConfig as unknown as {
        resolve?: { alias?: Record<string, string> }
      }
    ).resolve?.alias

    expect(aliases).toBeDefined()
    for (const [name, target] of Object.entries(aliases ?? {})) {
      expect(name).toMatch(/^@cvg\//)
      // SPEC-LEGACY-002: isolated legacy workspaces live under legacy/packages.
      expect(
        target.startsWith(`${process.cwd()}/packages/`) ||
          target.startsWith(`${process.cwd()}/legacy/packages/`)
      ).toBe(true)
      expect(target).not.toContain('/home/ricardo/.openclaw/workspace/')
    }
  })
})

describe('reference proof resource ownership', () => {
  it('keeps the external-engine reply proof in their explicit profile', () => {
    const ordinary = globSync(vitestConfig.test?.include ?? [], {
      cwd: process.cwd()
    })
    const reference = globSync(referenceConfig.test?.include ?? [], {
      cwd: process.cwd()
    }).sort()
    expect(reference).toEqual([
      'tests/differential/reply-differential.integration.ts'
    ])
    for (const file of reference) expect(ordinary).not.toContain(file)
    expect(referenceConfig.resolve).toEqual(vitestConfig.resolve)
    expect(referenceConfig.test?.testTimeout).toEqual(
      vitestConfig.test?.testTimeout
    )
  })
})

describe('boundary native proof resource ownership', () => {
  it('collects both physical-toolchain proofs only in their explicit profile', () => {
    const ordinary = globSync(vitestConfig.test?.include ?? [], {
      cwd: process.cwd()
    })
    const native = globSync(nativeConfig.test?.include ?? [], {
      cwd: process.cwd()
    }).sort()
    expect(native).toEqual([
      'tests/b6-0234-reference-recipe.integration.js',
      'tests/b6-0236-compiled-provenance.integration.js'
    ])
    for (const file of native) expect(ordinary).not.toContain(file)
    expect(nativeConfig.resolve).toEqual(vitestConfig.resolve)
    expect(nativeConfig.test?.testTimeout).toEqual(
      vitestConfig.test?.testTimeout
    )
    expect(nativeConfig.test?.passWithNoTests).toBe(false)
  })
})
