import { describe, expect, it } from 'vitest'
import vitestConfig from '../vitest.config.mts'

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
