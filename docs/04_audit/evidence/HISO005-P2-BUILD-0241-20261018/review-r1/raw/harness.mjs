// HISO005-P2-BUILD-0241 review R1 — probe harness (critic-owned).
// Fixtures live in the critic runtime dir. Engine methods run in a fresh
// pinned Node whose load hook refuses every file: URL outside the engine dir
// (except the pinned parser), so analysed targets are read as bytes only.
// Optional OS-fault injection patches fs.openSync in the caller process only.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

export const NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
export const RT = '/mnt/dados/cvg-work/cvg-hiso005-build0241-runtime-20261018/review-r1'
export const V4DIR = '/mnt/dados/cvg-work/cvg-hiso005-build0241-20261018'
export const V4 = V4DIR + '/scripts/boundary-semantic-engine.mjs'
export const V4PARSER = V4DIR + '/node_modules/typescript/lib/typescript.js'
export const V3DIR = '/mnt/dados/cvg-work/cvg-hiso005-build0241-runtime-20261018/baseline-tools-v3-af63'
export const V3 = V3DIR + '/scripts/boundary-semantic-engine.mjs'
export const V3PARSER = V3DIR + '/node_modules/typescript/lib/typescript.js'
export const sha = (b) => createHash('sha256').update(b).digest('hex')
export const env = () => ({
  PATH: path.dirname(NODE) + ':/usr/bin:/bin',
  LANG: 'C',
  LC_ALL: 'C',
  TZ: 'UTC',
  TMPDIR: RT + '/tmp'
})
const CALLER =
  "import fs from 'node:fs';import{registerHooks}from'node:module';import{pathToFileURL}from'node:url';" +
  'const[engine,parser]=process.argv.slice(1);const dir=pathToFileURL(engine.slice(0,engine.lastIndexOf("/")+1)).href;' +
  'const parserURL=pathToFileURL(parser).href;let blocked=0;' +
  "registerHooks({load(u,c,next){if(u.startsWith('file:')&&!u.startsWith(dir)&&u!==parserURL){blocked++;throw Error('TARGET_LOAD_FORBIDDEN')}return next(u,c)}});" +
  "const req=JSON.parse(fs.readFileSync(0,'utf8'));" +
  'if(req.fault){const f=req.fault,open=fs.openSync;let n=0;fs.openSync=function(file,...rest){' +
  "if(String(file).endsWith('/'+f.leaf)&&++n===f.at){if(f.code)throw Object.assign(Error('injected OS fault'),{code:f.code})}" +
  'return open.call(this,file,...rest)}}' +
  'const e=await import(pathToFileURL(engine).href);' +
  'const results=req.calls.map((c)=>{try{return{ok:e[c.method](...c.args)}}catch(err){return{error:String(err&&err.message)}}});' +
  'process.stdout.write(JSON.stringify({results,blocked}))'

export function call(engine, calls, { fault } = {}) {
  const parser = engine === V3 ? V3PARSER : V4PARSER
  const r = spawnSync(NODE, ['--input-type=module', '-e', CALLER, engine, parser], {
    input: JSON.stringify({ calls, fault }),
    cwd: RT + '/tmp',
    env: env(),
    encoding: 'utf8',
    timeout: 600000,
    maxBuffer: 256 * 1024 ** 2
  })
  if (r.status !== 0) throw Error('caller failed: ' + r.status + ' ' + r.stderr)
  const out = JSON.parse(r.stdout)
  if (out.blocked !== 0) throw Error('blocked target load: ' + out.blocked)
  return out.results.map((x) => {
    if (x.error) throw Error('engine method threw: ' + x.error)
    return x.ok
  })
}
export const run = (engine, inputs, opts) =>
  call(engine, inputs.map((i) => ({ method: 'runSemanticBoundary', args: [i] })), opts)
export const census = (engine, inputs, opts) =>
  call(
    engine,
    inputs.map((i) => ({ method: 'analyzeSemanticBoundary', args: [i, { refusalCensus: true }] })),
    opts
  )
export const analyze = (engine, inputs, opts) =>
  call(engine, inputs.map((i) => ({ method: 'analyzeSemanticBoundary', args: [i] })), opts)

