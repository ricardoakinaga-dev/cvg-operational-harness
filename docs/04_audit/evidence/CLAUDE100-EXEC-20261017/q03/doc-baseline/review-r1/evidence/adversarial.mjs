import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import ts from '../q03-candidate/node_modules/typescript/lib/typescript.js'
const root='/tmp/cvg-claude100-exec-20261017/q03-candidate/'
const source=readFileSync(root+'tests/doc-source-moves.test.js','utf8')
const sf=ts.createSourceFile('guard.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
const declaration=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='assertFrozenDocTarget')
assert(declaration)
const functionSource=declaration.getText(sf)
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex')
const pare100OriginalBytes=readFileSync(root+'tests/fixtures/doc-relocations/pare100-original.json')
const revisions=JSON.parse(readFileSync(root+'tests/fixtures/doc-relocations/pare100-revisions.json','utf8'))
// Execute the unchanged function extracted by AST, supplying only its explicit imports/data.
const guard=new Function('assert','pare100Revisions','sha256','pare100OriginalBytes',functionSource+'\nreturn assertFrozenDocTarget')(assert,revisions,sha256,pare100OriginalBytes)
const policy=JSON.parse(readFileSync(root+'docs/doc-link-policy.json','utf8'))
const proof=JSON.parse(pare100OriginalBytes)
const entries=policy.movedTargets.filter(x=>x.movedBy==='PARE100-EXEC-20261014')
const entry=entries.find(x=>x.new.includes('0207_')),bytes=readFileSync(root+entry.new)
const results=[],observations=[]
function probe(id,fn,extra={}){try{fn();results.push({id,status:'PASS',...extra})}catch(e){results.push({id,status:'FAIL',error:e.stack,...extra})}}
const beforeBytes=Buffer.from(bytes),beforeMetadata=structuredClone(revisions)
function fullRegistryGuard(list,original=proof){assert.equal(list.length,3);assert.deepEqual(list.map(({old,new:target,sha256Before})=>({copy:old,source:target,sha256:sha256Before})),original.copies);for(const item of list)guard(item,readFileSync(root+item.new))}
probe('three-policy-moves-exact-and-accepted',()=>fullRegistryGuard(entries))
probe('fixed-historical-prefix-and-current-append',()=>{assert.equal(bytes.length,5195);assert.equal(sha256(bytes.subarray(0,4715)),'b03badb2802d31a74eaa1347ee443763f38506493b43ab3853c2e136d24939d2');assert.equal(sha256(bytes),'6f93660593d768d21ec51e6c20acf8eff0701259aea8b2f7053fd1314101cddb');assert.equal(sha256(bytes.subarray(4715)),'3e59eac2484e303944597a2c4103353385babfc88e973b3ea2319b80da2e4a82')})
probe('each-single-byte-mutation-is-rejected',()=>{for(let i=0;i<bytes.length;i++){const bad=Buffer.from(bytes);bad[i]^=1;assert.throws(()=>guard(entry,bad),undefined,'offset '+i)}},{mutation_count:bytes.length})
probe('all-truncations-are-rejected',()=>{for(let i=0;i<bytes.length;i++)assert.throws(()=>guard(entry,bytes.subarray(0,i)),undefined,'length '+i)},{mutation_count:bytes.length})
probe('appended-content-newline-and-duplicate-append-rejected',()=>{for(const suffix of [Buffer.from('x'),Buffer.from('\n'),bytes.subarray(4715)])assert.throws(()=>guard(entry,Buffer.concat([bytes,suffix])))})
probe('historical-and-append-swap-rejected',()=>assert.throws(()=>guard(entry,Buffer.concat([bytes.subarray(4715),bytes.subarray(0,4715)]))))
probe('other-two-targets-retain-exact-checksums',()=>{for(const item of entries.filter(x=>x!==entry)){const original=readFileSync(root+item.new);assert.equal(sha256(original),item.sha256Before);for(const i of [0,Math.floor(original.length/2),original.length-1]){const bad=Buffer.from(original);bad[i]^=1;assert.throws(()=>guard(item,bad))};assert.throws(()=>guard(item,Buffer.concat([original,Buffer.from('\n')])));assert.throws(()=>guard({...item,sha256Before:'0'.repeat(64)},original))}})
for(const [field,value] of Object.entries({prefixBytes:4716,target:'docs/other.md',sha256Before:'0'.repeat(64),sha256After:'0'.repeat(64),appendSha256:'0'.repeat(64),appendHeading:'## Different heading',unknown:true}))probe('revision-field-'+field,()=>{const bad=structuredClone(revisions);Object.assign(bad.revisions[0],{[field]:value});assert.throws(()=>guard(entry,bytes,bad))})
for(const [field,value] of Object.entries({sourceCommit:'0'.repeat(40),schemaVersion:2,originalProofSha256:'0'.repeat(64),unknown:true}))probe('outer-field-'+field,()=>assert.throws(()=>guard(entry,bytes,{...revisions,[field]:value})))
probe('revision-offset-numeric-types-and-bounds',()=>{for(const n of [-1,0,4714,4715.1,4716,'4715',null,Number.MAX_SAFE_INTEGER]){const bad=structuredClone(revisions);bad.revisions[0].prefixBytes=n;assert.throws(()=>guard(entry,bytes,bad))}})
probe('missing-all-outer-and-inner-fields',()=>{for(const key of Object.keys(revisions)){const bad=structuredClone(revisions);delete bad[key];assert.throws(()=>guard(entry,bytes,bad))};for(const key of Object.keys(revisions.revisions[0])){const bad=structuredClone(revisions);delete bad.revisions[0][key];assert.throws(()=>guard(entry,bytes,bad))}})
probe('duplicates-empty-and-unknown-revisions-rejected',()=>{for(const list of [[],[revisions.revisions[0],revisions.revisions[0]],[{...revisions.revisions[0],target:'docs/unknown.md'}]])assert.throws(()=>guard(entry,bytes,{...revisions,revisions:list}))})
probe('registry-extra-unknown-reorder-and-missing-rejected',()=>{for(const list of [entries.slice(1),[...entries,entries[0]],[...entries].reverse(),entries.map((v,i)=>i? v:{...v,new:'docs/unknown.md'})])assert.throws(()=>fullRegistryGuard(list))})
probe('historical-hash-not-rebound-to-current-file',()=>assert.throws(()=>guard({...entry,sha256Before:sha256(bytes)},bytes)))
probe('revision-cannot-redefine-history-even-with-current-digests',()=>{const bad=structuredClone(revisions),changed=Buffer.from(bytes);changed[0]^=1;bad.revisions[0].sha256After=sha256(changed);assert.throws(()=>guard(entry,changed,bad));bad.revisions[0].sha256Before=sha256(changed.subarray(0,4715));assert.throws(()=>guard({...entry,sha256Before:bad.revisions[0].sha256Before},changed,bad))})
probe('unknown-registry-entry-with-valid-historical-bytes-rejected-by-caller',()=>{const list=entries.map(x=>x===entry?{...entry,new:'docs/unknown.md'}:x);assert.throws(()=>fullRegistryGuard(list))})
probe('no-input-mutation',()=>{assert.deepEqual(bytes,beforeBytes);assert.deepEqual(revisions,beforeMetadata)})
function assertRejectsChangedAppend(fn){const bad=Buffer.from(bytes);bad[bytes.length-1]^=1;assert.throws(()=>fn(entry,bad))}
probe('challenge-prefix-only-guard',()=>assert.throws(()=>assertRejectsChangedAppend((e,b)=>assert.equal(sha256(b.subarray(0,4715)),e.sha256Before))))
probe('challenge-historical-equals-current-checksum',()=>assert.throws(()=>assert.doesNotThrow(()=>assert.equal(sha256(bytes),entry.sha256Before))))
probe('challenge-catch-and-ignore',()=>assert.throws(()=>assertRejectsChangedAppend((e,b)=>{try{guard(e,b)}catch{}})))
// A format edge is not a data-integrity bypass: caller entries still have a closed source registry.
const arrayLike={0:structuredClone(revisions.revisions[0]),length:1,unused:'shape-only'}
try{guard(entry,bytes,{...revisions,revisions:arrayLike});observations.push({id:'array-like-revisions-shape',outcome:'ACCEPTED',impact:'Valid frozen revision data in an alternate JSON container shape. Does not bypass any source/prefix/append/current hash or target binding. Private reviewed fixture is currently a proper array; no external data API exists.'})}catch(e){observations.push({id:'array-like-revisions-shape',outcome:'REJECTED',message:e.message})}
// Report exactly which original test bodies/assertions changed, excluding intentional temporal correction.
const original=ts.createSourceFile('original.js',readFileSync(new URL('source-original.test.js',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
const printer=ts.createPrinter({removeComments:false})
function calls(file){const out=[];function visit(n){if(ts.isCallExpression(n)&&n.expression.getText(file)==='test'){out.push({title:n.arguments[0]?.getText(file),text:printer.printNode(ts.EmitHint.Unspecified,n,file)})};ts.forEachChild(n,visit)}visit(file);return out}
const oldCalls=calls(original),newCalls=calls(sf),preservation=oldCalls.map(v=>({title:v.title,unchanged:newCalls.some(w=>w.text===v.text)}))
probe('original-direct-tests-preserved-except-intended-temporal-check',()=>{const changed=preservation.filter(x=>!x.unchanged);assert.equal(changed.length,1);assert.equal(changed[0].title,"'three PARE100 frozen document relocations retain exact existing targets'")})
console.log(JSON.stringify({node:process.version,function_source_sha256:sha256(functionSource),method:'unchanged helper extracted by TypeScript AST; actual frozen fixtures/policy/target bytes; caller registry validated independently',results,observations,original_direct_test_preservation:preservation,summary:{pass:results.filter(x=>x.status==='PASS').length,fail:results.filter(x=>x.status==='FAIL').length,single_byte_and_truncation_cases:bytes.length*2}},null,2))
if(results.some(x=>x.status==='FAIL'))process.exitCode=1
