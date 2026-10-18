// HISO005-P2-NEXT-RECON-20261018 — physical recon of the designated cause.
// Readonly. Reads bytes of the measured inputs from the v3 references r5/r6
// (same SHA-256 as the sealed measurement), parses them with the pinned
// TypeScript 6.0.3 parser and NEVER imports, requires or evaluates any target.
// Usage: <node22.23.2> recon-physical.mjs [output-dir]   (default: this folder)
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { createRequire, isBuiltin } from 'node:module'
import { fileURLToPath } from 'node:url'

const EV = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(EV, '../../../..')
const B = path.join(ROOT, 'docs/04_audit/evidence/HISO005-P2-BUILD-0240-20261018')
const RT = '/mnt/ia/cvg-hiso005-build0240-runtime-20261018'
const R5 = path.join(RT, 'installed-reference-r5/snapshot')
const R6 = path.join(RT, 'compiled-reference-r6/snapshot')
const NODE_SHA = '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327'
const TS_PATH = path.join(ROOT, 'node_modules/typescript/lib/typescript.js')
const TS_SHA = '569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39'
const sha = (b) => createHash('sha256').update(b).digest('hex')
const fail = (m) => {
  throw Error(m)
}

if (process.versions.node !== '22.23.2') fail('node version')
if (sha(fs.readFileSync(fs.realpathSync(process.execPath))) !== NODE_SHA) fail('node sha')
if (sha(fs.readFileSync(TS_PATH)) !== TS_SHA) fail('typescript sha')
const ts = createRequire(import.meta.url)(TS_PATH)
if (ts.version !== '6.0.3') fail('typescript version')

const rawReport = zlib.gunzipSync(fs.readFileSync(path.join(B, 'real-postcert-normal-report.json.gz')))
const receipts = JSON.parse(fs.readFileSync(path.join(B, 'real-postcert-receipts.json'), 'utf8'))
if (sha(rawReport) !== receipts[0].reportSha256) fail('report sha')
const report = JSON.parse(rawReport)
const sb = report.semanticBoundary
const graph = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(B, 'real-postcert-normal-graph.json.gz'))))
const inputs = new Map(sb.inputs.map((x) => [x.file, x.sha256]))
const receipt = new Map(sb.compiledProvenance.files.map((x) => [x.file, x.sha256]))
const resolutions = sb.runtimeResolution.resolutions

// ---------------------------------------------------------------- binding
const ANALYSABLE = /\.(?:js|mjs|cjs|ts|mts|cts)$/
const DTS = /\.d\.[cm]?ts$/
const analysable = (f) => ANALYSABLE.test(f) && !DTS.test(f)
function physical(file) {
  for (const [label, base] of [
    ['r5', R5],
    ['r6', R6]
  ]) {
    const p = path.join(base, file)
    try {
      const st = fs.lstatSync(p)
      if (!st.isFile()) continue
      const bytes = fs.readFileSync(p)
      if (sha(bytes) === inputs.get(file)) return { label, bytes }
    } catch {}
  }
  return null
}
const klass = (f) => {
  const p = f.split('/')
  const inst = p.includes('node_modules')
  const dist = p.includes('dist')
  if (inst) return dist ? 'installed-dist' : 'installed-other'
  if (dist) return receipt.get(f) === inputs.get(f) ? 'first-party-dist-receipt' : 'first-party-dist-uncovered'
  return 'first-party-source'
}
const files = [...inputs.keys()].filter(analysable).sort()
const binding = { total: files.length, bound: {}, unbound: {} }
const bytesOf = new Map()
for (const f of files) {
  const c = klass(f)
  const hit = physical(f)
  if (hit) {
    bytesOf.set(f, hit.bytes.toString('utf8'))
    binding.bound[c] = binding.bound[c] || {}
    binding.bound[c][hit.label] = (binding.bound[c][hit.label] || 0) + 1
  } else binding.unbound[c] = (binding.unbound[c] || 0) + 1
}

// ---------------------------------------------------------------- AST helpers
function parse(file) {
  return ts.createSourceFile(
    file,
    bytesOf.get(file),
    ts.ScriptTarget.Latest,
    true,
    /\.[cm]?tsx?$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS
  )
}
// Same predicate as functionValue() in scripts/boundary-semantic-engine.mjs (freeze r2).
function rejected(n) {
  const why = []
  if (!n.body) why.push('NO_BODY')
  if (n.asteriskToken) why.push('GENERATOR')
  if (n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) why.push('ASYNC')
  for (const p of n.parameters) {
    if (!ts.isIdentifier(p.name)) why.push('PARAMETER_PATTERN')
    if (p.dotDotDotToken) why.push('PARAMETER_REST')
    if (p.initializer) why.push('PARAMETER_INITIALIZER')
  }
  return [...new Set(why)]
}
const isFn = (n) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n)

