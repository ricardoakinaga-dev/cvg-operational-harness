import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'

const repositoryRoot = process.cwd()
const linkChecker = join(repositoryRoot, 'scripts/check-doc-links.mjs')
const hygieneChecker = join(
  repositoryRoot,
  'scripts/check-evidence-hygiene.mjs'
)

function run(command, args) {
  return spawnSync(process.execPath, [command, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  })
}

test('doc link checker resolves :line and fragment metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'rem21-017-links-'))
  mkdirSync(join(root, 'docs'))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'app.ts'), 'export const answer = 42\n')
  writeFileSync(
    join(root, 'docs', 'source.md'),
    '[line](../src/app.ts:1)\n[fragment](../src/app.ts#answer)\n'
  )

  const result = run(linkChecker, [join(root, 'docs')])
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.deepEqual(output.broken, [])
  assert.deepEqual(output.nonPortableAbsolute, [])
})

test('doc link checker keeps absolute and missing targets distinct', () => {
  const root = mkdtempSync(join(tmpdir(), 'rem21-017-negative-'))
  mkdirSync(join(root, 'docs'))
  writeFileSync(
    join(root, 'docs', 'source.md'),
    '[missing](../missing.ts:9)\n[absolute](/outside/file.ts:2)\n'
  )

  const result = run(linkChecker, [join(root, 'docs')])
  assert.equal(result.status, 1)
  const output = JSON.parse(result.stdout)
  assert.equal(output.broken.length, 1)
  assert.equal(output.broken[0].target, '../missing.ts:9')
  assert.equal(output.nonPortableAbsolute.length, 1)
  assert.equal(output.unallowlistedNonPortableAbsolute.length, 1)
})

test('doc link checker masks link syntax inside inline code and fences', () => {
  const root = mkdtempSync(join(tmpdir(), 'ra25-03-mask-'))
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'docs', 'real.md'), 'export const x = 1\n')
  writeFileSync(
    join(root, 'docs', 'grammar.md'),
    [
      'A extracao suporta somente `[label](destination)`,',
      'e tambem `[label](<destination>)` em prosa.',
      'Um `[label](` com sintaxe quebrada e erro, nao texto literal.',
      '     `[` nao escapado seguido na mesma linha por um primeiro `](` nao escapado',
      '     — falhar como `UNSUPPORTED_INDENTED_LINK` com arquivo/linha.',
      'Antes do fence.',
      '```md',
      '[broken](nao-existe-dentro-do-fence.md)',
      '```',
      'Depois do fence.',
      '[ok](real.md)',
      ''
    ].join('\n')
  )

  const result = run(linkChecker, [join(root, 'docs')])
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.deepEqual(output.broken, [])
  assert.deepEqual(output.unallowlistedNonPortableAbsolute, [])
})

test('doc link checker still rejects a real broken link next to code', () => {
  const root = mkdtempSync(join(tmpdir(), 'ra25-03-regression-'))
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'present.md'), 'export const present = 1\n')
  writeFileSync(
    join(root, 'docs', 'source.md'),
    [
      'Veja `[exemplo](nao-existe-no-code-span.md)` para contexto.',
      '```ts',
      'const link = "[exemplo](nao-existe-no-fence.md)"',
      '```',
      '[quebrado](nao-existe-de-verdade.md)',
      '[ok](../present.md)',
      ''
    ].join('\n')
  )

  const result = run(linkChecker, [join(root, 'docs')])
  assert.equal(result.status, 1)
  const output = JSON.parse(result.stdout)
  assert.equal(output.broken.length, 1, JSON.stringify(output.broken))
  assert.equal(output.broken[0].target, 'nao-existe-de-verdade.md')
})

test('doc link checker does not let a destination cross a line ending', () => {
  const root = mkdtempSync(join(tmpdir(), 'ra25-03-multiline-'))
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'docs', 'real.md'), 'export const x = 1\n')
  writeFileSync(
    join(root, 'docs', 'source.md'),
    'Veja [texto](parte-a\nparte-b) que atravessa linha.\n[ok](real.md)\n'
  )

  const result = run(linkChecker, [join(root, 'docs')])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout).broken, [])
})

test('doc link checker ignores unmatched backtick runs as literal text', () => {
  const root = mkdtempSync(join(tmpdir(), 'ra25-03-unpaired-'))
  mkdirSync(join(root, 'docs'))
  writeFileSync(
    join(root, 'docs', 'source.md'),
    'Conta ` impar e [quebrado](nao-existe-impar.md) ainda e detectado.\n'
  )

  const result = run(linkChecker, [join(root, 'docs')])
  assert.equal(result.status, 1)
  assert.equal(JSON.parse(result.stdout).broken.length, 1)
})

test('evidence hygiene requires explicit records for empty artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'rem21-017-evidence-'))
  writeFileSync(join(root, 'empty.log'), '')
  writeFileSync(join(root, 'valid.json'), '{"ok":true}\n')
  writeFileSync(
    join(root, 'empty-artifact-status.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        files: [
          {
            path: 'empty.log',
            bytes: 0,
            status: 'capture_missing',
            command: null,
            exitCode: null,
            timestamp: null,
            environment: null,
            reason: 'synthetic fixture has no capture metadata'
          }
        ]
      },
      null,
      2
    )
  )

  execFileSync(process.execPath, [hygieneChecker, root], {
    cwd: repositoryRoot,
    stdio: 'pipe'
  })
})

test('evidence hygiene rejects an unrecorded empty artifact', () => {
  const root = mkdtempSync(join(tmpdir(), 'rem21-017-evidence-red-'))
  writeFileSync(join(root, 'empty.log'), '')
  writeFileSync(
    join(root, 'empty-artifact-status.json'),
    JSON.stringify({ schemaVersion: 1, files: [] })
  )

  const result = run(hygieneChecker, [root])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /EVIDENCE_HYGIENE_FAILED/)
})
