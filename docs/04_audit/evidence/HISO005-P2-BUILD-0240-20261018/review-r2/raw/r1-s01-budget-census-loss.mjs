// S01 (RC3/MS05): o novo percurso positivo (imports elegível) consome o orçamento
// físico rígido compartilhado do helper (maxFiles=12000 cargas) e oculta uma violação
// de produto (alias node_modules/prodalias -> ../products/x) que a v2 descobre nos
// MESMOS inputs e limites padrão. Uso: node s01-budget-census-loss.mjs <N>
import {
  V2,
  V3,
  engine,
  freshRoot,
  input,
  link,
  saveRaw,
  summary,
  write
} from './probe-lib.mjs'

const N = Number(process.argv[2] || 6500)
function build(tag) {
  const root = freshRoot('s01-' + tag + '-n' + N)
  write(root, 'package.json', {
    name: 'synthetic-root',
    type: 'module',
    workspaces: ['packages/*', 'products/*']
  })
  // Ordem AST: primeiro o pacote com imports elegível, depois o alias de produto.
  write(root, 'entry.mjs', "import 'pkg';\nimport 'prodalias';\n")
  write(root, 'node_modules/pkg/package.json', {
    name: 'pkg',
    type: 'module',
    imports: {},
    exports: { '.': './index.mjs' }
  })
  let index = ''
  for (let i = 0; i < N; i++) {
    index += `import './f${i}.mjs';\n`
    write(root, `node_modules/pkg/f${i}.mjs`, '')
  }
  write(root, 'node_modules/pkg/index.mjs', index)
  link(root, 'node_modules/prodalias', '../products/x')
  write(root, 'products/x/package.json', { name: 'x', type: 'module' })
  write(root, 'products/x/index.mjs', 'export const x=1;\n')
  return root
}
const result = { N, runs: {} }
for (const [tag, tree] of [
  ['v2', V2],
  ['v3', V3]
]) {
  const root = build(tag)
  const out = engine(tree, root, [input(root, ['entry.mjs'])])
  result.runs[tag] = {
    tree,
    root,
    ...summary(out),
    resolutionUsage: out.usage?.resolution
  }
}
const productV2 = result.runs.v2.violations?.length || 0
const productV3 = result.runs.v3.violations?.length || 0
result.v2ViolationRetainedByV3 =
  JSON.stringify(result.runs.v2.violations) ===
  JSON.stringify(result.runs.v3.violations)
result.counts = { productV2, productV3 }
console.log(JSON.stringify(result, null, 2))
saveRaw('s01-budget-census-loss-n' + N, result)
