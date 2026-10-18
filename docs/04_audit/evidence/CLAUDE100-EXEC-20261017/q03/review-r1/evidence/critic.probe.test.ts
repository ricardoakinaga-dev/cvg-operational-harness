import { describe, it, expect, vi } from 'vitest'
import { resolve } from 'node:path'
import { executeFixture } from './execute-fixture.ts'
import { loadFixtures, assertReplay } from './fixture-schema.mjs'
import { normalizeLog } from '../support/governed-test-kit/index.js'

const fixtures=loadFixtures(resolve('snapshots/core'))
const get=(id:string)=>structuredClone(fixtures.find(x=>x.input.id===id)!.input)
describe('Q03 independent real-runtime adversarial probes',()=>{
 it('real policy denial and approval states never execute effects',async()=>{
  for(const [id,reason,state] of [['policy-denied','POLICY_DENIED',null],['approval-pending','APPROVAL_REQUIRED','PENDING'],['approval-refused','POLICY_DENIED','REJECTED']] as const){
   const t=await executeFixture(get(id));expect(t.result.stopReason).toBe(reason);expect(t.toolBodies).toHaveLength(0);expect(t.journal).toBeNull()
   if(state){expect(t.approvalRecords).toMatchObject([{status:state,executionCount:0}]);expect(t.approvalEvents.length).toBeGreaterThan(0)}
   else expect(t.policyDecisions).toMatchObject([{decision:'DENY'}])
  }
 })
 it('zero tool budget blocks the real authorized fixture before body',async()=>{
  const f=get('authorized-tool');f.input.budget.maxToolCalls=0
  const t=await executeFixture(f);expect(t.result.stopReason).toBe('MAX_TOOL_CALLS');expect(t.toolBodies).toHaveLength(0);expect(t.journal).toBeNull()
 })
 it('runtime tenant identities and tool input/output remain visible after normalization',async()=>{
  const a=get('authorized-tool'), b=get('authorized-tool');b.input.tenantId='critic_synthetic_tenant';b.input.requestedTool!.input={value:'critic-synthetic-value'};b.tool.output={value:'critic-synthetic-result',applied:false}
  const first=await executeFixture(a),second=await executeFixture(b)
  expect(second.toolBodies).toHaveLength(1);expect(second.toolBodies[0]).toMatchObject({input:{value:'critic-synthetic-value'},context:{tenantId:'critic_synthetic_tenant'}})
  expect(second.journal).toMatchObject({tenantId:'critic_synthetic_tenant',state:'CONFIRMED'})
  expect(second.result.response).toBe('{"value":"critic-synthetic-result","applied":false}')
  expect(second.audit.every((e:any)=>e.tenant==='critic_synthetic_tenant')).toBe(true)
  expect(()=>assertReplay(second,first,'critic mutation')).toThrow(/replay mismatch/)
  const p=[{field:'eventId',mode:'id',namespace:'events'}] as const
  expect(normalizeLog(second.events,p).projectionDigest).not.toBe(normalizeLog(first.events,p).projectionDigest)
 })
 it('real error and effect journal remain separate from success',async()=>{
  const ok=await executeFixture(get('authorized-tool'))
  for(const [id,state] of [['tool-failure','FAILED'],['tool-throw','UNCERTAIN']] as const){
   const f=get(id);f.tool.error='critic synthetic error';const bad=await executeFixture(f)
   expect(bad.result.stopReason).toBe('TOOL_FAILURE');expect(bad.journal).toMatchObject({state});expect(JSON.stringify(bad)).toContain('critic synthetic error')
   expect(()=>assertReplay(bad,ok,'critic failure')).toThrow(/replay mismatch/)
   expect(normalizeLog(bad.events).projectionDigest).not.toBe(normalizeLog(ok.events).projectionDigest)
  }
 })
 it('SDK success and failure use real session path without external fetch',async()=>{
  const network=vi.fn(()=>{throw new Error('unexpected network')});vi.stubGlobal('fetch',network)
  try{const ok=await executeFixture(get('sdk-response')),bad=await executeFixture(get('sdk-model-failure'))
   expect(ok.result.stopReason).toBe('COMPLETED');expect(bad.result.stopReason).toBe('MODEL_FAILURE');expect(ok.events[0]).toMatchObject({type:'message/user'});expect(ok.events.at(-1)).toMatchObject({type:'message/assistant'});expect(network).not.toHaveBeenCalled()
  }finally{vi.unstubAllGlobals()}
 })
})
