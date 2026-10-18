// Crítica R2 HISO005-P2-BUILD-0240, C8: worker PARADO (SIGSTOP no pid exato, sem
// pkill/killall) respeita o prazo único. O teste legado 0236 'kills and reaps ... stalled
// parser worker' passa a parar o PRIMEIRO worker (agora o census); aqui paramos
// separadamente (a) o census e (b) a refinação, com e sem produto conhecido pelo census.
// Fixtures próprias; nenhum alvo é executado.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { NODE, V3, ENV, freshRoot, input, link, saveRaw, write } from './probe-lib.mjs'

const timeoutMs = 3000
const engineFile = path.join(V3, 'scripts/boundary-semantic-engine.mjs')
const ENGINE_CODE =
  'const fs=require("node:fs");const e=require(process.argv[1]);const p=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(e[p.method](...p.args)));'
function build(name, withProduct) {
  const root = freshRoot(name)
  write(root, 'package.json', { name: 'synthetic-root', type: 'module', workspaces: ['packages/*', 'products/*'] })
  write(root, 'entry.mjs', (withProduct ? "import 'prodalias';\n" : '') + "import './a.mjs';\nexport const r=1;\n")
  write(root, 'a.mjs', 'export const a=1;\n')
  if (withProduct) {
    link(root, 'node_modules/prodalias', '../products/x')
    write(root, 'products/x/package.json', { name: 'x', type: 'module' })
    write(root, 'products/x/index.mjs', 'export const x=1;\n')
  }
  return root
}
const cmdline = (pid) => {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')
  } catch {
    return null
  }
}
const children = (pid) => {
  try {
    return fs
      .readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
  } catch {
    return []
  }
}
async function observe(root, which) {
  const caller = spawn(NODE, ['-e', ENGINE_CODE, engineFile], { cwd: root, env: ENV })
  let out = '',
    closed = false
  caller.stdout.on('data', (d) => (out += d))
  const done = new Promise((r) => caller.on('close', (code) => ((closed = true), r(code))))
  caller.stdin.end(JSON.stringify({ method: 'runSemanticBoundary', args: [input(root, ['entry.mjs'], { limits: { timeoutMs } })] }))
  const start = Date.now()
  let stopped = null
  const seen = new Set()
  while (!closed) {
    for (const pid of children(caller.pid)) {
      const cmd = cmdline(pid)
      if (!cmd || !cmd.includes(engineFile) || !cmd.includes('--semantic-worker')) continue
      const census = cmd.includes('--refusal-census')
      seen.add(pid + (census ? ':census' : ':refinement'))
      if (!stopped && ((which === 'census' && census) || (which === 'refinement' && !census))) {
        process.kill(pid, 'SIGSTOP')
        stopped = { pid, census, at: Date.now() - start }
      }
    }
    await new Promise((r) => setTimeout(r, 2))
  }
  const code = await done
  const elapsed = Date.now() - start
  const o = JSON.parse(out)
  const remaining = stopped && fs.existsSync('/proc/' + stopped.pid) ? cmdline(stopped.pid) : null
  return {
    which,
    code,
    elapsedMs: elapsed,
    stopped,
    workersSeen: [...seen],
    stoppedProcessRemaining: remaining && remaining.length ? remaining : null,
    status: o.status,
    proofs: o.proofs.length,
    violations: o.violations,
    unknowns: o.unknowns.map((u) => [u.file, u.reason, u.detail]),
    telemetry: o.telemetry
  }
}
const rows = []
for (const [which, withProduct] of [
  ['census', false],
  ['refinement', false],
  ['refinement', true],
  ['census', true]
])
  rows.push({ withProduct, ...(await observe(build('c8-' + which + (withProduct ? '-product' : ''), withProduct), which)) })
const result = {
  timeoutMs,
  rows,
  check: {
    allStoppedAsTargeted: rows.every((r) => r.stopped && r.stopped.census === (r.which === 'census')),
    allWithinSingleDeadline: rows.every((r) => r.elapsedMs < timeoutMs + 1500),
    noProofs: rows.every((r) => r.proofs === 0),
    noStoppedProcessLeft: rows.every((r) => r.stoppedProcessRemaining === null),
    knownProductSurvivesStoppedRefinement:
      rows[2].status === 'VIOLATION' && rows[2].violations.length === 1,
    noInventedViolationWithoutProduct: rows[0].violations.length === 0 && rows[1].violations.length === 0
  }
}
console.log(JSON.stringify(result.check, null, 2))
saveRaw('r2-C8-stopped-worker-deadline', result)
