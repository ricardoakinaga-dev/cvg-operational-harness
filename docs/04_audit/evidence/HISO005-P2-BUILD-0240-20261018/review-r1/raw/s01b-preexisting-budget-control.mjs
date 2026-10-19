// S01b (caracterização, não-falha da 0240): mesmo layout de S01, mas o pacote NÃO tem
// `imports`; a v2 também o adquire e também perde o alias de produto. Mostra que o
// mecanismo (orçamento rígido compartilhado, census em profundidade) é preexistente;
// a 0240 amplia o conjunto de inputs onde ele dispara (S01) contra SPEC0240 §3.3.
import { V2, engine, freshRoot, input, link, saveRaw, summary, write } from './probe-lib.mjs'
const N = Number(process.argv[2] || 6000)
const root = freshRoot('s01b-v2-noimports-n' + N)
write(root, 'package.json', { name: 'synthetic-root', type: 'module', workspaces: ['packages/*', 'products/*'] })
write(root, 'entry.mjs', "import 'pkg';\nimport 'prodalias';\n")
write(root, 'node_modules/pkg/package.json', { name: 'pkg', type: 'module', exports: { '.': './index.mjs' } })
let index = ''
for (let i = 0; i < N; i++) { index += `import './f${i}.mjs';\n`; write(root, `node_modules/pkg/f${i}.mjs`, '') }
write(root, 'node_modules/pkg/index.mjs', index)
link(root, 'node_modules/prodalias', '../products/x')
write(root, 'products/x/package.json', { name: 'x', type: 'module' })
write(root, 'products/x/index.mjs', 'export const x=1;\n')
const result = { N, v2NoImports: summary(engine(V2, root, [input(root, ['entry.mjs'])])) }
console.log(JSON.stringify(result, null, 2))
saveRaw('s01b-preexisting-budget-control-n' + N, result)
