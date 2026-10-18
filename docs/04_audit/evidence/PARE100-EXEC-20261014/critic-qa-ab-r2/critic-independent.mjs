import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CASE_IDS, loadFixtures, assertReplay } from './tests/replay/fixture-schema.mjs'
import { safeVitestArguments } from './scripts/run-core-coverage.mjs'
import { validateAggregateCoverage, AGGREGATE_THRESHOLDS } from './scripts/coverage-thresholds.mjs'
let checks=0
const check=(name,fn)=>{fn();checks++;console.log('PASS',name)}
check('exact aggregate floors',()=>assert.deepEqual(AGGREGATE_THRESHOLDS,{statements:90,branches:85,functions:90,lines:90}))
const metric=(total,covered)=>({total,covered,skipped:0,pct:total?Math.floor(100000*covered/total/10)/100:100})
const make=(dims)=>{const f=Object.fromEntries(Object.keys(AGGREGATE_THRESHOLDS).map(k=>[k,metric(10000,dims[k])]));return {total:structuredClone(f),'/synthetic/covered.ts':f}}
check('exact boundary accepts',()=>assert.equal(validateAggregateCoverage(make({statements:9000,branches:8500,functions:9000,lines:9000})).pass,true))
for(const [dim,threshold] of Object.entries(AGGREGATE_THRESHOLDS)){
 check(`one count below ${dim} rejects`,()=>assert.equal(validateAggregateCoverage(make({...Object.fromEntries(Object.entries(AGGREGATE_THRESHOLDS).map(([d,t])=>[d,t*100])),[dim]:threshold*100-1})).pass,false))
}
for(const args of [
 ['--coverage.enabled=false'],['--coverage.thresholds.100=false'],['--coverage-thresholds-lines=0'],['--configLoader=native'],['--no-coverage.enabled'],['--coverage','false'],['--config','evil.mts'],['--root','/tmp'],['--watch=false'],['--pass-with-no-tests=true'],['--allow-only=true'],['--dangerously-ignore-unhandled-errors=true'],['--testNamePattern','x','--coverage=false'],['--','--coverage=false'],['-t=x','--coverage.exclude=**/*'],['--no-test-name-pattern=x']
]) check('bypass rejects '+JSON.stringify(args),()=>assert.throws(()=>safeVitestArguments(args)))
check('option-shaped filter remains one literal argument',()=>assert.deepEqual(safeVitestArguments(['-t','--coverage=false']),['--testNamePattern=--coverage=false']))
check('four core per-file100 and protected baseline config',()=>{
 const cfg=readFileSync('vitest.config.mts','utf8')
 for (const pkg of ['contracts','harness','orchestrator','agent-runtime']) assert.ok(cfg.includes(`'packages/${pkg}/src/**': {\n    statements: 100,\n    branches: 100,\n    functions: 100,\n    lines: 100\n  }`))
 assert.ok(cfg.includes("process.env.CVG_COVERAGE_PER_FILE === '1'"))
})
const fixtures=loadFixtures('snapshots/core');check('20 unique frozen public-path fixtures',()=>{assert.equal(fixtures.length,20);assert.equal(new Set(CASE_IDS).size,20);assert.equal(fixtures.filter(f=>f.input.entry==='sdk').length,2)})
for(const {input,expected} of fixtures){
 for(const [kind,mutate] of Object.entries({
 outcome:t=>{t.result.stopReason='CRITIC_KNOWN_BAD'},
 event:t=>{t.events[0].payload={critic:'unexpected event payload'}},
 effect:t=>{t.toolBodies.push({criticUnauthorizedEffect:true})},
 counter:t=>{t.result.modelCalls+=1},
 order:t=>{t.events.reverse()},
 audit:t=>{t.audit[0]={critic:'altered audit payload'}},
 telemetry:t=>{t.telemetry=[]}
 })) check(`${input.id} full transcript rejects ${kind}`,()=>{const bad=structuredClone(expected.transcript);mutate(bad);assert.throws(()=>assertReplay(bad,expected.transcript,input.id),/replay mismatch/)})
}
console.log(JSON.stringify({checks,public_cases:fixtures.length,status:'PASS',coverage:'Tooling checks only; no measured coverage claim'}))
