// Crítica R2 HISO005-P2-BUILD-0240, C3: o census de recusa (createResolutionSession com
// refusalCensus:true) reproduz EXATAMENTE as recusas do helper v2 (84d8) — mesmo resultado
// (arquivo selecionado ou mensagem de erro) e mesmos callbacks onProduct/onNegativeTarget —
// nos casos da R1 (s02) e em casos de census negativo com pattern/nome divergente.
// Somente resolução; nenhum alvo é importado/executado.
import fs from 'node:fs'
import path from 'node:path'
import { V2, V3, freshRoot, helper, saveRaw, write } from './probe-lib.mjs'

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
// Casos extras de census negativo (ownerAt com nome divergente => onNegativeTarget/onProduct)
const extra = [
  ['X-misnamed-pattern-alias-product', { name: 'other', type: 'module', exports: { '.': './lib/index.mjs', './p/*': './p/*.mjs' } }, ''],
  ['X-misnamed-plain-alias-product', { name: 'other', type: 'module', exports: { '.': './lib/index.mjs' } }, ''],
  ['X-imports-alias-product', { name: 'demo', type: 'module', imports: {}, exports: { '.': './lib/index.mjs' } }, ''],
  ['X-imports-pattern-alias-product', { name: 'demo', type: 'module', imports: { '#a': './x.mjs' }, exports: { '.': './lib/index.mjs', './p/*': './p/*.mjs' } }, '']
]
const results = []
const run = (h, root, from, specifier, mode, census) => {
  const calls = []
  let s
  try {
    s = h.createResolutionSession({
      root,
      ...(census ? { refusalCensus: true } : {}),
      onProduct: (file, f) => calls.push(['product', file, f]),
      onNegativeTarget: (file, f) => calls.push(['negative', file, f])
    })
    const r = s.resolve({ from, specifier, mode })
    return { ok: true, file: r.file, calls }
  } catch (e) {
    return { ok: false, error: e.message, calls }
  } finally {
    try { s?.close() } catch {}
  }
}
const add = (id, root, from, specifier, mode) => {
  const v2 = run(h2, root, from, specifier, mode, false)
  const census = run(h3, root, from, specifier, mode, true)
  const refinement = run(h3, root, from, specifier, mode, false)
  results.push({ id, specifier, mode, v2, census, refinement, censusEqualsV2: JSON.stringify(v2) === JSON.stringify(census) })
}
for (const [id, , , extraManifest, suffix, mode = 'import'] of cases) {
  const root = freshRoot('c3-' + results.length)
  write(root, 'package.json', { name: 'synthetic-root', type: 'module' })
  const from = mode === 'import' ? 'entry.mjs' : 'entry.cjs'
  write(root, from, '')
  write(root, 'node_modules/demo/package.json', { ...base(mode), ...extraManifest })
  for (const [f, b] of Object.entries(files(mode))) write(root, 'node_modules/demo/' + f, b)
  write(root, 'node_modules/demo/x.cjs', 'module.exports=1;')
  add(id, root, from, suffix === null ? '#unused/tools' : 'demo' + suffix, mode)
}
for (const [id, manifest, suffix] of extra) {
  const root = freshRoot('c3-' + results.length)
  write(root, 'package.json', { name: 'synthetic-root', type: 'module' })
  write(root, 'entry.mjs', '')
  write(root, 'node_modules/demo/package.json', manifest)
  write(root, 'products/z/package.json', { name: 'z', type: 'module' })
  write(root, 'products/z/index.mjs', 'export const z=1;')
  fs.symlinkSync('../../products/z', path.join(root, 'node_modules/demo/lib'))
  add(id, root, 'entry.mjs', 'demo' + suffix, 'import')
}
const mismatches = results.filter((r) => !r.censusEqualsV2)
const summary = {
  total: results.length,
  censusEqualsV2: results.length - mismatches.length,
  mismatches: mismatches.map((r) => ({ id: r.id, v2: r.v2, census: r.census })),
  refinementAddsOnly: results.filter((r) => JSON.stringify(r.refinement) !== JSON.stringify(r.v2)).map((r) => ({ id: r.id, v2: r.v2.ok ? r.v2.file : r.v2.error, refinement: r.refinement.ok ? r.refinement.file : r.refinement.error, v2Products: r.v2.calls.filter((c) => c[0] === 'product').length, refinementProducts: r.refinement.calls.filter((c) => c[0] === 'product').length }))
}
console.log(JSON.stringify(summary, null, 2))
saveRaw('r2-C3-census-equals-v2-helper', { summary, results })
void fs
