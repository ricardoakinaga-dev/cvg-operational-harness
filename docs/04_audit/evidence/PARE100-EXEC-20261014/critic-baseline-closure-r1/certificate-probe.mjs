import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict'; import {createHash} from 'node:crypto';
const P='/tmp/cvg-pare100-exec-20261014-6az3hlay',D=P+'/certification-r4-worktree',O=P+'/critic-baseline-closure-r1-result',E='/home/ricardo/Área de trabalho/cvg-operational-harness/docs/04_audit/evidence/PARE100-EXEC-20261014/certification/r4';
const {verifyGateEvidence}=await import(D+'/scripts/lib/certification-rules.mjs');
const {validateAggregateCoverage}=await import(D+'/scripts/coverage-thresholds.mjs');
const result=JSON.parse(fs.readFileSync(E+'/artifacts/certification/phase10-result.json'));
const manifest=JSON.parse(fs.readFileSync(E+'/artifacts/certification/manifest.json'));
const sha=b=>createHash('sha256').update(b).digest('hex');
function read(p) { const f=p.startsWith('certification/logs/')? E+'/logs/'+path.basename(p):fs.existsSync(E+'/artifacts/'+p)?E+'/artifacts/'+p:D+'/'+p; return fs.existsSync(f)?fs.readFileSync(f):undefined }
const base=verifyGateEvidence({result,manifest,artifactReader:read}); assert.deepEqual(base,[]);
const source=JSON.parse(read('coverage/coverage-summary.json'));const good=validateAggregateCoverage(source);assert.equal(good.pass,true);
const records={original_gate_evidence_failures:base,original_aggregate:good,negatives:[]};
for (const dim of ['statements','branches','functions','lines']) {
 const s=structuredClone(source);
 for (const v of Object.values(s)) {v[dim].covered=0;v[dim].pct=v[dim].total===0?100:0}
 const b=Buffer.from(JSON.stringify(s)),r=structuredClone(result),m=structuredClone(manifest),g=r.gates.find(x=>x.id==='coverage');g.metrics[dim]=0;r.metrics.coverage[dim]=0;
 for (const x of [...g.evidence,...m.artifacts]) if (x.path==='coverage/coverage-summary.json') {x.sha256=sha(b);x.size=b.length}
 const failures=verifyGateEvidence({result:r,manifest:m,artifactReader:p=>p==='coverage/coverage-summary.json'?b:read(p)});
 const checker=validateAggregateCoverage(s);
 assert.equal(checker.pass,false); assert(failures.includes(`coverage_contract_failure:coverage_global_below_threshold:${dim}`));
 records.negatives.push({dimension:dim,consistent_summary:true,raw_gate_exit_unchanged:g.exitCode,checker_failures:checker.failures,certificate_failures:failures});
}
fs.writeFileSync(O+'/certificate-negative-results.json',JSON.stringify(records,null,2)+'\n');console.log(JSON.stringify(records,null,2));
