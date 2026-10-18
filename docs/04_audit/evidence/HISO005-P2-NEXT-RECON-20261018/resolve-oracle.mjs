// HISO005-P2-NEXT-RECON-20261018 — resolution-only oracle with pinned Node.
// import.meta.resolve / createRequire().resolve return URLs/paths; no target is
// imported, required or evaluated. cwd is the importer directory inside the
// readonly reference r5 snapshot; nothing is written there.
// Usage: <node22.23.2> resolve-oracle.mjs [output-dir]
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const EV = path.dirname(fileURLToPath(import.meta.url))
const R5 = '/mnt/ia/cvg-hiso005-build0240-runtime-20261018/installed-reference-r5/snapshot'
const NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
const sha = (b) => createHash('sha256').update(b).digest('hex')
const ESM = 'console.log(JSON.stringify({resolved: import.meta.resolve(process.argv[1])}))'
const CJS =
  "const {createRequire}=require('node:module');const r=createRequire(require('node:path').join(process.cwd(),'oracle.cjs'));console.log(JSON.stringify({resolved:r.resolve(process.argv[1])}))"
const cases = [
  { id: 'abort-edge-esm', importerDir: 'node_modules/@vitest/pretty-format/dist', specifier: 'tinyrainbow', mode: 'import' },
  { id: 'abort-edge-cjs', importerDir: 'node_modules/@vitest/pretty-format/dist', specifier: 'tinyrainbow', mode: 'require' },
  { id: 'first-edge-esm', importerDir: 'apps/api/src/__tests__', specifier: 'vitest', mode: 'import' }
]
const rows = []
for (const c of cases) {
  const cwd = path.join(R5, c.importerDir)
  const argv =
    c.mode === 'import'
      ? [NODE, '--input-type=module', '-e', ESM, c.specifier]
      : [NODE, '--input-type=commonjs', '-e', CJS, c.specifier]
  const p = spawnSync(argv[0], argv.slice(1), {
    cwd,
    encoding: 'utf8',
    env: { PATH: path.dirname(NODE) + ':/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' },
    timeout: 30000
  })
  let resolved = null
  try {
    resolved = JSON.parse(p.stdout).resolved
  } catch {}
  const file = resolved ? (resolved.startsWith('file:') ? fileURLToPath(resolved) : resolved) : null
  const rel = file && file.startsWith(R5 + '/') ? file.slice(R5.length + 1) : file
  let target = null
  if (file && fs.existsSync(file)) {
    const st = fs.lstatSync(file)
    target = { regular: st.isFile(), bytes: st.size, sha256: st.isFile() ? sha(fs.readFileSync(file)) : null }
  }
  rows.push({ ...c, argv, cwd, exitCode: p.status, stderr: p.stderr, resolved: rel, target })
}
const out = {
  task: 'HISO005-P2-NEXT-RECON-20261018',
  observedAt: new Date().toISOString(),
  scope: 'Somente resolução; nenhum alvo importado/avaliado. Disponibilidade e corpo são obrigações separadas.',
  rows
}
fs.writeFileSync(path.join(process.argv[2] ? path.resolve(process.argv[2]) : EV, 'resolve-oracle.json'), JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify(rows.map((r) => [r.id, r.exitCode, r.resolved, r.target?.sha256?.slice(0, 12)]), null, 1))
