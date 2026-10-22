// @vitest-environment node
/**
 * SPEC0254 O12 — the synthetic IdP never reaches runtime code or the runtime
 * build; production code neither reads NODE_EXTRA_CA_CERTS nor injects a CA,
 * and nothing enables `allowInsecureRequests`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const SELF = join(
  'apps',
  'api',
  'src',
  '__tests__',
  'oidc-login-boundary.test.ts'
)

function sources(directory: string): string[] {
  const found: string[] = []
  const visit = (path: string) => {
    for (const entry of readdirSync(path)) {
      if (['node_modules', 'dist', 'coverage', '.git'].includes(entry)) continue
      const full = join(path, entry)
      if (statSync(full).isDirectory()) visit(full)
      else if (/\.(ts|tsx|mts|js|mjs|cjs)$/.test(entry)) found.push(full)
    }
  }
  visit(join(root, directory))
  return found.map((file) => relative(root, file))
}

const all = ['apps', 'packages', 'legacy', 'scripts', 'products'].flatMap(
  (directory) => sources(directory)
)
const isTestCode = (file: string) =>
  file.split(sep).includes('__tests__') || /\.test\.tsx?$/.test(file)

describe('SPEC0254 O12 — synthetic IdP boundary', () => {
  it('imports the synthetic issuer only from __tests__', () => {
    const offenders = all.filter(
      (file) =>
        !isTestCode(file) &&
        readFileSync(join(root, file), 'utf8').includes('synthetic-oidc-issuer')
    )
    expect(offenders).toEqual([])
  })

  it('keeps the support under __tests__, which the runtime build excludes', () => {
    const support = all.filter((file) => file.includes('synthetic-oidc-issuer'))
    expect(support).toEqual([
      join(
        'apps',
        'api',
        'src',
        '__tests__',
        'support',
        'synthetic-oidc-issuer.ts'
      )
    ])
    const build = readFileSync(join(root, 'scripts/build-runtime.mjs'), 'utf8')
    expect(build).toContain("'src/**/__tests__/**'")
    expect(build).toContain("'src/**/*.test.ts'")
  })

  it('never reads NODE_EXTRA_CA_CERTS or injects a CA in production code', () => {
    const production = all.filter(
      (file) => file.startsWith(join('apps', 'api', 'src')) && !isTestCode(file)
    )
    const offenders = production.filter((file) =>
      /NODE_EXTRA_CA_CERTS|setDefaultCACertificates|createSecureContext|\bca\s*:/.test(
        readFileSync(join(root, file), 'utf8')
      )
    )
    expect(offenders).toEqual([])
  })

  it('never enables allowInsecureRequests', () => {
    const offenders = all.filter(
      (file) =>
        file !== SELF &&
        readFileSync(join(root, file), 'utf8').includes('allowInsecureRequests')
    )
    expect(offenders).toEqual([])
  })
})
