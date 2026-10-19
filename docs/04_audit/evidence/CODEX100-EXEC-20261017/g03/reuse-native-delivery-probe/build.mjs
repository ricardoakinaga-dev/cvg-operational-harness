import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'

const repo = process.cwd()
const lane = path.join(repo, 'docs/04_audit/evidence/CODEX100-EXEC-20261017/g03/reuse-native-delivery-probe')
const resource = '/tmp/cvg-codex100-exec-20261017/reuse-native-delivery-probe'
const view = path.join(resource, 'source-view')
const require = createRequire(path.join(repo, 'package.json'))
const esbuild = require('esbuild')
if (esbuild.version !== '0.28.2' || process.versions.node !== '22.23.2') throw Error('Tool version differs')
const hash = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const before = JSON.parse(fs.readFileSync(path.join(resource, 'source-view-inputs.json')))
const byPath = new Map(before.map(row => [path.join(view, row.path), row]))
const alias = {}
for (const name of ['contracts', 'harness', 'orchestrator', 'shared']) {
  const pkg = path.join(view, 'packages', name)
  if (fs.existsSync(path.join(pkg, 'package.json'))) alias[JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'))).name] = path.join(pkg, 'src/index.ts')
}
const fixture = path.join(lane, 'probe.ts')
const fixtureHash = hash(fixture)
const result = await esbuild.build({ entryPoints: [fixture], outfile: path.join(resource, 'probe.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22', alias, metafile: true, packages: 'bundle', plugins: [], logLevel: 'silent' })
const inputs = Object.keys(result.metafile.inputs).map(p => {
  const absolute = path.resolve(repo, p)
  const row = byPath.get(absolute)
  if (absolute === fixture) return { path: absolute, role: 'OWN_DIAGNOSTIC_FIXTURE', sha256: fixtureHash }
  if (!row || row.sha256 !== hash(absolute) || absolute.includes('/dist/')) throw Error('Unbound bundle input: ' + absolute)
  return { path: absolute, role: row.role, sha256: row.sha256, bytes: row.bytes }
})
if (hash(fixture) !== fixtureHash) throw Error('Fixture changed while bundling')
const externals = Object.values(result.metafile.outputs).flatMap(o => o.imports).filter(i => i.external)
if (externals.some(i => !i.path.startsWith('node:'))) throw Error('Non-node external dependency')
fs.writeFileSync(path.join(resource, 'metafile.json'), JSON.stringify(result.metafile, null, 2) + '\n')
fs.writeFileSync(path.join(resource, 'bundle-provenance.json'), JSON.stringify({ kind: 'R19_CORE_PLUS_EXPLICIT_DEPENDENCY_SNAPSHOT_NOT_ORIGINAL_FULL_R19_CERTIFICATE', inputs, externals, aliases: alias, plugins: [], node: process.version, esbuild: esbuild.version, tools: [require.resolve('esbuild'), path.join(repo, 'node_modules/@esbuild/linux-x64/bin/esbuild'), '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'].map(p => ({ path: fs.realpathSync(p), sha256: hash(p) })), bundle: { path: path.join(resource, 'probe.mjs'), sha256: hash(path.join(resource, 'probe.mjs')) } }, null, 2) + '\n')
await esbuild.stop()
console.log(JSON.stringify({ inputs: inputs.length, frozenR19Inputs: inputs.filter(i => i.role === 'FROZEN_R19').length, explicitAdditionalInputs: inputs.filter(i => i.role === 'EXPLICIT_PEER_DEPENDENCY_SNAPSHOT').length, bundleSha256: hash(path.join(resource, 'probe.mjs')) }))
