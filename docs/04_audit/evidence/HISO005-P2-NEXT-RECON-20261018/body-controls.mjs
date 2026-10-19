// HISO005-P2-NEXT-RECON-20261018 — private synthetic controls on the FROZEN
// v3 engine (root scripts, SHA = freeze r2 f22a74a0). Fixtures are created in a
// private directory passed as argv[2] (never inside the repository). Each case
// runs runSemanticBoundary in a fresh pinned Node with a load hook that refuses
// any file: URL outside the engine directory, exactly as the precedent
// HISO005-P2-METADATA-RECON body-separation operator. Targets are never
// imported or evaluated: the engine parses bytes only and its worker is spawned
// by the engine itself.
// Usage: <node22.23.2> body-controls.mjs <private-fixture-root> [output-dir]
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const EV = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(EV, '../../../..')
const ENGINE = path.join(ROOT, 'scripts/boundary-semantic-engine.mjs')
const ENGINE_SHA = '0497362b3642f645adcd190f9de53c57736e3da5eac5a611aa9cb47c5f7d852e'
const NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
const sha = (b) => createHash('sha256').update(b).digest('hex')
const base = process.argv[2]
if (!base || !path.isAbsolute(base) || base.startsWith(ROOT)) throw Error('private absolute fixture root required')
if (sha(fs.readFileSync(ENGINE)) !== ENGINE_SHA) throw Error('engine sha mismatch')
fs.mkdirSync(base, { recursive: true })
const fixtureRoot = fs.realpathSync(base)

const MATCH = { identityStatus: 'MATCH', referenceDigest: 'a'.repeat(64) }
const pkg = (name, extra = {}) => JSON.stringify({ name, version: '1.0.0', type: 'module', ...extra })
const ROOTPKG = JSON.stringify({ name: 'fixture-root', private: true, type: 'module' })
const cases = [
  {
    id: 'C1-cross-module-abort',
    pair: 'C1',
    role: 'witness',
    files: { 'package.json': ROOTPKG, 'a.mjs': "import fs from 'node:fs'\nexport default 1\n", 'b.mjs': 'export const x = missingGlobal\n' },
    starts: ['a.mjs', 'b.mjs']
  },
  {
    id: 'C1-cross-module-control',
    pair: 'C1',
    role: 'control',
    files: { 'package.json': ROOTPKG, 'a.mjs': 'export default 1\n', 'b.mjs': 'export const x = missingGlobal\n' },
    starts: ['a.mjs', 'b.mjs']
  },
  {
    id: 'C2-intra-module-abort',
    pair: 'C2',
    role: 'witness',
    files: { 'package.json': ROOTPKG, 'entry.mjs': "import fs from 'node:fs'\nconst y = missingGlobal\nexport default y\n" },
    starts: ['entry.mjs']
  },
  {
    id: 'C2-intra-module-control',
    pair: 'C2',
    role: 'control',
    files: { 'package.json': ROOTPKG, 'entry.mjs': 'const y = missingGlobal\nexport default y\n' },
    starts: ['entry.mjs']
  },
  {
    id: 'C3-installed-dist',
    pair: 'C3',
    role: 'witness',
    files: {
      'package.json': ROOTPKG,
      'entry.mjs': "import v from 'pkgd'\nexport default v\n",
      'node_modules/pkgd/package.json': pkg('pkgd', { exports: './dist/index.js' }),
      'node_modules/pkgd/dist/index.js': 'export default 1\n'
    },
    starts: ['entry.mjs'],
    installed: [{ key: 'node_modules/pkgd', manifest: 'node_modules/pkgd/package.json', ...MATCH }]
  },
  {
    id: 'C3-installed-lib-control',
    pair: 'C3',
    role: 'control',
    files: {
      'package.json': ROOTPKG,
      'entry.mjs': "import v from 'pkgd'\nexport default v\n",
      'node_modules/pkgd/package.json': pkg('pkgd', { exports: './lib/index.js' }),
      'node_modules/pkgd/lib/index.js': 'export default 1\n'
    },
    starts: ['entry.mjs'],
    installed: [{ key: 'node_modules/pkgd', manifest: 'node_modules/pkgd/package.json', ...MATCH }]
  },
  {
    id: 'C4-async-declared-unused',
    pair: 'C4',
    role: 'witness',
    files: { 'package.json': ROOTPKG, 'entry.mjs': 'async function unused() {}\nexport default 1\n' },
    starts: ['entry.mjs']
  },
  {
    id: 'C4-default-param-declared-unused',
    pair: 'C4',
    role: 'witness',
    files: { 'package.json': ROOTPKG, 'entry.mjs': 'function unused(a = 1) { return a }\nexport default 1\n' },
    starts: ['entry.mjs']
  },
  {
    id: 'C4-plain-declared-unused-control',
    pair: 'C4',
    role: 'control',
    files: { 'package.json': ROOTPKG, 'entry.mjs': 'function unused(a) { return a }\nexport default 1\n' },
    starts: ['entry.mjs']
  },
  {
    id: 'C5-browser-field',
    pair: 'C5',
    role: 'witness',
    files: {
      'package.json': ROOTPKG,
      'entry.mjs': "import v from 'pkgb'\nexport default v\n",
      'node_modules/pkgb/package.json': pkg('pkgb', { browser: './lib/index.js', exports: { default: './lib/index.js' } }),
      'node_modules/pkgb/lib/index.js': 'export default 1\n'
    },
    starts: ['entry.mjs'],
    installed: [{ key: 'node_modules/pkgb', manifest: 'node_modules/pkgb/package.json', ...MATCH }]
  },
  {
    id: 'C5-no-browser-control',
    pair: 'C5',
    role: 'control',
    files: {
      'package.json': ROOTPKG,
      'entry.mjs': "import v from 'pkgb'\nexport default v\n",
      'node_modules/pkgb/package.json': pkg('pkgb', { exports: { default: './lib/index.js' } }),
      'node_modules/pkgb/lib/index.js': 'export default 1\n'
    },
    starts: ['entry.mjs'],
    installed: [{ key: 'node_modules/pkgb', manifest: 'node_modules/pkgb/package.json', ...MATCH }]
  },
  {
    // Body-only product edge: the acquisition census does not evaluate K2
    // property access, the body phase does. A builtin edge sorted earlier
    // stops the body before b.mjs, in the census and in the refinement.
    id: 'C6-body-only-violation-after-abort',
    pair: 'C6',
    role: 'witness',
    files: {
      'package.json': ROOTPKG,
      'a.mjs': "import fs from 'node:fs'\nexport default 1\n",
      'b.mjs': "const m = { p: './products/x.mjs' }\nimport(m.p)\nexport default 1\n",
      'products/x.mjs': 'export default 1\n'
    },
    starts: ['a.mjs', 'b.mjs']
  },
  {
    id: 'C6-body-only-violation-control',
    pair: 'C6',
    role: 'control',
    files: {
      'package.json': ROOTPKG,
      'a.mjs': 'export default 1\n',
      'b.mjs': "const m = { p: './products/x.mjs' }\nimport(m.p)\nexport default 1\n",
      'products/x.mjs': 'export default 1\n'
    },
    starts: ['a.mjs', 'b.mjs']
  }
]

