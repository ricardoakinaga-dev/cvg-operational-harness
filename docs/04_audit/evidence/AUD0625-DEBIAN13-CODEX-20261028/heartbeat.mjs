import fs from 'node:fs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createContinuousWorker } from '/app/apps/worker/dist/continuous-worker.js'
const require=createRequire('/app/package.json')
const {OutboxRepository,InMemoryDatabase}=require('@cvg/persistence')
const file='/tmp/cvg-c26-base.alive'
const env={...process.env,CVG_WORKER_RUN_MODE:'continuous',CVG_WORKER_LIVENESS_FILE:file,CVG_WORKER_LIVENESS_MAX_AGE_MS:'2000'}
const check=()=>{const r=spawnSync(process.execPath,['/app/scripts/runtime-healthcheck.mjs'],{env,timeout:5000});assert.equal(r.signal,null);return r.status}
assert.equal(fs.existsSync(file),false);const missing=check();assert.equal(missing,1)
const worker=createContinuousWorker({tenantId:'tenant_00000000-0000-4000-8000-000000000172',workerId:'c26-base-memory-heartbeat',adapter:new OutboxRepository(new InMemoryDatabase()),handlers:{inboundProcess:async()=>{throw new Error('unexpected synthetic queue effect')},messageOutbound:async()=>{throw new Error('unexpected synthetic queue effect')}},operationsIntervalMs:100,livenessFile:file})
const mtimes=[];let live,stale
try{
  worker.start()
  const end=Date.now()+4000
  while(Date.now()<end&&mtimes.length<2){if(fs.existsSync(file)){const m=fs.statSync(file).mtimeMs;if(!mtimes.includes(m))mtimes.push(m)}await new Promise(r=>setTimeout(r,50))}
  assert.ok(mtimes.length>=2);live=check();assert.equal(live,0)
}finally{await worker.stop({drainMs:1000})}
await new Promise(r=>setTimeout(r,2200));stale=check();assert.equal(stale,1)
if(fs.existsSync(file))fs.unlinkSync(file);const absentAgain=check();assert.equal(absentAgain,1)
console.log(JSON.stringify({kind:'c26-heartbeat',status:'PASS',producer:'compiled createContinuousWorker',mtimes,missing,live,stale,absentAgain,stopped:true}))
