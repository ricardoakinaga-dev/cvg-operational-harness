// Static preservation check only. It does not judge assertion quality or runtime success.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const [compilerRoot, baselineInput, candidateRoot] = process.argv.slice(2)
if (!compilerRoot || !baselineInput) {
  console.error(
    'usage: node check-original-product-scenarios.mjs <compiler-root> <frozen-source-json> [candidate-root]'
  )
  process.exit(2)
}
const ts = createRequire(resolve(compilerRoot, 'package.json'))('typescript')
const sha = (value) => createHash('sha256').update(value).digest('hex')
const baseline = JSON.parse(readFileSync(baselineInput, 'utf8'))
if (!Array.isArray(baseline) || baseline.length !== 2)
  throw new Error('BASELINE_INPUT_INVALID')

function inventory(path, source) {
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  if (tree.parseDiagnostics.length) throw new Error(`PARSE_FAILED:${path}`)
  const tests = []
  function visit(node, groups = []) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression
      if (ts.isIdentifier(expr) && expr.text === 'describe') {
        const [name, fn] = node.arguments
        if (
          !name ||
          !ts.isStringLiteral(name) ||
          !fn ||
          !ts.isArrowFunction(fn)
        )
          throw new Error(`DESCRIBE_UNSUPPORTED:${path}`)
        ts.forEachChild(fn.body, (child) =>
          visit(child, [...groups, name.text])
        )
        return
      }
      let mode
      let rows = [null]
      if (ts.isIdentifier(expr) && ['it', 'test'].includes(expr.text))
        mode = 'plain'
      else if (
        ts.isPropertyAccessExpression(expr) &&
        ts.isIdentifier(expr.expression) &&
        ['it', 'test'].includes(expr.expression.text)
      )
        throw new Error(`TEST_MODIFIER_UNSUPPORTED:${path}:${expr.name.text}`)
      else if (
        ts.isCallExpression(expr) &&
        ts.isPropertyAccessExpression(expr.expression) &&
        ts.isIdentifier(expr.expression.expression) &&
        ['it', 'test'].includes(expr.expression.expression.text)
      ) {
        if (
          expr.expression.name.text !== 'each' ||
          expr.arguments.length !== 1 ||
          !ts.isArrayLiteralExpression(expr.arguments[0])
        )
          throw new Error(`PARAMETERIZATION_UNSUPPORTED:${path}`)
        mode = 'each'
        rows = expr.arguments[0].elements.map((row) => {
          if (
            !ts.isArrayLiteralExpression(row) ||
            !ts.isStringLiteral(row.elements[0])
          )
            throw new Error(`CASE_NAME_UNSUPPORTED:${path}`)
          return row.elements[0].text
        })
        if (!rows.length) throw new Error(`EMPTY_PARAMETERIZATION:${path}`)
      }
      if (mode) {
        const title = node.arguments[0]
        if (!title || !ts.isStringLiteral(title))
          throw new Error(`TEST_NAME_UNSUPPORTED:${path}`)
        for (const row of rows) {
          if (mode === 'each' && (title.text.match(/%s/g) ?? []).length !== 1)
            throw new Error(`CASE_FORMAT_UNSUPPORTED:${path}`)
          tests.push(
            [
              ...groups,
              mode === 'each' ? title.text.replace('%s', row) : title.text
            ].join(' / ')
          )
        }
        return
      }
    }
    ts.forEachChild(node, (child) => visit(child, groups))
  }
  visit(tree)
  if (!tests.length || new Set(tests).size !== tests.length)
    throw new Error(`EMPTY_OR_DUPLICATE_TESTS:${path}`)
  return { path, sourceSha256: sha(source), count: tests.length, names: tests }
}

const original = baseline.map((item) => inventory(item.path, item.source))
if (original.reduce((sum, item) => sum + item.count, 0) !== 37)
  throw new Error('BASELINE_EXPECTED_37')
const current = candidateRoot
  ? original.map((item) =>
      inventory(
        item.path,
        readFileSync(resolve(candidateRoot, item.path), 'utf8')
      )
    )
  : null
const missing =
  current?.flatMap((item, index) =>
    original[index].names
      .filter((name) => !item.names.includes(name))
      .map((name) => ({ path: item.path, name }))
  ) ?? []
console.log(
  JSON.stringify(
    {
      kind: 'static-original-scenario-inventory',
      baselineInputSha256: sha(readFileSync(baselineInput)),
      baseline: original,
      candidate: current,
      missing,
      result: candidateRoot
        ? missing.length
          ? 'FAIL'
          : 'SCENARIO_NAMES_PRESERVED'
        : 'BASELINE_INVENTORIED',
      limitation:
        'Names/counts do not prove original assertions preserved, behavior passed, or product accepted; Critic must inspect changed tests and actual runtime.'
    },
    null,
    2
  )
)
if (missing.length) process.exitCode = 1
