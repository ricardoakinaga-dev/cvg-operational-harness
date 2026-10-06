import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {HybridOrchestrator} from '../packages/orchestrator/src/hybrid-orchestrator.ts'
import {composeResponse} from '../packages/harness/src/iterative-dispatch.ts'
const requests:any[]=[]
let calls=0
const model={complete:async(request:any)=>{requests.push(request);calls++;return {text:calls===1?'not-json':JSON.stringify({decisionType:'RESPOND',reasonCode:'GOAL_SATISFIED',responseText:'synthetic'}),inputTokens:10,outputTokens:5,costUsd:0.01}}}
const context={executionId:'exec_aud0591',tenantId:'tenant_aud0591',conversationId:'conversation_aud0591',stepNumber:1,runtimeProfile:'iterative',agentId:'agent.aud0591',agentVersion:'v1',objective:'AUD0591_OBJECTIVE',instructions:['AUD0591_INSTRUCTION'],goal:'synthetic goal',userMessage:'synthetic input',stateSummary:'step=0',observations:[],capabilities:[],knowledgeAvailable:false,completionStrategy:'DETERMINISTIC',allowedDecisionTypes:['RESPOND'],budget:{maxSteps:5,maxModelCalls:1,maxToolCalls:3,maxDurationMs:5000,maxCostUsd:1,maxTokens:1000},budgetUsage:{steps:0,modelCalls:0,toolCalls:0,knowledgeCalls:0,verificationCalls:0,replans:0,decisionRepairs:0,inputTokens:0,outputTokens:0,costUsd:0,activeDurationMs:0},tokenBudget:10,contextItems:[{id:'aud0591',content:'AUD0591_CONTEXT_ITEM',priority:1}],correlationId:'corr_aud0591',traceId:'trace_aud0591'}
const orch=new HybridOrchestrator({decisionModel:model as never,maxDecisionRepairs:1})
const turn=await orch.decide({context:context as never})
assert.equal(calls,2);assert.equal(turn.usage?.modelCalls,2)
const requestBytes=JSON.stringify(requests)
const markers=['AUD0591_OBJECTIVE','AUD0591_INSTRUCTION','AUD0591_CONTEXT_ITEM'];assert(markers.every(m=>!requestBytes.includes(m)))
let responseRequest:any
const responseGateway={complete:async(r:any)=>{responseRequest=r;return {text:'synthetic final response',inputTokens:10,outputTokens:5,costUsd:0}}}
const run={usage:{modelCalls:0,inputTokens:0,outputTokens:0,costUsd:0},input:{userMessage:'summarize synthetic result',context:{values:{goal:'synthetic'},sourceIds:[],capturedAt:'2026-09-30T00:00:00Z'},budget:{maxModelCalls:3},correlationId:'corr_aud0591'},observations:[{id:'obs_aud0591',summary:'AUD0591_TOOL_RESULT',payload:{result:'AUD0591_TOOL_RESULT'}}]}
const ctx={remainingDuration:()=>1000,withDeadline:async(p:any)=>await p,options:{modelGateway:responseGateway},checkAfterUsage:()=>null}
const result=await composeResponse(ctx as never,run as never,{decisionType:'RESPOND',reasonCode:'GOAL_SATISFIED',responseIntent:'summarize'} as never)
assert(!JSON.stringify(responseRequest).includes('AUD0591_TOOL_RESULT'))
const output={scope:'synthetic-fake-model-no-network',repairBudget:{configuredMaxModelCalls:1,observedCalls:calls,reportedUsage:turn.usage,criterion:'stop before exceeding budget',verdict:'FAIL_REPRODUCED',limitation:'direct HybridOrchestrator call; no full worker execution'},contextTransport:{markers:markers.map(marker=>({marker,sentToDecisionModel:requestBytes.includes(marker)})),verdict:'GAP_REPRODUCED'},responseEvidence:{observationCount:run.observations.length,observationSent:JSON.stringify(responseRequest).includes('AUD0591_TOOL_RESULT'),result,verdict:'GAP_REPRODUCED'}}
writeFileSync('/tmp/cvg-aud0591-20260930/evidence/cognitive-probes.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output))
