import fs from 'node:fs'
import assert from 'node:assert/strict'
import ts from 'typescript'
const normalize = (node) => {
  const children = []
  ts.forEachChild(node, (child) => {
    children.push(normalize(child))
  })
  return {
    kind: node.kind,
    text: children.length === 0 ? node.getText() : undefined,
    children
  }
}
const parse = (text) =>
  ts.createSourceFile(
    'fixture.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
const left = fs.readFileSync('/tmp/opencode/server.ts.preformat', 'utf8')
const right = fs.readFileSync('apps/api/src/server.ts', 'utf8')
assert.deepEqual(normalize(parse(left)), normalize(parse(right)))
assert.notDeepEqual(
  normalize(parse('const a = 1; const b = 2')),
  normalize(parse('const a = 1; const b = 3'))
)
console.log(
  'PASS full AST traversal: preformat equals current server; second-statement mutation rejected'
)
