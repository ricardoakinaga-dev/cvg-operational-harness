import assert from 'node:assert/strict'
import * as kit from '../q03-candidate/tests/support/governed-test-kit/index.js'
const {normalizeLog:n,createSuiteManifest:m,canonicalJson:c,jsonDigest:d,RecordingAudit:A,RecordingTelemetry:T,replayJsonClone:clone,fixedClock,sequenceIds}=kit
const results=[]
async function probe(id,fn){try{await fn();results.push({id,status:'PASS'})}catch(e){results.push({id,status:'FAIL',error:e.stack})}}
const iso='2026-10-17T12:00:00.000Z'
const policy=[{field:'traceId',mode:'id',namespace:'shared'},{field:'eventId',mode:'id',namespace:'shared'},{field:'correlationId',mode:'id',namespace:'corr'},{field:'occurredAt',mode:'timestamp',value:iso}]
const corpus=()=>[
 {eventId:'alpha',traceId:'alpha',correlationId:'c1',occurredAt:iso,type:'tool/result',tenant:'synthetic-a',timestamp:iso,input:{eventId:'input-id',text:'read'},output:{traceId:'output-id',value:5},payload:{occurredAt:'payload-time',eventId:'payload-id',response:'answer',error:{code:'E_SYNTH',message:'denied'},effect:'NOT_STARTED',approval:'DENIED',operationKey:'op-synth',stopReason:'POLICY_DENIED',budget:{maxToolCalls:0,costUsd:0.01,tokens:7},tenantId:'synthetic-a'}},
 {eventId:'id:shared:1',traceId:'other',correlationId:'c1',occurredAt:iso,type:'turn/end',tenant:'synthetic-a',payload:{response:'blocked'}},
 {eventId:'alpha',traceId:'other',correlationId:'c2',occurredAt:iso,type:'message/assistant',tenant:'synthetic-a',payload:{response:'blocked'}}]
const manifest=()=>({formatVersion:1,id:'critic-synthetic',version:'1.0.0',synthetic:true,cases:[{id:'a',family:'sdk'},{id:'b',family:'replay'}]})
await probe('identity-and-detachment',()=>{const x=corpus(),before=structuredClone(x),r=n(x);assert.deepEqual(r.raw,before);assert.deepEqual(r.projection,before);x[0].payload.error.message='changed';x.pop();assert.deepEqual(r.raw,before);assert.deepEqual(r.projection,before);assert.notEqual(r.raw,r.projection);assert(Object.isFrozen(r.raw[0].payload.error));assert.throws(()=>r.projection[0].payload.response='changed');assert.deepEqual(r.policy,[])})
await probe('declared-metadata-only-and-bijection',()=>{const x=corpus(),before=structuredClone(x),r=n(x,policy);assert.deepEqual(x,before);assert.equal(r.projection[0].eventId,r.projection[0].traceId);assert.equal(r.projection[0].eventId,r.projection[2].eventId);assert.notEqual(r.projection[0].eventId,r.projection[1].eventId);assert.equal(r.projection[0].correlationId,r.projection[1].correlationId);assert.notEqual(r.projection[1].correlationId,r.projection[2].correlationId);for(let i=0;i<x.length;i++)for(const k of Object.keys(x[i]).filter(k=>!policy.some(p=>p.field===k)))assert.deepEqual(r.projection[i][k],x[i][k]);assert.equal(r.policyDigest,d(policy));assert.equal(r.projectionDigest,d(r.projection));assert.deepEqual(n([{}],policy).projection,[{}]);assert.deepEqual(n(corpus(),policy),r)})
const mutations={
 'response':x=>x[0].payload.response='wrong', 'input':x=>x[0].input.text='write', 'output':x=>x[0].output.value=6,
 'payload-id':x=>x[0].payload.eventId='wrong', 'payload-time':x=>x[0].payload.occurredAt='wrong',
 'error-code':x=>x[0].payload.error.code='E_OTHER', 'error-message':x=>x[0].payload.error.message='success',
 'effect':x=>x[0].payload.effect='CONFIRMED', 'approval':x=>x[0].payload.approval='APPROVED',
 'operation':x=>x[0].payload.operationKey='op-other', 'stop':x=>x[0].payload.stopReason='COMPLETED',
 'budget':x=>x[0].payload.budget.maxToolCalls=1, 'cost':x=>x[0].payload.budget.costUsd=9,
 'tokens':x=>x[0].payload.budget.tokens=8, 'tenant':x=>x[0].tenant='synthetic-b',
 'nested-tenant':x=>x[0].payload.tenantId='synthetic-b', 'type':x=>x[0].type='tool/call',
 'clock-not-declared':x=>x[0].timestamp='2026-10-18T00:00:00.000Z',
 'order':x=>x.reverse(), 'quantity':x=>x.pop(), 'duplication':x=>x.push(structuredClone(x[0])),
 'id-equality':x=>x[2].eventId='new', 'id-distinction':x=>x[1].eventId='alpha'}
