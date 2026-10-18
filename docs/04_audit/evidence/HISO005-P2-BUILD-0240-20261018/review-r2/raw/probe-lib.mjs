// Crítica R2 (copiada da R1, caminhos ajustados) HISO005-P2-BUILD-0240: biblioteca de sondas (somente fixtures próprias).
// Nunca importa/executa módulos-alvo das fixtures: engine/helper apenas analisam;
// o oracle Node usa somente import.meta.resolve/require.resolve com hook de load negando.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

export const NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
export const V3 = '/mnt/ia/cvg-hiso005-build0240-20261018'
export const V2 = '/mnt/ia/cvg-hiso005-build0237-20261018' // HEAD 84d8d4b4 (base), oracle diferencial v2
export const RUNTIME = '/mnt/ia/cvg-hiso005-build0240-runtime-20261018/review-r2'
export const FX = path.join(RUNTIME, 'fx')
export const hash = (b) => createHash('sha256').update(b).digest('hex')
export const ENV = {
  PATH: path.dirname(NODE) + ':/usr/bin:/bin',
  LANG: 'C',
  LC_ALL: 'C',
  TZ: 'UTC',
  TMPDIR: RUNTIME
}
export function write(root, file, value) {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(
    target,
    typeof value === 'object' && !Buffer.isBuffer(value)
      ? JSON.stringify(value)
      : value
  )
  return target
}
export function link(root, file, target) {
  const p = path.join(root, file)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.symlinkSync(target, p)
}
export function freshRoot(name) {
  fs.mkdirSync(FX, { recursive: true })
  const dir = path.join(FX, name)
  if (fs.existsSync(dir)) {
    // Somente dentro da própria pasta runtime da crítica.
    if (!dir.startsWith(FX + '/')) throw Error('refuse cleanup outside FX')
    fs.rmSync(dir, { recursive: true, force: true })
  }
  fs.mkdirSync(dir, { recursive: true })
  return fs.realpathSync(dir)
}
const ENGINE_CODE =
  'const fs=require("node:fs");const e=require(process.argv[1]);const p=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(e[p.method](...p.args)));'
export function engine(tree, root, args, method = 'runSemanticBoundary') {
  const enginePath = path.join(tree, 'scripts/boundary-semantic-engine.mjs')
  const started = Date.now()
  const r = spawnSync(NODE, ['-e', ENGINE_CODE, enginePath], {
    input: JSON.stringify({ method, args }),
    cwd: root,
    env: ENV,
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 256 * 1024 ** 2
  })
  if (r.error || r.status !== 0)
    return { error: r.error?.message || r.stderr, status: r.status }
  const out = JSON.parse(r.stdout)
  if (out && typeof out === 'object') out.__elapsedMs = Date.now() - started
  return out
}
export function input(root, starts, extra = {}) {
  return {
    root,
    starts,
    installed: [],
    origins: [],
    compiled: { status: 'UNAVAILABLE', files: [] },
    ...extra
  }
}
export function summary(out) {
  if (!out || out.error) return out
  return {
    status: out.status,
    kernelVersion: out.kernelVersion,
    validation: out.validation,
    proofs: out.proofs?.length,
    violations: out.violations,
    unknowns: out.unknowns?.map((u) => [u.file, u.reason, u.detail]),
    elapsedMs: out.__elapsedMs
  }
}
const ORACLE_CODE = `import {createRequire,registerHooks} from 'node:module';
const req=createRequire(process.argv[2]);
registerHooks({load(url){throw Error('TARGET_LOAD_FORBIDDEN:'+url)}});
try{const value=process.argv[3]==='import'?import.meta.resolve(process.argv[1]):req.resolve(process.argv[1]);process.stdout.write(JSON.stringify({value}));}
catch(e){process.stdout.write(JSON.stringify({error:e.code||e.message}));process.exitCode=2;}`
export function oracle(root, from, specifier, mode) {
  const r = spawnSync(
    NODE,
    [
      '--input-type=module',
      '--eval',
      ORACLE_CODE,
      specifier,
      pathToFileURL(path.join(root, from)).href,
      mode
    ],
    { cwd: root, env: ENV, encoding: 'utf8', timeout: 20000 }
  )
  if (r.error) return { error: r.error.message }
  return { code: r.status, ...JSON.parse(r.stdout) }
}
export async function helper(tree) {
  return import(
    pathToFileURL(path.join(tree, 'scripts/boundary-semantic-resolution.mjs'))
      .href
  )
}
export function saveRaw(name, data) {
  const dir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'out'
  )
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, name + '.json')
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
  return file
}
