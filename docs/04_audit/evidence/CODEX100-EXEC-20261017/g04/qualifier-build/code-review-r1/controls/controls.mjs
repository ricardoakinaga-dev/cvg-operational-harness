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
 const root=path.join(work,'tmp','case-'+String(seq++).padStart(3,'0')); await fs.mkdir(root,{mode:0o700});
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
await run('exports-closed',['QK10'],()=>{assert.deepEqual(Object.keys(engine).sort(),['qualify','qualifyCodex'])});
await run('actual-catalog',['QK01'],()=>{const before=JSON.stringify(catalog);assert.equal(validateCodexCatalog(catalog).requirements.length,509);assert.equal(JSON.stringify(catalog),before);return {families:catalog.family_count,functional:catalog.functional_denominator,controls:catalog.mandatory_cvg_controls}});
await run('additive-control-only-family',['QK01'],()=>{const c=clone(catalog);c.families.push({id:'REVIEW-ADDITIVE'});c.family_count++;c.requirements.push({...clone(c.requirements.at(-1)),id:'REVIEW-CONTROL',family:'REVIEW-ADDITIVE'});c.mandatory_cvg_controls++;assert.equal(validateCodexCatalog(c).requirements.length,510)});
for(const [name,mutate] of [
 ['remove-replace',c=>{c.requirements[0].id='REPLACED'}],
 ['family-swap',c=>{const a=c.requirements[0],b=c.requirements.find(r=>r.family!==a.family&&r.kind===a.kind);[a.family,b.family]=[b.family,a.family]}],
 ['demote',c=>c.requirements[0].mandatory=1],
 ['unknown-family-control',c=>{c.requirements.push({...clone(c.requirements.at(-1)),id:'REVIEW-CONTROL',family:'UNKNOWN'});c.mandatory_cvg_controls++}],
 ['functional-cross-cutting',c=>{c.requirements.push({...clone(c.requirements[0]),id:'REVIEW-FUNCTION',family:'CROSS_CUTTING'});c.functional_denominator++}],
 ['reserved-family',c=>{c.families.push({id:'CROSS_CUTTING'});c.family_count++}],
 ['duplicate-family',c=>{c.families.push(clone(c.families[0]));c.family_count++}],
 ['duplicate-id',c=>{c.requirements.push(clone(c.requirements[0]));c.functional_denominator++}],
 ['unused-family',c=>{c.families.push({id:'ORPHAN'});c.family_count++}],
 ['fraction-count',c=>c.family_count=22.5],
 ['unknown-root-field',c=>c.validator='LEGACY_FINITE'],
 ['unknown-row-field',c=>c.requirements[0].verification_class='FUNCTIONAL_PARITY'],
 ['bad-reuse-type',c=>c.families[0].reuse=[1]],
 ['null-source',c=>c.requirements[0].sources=[null]],
 ['array-source',c=>c.requirements[0].sources=[[]]],
 ['bad-owner-type',c=>c.requirements[0].owner=1],
 ['invalid-ascii',c=>c.requirements[0].id='é'],
 ['wrong-sourcepin',c=>c.reference.commit='0'.repeat(40)],
 ['wrong-repository',c=>c.reference.repository='https://example.invalid'],
 ['1025-rows',c=>{while(c.requirements.length<=1024){c.requirements.push({...clone(c.requirements[0]),id:'EXTRA-'+c.requirements.length});c.functional_denominator++}}],
]) await run('catalog-'+name,['QK02','QK03'],()=>{const c=clone(catalog);mutate(c);rejects(()=>validateCodexCatalog(c))});
const numeric={numericDomain:'CODEX_EXACT_DECIMAL'};
for(const token of ['0','0.0','0e999999999999999999999999','1e0','1.2300e2','1e-7','1e-323','5e-324','0.1','-0.1','9007199254740991','-9007199254740991','4503599627370495.5','0.000001','1.0000000000000000'])await run('number-accept-'+token,['QK08'],()=>assert.equal(parseStrictJson(token,numeric),Number(token)));
for(const token of ['-0','-0.0','-0e0','-0e999999999999999999','9007199254740992','9007199254740993','-9007199254740992','0.1000000000000000000001','1.0000000000000001','1e-324','1e-999999','1e309','0.00000000000000000000000000000000000000000000000000000000000000001'+'1'.repeat(20),'01','+1','1.','NaN','Infinity'])await run('number-reject-'+token,['QK07','QK08'],()=>rejects(()=>parseStrictJson(token,numeric)));
for(const raw of ['{"ignored":-0}','{"ignored":0.1000000000000000000001}','{"ignored":9007199254740993}','{"a":1,"a":2}','{"constructor":0}','{} trailing','\ufeff{}']) await run('strict-whole-document-'+raw,['QK08'],()=>rejects(()=>parseStrictJson(raw,numeric)));
await run('legacy-numeric-domain',['QK08','QK12'],()=>{assert.equal(parseStrictJson('0.1000000000000000000001'),0.1);assert.equal(parseStrictJson('9007199254740993'),9007199254740992);assert(Object.is(parseStrictJson('-0'),-0))});
await run('synthetic-positive',['QK04'],async()=>{const s=await fixture();return s.run('MATCH_REQUIRES_REVIEW')});
for(const [name,change,expected] of [
 ['digest-over-authority',async s=>{await s.raw('cvg','{}');s.authorities.entries[0].decision='DENIED';await s.flush()},'INVALID_INPUT'],
 ['capture-over-authority',async s=>{s.manifest.cvg.identity.driverSha256='1'.repeat(64);s.authorities.entries[0].decision='DENIED';await s.flush()},'UNTRUSTED_CAPTURE'],
 ['fixture-forged',async s=>{s.manifest.fixtureSha256='1'.repeat(64);await s.flush()},'UNTRUSTED_CAPTURE'],
 ['collector-forged',async s=>{s.captures.entries[0].collectorId='FORGED';await s.flush()},'UNTRUSTED_CAPTURE'],
 ['authority-denied',async s=>{s.authorities.entries[0].decision='DENIED';await s.flush()},'BLOCKED_CVG_SPEC'],
 ['authority-pending',async s=>{s.authorities.entries[0].decision='PENDING';await s.flush()},'BLOCKED_CVG_SPEC'],
 ['authority-scope',async s=>{s.authorities.entries[0].scopeId='OTHER';await s.flush()},'BLOCKED_CVG_SPEC'],
 ['authority-spec-bytes',async s=>{await s.write(s.authorities.entries[0].specPath,{changed:true})},'INVALID_INPUT'],
 ['timeout-relabel',async s=>{s.manifest.cvg.execution={...s.manifest.cvg.execution,outcomeKind:'INFRA_FAILURE',exitCode:null,timeout:true};await s.flush()},'UNTRUSTED_CAPTURE'],
 ['authentic-infra',async s=>{s.manifest.cvg.execution={...s.manifest.cvg.execution,outcomeKind:'INFRA_FAILURE',exitCode:null,timeout:true};await s.seal()},'INFRA_FAILURE'],
 ['execution-diff',async s=>{s.manifest.cvg.execution={...s.manifest.cvg.execution,outcomeKind:'PRODUCT_FAILURE',exitCode:7,timeout:false};await s.seal()},'MISMATCH'],
 ['authority-symlink',async s=>{const n=s.authorities.entries[0].specPath;await fs.rename(s.root+'/'+n,s.root+'/real-spec');await fs.symlink('real-spec',s.root+'/'+n)},'INVALID_INPUT'],
 ['traversal',async s=>{s.manifest.cvg.artifacts[0].path='../escape';await s.flush()},'INVALID_INPUT'],
 ['directory-as-input',async s=>{const n=s.manifest.cvg.artifacts[0].path;await fs.rm(s.root+'/'+n);await fs.mkdir(s.root+'/'+n)},'INVALID_INPUT'],
 ['artifact-cap',async s=>{await s.raw('cvg','x'.repeat(4*1024*1024+1))},'INVALID_INPUT'],
 ['lossy-catalog-metadata',async s=>{let raw=JSON.stringify(catalog);raw=raw.slice(0,-1)+',"execution":{"ignored":0.1000000000000000000001}}';await s.bindCatalog(raw);await s.flush()},'INVALID_INPUT'],
 ['lossy-unprojected-metadata',async s=>{s.rule.normalizationPolicy=[{field:'timestamp',action:'omit'}];await s.raw('cvg','{"ignored":-0}');await s.seal()},'INVALID_INPUT'],
 ['profile-injection',async s=>{s.options.profile='LEGACY_FINITE';s.options.numericDomain='LEGACY_FINITE';s.options.validator=()=>{throw new Error('callback executed')};await s.raw('cvg','{"id":9007199254740993}');await s.seal()},'INVALID_INPUT'],
 ['unsupported',async s=>{s.rule.projection.kind='PLUGIN';await s.seal()},'UNSUPPORTED_RULE'],
])await run('engine-'+name,['QK05','QK07','QK09','QK11'],async()=>{const s=await fixture();await change(s);return s.run(expected)});
for(const [name,a,b] of [
 ['body','{"body":"a"}','{"body":"b"}'],['order','[1,2]','[2,1]'],['error','{"error":null}','{"error":"failure"}'],['effect','{"effect":[]}','{"effect":["write"]}'],['identity','{"id":"a"}','{"id":"b"}'],['cost','{"cost":0.1}','{"cost":0.2}']
])await run('difference-'+name,['QK06'],async()=>{const s=await fixture();await s.raw('reference',a);await s.raw('cvg',b);await s.seal();const r=await s.run('MISMATCH');assert(r.diffs.length);return r});
await run('bytes-i64-negativezero',['QK07','QK08'],async()=>{const s=await fixture();s.rule.projection.kind='EXACT_BYTES';await s.raw('reference','{"id":9007199254740992,"n":-0}');await s.raw('cvg','{"id":9007199254740993,"n":0}');await s.seal();return s.run('MISMATCH')});
await run('bytes-identical-outside-domain',['QK07'],async()=>{const s=await fixture();s.rule.projection.kind='EXACT_BYTES';await s.raw('reference','{"id":9007199254740993,"n":-0}');await s.raw('cvg','{"id":9007199254740993,"n":-0}');await s.seal();return s.run('MATCH_REQUIRES_REVIEW')});
await run('positive-json-decimal-equivalence',['QK08'],async()=>{const s=await fixture();await s.raw('reference','[1e0,1.2300e2]');await s.raw('cvg','[1,123]');await s.seal();return s.run('MATCH_REQUIRES_REVIEW')});
await run('source-catalog-progress-ignored',['QK01','QK04'],async()=>{const s=await fixture();const c=clone(catalog);c.full_codex_parity_claim=true;c.numerator_pass_current=487;c.requirements.forEach(r=>{r.status='PASS_CURRENT';r.receipt={approved:true}});await s.bindCatalog(JSON.stringify(c));await s.flush();const r=await s.run('MATCH_REQUIRES_REVIEW');assert.equal(r.inputCatalogSha,sha(await fs.readFile(s.root+'/catalog.json')));return r});
await run('control-no-reference',['QK04'],async()=>{const s=await fixture();const id=catalog.requirements.find(r=>r.kind==='CVG_CONTROL').id;s.manifest.reference=null;s.manifest.requirementIds=[id];s.manifest.captureAttestations=[s.manifest.captureAttestations[1]];s.rule.requirementIds=[id];s.rule.verificationClass='CVG_CONTROL';s.rule.projection.referenceRole=null;s.rule.expectedExecution.reference=null;const bytes=await fs.readFile(s.root+'/cvg/stdout.json');await fs.writeFile(s.root+'/expected.bin',bytes);s.rule.expectedArtifact={path:'expected.bin',sha256:sha(bytes),bytes:bytes.length};await s.seal();return s.run('MATCH_REQUIRES_REVIEW')});
await run('output-exclusive',['QK09'],async()=>{const s=await fixture();await s.run('MATCH_REQUIRES_REVIEW');const before=await fs.readFile(s.root+'/out/report.json');await s.run('INFRA_FAILURE');assert.deepEqual(await fs.readFile(s.root+'/out/report.json'),before)});
await run('fd-snapshot-after-rename',['QK09'],async()=>{const s=await fixture();const io=await openEvidenceRoot(s.root);try{const a=await io.read('cvg/stdout.json');await fs.rename(s.root+'/cvg/stdout.json',s.root+'/cvg/old.json');await fs.writeFile(s.root+'/cvg/stdout.json','MUTATED');assert.equal(a.sha256,sha(a.bytes));assert.notEqual((await io.read('cvg/stdout.json')).sha256,a.sha256);return {firstSnapshotImmutable:a.bytes.toString()}}finally{await io.close()}});
const args=s=>['--manifest','manifest.json','--catalog','catalog.json','--rule','rule.json','--capture-index','capture-index.json','--authority-index','authority-index.json','--evidence-root',s.root,'--out','cli-out'];
const cli=(which,arguments_)=>spawnSync(process.execPath,[candidate+'/scripts/'+which+'100-qualify.mjs',...arguments_],{encoding:'utf8',timeout:10000,env:{...process.env,TMPDIR:work+'/tmp'}});
await run('cli-valid-and-legacy-rejection',['QK03','QK10'],async()=>{const s=await fixture();let r=cli('codex',args(s));assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).reviewStatus,'PENDING');const a=args(s);a[a.length-1]='legacy-out';r=cli('claude',a);assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).status,'INVALID_INPUT')});
for(const [name,alter] of [['extra',a=>[...a,'--profile','CLAUDE']],['repeat',a=>[...a,'--catalog','catalog.json']],['positional',a=>[...a,'positional']],['missing',a=>a.slice(0,-1)]])await run('cli-'+name,['QK10'],async()=>{const s=await fixture();const r=cli('codex',alter(args(s)));assert.equal(r.status,2,r.stderr);assert.equal(r.stdout,'')});
await run('cli-import-side-effect-free',['QK10'],()=>{const r=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(candidate+'/scripts/codex100-qualify.mjs')});await import(${JSON.stringify(candidate+'/scripts/claude100-qualify.mjs')});`],{encoding:'utf8',timeout:10000});assert.equal(r.status,0);assert.equal(r.stdout,'');assert.equal(r.stderr,'')});
const summary={node:process.version,scope:'FINITE_SYNTHETIC_MECHANISM_ONLY_NO_FUNCTIONAL_CREDIT',total:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,results};
await fs.writeFile(work+'/controls.results.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({node:summary.node,total:summary.total,passed:summary.passed,failed:summary.failed,failures:results.filter(x=>x.status==='FAIL')}));process.exitCode=summary.failed?1:0;