export const ROOTPKG = { name: 'fixture-root', private: true, type: 'module' }
export const pkg = (name, extra = {}) => ({ name, version: '1.0.0', type: 'module', ...extra })
export function write(root, file, value) {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value))
  return target
}
export function fixture(group, name, files, options = {}) {
  const root = path.join(RT, 'fixtures', group, name)
  fs.rmSync(root, { recursive: true, force: true })
  fs.mkdirSync(root, { recursive: true })
  const real = fs.realpathSync(root)
  if (!Object.hasOwn(files, 'package.json')) write(real, 'package.json', options.rootPkg || ROOTPKG)
  for (const [file, value] of Object.entries(files)) write(real, file, value)
  for (const [file, target] of Object.entries(options.links || {})) {
    fs.mkdirSync(path.dirname(path.join(real, file)), { recursive: true })
    fs.symlinkSync(target, path.join(real, file))
  }
  return {
    root: real,
    starts: options.starts || ['entry.mjs'],
    origins: [],
    installed: options.installed || [],
    ...(options.compiled ? { compiled: options.compiled } : {}),
    ...(options.limits ? { limits: options.limits } : {}),
    ...(options.resolutionLimits ? { resolutionLimits: options.resolutionLimits } : {})
  }
}
export const tuples = (out) => out.unknowns.map((u) => [u.file, u.reason, u.detail])
export const T = (u) => JSON.stringify([u.file, u.reason, u.detail])
export const EDGE = new Set([
  'UNKNOWN_RESOLUTION', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_EXTERNAL_PATH', 'UNKNOWN_FORMAT',
  'UNKNOWN_MODULE_INTEROP', 'UNKNOWN_AMBIGUOUS_RESOLUTION', 'UNKNOWN_UNSUPPORTED_EXPORTS',
  'UNKNOWN_UNRESOLVED_EXPORT', 'UNKNOWN_BLOCKED_EXPORT', 'UNKNOWN_EXPORTS_DEPTH',
  'UNKNOWN_EXACT_EXPORTS_TARGET', 'UNKNOWN_TARGET_URL', 'UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION',
  'UNKNOWN_PACKAGE_SELF_REFERENCE', 'UNKNOWN_PACKAGE_SCOPE', 'UNKNOWN_PACKAGE_NAME',
  'UNKNOWN_PACKAGE_ESCAPE', 'UNKNOWN_PACKAGE_DIRECTORY_WITHOUT_MANIFEST', 'UNKNOWN_CJS_FILE_PACKAGE',
  'UNKNOWN_ABSOLUTE_PACKAGE_ENTRY', 'UNKNOWN_WORKSPACE_CONFIG', 'UNKNOWN_WORKSPACE_LINK',
  'UNKNOWN_SYMLINK', 'UNKNOWN_ANCESTOR_SYMLINK', 'UNKNOWN_ANCESTOR_FORMAT', 'UNKNOWN_LINK_FORMAT',
  'UNKNOWN_METADATA_ENCODING', 'UNKNOWN_ENCODING', 'UNKNOWN_INVALID_MANIFEST', 'UNKNOWN_PATH',
  'UNKNOWN_PRODUCT_TARGET', 'UNKNOWN_ACQUISITION_ENOENT', 'UNKNOWN_ACQUISITION_ENOTDIR',
  'UNKNOWN_ACQUISITION_ELOOP', 'UNKNOWN_ACQUISITION_EACCES', 'UNKNOWN_ACQUISITION_EISDIR'
])
export const ENVELOPE = new Set([
  'UNKNOWN_ANALYSIS_LIMIT', 'UNKNOWN_REVALIDATION', 'UNKNOWN_WORKER_ERROR',
  'UNKNOWN_INVALID_WORKER_RESULT', 'UNKNOWN_INPUT_REVALIDATION', 'UNKNOWN_INSTALLED_REFERENCE'
])
// §3.5 classification of each v3 tuple against the v4 output of the same input.
export function conservation(o3, o4) {
  const v4 = new Set(o4.unknowns.map(T))
  return o3.unknowns.map((u) => {
    let k = 'defect'
    if (ENVELOPE.has(u.reason)) k = 'envelope'
    else if (v4.has(T(u))) k = 'persisted'
    else if (u.file === '' && EDGE.has(u.reason) && o4.unknowns.some((x) => x.file && x.reason === u.reason && x.detail === u.detail)) k = 'exception1'
    else if (u.reason === 'UNKNOWN_COMPILED_PROVENANCE' && u.file.split('/').includes('node_modules')) k = 'exception2'
    else if (u.reason === 'UNKNOWN_FUNCTION' && u.detail === '' && o4.unknowns.some((x) => x.file === u.file && x.reason === u.reason && x.detail)) k = 'exception3'
    return [k, T(u)]
  })
}
export function violationsContained(o3, o4) {
  const a = o3.violations.map((v) => JSON.stringify(v)),
    b = o4.violations.map((v) => JSON.stringify(v))
  return a.every((v) => b.filter((x) => x === v).length >= a.filter((x) => x === v).length)
}
export function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}
