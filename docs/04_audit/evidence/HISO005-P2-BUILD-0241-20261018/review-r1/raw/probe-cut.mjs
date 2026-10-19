// Review R1 probe: §3.2 deterministic body cut by each of the four counters,
// after a contained edge and a body-only product edge in an earlier module.
// Two runs per cap (payload equality without telemetry), v3 conservation and
// violation containment on the same input; maxNodes and timeoutMs stay global.
import fs from 'node:fs'
import path from 'node:path'
import * as H from './harness.mjs'

const OUT = path.join(import.meta.dirname, 'probe-cut.json')
const files = {
  'a.mjs': "import fs from 'node:fs'\nconst m = { p: './products/x.mjs' }\nimport(m.p)\nexport const u = missingA\n",
  'b.mjs': "function f(x) { return x }\nconst r1 = f(1)\nconst r2 = f(2)\nfunction g(y) { return f(y) }\nconst r3 = g(3)\nconst c = {}\nconst s = c ? 'left' : 'right'\nexport default 1\n",
  'c.mjs': "const n = { r: './products/z.mjs' }\nimport(n.r)\nexport default 1\n",
  'products/x.mjs': 'export default 1\n',
  'products/z.mjs': 'export default 1\n'
}
const base = H.fixture('cut', 'base', files, { starts: ['a.mjs', 'b.mjs', 'c.mjs'] })
const [free] = H.run(H.V4, [base])
const key = { maxStates: 'states', maxContexts: 'contexts', maxCallDepth: 'callDepth', maxUnionValues: 'unionValues' }
const rows = []
for (const cap of Object.keys(key)) {
  const used = free.usage[key[cap]]
  const cutIn = { ...base, limits: { [cap]: used - 1 } }
  const atIn = { ...base, limits: { [cap]: used } }
  const [c1, c2, at] = H.run(H.V4, [cutIn, cutIn, atIn])
  const [v3] = H.run(H.V3, [cutIn])
  const strip = (o) => H.sha(JSON.stringify({ ...o, telemetry: undefined }))
  rows.push({
    cap, used,
    cut: { status: c1.status, phases: c1.phases, coverage: c1.bodyCoverage, validation: c1.validation, unknowns: H.tuples(c1), violations: c1.violations },
    twoRunsEqual: strip(c1) === strip(c2),
    atCap: { phases: at.phases, limitTuple: at.unknowns.some((u) => u.reason === 'UNKNOWN_ANALYSIS_LIMIT') },
    v3: { unknowns: H.tuples(v3), violations: v3.violations },
    conservationDefects: H.conservation(v3, c1).filter(([k]) => k === 'defect'),
    violationsContained: H.violationsContained(v3, c1)
  })
}
const [nodes, timeout] = H.run(H.V4, [{ ...base, limits: { maxNodes: 1 } }, { ...base, limits: { timeoutMs: 1 } }])
const out = {
  probe: 'probe-cut', observedAt: new Date().toISOString(), engineSha256: H.sha(fs.readFileSync(H.V4)),
  free: { status: free.status, usage: free.usage, phases: free.phases, violations: free.violations },
  rows,
  globalMaxNodes: { phases: nodes.phases, unknowns: H.tuples(nodes) },
  globalTimeout: { phases: timeout.phases, bodyCoverage: timeout.bodyCoverage, unknowns: H.tuples(timeout) }
}
H.saveJson(OUT, out)
console.log(JSON.stringify(rows.map((r) => [r.cap, r.used, r.cut.phases.body, r.cut.phases.postBody, r.cut.phases.revalidation, r.cut.validation.valid, r.twoRunsEqual, r.atCap.phases.body, r.conservationDefects.length, r.violationsContained, r.cut.violations.length])))
console.log(JSON.stringify([out.globalMaxNodes.phases, out.globalTimeout.phases]))
