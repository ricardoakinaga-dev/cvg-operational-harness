// P4b: same evaluated fixture as P4 'spread', in-process, to expose the thrown error class.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
const CAND = '/mnt/dados/cvg-work/cvg-hiso005-recipe-t2-20261019'
const { buildCompiledReference } = await import(CAND + '/scripts/boundary-semantic-compiled.mjs')
const parent = process.argv[2]
const evaluated = path.join(parent, 'evaluated')
const commit = spawnSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: evaluated, encoding: 'utf8', env: { PATH: '/usr/bin:/bin' } }).stdout.trim()
const manifestPath = path.join(parent, 'installed-reference.json')
const expectedSha256 = (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex')
try {
  buildCompiledReference({ sourceRoot: evaluated, commit, outputRoot: path.join(parent, 'fresh-inprocess'), installedReference: { manifestPath, expectedSha256 } })
  console.log(JSON.stringify({ status: 'BUILT' }))
} catch (e) {
  console.log(JSON.stringify({ status: 'THREW', class: e.constructor.name, message: e.message, code: e.code ?? null, stackTop: String(e.stack).split('\n').slice(0, 3) }, null, 2))
}
