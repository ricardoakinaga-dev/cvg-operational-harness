import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.env.CVG_CANDIDATE_ROOT
const outputDir = process.env.CVG_RBAC_OUTPUT_DIR
if (!root || !outputDir || process.env.NODE_ENV !== 'development') throw new Error('candidate root, output dir, and development profile required')
const sourceSha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim()
if (sourceSha !== '7ef74e7f4fd2b1141e416b85c7337f119e1333ab') throw new Error('source SHA mismatch')
if (execFileSync('git', ['-C', root, 'status', '--porcelain'], {encoding:'utf8'}).trim()) throw new Error('candidate dirty')
const { buildServer } = await import(pathToFileURL(resolve(root,'apps/api/src/server.ts')).href)
const { createInMemoryOperatorSessionStore } = await import(pathToFileURL(resolve(root,'apps/api/src/operator-session.ts')).href)
const store = createInMemoryOperatorSessionStore()
const localOidcClient = {
 redirectUri:'http://127.0.0.1:3000/v1/auth/oidc/callback',
 async start(){ return {authorizationUrl:'http://127.0.0.1:8087/auth?state=synthetic',setCookie:'cvg_oidc_pending=synthetic; Path=/; HttpOnly; SameSite=Lax'} },
 async complete(){ throw new Error('callback disabled in synthetic RBAC probe') },
 clearPendingCookie(){ return 'cvg_oidc_pending=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' }
}
const app = buildServer({identityMode:'trusted',operatorSessionStore:store,httpSecurity:{allowedOrigins:['http://127.0.0.1:4173']},localOidc:{client:localOidcClient,successRedirectUrl:'http://127.0.0.1:4173/'},rateLimiter:{check:()=>({allowed:true,retryAfterSeconds:0})}})
await app.ready()
const tree=app.printRoutes({commonPrefix:false})
const stack:string[]=[]
const routes:{method:string,path:string}[]=[]
for (const line of tree.split('\n')) {
 if (!line.trim()) continue
 const m=line.match(/^((?:│   |    )*)(?:├── |└── )(.+) \(([^)]+)\)$/)
 if (!m) throw new Error(`unparsed: ${line}`)
 const depth=m[1]!.length/4
 const path=depth===0?m[2]!:stack[depth-1]!+m[2]!
 stack[depth]=path;stack.length=depth+1
 for (const method of m[3]!.split(', ')) routes.push({method,path})
}
const adminRoutes=routes.filter(r=>r.path.startsWith('/v1/admin/'))
if (adminRoutes.some(r=>!app.hasRoute({method:r.method as 'GET',url:r.path}))) throw new Error('admin registry mismatch')
const tenantId='tenant_00000000-0000-4000-8000-000000000701'
const operatorSession=await store.create({identity:{operatorId:'operator.synthetic',tenantId,role:'Operator'},expiresAt:Date.now()+120_000})
const adminSession=await store.create({identity:{operatorId:'admin.synthetic',tenantId,role:'Admin'},expiresAt:Date.now()+120_000})
const cookie=(id:string)=>`cvg_operator_session=${encodeURIComponent(id)}`
const urlFor=(path:string)=>path.replace(/:([A-Za-z][A-Za-z0-9]*)/g,(_all,name)=>name==='approvalId'?'approval_00000000-0000-4000-8000-000000000000':'00000000-0000-4000-8000-000000000000')
const results=[]
for (const route of adminRoutes) {
 const options:{method:string,url:string,headers:Record<string,string>,payload?:object}={method:route.method,url:urlFor(route.path),headers:{cookie:cookie(operatorSession.sessionId),origin:'http://127.0.0.1:4173','x-tenant-id':tenantId}}
 if (['POST','PUT','PATCH'].includes(route.method)) options.payload=route.path.endsWith('/execute')?{message:'Synthetic request',history:[]}:{}
 const response=await app.inject(options)
 let errorCode:string|null=null
 try{errorCode=(response.json() as {error?:{code?:string}}).error?.code??null}catch{}
 results.push({...route,status:response.statusCode,errorCode})
}
const controls=[]
for (const [role,id,url] of [['Operator',operatorSession.sessionId,'/v1/tasks'],['Admin',adminSession.sessionId,'/v1/admin/agents'],['Admin',adminSession.sessionId,'/v1/admin/knowledge-sources']] as const){
 const response=await app.inject({method:'GET',url,headers:{cookie:cookie(id),origin:'http://127.0.0.1:4173','x-tenant-id':tenantId}})
 controls.push({role,method:'GET',path:url,status:response.statusCode})
}
const adminExecute=await app.inject({method:'POST',url:'/v1/admin/capability-approvals/approval_00000000-0000-4000-8000-000000000000/execute',headers:{cookie:cookie(adminSession.sessionId),origin:'http://127.0.0.1:4173','x-tenant-id':tenantId},payload:{message:'Synthetic request',history:[]}})
controls.push({role:'Admin',method:'POST',path:'/v1/admin/capability-approvals/:approvalId/execute',status:adminExecute.statusCode})
const tenantB='tenant_00000000-0000-4000-8000-000000000702'
for (const [role,id,url] of [['Operator',operatorSession.sessionId,'/v1/admin/capability-approvals/approval_00000000-0000-4000-8000-000000000000'],['Admin',adminSession.sessionId,'/v1/admin/agents']] as const){
 const response=await app.inject({method:'GET',url,headers:{cookie:cookie(id),origin:'http://127.0.0.1:4173','x-tenant-id':tenantB}})
 controls.push({role,method:'GET',path:url,scenario:'cross-tenant-header',status:response.statusCode})
}
const forgedRole=await app.inject({method:'GET',url:'/v1/admin/agents',headers:{cookie:cookie(operatorSession.sessionId),origin:'http://127.0.0.1:4173','x-tenant-id':tenantId,'x-operator-role':'Admin','x-operator-id':'admin.synthetic'}})
controls.push({role:'Operator',method:'GET',path:'/v1/admin/agents',scenario:'forged-role-headers',status:forgedRole.statusCode})
const output={sourceSha,nodeVersion:process.version,profile:'NODE_ENV=development; trusted local OIDC; synthetic in-memory sessions',registeredRoutes:routes.length,adminPairs:adminRoutes.length,controls,results}
writeFileSync(resolve(outputDir,'probe.json'),JSON.stringify(output,null,2)+'\n')
await app.close()
process.stdout.write(JSON.stringify({adminPairs:adminRoutes.length,statuses:results.reduce((a:Record<string,number>,r)=>{a[r.status]=(a[r.status]??0)+1;return a},{}),controls})+'\n')
