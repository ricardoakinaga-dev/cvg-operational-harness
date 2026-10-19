// D: physical probes of the compiled recipe (candidate d6203875) on synthetic repos built like
// the beforeAll of tests/b6-0236-compiled-provenance.test.js. In-process with the loader hook
// recording spawnSync argv/stdout. Usage: node d-compiled-probe.mjs <case> <workdir>
//   colon / colon-nopage : ':big/' with a tracked symlink + 'big/regular' (paged / not paged)
//   colon-regular        : paged ':big/' regular files only + 'big/regular' -> must build, listing == ls-tree -r
//   spread               : root pages; 'many/' with 130,000 short entries (R1-02)
//   nonutf8 / nonutf8-nopage : top-level tree named 0xff+'big' (git quotes it)
//   empty-paged / empty-nopage : crafted commit with an EMPTY subtree bulk/empty (plumbing only)
//   small                : no paging; commands.json compared with base 228e7918 and a5b8a888 (same inputs, CLI)
import { register } from 'node:module'
register(new URL('./hooks.mjs', import.meta.url))
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
const CAND = '/mnt/dados/cvg-work/cvg-hiso005-recipe-t2-20261019'
const RTW = '/mnt/dados/cvg-work/cvg-hiso005-recipe-t2-runtime-20261019/review-r2/work'
const ident = await import(CAND + '/scripts/boundary-installed-identity.mjs')
const { canonicalJson, fingerprintResolution, fingerprintToolchain, collectPackageInventory, INSTALLED_IDENTITY_LIMITS, pinnedToolchainLocation } = ident
const { buildCompiledReference, loadCompiledBuildReference } = await import(CAND + '/scripts/boundary-semantic-compiled.mjs')
const NODE = pinnedToolchainLocation().node
const hash = (b) => createHash('sha256').update(b).digest('hex')
const [which, parent] = process.argv.slice(2)
const ENV = { PATH: path.dirname(NODE) + ':/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
function run(argv, cwd, input) { const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', timeout: 600000, env: ENV, input, maxBuffer: 256 * 1024 * 1024 }); return { status: r.status, error: r.error?.code ?? null, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() } }
function must(argv, cwd, input) { const r = run(argv, cwd, input); if (r.error || r.status !== 0) throw new Error(JSON.stringify({ argv: argv.slice(0, 6), ...r, stdout: r.stdout.slice(0, 300) })); return r.stdout }
const write = (root, file, bytes) => { const t = path.join(root, file); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, bytes); return t }
fs.rmSync(parent, { recursive: true, force: true }); fs.mkdirSync(parent, { recursive: true })
const evaluated = path.join(parent, 'evaluated'), reference = path.join(parent, 'independent-synthetic-reference')
const sourceFiles = []
const put = (name, body) => { const bytes = typeof body === 'string' ? body : JSON.stringify(body); for (const root of [evaluated, reference]) write(root, name, bytes); sourceFiles.push(name) }
put('package.json', { name: 'synthetic-compiler-fixture', version: '1.0.0', private: true, type: 'module', workspaces: ['packages/*'] })
put('package-lock.json', { name: 'synthetic-compiler-fixture', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'synthetic-compiler-fixture', version: '1.0.0' }, 'node_modules/typescript': { version: '6.0.3', resolved: 'https://registry.npmjs.org/typescript/-/typescript-6.0.3.tgz', integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64') } } })
put('tsconfig.base.json', { compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, composite: true, declaration: true, sourceMap: true, rewriteRelativeImportExtensions: true, baseUrl: '.', paths: { '@cvg/harness-contracts': ['packages/contracts/src/index.ts'] }, types: [], ignoreDeprecations: '6.0' } })
for (const [project, name] of [['contracts', '@cvg/harness-contracts'], ['shared', '@cvg/shared']]) {
  put(`packages/${project}/package.json`, { name, version: '1.0.0', type: 'module', main: 'dist/index.js', exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } } })
  put(`packages/${project}/tsconfig.json`, { extends: '../../tsconfig.base.json', compilerOptions: { rootDir: 'src', outDir: 'dist', rewriteRelativeImportExtensions: true }, include: ['src/**/*.ts'], ...(project === 'shared' ? { references: [{ path: '../contracts' }] } : {}) })
}
put('packages/contracts/src/canonical-json.ts', 'export const canonical = 1\n')
put('packages/contracts/src/index.ts', "export { canonical } from './canonical-json.js'\n")
put('packages/shared/src/index.ts', "export { canonical } from '@cvg/harness-contracts'\n")
for (const root of [evaluated, reference]) {
  fs.cpSync(path.join(CAND, 'node_modules/typescript'), path.join(root, 'node_modules/typescript'), { recursive: true })
  fs.mkdirSync(path.join(root, 'node_modules/@cvg'), { recursive: true })
  fs.symlinkSync('../../packages/contracts', path.join(root, 'node_modules/@cvg/harness-contracts'))
  fs.symlinkSync('../../packages/shared', path.join(root, 'node_modules/@cvg/shared'))
}
const packages = [{ key: 'node_modules/typescript', name: 'typescript', version: '6.0.3', ...collectPackageInventory(path.join(reference, 'node_modules/typescript')) }]
const toolchain = fingerprintToolchain()
const receipt = { schemaVersion: 1, kind: 'cvg-installed-content-reference', commit: 'f'.repeat(40), root: reference, ...fingerprintResolution(reference), toolchain, toolchainSha256: hash(canonicalJson(toolchain)), recipe: { argv: ['ci', '--offline', '--ignore-scripts', '--audit=false', '--fund=false', '--include=dev', '--include=optional', '--cache', path.join(parent, 'cache')], exitCode: 0, offline: true, ignoreScripts: true, completed: true }, selection: { platform: process.platform, arch: process.arch, dev: true, optional: true }, limits: { ...INSTALLED_IDENTITY_LIMITS }, usage: { entries: packages[0].usage.entries, regularBytes: packages[0].usage.regularBytes, maxDepth: packages[0].usage.maxDepth }, packages }
const bytes = canonicalJson(receipt)
const installedReference = { manifestPath: write(parent, 'installed-reference.json', bytes), expectedSha256: hash(bytes) }
const G = ['/usr/bin/git', '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=CVG Synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false']
must([...G, 'init', '-q'], evaluated)
must([...G, 'add', ...sourceFiles], evaluated)
const LONG = 's'.repeat(200)
function deepFiles(top, segments, count) { const dir = path.join(evaluated, top, ...Array(segments).fill(LONG)); fs.mkdirSync(dir, { recursive: true }); for (let i = 0; i < count; i++) fs.writeFileSync(path.join(dir, 'f' + String(i).padStart(4, '0')), '') }
const big = (top) => { for (let i = 0; i < 26; i++) deepFiles(top + '/' + String(i).padStart(2, '0'), 17, 100) }
if (which === 'spread') {
  big('bulk'); must([...G, 'add', '-f', '--', 'bulk'], evaluated)
  const empty = must(['/usr/bin/git', 'hash-object', '-w', '--stdin'], evaluated, '')
  let info = ''
  for (let i = 0; i < 130000; i++) info += `100644 ${empty}\tmany/${String(i % 26).padStart(2, '0')}/${String(i).padStart(6, '0')}\n`
  must(['/usr/bin/git', 'update-index', '--add', '--index-info'], evaluated, info)
} else if (which === 'colon' || which === 'colon-nopage') {
  if (which === 'colon') big(':big'); else write(evaluated, ':big/small', 'x')
  fs.symlinkSync('/etc/passwd', path.join(evaluated, ':big/link'))
  write(evaluated, 'big/regular', 'regular\n')
  must([...G, '--literal-pathspecs', 'add', '-f', '--', ':big', 'big'], evaluated)
} else if (which === 'colon-regular') {
  big(':big'); write(evaluated, 'big/regular', 'regular\n')
  must([...G, '--literal-pathspecs', 'add', '-f', '--', ':big', 'big'], evaluated)
} else if (which === 'nonutf8' || which === 'nonutf8-nopage') {
  const odd = Buffer.concat([Buffer.from(evaluated + '/'), Buffer.from([0xff]), Buffer.from('big')])
  if (which === 'nonutf8') { big('tmpbig'); fs.renameSync(path.join(evaluated, 'tmpbig'), odd) } else { fs.mkdirSync(odd); fs.writeFileSync(Buffer.concat([odd, Buffer.from('/small')]), 'x') }
  must([...G, 'add', '-f', '--', '.', ':(exclude)node_modules'], evaluated)
} else if (which === 'empty-paged' || which === 'empty-nopage') {
  if (which === 'empty-paged') big('bulk'); else write(evaluated, 'bulk/x', 'x')
  must([...G, 'add', '-f', '--', 'bulk'], evaluated)
} else if (which === 'small') {
} else throw new Error('case')
must([...G, 'commit', '-qm', 'probe ' + which], evaluated)
if (which.startsWith('empty-')) {
  const emptyTree = must(['/usr/bin/git', 'mktree'], evaluated, '')
  const rootEntries = must(['/usr/bin/git', 'ls-tree', 'HEAD'], evaluated).split('\n')
  const bulkTree = must(['/usr/bin/git', 'rev-parse', 'HEAD:bulk'], evaluated)
  const newBulk = must(['/usr/bin/git', 'mktree'], evaluated, must(['/usr/bin/git', 'ls-tree', bulkTree], evaluated) + `\n040000 tree ${emptyTree}\tempty\n`)
  const newRoot = must(['/usr/bin/git', 'mktree'], evaluated, rootEntries.map((l) => (l.endsWith('\tbulk') ? l.replace(bulkTree, newBulk) : l)).join('\n') + '\n')
  const c = must([...G, 'commit-tree', newRoot, '-p', 'HEAD', '-m', 'empty subtree'], evaluated)
  must(['/usr/bin/git', 'update-ref', 'HEAD', c], evaluated)
}
const commit = must(['/usr/bin/git', 'rev-parse', 'HEAD'], evaluated)
const fullRaw = spawnSync('/usr/bin/git', ['ls-tree', '-r', '--format=%(objectmode) %(path)', commit], { cwd: evaluated, env: ENV, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).stdout
const full = fullRaw.trim().split('\n')
must([NODE, 'node_modules/typescript/bin/tsc', '-b', 'packages/shared/tsconfig.json', '--force'], evaluated)
const report = { case: which, commit: commit.slice(0, 12), fullListing: { lines: full.length, bytes: Buffer.byteLength(fullRaw), over8MiB: Buffer.byteLength(fullRaw) > 8 * 1024 * 1024, nonRegular: full.filter((l) => !/^100(?:644|755) /.test(l)).slice(0, 5), quoted: full.filter((l) => l.slice(l.indexOf(' ') + 1).startsWith('"')).slice(0, 2).map((l) => l.slice(0, 40) + '...'), quotedCount: full.filter((l) => l.slice(l.indexOf(' ') + 1).startsWith('"')).length, under200k: full.length < 200000 } }
const out = path.join(parent, 'fresh')
const t0 = Date.now()
globalThis.__cpLog = []
let built = null
try {
  built = buildCompiledReference({ sourceRoot: evaluated, commit, outputRoot: out, installedReference })
  report.build = { status: 'BUILT', elapsedMs: Date.now() - t0 }
} catch (e) {
  report.build = { status: 'THREW', code: e.code ?? null, class: e.constructor.name, message: String(e.message).slice(0, 160), elapsedMs: Date.now() - t0 }
}
const lsRows = globalThis.__cpLog.filter((r) => r.args.includes('ls-tree'))
report.lsTree = { calls: lsRows.length, argvSample: lsRows.slice(0, 6).map((r) => r.args.slice(4).map((a) => (/^[a-f0-9]{40}$/.test(a) ? '<commit>' : a.length > 40 ? a.slice(0, 40) + '...' : a)).join(' ')), literalOnlyWithPathspec: lsRows.every((r) => r.args.includes('--literal-pathspecs') === r.args.includes('--')), enobufs: lsRows.filter((r) => r.errorCode === 'ENOBUFS').length }
// Order-preserving replay of the captured pages against `ls-tree -r` (only when the listing completed)
{
  let i = 0; const acc = []
  const replay = () => {
    const r = lsRows[i++]; if (!r) throw new Error('underflow')
    if (r.status === 0 && !r.errorCode) { for (const l of r.stdout.trim().split('\n')) acc.push(l); return }
    const ch = lsRows[i++]; if (!ch || ch.status !== 0) throw new Error('children failed')
    for (const line of ch.stdout.split('\n').filter(Boolean)) { const a = line.indexOf(' '), b = line.indexOf(' ', a + 1); if (line.slice(0, a) === 'tree') replay(); else acc.push(line.slice(a + 1)) }
  }
  try { replay(); report.replay = { equalsFullListing: acc.length === full.length && acc.every((l, k) => l === full[k]), consumedAll: i === lsRows.length, lines: acc.length } } catch (e) { report.replay = 'n/a: ' + e.message }
}
if (fs.existsSync(path.join(out, 'failure.json'))) { const failure = JSON.parse(fs.readFileSync(path.join(out, 'failure.json'), 'utf8')); report.failure = { code: failure.code, commandRows: failure.commands.length, lastArgvTail: failure.commands.at(-1)?.argv.slice(-4) } }
if (built) {
  const commandsFile = path.join(out, 'commands.json')
  const commands = JSON.parse(fs.readFileSync(commandsFile, 'utf8'))
  const ls = commands.filter((r) => r.argv.includes('ls-tree'))
  report.receipt = { commandsJsonBytes: fs.statSync(commandsFile).size, lsTreeRows: ls.length, withStdout: ls.filter((r) => r.stdout).length, withDigest: ls.filter((r) => r.stdoutSha256).length, discarded: ls.filter((r) => 'stdoutDiscardedBytes' in r).length, buildRowStdoutKept: commands.filter((r) => r.argv.includes('-b')).map((r) => ({ exit: r.exitCode, kept: !('stdoutSha256' in r) })) }
  report.snapshotHasColonTree = fs.existsSync(path.join(out, 'snapshot', ':big'))
  report.reader = loadCompiledBuildReference(evaluated, built, { installedReference }).status
}
if (which === 'small' && built) {
  const cmp = {}
  for (const [label, dir] of [['base228e', RTW + '/scripts-228e'], ['prevA5b8', RTW + '/scripts-a5b8']]) {
    const o = path.join(parent, 'fresh-' + label)
    const b = run([NODE, dir + '/scripts/boundary-semantic-compiled.mjs', '--source-root=' + evaluated, '--commit=' + commit, '--output-root=' + o, '--installed-reference=' + installedReference.manifestPath, '--installed-reference-sha256=' + installedReference.expectedSha256], evaluated)
    const norm = (file, root) => fs.readFileSync(file, 'utf8').split(root).join('<OUT>')
    const cR = JSON.parse(norm(path.join(out, 'reference.json'), out)), bR = JSON.parse(norm(path.join(o, 'reference.json'), o))
    cmp[label] = { exit: b.status, commandsJsonIdenticalAfterPathNormalization: norm(path.join(out, 'commands.json'), out) === norm(path.join(o, 'commands.json'), o), receiptKeysDiffering: Object.keys({ ...cR, ...bR }).filter((k) => JSON.stringify(cR[k]) !== JSON.stringify(bR[k])) }
  }
  report.sameInputsComparison = cmp
}
console.log(JSON.stringify(report, null, 2))
