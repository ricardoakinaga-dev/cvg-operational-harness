// S05 (RC3/MS05/MS07): produto JÁ conhecido (alias descoberto primeiro) é perdido quando o
// novo percurso positivo (imports elegível) consome o orçamento de tempo do worker: o pai
// devolve empty() com violations=[] por timeout. Mesmo input e mesmo limits.timeoutMs na v2
// (84d8) resulta VIOLATION. Uso: node s05-known-product-lost-by-timeout.mjs <N> <timeoutMs>
import { V2, V3, engine, freshRoot, input, link, saveRaw, summary, write } from './probe-lib.mjs'
const N = Number(process.argv[2] || 3000)
const timeoutMs = Number(process.argv[3] || 5000)
function build(tag) {
  const root = freshRoot('s05-' + tag + '-n' + N)
  write(root, 'package.json', { name: 'synthetic-root', type: 'module', workspaces: ['packages/*', 'products/*'] })
  // Ordem AST: alias de produto PRIMEIRO (produto conhecido), depois o pacote com imports elegível.
  write(root, 'entry.mjs', "import 'prodalias';\nimport 'pkg';\n")
  write(root, 'node_modules/pkg/package.json', { name: 'pkg', type: 'module', imports: {}, exports: { '.': './index.mjs' } })
  let index = ''
  for (let i = 0; i < N; i++) { index += `import './f${i}.mjs';\n`; write(root, `node_modules/pkg/f${i}.mjs`, '') }
  write(root, 'node_modules/pkg/index.mjs', index)
  link(root, 'node_modules/prodalias', '../products/x')
  write(root, 'products/x/package.json', { name: 'x', type: 'module' })
  write(root, 'products/x/index.mjs', 'export const x=1;\n')
  return root
}
const result = { N, timeoutMs, runs: {} }
for (const [tag, tree] of [['v2', V2], ['v3', V3]]) {
  const root = build(tag)
  result.runs[tag] = { tree, root, ...summary(engine(tree, root, [input(root, ['entry.mjs'], { limits: { timeoutMs } })])) }
}
result.v2ViolationRetainedByV3 = JSON.stringify(result.runs.v2.violations) === JSON.stringify(result.runs.v3.violations)
console.log(JSON.stringify(result, null, 2))
saveRaw('s05-known-product-lost-by-timeout-n' + N + '-t' + timeoutMs, result)
