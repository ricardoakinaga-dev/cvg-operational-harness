// P4: physical probes of the candidate compiled recipe (a5b8a888) on synthetic repos
// built like the beforeAll of tests/b6-0236-compiled-provenance.test.js.
// Usage: node p4-compiled-probe.mjs <case> <workdir>
//   spread       : root pages; child 'many/' has 130k short lines (<8 MiB) -> push(...array)
//   colon        : root pages; ':big/' (long paths + tracked symlink) and 'big/' (1 file)
//   colon-nopage : same names, listing below 8 MiB (no paging) -> control
//   plain-paged  : root pages, regular files only -> compaction/reader control
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
const CAND = '/mnt/dados/cvg-work/cvg-hiso005-recipe-t2-20261019'
const ident = await import(CAND + '/scripts/boundary-installed-identity.mjs')
const { canonicalJson, fingerprintResolution, fingerprintToolchain, collectPackageInventory, INSTALLED_IDENTITY_LIMITS, pinnedToolchainLocation } = ident
const { loadCompiledBuildReference } = await import(CAND + '/scripts/boundary-semantic-compiled.mjs')
const NODE = pinnedToolchainLocation().node
const hash = (b) => createHash('sha256').update(b).digest('hex')
const [which, parent] = process.argv.slice(2)
const ENV = { PATH: path.dirname(NODE) + ':/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
function run(argv, cwd, input) {
  const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', timeout: 300000, env: ENV, input, maxBuffer: 256 * 1024 * 1024 })
  return { status: r.status, error: r.error?.code ?? null, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() }
}
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
if (which === 'spread' || which === 'plain-paged') {
  for (let i = 0; i < 26; i++) deepFiles('bulk/' + String(i).padStart(2, '0'), 17, 100)
  must([...G, 'add', '-f', '--', 'bulk'], evaluated)
  if (which === 'spread') {
    // 130,000 tracked empty blobs under many/ through the index only (the compiled
    // recipe reads tracked content through `git archive`, never the working tree).
    const empty = must(['/usr/bin/git', 'hash-object', '-w', '--stdin'], evaluated, '')
    let info = ''
    for (let i = 0; i < 130000; i++) info += `100644 ${empty}\tmany/${String(i % 26).padStart(2, '0')}/${String(i).padStart(6, '0')}\n`
    must(['/usr/bin/git', 'update-index', '--add', '--index-info'], evaluated, info)
  }
} else if (which === 'colon' || which === 'colon-nopage') {
  if (which === 'colon') for (let i = 0; i < 26; i++) deepFiles(':big/' + String(i).padStart(2, '0'), 17, 100)
  else write(evaluated, ':big/small', 'x')
  fs.symlinkSync('/etc/passwd', path.join(evaluated, ':big/link'))
  write(evaluated, 'big/regular', 'regular\n')
  must([...G, 'add', '-f', '--', ':(literal):big', 'big'], evaluated)
} else if (which === 'small') {
  // no extra tracked content: listing far below 8 MiB (no paging)
} else throw new Error('case')
must([...G, 'commit', '-qm', 'probe ' + which], evaluated)
const commit = must(['/usr/bin/git', 'rev-parse', 'HEAD'], evaluated)
const full = spawnSync('/usr/bin/git', ['ls-tree', '-r', '--format=%(objectmode) %(path)', commit], { cwd: evaluated, env: ENV, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).stdout.trim().split('\n')
must([NODE, 'node_modules/typescript/bin/tsc', '-b', 'packages/shared/tsconfig.json', '--force'], evaluated)
const report = { case: which, commit: commit.slice(0, 12), fullListing: { lines: full.length, bytes: Buffer.byteLength(full.join('\n') + '\n'), over8MiB: Buffer.byteLength(full.join('\n') + '\n') > 8 * 1024 * 1024, nonRegular: full.filter((l) => !/^100(?:644|755) /.test(l)), wouldBaseTypeCheckRefuse: full.some((l) => !/^100(?:644|755) /.test(l)), entriesUnder200k: full.length < 200000 } }
const out = path.join(parent, 'fresh')
const t0 = Date.now()
const cli = run([NODE, path.join(CAND, 'scripts/boundary-semantic-compiled.mjs'), '--source-root=' + evaluated, '--commit=' + commit, '--output-root=' + out, '--installed-reference=' + installedReference.manifestPath, '--installed-reference-sha256=' + installedReference.expectedSha256], evaluated)
report.build = { exit: cli.status, stdout: cli.stdout.slice(0, 300), stderr: cli.stderr.slice(0, 300), elapsedMs: Date.now() - t0 }
if (fs.existsSync(path.join(out, 'failure.json'))) {
  const failure = JSON.parse(fs.readFileSync(path.join(out, 'failure.json'), 'utf8'))
  report.failure = { code: failure.code, commandRows: failure.commands.length, lastArgvTail: failure.commands.at(-1)?.argv.slice(-3) }
}
if (cli.status === 0) {
  const built = JSON.parse(cli.stdout)
  const commandsFile = path.join(out, 'commands.json')
  const commands = JSON.parse(fs.readFileSync(commandsFile, 'utf8'))
  const lsRows = commands.filter((r) => r.argv.includes('ls-tree'))
  report.receipt = { commandsJsonBytes: fs.statSync(commandsFile).size, lsTreeRows: lsRows.length, lsTreeRowsWithStdout: lsRows.filter((r) => r.stdout).length, lsTreeRowsWithDigest: lsRows.filter((r) => r.stdoutSha256).length, lsTreeRowsDiscarded: lsRows.filter((r) => 'stdoutDiscardedBytes' in r).length, pagedArgvTails: lsRows.map((r) => r.argv.slice(-2).join(' ')).slice(0, 8), buildEventRowsWithStdoutKept: commands.filter((r) => r.argv.includes('-b')).map((r) => ({ exit: r.exitCode, stdoutKept: typeof r.stdout === 'string' && !('stdoutSha256' in r) })) }
  const snap = path.join(out, 'snapshot')
  report.snapshotHasColonSymlink = fs.existsSync(path.join(snap, ':big')) ? (() => { try { return { link: fs.readlinkSync(path.join(snap, ':big/link')) } } catch (e) { return { error: e.code } } })() : false
  report.reader = loadCompiledBuildReference(evaluated, built, { installedReference }).status
}
// Optional: same inputs through the BASE (228e7918) compiled module, extracted read-only
// with `git show` into the review runtime; output roots normalized before comparing.
if (process.env.PROBE_BASE_SCRIPT && cli.status === 0) {
  const outB = path.join(parent, 'fresh-base')
  const b = run([NODE, process.env.PROBE_BASE_SCRIPT, '--source-root=' + evaluated, '--commit=' + commit, '--output-root=' + outB, '--installed-reference=' + installedReference.manifestPath, '--installed-reference-sha256=' + installedReference.expectedSha256], evaluated)
  const norm = (file, root) => fs.readFileSync(file, 'utf8').split(root).join('<OUT>')
  const candCommands = norm(path.join(out, 'commands.json'), out), baseCommands = norm(path.join(outB, 'commands.json'), outB)
  const candR = JSON.parse(norm(path.join(out, 'reference.json'), out)), baseR = JSON.parse(norm(path.join(outB, 'reference.json'), outB))
  const differing = Object.keys({ ...candR, ...baseR }).filter((k) => JSON.stringify(candR[k]) !== JSON.stringify(baseR[k]))
  report.baseComparison = { baseExit: b.status, commandsJsonIdenticalAfterPathNormalization: candCommands === baseCommands, commandsBytes: [candCommands.length, baseCommands.length], receiptKeysDiffering: differing, recipeSha256: { candidate: candR.recipeSha256.slice(0, 12), base: baseR.recipeSha256.slice(0, 12) } }
}
console.log(JSON.stringify(report, null, 2))
