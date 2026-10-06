import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8')

describe('secret scan configuration (PR-011)', () => {
  it('keeps every default Gitleaks rule and scopes allowlists to generic-api-key', () => {
    const config = read('.gitleaks.toml')

    expect(config).toMatch(/\[extend\]\s*\nuseDefault = true/)
    expect(config.match(/^\[\[rules\]\]$/gm)).toHaveLength(1)
    expect(config).toContain('id = "generic-api-key"')
    expect(config).not.toMatch(/^\[\[allowlists\]\]/m)
    expect(config).not.toMatch(/^\[allowlist\]/m)
  })

  it('pins the scanner version and pins single findings by fingerprint', () => {
    expect(read('.github/workflows/security.yml')).toContain(
      'GITLEAKS_VERSION: 8.28.0'
    )
    // Fingerprints carry the commit: the scan needs real history (PROD-0373).
    const secretScan = read('.github/workflows/security.yml').split(
      '  codeql:'
    )[0]
    expect(secretScan).toMatch(/fetch-depth: 0/)
    const fingerprints = read('.gitleaksignore')
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
    expect(fingerprints.length).toBeGreaterThan(0)
    for (const fingerprint of fingerprints) {
      expect(fingerprint).toMatch(/^[0-9a-f]{40}:[^:]+:generic-api-key:\d+$/)
    }
  })

  it('keeps CodeQL on the product and off the frozen audit evidence copies', () => {
    expect(read('.github/workflows/security.yml')).toContain(
      'config-file: ./.github/codeql/codeql-config.yml'
    )
    const config = read('.github/codeql/codeql-config.yml')
    const ignored = [...config.matchAll(/^\s+- (.+)$/gm)].map((m) => m[1])
    expect(ignored).toEqual(['docs/04_audit/evidence/**'])
  })
})
