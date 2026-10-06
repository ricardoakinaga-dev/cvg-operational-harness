import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {PolicyEngine} from '../packages/policy-engine/src/engine.ts'
import {PolicyRegistry} from '../packages/policy-engine/src/documents.ts'
import {createPolicyProfile} from '../packages/policy-engine/src/profile.ts'
import {ModelGateway} from '../packages/model-gateway/src/gateway.ts'
import {PromptRegistry} from '../packages/model-gateway/src/prompt-registry.ts'
import {DeterministicModelProvider} from '../packages/model-gateway/src/providers/deterministic.ts'
const cap='record.update'
const profile=createPolicyProfile({id:'audit.synthetic',catalog:{[cap]:{capability:cap,category:'record',risk:'HIGH_RISK_WRITE',description:'Synthetic update'}},actions:{[cap]:[cap]},resourceTypes:{[cap]:['record']},agentProfileGrants:{assistant:[{capability:cap,level:'allow',requiresMedicalOperator:true}]},operatorRoleCapabilities:{Operator:[cap],Approver:[cap],Supervisor:[cap],Admin:[cap],System:[cap]},approverRoles:['Approver','Supervisor','Admin'],invalidCapabilityFallback:cap})
const now=new Date('2026-09-30T00:00:00Z')
const input={tenantId:'tenant_00000000-0000-4000-8000-000000000591',operatorId:'operator_audit',operatorRole:'Approver',agentId:'agent_audit',agentProfile:'assistant',capability:cap,action:cap,correlationId:'corr_aud0591_policy',resource:{type:'record'},context:{medicalOperator:false}} as never
const base=new PolicyEngine({profile,clock:()=>now}).evaluate(input)
const registry=new PolicyRegistry(profile);const doc=registry.register({policyId:'synthetic.allow',version:'1',effectiveFrom:'2026-01-01T00:00:00Z',rules:[{id:'allow',effect:'ALLOW',capabilities:[cap],reason:'synthetic allow'}]})
const allowed=new PolicyEngine({profile,documents:[doc],clock:()=>now}).evaluate(input)
assert.equal(base.decision,'REQUIRE_APPROVAL');assert.equal(allowed.decision,'ALLOW')
const prompts=new PromptRegistry();const registered=prompts.register({promptId:'audit-core',version:'1.0',content:'AUD0591_APPROVED_CONTENT',owner:'synthetic',approvedBy:'synthetic-reviewer',status:'approved',effectiveFrom:'2026-01-01T00:00:00Z',classification:'INTERNAL',tenantId:'tenant_00000000-0000-4000-8000-000000000591'})
let providerRequest:any
const provider=new DeterministicModelProvider({respond:r=>{providerRequest=r;return {text:'synthetic',usage:{inputTokens:1,outputTokens:1},providerId:'deterministic',model:'deterministic-v1',externalCall:false}}})
const gateway=new ModelGateway({providers:[provider],profiles:{fast:{name:'fast',providerId:'deterministic',model:'deterministic-v1',location:'local',temperature:0,maxTokens:512,timeoutMs:1000,maxCostUsd:1,estimatedCostUsd:0.001,maxRetries:0,pricing:{inputPer1kUsd:0,outputPer1kUsd:0}}},prompts,clock:()=>now})
const result=await gateway.generate({requestId:'req_aud0591_prompt',tenantId:'tenant_00000000-0000-4000-8000-000000000591',correlationId:'corr_aud0591_prompt',promptId:'audit-core',promptVersion:'1.0',promptSha256:registered.sha256,modelProfile:'fast',dataClassification:'INTERNAL',input:{messages:[{role:'system',content:'AUD0591_DIFFERENT_CONTENT'}]}} as never)
assert(!JSON.stringify(providerRequest.input).includes(registered.content));assert(JSON.stringify(providerRequest.input).includes('AUD0591_DIFFERENT_CONTENT'))
const out={scope:'synthetic-policy-and-deterministic-provider-no-effects',policyFloor:{capabilityRisk:'HIGH_RISK_WRITE',medicalOperator:false,withoutRule:base.decision,withValidAllowRule:allowed.decision,verdict:'FAIL_REPRODUCED',limitation:'custom profile; no proof reference profiles permit real sensitive execution'},promptBinding:{registeredHash:registered.sha256,reportedHash:result.promptSha256,approvedContentSent:false,differentContentSent:true,verdict:'CONTENT_BINDING_GAP_REPRODUCED',limitation:'validates prompt reference metadata; no actual external provider or unauthorized change shown'}}
writeFileSync('/tmp/cvg-aud0591-20260930/evidence/policy-prompt-probes.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out))