const CALLER =
  "import{registerHooks}from'node:module';import{pathToFileURL}from'node:url';" +
  'const[engine,input]=process.argv.slice(1);const dir=engine.slice(0,engine.lastIndexOf("/"));let blocked=0;' +
  "registerHooks({load(u,c,next){if(u.startsWith('file:')&&!u.startsWith(pathToFileURL(dir+'/').href)){blocked++;throw Error('TARGET_LOAD_FORBIDDEN')}return next(u,c)}});" +
  'const{runSemanticBoundary}=await import(pathToFileURL(engine));const out=runSemanticBoundary(JSON.parse(input));' +
  'console.log(JSON.stringify({out,blockedCallerTargetLoads:blocked}))'

const commands = []
const results = []
for (const c of cases) {
  const dir = path.join(fixtureRoot, c.id)
  fs.rmSync(dir, { recursive: true, force: true })
  const hashes = {}
  for (const [rel, text] of Object.entries(c.files)) {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, text)
    hashes[rel] = sha(Buffer.from(text))
  }
  const input = { root: fs.realpathSync(dir), starts: c.starts, origins: [], installed: c.installed || [] }
  const argv = [NODE, '--input-type=module', '-e', CALLER, ENGINE, JSON.stringify(input)]
  const startedAt = new Date().toISOString()
  const p = spawnSync(argv[0], argv.slice(1), {
    cwd: input.root,
    encoding: 'utf8',
    env: { PATH: path.dirname(NODE) + ':/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
    timeout: 180000
  })
  commands.push({
    case: c.id,
    argv,
    cwd: input.root,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: p.status,
    stdoutSha256: sha(Buffer.from(p.stdout || '')),
    stderr: p.stderr
  })
  let parsed = null
  try {
    parsed = JSON.parse(p.stdout)
  } catch {}
  const o = parsed?.out
  results.push({
    case: c.id,
    pair: c.pair,
    role: c.role,
    fixtureFiles: hashes,
    installedInput: c.installed || [],
    exitCode: p.status,
    status: o?.status ?? null,
    kernelVersion: o?.kernelVersion ?? null,
    proofs: o?.proofs?.length ?? null,
    unknowns: (o?.unknowns || []).map((u) => ({ file: u.file, reason: u.reason, detail: u.detail })),
    violations: o?.violations ?? null,
    usage: o ? { states: o.usage.states, contexts: o.usage.contexts, unionValues: o.usage.unionValues } : null,
    validation: o?.validation ?? null,
    blockedCallerTargetLoads: parsed?.blockedCallerTargetLoads ?? null,
    rawOutputSha256: sha(Buffer.from(p.stdout || ''))
  })
  fs.writeFileSync(path.join(fixtureRoot, c.id + '.stdout.json'), p.stdout || '')
}

