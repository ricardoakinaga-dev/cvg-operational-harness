// Read-only census. AST syntax observations are never semantic approvals.
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const candidate = '/home/ricardo/cvg-candidates/hiso005-0234-20261017'
const evidence = path.resolve('docs/04_audit/evidence/HISO005-0234-BUILD-20261017')
const output = path.resolve('docs/04_audit/evidence/HISO005-P2-SPEC-20261018')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const readGzip = (name) => JSON.parse(gunzipSync(fs.readFileSync(path.join(evidence, name))))
const report = readGzip('boundary-final-normal.json.gz')
const graph = readGzip('boundary-final-normal-graph.json.gz')
const tsPath = path.join(candidate, 'node_modules/typescript/lib/typescript.js')
const ts = createRequire(import.meta.url)(tsPath)
const normalize = (text) => text.trim().replace(/\s+/g, ' ')
const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
const counts = (values) => Object.fromEntries([...new Set(values)].sort().map((key) => [key, values.filter((x) => x === key).length]))
const firstParty = []
const sources = new Map()
for (const [index, diagnostic] of report.diagnostics.entries()) {
  if (diagnostic.reason === 'UNVERIFIED_INSTALLED_PACKAGE') continue
  const colon = diagnostic.file.lastIndexOf(':')
  const relative = diagnostic.file.slice(0, colon)
  const line = Number(diagnostic.file.slice(colon + 1))
  if (!sources.has(relative)) {
    const bytes = fs.readFileSync(path.join(candidate, relative))
    const text = bytes.toString('utf8')
    const source = parse(relative, text)
    const nodes = []
    const visit = (node) => {
      if (node !== source) nodes.push({
        start: node.getStart(source), end: node.end,
        line: ts.getLineAndCharacterOfPosition(source, node.getStart(source)).line + 1,
        kind: ts.SyntaxKind[node.kind],
        digest: hash(normalize(node.getText(source))).slice(0, 16),
        text: node.getText(source)
      })
      ts.forEachChild(node, visit)
    }
    visit(source)
    sources.set(relative, { sha256: hash(bytes), bytes: bytes.length, parseErrors: source.parseDiagnostics.length, nodes })
  }
  const source = sources.get(relative)
  const matchingNodes = source.nodes.filter((node) => node.line === line && node.digest === diagnostic.expression)
  let family = 'MOCK_FETCH'
  if (relative.endsWith('/auth/session.ts')) family = 'AMBIENT_BOOTSTRAP_CALLBACK'
  else if (/\/sandbox\//.test(relative)) family = 'SANDBOX_PROCESS_CAPABILITY'
  else if (/\/canonical-json\.|\/capability-boundary\.|\/session\/events\.|\/tool-invocation-boundary\.|\/webhook-security\./.test(relative)) family = 'DATA_REFLECTION'
  else if (/\/controlled-preset-hardening\.|\/approval-decision-atomicity/.test(relative)) family = 'REFLECT_FORWARDING_PROXY'
  else if (relative.endsWith('/outbox-edge.test.ts') || matchingNodes.some((node) => node.text.includes('Function')) && relative.endsWith('/app.test.tsx')) family = 'FUNCTION_MATCHER'
  else if (/tool-catalog|identity-composition-wiring|continuous-worker|homolog-worker-lifecycle|operational-harness-homolog|operational-harness-process-restart|startup-error-redaction/.test(relative)) family = 'TEST_CHILD_PROCESS'
  else if (/production-bootstrap-main-own/.test(relative)) family = 'PROCESS_EVENT_MOCK'
  else if (/\/(main|homolog-worker)\.ts$/.test(relative)) family = 'SHUTDOWN_SIGNAL_SOURCE'
  firstParty.push({ id: `DIAG-${String(index + 1).padStart(4, '0')}`, diagnostic, sourceSha256: source.sha256, family, classification: 'TRIAGE_ONLY_NOT_PROOF', matchingNodes })
}
const installed = []
let totalBytes = 0
let totalFiles = 0
const caps = { fileBytes: 16 * 1024 * 1024, totalBytes: 256 * 1024 * 1024, files: 12000 }
for (const item of graph.installed) {
  const key = item.node.slice(0, -'/package.json'.length)
  const inventory = item.contentIdentity.inventory.evaluated.entries
  const row = { key, identity: item.contentIdentity.status, verified: false, syntaxOnly: true, files: [], nonJsExecutableCandidates: [] }
  for (const entry of inventory) {
    if (entry.type !== 'file') continue
    if (/\.(?:node|wasm)$/.test(entry.path) || entry.executableBits && !/\.(?:c?js|mjs)$/.test(entry.path)) row.nonJsExecutableCandidates.push({ path: entry.path, bytes: entry.size, sha256: entry.sha256 })
    if (!/\.(?:c?js|mjs|jsx)$/.test(entry.path)) continue
    const target = path.join(candidate, key, entry.path)
    if (entry.size > caps.fileBytes || totalBytes + entry.size > caps.totalBytes || totalFiles >= caps.files) {
      row.files.push({ path: entry.path, status: 'CENSUS_CAP', bytes: entry.size }); continue
    }
    const bytes = fs.readFileSync(target)
    if (hash(bytes) !== entry.sha256) throw new Error(`SOURCE_DRIFT:${key}/${entry.path}`)
    totalBytes += bytes.length; totalFiles++
    const source = parse(target, bytes.toString('utf8'))
    const observations = []
    const countsByKind = {}
    const visit = (node) => {
      let kind
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) && node.moduleSpecifier) kind = 'STATIC_MODULE_SPECIFIER'
      else if (ts.isCallExpression(node)) {
        const callee = node.expression.getText(source)
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword || callee === 'require' || callee.endsWith('.require')) kind = node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) ? 'LITERAL_LOADER_SPELLING' : 'DYNAMIC_LOADER_SPELLING'
        else if (/^(?:eval|Function)$|(?:^|\.)(?:createRequire|runInContext|runInNewContext|runInThisContext|compileFunction|spawn|exec|execFile|execSync|execFileSync|fork|dlopen|binding)$/.test(callee)) kind = 'CAPABILITY_SPELLING'
      } else if (ts.isNewExpression(node) && /^(?:Function|Worker|Proxy|WebAssembly\.Module)$/.test(node.expression.getText(source))) kind = 'CONSTRUCTOR_CAPABILITY_SPELLING'
      if (kind) {
        countsByKind[kind] = (countsByKind[kind] ?? 0) + 1
        // Samples aid navigation; totals are never truncated to sample counts.
        if (observations.length < 12) observations.push({ kind, line: ts.getLineAndCharacterOfPosition(source, node.getStart(source)).line + 1, text: node.getText(source).slice(0, 240) })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    row.files.push({ path: entry.path, bytes: bytes.length, sha256: entry.sha256, parseErrors: source.parseDiagnostics.length, countsByKind, samples: observations })
  }
  installed.push(row)
}
const result = {
  schemaVersion: 1, kind: 'syntax-census-not-semantic-proof', candidate,
  sourceCommit: 'b7032f8245fbfbec5570c585518172de9ab7f075',
  inputs: Object.fromEntries(['boundary-final-normal.json.gz', 'boundary-final-normal-graph.json.gz'].map((name) => [name, hash(fs.readFileSync(path.join(evidence, name)))])),
  compiler: { path: tsPath, version: ts.version, sha256: hash(fs.readFileSync(tsPath)) },
  reportStatus: report.status, diagnostics: report.diagnostics.length,
  diagnosticReasons: counts(report.diagnostics.map((x) => x.reason)),
  firstPartyCount: firstParty.length, firstPartyFiles: sources.size,
  firstPartyFamilies: counts(firstParty.map((x) => x.family)),
  unmatchedDiagnostics: firstParty.filter((x) => !x.matchingNodes.length).map((x) => x.id),
  parsedFirstPartySources: [...sources].map(([file, row]) => ({ file, sha256: row.sha256, bytes: row.bytes, parseErrors: row.parseErrors })),
  installedCount: installed.length, installedIdentity: counts(installed.map((x) => x.identity)),
  census: { caps, totalBytes, totalFiles, cappedFiles: installed.flatMap((x) => x.files).filter((x) => x.status === 'CENSUS_CAP').length,
    parseErrors: installed.flatMap((x) => x.files).reduce((sum, x) => sum + (x.parseErrors ?? 0), 0),
    packagesWithNonJsExecutableCandidates: installed.filter((x) => x.nonJsExecutableCandidates.length).map((x) => x.key) },
  conclusions: { semanticApprovalGranted: false, b6Accepted: false, arbitraryDependencyCodeExecuted: false },
  firstParty, installed
}
fs.writeFileSync(path.join(output, 'recon.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ ...result, firstParty: undefined, installed: undefined, parsedFirstPartySources: undefined }, null, 2))
