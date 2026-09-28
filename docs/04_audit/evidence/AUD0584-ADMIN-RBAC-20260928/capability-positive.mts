import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root=process.env.CVG_CANDIDATE_ROOT
const outputDir=process.env.CVG_RBAC_OUTPUT_DIR
if (!root||!outputDir||process.env.NODE_ENV!=='development') throw new Error('controlled inputs required')
const sourceSha=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim()
if(sourceSha!=='7ef74e7f4fd2b1141e416b85c7337f119e1333ab') throw new Error('source mismatch')
if(execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8'}).trim()) throw new Error('candidate dirty')
const {buildServer}=await import(pathToFileURL(resolve(root,'apps/api/src/server.ts')).href)
const {createInMemoryOperatorSessionStore}=await import(pathToFileURL(resolve(root,'apps/api/src/operator-session.ts')).href)
const {AgentConfigSchema,createValidatedControlledReleaseCandidate,InMemoryControlPlaneStore}=await import(pathToFileURL(resolve(root,'packages/platform/src/index.ts')).href)
const tenantA='tenant_00000000-0000-4000-8000-000000000141'
const tenantB='tenant_00000000-0000-4000-8000-000000000142'
const platform=new InMemoryControlPlaneStore()
const config=AgentConfigSchema.parse({
 persona:{name:'Synthetic Fixture',role:'secretary',tone:'calm'},
 greeting:'Resposta controlada.',promptBlocks:[],responseTemplates:{},
 model:{provider:'fake',model:'deterministic-v1',temperature:0,maxTokens:128,timeoutMs:1000,retries:0,secretRef:'secret://controlled/approval-api'},
 policies:{version:'approval-api-v1',minConfidence:0.7,lowConfidence:'clarify',maxClarifications:2,enabledActions:['respond','scheduling'],approvalActions:[],blockedActions:[]},
 plugins:[{plugin:'scheduling.controlled',version:'1.0.0',enabled:true,allowedTools:['find_available_slots'],config:{}}],
 knowledge:[],handoff:{lowConfidenceDestination:'controlled-reception',destinations:['controlled-reception'],maxClarifications:2}
})
const agent=await platform.createAgent({tenantId:tenantA},{slug:'audit-rbac-agent',name:'Audit RBAC Agent',description:'Synthetic fixture'})
const draft=await platform.createVersion({tenantId:tenantA},agent.id,config,'admin.synthetic')
const testing=await platform.transitionVersion({tenantId:tenantA},draft.id,'TESTING')
const approved=await platform.transitionVersion({tenantId:tenantA},testing.id,'APPROVED')
const candidate=await createValidatedControlledReleaseCandidate(platform,tenantA,agent.id,approved.id,'admin.synthetic')
await platform.publishVersion({tenantId:tenantA},approved.id,candidate.id)
const store=createInMemoryOperatorSessionStore()
const client={
 redirectUri:'http://127.0.0.1:3000/v1/auth/oidc/callback',
 async start(){return {authorizationUrl:'http://127.0.0.1:8087/auth?state=synthetic',setCookie:'cvg_oidc_pending=synthetic; Path=/; HttpOnly; SameSite=Lax'}},
 async complete(){throw new Error('callback disabled for controlled RBAC proof')},
 clearPendingCookie(){return 'cvg_oidc_pending=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'}
}
const app=buildServer({identityMode:'trusted',operatorSessionStore:store,platform,httpSecurity:{allowedOrigins:['http://127.0.0.1:4173']},localOidc:{client,successRedirectUrl:'http://127.0.0.1:4173/'},rateLimiter:{check:()=>({allowed:true,retryAfterSeconds:0})}})
await app.ready()
async function session(operatorId:string,role:'Operator'|'Supervisor'|'Admin',tenantId:string){return store.create({identity:{operatorId,role,tenantId},expiresAt:Date.now()+120_000})}
const supervisor=await session('supervisor.synthetic','Supervisor',tenantA)
const operator=await session('operator.synthetic','Operator',tenantA)
const admin=await session('admin.synthetic','Admin',tenantA)
const otherTenant=await session('operator.other','Operator',tenantB)
const origin='http://127.0.0.1:4173'
const headers=(id:string,tenantId:string)=>({cookie:`cvg_operator_session=${encodeURIComponent(id)}`,origin,'x-tenant-id':tenantId})
const message='Quero agendar uma consulta fictícia'
const issued=await app.inject({method:'POST',url:'/v1/admin/capability-approvals',headers:headers(supervisor.sessionId,tenantA),payload:{agentId:agent.id,versionId:approved.id,toolName:'find_available_slots',actorId:'operator.synthetic',input:{message},expiresAt:new Date(Date.now()+60_000).toISOString()}})
const approvalId=(issued.json() as {data?:{id?:string}}).data?.id
if(issued.statusCode!==200||!approvalId) throw new Error(`issue failed: ${issued.statusCode}`)
const path=`/v1/admin/capability-approvals/${approvalId}`
const view=await app.inject({method:'GET',url:path,headers:headers(operator.sessionId,tenantA)})
const crossTenant=await app.inject({method:'GET',url:path,headers:headers(otherTenant.sessionId,tenantB)})
const adminExecute=await app.inject({method:'POST',url:`${path}/execute`,headers:headers(admin.sessionId,tenantA),payload:{message,history:[]}})
const operatorRevoke=await app.inject({method:'POST',url:`${path}/revoke`,headers:headers(operator.sessionId,tenantA),payload:{}})
const execute=await app.inject({method:'POST',url:`${path}/execute`,headers:headers(operator.sessionId,tenantA),payload:{message,history:[]}})
const replay=await app.inject({method:'POST',url:`${path}/execute`,headers:headers(operator.sessionId,tenantA),payload:{message,history:[]}})
const finalView=await app.inject({method:'GET',url:path,headers:headers(supervisor.sessionId,tenantA)})
const data={sourceSha,nodeVersion:process.version,profile:'NODE_ENV=development; trusted local OIDC; synthetic in-memory sessions',statuses:{issued:issued.statusCode,operatorView:view.statusCode,crossTenantView:crossTenant.statusCode,adminExecute:adminExecute.statusCode,operatorRevoke:operatorRevoke.statusCode,operatorExecute:execute.statusCode,operatorReplay:replay.statusCode,finalView:finalView.statusCode},executeError:(execute.json() as {error?:{code?:string,message?:string}}).error??null,executedTools:(execute.json() as {data?:{tools?:unknown}}).data?.tools??null,finalApprovalStatus:(finalView.json() as {data?:{status?:string}}).data?.status??null}
writeFileSync(resolve(outputDir,'capability-positive.json'),JSON.stringify(data,null,2)+'\n')
await app.close()
process.stdout.write(JSON.stringify(data)+'\n')