// Expected discriminations, evaluated mechanically.
const by = Object.fromEntries(results.map((r) => [r.case, r]))
const has = (r, file, reason) => r.unknowns.some((u) => u.file === file && u.reason === reason)
const expectations = [
  ['C1 witness omits body unknowns of b.mjs', !by['C1-cross-module-abort'].unknowns.some((u) => u.file === 'b.mjs')],
  ['C1 witness has unattributed abort entry', has(by['C1-cross-module-abort'], '', 'UNKNOWN_NATIVE_BUILTIN')],
  ['C1 control reports body unknowns of b.mjs', by['C1-cross-module-control'].unknowns.some((u) => u.file === 'b.mjs')],
  ['C2 witness omits later statement unknowns', !by['C2-intra-module-abort'].unknowns.some((u) => u.file === 'entry.mjs' && u.reason !== 'UNKNOWN_NATIVE_BUILTIN')],
  ['C2 control reports later statement unknowns', by['C2-intra-module-control'].unknowns.some((u) => u.file === 'entry.mjs')],
  ['C3 dist witness UNKNOWN_COMPILED_PROVENANCE', has(by['C3-installed-dist'], 'node_modules/pkgd/dist/index.js', 'UNKNOWN_COMPILED_PROVENANCE')],
  ['C3 lib control PROVEN with proofs', by['C3-installed-lib-control'].status === 'PROVEN' && by['C3-installed-lib-control'].proofs > 0],
  ['C4 async unused UNKNOWN_FUNCTION', has(by['C4-async-declared-unused'], 'entry.mjs', 'UNKNOWN_FUNCTION')],
  ['C4 default param unused UNKNOWN_FUNCTION', has(by['C4-default-param-declared-unused'], 'entry.mjs', 'UNKNOWN_FUNCTION')],
  ['C4 plain unused control PROVEN', by['C4-plain-declared-unused-control'].status === 'PROVEN'],
  ['C5 browser witness UNKNOWN_AMBIGUOUS_RESOLUTION', by['C5-browser-field'].unknowns.some((u) => u.reason === 'UNKNOWN_AMBIGUOUS_RESOLUTION')],
  ['C5 no-browser control PROVEN', by['C5-no-browser-control'].status === 'PROVEN'],
  ['C6 witness hides body-only product edge (UNKNOWN, no violation)', by['C6-body-only-violation-after-abort'].status === 'UNKNOWN' && by['C6-body-only-violation-after-abort'].violations?.length === 0],
  ['C6 control reports VIOLATION', by['C6-body-only-violation-control'].status === 'VIOLATION' && by['C6-body-only-violation-control'].violations?.length > 0],
  ['no caller target loads', results.every((r) => r.blockedCallerTargetLoads === 0)],
  ['all validations valid', results.every((r) => r.validation?.valid === true)]
].map(([name, ok]) => ({ name, ok: !!ok }))

const out = {
  task: 'HISO005-P2-NEXT-RECON-20261018',
  observedAt: new Date().toISOString(),
  engine: { path: 'scripts/boundary-semantic-engine.mjs', sha256: ENGINE_SHA, freeze: 'f22a74a09fe1abefd3eaf0b11f65815b02c5c63d' },
  fixtureRoot,
  synthetic: 'MATCH/referenceDigest nas entradas installed são premissas sintéticas do controle, não identidade0234 real.',
  status: expectations.every((x) => x.ok) ? 'PASS' : 'FAIL',
  expectations,
  results
}
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : EV
fs.writeFileSync(path.join(OUT, 'body-controls.json'), JSON.stringify(out, null, 2) + '\n')
fs.writeFileSync(path.join(OUT, 'body-controls-commands.json'), JSON.stringify(commands, null, 2) + '\n')
console.log(JSON.stringify({ status: out.status, expectations, summary: results.map((r) => [r.case, r.status, r.proofs, r.unknowns.map((u) => (u.file || "''") + ':' + u.reason), r.usage?.states]) }, null, 1))
