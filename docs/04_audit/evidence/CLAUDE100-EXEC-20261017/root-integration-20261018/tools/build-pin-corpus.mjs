// Builds tests/fixtures/pare100-historical-pins from approved bytes only:
// sources = git blob 38f3e18d (root-r4 integration of the PARE100 candidate);
// compiled mirrors = TypeScript transpile of that approved source with the
// repository's pinned compiler and the build:runtime emit options.
// Every file must hash to the pin of its sealed proposal, or the build aborts.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const cwd = '/mnt/ia/cvg-c100-integration-20261018'
const require = createRequire(path.join(cwd, 'package.json'))
const ts = require('typescript')
const sha = (b) => createHash('sha256').update(b).digest('hex')
const proposals = {
  SPEC0215: 'docs/04_audit/evidence/PARE100-EXEC-20261014/spec0215/revision-r4/proposed-exceptions.json',
  SPEC0216: 'docs/04_audit/evidence/PARE100-EXEC-20261014/spec0216/proposed-exceptions.json'
}
const APPROVED = '38f3e18da9649f5dd1a466e85f9a3b4a226978b0'
const corpus = path.join(cwd, 'tests/fixtures/pare100-historical-pins')
const files = {}
for (const [spec, proposalPath] of Object.entries(proposals)) {
  const proposalBytes = fs.readFileSync(path.join(cwd, proposalPath))
  for (const g of JSON.parse(proposalBytes).groups)
    for (const [file, pin] of Object.entries(g.pins)) {
      if (files[file]) { if (files[file].sha256 !== pin) throw new Error(`conflicting pin ${file}`); continue }
      let bytes, provenance
      const dist = file.match(/^(.*)\/dist\/(.*)\.js$/)
      if (dist) {
        const source = `${dist[1]}/src/${dist[2]}.ts`
        const text = execFileSync('git', ['show', `${APPROVED}:${source}`], { cwd })
        bytes = Buffer.from(ts.transpileModule(text.toString('utf8'), {
          fileName: path.join(cwd, source),
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, sourceMap: true, esModuleInterop: true, strict: true, allowImportingTsExtensions: true, rewriteRelativeImportExtensions: true }
        }).outputText)
        provenance = { kind: 'compiled-mirror', source: `${APPROVED}:${source}`, typescript: ts.version, emit: 'transpileModule ES2022/ES2022, sourceMap, rewriteRelativeImportExtensions (build:runtime emit options)' }
      } else {
        bytes = execFileSync('git', ['show', `${APPROVED}:${file}`], { cwd })
        provenance = { kind: 'source', source: `${APPROVED}:${file}` }
      }
      if (sha(bytes) !== pin) throw new Error(`pin mismatch ${file}: ${sha(bytes)} != ${pin}`)
      // Content-addressed: keeps compiled mirrors out of gitignored dist/ paths.
      const target = path.join(corpus, `${pin}.source.txt`)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, bytes)
      let live = null
      try { live = sha(fs.readFileSync(path.join(cwd, file))) === pin ? 'EQUAL' : 'DIFFERENT' } catch { live = 'ABSENT' }
      files[file] = { sha256: pin, bytes: bytes.length, proposal: spec, proposalPath, provenance, liveAtBuild: live }
    }
}
const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
const manifest = {
  schemaVersion: 1,
  purpose: 'Approved bytes of the files pinned by the historical SPEC0215 (revision-r4) and SPEC0216 proposals. Under SPEC0228 those tables are inactive inventory; the boundary qualification tests build their fixtures from these frozen bytes instead of the live tree, which later approved work (SPEC0217/SPEC0225) changed.',
  approvedCommit: APPROVED,
  files: Object.fromEntries(Object.entries(sorted).map(([f, e]) => [f, { sha256: e.sha256, bytes: e.bytes, proposal: e.proposal, provenance: e.provenance }]))
}
fs.writeFileSync(path.join(corpus, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(JSON.stringify(Object.fromEntries(Object.entries(sorted).map(([f, e]) => [f, `${e.proposal} ${e.provenance.kind} live=${e.liveAtBuild} ${e.bytes}B`])), null, 1))
