// T1 source inventory. Parse TypeScript as data; never import target modules.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const out = path.dirname(fileURLToPath(import.meta.url))
const upstream = '/tmp/cvg-rea-codex-20261017/upstream'
const pin = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
if (
  execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], {
    encoding: 'utf8'
  }).trim() !== pin
)
  throw new Error('Wrong upstream pin')
const root = path.join(upstream, 'sdk/typescript/src')
const sources = new Map()
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex')
function load(name) {
  if (!sources.has(name)) {
    const text = fs.readFileSync(path.join(root, name), 'utf8')
    const ast = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true)
    if (ast.parseDiagnostics.length)
      throw new Error('Parse diagnostics: ' + name)
    sources.set(name, { text, ast })
  }
  return sources.get(name)
}
function source(name, node) {
  const { ast, text } = load(name)
  const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1
  const rel = 'sdk/typescript/src/' + name
  return {
    path: rel,
    sha256: hash(text),
    line,
    url: `https://github.com/openai/codex/blob/${pin}/${rel}#L${line}`
  }
}
function shape(node, ast) {
  if (!node) return null
  const record = { kind: ts.SyntaxKind[node.kind], text: node.getText(ast) }
  if (ts.isUnionTypeNode(node))
    record.alternatives = node.types.map((n) => shape(n, ast))
  if (ts.isArrayTypeNode(node)) record.element = shape(node.elementType, ast)
  if (ts.isTypeLiteralNode(node))
    record.members = node.members.map((n) => member(n, ast))
  return record
}
function member(node, ast) {
  const modifiers = (node.modifiers ?? []).map((n) => n.getText(ast))
  return {
    name:
      node.name?.getText(ast) ??
      (ts.isConstructorDeclaration(node) ? 'constructor' : null),
    kind: ts.SyntaxKind[node.kind],
    modifiers,
    optional: !!node.questionToken,
    type: shape(node.type, ast),
    parameters: (node.parameters ?? []).map((n) => ({
      name: n.name.getText(ast),
      optional: !!n.questionToken,
      rest: !!n.dotDotDotToken,
      default: n.initializer?.getText(ast) ?? null,
      type: shape(n.type, ast)
    })),
    documentation: (node.jsDoc ?? []).map((n) => n.getText(ast)),
    runtime_qualification: 'NOT_RUN'
  }
}
const exports = []
const index = load('index.ts')
for (const node of index.ast.statements) {
  if (!ts.isExportDeclaration(node)) continue
  if (
    !node.moduleSpecifier ||
    !node.exportClause ||
    !ts.isNamedExports(node.exportClause)
  )
    throw new Error(
      'Unhandled export declaration; scope cannot be silently skipped'
    )
  const moduleName = node.moduleSpecifier.text.replace(/^\.\//, '') + '.ts'
  const target = load(moduleName)
  for (const spec of node.exportClause.elements) {
    const original = (spec.propertyName ?? spec.name).text
    const matches = target.ast.statements.filter(
      (n) => n.name?.text === original
    )
    if (matches.length !== 1) throw new Error('Unresolved export: ' + original)
    const declaration = matches[0]
    const row = {
      exported_name: spec.name.text,
      original_name: original,
      type_only: node.isTypeOnly || spec.isTypeOnly,
      export_source: source('index.ts', spec),
      declaration_source: source(moduleName, declaration),
      declaration_kind: ts.SyntaxKind[declaration.kind],
      requirement: ['Codex', 'Thread'].includes(original)
        ? 'CDX100-09-01'
        : [
              'CodexOptions',
              'ThreadOptions',
              'TurnOptions',
              'Input',
              'UserInput',
              'CyberAccessProgram'
            ].includes(original)
          ? 'CDX100-09-04'
          : 'CDX100-09-03',
      owner: 'DX100-D01',
      mandatory: true,
      qualification: 'NOT_RUN'
    }
    if (ts.isTypeAliasDeclaration(declaration))
      row.shape = shape(declaration.type, target.ast)
    else if (ts.isClassDeclaration(declaration)) {
      row.public_members = declaration.members
        .filter(
          (n) =>
            !(n.modifiers ?? []).some(
              (m) =>
                m.kind === ts.SyntaxKind.PrivateKeyword ||
                m.kind === ts.SyntaxKind.ProtectedKeyword
            )
        )
        .map((n) => ({
          ...member(n, target.ast),
          source: source(moduleName, n)
        }))
      row.internal_members = declaration.members
        .filter((n) =>
          (n.modifiers ?? []).some(
            (m) =>
              m.kind === ts.SyntaxKind.PrivateKeyword ||
              m.kind === ts.SyntaxKind.ProtectedKeyword
          )
        )
        .map((n) => n.name?.getText(target.ast))
    } else throw new Error('Unhandled declaration: ' + original)
    exports.push(row)
  }
}
// Include transitively referenced private type aliases as evidence, not exports.
const transitive = []
for (const [name, { ast }] of sources)
  for (const node of ast.statements) {
    if (
      ts.isTypeAliasDeclaration(node) &&
      !exports.some(
        (e) =>
          e.original_name === node.name.text &&
          e.declaration_source.path.endsWith('/' + name)
      )
    ) {
      transitive.push({
        name: node.name.text,
        source: source(name, node),
        shape: shape(node.type, ast),
        classification:
          'UNEXPORTED_TYPE_DECLARATION_IN_EXPORTED_MODULE; reachability review pending'
      })
    }
  }
const result = {
  commit: pin,
  parser: 'typescript ' + ts.version,
  public_export_count: exports.length,
  exports,
  transitive_candidates: transitive,
  source_files: [...sources].map(([name, data]) => ({
    path: 'sdk/typescript/src/' + name,
    sha256: hash(data.text)
  })),
  functional_receipts: 0,
  scope_closure: 'OPEN_G01; syntax is not functional SDK parity',
  required_semantic_cases: [
    'startThread defers execution; id starts null, resume preserves supplied id',
    'string and ordered text/local_image input normalization',
    'runStreamed lazy generator, usage defaults, invalid JSON and cleanup on return/throw/abort',
    'run accumulates completed items, last agent response, usage and turn failure',
    'structured config vs raw overrides vs SDK/thread managed precedence',
    'explicit environment vs inherited environment, AbortSignal, subprocess exit/errors',
    'output schema temp file lifetime and cleanup failures',
    'platform packaging behavior and exported constructor internal annotations',
    'review source-only unions and all field presence/default/error variants before oracle freeze'
  ],
  implementation_constraint:
    'Reference SDK wraps CodexExec. CVG must reproduce observable contracts natively; executing installed Codex is not parity implementation.'
}
fs.writeFileSync(
  path.join(out, 'sdk-public-inventory.json'),
  JSON.stringify(result, null, 2) + '\n'
)
console.log(
  JSON.stringify({
    exports: exports.length,
    source_files: sources.size,
    functional_receipts: 0
  })
)
