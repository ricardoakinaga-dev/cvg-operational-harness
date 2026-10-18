// S04 (RC4, MS06-MS08): revalidação pai (revalidateSemanticInputs/revalidateResolutionSnapshot)
// rejeita trace adulterado, perfil v2, prova v2 e mutação de campo inativo; FD/limites fail-closed.
import fs from 'node:fs'
import path from 'node:path'
import { V2, V3, engine, freshRoot, helper, input, link, saveRaw, write } from './probe-lib.mjs'

const h3 = await helper(V3)
const copy = (x) => JSON.parse(JSON.stringify(x))
function build(root, { metadata = true } = {}) {
  write(root, 'package.json', { name: 'synthetic-root', type: 'module', workspaces: ['packages/*', 'products/*'] })
  write(root, 'packages/demo/package.json', {
    name: 'demo',
    type: 'module',
    ...(metadata ? { imports: { '#unused/tools': { arbitrary: [null, 17, false] } } } : {}),
    exports: { '.': './chosen.mjs', ...(metadata ? { './unused/*': { u: [null, 17] } } : {}) }
  })
  write(root, 'packages/demo/chosen.mjs', 'export const a=1;')
  link(root, 'node_modules/demo', '../packages/demo')
  write(root, 'entry.mjs', "import {a} from 'demo';export const r=a;")
}
const results = []
const record = (id, criterion, expected, observed, pass, extra = {}) => {
  results.push({ id, criterion, expected, observed, pass, ...extra })
  console.log(id, pass ? 'PASS' : 'FAIL', JSON.stringify(observed).slice(0, 200))
}
const root = freshRoot('s04-reval')
build(root)
const out = engine(V3, root, [input(root, ['entry.mjs'])])
record('R0-baseline-proven', 'MS08', 'PROVEN', out.status, out.status === 'PROVEN' && out.validation.valid)
const reval = (o) => engine(V3, root, [root, o], 'revalidateSemanticInputs')
const snapCheck = (snapshot) => {
  try {
    return h3.revalidateResolutionSnapshot({ root, snapshot })
  } catch (e) {
    return 'THROW:' + e.message
  }
}
record('R1-reval-untampered', 'MS08', true, reval(out), reval(out) === true)
const tampers = {
  'R2-imports-keys-emptied': (o) => o.runtimeResolution.resolutions.forEach((t) => (t.metadataSelection.imports.keys = [])),
  'R3-branch-swapped-to-pattern': (o) => o.runtimeResolution.resolutions.forEach((t) => (t.branch = ['./unused/*'])),
  'R4-metadataSelection-removed': (o) => o.runtimeResolution.resolutions.forEach((t) => delete t.metadataSelection),
  'R5-unselectedPatternKeys-emptied': (o) => o.runtimeResolution.resolutions.forEach((t) => (t.metadataSelection.exports.unselectedPatternKeys = [])),
  'R6-imports-eligible-false': (o) => o.runtimeResolution.resolutions.forEach((t) => (t.metadataSelection.imports.eligible = false)),
  'R7-profile-v2-string': (o) => (o.runtimeResolution.profile = 'linux-rootfd-workspace-v1'),
  'R8-selectedKey-changed': (o) => o.runtimeResolution.resolutions.forEach((t) => (t.metadataSelection.exports.selectedKey = './unused/x'))
}
for (const [id, mutate] of Object.entries(tampers)) {
  const o = copy(out)
  mutate(o)
  const r = reval(o)
  const s = snapCheck(o.runtimeResolution)
  record(id, 'MS08', 'false/THROW', { revalidateSemanticInputs: r, revalidateResolutionSnapshot: s }, r === false && typeof s === 'string' && s.startsWith('THROW:UNKNOWN_'))
}
// R9: prova/snapshot v2 (árvore 84d8) num fixture sem metadados (provável na v2) não satisfaz v3.
const root2 = freshRoot('s04-v2proof')
build(root2, { metadata: false })
const v2out = engine(V2, root2, [input(root2, ['entry.mjs'])])
const v2reval = engine(V3, root2, [root2, v2out], 'revalidateSemanticInputs')
let v2snap
try {
  v2snap = h3.revalidateResolutionSnapshot({ root: root2, snapshot: v2out.runtimeResolution })
} catch (e) {
  v2snap = 'THROW:' + e.message
}
record('R9-v2-proof-and-snapshot-rejected', 'MS08', 'v2 PROVEN; v3 reval false/THROW', { v2status: v2out.status, v2kernel: v2out.kernelVersion, v2profile: v2out.runtimeResolution?.profile, v3reval: v2reval, v3snapshot: v2snap }, v2out.status === 'PROVEN' && v2reval === false && String(v2snap).startsWith('THROW:UNKNOWN_'))
// R10/R11: mutação de campo inativo (mesmo tamanho) invalida snapshot/prova anteriores.
for (const [id, from, to] of [
  ['R10-mutate-inactive-imports-value', '17,false', '18,false'],
  ['R11-mutate-inactive-pattern-value', '"u":[null,17]', '"u":[null,18]']
]) {
  const r = freshRoot('s04-' + id)
  build(r)
  const before = engine(V3, r, [input(r, ['entry.mjs'])])
  const manifest = path.join(r, 'packages/demo/package.json')
  const text = fs.readFileSync(manifest, 'utf8')
  if (!text.includes(from)) throw Error('fixture text missing ' + from)
  fs.writeFileSync(manifest, text.replace(from, to))
  const rv = engine(V3, r, [r, before], 'revalidateSemanticInputs')
  let sv
  try {
    sv = h3.revalidateResolutionSnapshot({ root: r, snapshot: before.runtimeResolution })
  } catch (e) {
    sv = 'THROW:' + e.message
  }
  const after = engine(V3, r, [input(r, ['entry.mjs'])])
  const d0 = before.proofs.find((p) => p.rule === 'K5')?.derivation.runtimeResolutionDigest
  const d1 = after.proofs.find((p) => p.rule === 'K5')?.derivation.runtimeResolutionDigest
  record(id, 'MS07', 'old proof rejected; new digest', { beforeStatus: before.status, revalidateSemanticInputs: rv, revalidateResolutionSnapshot: sv, afterStatus: after.status, digestChanged: d0 !== d1 }, before.status === 'PROVEN' && rv === false && String(sv).startsWith('THROW:UNKNOWN_') && d0 && d1 && d0 !== d1)
}
// L1: FD fechados após erros EACCES/ENOENT/limites; contagem real de /proc/self/fd.
const fdCount = () => fs.readdirSync('/proc/self/fd').length
const fdBefore = fdCount()
const errors = {}
{
  const r = freshRoot('s04-fd')
  build(r)
  write(r, 'packages/demo/big/package.json', '{"name":"big","imports":{"#a":"' + 'x'.repeat(5000) + '"}}')
  const attempts = [
    ['ENOENT', {}, 'demo/missing'],
    ['maxOpenDescriptors', { maxOpenDescriptors: 2 }, 'demo'],
    ['maxFileBytes', { maxFileBytes: 64 }, 'demo'],
    ['maxPathComponents', { maxPathComponents: 1 }, 'demo']
  ]
  for (const [label, limits, specifier] of attempts) {
    let s
    try {
      s = h3.createResolutionSession({ root: r, limits })
      s.resolve({ from: 'entry.mjs', specifier, mode: 'import' })
      errors[label] = 'NO_ERROR'
    } catch (e) {
      errors[label] = e.message
    } finally {
      try {
        s?.close()
      } catch {}
    }
  }
  // EACCES: diretório do pacote sem permissão (restaurado ao final; só fixture própria).
  const dir = path.join(r, 'packages/demo')
  fs.chmodSync(dir, 0o000)
  let s
  try {
    s = h3.createResolutionSession({ root: r })
    s.resolve({ from: 'entry.mjs', specifier: 'demo', mode: 'import' })
    errors.EACCES = 'NO_ERROR'
  } catch (e) {
    errors.EACCES = e.message
  } finally {
    try {
      s?.close()
    } catch {}
    fs.chmodSync(dir, 0o755)
  }
}
const fdAfter = fdCount()
record('L1-fd-closure-and-fail-closed', 'MS07', 'all UNKNOWN_*, fdAfter==fdBefore', { fdBefore, fdAfter, errors }, fdBefore === fdAfter && Object.values(errors).every((m) => /^UNKNOWN_/.test(m)))
// L2: limites não aumentados (constantes iguais v2/v3)
const h2 = await helper(V2)
record('L2-limits-unchanged', 'MS07', 'RESOLUTION_LIMITS v2==v3', { v2: h2.RESOLUTION_LIMITS, v3: h3.RESOLUTION_LIMITS, v2profile: h2.RESOLUTION_PROFILE, v3profile: h3.RESOLUTION_PROFILE }, JSON.stringify(h2.RESOLUTION_LIMITS) === JSON.stringify(h3.RESOLUTION_LIMITS) && h2.RESOLUTION_PROFILE !== h3.RESOLUTION_PROFILE)
saveRaw('s04-revalidation-limits', results)
