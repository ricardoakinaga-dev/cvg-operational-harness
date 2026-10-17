import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createSdkClient, createStdioSdkTransport, SdkWireError } from '@cvg/sdk'
import { runSdkStdioExample, shutdownSdkChild } from './examples/consumers/sdk-stdio/compiled/index.mjs'

const homeNames = () => readdirSync(tmpdir()).filter(n => n.startsWith('cvg-sdk-stdio-home-')).sort()
const before = homeNames()
const start = performance.now()
const journey = await runSdkStdioExample()
assert.equal(journey.hello.protocolVersion,1)
assert.equal(journey.session.sessionId,'stdio_session')
assert.equal(journey.turn.stopReason,'COMPLETED')
assert.equal(journey.turn.response,'Resposta sintética stdio: olá 🌿.')
assert.deepEqual(journey.events.map(e => e.sequence),[1,2,3,4,5,6])
assert.ok(journey.events.every(e => e.tenantId === 'sdk_stdio_synthetic'))
assert.equal(journey.stderr,'sdk-stdio-ready\nsdk-stdio:transport:-32083\n')
assert.deepEqual(homeNames(),before)
console.log(JSON.stringify({case:'compiled public exports journey',pass:true,elapsed_ms:performance.now()-start,stderr:journey.stderr,event_count:journey.events.length}))

function ownChild(source) {
  const home = mkdtempSync(join(tmpdir(),'reviewer-known-child-'))
  const child = spawn(process.execPath,['-e',source],{
    stdio:['pipe','pipe','pipe'],cwd:home,
    env:{HOME:home,XDG_CONFIG_HOME:home,TMPDIR:home,NODE_ENV:'test'}
  })
  child.on('error',()=>{})
  for(const stream of [child.stdin,child.stdout,child.stderr])stream.on('error',()=>{})
  return {child,home}
}
function confirm(child) {
  assert.ok(child.exitCode!==null || child.signalCode!==null)
  assert.deepEqual([child.stdin.closed,child.stdout.closed,child.stderr.closed],[true,true,true])
  assert.equal(child.listenerCount('close'),0)
}
// Known own child stays silent until EOF: public transport's unchanged 5s
// request timeout must bound hello, after which the owner closes real pipes.
{
  const {child,home} = ownChild('process.stdin.resume();process.stdin.on("end",()=>process.exit(0));setInterval(()=>{},1000)')
  const transport = createStdioSdkTransport({input:child.stdout,output:child.stdin,expectedTenantId:'sdk_stdio_synthetic',requestTimeoutMs:5000})
  const start = performance.now()
  let failure
  try { await createSdkClient(transport).hello() }
  catch(error) { failure=error }
  finally { await transport.close(); await shutdownSdkChild(child); rmSync(home,{recursive:true,force:true}) }
  const elapsed = performance.now()-start
  assert.ok(failure instanceof SdkWireError)
  assert.equal(failure.kind,'timeout');assert.equal(failure.outcome,'unknown');assert.equal(failure.retrySafe,false)
  assert.ok(elapsed>=4900 && elapsed<7000,`timeout+cleanup took ${elapsed}ms`)
  confirm(child)
  console.log(JSON.stringify({case:'silent known child readiness bounded by 5000ms hello timeout',pass:true,elapsed_ms:elapsed,outcome:failure.outcome,signal:child.signalCode,exit:child.exitCode}))
}
// Distinct branch from the packet's SIGKILL child: ignore EOF, respond to TERM.
{
  const {child,home} = ownChild('process.stdin.resume();setInterval(()=>{},1000);process.stderr.write("reviewer-ready\\n")')
  try {
    await new Promise((resolve,reject)=>{
      const done=(error)=>{clearTimeout(timer);child.stderr.off('data',ready);child.off('error',fail);child.off('close',early);error?reject(error):resolve()}
      const ready=()=>done();const fail=()=>done(new Error('own child spawn failure'));const early=()=>done(new Error('own child closed early'))
      const timer=setTimeout(()=>done(new Error('own child readiness exceeded 2000ms')),2000)
      child.stderr.once('data',ready);child.once('error',fail);child.once('close',early)
    })
    const start=performance.now()
    await shutdownSdkChild(child)
    const elapsed=performance.now()-start
    confirm(child);assert.equal(child.signalCode,'SIGTERM');assert.ok(elapsed>=950 && elapsed<2000)
    await shutdownSdkChild(child)
    console.log(JSON.stringify({case:'EOF-resistant TERM-responsive known child plus idempotent shutdown',pass:true,elapsed_ms:elapsed,signal:child.signalCode}))
  } finally {await shutdownSdkChild(child);rmSync(home,{recursive:true,force:true})}
}
