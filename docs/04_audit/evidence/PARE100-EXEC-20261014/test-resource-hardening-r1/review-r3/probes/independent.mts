import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import {spawn} from 'node:child_process'
import {mkdtemp,stat,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {COMPLETE_NODE,completeCollector,observeCompleteChild,privateEnvironment,completeReadiness,cleanupCompleteChildren} from '/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree/packages/persistence/src/__tests__/fixtures/complete-process-support.ts'
const out='/tmp/cvg-pare100-exec-20261014-6az3hlay/test-resource-hardening-r1/review-r3'
const results=[]
async function run(name,fn){const start=performance.now();await fn();results.push({name,passed:true,ms:performance.now()-start})}
const opts={maxRuntimeMs:2000,exitTimeoutMs:60,termGraceMs:30,killGraceMs:100}
async function scratch(){return mkdtemp(join(out+'/TMP','independent-'))}
function fake(){const proc=new EventEmitter();proc.stdout=new PassThrough();proc.stderr=new PassThrough();proc.kill=()=>{queueMicrotask(()=>{proc.emit('exit',null,'SIGTERM');proc.emit('close',null,'SIGTERM')});return true};return proc}
function flatten(e){return e instanceof AggregateError ? [e,...e.errors.flatMap(flatten)]:[e]}
await run('exact raw 1MiB per stream; split Unicode/NUL bytes; single extra byte invalidates all retained bytes',async()=>{
 const failures=[],c=completeCollector(e=>failures.push(e));const literal=Buffer.from('PG224_READY\0🙂漢字');for(const byte of literal)c.push('stdout',Buffer.from([byte]));c.push('stdout',Buffer.alloc(1048576-literal.length));c.push('stderr',Buffer.alloc(1048576));assert.equal(c.bytes('stdout').length,1048576);assert.equal(createHash('sha256').update(c.bytes('stdout').subarray(0,literal.length)).digest('hex'),createHash('sha256').update(literal).digest('hex'));c.push('stderr',Buffer.from([0]));assert.equal(failures.length,1);assert.throws(()=>c.bytes('stdout'),/OUTPUT_LIMIT/);c.push('stdout',Buffer.alloc(20));assert.equal(failures.length,1)
})
await run('independent synthetic READY then ignored parent: watchdog joins and removes home',async()=>{
 const root=await scratch(),{home,env}=await privateEnvironment(root);const proc=spawn(COMPLETE_NODE,['-e','process.stdout.write("PG224_READY\\n");setInterval(()=>{},1000)'],{cwd:root,env,stdio:['ignore','pipe','pipe']});const c=observeCompleteChild(proc,home,{...opts,maxRuntimeMs:200});assert.equal(await completeReadiness(c,'store-restart'),'ready');await assert.rejects(c.done,e=>flatten(e).some(x=>/maxRuntimeMs/.test(x.message)));assert.equal(proc.stdout.closed,true);assert.throws(()=>process.kill(proc.pid,0),/ESRCH/);await assert.rejects(stat(home),{code:'ENOENT'});await assert.rejects(c.stop(),e=>flatten(e).some(x=>/maxRuntimeMs/.test(x.message)));await rm(root,{recursive:true})
})
await run('exit event without stdio close: bounded failure, HOME retained, primary+join errors retained',async()=>{
 const root=await scratch(),{home}=await privateEnvironment(root),proc=fake();proc.kill=()=>true;const c=observeCompleteChild(proc,home,opts);proc.emit('exit',0,null);const primary=new Error('independent primary');c.fail(primary);let error;try{await c.done}catch(e){error=e}assert(error instanceof AggregateError);assert(flatten(error).includes(primary));assert(flatten(error).some(e=>/stdio close not confirmed/.test(e.message)));assert((await stat(home)).isDirectory());proc.emit('close',0,null);await c.stop().catch(()=>{});await rm(root,{recursive:true,force:true})
})
await run('primary plus HOME disposal failure preserved after confirmed close; repeated stop cannot succeed',async()=>{
 const root=await scratch(),{home}=await privateEnvironment(root),proc=fake(),c=observeCompleteChild(proc,home,opts);await rm(home,{recursive:true});const primary=new Error('independent observer failure');c.fail(primary);let error;try{await c.done}catch(e){error=e}assert(error instanceof AggregateError);assert(flatten(error).includes(primary));assert(flatten(error).some(e=>e.code==='ENOENT'));await assert.rejects(c.stop());await assert.rejects(c.finish());await rm(root,{recursive:true})
})
await run('joined children precede all cleanup; primary, DB and pool errors survive in order',async()=>{
 const events=[],primary=new Error('primary'),db=new Error('db'),pool=new Error('pool');let error;try{await cleanupCompleteChildren([{stop:async()=>{events.push('join')}}],[async()=>{events.push('db');throw db},async()=>{events.push('pool');throw pool}],{error:primary})}catch(e){error=e}assert.deepEqual(events,['join','db','pool']);assert.deepEqual(error.errors,[primary,db,pool]);assert.equal(error.cause,primary)
})
await run('unconfirmed join blocks every DB cleanup yet attempts every child',async()=>{
 const events=[],primary=new Error('primary'),joinError=new Error('join');let error;try{await cleanupCompleteChildren([{stop:async()=>{events.push('first');throw joinError}},{stop:async()=>{events.push('second')}}],[async()=>events.push('forbidden-db')],{error:primary})}catch(e){error=e}assert.deepEqual(events,['first','second']);assert(flatten(error).includes(primary));assert(flatten(error).includes(joinError))
})
console.log(JSON.stringify({kind:'independent bounded native-Node and fake-child probes',results},null,2))
