import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const scratch = path.dirname(new URL(import.meta.url).pathname)
const candidate = path.join(scratch, '../candidate')
const checker = path.join(candidate, 'scripts/check-product-boundary.mjs')
const packetPath = '/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/c1-posterior-review-packet.json'
const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'))
const { auditProductBoundary } = await import(pathToFileURL(checker))
const raw = path.join(scratch, 'raw')
fs.mkdirSync(raw, { recursive: true })
const results = []
const env = { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin', HOME: scratch, LANG: 'C.UTF-8' }
function run(id, root, expected, runtimeEntry, runtimeEnv = {}) {
  let api, error
  try { api = auditProductBoundary(root) } catch (e) { error = e.message }
  fs.writeFileSync(path.join(raw, id + '.api.json'), JSON.stringify({ result: api, error }, null, 2) + '\n')
  const cli = spawnSync(process.execPath, [checker, root], { cwd: scratch, env, encoding: 'utf8', timeout: 45000, maxBuffer: 16 * 1024 * 1024 })
  fs.writeFileSync(path.join(raw, id + '.cli.stdout'), cli.stdout ?? '')
  fs.writeFileSync(path.join(raw, id + '.cli.stderr'), cli.stderr ?? '')
  let cliResult
  try { cliResult = JSON.parse(cli.stdout) } catch {}
  const aligned = !error && JSON.stringify(api) === JSON.stringify(cliResult)
  const matched = expected === 'PASS' ? api?.status === 'PASS' && cli.status === 0
    : expected === 'INCOMPLETE' ? api?.status === 'INCOMPLETE' && cli.status === 1
    : api?.passed === false && cli.status !== null && cli.status !== 0
  let runtime
  if (runtimeEntry) {
    const entry = path.join(root, runtimeEntry)
    const r = spawnSync(process.execPath, [entry], { cwd: root, env: { ...env, ...runtimeEnv }, encoding: 'utf8', timeout: 5000 })
    runtime = { command: [process.execPath, entry], env: runtimeEnv, exit: r.status, stdout: r.stdout, stderr: r.stderr, error: r.error?.message }
    fs.writeFileSync(path.join(raw, id + '.runtime.json'), JSON.stringify(runtime, null, 2) + '\n')
  }
  const row = { id, root, expected, apiStatus: api?.status, apiError: error, cliExit: cli.status, cliError: cli.error?.message, apiCliAligned: aligned, matched: matched && aligned, violations: api?.violations, diagnostics: api?.diagnostics, runtime }
  results.push(row)
  fs.writeFileSync(path.join(scratch, 'results.json'), JSON.stringify(results, null, 2) + '\n')
  console.log(JSON.stringify({ id, expected, api: api?.status ?? error, cli: cli.status, matched: row.matched, runtime: runtime?.stdout.trim() }))
}

run('public-root', candidate, 'PASS')
for (const c of packet.archivedCases) run('archived-' + c.id, path.join(scratch, 'fixtures', c.id), c.expectedReject ? 'REJECT' : 'PASS')

function fixture(id, contents) {
  const root = path.join(scratch, 'adversarial', id)
  fs.cpSync(path.join(scratch, 'fixtures/positive-neutral'), root, { recursive: true })
  for (const [rel, content] of Object.entries(contents)) {
    const file = path.join(root, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, typeof content === 'string' ? content + '\n' : JSON.stringify(content, null, 2) + '\n')
  }
  return root
}
const entry = 'packages/core/src/entry.cjs'
const product = '../../../products/shift/src/index.cjs'
const controls = [
  ['positive-alias-fixedpoint', `const first=require; let second; second=first; console.log(second('./neutral.cjs').marker)`, 'PASS', {}],
  ['negative-alias-fixedpoint', `const first=require; let second; second=first; console.log(second('${product}').marker)`, 'REJECT', {}],
  ['positive-module-host', `const first=module; const next=first; console.log(next['require']('./neutral.cjs').marker)`, 'PASS', {}],
  ['negative-module-host', `const first=module; const next=first; console.log(next['require']('${product}').marker)`, 'REJECT', {}],
  ['positive-namespace-factory', `const api=require('node:module'); const make=api.createRequire; const load=make(__filename); console.log(load('./neutral.cjs').marker)`, 'PASS', {}],
  ['negative-namespace-factory', `const api=require('node:module'); const make=api.createRequire; const load=make(__filename); console.log(load('${product}').marker)`, 'REJECT', {}],
  ['unknown-dynamic-import', `import(process.env.CRITIC_TARGET).then(x=>console.log(x.default.marker))`, 'INCOMPLETE', { CRITIC_TARGET: product }],
  ['unknown-computed-module-property', `module[process.env.CRITIC_PROPERTY](process.env.CRITIC_TARGET)`, 'INCOMPLETE', { CRITIC_PROPERTY: 'require', CRITIC_TARGET: product }],
  ['unknown-resolver-target', `const resolve=require.resolve; console.log(resolve(process.env.CRITIC_TARGET))`, 'INCOMPLETE', { CRITIC_TARGET: product }],
  ['positive-process-module-capability', `const api=process.getBuiltinModule('module'); const make=api.createRequire; const load=make(__filename); const again=load; console.log(again('./neutral.cjs').marker)`, 'PASS', {}],
  ['negative-process-module-capability', `const api=process.getBuiltinModule('module'); const make=api.createRequire; const load=make(__filename); const again=load; console.log(again('${product}').marker)`, 'REJECT', {}],
  ['unknown-process-module-capability-product', `const api=process.getBuiltinModule('module'); const make=api.createRequire; const load=make(__filename); console.log(load(process.env.CRITIC_TARGET).marker)`, 'INCOMPLETE', { CRITIC_TARGET: product }],
  ['unknown-process-module-capability-neutral', `const api=process.getBuiltinModule('module'); const make=api.createRequire; const load=make(__filename); console.log(load(process.env.CRITIC_TARGET).marker)`, 'INCOMPLETE', { CRITIC_TARGET: './neutral.cjs' }],
  ['negative-main-module-loader', `console.log(process.mainModule.require('${product}').marker)`, 'REJECT', {}],
  ['positive-domain-require', `const policy={require(action){return action}};console.log(policy.require('neutral'))`, 'PASS', {}]
]
for (const [id, source, expected, runtimeEnv] of controls) run(id, fixture(id, { [entry]: source }), expected, entry, runtimeEnv)

for (const extension of ['mjs', 'cjs']) {
  for (const negative of [false, true]) {
    const id = `${negative ? 'negative' : 'positive'}-runtime-declaration-${extension}`
    const bridge = extension === 'mjs'
      ? `import data from '../${negative ? 'products/shift/src/index' : 'packages/core/src/neutral'}.cjs';console.log(data.marker);export const marker=data.marker`
      : `module.exports=require('../${negative ? 'products/shift/src/index' : 'packages/core/src/neutral'}.cjs');console.log(module.exports.marker)`
    const root = fixture(id, { [entry]: `require('../../../tools/bridge.${extension}')`, [`tools/bridge.${extension}`]: bridge, [`tools/bridge.d.${extension === 'mjs' ? 'mts' : 'cts'}`]: 'export declare const marker:string' })
    run(id, root, negative ? 'REJECT' : 'PASS', entry)
  }
}
for (const negative of [false, true]) {
  const id = `${negative ? 'negative' : 'positive'}-type-closure`
  run(id, fixture(id, { 'packages/core/src/types.mts': "export type {Value} from '../../../tools/schema.d.mts'", 'tools/schema.d.mts': negative ? "export type {Value} from '../products/shift/src/types.d.mts'" : 'export interface Value {id:string}', 'products/shift/src/types.d.mts': 'export interface Value {id:string}' }), negative ? 'REJECT' : 'PASS')
}
run('positive-product-to-core', fixture('positive-product-to-core', { 'products/shift/src/index.cjs': "module.exports=require('../../../packages/core/src/neutral.cjs')" }), 'PASS')
run('unknown-declaration-only-runtime', fixture('unknown-declaration-only-runtime', { [entry]: "require('../../../tools/missing.cjs')", 'tools/missing.d.cts': 'export declare const marker:string' }), 'INCOMPLETE')

for (const mode of ['require', 'import']) {
  for (const negative of [false, true]) {
    const id = `${negative ? 'negative' : 'positive'}-physical-npm-${mode}`
    const runtimeFile = 'packages/core/src/entry.' + (mode === 'import' ? 'mjs' : 'cjs')
    const root = fixture(id, {
      [runtimeFile]: mode === 'import' ? "import value from 'bridge';console.log(value.marker)" : "console.log(require('bridge').marker)",
      'node_modules/bridge/package.json': { name: 'bridge', main: 'index.cjs', types: 'index.d.cts' },
      'node_modules/bridge/index.cjs': `module.exports=require('../../${negative ? 'products/shift/src/index' : 'packages/core/src/neutral'}.cjs')`,
      'node_modules/bridge/index.d.cts': 'declare const value:{marker:string};export=value'
    })
    run(id, root, negative ? 'REJECT' : 'PASS', runtimeFile)
  }
}
const id='negative-physical-npm-type-closure'
run(id, fixture(id, { 'packages/core/src/entry.mts': "export type {Value} from 'bridge'", 'node_modules/bridge/package.json': {name:'bridge', types:'index.d.mts'}, 'node_modules/bridge/index.d.mts': "export type {Value} from '../../products/shift/src/types.d.mts'", 'products/shift/src/types.d.mts': 'export interface Value {id:string}' }), 'REJECT')
console.log(JSON.stringify({ cases: results.length, matched: results.filter(r=>r.matched).length, gaps: results.filter(r=>!r.matched).map(r=>r.id) }))
