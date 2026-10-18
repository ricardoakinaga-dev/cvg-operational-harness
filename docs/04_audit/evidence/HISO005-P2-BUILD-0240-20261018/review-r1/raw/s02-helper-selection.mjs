// S02 (RC1/MS01-MS03): seleção do helper v3 vs v2 vs oracle Node22 (só resolução).
// Cada caso cria um pacote node_modules/demo próprio; nenhum alvo é importado/executado.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { V2, V3, freshRoot, helper, oracle, saveRaw, write } from './probe-lib.mjs'

const h3 = await helper(V3)
const h2 = await helper(V2)
const base = (mode) => ({
  name: 'demo',
  type: mode === 'import' ? 'module' : 'commonjs'
})
const files = (mode) => {
  const ext = mode === 'import' ? 'mjs' : 'cjs'
  const body = mode === 'import' ? 'export const a=1;' : 'module.exports=1;'
  return {
    ['chosen.' + ext]: body,
    ['other.' + ext]: body,
    ['x.' + ext]: body,
    ['y.' + ext]: body,
    ['x.d.ts']: 'export {}'
  }
}
// [id, criterion, expectOk, manifestExtra, specifierSuffix, mode]
const E = './chosen.mjs'
const cases = [
  ['P1-imports-empty', 'MS01', true, { imports: {}, exports: { '.': E } }, ''],
  ['P2-imports-elig+pattern', 'MS01', true, { imports: { '#unused/tools': { arbitrary: [null, 17] }, '#a': './x.mjs' }, exports: { '.': E, './unused/*': { u: [null, 17] } } }, ''],
  ['P3-pattern-only-inactive', 'MS01', true, { exports: { './sub': E, './x/*': './x/*.mjs' } }, '/sub'],
  ['P4-exact-beats-pattern', 'MS03', true, { exports: { './x': './x.mjs', './*': './y.mjs' } }, '/x'],
  ['P5-cjs-both', 'MS01', true, { type: 'commonjs', imports: { '#q': 'v' }, exports: { '.': { require: './chosen.cjs' }, './p/*': null } }, '', 'require'],
  // imports inelegíveis (§3.1)
  ...[
    ['#', 1], ['#/', 1], ['#a/', 1], ['#a/*', 1], ['#a//b', 1], ['#node_modules', 1],
    ['#NODE_modules', 1], ['#..', 1], ['#a/./b', 1], ['#a%20', 1], ['#á', 1], ['#a b', 1],
    ['#a\\b', 1], ['#a?x', 1], ['#a#b', 1], ['a', 1], ['#a\u0001', 1]
  ].map(([k], i) => ['N-imports-key-' + i + ':' + JSON.stringify(k), 'MS02', false, { imports: { [k]: './x.mjs' }, exports: { '.': E } }, '']),
  ...[[], null, 'str', 1, true].map((v, i) => ['N-imports-value-' + i + ':' + JSON.stringify(v), 'MS02', false, { imports: v, exports: { '.': E } }, '']),
  ['N-browser+imports', 'MS04', false, { browser: {}, imports: {}, exports: { '.': E } }, ''],
  // exports: pattern não selecionado sem chave exata → sem matching
  ['N-pattern-would-match', 'MS02', false, { imports: {}, exports: { '.': E, './*': './*.mjs' } }, '/x'],
  ['N-pattern-prefix-would-match', 'MS02', false, { exports: { './x/*': './x.mjs' } }, '/x/y'],
  // chaves de pattern malformadas / múltiplas
  ...['./a/*/*', './**', './a*b*', './a/', './node_modules/*', './../*', './a//*', './%2a*', './*/', './ *', './á*', './', './/*', './*/..', './NODE_MODULES/*']
    .map((k, i) => ['N-exports-key-' + i + ':' + k, 'MS03', false, { exports: { '.': E, './x': './x.mjs', [k]: './y.mjs' } }, '/x']),
  ['N-mixed-dot-conditions', 'MS03', false, { exports: { '.': E, import: './other.mjs' } }, ''],
  ['N-mixed-empty-key', 'MS03', false, { exports: { '.': E, '': './other.mjs' } }, ''],
  ['N-selected-array', 'MS02', false, { exports: { './x': ['./x.mjs'], './*': './*.mjs' } }, '/x'],
  ['N-selected-null', 'MS02', false, { exports: { './x': null, './*': './*.mjs' } }, '/x'],
  ['N-selected-cond-unmatched', 'MS02', false, { exports: { './x': { browser: './x.mjs' }, './*': './*.mjs' } }, '/x'],
  ['N-selected-numeric', 'MS02', false, { exports: { './x': { 0: './x.mjs' }, './*': './*.mjs' } }, '/x'],
  ['N-selected-nested-pattern', 'MS02', false, { exports: { './x': { import: { './*': './x.mjs' } }, './*': './*.mjs' } }, '/x'],
  ['N-target-star-literal', 'MS02', false, { exports: { './x': './*.mjs', './*': './*.mjs' } }, '/x'],
  ['N-target-percent', 'MS02', false, { exports: { './x': './%78.mjs', './*': './*.mjs' } }, '/x'],
  ['N-target-tab', 'MS02', false, { exports: { './x': './x\t.mjs', './*': './*.mjs' } }, '/x'],
  ['N-target-escape', 'MS02', false, { exports: { './x': './../demo/x.mjs', './*': './*.mjs' } }, '/x'],
  ['N-target-dts', 'MS04', false, { exports: { './x': './x.d.ts', './*': './*.mjs' } }, '/x'],
  ['N-target-missing', 'MS06', false, { exports: { './x': './missing.mjs', './*': './*.mjs' } }, '/x'],
  ['N-request-hash', 'MS02', false, { imports: { '#unused/tools': './x.mjs' }, exports: { '.': E } }, null],
  ['N-interop-esm-to-cjs', 'MS04', false, { imports: {}, exports: { './x': './x.cjs' } }, '/x']
]
const results = []
for (const [id, criterion, expectOk, extra, suffix, mode = 'import'] of cases) {
  const root = freshRoot('s02-' + results.length)
  write(root, 'package.json', { name: 'synthetic-root', type: 'module' })
  const from = mode === 'import' ? 'entry.mjs' : 'entry.cjs'
  write(root, from, '')
  const manifest = { ...base(mode), ...extra }
  write(root, 'node_modules/demo/package.json', manifest)
  for (const [f, b] of Object.entries(files(mode)))
    write(root, 'node_modules/demo/' + f, b)
  write(root, 'node_modules/demo/x.cjs', 'module.exports=1;')
  const specifier = suffix === null ? '#unused/tools' : 'demo' + suffix
  const run = (h) => {
    let s
    try {
      s = h.createResolutionSession({ root })
      const r = s.resolve({ from, specifier, mode })
      return { ok: true, file: r.file, trace: r.trace }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      try { s?.close() } catch {}
    }
  }
  const v3 = run(h3),
    v2 = run(h2)
  const node = oracle(root, from, specifier, mode)
  const nodeFile =
    node.value === undefined
      ? null
      : mode === 'import'
        ? node.value
        : pathToFileURL(node.value).href
  const v3URL = v3.ok ? v3.trace.canonicalURL : null
  const pass = expectOk
    ? v3.ok && v3URL === nodeFile && !v2.ok
    : !v3.ok
  // P3/P4 são pré-0240 positivos já na v2? registra sem exigir v2 vermelho quando sem metadados novos
  results.push({
    id,
    criterion,
    specifier,
    mode,
    expectOk,
    v3: v3.ok ? { ok: true, file: v3.file, canonicalURL: v3URL, branch: v3.trace.branch, metadataSelection: v3.trace.metadataSelection } : v3,
    v2: v2.ok ? { ok: true, file: v2.file } : v2,
    node,
    v3MatchesNode: v3.ok ? v3URL === nodeFile : null,
    pass
  })
}
const failed = results.filter((r) => !r.pass)
console.log(JSON.stringify({ total: results.length, failed: failed.map((r) => ({ id: r.id, v3: r.v3, v2: r.v2, node: r.node })) }, null, 2))
saveRaw('s02-helper-selection', { total: results.length, failedIds: failed.map((r) => r.id), results })
fs.writeFileSync('/dev/null', '')
void path
