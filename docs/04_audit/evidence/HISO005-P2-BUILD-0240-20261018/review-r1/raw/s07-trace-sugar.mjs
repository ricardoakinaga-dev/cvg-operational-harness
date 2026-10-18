// S07 (RC4 trace, opcional): metadataSelection.exports para exports string/condicional (sugar),
// onde não existe chave própria no mapa: selectedKey registra o subpath requisitado.
import { V3, freshRoot, helper, saveRaw, write } from './probe-lib.mjs'
const h3 = await helper(V3)
const rows = []
for (const [id, exportsValue] of [['string-sugar', './chosen.mjs'], ['conditional-sugar', { import: './chosen.mjs', default: './other.mjs' }], ['map', { '.': './chosen.mjs', './u/*': null }]]) {
  const root = freshRoot('s07-' + id)
  write(root, 'package.json', { name: 'synthetic-root', type: 'module' })
  write(root, 'entry.mjs', '')
  write(root, 'node_modules/demo/package.json', { name: 'demo', type: 'module', exports: exportsValue })
  write(root, 'node_modules/demo/chosen.mjs', 'export const a=1;')
  write(root, 'node_modules/demo/other.mjs', 'export const a=0;')
  const s = h3.createResolutionSession({ root })
  try {
    const r = s.resolve({ from: 'entry.mjs', specifier: 'demo', mode: 'import' })
    rows.push({ id, branch: r.trace.branch, metadataSelection: r.trace.metadataSelection })
  } finally { s.close() }
}
console.log(JSON.stringify(rows, null, 1))
saveRaw('s07-trace-sugar', rows)
