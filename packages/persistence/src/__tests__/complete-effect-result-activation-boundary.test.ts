// SPEC 0225 f4: activating storage version 1 is an operator step. No runtime
// path may execute the SQL that renderJournalResultActivation produces.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderJournalResultActivation } from '../operational-effect-result-guard.ts'

const root = resolve(process.cwd())
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'node_modules' || name === 'dist') return []
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|mjs|js)$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : []
  })
}

describe('journal result activation boundary', () => {
  it('renders text only: it takes no connection and has no side effect', () => {
    expect(renderJournalResultActivation.length).toBe(2)
    const rendered = renderJournalResultActivation('cvg_app', 'svc_journal')
    expect(Object.isFrozen(rendered)).toBe(true)
    expect(rendered.sql).toContain('SET search_path = pg_catalog, pg_temp')
    expect(rendered.sql).toContain('REVOKE ALL ON FUNCTION')
  })
  it('refuses identifiers outside the finite grammar', () => {
    for (const bad of [
      '',
      'A',
      '1a',
      'a-b',
      'a;b',
      "a'b",
      'a"b',
      'x'.repeat(64)
    ]) {
      expect(() => renderJournalResultActivation(bad, 'svc')).toThrow(
        /JOURNAL_STORAGE_MODE/
      )
      expect(() => renderJournalResultActivation('cvg_app', bad)).toThrow(
        /JOURNAL_STORAGE_MODE/
      )
    }
  })
  it('is used by no runtime source except to compare the installed body', () => {
    const users = ['apps', 'packages']
      .flatMap((top) => sources(join(root, top)))
      .filter((file) => !/__tests__|\.test\.|\/tests\//.test(file))
      .filter((file) =>
        readFileSync(file, 'utf8').includes('renderJournalResultActivation')
      )
      .map((file) => relative(root, file))
      .sort()
    expect(users).toEqual([
      'packages/persistence/src/operational-effect-result-guard.ts',
      'packages/persistence/src/operational-effect-result-readiness.ts'
    ])
    const readiness = readFileSync(
      join(
        root,
        'packages/persistence/src/operational-effect-result-readiness.ts'
      ),
      'utf8'
    )
    const call = readiness.slice(
      readiness.indexOf('renderJournalResultActivation(')
    )
    expect(call).not.toMatch(/expected\.sql/)
    expect(readiness).not.toMatch(/\.sql\b(?!ite)/)
  })
})