// ---------------------------------------------------------------- chain witness
// load() order: sorted astFiles; block() predeclares every top-level function
// declaration (functionValue) and then visits statement 1. A static import or
// export-from calls load(resolve(...)) with no per-edge catch.
const startSet = new Set(graph.starts)
const targets = new Set(resolutions.map((r) => r.canonicalFile).filter(Boolean))
const astCandidates = [...new Set([...graph.starts, ...targets])].filter(analysable).sort()
const chain = []
let file = astCandidates[0]
const seen = new Set()
while (file && !seen.has(file) && chain.length < 64) {
  seen.add(file)
  const sf = parse(file)
  const predeclared = sf.statements
    .filter((s) => ts.isFunctionDeclaration(s))
    .map((s) => ({ name: s.name?.text ?? null, start: s.getStart(sf), rejected: rejected(s) }))
    .filter((x) => x.rejected.length || !x.name)
  const first = sf.statements.find(
    (s) => !(ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s) || ts.isEmptyStatement(s))
  )
  const spec =
    first && (ts.isImportDeclaration(first) || ts.isExportDeclaration(first)) && first.moduleSpecifier
      ? first.moduleSpecifier.text
      : null
  const record = spec ? resolutions.find((r) => r.from === file && r.specifier === spec && r.mode === 'import') : null
  const unknownsHere = sb.unknowns.filter((u) => u.file === file).map((u) => u.reason)
  chain.push({
    file,
    sha256: inputs.get(file),
    physicallyBound: bytesOf.has(file),
    isStart: startSet.has(file),
    distSegment: file.split('/').includes('dist'),
    inCompiledReceipt: receipt.has(file),
    predeclaredRejectedFunctions: predeclared,
    firstStatement: first ? ts.SyntaxKind[first.kind] : null,
    firstSpecifier: spec,
    analyserResolution: record
      ? { canonicalFile: record.canonicalFile, exact: record.exact, metadataSelection: record.metadataSelection }
      : null,
    recordedUnknownReasons: unknownsHere
  })
  file = record?.canonicalFile && analysable(record.canonicalFile) ? record.canonicalFile : null
}
const last = chain.at(-1)
const abort = {
  importer: last.file,
  specifier: last.firstSpecifier,
  analyserResolutionRecord: last.analyserResolution,
  unattributedUnknowns: sb.unknowns.filter((u) => u.file === ''),
  note: 'Sem registro de resolução para (importer, specifier): resolve() lançou exceção; sem catch por aresta em block(), a exceção sobe até o catch externo do worker.'
}
// Target manifest of the aborting edge (bytes, as metadata only).
const tiny = path.join(R5, 'node_modules/tinyrainbow/package.json')
const tinyBytes = fs.readFileSync(tiny)
const tinyManifest = JSON.parse(tinyBytes)
abort.targetManifest = {
  file: 'node_modules/tinyrainbow/package.json',
  sha256: sha(tinyBytes),
  measuredSha256: inputs.get('node_modules/tinyrainbow/package.json') ?? null,
  browser: tinyManifest.browser ?? null,
  exports: tinyManifest.exports ?? null,
  type: tinyManifest.type ?? null
}
const installed = graph.installed.find((x) => x.node === 'node_modules/tinyrainbow/package.json')
abort.targetContentIdentity = installed?.contentIdentity?.status ?? null

