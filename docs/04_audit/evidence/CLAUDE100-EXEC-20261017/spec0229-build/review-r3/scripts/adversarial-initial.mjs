import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import { spawnSync } from 'node:child_process'

const base = '/tmp/qualifier-review-r3'
const candidate = '/tmp/cvg-claude100-exec-20261017/q01-candidate'
const source = `${candidate}/tests/claude100/qualification`
const { qualify } = await import(`${source}/qualify.mjs`)
const { assertProjectionBudget, MAX_PROJECTION_BYTES } = await import(`${source}/projection-budget.mjs`)
const realDate = Date
const originalOpen = fsp.open
const originalLink = fs.linkSync
const originalStat = fs.lstatSync
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
// Independent wire canonicalization, deliberately not imported from the kit.
const canonical = x => x === null || typeof x !== 'object' ? JSON.stringify(x)
  : Array.isArray(x) ? `[${x.map(canonical).join(',')}]`
  : `{${Object.keys(x).sort().map(k => JSON.stringify(k)+':'+canonical(x[k])).join(',')}}`
const digest = x => sha(canonical(x))
const results = []
let serial = 0
await fsp.mkdir(`${base}/cases`, { recursive: true })
async function fixture(name) {
  const root = `${base}/cases/${String(++serial).padStart(3,'0')}-${name}`
  await fsp.cp(`${source}/fixtures/wire-v1`, root, { recursive: true })
  const read = async name => JSON.parse(await fsp.readFile(path.join(root,name),'utf8'))
  const write = async (name,x) => fsp.writeFile(path.join(root,name),JSON.stringify(x)+'\n')
  const s = { root, read, write, m:await read('manifest.json'), r:await read('rule.json'),
    ci:await read('capture-index.json'), ai:await read('authority-index.json') }
  s.options = { evidenceRoot:root, manifest:'manifest.json', catalog:'catalog.json',
    rule:'rule.json', captureIndex:'capture-index.json', authorityIndex:'authority-index.json', out:'result' }
  s.flush = async () => {
    await write('manifest.json',s.m); await write('capture-index.json',s.ci); await write('authority-index.json',s.ai)
  }
  s.seal = async () => {
    await write('rule.json',s.r)
    s.m.ruleSha256=sha(await fsp.readFile(`${root}/rule.json`))
    for (const a of s.ai.entries) a.ruleSha256=s.m.ruleSha256
    const entries=[]
    for (const [i,side] of (s.m.reference===null?['cvg']:['reference','cvg']).entries()) {
      const current=s.m[side]
      for (const a of current.artifacts) {
        const bytes=await fsp.readFile(path.join(root,a.path)); a.sha256=sha(bytes); a.bytes=bytes.length
      }
      current.artifacts.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)
      const receipt={ version:1,captureId:s.m.captureAttestations[i],collectorId:'independent-fabricated-collector',
        runId:s.m.runId,scenarioId:s.m.scenarioId,side,fixtureSha256:s.m.fixtureSha256,
        ruleSha256:s.m.ruleSha256,...current }
      const receiptPath=`${side}/receipt.json`; await write(receiptPath,receipt)
      entries.push({captureId:receipt.captureId,collectorId:receipt.collectorId,runId:receipt.runId,
        scenarioId:receipt.scenarioId,side,identitySha256:digest(current.identity),
        artifactSetSha256:digest(current.artifacts),receiptPath,receiptSha256:sha(await fsp.readFile(`${root}/${receiptPath}`))})
    }
    s.ci.entries=entries; await s.flush()
  }
  s.doc=async (side,value)=>write(`${side}/stdout.json`,value)
  s.run=async expected => {
    const report=await qualify(s.options)
    assert.equal(report.status,expected)
    assert.equal(report.exitCode,expected==='MATCH_REQUIRES_REVIEW'?0:1)
    assert.equal(report.reviewStatus,'PENDING')
    assert.deepEqual(Object.keys(report).sort(),['version','runId','scenarioId','requirementIds','status','exitCode','inputs','identities','checks','diffs','evidence','limitations','reviewStatus'].sort())
    assert.ok(report.limitations.length)
    assert.ok(!JSON.stringify(report).includes('PASS_CURRENT'))
    return report
  }
  s.disk=async report=>assert.deepEqual(await read('result/report.json'),report)
  return s
}
async function test(name,fn) {
  const start=performance.now()
  try { const detail=await fn(); results.push({name,status:'PASS',ms:Math.round(performance.now()-start),detail:detail??null}) }
  catch(error) { results.push({name,status:'FAIL',ms:Math.round(performance.now()-start),error:error.stack}) }
  console.log(`${results.at(-1).status} ${name}`)
}
await test('actual_cli_known_good_closed_report_and_all_snapshot_hashes',async()=>{
  const s=await fixture('cli')
  const args=['--manifest','manifest.json','--catalog','catalog.json','--rule','rule.json',
    '--capture-index','capture-index.json','--authority-index','authority-index.json','--evidence-root',s.root,'--out','result']
  const p=spawnSync(process.execPath,[`${candidate}/scripts/claude100-qualify.mjs`,...args],
    {cwd:base,env:process.env,encoding:'utf8',timeout:15000,maxBuffer:1024*1024})
  assert.equal(p.status,0,p.stderr); const report=JSON.parse(p.stdout); await s.disk(report)
  assert.equal(report.status,'MATCH_REQUIRES_REVIEW'); assert.equal(report.reviewStatus,'PENDING')
  const inv=await s.read('result/input-snapshots.json')
  for(const item of inv) {
    const bytes=await fsp.readFile(path.join(s.root,item.copy)); assert.equal(sha(bytes),item.sha256);assert.equal(bytes.length,item.bytes)
  }
  return {exit:p.status,snapshots:inv.length}
})
for(const [name,change] of [
  ['execution_outcome',m=>{m.cvg.execution.outcomeKind='PRODUCT_FAILURE';m.cvg.execution.exitCode=7}],
  ['execution_timeout',m=>{m.cvg.execution.outcomeKind='INFRA_FAILURE';m.cvg.execution.timeout=true;m.cvg.execution.exitCode=null}],
  ['identity',m=>m.cvg.identity.configSha256='a'.repeat(64)],
  ['fixture',m=>m.fixtureSha256='b'.repeat(64)]
]) await test(`untrusted_manifest_only_${name}`,async()=>{
  const s=await fixture(name);change(s.m);await s.flush();const r=await s.run('UNTRUSTED_CAPTURE');await s.disk(r)
})
await test('receipt_whitespace_change_without_index_rebind_is_invalid',async()=>{
  const s=await fixture('receipt');await fsp.appendFile(`${s.root}/cvg/receipt.json`,' ');await s.run('INVALID_INPUT')
})
await test('missing_receipt_precedes_denied_authority',async()=>{
  const s=await fixture('origin');await fsp.unlink(`${s.root}/cvg/receipt.json`);s.ai.entries[0].decision='DENIED';await s.flush();await s.run('UNTRUSTED_CAPTURE')
})
await test('artifact_corruption_precedes_unsupported',async()=>{
  const s=await fixture('precedence');s.r.projection.kind='UNKNOWN';await s.seal();await fsp.appendFile(`${s.root}/cvg/stdout.json`,'x');await s.run('INVALID_INPUT')
})
await test('unsupported_precedes_missing_capture',async()=>{
  const s=await fixture('unsupported');s.r.projection.kind='UNKNOWN';await s.seal();await fsp.unlink(`${s.root}/cvg/receipt.json`);await s.run('UNSUPPORTED_RULE')
})
await test('missing_required_reference_is_blocked',async()=>{
  const s=await fixture('missing-ref');s.m.reference=null;s.m.captureAttestations=[s.m.captureAttestations[1]];await s.flush();await s.run('BLOCKED_REFERENCE')
})
await test('unknown_control_field_precedes_missing_reference',async()=>{
  const s=await fixture('schema');s.m.reference=null;s.m.captureAttestations=[s.m.captureAttestations[1]];s.m.authorized=true;await s.flush();await s.run('INVALID_INPUT')
})
await test('exact_bytes_accepts_binary_and_materializes_empty_projection',async()=>{
  const s=await fixture('empty');s.r.projection.kind='EXACT_BYTES'
  for(const side of ['reference','cvg']) await fsp.writeFile(`${s.root}/${side}/stdout.json`,Buffer.alloc(0))
  await s.seal();const r=await s.run('MATCH_REQUIRES_REVIEW');assert.equal(r.evidence.normalized.length,2)
  assert.ok(r.evidence.normalized.every(x=>x.bytes===0));await s.disk(r)
})
await test('invalid_utf8_is_allowed_in_exact_bytes_but_not_json',async()=>{
  for(const kind of ['EXACT_BYTES','EXACT_JSON']){
    const s=await fixture(kind);s.r.projection.kind=kind
    for(const side of ['reference','cvg'])await fsp.writeFile(`${s.root}/${side}/stdout.json`,Buffer.from([0xff,0,10]))
    await s.seal();await s.run(kind==='EXACT_BYTES'?'MATCH_REQUIRES_REVIEW':'INVALID_INPUT')
  }
})
for(const field of ['tenant','approval','error','effect','cost','unknown_payload'])
  await test(`complete_json_preserves_${field}`,async()=>{
    const s=await fixture(field);await s.doc('reference',{[field]:1});await s.doc('cvg',{[field]:2});await s.seal();await s.run('MISMATCH')
  })