function distinguish(normalizer,mutate){const a=corpus(),b=corpus();mutate(b);assert.notDeepEqual(normalizer(a,policy).projection,normalizer(b,policy).projection);assert.notEqual(normalizer(a,policy).projectionDigest,normalizer(b,policy).projectionDigest)}
for(const [id,mutate] of Object.entries(mutations))await probe('distinguish-'+id,()=>distinguish(n,mutate))
for(const field of ['payload','payload.eventId','input','output','response','tenant','tenantId','error','effect','approval','operationKey','stopReason','budget','costUsd','timestamp','*','**','/eventId/','metadata.traceId'])await probe('deny-selector-'+field,()=>assert.throws(()=>n(corpus(),[{field,mode:'id',namespace:'x'}])))
const invalidPolicies=[null,{},'eventId',[null],[],[{field:'eventId',mode:'drop',namespace:'x'}],[{field:'eventId',mode:'id',namespace:'a:b'}],[{field:'eventId',mode:'id',namespace:''}],[{field:'eventId',mode:'id'}],[{field:'eventId',mode:'id',namespace:'x',path:'payload'}],[{field:'eventId',mode:'timestamp',value:iso}],[{field:'occurredAt',mode:'id',namespace:'x'}],[{field:'occurredAt',mode:'timestamp',value:'2026-02-30T00:00:00.000Z'}],[policy[0],policy[0]],[policy[0],{...policy[0],namespace:'different'}]]
for(const [i,p] of invalidPolicies.entries())if(i!==4)await probe('invalid-policy-'+i,()=>assert.throws(()=>n(corpus(),p)))
await probe('policy-alias',()=>{const p=structuredClone(policy),r=n(corpus(),p);p[0].namespace='changed';p.pop();assert.deepEqual(r.policy,policy);assert.equal(r.policyDigest,d(policy))})
const cycle={};cycle.cycle=cycle
const hidden=Object.defineProperty({},'hidden',{value:1});const extended=[1];extended.extra=true
let sideEffects=0
const getter=Object.defineProperty({},'value',{enumerable:true,get(){sideEffects++;return 1}})
const jsonHook={toJSON(){sideEffects++;return {}}}
const invalids=[undefined,NaN,Infinity,1n,Symbol('x'),()=>1,new Date(iso),new Map(),new Set(),/x/,Object.create({inherited:1}),cycle,new Array(2),extended,hidden,getter,jsonHook,{bad:undefined},{[Symbol('x')]:1},JSON.parse('{"__proto__":{"polluted":true}}'),{constructor:{}},{prototype:{}}]
for(const [i,v] of invalids.entries())await probe('invalid-json-'+i,()=>{assert.throws(()=>c(v));assert.throws(()=>n([{payload:v}]));assert.throws(()=>m({...manifest(),cases:[{id:'a',family:v}]}))})
await probe('no-accessor-or-json-hook-execution',()=>{assert.equal(sideEffects,0);assert.equal({}.polluted,undefined)})
await probe('plain-null-prototype-and-shared-tree',()=>{const shared=Object.assign(Object.create(null),{z:2,a:1});assert.equal(c({a:shared,b:shared}),'{"a":{"a":1,"z":2},"b":{"a":1,"z":2}}');assert.equal(d({b:2,a:1}),d({a:1,b:2}));assert.notEqual(d([1,2]),d([2,1]))})
await probe('manifest-canonical-order-and-alias',()=>{const x=manifest(),r=m(x);assert.equal(r.digest,m({cases:x.cases.map(({id,family})=>({family,id})),synthetic:true,version:x.version,id:x.id,formatVersion:1}).digest);assert.notEqual(r.digest,m({...x,cases:[...x.cases].reverse()}).digest);x.cases[0].id='changed';assert.equal(r.manifest.cases[0].id,'a');assert(Object.isFrozen(r.manifest.cases[0]));assert.deepEqual(Object.keys(r).sort(),['digest','manifest'])})
const changes=[{formatVersion:0},{version:'1.0'},{version:'01.0.0'},{version:1},{synthetic:false},{synthetic:'true'},{id:''},{cases:[]},{cases:[{id:'a',family:'sdk'},{id:'a',family:'replay'}]},{cases:[{id:'a'}]},{cases:[{id:'a',family:'sdk',pass:true}]},{PASS:true},{status:'PASS'},{parity:100},{approval:'APPROVED'},{unexpected:0}]
for(const [i,x] of changes.entries())await probe('manifest-invalid-'+i,()=>assert.throws(()=>m({...manifest(),...x})))
await probe('manifest-missing-fields',()=>{for(const k of Object.keys(manifest())){const x=manifest();delete x[k];assert.throws(()=>m(x))}})
for(const Sink of [A,T])await probe('recording-'+Sink.name,async()=>{const write=Sink===A?'append':'record';const x={nested:{v:1}},s=new Sink();await s[write](x);assert.equal(s.events[0],x);const timeline=[],r=new Sink({copy:clone,[Sink===A?'onAppend':'onRecord']:e=>{assert.equal(e,x);timeline.push(r.events.length)}});await r[write](x);x.nested.v=2;assert.equal(r.events[0].nested.v,1);assert.deepEqual(timeline,[1]);const err=new Error('synthetic');const f=new Sink({copy:()=>{throw err}});await assert.rejects(async()=>f[write](x),e=>e===err);assert.equal(f.events.length,0);const h=new Sink({[Sink===A?'onAppend':'onRecord']:()=>{throw err}});await assert.rejects(async()=>h[write](x),e=>e===err);assert.equal(h.events.length,1)})
await probe('clock-id-locality-and-exhaustion',()=>{const originals=[Date,Date.now,fetch,setTimeout,crypto.randomUUID],clock=fixedClock(iso),a=clock();a.setUTCFullYear(1999);assert.equal(clock().toISOString(),iso);const one=sequenceIds('a-',4),two=sequenceIds('a-',4);assert.deepEqual([one(),one(),two()],['a-5','a-6','a-5']);const last=sequenceIds('last-',Number.MAX_SAFE_INTEGER-1);assert.equal(last(),'last-9007199254740991');assert.throws(last,RangeError);assert.throws(last,RangeError);for(const v of [-1,0.1,Infinity,NaN])assert.throws(()=>sequenceIds('x',v));for(const v of ['', 'yesterday','2026-02-30T00:00:00.000Z'])assert.throws(()=>fixedClock(v));assert.deepEqual([Date,Date.now,fetch,setTimeout,crypto.randomUUID],originals)})
await probe('historical-replay-copy',()=>{const v={a:undefined,b:[undefined,NaN],date:new Date(iso),toJSON(){return {converted:1}}};assert.deepEqual(clone(v),JSON.parse(JSON.stringify(v)));assert.throws(()=>clone(cycle));assert.throws(()=>clone(1n));assert.throws(()=>clone(undefined))})
// Known-bad normalizers and validator doubles must be rejected by our assertions.
for(const [label,key,mutation] of [['payload','payload','response'],['error','payload','error-message'],['effects','payload','effect'],['budget','payload','cost'],['tenant','tenant','tenant']])await probe('challenge-masking-'+label,()=>{const broken=(events,p)=>{const r=n(events,p),projection=structuredClone(r.projection);for(const e of projection)delete e[key];return {...r,projection,projectionDigest:d(projection)}};assert.throws(()=>distinguish(broken,mutations[mutation]))})
await probe('challenge-autopass-manifest',()=>assert.throws(()=>assert.throws(()=>({...manifest(),status:'PASS'}))))
await probe('challenge-permissive-policy',()=>assert.throws(()=>assert.throws(()=>({projection:corpus()}))))
console.log(JSON.stringify({node:process.version,scope:'TK02-TK06 independent private probes',results,summary:{pass:results.filter(x=>x.status==='PASS').length,fail:results.filter(x=>x.status==='FAIL').length}},null,2))
if(results.some(x=>x.status==='FAIL'))process.exitCode=1
