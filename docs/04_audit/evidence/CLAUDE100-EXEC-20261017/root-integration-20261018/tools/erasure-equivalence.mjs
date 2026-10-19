// Proves the type-only rewrite: for each file, HEAD bytes and worktree bytes
// produce identical JavaScript after TypeScript erasure + esbuild minify,
// and identical output with Node's own stripTypeScriptTypes (whitespace-normalized).
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import * as nodeModule from 'node:module'
const require = createRequire('/mnt/ia/cvg-c100-integration-20261018/package.json')
const esbuild = require('esbuild')
const [rev, out, ...files] = process.argv.slice(2)
const sha = (s) => createHash('sha256').update(s).digest('hex')
const results = []
for (const f of files) {
  const before = execFileSync('git', ['show', `${rev}:${f}`], { cwd: '/mnt/ia/cvg-c100-integration-20261018', maxBuffer: 1 << 28 }).toString()
  const after = readFileSync(`/mnt/ia/cvg-c100-integration-20261018/${f}`, 'utf8')
  // Identifier mangling is excluded: its frequency-based naming also counts type-only references.
  const min = (code) => esbuild.transformSync(code, { loader: 'ts', minifySyntax: true, minifyWhitespace: true, format: 'esm', target: 'es2022' }).code
  const strip = (code) => nodeModule.stripTypeScriptTypes(code, { mode: 'strip' })
  const norm = (code) => code.replace(/\s+/g, '').replace(/[()]/g, '')
  const mb = min(before), ma = min(after)
  let nodeStripEqual = null
  if (typeof nodeModule.stripTypeScriptTypes === 'function') nodeStripEqual = norm(strip(before)) === norm(strip(after))
  results.push({ file: f, beforeSha256: sha(before), afterSha256: sha(after), esbuildSyntaxWhitespaceMinifiedEqual: mb === ma, minifiedSha256: sha(ma), nodeStripTypesEqualIgnoringWhitespaceAndParens: nodeStripEqual })
}
writeFileSync(out, JSON.stringify({ rev, node: process.version, esbuild: esbuild.version, results }, null, 2) + '\n')
console.log(results.map((r) => `${r.esbuildSyntaxWhitespaceMinifiedEqual} ${r.nodeStripTypesEqualIgnoringWhitespaceAndParens} ${r.file}`).join('\n'))
