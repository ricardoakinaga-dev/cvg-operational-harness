// Review R1 static check: every literal UNKNOWN_* thrown by the frozen engine
// and helper (fail(...)/Error(...)) is classified in reason-census-base.json,
// and CONTAINED_EDGE_REASONS (read as text) equals the SPEC §3.1 list.
// Reads bytes only; imports nothing from the candidate.
import fs from 'node:fs'
import path from 'node:path'

const C = '/mnt/dados/cvg-work/cvg-hiso005-build0241-20261018/scripts/'
const EVID = path.resolve(import.meta.dirname, '../..')
const src = ['boundary-semantic-resolution.mjs', 'boundary-semantic-engine.mjs'].map((f) => fs.readFileSync(C + f, 'utf8')).join('\n')
const thrown = [...new Set([...src.matchAll(/(?:fail|Error)\(\s*'(UNKNOWN_[A-Z_]+)/g)].map((m) => m[1]))].sort()
const ternary = [...new Set([...src.matchAll(/\?\s*'(UNKNOWN_[A-Z_]+)'\s*:\s*'(UNKNOWN_[A-Z_]+)'/g)].flatMap((m) => [m[1], m[2]]))].sort()
const census = JSON.parse(fs.readFileSync(path.join(EVID, 'reason-census-base.json'), 'utf8'))
const known = new Set(census.classified.map((x) => x.reason))
const engine = fs.readFileSync(C + 'boundary-semantic-engine.mjs', 'utf8')
const block = engine.slice(engine.indexOf('export const CONTAINED_EDGE_REASONS'), engine.indexOf('])', engine.indexOf('export const CONTAINED_EDGE_REASONS')))
const contained = [...block.matchAll(/'(UNKNOWN_[A-Z_]+)'/g)].map((m) => m[1])
const out = {
  check: 'reason-crosscheck',
  observedAt: new Date().toISOString(),
  thrownLiteral: thrown,
  thrownViaTernary: ternary,
  notInCensus: [...new Set([...thrown, ...ternary])].filter((t) => !known.has(t) && t !== 'UNKNOWN_ACQUISITION_'),
  openErrnoPrefix: thrown.includes('UNKNOWN_ACQUISITION_'),
  containedEqualsCensusList: JSON.stringify([...contained].sort()) === JSON.stringify([...census.perEdgeList].sort()),
  containedCount: contained.length
}
fs.writeFileSync(path.join(import.meta.dirname, 'reason-crosscheck.json'), JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify({ notInCensus: out.notInCensus, equal: out.containedEqualsCensusList, n: out.containedCount }))
