import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
const repo = path.resolve(process.argv[2] ?? process.cwd())
const require = createRequire(path.join(repo, 'package.json'))
const ts = require('typescript')
const originalPath = process.argv[3]
if (!originalPath) throw new Error('Original frozen runtime required')
const read = (p) => fs.readFileSync(p, 'utf8')
const parse = (p, text = read(p)) => ts.createSourceFile(p, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const before = parse(originalPath)
const runtimeDir = path.join(repo, 'packages/agent-runtime/src')
const modules = ['runtime.ts', 'runtime-effect-recovery.ts', 'runtime-approval-request.ts', 'runtime-execution-context.ts', 'runtime-effect-identity.ts']
const after = modules.map(p => parse(path.join(runtimeDir, p)))
if ([before, ...after].some(s => s.parseDiagnostics.length)) throw new Error('Source parsing failed')
const classOf = s => s.statements.find(ts.isClassDeclaration)
const name = n => n.name?.getText().replace(/^#/, '')
const originalMethods = classOf(before).members.filter(ts.isMethodDeclaration)
const recovery = classOf(after[1])
const request = after[2].statements.find(ts.isFunctionDeclaration)
const moved = new Set([...recovery.members.filter(ts.isMethodDeclaration).map(name), name(request)])
const methods = [...classOf(after[0]).members, ...recovery.members].filter(ts.isMethodDeclaration).concat(request)
function shape(n) {
  if (!n) return null
  if (ts.isIdentifier(n) && n.text === name(request)) return { kind: 'internal_method_reference', method: name(request) }
  if (ts.isPropertyAccessExpression(n)) {
    const method = n.name.getText().replace(/^#/, '')
    const receiver = n.expression.getText().replace(/\s/g, '')
    if (moved.has(method) && ['this', 'this.#recovery', 'this.#approvalRequest'].includes(receiver)) return { kind: 'internal_method_reference', method }
  }
  return {
    kind: ts.SyntaxKind[n.kind],
    ...(ts.isIdentifier(n) || ts.isPrivateIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? { text: n.getText() } : {}),
    children: n.getChildren().filter(x => x.kind !== ts.SyntaxKind.EndOfFileToken).map(shape)
  }
}
const equal = (a, b) => JSON.stringify(shape(a)) === JSON.stringify(shape(b))
const failures = []
const checks = []
for (const original of originalMethods) {
  const candidates = methods.filter(m => name(m) === name(original))
  if (candidates.length !== 1) { failures.push(`Method uniqueness ${name(original)}: ${candidates.length}`); continue }
  const current = candidates[0]
  const bodyEqual = equal(original.body, current.body)
  const signatureEqual = JSON.stringify(original.parameters.map(shape)) === JSON.stringify(current.parameters.map(shape)) && equal(original.type, current.type)
  checks.push({ method: name(original), bodyEqual, signatureEqual })
  if (!bodyEqual || !signatureEqual) failures.push(`Method mismatch: ${name(original)}`)
}
for (const original of before.statements.filter(ts.isFunctionDeclaration)) {
  const candidates = after.flatMap(s => s.statements).filter(ts.isFunctionDeclaration).filter(f => name(f) === name(original))
  if (candidates.length !== 1 || !equal(original.body, candidates[0].body) || JSON.stringify(original.parameters.map(shape)) !== JSON.stringify(candidates[0].parameters.map(shape)) || !equal(original.type, candidates[0].type)) failures.push(`Function mismatch: ${name(original)}`)
  checks.push({ function: name(original), preserved: candidates.length === 1 && equal(original.body, candidates[0].body) })
}
for (const original of before.statements.filter(n => ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n))) {
 const candidates = after.flatMap(s => s.statements).filter(n => (ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) && name(n) === name(original))
 const originalShape = ts.isInterfaceDeclaration(original) ? original.members.map(shape) : shape(original.type)
 const currentShape = candidates.length === 1 ? (ts.isInterfaceDeclaration(candidates[0]) ? candidates[0].members.map(shape) : shape(candidates[0].type)) : undefined
 const preserved = JSON.stringify(originalShape) === JSON.stringify(currentShape)
 checks.push({ type: name(original), preserved }); if (!preserved) failures.push(`Type mismatch: ${name(original)}`)
}
for (const ctor of [classOf(after[0]), recovery].map(c => c.members.find(ts.isConstructorDeclaration))) {
 if (!ctor?.body.statements.some(n => n.getText().replace(/\s/g, '') === 'this.#options=options')) failures.push('Shared options assignment missing')
}
// Mutation sentinel: the same comparator must reject a changed method operation/body.
const badSource = read(path.join(runtimeDir, 'runtime-effect-recovery.ts')).replace("'effect_uncertain'", "'effect_succeeded'")
if (badSource === read(path.join(runtimeDir, 'runtime-effect-recovery.ts'))) failures.push('Known-bad mutation fixture missing')
const bad = classOf(parse('known-bad.ts', badSource)).members.find(m => name(m) === 'handleToolFailure')
const good = recovery.members.find(m => name(m) === 'handleToolFailure')
const knownBadRejected = !equal(good.body, bad.body)
const knownGoodAccepted = equal(good.body, good.body)
if (!knownBadRejected || !knownGoodAccepted) failures.push('Comparator sentinel failure')
const results = { status: failures.length ? 'FAIL' : 'PASS', originalSha256: createHash('sha256').update(read(originalPath)).digest('hex'), normalization: 'Only internal moved-method references on exact this receivers; all other AST tokens/order/signatures/types retained.', checks, knownGoodAccepted, knownBadRejected, failures, lineCounts: Object.fromEntries(modules.map(p => [p, read(path.join(runtimeDir,p)).split('\n').length-1])), limitations: 'Structure proof complements execution; does not prove external environment, altered this binding, or full parent task/release. Compare public index and options construction separately.' }
process.stdout.write(JSON.stringify(results, null, 2) + '\n')
process.exitCode = failures.length ? 1 : 0
