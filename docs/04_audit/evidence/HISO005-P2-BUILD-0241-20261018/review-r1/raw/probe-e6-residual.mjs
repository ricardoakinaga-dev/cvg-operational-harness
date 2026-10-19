// Review R1 probe: errata E6 / I2. A listed reason thrown by the TOP-LEVEL
// load(file) (not a body edge) must end only the body as a declared residual
// stop (body = SKIPPED:<reason>), with the tuple in the outer-catch form, and
// post-body + revalidation must still run. Method: in-process analysis with an
// injected EACCES on the n-th open() of the installed manifest (caller process
// only). The installed file sorts before its importer, so the first body load
// of node_modules/p/i.js is the top-level loop's own load. Same input on v3.
import path from 'node:path'
import * as H from './harness.mjs'

const OUT = path.join(import.meta.dirname, 'probe-e6-residual.json')
const files = {
  'z.mjs': "import v from 'p'\nexport const after = missingZ\n",
  'node_modules/p/package.json': H.pkg('p', { exports: './i.js' }),
  'node_modules/p/i.js': 'export default 1\n',
  'node_modules/q/package.json': H.pkg('q', { exports: './i.js' }),
  'node_modules/q/i.js': 'export default 1\n'
}
const f = H.fixture('e6', 'residual', files, { starts: ['z.mjs'] })
f.installed = [
  { key: 'node_modules/q', manifest: 'node_modules/q/package.json', identityStatus: 'MATCH', referenceDigest: 'a'.repeat(64) }
]
const rows = []
for (let at = 1; at <= 24; at++) {
  const fault = { leaf: 'package.json', at, code: 'EACCES' } // helper opens /proc/self/fd/N/<leaf>
  const [o4] = H.analyze(H.V4, [f], { fault })
  const [o3] = H.analyze(H.V3, [f], { fault })
  rows.push({
    at,
    v4: { phases: o4.phases, coverage: o4.bodyCoverage, unknowns: H.tuples(o4) },
    v3: { unknowns: H.tuples(o3) },
    conservation: H.conservation(o3, o4)
  })
}
const residual = rows.filter((r) => r.v4.phases?.body === 'SKIPPED:UNKNOWN_ACQUISITION_EACCES')
H.saveJson(OUT, { probe: 'probe-e6-residual', observedAt: new Date().toISOString(), input: { starts: f.starts, installed: f.installed }, rows, residualAt: residual.map((r) => r.at) })
console.log(JSON.stringify(rows.map((r) => [r.at, r.v4.phases?.body, r.v4.phases?.postBody, r.v4.phases?.revalidation, r.conservation.filter(([k]) => k === 'defect').length])))
