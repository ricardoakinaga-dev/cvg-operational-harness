// HISO005-P2-BUILD-0252: runs one B6 engine on one fixture root, as kernel-probe.mjs of the recon (origins empty,
// no installed, compiled unavailable). With --census, analyzeSemanticBoundary(input, { refusalCensus: true }).
// usage: node probe.mjs <engine.mjs> <root> <start> [--census]
import { pathToFileURL } from 'node:url'
const [engine, root, start, flag] = process.argv.slice(2)
const e = await import(pathToFileURL(engine).href)
const input = {
  root,
  starts: [start],
  origins: [],
  installed: [],
  compiled: { status: 'UNAVAILABLE', files: [] }
}
const o =
  flag === '--census'
    ? e.analyzeSemanticBoundary(input, { refusalCensus: true })
    : e.runSemanticBoundary(input)
const row = {
  kernelVersion: o.kernelVersion,
  status: o.status,
  unknowns: (o.unknowns || []).map((x) => [x.reason, x.file, x.detail]).sort(),
  violations: (o.violations || []).map((x) => [x.reason, x.file, x.target ?? null]).sort(),
  proofs: (o.proofs || []).map((x) => [x.rule, x.file, x.kind]).sort(),
  validation: o.validation,
  body: o.phases?.body ?? null,
  error: o.error ?? null
}
process.stdout.write(JSON.stringify(row))