// ---------------------------------------------------------------- censuses
const fnCensus = {}
const topLevelEstimate = { files: 0, topLevelNodes: 0, exportedFunctionBodyNodes: 0 }
const builtinEdges = { files: 0, edges: 0, firstStatementBuiltin: 0, byClass: {} }
const perDistFile = []
for (const f of files) {
  if (!bytesOf.has(f)) continue
  const c = klass(f)
  const sf = parse(f)
  const row = (fnCensus[c] ||= {
    files: 0,
    functions: 0,
    rejected: 0,
    topLevelDeclarationsRejected: 0,
    filesWithTopLevelRejected: 0,
    byCategory: {}
  })
  row.files++
  let fileTop = 0,
    fileRejected = 0
  const visit = (n) => {
    if (isFn(n)) {
      row.functions++
      const why = rejected(n)
      if (ts.isFunctionDeclaration(n) && !n.name) why.push('ANONYMOUS_DECLARATION')
      if (why.length) {
        row.rejected++
        fileRejected++
        for (const w of why) row.byCategory[w] = (row.byCategory[w] || 0) + 1
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  for (const s of sf.statements)
    if (ts.isFunctionDeclaration(s) && (rejected(s).length || !s.name)) {
      row.topLevelDeclarationsRejected++
      fileTop++
    }
  if (fileTop) row.filesWithTopLevelRejected++
  // Estimate only: nodes outside function/class bodies, plus bodies of exported functions.
  let top = 0,
    exp = 0
  const count = (n) => {
    let k = 0
    const v = (m) => {
      k++
      ts.forEachChild(m, v)
    }
    v(n)
    return k
  }
  const walkTop = (n) => {
    top++
    if (isFn(n) || ts.isClassDeclaration(n) || ts.isClassExpression(n)) return
    ts.forEachChild(n, walkTop)
  }
  for (const s of sf.statements) {
    walkTop(s)
    const exported = s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (exported && ts.isFunctionDeclaration(s) && s.body) exp += count(s.body)
  }
  topLevelEstimate.files++
  topLevelEstimate.topLevelNodes += top
  topLevelEstimate.exportedFunctionBodyNodes += exp
  // Static/require builtin edges (each would throw UNKNOWN_NATIVE_BUILTIN in resolve()).
  let edges = 0
  const be = (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && !(n.importClause?.isTypeOnly || n.isTypeOnly)) {
      if (isBuiltin(n.moduleSpecifier.text)) edges++
    } else if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === 'require' &&
      n.arguments[0] &&
      ts.isStringLiteralLike(n.arguments[0]) &&
      isBuiltin(n.arguments[0].text)
    )
      edges++
    ts.forEachChild(n, be)
  }
  be(sf)
  if (edges) {
    builtinEdges.files++
    builtinEdges.edges += edges
    builtinEdges.byClass[c] = (builtinEdges.byClass[c] || 0) + 1
    const first = sf.statements.find((s) => ts.isImportDeclaration(s) || ts.isExportDeclaration(s))
    if (first?.moduleSpecifier && isBuiltin(first.moduleSpecifier.text)) builtinEdges.firstStatementBuiltin++
  }
  if (c === 'installed-dist')
    perDistFile.push({ file: f, sha256: inputs.get(f), rejectedFunctions: fileRejected, topLevelRejected: fileTop })
}

const installedDistPackages = {}
for (const x of perDistFile) {
  const p = x.file.split('/')
  const i = p.indexOf('node_modules')
  const key = p.slice(0, i + (p[i + 1].startsWith('@') ? 3 : 2)).join('/')
  const g = graph.installed.find((y) => y.node === key + '/package.json')
  installedDistPackages[key] ||= { files: 0, contentIdentity: g?.contentIdentity?.status ?? null, verified: g?.verified ?? null }
  installedDistPackages[key].files++
}
// Same-bytes installed code outside a dist segment (no compiled requirement in the engine).
const installedOtherPackages = {}
for (const f of files.filter((f) => klass(f) === 'installed-other')) {
  const p = f.split('/')
  const i = p.indexOf('node_modules')
  const key = p.slice(0, i + (p[i + 1].startsWith('@') ? 3 : 2)).join('/')
  const dir = p.slice(i + (p[i + 1].startsWith('@') ? 3 : 2), -1).join('/') || '.'
  installedOtherPackages[key] ||= { files: 0, directories: new Set() }
  installedOtherPackages[key].files++
  installedOtherPackages[key].directories.add(dir.split('/')[0])
}
for (const v of Object.values(installedOtherPackages)) v.directories = [...v.directories].sort()

const out = {
  task: 'HISO005-P2-NEXT-RECON-20261018',
  observedAt: new Date().toISOString(),
  toolchain: { node: process.versions.node, nodeSha256: NODE_SHA, typescript: ts.version, typescriptSha256: TS_SHA },
  sources: { report: receipts[0].reportSha256, r5: R5, r6: R6, targetExecution: 'none: bytes parsed only' },
  physicalBinding: binding,
  chainWitness: { orderRule: 'sorted astFiles, first = ' + astCandidates[0], chain, abort },
  functionCensus: {
    predicate: 'functionValue(): !body || generator || async || parameter not Identifier || rest || initializer; FunctionDeclaration sem nome não exportada',
    byClass: fnCensus,
    note: 'Contagem sintática sobre arquivos com bytes ligados; não prova que todo caso seria alcançado pelo corpo.'
  },
  installedDist: { packages: installedDistPackages, files: perDistFile },
  installedOutsideDist: installedOtherPackages,
  builtinEdges,
  topLevelStateEstimate: {
    ...topLevelEstimate,
    maxStates: sb.limits.maxStates,
    label: 'ESTIMATIVA grosseira, não medição: nós fora de corpos de função/classe mais corpos de funções exportadas; o engine deduplica estados por (nó, ambiente), pode parar antes por UNKNOWN e também analisa corpos chamados.'
  }
}
fs.writeFileSync(path.join(process.argv[2] ? path.resolve(process.argv[2]) : EV, 'physical-recon.json'), JSON.stringify(out, null, 2) + '\n')
console.log(
  JSON.stringify(
    {
      binding,
      chain: chain.map((c) => [c.file, c.firstSpecifier, c.analyserResolution?.canonicalFile ?? null, c.predeclaredRejectedFunctions.length, c.recordedUnknownReasons]),
      abort: { importer: abort.importer, specifier: abort.specifier, browser: abort.targetManifest.browser, sha: abort.targetManifest.sha256 === abort.targetManifest.measuredSha256 },
      fnCensus,
      installedDistPackages,
      builtinEdges,
      topLevelEstimate
    },
    null,
    1
  )
)
