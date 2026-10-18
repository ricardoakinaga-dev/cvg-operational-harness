// S06 (RC1/RC5): perfil customizado (--conditions/NODE_OPTIONS) continua UNKNOWN no positivo
// v3; modo default/P1 do checker (sem --semantic) byte-igual entre v2(84d8) e v3 no mesmo input.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { NODE, V2, V3, ENV, freshRoot, link, saveRaw, write } from './probe-lib.mjs'
const ENGINE_CODE = 'const fs=require("node:fs");const e=require(process.argv[1]);const p=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(e[p.method](...p.args)));'
function build(root) {
  write(root, 'package.json', { name: 'synthetic-root', type: 'module', workspaces: ['packages/*', 'products/*'] })
  write(root, 'packages/demo/package.json', { name: 'demo', type: 'module', imports: { '#u': { a: 1 } }, exports: { '.': './chosen.mjs', './u/*': null } })
  write(root, 'packages/demo/chosen.mjs', 'export const a=1;')
  write(root, 'packages/demo/index.mjs', "import {a} from 'demo';export const r=a;")
  write(root, 'products/p/package.json', { name: 'p', type: 'module' })
  write(root, 'products/p/index.mjs', 'export const p=1;')
  write(root, 'packages/consumer/package.json', { name: 'consumer', type: 'module' })
  write(root, 'packages/consumer/index.mjs', "import '../../products/p/index.mjs';")
  link(root, 'node_modules/demo', '../packages/demo')
  write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
}
const root = freshRoot('s06-profile')
build(root)
const input = { root, starts: ['entry.mjs'], installed: [], origins: [], compiled: { status: 'UNAVAILABLE', files: [] } }
const run = (args, env) => {
  const r = spawnSync(NODE, [...args, '-e', ENGINE_CODE, path.join(V3, 'scripts/boundary-semantic-engine.mjs')], { input: JSON.stringify({ method: 'runSemanticBoundary', args: [input] }), cwd: root, env, encoding: 'utf8', timeout: 120000 })
  try { const o = JSON.parse(r.stdout); return { status: o.status, proofs: o.proofs.length, unknowns: o.unknowns.map((u) => u.reason) } } catch { return { exit: r.status, stderr: r.stderr.slice(0, 300) } }
}
const rows = {
  plain: run([], ENV),
  conditionsFlag: run(['--conditions=custom'], ENV),
  nodeOptions: run([], { ...ENV, NODE_OPTIONS: '--conditions=custom' })
}
// default/P1 checker sem --semantic: mesmo fixture, árvores diferentes (cópias idênticas do fixture).
const p1 = {}
for (const [tag, tree] of [['v2', V2], ['v3', V3]]) {
  const r = freshRoot('s06-p1-' + tag)
  build(r)
  const res = spawnSync(NODE, [path.join(tree, 'scripts/check-product-boundary.mjs'), r], { cwd: r, env: ENV, encoding: 'utf8', timeout: 120000 })
  p1[tag] = { exit: res.status, stdout: res.stdout.split(r).join('<ROOT>'), stderr: res.stderr.split(r).join('<ROOT>') }
}
const result = { rows, p1: { v2: p1.v2, v3: p1.v3, byteEqualAfterRootNormalization: p1.v2.stdout === p1.v3.stdout && p1.v2.stderr === p1.v3.stderr && p1.v2.exit === p1.v3.exit } }
console.log(JSON.stringify(result, null, 2).slice(0, 4000))
saveRaw('s06-profile-and-default', result)
void fs