for(const [name,size,status] of [['max',128,'MATCH_REQUIRES_REVIEW'],['over',129,'INVALID_INPUT'],['huge',40000,'INVALID_INPUT']])
  await test(`namespace_${name}_${size}`,async()=>{
    const s=await fixture(name);s.r.normalizationPolicy=[{field:'eventId',mode:'id',namespace:'n'.repeat(size)}]
    await s.doc('reference',[{eventId:'original',tenant:'safe',payload:{eventId:'protected'}}])
    await s.doc('cvg',[{eventId:'other',tenant:'safe',payload:{eventId:'protected'}}])
    await s.seal();const r=await s.run(status)
    if(size===128){
      const expected=canonical([{eventId:`id:${'n'.repeat(128)}:1`,tenant:'safe',payload:{eventId:'protected'}}])
      for(const part of r.evidence.normalized)assert.equal((await fsp.readFile(`${s.root}/${part.path}`)).toString(),expected)
    }
  })
await test('shared_namespace_topology_difference_remains_mismatch',async()=>{
  const s=await fixture('topology');s.r.normalizationPolicy=[{field:'eventId',mode:'id',namespace:'n'},{field:'correlationId',mode:'id',namespace:'n'}]
  await s.doc('reference',[{eventId:'a',correlationId:'a'}]);await s.doc('cvg',[{eventId:'x',correlationId:'y'}]);await s.seal();await s.run('MISMATCH')
})
await test('normalization_cannot_hide_protected_nested_metadata',async()=>{
  const s=await fixture('nested');s.r.normalizationPolicy=[{field:'eventId',mode:'id',namespace:'n'}]
  await s.doc('reference',[{eventId:'a',payload:{eventId:'a'}}]);await s.doc('cvg',[{eventId:'x',payload:{eventId:'b'}}]);await s.seal();await s.run('MISMATCH')
})
await test('independent_numeric_projection_reconstruction_200k',async()=>{
  const s=await fixture('numeric'),raw='['+'1e20,'.repeat(199999)+'1e20]',expected=Buffer.from('['+'100000000000000000000,'.repeat(199999)+'100000000000000000000]')
  for(const side of ['reference','cvg'])await fsp.writeFile(`${s.root}/${side}/stdout.json`,raw)
  await s.seal();const r=await s.run('MATCH_REQUIRES_REVIEW');assert.equal(r.evidence.normalized.length,4)
  for(const side of ['reference','cvg']){
    const chunks=[];for(const part of r.evidence.normalized.filter(x=>path.basename(x.path).startsWith(side+'.'))){
      const b=await fsp.readFile(`${s.root}/${part.path}`);assert.equal(sha(b),part.sha256);assert.equal(b.length,part.bytes);assert.ok(b.length<=4194304);chunks.push(b)
    }
    assert.ok(Buffer.concat(chunks).equals(expected))
  }
  return {raw:Buffer.byteLength(raw),canonical:expected.length,parts:r.evidence.normalized.length}
})
await test('required_roles_integrity_includes_unprojected_artifact',async()=>{
  const s=await fixture('roles');s.r.requiredRoles.push('RAW_EFFECTS');await s.write('cvg/effects.json',{effect:'none'});await s.write('reference/effects.json',{effect:'none'})
  for(const side of ['reference','cvg'])s.m[side].artifacts.push({path:`${side}/effects.json`,sha256:'0'.repeat(64),bytes:0,role:'RAW_EFFECTS'})
  await s.seal();await fsp.appendFile(`${s.root}/cvg/effects.json`,' ');await s.run('INVALID_INPUT')
})
await test('symlink_input_rejected_without_replacing_target',async()=>{
  const s=await fixture('symlink');const p=`${s.root}/cvg/stdout.json`,target=`${s.root}/saved.json`;await fsp.rename(p,target);await fsp.symlink(target,p);await s.run('INVALID_INPUT')
})
await test('exclusive_output_preserves_completed_report',async()=>{
  const s=await fixture('exclusive');const r=await s.run('MATCH_REQUIRES_REVIEW'),bytes=await fsp.readFile(`${s.root}/result/report.json`)
  await s.run('INFRA_FAILURE');assert.ok(bytes.equals(await fsp.readFile(`${s.root}/result/report.json`)));await s.disk(r)
})
await test('preflight_large_recipe_no_projection_allocation_and_exact_boundary',async()=>{
  const doc=Array.from({length:20000},()=>({eventId:'a'})),policy=[{field:'eventId',mode:'id',namespace:'n'.repeat(40000)}]
  assert.throws(()=>assertProjectionBudget(320001,doc,policy),e=>e.status==='INFRA_FAILURE');assert.equal(doc[0].eventId,'a')
  assert.ok(assertProjectionBudget(Math.floor(MAX_PROJECTION_BYTES/6),[],[])<=MAX_PROJECTION_BYTES)
  assert.throws(()=>assertProjectionBudget(Math.floor(MAX_PROJECTION_BYTES/6)+1,[],[]),e=>e.status==='INFRA_FAILURE')
})
await test('number_expansion_bound_and_metadata_estimate_independent_corpus',async()=>{
  let count=0
  for(let exponent=-324;exponent<=308;exponent++)for(const mantissa of ['1','9','1.2345678901234567']){
    const token=mantissa+'e'+exponent,n=Number(token);if(!Number.isFinite(n))continue
    const raw=Buffer.byteLength(token),actual=Buffer.byteLength(JSON.stringify(n))
    assert.ok(actual<=raw*6,token);assert.ok(assertProjectionBudget(raw,n,[])>=actual);count++
  }
  return {finiteNumbers:count}
})

