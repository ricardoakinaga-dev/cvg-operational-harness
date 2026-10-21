import { it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { createOperationalHarness } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/harness/src/createOperationalHarness.ts'
import { HybridOrchestrator, ScriptedModelGateway } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/orchestrator/src/index.ts'
import { DefaultContextEngine } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/harness/src/context-engine.ts'
import { InMemoryExecutionStepStore } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/harness/src/step-store.ts'
import { phase3RuntimeInput, createPhase3ToolRegistry, ScriptedPolicyEngine, InMemoryApprovalEngine, RecordingAuditSink, RecordingTelemetrySink } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/harness/src/__tests__/fixtures/phase3-fixtures.ts'
const records:unknown[]=[]
const stop=JSON.stringify({decisionType:'STOP',reasonCode:'USER_REQUESTED_STOP'})
function composition(extra:any={}) {
 return {modelGateway:new ScriptedModelGateway({responses:['unused']}), tools:createPhase3ToolRegistry({availability:'AVAILABLE'}),policy:new ScriptedPolicyEngine(),approvals:new InMemoryApprovalEngine(),audit:new RecordingAuditSink(),telemetry:new RecordingTelemetrySink(),stepStore:new InMemoryExecutionStepStore(),...extra}
}
function record(name:string,data:any) {records.push({name,...data});writeFileSync('/mnt/dados/cvg-work/aud0621-int-runtime/critic/out/runtime-probes.json',JSON.stringify(records,null,2)+'\n')}
it('observes zero provider call budget through public factory',async()=>{
 let calls=0
 const h=createOperationalHarness(composition({iterativeOrchestrator:new HybridOrchestrator({decisionModel:{complete:async()=>{calls++;return{text:stop,inputTokens:1,outputTokens:1,costUsd:0.01,provider:'synthetic'}}}})}))
 const original=phase3RuntimeInput();const result=await h.execute({...original,budget:{...original.budget,maxModelCalls:0}})
 record('zero-model-budget',{calls,result});expect(calls).toBe(1);expect(result.stopReason).toBe('MAX_MODEL_CALLS')
})
it('observes repairs with one call and zero repair budget',async()=>{
 let calls=0
 const h=createOperationalHarness(composition({iterativeOrchestrator:new HybridOrchestrator({maxDecisionRepairs:5,decisionModel:{complete:async()=>{calls++;return{text:calls<6?'malformed':stop,inputTokens:1,outputTokens:1,costUsd:0.01,provider:'synthetic'}}}})}))
 const original=phase3RuntimeInput();const result=await h.execute({...original,budget:{...original.budget,maxModelCalls:1,maxDecisionRepairs:0}})
 record('repair-overrun',{calls,result});expect(calls).toBe(6);expect(result.modelCalls).toBe(6)
})
it('observes lost usage when every repair is invalid',async()=>{
 let calls=0
 const h=createOperationalHarness(composition({iterativeOrchestrator:new HybridOrchestrator({maxDecisionRepairs:2,decisionModel:{complete:async()=>{calls++;return{text:'malformed',inputTokens:11,outputTokens:12,costUsd:0.05,provider:'synthetic'}}}})}))
 const result=await h.execute(phase3RuntimeInput())
 record('lost-orchestration-usage',{calls,result});expect(calls).toBe(3);expect(result.modelCalls).toBe(0)
})
it('observes pending context build after cancellation and duration expiry',async()=>{
 let release:any;let calls=0
 const building=new Promise(resolve=>{release=resolve});const fallback=new DefaultContextEngine()
 const controller=new AbortController()
 const h=createOperationalHarness(composition({contextEngine:{build:async(input:any)=>{await building;return fallback.build(input)}},iterativeOrchestrator:{decide:async()=>{calls++;return {decision:JSON.parse(stop)}}}}))
 const original=phase3RuntimeInput();const begin=Date.now();let settled=false
 const pending=h.execute({...original,signal:controller.signal,budget:{...original.budget,maxDurationMs:40}}).then(r=>{settled=true;return r})
 await new Promise(r=>setTimeout(r,25));controller.abort();await new Promise(r=>setTimeout(r,100));const settledBeforeRelease=settled
 release();const result=await pending;record('context-deadline',{elapsedMs:Date.now()-begin,settledBeforeRelease,orchestratorCalls:calls,result});expect(settledBeforeRelease).toBe(false);expect(calls).toBe(1)
})
it('observes cancellation propagation during orchestrator wait',async()=>{
 let signal:AbortSignal|undefined;let release:any
 const deciding=new Promise<any>(resolve=>{release=resolve});const c=new AbortController()
 const h=createOperationalHarness(composition({iterativeOrchestrator:{decide:async(input:any)=>{signal=input.signal;return deciding}}}))
 const original=phase3RuntimeInput();let settled=false;const begin=Date.now()
 const pending=h.execute({...original,signal:c.signal,budget:{...original.budget,maxDurationMs:1000}}).then(r=>{settled=true;return r})
 await new Promise(r=>setTimeout(r,25));c.abort();await new Promise(r=>setTimeout(r,70));const observations={settledOnCancel:settled,orchestratorAborted:signal?.aborted}
 release({decision:JSON.parse(stop)});const result=await pending;record('orchestrator-cancel',{elapsedMs:Date.now()-begin,...observations,result});expect(observations.settledOnCancel).toBe(false);expect(observations.orchestratorAborted).toBe(false)
})
it('known-good single-pass model control prevents calls at zero budget',async()=>{
 let calls=0
 const h=createOperationalHarness(composition({modelGateway:{complete:async()=>{calls++;return {text:'synthetic',inputTokens:1,outputTokens:1,costUsd:0,provider:'synthetic'}}}}))
 const original=phase3RuntimeInput();const result=await h.execute({...original,runtimeProfile:'single_pass',budget:{...original.budget,maxModelCalls:0}})
 record('known-good-single-pass-budget',{calls,result});expect(calls).toBe(0);expect(result.stopReason).toBe('MAX_MODEL_CALLS')
})
it('known-good deterministic orchestration needs no model calls',async()=>{
 let calls=0
 const h=createOperationalHarness(composition({iterativeOrchestrator:new HybridOrchestrator({rules:[()=>JSON.parse(stop)],decisionModel:{complete:async()=>{calls++;throw Error('must not call')}}})}))
 const original=phase3RuntimeInput();const result=await h.execute({...original,budget:{...original.budget,maxModelCalls:0}})
 record('known-good-deterministic-budget',{calls,result});expect(calls).toBe(0);expect(result.stopReason).toBe('COMPLETED')
})
