import { it, expect, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { buildServer } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/apps/api/src/server.ts'
import { createTrustedOperatorIdentityResolver, createTrustedOperatorIdentityToken } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/apps/api/src/operator-identity.ts'
import { createInMemoryOperatorSessionStore } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/apps/api/src/operator-session.ts'
import { AuditRepository } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/persistence/src/repositories/audit-repository.ts'
const out='/mnt/dados/cvg-work/aud0621-int-runtime/critic/out/api-probes.json';const records:any[]=[]
function record(name:string,data:any){records.push({name,...data});writeFileSync(out,JSON.stringify(records,null,2)+'\n')}
const T='tenant_00000000-0000-4000-8000-000000000001';const KEY='critic-synthetic-key-abcdefghijklmnopqrstuvwxyz';const AV='critic-authority-v1'
const MARK='CRITIC_PRIVATE_CASE_MARKER'
async function seed(app:any,headers:any={}){const r=await app.inject({method:'POST',url:'/v1/webhooks/channels/whatsapp/messages',headers,payload:{externalMessageId:'critic-'+Math.random(),senderRef:'+5511900000088',body:'Synthetic case '+MARK,receivedAt:'2026-10-21T12:00:00.000Z'}});expect(r.statusCode).toBe(200);return r.json().data as {conversationId:string;sessionId:string}}
async function provision(app:any,operatorId:string,role:string,rev=0,active=true){return app.caseAuthority.applyVerifiedPrincipalState({tenantId:T,operatorId,role,active,expectedRevision:rev,authorityVersion:AV,proofRef:'synthetic-proof:'+operatorId,identitySource:'synthetic_fixture'})}
async function login(app:any,operatorId:string,role:any){const token=createTrustedOperatorIdentityToken({operatorId,role,tenantId:T},KEY,Date.now,120);const r=await app.inject({method:'GET',url:'/v1/session',headers:{'x-cvg-operator-token':token}});expect(r.statusCode).toBe(200);return {cookie:String(r.headers['set-cookie']).split(';')[0]}}
const reads=(s:{conversationId:string;sessionId:string})=>['/v1/conversations','/v1/conversations/'+s.conversationId+'/timeline','/v1/audit/sessions/'+s.sessionId]
async function readAll(app:any,headers:any,s:any){const res:any[]=[];for(const url of reads(s)){const r=await app.inject({method:'GET',url,headers});res.push({url,status:r.statusCode,leaks:r.body.includes(MARK),body:r.body.slice(0,300)})}return res}
it('F01 trusted with configured principal authority: unassigned Operator reads nothing, granted reads, revoked loses',async()=>{
 const app:any=buildServer({identityMode:'trusted',operatorIdentityResolver:createTrustedOperatorIdentityResolver({secret:KEY}),operatorSessionStore:createInMemoryOperatorSessionStore(),casePrincipalAuthority:{authorityVersion:AV}})
 try{
  await provision(app,'critic.operator','Operator');await provision(app,'critic.supervisor','Supervisor')
  const op=await login(app,'critic.operator','Operator');const sup=await login(app,'critic.supervisor','Supervisor')
  const s=await seed(app)
  const before=await readAll(app,op,s)
  // other readers an Operator can reach: tasks / approvals (task:view, approval:view)
  const task=await app.inject({method:'POST',url:'/v1/tasks',headers:op,payload:{sessionId:s.sessionId,title:'Synthetic task',description:'Task for '+MARK,priority:'medium',source:'critic',idempotencyKey:'critic-'+Math.random()}})
  const appr=await app.inject({method:'POST',url:'/v1/approvals',headers:sup,payload:{sessionId:s.sessionId,proposedAction:'synthetic_review',summary:'Approval for '+MARK,riskLevel:'low'}})
  const tasksAsOp=await app.inject({method:'GET',url:'/v1/tasks',headers:op});const apprAsOp=await app.inject({method:'GET',url:'/v1/approvals',headers:op})
  const fullAudit=await app.inject({method:'GET',url:'/v1/observability/audit-evidence',headers:op})
  const patchAsOp=await app.inject({method:'PATCH',url:'/v1/tasks/'+task.json()?.data?.id+'/status',headers:op,payload:{status:'in_progress'}})
  const cases=await app.inject({method:'GET',url:'/v1/cases?kind=core_conversation&resourceId='+encodeURIComponent(s.conversationId),headers:sup})
  const caseId=cases.json().data.items[0].caseId
  const grant=await app.inject({method:'PUT',url:'/v1/cases/'+caseId+'/assignments/critic.operator',headers:sup,payload:{status:'ACTIVE',expectedRevision:0}})
  const granted=await readAll(app,op,s)
  const revoke=await app.inject({method:'PUT',url:'/v1/cases/'+caseId+'/assignments/critic.operator',headers:sup,payload:{status:'REVOKED',expectedRevision:1}})
  const revoked=await readAll(app,op,s)
  record('f01-trusted-configured',{before,taskCreate:task.statusCode,approvalCreate:appr.statusCode,tasksAsUnassignedOperator:{status:tasksAsOp.statusCode,leaks:tasksAsOp.body.includes(MARK)},approvalsAsUnassignedOperator:{status:apprAsOp.statusCode,leaks:apprAsOp.body.includes(MARK)},fullAuditAsOperator:fullAudit.statusCode,patchTaskUnassignedOperator:patchAsOp.statusCode,grant:grant.statusCode,granted:granted.map(x=>({url:x.url,status:x.status,leaks:x.leaks})),revoke:revoke.statusCode,revoked:revoked.map(x=>({url:x.url,status:x.status,leaks:x.leaks}))})
  expect(before.some(x=>x.leaks)).toBe(false)
  expect(before.map(x=>x.status)).toEqual([200,404,404])
  expect(granted.map(x=>x.status)).toEqual([200,200,200]);expect(granted[1].leaks).toBe(true)
  expect(revoked.some(x=>x.leaks)).toBe(false)
 }finally{await app.close()}
})
it('F01 simulation default: unassigned Operator reads nothing',async()=>{
 const app:any=buildServer();try{const s=await seed(app);const res=await readAll(app,{'x-operator-id':'critic.unassigned','x-operator-role':'Operator'},s);const appr=await readAll(app,{'x-operator-id':'critic.approver','x-operator-role':'Approver'},s);const sup=await readAll(app,{'x-operator-id':'critic.sup','x-operator-role':'Supervisor'},s);record('f01-simulation-default',{operator:res.map(x=>({url:x.url,status:x.status,leaks:x.leaks})),approver:appr.map(x=>({url:x.url,status:x.status,leaks:x.leaks})),supervisor:sup.map(x=>({url:x.url,status:x.status,leaks:x.leaks}))});expect(res.some(x=>x.leaks)).toBe(false);expect(appr.some(x=>x.leaks)).toBe(false);expect(sup[1].leaks).toBe(true)}finally{await app.close()}
})
it('F16 memory: audit failure inside the atomic transition leaves the task unchanged',async()=>{
 const app:any=buildServer();try{const s=await seed(app);const t=await app.inject({method:'POST',url:'/v1/tasks',payload:{sessionId:s.sessionId,title:'Synthetic',description:'Synthetic',priority:'medium',source:'critic',idempotencyKey:'critic-'+Math.random()}});const id=t.json().data.id
  const before=app.persistence ? (await app.persistence.tasks.findById(id))?.status : null
  const auditCountBefore=JSON.stringify(await app.inject({method:'GET',url:'/v1/observability/audit-evidence?sessionId='+s.sessionId,headers:{'x-operator-id':'s','x-operator-role':'Supervisor'}}).then((r:any)=>r.json().data?.page?.items?.length))
  const spy=vi.spyOn(AuditRepository.prototype,'append').mockImplementationOnce(()=>{throw new Error('synthetic audit unavailable')})
  const r=await app.inject({method:'PATCH',url:'/v1/tasks/'+id+'/status',headers:{'x-operator-id':'critic.op','x-operator-role':'Operator'},payload:{status:'done'}})
  const spyCalls=spy.mock.calls.length;spy.mockRestore()
  const after=(await app.persistence.tasks.findById(id))?.status
  const items=app.persistence.memoryDb.state.auditEvents
  const statusEvents=items.filter((e:any)=>e.payload?.effect==='internal_task_state_only')
  const retry=await app.inject({method:'PATCH',url:'/v1/tasks/'+id+'/status',headers:{'x-operator-id':'critic.op','x-operator-role':'Operator'},payload:{status:'done'}})
  const ev2=app.persistence.memoryDb.state.auditEvents
  record('f16-memory-atomic',{before,status:r.statusCode,body:r.json(),after,auditCountBefore,statusEventsAfterFailure:statusEvents.length,retryStatus:retry.statusCode,statusEventsAfterRetry:ev2.filter((e:any)=>e.payload?.effect==='internal_task_state_only').length,spyCalls})
  expect(r.statusCode).toBe(500);expect(after).toBe('open');expect(statusEvents.length).toBe(0);expect(retry.statusCode).toBe(200);expect(ev2.filter((e:any)=>e.payload?.effect==='internal_task_state_only').length).toBe(1)
 }finally{await app.close()}
})
it('F15 memory: concurrent done / in_progress serializes; loser gets 400 invalid_action',async()=>{
 const app:any=buildServer();try{const s=await seed(app);const t=await app.inject({method:'POST',url:'/v1/tasks',payload:{sessionId:s.sessionId,title:'Synthetic',description:'Synthetic',priority:'medium',source:'critic',idempotencyKey:'critic-'+Math.random()}});const id=t.json().data.id
  const h={'x-operator-id':'critic.op','x-operator-role':'Operator'}
  const rs=await Promise.all(['in_progress','done','canceled','open'].map(st=>app.inject({method:'PATCH',url:'/v1/tasks/'+id+'/status',headers:h,payload:{status:st}})))
  const final=(await app.persistence.tasks.findById(id))?.status
  const ev=app.persistence.memoryDb.state.auditEvents
  const chain=ev.filter((e:any)=>e.payload?.effect==='internal_task_state_only').map((e:any)=>[e.payload.fromStatus,e.payload.toStatus])
  record('f15-memory-concurrent',{statuses:rs.map((r:any)=>[r.statusCode,r.json().error?.code]),final,chain})
  // serial-chain check
  expect(chain.length).toBe(rs.filter((r:any)=>r.statusCode===200).length);expect(chain[0][0]).toBe('open');for(let i=1;i<chain.length;i++)expect(chain[i][0]).toBe(chain[i-1][1])
  expect(['done','canceled']).toContain(final)
 }finally{await app.close()}
})
it('F23: tasks and approvals pages are bounded and validated',async()=>{
 const app:any=buildServer();try{const s=await seed(app);for(let i=0;i<3;i++){await app.inject({method:'POST',url:'/v1/tasks',payload:{sessionId:s.sessionId,title:'T'+i,description:'d',priority:'medium',source:'critic',idempotencyKey:'critic-'+Math.random()}});await app.inject({method:'POST',url:'/v1/approvals',payload:{sessionId:s.sessionId,proposedAction:'synthetic_review',summary:'A'+i,riskLevel:'low'}})}
  const h={'x-operator-id':'critic.op','x-operator-role':'Operator'}
  const q=async(u:string)=>{const r=await app.inject({method:'GET',url:u,headers:h});return {u,status:r.statusCode,n:Array.isArray(r.json().data)?r.json().data.length:null,pageInfo:r.json().meta?.pageInfo,code:r.json().error?.code}}
  const res=[];for(const u of ['/v1/tasks?limit=1&offset=1','/v1/approvals?limit=1&offset=1','/v1/approvals?limit=101','/v1/approvals?offset=10001','/v1/approvals?limit=0','/v1/approvals?status=pending,pending','/v1/approvals?status=x','/v1/approvals?status=pending&status=approved','/v1/tasks?limit=abc','/v1/tasks?limit=1.5','/v1/approvals','/v1/tasks?status=open'])res.push(await q(u))
  record('f23-pagination',{res})
  expect(res[0]).toMatchObject({status:200,n:1});expect(res[1]).toMatchObject({status:200,n:1})
  for(const x of res.slice(2,10))expect(x.status).toBe(400)
 }finally{await app.close()}
})