// Fault injection wraps genuine handles; every successfully opened descriptor is
// closed by the real operation before an injected close rejection. Source intact.
for(const mode of ['sync','report-close','input-close','link','expire-stage','expire-final','projection-expire','authenticated-infra-expire','staged-symlink'])
 await test(`real_io_${mode}`,async()=>{
  const s=await fixture(mode),clock=new realDate(realDate.now()+60000).toISOString()
  s.ai.entries[0].expiresAt=clock
  if(mode==='authenticated-infra-expire'){
    s.m.cvg.execution={...s.m.cvg.execution,outcomeKind:'INFRA_FAILURE',exitCode:null,timeout:true};await s.seal()
  } else await s.flush()
  let used=false,linked=false,afterLink=0
  const expire=()=>{globalThis.Date=class extends realDate {constructor(...a){super(...(a.length?a:['2200-01-01T00:00:00.000Z']))}static now(){return realDate.parse('2200-01-01T00:00:00.000Z')}}}
  fsp.open=async(name,...args)=>{
    if(linked)afterLink++
    const h=await originalOpen(name,...args),filename=String(name)
    return new Proxy(h,{get(target,key){
      if(['sync','close','writeFile'].includes(key))return async(...a)=>{
        if(linked)afterLink++
        if(key==='writeFile'&&mode==='projection-expire'&&filename.endsWith('/reference.projection')){used=true;expire();throw Error('independent projection fault')}
        const result=await target[key](...a)
        if(!used && key==='sync' && mode==='sync' && filename.endsWith('/report.pending.json')){used=true;throw Error('independent sync fault')}
        if(!used && key==='close' && ((mode==='report-close'&&filename.endsWith('/report.pending.json'))||(mode==='input-close'&&filename.endsWith('/cvg/stdout.json')))){used=true;throw Error('independent close fault')}
        if(!used && key==='writeFile' && ['expire-stage','authenticated-infra-expire'].includes(mode)&&filename.endsWith('/input-snapshots.json')){used=true;expire()}
        return result
      }
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value
    }})
  }
  fs.lstatSync=(name,...args)=>{
    if(!used && mode==='expire-final'&&String(name).endsWith('/report.blocked.pending.json')){used=true;expire()}
    if(!used && mode==='staged-symlink'&&String(name).endsWith('/report.pending.json')){
      used=true;fs.renameSync(name,String(name)+'.saved');fs.symlinkSync(String(name)+'.saved',name)
    }
    return originalStat(name,...args)
  }
  fs.linkSync=(...args)=>{
    if(mode==='link'){used=true;throw Error('independent publication fault')}
    const r=originalLink(...args);linked=true;return r
  }
  syncBuiltinESMExports()
  let r
  try{r=await qualify(s.options)}finally{
    globalThis.Date=realDate;fsp.open=originalOpen;fs.linkSync=originalLink;fs.lstatSync=originalStat;syncBuiltinESMExports()
  }
  assert.equal(used,true,'fault hook must be reached')
  const expired=['expire-stage','expire-final','authenticated-infra-expire'].includes(mode)
  assert.equal(r.status,expired?'BLOCKED_CVG_SPEC':'INFRA_FAILURE');assert.equal(r.exitCode,1);assert.equal(afterLink,0)
  if(expired||mode==='projection-expire')await s.disk(r)
  else await assert.rejects(()=>fsp.readFile(`${s.root}/result/report.json`),{code:'ENOENT'})
  return {injected:true,published:linked,operationsAfterPublication:afterLink,status:r.status}
 })
const summary={node:process.version,candidate,startedFrom:base,kind:'INDEPENDENT_REAL_FILE_AND_CLI_PROBES',
  count:results.length,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,
  allSynthetic:true,noModelsNetworkDatabaseServices:true,results}
await fsp.writeFile(`${base}/results/adversarial.json`,JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify({count:summary.count,passed:summary.passed,failed:summary.failed}))
process.exitCode=summary.failed?1:0
