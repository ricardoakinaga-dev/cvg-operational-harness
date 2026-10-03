import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { auditProductBoundary } from '/home/ricardo/Área de trabalho/cvg-operational-harness/scripts/check-product-boundary.mjs'
const lane = '/tmp/cvg-harness-iso-exec-20261003/t2-critic-r1'
const cases = [
 ['positive', {}],
 ['direct-control', {'packages/core/src/index.mjs': "export * from '../../../products/shift/src/index.mjs'\n"}],
 ['transitive-scripts', {'packages/core/src/index.mjs': "export * from '../../../scripts/bridge.mjs'\n", 'scripts/bridge.mjs': "export * from '../products/shift/src/index.mjs'\n"}],
 ['createRequire-literal', {'packages/core/src/index.mjs': "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); export const use = load('../../../products/shift/src/loaded.cjs').use\n",'products/shift/src/loaded.cjs': 'exports.use = "PRODUCT_LOADED"\n'}],
 ['createRequire-unknown', {'packages/core/src/index.mjs': "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); const target = '../../../products/shift/src/loaded.cjs'; export const use = load(target).use\n",'products/shift/src/loaded.cjs': 'exports.use = "PRODUCT_LOADED"\n'}],
 ['type-declaration-bridge', {'packages/core/src/index.ts': "export type { Value } from '../../../scripts/bridge.d.ts'\n", 'scripts/bridge.d.ts': "export type { Value } from '../products/shift/src/value.ts'\n", 'products/shift/src/value.ts': 'export type Value = string\n'}]
]
const results=[]
for (const [name, extra] of cases) {
 const root=path.join(lane,'fixtures',name)
 const files={
 'package.json': JSON.stringify({workspaces:['packages/*','products/*']}),
 'packages/core/package.json':JSON.stringify({name:'@neutral/core',type:'module'}),
 'products/shift/package.json':JSON.stringify({name:'@private/product',type:'module'}),
 'packages/core/src/index.mjs':'export const use = "CORE_ONLY"\n',
 'products/shift/src/index.mjs':'export const use = "PRODUCT_LOADED"\n', ...extra}
 for(const [p,content] of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),content)}
 const audit=auditProductBoundary(root)
 const entry=path.join(root,'packages/core/src/index.mjs')
 const runtime=spawnSync(process.execPath,['--input-type=module','-e',`import {use} from ${JSON.stringify(entry)}; console.log(use)`],{encoding:'utf8'})
 results.push({name,audit,runtime:{status:runtime.status,stdout:runtime.stdout.trim(),stderr:runtime.stderr.trim()}})
}
fs.writeFileSync(path.join(lane,'boundary-probes.json'),JSON.stringify(results,null,2)+'\n')
console.log(JSON.stringify(results,null,2))
