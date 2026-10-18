import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {fixture,catalog,run,results,sha,clone,work,candidate} from './helpers.mjs';
import {validateCodexCatalog} from '../qualification-candidate/tests/codex100/qualification/catalog-profile.mjs';
// Previous harness took the last actual row without selecting its class.
// The original failure is preserved; this selects a real CVG_CONTROL explicitly.
await run('corrected-additive-control-only-family',['QK01'],()=>{
 const c=clone(catalog); c.families.push({id:'REVIEW-ADDITIVE'}); c.family_count++;
 c.requirements.push({...clone(c.requirements.find(r=>r.kind==='CVG_CONTROL')),id:'REVIEW-CONTROL',family:'REVIEW-ADDITIVE'});c.mandatory_cvg_controls++;
 assert.equal(validateCodexCatalog(c).requirements.length,510);
 return {note:'Reviewer fixture correction only: original last row was FUNCTIONAL_PARITY, mismatched increment was correctly rejected by candidate.'};
});
await run('codex-rejects-claude-catalog',['QK03'],async()=>{
 const s=await fixture();await s.bindCatalog(await fs.readFile(candidate+'/tests/claude100/qualification/fixtures/wire-v1/catalog.json'));await s.flush();return s.run('INVALID_INPUT');
});
await run('normalization-retains-cost',['QK06'],async()=>{
 const s=await fixture();s.rule.normalizationPolicy=[{field:'eventId',mode:'id',namespace:'event'}];
 await s.raw('reference','[{"eventId":"one","cost":0.1}]');await s.raw('cvg','[{"eventId":"two","cost":0.2}]');await s.seal();return s.run('MISMATCH');
});
await run('valid-normalization-lossy-unselected-field',['QK08'],async()=>{
 const s=await fixture();s.rule.normalizationPolicy=[{field:'eventId',mode:'id',namespace:'event'}];
 await s.raw('reference','[{"eventId":"one","payload":{"ignored":0.1000000000000000000001}}]');
 await s.raw('cvg','[{"eventId":"two","payload":{"ignored":0.1}}]');await s.seal();const r=await s.run('INVALID_INPUT');assert.equal(r.checks[0].status,'FAIL');return r;
});
await run('fifo-is-rejected-without-blocking',['QK09'],async()=>{
 const s=await fixture();await fs.rm(s.root+'/cvg/stdout.json');const r=spawnSync('/usr/bin/mkfifo',[s.root+'/cvg/stdout.json'],{timeout:1000});assert.equal(r.status,0);return s.run('INVALID_INPUT');
});
await run('symlink-output-untouched',['QK09'],async()=>{
 const s=await fixture();await fs.mkdir(s.root+'/destination');await fs.symlink('destination',s.root+'/out');await s.run('INFRA_FAILURE');assert.deepEqual(await fs.readdir(s.root+'/destination'),[]);
});
await run('catalog-1MiB-plus-one',['QK09'],async()=>{
 const s=await fixture();await fs.writeFile(s.root+'/catalog.json',' '.repeat(1024*1024+1));return s.run('INVALID_INPUT');
});
await run('decimal-cost-reaches-qualifier',['QK08'],async()=>{
 const s=await fixture();const n=40000;const token='1'+'0'.repeat(n)+'1e-'+(n+2);
 let raw=JSON.stringify(catalog);raw=raw.slice(0,-1)+',"execution":{"synthetic_decimal":'+token+'}}';
 await s.bindCatalog(raw);await s.flush();const t=performance.now();const r=await s.run('INVALID_INPUT');return {rawBytes:Buffer.byteLength(raw),coefficientZeros:n,milliseconds:performance.now()-t,...r};
});
await fs.writeFile(work+'/supplement.results.json',JSON.stringify({node:process.version,total:results.length,passed:results.filter(r=>r.status==='PASS').length,failed:results.filter(r=>r.status==='FAIL').length,results},null,2)+'\n');
console.log(JSON.stringify({total:results.length,failed:results.filter(r=>r.status==='FAIL')}));
process.exitCode=results.some(r=>r.status==='FAIL')?1:0;
