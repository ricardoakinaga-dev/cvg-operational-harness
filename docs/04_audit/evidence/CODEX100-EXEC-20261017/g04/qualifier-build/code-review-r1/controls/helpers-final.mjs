import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {parseStrictJson} from '../qualification-candidate/tests/claude100/qualification/strict-json.mjs';
import {validateCodexCatalog} from '../qualification-candidate/tests/codex100/qualification/catalog-profile.mjs';
import * as engine from '../qualification-candidate/tests/claude100/qualification/qualify.mjs';
import {openEvidenceRoot} from '../qualification-candidate/tests/claude100/qualification/safe-io.mjs';
import {canonicalJson} from '../qualification-candidate/tests/support/governed-test-kit/index.js';
const candidate='/mnt/ia/cvg-codex100-exec-20261017/qualification-candidate';
const work='/mnt/ia/cvg-codex100-exec-20261017/qualification-review-r1';
const orig='/home/ricardo/Área de trabalho/cvg-operational-harness';
const results=[]; let seq=0;
const sha=b=>createHash('sha256').update(b).digest('hex');
const digest=d=>sha(canonicalJson(d));
const clone=d=>structuredClone(d);
const catalog=JSON.parse(await fs.readFile(orig+'/docs/03_build/tracking/codex100_catalog_v1.json','utf8'));
const run=async(id,criteria,fn)=>{const t=performance.now();try{const details=await fn();results.push({id,criteria,status:'PASS',milliseconds:performance.now()-t,details})}catch(e){results.push({id,criteria,status:'FAIL',milliseconds:performance.now()-t,error:e.stack})}};
const rejects=(fn)=>{assert.throws(fn,e=>e.status==='INVALID_INPUT')};
async function fixture() {
 const root=path.join(work,'tmp','final-case-'+String(seq++).padStart(3,'0')); await fs.mkdir(root,{mode:0o700});
 await fs.cp(candidate+'/tests/claude100/qualification/fixtures/wire-v1',root,{recursive:true});
 const read=async n=>JSON.parse(await fs.readFile(path.join(root,n),'utf8'));
 const write=async(n,v)=>fs.writeFile(path.join(root,n),JSON.stringify(v));
 const s={root,read,write,manifest:await read('manifest.json'),rule:await read('rule.json'),captures:await read('capture-index.json'),authorities:await read('authority-index.json')};
 s.options={evidenceRoot:root,manifest:'manifest.json',catalog:'catalog.json',rule:'rule.json',captureIndex:'capture-index.json',authorityIndex:'authority-index.json',out:'out'};
 s.manifest.requirementIds=[catalog.requirements.find(r=>r.kind==='FUNCTIONAL_PARITY').id]; s.rule.requirementIds=[...s.manifest.requirementIds];
 s.bindCatalog=async raw=>{await fs.writeFile(root+'/catalog.json',raw);const h=sha(raw);s.manifest.catalogSha256=h;s.captures.catalogSha256=h;s.authorities.catalogSha256=h};
 s.flush=async()=>{await write('manifest.json',s.manifest);await write('capture-index.json',s.captures);await write('authority-index.json',s.authorities)};
 s.seal=async()=>{
  await write('rule.json',s.rule);const ruleSha256=sha(await fs.readFile(root+'/rule.json'));s.manifest.ruleSha256=ruleSha256;
  s.authorities.entries.forEach(e=>e.ruleSha256=ruleSha256);s.captures.entries=[];
  for(const [i,side] of (s.manifest.reference===null?['cvg']:['reference','cvg']).entries()){
   const current=s.manifest[side];for(const a of current.artifacts){const b=await fs.readFile(root+'/'+a.path);a.sha256=sha(b);a.bytes=b.length}
   current.artifacts.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
   const captureId=s.manifest.captureAttestations[i];const receipt={version:1,captureId,collectorId:'INDEPENDENT-SYNTHETIC-ONLY',runId:s.manifest.runId,scenarioId:s.manifest.scenarioId,side,fixtureSha256:s.manifest.fixtureSha256,ruleSha256,...clone(current)};
   const receiptPath=side+'/receipt.json';await write(receiptPath,receipt);
   s.captures.entries.push({captureId,collectorId:receipt.collectorId,runId:receipt.runId,scenarioId:receipt.scenarioId,side,identitySha256:digest(current.identity),artifactSetSha256:digest(current.artifacts),receiptPath,receiptSha256:sha(await fs.readFile(root+'/'+receiptPath))});
  }
  await s.flush();
 };
 s.raw=async(side,raw)=>fs.writeFile(root+'/'+side+'/stdout.json',raw);
 s.run=async(expected)=>{const r=await engine.qualifyCodex(s.options);assert.equal(r.status,expected);assert.equal(r.exitCode,expected==='MATCH_REQUIRES_REVIEW'?0:1);assert.equal(r.reviewStatus,'PENDING');if(expected==='MATCH_REQUIRES_REVIEW')assert(r.checks.every(c=>c.status==='PASS'));return {status:r.status,checks:r.checks,diffs:r.diffs,inputCatalogSha:r.inputs.catalogSha256}};
 await s.bindCatalog(JSON.stringify(catalog));await s.seal();return s;
}

export {fixture,catalog,run,results,sha,clone,work,candidate};
