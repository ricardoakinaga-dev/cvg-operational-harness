import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {existsSync} from 'node:fs'
const root=process.cwd();assert(!existsSync(join(root,'products')));assert(!existsSync(join(root,'node_modules/@cvg/shift-assistant')))
const require=createRequire(join(root,'package.json'));const entry=require.resolve('@cvg/harness');assert(entry.endsWith('/packages/harness/dist/index.js'))
const {createOperationalHarness}=await import(pathToFileURL(entry).href)
const audit=[];const telemetry=[];let modelCalls=0,toolCalls=0,approvalCalls=0
const tool={id:'synthetic.neutral.write',version:'v1',description:'Synthetic gated local write',inputSchema:{type:'object'},outputSchema:{type:'object'},risk:'HIGH',sideEffect:'WRITE',idempotent:false,requiresApproval:true,execute:async()=>{toolCalls++;return {status:'SUCCEEDED',output:{ok:true}}}}
const options={modelGateway:{complete:async()=>{modelCalls++;return {text:'neutral synthetic response',provider:'synthetic',model:'deterministic',inputTokens:1,outputTokens:1,costUsd:0}}},policy:{evaluate:async()=>({outcome:'ALLOW',reason:'synthetic policy',policyVersion:'synthetic-v1'})},approvals:{request:async()=>{approvalCalls++;return {status:'PENDING',reason:'synthetic human gate'}}},tools:{list:()=>[tool],resolve:(id)=>id===tool.id?tool:undefined},audit:{append:async e=>{audit.push(e)}},telemetry:{record:e=>{telemetry.push(e)}}}
const input={agent:{id:'agent.neutral.synthetic',version:'v1',objective:'Neutral synthetic smoke',instructions:['Synthetic data only'],skills:[],tools:[tool.id],policies:['synthetic']},tenantId:'tenant_00000000-0000-4000-8000-000000000004',conversationId:'neutral-conversation',sessionId:'neutral-session',correlationId:'neutral-correlation',traceId:'neutral-trace',userMessage:'Synthetic operation',context:{values:{},sourceIds:[],capturedAt:new Date().toISOString()},state:{version:1,values:{},updatedAt:new Date().toISOString()},budget:{maxSteps:3,maxModelCalls:1,maxToolCalls:1,maxDurationMs:10000,maxCostUsd:1,maxTokens:100},runtimeProfile:'single_pass'}
const harness=createOperationalHarness({...options,orchestrator:{decideNextStep:async()=>({action:'RESPOND'})}})
const response=await harness.run(input);assert.equal(response.stopReason,'COMPLETED');assert.equal(response.response,'neutral synthetic response');assert.equal(modelCalls,1)
const gated=createOperationalHarness({...options,orchestrator:{decideNextStep:async()=>({action:'CALL_TOOL',toolInvocation:{toolId:tool.id,toolVersion:'v1',operationKey:'synthetic-op-1',input:{}}})}})
const withheld=await gated.run(input);assert.equal(withheld.stopReason,'APPROVAL_REQUIRED');assert.equal(approvalCalls,1);assert.equal(toolCalls,0)
assert.equal(audit.length,2);assert.equal(telemetry.length,2)
console.log(JSON.stringify({publicPackage:'@cvg/harness',resolvedExport:entry,sourceAliases:false,productsPresent:false,consumerWorkspaceLink:false,syntheticModel:'PASS',explicitApprovalDespiteAllow:'PASS',toolEffects:0,auditEvents:audit.length,telemetryEvents:telemetry.length,scope:'Neutral public factory composition; required approval flag tested, not complete risk-class governance or production certification',lifecycle:'Owned Node process initializes composition and exits normally'}))
