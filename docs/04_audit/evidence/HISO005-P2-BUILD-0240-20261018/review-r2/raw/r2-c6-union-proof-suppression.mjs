// Crítica R2 HISO005-P2-BUILD-0240, C6: a união no pai suprime provas quando somente o
// census conhece a violação. Única forma determinística de obter "census VIOLATION +
// refinação PROVEN" é uma mutação entre os dois filhos (TOCTOU): o census lê entry.mjs com
// o alias de produto; depois que ele já o descobriu (e ainda está vivo), a sonda troca
// entry.mjs por uma versão fechada e remove o alias; a refinação então é PROVEN sozinha.
// Observa o census só por /proc/<pid>/cmdline (sem pkill/killall). Nenhum alvo é executado.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { NODE, V3, ENV, freshRoot, input, link, saveRaw, write } from './probe-lib.mjs'

// Tentativa 1 (N=2000, atraso fixo 2500 ms; out/r2-C6-attempt1-n2000-control-enobufs.json):
// o controle ficou UNKNOWN por outputBytes (provas com premissas O(N²) > 64 MiB, limite v2
// preexistente), então não demonstrava "refinação sozinha PROVEN". Tentativa 2: N menor e
// atraso calibrado entre o 1º stream e a saída do census medidos num census direto.
const N = Number(process.argv[2] || 400)
const tree = (root) => {
  let s = ''
  for (let i = 0; i < N; i++) {
    write(root, `t/f${i}.mjs`, '')
    s += `import './t/f${i}.mjs';\n`
  }
  return s
}
function build(name) {
  const root = freshRoot(name)
  write(root, 'package.json', { name: 'synthetic-root', type: 'module', workspaces: ['packages/*', 'products/*'] })
  const body = tree(root)
  write(root, 'entry.mjs', "import 'prodalias';\n" + body)
  write(root, 'entry.next', body)
  link(root, 'node_modules/prodalias', '../products/x')
  write(root, 'products/x/package.json', { name: 'x', type: 'module' })
  write(root, 'products/x/index.mjs', 'export const x=1;\n')
  return root
}
const ENGINE_CODE =
  'const fs=require("node:fs");const e=require(process.argv[1]);const p=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(e[p.method](...p.args)));'
const engineFile = path.join(V3, 'scripts/boundary-semantic-engine.mjs')
function runAsync(root) {
  return new Promise((resolve) => {
    const child = spawn(NODE, ['-e', ENGINE_CODE, engineFile], { cwd: root, env: ENV })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.on('exit', (code) => resolve({ code, out }))
    child.stdin.end(JSON.stringify({ method: 'runSemanticBoundary', args: [input(root, ['entry.mjs'])] }))
  })
}
const censusPids = () => {
  const found = []
  for (const pid of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
    try {
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0')
      if (cmd.includes(engineFile) && cmd.includes('--refusal-census')) found.push(pid)
    } catch {}
  }
  return found
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Calibração: census direto (mesmo argv do pai) num clone do fixture; mede o instante do
// 1º stream de violação e o da saída.
const calib = build('c6-calibration')
const calibration = await new Promise((resolve) => {
  const t = Date.now()
  const child = spawn(NODE, ['--experimental-vm-modules', engineFile, '--semantic-worker', '--refusal-census'], { cwd: path.dirname(engineFile), env: ENV })
  let streamAt = null,
    err = ''
  child.stderr.on('data', (d) => {
    err += d
    if (streamAt === null && err.includes('CVG_SEMANTIC_VIOLATION_V1 ')) streamAt = Date.now() - t
  })
  child.stdout.on('data', () => {})
  child.on('exit', (code) => resolve({ code, streamAt, exitAt: Date.now() - t }))
  child.stdin.end(JSON.stringify(input(calib, ['entry.mjs'])))
})
const delayMs = Math.round((calibration.streamAt + calibration.exitAt) / 2)
const root = build('c6-toctou-union')
const timeline = [{ event: 'calibration', ...calibration, delayMs }]
const t0 = Date.now()
const pending = runAsync(root)
let pid = null
while (!pid && Date.now() - t0 < 30000) {
  pid = censusPids()[0] || null
  if (!pid) await sleep(5)
}
const seenAt = Date.now()
timeline.push({ event: 'censusSeen', pid, at: seenAt - t0 })
await sleep(Math.max(0, delayMs - (Date.now() - seenAt)))
const aliveBefore = pid && fs.existsSync('/proc/' + pid)
fs.renameSync(path.join(root, 'entry.next'), path.join(root, 'entry.mjs'))
fs.unlinkSync(path.join(root, 'node_modules/prodalias'))
const aliveAfter = pid && fs.existsSync('/proc/' + pid)
timeline.push({ event: 'mutated', at: Date.now() - t0, censusAliveBefore: aliveBefore, censusAliveAfter: aliveAfter })
const res = await pending
timeline.push({ event: 'done', at: Date.now() - t0, code: res.code })
const out = JSON.parse(res.out)
// Controle: o MESMO estado final, analisado do zero, é PROVEN (a refinação sozinha prova).
const control = await runAsync(root)
const ctl = JSON.parse(control.out)
const result = {
  N,
  delayMs,
  root,
  timeline,
  united: {
    status: out.status,
    proofs: out.proofs.length,
    violations: out.violations,
    unknowns: out.unknowns.map((u) => [u.file, u.reason, u.detail]),
    validation: out.validation,
    installed: out.installed,
    telemetry: out.telemetry
  },
  controlFinalState: { status: ctl.status, proofs: ctl.proofs.length, violations: ctl.violations, telemetry: ctl.telemetry },
  check: {
    mutationWhileCensusAlive: aliveBefore && aliveAfter,
    unitedViolation: out.status === 'VIOLATION' && out.violations.length === 1 && out.violations[0].target === 'products/x',
    unitedProofs0: out.proofs.length === 0,
    refinementAloneProven: ctl.status === 'PROVEN' && ctl.proofs.length > 0
  }
}
console.log(JSON.stringify(result.check, null, 2))
saveRaw('r2-C6-union-proof-suppression', result)
