import assert from 'node:assert/strict'
import { PassThrough, Writable } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'
import { serveStdioSdk, SDK_METHODS } from '@cvg/sdk'
const capabilities={sessions:true,events:true,methods:SDK_METHODS}
const request=id=>({jsonrpc:'2.0',id,method:'sdk.hello',params:{protocolVersion:1}})
const response=id=>({jsonrpc:'2.0',id,result:{protocolVersion:1,capabilities}})
const wire=x=>JSON.stringify(x)+'\n'
const tick=()=>new Promise(resolve=>setImmediate(resolve))
const bounded=async(p,ms=300)=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('synthetic assertion deadline')),ms)})])}finally{clearTimeout(timer)}}
const unhandled=[];const onUnhandled=e=>unhandled.push(e);process.on('unhandledRejection',onUnhandled)
function fixture({rejectLate=false,stuckWrite=false}={}) {
 const input=new PassThrough();input.on('error',()=>{})
 const frames=[];const calls=[];const failures=[];let settle
 const active=new Promise((resolve,reject)=>{settle=rejectLate?reject:resolve})
 const output=new Writable({highWaterMark:stuckWrite?1:16384,write(chunk,encoding,done){frames.push(JSON.parse(chunk.toString()));if(!stuckWrite)done()}});output.on('error',()=>{})
 const serving=serveStdioSdk({input,output,maxLifetimeRequests:2,closeTimeoutMs:10,server:{capabilities,dispatch:r=>{calls.push(r.id);return r.id===1?active:Promise.resolve(response(r.id))}},onError:e=>failures.push(e)})
 input.write([1,2,3,4].map(id=>wire(request(id))).join(''))
 assert.deepEqual(calls,[1]);assert.equal(input.listenerCount('data'),0)
 for(const e of ['end','close'])assert.equal(input.listenerCount(e),1)
 assert.equal(input.listenerCount('error'),2)
 return {input,output,frames,calls,failures,serving,settle,cleanup(){input.destroy();output.destroy()}}
}
let count=0
for(const kind of ['end','error','close'])for(const rejectLate of [false,true]){
 const f=fixture({rejectLate});let closed=false;f.serving.closed.then(()=>closed=true)
 if(kind==='end')f.input.end();else if(kind==='error')f.input.emit('error',Error('synthetic'));else f.input.emit('close')
 await bounded(f.serving.closed);assert.equal(closed,true);assert.deepEqual(f.calls,[1]);assert.deepEqual(f.frames,[])
 f.settle(rejectLate?Error('late synthetic rejection'):response(1));await tick();await tick()
 assert.deepEqual(f.calls,[1]);assert.deepEqual(f.frames,[]);assert.deepEqual(f.failures,[{kind:'limit',code:-32084},{kind:'transport',code:-32083}])
 for(const e of ['end','close'])assert.equal(f.input.listenerCount(e),0)
 assert.equal(f.input.listenerCount('error'),1);assert.equal(f.output.listenerCount('drain'),0);f.cleanup();count++;console.log('PASS lifetime input '+kind+' + late '+(rejectLate?'reject':'resolve'))
}
{
 const f=fixture();let closed=false;f.serving.closed.then(()=>closed=true)
 await sleep(50);assert.equal(closed,false);assert.deepEqual(f.calls,[1]);f.settle(response(1));await bounded(f.serving.closed)
 assert.deepEqual(f.calls,[1,2]);assert.deepEqual(f.frames.map(x=>x.id),[1,2]);assert.deepEqual(f.failures,[{kind:'limit',code:-32084}]);f.cleanup();count++;console.log('PASS accepted work drains after 50ms with closeTimeoutMs=10')
}
{
 const f=fixture({rejectLate:true});const start=performance.now();await bounded(f.serving.close());assert.ok(performance.now()-start<250);assert.deepEqual(f.calls,[1]);assert.deepEqual(f.frames,[]);f.settle(Error('late rejection after close'));await tick();f.cleanup();count++;console.log('PASS explicit close bounded; late rejection observed')
}
{
 const f=fixture({stuckWrite:true});f.settle(response(1));await tick();assert.deepEqual(f.calls,[1]);assert.equal(f.output.listenerCount('drain'),1)
 f.input.emit('error',Error('synthetic while write stuck'));await bounded(f.serving.closed);await tick();assert.deepEqual(f.calls,[1]);assert.deepEqual(f.frames.map(x=>x.id),[1]);assert.equal(f.output.listenerCount('drain'),0);f.cleanup();count++;console.log('PASS lifecycle fault cancels active stuck write without dispatching queue')
}
await tick();assert.deepEqual(unhandled,[]);process.off('unhandledRejection',onUnhandled);console.log(JSON.stringify({ordinaryLibraryCases:count,unhandledRejections:0,publicPackageImport:true,sourceAliases:false}))
